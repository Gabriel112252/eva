import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PhysicsRaycastResult } from "@babylonjs/core/Physics/physicsRaycastResult";
import type { PhysicsEngine } from "@babylonjs/core/Physics/v2/physicsEngine";
import type { Scene } from "@babylonjs/core/scene";
import type { InputManager } from "@/core/input";
import { COLLISION } from "@/world/context";

export type CameraMode = "follow" | "dialogue" | "inspect" | "menu";

const PITCH_MIN = -0.55;
const PITCH_MAX = 1.05;

/** Suavização exponencial independente de frame-rate. */
export function damp(current: number, target: number, smoothing: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-smoothing * dt));
}

/**
 * Câmera em terceira pessoa sobre o ombro: mouse gira (pointer lock), roda
 * aproxima/afasta, oclusão por raio físico (não atravessa paredes) e
 * enquadramentos cinematográficos para diálogos. A pé, recebe do PlayerController
 * o FOV dinâmico da corrida (`motionFov`) e o tranco das aterrissagens (`addImpact`),
 * ideia do BJS Character Controller V2 (MIT, crazyramirez) refeita para esta câmera:
 * mergulho amortecido do pivô + tremida determinística, sem mexer no yaw/pitch do jogador.
 */
export class ThirdPersonCamera {
  readonly camera: TargetCamera;
  mode: CameraMode = "follow";
  yaw = 0;
  pitch = 0.18;
  distance = 2.9;
  private targetDistance = 2.9;
  shoulder = 0.42;
  sensitivity = 1;
  invertY = false;

  private smoothedPos = new Vector3();
  private smoothedTarget = new Vector3();
  private initialized = false;
  /** campo de visão alvo (mira estreita, veículo mais aberto) */
  fovTarget = 0.95;
  /** tempo desde o último movimento de mouse (alinhamento automático atrás do veículo) */
  private idleTime = 0;
  /** deslocamento vertical extra do pivô (veículos) */
  pivotLift = 0;
  private readonly rayResult = new PhysicsRaycastResult();
  private dialogueFrom = new Vector3();
  private dialogueAt = new Vector3();
  private menuTime = 0;
  /** FOV extra pedido pelo movimento (rad): corrida/embalo abrem o quadro; a câmera suaviza */
  motionFov = 0;
  private fovBoost = 0;
  /** mergulho do pivô (m, negativo = abaixo) e sua velocidade — mola amortecida */
  private dip = 0;
  private dipVel = 0;
  /** amplitude (m) e relógio da tremida de impacto */
  private shake = 0;
  private shakeClock = 0;

  constructor(
    private readonly scene: Scene,
    initialYaw = 0,
  ) {
    this.camera = new TargetCamera("camera_3p", new Vector3(0, 3, -8), scene);
    this.camera.minZ = 0.08;
    this.camera.maxZ = 500;
    this.camera.fov = 0.95;
    this.yaw = initialYaw;
  }

  /** Enquadra os dois lados de uma conversa. */
  setDialogueShot(from: Vector3, at: Vector3): void {
    this.mode = "dialogue";
    this.dialogueFrom.copyFrom(from);
    this.dialogueAt.copyFrom(at);
  }

  /**
   * Close-up de exame: câmera a `distance` m do objeto, do lado de quem olha (`viewer`, ex.: cabeça de
   * Matias), um pouco acima e deslocada para o lado, olhando para o objeto. FOV estreito.
   */
  setInspectShot(target: Vector3, viewer: Vector3, distance = 1.1, side = 0.35): void {
    this.mode = "inspect";
    const toViewer = viewer.subtract(target);
    toViewer.y = 0;
    if (toViewer.lengthSquared() < 1e-4) toViewer.set(Math.sin(this.yaw) * -1, 0, Math.cos(this.yaw) * -1);
    toViewer.normalize();
    const right = new Vector3(toViewer.z, 0, -toViewer.x);
    const from = target.add(toViewer.scale(distance)).add(right.scale(side)).add(new Vector3(0, distance * 0.45, 0));
    this.dialogueFrom.copyFrom(from);
    this.dialogueAt.copyFrom(target);
    this.inspectFov = 0.62;
  }

  private inspectFov = 0.62;

  setFollow(): void {
    this.mode = "follow";
  }

  /**
   * Tranco de aterrissagem (0–1): o pivô mergulha alguns centímetros e volta com mola, com uma tremida
   * curta que decai (referência: 0,08 suave / 0,22 pesada no controlador MIT).
   */
  addImpact(intensity: number): void {
    const k = Math.max(0, Math.min(1, intensity));
    if (k <= 0) return;
    this.dipVel = Math.min(this.dipVel, -1.7 * k);
    this.shake = Math.max(this.shake, 0.05 * k);
  }

  /** Mergulho atual do pivô (m) — testes. */
  get impactOffset(): number {
    return this.dip;
  }

  /** Perfil de seguimento: a pé, mirando ou dirigindo. */
  setProfile(p: { distance: number; shoulder: number; fov: number; pitch?: number; pivotLift?: number; minDistance?: number }): void {
    this.targetDistance = p.distance;
    this.shoulder = p.shoulder;
    this.fovTarget = p.fov;
    this.pivotLift = p.pivotLift ?? 0;
    this.minDistance = p.minDistance ?? 1.4;
    if (p.pitch !== undefined) this.pitch = p.pitch;
  }

  private minDistance = 1.4;

  /** Perfil padrão a pé. */
  setWalkProfile(): void {
    this.setProfile({ distance: 2.9, shoulder: 0.42, fov: 0.95, minDistance: 1.4 });
  }

  setMenuOrbit(): void {
    this.mode = "menu";
    this.menuTime = 0;
  }

  /** Atualiza a câmera; `pivot` = posição dos pés do jogador. */
  update(dt: number, input: InputManager, pivot: Vector3, eyeHeight: number, lookYaw?: number): void {
    if (this.mode !== "follow") {
      // descarta mouse/roda acumulados fora do modo seguir, senão a câmera salta ao voltar do diálogo/menu
      input.consumeMouseDelta();
      input.consumeWheel();
    }
    switch (this.mode) {
      case "follow":
        this.updateFollow(dt, input, pivot, eyeHeight, lookYaw);
        break;
      case "dialogue":
      case "inspect": {
        const s = this.initialized ? (this.mode === "inspect" ? 7 : 5) : 1000;
        this.smoothedPos.set(damp(this.smoothedPos.x, this.dialogueFrom.x, s, dt), damp(this.smoothedPos.y, this.dialogueFrom.y, s, dt), damp(this.smoothedPos.z, this.dialogueFrom.z, s, dt));
        this.smoothedTarget.set(damp(this.smoothedTarget.x, this.dialogueAt.x, s, dt), damp(this.smoothedTarget.y, this.dialogueAt.y, s, dt), damp(this.smoothedTarget.z, this.dialogueAt.z, s, dt));
        this.camera.position.copyFrom(this.smoothedPos);
        this.camera.setTarget(this.smoothedTarget);
        this.initialized = true;
        break;
      }
      case "menu": {
        this.menuTime += dt;
        const a = this.menuTime * 0.05;
        const target = new Vector3(30, 2.5, 4);
        const pos = new Vector3(30 + Math.cos(a) * 20, 6 + Math.sin(a * 0.7) * 1.5, 2 + Math.sin(a) * 20);
        this.camera.position.copyFrom(pos);
        this.camera.setTarget(target);
        this.smoothedPos.copyFrom(pos);
        this.smoothedTarget.copyFrom(target);
        this.initialized = true;
        break;
      }
    }
    // FOV dinâmico do movimento (só seguindo); no exame o FOV estreita independentemente do perfil
    this.fovBoost = damp(this.fovBoost, this.mode === "follow" ? this.motionFov : 0, 6, dt);
    this.camera.fov = damp(this.camera.fov, this.mode === "inspect" ? this.inspectFov : this.fovTarget + this.fovBoost, 10, dt);
  }

  /** Avança a mola do mergulho e a tremida de impacto; devolve o deslocamento a somar ao pivô/alvo. */
  private updateImpact(dt: number): { y: number; sx: number; sy: number } {
    if (dt > 0) {
      // mola subamortecida (ω≈11 rad/s): mergulha ~0,15 m no tranco máximo e volta em ~0,4 s
      const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        this.dipVel += (-125 * this.dip - 15 * this.dipVel) * h;
        this.dip += this.dipVel * h;
      }
      if (Math.abs(this.dip) < 1e-4 && Math.abs(this.dipVel) < 1e-3) {
        this.dip = 0;
        this.dipVel = 0;
      }
      this.shakeClock += dt;
      this.shake = this.shake > 1e-4 ? this.shake * Math.exp(-9 * dt) : 0;
    }
    return { y: this.dip, sx: Math.sin(this.shakeClock * 47) * this.shake, sy: Math.cos(this.shakeClock * 53) * this.shake * 0.7 };
  }

  private updateFollow(dt: number, input: InputManager, pivot: Vector3, eyeHeight: number, alignYaw?: number): void {
    const impact = this.updateImpact(dt);
    const { dx, dy } = input.consumeMouseDelta();
    const sens = 0.0022 * this.sensitivity;
    this.yaw += dx * sens;
    this.pitch += (this.invertY ? -dy : dy) * sens;
    this.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, this.pitch));
    // dirigindo: sem mouse por um instante, a câmera volta a ficar atrás do veículo
    if (dx !== 0 || dy !== 0) this.idleTime = 0;
    else this.idleTime += dt;
    if (alignYaw !== undefined && this.idleTime > 0.9) {
      let d = (alignYaw - this.yaw) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * (1 - Math.exp(-2.5 * dt));
    }
    const wheel = input.consumeWheel();
    if (wheel !== 0) this.targetDistance = Math.max(this.minDistance, Math.min(12.0, this.targetDistance + wheel * 0.35 * (this.targetDistance > 4 ? 2 : 1)));
    this.distance = damp(this.distance, this.targetDistance, 8, dt);

    // pivô no ombro do personagem (ou acima do veículo)
    const fwd = new Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = new Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const pivotPos = pivot.add(new Vector3(0, eyeHeight + this.pivotLift + impact.y, 0)).add(right.scale(this.shoulder));

    // posição desejada atrás e acima
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const back = new Vector3(-fwd.x * cp, sp, -fwd.z * cp);
    let desired = pivotPos.add(back.scale(this.distance));

    // oclusão: raio do pivô até a posição desejada
    const engine = this.scene.getPhysicsEngine() as PhysicsEngine | null;
    if (engine) {
      engine.raycastToRef(pivotPos, desired, this.rayResult, { membership: COLLISION.PLAYER, collideWith: COLLISION.CAMERA_BLOCKER });
      if (this.rayResult.hasHit) {
        const hit = this.rayResult.hitPointWorld;
        const d = Math.max(0.5, Vector3.Distance(pivotPos, hit) - 0.25);
        desired = pivotPos.add(back.scale(d));
      }
    }
    // chão: não deixa a câmera abaixo de 0,35 m
    if (desired.y < pivot.y + 0.35) desired.y = pivot.y + 0.35;

    const lookAt = pivotPos.add(fwd.scale(2.5)).add(new Vector3(0, -sp * 1.2, 0));
    if (!this.initialized) {
      this.smoothedPos.copyFrom(desired);
      this.smoothedTarget.copyFrom(lookAt);
      this.initialized = true;
    } else {
      const sPos = 18;
      const sTgt = 14;
      this.smoothedPos.set(damp(this.smoothedPos.x, desired.x, sPos, dt), damp(this.smoothedPos.y, desired.y, sPos, dt), damp(this.smoothedPos.z, desired.z, sPos, dt));
      this.smoothedTarget.set(damp(this.smoothedTarget.x, lookAt.x, sTgt, dt), damp(this.smoothedTarget.y, lookAt.y, sTgt, dt), damp(this.smoothedTarget.z, lookAt.z, sTgt, dt));
    }
    this.camera.position.copyFrom(this.smoothedPos);
    // tremida depois da suavização (senão o filtro a apagaria)
    if (impact.sx !== 0 || impact.sy !== 0) this.camera.setTarget(this.smoothedTarget.add(right.scale(impact.sx)).addInPlaceFromFloats(0, impact.sy, 0));
    else this.camera.setTarget(this.smoothedTarget);
  }

  /** Distância atual entre câmera e pivô (para ocultar o modelo quando colada). */
  distanceTo(point: Vector3): number {
    return Vector3.Distance(this.camera.position, point);
  }

  snapBehind(yaw: number): void {
    this.yaw = yaw;
    this.initialized = false;
  }
}

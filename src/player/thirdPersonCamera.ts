import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PhysicsRaycastResult } from "@babylonjs/core/Physics/physicsRaycastResult";
import type { PhysicsEngine } from "@babylonjs/core/Physics/v2/physicsEngine";
import type { Scene } from "@babylonjs/core/scene";
import type { InputManager } from "@/core/input";
import { COLLISION } from "@/world/context";

export type CameraMode = "follow" | "dialogue" | "menu";

const PITCH_MIN = -0.55;
const PITCH_MAX = 1.05;

/** Suavização exponencial independente de frame-rate. */
export function damp(current: number, target: number, smoothing: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-smoothing * dt));
}

/**
 * Câmera em terceira pessoa sobre o ombro: mouse gira (pointer lock), roda
 * aproxima/afasta, oclusão por raio físico (não atravessa paredes) e
 * enquadramentos cinematográficos para diálogos.
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
  private readonly rayResult = new PhysicsRaycastResult();
  private dialogueFrom = new Vector3();
  private dialogueAt = new Vector3();
  private menuTime = 0;

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

  setFollow(): void {
    this.mode = "follow";
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
        this.updateFollow(dt, input, pivot, eyeHeight);
        break;
      case "dialogue": {
        const s = this.initialized ? 5 : 1000;
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
    void lookYaw;
  }

  private updateFollow(dt: number, input: InputManager, pivot: Vector3, eyeHeight: number): void {
    const { dx, dy } = input.consumeMouseDelta();
    const sens = 0.0022 * this.sensitivity;
    this.yaw += dx * sens;
    this.pitch += (this.invertY ? -dy : dy) * sens;
    this.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, this.pitch));
    const wheel = input.consumeWheel();
    if (wheel !== 0) this.targetDistance = Math.max(1.4, Math.min(5.0, this.targetDistance + wheel * 0.35));
    this.distance = damp(this.distance, this.targetDistance, 8, dt);

    // pivô no ombro do personagem
    const fwd = new Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = new Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const pivotPos = pivot.add(new Vector3(0, eyeHeight, 0)).add(right.scale(this.shoulder));

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
    this.camera.setTarget(this.smoothedTarget);
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

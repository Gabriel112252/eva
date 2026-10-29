import { PhysicsCharacterController, CharacterSupportedState, type CharacterSurfaceInfo } from "@babylonjs/core/Physics/v2/characterController";
import { PhysicsRaycastResult } from "@babylonjs/core/Physics/physicsRaycastResult";
import type { PhysicsEngine } from "@babylonjs/core/Physics/v2/physicsEngine";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { CharacterModel } from "@/characters/characterModel";
import { CLIP_REFERENCE_HEIGHT, CLIP_SPEEDS, type AnimationClip } from "@/data/characters";
import type { InputManager } from "@/core/input";
import { TypedEvent } from "@/core/events";
import { COLLISION } from "@/world/context";
import { surfaceForHit, type Surface } from "@/world/surfaces";
import { GRAVITY } from "@/physics/havok";

export type MoveState = "idle" | "walk" | "run" | "crouchIdle" | "crouchWalk";
export type FootstepKind = "walk" | "run" | "crouch";
export interface Footstep {
  kind: FootstepKind;
  surface: Surface;
}

/** Velocidades de deslocamento (m/s). Escolhidas perto da velocidade natural dos clipes para a reprodução ficar entre 0,8× e 1,4×. */
export const PLAYER_SPEEDS = { walk: 1.3, run: 4.6, crouch: 0.8 } as const;
const STAND_HEIGHT = 1.78;
const CROUCH_HEIGHT = 1.15;
const RADIUS = 0.32;
/** Comprimento de um passo (m) em cada clipe — a cadência muda com a velocidade, a passada não. */
const STRIDE: Record<FootstepKind, number> = { walk: 0.65, run: 2.5, crouch: 0.75 };

/**
 * Razão de reprodução que faz o pé apoiado recuar exatamente na velocidade em que o personagem
 * avança (sem deslizar): velocidade real / (velocidade natural do clipe × altura relativa).
 */
export function animationSpeedRatio(clip: AnimationClip, speed: number, height: number): number {
  const natural = (CLIP_SPEEDS[clip] ?? 1) * (height / CLIP_REFERENCE_HEIGHT);
  if (natural <= 0) return 1;
  return Math.max(0.5, Math.min(2.2, speed / natural));
}

/** Lógica pura de movimento relativo à câmera (testável). */
export function cameraRelativeDirection(axis: { x: number; y: number }, cameraYaw: number): { x: number; z: number } {
  const fx = Math.sin(cameraYaw);
  const fz = Math.cos(cameraYaw);
  const rx = Math.cos(cameraYaw);
  const rz = -Math.sin(cameraYaw);
  return { x: fx * axis.y + rx * axis.x, z: fz * axis.y + rz * axis.x };
}

export function resolveMoveState(moving: boolean, running: boolean, crouched: boolean): MoveState {
  if (crouched) return moving ? "crouchWalk" : "crouchIdle";
  if (!moving) return "idle";
  return running ? "run" : "walk";
}

/** Menor diferença angular (rad) entre dois ângulos. */
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Controlador de Matias em terceira pessoa sobre o PhysicsCharacterController do
 * Havok: andar, correr, agachar, gravidade, degraus, colisão e sincronia com
 * as animações esqueléticas do modelo.
 */
export class PlayerController {
  readonly cc: PhysicsCharacterController;
  readonly onFootstep = new TypedEvent<Footstep>();
  /** Nome do nó físico sob os pés no último raio do chão (null = nada). */
  private groundNodeName: string | null = null;
  readonly onStateChange = new TypedEvent<MoveState>();
  yaw = 0;
  crouched = false;
  state: MoveState = "idle";
  /** bloqueia movimento (diálogo, menus) */
  locked = false;

  private velocity = new Vector3();
  private horizontalSpeed = 0;
  private distanceSinceStep = 0;
  private readonly down = new Vector3(0, -1, 0);
  private readonly up = Vector3.Up();
  private readonly tmpForward = new Vector3();
  private readonly tmpDesired = new Vector3();
  private readonly rayResult = new PhysicsRaycastResult();
  private readonly groundRay = new PhysicsRaycastResult();
  private capsuleHeight = STAND_HEIGHT;
  private feetPos = new Vector3();
  private modelY: number | null = null;

  constructor(
    private readonly scene: Scene,
    readonly model: CharacterModel,
    spawn: Vector3,
    yaw: number,
  ) {
    this.cc = new PhysicsCharacterController(spawn.add(new Vector3(0, STAND_HEIGHT / 2 + 0.05, 0)), { capsuleHeight: STAND_HEIGHT, capsuleRadius: RADIUS }, scene);
    this.cc.maxSlopeCosine = Math.cos((50 * Math.PI) / 180);
    this.cc.maxStepHeight = 0.32;
    this.cc.keepDistance = 0.04;
    this.cc.keepContactTolerance = 0.08;
    this.cc.characterStrength = 60;
    this.cc.characterMass = 80;
    this.cc.staticFriction = 0.1;
    this.cc.dynamicFriction = 0.6;
    this.cc.maxCharacterSpeedForSolver = 12;
    // a rampa de aceleração é nossa (horizontalSpeed); o solver segue a velocidade desejada
    this.cc.acceleration = 1;
    this.cc.maxAcceleration = 60;
    const shape = this.cc.shape;
    shape.filterMembershipMask = COLLISION.PLAYER;
    shape.filterCollideMask = COLLISION.WORLD | COLLISION.PROP | COLLISION.NPC | COLLISION.VEHICLE | COLLISION.ENEMY;
    this.yaw = yaw;
    this.model.setYaw(yaw);
    this.syncModel();
  }

  get position(): Vector3 {
    return this.cc.getPosition();
  }

  /** posição dos pés (apoiados no chão real, ver syncModel) */
  get feet(): Vector3 {
    return this.feetPos.clone();
  }

  get eyeHeight(): number {
    return this.crouched ? 1.05 : 1.55;
  }

  get forward(): { x: number; z: number } {
    return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
  }

  get isMoving(): boolean {
    return this.horizontalSpeed > 0.15;
  }

  teleport(feet: Vector3, yaw: number): void {
    this.cc.setPosition(new Vector3(feet.x, feet.y + this.capsuleHeight / 2 + 0.05, feet.z));
    this.cc.setVelocity(Vector3.Zero());
    this.velocity.setAll(0);
    this.yaw = yaw;
    this.model.setYaw(yaw);
    this.syncModel();
  }

  setCrouched(value: boolean): boolean {
    if (value === this.crouched) return true;
    if (!value && !this.canStandUp()) return false;
    this.crouched = value;
    this.capsuleHeight = value ? CROUCH_HEIGHT : STAND_HEIGHT;
    this.cc.setShapeOptions({ capsuleHeight: this.capsuleHeight, capsuleRadius: RADIUS }, true);
    const shape = this.cc.shape;
    shape.filterMembershipMask = COLLISION.PLAYER;
    shape.filterCollideMask = COLLISION.WORLD | COLLISION.PROP | COLLISION.NPC | COLLISION.VEHICLE | COLLISION.ENEMY;
    return true;
  }

  /** Dentro de um veículo: a cápsula sai do mundo (estacionada bem abaixo) e o modelo passa ao banco. */
  inVehicle = false;

  detachForVehicle(): void {
    this.inVehicle = true;
    this.horizontalSpeed = 0;
    this.velocity.setAll(0);
    this.cc.setVelocity(Vector3.Zero());
    this.cc.setPosition(new Vector3(0, -120, 0));
    this.state = "idle";
  }

  /** Volta ao mundo numa posição de pés, virado para `yaw`. */
  attachFromVehicle(feet: Vector3, yaw: number): void {
    this.inVehicle = false;
    this.model.root.parent = null;
    this.model.root.scaling.setAll(1);
    this.teleport(feet, yaw);
    this.modelY = null;
    this.syncModel();
  }

  /** Há espaço acima para levantar? (raio físico contra o mundo estático) */
  canStandUp(): boolean {
    const engine = this.scene.getPhysicsEngine() as PhysicsEngine | null;
    if (!engine) return true;
    const feet = this.feet;
    const from = new Vector3(feet.x, feet.y + 0.3, feet.z);
    const to = new Vector3(feet.x, feet.y + STAND_HEIGHT + 0.1, feet.z);
    engine.raycastToRef(from, to, this.rayResult, { membership: COLLISION.PLAYER, collideWith: COLLISION.WORLD });
    return !this.rayResult.hasHit;
  }

  update(dt: number, input: InputManager, cameraYaw: number): void {
    if (this.inVehicle) {
      this.model.animator.update(dt);
      return;
    }
    const support: CharacterSurfaceInfo = this.cc.checkSupport(dt, this.down);
    const axis = this.locked ? { x: 0, y: 0 } : input.moveAxis();
    const moving = axis.x !== 0 || axis.y !== 0;
    const running = !this.locked && this.crouched === false && input.isHeld("run") && moving;

    // agachar segurando Ctrl (C alterna via evento no Game)
    if (!this.locked && input.isHeld("crouchHold") && !this.crouched) this.setCrouched(true);

    const targetSpeed = !moving ? 0 : this.crouched ? PLAYER_SPEEDS.crouch : running ? PLAYER_SPEEDS.run : PLAYER_SPEEDS.walk;
    const dir = cameraRelativeDirection(axis, cameraYaw);

    // rotação suave do personagem para a direção do movimento
    if (moving) {
      const targetYaw = Math.atan2(dir.x, dir.z);
      const delta = angleDelta(this.yaw, targetYaw);
      const turnSpeed = this.crouched ? 8 : 11;
      const step = Math.sign(delta) * Math.min(Math.abs(delta), turnSpeed * dt);
      this.yaw += step;
      this.model.setYaw(this.yaw);
    }

    // velocidade desejada com aceleração/desaceleração (sensação de peso)
    const accel = moving ? (running ? 9 : 12) : 16;
    this.horizontalSpeed += Math.sign(targetSpeed - this.horizontalSpeed) * Math.min(Math.abs(targetSpeed - this.horizontalSpeed), accel * dt);
    if (this.horizontalSpeed < 0.01) this.horizontalSpeed = 0;
    // direção: a do input quando há input; senão mantém a direção atual (desacelerando)
    const moveDirX = moving ? dir.x : Math.sin(this.yaw);
    const moveDirZ = moving ? dir.z : Math.cos(this.yaw);
    this.tmpDesired.set(moveDirX * this.horizontalSpeed, 0, moveDirZ * this.horizontalSpeed);
    this.tmpForward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));

    const currentVelocity = this.cc.getVelocity();
    let output: Vector3;
    if (support.supportedState === CharacterSupportedState.SUPPORTED) {
      // checkSupport pode devolver normal nula mesmo apoiado; sem este guarda a base ortonormal degenera e a velocidade zera
      const normal = support.averageSurfaceNormal.lengthSquared() > 0.5 ? support.averageSurfaceNormal : this.up;
      output = this.cc.calculateMovement(dt, this.tmpForward, normal, currentVelocity, support.averageSurfaceVelocity, this.tmpDesired, this.up);
      output.subtractInPlace(support.averageSurfaceVelocity);
      // remove componente vertical residual para não "pular" em quinas
      const vertical = Vector3.Dot(output, this.up);
      if (vertical > 1e-3) output.subtractInPlace(this.up.scale(vertical));
      output.addInPlace(support.averageSurfaceVelocity);
    } else {
      // no ar: mantém inércia horizontal, aplica gravidade
      output = currentVelocity.clone();
      output.addInPlace(GRAVITY.scale(dt));
      // pequeno controle aéreo
      output.x += this.tmpDesired.x * 0.05;
      output.z += this.tmpDesired.z * 0.05;
    }
    this.cc.setVelocity(output);
    this.cc.integrate(dt, support, GRAVITY);
    this.velocity.copyFrom(output);

    // passos por distância percorrida
    const planar = Math.hypot(output.x, output.z);
    if (support.supportedState === CharacterSupportedState.SUPPORTED && planar > 0.3) {
      this.distanceSinceStep += planar * dt;
      const kind: FootstepKind = this.crouched ? "crouch" : running ? "run" : "walk";
      if (this.distanceSinceStep >= STRIDE[kind]) {
        this.distanceSinceStep = 0;
        this.onFootstep.emit({ kind, surface: surfaceForHit(this.groundNodeName, this.feetPos.x, this.feetPos.z) });
      }
    } else if (planar <= 0.3) {
      this.distanceSinceStep = STRIDE.walk * 0.6; // primeiro passo soa rápido ao sair do lugar
    }

    // estado de animação
    const nextState = resolveMoveState(this.horizontalSpeed > 0.2, running && this.horizontalSpeed > PLAYER_SPEEDS.walk * 1.1, this.crouched);
    if (nextState !== this.state) {
      this.state = nextState;
      this.onStateChange.emit(nextState);
    }
    this.applyAnimation();
    this.syncModel(dt);
    this.model.animator.update(dt);
  }

  private applyAnimation(): void {
    const anim = this.model.animator;
    if (anim.isOneShotPlaying) return;
    const s = this.horizontalSpeed;
    const h = this.model.height;
    switch (this.state) {
      case "idle":
        anim.play("Idle");
        break;
      case "walk":
        anim.play("Walk", animationSpeedRatio("Walk", s, h));
        break;
      case "run":
        anim.play("Run", animationSpeedRatio("Run", s, h));
        break;
      case "crouchIdle":
        anim.play("CrouchIdle");
        break;
      case "crouchWalk":
        anim.play("CrouchWalk", animationSpeedRatio("CrouchWalk", s, h));
        break;
    }
  }

  /**
   * O controlador do Havok mantém a cápsula alguns centímetros acima do apoio
   * (keepDistance). Um raio curto para baixo encontra o chão real e apoia o
   * modelo nele, com suavização para degraus.
   */
  private syncModel(dt = 0): void {
    const p = this.cc.getPosition();
    const bottom = p.y - this.capsuleHeight / 2;
    let groundY = bottom;
    const engine = this.scene.getPhysicsEngine() as PhysicsEngine | null;
    if (engine) {
      const from = new Vector3(p.x, p.y, p.z);
      const to = new Vector3(p.x, bottom - 0.4, p.z);
      engine.raycastToRef(from, to, this.groundRay, { membership: COLLISION.PLAYER, collideWith: COLLISION.WORLD | COLLISION.PROP });
      if (this.groundRay.hasHit) {
        const hitY = this.groundRay.hitPointWorld.y;
        if (hitY <= bottom + 0.05 && hitY >= bottom - 0.4) groundY = hitY;
        this.groundNodeName = this.groundRay.body?.transformNode?.name ?? null;
      } else {
        this.groundNodeName = null;
      }
    }
    if (this.modelY === null || dt <= 0 || Math.abs(groundY - this.modelY) > 0.6) this.modelY = groundY;
    else this.modelY += (groundY - this.modelY) * (1 - Math.exp(-14 * dt));
    this.feetPos.set(p.x, this.modelY, p.z);
    this.model.root.position.copyFrom(this.feetPos);
  }

  dispose(): void {
    this.cc.dispose();
  }
}

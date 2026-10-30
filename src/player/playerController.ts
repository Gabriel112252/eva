import { PhysicsCharacterController, CharacterSupportedState, type CharacterSurfaceInfo } from "@babylonjs/core/Physics/v2/characterController";
import { PhysicsRaycastResult } from "@babylonjs/core/Physics/physicsRaycastResult";
import type { PhysicsEngine } from "@babylonjs/core/Physics/v2/physicsEngine";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { CharacterModel } from "@/characters/characterModel";
import { CLIP_REFERENCE_HEIGHT, CLIP_SPEEDS, type AnimationClip } from "@/data/characters";
import type { InputManager } from "@/core/input";
import { TypedEvent } from "@/core/events";
import { COLLISION } from "@/world/context";
import { surfaceForHit, type Surface } from "@/world/surfaces";
import { GRAVITY } from "@/physics/havok";
import { noiseRadiusFor } from "@/ai/stealth";
import {
  MOVEMENT_NOISE,
  MovementStateMachine,
  NOISE_PULSE_TIME,
  apexAccelRate,
  approach,
  landingNoise,
  landingShake,
  rollSpeedAt,
  sprintCharge,
  type LandingImpact,
  type MotionEvent,
} from "./movement";
import { loadMovementClips } from "./movementClips";
import type { ThirdPersonCamera } from "./thirdPersonCamera";

export type MoveState = "idle" | "walk" | "run" | "crouchIdle" | "crouchWalk";
export type FootstepKind = "walk" | "run" | "crouch";
export interface Footstep {
  kind: FootstepKind;
  surface: Surface;
}

/**
 * Velocidades de deslocamento (m/s). Andar e agachado ficam perto da velocidade natural dos clipes; correr e o
 * embalo (corrida longa no plano) são de jogo de ação — decisão do criador (30/10/2026): Matias mais ágil que o
 * cânone realista. A reprodução dos clipes acompanha a velocidade (pés sem deslizar).
 */
export const PLAYER_SPEEDS = { walk: 1.3, run: 5.0, sprint: 7.2, crouch: 0.8 } as const;
const STAND_HEIGHT = 1.78;
const CROUCH_HEIGHT = 1.15;
const RADIUS = 0.32;
/** Comprimento de um passo (m) em cada clipe — a cadência muda com a velocidade, a passada não. */
const STRIDE: Record<FootstepKind, number> = { walk: 0.65, run: 2.5, crouch: 0.75 };
/** Encaixe no chão: descendo degraus/rampas, um apoio perdido por até isto (m) não vira queda. */
const SNAP_DISTANCE = 0.45;
/**
 * Folga mantida sob a cápsula no encaixe. O Havok deixa a cápsula pairar até keepDistance + keepContactTolerance
 * (0,12 m) acima do apoio — o modelo é apoiado no chão real pelo raio de syncModel. Encostar a cápsula no chão
 * transformaria o meio-fio de 12 cm num degrau "de parede" (normal de contato íngreme demais).
 */
const SNAP_REST_GAP = 0.08;
/** Taxas (1/s) da aproximação exponencial da velocidade: acelerar (com a curva do ápice), frear e engatar o embalo. */
const ACCEL_RATE = 12;
const DECEL_RATE = 16;
const SPRINT_RAMP = 2.6;
/** Depois de o controle voltar (fim de diálogo), apertos de pulo/esquiva são ignorados por este tempo. */
const UNLOCK_GRACE = 0.2;
/** Clipes únicos do movimento (os demais — gesto, tiro, morte — continuam mandando como antes). */
const MOVEMENT_SHOTS = new Set<AnimationClip>(["JumpStart", "JumpLand", "Roll"]);

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

/** Gira `from` na direção de `to` no máximo `maxStep` rad. */
function turnToward(from: number, to: number, maxStep: number): number {
  const d = angleDelta(from, to);
  return from + Math.sign(d) * Math.min(Math.abs(d), maxStep);
}

/** Velocidade de curva (rad/s) da direção do movimento: quase instantânea andando, com embalo correndo. */
export function turnRateFor(speed: number): number {
  if (speed <= 3) return 20;
  const k = Math.min(1, (speed - 3) / (PLAYER_SPEEDS.sprint - 3));
  return 20 - 11 * k;
}

/** Última aterrissagem (testes/HUD). */
export interface LandingInfo {
  drop: number;
  impact: LandingImpact | null;
  airTime: number;
}

/**
 * Controlador de Matias em terceira pessoa sobre o PhysicsCharacterController do Havok: andar, correr (com
 * embalo), agachar, deslizar, pular (coiote, buffer, pulo duplo), esquiva rolando, impulso no ar, gravidade
 * própria, degraus e encaixe em rampas, colisão e sincronia com as animações esqueléticas do modelo.
 * A decisão de cada ação vem de `MovementStateMachine` (`./movement.ts`, lógica portada do BJS Character
 * Controller V2, MIT); aqui ela vira velocidade da cápsula, clipe, ruído e tranco de câmera.
 */
export class PlayerController {
  readonly cc: PhysicsCharacterController;
  readonly onFootstep = new TypedEvent<Footstep>();
  /** Eventos do movimento de ação (pulo, aterrissagem, rolamento, impulso, deslize, esquiva negada). */
  readonly onMotion = new TypedEvent<MotionEvent>();
  /** Nome do nó físico sob os pés no último raio do chão (null = nada). */
  private groundNodeName: string | null = null;
  readonly onStateChange = new TypedEvent<MoveState>();
  /** Máquina de estados do movimento de ação. */
  readonly motion = new MovementStateMachine();
  yaw = 0;
  crouched = false;
  state: MoveState = "idle";
  /** bloqueia movimento (diálogo, menus) */
  locked = false;
  /** mirando: encara esta direção (yaw da câmera) em vez da direção do movimento; velocidade de caminhada */
  aimYaw: number | null = null;
  /** embalo engatado (corrida longa no plano) */
  sprinting = false;
  /** última aterrissagem com queda relevante */
  lastLanding: LandingInfo | null = null;

  private velocity = new Vector3();
  private horizontalSpeed = 0;
  /** velocidade horizontal real depois do solver (contra uma parede é ~0 mesmo com o direcional apertado) */
  private actualSpeed = 0;
  /** módulo da velocidade horizontal pedida no último quadro (o solver só pode reduzi-la, nunca aumentá-la) */
  private lastPlanarSpeed = 0;
  /** direção do deslocamento no chão (rad) — a velocidade segue o direcional com curva */
  private moveYaw = 0;
  /** direção travada do rolamento / impulso / deslize */
  private actionYaw = 0;
  private preDashSpeed = 0;
  private sprintTimer = 0;
  private distanceSinceStep = 0;
  private readonly down = new Vector3(0, -1, 0);
  private readonly up = Vector3.Up();
  private readonly tmpForward = new Vector3();
  private readonly tmpDesired = new Vector3();
  private readonly rayResult = new PhysicsRaycastResult();
  private readonly groundRay = new PhysicsRaycastResult();
  private readonly probeRay = new PhysicsRaycastResult();
  private capsuleHeight = STAND_HEIGHT;
  private feetPos = new Vector3();
  private modelY: number | null = null;
  /** no ar, o modelo fica esta distância abaixo da base da cápsula (a folga que ela tinha no chão): sem salto visual na decolagem */
  private hoverOffset = 0;
  private modelAirborne = false;
  private groundedLast = true;
  /** quanto a cápsula subiu no último integrate (degrau vencido pelo Havok) — sem encaixe para baixo logo depois */
  private lastRise = 0;
  private unlockedTime = 0;
  private inputMoving = false;
  private noiseTime = 0;
  private noisePulse = 0;
  private recoverTime = 0;
  /** subida/descida dos pés (m/s, suavizada): escada/rampa não engatam o embalo */
  private climbRate = 0;
  private lastFeetY: number | null = null;
  private yawRate = 0;
  private leanPitch = 0;
  private leanRoll = 0;
  private camera: ThirdPersonCamera | null = null;

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
    this.applyFilters();
    this.yaw = yaw;
    this.moveYaw = yaw;
    this.model.setYaw(yaw);
    this.syncModel();
    this.motion.reset(this.feetPos.y);
  }

  get position(): Vector3 {
    return this.cc.getPosition();
  }

  /** posição dos pés (apoiados no chão real, ver syncModel) */
  get feet(): Vector3 {
    return this.feetPos.clone();
  }

  get eyeHeight(): number {
    return this.crouched || this.motion.phase === "slide" ? 1.05 : 1.55;
  }

  get forward(): { x: number; z: number } {
    return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
  }

  get isMoving(): boolean {
    return this.horizontalSpeed > 0.15;
  }

  /** Velocidade horizontal atual (m/s). */
  get speed(): number {
    return this.horizontalSpeed;
  }

  /** No ar (pulo, queda ou impulso). */
  get airborne(): boolean {
    return this.motion.airborne;
  }

  /** Fase do movimento de ação: chão, ar, rolamento, impulso no ar ou deslize. */
  get motionPhase(): string {
    return this.motion.phase;
  }

  /**
   * Raio (m) em que Matias é ouvido pela IA: passos por estado (parado 0, agachado 4, andando 9, correndo 15 —
   * ver `src/ai/stealth.ts`), o deslize (médio) e ruídos pontuais do movimento: aterrissagem e rolamento
   * audíveis (`MOVEMENT_NOISE`). No ar não há passos. Zero dentro de veículo (o veículo tem o próprio ruído).
   */
  get noiseRadius(): number {
    if (this.inVehicle) return 0;
    const pulse = this.noiseTime > 0 ? this.noisePulse : 0;
    let base = 0;
    const phase = this.motion.phase;
    if (phase === "slide") base = MOVEMENT_NOISE.slide;
    else if (phase === "ground" && this.horizontalSpeed >= 0.2) base = noiseRadiusFor(this.state);
    return Math.max(base, pulse);
  }

  /** Câmera que recebe o FOV dinâmico e os trancos de aterrissagem. */
  attachCamera(camera: ThirdPersonCamera): void {
    this.camera = camera;
  }

  /** Liga os clipes de pulo/rolamento/embalo (`matias_movimento.glb`); sem eles o movimento funciona igual. */
  async loadMovementClips(source?: string): Promise<string[]> {
    return loadMovementClips(this.scene, this.model, source);
  }

  teleport(feet: Vector3, yaw: number): void {
    this.cc.setPosition(new Vector3(feet.x, feet.y + this.capsuleHeight / 2 + 0.05, feet.z));
    this.cc.setVelocity(Vector3.Zero());
    this.velocity.setAll(0);
    this.horizontalSpeed = 0;
    this.actualSpeed = 0;
    this.lastPlanarSpeed = 0;
    this.sprintTimer = 0;
    this.sprinting = false;
    this.yaw = yaw;
    this.moveYaw = yaw;
    this.model.setYaw(yaw);
    this.resetMotion(feet.y);
    this.modelY = null;
    this.syncModel();
  }

  /** Volta ao chão sem efeitos (teleporte, veículo): cancela rolamento/deslize e devolve a cápsula ao estado agachado/de pé. */
  private resetMotion(feetY: number): void {
    this.motion.reset(feetY);
    this.groundedLast = true;
    this.lastRise = 0;
    this.modelAirborne = false;
    this.climbRate = 0;
    this.lastFeetY = null;
    this.noiseTime = 0;
    this.recoverTime = 0;
    this.leanPitch = 0;
    this.leanRoll = 0;
    const wanted = this.crouched ? CROUCH_HEIGHT : STAND_HEIGHT;
    if (this.capsuleHeight !== wanted) this.setCapsule(wanted);
    const shot = this.model.animator.oneShotClip;
    if (shot && MOVEMENT_SHOTS.has(shot)) this.model.animator.stopOneShot();
    if (this.camera) this.camera.motionFov = 0;
  }

  /**
   * Agacha/levanta. Agachar correndo rápido no chão vira deslize (mesma cápsula baixa); levantar no meio do
   * deslize o cancela mantendo o embalo. Devolve falso se não há espaço para levantar.
   */
  setCrouched(value: boolean): boolean {
    if (value === this.crouched) return true;
    if (value) {
      if (!this.inVehicle && this.motion.tryStartSlide(Math.min(this.horizontalSpeed, this.actualSpeed + 0.5), this.groundedLast)) this.beginSlide();
      this.crouched = true;
      if (this.motion.phase !== "roll") this.setCapsule(CROUCH_HEIGHT);
      return true;
    }
    if (!this.canStandUp()) return false;
    if (this.motion.cancelSlide()) this.onMotion.emit({ type: "slideEnd", reason: "cancel" });
    this.crouched = false;
    // rolando, a cápsula baixa só volta no fim do rolamento
    if (this.motion.phase !== "roll") this.setCapsule(STAND_HEIGHT);
    return true;
  }

  private setCapsule(height: number): void {
    if (height === this.capsuleHeight) return;
    this.capsuleHeight = height;
    this.cc.setShapeOptions({ capsuleHeight: height, capsuleRadius: RADIUS }, true);
    this.applyFilters();
  }

  private applyFilters(): void {
    const shape = this.cc.shape;
    shape.filterMembershipMask = COLLISION.PLAYER;
    shape.filterCollideMask = COLLISION.WORLD | COLLISION.PROP | COLLISION.NPC | COLLISION.VEHICLE | COLLISION.ENEMY;
  }

  /** Dentro de um veículo: a cápsula sai do mundo (estacionada bem abaixo) e o modelo passa ao banco. */
  inVehicle = false;

  detachForVehicle(): void {
    this.inVehicle = true;
    this.horizontalSpeed = 0;
    this.sprintTimer = 0;
    this.sprinting = false;
    this.velocity.setAll(0);
    this.cc.setVelocity(Vector3.Zero());
    this.resetMotion(0);
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

  /** Distância (m) da base da cápsula até um chão caminhável logo abaixo, ou null. */
  private probeGround(center: Vector3, bottom: number): number | null {
    const engine = this.scene.getPhysicsEngine() as PhysicsEngine | null;
    if (!engine) return null;
    engine.raycastToRef(center, new Vector3(center.x, bottom - SNAP_DISTANCE, center.z), this.probeRay, { membership: COLLISION.PLAYER, collideWith: COLLISION.WORLD | COLLISION.PROP });
    if (!this.probeRay.hasHit) return null;
    if (this.probeRay.hitNormalWorld.y < this.cc.maxSlopeCosine) return null;
    return Math.max(0, bottom - this.probeRay.hitPointWorld.y);
  }

  private pulseNoise(radius: number): void {
    this.noisePulse = this.noiseTime > 0 ? Math.max(this.noisePulse, radius) : radius;
    this.noiseTime = NOISE_PULSE_TIME;
  }

  private emitStep(kind: FootstepKind): void {
    this.onFootstep.emit({ kind, surface: surfaceForHit(this.groundNodeName, this.feetPos.x, this.feetPos.z) });
  }

  private playMovementShot(clip: AnimationClip, speed: number, fade = 12): void {
    const anim = this.model.animator;
    if (this.locked || anim.isHoldingPose || !anim.has(clip) || anim.oneShotClip === "Death") return;
    // pulo/rolamento cortam gesto, tiro ou recarga em curso (as fases da arma correm por tempo, não pelo clipe)
    anim.playOneShot(clip, undefined, false, { speed, exclusive: true, fade });
  }

  private beginSlide(): void {
    this.actionYaw = this.moveYaw;
    this.sprintTimer = 0;
    this.sprinting = false;
    this.emitStep("run");
    this.pulseNoise(MOVEMENT_NOISE.slide);
  }

  update(dt: number, input: InputManager, cameraYaw: number): void {
    // apertos de pulo/esquiva são lidos sempre: nunca ficam guardados para depois do veículo/diálogo
    const jumpPressed = input.consumePress("jump");
    const dodgePressed = input.consumePress("dodge");
    if (this.inVehicle) {
      this.model.animator.update(dt);
      return;
    }
    const T = this.motion.tune;
    this.unlockedTime = this.locked ? 0 : this.unlockedTime + dt;
    if (!this.locked && this.unlockedTime > UNLOCK_GRACE) {
      if (jumpPressed) this.motion.requestJump();
      if (dodgePressed) this.motion.requestDodge();
    }
    this.noiseTime = Math.max(0, this.noiseTime - dt);
    this.recoverTime = Math.max(0, this.recoverTime - dt);

    const support: CharacterSurfaceInfo = this.cc.checkSupport(dt, this.down);
    const supported = support.supportedState === CharacterSupportedState.SUPPORTED;
    const currentVelocity = this.cc.getVelocity();
    const axis = this.locked ? { x: 0, y: 0 } : input.moveAxis();
    const moving = axis.x !== 0 || axis.y !== 0;
    this.inputMoving = moving;
    const dir = cameraRelativeDirection(axis, cameraYaw);
    const wantYaw = Math.atan2(dir.x, dir.z);

    // agachar segurando Ctrl (C alterna via evento no Game); correndo, vira deslize. No ar espera o chão.
    if (!this.locked && input.isHeld("crouchHold") && !this.crouched && !this.motion.airborne) this.setCrouched(true);

    // encaixe no chão: descendo degraus/rampas, o apoio perdido por poucos cm não vira queda
    const center = this.cc.getPosition();
    const bottom = center.y - this.capsuleHeight / 2;
    let grounded = supported;
    let snapGap = -1;
    if (!supported && !this.motion.airborne && this.groundedLast && currentVelocity.y <= 0.5 && this.lastRise < 0.005) {
      const gap = this.probeGround(center, bottom);
      if (gap !== null) {
        grounded = true;
        snapGap = gap;
      }
    }

    // rampa sob o deslize (gravidade ao longo da direção)
    let slopeAccel = 0;
    if (this.motion.phase === "slide" && supported) {
      const n = support.averageSurfaceNormal;
      if (n.lengthSquared() > 0.5) slopeAccel = 9.81 * (n.x * Math.sin(this.actionYaw) + n.z * Math.cos(this.actionYaw)) * 0.9;
    }

    const needStand = this.crouched || this.capsuleHeight < STAND_HEIGHT;
    const canJump = !this.motion.jumpPending || !needStand || this.canStandUp();
    const events = this.motion.update(dt, { grounded, y: bottom, vy: currentVelocity.y, locked: this.locked, canJump, slopeAccel });

    // velocidade horizontal no ar (parte da atual: colisões já descontadas pelo solver). No impacto com o chão
    // o solver às vezes converte parte da queda em velocidade horizontal: limita ao que foi pedido no quadro anterior.
    let airX = currentVelocity.x;
    let airZ = currentVelocity.z;
    const solvedPlanar = Math.hypot(airX, airZ);
    if (solvedPlanar > this.lastPlanarSpeed + 0.05) {
      const k = this.lastPlanarSpeed / solvedPlanar;
      airX *= k;
      airZ *= k;
    }
    let jumpVy: number | null = null;
    let liftVy: number | null = null;
    for (const e of events) {
      switch (e.type) {
        case "jump": {
          if (this.capsuleHeight < STAND_HEIGHT) this.setCapsule(STAND_HEIGHT);
          this.crouched = false;
          jumpVy = e.double ? T.doubleJumpVelocity : T.jumpVelocity;
          if (e.double && moving) {
            // pulo duplo redireciona o embalo para o direcional (controle de ar decisivo)
            const keep = Math.max(Math.hypot(airX, airZ), T.airMinSpeed + 0.4);
            airX = dir.x * keep;
            airZ = dir.z * keep;
          }
          this.playMovementShot("JumpStart", e.double ? 1.9 : 1.45, 14);
          if (!e.double) {
            this.emitStep("run");
            this.pulseNoise(MOVEMENT_NOISE.jump);
          }
          break;
        }
        case "land": {
          this.lastLanding = { drop: e.drop, impact: e.impact, airTime: e.airTime };
          const anim = this.model.animator;
          const shot = anim.oneShotClip;
          if (shot === "JumpStart" || shot === "Roll") anim.stopOneShot(12);
          if (e.impact) {
            this.camera?.addImpact(landingShake(e.impact));
            this.pulseNoise(landingNoise(e.impact));
            this.emitStep("run");
            if (e.impact !== "soft") this.emitStep("run");
            if (this.horizontalSpeed < 2.2 && !moving) this.playMovementShot("JumpLand", e.impact === "hard" ? 1.1 : e.impact === "heavy" ? 1.35 : 1.7, 16);
            if (e.impact === "hard") this.recoverTime = 0.35;
          }
          break;
        }
        case "roll": {
          this.actionYaw = moving ? wantYaw : this.yaw;
          this.sprintTimer = 0;
          this.sprinting = false;
          if (this.capsuleHeight > CROUCH_HEIGHT) this.setCapsule(CROUCH_HEIGHT);
          this.playMovementShot("Roll", 1.5, 14);
          this.pulseNoise(MOVEMENT_NOISE.roll);
          this.emitStep("run");
          break;
        }
        case "rollEnd": {
          if (!this.crouched) {
            if (this.canStandUp()) this.setCapsule(STAND_HEIGHT);
            else this.crouched = true;
          }
          if (moving && this.model.animator.oneShotClip === "Roll") this.model.animator.stopOneShot(10);
          this.moveYaw = this.actionYaw;
          break;
        }
        case "airDash": {
          const vh = Math.hypot(airX, airZ);
          this.actionYaw = moving ? wantYaw : vh > 0.5 ? Math.atan2(airX, airZ) : this.yaw;
          this.preDashSpeed = vh;
          liftVy = T.airDashLift;
          this.playMovementShot("Roll", 2.1, 16);
          this.pulseNoise(MOVEMENT_NOISE.airDash);
          this.camera?.addImpact(0.12);
          break;
        }
        case "airDashEnd": {
          const exit = Math.max(this.preDashSpeed, PLAYER_SPEEDS.run);
          airX = Math.sin(this.actionYaw) * exit;
          airZ = Math.cos(this.actionYaw) * exit;
          this.horizontalSpeed = exit;
          this.moveYaw = this.actionYaw;
          break;
        }
        case "slideEnd": {
          this.moveYaw = this.actionYaw;
          break;
        }
        default:
          break;
      }
      this.onMotion.emit(e);
    }

    const phase = this.motion.phase;
    const airborne = this.motion.airborne;

    // embalo: corrida contínua no plano (sem escada/rampa), sem agachar nem mirar
    const runHeld = !this.locked && !this.crouched && input.isHeld("run") && moving && this.aimYaw === null;
    const level = Math.abs(this.climbRate) < 0.35 && (!supported || support.averageSurfaceNormal.y > 0.95 || support.averageSurfaceNormal.lengthSquared() < 0.5);
    const straight = Math.abs(angleDelta(this.moveYaw, wantYaw)) < 1.2;
    this.sprintTimer = sprintCharge(this.sprintTimer, dt, runHeld && phase === "ground" && grounded && level && straight && this.actualSpeed >= PLAYER_SPEEDS.run * 0.85);
    this.sprinting = this.sprintTimer >= T.sprintAfter;

    let targetSpeed = !moving ? 0 : this.crouched ? PLAYER_SPEEDS.crouch : runHeld ? (this.sprinting ? PLAYER_SPEEDS.sprint : PLAYER_SPEEDS.run) : PLAYER_SPEEDS.walk;
    if (this.recoverTime > 0) targetSpeed = Math.min(targetSpeed, 1.6);

    // velocidade horizontal desejada por fase
    let planarX = 0;
    let planarZ = 0;
    if (phase === "ground") {
      const accelerating = targetSpeed > this.horizontalSpeed;
      const rate = !accelerating ? DECEL_RATE : this.horizontalSpeed >= PLAYER_SPEEDS.run * 0.95 && targetSpeed > PLAYER_SPEEDS.run ? SPRINT_RAMP : apexAccelRate(ACCEL_RATE, this.horizontalSpeed / Math.max(0.01, targetSpeed));
      this.horizontalSpeed = approach(this.horizontalSpeed, targetSpeed, rate, dt);
      if (Math.abs(this.horizontalSpeed - targetSpeed) < 0.01) this.horizontalSpeed = targetSpeed;
      if (this.horizontalSpeed < 0.01) this.horizontalSpeed = 0;
      if (moving) this.moveYaw = this.horizontalSpeed < 0.6 ? wantYaw : turnToward(this.moveYaw, wantYaw, turnRateFor(this.horizontalSpeed) * dt);
      planarX = Math.sin(this.moveYaw) * this.horizontalSpeed;
      planarZ = Math.cos(this.moveYaw) * this.horizontalSpeed;
    } else if (phase === "slide") {
      if (moving) this.actionYaw = turnToward(this.actionYaw, wantYaw, T.slideSteer * dt);
      this.horizontalSpeed = this.motion.slideSpeed;
      this.moveYaw = this.actionYaw;
      planarX = Math.sin(this.actionYaw) * this.horizontalSpeed;
      planarZ = Math.cos(this.actionYaw) * this.horizontalSpeed;
    } else if (phase === "roll") {
      this.horizontalSpeed = rollSpeedAt(this.motion.phaseTime, targetSpeed, T);
      planarX = Math.sin(this.actionYaw) * this.horizontalSpeed;
      planarZ = Math.cos(this.actionYaw) * this.horizontalSpeed;
    } else if (phase === "airDash") {
      this.horizontalSpeed = T.airDashSpeed;
      planarX = Math.sin(this.actionYaw) * T.airDashSpeed;
      planarZ = Math.cos(this.actionYaw) * T.airDashSpeed;
    } else {
      // no ar: mantém o embalo; o direcional acelera até um teto (sem somar velocidade sem fim)
      if (moving && !this.locked) {
        const cur = Math.hypot(airX, airZ);
        const cap = Math.max(cur, T.airMinSpeed);
        const tx = dir.x * cap;
        const tz = dir.z * cap;
        const dx = tx - airX;
        const dz = tz - airZ;
        const dl = Math.hypot(dx, dz);
        const maxStep = T.airAccel * dt;
        if (dl > maxStep) {
          airX += (dx / dl) * maxStep;
          airZ += (dz / dl) * maxStep;
        } else {
          airX = tx;
          airZ = tz;
        }
      }
      planarX = airX;
      planarZ = airZ;
      this.horizontalSpeed = Math.hypot(airX, airZ);
      if (this.horizontalSpeed > 0.4) this.moveYaw = Math.atan2(airX, airZ);
    }

    // rotação do personagem: ação travada, mira, ou direção do movimento
    const prevYaw = this.yaw;
    if (phase === "roll" || phase === "airDash") {
      this.yaw = turnToward(this.yaw, this.actionYaw, 30 * dt);
    } else if (this.aimYaw !== null) {
      this.yaw = turnToward(this.yaw, this.aimYaw, 14 * dt);
    } else if (phase === "slide") {
      this.yaw = turnToward(this.yaw, this.actionYaw, 12 * dt);
    } else if (airborne) {
      if (moving || this.horizontalSpeed > 0.5) this.yaw = turnToward(this.yaw, this.moveYaw, 9 * dt);
    } else if (moving && this.horizontalSpeed > 0.05) {
      this.yaw = turnToward(this.yaw, this.moveYaw, (this.crouched ? 8 : 16) * dt);
    }
    this.yawRate = approach(this.yawRate, dt > 0 ? angleDelta(prevYaw, this.yaw) / dt : 0, 12, dt);

    this.tmpDesired.set(planarX, 0, planarZ);
    this.tmpForward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.lastPlanarSpeed = Math.hypot(planarX, planarZ);

    let output: Vector3;
    const onGroundSolver = grounded && !airborne && jumpVy === null;
    if (onGroundSolver && supported) {
      // checkSupport pode devolver normal nula mesmo apoiado; sem este guarda a base ortonormal degenera e a velocidade zera
      const normal = support.averageSurfaceNormal.lengthSquared() > 0.5 ? support.averageSurfaceNormal : this.up;
      output = this.cc.calculateMovement(dt, this.tmpForward, normal, currentVelocity, support.averageSurfaceVelocity, this.tmpDesired, this.up);
      output.subtractInPlace(support.averageSurfaceVelocity);
      // remove componente vertical residual para não "pular" em quinas
      const vertical = Vector3.Dot(output, this.up);
      if (vertical > 1e-3) output.subtractInPlace(this.up.scale(vertical));
      output.addInPlace(support.averageSurfaceVelocity);
    } else if (onGroundSolver && snapGap >= 0) {
      // encaixe: segue a direção desejada e desce até o degrau/rampa de baixo neste quadro (mantendo a folga normal)
      output = new Vector3(planarX, -Math.min(12, Math.max(0, snapGap - SNAP_REST_GAP) / Math.max(dt, 1e-3)), planarZ);
    } else {
      // no ar: gravidade própria (sobe mais firme, cai mais rápido), impulso no ar quase sem gravidade
      let vy = jumpVy ?? currentVelocity.y;
      if (jumpVy === null) {
        const g = phase === "airDash" ? T.fallGravity * T.airDashGravityScale : vy > 0 ? T.riseGravity : T.fallGravity;
        vy = Math.max(-T.maxFallSpeed, vy - g * dt);
      }
      if (liftVy !== null) vy = Math.max(vy, liftVy);
      output = new Vector3(planarX, vy, planarZ);
    }
    this.cc.setVelocity(output);
    const yBefore = this.cc.getPosition().y;
    this.cc.integrate(dt, support, GRAVITY);
    this.lastRise = this.cc.getPosition().y - yBefore;
    const solved = this.cc.getVelocity();
    this.actualSpeed = Math.hypot(solved.x, solved.z);
    this.velocity.copyFrom(output);
    this.groundedLast = grounded && !this.motion.airborne;

    // passos por distância percorrida (só andando/correndo no chão)
    const planar = Math.hypot(output.x, output.z);
    const kind: FootstepKind = this.crouched ? "crouch" : runHeld ? "run" : "walk";
    if (phase === "ground" && grounded && planar > 0.3) {
      this.distanceSinceStep += planar * dt;
      const stride = kind === "run" && this.sprinting ? 2.9 : STRIDE[kind];
      if (this.distanceSinceStep >= stride) {
        this.distanceSinceStep = 0;
        this.emitStep(kind);
      }
    } else if (planar <= 0.3) {
      this.distanceSinceStep = STRIDE.walk * 0.6; // primeiro passo soa rápido ao sair do lugar
    }

    // estado de locomoção (ruído/animação)
    const nextState = resolveMoveState(this.horizontalSpeed > 0.2, runHeld && this.horizontalSpeed > PLAYER_SPEEDS.walk * 1.1, this.crouched || phase === "slide");
    if (nextState !== this.state) {
      this.state = nextState;
      this.onStateChange.emit(nextState);
    }
    this.applyAnimation(grounded);
    this.syncModel(dt, !grounded || airborne);
    this.applyLean(dt, phase);
    this.updateCameraFeedback(phase);
    this.model.animator.update(dt);
  }

  private applyAnimation(grounded: boolean): void {
    const anim = this.model.animator;
    if (anim.isHoldingPose) return;
    const shot = anim.oneShotClip;
    // gesto de corpo inteiro (interagir, pegar, morte) manda; tiro/recarga/reação são só do tronco: as pernas seguem
    if (shot && !MOVEMENT_SHOTS.has(shot) && !anim.oneShotIsUpper) return;
    // aterrissagem interrompível: andar já corta o agachamento do impacto
    if (shot === "JumpLand" && this.inputMoving && anim.oneShotElapsed > 0.1) anim.stopOneShot(10);
    const s = this.horizontalSpeed;
    const h = this.model.height;
    const phase = this.motion.phase;
    if ((this.motion.airborne || (!grounded && phase !== "roll" && this.motion.airTime > 0.2)) && anim.has("JumpLoop")) {
      anim.play("JumpLoop");
      return;
    }
    if (phase === "slide") {
      // a UAL não tem deslize: agachado travado + inclinação para trás (applyLean) é o mais próximo
      anim.play("CrouchIdle", 0.35);
      return;
    }
    switch (this.state) {
      case "idle":
        anim.play("Idle");
        break;
      case "walk":
        anim.play("Walk", animationSpeedRatio("Walk", s, h));
        break;
      case "run":
        if (anim.has("Sprint") && s > PLAYER_SPEEDS.run + 0.6) anim.play("Sprint", animationSpeedRatio("Sprint", s, h));
        else anim.play("Run", animationSpeedRatio("Run", s, h));
        break;
      case "crouchIdle":
        anim.play("CrouchIdle");
        break;
      case "crouchWalk":
        anim.play("CrouchWalk", animationSpeedRatio("CrouchWalk", s, h));
        break;
    }
  }

  /** Inclinação sutil do corpo: para dentro da curva, à frente no embalo, para trás no deslize. */
  private applyLean(dt: number, phase: string): void {
    let pitch = 0;
    let roll = 0;
    if (!this.locked && this.aimYaw === null) {
      if (phase === "slide") pitch = -0.24;
      else if (phase === "ground") {
        roll = Math.max(-0.13, Math.min(0.13, -this.yawRate * this.horizontalSpeed * 0.01));
        if (this.sprinting) pitch = 0.07;
      }
    }
    this.leanPitch = approach(this.leanPitch, pitch, 8, dt);
    this.leanRoll = approach(this.leanRoll, roll, 8, dt);
    const q = this.model.root.rotationQuaternion;
    if (q && (Math.abs(this.leanPitch) > 1e-4 || Math.abs(this.leanRoll) > 1e-4)) Quaternion.RotationYawPitchRollToRef(this.yaw, this.leanPitch, this.leanRoll, q);
    else this.model.setYaw(this.yaw);
  }

  /** FOV dinâmico: abre com a velocidade (até +0,10 rad no embalo, como no controlador MIT) e no impulso. */
  private updateCameraFeedback(phase: string): void {
    if (!this.camera) return;
    let fov = 0;
    if (!this.locked && this.aimYaw === null) {
      if (phase === "airDash") fov = 0.12;
      else {
        const k = Math.max(0, Math.min(1, (Math.min(this.horizontalSpeed, this.actualSpeed) - PLAYER_SPEEDS.walk) / (PLAYER_SPEEDS.sprint - PLAYER_SPEEDS.walk)));
        fov = k * 0.1 + (phase === "slide" ? 0.03 : 0);
      }
    }
    this.camera.motionFov = fov;
  }

  /**
   * O controlador do Havok mantém a cápsula alguns centímetros acima do apoio
   * (keepDistance). Um raio curto para baixo encontra o chão real e apoia o
   * modelo nele, com suavização para degraus. No ar o modelo acompanha a cápsula
   * sem atraso nem "grudar" no chão no início/fim do salto.
   */
  private syncModel(dt = 0, airborne = false): void {
    const p = this.cc.getPosition();
    const bottom = p.y - this.capsuleHeight / 2;
    let groundY = bottom;
    if (airborne && !this.modelAirborne) this.hoverOffset = this.modelY === null ? 0 : Math.max(0, Math.min(0.2, bottom - this.modelY));
    this.modelAirborne = airborne;
    if (airborne) groundY = bottom - this.hoverOffset;
    const engine = this.scene.getPhysicsEngine() as PhysicsEngine | null;
    if (engine) {
      const from = new Vector3(p.x, p.y, p.z);
      const to = new Vector3(p.x, bottom - 0.4, p.z);
      engine.raycastToRef(from, to, this.groundRay, { membership: COLLISION.PLAYER, collideWith: COLLISION.WORLD | COLLISION.PROP });
      if (this.groundRay.hasHit) {
        const hitY = this.groundRay.hitPointWorld.y;
        if (!airborne && hitY <= bottom + 0.05 && hitY >= bottom - 0.4) groundY = hitY;
        this.groundNodeName = this.groundRay.body?.transformNode?.name ?? null;
      } else {
        this.groundNodeName = null;
      }
    }
    if (airborne || this.modelY === null || dt <= 0 || Math.abs(groundY - this.modelY) > 0.6) this.modelY = groundY;
    else this.modelY += (groundY - this.modelY) * (1 - Math.exp(-14 * dt));
    this.feetPos.set(p.x, this.modelY, p.z);
    this.model.root.position.copyFrom(this.feetPos);
    if (dt > 0) {
      const rate = this.lastFeetY === null ? 0 : (this.modelY - this.lastFeetY) / dt;
      this.climbRate = approach(this.climbRate, airborne ? 0 : rate, 8, dt);
      this.lastFeetY = this.modelY;
    }
  }

  dispose(): void {
    this.cc.dispose();
  }
}

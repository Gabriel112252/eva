import { PhysicsCharacterController, CharacterSupportedState } from "@babylonjs/core/Physics/v2/characterController";
import { PhysicsRaycastResult } from "@babylonjs/core/Physics/physicsRaycastResult";
import type { PhysicsEngine } from "@babylonjs/core/Physics/v2/physicsEngine";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { SpotLight } from "@babylonjs/core/Lights/spotLight";
import type { Scene } from "@babylonjs/core/scene";
import { ArriveBehavior, SeparationBehavior, ObstacleAvoidanceBehavior, Vehicle as YukaVehicle, Vector3 as YVector3, type GameEntity } from "yuka";
import type { CharacterModel } from "@/characters/characterModel";
import { animationSpeedRatio, angleDelta } from "@/player/playerController";
import { COLLISION } from "@/world/context";
import { GRAVITY } from "@/physics/havok";
import { Health } from "@/combat/health";
import { TypedEvent } from "@/core/events";
import { AWARENESS_DEFAULTS, CUSTODIO_VISION, SAQUEADOR_VISION, createAwareness, curfewVision, inVisionCone, stepAwareness, type Awareness, type AwarenessEvent, type AwarenessParams, type AwarenessState, type VisionParams } from "./stealth";

export type EnemyState = "patrol" | "alert" | "chase" | "attack" | "hurt" | "dead";
/** saqueador: hostil, atira ao ver. custodio: patrulha com lanterna, dá voz de prisão; só atira se provocado. */
export type EnemyRole = "saqueador" | "custodio";

export interface EnemyShot {
  from: Vector3;
  to: Vector3;
  hitPlayer: boolean;
  damage: number;
}

export interface EnemyConfig {
  /** pontos de patrulha (loop); vazio = fica parado vigiando */
  patrol: Vector3[];
  /** começa já hostil (emboscada) */
  hostile?: boolean;
  health?: number;
  damage?: number;
  accuracy?: number;
  /** distância preferida de tiro */
  range?: number;
  /** papel (padrão saqueador) */
  role?: EnemyRole;
  /** lanterna acompanhando o olhar (padrão: ligada para custódios) */
  flashlight?: boolean;
  /** ajustes de visão (ângulo/alcance) por cima do padrão do papel */
  vision?: Partial<VisionParams>;
  /** detecções até virar hostil (custódio; padrão 2) */
  detectionsToHostile?: number;
  awareness?: Partial<AwarenessParams>;
}

export interface DetectionEvent {
  enemy: Enemy;
  /** 1ª, 2ª… detecção deste guarda */
  count: number;
  /** passou a hostil com esta detecção */
  hostile: boolean;
}

const HEIGHT = 1.78;
const RADIUS = 0.32;

/**
 * Inimigo humano: máquina de estados patrulha → alerta → perseguição → ataque, com visão em cone + linha
 * de visada por raio físico, audição, movimento por steering (yuka: Arrive + Separation +
 * ObstacleAvoidance) integrado pelo PhysicsCharacterController do Havok, tiros com dispersão/acerto
 * probabilístico e reações de dano/morte animadas.
 *
 * Papel `custodio`: percepção gradual (`stealth.ts`: calmo → suspeito → alerta → perseguição), lanterna
 * (SpotLight) seguindo o olhar, voz de prisão ao detectar; só vira hostil (atira) se levar tiro ou após
 * `detectionsToHostile` detecções.
 */
export class Enemy {
  readonly health: Health;
  readonly cc: PhysicsCharacterController;
  readonly steering: YukaVehicle;
  readonly onShot = new TypedEvent<EnemyShot>();
  readonly onDeath = new TypedEvent<Enemy>();
  readonly onStateChange = new TypedEvent<EnemyState>();
  /** custódio: detectou Matias (voz de prisão) */
  readonly onDetected = new TypedEvent<DetectionEvent>();
  /** custódio: alcançou Matias em perseguição (prisão) */
  readonly onCaught = new TypedEvent<Enemy>();
  /** custódio: mudou de estado de percepção */
  readonly onAwareness = new TypedEvent<{ enemy: Enemy; state: AwarenessState; event: AwarenessEvent }>();
  readonly role: EnemyRole;
  state: EnemyState = "patrol";
  yaw = 0;
  awareness: Awareness = createAwareness();
  /** custódio: quantas vezes detectou Matias */
  detections = 0;
  /** atira ao ver (saqueador sempre; custódio só provocado) */
  hostile: boolean;
  /** toque de recolher: visão mais curta, audição mais longa (definido pelo EnemyManager) */
  curfew = false;
  flashlight: SpotLight | null = null;
  private feetPos = new Vector3();
  private readonly ray = new PhysicsRaycastResult();
  private readonly engine: PhysicsEngine;
  private patrolIndex = 0;
  private patrolWait = 0;
  private fireTimer = 1.0;
  private hurtTimer = 0;
  private strafeTimer = 0;
  private strafeSide = 1;
  private alertTimer = 0;
  private lastKnownPlayer: Vector3 | null = null;
  private readonly arrive: ArriveBehavior;
  private readonly separation: SeparationBehavior;
  private readonly avoidance: ObstacleAvoidanceBehavior;
  private readonly target = new YVector3();
  private horizontalSpeed = 0;
  private readonly damage: number;
  private readonly accuracy: number;
  private readonly range: number;
  private deadTime = 0;
  private heardThisFrame = false;
  private heardAt: Vector3 | null = null;
  private caughtTimer = 0;
  private caughtEmitted = false;
  private searchLook = 0;
  private readonly baseVision: VisionParams;
  private readonly awarenessParams: AwarenessParams;
  private readonly detectionsToHostile: number;
  /** munição que deixa ao morrer */
  dropAmmo = 6;

  constructor(
    private readonly scene: Scene,
    readonly model: CharacterModel,
    position: Vector3,
    yaw: number,
    readonly config: EnemyConfig,
    obstacles: GameEntity[],
  ) {
    this.engine = scene.getPhysicsEngine() as PhysicsEngine;
    this.role = config.role ?? "saqueador";
    this.health = new Health(config.health ?? 70);
    this.damage = config.damage ?? 9;
    this.accuracy = config.accuracy ?? 0.55;
    this.range = config.range ?? 9;
    this.yaw = yaw;
    this.hostile = this.role === "saqueador" || config.hostile === true;
    this.baseVision = { ...(this.role === "custodio" ? CUSTODIO_VISION : SAQUEADOR_VISION), ...config.vision };
    this.awarenessParams = { ...AWARENESS_DEFAULTS, ...config.awareness };
    this.detectionsToHostile = config.detectionsToHostile ?? 2;
    this.cc = new PhysicsCharacterController(position.add(new Vector3(0, HEIGHT / 2 + 0.05, 0)), { capsuleHeight: HEIGHT, capsuleRadius: RADIUS }, scene);
    this.cc.maxSlopeCosine = Math.cos((50 * Math.PI) / 180);
    this.cc.maxStepHeight = 0.32;
    this.cc.keepDistance = 0.04;
    this.cc.characterMass = 80;
    this.cc.acceleration = 1;
    this.cc.maxAcceleration = 60;
    const shape = this.cc.shape;
    shape.filterMembershipMask = COLLISION.ENEMY;
    shape.filterCollideMask = COLLISION.WORLD | COLLISION.PROP | COLLISION.NPC | COLLISION.PLAYER | COLLISION.VEHICLE | COLLISION.ENEMY;

    this.steering = new YukaVehicle();
    this.steering.maxSpeed = 2.0;
    this.steering.maxForce = 12;
    this.steering.mass = 1;
    this.steering.boundingRadius = RADIUS;
    this.steering.updateNeighborhood = true;
    this.steering.neighborhoodRadius = 3.5;
    this.steering.position.set(position.x, position.y, position.z);
    this.arrive = new ArriveBehavior(this.target, 2.5, 0.3);
    this.arrive.weight = 1;
    this.separation = new SeparationBehavior();
    this.separation.weight = 1.6;
    this.avoidance = new ObstacleAvoidanceBehavior(obstacles);
    this.avoidance.dBoxMinLength = 2.5;
    this.avoidance.brakingWeight = 0.3;
    this.avoidance.weight = 2.2;
    this.steering.steering.add(this.avoidance);
    this.steering.steering.add(this.separation);
    this.steering.steering.add(this.arrive);
    this.arrive.active = false;

    model.root.position.copyFrom(position);
    model.setYaw(yaw);
    this.feetPos.copyFrom(position);
    if (config.flashlight ?? this.role === "custodio") this.createFlashlight();
    if (config.hostile) this.setState("chase");
    this.health.onDeath.on(() => this.die());
  }

  /** Lanterna presa ao personagem (segue o yaw do modelo). Começa desligada: o gerenciador liga as mais próximas. */
  private createFlashlight(): void {
    const light = new SpotLight(`${this.model.root.name}_lanterna`, new Vector3(0.22, 1.38, 0.25), new Vector3(0, -0.12, 1), 0.62, 4, this.scene);
    light.parent = this.model.root;
    light.diffuse = new Color3(1.0, 0.95, 0.8);
    light.specular = new Color3(0.6, 0.6, 0.5);
    light.intensity = 10;
    light.range = this.baseVision.range;
    light.setEnabled(false);
    this.flashlight = light;
  }

  /** Visão efetiva (papel + toque de recolher). */
  get vision(): VisionParams {
    return curfewVision(this.baseVision, this.curfew);
  }

  /** Lanterna acesa? (o gerenciador limita quantas ficam ligadas) */
  setFlashlight(on: boolean): void {
    if (!this.flashlight) return;
    if (this.flashlight.isEnabled() !== on) this.flashlight.setEnabled(on);
  }

  get flashlightOn(): boolean {
    return this.flashlight?.isEnabled() ?? false;
  }

  get feet(): Vector3 {
    return this.feetPos.clone();
  }

  get eyes(): Vector3 {
    return this.feetPos.add(new Vector3(0, 1.6, 0));
  }

  get chest(): Vector3 {
    return this.feetPos.add(new Vector3(0, 1.25, 0));
  }

  get body(): PhysicsBody | null {
    // o controlador de personagem não expõe PhysicsBody; os tiros acertam a cápsula pelo gerenciador (segmento × cápsula)
    return null;
  }

  get alive(): boolean {
    return this.state !== "dead";
  }

  /** Tempo (s) desde a morte — para remover o corpo depois. */
  get timeDead(): number {
    return this.deadTime;
  }

  /** Custódio em modo furtivo (percepção gradual, não atira). */
  get stealthMode(): boolean {
    return this.role === "custodio" && !this.hostile && this.alive;
  }

  setState(s: EnemyState): void {
    if (this.state === s || this.state === "dead") return;
    this.state = s;
    this.onStateChange.emit(s);
    if (s === "attack") this.fireTimer = 0.6 + Math.random() * 0.6;
    if (s === "alert") this.alertTimer = 0.8 + Math.random() * 0.5;
  }

  /**
   * Ouviu um barulho a `loudness` metros (passos, tiro, motor). Saqueadores em patrulha ficam alertas e
   * vão investigar; custódios alimentam a percepção gradual (vão olhar o ponto do som).
   */
  hearNoise(at: Vector3, loudness = 30): void {
    if (!this.alive) return;
    const reach = loudness * this.vision.hearing;
    if (Vector3.Distance(at, this.feetPos) > reach) return;
    if (this.stealthMode) {
      this.heardThisFrame = true;
      this.heardAt = at.clone();
      return;
    }
    if (this.state !== "patrol") return;
    this.lastKnownPlayer = at.clone();
    this.setState("alert");
  }

  /** Torna o custódio hostil (levou tiro / detecções demais): passa à FSM de combate. */
  makeHostile(): void {
    if (this.hostile || !this.alive) return;
    this.hostile = true;
    if (this.state === "patrol" || this.state === "alert") this.setState("chase");
  }

  /** Dano recebido; devolve se morreu com este dano. */
  takeDamage(amount: number, from: Vector3, headshot: boolean): boolean {
    if (!this.alive) return false;
    this.health.damage({ amount, from: { x: from.x, y: from.y, z: from.z }, headshot });
    if (!this.health.alive) return true;
    this.lastKnownPlayer = from.clone();
    if (this.role === "custodio" && !this.hostile) this.makeHostile();
    if (this.state === "patrol" || this.state === "alert") this.setState("chase");
    if (this.state !== "dead") {
      this.hurtTimer = 0.45;
      this.setState("hurt");
      this.model.animator.playOneShot("Hit", undefined, true);
    }
    return false;
  }

  private die(): void {
    this.state = "dead";
    this.onStateChange.emit("dead");
    this.model.animator.setOverlay(null);
    this.model.animator.playOneShot("Death");
    this.arrive.active = false;
    this.setFlashlight(false);
    // tira a cápsula do caminho (o corpo fica só visual)
    this.cc.setPosition(new Vector3(0, -140, 0));
    this.onDeath.emit(this);
  }

  /** Vê o jogador? cone do papel (saqueador 110°/28 m, custódio 70°/22 m, menos à noite) e linha de visada livre até o peito. */
  canSee(playerChest: Vector3): boolean {
    const d = playerChest.subtract(this.eyes);
    const dist = d.length();
    const fwd = { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
    if (!inVisionCone(fwd, { x: d.x, z: d.z }, dist, this.vision)) return false;
    return this.hasLineOfSight(playerChest);
  }

  hasLineOfSight(target: Vector3): boolean {
    this.engine.raycastToRef(this.eyes, target, this.ray, { membership: COLLISION.ENEMY, collideWith: COLLISION.WORLD | COLLISION.PROP | COLLISION.VEHICLE });
    return !this.ray.hasHit;
  }

  /**
   * Atualiza IA + física. `playerFeet` = pés de Matias; `playerAlive` false faz o inimigo voltar a patrulhar.
   */
  update(dt: number, playerFeet: Vector3, playerAlive: boolean): void {
    const anim = this.model.animator;
    if (this.state === "dead") {
      this.deadTime += dt;
      anim.update(dt);
      return;
    }
    const playerChest = playerFeet.add(new Vector3(0, 1.25, 0));
    const toPlayer = playerFeet.subtract(this.feetPos);
    const dist = Math.hypot(toPlayer.x, toPlayer.z);
    const sees = playerAlive && this.canSee(playerChest);
    if (sees && !this.stealthMode) this.lastKnownPlayer = playerFeet.clone();

    let moveTarget: Vector3 | null = null;
    let runSpeed = 1.6;
    let faceYaw: number | null = null;
    if (this.stealthMode) {
      const r = this.updateStealth(dt, playerFeet, playerAlive, sees, dist);
      moveTarget = r.moveTarget;
      runSpeed = r.runSpeed;
      faceYaw = r.faceYaw;
    } else {
      // --- transições (combate) -------------------------------------------------------------------
      switch (this.state) {
        case "patrol":
          if (sees) this.setState("chase");
          break;
        case "alert":
          this.alertTimer -= dt;
          if (sees) this.setState("chase");
          else if (this.alertTimer <= 0) this.setState("chase"); // vai investigar o último ponto conhecido
          break;
        case "chase":
          if (!playerAlive) this.setState("patrol");
          else if (sees && dist < this.range + 2) this.setState("attack");
          break;
        case "attack":
          if (!playerAlive) this.setState("patrol");
          else if (!sees || dist > this.range + 6) this.setState("chase");
          break;
        case "hurt":
          this.hurtTimer -= dt;
          if (this.hurtTimer <= 0) this.setState(playerAlive ? "attack" : "patrol");
          break;
        default:
          break;
      }

      // --- alvo de movimento ------------------------------------------------------------------------
      switch (this.state) {
        case "patrol": {
          const p = this.patrolTarget(dt);
          if (p) {
            moveTarget = p;
            runSpeed = 1.3;
          }
          break;
        }
        case "alert":
        case "chase": {
          const goal = this.lastKnownPlayer ?? playerFeet;
          moveTarget = goal;
          runSpeed = this.state === "alert" ? 1.6 : 4.2;
          break;
        }
        case "attack": {
          // mantém distância e desloca-se lateralmente de tempos em tempos
          this.strafeTimer -= dt;
          if (this.strafeTimer <= 0) {
            this.strafeTimer = 2 + Math.random() * 2.5;
            this.strafeSide = Math.random() < 0.5 ? -1 : 1;
          }
          const dir = toPlayer.normalizeToNew();
          const side = new Vector3(-dir.z, 0, dir.x).scaleInPlace(this.strafeSide * 2.2);
          const want = dist > this.range + 1 ? playerFeet.subtract(dir.scale(this.range)) : dist < this.range - 2.5 ? this.feetPos.subtract(dir.scale(2)) : this.feetPos.add(side);
          moveTarget = want;
          runSpeed = 1.5;
          break;
        }
        default:
          break;
      }
    }

    // --- steering (yuka) → velocidade desejada → controlador do Havok --------------------------
    this.steering.position.set(this.feetPos.x, this.feetPos.y, this.feetPos.z);
    if (moveTarget) {
      this.target.set(moveTarget.x, this.feetPos.y, moveTarget.z);
      this.arrive.active = true;
      this.steering.maxSpeed = runSpeed;
    } else {
      this.arrive.active = false;
      this.steering.velocity.multiplyScalar(0.7);
    }
    this.steering.update(dt);
    const desired = new Vector3(this.steering.velocity.x, 0, this.steering.velocity.z);
    const support = this.cc.checkSupport(dt, new Vector3(0, -1, 0));
    let output: Vector3;
    const up = Vector3.Up();
    if (support.supportedState === CharacterSupportedState.SUPPORTED) {
      const normal = support.averageSurfaceNormal.lengthSquared() > 0.5 ? support.averageSurfaceNormal : up;
      const fwd = new Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      output = this.cc.calculateMovement(dt, fwd, normal, this.cc.getVelocity(), support.averageSurfaceVelocity, desired, up);
      const vertical = Vector3.Dot(output, up);
      if (vertical > 1e-3) output.subtractInPlace(up.scale(vertical));
    } else {
      output = this.cc.getVelocity().add(GRAVITY.scale(dt));
    }
    this.cc.setVelocity(output);
    this.cc.integrate(dt, support, GRAVITY);
    const p = this.cc.getPosition();
    this.feetPos.set(p.x, p.y - HEIGHT / 2 - 0.05, p.z);
    this.model.root.position.copyFrom(this.feetPos);
    this.horizontalSpeed = Math.hypot(output.x, output.z);

    // --- orientação: para onde anda, ou para o jogador quando ataca -------------------------------
    let targetYaw = this.yaw;
    if (faceYaw !== null) targetYaw = faceYaw;
    else if (this.state === "attack" || (this.state === "hurt" && playerAlive)) targetYaw = Math.atan2(toPlayer.x, toPlayer.z);
    else if (this.horizontalSpeed > 0.3) targetYaw = Math.atan2(output.x, output.z);
    const delta = angleDelta(this.yaw, targetYaw);
    this.yaw += Math.sign(delta) * Math.min(Math.abs(delta), 7 * dt);
    this.model.setYaw(this.yaw);

    // --- tiro -----------------------------------------------------------------------------------
    if (this.state === "attack" && playerAlive && this.hostile) {
      this.fireTimer -= dt;
      if (this.fireTimer <= 0 && Math.abs(delta) < 0.35) {
        this.fireTimer = 1.1 + Math.random() * 0.9;
        this.fireAt(playerChest, dist);
      }
    }

    // --- animação -------------------------------------------------------------------------------
    const h = this.model.height;
    const armed = this.state !== "patrol";
    if (!anim.isOneShotPlaying || this.state === "attack") {
      anim.setOverlay(armed ? (this.state === "attack" ? "PistolAim" : "PistolIdle") : null);
      if (this.horizontalSpeed > 3) anim.play("Run", animationSpeedRatio("Run", this.horizontalSpeed, h));
      else if (this.horizontalSpeed > 0.25) anim.play("Walk", animationSpeedRatio("Walk", this.horizontalSpeed, h));
      else anim.play("Idle");
    }
    anim.update(dt);
    this.heardThisFrame = false;
  }

  /** Próximo ponto de patrulha (ou null quando parado esperando). */
  private patrolTarget(dt: number): Vector3 | null {
    const pts = this.config.patrol;
    if (pts.length === 0) return null;
    const p = pts[this.patrolIndex % pts.length]!;
    if (Vector3.Distance(new Vector3(p.x, 0, p.z), new Vector3(this.feetPos.x, 0, this.feetPos.z)) < 0.8) {
      this.patrolWait -= dt;
      if (this.patrolWait <= 0) {
        this.patrolIndex++;
        this.patrolWait = 1.5 + Math.random() * 2.5;
      }
      return null;
    }
    return p;
  }

  /**
   * Custódio em modo furtivo: percepção gradual decide o estado de patrulha (`EnemyState` espelha:
   * calmo→patrol, suspeito/alerta→alert, perseguição→chase) e o movimento.
   */
  private updateStealth(dt: number, playerFeet: Vector3, playerAlive: boolean, sees: boolean, dist: number): { moveTarget: Vector3 | null; runSpeed: number; faceYaw: number | null } {
    const vision = this.vision;
    const proximity = Math.max(0, Math.min(1, 1 - dist / Math.max(1, vision.range)));
    const lastKnown = this.lastKnownPlayer;
    const atLastKnown = !lastKnown || Vector3.Distance(new Vector3(lastKnown.x, 0, lastKnown.z), new Vector3(this.feetPos.x, 0, this.feetPos.z)) < 1.4;
    const before = this.awareness.state;
    const { next, event } = stepAwareness(this.awareness, { sees: sees && playerAlive, heard: this.heardThisFrame, proximity, atLastKnown, dt }, this.awarenessParams);
    this.awareness = next;
    if (sees && playerAlive) this.lastKnownPlayer = playerFeet.clone();
    else if (this.heardThisFrame && this.heardAt) this.lastKnownPlayer = this.heardAt.clone();
    if (event === "detectou") {
      this.detections++;
      const hostile = this.detections >= this.detectionsToHostile;
      this.caughtTimer = 0;
      this.caughtEmitted = false;
      this.onDetected.emit({ enemy: this, count: this.detections, hostile });
      if (hostile) {
        this.makeHostile();
        this.onAwareness.emit({ enemy: this, state: next.state, event });
        return { moveTarget: this.lastKnownPlayer, runSpeed: 4.2, faceYaw: null };
      }
    }
    if (next.state !== before || event) this.onAwareness.emit({ enemy: this, state: next.state, event });

    // estado de combate espelhado (HUD/animação: alerta saca a arma)
    const mirror: EnemyState = next.state === "calmo" ? "patrol" : next.state === "perseguicao" ? "chase" : "alert";
    if (this.state !== mirror && this.state !== "hurt") this.setState(mirror);

    const toPlayer = playerFeet.subtract(this.feetPos);
    switch (next.state) {
      case "calmo": {
        const p = this.patrolTarget(dt);
        return { moveTarget: p, runSpeed: 1.3, faceYaw: null };
      }
      case "suspeito": {
        // para e encara o ponto suspeito
        const look = this.lastKnownPlayer ?? playerFeet;
        return { moveTarget: null, runSpeed: 0, faceYaw: Math.atan2(look.x - this.feetPos.x, look.z - this.feetPos.z) };
      }
      case "alerta": {
        if (!atLastKnown && lastKnown) return { moveTarget: lastKnown, runSpeed: 1.6, faceYaw: null };
        // chegou: varre a lanterna de um lado para o outro
        this.searchLook += dt;
        const base = lastKnown ? Math.atan2(lastKnown.x - this.feetPos.x, lastKnown.z - this.feetPos.z) : this.yaw;
        return { moveTarget: null, runSpeed: 0, faceYaw: base + Math.sin(this.searchLook * 1.1) * 0.9 };
      }
      case "perseguicao": {
        // corre atrás; alcançou por ~0,8 s a menos de 1,6 m → prisão
        if (sees && dist < 1.6) {
          this.caughtTimer += dt;
          if (this.caughtTimer > 0.8 && !this.caughtEmitted) {
            this.caughtEmitted = true;
            this.onCaught.emit(this);
          }
        } else this.caughtTimer = 0;
        const goal = sees ? playerFeet : (this.lastKnownPlayer ?? playerFeet);
        const face = sees ? Math.atan2(toPlayer.x, toPlayer.z) : null;
        return { moveTarget: dist > 1.2 ? goal : null, runSpeed: 4.2, faceYaw: dist <= 1.2 ? face : null };
      }
      default:
        return { moveTarget: null, runSpeed: 0, faceYaw: null };
    }
  }

  private fireAt(playerChest: Vector3, dist: number): void {
    const from = this.chest.add(new Vector3(Math.sin(this.yaw) * 0.4, 0.1, Math.cos(this.yaw) * 0.4));
    // acerto probabilístico: cai com a distância; erra deslocando o ponto final
    const chance = Math.max(0.1, this.accuracy - dist * 0.025);
    const hit = Math.random() < chance;
    const miss = hit ? Vector3.Zero() : new Vector3((Math.random() - 0.5) * 1.6, (Math.random() - 0.3) * 0.9, (Math.random() - 0.5) * 1.6);
    const to = playerChest.add(miss);
    this.model.animator.playOneShot("PistolShoot", undefined, true);
    this.onShot.emit({ from, to, hitPlayer: hit, damage: this.damage });
  }

  dispose(): void {
    this.flashlight?.dispose();
    this.flashlight = null;
    this.cc.dispose();
    this.model.dispose();
  }
}

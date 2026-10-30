import { ImportMeshAsync } from "@babylonjs/core/Loading/sceneLoader";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import { PhysicsActivationControl, PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import type { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import { PhysicsShapeBox } from "@babylonjs/core/Physics/v2/physicsShape";
import { PhysicsRaycastResult } from "@babylonjs/core/Physics/physicsRaycastResult";
import type { PhysicsEngine } from "@babylonjs/core/Physics/v2/physicsEngine";
import { SpotLight } from "@babylonjs/core/Lights/spotLight";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import type { Observer } from "@babylonjs/core/Misc/observable";
import { COLLISION } from "@/world/context";
import { GROUND_FENCE_RADIUS } from "@/world/bounds";
import type { Interactable } from "@/interaction/interactable";
import { RaycastVehicle, type WheelInfo } from "./raycastVehicle";
import { HoverController, type HoverControls } from "./hoverBike";
import { VEHICLE_DEFS, type VehicleDef, type VehicleId } from "./vehicleDefs";

export interface VehicleControls {
  /** -1..1: trás/frente */
  throttle: number;
  /** -1..1: esquerda/direita */
  steer: number;
  /** freio de mão (Espaço) */
  handbrake: boolean;
  /** -1..1 subir/descer (aeromoto) */
  lift: number;
  boost: boolean;
}

export function vehicleUrl(id: string): string {
  const ext = (import.meta.env.VITE_CHARACTER_EXT as string | undefined) ?? ".glb";
  return `${import.meta.env.BASE_URL}assets/vehicles/${id}${ext}`;
}

/** Lógica pura do comando de motor/freio a partir do acelerador e da velocidade atual (testável). */
export function resolveDrive(throttle: number, speed: number, def: Pick<VehicleDef, "engineForce" | "brakeForce" | "maxSpeed" | "maxReverseSpeed">): { engine: number; brake: number } {
  if (throttle > 0.05) {
    if (speed < -0.5) return { engine: 0, brake: def.brakeForce }; // andando para trás: acelerar = frear
    const headroom = Math.max(0, 1 - speed / def.maxSpeed);
    return { engine: def.engineForce * throttle * Math.min(1, headroom * 3), brake: 0 };
  }
  if (throttle < -0.05) {
    if (speed > 0.5) return { engine: 0, brake: def.brakeForce * -throttle }; // andando para a frente: freia
    const headroom = Math.max(0, 1 + speed / def.maxReverseSpeed);
    return { engine: def.engineForce * 0.5 * throttle * Math.min(1, headroom * 3), brake: 0 };
  }
  return { engine: 0, brake: 0 };
}

/** Esterçamento máximo cai com a velocidade (estabilidade em alta). */
export function steerLimit(maxSteer: number, speed: number): number {
  const s = Math.abs(speed);
  return maxSteer * Math.max(0.3, 1 - s / 32);
}

/**
 * Veículo jogável: modelo GLB + corpo rígido Havok + rodas por raio (ou controle de voo), banco do
 * motorista, faróis e interação "Entrar". A lógica de entrar/sair fica no Game (controla Matias/câmera).
 */
export class Vehicle implements Interactable {
  readonly id: string;
  readonly radius = 2.8;
  readonly anchor: TransformNode;
  readonly seat: TransformNode;
  readonly body: PhysicsBody;
  readonly rv: RaycastVehicle | null;
  readonly hover: HoverController | null;
  readonly meshes: AbstractMesh[];
  readonly wheels: WheelInfo[] = [];
  readonly rotors: TransformNode[] = [];
  readonly headlights: SpotLight[] = [];
  occupied = false;
  /** acionado quando o jogador interage (entrar) */
  onEnter: ((v: Vehicle) => void) | null = null;
  controls: VehicleControls = { throttle: 0, steer: 0, handbrake: false, lift: 0, boost: false };
  private steering = 0;
  private lightsOn = false;
  private readonly physicsObserver: Observer<Scene> | null;
  private readonly ray = new PhysicsRaycastResult();
  private readonly engine: PhysicsEngine;
  /** último contato forte (para som/dano) */
  lastImpact = 0;
  /** fora da área do quarteirão (aeromoto) */
  outOfBounds = false;

  private constructor(
    readonly scene: Scene,
    readonly def: VehicleDef,
    root: AbstractMesh,
    meshes: AbstractMesh[],
    position: Vector3,
    yaw: number,
  ) {
    this.id = `veiculo_${def.id}`;
    this.engine = scene.getPhysicsEngine() as PhysicsEngine;
    this.anchor = new TransformNode(this.id, scene);
    this.anchor.position.copyFrom(position);
    this.anchor.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), yaw);
    root.parent = this.anchor;
    this.meshes = meshes;
    this.anchor.computeWorldMatrix(true);
    void meshes;

    // corpo rígido do chassi (caixa) com centro de massa baixo
    const shape = new PhysicsShapeBox(def.chassisCenter, Quaternion.Identity(), def.chassisSize, scene);
    shape.filterMembershipMask = COLLISION.VEHICLE;
    shape.filterCollideMask = COLLISION.WORLD | COLLISION.PROP | COLLISION.PLAYER | COLLISION.NPC | COLLISION.VEHICLE;
    shape.material = { friction: 0.5, restitution: 0.05 };
    this.body = new PhysicsBody(this.anchor, PhysicsMotionType.DYNAMIC, false, scene);
    this.body.shape = shape;
    // inércia explícita de caixa. O Havok trata o campo `inertia` como inércia por unidade de massa
    // (tensor/massa) — medido: um impulso angular de 3000 N·m·s girou 2400× menos do que o esperado com o
    // tensor completo — então passamos (1/12)·(a²+b²), um pouco maior para estabilidade.
    const sx = def.chassisSize.x;
    const sy = def.chassisSize.y;
    const sz = def.chassisSize.z;
    const k = (1 / 12) * 1.25;
    this.body.setMassProperties({ mass: def.mass, centerOfMass: def.centerOfMass, inertia: new Vector3(k * (sy * sy + sz * sz), k * (sx * sx + sz * sz), k * (sx * sx + sy * sy)) });
    this.body.setLinearDamping(0.05);
    this.body.setAngularDamping(def.kind === "hover" ? 1.5 : 0.6);
    // a aeromoto nunca dorme: pairando com velocidade zero o Havok a desativaria e os impulsos dos rotores
    // deixariam de acordá-la (ficava presa no ar após um teletransporte)
    if (def.kind === "hover") {
      const plugin = scene.getPhysicsEngine()?.getPhysicsPlugin() as HavokPlugin | undefined;
      plugin?.setActivationControl?.(this.body, PhysicsActivationControl.ALWAYS_ACTIVE);
    }
    this.body.setCollisionCallbackEnabled(true);
    this.body.getCollisionObservable().add((ev) => {
      const impulse = ev.impulse ?? 0;
      if (impulse > def.mass * 1.5) this.lastImpact = impulse / def.mass;
    });

    // banco do motorista
    this.seat = new TransformNode(`${this.id}_banco`, scene);
    this.seat.parent = this.anchor;
    this.seat.position.copyFrom(def.seat);
    this.seat.rotationQuaternion = Quaternion.Identity();

    const rayMask = { membership: COLLISION.VEHICLE, collideWith: COLLISION.WORLD | COLLISION.PROP };
    if (def.kind === "hover") {
      this.rv = null;
      this.hover = new HoverController(this.body, this.anchor, this.engine, def.hover!, rayMask);
      for (const m of meshes) if (/_ROTOR_/.test(m.name)) this.rotors.push(m);
    } else {
      this.hover = null;
      this.rv = new RaycastVehicle(this.body, this.anchor, this.engine, { raycastMembership: rayMask.membership, raycastCollideWith: rayMask.collideWith });
      this.setupWheels(root, meshes);
    }

    // faróis (desligados; o Game liga ao entrar à noite)
    for (const [i, lp] of def.headlights.entries()) {
      const light = new SpotLight(`${this.id}_farol_${i}`, lp.clone(), new Vector3(0, -0.18, 1), Math.PI * 0.55, 6, scene);
      light.parent = this.anchor;
      light.diffuse = new Color3(1.0, 0.9, 0.75);
      light.intensity = 18;
      light.range = 28;
      light.setEnabled(false); // luzes desligadas não entram nos shaders (limite de blocos uniformes)
      this.headlights.push(light);
    }

    this.physicsObserver = scene.onBeforePhysicsObservable?.add(() => this.physicsStep()) ?? null;
  }

  static async load(scene: Scene, id: VehicleId, position: Vector3, yaw: number): Promise<Vehicle> {
    const def = VEHICLE_DEFS[id];
    const result = await ImportMeshAsync(vehicleUrl(id), scene, { pluginExtension: ".glb" });
    const root = result.meshes.find((m) => !m.parent) ?? result.meshes[0]!;
    const meshes = result.meshes.filter((m) => m.getTotalVertices() > 0);
    for (const m of meshes) {
      m.isPickable = false;
      m.receiveShadows = true;
      if (m.material instanceof PBRMaterial) m.material.environmentIntensity = 0.9;
    }
    return new Vehicle(scene, def, root, meshes, position, yaw);
  }

  /** Rodas: malhas `*_WHEEL_*` do GLB; a posição local dá o ponto de fixação e a caixa dá o raio. */
  private setupWheels(root: AbstractMesh, meshes: AbstractMesh[]): void {
    const rv = this.rv!;
    const def = this.def;
    this.anchor.computeWorldMatrix(true);
    const inv = this.anchor.getWorldMatrix().clone().invert();
    const mirrored = (root.scaling.x < 0) !== (root.scaling.z < 0);
    // o nó-contêiner da roda (TransformNode ou Mesh sem geometria) é o que gira; as primitivas são filhas
    const wheelNodes = root.getDescendants(false).filter((n): n is TransformNode => n instanceof TransformNode && /_WHEEL_/.test(n.name) && !/_WHEEL_/.test(n.parent?.name ?? ""));
    for (const m of wheelNodes) {
      m.computeWorldMatrix(true);
      const local = Vector3.TransformCoordinates(m.getAbsolutePosition(), inv);
      // raio = metade da altura da caixa envolvente da roda (contêiner + primitivas)
      const hb = m.getHierarchyBoundingVectors(true);
      const radius = (hb.max.y - hb.min.y) / 2;
      const isFront = local.z > 0.15;
      const w = rv.addWheel({
        chassisConnectionPointLocal: new Vector3(local.x, local.y + def.suspension.restLength, local.z),
        radius,
        suspensionRestLength: def.suspension.restLength,
        maxSuspensionTravel: def.suspension.travel,
        suspensionStiffness: def.suspension.stiffness,
        dampingCompression: def.suspension.dampingCompression,
        dampingRelaxation: def.suspension.dampingRelaxation,
        frictionSlip: def.suspension.frictionSlip,
        rollInfluence: def.suspension.rollInfluence,
        isFrontWheel: isFront,
        // tração: traseira nos carros/trike (dianteira só esterça)
        drive: !isFront,
        node: m,
        mirroredParent: mirrored,
      });
      this.wheels.push(w);
    }
    if (this.wheels.length === 0) console.warn(`[vehicle] ${def.id}: nenhuma malha *_WHEEL_* no GLB`);
  }

  /** Atualização por frame (antes do render): aplica comandos e efeitos visuais. */
  update(dt: number): void {
    const c = this.controls;
    if (this.rv) {
      const rv = this.rv;
      const speed = rv.currentSpeed;
      const limit = steerLimit(this.def.maxSteer, speed);
      const targetSteer = this.occupied ? c.steer * limit : 0;
      // esterço com inércia (volta ao centro sozinho)
      const rate = this.occupied && c.steer !== 0 ? 3.2 : 4.5;
      this.steering += (targetSteer - this.steering) * Math.min(1, rate * dt);
      const drive = this.occupied ? resolveDrive(c.throttle, speed, this.def) : { engine: 0, brake: 0 };
      const driven = this.wheels.filter((w) => w.drive);
      for (const [i, w] of this.wheels.entries()) {
        rv.setSteering(w.isFrontWheel ? this.steering : 0, i);
        rv.applyEngineForce(w.drive ? drive.engine / Math.max(1, driven.length) : 0, i);
        let brake = drive.brake / this.wheels.length;
        if (c.handbrake && this.occupied) brake = Math.max(brake, w.drive ? this.def.handbrakeForce / Math.max(1, driven.length) : brake);
        // sem motorista: freio de estacionamento
        if (!this.occupied) brake = Math.max(brake, this.def.brakeForce * 0.6);
        rv.setBrake(brake, i);
      }
    }
    if (this.hover) {
      const power = this.hover.rotorPower;
      for (const r of this.rotors) {
        r.rotation.y += dt * (4 + power * 40);
      }
    }
  }

  private physicsStep(): void {
    const dt = Math.min(0.1, Math.max(0.001, this.scene.getEngine().getDeltaTime() / 1000));
    if (this.rv) this.rv.update(dt);
    if (this.hover) {
      const c = this.controls;
      const hc: HoverControls | null = this.occupied ? { throttle: c.throttle, steer: c.steer, lift: c.lift, boost: c.boost } : null;
      this.hover.step(dt, hc);
      // cerca invisível horizontal: perto do chão, GROUND_FENCE_RADIUS do centro do quarteirão (o mundo
      // construído — o Setor 17 — acaba ali); quanto mais alto, mais largo o raio permitido — no céu não há teto nem cerca.
      const p = this.anchor.getAbsolutePosition();
      const dx = p.x - 0;
      const dz = p.z - 0;
      const r = Math.hypot(dx, dz);
      const rMax = GROUND_FENCE_RADIUS + Math.max(0, p.y - 80) * 0.6;
      if (r > rMax) {
        const k = Math.min(r - rMax, 60) * 1.5 * this.def.mass;
        this.body.applyImpulse(new Vector3((-dx / r) * k * dt, 0, (-dz / r) * k * dt), p);
        this.outOfBounds = true;
      } else this.outOfBounds = false;
    }
  }

  // --- estado -------------------------------------------------------------------------------
  /** velocidade frontal com sinal (m/s) */
  get speed(): number {
    if (this.rv) return this.rv.currentSpeed;
    if (this.hover) return this.hover.forwardSpeed;
    return 0;
  }

  get speedKmh(): number {
    return Math.abs(this.speed) * 3.6;
  }

  get position(): Vector3 {
    return this.anchor.getAbsolutePosition();
  }

  /** direção (yaw) do nariz do veículo */
  get heading(): number {
    const f = this.anchor.getDirection(new Vector3(0, 0, 1));
    return Math.atan2(f.x, f.z);
  }

  /** altura sobre o solo (m) — aeromoto */
  get altitude(): number {
    return this.hover?.groundHeight ?? 0;
  }

  /** altitude absoluta (m acima do nível da cidade) — aeromoto */
  get altitudeAbs(): number {
    return this.hover?.altitude ?? 0;
  }

  /** 0..1: ar disponível para os rotores (cai acima de 60 km) */
  get air(): number {
    return this.hover?.air ?? 1;
  }

  get isUpright(): boolean {
    const up = this.anchor.getDirection(Vector3.Up());
    return up.y > 0.4;
  }

  setLights(on: boolean): void {
    this.lightsOn = on;
    for (const l of this.headlights) l.setEnabled(on);
  }

  get lights(): boolean {
    return this.lightsOn;
  }

  /** Posição (mundo) onde o motorista desce: lado definido, ou o oposto se estiver bloqueado. */
  exitPosition(): Vector3 {
    const tryLocal = (local: Vector3): Vector3 | null => {
      const world = Vector3.TransformCoordinates(local, this.anchor.getWorldMatrix());
      // raio para baixo a partir de 1,2 m acima para encontrar o chão
      const from = new Vector3(world.x, world.y + 1.2, world.z);
      const to = new Vector3(world.x, world.y - 3, world.z);
      this.engine.raycastToRef(from, to, this.ray, { membership: COLLISION.PLAYER, collideWith: COLLISION.WORLD });
      if (!this.ray.hasHit) return null;
      // bloqueado por parede? raio horizontal do centro até o ponto
      const center = this.anchor.getAbsolutePosition().add(new Vector3(0, 1.0, 0));
      const target = new Vector3(world.x, this.ray.hitPointWorld.y + 1.0, world.z);
      this.engine.raycastToRef(center, target, this.ray, { membership: COLLISION.PLAYER, collideWith: COLLISION.WORLD });
      if (this.ray.hasHit) return null;
      return new Vector3(world.x, target.y - 1.0, world.z);
    };
    const e = this.def.exit;
    return tryLocal(e) ?? tryLocal(new Vector3(-e.x, e.y, e.z)) ?? tryLocal(new Vector3(0, 0, -(this.def.chassisSize.z / 2 + 1.2))) ?? this.anchor.getAbsolutePosition().add(new Vector3(e.x, 0, e.z));
  }

  /** Reposiciona o veículo (ex.: desvirar / reset de missão). */
  teleport(position: Vector3, yaw: number): void {
    this.body.disablePreStep = false;
    this.anchor.position.copyFrom(position);
    this.anchor.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), yaw);
    this.body.setLinearVelocity(Vector3.Zero());
    this.body.setAngularVelocity(Vector3.Zero());
    this.scene.onAfterPhysicsObservable?.addOnce(() => {
      this.body.disablePreStep = true;
    });
    if (this.hover) this.hover.setPowered(false);
  }

  // --- Interactable ---------------------------------------------------------------------------
  getPosition(): Vector3 {
    return this.anchor.getAbsolutePosition().add(new Vector3(0, 0.8, 0));
  }

  getPrompt(): string | null {
    if (this.occupied) return null;
    if (!this.isUpright) return null;
    return `Entrar: ${this.def.displayName}`;
  }

  interact(): void {
    this.onEnter?.(this);
  }

  dispose(): void {
    if (this.physicsObserver) this.scene.onBeforePhysicsObservable?.remove(this.physicsObserver);
    this.body.dispose();
    for (const l of this.headlights) l.dispose();
    this.anchor.dispose(false, true);
  }
}

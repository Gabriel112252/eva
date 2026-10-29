/**
 * Veículo por raios ("raycast vehicle") sobre o Havok: o chassi é um corpo rígido e cada roda é um
 * raio com mola/amortecedor; força de motor, freio e atrito lateral viram impulsos no ponto de contato.
 *
 * Adaptado para Babylon.js/Havok a partir do `RaycastVehicle` do cannon-es (MIT, Stefan Hedman e
 * colaboradores, https://github.com/pmndrs/cannon-es), por sua vez derivado do `btRaycastVehicle` do
 * Bullet Physics (zlib, Erwin Coumans). Mantida a estrutura: updateSuspension → updateFriction (círculo
 * de atrito por roda com massa efetiva) → integração das rodas visuais. Simplificações: o solo é sempre
 * estático (sem velocidade da superfície) e o atrito lateral/longitudinal usa a massa efetiva do chassi
 * no ponto de contato em vez do solver bilateral completo.
 */
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PhysicsRaycastResult } from "@babylonjs/core/Physics/physicsRaycastResult";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import type { PhysicsEngine } from "@babylonjs/core/Physics/v2/physicsEngine";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";

export interface WheelOptions {
  /** ponto de fixação da suspensão no chassi (local): centro da roda em repouso + comprimento da mola */
  chassisConnectionPointLocal: Vector3;
  /** direção do raio (local), normalmente (0,-1,0) */
  directionLocal?: Vector3;
  /** eixo da roda (local), normalmente (-1,0,0) ou (1,0,0) */
  axleLocal?: Vector3;
  radius: number;
  suspensionRestLength: number;
  /** curso máximo da suspensão (m) */
  maxSuspensionTravel?: number;
  suspensionStiffness?: number;
  dampingCompression?: number;
  dampingRelaxation?: number;
  frictionSlip?: number;
  /** 0..1: quanto o ponto de aplicação do atrito lateral desce (menos capotagem) */
  rollInfluence?: number;
  maxSuspensionForce?: number;
  isFrontWheel?: boolean;
  /** roda de tração */
  drive?: boolean;
  /** malha visual (opcional); gira e esterça */
  node?: TransformNode | null;
  /** o pai visual está espelhado em X (conversão do glTF): inverte o esterçamento visual */
  mirroredParent?: boolean;
}

export class WheelInfo {
  readonly chassisConnectionPointLocal: Vector3;
  readonly directionLocal: Vector3;
  readonly axleLocal: Vector3;
  readonly radius: number;
  readonly suspensionRestLength: number;
  readonly maxSuspensionTravel: number;
  readonly suspensionStiffness: number;
  readonly dampingCompression: number;
  readonly dampingRelaxation: number;
  readonly frictionSlip: number;
  readonly rollInfluence: number;
  readonly maxSuspensionForce: number;
  readonly isFrontWheel: boolean;
  readonly drive: boolean;
  readonly node: TransformNode | null;
  readonly mirroredParent: boolean;

  steering = 0;
  engineForce = 0;
  brake = 0;
  rotation = 0;
  deltaRotation = 0;
  /** comprimento atual da suspensão */
  suspensionLength: number;
  suspensionRelativeVelocity = 0;
  suspensionForce = 0;
  clippedInvContactDotSuspension = 1;
  isInContact = false;
  skidInfo = 1;
  sideImpulse = 0;
  forwardImpulse = 0;
  readonly contactPointWorld = new Vector3();
  readonly contactNormalWorld = new Vector3();
  readonly hardPointWorld = new Vector3();
  readonly directionWorld = new Vector3();
  readonly axleWorld = new Vector3();
  readonly forwardWorld = new Vector3();

  constructor(o: WheelOptions) {
    this.chassisConnectionPointLocal = o.chassisConnectionPointLocal.clone();
    this.directionLocal = (o.directionLocal ?? new Vector3(0, -1, 0)).clone();
    this.axleLocal = (o.axleLocal ?? new Vector3(-1, 0, 0)).clone();
    this.radius = o.radius;
    this.suspensionRestLength = o.suspensionRestLength;
    this.maxSuspensionTravel = o.maxSuspensionTravel ?? 0.3;
    this.suspensionStiffness = o.suspensionStiffness ?? 30;
    this.dampingCompression = o.dampingCompression ?? 4.4;
    this.dampingRelaxation = o.dampingRelaxation ?? 2.3;
    this.frictionSlip = o.frictionSlip ?? 3.0;
    this.rollInfluence = o.rollInfluence ?? 0.1;
    this.maxSuspensionForce = o.maxSuspensionForce ?? Number.MAX_VALUE;
    this.isFrontWheel = o.isFrontWheel ?? false;
    this.drive = o.drive ?? true;
    this.node = o.node ?? null;
    this.mirroredParent = o.mirroredParent ?? false;
    this.suspensionLength = o.suspensionRestLength;
  }
}

export interface RaycastVehicleOptions {
  /** máscara de colisão dos raios das rodas (solo e props estáticos; NÃO o próprio chassi) */
  raycastCollideWith: number;
  raycastMembership: number;
}

const tmpA = new Vector3();
const tmpB = new Vector3();
const tmpC = new Vector3();
const tmpD = new Vector3();
const tmpQ = new Quaternion();
const tmpM = new Matrix();

export class RaycastVehicle {
  readonly wheels: WheelInfo[] = [];
  private readonly ray = new PhysicsRaycastResult();
  private readonly chassisUp = new Vector3(0, 1, 0);
  /** velocidade (m/s) ao longo do eixo frontal do chassi — positiva para a frente */
  currentSpeed = 0;
  /** velocidade escalar no plano (m/s) */
  planarSpeed = 0;
  /** índice de slip médio das rodas de tração (0 = sem derrapagem) */
  skid = 0;
  /** soma dos rodízios para áudio/HUD */
  wheelsInContact = 0;

  constructor(
    readonly body: PhysicsBody,
    readonly chassis: TransformNode,
    private readonly engine: PhysicsEngine,
    private readonly opts: RaycastVehicleOptions,
  ) {}

  addWheel(options: WheelOptions): WheelInfo {
    const w = new WheelInfo(options);
    this.wheels.push(w);
    return w;
  }

  setSteering(value: number, wheelIndex: number): void {
    this.wheels[wheelIndex]!.steering = value;
  }

  applyEngineForce(value: number, wheelIndex: number): void {
    this.wheels[wheelIndex]!.engineForce = value;
  }

  setBrake(value: number, wheelIndex: number): void {
    this.wheels[wheelIndex]!.brake = value;
  }

  // ---------------------------------------------------------------------------------------------
  // Passo físico (chamar antes do passo do Havok, com o mesmo dt)
  // ---------------------------------------------------------------------------------------------
  update(dt: number): void {
    if (dt <= 0) return;
    const body = this.body;
    const rot = this.chassis.rotationQuaternion ?? Quaternion.Identity();
    const chassisPos = this.chassis.getAbsolutePosition();
    body.getLinearVelocityToRef(tmpA);
    this.chassis.getDirectionToRef(new Vector3(0, 0, 1), tmpB);
    this.currentSpeed = Vector3.Dot(tmpA, tmpB);
    this.planarSpeed = Math.hypot(tmpA.x, tmpA.z);
    this.chassis.getDirectionToRef(Vector3.UpReadOnly, this.chassisUp);

    // 1. raios das rodas
    this.wheelsInContact = 0;
    for (const w of this.wheels) {
      this.updateWheelTransformWorld(w, rot, chassisPos);
      this.castRay(w);
      if (w.isInContact) this.wheelsInContact++;
    }

    // 2. suspensão → impulso no ponto de contato
    const mass = body.getMassProperties().mass ?? 1;
    for (const w of this.wheels) {
      let force = 0;
      if (w.isInContact) {
        const compression = w.suspensionRestLength - w.suspensionLength;
        force = w.suspensionStiffness * compression * w.clippedInvContactDotSuspension;
        const projVel = w.suspensionRelativeVelocity;
        const damping = projVel < 0 ? w.dampingCompression : w.dampingRelaxation;
        force -= damping * projVel;
        force *= mass;
        if (force < 0) force = 0;
        if (force > w.maxSuspensionForce) force = w.maxSuspensionForce;
      }
      w.suspensionForce = force;
      if (force > 0) {
        tmpC.copyFrom(w.contactNormalWorld).scaleInPlace(force * dt);
        body.applyImpulse(tmpC, w.contactPointWorld);
      }
    }

    // 3. atrito (lateral e longitudinal) com círculo de atrito por roda
    this.updateFriction(dt);

    // 4. rodas visuais
    for (const w of this.wheels) {
      if (w.isInContact) {
        body.getLinearVelocityToRef(tmpA);
        this.velocityAtWorldPoint(w.contactPointWorld, tmpB);
        const fwdVel = Vector3.Dot(tmpB, w.forwardWorld);
        w.deltaRotation = (fwdVel * dt) / w.radius;
      } else {
        // no ar: mantém girando com atenuação
        w.deltaRotation *= 0.98;
      }
      w.rotation += w.deltaRotation;
      this.updateWheelNode(w);
    }

    // slip médio das rodas de tração
    let skid = 0;
    let n = 0;
    for (const w of this.wheels) {
      if (!w.drive) continue;
      skid += 1 - w.skidInfo;
      n++;
    }
    this.skid = n ? skid / n : 0;
  }

  private updateWheelTransformWorld(w: WheelInfo, rot: Quaternion, chassisPos: Vector3): void {
    w.chassisConnectionPointLocal.rotateByQuaternionToRef(rot, w.hardPointWorld);
    w.hardPointWorld.addInPlace(chassisPos);
    w.directionLocal.rotateByQuaternionToRef(rot, w.directionWorld);
    w.axleLocal.rotateByQuaternionToRef(rot, w.axleWorld);
    // esterçamento gira o eixo em torno da direção da suspensão
    if (w.steering !== 0) {
      Quaternion.RotationAxisToRef(w.directionWorld, -w.steering, tmpQ);
      w.axleWorld.rotateByQuaternionToRef(tmpQ, tmpA);
      w.axleWorld.copyFrom(tmpA);
    }
  }

  private castRay(w: WheelInfo): void {
    const rayLength = w.suspensionRestLength + w.radius + w.maxSuspensionTravel;
    tmpA.copyFrom(w.directionWorld).scaleInPlace(rayLength).addInPlace(w.hardPointWorld);
    this.engine.raycastToRef(w.hardPointWorld, tmpA, this.ray, { membership: this.opts.raycastMembership, collideWith: this.opts.raycastCollideWith });
    if (this.ray.hasHit) {
      const hitDist = Vector3.Distance(w.hardPointWorld, this.ray.hitPointWorld);
      w.isInContact = true;
      w.contactPointWorld.copyFrom(this.ray.hitPointWorld);
      w.contactNormalWorld.copyFrom(this.ray.hitNormalWorld);
      if (w.contactNormalWorld.lengthSquared() < 0.5) w.contactNormalWorld.set(0, 1, 0);
      let suspensionLength = hitDist - w.radius;
      const min = w.suspensionRestLength - w.maxSuspensionTravel;
      const max = w.suspensionRestLength + w.maxSuspensionTravel;
      suspensionLength = Math.max(min, Math.min(max, suspensionLength));
      w.suspensionLength = suspensionLength;
      const denominator = Vector3.Dot(w.contactNormalWorld, w.directionWorld);
      this.velocityAtWorldPoint(w.contactPointWorld, tmpB);
      const projVel = Vector3.Dot(w.contactNormalWorld, tmpB);
      if (denominator >= -0.1) {
        w.suspensionRelativeVelocity = 0;
        w.clippedInvContactDotSuspension = 10;
      } else {
        const inv = -1 / denominator;
        w.suspensionRelativeVelocity = projVel * inv;
        w.clippedInvContactDotSuspension = inv;
      }
    } else {
      w.isInContact = false;
      w.suspensionLength = w.suspensionRestLength + w.maxSuspensionTravel * 0.5;
      w.suspensionRelativeVelocity = 0;
      w.clippedInvContactDotSuspension = 1;
      w.contactNormalWorld.copyFrom(w.directionWorld).scaleInPlace(-1);
      w.contactPointWorld.copyFrom(tmpA);
    }
  }

  /** Centro de massa no mundo: posição do chassi + centro de massa local rotacionado. */
  private centerOfMassWorld(out: Vector3): void {
    const com = this.body.getMassProperties().centerOfMass;
    const rot = this.chassis.rotationQuaternion ?? Quaternion.Identity();
    if (com) com.rotateByQuaternionToRef(rot, out);
    else out.setAll(0);
    out.addInPlace(this.chassis.getAbsolutePosition());
  }

  /** v + ω × (p − c) */
  private velocityAtWorldPoint(point: Vector3, out: Vector3): void {
    this.body.getLinearVelocityToRef(out);
    this.body.getAngularVelocityToRef(tmpC);
    this.centerOfMassWorld(tmpD);
    tmpD.subtractInPlace(point).scaleInPlace(-1); // r = p - c
    Vector3.CrossToRef(tmpC, tmpD, tmpC);
    out.addInPlace(tmpC);
  }

  /**
   * Massa efetiva do chassi para um impulso na direção `dir` aplicado em `point`:
   * 1 / (1/m + (r×n)ᵀ I⁻¹ (r×n)), com I⁻¹ no espaço do mundo.
   */
  private effectiveMass(point: Vector3, dir: Vector3): number {
    const props = this.body.getMassProperties();
    const mass = props.mass ?? 1;
    // o Havok devolve a inércia por unidade de massa: tensor real = inércia × massa
    const inertia = (props.inertia ?? new Vector3(1, 1, 1)).scale(mass);
    const invMass = mass > 0 ? 1 / mass : 0;
    this.centerOfMassWorld(tmpD);
    const r = point.subtract(tmpD);
    const rxn = Vector3.Cross(r, dir);
    // leva r×n para o espaço do corpo (orientação da inércia), aplica I⁻¹ diagonal e volta
    const rot = this.chassis.rotationQuaternion ?? Quaternion.Identity();
    const inertiaRot = props.inertiaOrientation ? rot.multiply(props.inertiaOrientation) : rot;
    Matrix.FromQuaternionToRef(inertiaRot, tmpM);
    const inv = tmpM.clone().invert();
    const local = Vector3.TransformNormal(rxn, inv);
    const invI = new Vector3(inertia.x > 0 ? 1 / inertia.x : 0, inertia.y > 0 ? 1 / inertia.y : 0, inertia.z > 0 ? 1 / inertia.z : 0);
    const term = local.x * local.x * invI.x + local.y * local.y * invI.y + local.z * local.z * invI.z;
    const denom = invMass + term;
    return denom > 0 ? 1 / denom : mass;
  }

  private updateFriction(dt: number): void {
    const body = this.body;
    for (const w of this.wheels) {
      w.sideImpulse = 0;
      w.forwardImpulse = 0;
      w.skidInfo = 1;
      if (!w.isInContact) continue;
      // base do contato: eixo projetado no plano do contato e direção frontal
      const n = w.contactNormalWorld;
      const proj = Vector3.Dot(w.axleWorld, n);
      w.axleWorld.subtractInPlace(n.scale(proj)).normalize();
      Vector3.CrossToRef(n, w.axleWorld, w.forwardWorld);
      w.forwardWorld.normalize();

      this.velocityAtWorldPoint(w.contactPointWorld, tmpB);
      // lateral: anula a velocidade lateral relativa (solo estático) ponderada pela massa efetiva
      const sideVel = Vector3.Dot(tmpB, w.axleWorld);
      const mSide = this.effectiveMass(w.contactPointWorld, w.axleWorld);
      w.sideImpulse = -sideVel * mSide;

      // longitudinal: motor e freio
      const fwdVel = Vector3.Dot(tmpB, w.forwardWorld);
      const mFwd = this.effectiveMass(w.contactPointWorld, w.forwardWorld);
      let rollingFriction = 0;
      if (w.engineForce !== 0) {
        rollingFriction = w.engineForce * dt;
      } else {
        // freio: impulso que anula a velocidade frontal, limitado por brake·dt; sem freio, resistência de
        // rolamento (~1,5 % do peso sobre a roda) para o carro parar sozinho
        const resistance = w.brake > 0 ? w.brake : 0.015 * w.suspensionForce;
        const maxImpulse = resistance * dt;
        const impulse = -fwdVel * mFwd;
        rollingFriction = Math.max(-maxImpulse, Math.min(maxImpulse, impulse));
      }
      w.forwardImpulse = rollingFriction;

      // círculo de atrito: |impulso| ≤ μ · N · dt
      const maxImp = w.frictionSlip * w.suspensionForce * dt;
      const maxImpSide = maxImp;
      const x = w.forwardImpulse / maxImp;
      const y = w.sideImpulse / maxImpSide;
      const impulseSquared = x * x + y * y;
      if (impulseSquared > 1) {
        const factor = 1 / Math.sqrt(impulseSquared);
        w.skidInfo = factor;
        w.forwardImpulse *= factor;
        w.sideImpulse *= factor;
      }
      // aplica: frontal no ponto de contato; lateral com o ponto de aplicação elevado (rollInfluence)
      if (w.forwardImpulse !== 0) {
        tmpC.copyFrom(w.forwardWorld).scaleInPlace(w.forwardImpulse);
        body.applyImpulse(tmpC, w.contactPointWorld);
      }
      if (w.sideImpulse !== 0) {
        this.centerOfMassWorld(tmpD);
        // ponto de aplicação entre o contato e o centro de massa (reduz capotagem)
        tmpA.copyFrom(w.contactPointWorld);
        tmpA.y = tmpD.y - (tmpD.y - w.contactPointWorld.y) * w.rollInfluence;
        tmpC.copyFrom(w.axleWorld).scaleInPlace(w.sideImpulse);
        body.applyImpulse(tmpC, tmpA);
      }
    }
  }

  private updateWheelNode(w: WheelInfo): void {
    if (!w.node) return;
    // posição: ponto de fixação + direção × comprimento da suspensão (em coordenadas do pai visual)
    const parent = w.node.parent as TransformNode | null;
    tmpA.copyFrom(w.directionWorld).scaleInPlace(w.suspensionLength).addInPlace(w.hardPointWorld);
    if (parent) {
      parent.computeWorldMatrix(true);
      const inv = parent.getWorldMatrix().clone().invert();
      Vector3.TransformCoordinatesToRef(tmpA, inv, w.node.position);
    } else {
      w.node.position.copyFrom(tmpA);
    }
    const steer = w.mirroredParent ? -w.steering : w.steering;
    if (!w.node.rotationQuaternion) w.node.rotationQuaternion = Quaternion.Identity();
    Quaternion.RotationYawPitchRollToRef(steer, w.rotation, 0, w.node.rotationQuaternion);
  }
}

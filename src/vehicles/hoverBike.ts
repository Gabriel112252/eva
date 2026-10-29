/**
 * Controle de voo da aeromoto (Rastro AV-4): corpo rígido do Havok mantido no ar por empuxo vertical
 * com controle PD de altitude, empuxo frontal, guinada por velocidade angular e inclinação (pitch/roll)
 * derivada dos comandos. Inspirado no controlador do helicóptero do Sketchbook (swift502, MIT,
 * https://github.com/swift502/Sketchbook): o veículo define a velocidade angular diretamente a partir
 * dos comandos em vez de simular aerodinâmica.
 */
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PhysicsRaycastResult } from "@babylonjs/core/Physics/physicsRaycastResult";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import type { PhysicsEngine } from "@babylonjs/core/Physics/v2/physicsEngine";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { HoverDef } from "./vehicleDefs";

export interface HoverControls {
  /** -1..1 (trás/frente) */
  throttle: number;
  /** -1..1 (esquerda/direita) */
  steer: number;
  /** -1..1 (descer/subir) */
  lift: number;
  boost: boolean;
}

const tmpV = new Vector3();
const tmpV2 = new Vector3();
const tmpQ = new Quaternion();

export class HoverController {
  private readonly ray = new PhysicsRaycastResult();
  /** altitude alvo sobre o solo (mantida ao soltar os comandos verticais) */
  targetHeight: number;
  /** altura medida sobre o solo no último passo */
  groundHeight = 0;
  /** potência dos rotores 0..1 (para áudio e animação das hélices) */
  rotorPower = 0.3;
  /** velocidade frontal (m/s) */
  forwardSpeed = 0;
  /** ligado = sustentação ativa; desligado = cai/assenta no chão */
  powered = false;
  private yaw = 0;

  constructor(
    readonly body: PhysicsBody,
    readonly chassis: TransformNode,
    private readonly engine: PhysicsEngine,
    readonly def: HoverDef,
    private readonly rayMask: { membership: number; collideWith: number },
  ) {
    this.targetHeight = def.hoverHeight;
    const q = chassis.rotationQuaternion ?? Quaternion.Identity();
    this.yaw = q.toEulerAngles().y;
  }

  /** Passo (antes do passo do Havok). `controls` null = sem piloto. */
  step(dt: number, controls: HoverControls | null): void {
    const body = this.body;
    const mass = body.getMassProperties().mass ?? 1;
    const pos = this.chassis.getAbsolutePosition();
    // altura sobre o solo (raio para baixo a partir do centro)
    tmpV.set(pos.x, pos.y + 0.5, pos.z);
    tmpV2.set(pos.x, pos.y - 60, pos.z);
    this.engine.raycastToRef(tmpV, tmpV2, this.ray, this.rayMask);
    const groundY = this.ray.hasHit ? this.ray.hitPointWorld.y : pos.y - 60;
    this.groundHeight = pos.y - groundY;

    body.getLinearVelocityToRef(tmpV);
    const vel = tmpV.clone();
    this.chassis.getDirectionToRef(new Vector3(0, 0, 1), tmpV2);
    tmpV2.y = 0;
    tmpV2.normalize();
    const forward = tmpV2.clone();
    this.forwardSpeed = Vector3.Dot(vel, forward);

    if (!this.powered) {
      this.rotorPower = Math.max(0, this.rotorPower - dt * 0.6);
      return;
    }

    const c = controls ?? { throttle: 0, steer: 0, lift: 0, boost: false };
    // --- vertical: gravidade compensada + PD de altitude (ou comando direto de subir/descer)
    const g = 9.81;
    let ay: number;
    if (c.lift !== 0) {
      ay = g + c.lift * this.def.liftAccel - vel.y * 0.8;
      this.targetHeight = Math.max(0.6, Math.min(this.def.ceiling, this.groundHeight));
    } else {
      const err = this.targetHeight - this.groundHeight;
      ay = g + Math.max(-this.def.liftAccel, Math.min(this.def.liftAccel, err * 3.2)) - vel.y * 2.2;
    }
    if (this.groundHeight > this.def.ceiling && ay > g) ay = g - 1;
    // --- frontal: empuxo na direção do nariz + arrasto proporcional à velocidade
    const maxSpeed = c.boost ? this.def.maxSpeed * 1.35 : this.def.maxSpeed;
    const thrust = c.throttle * this.def.thrustAccel * (c.boost ? 1.5 : 1);
    const drag = this.def.thrustAccel / maxSpeed; // v_terminal = thrust/drag
    const horizontal = new Vector3(vel.x, 0, vel.z);
    const force = forward.scale(thrust * mass).subtractInPlace(horizontal.scale(drag * mass));
    // `ay` é a aceleração vertical total que os rotores devem produzir (já inclui compensar g)
    force.y = ay * mass;
    // impulso com o dt real do passo (applyForce do Havok usa o passo fixo de 1/60, não o dt do frame)
    body.applyImpulse(force.scaleInPlace(dt), pos.add(new Vector3(0, 0.4, 0)));

    // --- orientação: guinada pelos comandos; pitch/roll inclinam com aceleração e curva, com retorno ao nível
    this.yaw += c.steer * this.def.yawRate * dt;
    const pitch = -c.throttle * this.def.tiltMax * 0.8;
    const roll = -c.steer * this.def.tiltMax;
    Quaternion.RotationYawPitchRollToRef(this.yaw, pitch, roll, tmpQ);
    const current = this.chassis.rotationQuaternion ?? Quaternion.Identity();
    // velocidade angular que leva da orientação atual à desejada em ~0,25 s
    const delta = tmpQ.multiply(Quaternion.Inverse(current));
    if (delta.w < 0) delta.scaleInPlace(-1);
    const angle = 2 * Math.acos(Math.min(1, Math.abs(delta.w)));
    const s = Math.sqrt(Math.max(1e-9, 1 - delta.w * delta.w));
    const axis = new Vector3(delta.x / s, delta.y / s, delta.z / s);
    const angVel = angle > 1e-4 ? axis.scale(angle / 0.25) : Vector3.Zero();
    body.setAngularVelocity(angVel);

    const load = Math.abs(ay) / (g + this.def.liftAccel);
    this.rotorPower = Math.min(1, 0.45 + load * 0.4 + Math.abs(c.throttle) * 0.2);
  }

  /** Liga/desliga os rotores (ao entrar/sair). */
  setPowered(on: boolean): void {
    this.powered = on;
    if (on) this.targetHeight = Math.max(this.def.hoverHeight, this.groundHeight);
  }

  get heading(): number {
    return this.yaw;
  }
}

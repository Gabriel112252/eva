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

/** acima desta altura sobre o solo (m) o controle PD de altitude dá lugar ao voo livre */
export const FREE_FLIGHT_HEIGHT = 45;
/** altitude (m) em que os rotores começam a perder sustentação por falta de ar */
export const AIR_THIN_START = 60_000;
/** altitude (m) sem ar: nenhum empuxo (a aeromoto volta a cair) */
export const AIR_NONE = 100_000;

/** 1 ao nível do mar → 0 a 100 km: quanto os rotores ainda "mordem" o ar. */
export function airFactor(altitudeMeters: number): number {
  if (altitudeMeters <= AIR_THIN_START) return 1;
  return Math.max(0, 1 - (altitudeMeters - AIR_THIN_START) / (AIR_NONE - AIR_THIN_START));
}

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
  /** altitude absoluta (m acima do nível da cidade) no último passo */
  altitude = 0;
  /** true quando não há solo no alcance do raio: voo livre (sem manter altura) */
  freeFlight = false;
  /** 0..1: ar disponível para os rotores (cai acima de 60 km) */
  air = 1;
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
    tmpV2.set(pos.x, pos.y - (FREE_FLIGHT_HEIGHT + 15), pos.z);
    this.engine.raycastToRef(tmpV, tmpV2, this.ray, this.rayMask);
    // sem solo no alcance: o chão da região está em y≈0 (mundo plano) — altura = altitude
    const groundY = this.ray.hasHit ? this.ray.hitPointWorld.y : 0;
    this.groundHeight = pos.y - groundY;
    this.altitude = Math.max(0, pos.y);
    this.freeFlight = !this.ray.hasHit || this.groundHeight > FREE_FLIGHT_HEIGHT;
    this.air = airFactor(this.altitude);

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
    const g = 9.81;
    const boostMul = c.boost ? 2.2 : 1;
    // o ar rarefeito deixa o veículo mais rápido (menos arrasto) até os rotores perderem sustentação
    const speedScale = 1 + Math.min(14, this.altitude / 1500);
    let ay: number;
    if (!this.freeFlight) {
      // --- perto do solo: gravidade compensada + PD de altitude (ou comando direto de subir/descer)
      if (c.lift !== 0) {
        ay = g + c.lift * this.def.liftAccel * boostMul - vel.y * 0.8;
        this.targetHeight = Math.max(0.6, this.groundHeight);
      } else {
        const err = this.targetHeight - this.groundHeight;
        ay = g + Math.max(-this.def.liftAccel, Math.min(this.def.liftAccel, err * 3.2)) - vel.y * 2.2;
      }
    } else {
      // --- voo livre: o comando vertical pede uma velocidade de subida/descida; sem comando, pára de subir
      const climbMax = this.def.climbSpeed * boostMul * speedScale;
      const vTarget = c.lift * climbMax;
      const maxAccel = this.def.liftAccel * 3 * (c.boost ? 1.6 : 1);
      ay = g + Math.max(-maxAccel, Math.min(maxAccel, (vTarget - vel.y) * 0.9));
      this.targetHeight = this.groundHeight;
    }
    // sem ar não há sustentação: acima de ~60 km o empuxo cai até zero (volta a cair a 100 km)
    ay *= this.air;
    // --- frontal: empuxo na direção do nariz + arrasto proporcional à velocidade
    const maxSpeed = (c.boost ? this.def.maxSpeed * 1.35 : this.def.maxSpeed) * speedScale;
    const thrust = c.throttle * this.def.thrustAccel * (c.boost ? 1.5 : 1) * Math.min(8, speedScale) * this.air;
    const drag = (this.def.thrustAccel * Math.min(8, speedScale)) / maxSpeed; // v_terminal = thrust/drag
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

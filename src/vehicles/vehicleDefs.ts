import { Vector3 } from "@babylonjs/core/Maths/math.vector";

export type VehicleId = "javali_vb4" | "atlas_t3" | "modulo_v7" | "rastro_av4";
export type VehicleKind = "car" | "trike" | "hover";

export interface SuspensionDef {
  restLength: number;
  stiffness: number;
  dampingCompression: number;
  dampingRelaxation: number;
  travel: number;
  frictionSlip: number;
  rollInfluence: number;
}

export interface HoverDef {
  /** altitude de cruzeiro acima do solo (m) quando sem comando vertical */
  hoverHeight: number;
  /** empuxo vertical máximo além do peso (m/s²) */
  liftAccel: number;
  /** aceleração frontal (m/s²) */
  thrustAccel: number;
  /** velocidade máxima (m/s) */
  maxSpeed: number;
  /** velocidade angular de guinada (rad/s) */
  yawRate: number;
  /** inclinação visual máxima (rad) ao acelerar/virar */
  tiltMax: number;
  /** velocidade vertical (m/s) pedida pelo comando de subir/descer em voo livre (cresce com a altitude) */
  climbSpeed: number;
}

export interface VehicleDef {
  id: VehicleId;
  displayName: string;
  kind: VehicleKind;
  mass: number;
  /** caixa de colisão do chassi (local: origem no chão, frente +Z) */
  chassisCenter: Vector3;
  chassisSize: Vector3;
  /** centro de massa (local) — baixo para estabilidade */
  centerOfMass: Vector3;
  suspension: SuspensionDef;
  /** força de motor total (N) distribuída pelas rodas de tração */
  engineForce: number;
  brakeForce: number;
  handbrakeForce: number;
  maxSpeed: number; // m/s
  maxReverseSpeed: number;
  maxSteer: number; // rad
  /** banco do motorista (local): onde ficam os pés de Matias sentado; o clipe de animação decide a pose */
  seat: Vector3;
  driverClip: "Driving" | "Sit";
  /** ponto de saída (local) */
  exit: Vector3;
  camera: { distance: number; height: number; pitch: number };
  headlights: Vector3[];
  hover?: HoverDef;
  /** descrição curta para o HUD */
  tagline: string;
}

const SUSP_HEAVY: SuspensionDef = { restLength: 0.28, stiffness: 32, dampingCompression: 4.6, dampingRelaxation: 3.2, travel: 0.22, frictionSlip: 2.6, rollInfluence: 0.08 };
const SUSP_VAN: SuspensionDef = { restLength: 0.26, stiffness: 30, dampingCompression: 4.4, dampingRelaxation: 3.0, travel: 0.2, frictionSlip: 2.4, rollInfluence: 0.1 };
const SUSP_TRIKE: SuspensionDef = { restLength: 0.12, stiffness: 40, dampingCompression: 5.0, dampingRelaxation: 3.5, travel: 0.1, frictionSlip: 2.2, rollInfluence: 0.3 };

export const VEHICLE_DEFS: Record<VehicleId, VehicleDef> = {
  javali_vb4: {
    id: "javali_vb4",
    displayName: "Javali VB-4",
    tagline: "viatura blindada dos Custódios",
    kind: "car",
    mass: 2400,
    chassisCenter: new Vector3(0, 1.25, 0),
    chassisSize: new Vector3(2.0, 1.55, 4.55),
    centerOfMass: new Vector3(0, 0.55, 0.05),
    suspension: SUSP_HEAVY,
    engineForce: 14000,
    brakeForce: 9000,
    handbrakeForce: 16000,
    maxSpeed: 22,
    maxReverseSpeed: 6,
    maxSteer: 0.55,
    seat: new Vector3(0.4, 0.45, 0.1),
    driverClip: "Driving",
    exit: new Vector3(1.9, 0, 0.1),
    camera: { distance: 8.5, height: 2.4, pitch: 0.22 },
    headlights: [new Vector3(-0.74, 1.0, 2.35), new Vector3(0.74, 1.0, 2.35)],
  },
  modulo_v7: {
    id: "modulo_v7",
    displayName: "Módulo V-7",
    tagline: "van de suprimentos",
    kind: "car",
    mass: 2100,
    chassisCenter: new Vector3(0, 1.45, 0),
    chassisSize: new Vector3(1.9, 1.95, 5.1),
    centerOfMass: new Vector3(0, 0.6, 0.0),
    suspension: SUSP_VAN,
    engineForce: 11000,
    brakeForce: 8000,
    handbrakeForce: 14000,
    maxSpeed: 19,
    maxReverseSpeed: 5,
    maxSteer: 0.5,
    seat: new Vector3(0.45, 0.6, 1.6),
    driverClip: "Driving",
    exit: new Vector3(1.9, 0, 1.4),
    camera: { distance: 9.5, height: 2.8, pitch: 0.22 },
    headlights: [new Vector3(-0.73, 1.13, 2.62), new Vector3(0.73, 1.13, 2.62)],
  },
  atlas_t3: {
    id: "atlas_t3",
    displayName: "Atlas T-3",
    tagline: "triciclo de carga",
    kind: "trike",
    mass: 260,
    chassisCenter: new Vector3(0, 0.75, -0.2),
    chassisSize: new Vector3(1.2, 1.0, 2.6),
    centerOfMass: new Vector3(0, 0.35, -0.3),
    suspension: SUSP_TRIKE,
    engineForce: 1400,
    brakeForce: 900,
    handbrakeForce: 1500,
    maxSpeed: 7.5,
    maxReverseSpeed: 2,
    maxSteer: 0.6,
    seat: new Vector3(0, 0.62, 0.16),
    driverClip: "Sit",
    exit: new Vector3(1.2, 0, 0.1),
    camera: { distance: 6, height: 1.9, pitch: 0.25 },
    headlights: [new Vector3(0, 1.1, 1.18)],
  },
  rastro_av4: {
    id: "rastro_av4",
    displayName: "Rastro AV-4",
    tagline: "aeromoto de patrulha",
    kind: "hover",
    mass: 420,
    chassisCenter: new Vector3(0, 0.65, 0),
    chassisSize: new Vector3(2.6, 1.0, 2.7),
    centerOfMass: new Vector3(0, 0.4, 0),
    suspension: SUSP_TRIKE,
    engineForce: 0,
    brakeForce: 0,
    handbrakeForce: 0,
    maxSpeed: 26,
    maxReverseSpeed: 6,
    maxSteer: 0,
    seat: new Vector3(0, 0.75, -0.39),
    driverClip: "Sit",
    exit: new Vector3(1.8, 0, -0.3),
    camera: { distance: 9, height: 2.6, pitch: 0.2 },
    headlights: [new Vector3(0, 0.75, 1.36)],
    hover: { hoverHeight: 2.2, liftAccel: 9, thrustAccel: 13, maxSpeed: 30, yawRate: 2.2, tiltMax: 0.35, climbSpeed: 14 },
  },
};

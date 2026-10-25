import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { SpotLight } from "@babylonjs/core/Lights/spotLight";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { WorldContext } from "./context";
import { placeSign } from "./signage";

function rnd(seed: number, i: number): number {
  const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

// ---------------------------------------------------------------------------
// Vegetação
// ---------------------------------------------------------------------------
export function tree(ctx: WorldContext, id: string, pos: Vector3, scale = 1, seed = 1): void {
  const { mats } = ctx;
  const h = 3.2 * scale;
  ctx.cylinder(`${id}_tronco`, { height: h, diameterTop: 0.28 * scale, diameterBottom: 0.45 * scale, tessellation: 9 }, new Vector3(pos.x, pos.y + h / 2, pos.z), mats.bark, { collider: true });
  // galhos
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + rnd(seed, k) * 0.8;
    ctx.cylinder(`${id}_galho_${k}`, { height: 1.6 * scale, diameterTop: 0.08 * scale, diameterBottom: 0.16 * scale, tessellation: 6 }, new Vector3(pos.x + Math.cos(a) * 0.5 * scale, pos.y + h - 0.2 * scale, pos.z + Math.sin(a) * 0.5 * scale), mats.bark, {
      rotation: new Vector3(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9),
      shadow: false,
    });
  }
  // copa: três elipsoides com folhas em alpha-test
  const crown = [
    [0, 0.2, 0, 2.2],
    [0.9, -0.3, 0.5, 1.6],
    [-0.8, -0.1, -0.6, 1.7],
    [0.2, 0.9, -0.4, 1.4],
  ] as const;
  for (let k = 0; k < crown.length; k++) {
    const [dx, dy, dz, r] = crown[k]!;
    const m = MeshBuilder.CreateSphere(`${id}_copa_${k}`, { diameter: r * 2 * scale, segments: 7 }, ctx.scene);
    m.position.set(pos.x + dx * scale, pos.y + h + 0.6 * scale + dy * scale, pos.z + dz * scale);
    m.scaling.set(1, 0.72, 1);
    m.rotation.y = rnd(seed, 10 + k) * Math.PI;
    m.material = mats.leaves;
    ctx.register(m, true, true);
  }
}

export function grassTuft(ctx: WorldContext, id: string, pos: Vector3, size = 0.5, seed = 1): void {
  const yaw = rnd(seed, 1) * Math.PI;
  for (let k = 0; k < 2; k++) {
    ctx.plane(`${id}_${k}`, { w: size, h: size * 0.8 }, new Vector3(pos.x, pos.y + size * 0.4, pos.z), ctx.mats.grass, {
      rotation: new Vector3(0, yaw + (k * Math.PI) / 2, 0),
      sideOrientation: 2,
    });
  }
}

// ---------------------------------------------------------------------------
// Iluminação pública
// ---------------------------------------------------------------------------
export function streetLamp(ctx: WorldContext, id: string, pos: Vector3, facingX: number, state: "on" | "off" | "flicker", opts: { model?: boolean } = {}): void {
  const { mats } = ctx;
  if (!opts.model) {
    ctx.cylinder(`${id}_poste`, { height: 6.5, diameterTop: 0.12, diameterBottom: 0.2, tessellation: 8 }, new Vector3(pos.x, 3.25, pos.z), mats.metalPainted, { collider: true });
    ctx.box(`${id}_braco`, { w: 1.6, h: 0.08, d: 0.08 }, new Vector3(pos.x + facingX * 0.7, 6.4, pos.z), mats.metalPainted, { shadow: false });
    ctx.box(`${id}_luminaria`, { w: 0.6, h: 0.18, d: 0.3 }, new Vector3(pos.x + facingX * 1.5, 6.3, pos.z), mats.metalDark);
  }
  if (state !== "off") {
    // com `model`, o poste/braço/luminária vêm do GLB poste_luz (heroAssets.ts) e o brilho fica rente ao vidro (6,36 m)
    const glowY = opts.model ? 6.33 : 6.2;
    const glow = ctx.box(`${id}_lampada`, { w: 0.5, h: 0.04, d: 0.22 }, new Vector3(pos.x + facingX * 1.5, glowY, pos.z), mats.lampGlow, { batch: false, shadow: false });
    const light = new SpotLight(`${id}_luz`, new Vector3(pos.x + facingX * 1.5, 6.15, pos.z), new Vector3(0, -1, 0), Math.PI * 0.75, 2, ctx.scene);
    light.diffuse = new Color3(1.0, 0.78, 0.5);
    light.intensity = state === "flicker" ? 12 : 16;
    light.range = 14;
    light.metadata = { flicker: state === "flicker", glow, base: light.intensity };
    if (state === "flicker") ctx.emitters.push({ kind: "flicker", position: light.position.clone(), radius: 8, volume: 0.35 });
  }
}

// ---------------------------------------------------------------------------
// Objetos de rua
// ---------------------------------------------------------------------------
export function crateStack(ctx: WorldContext, id: string, pos: Vector3, count: number, seed: number, dynamic = false): void {
  const { mats } = ctx;
  for (let i = 0; i < count; i++) {
    const s = 0.55 + rnd(seed, i) * 0.25;
    const x = pos.x + (rnd(seed, i + 10) - 0.5) * 0.4;
    const z = pos.z + (rnd(seed, i + 20) - 0.5) * 0.4;
    const y = pos.y + s / 2 + i * s;
    if (dynamic && i === count - 1) {
      const m = MeshBuilder.CreateBox(`${id}_caixa_dyn_${i}`, { size: s }, ctx.scene);
      m.position.set(x, y + 0.02, z);
      m.material = mats.wood;
      ctx.dynamicBox(m, { w: s, h: s, d: s }, 6);
    } else {
      ctx.box(`${id}_caixa_${i}`, { w: s, h: s, d: s }, new Vector3(x, y, z), mats.wood, { rotationY: rnd(seed, i + 30) * 0.6, collider: true });
    }
  }
}

export function barrel(ctx: WorldContext, id: string, pos: Vector3, kind: "plastic" | "rust", dynamic = false): void {
  const mat = kind === "plastic" ? ctx.mats.plasticBlue : ctx.mats.metalRust;
  if (dynamic) {
    const m = MeshBuilder.CreateCylinder(`${id}`, { height: 0.9, diameter: 0.58, tessellation: 12 }, ctx.scene);
    m.position.set(pos.x, pos.y + 0.46, pos.z);
    m.material = mat;
    ctx.dynamicBox(m, { w: 0.56, h: 0.9, d: 0.56 }, 12);
    return;
  }
  ctx.cylinder(`${id}`, { height: 0.9, diameter: 0.58, tessellation: 12 }, new Vector3(pos.x, pos.y + 0.45, pos.z), mat, { collider: true });
  if (kind === "plastic") ctx.cylinder(`${id}_tampa`, { height: 0.04, diameter: 0.5, tessellation: 12 }, new Vector3(pos.x, pos.y + 0.92, pos.z), ctx.mats.metalDark, { shadow: false });
}

export function tirePile(ctx: WorldContext, id: string, pos: Vector3, count: number, seed: number): void {
  for (let i = 0; i < count; i++) {
    const m = MeshBuilder.CreateTorus(`${id}_pneu_${i}`, { diameter: 0.65, thickness: 0.2, tessellation: 14 }, ctx.scene);
    m.position.set(pos.x + (rnd(seed, i) - 0.5) * 0.2, pos.y + 0.1 + i * 0.2, pos.z + (rnd(seed, i + 5) - 0.5) * 0.2);
    m.rotation.y = rnd(seed, i + 9) * Math.PI;
    m.material = ctx.mats.rubber;
    ctx.register(m, true, true);
  }
  ctx.staticCylinderCollider(`${id}`, 0.36, count * 0.2 + 0.1, new Vector3(pos.x, pos.y + (count * 0.2 + 0.1) / 2, pos.z));
}

export function bench(ctx: WorldContext, id: string, pos: Vector3, yaw: number): void {
  const { mats } = ctx;
  const dir = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  for (let k = 0; k < 4; k++) {
    const off = (k - 1.5) * 0.11;
    ctx.box(`${id}_ripa_${k}`, { w: 1.8, h: 0.04, d: 0.09 }, new Vector3(pos.x - dir.z * off, pos.y + 0.46, pos.z + dir.x * off), mats.wood, { rotationY: yaw, shadow: false });
  }
  for (const side of [-0.75, 0.75]) {
    ctx.box(`${id}_pe_${side}`, { w: 0.08, h: 0.44, d: 0.44 }, new Vector3(pos.x + dir.x * side, pos.y + 0.22, pos.z + dir.z * side), mats.concrete, { rotationY: yaw, shadow: false });
  }
  ctx.staticBoxCollider(`${id}`, { w: 1.8, h: 0.5, d: 0.5 }, new Vector3(pos.x, pos.y + 0.25, pos.z), new Vector3(0, yaw, 0), false);
}

export function bollards(ctx: WorldContext, id: string, from: Vector3, to: Vector3, count: number): void {
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const p = Vector3.Lerp(from, to, t);
    ctx.cylinder(`${id}_${i}`, { height: 0.9, diameter: 0.2, tessellation: 8 }, new Vector3(p.x, p.y + 0.45, p.z), ctx.mats.concrete, { collider: true });
  }
}

/** Barreira de fila: postes metálicos ligados por corda. */
export function queueBarrier(ctx: WorldContext, id: string, points: Vector3[]): void {
  const { mats } = ctx;
  points.forEach((p, i) => {
    ctx.cylinder(`${id}_poste_${i}`, { height: 1.0, diameter: 0.07, tessellation: 8 }, new Vector3(p.x, p.y + 0.5, p.z), mats.metalDark, { collider: true });
    ctx.cylinder(`${id}_base_${i}`, { height: 0.04, diameter: 0.34, tessellation: 10 }, new Vector3(p.x, p.y + 0.02, p.z), mats.metalDark, { shadow: false });
    if (i > 0) {
      const a = points[i - 1]!;
      const mid = Vector3.Lerp(a, p, 0.5);
      const len = Vector3.Distance(a, p);
      const yaw = Math.atan2(p.x - a.x, p.z - a.z);
      ctx.box(`${id}_corda_${i}`, { w: 0.03, h: 0.03, d: len }, new Vector3(mid.x, mid.y + 0.9, mid.z), mats.rope, { rotationY: yaw, shadow: false });
      ctx.staticBoxCollider(`${id}_corda_col_${i}`, { w: 0.05, h: 1.0, d: len }, new Vector3(mid.x, mid.y + 0.5, mid.z), new Vector3(0, yaw, 0), false);
    }
  });
}

export function rubblePile(ctx: WorldContext, id: string, pos: Vector3, pieces: number, seed: number, spread = 1.5): void {
  const { mats } = ctx;
  for (let i = 0; i < pieces; i++) {
    const w = 0.4 + rnd(seed, i) * 0.9;
    const h = 0.2 + rnd(seed, i + 1) * 0.5;
    const d = 0.4 + rnd(seed, i + 2) * 0.9;
    const x = pos.x + (rnd(seed, i + 3) - 0.5) * spread * 2;
    const z = pos.z + (rnd(seed, i + 4) - 0.5) * spread * 2;
    ctx.box(`${id}_${i}`, { w, h, d }, new Vector3(x, pos.y + h / 2 - 0.05 + rnd(seed, i + 7) * 0.25, z), i % 3 === 0 ? mats.burnt : mats.concrete, {
      rotation: new Vector3((rnd(seed, i + 5) - 0.5) * 0.5, rnd(seed, i + 6) * Math.PI, (rnd(seed, i + 8) - 0.5) * 0.5),
      collider: true,
      cameraBlocker: false,
    });
  }
}

/** Carcaça de carro queimado (abandono, não bomba). */
export function burntCar(ctx: WorldContext, id: string, pos: Vector3, yaw: number): void {
  const { mats } = ctx;
  ctx.box(`${id}_chassi`, { w: 1.8, h: 0.55, d: 4.2 }, new Vector3(pos.x, pos.y + 0.5, pos.z), mats.burnt, { rotationY: yaw, collider: true });
  ctx.box(`${id}_cabine`, { w: 1.6, h: 0.6, d: 2.3 }, new Vector3(pos.x, pos.y + 1.05, pos.z - Math.cos(yaw) * 0.2), mats.burnt, { rotationY: yaw, collider: true });
  for (const [sx, sz] of [[-0.9, 1.35], [0.9, 1.35], [-0.9, -1.35], [0.9, -1.35]] as Array<[number, number]>) {
    const lx = pos.x + sx * Math.cos(yaw) + sz * Math.sin(yaw);
    const lz = pos.z - sx * Math.sin(yaw) + sz * Math.cos(yaw);
    const m = MeshBuilder.CreateTorus(`${id}_roda_${sx}_${sz}`, { diameter: 0.6, thickness: 0.22, tessellation: 12 }, ctx.scene);
    m.position.set(lx, pos.y + 0.3, lz);
    m.rotation.set(Math.PI / 2, yaw, Math.PI / 2);
    m.material = mats.rubber;
    ctx.register(m, true, true);
  }
}

/** Gerador a combustível com cabos: fonte de energia local (zumbido espacializado). */
export function generator(ctx: WorldContext, id: string, pos: Vector3, yaw: number): void {
  const { mats } = ctx;
  ctx.box(`${id}_corpo`, { w: 1.6, h: 1.0, d: 0.9 }, new Vector3(pos.x, pos.y + 0.5, pos.z), mats.metalPainted, { rotationY: yaw, collider: true });
  ctx.box(`${id}_tampa`, { w: 1.5, h: 0.08, d: 0.8 }, new Vector3(pos.x, pos.y + 1.04, pos.z), mats.metalDark, { rotationY: yaw });
  ctx.cylinder(`${id}_escape`, { height: 0.6, diameter: 0.12, tessellation: 8 }, new Vector3(pos.x + Math.cos(yaw) * 0.6, pos.y + 1.3, pos.z - Math.sin(yaw) * 0.6), mats.metalRust, { shadow: false });
  ctx.box(`${id}_led`, { w: 0.08, h: 0.08, d: 0.03 }, new Vector3(pos.x - Math.sin(yaw) * 0.47, pos.y + 0.8, pos.z - Math.cos(yaw) * 0.47), mats.emissiveGreen, { batch: false, shadow: false });
  // cabos até o poste mais próximo
  ctx.cylinder(`${id}_cabo`, { height: 6, diameter: 0.04, tessellation: 5 }, new Vector3(pos.x, pos.y + 0.6, pos.z + 3), mats.rubber, { rotation: new Vector3(Math.PI / 2 - 0.08, 0, 0), shadow: false });
  ctx.emitters.push({ kind: "generator", position: new Vector3(pos.x, pos.y + 0.6, pos.z), radius: 18, volume: 0.55 });
}

/** Barraca de mercado com lona, bancada e caixotes de produtos. */
export function marketStall(ctx: WorldContext, id: string, pos: Vector3, yaw: number, title: string): void {
  const { mats } = ctx;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const local = (x: number, z: number) => new Vector3(pos.x + x * c + z * s, pos.y, pos.z - x * s + z * c);
  // bancada
  const b = local(0, 0);
  ctx.box(`${id}_bancada`, { w: 3.0, h: 0.9, d: 0.9 }, new Vector3(b.x, pos.y + 0.45, b.z), mats.wood, { rotationY: yaw, collider: true });
  // postes e lona
  for (const [x, z] of [[-1.4, -0.6], [1.4, -0.6], [-1.4, 0.9], [1.4, 0.9]] as Array<[number, number]>) {
    const p = local(x, z);
    ctx.cylinder(`${id}_poste_${x}_${z}`, { height: 2.4, diameter: 0.07, tessellation: 6 }, new Vector3(p.x, pos.y + 1.2, p.z), mats.metalRust, { shadow: false });
  }
  const roof = local(0, 0.15);
  ctx.box(`${id}_lona`, { w: 3.4, h: 0.04, d: 2.0 }, new Vector3(roof.x, pos.y + 2.45, roof.z), mats.tarpBlue, { rotation: new Vector3(0.12, yaw, 0) });
  // produtos: caixotes com cores de legumes/raízes
  const produce = ["#c9a227", "#7a4a2b", "#5e8a3a", "#b8552b", "#d8cfbf"];
  for (let i = 0; i < 5; i++) {
    const p = local(-1.1 + i * 0.55, 0.05);
    ctx.box(`${id}_caixote_${i}`, { w: 0.48, h: 0.25, d: 0.48 }, new Vector3(p.x, pos.y + 1.02, p.z), mats.wood, { rotationY: yaw, shadow: false });
    const m = MeshBuilder.CreateBox(`${id}_produto_${i}`, { width: 0.4, height: 0.16, depth: 0.4 }, ctx.scene);
    m.position.set(p.x, pos.y + 1.18, p.z);
    m.rotation.y = yaw;
    const mat = mats.plasticBlue.clone(`${id}_produto_mat_${i}`);
    mat.albedoColor = Color3.FromHexString(produce[i]!).toLinearSpace();
    mat.roughness = 0.9;
    m.material = mat;
    ctx.register(m, false, true);
  }
  // placa
  const sp = local(0, -0.6);
  placeSign(ctx, `${id}_placa`, { bg: "#2f3a33", fg: "#e8dcc0", lines: [title], weathered: 0.35, seed: 5, border: "#b89036" }, {
    position: new Vector3(sp.x, pos.y + 2.1, sp.z),
    yaw: yaw + Math.PI,
    width: 2.6,
    height: 0.5,
    double: true,
  });
  // balança antiga e sacos
  const sc = local(1.2, 0.1);
  ctx.box(`${id}_balanca`, { w: 0.3, h: 0.35, d: 0.3 }, new Vector3(sc.x, pos.y + 1.08, sc.z), mats.metalDark, { shadow: false });
  for (let i = 0; i < 3; i++) {
    const p = local(-1.3 + i * 0.5, 1.2);
    ctx.box(`${id}_saco_${i}`, { w: 0.5, h: 0.4, d: 0.35 }, new Vector3(p.x, pos.y + 0.2, p.z), mats.tarpOlive, { rotationY: yaw + rnd(3, i) * 0.4, collider: true, cameraBlocker: false });
  }
}

/** Varal de roupas cruzando a rua entre dois prédios. */
export function clothesline(ctx: WorldContext, id: string, from: Vector3, to: Vector3, seed: number): void {
  const { mats } = ctx;
  const mid = Vector3.Lerp(from, to, 0.5);
  const len = Vector3.Distance(from, to);
  const yaw = Math.atan2(to.x - from.x, to.z - from.z);
  ctx.box(`${id}_corda`, { w: 0.025, h: 0.025, d: len }, new Vector3(mid.x, mid.y - 0.25, mid.z), mats.rope, { rotationY: yaw, shadow: false });
  const cloth = [mats.tarpBlue, mats.tarpOlive, mats.paperWhite, mats.tarpOrange, mats.paperWhite];
  const n = Math.floor(len / 1.4);
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n;
    const p = Vector3.Lerp(from, to, t);
    const sag = Math.sin(t * Math.PI) * 0.35;
    ctx.plane(`${id}_roupa_${k}`, { w: 0.55 + rnd(seed, k) * 0.3, h: 0.7 + rnd(seed, k + 3) * 0.5 }, new Vector3(p.x, p.y - 0.25 - sag - 0.4, p.z), cloth[k % cloth.length]!, {
      rotation: new Vector3(0, yaw + Math.PI / 2, (rnd(seed, k + 9) - 0.5) * 0.2),
      sideOrientation: 2,
      shadow: true,
    });
  }
}

/** Cabos elétricos improvisados entre pontos (energia parcial do bairro). */
export function cable(ctx: WorldContext, id: string, from: Vector3, to: Vector3): void {
  const mid = Vector3.Lerp(from, to, 0.5);
  const len = Vector3.Distance(from, to);
  const yaw = Math.atan2(to.x - from.x, to.z - from.z);
  const pitch = -Math.asin((to.y - from.y) / len);
  ctx.box(`${id}`, { w: 0.03, h: 0.03, d: len }, new Vector3(mid.x, mid.y - 0.15, mid.z), ctx.mats.rubber, { rotation: new Vector3(pitch, yaw, 0), shadow: false });
}

/** Fonte seca com lodo no fundo (praça sem manutenção). */
export function dryFountain(ctx: WorldContext, id: string, pos: Vector3): void {
  const { mats } = ctx;
  ctx.cylinder(`${id}_borda`, { height: 0.6, diameter: 6.2, tessellation: 24 }, new Vector3(pos.x, pos.y + 0.3, pos.z), mats.concrete, { collider: true });
  ctx.cylinder(`${id}_fundo`, { height: 0.5, diameter: 5.6, tessellation: 24 }, new Vector3(pos.x, pos.y + 0.36, pos.z), mats.soil, { shadow: false });
  ctx.cylinder(`${id}_lodo`, { height: 0.02, diameter: 3.4, tessellation: 20 }, new Vector3(pos.x, pos.y + 0.62, pos.z), mats.puddle, { shadow: false });
  ctx.cylinder(`${id}_centro`, { height: 1.6, diameterTop: 0.5, diameterBottom: 0.9, tessellation: 12 }, new Vector3(pos.x, pos.y + 1.1, pos.z), mats.concrete, { collider: true });
  for (let k = 0; k < 5; k++) grassTuft(ctx, `${id}_mato_${k}`, new Vector3(pos.x + Math.cos(k * 1.3) * 2.2, pos.y + 0.6, pos.z + Math.sin(k * 1.3) * 2.2), 0.5, k + 20);
}

/** Quadro de avisos de madeira com cartazes. */
export function noticeBoard(ctx: WorldContext, id: string, pos: Vector3, yaw: number, posters: Array<{ lines: string[]; bg: string; fg: string }>): void {
  const { mats } = ctx;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  ctx.box(`${id}_quadro`, { w: 2.6, h: 1.6, d: 0.08 }, new Vector3(pos.x, pos.y + 1.6, pos.z), mats.woodDark, { rotationY: yaw, collider: true });
  for (const dx of [-1.1, 1.1]) {
    ctx.cylinder(`${id}_pe_${dx}`, { height: 2.4, diameter: 0.09, tessellation: 6 }, new Vector3(pos.x + dx * c, pos.y + 1.2, pos.z - dx * s), mats.woodDark);
  }
  ctx.box(`${id}_telhado`, { w: 2.9, h: 0.05, d: 0.5 }, new Vector3(pos.x, pos.y + 2.45, pos.z), mats.metalRust, { rotation: new Vector3(0.2, yaw, 0) });
  posters.forEach((p, i) => {
    const dx = -0.8 + i * 0.8;
    placeSign(ctx, `${id}_cartaz_${i}`, { bg: p.bg, fg: p.fg, lines: p.lines, weathered: 0.15, seed: i + 1, pxWidth: 512 }, {
      position: new Vector3(pos.x + dx * c - s * 0.05, pos.y + 1.62 + (i % 2) * 0.05, pos.z - dx * s - c * 0.05),
      yaw: yaw + Math.PI,
      width: 0.7,
      height: 0.95,
    });
  });
}

/** Estandarte da Igreja da Continuidade: tecido claro com círculo dourado. */
export function churchBanner(ctx: WorldContext, id: string, pos: Vector3, yaw: number): void {
  const { mats } = ctx;
  ctx.cylinder(`${id}_mastro`, { height: 5.5, diameter: 0.1, tessellation: 8 }, new Vector3(pos.x, pos.y + 2.75, pos.z), mats.metalDark, { collider: true });
  ctx.box(`${id}_trave`, { w: 1.4, h: 0.06, d: 0.06 }, new Vector3(pos.x, pos.y + 5.3, pos.z), mats.metalDark, { rotationY: yaw, shadow: false });
  placeSign(
    ctx,
    `${id}_pano`,
    { bg: "#e6dcc3", fg: "#b89036", lines: ["◯", "CONTINUIDADE"], font: `bold 150px "Georgia", serif`, weathered: 0.2, seed: 9, pxWidth: 512, pxHeight: 1024 },
    { position: new Vector3(pos.x + Math.cos(yaw) * 0.0, pos.y + 3.95, pos.z), yaw: yaw + Math.PI / 2, width: 1.25, height: 2.6, double: true },
  );
}

/** Luz interna quente (abajur, lâmpada nua). */
export function warmLamp(ctx: WorldContext, id: string, pos: Vector3, intensity = 6, range = 9): PointLight {
  const bulb = MeshBuilder.CreateSphere(`${id}_bulbo`, { diameter: 0.12, segments: 6 }, ctx.scene);
  bulb.position.copyFrom(pos);
  bulb.material = ctx.mats.lampGlow;
  bulb.isPickable = false;
  bulb.parent = ctx.staticRoot;
  bulb.freezeWorldMatrix();
  const light = new PointLight(`${id}_luz`, pos.clone(), ctx.scene);
  light.diffuse = new Color3(1.0, 0.8, 0.55);
  light.intensity = intensity;
  light.range = range;
  return light;
}

export type { Mesh };

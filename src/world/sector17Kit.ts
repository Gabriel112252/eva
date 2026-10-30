import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Material } from "@babylonjs/core/Materials/material";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import "@babylonjs/loaders/glTF/2.0";
import type { WorldContext } from "./context";
import { rectsOverlap, type Rect } from "./bounds";
import { placeSign } from "./signage";
import { STREET } from "./street";
import {
  CANOPY_TOTEMS,
  Facade,
  KIT_ROOF_ITEMS,
  LANDMARKS,
  LOTS,
  Q0_EXISTING,
  STREETS,
  VIADUCT,
  WALLS,
  lampSpots,
  lotHeight,
  matOf,
  rnd,
  sectorMaxLights,
  signYaw,
  wallRects,
  type Facing,
  type LotSpec,
} from "./sector17";

/**
 * SETOR 17 — troca do blockout pelo kit modular `kit_tech.glb` (catálogo em docs/KIT_TECH.md).
 *
 * A física e o layout continuam os do blockout (`sector17.ts`): aqui só muda a APARÊNCIA.
 *  1. `planSector17Kit()` (puro, testado em tests/unit/sector17Kit.test.ts) decide, por lote e com a
 *     semente do lote, quantos módulos de 6 m cabem na fachada, o tipo de cada pavimento, esquinas,
 *     topos, a camada tecnológica (pele fotovoltaica / anexo, recicladores, letreiros LED) e os remendos
 *     (fiação, varais, ar-condicionado, toldos, tubos, lonas), além dos marcos (viaduto, torre, canopy).
 *  2. `buildSector17KitBodies()` cria, antes do `ctx.finalize`, o volume cego de cada lote recuado 1 m
 *     atrás da linha da fachada (os módulos do kit ocupam z ∈ [−0,5, 0] e o nicho da área de serviço vai
 *     a 0,9 m) — 1 cm para dentro das caixas do blockout, então fica escondido se o kit falhar.
 *  3. `startSector17Kit()` carrega o GLB uma vez (`LoadAssetContainerAsync`) e desenha cada malha-fonte
 *     com thin instances (1 draw call por malha-fonte, nenhuma geometria clonada por lote, materiais do
 *     GLB compartilhados, matriz congelada). Malhas idênticas entre as variantes _0/_1 viram uma só
 *     fonte. O viaduto é dividido em pilar + tabuleiro (os pilares do blockout ficam nas juntas).
 *     Peças do kit não têm colisor: os colisores do blockout continuam valendo (invisíveis onde o kit
 *     cobre). Se o carregamento falhar, o blockout coberto é fundido e o setor segue em blockout.
 *  `?kit=0` na URL desliga tudo (blockout puro, para comparar).
 */

// ---------------------------------------------------------------------------------------------------
// Constantes do kit (docs/KIT_TECH.md → "Convenções de encaixe")
// ---------------------------------------------------------------------------------------------------

export const KIT = {
  /** largura do módulo de fachada (m) */
  module: 6,
  /** altura de um pavimento do kit (m) */
  floor: 3,
  /** esticamento máximo de um módulo em X (15 %) */
  stretchMax: 1.15,
  /** compressão máxima de um módulo em X antes de usar um módulo a menos */
  squeezeMin: 0.82,
  /** recuo do volume cego atrás da linha da fachada (nicho da área de serviço: 0,9 m) */
  bodyInset: 1.0,
  /** parede dos módulos (z ∈ [−0,5, 0]) */
  wall: 0.5,
  /** folga das caixas do volume cego para dentro do blockout (o blockout de reserva as esconde) */
  skin: 0.01,
  /** sobra de fachada acima da qual a esquina vira pilastra alargada */
  pilaster: 0.35,
  /** escala da torre: 3 blocos de 12 m (4 pavimentos) empilhados até os 34 m do marco */
  torreScale: 34 / 36,
  /** altura (no espaço da peça) que separa pilar e tabuleiro do viaduto */
  viaductSplit: 9.65,
} as const;

export const KIT_PIECE = {
  viaductPillar: "MARCO_viaduto_maglev#pilar",
  viaductDeck: "MARCO_viaduto_maglev#tabuleiro",
  torre: "MARCO_torre_fazenda",
} as const;

/** Peças divididas por altura na carga: peça de origem → [parte de baixo, parte de cima]. */
const SPLITS: Record<string, { y: number; parts: [string, string] }> = {
  MARCO_viaduto_maglev: { y: KIT.viaductSplit, parts: [KIT_PIECE.viaductPillar, KIT_PIECE.viaductDeck] },
};

export type KitDetail = "completo" | "leve";

/** Uma instância de peça do kit no mundo (escala no espaço da peça, depois roll, yaw e posição). */
export interface KitInstance {
  piece: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  sx: number;
  sy: number;
  sz: number;
  /** giro em torno do Z local (fiação inclinada) */
  roll: number;
  /** cor multiplicada no albedo (lotes queimados) */
  tint?: [number, number, number];
  /** lote ou marco de origem */
  owner: string;
}

/** Caixa do volume cego de um lote no modo kit (mundo). */
export interface KitBodyBox {
  id: string;
  lot: string;
  center: [number, number, number];
  size: { w: number; h: number; d: number };
}

/** Placa ou pichação recolocada sobre os módulos do kit. */
export interface KitSign {
  id: string;
  lot: string;
  kind: "placa" | "pichacao";
  lines: string[];
  bg?: string;
  fg?: string;
  seed: number;
  position: [number, number, number];
  yaw: number;
  width: number;
  height: number;
}

export type GroundType = "terreo_loja" | "terreo_casa" | "galpao";
export type UpperType = "apto_janelas" | "apto_sacada" | "apto_servico" | "galpao";

export interface ModulePlan {
  /** centro do módulo ao longo da fachada (m, a partir do canto u=0) */
  u: number;
  /** módulo atrás de outra construção (não recebe kit; o volume cego vai até a fachada) */
  blocked: boolean;
  /** peça por pavimento, de baixo para cima */
  pieces: string[];
  topo: string | null;
}

export interface LotKitPlan {
  lot: string;
  rows: number;
  color: 0 | 1;
  layout: FacadeLayout;
  modules: ModulePlan[];
  tech: "pele" | "anexo" | null;
  yaw: number;
}

export interface Sector17KitPlan {
  detail: KitDetail;
  instances: KitInstance[];
  bodies: KitBodyBox[];
  signs: KitSign[];
  lots: LotKitPlan[];
}

// ---------------------------------------------------------------------------------------------------
// Composição (puro)
// ---------------------------------------------------------------------------------------------------

/** yaw que leva a frente +Z de uma peça do kit para a direção da rua (`facing`). */
export function facingYaw(f: Facing): number {
  return f === "N" ? 0 : f === "S" ? Math.PI : f === "E" ? Math.PI / 2 : -Math.PI / 2;
}

export interface FacadeLayout {
  /** módulos de 6 m na fachada */
  count: number;
  /** escala X de cada módulo (0,82–1,15) */
  scale: number;
  /** largura real de cada módulo */
  moduleWidth: number;
  /** sobra total (dividida nas duas pontas, coberta por esquinas/pilastras) */
  leftover: number;
  /** u do início do primeiro módulo */
  start: number;
}

/**
 * Quantos módulos de 6 m cabem numa fachada de `width` m: arredonda, comprime até 18 % ou estica até 15 %;
 * o que sobrar (fachadas de 8–9 m) fica nas pontas, coberto por esquinas alargadas (pilastras).
 */
export function facadeLayout(width: number): FacadeLayout {
  let count = Math.max(1, Math.round(width / KIT.module));
  let scale = width / (count * KIT.module);
  if (scale < KIT.squeezeMin && count > 1) {
    count -= 1;
    scale = width / (count * KIT.module);
  }
  scale = Math.min(scale, KIT.stretchMax);
  const moduleWidth = KIT.module * scale;
  const leftover = Math.max(0, width - count * moduleWidth);
  return { count, scale, moduleWidth, leftover, start: leftover / 2 };
}

/** Pavimentos do kit (3 m) que cobrem a altura dos pavimentos do blockout (3,1 m; mercado: 5,6 m). */
export function lotRows(lot: LotSpec): number {
  return Math.max(1, Math.round((lot.floors * (lot.floorHeight ?? 3.1)) / KIT.floor));
}

/** Cor 0/1 (rebocos areia/quente × verde/rosa/azul/cinza) sorteada pela semente do lote. */
export function lotColor(lot: LotSpec): 0 | 1 {
  return rnd(lot.seed, 1400) < 0.5 ? 0 : 1;
}

/** Térreo do módulo `k` conforme `ground` (shop → loja, door → casa, wall/gate → galpão). */
export function groundType(lot: LotSpec, k: number, count: number): GroundType {
  if (lot.mat === "burnt" || lot.ground === "wall" || lot.ground === "gate") return "galpao";
  if (lot.mat === "corrugated") return "terreo_loja";
  if (lot.ground === "shop") return k === shopIndex(lot, count) ? "terreo_loja" : rnd(lot.seed, 1110 + k) < 0.4 ? "terreo_loja" : "terreo_casa";
  // pichação pede uma parede fechada (portão de garagem/galpão) num dos módulos
  if (lot.graffiti && k === graffitiIndex(lot, count)) return "galpao";
  if (count >= 3 && rnd(lot.seed, 1120 + k) < 0.25) return "terreo_loja";
  return "terreo_casa";
}

/** Módulo da loja principal (placa do lote em cima da marquise). */
export function shopIndex(lot: LotSpec, count: number): number {
  return Math.min(count - 1, Math.floor(rnd(lot.seed, 1100) * count));
}

function graffitiIndex(lot: LotSpec, count: number): number {
  return Math.min(count - 1, Math.floor(rnd(lot.seed, 1105) * count));
}

/** Pavimento superior: colunas coerentes (sacadas/serviço/janelas) com variação sorteada por andar. */
export function upperType(lot: LotSpec, k: number, row: number): UpperType {
  if (lot.mat === "burnt" || lot.mat === "corrugated") return "galpao";
  if (rnd(lot.seed, 1500 + k * 13 + row) < (lot.boarded ?? 0) * 0.35) return "galpao"; // andar fechado/abandonado
  const c = rnd(lot.seed, 1200 + k);
  let t: UpperType = lot.balconies ? (c < 0.55 ? "apto_sacada" : c < 0.82 ? "apto_janelas" : "apto_servico") : c < 0.68 ? "apto_janelas" : "apto_servico";
  if (rnd(lot.seed, 1300 + k * 17 + row) < 0.18) t = t === "apto_janelas" ? "apto_servico" : "apto_janelas";
  return t;
}

/** Ponto da fachada (u, w) a partir do mundo (inverso de `Facade.at`). */
export function toFacade(lot: LotSpec, x: number, z: number): { u: number; w: number } {
  const r = lot.rect;
  switch (lot.facing) {
    case "N":
      return { u: x - r.x0, w: z - r.z1 };
    case "S":
      return { u: r.x1 - x, w: r.z0 - z };
    case "E":
      return { u: r.z1 - z, w: x - r.x1 };
    case "W":
      return { u: z - r.z0, w: r.x0 - x };
  }
}

/** Retângulos em planta que podem tampar a frente de um lote (outros lotes, marcos, quarteirão original, muros). */
function blockersFor(id: string): Rect[] {
  return [
    ...LOTS.filter((l) => l.id !== id).map((l) => l.rect),
    ...LANDMARKS.filter((l) => !l.stacked).map((l) => l.rect),
    ...Q0_EXISTING.map((q) => q.rect),
    ...WALLS.flatMap(wallRects),
  ];
}

/**
 * Fração do trecho [u0, u1] da fachada tampada por construção encostada na frente (faixa de 5 cm a 1 m para
 * fora). Módulos tampados em ≥ 75 % não recebem kit (o volume cego vai até a linha da fachada); os
 * parcialmente tampados recebem o módulo inteiro — a parte escondida fica dentro do vizinho.
 */
export function frontBlockedFraction(lot: LotSpec, u0: number, u1: number, blockers = blockersFor(lot.id)): number {
  const f = new Facade(lot.rect, lot.facing);
  const a = f.at(u0, 0, 0.05);
  const b = f.at(u1, 0, 1.0);
  const r: Rect = { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z) };
  const cuts: Array<[number, number]> = [];
  for (const o of blockers) {
    if (!rectsOverlap(r, o)) continue;
    const p = toFacade(lot, o.x0, o.z0);
    const q = toFacade(lot, o.x1, o.z1);
    cuts.push([Math.max(u0, Math.min(p.u, q.u)), Math.min(u1, Math.max(p.u, q.u))]);
  }
  cuts.sort((x, y) => x[0] - y[0]);
  let covered = 0;
  let end = u0;
  for (const [c0, c1] of cuts) {
    const s0 = Math.max(c0, end);
    if (c1 > s0) covered += c1 - s0;
    end = Math.max(end, c1);
  }
  return covered / Math.max(1e-6, u1 - u0);
}

/** Linha da fachada (coordenada perpendicular) e pontas no mundo. */
function facadeLine(lot: LotSpec): { line: number; ends: [[number, number], [number, number]] } {
  const f = new Facade(lot.rect, lot.facing);
  const a = f.at(0, 0, 0);
  const b = f.at(f.width, 0, 0);
  const line = lot.facing === "N" || lot.facing === "S" ? a.z : a.x;
  return { line, ends: [[a.x, a.z], [b.x, b.z]] };
}

/** Vizinho que divide a ponta `end` (0: u=0, 1: u=W) da fachada — mesma rua, mesma linha. */
export function sharedNeighbor(lot: LotSpec, end: 0 | 1, lots: LotSpec[] = LOTS): LotSpec | null {
  const me = facadeLine(lot);
  const p = me.ends[end];
  for (const o of lots) {
    if (o.id === lot.id || o.facing !== lot.facing) continue;
    const other = facadeLine(o);
    if (Math.abs(other.line - me.line) > 0.01) continue;
    if (other.ends.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.05)) return o;
  }
  return null;
}

function piece(type: string, color: 0 | 1): string {
  return `FACHADA_${type}_${color}`;
}

/** Pegada (u, w) das peças de laje com o yaw da fachada (frente +Z → rua; X local → +u). */
const ROOF_FOOTPRINT: Record<string, [number, number, number, number]> = {
  REMENDO_caixa_dagua: [-0.92, 0.92, -0.72, 0.72],
  TECH_reciclador_agua: [-1.45, 1.35, -0.94, 0.92],
  TECH_canopy_solar: [-2.85, 2.85, -1.45, 1.45],
  TECH_anexo_modular: [-3.42, 3.15, -2.65, 0.4],
};

interface Box2 {
  u0: number;
  u1: number;
  w0: number;
  w1: number;
}

const boxHit = (a: Box2, b: Box2, m = 0.25) => a.u0 < b.u1 + m && b.u0 < a.u1 + m && a.w0 < b.w1 + m && b.w0 < a.w1 + m;

/**
 * Coloca uma peça de laje no telhado: tenta os candidatos (u, w) na ordem e devolve o primeiro que cabe
 * no telhado sem bater nos itens que ficaram do blockout nem nos já colocados.
 */
function roofSpot(pieceName: string, W: number, depth: number, taken: Box2[], uPref: number, wOrder: number[]): { u: number; w: number } | null {
  const [fu0, fu1, fw0, fw1] = ROOF_FOOTPRINT[pieceName]!;
  const us: number[] = [];
  for (let u = 0.6 - fu0; u <= W - 0.6 - fu1 + 1e-6; u += 0.5) us.push(u);
  us.sort((a, b) => Math.abs(a - uPref) - Math.abs(b - uPref));
  for (const w of wOrder) {
    if (w + fw0 < -depth + 0.5 || w + fw1 > -0.7) continue;
    for (const u of us) {
      const box = { u0: u + fu0, u1: u + fu1, w0: w + fw0, w1: w + fw1 };
      if (taken.some((t) => boxHit(t, box))) continue;
      taken.push(box);
      return { u, w };
    }
  }
  return null;
}

/** Itens de telhado do blockout que continuam (antena, varal, mastro) em coordenadas da fachada. */
function keptRoofBoxes(lot: LotSpec): Box2[] {
  const f = new Facade(lot.rect, lot.facing);
  const cx = (lot.rect.x0 + lot.rect.x1) / 2;
  const cz = (lot.rect.z0 + lot.rect.z1) / 2;
  const out: Box2[] = [];
  const world = (x0: number, z0: number, x1: number, z1: number) => {
    const a = toFacade(lot, x0, z0);
    const b = toFacade(lot, x1, z1);
    out.push({ u0: Math.min(a.u, b.u), u1: Math.max(a.u, b.u), w0: Math.min(a.w, b.w), w1: Math.max(a.w, b.w) });
  };
  for (const item of lot.roof ?? []) {
    if (KIT_ROOF_ITEMS.has(item)) continue;
    if (item === "antena") world(cx + f.width * 0.3 - 0.9, cz + 1 - 0.9, cx + f.width * 0.3 + 0.9, cz + 1 + 0.9);
    if (item === "mastro") world(cx - 1.3, cz - 1.3, cx + 1.3, cz + 1.3);
    if (item === "varal") world(cx - f.width * 0.3 - 0.3, cz - 0.45, cx + f.width * 0.3 + 0.3, cz + 0.45);
  }
  return out;
}

export interface PlanEnv {
  detail: KitDetail;
  y0: number;
  out: KitInstance[];
  bodies: KitBodyBox[];
  signs: KitSign[];
}

/** Composição de um lote: módulos, esquinas, topos, volume cego, camada tecnológica e remendos. */
export function planLot(lot: LotSpec, env: PlanEnv): LotKitPlan {
  const f = new Facade(lot.rect, lot.facing);
  const W = f.width;
  const depth = f.depth;
  const H = lotHeight(lot);
  const rows = lotRows(lot);
  const color = lotColor(lot);
  const layout = facadeLayout(W);
  const yaw = facingYaw(lot.facing);
  const y0 = env.y0;
  const burnt = lot.mat === "burnt";
  const tint: [number, number, number] | undefined = burnt ? [0.3, 0.27, 0.25] : undefined;
  const lite = env.detail === "leve";
  const blockers = blockersFor(lot.id);
  const put = (p: string, u: number, y: number, w: number, o: { sx?: number; sy?: number; sz?: number; yawOff?: number; roll?: number; tint?: [number, number, number] } = {}) => {
    const q = f.at(u, y, w);
    env.out.push({ piece: p, x: q.x, y: q.y, z: q.z, yaw: yaw + (o.yawOff ?? 0), sx: o.sx ?? 1, sy: o.sy ?? 1, sz: o.sz ?? 1, roll: o.roll ?? 0, tint: o.tint ?? tint, owner: lot.id });
  };
  const body = (id: string, u0: number, u1: number, w0: number, w1: number, ya: number, yb: number) => {
    const c = f.at((u0 + u1) / 2, (ya + yb) / 2, (w0 + w1) / 2);
    env.bodies.push({ id: `s17kit_${lot.id}_${id}`, lot: lot.id, center: [c.x, c.y, c.z], size: f.size(u1 - u0, yb - ya, w1 - w0) });
  };

  // --- módulos da fachada -------------------------------------------------------------------------
  const anexoWanted = !burnt && rows >= 1 && W >= 7.2 && !(lot.roof ?? []).some((r) => r === "solar" || !KIT_ROOF_ITEMS.has(r));
  const techRoll = rnd(lot.seed, 1001);
  let tech: LotKitPlan["tech"] = null;
  if (!burnt && techRoll < 0.42) tech = rows >= 2 && (rnd(lot.seed, 1002) < 0.6 || !anexoWanted) ? "pele" : anexoWanted ? "anexo" : null;
  const modules: ModulePlan[] = [];
  for (let k = 0; k < layout.count; k++) {
    const u = layout.start + layout.moduleWidth * (k + 0.5);
    const blocked = frontBlockedFraction(lot, u - layout.moduleWidth / 2, u + layout.moduleWidth / 2, blockers) >= 0.75;
    const pieces: string[] = [];
    for (let r = 0; r < rows; r++) {
      if (r === 0) {
        const g = groundType(lot, k, layout.count);
        pieces.push(g === "galpao" && lot.graffiti && k === graffitiIndex(lot, layout.count) ? piece("galpao", 0) : piece(g, color));
      } else pieces.push(piece(upperType(lot, k, r), color));
    }
    const topoVariant: 0 | 1 = tech !== "anexo" && !burnt && rnd(lot.seed, 1600 + k) < 0.3 ? 1 : 0;
    modules.push({ u, blocked, pieces, topo: blocked ? null : `FACHADA_topo_${topoVariant}` });
  }
  for (const m of modules) {
    if (m.blocked) continue;
    m.pieces.forEach((p, r) => put(p, m.u, y0 + r * KIT.floor, 0, { sx: layout.scale }));
    if (m.topo) put(m.topo, m.u, y0 + rows * KIT.floor, 0, { sx: layout.scale });
  }

  // --- esquinas (uma por pavimento; a ponta dividida com o vizinho fica com um dos dois) -------------
  const sideLeft = layout.start;
  const esquina = `FACHADA_esquina_${color}`;
  for (const end of [0, 1] as const) {
    const n = sharedNeighbor(lot, end);
    const nRows = n ? lotRows(n) : 0;
    const nLeft = n ? facadeLayout(new Facade(n.rect, n.facing).width).start : 0;
    const wide = sideLeft > KIT.pilaster;
    const primary = !n || wide || (nLeft <= KIT.pilaster && (rows > nRows || (rows === nRows && lot.id < n.id)));
    const from = primary ? 0 : nRows;
    if (modules.every((m) => m.blocked)) continue;
    for (let r = from; r < rows; r++) {
      const uEnd = end === 0 ? 0 : W;
      if (primary && wide) {
        // pilastra: cobre a sobra da ponta e a junta (de −0,4 a s, espelhado na outra ponta)
        const width = sideLeft + 0.4;
        const uc = end === 0 ? (sideLeft - 0.4) / 2 : W - (sideLeft - 0.4) / 2;
        put(esquina, uc, y0 + r * KIT.floor, -0.1, { sx: width / 0.8 });
      } else put(esquina, uEnd, y0 + r * KIT.floor, -0.1);
    }
  }

  // --- volume cego (recuado; 1 cm para dentro das caixas do blockout) --------------------------------
  const s = KIT.skin;
  const top = H - s;
  body("nucleo", s, W - s, -(depth - s), -KIT.bodyInset, 0, top);
  body("lado0", s, 0.3, -KIT.bodyInset, -KIT.wall, 0, top);
  body("lado1", W - 0.3, W - s, -KIT.bodyInset, -KIT.wall, 0, top);
  body("tampa", s, W - s, -KIT.bodyInset, -KIT.wall + 0.05, top - 0.1, top);
  for (const [i, m] of modules.entries()) if (m.blocked) body(`tampado${i}`, m.u - layout.moduleWidth / 2 + (i === 0 ? s : 0), m.u + layout.moduleWidth / 2 - (i === modules.length - 1 ? s : 0), -KIT.bodyInset, -s, 0, top);
  if (layout.start > 0) {
    // sobra nas pontas: a parede entre a esquina e o primeiro módulo
    body("sobra0", s, layout.start, -KIT.bodyInset, -KIT.wall, 0, top);
    body("sobra1", W - layout.start, W - s, -KIT.bodyInset, -KIT.wall, 0, top);
  }

  // --- camada tecnológica -----------------------------------------------------------------------------
  const open = modules.map((m, k) => ({ m, k })).filter(({ m }) => !m.blocked);
  const flatUpper = (m: ModulePlan, r: number) => r >= 1 && r < rows && !/sacada/.test(m.pieces[r]!);
  const peleAt = new Set<string>();
  if (tech === "pele") {
    const cands = open.filter(({ m }) => flatUpper(m, 1));
    if (cands.length === 0) tech = null;
    else {
      const { m, k } = cands[Math.floor(rnd(lot.seed, 1003) * cands.length)]!;
      const span = Math.min(rows - 1, 1 + Math.floor(rnd(lot.seed, 1004) * 2));
      for (let r = 1; r <= span; r++) {
        if (!flatUpper(m, r)) break;
        put(rnd(lot.seed, 1010 + r) < 0.35 ? "TECH_pele_fotovoltaica_rasgada" : "TECH_pele_fotovoltaica_inteira", m.u, y0 + r * KIT.floor, 0, { sx: layout.scale });
        peleAt.add(`${k}:${r}`);
      }
    }
  }
  // telhado: itens do blockout que o kit substitui + extras sorteados, sem bater nos que ficaram
  const taken: Box2[] = keptRoofBoxes(lot);
  for (const m of modules) if (m.topo === "FACHADA_topo_1") taken.push({ u0: m.u - layout.moduleWidth / 2, u1: m.u + layout.moduleWidth / 2, w0: -2.75, w1: 0 });
  const back = [-(depth - 1.5), -(depth - 2.5), -depth / 2];
  const mid = [-depth / 2 - 0.3, -(depth - 2.2), -depth / 2 + 1.5];
  const roofPut = (p: string, uPref: number, ws: number[]) => {
    const spot = roofSpot(p, W, depth, taken, uPref, ws);
    if (spot) put(p, spot.u, H, spot.w);
    return !!spot;
  };
  if (tech === "anexo") {
    const spot = roofSpot("TECH_anexo_modular", W, depth, taken, W * (0.35 + rnd(lot.seed, 1020) * 0.3), [-1.5, -2.5]);
    if (spot) put("TECH_anexo_modular", spot.u, H, spot.w);
    else tech = null;
  }
  const roof = lot.roof ?? [];
  if (roof.includes("solar")) roofPut("TECH_canopy_solar", W / 2, mid);
  if (roof.includes("caixa_dagua")) roofPut("REMENDO_caixa_dagua", W * 0.22, back);
  if (roof.includes("reciclador")) roofPut("TECH_reciclador_agua", W * 0.72, back);
  if (!burnt && !roof.some((r) => KIT_ROOF_ITEMS.has(r))) {
    // telhados sem nada no blockout: recicladores e caixas d'água da Década dos Milagres em parte deles
    const e = rnd(lot.seed, 1030);
    if (e < 0.25) roofPut("TECH_reciclador_agua", W * (0.3 + rnd(lot.seed, 1031) * 0.4), back);
    else if (e < 0.5) roofPut("REMENDO_caixa_dagua", W * (0.2 + rnd(lot.seed, 1032) * 0.6), back);
  }

  // --- letreiro do lote (na testeira da marquise da loja) e LED em bandeira ----------------------------
  const shop = lot.ground === "shop" ? shopIndex(lot, layout.count) : -1;
  const shopMod = shop >= 0 ? modules[shop] : undefined;
  if (lot.sign && shopMod && !shopMod.blocked) {
    const q = f.at(shopMod.u, y0 + 2.62, 1.13);
    env.signs.push({ id: `s17kit_${lot.id}_placa`, lot: lot.id, kind: "placa", lines: lot.sign.lines, bg: lot.sign.bg, fg: lot.sign.fg, seed: lot.seed, position: [q.x, q.y, q.z], yaw: signYaw(lot.facing), width: Math.min(layout.moduleWidth - 0.6, 5.2), height: 0.56 });
    if (!lite) {
      // bandeira na junta com o módulo vizinho (ou perto da ponta), acima da marquise
      const edge = shop > 0 ? shopMod.u - layout.moduleWidth / 2 + 0.12 : layout.count > 1 ? shopMod.u + layout.moduleWidth / 2 - 0.12 : shopMod.u + layout.moduleWidth / 2 - 0.7;
      put(rnd(lot.seed, 1040) < 0.5 ? "TECH_letreiro_led_farmacia" : "TECH_letreiro_led_agua", edge, y0 + 3.1, 0);
    }
  }
  if (lot.graffiti) {
    const gi = graffitiIndex(lot, layout.count);
    const gm = modules[gi];
    if (gm && !gm.blocked && gm.pieces[0] === "FACHADA_galpao_0") {
      const q = f.at(gm.u, y0 + 0.78, 0.33);
      env.signs.push({ id: `s17kit_${lot.id}_graf`, lot: lot.id, kind: "pichacao", lines: [lot.graffiti], seed: lot.seed, position: [q.x, q.y, q.z], yaw: signYaw(lot.facing), width: Math.min(layout.moduleWidth - 1.6, 3.6), height: 0.72 });
    }
  }
  if (lite || burnt) return { lot: lot.id, rows, color, layout, modules, tech, yaw };

  // --- remendos ----------------------------------------------------------------------------------------
  // ar-condicionado de janela (sob a janela lateral dos apartamentos), varal de parede, toldo, tubo d'água
  const ups = open.flatMap(({ m, k }) => m.pieces.map((p, r) => ({ m, k, r, p })).filter(({ r, k: kk, p }) => r >= 1 && !peleAt.has(`${kk}:${r}`) && /janelas|servico/.test(p)));
  const acCount = Math.floor(rnd(lot.seed, 1050) * 3);
  for (let i = 0; i < acCount && ups.length; i++) {
    const c = ups.splice(Math.floor(rnd(lot.seed, 1051 + i) * ups.length), 1)[0]!;
    const side = rnd(lot.seed, 1055 + i) < 0.5 ? 1 : -1;
    put("REMENDO_ar_condicionado", c.m.u + (/janelas/.test(c.p) ? side * 1.95 : -0.9) * layout.scale, y0 + c.r * KIT.floor + 0.42, 0.01);
  }
  const varalC = open.flatMap(({ m, k }) => m.pieces.map((p, r) => ({ m, k, r, p })).filter(({ r, k: kk, p }) => r >= 1 && !peleAt.has(`${kk}:${r}`) && /janelas|sacada/.test(p)));
  if (varalC.length && rnd(lot.seed, 1060) < 0.45) {
    const c = varalC[Math.floor(rnd(lot.seed, 1061) * varalC.length)]!;
    put("REMENDO_varal", c.m.u - 1.3 * layout.scale, y0 + c.r * KIT.floor + 2.12, 0.02);
  }
  const casas = open.filter(({ m }) => /terreo_casa/.test(m.pieces[0]!));
  if (casas.length && rnd(lot.seed, 1070) < 0.4) {
    const { m } = casas[Math.floor(rnd(lot.seed, 1071) * casas.length)]!;
    put("REMENDO_toldo", m.u - 1.3 * layout.scale, y0, 0.02);
  }
  const galpoes = open.filter(({ m, k }) => /galpao/.test(m.pieces[0]!) && !(lot.graffiti && k === graffitiIndex(lot, layout.count)));
  if (galpoes.length && rnd(lot.seed, 1080) < 0.55) {
    const { m } = galpoes[Math.floor(rnd(lot.seed, 1081) * galpoes.length)]!;
    put("REMENDO_tubo_agua", m.u, y0, 0.02, { sx: Math.min(1, layout.moduleWidth / 5.4) });
  }
  // fiação pregada na fachada, abaixo do 2º pavimento (sem sacadas no caminho)
  if (rows >= 2 && rnd(lot.seed, 1090) < 0.45) {
    const twelve = W >= 12.6;
    const len = twelve ? 12 : 6;
    const u = twelve ? W / 2 : layout.start + layout.moduleWidth * (rnd(lot.seed, 1091) < 0.5 ? 0.5 : Math.min(layout.count - 0.5, 1.5));
    const clear = modules.every((m) => Math.abs(m.u - u) > layout.moduleWidth / 2 + len / 2 - 0.2 || m.blocked || ![m.pieces[1], m.pieces[2]].some((p) => p && /sacada/.test(p)));
    if (clear && !modules.some((m) => m.blocked && Math.abs(m.u - u) < len / 2)) put(twelve ? "REMENDO_fiacao_12m" : "REMENDO_fiacao_6m", u, y0 + KIT.floor + 2.45, 0.3);
  }
  return { lot: lot.id, rows, color, layout, modules, tech, yaw };
}

/** Lote cuja fachada fica na linha `line` do outro lado da rua e cobre a coordenada `along`. */
function lotAcross(axis: "x" | "z", line: number, along: number): LotSpec | null {
  for (const lot of LOTS) {
    const r = lot.rect;
    if (axis === "x") {
      if ((lot.facing === "N" && Math.abs(r.z1 - line) < 0.01) || (lot.facing === "S" && Math.abs(r.z0 - line) < 0.01)) if (along > r.x0 + 1 && along < r.x1 - 1) return lot;
    } else if ((lot.facing === "E" && Math.abs(r.x1 - line) < 0.01) || (lot.facing === "W" && Math.abs(r.x0 - line) < 0.01)) if (along > r.z0 + 1 && along < r.z1 - 1) return lot;
  }
  return null;
}

/** Fiação dos postes do blockout até a fachada do outro lado da rua (vão de ~12 m). */
function planStreetWires(out: KitInstance[]): void {
  for (const spot of lampSpots()) {
    const s = STREETS.find((st) => st.id === spot.street)!;
    if (s.median) continue; // avenida: 26 m de pista, sem vão possível
    const across = s.at - spot.side * (s.asphaltHalf + s.sidewalk);
    const along = s.axis === "x" ? spot.pos.x : spot.pos.z;
    const target = lotAcross(s.axis, across, along);
    if (!target || lotHeight(target) < 6.6) continue;
    const a = new Vector3(spot.pos.x, 6.3, spot.pos.z);
    const out1 = -spot.side * 0.15; // um palmo para fora da parede
    const b = s.axis === "x" ? new Vector3(along, Math.min(lotHeight(target) - 0.8, 7.4), across - out1) : new Vector3(across - out1, Math.min(lotHeight(target) - 0.8, 7.4), along);
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const span = Math.hypot(dx, dz);
    if (span < 9 || span > 15) continue;
    out.push({ piece: "REMENDO_fiacao_12m", x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2, yaw: Math.atan2(-dz / span, dx / span), sx: span / 12, sy: 1, sz: 1, roll: Math.atan2(b.y - a.y, span), owner: spot.id });
  }
}

/** Marcos: viaduto (pilares nas juntas + tabuleiros de 24 m), Torre Verde (3 blocos), canopy, cisterna. */
function planLandmarks(out: KitInstance[], detail: KitDetail): void {
  const V = VIADUCT;
  const along = Math.PI / 2; // X local do segmento → eixo Z da avenida
  for (const z of V.pillars) out.push({ piece: KIT_PIECE.viaductPillar, x: V.x, y: 0, z, yaw: along, sx: 1, sy: 1, sz: 1, roll: 0, owner: "viaduto" });
  for (const [z0, z1] of V.decks) out.push({ piece: KIT_PIECE.viaductDeck, x: V.x, y: 0, z: (z0 + z1) / 2, yaw: along, sx: (z1 - z0) / V.segmentLength, sy: 1, sz: 1, roll: 0, owner: "viaduto" });
  // Torre Verde: base de vidro de 12 m (4 pavimentos) repetida 3× e reduzida a 34 m; frente para a rua (−Z)
  const torre = LANDMARKS.find((l) => l.id === "torre")!;
  const t = KIT.torreScale;
  for (let k = 0; k < 3; k++) out.push({ piece: KIT_PIECE.torre, x: (torre.rect.x0 + torre.rect.x1) / 2, y: k * 12 * t, z: torre.rect.z0, yaw: Math.PI, sx: t, sy: t, sz: t, roll: 0, owner: "torre" });
  // canopy do terminal: dosséis solares nas bordas norte e sul da laje (o meio fica livre para pousar)
  const c = LANDMARKS.find((l) => l.id === "canopy")!;
  for (const z of [c.rect.z1 - 1.6, c.rect.z0 + 1.6]) for (let k = 0; k < 4; k++) out.push({ piece: "TECH_canopy_solar", x: c.rect.x0 + 3 + 6 * k, y: c.height, z, yaw: 0, sx: 1, sy: 1, sz: 1, roll: 0, owner: "canopy" });
  if (detail === "completo") {
    for (const x of CANOPY_TOTEMS) out.push({ piece: "TECH_totem_recarga", x, y: STREET.curbHeight, z: c.rect.z1 - 2.2, yaw: 0, sx: 1, sy: 1, sz: 1, roll: 0, owner: "canopy" });
    // cisterna: reciclador ao lado da casa de bombas, caixas d'água no pátio e tubulação na parede oeste das bombas
    out.push({ piece: "TECH_reciclador_agua", x: -65.2, y: 0.1, z: 12.6, yaw: -Math.PI / 2, sx: 1, sy: 1, sz: 1, roll: 0, owner: "cisterna" });
    for (const [k, z] of [-6.2, -8.4].entries()) out.push({ piece: "REMENDO_caixa_dagua", x: -73.7, y: 0.1, z, yaw: k * 0.7, sx: 1, sy: 1, sz: 1, roll: 0, owner: "cisterna" });
    out.push({ piece: "REMENDO_tubo_agua", x: -72.02, y: 0.1, z: 9, yaw: -Math.PI / 2, sx: 0.92, sy: 1, sz: 1, roll: 0, owner: "cisterna" });
  }
}

/** Plano completo do setor (determinístico: mesma entrada → mesmo plano). */
export function planSector17Kit(detail: KitDetail = "completo"): Sector17KitPlan {
  const env: PlanEnv = { detail, y0: STREET.curbHeight, out: [], bodies: [], signs: [] };
  const lots = LOTS.map((lot) => planLot(lot, env));
  if (detail === "completo") planStreetWires(env.out);
  planLandmarks(env.out, detail);
  return { detail, instances: env.out, bodies: env.bodies, signs: env.signs, lots };
}

/** Peças do GLB necessárias para um plano (as divididas contam pela peça de origem). */
export function piecesUsed(plan: Sector17KitPlan): Set<string> {
  const set = new Set<string>();
  for (const i of plan.instances) set.add(i.piece.split("#")[0]!);
  return set;
}

// ---------------------------------------------------------------------------------------------------
// Babylon: volume cego, carga do GLB, thin instances
// ---------------------------------------------------------------------------------------------------

/** `?kit=0` desliga o kit (blockout puro). Sem `window` (testes em Node) o kit fica desligado. */
export function sector17KitEnabled(search?: string): boolean {
  const q = search ?? (typeof window !== "undefined" ? window.location.search : null);
  if (q === null) return false;
  return new URLSearchParams(q).get("kit") !== "0";
}

export function sector17KitUrl(): string {
  return `${import.meta.env.BASE_URL}assets/environments/kit_tech.glb`;
}

/** Volume cego dos lotes no modo kit (antes do `ctx.finalize`: entra na fusão por material, sem draw call a mais). */
export function buildSector17KitBodies(ctx: WorldContext, plan: Sector17KitPlan): void {
  const byId = new Map(LOTS.map((l) => [l.id, l]));
  for (const b of plan.bodies) {
    const lot = byId.get(b.lot)!;
    ctx.box(b.id, b.size, new Vector3(...b.center), matOf(ctx.mats, lot.mat));
  }
}

export interface Sector17KitResult {
  /** malhas-fonte com thin instances */
  meshes: Mesh[];
  /** fontes que projetam sombra (marcos e marquises/sacadas) */
  shadowCasters: AbstractMesh[];
  /** draw calls por passada se todas as fontes estiverem no quadro */
  sources: number;
  instances: number;
  triangles: number;
}

const pending = new WeakMap<WorldContext, Promise<Sector17KitResult | null>>();

/**
 * Começa a carregar o kit (assíncrono) e guarda a promessa no contexto: `loadHeroAssets` a aguarda antes
 * de devolver os projetores de sombra, então o jogo só abre com o setor já trocado (ou em blockout, se falhar).
 */
export function startSector17Kit(ctx: WorldContext, covered: Mesh[], plan: Sector17KitPlan, url = sector17KitUrl()): Promise<Sector17KitResult | null> {
  const p = runKit(ctx, covered, plan, url);
  pending.set(ctx, p);
  return p;
}

/** Promessa do kit em andamento para este mundo (ou null quando o kit está desligado). */
export function sector17KitPending(ctx: WorldContext): Promise<Sector17KitResult | null> | null {
  return pending.get(ctx) ?? null;
}

async function runKit(ctx: WorldContext, covered: Mesh[], plan: Sector17KitPlan, url: string): Promise<Sector17KitResult | null> {
  try {
    const result = await instantiateKit(ctx, plan, url);
    dropCovered(ctx, covered);
    placeKitSigns(ctx, plan);
    console.info(`[setor17-kit] ${result.sources} malhas-fonte, ${result.instances} instâncias, ${Math.round(result.triangles / 1000)} mil triângulos`);
    return result;
  } catch (err) {
    console.error("[setor17-kit] falha ao carregar o kit; o setor continua em blockout", err);
    mergeCovered(ctx, covered);
    return null;
  }
}

/** Soma de verificação da geometria + matriz de baking: malhas idênticas entre as variantes _0/_1 viram uma fonte. */
function dedupKey(m: Mesh, bake: Matrix): string {
  const pos = m.getVerticesData(VertexBuffer.PositionKind) ?? [];
  const idx = m.getIndices() ?? [];
  let h = 0;
  for (let i = 0; i < pos.length; i++) h = (h + (pos[i] ?? 0) * ((i % 13) + 1)) % 1e9;
  let hi = 0;
  for (let i = 0; i < idx.length; i++) hi = (hi * 31 + (idx[i] ?? 0)) % 1000000007;
  const mt = Array.from(bake.asArray(), (v) => v.toFixed(4)).join(",");
  return `${m.material?.name ?? "-"}|${pos.length}|${idx.length}|${h.toFixed(3)}|${hi}|${mt}`;
}

/** Divide uma malha (já no espaço da peça) pelos centroides dos triângulos acima/abaixo de `y`. */
function splitByHeight(m: Mesh, y: number, names: [string, string]): [Mesh | null, Mesh | null] {
  const pos = m.getVerticesData(VertexBuffer.PositionKind)!;
  const nor = m.getVerticesData(VertexBuffer.NormalKind);
  const uv = m.getVerticesData(VertexBuffer.UVKind);
  const uv2 = m.getVerticesData(VertexBuffer.UV2Kind);
  const idx = m.getIndices()!;
  const parts: [number[], number[]] = [[], []];
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t]!;
    const b = idx[t + 1]!;
    const c = idx[t + 2]!;
    const cy = (pos[a * 3 + 1]! + pos[b * 3 + 1]! + pos[c * 3 + 1]!) / 3;
    parts[cy < y ? 0 : 1].push(a, b, c);
  }
  return parts.map((tris, i) => {
    if (tris.length === 0) return null;
    const remap = new Map<number, number>();
    const vd = new VertexData();
    const P: number[] = [];
    const N: number[] = [];
    const U: number[] = [];
    const U2: number[] = [];
    const I: number[] = [];
    for (const v of tris) {
      let j = remap.get(v);
      if (j === undefined) {
        j = remap.size;
        remap.set(v, j);
        P.push(pos[v * 3]!, pos[v * 3 + 1]!, pos[v * 3 + 2]!);
        if (nor) N.push(nor[v * 3]!, nor[v * 3 + 1]!, nor[v * 3 + 2]!);
        if (uv) U.push(uv[v * 2]!, uv[v * 2 + 1]!);
        if (uv2) U2.push(uv2[v * 2]!, uv2[v * 2 + 1]!);
      }
      I.push(j);
    }
    vd.positions = P;
    vd.indices = I;
    if (nor) vd.normals = N;
    if (uv) vd.uvs = U;
    if (uv2) vd.uvs2 = U2;
    const part = new Mesh(names[i]!, m.getScene());
    vd.applyToMesh(part);
    part.material = m.material;
    return part;
  }) as [Mesh | null, Mesh | null];
}

/** Malhas de marcos (e marquises/sacadas) que projetam sombra; planos finos e alpha não projetam. */
function castsShadow(pieceName: string, m: Mesh): boolean {
  const mat = m.material?.name ?? "";
  if (/stain|glass|leaves|crops|clothes|tarp|lamp|grow|fabric|placa|produce|poster|rubber|led/.test(mat)) return false;
  if (pieceName.startsWith("MARCO_")) return true;
  return /FACHADA_(terreo_loja|apto_sacada)/.test(pieceName) && mat === "concrete";
}

async function instantiateKit(ctx: WorldContext, plan: Sector17KitPlan, url: string): Promise<Sector17KitResult> {
  const scene = ctx.scene;
  const container = await LoadAssetContainerAsync(url, scene, { pluginExtension: ".glb" });
  container.addAllToScene();
  const root = container.meshes.find((m) => m.name === "__root__");
  if (!root) throw new Error("kit_tech.glb sem __root__");
  const rootW = root.computeWorldMatrix(true).clone();
  const needed = piecesUsed(plan);
  const sources = new Map<string, Mesh>(); // chave de deduplicação → fonte
  const pieces = new Map<string, Mesh[]>(); // nome da peça (ou parte) → fontes
  for (const node of root.getChildren()) {
    if (!(node instanceof TransformNode) || !needed.has(node.name)) continue;
    const invPiece = node.computeWorldMatrix(true).clone().invert();
    const list: Mesh[] = [];
    for (const m of node.getChildMeshes(false)) {
      if (!(m instanceof Mesh) || m.getTotalVertices() === 0 || /(^|_)COL_/.test(m.name) || m.name.startsWith("COL_")) continue;
      // espaço da peça no Babylon: matriz do nó relativa à peça × conversão glTF→Babylon do __root__
      const bake = m.computeWorldMatrix(true).multiply(invPiece).multiply(rootW);
      const key = dedupKey(m, bake);
      const same = sources.get(key);
      if (same) {
        list.push(same);
        continue;
      }
      m.parent = null;
      m.position.setAll(0);
      m.rotationQuaternion = null;
      m.rotation.setAll(0);
      m.scaling.setAll(1);
      m.bakeTransformIntoVertices(bake);
      sources.set(key, m);
      list.push(m);
    }
    const split = SPLITS[node.name];
    if (split) {
      const lo: Mesh[] = [];
      const hi: Mesh[] = [];
      for (const m of list) {
        const [a, b] = splitByHeight(m, split.y, [`${m.name}#a`, `${m.name}#b`]);
        if (a) lo.push(a);
        if (b) hi.push(b);
        for (const [k, v] of sources) if (v === m) sources.delete(k);
        m.dispose(false, false);
      }
      pieces.set(split.parts[0], lo);
      pieces.set(split.parts[1], hi);
    } else pieces.set(node.name, list);
  }
  // matrizes por fonte (uma fonte pode servir a várias peças: variantes _0/_1)
  const mats = new Map<Mesh, number[]>();
  const tints = new Map<Mesh, Array<[number, number, number] | undefined>>();
  const tmp = new Matrix();
  const s = new Vector3();
  const t = new Vector3();
  const missing = new Set<string>();
  for (const inst of plan.instances) {
    const list = pieces.get(inst.piece);
    if (!list) {
      missing.add(inst.piece);
      continue;
    }
    s.set(inst.sx, inst.sy, inst.sz);
    t.set(inst.x, inst.y, inst.z);
    Matrix.ComposeToRef(s, Quaternion.RotationYawPitchRoll(inst.yaw, 0, inst.roll), t, tmp);
    for (const m of list) {
      const arr = mats.get(m) ?? [];
      for (let i = 0; i < 16; i++) arr.push(tmp.m[i]!);
      mats.set(m, arr);
      const tl = tints.get(m) ?? [];
      tl.push(inst.tint);
      tints.set(m, tl);
    }
  }
  if (missing.size) console.warn(`[setor17-kit] peças ausentes no GLB: ${[...missing].join(", ")}`);
  const used = new Set<Mesh>(mats.keys());
  const casters: AbstractMesh[] = [];
  const pieceOf = new Map<Mesh, string>();
  for (const [name, list] of pieces) for (const m of list) if (!pieceOf.has(m)) pieceOf.set(m, name);
  const maxLights = sectorMaxLights(ctx.quality);
  let instances = 0;
  let triangles = 0;
  for (const [m, arr] of mats) {
    const n = arr.length / 16;
    m.name = `kit_${m.name}`;
    m.parent = ctx.staticRoot;
    m.thinInstanceSetBuffer("matrix", new Float32Array(arr), 16, true);
    const tl = tints.get(m)!;
    if (tl.some((c) => c)) {
      const col = new Float32Array(n * 4);
      tl.forEach((c, i) => col.set(c ? [c[0], c[1], c[2], 1] : [1, 1, 1, 1], i * 4));
      m.thinInstanceSetBuffer("color", col, 4, true);
    }
    m.thinInstanceRefreshBoundingInfo(false);
    m.isPickable = false;
    m.receiveShadows = true;
    m.doNotSyncBoundingInfo = true;
    m.freezeWorldMatrix();
    if (castsShadow(pieceOf.get(m) ?? "", m)) casters.push(m);
    instances += n;
    triangles += (m.getTotalIndices() / 3) * n;
  }
  // materiais do GLB usados: mesmo ajuste dos módulos da praça e o limite de luzes do setor
  const usedMats = new Set<Material>();
  for (const m of used) if (m.material) usedMats.add(m.material);
  for (const mat of usedMats) {
    if (mat instanceof PBRMaterial) {
      mat.environmentIntensity = 0.9;
      mat.maxSimultaneousLights = maxLights;
      if (/stain/.test(mat.name)) mat.zOffset = -2; // escorridos a 4 mm da parede: sem z-fighting de longe
    }
    mat.freeze();
  }
  // descarta o resto do contêiner: nós das peças, COL_*, fontes duplicadas/sem uso, materiais e texturas sem uso
  for (const m of container.meshes) if (m instanceof Mesh && !used.has(m) && !m.isDisposed()) m.dispose(false, false);
  for (const v of sources.values()) if (!used.has(v) && !v.isDisposed()) v.dispose(false, false);
  for (const list of pieces.values()) for (const m of list) if (!used.has(m) && !m.isDisposed()) m.dispose(false, false);
  for (const n of container.transformNodes) if (!n.isDisposed()) n.dispose(false, false);
  if (!root.isDisposed()) root.dispose(false, false);
  const keepTex = new Set<BaseTexture>();
  for (const mat of usedMats) for (const tx of mat.getActiveTextures()) keepTex.add(tx);
  for (const mat of container.materials) if (!usedMats.has(mat)) mat.dispose(false, false);
  for (const tx of container.textures) if (!keepTex.has(tx)) tx.dispose();
  const meshes = [...used];
  return { meshes, shadowCasters: casters, sources: meshes.length, instances, triangles };
}

/** Kit carregou: o blockout coberto sai da cena (e da lista de sombras); placas do blockout levam material e textura. */
function dropCovered(ctx: WorldContext, covered: Mesh[]): void {
  const casters = ctx.shadowCasters;
  const signMats = new Set<Material>();
  for (const m of covered) {
    const i = casters.indexOf(m);
    if (i >= 0) casters.splice(i, 1);
    if (m.material && m.material.name.startsWith("mat_sign_")) signMats.add(m.material);
    m.dispose(false, false);
  }
  for (const mat of signMats) mat.dispose(true, true);
  covered.length = 0;
}

/** Kit falhou: o blockout coberto é fundido por material (como no `ctx.finalize`) e o setor segue em blockout. */
function mergeCovered(ctx: WorldContext, covered: Mesh[]): void {
  const casters = ctx.shadowCasters;
  const byMat = new Map<Material, Mesh[]>();
  for (const m of covered) {
    if (!m.material || m.material.name.startsWith("mat_sign_")) continue;
    const l = byMat.get(m.material) ?? [];
    l.push(m);
    byMat.set(m.material, l);
  }
  for (const [mat, list] of byMat) {
    if (list.length < 2) continue;
    const cast = list.some((m) => casters.includes(m));
    for (const m of list) {
      const i = casters.indexOf(m);
      if (i >= 0) casters.splice(i, 1);
    }
    const merged = Mesh.MergeMeshes(list, true, true, undefined, false, false);
    if (!merged) continue;
    merged.name = `lote_reserva_${mat.name}`;
    merged.material = mat;
    merged.parent = ctx.staticRoot;
    merged.receiveShadows = true;
    merged.isPickable = false;
    merged.freezeWorldMatrix();
    if (cast) casters.push(merged);
  }
}

/** Placas dos lotes na testeira da marquise da loja e pichações nas portas de galpão do kit. */
function placeKitSigns(ctx: WorldContext, plan: Sector17KitPlan): void {
  const maxLights = sectorMaxLights(ctx.quality);
  for (const s of plan.signs) {
    const mesh =
      s.kind === "placa"
        ? placeSign(ctx, s.id, { bg: s.bg ?? "#2f3a33", fg: s.fg ?? "#e8dcc0", lines: s.lines, weathered: 0.3, seed: s.seed }, { position: new Vector3(...s.position), yaw: s.yaw, width: s.width, height: s.height })
        : placeSign(ctx, s.id, { bg: "rgba(0,0,0,0)", fg: "#d8d2c2", lines: s.lines, font: `italic 900 120px "Impact", "Arial Black", sans-serif`, weathered: 0.5, seed: s.seed, pxWidth: 1024 }, { position: new Vector3(...s.position), yaw: s.yaw, width: s.width, height: s.height });
    if (mesh.material instanceof PBRMaterial) mesh.material.maxSimultaneousLights = maxLights;
  }
}

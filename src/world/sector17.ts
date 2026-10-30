import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Material } from "@babylonjs/core/Materials/material";
import type { Light } from "@babylonjs/core/Lights/light";
import { SpotLight } from "@babylonjs/core/Lights/spotLight";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { Scene } from "@babylonjs/core/scene";
import type { WorldContext } from "./context";
import type { MaterialLibrary } from "./materials";
import { SECTOR_BOUNDS, SECTOR_WALL_HEIGHT, type Rect, rectsOverlap } from "./bounds";
import { zoneById } from "./sector17Zones";
import { placeSign } from "./signage";
import { barrel, bench, bollards, cable, clothesline, crateStack, grassTuft, marketStall, rubblePile, streetLamp, tirePile, tree, warmLamp } from "./props";
import { STREET } from "./street";

/**
 * SETOR 17 — blockout do setor inteiro de São Paulo Velha em volta do quarteirão da Apuração.
 *
 * Tudo aqui é dirigido por dados (`SECTOR17`): ruas, lotes, marcos e pontos de interesse, para a
 * geometria provisória (caixas com relevo mínimo e os materiais existentes) ser trocada peça a peça
 * pelo kit `public/assets/environments/kit_tech.glb` quando ele chegar — cada lote declara o nó do
 * kit que o substitui (`kit`). Planta, nomes e coordenadas em docs/MAPA_SETOR17.md.
 *
 * Convenções: eixo X = leste, Z = norte, metros; `facing` é o lado do lote que dá para a rua.
 * O quarteirão original (rua x∈[-48,14], praça x∈[14,46], oficina) não é tocado: o setor cresce para fora.
 */

export type Facing = "N" | "S" | "E" | "W";
export type MatKey = "plaster0" | "plaster1" | "plaster2" | "plaster3" | "plaster4" | "gray" | "warm" | "sand" | "concrete" | "burnt" | "corrugated";
export type RoofItem = "caixa_dagua" | "solar" | "antena" | "varal" | "reciclador" | "mastro";
export type BlockId = "Q0" | "Q1" | "Q2" | "Q3" | "Q4" | "AV";

export interface StreetSpec {
  id: string;
  name: string;
  /** eixo ao longo do qual a rua corre */
  axis: "x" | "z";
  from: number;
  to: number;
  /** coordenada perpendicular do eixo da rua */
  at: number;
  asphaltHalf: number;
  sidewalk: number;
  /** meia-largura do canteiro central elevado (avenida) */
  median?: number;
  /** o asfalto deste eixo é contínuo nos cruzamentos (o outro eixo é interrompido) */
  continuous?: boolean;
}

export interface LotSpec {
  id: string;
  block: BlockId;
  rect: Rect;
  facing: Facing;
  floors: number;
  floorHeight?: number;
  mat: MatKey;
  ground: "door" | "shop" | "wall" | "gate";
  /** 0–1 janelas acesas */
  lit?: number;
  /** 0–1 janelas vedadas com tábuas */
  boarded?: number;
  balconies?: boolean;
  roof?: RoofItem[];
  sign?: { lines: string[]; bg?: string; fg?: string };
  graffiti?: string;
  /** escada externa até o telhado neste lado → telhado pousável, com guarda-corpo */
  stair?: Facing;
  /** nó do kit (kit_tech.glb) que substitui este blockout */
  kit: string;
  seed: number;
}

/** Pontos de interesse com posição (para a planta, HUD e testes). */
export interface PoiSpec {
  id: string;
  name: string;
  position: [number, number, number];
  block: BlockId;
  /** nó do kit que materializa este ponto, quando houver */
  kit?: string;
}

/** Telhado pousável pela aeromoto (laje com colisão, guarda-corpo e acesso por escada). */
export interface RoofSpec {
  id: string;
  rect: Rect;
  /** altura do piso do telhado (m) */
  y: number;
  access: string;
  zone: string;
}

// ---------------------------------------------------------------------------------------------------
// DADOS
// ---------------------------------------------------------------------------------------------------

export const STREETS: StreetSpec[] = [
  { id: "rua_recicladores", name: "Rua dos Recicladores", axis: "x", from: -63, to: 86.5, at: 43, asphaltHalf: 4, sidewalk: 3, continuous: true },
  { id: "rua_escola", name: "Rua da Escola", axis: "x", from: -63, to: 86.5, at: -41, asphaltHalf: 4, sidewalk: 3, continuous: true },
  { id: "av_maglev", name: "Avenida do Maglev", axis: "z", from: -76, to: 82, at: 72.5, asphaltHalf: 11, sidewalk: 3, median: 4 },
  { id: "rua_cisterna", name: "Rua da Cisterna", axis: "z", from: -45, to: 47, at: -56, asphaltHalf: 4, sidewalk: 3 },
];

/** Rua existente (street.ts), só para a planta/navmesh: x∈[-48,14], asfalto |z|<4, calçadas até |z|=7. */
export const RUA_APURACAO: StreetSpec = { id: "rua_apuracao", name: "Rua da Apuração", axis: "x", from: STREET.xWest, to: STREET.xEast, at: 0, asphaltHalf: STREET.halfWidth, sidewalk: STREET.sidewalkDepth, continuous: true };

/** Prédios do quarteirão original (Capítulo 0, worldBuilder/workshop) — nenhum lote novo pode invadi-los. */
export const Q0_EXISTING: Array<{ id: string; rect: Rect }> = [
  { id: "q0_norte", rect: { x0: -48, x1: 14, z0: 7, z1: 18 } }, // n1…n6
  { id: "q0_sul", rect: { x0: -48, x1: 14, z0: -18, z1: -7 } }, // s1, oficina, s3, s4, s5
  { id: "q0_praca_norte", rect: { x0: 14, x1: 46, z0: 18, z1: 30.5 } }, // p_norte_1 + Central (fachada GLB em z=18)
  { id: "q0_praca_sul", rect: { x0: 14, x1: 46, z0: -28, z1: -18 } }, // p_sul_1, posto médico, p_sul_2
  { id: "q0_leste", rect: { x0: 46.5, x1: 58.5, z0: 0, z1: 36 } }, // p_leste
  { id: "q0_muro_oeste", rect: { x0: -49, x1: -48, z0: -8, z1: 8 } }, // muro com entulho que fecha a rua
];

/** Muros e cercas (segmentos; `gate` = vão aberto ou fechado a `at` metros do início, com `width`). */
export interface WallSpec {
  id: string;
  from: [number, number];
  to: [number, number];
  height: number;
  thickness?: number;
  mat?: "concrete" | "concretePhoto" | "plaster2" | "metalRust";
  gate?: { at: number; width: number; open: boolean; label?: string };
}

export const WALLS: WallSpec[] = [
  // limite do setor (postos de controle da Custódia nas duas pontas da avenida)
  { id: "limite_norte_oeste", from: [-78, 82], to: [61.5, 82], height: SECTOR_WALL_HEIGHT, mat: "concretePhoto" },
  { id: "limite_norte_leste", from: [83.5, 82], to: [104, 82], height: SECTOR_WALL_HEIGHT, mat: "concretePhoto" },
  { id: "limite_sul_oeste", from: [-78, -76], to: [61.5, -76], height: SECTOR_WALL_HEIGHT, mat: "concretePhoto" },
  { id: "limite_sul_leste", from: [83.5, -76], to: [104, -76], height: SECTOR_WALL_HEIGHT, mat: "concretePhoto" },
  { id: "limite_oeste", from: [-78, -76], to: [-78, 82], height: SECTOR_WALL_HEIGHT, mat: "concretePhoto" },
  { id: "limite_leste", from: [104, -76], to: [104, 82], height: SECTOR_WALL_HEIGHT, mat: "concretePhoto" },
  // fim das ruas leste-oeste na avenida (Q2) — muros com mural
  { id: "fim_rua_escola", from: [86.5, -48], to: [86.5, -34], height: 3.0, mat: "plaster2" },
  { id: "fim_rua_recicladores", from: [86.5, 36], to: [86.5, 50], height: 3.0, mat: "plaster2" },
  // zona de distribuição (pátio cercado; portão de correr aberto de 8 m para a rua dos Recicladores)
  { id: "zd_oeste", from: [10, 50], to: [10, 82], height: 2.6, mat: "concrete" },
  { id: "zd_sul", from: [10, 50], to: [58.5, 50], height: 2.6, mat: "concrete", gate: { at: 26, width: 8, open: true, label: "ZONA DE DISTRIBUIÇÃO · SETOR 17" } },
  { id: "zd_leste", from: [58.5, 50], to: [58.5, 82], height: 2.6, mat: "concrete", gate: { at: 12, width: 6, open: false, label: "SAÍDA DE CAMINHÕES" } },
  // fundos da Central de Suprimentos (portão de serviço fechado)
  { id: "central_fundos", from: [14, 35.8], to: [46.5, 35.8], height: 2.6, mat: "concretePhoto", gate: { at: 21.5, width: 5, open: false, label: "CENTRAL DE SUPRIMENTOS · ENTRADA DE SERVIÇO" } },
  // vila dos Recicladores: lado oeste e muros entre quintais
  { id: "vila_oeste", from: [-49, 18], to: [-49, 26], height: 2.4, mat: "plaster2" },
  { id: "vila_quintal_1", from: [-38, 18], to: [-38, 26], height: 2.2, mat: "plaster2" },
  { id: "vila_quintal_2", from: [-30, 18], to: [-30, 26], height: 2.2, mat: "plaster2" },
  { id: "vila_quintal_3", from: [-27.5, 18], to: [-27.5, 26], height: 2.2, mat: "plaster2" },
  { id: "vila_quintal_4", from: [-17, 18], to: [-17, 26], height: 2.2, mat: "plaster2" },
  { id: "vila_quintal_5", from: [-6, 18], to: [-6, 26], height: 2.2, mat: "plaster2" },
  { id: "vila_quintal_6", from: [5, 18], to: [5, 26], height: 2.2, mat: "plaster2" },
  // fundos da escola e beco atrás da praça (muro para a rua da Escola; portão da escola aberto em x 6…10)
  { id: "fundos_oeste", from: [-49, -34], to: [-41, -34], height: 2.2, mat: "plaster2", gate: { at: 3, width: 3, open: false } },
  { id: "fundos_oeste_lado", from: [-49, -34], to: [-49, -18], height: 2.4, mat: "plaster2" },
  { id: "escola_fresta", from: [-15, -34], to: [-14, -34], height: 2.6, mat: "concrete" },
  { id: "escola_muro", from: [2, -34], to: [46.5, -34], height: 2.6, mat: "concrete", gate: { at: 4, width: 4, open: true, label: "ESCOLA DO SETOR · PÁTIO E QUADRA" } },
  // fundos dos lotes (separam quintais do terreno baldio até o muro do setor)
  { id: "q1_fundos_oeste", from: [-63, 62], to: [-32, 62], height: 1.8, mat: "plaster2" },
  { id: "q1_fundos_leste", from: [-20, 62], to: [10, 62], height: 1.8, mat: "plaster2" },
  { id: "q3_fundos_oeste", from: [-63, -60], to: [-10, -60], height: 1.8, mat: "plaster2" },
  { id: "q3_fundos_leste", from: [14, -60], to: [58.5, -60], height: 1.8, mat: "plaster2" },
  { id: "q3_fresta_oeste", from: [-12, -48], to: [-10, -48], height: 2.2, mat: "metalRust" },
  { id: "q3_fresta_leste", from: [14, -48], to: [16, -48], height: 2.2, mat: "metalRust" },
  { id: "q4_fresta", from: [-63, -58], to: [-63, -50], height: 2.2, mat: "metalRust" },
  // cisterna: cerca do pátio das bombas (portão fechado)
  { id: "cisterna_frente", from: [-63, -16], to: [-63, 16], height: 2.2, mat: "metalRust", gate: { at: 14, width: 4, open: false, label: "CISTERNA DO SETOR · ÁGUA 3ª E 6ª" } },
];

const F = 3.1; // pé-direito padrão dos blocos antigos

export const LOTS: LotSpec[] = [
  // --- Q0 · Vila dos Recicladores (fundos da rua da Apuração, frente para a rua dos Recicladores, z=36) ----
  { id: "vn1", block: "Q0", rect: { x0: -49, x1: -38, z0: 26, z1: 36 }, facing: "N", floors: 2, mat: "plaster3", ground: "door", lit: 0.3, roof: ["caixa_dagua", "reciclador"], kit: "FACHADA_SOBRADO_11M", seed: 501 },
  { id: "vn2", block: "Q0", rect: { x0: -38, x1: -30, z0: 26, z1: 36 }, facing: "N", floors: 3, mat: "sand", ground: "shop", lit: 0.2, sign: { lines: ["BICICLETARIA · TROCA DE BATERIAS"], bg: "#1d2a3a" }, kit: "FACHADA_LOJA_8M", seed: 502 },
  { id: "vn3", block: "Q0", rect: { x0: -27.5, x1: -17, z0: 26, z1: 36 }, facing: "N", floors: 2, mat: "plaster4", ground: "door", roof: ["varal"], kit: "FACHADA_SOBRADO_11M", seed: 503 },
  { id: "vn4", block: "Q0", rect: { x0: -17, x1: -6, z0: 26, z1: 36 }, facing: "N", floors: 3, mat: "warm", ground: "shop", lit: 0.35, roof: ["solar"], sign: { lines: ["PADARIA COMUNITÁRIA", "PÃO DE COTA · 6H"], bg: "#3b2a1a" }, kit: "FACHADA_LOJA_11M", seed: 504 },
  { id: "vn5", block: "Q0", rect: { x0: -6, x1: 5, z0: 26, z1: 36 }, facing: "N", floors: 2, mat: "plaster0", ground: "door", boarded: 0.4, roof: ["antena"], graffiti: "ÁGUA É DE TODOS", kit: "FACHADA_SOBRADO_11M", seed: 505 },
  { id: "vn6", block: "Q0", rect: { x0: 5, x1: 14, z0: 26, z1: 36 }, facing: "N", floors: 3, mat: "gray", ground: "door", lit: 0.25, roof: ["caixa_dagua"], kit: "FACHADA_SOBRADO_8M", seed: 506 },
  // --- Q1 · quarteirão da Distribuição (frente para a rua dos Recicladores, z=50) -------------------
  { id: "q1a", block: "Q1", rect: { x0: -63, x1: -50, z0: 50, z1: 62 }, facing: "S", floors: 2, mat: "warm", ground: "shop", lit: 0.4, sign: { lines: ["COZINHA COMUNITÁRIA", "ALMOÇO · 11H ÀS 13H"], bg: "#2f4a3e" }, kit: "FACHADA_LOJA_11M", seed: 601 },
  { id: "q1b", block: "Q1", rect: { x0: -50, x1: -40, z0: 50, z1: 62 }, facing: "S", floors: 3, mat: "plaster1", ground: "door", boarded: 0.3, roof: ["varal"], kit: "FACHADA_SOBRADO_11M", seed: 602 },
  { id: "q1c", block: "Q1", rect: { x0: -40, x1: -32, z0: 50, z1: 62 }, facing: "S", floors: 2, mat: "burnt", ground: "wall", kit: "FACHADA_QUEIMADA_8M", seed: 603 },
  { id: "q1d", block: "Q1", rect: { x0: -20, x1: -8, z0: 50, z1: 62 }, facing: "S", floors: 4, mat: "gray", ground: "door", balconies: true, lit: 0.3, roof: ["solar", "antena"], kit: "FACHADA_PREDIO_12M", seed: 604 },
  { id: "q1e", block: "Q1", rect: { x0: -8, x1: 2, z0: 50, z1: 62 }, facing: "S", floors: 3, mat: "plaster0", ground: "shop", lit: 0.5, roof: ["mastro"], sign: { lines: ["RÁDIO DO SETOR", "BOLETINS 7H · 12H · 18H"], bg: "#1d2a3a" }, kit: "FACHADA_LOJA_11M", seed: 605 },
  { id: "q1f", block: "Q1", rect: { x0: 2, x1: 10, z0: 50, z1: 62 }, facing: "S", floors: 2, mat: "plaster3", ground: "door", roof: ["caixa_dagua"], kit: "FACHADA_SOBRADO_8M", seed: 606 },
  // --- Q2 · quarteirão do Mercado (frente para a avenida, x=86.5) ---------------------------------
  { id: "q2a", block: "Q2", rect: { x0: 86.5, x1: 100.5, z0: -76, z1: -60 }, facing: "W", floors: 3, mat: "plaster4", ground: "wall", boarded: 0.5, kit: "FACHADA_PREDIO_16M", seed: 701 },
  { id: "q2b", block: "Q2", rect: { x0: 86.5, x1: 100.5, z0: -60, z1: -48 }, facing: "W", floors: 2, mat: "sand", ground: "shop", sign: { lines: ["FERRO-VELHO · PEÇAS · BATERIAS"], bg: "#3a3a36" }, kit: "FACHADA_LOJA_11M", seed: 702 },
  { id: "q2c", block: "Q2", rect: { x0: 86.5, x1: 100.5, z0: -34, z1: -20 }, facing: "W", floors: 4, mat: "gray", ground: "door", balconies: true, lit: 0.25, roof: ["caixa_dagua", "varal"], kit: "FACHADA_PREDIO_12M", seed: 703 },
  { id: "q2d", block: "Q2", rect: { x0: 86.5, x1: 100.5, z0: -20, z1: -4 }, facing: "W", floors: 1, floorHeight: 5.6, mat: "corrugated", ground: "shop", sign: { lines: ["MERCADO COBERTO DO 17", "FEIRA · 3ª · 5ª · SÁBADO"], bg: "#2f3a33" }, kit: "FACHADA_GALPAO_16M", seed: 704 },
  { id: "q2e", block: "Q2", rect: { x0: 86.5, x1: 100.5, z0: -4, z1: 12 }, facing: "W", floors: 3, mat: "warm", ground: "door", roof: ["varal", "solar"], kit: "FACHADA_SOBRADO_11M", seed: 705 },
  { id: "q2f", block: "Q2", rect: { x0: 86.5, x1: 100.5, z0: 12, z1: 36 }, facing: "W", floors: 5, mat: "plaster1", ground: "door", boarded: 0.3, lit: 0.2, balconies: true, roof: ["antena", "caixa_dagua"], kit: "FACHADA_PREDIO_16M", seed: 706 },
  { id: "q2g", block: "Q2", rect: { x0: 86.5, x1: 100.5, z0: 50, z1: 66 }, facing: "W", floors: 2, mat: "burnt", ground: "wall", kit: "FACHADA_QUEIMADA_16M", seed: 707 },
  { id: "q2h", block: "Q2", rect: { x0: 86.5, x1: 100.5, z0: 66, z1: 82 }, facing: "W", floors: 3, mat: "plaster2", ground: "door", roof: ["caixa_dagua"], kit: "FACHADA_SOBRADO_11M", seed: 708 },
  // --- Q3 · quarteirão do Terminal (frente para a rua da Escola, z=-48) ---------------------------
  { id: "q3a", block: "Q3", rect: { x0: -63, x1: -50, z0: -60, z1: -48 }, facing: "N", floors: 2, mat: "plaster2", ground: "door", roof: ["varal"], kit: "FACHADA_SOBRADO_11M", seed: 801 },
  { id: "q3b", block: "Q3", rect: { x0: -50, x1: -38, z0: -60, z1: -48 }, facing: "N", floors: 3, mat: "warm", ground: "shop", lit: 0.3, sign: { lines: ["LAVANDERIA COMUNITÁRIA", "ÁGUA RACIONADA · 3ª E 6ª"], bg: "#2a5a3a" }, kit: "FACHADA_LOJA_11M", seed: 802 },
  { id: "q3c", block: "Q3", rect: { x0: -38, x1: -26, z0: -60, z1: -48 }, facing: "N", floors: 3, mat: "plaster0", ground: "door", boarded: 0.35, kit: "FACHADA_SOBRADO_11M", seed: 803 },
  { id: "q3d", block: "Q3", rect: { x0: -26, x1: -12, z0: -60, z1: -48 }, facing: "N", floors: 4, mat: "gray", ground: "door", balconies: true, lit: 0.3, roof: ["caixa_dagua", "antena"], kit: "FACHADA_PREDIO_12M", seed: 804 },
  { id: "q3e", block: "Q3", rect: { x0: 16, x1: 30, z0: -60, z1: -48 }, facing: "N", floors: 2, mat: "plaster4", ground: "wall", boarded: 0.6, graffiti: "QUEM DECIDE?", kit: "FACHADA_SOBRADO_11M", seed: 805 },
  { id: "q3f", block: "Q3", rect: { x0: 30, x1: 44, z0: -60, z1: -48 }, facing: "N", floors: 3, mat: "sand", ground: "door", lit: 0.25, roof: ["solar"], kit: "FACHADA_SOBRADO_11M", seed: 806 },
  { id: "q3g", block: "Q3", rect: { x0: 44, x1: 58.5, z0: -60, z1: -48 }, facing: "N", floors: 3, mat: "plaster3", ground: "shop", sign: { lines: ["OFICINA DE BICICLETAS E TRICICLOS"], bg: "#3a3a36" }, kit: "FACHADA_LOJA_11M", seed: 807 },
  // --- Q4 · quarteirão da Cisterna (frente para a rua da Cisterna, x=-63) --------------------------
  { id: "q4a", block: "Q4", rect: { x0: -75, x1: -63, z0: -76, z1: -58 }, facing: "E", floors: 3, mat: "plaster1", ground: "wall", boarded: 0.4, kit: "FACHADA_PREDIO_16M", seed: 901 },
  { id: "q4b", block: "Q4", rect: { x0: -75, x1: -63, z0: -50, z1: -32 }, facing: "E", floors: 2, mat: "sand", ground: "door", graffiti: "A MÃE PROVÊ?", roof: ["caixa_dagua"], kit: "FACHADA_SOBRADO_16M", seed: 902 },
  { id: "q4c", block: "Q4", rect: { x0: -75, x1: -63, z0: -32, z1: -16 }, facing: "E", floors: 3, mat: "plaster0", ground: "shop", lit: 0.4, sign: { lines: ["BAR DO SETOR · SELOS E ESCAMBO"], bg: "#3b2a1a" }, kit: "FACHADA_LOJA_16M", seed: 903 },
  { id: "q4d", block: "Q4", rect: { x0: -75, x1: -63, z0: 16, z1: 34 }, facing: "E", floors: 2, mat: "plaster3", ground: "door", roof: ["varal"], kit: "FACHADA_SOBRADO_16M", seed: 904 },
  { id: "q4e", block: "Q4", rect: { x0: -75, x1: -63, z0: 34, z1: 52 }, facing: "E", floors: 3, mat: "gray", ground: "wall", boarded: 0.3, kit: "FACHADA_PREDIO_16M", seed: 905 },
  { id: "q4f", block: "Q4", rect: { x0: -75, x1: -63, z0: 52, z1: 70 }, facing: "E", floors: 2, mat: "warm", ground: "door", lit: 0.3, roof: ["solar"], kit: "FACHADA_SOBRADO_16M", seed: 906 },
  { id: "q4g", block: "Q4", rect: { x0: -75, x1: -63, z0: 70, z1: 82 }, facing: "E", floors: 3, mat: "plaster4", ground: "wall", kit: "FACHADA_PREDIO_12M", seed: 907 },
];

/** Volumes reservados para os marcos monumentais e as peças especiais (o kit entra pelo nome). */
export const LANDMARKS: Array<{ id: string; block: BlockId; rect: Rect; height: number; kit: string; name: string; /** apoiado sobre outro volume (não conta na sobreposição em planta) */ stacked?: boolean }> = [
  { id: "deposito", block: "Q1", rect: { x0: 24, x1: 45, z0: 58, z1: 73 }, height: 6.8, kit: "TECH_GALPAO_20X14", name: "Depósito da zona de distribuição" },
  { id: "torre", block: "Q1", rect: { x0: -32, x1: -20, z0: 54, z1: 66 }, height: 34, kit: "MARCO_TORRE_BASE_12M", name: "Torre Verde (fazenda vertical meio ocupada)" },
  { id: "escola_bloco", block: "Q0", rect: { x0: -14, x1: 2, z0: -34, z1: -24 }, height: 7.0, kit: "TECH_ANEXO_MODULAR_16X10", name: "Escola do Setor — bloco de salas" },
  { id: "quadra", block: "Q0", rect: { x0: -41, x1: -15, z0: -33.5, z1: -19 }, height: 4, kit: "PROP_ALAMBRADO", name: "Quadra da escola" },
  { id: "posto_fundos", block: "Q0", rect: { x0: 22, x1: 27, z0: -32, z1: -28 }, height: 3.2, kit: "TECH_ANEXO_MODULAR_5X4", name: "Posto médico — consultório dos fundos" },
  { id: "canopy", block: "Q3", rect: { x0: -10, x1: 14, z0: -62, z1: -50 }, height: 6.4, kit: "MARCO_CANOPY_SOLAR_24X12", name: "Canopy solar do terminal de recarga" },
  { id: "cisterna", block: "Q4", rect: { x0: -75, x1: -63, z0: -16, z1: 16 }, height: 18, kit: "MARCO_CAIXA_DAGUA", name: "Cisterna e estação de bombeamento" },
  { id: "antena_central", block: "Q0", rect: { x0: 40, x1: 42, z0: 24, z1: 26 }, height: 22, kit: "MARCO_ANTENA_CENTRAL", name: "Antena da Central de Suprimentos (no telhado da Central)", stacked: true },
];

/** Segmentos do viaduto do maglev (24 m cada) na Avenida do Maglev: pilar em z0, tabuleiro até z1. */
export const VIADUCT = {
  x: 72.5,
  deckWidth: 8,
  deckBottom: 10,
  deckThickness: 2,
  pillarSize: 1.6,
  segmentLength: 24,
  /** pilares existentes (z) */
  pillars: [-72, -48, -24, 0, 24, 48, 72],
  /** segmentos de tabuleiro presentes [zIni, zFim]; o trecho sul (-72…-48) caiu — "viaduto morto" */
  decks: [[-48, -24], [-24, 0], [0, 24], [24, 48], [48, 72]] as Array<[number, number]>,
  kit: "MARCO_VIADUTO_MAGLEV_24M",
} as const;

export const ROOFS: RoofSpec[] = [
  { id: "telhado_escola", rect: { x0: -14, x1: 2, z0: -34, z1: -24 }, y: 7.0, access: "escada externa no lado leste (pátio)", zone: "zona.telhado_escola" },
  { id: "telhado_deposito", rect: { x0: 24, x1: 45, z0: 58, z1: 73 }, y: 6.8, access: "escada metálica externa no lado oeste (pátio da zona de distribuição)", zone: "zona.telhado_deposito" },
  { id: "telhado_canopy", rect: { x0: -10, x1: 14, z0: -62, z1: -50 }, y: 6.4, access: "escada de manutenção no pilar sudoeste", zone: "zona.telhado_canopy" },
];

export const POIS: PoiSpec[] = [
  { id: "deposito", name: "Depósito da zona de distribuição (interior 20×14 m)", position: [34.5, 0.12, 65.5], block: "Q1", kit: "TECH_GALPAO_20X14" },
  { id: "deposito_porta", name: "Portão do depósito (5 m, a van cabe)", position: [33.5, 0.12, 58], block: "Q1" },
  { id: "distribuicao_portao", name: "Portão da zona de distribuição (rua dos Recicladores)", position: [40, 0.12, 50], block: "Q1", kit: "PROP_PORTAO_CORRER" },
  { id: "escola_entrada", name: "Escola — portão do pátio (rua da Escola)", position: [8, 0.12, -34], block: "Q0", kit: "PROP_PORTAO_GRADE" },
  { id: "escola_salas", name: "Escola — bloco de salas (entrada pelo pátio)", position: [-6, 0.12, -24], block: "Q0" },
  { id: "quadra_portao_sul", name: "Quadra — portão da rua", position: [-28.5, 0.12, -33.5], block: "Q0" },
  { id: "quadra_portao_leste", name: "Quadra — portão do pátio", position: [-15, 0.12, -25], block: "Q0" },
  { id: "posto_raquel", name: "Posto médico comunitário (porta da praça)", position: [24.4, 0.12, -18], block: "Q0" },
  { id: "posto_raquel_fundos", name: "Consultório da Raquel (fundos, pelo beco)", position: [24.5, 0.12, -32], block: "Q0" },
  { id: "banca", name: "Banca do mercado — feira do viaduto", position: [72.5, 0.15, -14], block: "AV", kit: "PROP_BANCA_FEIRA" },
  { id: "largo", name: "Largo do Mercado (saída sudeste da praça)", position: [52.5, 0.12, -17], block: "Q0" },
  { id: "torre", name: "Torre Verde — base de 12 m", position: [-26, 0.12, 60], block: "Q1", kit: "MARCO_TORRE_BASE_12M" },
  { id: "canopy", name: "Canopy solar do terminal", position: [2, 0.12, -56], block: "Q3", kit: "MARCO_CANOPY_SOLAR_24X12" },
  { id: "cisterna", name: "Cisterna do setor", position: [-70, 0.12, 0], block: "Q4", kit: "MARCO_CAIXA_DAGUA" },
  { id: "limite_norte", name: "Posto de controle norte (saída para a Estação Nove)", position: [72.5, 0.12, 80], block: "AV", kit: "PROP_CANCELA" },
  { id: "limite_sul", name: "Posto de controle sul", position: [72.5, 0.12, -74], block: "AV", kit: "PROP_CANCELA" },
  { id: "rastro_telhado_escola", name: "Pouso da Rastro — telhado da escola", position: [-6, 7.0, -29], block: "Q0" },
];

/**
 * Rota da van (Módulo V-7, 1,9 m de largura) do portão da Central à oficina e ao depósito: pontos (x, z) e
 * folga lateral mínima exigida até a construção mais próxima (`clearanceAt`). Pontos `interior` ficam dentro
 * do depósito e são conferidos pela largura do corredor entre prateleiras (`DEPOSITO.aisle`).
 */
export const VAN_ROUTE: Array<{ name: string; x: number; z: number; clearance: number; interior?: boolean }> = [
  { name: "portão da Central", x: 34, z: 13, clearance: 4.5 },
  { name: "praça (centro-sul)", x: 30, z: -4, clearance: 10 },
  { name: "boca da rua da Apuração", x: 12, z: 0, clearance: 6 },
  { name: "frente da oficina", x: -30, z: -2.5, clearance: 4 },
  { name: "volta pela praça", x: 24, z: -8, clearance: 8 },
  { name: "Largo do Mercado", x: 52.5, z: -9, clearance: 5 },
  { name: "Avenida do Maglev (pista oeste)", x: 65, z: 20, clearance: 5 },
  { name: "Avenida × rua dos Recicladores", x: 65, z: 43, clearance: 6 },
  { name: "rua dos Recicladores (oeste)", x: 48, z: 43, clearance: 6 },
  { name: "portão da zona de distribuição", x: 40, z: 50, clearance: 3.5 },
  { name: "pátio da zona de distribuição", x: 36, z: 54.5, clearance: 3 },
  { name: "porta do depósito", x: 33.5, z: 58, clearance: 2.4, interior: true },
  { name: "dentro do depósito", x: 33.5, z: 64, clearance: 2.4, interior: true },
];

/** Depósito: caixa externa 21×15 m, interior 20,2×14,2 m, porta de 5 m ao sul, corredor central para a van. */
export const DEPOSITO = {
  rect: { x0: 24, x1: 45, z0: 58, z1: 73 } as Rect,
  wall: 0.4,
  height: 6.5,
  door: { x0: 31, x1: 36, height: 4.2 },
  /** corredor livre entre as prateleiras (x) */
  aisle: { x0: 29.6, x1: 37.4 },
  shelves: [
    { x0: 24.6, x1: 29.6, z0: 61, z1: 67 },
    { x0: 24.6, x1: 29.6, z0: 67.8, z1: 72.4 },
    { x0: 37.4, x1: 42.4, z0: 61, z1: 67 },
  ] as Rect[],
  office: { x0: 39.5, x1: 44.4, z0: 68.2, z1: 72.4 } as Rect,
} as const;

/** Escola: bloco de salas (2 pavimentos, telhado acessível), pátio e quadra cercada. */
export const ESCOLA = {
  bloco: { x0: -14, x1: 2, z0: -34, z1: -24 } as Rect,
  floorHeight: 3.2,
  wall: 0.25,
  /** porta do bloco (na face norte, para o pátio) */
  door: { x: -6, width: 1.4 },
  corridor: { z0: -26.2, z1: -24.25 },
  salas: [
    { x0: -13.75, x1: -6.6, z0: -33.75, z1: -26.4 },
    { x0: -5.4, x1: 1.75, z0: -33.75, z1: -26.4 },
  ] as Rect[],
  stair: { x0: 2, x1: 3.4, z0: -33.6, z1: -25.2 },
  quadra: { x0: -41, x1: -15, z0: -33.5, z1: -19 } as Rect,
  quadraGates: [
    { side: "S", x0: -30, x1: -27 },
    { side: "E", z0: -26, z1: -24 },
  ],
  patio: { x0: 2, x1: 14, z0: -34, z1: -18 } as Rect,
} as const;

/** Becos para a furtividade da M3 (duas rotas alternativas até a quadra) e demais passagens estreitas. */
export const ALLEYS: Array<{ id: string; name: string; rect: Rect; width: number }> = [
  { id: "beco_praca", name: "Beco atrás da praça (Largo → pátio da escola)", rect: { x0: 14, x1: 46.5, z0: -34, z1: -28 }, width: 6 },
  { id: "beco_praca_pinch", name: "Estreitamento junto ao consultório", rect: { x0: 22, x1: 27, z0: -34, z1: -32 }, width: 2 },
  { id: "beco_vila", name: "Beco da Vila dos Recicladores (sem saída)", rect: { x0: -30, x1: -27.5, z0: 18, z1: 36 }, width: 2.5 },
  { id: "patio_escola", name: "Pátio da escola (faixa atrás do bloco)", rect: { x0: -15, x1: 14, z0: -24, z1: -18 }, width: 6 },
];

export const SECTOR17 = { bounds: SECTOR_BOUNDS, streets: STREETS, lots: LOTS, landmarks: LANDMARKS, roofs: ROOFS, pois: POIS, vanRoute: VAN_ROUTE, alleys: ALLEYS, viaduct: VIADUCT } as const;

// ---------------------------------------------------------------------------------------------------
// GEOMETRIA AUXILIAR (pura; usada também pelos testes)
// ---------------------------------------------------------------------------------------------------

/** Faixa de domínio (asfalto + calçadas) de uma rua no eixo perpendicular. */
export function streetRightOfWay(s: StreetSpec): [number, number] {
  return [s.at - s.asphaltHalf - s.sidewalk, s.at + s.asphaltHalf + s.sidewalk];
}

export function streetAsphalt(s: StreetSpec): [number, number] {
  return [s.at - s.asphaltHalf, s.at + s.asphaltHalf];
}

/** Retângulo (mundo) da rua inteira incluindo calçadas. */
export function streetRect(s: StreetSpec): Rect {
  const [p0, p1] = streetRightOfWay(s);
  return s.axis === "x" ? { x0: s.from, x1: s.to, z0: p0, z1: p1 } : { x0: p0, x1: p1, z0: s.from, z1: s.to };
}

/** Subtrai intervalos de um intervalo (lista ordenada de segmentos restantes). */
export function subtractIntervals(range: [number, number], cuts: Array<[number, number]>): Array<[number, number]> {
  let segs: Array<[number, number]> = [range];
  for (const [c0, c1] of cuts) {
    const next: Array<[number, number]> = [];
    for (const [a, b] of segs) {
      if (c1 <= a || c0 >= b) next.push([a, b]);
      else {
        if (c0 > a) next.push([a, c0]);
        if (c1 < b) next.push([c1, b]);
      }
    }
    segs = next;
  }
  return segs.filter(([a, b]) => b - a > 0.05);
}

/** Ruas que cruzam `s` (eixo oposto) dentro da extensão de `s`. */
export function crossingStreets(s: StreetSpec, all: StreetSpec[] = STREETS): StreetSpec[] {
  return all.filter((o) => o.axis !== s.axis && o.from <= s.at + 0.01 && o.to >= s.at - 0.01 && streetRightOfWay(o)[1] > s.from && streetRightOfWay(o)[0] < s.to);
}

/** As ruas formam uma malha conexa? (grafo de cruzamentos) */
export function streetsConnected(all: StreetSpec[] = STREETS): boolean {
  if (all.length === 0) return true;
  const seen = new Set<string>([all[0]!.id]);
  const stack = [all[0]!];
  while (stack.length) {
    const s = stack.pop()!;
    for (const o of crossingStreets(s, all)) {
      if (!seen.has(o.id)) {
        seen.add(o.id);
        stack.push(o);
      }
    }
  }
  return seen.size === all.length;
}

/** Todos os retângulos ocupados por construção em planta (lotes + marcos não empilhados + quarteirão original). */
export function occupiedRects(): Array<{ id: string; rect: Rect }> {
  return [...LOTS.map((l) => ({ id: l.id, rect: l.rect })), ...LANDMARKS.filter((l) => !l.stacked).map((l) => ({ id: l.id, rect: l.rect })), ...Q0_EXISTING];
}

/** Pares de retângulos ocupados que se sobrepõem (deve ser vazio). */
export function overlappingPairs(): Array<[string, string]> {
  const rects = occupiedRects();
  const out: Array<[string, string]> = [];
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) if (rectsOverlap(rects[i]!.rect, rects[j]!.rect)) out.push([rects[i]!.id, rects[j]!.id]);
  return out;
}

/** Lotes/marcos que invadem o domínio de alguma rua (deve ser vazio). */
export function lotsOnStreets(): string[] {
  const roads = [...STREETS, RUA_APURACAO].map(streetRect);
  return occupiedRects()
    .filter((r) => roads.some((road) => rectsOverlap(r.rect, road)))
    .map((r) => r.id);
}

/** Retângulo (em planta) de um muro, descontando o vão do portão quando aberto. */
export function wallRects(w: WallSpec): Rect[] {
  const t = (w.thickness ?? 0.25) / 2;
  const [x0, z0] = w.from;
  const [x1, z1] = w.to;
  const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
  const segs: Array<[number, number]> = alongX ? [[Math.min(x0, x1), Math.max(x0, x1)]] : [[Math.min(z0, z1), Math.max(z0, z1)]];
  const cut = w.gate && w.gate.open ? subtractIntervals(segs[0]!, [[segs[0]![0] + w.gate.at, segs[0]![0] + w.gate.at + w.gate.width]]) : segs;
  return cut.map(([a, b]) => (alongX ? { x0: a, x1: b, z0: z0 - t, z1: z0 + t } : { x0: x0 - t, x1: x0 + t, z0: a, z1: b }));
}

/**
 * Folga lateral (m) para um ponto (x, z) da rota da van: distância à construção mais próxima (lotes,
 * marcos, quarteirão original, muros e pilares do viaduto), limitada a 30 m.
 */
export function clearanceAt(x: number, z: number): number {
  let best = 30;
  const distRect = (rect: Rect) => Math.hypot(Math.max(rect.x0 - x, 0, x - rect.x1), Math.max(rect.z0 - z, 0, z - rect.z1));
  for (const { rect } of occupiedRects()) best = Math.min(best, distRect(rect));
  for (const w of WALLS) for (const r of wallRects(w)) best = Math.min(best, distRect(r));
  const hp = VIADUCT.pillarSize / 2;
  for (const pz of VIADUCT.pillars) best = Math.min(best, distRect({ x0: VIADUCT.x - hp, x1: VIADUCT.x + hp, z0: pz - hp, z1: pz + hp }));
  const b = SECTOR_BOUNDS;
  return Math.min(best, x - b.x0, b.x1 - x, z - b.z0, b.z1 - z);
}

// ---------------------------------------------------------------------------------------------------
// CONSTRUÇÃO (blockout com os materiais existentes; tudo fundido por material em ctx.finalize)
// ---------------------------------------------------------------------------------------------------

function rnd(seed: number, i: number): number {
  const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function matOf(mats: MaterialLibrary, key: MatKey): Material {
  switch (key) {
    case "plaster0":
      return mats.plaster[0]!;
    case "plaster1":
      return mats.plaster[1]!;
    case "plaster2":
      return mats.plaster[2]!;
    case "plaster3":
      return mats.plaster[3]!;
    case "plaster4":
      return mats.plaster[4]!;
    case "gray":
      return mats.plasterPhoto.gray;
    case "warm":
      return mats.plasterPhoto.warm;
    case "sand":
      return mats.plasterPhoto.sand;
    case "concrete":
      return mats.concretePhoto;
    case "burnt":
      return mats.burnt;
    case "corrugated":
      return mats.corrugated;
  }
}

/** yaw de placa (placeSign: 0 = frente para -Z) para a frente olhar na direção `facing`. */
function signYaw(facing: Facing): number {
  return facing === "N" ? Math.PI : facing === "S" ? 0 : facing === "E" ? -Math.PI / 2 : Math.PI / 2;
}

/**
 * Sistema de coordenadas de uma fachada: `u` ao longo da frente (a partir do canto esquerdo visto da
 * rua), `w` para fora (positivo = rua), `y` altura. Converte caixas locais em caixas do mundo.
 */
class Facade {
  readonly width: number;
  readonly depth: number;
  readonly out: Facing;
  constructor(
    readonly rect: Rect,
    facing: Facing,
  ) {
    this.out = facing;
    const alongX = facing === "N" || facing === "S";
    this.width = alongX ? rect.x1 - rect.x0 : rect.z1 - rect.z0;
    this.depth = alongX ? rect.z1 - rect.z0 : rect.x1 - rect.x0;
  }
  /** ponto do mundo para (u, y, w) — w medido a partir do plano da fachada, positivo para a rua */
  at(u: number, y: number, w: number): Vector3 {
    const r = this.rect;
    switch (this.out) {
      case "N":
        return new Vector3(r.x0 + u, y, r.z1 + w);
      case "S":
        return new Vector3(r.x1 - u, y, r.z0 - w);
      case "E":
        return new Vector3(r.x1 + w, y, r.z1 - u);
      case "W":
        return new Vector3(r.x0 - w, y, r.z0 + u);
    }
  }
  /** tamanho de caixa (largura ao longo da fachada, altura, profundidade para fora) no mundo */
  size(u: number, h: number, w: number): { w: number; h: number; d: number } {
    return this.out === "N" || this.out === "S" ? { w: u, h, d: w } : { w, h, d: u };
  }
  /** centro do volume do lote */
  center(y: number): Vector3 {
    return new Vector3((this.rect.x0 + this.rect.x1) / 2, y, (this.rect.z0 + this.rect.z1) / 2);
  }
}

function box(ctx: WorldContext, id: string, f: Facade, u: number, y: number, w: number, su: number, sh: number, sw: number, mat: Material, o: { collider?: boolean; shadow?: boolean; cameraBlocker?: boolean } = {}) {
  return ctx.box(id, f.size(su, sh, sw), f.at(u, y, w), mat, o);
}

// ---------------------------------------------------------------------------------------------------
// Ruas
// ---------------------------------------------------------------------------------------------------

function buildStreets(ctx: WorldContext): void {
  const { mats } = ctx;
  const curb = STREET.curbHeight;
  const slab = (id: string, rect: Rect, y: number, h: number, mat: Material, collider: boolean) =>
    ctx.box(id, { w: rect.x1 - rect.x0, h, d: rect.z1 - rect.z0 }, new Vector3((rect.x0 + rect.x1) / 2, y, (rect.z0 + rect.z1) / 2), mat, { collider, shadow: false, cameraBlocker: false });
  const asRect = (s: StreetSpec, along: [number, number], across: [number, number]): Rect =>
    s.axis === "x" ? { x0: along[0], x1: along[1], z0: across[0], z1: across[1] } : { x0: across[0], x1: across[1], z0: along[0], z1: along[1] };

  for (const s of STREETS) {
    const crossing = crossingStreets(s);
    const cutsAsphalt = crossing.filter((o) => (o.continuous ?? false) && !(s.continuous ?? false)).map(streetAsphalt);
    const cutsRow = crossing.map(streetAsphalt); // calçadas param no asfalto das ruas que cruzam
    const [a0, a1] = streetAsphalt(s);
    // asfalto (contínuo ou em segmentos entre os cruzamentos)
    for (const [i, seg] of subtractIntervals([s.from, s.to], cutsAsphalt).entries()) {
      const r = asRect(s, seg, [a0, a1]);
      ctx.ground(`s17_${s.id}_asfalto_${i}`, { w: r.x1 - r.x0, h: r.z1 - r.z0 }, new Vector3((r.x0 + r.x1) / 2, 0.005 + (s.continuous ? 0 : 0.002), (r.z0 + r.z1) / 2), mats.asphalt, 2);
    }
    // calçadas dos dois lados, interrompidas pelo asfalto das transversais que de fato chegam até ali
    for (const side of [-1, 1]) {
      const inner = s.at + side * s.asphaltHalf;
      const outer = inner + side * s.sidewalk;
      const across: [number, number] = [Math.min(inner, outer), Math.max(inner, outer)];
      const cuts = crossing.filter((o) => o.from <= across[0] + 0.01 && o.to >= across[1] - 0.01).map(streetAsphalt);
      for (const [i, seg] of subtractIntervals([s.from, s.to], cuts).entries()) {
        slab(`s17_${s.id}_calcada_${side}_${i}`, asRect(s, seg, across), curb / 2, curb, mats.sidewalk, true);
      }
    }
    // canteiro central elevado (avenida), interrompido com folga de 3 m nos cruzamentos
    if (s.median) {
      const cuts = cutsRow.map(([c0, c1]) => [c0 - 3, c1 + 3] as [number, number]);
      for (const [i, seg] of subtractIntervals([s.from + 2, s.to - 2], cuts).entries()) {
        slab(`s17_${s.id}_canteiro_${i}`, asRect(s, seg, [s.at - s.median, s.at + s.median]), 0.075, 0.15, mats.pavingStones, true);
      }
    }
    // marcação central desbotada e faixas de pedestre nos cruzamentos
    if (!s.median) {
      for (let p = s.from + 6; p < s.to - 6; p += 7) {
        if (cutsRow.some(([c0, c1]) => p > c0 - 3 && p < c1 + 3)) continue;
        const r = asRect(s, [p - 1.1, p + 1.1], [s.at - 0.08, s.at + 0.08]);
        slab(`s17_${s.id}_eixo_${p}`, r, 0.012, 0.01, mats.paperWhite, false);
      }
    }
    for (const [c0, c1] of cutsRow) {
      for (const edge of [c0 - 2.2, c1 + 2.2]) {
        if (edge < s.from + 1 || edge > s.to - 1) continue;
        for (let k = 0; k < Math.floor((a1 - a0) / 1.0); k++) {
          const across: [number, number] = [a0 + 0.25 + k, a0 + 0.75 + k];
          slab(`s17_${s.id}_faixa_${edge}_${k}`, asRect(s, [edge - 0.6, edge + 0.6], across), 0.012, 0.01, mats.paperWhite, false);
        }
      }
    }
    // bueiros e poças
    for (let p = s.from + 9; p < s.to - 4; p += 23) {
      const side = (Math.round(p / 23) % 2 === 0 ? 1 : -1) * (s.asphaltHalf - 0.7);
      const c = s.axis === "x" ? new Vector3(p, 0.014, s.at + side) : new Vector3(s.at + side, 0.014, p);
      ctx.cylinder(`s17_${s.id}_bueiro_${p}`, { height: 0.02, diameter: 0.8, tessellation: 12 }, c, mats.metalDark, { shadow: false });
    }
    for (let p = s.from + 15; p < s.to - 8; p += 31) {
      const r = asRect(s, [p - 1.8, p + 1.8], [s.at - 1.4 + (Math.round(p) % 3), s.at + 0.6 + (Math.round(p) % 3)]);
      slab(`s17_${s.id}_poca_${p}`, r, 0.014, 0.006, mats.puddle, false);
    }
  }

  // Postes a cada ~22 m, alternando o lado; energia parcial: a maioria apagada
  const lampSpots: Array<{ id: string; pos: Vector3; facingX: number; state: "on" | "off" | "flicker" }> = [];
  let n = 0;
  for (const s of STREETS) {
    const inner = s.asphaltHalf + 0.9;
    for (let p = s.from + 8; p < s.to - 4; p += 22) {
      const side = n % 2 === 0 ? 1 : -1;
      const state: "on" | "off" | "flicker" = n % 4 === 1 ? "on" : n % 7 === 3 ? "flicker" : "off";
      const pos = s.axis === "x" ? new Vector3(p, curb, s.at + side * inner) : new Vector3(s.at + side * inner, curb, p);
      // o braço aponta para a pista: em ruas E-O o poste é construído ao longo de X; giramos só o braço via facingX
      lampSpots.push({ id: `s17_poste_${s.id}_${n}`, pos, facingX: s.axis === "x" ? 0 : -side, state });
      n++;
    }
  }
  for (const l of lampSpots) {
    if (l.facingX === 0) {
      // rua E-O: poste simples (braço para dentro da rua ao longo de Z não é suportado por streetLamp); usa o poste sem braço
      ctx.cylinder(`${l.id}_poste`, { height: 6.5, diameterTop: 0.12, diameterBottom: 0.2, tessellation: 8 }, new Vector3(l.pos.x, 3.25, l.pos.z), mats.metalPainted, { collider: true });
      const toward = l.pos.z > 0 ? -1 : 1; // em direção ao eixo da rua
      const streetAt = STREETS.find((s) => l.id.includes(s.id))?.at ?? 0;
      const dz = Math.sign(streetAt - l.pos.z) || toward;
      ctx.box(`${l.id}_braco`, { w: 0.08, h: 0.08, d: 1.6 }, new Vector3(l.pos.x, 6.4, l.pos.z + dz * 0.7), mats.metalPainted, { shadow: false });
      ctx.box(`${l.id}_luminaria`, { w: 0.3, h: 0.18, d: 0.6 }, new Vector3(l.pos.x, 6.3, l.pos.z + dz * 1.5), mats.metalDark);
      if (l.state !== "off") {
        ctx.box(`${l.id}_lampada`, { w: 0.22, h: 0.04, d: 0.5 }, new Vector3(l.pos.x, 6.2, l.pos.z + dz * 1.5), mats.lampGlow, { batch: false, shadow: false });
        const light = new SpotLight(`${l.id}_luz`, new Vector3(l.pos.x, 6.15, l.pos.z + dz * 1.5), new Vector3(0, -1, 0), Math.PI * 0.75, 2, ctx.scene);
        light.diffuse = new Color3(1.0, 0.78, 0.5);
        light.intensity = l.state === "flicker" ? 12 : 16;
        light.range = 14;
        light.metadata = { flicker: l.state === "flicker", glow: ctx.scene.getMeshByName(`${l.id}_lampada`), base: light.intensity };
        if (l.state === "flicker") ctx.emitters.push({ kind: "flicker", position: light.position.clone(), radius: 8, volume: 0.35 });
      }
    } else {
      streetLamp(ctx, l.id, l.pos, l.facingX, l.state);
    }
  }
}

// ---------------------------------------------------------------------------------------------------
// Muros, cercas e portões
// ---------------------------------------------------------------------------------------------------

function wallMaterial(mats: MaterialLibrary, key: WallSpec["mat"]): Material {
  switch (key) {
    case "concretePhoto":
      return mats.concretePhoto;
    case "plaster2":
      return mats.plaster[2]!;
    case "metalRust":
      return mats.metalRust;
    default:
      return mats.concrete;
  }
}

/** Grade de barras verticais (portão fechado ou folha de portão aberto); colisor único invisível quando fechado. */
function gateBars(ctx: WorldContext, id: string, from: Vector3, to: Vector3, height: number, closed: boolean): void {
  const { mats } = ctx;
  const len = Vector3.Distance(from, to);
  const dir = to.subtract(from).normalize();
  const mid = Vector3.Lerp(from, to, 0.5);
  const yaw = Math.atan2(dir.x, dir.z);
  const bars = Math.max(2, Math.floor(len / 0.3));
  for (let k = 0; k <= bars; k++) {
    const p = Vector3.Lerp(from, to, k / bars);
    ctx.box(`${id}_barra_${k}`, { w: 0.05, h: height - 0.1, d: 0.05 }, new Vector3(p.x, height / 2, p.z), mats.metalDark, { shadow: false });
  }
  for (const y of [0.3, height - 0.25]) ctx.box(`${id}_trave_${y}`, { w: 0.07, h: 0.07, d: len }, new Vector3(mid.x, y, mid.z), mats.metalDark, { rotationY: yaw, shadow: false });
  if (closed) ctx.staticBoxCollider(`s17_${id}`, { w: 0.1, h: height, d: len }, new Vector3(mid.x, height / 2, mid.z), new Vector3(0, yaw, 0), false);
}

function buildWalls(ctx: WorldContext): void {
  const { mats } = ctx;
  for (const w of WALLS) {
    const t = w.thickness ?? 0.25;
    const mat = wallMaterial(mats, w.mat);
    const [x0, z0] = w.from;
    const [x1, z1] = w.to;
    const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
    const start = alongX ? Math.min(x0, x1) : Math.min(z0, z1);
    const end = alongX ? Math.max(x0, x1) : Math.max(z0, z1);
    const gateCut: Array<[number, number]> = w.gate ? [[start + w.gate.at, start + w.gate.at + w.gate.width]] : [];
    for (const [i, [a, b]] of subtractIntervals([start, end], gateCut).entries()) {
      const c = (a + b) / 2;
      const pos = alongX ? new Vector3(c, w.height / 2, z0) : new Vector3(x0, w.height / 2, c);
      ctx.box(`s17_muro_${w.id}_${i}`, alongX ? { w: b - a, h: w.height, d: t } : { w: t, h: w.height, d: b - a }, pos, mat, { collider: true });
      // cordão de topo (chapim) — relevo mínimo
      ctx.box(`s17_muro_${w.id}_chapim_${i}`, alongX ? { w: b - a + 0.1, h: 0.08, d: t + 0.12 } : { w: t + 0.12, h: 0.08, d: b - a + 0.1 }, pos.add(new Vector3(0, w.height / 2 + 0.04, 0)), mats.concrete, { shadow: false });
    }
    if (w.gate) {
      const ga = start + w.gate.at;
      const gb = ga + w.gate.width;
      const from = alongX ? new Vector3(ga, 0, z0) : new Vector3(x0, 0, ga);
      const to = alongX ? new Vector3(gb, 0, z0) : new Vector3(x0, 0, gb);
      // pilares do portão
      for (const p of [from, to]) ctx.box(`s17_muro_${w.id}_pilar_${p.x}_${p.z}`, { w: 0.45, h: w.height + 0.4, d: 0.45 }, new Vector3(p.x, (w.height + 0.4) / 2, p.z), mats.concrete, { collider: true });
      if (w.gate.open) {
        // folhas abertas encostadas nos pilares (para dentro)
        const inward = alongX ? new Vector3(0, 0, z0 > 0 ? 1 : -1) : new Vector3(x0 > 0 ? -1 : 1, 0, 0);
        const leaf = Math.min(2.2, w.gate.width / 2 - 0.3);
        for (const p of [from, to]) gateBars(ctx, `s17_portao_${w.id}_folha_${p.x}_${p.z}`, p.add(inward.scale(0.3)), p.add(inward.scale(0.3 + leaf)), w.height - 0.2, true);
      } else {
        gateBars(ctx, `s17_portao_${w.id}`, from, to, w.height - 0.1, true);
      }
      if (w.gate.label) {
        const mid = Vector3.Lerp(from, to, 0.5);
        const facing: Facing = alongX ? (z0 > 0 ? "S" : "N") : x0 > 0 ? "W" : "E";
        const n = facing === "N" ? new Vector3(0, 0, 1) : facing === "S" ? new Vector3(0, 0, -1) : facing === "E" ? new Vector3(1, 0, 0) : new Vector3(-1, 0, 0);
        // a placa fica na travessa sobre o portão, virada para a rua
        ctx.box(`s17_portao_${w.id}_travessa`, alongX ? { w: w.gate.width + 0.9, h: 0.6, d: 0.3 } : { w: 0.3, h: 0.6, d: w.gate.width + 0.9 }, new Vector3(mid.x, w.height + 0.3, mid.z), mats.concrete, { collider: false });
        placeSign(ctx, `s17_portao_${w.id}`, { bg: "#2f3a33", fg: "#e8dcc0", lines: [w.gate.label], weathered: 0.3, seed: w.id.length, border: "#b89036" }, {
          position: new Vector3(mid.x, w.height + 0.3, mid.z).add(n.scale(0.17)),
          yaw: signYaw(facing),
          width: Math.min(w.gate.width + 0.6, 7),
          height: 0.5,
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------------
// Lotes padrão (fachada com relevo mínimo)
// ---------------------------------------------------------------------------------------------------

function buildLot(ctx: WorldContext, lot: LotSpec): void {
  const { mats } = ctx;
  const f = new Facade(lot.rect, lot.facing);
  const fh = lot.floorHeight ?? F;
  const height = lot.floors * fh + 0.6;
  const mat = matOf(mats, lot.mat);
  const burnt = lot.mat === "burnt";
  // corpo (colisor) e laje
  ctx.box(`s17_${lot.id}_corpo`, { w: lot.rect.x1 - lot.rect.x0, h: height, d: lot.rect.z1 - lot.rect.z0 }, f.center(height / 2), mat, { collider: true });
  if (lot.stair) {
    // guarda-corpo nos 4 lados (telhado acessível)
    for (const [u, w, su, sw] of [[f.width / 2, -0.15, f.width + 0.1, 0.25], [f.width / 2, -f.depth + 0.15, f.width + 0.1, 0.25], [0.12, -f.depth / 2, 0.25, f.depth], [f.width - 0.12, -f.depth / 2, 0.25, f.depth]] as Array<[number, number, number, number]>) {
      box(ctx, `s17_${lot.id}_guarda_${u}_${w}`, f, u, height + 0.5, w, su, 1.0, sw, mats.concrete, { collider: true, cameraBlocker: false });
    }
  } else {
    box(ctx, `s17_${lot.id}_platibanda`, f, f.width / 2, height + 0.25, 0.08, f.width + 0.2, 0.5, 0.25, mats.concrete);
  }
  // marquise/beiral no térreo das lojas
  if (lot.ground === "shop") box(ctx, `s17_${lot.id}_marquise`, f, f.width / 2, 3.15, 0.65, Math.min(f.width - 1, 7), 0.12, 1.3, mats.concrete, { collider: true, cameraBlocker: false });

  // janelas por andar
  const cols = Math.max(1, Math.floor((f.width - 1.6) / 2.6));
  const spacing = (f.width - 1.2) / cols;
  for (let floor = 1; floor < lot.floors; floor++) {
    const y = floor * fh + 1.55;
    for (let c = 0; c < cols; c++) {
      const u = 0.6 + spacing * (c + 0.5);
      const r = rnd(lot.seed, floor * 31 + c);
      const boarded = !burnt && r < (lot.boarded ?? 0.15);
      const lit = !burnt && !boarded && rnd(lot.seed, floor * 53 + c + 7) < (lot.lit ?? 0.2);
      // moldura saliente + peitoril (relevo) e vidro rente
      box(ctx, `s17_${lot.id}_moldura_${floor}_${c}`, f, u, y, 0.03, 1.4, 1.6, 0.08, burnt ? mats.burnt : mats.concrete, { shadow: false });
      box(ctx, `s17_${lot.id}_peitoril_${floor}_${c}`, f, u, y - 0.82, 0.1, 1.5, 0.08, 0.22, mats.concrete, { shadow: false });
      if (boarded) {
        for (let k = 0; k < 3; k++) box(ctx, `s17_${lot.id}_tabua_${floor}_${c}_${k}`, f, u, y - 0.45 + k * 0.45, 0.09, 1.3, 0.22, 0.04, mats.wood, { shadow: false });
      } else if (!burnt) {
        box(ctx, `s17_${lot.id}_vidro_${floor}_${c}`, f, u, y, 0.085, 1.15, 1.4, 0.03, lit ? mats.glassLit : mats.glass, { shadow: false });
        box(ctx, `s17_${lot.id}_caixilho_${floor}_${c}`, f, u, y, 0.1, 0.05, 1.4, 0.04, mats.metalDark, { shadow: false });
      } else {
        box(ctx, `s17_${lot.id}_fuligem_${floor}_${c}`, f, u, y + 1.0, 0.02, 1.7, 0.9, 0.02, mats.rubber, { shadow: false });
      }
      if (lot.balconies && floor % 2 === 1 && c % 2 === 0) {
        box(ctx, `s17_${lot.id}_sacada_${floor}_${c}`, f, u, y - 0.85, 0.45, 1.9, 0.12, 0.9, mats.concrete);
        box(ctx, `s17_${lot.id}_grade_${floor}_${c}`, f, u, y - 0.35, 0.88, 1.9, 0.9, 0.04, mats.metalRust, { shadow: false });
      }
    }
  }
  // térreo
  const doorU = 0.6 + spacing * 0.5 + (cols > 2 ? spacing : 0);
  switch (lot.ground) {
    case "door":
      box(ctx, `s17_${lot.id}_porta_moldura`, f, doorU, 1.25, 0.03, 1.3, 2.4, 0.1, mats.concrete, { shadow: false });
      box(ctx, `s17_${lot.id}_porta`, f, doorU, 1.17, 0.08, 1.0, 2.1, 0.05, mats.woodDark, { shadow: false });
      box(ctx, `s17_${lot.id}_degrau`, f, doorU, 0.18, 0.25, 1.4, 0.12, 0.5, mats.concrete, { collider: true, cameraBlocker: false });
      for (let c = 0; c < cols; c++) {
        const u = 0.6 + spacing * (c + 0.5);
        if (Math.abs(u - doorU) < 0.9) continue;
        box(ctx, `s17_${lot.id}_vidro_t_${c}`, f, u, 1.7, 0.02, 1.2, 1.3, 0.03, mats.glass, { shadow: false });
        box(ctx, `s17_${lot.id}_grade_t_${c}`, f, u, 1.7, 0.06, 1.3, 1.4, 0.04, mats.metalRust, { shadow: false });
      }
      break;
    case "shop": {
      const gw = Math.min(4.5, f.width - 2);
      box(ctx, `s17_${lot.id}_loja_moldura`, f, f.width / 2, 1.45, 0.03, gw + 0.3, 2.7, 0.1, mats.concrete, { shadow: false });
      box(ctx, `s17_${lot.id}_porta_enrolar`, f, f.width / 2, 1.37, 0.09, gw, 2.5, 0.06, mats.metalPainted, { shadow: false });
      for (let k = 0; k < 6; k++) box(ctx, `s17_${lot.id}_lamina_${k}`, f, f.width / 2, 0.35 + k * 0.4, 0.125, gw, 0.02, 0.02, mats.metalDark, { shadow: false });
      break;
    }
    case "gate": {
      const gw = Math.min(5, f.width - 2);
      box(ctx, `s17_${lot.id}_portao_moldura`, f, f.width / 2, 1.7, 0.03, gw + 0.4, 3.2, 0.12, mats.concrete, { shadow: false });
      for (let k = 0; k <= 10; k++) box(ctx, `s17_${lot.id}_barra_${k}`, f, f.width / 2 - gw / 2 + (gw / 10) * k, 1.62, 0.12, 0.06, 3.0, 0.06, mats.metalDark);
      break;
    }
    case "wall":
    default:
      break;
  }
  // tubo de queda, ar-condicionado, pichação, letreiro
  ctx.cylinder(`s17_${lot.id}_tubo`, { height: height - 0.4, diameter: 0.12, tessellation: 8 }, f.at(f.width - 0.35, height / 2, 0.1), mats.metalRust, { shadow: false });
  const acCount = Math.floor(rnd(lot.seed, 99) * 3);
  for (let i = 0; i < acCount && lot.floors > 1; i++) {
    const u = 1.2 + rnd(lot.seed, 120 + i) * (f.width - 2.4);
    const y = fh * (1 + Math.floor(rnd(lot.seed, 130 + i) * Math.max(1, lot.floors - 1))) + 0.5;
    box(ctx, `s17_${lot.id}_ac_${i}`, f, u, y, 0.2, 0.7, 0.5, 0.35, mats.metalPainted);
  }
  if (lot.graffiti) {
    placeSign(ctx, `s17_${lot.id}_graf`, { bg: "rgba(0,0,0,0)", fg: "#d8d2c2", lines: [lot.graffiti], font: `italic 900 120px "Impact", "Arial Black", sans-serif`, weathered: 0.5, seed: lot.seed, pxWidth: 1024 }, {
      position: f.at(f.width * 0.55, 1.6, 0.03),
      yaw: signYaw(lot.facing),
      width: Math.min(3.4, f.width - 1),
      height: 0.9,
    });
  }
  if (lot.sign) {
    const sw = Math.min(f.width - 1.2, 6);
    box(ctx, `s17_${lot.id}_placa_fundo`, f, f.width / 2, 3.65, 0.05, sw + 0.1, 0.9, 0.06, mats.metalDark, { shadow: false });
    placeSign(ctx, `s17_${lot.id}_placa`, { bg: lot.sign.bg ?? "#2f3a33", fg: lot.sign.fg ?? "#e8dcc0", lines: lot.sign.lines, weathered: 0.3, seed: lot.seed }, {
      position: f.at(f.width / 2, 3.65, 0.09),
      yaw: signYaw(lot.facing),
      width: sw,
      height: 0.8,
    });
  }
  // telhado: caixa d'água, painéis, antena, varal, reciclador de água (camada tecnológica), mastro de rádio
  const roofY = height + 0.02;
  const cx = (lot.rect.x0 + lot.rect.x1) / 2;
  const cz = (lot.rect.z0 + lot.rect.z1) / 2;
  for (const item of lot.roof ?? []) {
    switch (item) {
      case "caixa_dagua":
        ctx.cylinder(`s17_${lot.id}_caixa_dagua`, { height: 1.1, diameterTop: 1.2, diameterBottom: 1.0, tessellation: 12 }, new Vector3(cx - f.width * 0.2, roofY + 0.65, cz), mats.plasticBlue);
        ctx.box(`s17_${lot.id}_caixa_base`, { w: 1.4, h: 0.2, d: 1.4 }, new Vector3(cx - f.width * 0.2, roofY + 0.1, cz), mats.concrete);
        break;
      case "solar":
        for (let k = 0; k < 2; k++) {
          ctx.box(`s17_${lot.id}_solar_${k}`, { w: 2.0, h: 0.05, d: 1.1 }, new Vector3(cx + 0.8 + k * 2.2 - f.width * 0.25, roofY + 0.6, cz - 1), mats.glass, { rotation: new Vector3(-0.35, 0, 0) });
          ctx.box(`s17_${lot.id}_solar_sup_${k}`, { w: 1.8, h: 0.6, d: 0.05 }, new Vector3(cx + 0.8 + k * 2.2 - f.width * 0.25, roofY + 0.3, cz - 1.4), mats.metalDark, { shadow: false });
        }
        break;
      case "antena":
        ctx.cylinder(`s17_${lot.id}_antena`, { height: 3.5, diameter: 0.06, tessellation: 6 }, new Vector3(cx + f.width * 0.3, roofY + 1.75, cz + 1), mats.metalDark, { shadow: false });
        ctx.box(`s17_${lot.id}_antena_h`, { w: 1.6, h: 0.04, d: 0.04 }, new Vector3(cx + f.width * 0.3, roofY + 3.3, cz + 1), mats.metalDark, { shadow: false });
        break;
      case "varal": {
        const y = roofY + 1.6;
        ctx.cylinder(`s17_${lot.id}_varal`, { height: f.width * 0.6, diameter: 0.02, tessellation: 4 }, new Vector3(cx, y, cz), mats.rope, { rotation: new Vector3(0, 0, Math.PI / 2), shadow: false });
        const cloth = [mats.tarpBlue, mats.tarpOlive, mats.paperWhite, mats.tarpOrange];
        for (let k = 0; k < 4; k++) {
          ctx.plane(`s17_${lot.id}_roupa_${k}`, { w: 0.5, h: 0.7 }, new Vector3(cx - f.width * 0.25 + k * (f.width * 0.6) / 4 + 0.3, y - 0.38, cz), cloth[k % cloth.length]!, { rotation: new Vector3(0, 0, (rnd(lot.seed, k) - 0.5) * 0.3), sideOrientation: 2, shadow: true });
        }
        for (const dx of [-f.width * 0.3, f.width * 0.3]) ctx.cylinder(`s17_${lot.id}_poste_varal_${dx}`, { height: 1.8, diameter: 0.06, tessellation: 6 }, new Vector3(cx + dx, roofY + 0.9, cz), mats.metalRust, { shadow: false });
        break;
      }
      case "reciclador":
        // reciclador de água de telhado (Década dos Milagres): tanque cilíndrico + painel + tubos
        ctx.cylinder(`s17_${lot.id}_recic_tanque`, { height: 1.6, diameter: 1.6, tessellation: 14 }, new Vector3(cx + f.width * 0.2, roofY + 0.8, cz), mats.metalPainted);
        ctx.box(`s17_${lot.id}_recic_painel`, { w: 0.9, h: 1.2, d: 0.25 }, new Vector3(cx + f.width * 0.2 + 1.1, roofY + 0.6, cz), mats.metalDark);
        ctx.box(`s17_${lot.id}_recic_led`, { w: 0.08, h: 0.08, d: 0.03 }, new Vector3(cx + f.width * 0.2 + 1.1, roofY + 1.0, cz - 0.14), mats.emissiveGreen, { batch: false, shadow: false });
        ctx.cylinder(`s17_${lot.id}_recic_tubo`, { height: 2.2, diameter: 0.1, tessellation: 6 }, new Vector3(cx + f.width * 0.2 - 0.9, roofY + 0.5, cz + 0.4), mats.metalRust, { rotation: new Vector3(0, 0, Math.PI / 2), shadow: false });
        break;
      case "mastro":
        ctx.cylinder(`s17_${lot.id}_mastro`, { height: 12, diameterTop: 0.1, diameterBottom: 0.3, tessellation: 8 }, new Vector3(cx, roofY + 6, cz), mats.metalPainted, { collider: true });
        for (let k = 0; k < 3; k++) ctx.box(`s17_${lot.id}_mastro_trave_${k}`, { w: 2.4 - k * 0.6, h: 0.05, d: 0.05 }, new Vector3(cx, roofY + 8 + k * 1.6, cz), mats.metalDark, { shadow: false });
        ctx.box(`s17_${lot.id}_mastro_led`, { w: 0.15, h: 0.15, d: 0.15 }, new Vector3(cx, roofY + 12.1, cz), mats.emissiveRed, { batch: false, shadow: false });
        break;
    }
  }
}

// ---------------------------------------------------------------------------------------------------
// Escadas, interiores e marcos
// ---------------------------------------------------------------------------------------------------

/**
 * Escada reta de degraus maciços (0,25 m de espelho, 0,3 m de piso): `start` é o pé da escada no chão,
 * `dir` a direção de subida, `width` a largura; cada degrau é um bloco com colisor (o controlador sobe
 * degraus de até 0,32 m; o navmesh aceita 0,4 m).
 */
function stairs(ctx: WorldContext, id: string, start: Vector3, dir: Facing, width: number, rise: number, mat: Material): void {
  const steps = Math.ceil(rise / 0.25);
  const r = rise / steps;
  const tread = 0.3;
  const d = dir === "N" ? new Vector3(0, 0, 1) : dir === "S" ? new Vector3(0, 0, -1) : dir === "E" ? new Vector3(1, 0, 0) : new Vector3(-1, 0, 0);
  const alongZ = dir === "N" || dir === "S";
  for (let i = 0; i < steps; i++) {
    const h = (i + 1) * r;
    const c = start.add(d.scale((i + 0.5) * tread));
    // degraus só visuais: o controlador de personagem (cápsula) não sobe degraus de 25 cm sozinho
    ctx.box(`${id}_degrau_${i}`, alongZ ? { w: width, h, d: tread } : { w: tread, h, d: width }, new Vector3(c.x, start.y + h / 2, c.z), mat, { collider: false, shadow: i % 4 === 0 });
  }
  // colisor em rampa invisível rente às quinas dos degraus (como nos jogos em geral): inclinação < maxSlope do personagem
  {
    const run = steps * tread;
    const p = Math.atan2(rise, run);
    const len = Math.hypot(run, rise) + 0.3;
    const thick = 0.2;
    // normal da superfície da rampa (aponta para cima e para trás)
    const normal = new Vector3(-d.x * Math.sin(p), Math.cos(p), -d.z * Math.sin(p));
    const topCenter = start.add(d.scale(run / 2)).add(new Vector3(0, rise / 2, 0));
    const center = topCenter.subtract(normal.scale(thick / 2));
    const rampRot = alongZ ? new Vector3(-p * (dir === "N" ? 1 : -1), 0, 0) : new Vector3(0, 0, p * (dir === "E" ? 1 : -1));
    ctx.staticBoxCollider(`${id}_rampa`, alongZ ? { w: width, h: thick, d: len } : { w: len, h: thick, d: width }, center, rampRot, false);
  }
  // corrimão (sem colisor) no lado externo
  const len = Math.hypot(steps * tread, rise);
  const mid = start.add(d.scale((steps * tread) / 2));
  const side = alongZ ? new Vector3(width / 2 - 0.05, 0, 0) : new Vector3(0, 0, width / 2 - 0.05);
  const pitch = Math.atan2(rise, steps * tread);
  const rot = alongZ ? new Vector3(-pitch * (dir === "N" ? 1 : -1), 0, 0) : new Vector3(0, 0, pitch * (dir === "E" ? 1 : -1));
  ctx.box(`${id}_corrimao`, alongZ ? { w: 0.05, h: 0.05, d: len } : { w: len, h: 0.05, d: 0.05 }, mid.add(side).add(new Vector3(0, rise / 2 + 1.0, 0)), ctx.mats.metalRust, { rotation: rot, shadow: false });
  for (let k = 0; k <= 2; k++) {
    const t = k / 2;
    const p = start.add(d.scale(t * steps * tread)).add(side);
    ctx.box(`${id}_balaustre_${k}`, { w: 0.05, h: 1.0, d: 0.05 }, new Vector3(p.x, start.y + t * rise + 0.5, p.z), ctx.mats.metalRust, { shadow: false });
  }
}

/** Parede de interior/edifício com um vão (porta) opcional ao longo de X ou Z. */
function wallWithOpening(ctx: WorldContext, id: string, a: [number, number], b: [number, number], height: number, t: number, mat: Material, opening?: { at: number; width: number; height: number }, yBase = 0): void {
  const alongX = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]);
  const s0 = alongX ? Math.min(a[0], b[0]) : Math.min(a[1], b[1]);
  const s1 = alongX ? Math.max(a[0], b[0]) : Math.max(a[1], b[1]);
  const fixed = alongX ? a[1] : a[0];
  const cuts: Array<[number, number]> = opening ? [[opening.at - opening.width / 2, opening.at + opening.width / 2]] : [];
  for (const [i, [p, q]] of subtractIntervals([s0, s1], cuts).entries()) {
    const c = (p + q) / 2;
    ctx.box(`${id}_${i}`, alongX ? { w: q - p, h: height, d: t } : { w: t, h: height, d: q - p }, alongX ? new Vector3(c, yBase + height / 2, fixed) : new Vector3(fixed, yBase + height / 2, c), mat, { collider: true });
  }
  if (opening && opening.height < height) {
    const lh = height - opening.height;
    const pos = alongX ? new Vector3(opening.at, yBase + opening.height + lh / 2, fixed) : new Vector3(fixed, yBase + opening.height + lh / 2, opening.at);
    ctx.box(`${id}_verga`, alongX ? { w: opening.width + 0.1, h: lh, d: t } : { w: t, h: lh, d: opening.width + 0.1 }, pos, mat, { collider: true });
  }
}

/** Depósito da zona de distribuição: galpão 21×15 m, porta de 5 m ao sul, prateleiras, escritório, telhado acessível. */
function buildDeposito(ctx: WorldContext, lights: Light[]): void {
  const { mats } = ctx;
  const D = DEPOSITO;
  const R = D.rect;
  const t = D.wall;
  const H = D.height;
  const cx = (R.x0 + R.x1) / 2;
  const cz = (R.z0 + R.z1) / 2;
  // piso de concreto (levemente elevado), paredes, laje e platibanda
  ctx.box("s17_deposito_piso", { w: R.x1 - R.x0, h: 0.1, d: R.z1 - R.z0 }, new Vector3(cx, 0.05, cz), mats.concretePhoto, { collider: true, shadow: false, cameraBlocker: false });
  wallWithOpening(ctx, "s17_deposito_parede_sul", [R.x0, R.z0 + t / 2], [R.x1, R.z0 + t / 2], H, t, mats.corrugated, { at: (D.door.x0 + D.door.x1) / 2, width: D.door.x1 - D.door.x0, height: D.door.height });
  wallWithOpening(ctx, "s17_deposito_parede_norte", [R.x0, R.z1 - t / 2], [R.x1, R.z1 - t / 2], H, t, mats.corrugated);
  wallWithOpening(ctx, "s17_deposito_parede_oeste", [R.x0 + t / 2, R.z0], [R.x0 + t / 2, R.z1], H, t, mats.corrugated);
  wallWithOpening(ctx, "s17_deposito_parede_leste", [R.x1 - t / 2, R.z0], [R.x1 - t / 2, R.z1], H, t, mats.corrugated, { at: 70, width: 1.2, height: 2.3 });
  ctx.box("s17_deposito_laje", { w: R.x1 - R.x0 + 0.2, h: 0.3, d: R.z1 - R.z0 + 0.2 }, new Vector3(cx, H + 0.15, cz), mats.concrete, { collider: true });
  // embasamento de concreto e pilares metálicos (ritmo na fachada)
  for (const [x0, x1, z] of [[R.x0, R.x1, R.z0 + t / 2], [R.x0, R.x1, R.z1 - t / 2]] as Array<[number, number, number]>) {
    ctx.box(`s17_deposito_embasamento_${z}`, { w: x1 - x0 + 0.1, h: 1.0, d: t + 0.1 }, new Vector3((x0 + x1) / 2, 0.5, z), mats.concretePhoto, { shadow: false });
  }
  for (let x = R.x0 + 3; x < R.x1 - 1; x += 6) {
    for (const z of [R.z0 - 0.05, R.z1 + 0.05]) ctx.box(`s17_deposito_pilar_${x}_${z}`, { w: 0.3, h: H, d: 0.3 }, new Vector3(x, H / 2, z), mats.metalPainted, { shadow: false });
  }
  // folhas da porta de correr abertas, encostadas na fachada
  for (const [x, side] of [[D.door.x0 - 1.4, -1], [D.door.x1 + 1.4, 1]] as Array<[number, number]>) {
    ctx.box(`s17_deposito_folha_${side}`, { w: 2.6, h: D.door.height - 0.1, d: 0.08 }, new Vector3(x, D.door.height / 2, R.z0 - 0.25), mats.metalPainted, { collider: true, cameraBlocker: false });
  }
  ctx.box("s17_deposito_trilho", { w: D.door.x1 - D.door.x0 + 6, h: 0.12, d: 0.12 }, new Vector3((D.door.x0 + D.door.x1) / 2, D.door.height + 0.1, R.z0 - 0.25), mats.metalDark, { shadow: false });
  // guarda-corpo do telhado e escada externa a oeste (do pátio até o telhado)
  const roofY = H + 0.3;
  for (const [w, h, d, px, pz] of [[R.x1 - R.x0 + 0.2, 1.0, 0.2, cx, R.z0 + 0.1], [R.x1 - R.x0 + 0.2, 1.0, 0.2, cx, R.z1 - 0.1], [0.2, 1.0, R.z1 - R.z0, R.x1 - 0.1, cz]] as Array<[number, number, number, number, number]>) {
    ctx.box(`s17_deposito_guarda_${px}_${pz}`, { w, h, d }, new Vector3(px, roofY + 0.5, pz), mats.metalRust, { collider: true, cameraBlocker: false });
  }
  // lado oeste do guarda-corpo deixa a chegada da escada (z 66,8…68,2) aberta
  for (const [z0, z1] of [[R.z0, 66.6], [68.4, R.z1]] as Array<[number, number]>) {
    ctx.box(`s17_deposito_guarda_oeste_${z0}`, { w: 0.2, h: 1.0, d: z1 - z0 }, new Vector3(R.x0 + 0.1, roofY + 0.5, (z0 + z1) / 2), mats.metalRust, { collider: true, cameraBlocker: false });
  }
  stairs(ctx, "s17_deposito_escada", new Vector3(R.x0 - 0.7, 0.1, 59.2), "N", 1.3, roofY - 0.1, mats.metalPainted);
  // patamar de chegada ligando a escada ao telhado
  ctx.box("s17_deposito_patamar", { w: 1.5, h: 0.12, d: 1.6 }, new Vector3(R.x0 - 0.7, roofY - 0.06, 68.4 - 0.9), mats.metalPainted, { collider: true, cameraBlocker: false });
  // telhado: reciclador de água, painéis solares, caixa d'água
  ctx.cylinder("s17_deposito_recic", { height: 2.0, diameter: 2.4, tessellation: 16 }, new Vector3(cx + 5, roofY + 1.0, cz + 3), mats.metalPainted, { collider: true });
  for (let k = 0; k < 4; k++) ctx.box(`s17_deposito_solar_${k}`, { w: 2.0, h: 0.05, d: 1.1 }, new Vector3(cx - 6 + k * 2.3, roofY + 0.6, cz - 3), mats.glass, { rotation: new Vector3(-0.35, 0, 0) });
  ctx.cylinder("s17_deposito_caixa", { height: 1.2, diameter: 1.4, tessellation: 12 }, new Vector3(cx + 7, roofY + 0.6, cz - 4), mats.plasticBlue, { collider: true });
  // interior: prateleiras metálicas (3 níveis) com caixotes e tambores, corredor central para a van
  for (const [i, s] of D.shelves.entries()) {
    const sw = s.x1 - s.x0;
    const sd = s.z1 - s.z0;
    const scx = (s.x0 + s.x1) / 2;
    const scz = (s.z0 + s.z1) / 2;
    for (const level of [0.3, 1.7, 3.1]) ctx.box(`s17_deposito_prat_${i}_${level}`, { w: sw, h: 0.06, d: sd }, new Vector3(scx, level, scz), mats.metalPainted, { collider: level < 1 });
    for (const [dx, dz] of [[-sw / 2 + 0.05, -sd / 2 + 0.05], [sw / 2 - 0.05, -sd / 2 + 0.05], [-sw / 2 + 0.05, sd / 2 - 0.05], [sw / 2 - 0.05, sd / 2 - 0.05], [-sw / 2 + 0.05, 0], [sw / 2 - 0.05, 0]] as Array<[number, number]>) {
      ctx.box(`s17_deposito_prat_pe_${i}_${dx}_${dz}`, { w: 0.08, h: 4.2, d: 0.08 }, new Vector3(scx + dx, 2.1, scz + dz), mats.metalDark, { shadow: false });
    }
    ctx.staticBoxCollider(`s17_deposito_prat_col_${i}`, { w: sw, h: 4.2, d: sd }, new Vector3(scx, 2.1, scz), undefined, true);
    for (let k = 0; k < 5; k++) {
      const level = [0.33, 1.73, 3.13][k % 3]!;
      const cw = 0.5 + rnd(300 + i, k) * 0.5;
      ctx.box(`s17_deposito_caixa_${i}_${k}`, { w: cw, h: 0.45 + rnd(300 + i, k + 9) * 0.5, d: 0.6 }, new Vector3(s.x0 + 0.5 + rnd(301 + i, k) * (sw - 1), level + 0.3, s.z0 + 0.5 + rnd(302 + i, k) * (sd - 1)), k % 3 === 0 ? mats.tarpOlive : mats.wood, { shadow: false });
    }
  }
  // escritório do fiscal (canto nordeste) com janela de vidro e porta para o galpão
  const O = D.office;
  wallWithOpening(ctx, "s17_deposito_escr_sul", [O.x0, O.z0], [O.x1, O.z0], 2.8, 0.15, mats.plaster[2]!, { at: (O.x0 + O.x1) / 2 + 1.2, width: 1.0, height: 2.1 });
  wallWithOpening(ctx, "s17_deposito_escr_oeste", [O.x0, O.z0], [O.x0, O.z1], 2.8, 0.15, mats.plaster[2]!);
  ctx.box("s17_deposito_escr_vidro", { w: 2.2, h: 1.1, d: 0.03 }, new Vector3((O.x0 + O.x1) / 2 - 0.9, 1.7, O.z0), mats.glassLit, { shadow: false });
  ctx.box("s17_deposito_escr_laje", { w: O.x1 - O.x0 + 0.2, h: 0.12, d: O.z1 - O.z0 + 0.2 }, new Vector3((O.x0 + O.x1) / 2, 2.86, (O.z0 + O.z1) / 2), mats.concrete, { collider: true });
  ctx.box("s17_deposito_escr_mesa", { w: 1.4, h: 0.05, d: 0.7 }, new Vector3(O.x1 - 1.0, 0.78, O.z1 - 0.6), mats.wood, { collider: true });
  ctx.box("s17_deposito_escr_terminal", { w: 0.45, h: 0.35, d: 0.3 }, new Vector3(O.x1 - 1.0, 0.98, O.z1 - 0.7), mats.metalDark, { shadow: false });
  ctx.box("s17_deposito_escr_tela", { w: 0.4, h: 0.28, d: 0.02 }, new Vector3(O.x1 - 1.0, 1.0, O.z1 - 0.86), mats.emissiveGreen, { batch: false, shadow: false });
  // paletes, caixa vazia e manifesto (objetos da M2: examinar) perto da porta
  crateStack(ctx, "s17_deposito_paletes_1", new Vector3(31.2, 0.1, 60.5), 2, 311);
  crateStack(ctx, "s17_deposito_paletes_2", new Vector3(36.6, 0.1, 61.2), 3, 312, true);
  barrel(ctx, "s17_deposito_tambor_1", new Vector3(37.2, 0.1, 59.6), "plastic");
  barrel(ctx, "s17_deposito_tambor_2", new Vector3(37.9, 0.1, 59.4), "rust", true);
  ctx.box("s17_deposito_caixa_vazia", { w: 0.9, h: 0.5, d: 0.6 }, new Vector3(34, 0.35, 70.5), mats.wood, { collider: true });
  ctx.box("s17_deposito_caixa_vazia_tampa", { w: 0.9, h: 0.04, d: 0.6 }, new Vector3(34.9, 0.12, 70.9), mats.wood, { rotationY: 0.5, shadow: false });
  ctx.box("s17_deposito_manifesto", { w: 0.3, h: 0.005, d: 0.21 }, new Vector3(34.1, 0.605, 70.4), mats.paperWhite, { rotationY: 0.2, shadow: false });
  // luz: duas lâmpadas penduradas (gerenciadas por distância) e letreiro
  lights.push(warmLamp(ctx, "s17_deposito_lampada_1", new Vector3(cx - 3, H - 0.8, cz - 2), 7, 12), warmLamp(ctx, "s17_deposito_lampada_2", new Vector3(cx + 3, H - 0.8, cz + 3), 7, 12));
  placeSign(ctx, "s17_deposito_letreiro", { bg: "#2f3a33", fg: "#e8dcc0", lines: ["DEPÓSITO · ZONA DE DISTRIBUIÇÃO", "SETOR 17 · CONFERÊNCIA OBRIGATÓRIA"], weathered: 0.3, seed: 33, border: "#b89036" }, {
    position: new Vector3(cx, H - 0.6, R.z0 - 0.08),
    yaw: 0,
    width: 7,
    height: 1.0,
  });
  ctx.box("s17_deposito_letreiro_fundo", { w: 7.1, h: 1.1, d: 0.06 }, new Vector3(cx, H - 0.6, R.z0 - 0.03), mats.metalDark, { shadow: false });
  // pátio: guarita, contêineres, rack de baterias (camada tecnológica), poste
  wallWithOpening(ctx, "s17_guarita_sul", [44.5, 50.6], [47, 50.6], 2.6, 0.15, mats.plaster[2]!, { at: 45.1, width: 0.9, height: 2.1 });
  wallWithOpening(ctx, "s17_guarita_norte", [44.5, 53], [47, 53], 2.6, 0.15, mats.plaster[2]!);
  wallWithOpening(ctx, "s17_guarita_leste", [47, 50.6], [47, 53], 2.6, 0.15, mats.plaster[2]!);
  wallWithOpening(ctx, "s17_guarita_oeste", [44.5, 50.6], [44.5, 53], 2.6, 0.15, mats.plaster[2]!, { at: 51.8, width: 1.2, height: 1.1 });
  ctx.box("s17_guarita_vidro", { w: 0.03, h: 1.0, d: 1.1 }, new Vector3(44.5, 1.7, 51.8), mats.glass, { shadow: false });
  ctx.box("s17_guarita_laje", { w: 2.9, h: 0.12, d: 2.8 }, new Vector3(45.75, 2.66, 51.8), mats.concrete, { collider: true });
  for (let k = 0; k < 3; k++) ctx.box(`s17_zd_conteiner_${k}`, { w: 2.4, h: 2.6, d: 6.0 }, new Vector3(55.5, 1.3, 70 - k * 6.8), [mats.tarpBlue, mats.metalRust, mats.metalPainted][k]!, { collider: true });
  for (let k = 0; k < 4; k++) ctx.box(`s17_zd_bateria_${k}`, { w: 0.9, h: 1.2, d: 0.6 }, new Vector3(13 + k * 1.1, 0.6, 76), mats.metalPainted, { collider: true });
  ctx.box("s17_zd_bateria_rack", { w: 5.0, h: 0.1, d: 0.8 }, new Vector3(14.65, 1.25, 76), mats.metalDark, { shadow: false });
  ctx.box("s17_zd_bateria_led", { w: 0.08, h: 0.08, d: 0.03 }, new Vector3(13.4, 0.9, 75.68), mats.emissiveGreen, { batch: false, shadow: false });
  crateStack(ctx, "s17_zd_caixas", new Vector3(20, 0.0, 56), 2, 313);
  tirePile(ctx, "s17_zd_pneus", new Vector3(16, 0, 60), 3, 314);
  streetLamp(ctx, "s17_zd_poste", new Vector3(28, 0, 55), 1, "on");
  ctx.emitters.push({ kind: "generator", position: new Vector3(13, 0.6, 76), radius: 16, volume: 0.4 });
}

/** Escola do Setor: bloco de salas (térreo jogável, 1º andar fechado, telhado acessível por escada externa), pátio e quadra cercada. */
function buildEscola(ctx: WorldContext, lights: Light[]): void {
  const { mats } = ctx;
  const E = ESCOLA;
  const B = E.bloco;
  const fh = E.floorHeight;
  const t = E.wall;
  const H1 = fh; // pé-direito do térreo
  const roofY = 2 * fh + 0.6; // 7,0 m
  const cx = (B.x0 + B.x1) / 2;
  const cz = (B.z0 + B.z1) / 2;
  const wall = mats.plasterPhoto.warm;
  // piso do pátio (concreto) sob o bloco, o pátio e a faixa atrás do bloco
  ctx.box("s17_escola_patio_piso", { w: 29, h: 0.1, d: 16 }, new Vector3(-0.5, 0.05, -26), mats.concrete, { collider: true, shadow: false, cameraBlocker: false });
  // térreo: paredes externas com a porta na face norte (pátio) e janelas gradeadas na face sul (rua)
  wallWithOpening(ctx, "s17_escola_p_norte", [B.x0, B.z1 - t / 2], [B.x1, B.z1 - t / 2], H1, t, wall, { at: E.door.x, width: E.door.width, height: 2.2 });
  wallWithOpening(ctx, "s17_escola_p_sul", [B.x0, B.z0 + t / 2], [B.x1, B.z0 + t / 2], H1, t, wall);
  wallWithOpening(ctx, "s17_escola_p_oeste", [B.x0 + t / 2, B.z0], [B.x0 + t / 2, B.z1], H1, t, wall);
  wallWithOpening(ctx, "s17_escola_p_leste", [B.x1 - t / 2, B.z0], [B.x1 - t / 2, B.z1], H1, t, wall);
  // corredor e duas salas (portas para o corredor)
  wallWithOpening(ctx, "s17_escola_corredor", [B.x0, E.corridor.z0], [-6.0, E.corridor.z0], H1, 0.15, mats.plaster[2]!, { at: -10.2, width: 1.1, height: 2.1 });
  wallWithOpening(ctx, "s17_escola_corredor_b", [-6.0, E.corridor.z0], [B.x1, E.corridor.z0], H1, 0.15, mats.plaster[2]!, { at: -1.8, width: 1.1, height: 2.1 });
  wallWithOpening(ctx, "s17_escola_divisoria", [-6.0, B.z0], [-6.0, E.corridor.z0], H1, 0.15, mats.plaster[2]!);
  // laje do térreo/piso do 1º andar e o 1º andar fechado (volume) + laje do telhado
  ctx.box("s17_escola_laje1", { w: B.x1 - B.x0, h: 0.3, d: B.z1 - B.z0 }, new Vector3(cx, H1 + 0.15, cz), mats.concrete, { collider: true });
  ctx.box("s17_escola_andar1", { w: B.x1 - B.x0, h: fh, d: B.z1 - B.z0 }, new Vector3(cx, H1 + 0.3 + fh / 2, cz), wall, { collider: true });
  ctx.box("s17_escola_laje2", { w: B.x1 - B.x0 + 0.2, h: 0.3, d: B.z1 - B.z0 + 0.2 }, new Vector3(cx, roofY - 0.15, cz), mats.concrete, { collider: true });
  // relevo da fachada sul (rua): janelas gradeadas no térreo e no 1º andar, faixa de cor, letreiro
  const f = new Facade(B, "S");
  for (let c = 0; c < 5; c++) {
    const u = 1.6 + c * 3.2;
    for (const y of [1.75, H1 + 0.3 + 1.6]) {
      box(ctx, `s17_escola_jan_${c}_${y}`, f, u, y, 0.03, 1.6, 1.3, 0.08, mats.concrete, { shadow: false });
      box(ctx, `s17_escola_vidro_${c}_${y}`, f, u, y, 0.085, 1.4, 1.1, 0.03, c % 2 === 0 && y < 3 ? mats.glassLit : mats.glass, { shadow: false });
      if (y < 3) box(ctx, `s17_escola_grade_${c}`, f, u, y, 0.11, 1.5, 1.2, 0.04, mats.metalRust, { shadow: false });
    }
  }
  box(ctx, "s17_escola_faixa", f, f.width / 2, 0.6, 0.02, f.width, 1.2, 0.04, mats.plasterPhoto.sand, { shadow: false });
  box(ctx, "s17_escola_letreiro_fundo", f, f.width / 2, H1 + 0.1, 0.05, 7.1, 0.9, 0.06, mats.metalDark, { shadow: false });
  placeSign(ctx, "s17_escola_letreiro", { bg: "#2f4a3e", fg: "#e8dcc0", lines: ["ESCOLA DO SETOR · BLOCO B", "SALAS · QUADRA · ABRIGO"], weathered: 0.25, seed: 44, border: "#b89036" }, {
    position: f.at(f.width / 2, H1 + 0.1, 0.09),
    yaw: 0,
    width: 7,
    height: 0.8,
  });
  // guarda-corpo do telhado (abertura no canto nordeste para a escada) e escada externa no lado leste
  for (const [w, d, px, pz] of [[B.x1 - B.x0 + 0.2, 0.2, cx, B.z0 + 0.1], [B.x1 - B.x0 + 0.2, 0.2, cx, B.z1 - 0.1], [0.2, B.z1 - B.z0, B.x0 + 0.1, cz]] as Array<[number, number, number, number]>) {
    ctx.box(`s17_escola_guarda_${px}_${pz}`, { w, h: 1.0, d }, new Vector3(px, roofY + 0.5, pz), mats.concrete, { collider: true, cameraBlocker: false });
  }
  ctx.box("s17_escola_guarda_leste", { w: 0.2, h: 1.0, d: 7.4 }, new Vector3(B.x1 - 0.1, roofY + 0.5, B.z0 + 3.7), mats.concrete, { collider: true, cameraBlocker: false });
  stairs(ctx, "s17_escola_escada", new Vector3(E.stair.x0 + 0.7, 0.1, E.stair.z0), "N", 1.3, roofY - 0.1, mats.concrete);
  ctx.box("s17_escola_patamar", { w: 1.5, h: 0.12, d: 1.4 }, new Vector3(E.stair.x0 + 0.7, roofY - 0.06, B.z1 - 0.9), mats.concrete, { collider: true, cameraBlocker: false });
  // telhado: caixa d'água, painel solar, antena de rádio da escola e marcação de pouso improvisada (tinta)
  ctx.cylinder("s17_escola_caixa", { height: 1.1, diameter: 1.3, tessellation: 12 }, new Vector3(B.x0 + 2.5, roofY + 0.55, B.z0 + 2.2), mats.plasticBlue, { collider: true });
  ctx.box("s17_escola_solar", { w: 2.4, h: 0.05, d: 1.1 }, new Vector3(B.x0 + 6, roofY + 0.5, B.z0 + 2), mats.glass, { rotation: new Vector3(-0.35, 0, 0) });
  for (let k = 0; k < 4; k++) ctx.box(`s17_escola_pouso_${k}`, { w: k % 2 ? 0.25 : 3.4, h: 0.01, d: k % 2 ? 3.4 : 0.25 }, new Vector3(-6 + (k === 0 ? 0 : k === 2 ? 0 : k === 1 ? 1.6 : -1.6), roofY + 0.012, -29 + (k === 0 ? 1.6 : k === 2 ? -1.6 : 0)), mats.paperWhite, { shadow: false });
  // interior: carteiras, lousa, luz
  for (const [i, s] of E.salas.entries()) {
    const scx = (s.x0 + s.x1) / 2;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const x = scx - 1.8 + c * 1.8;
        const z = s.z0 + 2.0 + r * 1.9;
        ctx.box(`s17_escola_carteira_${i}_${r}_${c}`, { w: 0.6, h: 0.04, d: 0.45 }, new Vector3(x, 0.78, z), mats.wood, { collider: true, rotationY: (rnd(50 + i, r * 3 + c) - 0.5) * 0.3 });
        ctx.box(`s17_escola_carteira_pe_${i}_${r}_${c}`, { w: 0.5, h: 0.74, d: 0.05 }, new Vector3(x, 0.4, z + 0.18), mats.metalDark, { shadow: false });
        ctx.box(`s17_escola_banco_${i}_${r}_${c}`, { w: 0.4, h: 0.45, d: 0.35 }, new Vector3(x, 0.32, z + 0.55), mats.woodDark, { shadow: false });
      }
    }
    ctx.box(`s17_escola_lousa_${i}`, { w: 3.0, h: 1.2, d: 0.04 }, new Vector3(scx, 1.6, s.z0 + 0.12), mats.rubber, { shadow: false });
    ctx.box(`s17_escola_lousa_moldura_${i}`, { w: 3.1, h: 1.3, d: 0.03 }, new Vector3(scx, 1.6, s.z0 + 0.1), mats.wood, { shadow: false });
    lights.push(warmLamp(ctx, `s17_escola_lampada_${i}`, new Vector3(scx, H1 - 0.4, (s.z0 + s.z1) / 2), 5, 9));
  }
  placeSign(ctx, "s17_escola_cartaz", { bg: "#e8e0cc", fg: "#2a2a2a", lines: ["HORÁRIO", "8H ÀS 13H", "MERENDA: COTA", "DO SETOR"], weathered: 0.2, seed: 45, pxWidth: 512, pxHeight: 640 }, {
    position: new Vector3(E.door.x + 2.2, 1.7, B.z1 + 0.02),
    yaw: Math.PI,
    width: 0.8,
    height: 1.0,
  });
  // quadra cercada: piso pintado, linhas, traves, alambrado (postes + travessas + colisor cheio), portões
  const Q = E.quadra;
  const qcx = (Q.x0 + Q.x1) / 2;
  const qcz = (Q.z0 + Q.z1) / 2;
  ctx.box("s17_quadra_piso", { w: Q.x1 - Q.x0, h: 0.1, d: Q.z1 - Q.z0 }, new Vector3(qcx, 0.05, qcz), mats.courtGreen, { collider: true, shadow: false, cameraBlocker: false });
  const line = (id: string, w: number, d: number, x: number, z: number) => ctx.box(`s17_quadra_linha_${id}`, { w, h: 0.008, d }, new Vector3(x, 0.105, z), mats.paperWhite, { shadow: false });
  line("n", Q.x1 - Q.x0 - 2, 0.1, qcx, Q.z1 - 1);
  line("s", Q.x1 - Q.x0 - 2, 0.1, qcx, Q.z0 + 1);
  line("o", 0.1, Q.z1 - Q.z0 - 2, Q.x0 + 1, qcz);
  line("l", 0.1, Q.z1 - Q.z0 - 2, Q.x1 - 1, qcz);
  line("meio", 0.1, Q.z1 - Q.z0 - 2, qcx, qcz);
  ctx.cylinder("s17_quadra_circulo", { height: 0.008, diameter: 3.6, tessellation: 24 }, new Vector3(qcx, 0.104, qcz), mats.paperWhite, { shadow: false });
  for (const x of [Q.x0 + 1.2, Q.x1 - 1.2]) {
    ctx.box(`s17_quadra_trave_${x}`, { w: 0.1, h: 0.1, d: 3.0 }, new Vector3(x, 2.0, qcz), mats.metalPainted, { shadow: false });
    for (const dz of [-1.5, 1.5]) ctx.box(`s17_quadra_poste_${x}_${dz}`, { w: 0.1, h: 2.0, d: 0.1 }, new Vector3(x, 1.05, qcz + dz), mats.metalPainted, { collider: true });
  }
  const fenceH = 4;
  const sides: Array<{ a: [number, number]; b: [number, number]; gate?: [number, number] }> = [
    { a: [Q.x0, Q.z0], b: [Q.x1, Q.z0], gate: [E.quadraGates[0]!.x0!, E.quadraGates[0]!.x1!] }, // sul (rua da Escola)
    { a: [Q.x0, Q.z1], b: [Q.x1, Q.z1] }, // norte (fundos dos prédios da rua)
    { a: [Q.x0, Q.z0], b: [Q.x0, Q.z1] }, // oeste
    { a: [Q.x1, Q.z0], b: [Q.x1, Q.z1], gate: [E.quadraGates[1]!.z0!, E.quadraGates[1]!.z1!] }, // leste (pátio)
  ];
  for (const [i, s] of sides.entries()) {
    const alongX = s.a[1] === s.b[1];
    const s0 = alongX ? s.a[0] : s.a[1];
    const s1 = alongX ? s.b[0] : s.b[1];
    const fixed = alongX ? s.a[1] : s.a[0];
    const cuts: Array<[number, number]> = s.gate ? [s.gate] : [];
    for (const [k, [p, q]] of subtractIntervals([s0, s1], cuts).entries()) {
      const c = (p + q) / 2;
      const pos = alongX ? new Vector3(c, fenceH / 2, fixed) : new Vector3(fixed, fenceH / 2, c);
      ctx.staticBoxCollider(`s17_quadra_alambrado_${i}_${k}`, alongX ? { w: q - p, h: fenceH, d: 0.1 } : { w: 0.1, h: fenceH, d: q - p }, pos, undefined, false);
      // mureta baixa + travessas (a tela em si não existe: só o quadro)
      ctx.box(`s17_quadra_mureta_${i}_${k}`, alongX ? { w: q - p, h: 0.5, d: 0.15 } : { w: 0.15, h: 0.5, d: q - p }, alongX ? new Vector3(c, 0.25, fixed) : new Vector3(fixed, 0.25, c), mats.concrete, { shadow: false });
      for (const y of [fenceH - 0.05, 2.2]) ctx.box(`s17_quadra_travessa_${i}_${k}_${y}`, alongX ? { w: q - p, h: 0.05, d: 0.05 } : { w: 0.05, h: 0.05, d: q - p }, alongX ? new Vector3(c, y, fixed) : new Vector3(fixed, y, c), mats.metalRust, { shadow: false });
      for (let p2 = p; p2 <= q + 0.01; p2 += Math.max(2.5, (q - p) / Math.max(1, Math.round((q - p) / 3)))) {
        const pp = Math.min(p2, q);
        ctx.box(`s17_quadra_tela_poste_${i}_${k}_${pp}`, { w: 0.07, h: fenceH, d: 0.07 }, alongX ? new Vector3(pp, fenceH / 2, fixed) : new Vector3(fixed, fenceH / 2, pp), mats.metalRust, { shadow: false });
      }
    }
    if (s.gate) {
      // portão de grade aberto (folha encostada no alambrado, para dentro)
      const [g0, g1] = s.gate;
      const leafFrom = alongX ? new Vector3(g0, 0, fixed) : new Vector3(fixed, 0, g0);
      const inward = alongX ? new Vector3(0, 0, fixed === Q.z0 ? 1 : -1) : new Vector3(fixed === Q.x1 ? -1 : 1, 0, 0);
      gateBars(ctx, `s17_quadra_portao_${i}`, leafFrom.add(inward.scale(0.2)), leafFrom.add(inward.scale(0.2 + (g1 - g0) * 0.9)), 2.0, true);
    }
  }
  // arquibancada baixa (3 degraus) encostada no fundo norte da quadra e bebedouro
  for (let k = 0; k < 3; k++) ctx.box(`s17_quadra_arquib_${k}`, { w: 10, h: 0.4 * (k + 1), d: 0.8 }, new Vector3(qcx, 0.2 * (k + 1), Q.z1 - 0.5 - k * 0.8), mats.concrete, { collider: true, cameraBlocker: false });
  ctx.box("s17_quadra_bebedouro", { w: 0.5, h: 1.0, d: 0.4 }, new Vector3(Q.x1 - 0.5, 0.5, Q.z0 + 1.5), mats.metalPainted, { collider: true });
  streetLamp(ctx, "s17_quadra_refletor", new Vector3(Q.x0 + 0.6, 0.1, Q.z1 - 0.6), 1, "off");
  // pátio: árvore, bancos, caixotes; cartaz do portão
  tree(ctx, "s17_escola_arvore", new Vector3(10, 0.1, -22), 1.1, 71);
  bench(ctx, "s17_escola_banco_1", new Vector3(7, 0.1, -21), 0);
  bench(ctx, "s17_escola_banco_2", new Vector3(12, 0.1, -29), Math.PI / 2);
  crateStack(ctx, "s17_escola_caixotes", new Vector3(3.2, 0.1, -20), 2, 72);
  grassTuft(ctx, "s17_escola_mato_1", new Vector3(5, 0.1, -32.5), 0.4, 73);
  grassTuft(ctx, "s17_escola_mato_2", new Vector3(12.5, 0.1, -33), 0.35, 74);
}

/** Consultório dos fundos do posto médico (acesso pelo beco atrás da praça): 5×4 m, cama, armário, mesa, luz. */
function buildPostoFundos(ctx: WorldContext, lights: Light[]): void {
  const { mats } = ctx;
  const R = { x0: 22, x1: 27, z0: -32, z1: -28 };
  const H = 3.0;
  const t = 0.2;
  const wall = mats.plaster[2]!;
  ctx.box("s17_posto_fundos_piso", { w: 5, h: 0.1, d: 4 }, new Vector3(24.5, 0.05, -30), mats.concrete, { collider: true, shadow: false, cameraBlocker: false });
  wallWithOpening(ctx, "s17_posto_fundos_sul", [R.x0, R.z0 + t / 2], [R.x1, R.z0 + t / 2], H, t, wall, { at: 24.5, width: 1.1, height: 2.1 });
  wallWithOpening(ctx, "s17_posto_fundos_oeste", [R.x0 + t / 2, R.z0], [R.x0 + t / 2, R.z1], H, t, wall);
  wallWithOpening(ctx, "s17_posto_fundos_leste", [R.x1 - t / 2, R.z0], [R.x1 - t / 2, R.z1], H, t, wall);
  // a parede norte é o fundo do posto (prédio p_sul_medico, z=-28): só uma faixa de acabamento
  ctx.box("s17_posto_fundos_rodape", { w: 5, h: 0.3, d: 0.05 }, new Vector3(24.5, 0.25, R.z1 - 0.03), mats.concrete, { shadow: false });
  ctx.box("s17_posto_fundos_laje", { w: 5.2, h: 0.25, d: 4.2 }, new Vector3(24.5, H + 0.12, -30), mats.corrugated, { collider: true, rotation: new Vector3(0.04, 0, 0) });
  ctx.box("s17_posto_fundos_porta", { w: 0.05, h: 2.0, d: 1.0 }, new Vector3(25.1, 1.1, R.z0 + 0.6), mats.woodDark, { collider: true });
  ctx.box("s17_posto_fundos_cama", { w: 0.9, h: 0.5, d: 2.0 }, new Vector3(R.x1 - 0.7, 0.35, -30), mats.metalPainted, { collider: true });
  ctx.box("s17_posto_fundos_lencol", { w: 0.86, h: 0.08, d: 1.9 }, new Vector3(R.x1 - 0.7, 0.64, -30), mats.paperWhite, { shadow: false });
  ctx.box("s17_posto_fundos_armario", { w: 0.9, h: 1.9, d: 0.45 }, new Vector3(R.x0 + 0.7, 1.05, R.z1 - 0.45), mats.metalPainted, { collider: true });
  ctx.box("s17_posto_fundos_cruz_h", { w: 0.5, h: 0.12, d: 0.02 }, new Vector3(R.x0 + 0.7, 1.5, R.z1 - 0.69), mats.emissiveRed, { batch: false, shadow: false });
  ctx.box("s17_posto_fundos_cruz_v", { w: 0.12, h: 0.5, d: 0.02 }, new Vector3(R.x0 + 0.7, 1.5, R.z1 - 0.69), mats.emissiveRed, { batch: false, shadow: false });
  ctx.box("s17_posto_fundos_mesa", { w: 1.2, h: 0.05, d: 0.6 }, new Vector3(23.3, 0.78, R.z0 + 0.7), mats.wood, { collider: true });
  ctx.box("s17_posto_fundos_caixa_remedios", { w: 0.5, h: 0.3, d: 0.35 }, new Vector3(23.1, 0.96, R.z0 + 0.7), mats.plasticBlue, { shadow: false });
  ctx.box("s17_posto_fundos_caderno", { w: 0.22, h: 0.02, d: 0.3 }, new Vector3(23.7, 0.82, R.z0 + 0.75), mats.paperWhite, { shadow: false });
  lights.push(warmLamp(ctx, "s17_posto_fundos_lampada", new Vector3(24.5, H - 0.5, -30), 4.5, 7));
  placeSign(ctx, "s17_posto_fundos_placa", { bg: "#2a5a3a", fg: "#f3f0e6", lines: ["POSTO MÉDICO · FUNDOS", "BATA · ATENDIMENTO À NOITE"], weathered: 0.25, seed: 46, border: "#f3f0e6" }, {
    position: new Vector3(23.4, 2.35, R.z0 - 0.08),
    yaw: 0,
    width: 1.8,
    height: 0.55,
  });
  // beco atrás da praça: caçamba, pneus, varal, goteira (emissor), mato
  ctx.box("s17_beco_cacamba", { w: 1.8, h: 1.3, d: 3.2 }, new Vector3(38, 0.75, -31), mats.metalRust, { collider: true, rotationY: 0.08 });
  tirePile(ctx, "s17_beco_pneus", new Vector3(32, 0.1, -32.8), 3, 81);
  barrel(ctx, "s17_beco_barril", new Vector3(16.5, 0.1, -29.5), "rust", true);
  rubblePile(ctx, "s17_beco_entulho", new Vector3(44, 0.05, -30), 5, 82, 1.4);
  clothesline(ctx, "s17_beco_varal", new Vector3(30, 3.4, -28.1), new Vector3(31, 3.1, -33.9), 83);
  ctx.emitters.push({ kind: "drip", position: new Vector3(35, 2.0, -30), radius: 7, volume: 0.35 });
  for (let k = 0; k < 6; k++) grassTuft(ctx, `s17_beco_mato_${k}`, new Vector3(15 + k * 5.3, 0.1, -33.5 + (k % 2) * 0.4), 0.35, 84 + k);
  cable(ctx, "s17_beco_cabo", new Vector3(20, 6.5, -28.2), new Vector3(27, 5.2, -33.8));
}

/** Torre Verde: base de 12×12 m, 34 m de vidro com faixas de laje, fazenda vertical ocupando duas faces, forecourt com frades. */
function buildTorre(ctx: WorldContext): void {
  const { mats } = ctx;
  const L = LANDMARKS.find((l) => l.id === "torre")!;
  const R = L.rect;
  const cx = (R.x0 + R.x1) / 2;
  const cz = (R.z0 + R.z1) / 2;
  const w = R.x1 - R.x0;
  const d = R.z1 - R.z0;
  const H = L.height;
  const floors = 10;
  const fh = H / floors;
  // núcleo de concreto (colisor) ligeiramente menor que a pele de vidro
  ctx.box("s17_torre_nucleo", { w: w - 0.6, h: H, d: d - 0.6 }, new Vector3(cx, H / 2, cz), mats.concretePhoto, { collider: true });
  // pele de vidro por andar (alguns vãos vazios/quebrados → faixas de concreto) e lajes salientes
  for (let k = 0; k < floors; k++) {
    const y = k * fh + fh / 2;
    const broken = rnd(77, k) < 0.25;
    ctx.box(`s17_torre_vidro_${k}`, { w: w, h: fh - 0.35, d: d }, new Vector3(cx, y, cz), broken ? mats.concrete : k % 3 === 1 ? mats.glassLit : mats.glass, { collider: false, shadow: false });
    ctx.box(`s17_torre_laje_${k}`, { w: w + 0.3, h: 0.35, d: d + 0.3 }, new Vector3(cx, (k + 1) * fh - 0.175, cz), mats.concrete, { shadow: k % 2 === 0 });
  }
  // fazenda vertical: trepadeiras/bandejas nas faces sul e leste (vegetação ocupando o prédio)
  for (let k = 1; k < floors - 1; k++) {
    if (rnd(78, k) < 0.35) continue;
    const y = k * fh + fh / 2;
    ctx.plane(`s17_torre_verde_s_${k}`, { w: w * 0.6, h: fh - 0.6 }, new Vector3(cx + (rnd(79, k) - 0.5) * 4, y, R.z0 - 0.2), mats.vines, { rotation: new Vector3(0, Math.PI, 0) });
    ctx.box(`s17_torre_bandeja_${k}`, { w: w * 0.7, h: 0.15, d: 0.9 }, new Vector3(cx, y - fh / 2 + 0.5, R.z0 - 0.5), mats.metalPainted, { shadow: false });
    if (k % 2 === 0) ctx.plane(`s17_torre_verde_l_${k}`, { w: d * 0.5, h: fh - 0.6 }, new Vector3(R.x1 + 0.2, y, cz + (rnd(80, k) - 0.5) * 4), mats.vines, { rotation: new Vector3(0, Math.PI / 2, 0) });
  }
  // coroamento: antena e caixa de máquinas
  ctx.box("s17_torre_maquinas", { w: 4, h: 2.4, d: 4 }, new Vector3(cx - 2, H + 1.2, cz + 2), mats.concrete, { collider: true });
  ctx.cylinder("s17_torre_antena", { height: 6, diameter: 0.15, tessellation: 8 }, new Vector3(cx + 3, H + 3, cz - 3), mats.metalDark, { shadow: false });
  ctx.box("s17_torre_led", { w: 0.25, h: 0.25, d: 0.25 }, new Vector3(cx + 3, H + 6.1, cz - 3), mats.emissiveRed, { batch: false, shadow: false });
  // base: embasamento de concreto, entrada com marquise e frades no forecourt (o térreo é fechado: ocupação)
  ctx.box("s17_torre_embasamento", { w: w + 0.6, h: 1.2, d: d + 0.6 }, new Vector3(cx, 0.6, cz), mats.concretePhoto, { collider: true });
  ctx.box("s17_torre_marquise", { w: 6, h: 0.3, d: 2.5 }, new Vector3(cx, 3.6, R.z0 - 1.25), mats.concrete, { collider: true, cameraBlocker: false });
  ctx.box("s17_torre_portao", { w: 3.0, h: 2.6, d: 0.1 }, new Vector3(cx, 1.3 + 1.2, R.z0 - 0.05), mats.metalDark, { shadow: false });
  ctx.box("s17_torre_forecourt", { w: 12, h: STREET.curbHeight, d: 4 }, new Vector3(cx, STREET.curbHeight / 2, R.z0 - 2), mats.pavingStones, { collider: true, shadow: false, cameraBlocker: false });
  bollards(ctx, "s17_torre_frades", new Vector3(R.x0 + 0.8, STREET.curbHeight, 50.6), new Vector3(R.x1 - 0.8, STREET.curbHeight, 50.6), 5);
  ctx.box("s17_torre_placa_fundo", { w: 5.1, h: 0.8, d: 0.06 }, new Vector3(cx, 4.1, R.z0 - 0.03), mats.metalDark, { shadow: false });
  placeSign(ctx, "s17_torre_placa", { bg: "#1d2a3a", fg: "#e8dcc0", lines: ["TORRE VERDE · FAZENDA VERTICAL", "OCUPAÇÃO REGISTRADA · 2061"], weathered: 0.35, seed: 47, border: "#b89036" }, {
    position: new Vector3(cx, 4.1, R.z0 - 0.09),
    yaw: 0,
    width: 5,
    height: 0.7,
  });
  grassTuft(ctx, "s17_torre_mato_1", new Vector3(R.x0 - 0.5, 0, R.z1 - 1), 0.5, 48);
  grassTuft(ctx, "s17_torre_mato_2", new Vector3(R.x1 + 0.6, 0, R.z0 + 2), 0.45, 49);
}

/** Cisterna do setor: caixa d'água elevada de concreto, estação de bombeamento, tubos, cerca (dados em WALLS). */
function buildCisterna(ctx: WorldContext): void {
  const { mats } = ctx;
  const cx = -70;
  const cz = 0;
  ctx.box("s17_cisterna_piso", { w: 11, h: 0.1, d: 30 }, new Vector3(-69.3, 0.05, 0), mats.concrete, { collider: true, shadow: false, cameraBlocker: false });
  ctx.cylinder("s17_cisterna_fuste", { height: 12, diameter: 3.2, tessellation: 16 }, new Vector3(cx, 6, cz), mats.concretePhoto, { collider: true });
  ctx.cylinder("s17_cisterna_tanque", { height: 6, diameterTop: 8.5, diameterBottom: 7.2, tessellation: 20 }, new Vector3(cx, 15, cz), mats.concretePhoto, { collider: true });
  ctx.cylinder("s17_cisterna_tampa", { height: 0.6, diameter: 8.8, tessellation: 20 }, new Vector3(cx, 18.3, cz), mats.concrete);
  ctx.cylinder("s17_cisterna_tubo", { height: 12, diameter: 0.3, tessellation: 8 }, new Vector3(cx + 1.9, 6, cz + 0.8), mats.metalRust, { shadow: false });
  // estação de bombeamento (galpãozinho de telha) e tubos até a rua
  ctx.box("s17_bombas_corpo", { w: 6, h: 3.2, d: 5 }, new Vector3(-69, 1.6, 9), mats.plaster[2]!, { collider: true });
  ctx.box("s17_bombas_telhado", { w: 6.6, h: 0.15, d: 5.6 }, new Vector3(-69, 3.35, 9), mats.corrugated, { rotation: new Vector3(0, 0, 0.06) });
  ctx.box("s17_bombas_porta", { w: 1.2, h: 2.2, d: 0.08 }, new Vector3(-67.5, 1.1, 6.46), mats.metalPainted, { shadow: false });
  for (let k = 0; k < 3; k++) ctx.cylinder(`s17_bombas_tubo_${k}`, { height: 6, diameter: 0.25, tessellation: 8 }, new Vector3(-66.2 + k * 0.5, 0.6, 3), mats.metalPainted, { rotation: new Vector3(Math.PI / 2, 0, 0), shadow: false });
  ctx.box("s17_bombas_led", { w: 0.1, h: 0.1, d: 0.04 }, new Vector3(-66.9, 1.8, 6.46), mats.emissiveGreen, { batch: false, shadow: false });
  ctx.emitters.push({ kind: "generator", position: new Vector3(-69, 1.2, 9), radius: 20, volume: 0.45 });
  // fila de garrafões e tambores no pátio (dia de água)
  for (let k = 0; k < 6; k++) ctx.cylinder(`s17_cisterna_garrafao_${k}`, { height: 0.5, diameter: 0.3, tessellation: 10 }, new Vector3(-64.5, 0.35, -6 + k * 0.6), mats.plasticBlue, { collider: true });
  barrel(ctx, "s17_cisterna_tambor_1", new Vector3(-65, 0.1, -9), "plastic");
  barrel(ctx, "s17_cisterna_tambor_2", new Vector3(-65.8, 0.1, -9.6), "plastic");
  ctx.box("s17_cisterna_placa_fundo", { w: 4.1, h: 0.8, d: 0.06 }, new Vector3(cx, 11.4, cz + 1.65), mats.metalDark, { shadow: false });
  placeSign(ctx, "s17_cisterna_placa", { bg: "#1d2a3a", fg: "#e8dcc0", lines: ["CISTERNA DO SETOR 17", "ÁGUA: 3ª E 6ª · 6H ÀS 9H"], weathered: 0.4, seed: 51, border: "#b89036" }, {
    position: new Vector3(cx, 11.4, cz + 1.71),
    yaw: Math.PI,
    width: 4,
    height: 0.7,
  });
  grassTuft(ctx, "s17_cisterna_mato", new Vector3(-72, 0.1, -12), 0.5, 52);
  tree(ctx, "s17_cisterna_arvore", new Vector3(-72.5, 0.1, 13), 1.2, 53);
}

/** Canopy solar do antigo terminal de recarga: laje de 24×12 m a 6 m sobre 6 pilares, painéis, totens, ônibus abandonado; cobertura pousável. */
function buildCanopy(ctx: WorldContext): void {
  const { mats } = ctx;
  const L = LANDMARKS.find((l) => l.id === "canopy")!;
  const R = L.rect;
  const cx = (R.x0 + R.x1) / 2;
  const cz = (R.z0 + R.z1) / 2;
  const top = L.height; // 6,4 m: topo da laje
  ctx.box("s17_canopy_piso", { w: 28, h: STREET.curbHeight, d: 14 }, new Vector3(cx, STREET.curbHeight / 2, cz), mats.concrete, { collider: true, shadow: false, cameraBlocker: false });
  for (const x of [R.x0 + 1, cx, R.x1 - 1]) for (const z of [R.z0 + 1, R.z1 - 1]) ctx.box(`s17_canopy_pilar_${x}_${z}`, { w: 0.6, h: top - 0.4, d: 0.6 }, new Vector3(x, (top - 0.4) / 2, z), mats.concretePhoto, { collider: true });
  ctx.box("s17_canopy_laje", { w: R.x1 - R.x0, h: 0.4, d: R.z1 - R.z0 }, new Vector3(cx, top - 0.2, cz), mats.concrete, { collider: true });
  // vigas longitudinais sob a laje e guarda-corpo em cima (acesso por escada no pilar sudoeste)
  for (const z of [R.z0 + 1, R.z1 - 1]) ctx.box(`s17_canopy_viga_${z}`, { w: R.x1 - R.x0, h: 0.5, d: 0.4 }, new Vector3(cx, top - 0.65, z), mats.concretePhoto, { shadow: false });
  for (const [w, d, px, pz] of [[R.x1 - R.x0, 0.12, cx, R.z0 + 0.06], [R.x1 - R.x0, 0.12, cx, R.z1 - 0.06], [0.12, R.z1 - R.z0, R.x1 - 0.06, cz]] as Array<[number, number, number, number]>) {
    ctx.box(`s17_canopy_guarda_${px}_${pz}`, { w, h: 1.0, d }, new Vector3(px, top + 0.5, pz), mats.metalRust, { collider: true, cameraBlocker: false });
  }
  ctx.box("s17_canopy_guarda_oeste", { w: 0.12, h: 1.0, d: R.z1 - R.z0 - 2.2 }, new Vector3(R.x0 + 0.06, top + 0.5, cz + 1.1), mats.metalRust, { collider: true, cameraBlocker: false });
  // painéis solares em fileiras (alguns faltando: recuperados)
  for (let i = 0; i < 10; i++) for (let j = 0; j < 4; j++) {
    if (rnd(91, i * 4 + j) < 0.2) continue;
    ctx.box(`s17_canopy_painel_${i}_${j}`, { w: 2.0, h: 0.06, d: 1.3 }, new Vector3(R.x0 + 1.6 + i * 2.2, top + 0.45, R.z0 + 2.2 + j * 2.4), mats.glass, { rotation: new Vector3(-0.25, 0, 0), shadow: false });
    ctx.box(`s17_canopy_painel_sup_${i}_${j}`, { w: 1.8, h: 0.4, d: 0.05 }, new Vector3(R.x0 + 1.6 + i * 2.2, top + 0.2, R.z0 + 2.2 + j * 2.4 - 0.5), mats.metalDark, { shadow: false });
  }
  // escada de manutenção no pilar sudoeste (sobe para o norte, do lado de fora do pilar)
  stairs(ctx, "s17_canopy_escada", new Vector3(R.x0 - 0.9, STREET.curbHeight, R.z0 + 1.8), "N", 1.2, top - STREET.curbHeight, mats.metalPainted);
  ctx.box("s17_canopy_patamar", { w: 1.6, h: 0.1, d: 1.4 }, new Vector3(R.x0 - 0.6, top - 0.05, R.z1 - 1.4), mats.metalPainted, { collider: true, cameraBlocker: false });
  // totens de recarga (camada tecnológica reaproveitados como postes de feira) e um ônibus elétrico abandonado
  for (let k = 0; k < 4; k++) {
    const x = R.x0 + 3 + k * 5.5;
    ctx.box(`s17_canopy_totem_${k}`, { w: 0.5, h: 2.2, d: 0.4 }, new Vector3(x, 1.1 + STREET.curbHeight, R.z1 - 2.2), mats.metalPainted, { collider: true });
    ctx.box(`s17_canopy_totem_tela_${k}`, { w: 0.3, h: 0.4, d: 0.02 }, new Vector3(x, 1.7 + STREET.curbHeight, R.z1 - 2.41), k === 1 ? mats.emissiveGreen : mats.glass, { batch: k === 1 ? false : true, shadow: false });
    ctx.cylinder(`s17_canopy_totem_cabo_${k}`, { height: 1.2, diameter: 0.05, tessellation: 6 }, new Vector3(x + 0.3, 0.7 + STREET.curbHeight, R.z1 - 2.0), mats.rubber, { rotation: new Vector3(0.6, 0, 0.4), shadow: false });
  }
  ctx.box("s17_canopy_onibus_corpo", { w: 2.5, h: 2.6, d: 11 }, new Vector3(R.x1 - 3.5, 1.5 + STREET.curbHeight, cz), mats.metalPainted, { collider: true, rotationY: 0.05 });
  ctx.box("s17_canopy_onibus_vidros", { w: 2.55, h: 0.9, d: 10.6 }, new Vector3(R.x1 - 3.5, 2.3 + STREET.curbHeight, cz), mats.glass, { rotationY: 0.05, shadow: false });
  ctx.box("s17_canopy_onibus_bateria", { w: 2.4, h: 0.5, d: 3.0 }, new Vector3(R.x1 - 3.5, 3.05 + STREET.curbHeight, cz - 2), mats.metalRust, { rotationY: 0.05 });
  for (const [sx, sz] of [[-1.1, 3.6], [1.1, 3.6], [-1.1, -3.4], [1.1, -3.4]] as Array<[number, number]>) {
    ctx.cylinder(`s17_canopy_onibus_roda_${sx}_${sz}`, { height: 0.3, diameter: 0.95, tessellation: 12 }, new Vector3(R.x1 - 3.5 + sx, 0.47 + STREET.curbHeight, cz + sz), mats.rubber, { rotation: new Vector3(0, 0, Math.PI / 2), shadow: false });
  }
  marketStall(ctx, "s17_canopy_barraca", new Vector3(R.x0 + 8, STREET.curbHeight, cz - 2), Math.PI / 2, "TROCA DE BATERIAS · SELOS");
  crateStack(ctx, "s17_canopy_caixas", new Vector3(R.x0 + 11, STREET.curbHeight, cz + 1.5), 2, 92);
  ctx.box("s17_canopy_placa_fundo", { w: 6.1, h: 0.9, d: 0.06 }, new Vector3(cx, top - 1.0, R.z1 + 0.03), mats.metalDark, { shadow: false });
  placeSign(ctx, "s17_canopy_placa", { bg: "#1d2a3a", fg: "#e8dcc0", lines: ["TERMINAL DE RECARGA · SETOR 17", "ENERGIA SOLAR · TROCAS 9H ÀS 17H"], weathered: 0.4, seed: 54, border: "#b89036" }, {
    position: new Vector3(cx, top - 1.0, R.z1 + 0.09),
    yaw: Math.PI,
    width: 6,
    height: 0.8,
  });
  streetLamp(ctx, "s17_canopy_poste", new Vector3(R.x1 + 1.5, STREET.curbHeight, R.z1 + 0.5), -1, "flicker");
  for (let k = 0; k < 5; k++) grassTuft(ctx, `s17_canopy_mato_${k}`, new Vector3(R.x0 - 1 + k * 6, STREET.curbHeight, R.z0 - 0.6), 0.4, 93 + k);
}

/** Viaduto do maglev morto na Avenida do Maglev: pilares, tabuleiro em segmentos de 24 m (trecho sul caído), guias, feira à sombra. */
function buildViaduct(ctx: WorldContext): void {
  const { mats } = ctx;
  const V = VIADUCT;
  const hp = V.pillarSize / 2;
  const deckY = V.deckBottom + V.deckThickness / 2;
  for (const z of V.pillars) {
    ctx.box(`s17_viaduto_pilar_${z}`, { w: V.pillarSize, h: V.deckBottom, d: V.pillarSize }, new Vector3(V.x, V.deckBottom / 2, z), mats.concretePhoto, { collider: true });
    ctx.box(`s17_viaduto_capitel_${z}`, { w: V.deckWidth - 0.6, h: 0.8, d: V.pillarSize + 0.6 }, new Vector3(V.x, V.deckBottom - 0.4, z), mats.concretePhoto, { collider: true });
    ctx.box(`s17_viaduto_base_${z}`, { w: V.pillarSize + 1.0, h: 0.5, d: V.pillarSize + 1.0 }, new Vector3(V.x, 0.25, z), mats.concrete, { collider: true, cameraBlocker: false });
  }
  for (const [z0, z1] of V.decks) {
    const len = z1 - z0;
    const cz = (z0 + z1) / 2;
    ctx.box(`s17_viaduto_tabuleiro_${z0}`, { w: V.deckWidth, h: V.deckThickness, d: len }, new Vector3(V.x, deckY, cz), mats.concretePhoto, { collider: true });
    // guias do maglev (duas vigas metálicas) e guarda-corpos
    for (const dx of [-1.6, 1.6]) ctx.box(`s17_viaduto_guia_${z0}_${dx}`, { w: 0.5, h: 0.4, d: len }, new Vector3(V.x + dx, V.deckBottom + V.deckThickness + 0.2, cz), mats.metalRust, { shadow: false });
    for (const dx of [-V.deckWidth / 2 + 0.1, V.deckWidth / 2 - 0.1]) ctx.box(`s17_viaduto_guarda_${z0}_${dx}`, { w: 0.15, h: 1.1, d: len }, new Vector3(V.x + dx, V.deckBottom + V.deckThickness + 0.55, cz), mats.concrete, { collider: true, cameraBlocker: false });
    // vegetação nas juntas e manchas de infiltração (lado de baixo)
    if (rnd(95, z0) > 0.4) ctx.plane(`s17_viaduto_mancha_${z0}`, { w: 5, h: 1.6 }, new Vector3(V.x - V.deckWidth / 2 - 0.02, deckY, cz + 4), mats.vines, { rotation: new Vector3(0, Math.PI / 2, 0) });
  }
  // ponta sul caída: laje partida inclinada e entulho no canteiro (viaduto morto)
  ctx.box("s17_viaduto_queda", { w: V.deckWidth, h: V.deckThickness, d: 9 }, new Vector3(V.x, 6.5, -52.5), mats.concretePhoto, { rotation: new Vector3(-0.9, 0, 0), collider: true });
  rubblePile(ctx, "s17_viaduto_entulho", new Vector3(V.x, 0.15, -58), 9, 96, 2.5);
  for (let k = 0; k < 4; k++) ctx.cylinder(`s17_viaduto_vergalhao_${k}`, { height: 2.5, diameter: 0.05, tessellation: 5 }, new Vector3(V.x - 3 + k * 2, 11.6, -48.3), mats.metalRust, { rotation: new Vector3(1.1 + k * 0.2, 0, 0.3), shadow: false });
  // feira do viaduto (sombra do tabuleiro): barracas no canteiro, caixotes, lona, gerador
  marketStall(ctx, "s17_feira_banca", new Vector3(V.x, 0.15, -14), Math.PI / 2, "FEIRA DO VIADUTO · RAÍZES · SELOS");
  marketStall(ctx, "s17_feira_banca_2", new Vector3(V.x, 0.15, -20.5), -Math.PI / 2, "PEÇAS · PILHAS · REMENDOS");
  marketStall(ctx, "s17_feira_banca_3", new Vector3(V.x - 0.3, 0.15, -7.5), Math.PI / 2 + 0.3, "ROUPA USADA · TROCA");
  crateStack(ctx, "s17_feira_caixas", new Vector3(V.x + 2.6, 0.15, -17), 2, 97);
  barrel(ctx, "s17_feira_barril", new Vector3(V.x - 2.8, 0.15, -11), "rust", true);
  clothesline(ctx, "s17_feira_lona", new Vector3(V.x - 3.6, 3.6, -22), new Vector3(V.x + 3.6, 3.4, -5), 98);
  ctx.emitters.push({ kind: "crowd", position: new Vector3(V.x, 1.2, -14), radius: 16, volume: 0.35 });
  ctx.spawns.set("feirante", { position: new Vector3(V.x + 0.2, 0.15, -12.8), yaw: Math.PI });
  // placas da avenida
  for (const [z, yaw] of [[-30, 0], [34, Math.PI]] as Array<[number, number]>) {
    ctx.cylinder(`s17_av_placa_poste_${z}`, { height: 3.2, diameter: 0.08, tessellation: 6 }, new Vector3(60.2, 1.6 + STREET.curbHeight, z), mats.metalDark, { collider: true });
    placeSign(ctx, `s17_av_placa_${z}`, { bg: "#1d2a3a", fg: "#e8dcc0", lines: ["AV. DO MAGLEV", "LINHA 4 · DESATIVADA 2057"], weathered: 0.45, seed: 60 + z, border: "#b89036" }, {
      position: new Vector3(60.2, 2.8 + STREET.curbHeight, z),
      yaw,
      width: 1.8,
      height: 0.7,
      double: true,
    });
  }
}

/** Antena da Central de Suprimentos (marco do quarteirão da Apuração): mastro treliçado de 22 m no telhado da Central. */
function buildAntenaCentral(ctx: WorldContext): void {
  const { mats } = ctx;
  const L = LANDMARKS.find((l) => l.id === "antena_central")!;
  const cx = (L.rect.x0 + L.rect.x1) / 2;
  const cz = (L.rect.z0 + L.rect.z1) / 2;
  const roof = 2 * 3.5 + 0.6; // altura do corpo da Central (p_central: 2 pavimentos de 3,5 m)
  const H = L.height;
  ctx.box("s17_antena_base", { w: 2.4, h: 0.6, d: 2.4 }, new Vector3(cx, roof + 0.3, cz), mats.concrete);
  for (const [dx, dz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]] as Array<[number, number]>) {
    ctx.cylinder(`s17_antena_montante_${dx}_${dz}`, { height: H, diameterTop: 0.08, diameterBottom: 0.14, tessellation: 6 }, new Vector3(cx + dx * 0.9, roof + 0.6 + H / 2, cz + dz * 0.9), mats.metalPainted, { shadow: false, rotation: new Vector3(dz * 0.03, 0, -dx * 0.03) });
  }
  for (let k = 1; k < 8; k++) {
    const y = roof + 0.6 + k * (H / 8);
    const s = 1.6 - k * 0.14;
    ctx.box(`s17_antena_trav_x_${k}`, { w: s, h: 0.05, d: 0.05 }, new Vector3(cx, y, cz - s / 2), mats.metalDark, { shadow: false });
    ctx.box(`s17_antena_trav_x2_${k}`, { w: s, h: 0.05, d: 0.05 }, new Vector3(cx, y, cz + s / 2), mats.metalDark, { shadow: false });
    ctx.box(`s17_antena_trav_z_${k}`, { w: 0.05, h: 0.05, d: s }, new Vector3(cx - s / 2, y, cz), mats.metalDark, { shadow: false });
    ctx.box(`s17_antena_trav_z2_${k}`, { w: 0.05, h: 0.05, d: s }, new Vector3(cx + s / 2, y, cz), mats.metalDark, { shadow: false });
  }
  ctx.box("s17_antena_parabola", { w: 1.6, h: 1.6, d: 0.3 }, new Vector3(cx + 0.9, roof + 0.6 + H * 0.7, cz), mats.metalPainted, { rotationY: -0.6 });
  ctx.box("s17_antena_led", { w: 0.2, h: 0.2, d: 0.2 }, new Vector3(cx, roof + 0.6 + H + 0.1, cz), mats.emissiveRed, { batch: false, shadow: false });
  ctx.staticBoxCollider("s17_antena", { w: 2.2, h: H, d: 2.2 }, new Vector3(cx, roof + 0.6 + H / 2, cz), undefined, false);
}

/** Largo do Mercado: piso elevado ligando a praça à avenida, barracas junto ao p_leste, placa de rua. */
function buildLargo(ctx: WorldContext): void {
  const { mats } = ctx;
  const y = STREET.curbHeight;
  ctx.box("s17_largo_piso", { w: 12, h: y, d: 34 }, new Vector3(52.5, y / 2, -17), mats.pavingStones, { collider: true, shadow: false, cameraBlocker: false });
  marketStall(ctx, "s17_largo_banca_1", new Vector3(50, y, -3), 0, "FRUTAS DO CINTURÃO · SELOS");
  marketStall(ctx, "s17_largo_banca_2", new Vector3(55, y, -3.2), 0.15, "FERRAMENTAS · FIOS · FUSÍVEIS");
  crateStack(ctx, "s17_largo_caixas", new Vector3(57.5, y, -8), 2, 101, true);
  barrel(ctx, "s17_largo_barril", new Vector3(47.5, y, -24), "rust");
  bench(ctx, "s17_largo_banco", new Vector3(52.5, y, -22), 0);
  tree(ctx, "s17_largo_arvore", new Vector3(49.5, y, -14), 1.0, 102);
  ctx.box("s17_largo_cova", { w: 1.4, h: 0.02, d: 1.4 }, new Vector3(49.5, y + 0.01, -14), mats.soil, { shadow: false });
  streetLamp(ctx, "s17_largo_poste", new Vector3(56.5, y, -16), -1, "on");
  for (let k = 0; k < 5; k++) grassTuft(ctx, `s17_largo_mato_${k}`, new Vector3(47.5 + ((k * 3.7) % 10), y, -31 + ((k * 7.1) % 28)), 0.35, 103 + k);
  ctx.cylinder("s17_largo_placa_poste", { height: 3.0, diameter: 0.08, tessellation: 6 }, new Vector3(47.3, y + 1.5, -1.0), mats.metalDark, { collider: true });
  placeSign(ctx, "s17_largo_placa", { bg: "#1d2a3a", fg: "#e8dcc0", lines: ["LARGO DO MERCADO", "→ AV. DO MAGLEV · ↓ RUA DA ESCOLA"], weathered: 0.35, seed: 61, border: "#b89036" }, {
    position: new Vector3(47.3, y + 2.6, -1.0),
    yaw: Math.PI / 2,
    width: 1.8,
    height: 0.7,
    double: true,
  });
  ctx.emitters.push({ kind: "crowd", position: new Vector3(52.5, 1.2, -5), radius: 14, volume: 0.3 });
}

/** Vila dos Recicladores: quintais atrás dos sobrados (varais, caixotes, árvore) e o beco sem saída. */
function buildVila(ctx: WorldContext): void {
  const { mats } = ctx;
  for (const [i, x] of [-43.5, -34, -22.25, -11.5, -0.5, 9.5].entries()) {
    if (i % 2 === 0) clothesline(ctx, `s17_vila_varal_${i}`, new Vector3(x - 3, 2.6, 19), new Vector3(x + 3, 2.4, 25), 110 + i);
    if (i % 3 === 1) crateStack(ctx, `s17_vila_caixas_${i}`, new Vector3(x + 1.5, 0, 20), 2, 120 + i);
    if (i === 2) tree(ctx, "s17_vila_arvore", new Vector3(x, 0, 22), 1.0, 130);
    if (i === 4) barrel(ctx, "s17_vila_tambor", new Vector3(x - 2, 0, 24), "plastic");
    grassTuft(ctx, `s17_vila_mato_${i}`, new Vector3(x + 2, 0, 23 + (i % 2)), 0.4, 140 + i);
  }
  // beco (x -30…-27,5): piso de concreto gasto, caçamba pequena, cabos, luz fraca
  ctx.box("s17_vila_beco_piso", { w: 2.5, h: 0.05, d: 18 }, new Vector3(-28.75, 0.025, 27), mats.concrete, { shadow: false });
  ctx.box("s17_vila_beco_lixeira", { w: 0.8, h: 1.0, d: 1.2 }, new Vector3(-29.4, 0.5, 20), mats.metalRust, { collider: true });
  cable(ctx, "s17_vila_beco_cabo", new Vector3(-30, 6.5, 30), new Vector3(-27.5, 5.8, 24));
  ctx.spawns.set("beco_vila", { position: new Vector3(-28.75, 0.05, 30), yaw: Math.PI });
}

/** Postos de controle da Custódia nas pontas da avenida (cancela, blocos de concreto, guarita, placas). */
function buildCheckpoints(ctx: WorldContext): void {
  const { mats } = ctx;
  for (const [z, facing] of [[82, "S"], [-76, "N"]] as Array<[number, Facing]>) {
    const sign = Math.sign(z);
    const zc = z - sign * 2.0; // 2 m para dentro do muro
    // grade fechada ocupando o vão do muro (colisor) + cancela + blocos
    gateBars(ctx, `s17_controle_${z}_grade`, new Vector3(61.5, 0, z), new Vector3(83.5, 0, z), SECTOR_WALL_HEIGHT, true);
    for (const x of [64, 81]) ctx.box(`s17_controle_${z}_bloco_${x}`, { w: 2.4, h: 1.0, d: 1.2 }, new Vector3(x, 0.5, zc), mats.concrete, { collider: true, cameraBlocker: false });
    ctx.box(`s17_controle_${z}_cancela`, { w: 7.0, h: 0.12, d: 0.12 }, new Vector3(68.5, 1.05, zc), mats.metalPainted, { rotation: new Vector3(0, 0, 0.0) });
    ctx.box(`s17_controle_${z}_cancela_pe`, { w: 0.4, h: 1.1, d: 0.4 }, new Vector3(65.2, 0.55, zc), mats.metalDark, { collider: true });
    ctx.staticBoxCollider(`s17_controle_${z}_cancela_col`, { w: 7.0, h: 0.3, d: 0.15 }, new Vector3(68.5, 1.05, zc), undefined, false);
    // guarita
    const gx = 78;
    wallWithOpening(ctx, `s17_controle_${z}_guarita_a`, [gx - 1.3, zc - sign * 1.2], [gx + 1.3, zc - sign * 1.2], 2.6, 0.15, mats.plaster[2]!, { at: gx + 0.5, width: 0.9, height: 2.1 });
    wallWithOpening(ctx, `s17_controle_${z}_guarita_b`, [gx - 1.3, zc + sign * 1.2], [gx + 1.3, zc + sign * 1.2], 2.6, 0.15, mats.plaster[2]!);
    wallWithOpening(ctx, `s17_controle_${z}_guarita_c`, [gx - 1.3, zc - 1.2], [gx - 1.3, zc + 1.2], 2.6, 0.15, mats.plaster[2]!, { at: zc, width: 1.2, height: 1.0 });
    wallWithOpening(ctx, `s17_controle_${z}_guarita_d`, [gx + 1.3, zc - 1.2], [gx + 1.3, zc + 1.2], 2.6, 0.15, mats.plaster[2]!);
    ctx.box(`s17_controle_${z}_guarita_vidro`, { w: 0.03, h: 0.9, d: 1.1 }, new Vector3(gx - 1.3, 1.75, zc), mats.glassLit, { shadow: false });
    ctx.box(`s17_controle_${z}_guarita_laje`, { w: 2.9, h: 0.12, d: 2.7 }, new Vector3(gx, 2.66, zc), mats.concrete, { collider: true });
    // placas
    ctx.box(`s17_controle_${z}_placa_fundo`, { w: 6.1, h: 0.9, d: 0.06 }, new Vector3(72.5, SECTOR_WALL_HEIGHT - 0.6, z - sign * (0.22)), mats.metalDark, { shadow: false });
    placeSign(ctx, `s17_controle_${z}_placa`, { bg: "#7a1f1f", fg: "#f3e9d2", lines: ["LIMITE DO SETOR 17 · POSTO DE CONTROLE", facing === "S" ? "SAÍDA NORTE · ESTAÇÃO NOVE · REGISTRO OBRIGATÓRIO" : "SAÍDA SUL · ZONA PERIGOSA · ACESSO RESTRITO"], weathered: 0.3, seed: 70 + z, border: "#f3e9d2" }, {
      position: new Vector3(72.5, SECTOR_WALL_HEIGHT - 0.6, z - sign * 0.26),
      yaw: signYaw(facing),
      width: 6,
      height: 0.8,
    });
    streetLamp(ctx, `s17_controle_${z}_poste`, new Vector3(70, STREET.curbHeight, zc - sign * 3), 1, "on");
  }
  // placas de rua nas esquinas principais
  const corner = (id: string, pos: Vector3, yaw: number, lines: string[]) => {
    ctx.cylinder(`s17_esquina_${id}_poste`, { height: 3.0, diameter: 0.08, tessellation: 6 }, new Vector3(pos.x, STREET.curbHeight + 1.5, pos.z), mats.metalDark, { collider: true });
    placeSign(ctx, `s17_esquina_${id}`, { bg: "#1d2a3a", fg: "#e8dcc0", lines, weathered: 0.35, seed: 160 + id.length, border: "#b89036" }, { position: new Vector3(pos.x, STREET.curbHeight + 2.6, pos.z), yaw, width: 1.6, height: 0.7, double: true });
  };
  corner("recicladores_av", new Vector3(60, 0, 51.2), Math.PI / 2, ["R. DOS RECICLADORES", "AV. DO MAGLEV"]);
  corner("escola_av", new Vector3(60, 0, -33.3), Math.PI / 2, ["RUA DA ESCOLA", "AV. DO MAGLEV"]);
  corner("recicladores_cisterna", new Vector3(-50.5, 0, 51), 0, ["R. DOS RECICLADORES", "RUA DA CISTERNA"]);
  corner("escola_cisterna", new Vector3(-50.5, 0, -33.3), 0, ["RUA DA ESCOLA", "RUA DA CISTERNA"]);
}

/** Terrenos baldios atrás dos lotes (até o muro do setor): entulho, mato, pneus — sem ocupação. */
function buildWasteland(ctx: WorldContext): void {
  const spots: Array<[number, number, number]> = [[-50, 70, 1], [-5, 72, 2], [-40, -68, 3], [30, -68, 4], [102, -40, 5], [102, 30, 6], [-76.5, -70, 7], [-76.5, 60, 8], [50, 78, 9], [-30, -70, 10]];
  for (const [x, z, s] of spots) {
    rubblePile(ctx, `s17_baldio_entulho_${s}`, new Vector3(x, 0, z), 4 + (s % 3), 170 + s, 2.0);
    for (let k = 0; k < 4; k++) grassTuft(ctx, `s17_baldio_mato_${s}_${k}`, new Vector3(x + (rnd(180 + s, k) - 0.5) * 10, 0, z + (rnd(190 + s, k) - 0.5) * 6), 0.4 + rnd(200 + s, k) * 0.3, 210 + s * 4 + k);
    if (s % 4 === 0) tirePile(ctx, `s17_baldio_pneus_${s}`, new Vector3(x + 3, 0, z - 2), 3, 220 + s);
  }
  tree(ctx, "s17_baldio_arvore_1", new Vector3(-20, 0, 74), 1.3, 231);
  tree(ctx, "s17_baldio_arvore_2", new Vector3(44, 0, -70), 1.15, 232);
  tree(ctx, "s17_baldio_arvore_3", new Vector3(96, 0, 44), 1.0, 233);
}

// ---------------------------------------------------------------------------------------------------
// Luzes por distância
// ---------------------------------------------------------------------------------------------------

/**
 * Mantém acesas só as luzes locais (postes, lâmpadas) mais próximas do observador. Os materiais são
 * congelados em `buildWorld` (`freezeAll`): quando o conjunto de luzes muda, cada material é marcado
 * (`markDirty`) para o Babylon recompor a lista de luzes do shader — senão o material congelado fica
 * com luzes fantasmas. Sol e hemisférica nunca são tocados; faróis de veículo são do veículo.
 */
export class SectorLights {
  private lights: Light[] = [];
  private lastSet = "";
  private timer = 0;
  private collected = false;

  constructor(
    private readonly scene: Scene,
    private readonly maxActive: number,
    private readonly range = 70,
  ) {}

  private collect(): void {
    this.collected = true;
    this.lights = this.scene.lights.filter((l) => (l.getClassName() === "PointLight" || l.getClassName() === "SpotLight") && !/_farol_/.test(l.name));
  }

  /** Chamar por frame com a posição do observador (pés de Matias ou a câmera no menu). */
  update(dt: number, viewer: Vector3): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.5;
    if (!this.collected) this.collect();
    const ranked = this.lights
      .map((l) => ({ l, d: Vector3.Distance(l.getAbsolutePosition(), viewer) }))
      .sort((a, b) => a.d - b.d);
    const on = new Set<Light>();
    for (const { l, d } of ranked) {
      if (on.size >= this.maxActive || d > this.range) break;
      on.add(l);
    }
    const key = [...on].map((l) => l.uniqueId).sort((a, b) => a - b).join(",");
    if (key === this.lastSet) return;
    this.lastSet = key;
    for (const l of this.lights) {
      const want = on.has(l);
      if (l.isEnabled() !== want) l.setEnabled(want);
    }
    // prioridade: as mais próximas primeiro na lista de luzes de cada malha
    for (const [i, { l }] of ranked.entries()) l.renderPriority = 1000 - i;
    for (const m of this.scene.materials) if (m instanceof PBRMaterial) m.markDirty();
  }

  get activeCount(): number {
    return this.lights.filter((l) => l.isEnabled()).length;
  }

  get total(): number {
    if (!this.collected) this.collect();
    return this.lights.length;
  }
}

// ---------------------------------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------------------------------

export interface Sector17Handles {
  lights: SectorLights;
  /** luzes de interior criadas pelo setor (para testes) */
  interiorLights: Light[];
}

/** Constrói o Setor 17 inteiro em blockout em volta do quarteirão da Apuração (antes de ctx.finalize). */
export function buildSector17(ctx: WorldContext, onProgress?: (label: string) => void): Sector17Handles {
  const interior: Light[] = [];
  onProgress?.("Abrindo as ruas do Setor 17…");
  buildStreets(ctx);
  buildWalls(ctx);
  onProgress?.("Levantando os quarteirões…");
  for (const lot of LOTS) buildLot(ctx, lot);
  buildVila(ctx);
  buildLargo(ctx);
  onProgress?.("Depósito, escola e quadra…");
  buildDeposito(ctx, interior);
  buildEscola(ctx, interior);
  buildPostoFundos(ctx, interior);
  onProgress?.("Marcos do setor: viaduto, torre, cisterna, canopy…");
  buildViaduct(ctx);
  buildTorre(ctx);
  buildCisterna(ctx);
  buildCanopy(ctx);
  buildAntenaCentral(ctx);
  buildCheckpoints(ctx);
  buildWasteland(ctx);
  // mais luzes locais por material na qualidade média/alta (sol + hemisférica + 4 locais); baixa fica no padrão
  const maxLocal = ctx.quality === "baixa" ? 2 : 4;
  for (const m of ctx.scene.materials) if (m instanceof PBRMaterial) m.maxSimultaneousLights = maxLocal + 2;
  return { lights: new SectorLights(ctx.scene, maxLocal), interiorLights: interior };
}

/**
 * Tabela blockout → kit: posições (origem no chão, frente para +Z do módulo) para instanciar os nós de
 * `kit_tech.glb` por nome com `loadHeroAssets(scene, ctx, sector17KitPlacements(), kitUrl)` quando o kit
 * existir. O yaw segue a convenção dos módulos da praça (fachada olhando para a rua).
 */
export function sector17KitPlacements(): Array<{ asset: string; position: Vector3; yaw: number; id: string }> {
  const yawOf = (f: Facing) => (f === "N" ? 0 : f === "S" ? Math.PI : f === "E" ? Math.PI / 2 : -Math.PI / 2);
  const out: Array<{ asset: string; position: Vector3; yaw: number; id: string }> = [];
  for (const lot of LOTS) {
    const f = new Facade(lot.rect, lot.facing);
    out.push({ asset: lot.kit, position: f.at(f.width / 2, 0, 0), yaw: yawOf(lot.facing), id: lot.id });
  }
  for (const l of LANDMARKS) out.push({ asset: l.kit, position: new Vector3((l.rect.x0 + l.rect.x1) / 2, l.stacked ? 7.6 : 0, (l.rect.z0 + l.rect.z1) / 2), yaw: 0, id: l.id });
  for (const [z0, z1] of VIADUCT.decks) out.push({ asset: VIADUCT.kit, position: new Vector3(VIADUCT.x, 0, (z0 + z1) / 2), yaw: 0, id: `viaduto_${z0}` });
  return out;
}

export { zoneById };

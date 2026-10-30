import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { QualityLevel } from "@/core/settings";
import { MaterialLibrary } from "./materials";
import { WorldContext, type AmbientEmitterSpec, type SpawnPoint } from "./context";
import { buildStreet, STREET } from "./street";
import { buildBuilding, type BuildingSpec } from "./buildings";
import { buildWorkshop, type WorkshopHandles } from "./workshop";
import { buildPlaza } from "./plaza";
import { burntCar, cable, clothesline, crateStack, grassTuft, marketStall, rubblePile, streetLamp, tirePile, tree, barrel } from "./props";
import { placeSign } from "./signage";
import { buildSector17, type Sector17Handles } from "./sector17";
import { SECTOR_BOUNDS, SECTOR_CENTER } from "./bounds";
import type { Navmesh } from "./navmesh";

export interface World {
  ctx: WorldContext;
  mats: MaterialLibrary;
  shadowCasters: AbstractMesh[];
  spawns: Map<string, SpawnPoint>;
  emitters: AmbientEmitterSpec[];
  workshop: WorkshopHandles;
  /** Setor 17 em volta do quarteirão (luzes por distância) */
  sector17: Sector17Handles;
  /** malha de navegação (construída depois, de forma assíncrona, em Game) */
  navmesh: Navmesh | null;
}

/** Monta o quarteirão habitado de São Paulo Velha e, em volta dele, o Setor 17 inteiro (blockout). */
export function buildWorld(scene: Scene, quality: QualityLevel, onProgress?: (label: string) => void): World {
  const mats = new MaterialLibrary(scene, quality);
  const ctx = new WorldContext(scene, mats, quality);

  onProgress?.("Pavimentando a rua…");
  buildStreet(ctx);

  onProgress?.("Levantando as fachadas…");
  for (const spec of buildingSpecs(mats)) buildBuilding(ctx, spec);

  onProgress?.("Arrumando a oficina de Matias…");
  const workshop = buildWorkshop(ctx);

  onProgress?.("Montando a praça da Apuração…");
  buildPlaza(ctx);

  onProgress?.("Espalhando sinais de ocupação…");
  buildStreetLife(ctx);

  // o resto do setor (ruas, quarteirões, depósito, escola, marcos) cresce para fora do quarteirão
  const sector17 = buildSector17(ctx, onProgress);
  buildSkyline(ctx);

  onProgress?.("Otimizando a cena…");
  ctx.finalize();
  mats.freezeAll();

  return { ctx, mats, shadowCasters: ctx.shadowCasters, spawns: ctx.spawns, emitters: ctx.emitters, workshop, sector17, navmesh: null };
}

function buildingSpecs(mats: MaterialLibrary): BuildingSpec[] {
  const S = STREET;
  const north = (id: string, x0: number, x1: number, extra: Partial<BuildingSpec>): BuildingSpec => ({
    id,
    x0,
    x1,
    zFront: S.halfWidth + S.sidewalkDepth,
    facing: -1,
    depth: 11,
    floors: 3,
    material: mats.plaster[0]!,
    seed: x0 * 3 + 7,
    ...extra,
  });
  const south = (id: string, x0: number, x1: number, extra: Partial<BuildingSpec>): BuildingSpec => ({
    id,
    x0,
    x1,
    zFront: -(S.halfWidth + S.sidewalkDepth),
    facing: 1,
    depth: 11,
    floors: 3,
    material: mats.plaster[1]!,
    seed: x0 * 5 + 11,
    ...extra,
  });
  const P = S.plaza;
  return [
    // --- lado norte da rua -------------------------------------------------
    north("n1", -48, -37, { floors: 4, material: mats.plaster[3]!, boarded: 0.35, lit: 0.1, balconies: true, roof: ["caixa_dagua", "antena"], graffiti: [{ text: "QUEM DECIDE?", xOffset: 3.2, y: 1.6, color: "#d8d2c2" }] }),
    north("n2", -37, -27, { floors: 2, material: mats.plaster[4]!, groundFloor: "shop", lit: 0.3, roof: ["varal"], signs: [{ lines: ["ARMAZÉM DO CARLOS", "SELOS · ESCAMBO"], bg: "#3b2a1a", fg: "#e8dcc0", width: 4.6, height: 0.8, y: 3.0, weathered: 0.4 }] }),
    north("n3", -27, -15, { floors: 4, burnt: true, groundFloor: "wall", roof: [], ac: 0 }),
    north("n4", -15, -3, { floors: 3, material: mats.plaster[0]!, groundFloor: "door", lit: 0.35, boarded: 0.1, balconies: true, roof: ["caixa_dagua", "solar"], vines: true }),
    north("n5", -3, 6, { floors: 5, material: mats.plasterPhoto.gray, groundFloor: "shop", lit: 0.25, boarded: 0.2, roof: ["caixa_dagua", "antena", "varal"], signs: [{ lines: ["RECARGA DE BATERIAS", "ENERGIA · 9H ÀS 17H"], bg: "#1d2a3a", fg: "#e8dcc0", width: 4.2, height: 0.8, y: 3.0 }] }),
    north("n6", 6, 14, { floors: 3, material: mats.plasterPhoto.sand, groundFloor: "door", lit: 0.15, boarded: 0.3, ac: 1, graffiti: [{ text: "A MÃE PROVÊ", xOffset: 2.0, y: 1.5, color: "#b89036" }] }),
    // --- lado sul da rua (a oficina ocupa x∈[-35,-25] e é construída à parte) ---
    south("s1", -48, -35, { floors: 3, material: mats.plaster[2]!, boarded: 0.4, lit: 0.05, groundFloor: "wall", roof: ["antena"], vines: true, ac: 0 }),
    south("s3", -25, -13, { floors: 4, material: mats.plaster[0]!, groundFloor: "door", lit: 0.3, balconies: true, roof: ["caixa_dagua", "varal"] }),
    south("s4", -13, -1, { floors: 2, material: mats.plaster[4]!, groundFloor: "shop", lit: 0.4, roof: ["solar", "caixa_dagua"], signs: [{ lines: ["ESCOLA DO SETOR", "AULAS: 8H · 13H"], bg: "#2f4a3e", fg: "#e8dcc0", width: 4.4, height: 0.8, y: 3.0, weathered: 0.2 }] }),
    south("s5", -1, 14, { floors: 5, material: mats.plaster[1]!, groundFloor: "door", lit: 0.2, boarded: 0.25, balconies: true, roof: ["caixa_dagua", "antena"], ac: 3 }),
    // --- perímetro da praça ------------------------------------------------
    { id: "p_norte_1", x0: P.x0, x1: 30, zFront: P.z1 + 0.5, facing: -1, depth: 12, floors: 3, material: mats.plasterPhoto.warm, groundFloor: "door", roof: ["caixa_dagua"], seed: 101, frontModel: true },
    // Central de Suprimentos: a fachada (16 m, 2 pavimentos, portão) é o módulo GLB `fachada_central` (heroAssets);
    // o corpo começa 0,5 m atrás da fachada para não coincidir com a parede do módulo
    { id: "p_central", x0: 30, x1: P.x1, zFront: P.z1 + 0.5, facing: -1, depth: 11.5, floors: 2, floorHeight: 3.5, material: mats.plasterPhoto.gray, groundFloor: "gate", seed: 103, frontModel: true },
    { id: "p_leste", x0: P.x1 + 0.5, x1: P.x1 + 12, zFront: 0, facing: -1, depth: 36, floors: 3, material: mats.plasterPhoto.sand, boarded: 0.2, lit: 0.25, groundFloor: "wall", roof: ["caixa_dagua", "varal"], balconies: false, seed: 107 },
    { id: "p_sul_medico", x0: 20, x1: 34, zFront: P.z0, facing: 1, depth: 10, floors: 2, floorHeight: 3.4, material: mats.plaster[2]!, boarded: 0.0, lit: 0.6, groundFloor: "door", roof: ["solar", "caixa_dagua"], ac: 2, seed: 109, signs: [{ lines: ["✚ POSTO MÉDICO COMUNITÁRIO", "SETOR 17 · 7H ÀS 19H"], bg: "#2a5a3a", fg: "#f3f0e6", width: 6.0, height: 0.9, y: 3.3, weathered: 0.1 }] },
    { id: "p_sul_1", x0: P.x0, x1: 20, zFront: P.z0, facing: 1, depth: 10, floors: 3, material: mats.plaster[4]!, boarded: 0.4, lit: 0.1, groundFloor: "wall", roof: ["antena"], seed: 111, vines: true },
    { id: "p_sul_2", x0: 34, x1: P.x1, zFront: P.z0, facing: 1, depth: 10, floors: 3, material: mats.plaster[1]!, boarded: 0.2, lit: 0.3, groundFloor: "shop", roof: ["varal", "caixa_dagua"], seed: 113, signs: [{ lines: ["BARBEARIA · CONSERTOS DE RÁDIO"], bg: "#3b2a1a", fg: "#e8dcc0", width: 4.6, height: 0.7, y: 3.0, weathered: 0.35 }] },
  ];
}

/** Props da rua: postes, árvores, mato, carro queimado, entulho, barraca, varais. */
function buildStreetLife(ctx: WorldContext): void {
  const S = STREET;
  const curb = S.curbHeight;
  const zN = S.halfWidth + 1.0;
  const zS = -(S.halfWidth + 1.0);

  // Postes: só um funciona, outro pisca
  streetLamp(ctx, "poste_rua_1", new Vector3(-38, curb, zS), 1, "off");
  streetLamp(ctx, "poste_rua_2", new Vector3(-12, curb, zN), -1, "flicker");
  streetLamp(ctx, "poste_rua_3", new Vector3(8, curb, zS), 1, "on");
  cable(ctx, "cabo_1", new Vector3(-12, 6.3, zN), new Vector3(-20, 9.5, S.halfWidth + S.sidewalkDepth + 0.1));
  cable(ctx, "cabo_2", new Vector3(8, 6.3, zS), new Vector3(2, 8.5, -(S.halfWidth + S.sidewalkDepth + 0.1)));
  cable(ctx, "cabo_3", new Vector3(8, 6.3, zS), new Vector3(16, 5.2, -7.6));

  // Árvores em covas na calçada
  for (const [x, z, s, seed] of [[-42, zS, 1.0, 1], [-20, zN - 0.2, 1.25, 2], [2, zS, 0.9, 3], [-4, zN, 1.1, 4]] as Array<[number, number, number, number]>) {
    ctx.box(`cova_${x}`, { w: 1.4, h: 0.02, d: 1.4 }, new Vector3(x, curb + 0.01, z), ctx.mats.soil, { shadow: false });
    tree(ctx, `arvore_rua_${x}`, new Vector3(x, curb, z), s, seed);
  }
  // Mato nas rachaduras da calçada e do asfalto
  for (let k = 0; k < 28; k++) {
    const x = S.xWest + 2 + ((k * 4.7) % (S.xEast - S.xWest - 4));
    const side = k % 2 === 0 ? 1 : -1;
    const z = side * (S.halfWidth + 0.35 + (k % 3) * 0.9);
    grassTuft(ctx, `mato_rua_${k}`, new Vector3(x, curb, z), 0.3 + (k % 4) * 0.08, 200 + k);
  }

  // Carro queimado abandonado e entulho
  burntCar(ctx, "carro_queimado", new Vector3(-19, 0, -2.3), 0.25);
  rubblePile(ctx, "entulho_n3", new Vector3(-21, curb, zN + 0.8), 7, 300, 2.2);
  tirePile(ctx, "pneus", new Vector3(-41, curb, zN + 0.6), 4, 301);
  barrel(ctx, "barril_rua_1", new Vector3(-23.5, curb, zS - 0.9), "rust");
  barrel(ctx, "barril_rua_2", new Vector3(-24.2, curb, zS - 1.4), "rust", true);
  crateStack(ctx, "caixas_armazem", new Vector3(-29.5, curb, zN + 1.3), 2, 302, true);
  crateStack(ctx, "caixas_escola", new Vector3(-10, curb, zS - 1.2), 1, 303);

  // Barraca do comerciante (lado norte, frente para a rua)
  marketStall(ctx, "barraca", new Vector3(-8, curb, zN + 1.2), Math.PI, "MERCADO DO 17 · RAÍZES E SELOS");
  ctx.spawns.set("comerciante", { position: new Vector3(-8, curb, zN + 2.3), yaw: Math.PI });

  // Varais atravessando a rua entre fachadas (bairro ocupado)
  const top = S.halfWidth + S.sidewalkDepth;
  clothesline(ctx, "varal_rua_1", new Vector3(-31, 7.2, top), new Vector3(-30, 6.8, -top), 400);
  clothesline(ctx, "varal_rua_2", new Vector3(-7, 8.4, top), new Vector3(-6, 8.1, -top), 401);

  // Pichação de rua e cartaz da Igreja na parede queimada
  placeSign(ctx, "cartaz_igreja", { bg: "#e6dcc3", fg: "#6b5320", lines: ["A CONTINUIDADE", "É SAGRADA", "REGISTRE-SE"], font: `bold 110px "Georgia", serif`, weathered: 0.35, seed: 77, pxWidth: 512, pxHeight: 768 }, {
    position: new Vector3(-24, 2.0, top + 0.02),
    yaw: 0,
    width: 1.1,
    height: 1.65,
  });
  placeSign(ctx, "cartaz_rasgado", { bg: "#d8d2c2", fg: "#8a1f1f", lines: ["APURAÇÃO", "SETOR 17", "15H"], weathered: 0.6, seed: 78, pxWidth: 512, pxHeight: 640 }, {
    position: new Vector3(-16.5, 1.7, top + 0.02),
    yaw: 0,
    width: 0.8,
    height: 1.0,
  });
}

/**
 * Silhueta de São Paulo Velha além dos muros do Setor 17: blocos de prédios distantes (sem detalhe, sem
 * colisão, sem sombra) em anéis a 25–140 m do limite do setor, para as ruas não terminarem num vazio.
 * Nenhum bloco entra no retângulo do setor (+12 m de folga); a névoa (visibilidade ~250 m) apaga o anel externo.
 */
function buildSkyline(ctx: WorldContext): void {
  const { mats } = ctx;
  const rnd = (seed: number) => {
    const v = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return v - Math.floor(v);
  };
  const palette = [mats.plasterPhoto.gray, mats.plasterPhoto.sand, mats.plasterPhoto.warm, mats.concrete];
  const B = SECTOR_BOUNDS;
  const margin = 12;
  const halfX = (B.x1 - B.x0) / 2;
  const halfZ = (B.z1 - B.z0) / 2;
  let i = 0;
  for (let ring = 0; ring < 3; ring++) {
    const dist = 25 + ring * 45; // distância do anel ao limite do setor
    const count = 26 + ring * 10;
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2 + rnd(i * 3 + 1) * 0.2;
      // ponto sobre um "retângulo arredondado" em volta do setor
      const rx = halfX + dist + (rnd(i * 3 + 2) - 0.5) * 24;
      const rz = halfZ + dist + (rnd(i * 5 + 2) - 0.5) * 24;
      const x = SECTOR_CENTER.x + Math.cos(a) * rx;
      const z = SECTOR_CENTER.z + Math.sin(a) * rz;
      const w = 12 + rnd(i * 3 + 3) * 18;
      const d = 12 + rnd(i * 7 + 1) * 18;
      const h = 9 + rnd(i * 7 + 2) * (ring === 0 ? 16 : 36);
      i++;
      // nunca dentro do setor nem em cima do muro
      if (x + w / 2 > B.x0 - margin && x - w / 2 < B.x1 + margin && z + d / 2 > B.z0 - margin && z - d / 2 < B.z1 + margin) continue;
      ctx.box(`skyline_${i}`, { w, h, d }, new Vector3(x, h / 2 - 0.2, z), palette[i % palette.length]!, { collider: false, shadow: false, cameraBlocker: false, rotationY: rnd(i * 7 + 3) * 0.3 });
    }
  }
  // duas torres altas ao longe (nordeste e sudoeste) para a leitura de metrópole no horizonte
  ctx.box("skyline_torre_ne", { w: 22, h: 70, d: 22 }, new Vector3(B.x1 + 150, 34.8, B.z1 + 120), mats.plasterPhoto.gray, { collider: false, shadow: false, cameraBlocker: false, rotationY: 0.3 });
  ctx.box("skyline_torre_so", { w: 18, h: 58, d: 26 }, new Vector3(B.x0 - 140, 28.8, B.z0 - 110), mats.concrete, { collider: false, shadow: false, cameraBlocker: false, rotationY: -0.2 });
}

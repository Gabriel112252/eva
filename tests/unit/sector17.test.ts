import { describe, expect, it } from "vitest";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { SECTOR_BOUNDS, GROUND_FENCE_RADIUS, GROUND_SIZE, rectContains, rectsOverlap } from "@/world/bounds";
import { SECTOR17_ZONES, zoneAt, zoneById, zonesAt } from "@/world/sector17Zones";
import {
  ALLEYS,
  DEPOSITO,
  ESCOLA,
  LANDMARKS,
  LOTS,
  POIS,
  ROOFS,
  RUA_APURACAO,
  STREETS,
  VAN_ROUTE,
  VIADUCT,
  WALLS,
  clearanceAt,
  crossingStreets,
  lotsOnStreets,
  overlappingPairs,
  sector17KitPlacements,
  streetAsphalt,
  streetRect,
  streetRightOfWay,
  streetsConnected,
  subtractIntervals,
  wallRects,
} from "@/world/sector17";
import { GridNavmesh, type StaticBox } from "@/world/navmesh";
import { MISSION_POINTS } from "@/narrative/missionDirector";
import { STREET } from "@/world/street";
import { WORKSHOP } from "@/world/workshop";

const inSector = (x: number, z: number) => rectContains(SECTOR_BOUNDS, x, z);

describe("Setor 17 — dados da planta", () => {
  it("lotes, marcos e o quarteirão original não se sobrepõem em planta", () => {
    expect(overlappingPairs()).toEqual([]);
  });

  it("nenhum lote ou marco invade o domínio de uma rua", () => {
    expect(lotsOnStreets()).toEqual([]);
  });

  it("tudo fica dentro dos limites do setor", () => {
    for (const l of [...LOTS, ...LANDMARKS]) {
      expect(inSector(l.rect.x0, l.rect.z0), l.id).toBe(true);
      expect(inSector(l.rect.x1, l.rect.z1), l.id).toBe(true);
    }
    for (const s of STREETS) {
      const r = streetRect(s);
      expect(inSector(r.x0, r.z0), s.id).toBe(true);
      expect(inSector(r.x1, r.z1), s.id).toBe(true);
    }
    for (const w of WALLS) {
      expect(inSector(w.from[0], w.from[1]), w.id).toBe(true);
      expect(inSector(w.to[0], w.to[1]), w.id).toBe(true);
    }
  });

  it("as ruas formam uma malha conexa e cada rua cruza pelo menos outra", () => {
    expect(streetsConnected()).toBe(true);
    for (const s of STREETS) expect(crossingStreets(s).length, s.id).toBeGreaterThan(0);
    // a rua da Apuração (existente) desemboca na praça, que abre para o Largo e a avenida
    expect(RUA_APURACAO.to).toBe(STREET.plaza.x0);
  });

  it("subtractIntervals corta vãos corretamente", () => {
    expect(subtractIntervals([0, 10], [[3, 4]])).toEqual([[0, 3], [4, 10]]);
    expect(subtractIntervals([0, 10], [[-1, 2], [8, 12]])).toEqual([[2, 8]]);
    expect(subtractIntervals([0, 10], [[0, 10]])).toEqual([]);
  });

  it("ruas têm largura útil para a van (≥ 7 m de asfalto) e calçadas", () => {
    for (const s of STREETS) {
      const [a0, a1] = streetAsphalt(s);
      expect(a1 - a0, s.id).toBeGreaterThanOrEqual(7);
      const [r0, r1] = streetRightOfWay(s);
      expect(r1 - r0 - (a1 - a0), s.id).toBeGreaterThanOrEqual(6);
    }
  });

  it("o quarteirão original permanece no lugar: oficina, rua, praça, portão e pontos da missão", () => {
    expect(STREET.xWest).toBe(-48);
    expect(STREET.plaza).toEqual({ x0: 14, x1: 46, z0: -18, z1: 18 });
    expect(WORKSHOP.x0).toBe(-35);
    expect(MISSION_POINTS.gate.x).toBe(34);
    expect(MISSION_POINTS.vanSpawn.z).toBe(13);
    // o Largo do Mercado é a única abertura da praça: fica fora dos prédios existentes
    for (const l of LOTS) expect(rectsOverlap(l.rect, { x0: 14, x1: 46, z0: -18, z1: 18 }), l.id).toBe(false);
  });

  it("a rota da van (1,9 m) tem folga em todos os pontos e a porta/corredor do depósito comportam a van", () => {
    for (const p of VAN_ROUTE) {
      if (p.interior) continue;
      expect(clearanceAt(p.x, p.z), `${p.name} (${clearanceAt(p.x, p.z).toFixed(1)} m)`).toBeGreaterThanOrEqual(p.clearance);
    }
    expect(DEPOSITO.door.x1 - DEPOSITO.door.x0).toBeGreaterThanOrEqual(1.9 + 2 * 1.2);
    expect(DEPOSITO.door.height).toBeGreaterThan(1.95 + 1.0);
    expect(DEPOSITO.aisle.x1 - DEPOSITO.aisle.x0).toBeGreaterThanOrEqual(1.9 + 2 * 1.5);
    for (const s of DEPOSITO.shelves) expect(rectsOverlap(s, { x0: DEPOSITO.aisle.x0, x1: DEPOSITO.aisle.x1, z0: DEPOSITO.rect.z0, z1: DEPOSITO.rect.z1 })).toBe(false);
    // interior de 20×14 m
    expect(DEPOSITO.rect.x1 - DEPOSITO.rect.x0 - 2 * DEPOSITO.wall).toBeCloseTo(20.2, 1);
    expect(DEPOSITO.rect.z1 - DEPOSITO.rect.z0 - 2 * DEPOSITO.wall).toBeCloseTo(14.2, 1);
  });

  it("portões dos muros ficam dentro do segmento e o portão da zona de distribuição é aberto", () => {
    for (const w of WALLS) {
      if (!w.gate) continue;
      const len = Math.hypot(w.to[0] - w.from[0], w.to[1] - w.from[1]);
      expect(w.gate.at + w.gate.width, w.id).toBeLessThanOrEqual(len + 0.01);
      expect(wallRects(w).length, w.id).toBeGreaterThan(0);
    }
    const zd = WALLS.find((w) => w.id === "zd_sul")!;
    expect(zd.gate?.open).toBe(true);
    expect(wallRects(zd).length).toBe(2);
  });

  it("escola: quadra cercada com dois portões, bloco com salas, corredor e escada até o telhado", () => {
    expect(ESCOLA.quadra.x1 - ESCOLA.quadra.x0).toBeGreaterThanOrEqual(24);
    expect(ESCOLA.quadra.z1 - ESCOLA.quadra.z0).toBeGreaterThanOrEqual(14);
    expect(ESCOLA.quadraGates.length).toBe(2);
    expect(ESCOLA.salas.length).toBe(2);
    for (const s of ESCOLA.salas) expect(rectsOverlap(s, { x0: ESCOLA.bloco.x0, x1: ESCOLA.bloco.x1, z0: ESCOLA.corridor.z0, z1: ESCOLA.corridor.z1 })).toBe(false);
    expect(ESCOLA.stair.x0).toBeGreaterThanOrEqual(ESCOLA.bloco.x1);
    const roof = ROOFS.find((r) => r.id === "telhado_escola")!;
    expect(roof.y).toBeCloseTo(2 * ESCOLA.floorHeight + 0.6, 1);
  });

  it("telhados pousáveis: pelo menos três, com zona e acesso, e lajes maiores que a Rastro (2,6×2,7 m)", () => {
    expect(ROOFS.length).toBeGreaterThanOrEqual(3);
    for (const r of ROOFS) {
      expect(r.rect.x1 - r.rect.x0, r.id).toBeGreaterThan(6);
      expect(r.rect.z1 - r.rect.z0, r.id).toBeGreaterThan(6);
      expect(r.access.length, r.id).toBeGreaterThan(5);
      const z = zoneById(r.zone);
      expect(z, r.zone).toBeDefined();
      expect(Math.abs(z!.center[1] - r.y), r.id).toBeLessThan(0.3);
      expect(rectContains(r.rect, z!.center[0], z!.center[2]), r.id).toBe(true);
    }
  });

  it("marcos: volumes reservados (viaduto de 24 m, base de torre de 12 m) e um marco por quarteirão", () => {
    const torre = LANDMARKS.find((l) => l.id === "torre")!;
    expect(torre.rect.x1 - torre.rect.x0).toBe(12);
    expect(torre.rect.z1 - torre.rect.z0).toBe(12);
    expect(VIADUCT.segmentLength).toBe(24);
    for (const [z0, z1] of VIADUCT.decks) expect(z1 - z0).toBe(VIADUCT.segmentLength);
    for (const z of VIADUCT.pillars) {
      // pilares nunca no asfalto das ruas leste-oeste
      for (const s of STREETS.filter((s) => s.axis === "x")) {
        const [a0, a1] = streetAsphalt(s);
        expect(z + VIADUCT.pillarSize / 2 <= a0 || z - VIADUCT.pillarSize / 2 >= a1, `pilar ${z} × ${s.id}`).toBe(true);
      }
    }
    const blocks = new Set([...LANDMARKS.map((l) => l.block)]);
    for (const b of ["Q0", "Q1", "Q3", "Q4"]) expect(blocks.has(b as never), b).toBe(true);
  });

  it("becos da furtividade: duas rotas alternativas até a quadra (beco atrás da praça e rua da Escola)", () => {
    const beco = ALLEYS.find((a) => a.id === "beco_praca")!;
    expect(beco.rect.z1 - beco.rect.z0).toBe(beco.width);
    // o beco liga o Largo (x≈46,5) ao pátio da escola (x≈14): só o consultório dos fundos entra na faixa,
    // deixando o estreitamento de 2 m livre
    const pinch = ALLEYS.find((a) => a.id === "beco_praca_pinch")!;
    for (const l of [...LOTS, ...LANDMARKS.filter((l) => !l.stacked)]) {
      if (l.id === "posto_fundos") {
        expect(rectsOverlap(l.rect, pinch.rect)).toBe(false);
        continue;
      }
      expect(rectsOverlap(l.rect, beco.rect), l.id).toBe(false);
    }
    expect(pinch.width).toBeGreaterThanOrEqual(1.5);
    const escola = STREETS.find((s) => s.id === "rua_escola")!;
    expect(streetRightOfWay(escola)[1]).toBe(-34); // a calçada norte encosta no muro do beco
  });

  it("tabela blockout → kit: todo lote e marco tem nó do kit com prefixo válido", () => {
    const prefixes = /^(FACHADA|TECH|REMENDO|MARCO|PROP)_/;
    for (const l of LOTS) expect(l.kit, l.id).toMatch(prefixes);
    for (const l of LANDMARKS) expect(l.kit, l.id).toMatch(prefixes);
    const placements = sector17KitPlacements();
    expect(placements.length).toBe(LOTS.length + LANDMARKS.length + VIADUCT.decks.length);
    for (const p of placements) expect(inSector(p.position.x, p.position.z), p.id).toBe(true);
  });
});

describe("Setor 17 — zonas", () => {
  it("ids únicos, centros dentro do setor e ids pedidos pelo roteiro presentes", () => {
    const ids = SECTOR17_ZONES.map((z) => z.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const z of SECTOR17_ZONES) expect(inSector(z.center[0], z.center[2]), z.id).toBe(true);
    for (const id of ["zona.deposito", "zona.escola", "zona.quadra", "zona.posto_raquel", "zona.banca", "zona.telhado_escola", "zona.limite_setor_norte", "zona.limite_setor_sul"]) expect(zoneById(id), id).toBeDefined();
  });

  it("zonas de lugares coincidem com a geometria", () => {
    const dep = zoneById("zona.deposito")!;
    expect(rectContains(DEPOSITO.rect, dep.center[0], dep.center[2])).toBe(true);
    const quadra = zoneById("zona.quadra")!;
    expect(rectContains(ESCOLA.quadra, quadra.center[0], quadra.center[2])).toBe(true);
    const banca = zoneById("zona.banca")!;
    expect(Math.abs(banca.center[0] - VIADUCT.x)).toBeLessThan(VIADUCT.deckWidth / 2);
    const posto = zoneById("zona.posto_raquel")!;
    expect(posto.center[2]).toBeGreaterThan(-18); // na praça, diante da porta do posto médico
    for (const p of POIS) expect(inSector(p.position[0], p.position[2]), p.id).toBe(true);
  });

  it("zoneAt devolve a zona mais específica e respeita a altura dos telhados", () => {
    expect(zoneAt(34.5, 65.5)?.id).toBe("zona.deposito");
    expect(zoneAt(20, 60)?.id).toBe("zona.distribuicao");
    expect(zoneAt(-6, -29, 7.0)?.id).toBe("zona.telhado_escola");
    expect(zoneAt(-6, -29, 0.1)?.id).toBe("zona.escola_salas");
    expect(zoneAt(-30, -10.5)?.id).toBe("zona.oficina");
    expect(zoneAt(0, 0)?.id).toBe("zona.rua_apuracao");
    expect(zoneAt(-70, 0)?.id).toBe("zona.cisterna");
    expect(zoneAt(300, 300)).toBeNull();
    expect(zonesAt(72.5, -14).map((z) => z.id)).toEqual(expect.arrayContaining(["zona.banca", "zona.feira_viaduto"]));
  });
});

describe("Setor 17 — limites e navegação em grade", () => {
  it("cerca da aeromoto e chão cobrem o setor", () => {
    const corners: Array<[number, number]> = [[SECTOR_BOUNDS.x0, SECTOR_BOUNDS.z0], [SECTOR_BOUNDS.x1, SECTOR_BOUNDS.z1], [SECTOR_BOUNDS.x0, SECTOR_BOUNDS.z1], [SECTOR_BOUNDS.x1, SECTOR_BOUNDS.z0]];
    for (const [x, z] of corners) {
      expect(Math.hypot(x, z)).toBeLessThan(GROUND_FENCE_RADIUS);
      expect(Math.abs(x)).toBeLessThan(GROUND_SIZE / 2);
      expect(Math.abs(z)).toBeLessThan(GROUND_SIZE / 2);
    }
  });

  it("a grade A* contorna caixas e liga a oficina ao depósito", () => {
    const area = { x0: -10, x1: 10, z0: -10, z1: 10 };
    const wall: StaticBox = { name: "col_muro", center: new Vector3(0, 1.5, 0), half: new Vector3(0.2, 1.5, 6), rotation: Quaternion.Identity() };
    const low: StaticBox = { name: "col_meio_fio", center: new Vector3(5, 0.06, 0), half: new Vector3(1, 0.06, 1), rotation: Quaternion.Identity() };
    const grid = GridNavmesh.fromBoxes(area, [wall, low], 0.5);
    expect(grid.stats.kind).toBe("grade");
    const path = grid.findPath(new Vector3(-5, 0, 0), new Vector3(5, 0, 0));
    expect(path.length).toBeGreaterThanOrEqual(2);
    // contorna o muro pelo norte ou pelo sul: algum ponto passa de |z| > 6
    expect(path.some((p) => Math.abs(p.z) > 6)).toBe(true);
    // nenhum ponto do caminho dentro do muro
    for (const p of path) expect(Math.abs(p.x) < 0.5 && Math.abs(p.z) < 6).toBe(false);
    // o meio-fio baixo não bloqueia
    const direct = grid.findPath(new Vector3(3, 0, 0), new Vector3(7, 0, 0));
    expect(direct.length).toBeGreaterThanOrEqual(2);
    expect(direct.length).toBeLessThanOrEqual(3);
    expect(grid.getClosestPoint(new Vector3(0, 0, 0)).x).not.toBe(0);
    const rp = grid.getRandomPointAround(new Vector3(-5, 0, 5), 3);
    expect(Math.hypot(rp.x + 5, rp.z - 5)).toBeLessThan(3.8);
  });
});

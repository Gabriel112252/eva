import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Facade, LANDMARKS, LOTS, VIADUCT, lotHeight, type Facing } from "@/world/sector17";
import { KIT, KIT_PIECE, facadeLayout, facingYaw, frontBlockedFraction, kitInstancing, kitLodDistance, lotColor, lotRows, planLot, planSector17Kit, piecesUsed, sector17KitEnabled, sharedNeighbor, toFacade } from "@/world/sector17Kit";

/** Nomes dos nós-raiz de kit_tech.glb (lidos do bloco JSON do GLB). */
function kitRootNames(): Set<string> {
  const buf = readFileSync(resolve(__dirname, "../../public/assets/environments/kit_tech.glb"));
  const len = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.subarray(20, 20 + len).toString("utf8")) as { scenes: Array<{ nodes: number[] }>; nodes: Array<{ name: string }> };
  return new Set(gltf.scenes[0]!.nodes.map((i) => gltf.nodes[i]!.name));
}

describe("Setor 17 — kit: módulos por fachada", () => {
  it("largura ÷ 6 m: arredonda, comprime até 18 % ou estica até 15 %; a sobra vai para as pontas", () => {
    const cases: Array<[number, number, number]> = [
      // largura, módulos, escala
      [12, 2, 1],
      [18, 3, 1],
      [24, 4, 1],
      [11, 2, 11 / 12],
      [10, 2, 10 / 12],
      [16, 3, 16 / 18],
      [13, 2, 13 / 12],
      [8, 1, 1.15],
      [9, 1, 1.15],
      [14, 2, 1.15],
    ];
    for (const [w, n, s] of cases) {
      const l = facadeLayout(w);
      expect(l.count, `${w} m`).toBe(n);
      expect(l.scale, `${w} m`).toBeCloseTo(s, 5);
      expect(l.count * l.moduleWidth + l.leftover, `${w} m`).toBeCloseTo(w, 6);
      expect(l.start).toBeCloseTo(l.leftover / 2, 6);
    }
    expect(facadeLayout(8).leftover).toBeCloseTo(1.1, 6);
    expect(facadeLayout(9).leftover).toBeCloseTo(2.1, 6);
  });

  it("todo lote: escala 0,82–1,15, módulos dentro da fachada e sobra pequena", () => {
    for (const lot of LOTS) {
      const W = new Facade(lot.rect, lot.facing).width;
      const l = facadeLayout(W);
      expect(l.scale, lot.id).toBeGreaterThanOrEqual(KIT.squeezeMin - 1e-9);
      expect(l.scale, lot.id).toBeLessThanOrEqual(KIT.stretchMax + 1e-9);
      expect(l.leftover, lot.id).toBeLessThan(2.2);
      expect(l.start + l.count * l.moduleWidth, lot.id).toBeLessThanOrEqual(W + 1e-6);
    }
  });

  it("pavimentos do kit (3 m) cobrem o blockout: o topo fica acima da laje e não sobra mais de 1,5 m", () => {
    for (const lot of LOTS) {
      const rows = lotRows(lot);
      const top = 0.12 + rows * KIT.floor + 1.14; // calçada + pavimentos + coroamento (FACHADA_topo_0)
      expect(top, lot.id).toBeGreaterThan(lotHeight(lot));
      expect(top - lotHeight(lot), lot.id).toBeLessThan(1.5);
    }
    expect(lotRows(LOTS.find((l) => l.id === "q2d")!)).toBe(2); // mercado: 1 pavimento de 5,6 m
  });
});

describe("Setor 17 — kit: orientação", () => {
  it("a frente +Z da peça girada pelo yaw aponta para a rua e o X local corre ao longo da fachada (u)", () => {
    const out: Record<Facing, [number, number]> = { N: [0, 1], S: [0, -1], E: [1, 0], W: [-1, 0] };
    for (const facing of ["N", "S", "E", "W"] as Facing[]) {
      const rot = Matrix.RotationY(facingYaw(facing));
      const front = Vector3.TransformNormal(new Vector3(0, 0, 1), rot);
      expect(front.x, facing).toBeCloseTo(out[facing][0], 6);
      expect(front.z, facing).toBeCloseTo(out[facing][1], 6);
      const f = new Facade({ x0: 0, x1: 10, z0: 0, z1: 8 }, facing);
      const along = f.at(1, 0, 0).subtract(f.at(0, 0, 0));
      const localX = Vector3.TransformNormal(new Vector3(1, 0, 0), rot);
      expect(localX.x, facing).toBeCloseTo(along.x, 6);
      expect(localX.z, facing).toBeCloseTo(along.z, 6);
    }
  });

  it("toFacade é o inverso de Facade.at", () => {
    for (const lot of LOTS) {
      const f = new Facade(lot.rect, lot.facing);
      const p = f.at(2.5, 0, -1.25);
      const q = toFacade(lot, p.x, p.z);
      expect(q.u, lot.id).toBeCloseTo(2.5, 6);
      expect(q.w, lot.id).toBeCloseTo(-1.25, 6);
    }
  });

  it("os módulos térreos ficam na linha da fachada, na altura da calçada, com o yaw do lote", () => {
    const plan = planSector17Kit();
    for (const lot of LOTS) {
      const ground = plan.instances.filter((i) => i.owner === lot.id && /^FACHADA_(terreo|galpao)/.test(i.piece) && Math.abs(i.y - 0.12) < 1e-6);
      expect(ground.length, lot.id).toBeGreaterThan(0);
      for (const g of ground) {
        const q = toFacade(lot, g.x, g.z);
        expect(q.w, lot.id).toBeCloseTo(0, 6);
        expect(q.u, lot.id).toBeGreaterThan(0);
        expect(q.u, lot.id).toBeLessThan(new Facade(lot.rect, lot.facing).width);
        expect(g.yaw, lot.id).toBeCloseTo(facingYaw(lot.facing), 6);
      }
    }
  });
});

describe("Setor 17 — kit: sorteio e composição", () => {
  it("é determinístico (mesma semente → mesmo plano)", () => {
    expect(JSON.stringify(planSector17Kit())).toBe(JSON.stringify(planSector17Kit()));
    expect(JSON.stringify(planSector17Kit("leve"))).toBe(JSON.stringify(planSector17Kit("leve")));
  });

  it("a semente muda a composição (cor, tipos, camada tecnológica)", () => {
    const lot = LOTS.find((l) => l.id === "q1d")!;
    const colors = new Set<number>();
    const kinds = new Set<string>();
    for (let s = 0; s < 40; s++) {
      const other = { ...lot, seed: lot.seed + s * 7919 };
      colors.add(lotColor(other));
      const p = planLot(other, { detail: "completo", y0: 0.12, out: [], bodies: [], signs: [], cards: [] });
      kinds.add(p.modules.map((m) => m.pieces.join(",")).join("|") + p.tech);
    }
    expect(colors.size).toBe(2);
    expect(kinds.size).toBeGreaterThan(10);
  });

  it("30–50 % dos lotes têm pele fotovoltaica ou anexo modular; as duas cores aparecem", () => {
    const plan = planSector17Kit();
    const tech = plan.lots.filter((l) => l.tech !== null).length / plan.lots.length;
    expect(tech).toBeGreaterThanOrEqual(0.3);
    expect(tech).toBeLessThanOrEqual(0.5);
    expect(new Set(plan.lots.map((l) => l.color)).size).toBe(2);
    const pieces = piecesUsed(plan);
    for (const p of ["TECH_pele_fotovoltaica_inteira", "TECH_anexo_modular", "TECH_reciclador_agua", "REMENDO_caixa_dagua", "REMENDO_fiacao_12m", "REMENDO_varal", "REMENDO_ar_condicionado", "TECH_letreiro_led_farmacia"]) expect(pieces.has(p), p).toBe(true);
  });

  it("térreo conforme `ground`: loja nas lojas, galpão nos muros; placa do lote sobre a loja; pichação em galpão", () => {
    const plan = planSector17Kit();
    for (const lp of plan.lots) {
      const lot = LOTS.find((l) => l.id === lp.lot)!;
      const ground = lp.modules.filter((m) => !m.blocked).map((m) => m.pieces[0]!);
      if (lot.ground === "shop") expect(ground.some((p) => /terreo_loja/.test(p)), lot.id).toBe(true);
      if (lot.ground === "wall") expect(ground.every((p) => /galpao/.test(p)), lot.id).toBe(true);
      if (lot.ground === "door" && !lot.graffiti) expect(ground.some((p) => /terreo_casa/.test(p)), lot.id).toBe(true);
      const signs = plan.signs.filter((s) => s.lot === lot.id);
      expect(signs.filter((s) => s.kind === "placa").length, lot.id).toBe(lot.sign ? 1 : 0);
      expect(signs.filter((s) => s.kind === "pichacao").length, lot.id).toBe(lot.graffiti ? 1 : 0);
    }
  });

  it("esquina dividida entre vizinhos não é duplicada", () => {
    const plan = planSector17Kit();
    const corners = plan.instances.filter((i) => /FACHADA_esquina/.test(i.piece));
    const keys = corners.map((c) => `${c.x.toFixed(2)}|${c.y.toFixed(2)}|${c.z.toFixed(2)}`);
    expect(new Set(keys).size).toBe(keys.length);
    const vn1 = LOTS.find((l) => l.id === "vn1")!;
    expect(sharedNeighbor(vn1, 1)?.id).toBe("vn2");
  });

  it("módulo tampado por construção vizinha fica sem kit; o parcialmente tampado recebe o módulo", () => {
    const q4f = LOTS.find((l) => l.id === "q4f")!; // frente em x = −63, metade tampada pelo q1a
    expect(frontBlockedFraction(q4f, 12, 18)).toBeCloseTo(1, 6);
    expect(frontBlockedFraction(q4f, 0, 6)).toBeCloseTo(0, 6);
    const p = planSector17Kit().lots.find((l) => l.lot === "q4f")!;
    expect(p.modules.map((m) => m.blocked)).toEqual([false, false, true]);
  });

  it("volume cego dentro do lote (1 cm para dentro) e abaixo da laje física", () => {
    const plan = planSector17Kit();
    for (const b of plan.bodies) {
      const lot = LOTS.find((l) => l.id === b.lot)!;
      const [cx, cy, cz] = b.center;
      expect(cx - b.size.w / 2, b.id).toBeGreaterThanOrEqual(lot.rect.x0 + 0.009);
      expect(cx + b.size.w / 2, b.id).toBeLessThanOrEqual(lot.rect.x1 - 0.009);
      expect(cz - b.size.d / 2, b.id).toBeGreaterThanOrEqual(lot.rect.z0 + 0.009);
      expect(cz + b.size.d / 2, b.id).toBeLessThanOrEqual(lot.rect.z1 - 0.009);
      expect(cy + b.size.h / 2, b.id).toBeLessThan(lotHeight(lot));
    }
  });

  it("peças de laje ficam sobre o telhado do próprio lote", () => {
    const plan = planSector17Kit();
    for (const i of plan.instances.filter((x) => /anexo|reciclador|caixa_dagua|canopy_solar/.test(x.piece) && LOTS.some((l) => l.id === x.owner))) {
      const lot = LOTS.find((l) => l.id === i.owner)!;
      expect(i.y, i.owner).toBeCloseTo(lotHeight(lot), 6);
      expect(i.x, i.owner).toBeGreaterThan(lot.rect.x0);
      expect(i.x, i.owner).toBeLessThan(lot.rect.x1);
      expect(i.z, i.owner).toBeGreaterThan(lot.rect.z0);
      expect(i.z, i.owner).toBeLessThan(lot.rect.z1);
    }
  });
});

describe("Setor 17 — kit: marcos e catálogo", () => {
  it("viaduto: pilares nas juntas do blockout e tabuleiros de 24 m nos vãos", () => {
    const plan = planSector17Kit();
    const pillars = plan.instances.filter((i) => i.piece === KIT_PIECE.viaductPillar);
    const decks = plan.instances.filter((i) => i.piece === KIT_PIECE.viaductDeck);
    expect(pillars.map((p) => p.z)).toEqual([...VIADUCT.pillars]);
    expect(decks.map((d) => d.z)).toEqual(VIADUCT.decks.map(([a, b]) => (a + b) / 2));
    for (const p of [...pillars, ...decks]) {
      expect(p.x).toBe(VIADUCT.x);
      expect(p.sx).toBeCloseTo(1, 6);
    }
  });

  it("Torre Verde: 3 blocos empilhados até a altura do marco", () => {
    const torre = LANDMARKS.find((l) => l.id === "torre")!;
    const blocks = planSector17Kit().instances.filter((i) => i.piece === KIT_PIECE.torre);
    expect(blocks).toHaveLength(3);
    expect(blocks[2]!.y + 12 * blocks[2]!.sy).toBeCloseTo(torre.height, 6);
    for (const b of blocks) expect(b.z).toBe(torre.rect.z0);
  });

  it("toda peça planejada existe em kit_tech.glb", () => {
    const names = kitRootNames();
    for (const d of ["completo", "leve"] as const) for (const p of piecesUsed(planSector17Kit(d))) expect(names.has(p), p).toBe(true);
  });

  it("LOD por instância: marcos sempre; fachadas, detalhes e lajes somem a distâncias diferentes", () => {
    expect(kitLodDistance(KIT_PIECE.torre)).toBeNull();
    expect(kitLodDistance(KIT_PIECE.viaductDeck)).toBeNull();
    expect(kitLodDistance("FACHADA_apto_janelas_1")).toBe(KIT.lodFacade);
    expect(kitLodDistance("TECH_pele_fotovoltaica_inteira")).toBe(KIT.lodFacade);
    expect(kitLodDistance("REMENDO_ar_condicionado")).toBe(KIT.lodDetail);
    expect(kitLodDistance("TECH_anexo_modular")).toBe(KIT.lodRoof);
    expect(kitLodDistance("FACHADA_apto_janelas_0", "stain")).toBe(KIT.lodDetail); // decalques somem antes da parede
    expect(kitLodDistance("FACHADA_apto_janelas_0", "kit_reboco")).toBe(KIT.lodFacade);
    expect(KIT.lodDetail).toBeLessThan(KIT.lodFacade);
    expect(kitInstancing("?kitinst=thin")).toBe("thin");
    expect(kitInstancing("")).toBe("instanced");
  });

  it("cartões distantes: um por módulo e pavimento, atrás da linha da fachada e dentro do lote", () => {
    const plan = planSector17Kit();
    const expected = plan.lots.reduce((n, l) => n + l.modules.filter((m) => !m.blocked).length * l.rows, 0);
    expect(plan.cards).toHaveLength(expected);
    for (const c of plan.cards) {
      const lot = LOTS.find((l) => l.id === c.lot)!;
      for (const [x, y, z] of c.corners) {
        expect(toFacade(lot, x, z).w, c.lot).toBeCloseTo(-KIT.cardInset, 6);
        expect(y, c.lot).toBeGreaterThanOrEqual(0);
        expect(y, c.lot).toBeLessThan(lotHeight(lot));
      }
      const out = new Facade(lot.rect, lot.facing).at(0, 0, 1).subtract(new Facade(lot.rect, lot.facing).at(0, 0, 0));
      expect(c.normal[0]).toBeCloseTo(out.x, 6);
      expect(c.normal[2]).toBeCloseTo(out.z, 6);
    }
  });

  it("modo leve (qualidade baixa) usa menos peças; ?kit=0 desliga", () => {
    expect(piecesUsed(planSector17Kit("leve")).size).toBeLessThan(piecesUsed(planSector17Kit()).size);
    expect(sector17KitEnabled("?kit=0")).toBe(false);
    expect(sector17KitEnabled("?quality=media")).toBe(true);
    expect(sector17KitEnabled("")).toBe(true);
  });
});

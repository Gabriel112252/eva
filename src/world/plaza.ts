import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { WorldContext } from "./context";
import { placeSign } from "./signage";
import { bench, bollards, churchBanner, dryFountain, grassTuft, noticeBoard, queueBarrier, streetLamp, barrel } from "./props";
import { STREET } from "./street";

/**
 * Praça do Setor 17: posto de distribuição (onde ocorre a Apuração), quadro de
 * avisos, fonte seca, árvores, bancos, estandarte da Igreja e o portão da
 * Central de Suprimentos (acesso restrito, vigiado pelo Custódio).
 */
export function buildPlaza(ctx: WorldContext): void {
  const { mats } = ctx;
  const y = STREET.curbHeight;
  const P = STREET.plaza;
  const cx = (P.x0 + P.x1) / 2;

  // Degrau de transição rua → praça
  ctx.box("praca_rampa", { w: 0.8, h: 0.12, d: 8 }, new Vector3(P.x0 - 0.2, y / 2 - 0.02, 0), mats.sidewalk, { rotation: new Vector3(0, 0, 0.15), shadow: false, cameraBlocker: false });

  // Fonte seca no centro
  dryFountain(ctx, "fonte", new Vector3(cx - 2, y, 0));

  // Posto de distribuição: o módulo GLB `posto_distribuicao` (heroAssets) substitui a estrutura; aqui ficam
  // só o estoque, a fila, o letreiro e os barris
  const postX = cx + 4;
  const postZ = 11.5;
  // estoque atrás do balcão
  // estoque do posto (caixotes, tambores, inclusive o empurrável) vem dos módulos GLB em heroAssets.ts

  // Letreiro do posto
  placeSign(ctx, "posto_letreiro", { bg: "#2f3a33", fg: "#e8dcc0", lines: ["POSTO DE DISTRIBUIÇÃO · SETOR 17", "APURAÇÃO HOJE · 15H"], weathered: 0.25, seed: 21, border: "#b89036" }, {
    position: new Vector3(postX, y + 2.78, postZ - 2.3),
    yaw: 0,
    width: 5.0,
    height: 0.8,
    double: true,
  });

  // Fila: barreiras de corda formando uma serpentina
  queueBarrier(ctx, "fila", [
    new Vector3(postX - 3.0, y, postZ - 1.6),
    new Vector3(postX - 3.0, y, postZ - 4.5),
    new Vector3(postX + 0.6, y, postZ - 4.5),
    new Vector3(postX + 0.6, y, postZ - 6.8),
  ]);

  // Quadro de avisos com cartazes
  noticeBoard(ctx, "quadro_avisos", new Vector3(cx - 7, y, 10.5), 0.2, [
    { lines: ["COTAS", "SETOR 17", "ÁGUA 3ª/6ª", "FARINHA: 2kg", "ÓLEO: 1L"], bg: "#e8e0cc", fg: "#2a2a2a" },
    { lines: ["VIGÍLIA DO", "SILÊNCIO", "DOMINGO", "ÀS 6H"], bg: "#f0e6c8", fg: "#5a4a1e" },
    { lines: ["PROCURA-SE", "TÉCNICO DE", "BOMBAS", "PAGA-SE EM", "SELOS"], bg: "#d8d2c2", fg: "#1f1f1f" },
  ]);

  // Estandarte da Igreja da Continuidade
  churchBanner(ctx, "estandarte", new Vector3(postX + 5.5, y, postZ - 1.5), 0);

  // Árvores em canteiros, mato, bancos
  const pits: Array<[number, number]> = [
    [P.x0 + 5, 7],
    [P.x0 + 5, -7],
    [P.x1 - 6, -8],
    [cx - 9, -12],
  ];
  pits.forEach(([x, z], i) => {
    ctx.box(`canteiro_${i}`, { w: 2.2, h: 0.3, d: 2.2 }, new Vector3(x, y + 0.15, z), mats.concrete, { collider: true, cameraBlocker: false });
    ctx.box(`canteiro_terra_${i}`, { w: 1.8, h: 0.2, d: 1.8 }, new Vector3(x, y + 0.22, z), mats.soil, { shadow: false });
    // a árvore (GLB arvore_0/1) é colocada por heroAssets.ts na mesma posição
    for (let k = 0; k < 3; k++) grassTuft(ctx, `mato_canteiro_${i}_${k}`, new Vector3(x + Math.cos(k * 2.1) * 0.6, y + 0.3, z + Math.sin(k * 2.1) * 0.6), 0.45, 60 + i * 3 + k);
  });
  bench(ctx, "banco_1", new Vector3(cx - 2, y, -6.5), 0);
  bench(ctx, "banco_2", new Vector3(cx + 4.5, y, -1.5), Math.PI / 2);
  bench(ctx, "banco_3", new Vector3(P.x0 + 3, y, 2.5), Math.PI / 2);

  // Iluminação pública da praça (uma funciona: há energia parcial)
  streetLamp(ctx, "poste_praca_1", new Vector3(cx + 3, y, 3.0), -1, "on", { model: true });
  streetLamp(ctx, "poste_praca_2", new Vector3(cx + 10, y, -5), -1, "off", { model: true });

  // Gerador que alimenta o posto: geometria no módulo GLB `gerador` (heroAssets, mesma posição); aqui só o som
  ctx.emitters.push({ kind: "generator", position: new Vector3(postX + 7.3, y + 0.6, postZ + 2.4), radius: 18, volume: 0.55 });

  // Portão da Central de Suprimentos (norte da praça), com barricada e aviso
  const gateX = postX;
  bollards(ctx, "frades_portao", new Vector3(gateX - 4, y, P.z1 - 1.2), new Vector3(gateX + 4, y, P.z1 - 1.2), 5);
  for (let i = 0; i < 3; i++) {
    ctx.box(`sacos_areia_${i}`, { w: 1.0, h: 0.35, d: 0.5 }, new Vector3(gateX - 3.2 + i * 0.2, y + 0.18 + i * 0.3, P.z1 - 1.8), mats.tarpOlive, { rotationY: i * 0.2, collider: true, cameraBlocker: false });
  }
  placeSign(ctx, "aviso_central", { bg: "#7a1f1f", fg: "#f3e9d2", lines: ["CENTRAL DE SUPRIMENTOS", "ACESSO RESTRITO · CUSTÓDIA"], weathered: 0.3, seed: 31, border: "#f3e9d2" }, {
    // faixa entre a verga do portão e o peitoril das janelas superiores da fachada GLB
    position: new Vector3(gateX, y + 4.25, P.z1 - 0.07),
    yaw: 0,
    width: 4.6,
    height: 0.7,
  });

  // Caixotes soltos (GLB, em heroAssets.ts) e barril enferrujado empurrável
  barrel(ctx, "barril_praca_rust", new Vector3(P.x1 - 4, y, 4), "rust", true);
  // Mato nas juntas do piso
  for (let k = 0; k < 14; k++) {
    const x = P.x0 + 1 + ((k * 7.3) % (P.x1 - P.x0 - 2));
    const z = P.z0 + 1 + ((k * 11.7) % (P.z1 - P.z0 - 2));
    if (Math.hypot(x - (cx - 2), z) < 4.5) continue;
    grassTuft(ctx, `mato_praca_${k}`, new Vector3(x, y, z), 0.35 + (k % 3) * 0.1, 90 + k);
  }

  // Placa de entrada do setor na esquina da praça
  placeSign(ctx, "placa_setor", { bg: "#1d2a3a", fg: "#e8dcc0", lines: ["SETOR 17", "ARCO DA CONTINUIDADE"], weathered: 0.4, seed: 41, border: "#b89036" }, {
    position: new Vector3(P.x0 + 1.2, y + 2.6, 4.8),
    yaw: Math.PI / 2,
    width: 1.6,
    height: 0.8,
    double: true,
  });
  ctx.cylinder("placa_setor_poste", { height: 3.0, diameter: 0.08, tessellation: 6 }, new Vector3(P.x0 + 1.2, y + 1.5, 4.8), mats.metalDark, { collider: true });

  // Ponto de espera da multidão (ruído de vozes espacializado — sem falas inventadas)
  ctx.emitters.push({ kind: "crowd", position: new Vector3(postX - 1.5, y + 1.2, postZ - 4), radius: 20, volume: 0.5 });

  // Spawns de NPCs
  ctx.spawns.set("miriam", { position: new Vector3(postX + 0.2, y, postZ + 0.9), yaw: Math.PI });
  ctx.spawns.set("custodio", { position: new Vector3(gateX + 1.2, y, P.z1 - 3.0), yaw: Math.PI });
  ctx.spawns.set("ana", { position: new Vector3(cx - 6.5, y, -2.5), yaw: -Math.PI / 2 });
  ctx.spawns.set("raquel", { position: new Vector3(cx - 7.8, y, -3.6), yaw: -Math.PI / 2 + 0.6 });
  ctx.spawns.set("praca", { position: new Vector3(P.x0 + 3, y + 0.1, 0), yaw: Math.PI / 2 });
}

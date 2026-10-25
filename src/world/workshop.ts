import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { WorldContext } from "./context";
import { placeSign } from "./signage";
import { warmLamp } from "./props";

/** Oficina de Matias: x∈[-35,-25], z∈[-7,-14]; porta na fachada norte (z=-7), aberta para a rua. */
export const WORKSHOP = {
  x0: -35,
  x1: -25,
  zFront: -7,
  zBack: -14,
  height: 3.4,
  doorX: -30,
  doorWidth: 1.3,
} as const;

export interface WorkshopHandles {
  radio: Mesh;
  radioLed: Mesh;
  card: Mesh;
}

export function buildWorkshop(ctx: WorldContext): WorkshopHandles {
  const { mats } = ctx;
  const W = WORKSHOP;
  const cx = (W.x0 + W.x1) / 2;
  const cz = (W.zFront + W.zBack) / 2;
  const width = W.x1 - W.x0;
  const depth = W.zFront - W.zBack;
  const H = W.height;
  const t = 0.3; // espessura das paredes

  // Piso e laje
  ctx.box("oficina_piso", { w: width, h: 0.12, d: depth }, new Vector3(cx, 0.06, cz), mats.concrete, { collider: true, shadow: false, cameraBlocker: false });
  ctx.box("oficina_laje", { w: width + 0.4, h: 0.3, d: depth + 0.4 }, new Vector3(cx, H + 0.15, cz), mats.concrete, { collider: true });
  // Segundo andar fechado em cima (continuação da fachada do quarteirão)
  ctx.box("oficina_andar_superior", { w: width, h: 4.0, d: depth }, new Vector3(cx, H + 0.3 + 2.0, cz), mats.plaster[2]!, { collider: true });
  ctx.box("oficina_platibanda", { w: width + 0.2, h: 0.5, d: 0.25 }, new Vector3(cx, H + 4.55, W.zFront + 0.08), mats.concrete);
  for (let c = 0; c < 3; c++) {
    const x = W.x0 + 1.7 + c * 3.3;
    ctx.box(`oficina_sup_vao_${c}`, { w: 1.25, h: 1.5, d: 0.3 }, new Vector3(x, H + 2.4, W.zFront - 0.14), mats.concrete, { shadow: false });
    ctx.box(`oficina_sup_vidro_${c}`, { w: 1.1, h: 1.35, d: 0.03 }, new Vector3(x, H + 2.4, W.zFront - 0.26), c === 1 ? mats.glassLit : mats.glass, { shadow: false });
  }

  // Paredes (a frontal tem a porta)
  const wallMat = mats.plaster[2]!;
  ctx.box("oficina_parede_fundo", { w: width, h: H, d: t }, new Vector3(cx, H / 2, W.zBack + t / 2), wallMat, { collider: true });
  ctx.box("oficina_parede_oeste", { w: t, h: H, d: depth }, new Vector3(W.x0 + t / 2, H / 2, cz), wallMat, { collider: true });
  ctx.box("oficina_parede_leste", { w: t, h: H, d: depth }, new Vector3(W.x1 - t / 2, H / 2, cz), wallMat, { collider: true });
  const leftW = W.doorX - W.doorWidth / 2 - W.x0;
  const rightW = W.x1 - (W.doorX + W.doorWidth / 2);
  ctx.box("oficina_frente_esq", { w: leftW, h: H, d: t }, new Vector3(W.x0 + leftW / 2, H / 2, W.zFront - t / 2), wallMat, { collider: true });
  ctx.box("oficina_frente_dir", { w: rightW, h: H, d: t }, new Vector3(W.x1 - rightW / 2, H / 2, W.zFront - t / 2), wallMat, { collider: true });
  ctx.box("oficina_verga", { w: W.doorWidth + 0.2, h: H - 2.3, d: t }, new Vector3(W.doorX, 2.3 + (H - 2.3) / 2, W.zFront - t / 2), wallMat, { collider: true });
  // porta de madeira aberta (encostada na parede, do lado de dentro)
  ctx.box("oficina_porta", { w: 0.06, h: 2.2, d: 1.2 }, new Vector3(W.doorX + W.doorWidth / 2 + 0.03, 1.1 + 0.12, W.zFront - t - 0.6), mats.woodDark, { collider: true });
  // janela com grade na frente, à direita da porta
  ctx.box("oficina_janela_vao", { w: 1.4, h: 1.1, d: 0.12 }, new Vector3(W.doorX + 2.6, 1.8, W.zFront - 0.06), mats.concrete, { shadow: false });
  ctx.box("oficina_janela_vidro", { w: 1.3, h: 1.0, d: 0.03 }, new Vector3(W.doorX + 2.6, 1.8, W.zFront - 0.12), mats.glass, { shadow: false });
  for (let k = 0; k < 4; k++) ctx.box(`oficina_janela_barra_${k}`, { w: 0.03, h: 1.0, d: 0.03 }, new Vector3(W.doorX + 2.0 + k * 0.4, 1.8, W.zFront + 0.02), mats.metalDark, { shadow: false });

  // Bancada de trabalho ao longo da parede oeste
  const benchX = W.x0 + 0.75;
  ctx.box("oficina_bancada", { w: 0.9, h: 0.08, d: 3.2 }, new Vector3(benchX, 0.95, cz - 0.5), mats.wood, { collider: true });
  for (const dz of [-1.45, 1.45]) {
    ctx.box(`oficina_bancada_pe_${dz}`, { w: 0.8, h: 0.9, d: 0.08 }, new Vector3(benchX, 0.5, cz - 0.5 + dz), mats.metalDark, { collider: true });
  }
  // ferramentas, peças e caixas sobre a bancada
  ctx.box("oficina_morsa", { w: 0.25, h: 0.25, d: 0.3 }, new Vector3(benchX, 1.12, cz - 1.6), mats.metalDark);
  ctx.box("oficina_peca_1", { w: 0.3, h: 0.18, d: 0.4 }, new Vector3(benchX + 0.1, 1.08, cz - 0.9), mats.metalRust, { shadow: false });
  ctx.box("oficina_caixa_pecas", { w: 0.4, h: 0.15, d: 0.3 }, new Vector3(benchX - 0.1, 1.07, cz + 0.6), mats.plasticBlue, { shadow: false });
  ctx.cylinder("oficina_lata", { height: 0.22, diameter: 0.14, tessellation: 10 }, new Vector3(benchX + 0.25, 1.1, cz + 0.2), mats.metalPainted, { shadow: false });
  // painel de ferramentas na parede
  ctx.box("oficina_painel", { w: 0.05, h: 1.2, d: 2.6 }, new Vector3(W.x0 + t + 0.03, 1.9, cz - 0.5), mats.woodDark, { shadow: false });
  for (let k = 0; k < 7; k++) {
    ctx.box(`oficina_ferramenta_${k}`, { w: 0.04, h: 0.25 + (k % 3) * 0.1, d: 0.06 }, new Vector3(W.x0 + t + 0.08, 1.95 + (k % 2) * 0.3, cz - 1.6 + k * 0.36), mats.metalDark, { shadow: false });
  }
  // prateleiras na parede do fundo com caixas e garrafões
  for (let s = 0; s < 3; s++) {
    const y = 0.7 + s * 0.8;
    ctx.box(`oficina_prateleira_${s}`, { w: 4.0, h: 0.05, d: 0.45 }, new Vector3(cx + 1.0, y, W.zBack + t + 0.25), mats.wood, { collider: true });
    for (let k = 0; k < 4; k++) {
      const w = 0.35 + ((k + s) % 3) * 0.12;
      ctx.box(`oficina_prat_caixa_${s}_${k}`, { w, h: 0.3 + ((k * s) % 2) * 0.15, d: 0.35 }, new Vector3(cx - 0.6 + k * 0.95, y + 0.18, W.zBack + t + 0.25), (k + s) % 2 ? mats.wood : mats.tarpOlive, { shadow: false });
    }
  }
  ctx.cylinder("oficina_garrafao_1", { height: 0.5, diameter: 0.3, tessellation: 10 }, new Vector3(cx + 3.2, 0.37, W.zBack + t + 0.5), mats.plasticBlue, { collider: true });
  ctx.cylinder("oficina_garrafao_2", { height: 0.5, diameter: 0.3, tessellation: 10 }, new Vector3(cx + 3.55, 0.37, W.zBack + t + 0.7), mats.plasticBlue, { collider: true });
  // cama de campanha e cobertor
  ctx.box("oficina_cama", { w: 0.9, h: 0.35, d: 2.0 }, new Vector3(W.x1 - 0.8, 0.3, W.zBack + 1.5), mats.metalDark, { collider: true });
  ctx.box("oficina_colchao", { w: 0.86, h: 0.12, d: 1.9 }, new Vector3(W.x1 - 0.8, 0.53, W.zBack + 1.5), mats.tarpOlive);
  ctx.box("oficina_travesseiro", { w: 0.6, h: 0.1, d: 0.4 }, new Vector3(W.x1 - 0.8, 0.64, W.zBack + 0.8), mats.paperWhite, { shadow: false });
  // mesa pequena com o rádio e o cartão
  const tableX = W.x1 - 1.2;
  const tableZ = W.zFront - 2.2;
  ctx.box("oficina_mesa", { w: 1.1, h: 0.05, d: 0.7 }, new Vector3(tableX, 0.8, tableZ), mats.wood, { collider: true });
  for (const [dx, dz] of [[-0.5, -0.3], [0.5, -0.3], [-0.5, 0.3], [0.5, 0.3]] as Array<[number, number]>) {
    ctx.box(`oficina_mesa_pe_${dx}_${dz}`, { w: 0.05, h: 0.78, d: 0.05 }, new Vector3(tableX + dx, 0.39, tableZ + dz), mats.woodDark, { shadow: false });
  }
  const radio = ctx.box("oficina_radio", { w: 0.42, h: 0.24, d: 0.18 }, new Vector3(tableX - 0.2, 0.95, tableZ + 0.1), mats.metalPainted, { batch: false, rotationY: -0.35 });
  ctx.cylinder("oficina_radio_antena", { height: 0.5, diameter: 0.012, tessellation: 5 }, new Vector3(tableX - 0.38, 1.3, tableZ + 0.05), mats.metalDark, { rotation: new Vector3(0, 0, 0.3), shadow: false });
  ctx.box("oficina_radio_grade", { w: 0.2, h: 0.14, d: 0.02 }, new Vector3(tableX - 0.26, 0.95, tableZ + 0.2), mats.metalDark, { rotationY: -0.35, shadow: false });
  const radioLed = ctx.box("oficina_radio_led", { w: 0.025, h: 0.025, d: 0.02 }, new Vector3(tableX - 0.06, 1.0, tableZ + 0.2), mats.emissiveRed, { batch: false, shadow: false });
  const card = ctx.box("oficina_cartao", { w: 0.16, h: 0.006, d: 0.1 }, new Vector3(tableX + 0.3, 0.828, tableZ - 0.1), mats.paperWhite, { batch: false, rotationY: 0.4, shadow: false });
  ctx.emitters.push({ kind: "radio", position: radio.position.clone(), radius: 7, volume: 0.6 });

  // Caderno e caneca: vida cotidiana
  ctx.box("oficina_caderno", { w: 0.22, h: 0.02, d: 0.3 }, new Vector3(tableX + 0.05, 0.835, tableZ - 0.2), mats.paperWhite, { shadow: false });
  ctx.cylinder("oficina_caneca", { height: 0.1, diameter: 0.08, tessellation: 8 }, new Vector3(tableX + 0.42, 0.875, tableZ + 0.2), mats.metalPainted, { shadow: false });

  // Iluminação interna: lâmpada nua pendurada
  warmLamp(ctx, "oficina_lampada", new Vector3(cx + 0.5, H - 0.6, cz), 5.5, 10);
  ctx.cylinder("oficina_fio", { height: 0.6, diameter: 0.015, tessellation: 4 }, new Vector3(cx + 0.5, H - 0.3, cz), mats.rubber, { shadow: false });

  // Letreiro externo da oficina
  placeSign(ctx, "oficina_letreiro", { bg: "#3a3a36", fg: "#d8cfbf", lines: ["OFICINA · REPAROS", "ELÉTRICA · RÁDIO · BOMBAS"], weathered: 0.45, seed: 2, border: "#8a8378" }, {
    position: new Vector3(cx, H + 0.9, W.zFront + 0.09),
    yaw: Math.PI,
    width: 4.2,
    height: 0.8,
  });
  ctx.box("oficina_letreiro_fundo", { w: 4.3, h: 0.9, d: 0.06 }, new Vector3(cx, H + 0.9, W.zFront + 0.03), mats.metalDark, { shadow: false });
  // quadro de giz ao lado da porta: avisos do bairro
  placeSign(ctx, "oficina_quadro_giz", { bg: "#2a2f2a", fg: "#cfd6c6", lines: ["ÁGUA: 3ª E 6ª", "RÁDIO DO SETOR: 7h · 12h · 18h"], font: `600 58px "Comic Sans MS", "Segoe Print", cursive`, weathered: 0.2, seed: 4 }, {
    position: new Vector3(W.doorX - 1.5, 1.6, W.zFront + 0.03),
    yaw: Math.PI,
    width: 1.5,
    height: 0.9,
  });

  ctx.spawns.set("oficina", { position: new Vector3(W.doorX, 0.2, cz - 0.3), yaw: 0 });
  return { radio, radioLed, card };
}

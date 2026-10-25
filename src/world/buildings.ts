import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Material } from "@babylonjs/core/Materials/material";
import type { WorldContext } from "./context";
import { placeSign } from "./signage";

export interface BuildingSpec {
  id: string;
  /** limites em X */
  x0: number;
  x1: number;
  /** coordenada Z da fachada */
  zFront: number;
  /** +1: fachada olha para +Z; -1: fachada olha para -Z */
  facing: 1 | -1;
  depth: number;
  floors: number;
  floorHeight?: number;
  material: Material;
  /** 0–1: proporção de janelas vedadas com tábuas */
  boarded?: number;
  /** 0–1: proporção de janelas acesas (energia existe em parte do bairro) */
  lit?: number;
  burnt?: boolean;
  /** porta/loja no térreo */
  groundFloor?: "door" | "shop" | "wall" | "gate";
  balconies?: boolean;
  roof?: Array<"caixa_dagua" | "solar" | "antena" | "varal">;
  signs?: Array<{ lines: string[]; bg: string; fg: string; width: number; height: number; y: number; xOffset?: number; weathered?: number; border?: string }>;
  graffiti?: Array<{ text: string; xOffset: number; y: number; color: string }>;
  vines?: boolean;
  ac?: number;
  seed: number;
  /** A fachada vem de um módulo GLB (heroAssets): só o corpo e a laje são gerados aqui. */
  frontModel?: boolean;
}

function rnd(seed: number, i: number): number {
  const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Direção "para fora" da fachada (para o observador na rua). */
function outward(spec: BuildingSpec): number {
  return spec.facing;
}

export function buildBuilding(ctx: WorldContext, spec: BuildingSpec): void {
  const { mats } = ctx;
  const fh = spec.floorHeight ?? 3.1;
  const height = spec.floors * fh + 0.6;
  const width = spec.x1 - spec.x0;
  const cx = (spec.x0 + spec.x1) / 2;
  const out = outward(spec);
  const bodyZ = spec.zFront - out * (spec.depth / 2);
  const faceZ = spec.zFront + out * 0.01;
  const wallMat = spec.burnt ? mats.burnt : spec.material;

  // Corpo principal (colisor)
  ctx.box(`${spec.id}_corpo`, { w: width, h: height, d: spec.depth }, new Vector3(cx, height / 2, bodyZ), wallMat, { collider: true });
  if (spec.frontModel) return; // fachada, platibanda, janelas e portas vêm do módulo GLB

  // Platibanda e laje do telhado
  ctx.box(`${spec.id}_platibanda`, { w: width + 0.2, h: 0.5, d: 0.25 }, new Vector3(cx, height + 0.25, spec.zFront + out * 0.08), mats.concrete);
  const yawFacing = out > 0 ? Math.PI : 0;

  // Janelas por andar (térreo tratado à parte)
  const cols = Math.max(1, Math.floor((width - 1.6) / 2.4));
  const colSpacing = (width - 1.2) / cols;
  for (let floor = 1; floor < spec.floors; floor++) {
    const y = floor * fh + 1.55;
    for (let c = 0; c < cols; c++) {
      const x = spec.x0 + 0.6 + colSpacing * (c + 0.5);
      const r = rnd(spec.seed, floor * 31 + c);
      const boarded = !spec.burnt && r < (spec.boarded ?? 0.15);
      const lit = !spec.burnt && !boarded && rnd(spec.seed, floor * 53 + c + 7) < (spec.lit ?? 0.2);
      // vão recuado
      ctx.box(`${spec.id}_vao_${floor}_${c}`, { w: 1.25, h: 1.5, d: 0.3 }, new Vector3(x, y, spec.zFront - out * 0.14), spec.burnt ? mats.burnt : mats.concrete, { shadow: false });
      // moldura
      ctx.box(`${spec.id}_peitoril_${floor}_${c}`, { w: 1.45, h: 0.08, d: 0.22 }, new Vector3(x, y - 0.78, faceZ + out * 0.06), mats.concrete, { shadow: false });
      if (boarded) {
        for (let k = 0; k < 3; k++) {
          ctx.box(`${spec.id}_tabua_${floor}_${c}_${k}`, { w: 1.35, h: 0.22, d: 0.04 }, new Vector3(x, y - 0.45 + k * 0.45, faceZ + out * 0.04), mats.wood, {
            rotation: new Vector3(0, 0, (rnd(spec.seed, k + c * 9 + floor) - 0.5) * 0.25),
            shadow: false,
          });
        }
      } else if (!spec.burnt) {
        ctx.box(`${spec.id}_vidro_${floor}_${c}`, { w: 1.1, h: 1.35, d: 0.03 }, new Vector3(x, y, spec.zFront - out * 0.26), lit ? mats.glassLit : mats.glass, { shadow: false });
        // caixilho em cruz
        ctx.box(`${spec.id}_caixilho_v_${floor}_${c}`, { w: 0.05, h: 1.4, d: 0.05 }, new Vector3(x, y, spec.zFront - out * 0.23), mats.metalDark, { shadow: false });
        ctx.box(`${spec.id}_caixilho_h_${floor}_${c}`, { w: 1.2, h: 0.05, d: 0.05 }, new Vector3(x, y, spec.zFront - out * 0.23), mats.metalDark, { shadow: false });
      } else {
        // fuligem acima da janela queimada
        ctx.box(`${spec.id}_fuligem_${floor}_${c}`, { w: 1.6, h: 0.9, d: 0.02 }, new Vector3(x, y + 1.0, faceZ + out * 0.015), mats.rubber, { shadow: false });
      }
      if (spec.balconies && floor % 2 === 1 && c % 2 === 0) {
        const bz = spec.zFront + out * 0.45;
        ctx.box(`${spec.id}_sacada_${floor}_${c}`, { w: 1.9, h: 0.12, d: 0.9 }, new Vector3(x, y - 0.85, bz), mats.concrete, { collider: false });
        ctx.box(`${spec.id}_grade_${floor}_${c}`, { w: 1.9, h: 0.9, d: 0.04 }, new Vector3(x, y - 0.35, spec.zFront + out * 0.88), mats.metalRust, { shadow: false });
        for (let k = -2; k <= 2; k++) ctx.box(`${spec.id}_barra_${floor}_${c}_${k}`, { w: 0.03, h: 0.9, d: 0.03 }, new Vector3(x + k * 0.42, y - 0.35, spec.zFront + out * 0.88), mats.metalDark, { shadow: false });
      }
    }
  }

  // Térreo
  const doorX = spec.x0 + 0.6 + colSpacing * 0.5 + (cols > 2 ? colSpacing : 0);
  switch (spec.groundFloor ?? "door") {
    case "door": {
      ctx.box(`${spec.id}_porta_vao`, { w: 1.1, h: 2.2, d: 0.3 }, new Vector3(doorX, 1.1 + 0.12, spec.zFront - out * 0.14), mats.concrete, { shadow: false });
      ctx.box(`${spec.id}_porta`, { w: 1.0, h: 2.1, d: 0.05 }, new Vector3(doorX, 1.05 + 0.12, spec.zFront - out * 0.27), mats.woodDark, { shadow: false });
      ctx.box(`${spec.id}_degrau`, { w: 1.4, h: 0.12, d: 0.5 }, new Vector3(doorX, 0.18, spec.zFront + out * 0.25), mats.concrete, { collider: true, cameraBlocker: false });
      for (let c = 0; c < cols; c++) {
        const x = spec.x0 + 0.6 + colSpacing * (c + 0.5);
        if (Math.abs(x - doorX) < 0.8) continue;
        ctx.box(`${spec.id}_grade_terreo_${c}`, { w: 1.3, h: 1.4, d: 0.05 }, new Vector3(x, 1.7, faceZ + out * 0.05), mats.metalRust, { shadow: false });
        ctx.box(`${spec.id}_vidro_terreo_${c}`, { w: 1.2, h: 1.3, d: 0.03 }, new Vector3(x, 1.7, spec.zFront - out * 0.1), mats.glass, { shadow: false });
      }
      break;
    }
    case "shop": {
      // porta de enrolar + toldo
      ctx.box(`${spec.id}_loja_vao`, { w: Math.min(4.5, width - 2), h: 2.6, d: 0.25 }, new Vector3(cx, 1.42, spec.zFront - out * 0.12), mats.concrete, { shadow: false });
      ctx.box(`${spec.id}_porta_enrolar`, { w: Math.min(4.3, width - 2.2), h: 2.5, d: 0.06 }, new Vector3(cx, 1.37, spec.zFront - out * 0.22), mats.metalPainted, { shadow: false });
      for (let k = 0; k < 7; k++) ctx.box(`${spec.id}_lamina_${k}`, { w: Math.min(4.3, width - 2.2), h: 0.02, d: 0.02 }, new Vector3(cx, 0.3 + k * 0.35, spec.zFront - out * 0.18), mats.metalDark, { shadow: false });
      ctx.box(`${spec.id}_toldo`, { w: Math.min(5, width - 1.5), h: 0.06, d: 1.3 }, new Vector3(cx, 2.95, spec.zFront + out * 0.7), mats.tarpOrange, { rotation: new Vector3(out * -0.22, 0, 0) });
      break;
    }
    case "gate": {
      // portão de ferro (acesso restrito)
      const gw = Math.min(5, width - 2);
      ctx.box(`${spec.id}_portao_vao`, { w: gw + 0.4, h: 3.2, d: 0.4 }, new Vector3(cx, 1.7, spec.zFront - out * 0.18), mats.concrete, { shadow: false });
      for (let k = 0; k <= 12; k++) ctx.box(`${spec.id}_barra_${k}`, { w: 0.06, h: 3.0, d: 0.06 }, new Vector3(cx - gw / 2 + (gw / 12) * k, 1.62, spec.zFront - out * 0.2), mats.metalDark, { shadow: true });
      ctx.box(`${spec.id}_trave_1`, { w: gw, h: 0.08, d: 0.08 }, new Vector3(cx, 0.5, spec.zFront - out * 0.2), mats.metalDark);
      ctx.box(`${spec.id}_trave_2`, { w: gw, h: 0.08, d: 0.08 }, new Vector3(cx, 2.9, spec.zFront - out * 0.2), mats.metalDark);
      ctx.box(`${spec.id}_corrente`, { w: 0.5, h: 0.3, d: 0.1 }, new Vector3(cx, 1.3, spec.zFront - out * 0.1), mats.metalRust, { shadow: false });
      break;
    }
    case "wall":
    default:
      break;
  }

  // Tubulação de descida, ar-condicionado, trepadeiras, pichações
  const pipeX = spec.x1 - 0.35;
  ctx.cylinder(`${spec.id}_tubo`, { height: height - 0.4, diameter: 0.12, tessellation: 8 }, new Vector3(pipeX, height / 2, spec.zFront + out * 0.1), mats.metalRust, { shadow: false });
  const acCount = spec.ac ?? Math.floor(rnd(spec.seed, 99) * 3);
  for (let i = 0; i < acCount; i++) {
    const x = spec.x0 + 1.2 + rnd(spec.seed, 120 + i) * (width - 2.4);
    const y = fh * (1 + Math.floor(rnd(spec.seed, 130 + i) * Math.max(1, spec.floors - 1))) + 0.5;
    ctx.box(`${spec.id}_ac_${i}`, { w: 0.7, h: 0.5, d: 0.35 }, new Vector3(x, y, spec.zFront + out * 0.2), mats.metalPainted);
  }
  if (spec.vines) {
    const vx = spec.x0 + 1.0 + rnd(spec.seed, 7) * (width - 3);
    for (let k = 0; k < 3; k++) {
      ctx.plane(`${spec.id}_trepadeira_${k}`, { w: 1.8 + k * 0.6, h: height * (0.45 + k * 0.15) }, new Vector3(vx + k * 0.9, height * 0.35, faceZ + out * 0.03), mats.vines, {
        rotation: new Vector3(0, yawFacing, 0),
      });
    }
  }
  for (const g of spec.graffiti ?? []) {
    placeSign(ctx, `${spec.id}_graf_${g.xOffset}`, { bg: "rgba(0,0,0,0)", fg: g.color, lines: [g.text], font: `italic 900 120px "Impact", "Arial Black", sans-serif`, weathered: 0.5, seed: spec.seed, pxWidth: 1024 }, {
      position: new Vector3(spec.x0 + g.xOffset, g.y, faceZ + out * 0.025),
      yaw: yawFacing,
      width: 3.4,
      height: 0.9,
      double: true,
    });
  }
  for (const s of spec.signs ?? []) {
    placeSign(ctx, `${spec.id}_placa_${s.y}`, { bg: s.bg, fg: s.fg, lines: s.lines, weathered: s.weathered ?? 0.3, seed: spec.seed, border: s.border }, {
      position: new Vector3(cx + (s.xOffset ?? 0), s.y, faceZ + out * 0.08),
      yaw: yawFacing,
      width: s.width,
      height: s.height,
    });
    ctx.box(`${spec.id}_placa_fundo_${s.y}`, { w: s.width + 0.1, h: s.height + 0.1, d: 0.06 }, new Vector3(cx + (s.xOffset ?? 0), s.y, faceZ + out * 0.03), mats.metalDark, { shadow: false });
  }

  // Telhado: caixa d'água, painéis solares, antena, varal
  const roofY = height + 0.02;
  for (const item of spec.roof ?? []) {
    switch (item) {
      case "caixa_dagua":
        ctx.cylinder(`${spec.id}_caixa_dagua`, { height: 1.1, diameterTop: 1.2, diameterBottom: 1.0, tessellation: 12 }, new Vector3(cx - width * 0.25, roofY + 0.55, bodyZ), mats.plasticBlue);
        ctx.box(`${spec.id}_caixa_base`, { w: 1.4, h: 0.2, d: 1.4 }, new Vector3(cx - width * 0.25, roofY + 0.1, bodyZ), mats.concrete);
        break;
      case "solar":
        for (let k = 0; k < 2; k++) {
          ctx.box(`${spec.id}_solar_${k}`, { w: 2.0, h: 0.05, d: 1.1 }, new Vector3(cx + width * 0.15 + k * 2.2, roofY + 0.6, bodyZ - out * 1.0), mats.glass, { rotation: new Vector3(-0.35, 0, 0) });
          ctx.box(`${spec.id}_solar_suporte_${k}`, { w: 1.8, h: 0.6, d: 0.05 }, new Vector3(cx + width * 0.15 + k * 2.2, roofY + 0.3, bodyZ - out * 1.4), mats.metalDark, { shadow: false });
        }
        break;
      case "antena":
        ctx.cylinder(`${spec.id}_antena`, { height: 3.5, diameter: 0.06, tessellation: 6 }, new Vector3(cx + width * 0.35, roofY + 1.75, bodyZ + 1), mats.metalDark, { shadow: false });
        ctx.box(`${spec.id}_antena_h`, { w: 1.6, h: 0.04, d: 0.04 }, new Vector3(cx + width * 0.35, roofY + 3.3, bodyZ + 1), mats.metalDark, { shadow: false });
        break;
      case "varal": {
        // varal no terraço: corda + roupas (sinal de ocupação)
        const y = roofY + 1.6;
        ctx.cylinder(`${spec.id}_varal`, { height: width * 0.6, diameter: 0.02, tessellation: 4 }, new Vector3(cx, y, bodyZ), mats.rope, { rotation: new Vector3(0, 0, Math.PI / 2), shadow: false });
        const cloth = [mats.tarpBlue, mats.tarpOlive, mats.paperWhite, mats.tarpOrange];
        for (let k = 0; k < 5; k++) {
          const x = cx - width * 0.25 + k * (width * 0.6) / 5 + 0.3;
          ctx.plane(`${spec.id}_roupa_${k}`, { w: 0.5, h: 0.7 }, new Vector3(x, y - 0.38, bodyZ), cloth[k % cloth.length]!, { rotation: new Vector3(0, 0, (rnd(spec.seed, k) - 0.5) * 0.3), sideOrientation: 2, shadow: true });
        }
        for (const dx of [-width * 0.3, width * 0.3]) ctx.cylinder(`${spec.id}_poste_varal_${dx}`, { height: 1.8, diameter: 0.06, tessellation: 6 }, new Vector3(cx + dx, roofY + 0.9, bodyZ), mats.metalRust, { shadow: false });
        break;
      }
    }
  }
}

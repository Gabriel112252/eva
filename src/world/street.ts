import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { WorldContext } from "./context";

/**
 * Layout do quarteirão (metros, eixo X = leste, Z = norte):
 *  - Rua asfaltada de x=-48 a x=14, entre z=-4 e z=4; calçadas até |z|=7.
 *  - Praça pavimentada de x=14 a 46 (z de -18 a 18).
 *  - Prédios ocupam z>7 (norte) e z<-7 (sul) ao longo da rua e o perímetro da praça.
 */
export const STREET = {
  xWest: -48,
  xEast: 14,
  halfWidth: 4,
  sidewalkDepth: 3,
  curbHeight: 0.12,
  plaza: { x0: 14, x1: 46, z0: -18, z1: 18 },
} as const;

export function buildStreet(ctx: WorldContext): void {
  const { mats } = ctx;
  const S = STREET;
  const streetLen = S.xEast - S.xWest;
  const streetCx = (S.xEast + S.xWest) / 2;

  // Base de terra sob tudo + colisor único do chão (topo em y=0). O chão vai longe (600 m) porque a aeromoto
  // sobrevoa o quarteirão; a silhueta da cidade ao redor é construída em buildSkyline (worldBuilder).
  ctx.ground("terra_base", { w: 600, h: 600 }, new Vector3(0, -0.03, 0), mats.soil, 2);
  ctx.staticBoxCollider("chao", { w: 600, h: 1, d: 600 }, new Vector3(0, -0.5, 0), undefined, false);
  // piso de segurança da região (40 km): quem voa para longe da cidade e desce ainda encontra chão
  ctx.staticBoxCollider("chao_regiao", { w: 40000, h: 1, d: 40000 }, new Vector3(0, -0.6, 0), undefined, false);

  // Asfalto
  ctx.ground("asfalto", { w: streetLen, h: S.halfWidth * 2 }, new Vector3(streetCx, 0.005, 0), mats.asphalt, 4);

  // Calçadas elevadas (caixas finas, com colisor) — a praça inteira também é elevada
  const sidewalkY = S.curbHeight / 2;
  ctx.box("calcada_norte", { w: streetLen, h: S.curbHeight, d: S.sidewalkDepth }, new Vector3(streetCx, sidewalkY, S.halfWidth + S.sidewalkDepth / 2), mats.sidewalk, { collider: true, shadow: false, cameraBlocker: false });
  ctx.box("calcada_sul", { w: streetLen, h: S.curbHeight, d: S.sidewalkDepth }, new Vector3(streetCx, sidewalkY, -(S.halfWidth + S.sidewalkDepth / 2)), mats.sidewalk, { collider: true, shadow: false, cameraBlocker: false });
  const plazaW = S.plaza.x1 - S.plaza.x0;
  const plazaD = S.plaza.z1 - S.plaza.z0;
  ctx.box("praca_piso", { w: plazaW, h: S.curbHeight, d: plazaD }, new Vector3((S.plaza.x0 + S.plaza.x1) / 2, sidewalkY, (S.plaza.z0 + S.plaza.z1) / 2), mats.pavingStones, { collider: true, shadow: false, cameraBlocker: false });

  // Faixas de pedestre e marcação central desbotadas (planos finos sobre o asfalto)
  for (let i = 0; i < 8; i++) {
    ctx.box(`faixa_${i}`, { w: 0.5, h: 0.01, d: 2.6 }, new Vector3(-6 + i * 0.95, 0.012, 0), mats.paperWhite, { shadow: false });
  }
  for (let x = S.xWest + 4; x < S.xEast - 4; x += 6) {
    ctx.box(`eixo_${x}`, { w: 2.2, h: 0.01, d: 0.16 }, new Vector3(x, 0.012, 0), mats.paperWhite, { shadow: false });
  }

  // Poças (drenagem falhou): planos reflexivos
  const puddles: Array<[number, number, number, number]> = [
    [-30, -2.2, 3.5, 1.6],
    [-9, 2.4, 2.6, 1.2],
    [4, -1.1, 4.2, 2.0],
    [24, -11, 3.0, 1.4],
  ];
  puddles.forEach(([x, z, w, d], i) => {
    ctx.box(`poca_${i}`, { w, h: 0.006, d }, new Vector3(x, z > -6 && z < 6 ? 0.014 : S.curbHeight + 0.005, z), mats.puddle, { shadow: false });
  });

  // Bueiros e grelhas
  for (const [x, z] of [[-24, 3.3], [-2, -3.3], [10, 3.3]] as Array<[number, number]>) {
    ctx.cylinder(`bueiro_${x}`, { height: 0.02, diameter: 0.8, tessellation: 16 }, new Vector3(x, 0.014, z), mats.metalDark, { shadow: false });
  }

  // Entulho de barricada no limite oeste da rua (bloqueia a saída do quarteirão)
  for (let i = 0; i < 9; i++) {
    const x = S.xWest + 1.5 + (i % 3) * 0.9;
    const z = -3.2 + Math.floor(i / 3) * 3.0 + (i % 2) * 0.4;
    ctx.box(`entulho_oeste_${i}`, { w: 1.6, h: 0.9 + (i % 3) * 0.3, d: 1.2 }, new Vector3(x, 0.45 + (i % 3) * 0.15, z), mats.concrete, { rotationY: (i * 0.7) % 1.2, collider: true });
  }
  ctx.box("muro_oeste", { w: 1, h: 6, d: 16 }, new Vector3(S.xWest - 0.5, 3, 0), mats.concrete, { collider: true, uvScale: 1 });
  // paredes invisíveis de limite do mundo
  ctx.staticBoxCollider("limite_oeste", { w: 1, h: 10, d: 60 }, new Vector3(S.xWest - 1, 5, 0));
  ctx.staticBoxCollider("limite_leste", { w: 1, h: 10, d: 60 }, new Vector3(S.plaza.x1 + 0.5, 5, 0));
  // (as fachadas dos prédios são os limites norte/sul; a oficina abre para a rua)
  ctx.staticBoxCollider("limite_norte_praca", { w: 40, h: 10, d: 1 }, new Vector3(30, 5, S.plaza.z1 + 12.5));
  ctx.staticBoxCollider("limite_sul_praca", { w: 40, h: 10, d: 1 }, new Vector3(30, 5, S.plaza.z0 - 10.5));
}

import { STREET } from "./street";
import { WORKSHOP } from "./workshop";

/** Superfície sob os pés — escolhe o conjunto de sons de passo. */
export type Surface = "concrete" | "grass" | "wood";

/**
 * Mapa de superfícies por posição (lógica pura, testável): asfalto, calçadas, praça e piso da
 * oficina são duros ("concrete"); fora disso é terra batida com mato ("grass"). Objetos empurráveis
 * (caixotes) são madeira — resolvidos pelo colisor atingido, não por aqui.
 */
export function surfaceAt(x: number, z: number): Surface {
  const S = STREET;
  const streetHalf = S.halfWidth + S.sidewalkDepth;
  if (x >= S.xWest && x <= S.xEast && Math.abs(z) <= streetHalf) return "concrete";
  const P = S.plaza;
  if (x >= P.x0 && x <= P.x1 && z >= P.z0 && z <= P.z1) return "concrete";
  const W = WORKSHOP;
  if (x >= W.x0 && x <= W.x1 && z >= W.zBack && z <= W.zFront) return "concrete";
  return "grass";
}

/** Superfície a partir do nó físico atingido pelo raio do chão (props dinâmicos) ou da posição. */
export function surfaceForHit(nodeName: string | null, x: number, z: number): Surface {
  if (nodeName && /caixa|caixote|tabua|palete|wood/i.test(nodeName)) return "wood";
  return surfaceAt(x, z);
}

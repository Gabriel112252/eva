/**
 * Limites do mundo jogável (Setor 17 de São Paulo Velha). Dados puros, sem Babylon: usados pelo
 * construtor do setor, pelo navmesh, pela cerca da aeromoto e pelos testes.
 *
 * Eixos: X = leste, Z = norte, metros. O quarteirão original da Apuração (rua, praça, oficina)
 * fica em x∈[-49, 58.5], z∈[-28, 36] e permanece onde está; o setor cresce em volta dele.
 */
export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** Retângulo do setor (até os muros do limite, com os postos de controle da Custódia). */
export const SECTOR_BOUNDS: Rect = { x0: -78, x1: 104, z0: -76, z1: 82 } as const;

/** Centro do setor (para a silhueta distante e a cerca). */
export const SECTOR_CENTER = { x: (SECTOR_BOUNDS.x0 + SECTOR_BOUNDS.x1) / 2, z: (SECTOR_BOUNDS.z0 + SECTOR_BOUNDS.z1) / 2 } as const;

/** Altura do muro do limite do setor (m). */
export const SECTOR_WALL_HEIGHT = 3.2;

/**
 * Raio (m, a partir da origem) da cerca invisível que segura a aeromoto perto do chão; acima de 80 m
 * de altitude o raio cresce (src/vehicles/vehicle.ts). Cobre o setor inteiro com folga: o canto mais
 * distante do setor fica a ~133 m da origem.
 */
export const GROUND_FENCE_RADIUS = 190;

/** Lado do chão de terra real (m) e do colisor `chao` (centrados na origem). */
export const GROUND_SIZE = 600;

export function rectContains(r: Rect, x: number, z: number, margin = 0): boolean {
  return x >= r.x0 - margin && x <= r.x1 + margin && z >= r.z0 - margin && z <= r.z1 + margin;
}

export function rectsOverlap(a: Rect, b: Rect, tolerance = 0.001): boolean {
  return a.x0 < b.x1 - tolerance && b.x0 < a.x1 - tolerance && a.z0 < b.z1 - tolerance && b.z0 < a.z1 - tolerance;
}

/**
 * Zonas nomeadas do Setor 17 — dados puros `{ id, center, radius }` (metros; eixo X = leste, Z = norte).
 * Servem aos gatilhos do roteiro (`MissionTrigger { kind: "zona", id }` em src/data/cap1Contracts.ts),
 * aos testes e à HUD. As posições batem com a planta em docs/MAPA_SETOR17.md e com a geometria
 * construída em src/world/sector17.ts (o teste unitário confere a coerência).
 *
 * Zonas de telhado têm `center[1]` na altura do piso do telhado: `zoneAt` só as considera quando o
 * ponto consultado está a menos de 3 m dessa altura.
 */
export interface ZoneSpec {
  id: string;
  /** nome legível, PT-BR */
  name: string;
  center: [number, number, number];
  radius: number;
  /** quarteirão a que pertence (ver MAPA_SETOR17.md) */
  block: "Q0" | "Q1" | "Q2" | "Q3" | "Q4" | "AV";
}

export const SECTOR17_ZONES: ZoneSpec[] = [
  // --- quarteirão da Apuração (Q0, existente) ---------------------------------------------------
  { id: "zona.oficina", name: "Oficina de Matias", center: [-30, 0.1, -10.5], radius: 5.5, block: "Q0" },
  { id: "zona.rua_apuracao", name: "Rua da Apuração", center: [-17, 0, 0], radius: 31, block: "Q0" },
  { id: "zona.praca", name: "Praça da Apuração", center: [30, 0.12, 0], radius: 17, block: "Q0" },
  { id: "zona.portao_central", name: "Portão da Central de Suprimentos", center: [36, 0.12, 15], radius: 5, block: "Q0" },
  { id: "zona.posto_raquel", name: "Posto médico — entrada da praça", center: [24.4, 0.12, -16], radius: 2.5, block: "Q0" },
  { id: "zona.posto_raquel_fundos", name: "Posto médico — consultório dos fundos (Raquel)", center: [24.5, 0.12, -30], radius: 3, block: "Q0" },
  { id: "zona.beco_praca_oeste", name: "Beco atrás da praça (oeste)", center: [19, 0.12, -31], radius: 5.5, block: "Q0" },
  { id: "zona.beco_praca_leste", name: "Beco atrás da praça (leste)", center: [40, 0.12, -31], radius: 6.5, block: "Q0" },
  { id: "zona.escola", name: "Escola do Setor — pátio", center: [7, 0.12, -24], radius: 7.5, block: "Q0" },
  { id: "zona.escola_salas", name: "Escola do Setor — bloco de salas", center: [-6, 0.12, -29], radius: 6, block: "Q0" },
  { id: "zona.quadra", name: "Quadra da escola", center: [-28, 0.12, -26.25], radius: 12, block: "Q0" },
  { id: "zona.telhado_escola", name: "Telhado da escola (pouso da Rastro)", center: [-6, 7.0, -29], radius: 8, block: "Q0" },
  { id: "zona.beco_vila", name: "Beco da Vila dos Recicladores", center: [-28.75, 0.12, 27], radius: 4.5, block: "Q0" },
  { id: "zona.largo", name: "Largo do Mercado", center: [52.5, 0.12, -17], radius: 12, block: "Q0" },
  // --- quarteirão da Distribuição (Q1) ----------------------------------------------------------
  { id: "zona.distribuicao", name: "Zona de distribuição (pátio cercado)", center: [34, 0.12, 66], radius: 24, block: "Q1" },
  { id: "zona.deposito_porta", name: "Depósito — portão", center: [33.5, 0.12, 55.5], radius: 3, block: "Q1" },
  { id: "zona.deposito", name: "Depósito da zona de distribuição (interior)", center: [34.5, 0.12, 65.5], radius: 8.5, block: "Q1" },
  { id: "zona.telhado_deposito", name: "Telhado do depósito (pouso da Rastro)", center: [34.5, 6.8, 65.5], radius: 9, block: "Q1" },
  { id: "zona.torre", name: "Torre Verde — fazenda vertical", center: [-26, 0.12, 52], radius: 8, block: "Q1" },
  { id: "zona.radio", name: "Rádio do Setor", center: [-3, 0.12, 48], radius: 5, block: "Q1" },
  { id: "zona.limite_setor_norte", name: "Limite do setor — posto de controle norte", center: [72.5, 0.12, 77], radius: 8, block: "AV" },
  // --- Avenida do Maglev e quarteirão do Mercado (Q2) --------------------------------------------
  { id: "zona.banca", name: "Banca do mercado — feira do viaduto", center: [72.5, 0.15, -14], radius: 5, block: "AV" },
  { id: "zona.feira_viaduto", name: "Feira do Viaduto (sombra do maglev)", center: [72.5, 0.15, -14], radius: 13, block: "AV" },
  { id: "zona.mercado_coberto", name: "Mercado coberto do 17", center: [88.5, 0.12, -12], radius: 6, block: "Q2" },
  { id: "zona.limite_setor_sul", name: "Limite do setor — posto de controle sul", center: [72.5, 0.12, -71], radius: 8, block: "AV" },
  // --- quarteirão do Terminal (Q3) ---------------------------------------------------------------
  { id: "zona.terminal", name: "Terminal de recarga (canopy solar)", center: [2, 0.12, -56], radius: 13, block: "Q3" },
  { id: "zona.telhado_canopy", name: "Canopy solar — cobertura (pouso da Rastro)", center: [2, 6.4, -56], radius: 11, block: "Q3" },
  // --- quarteirão da Cisterna (Q4) ---------------------------------------------------------------
  { id: "zona.cisterna", name: "Cisterna e bombas do setor", center: [-70, 0.12, 0], radius: 9, block: "Q4" },
];

const byId = new Map(SECTOR17_ZONES.map((z) => [z.id, z]));

export function zoneById(id: string): ZoneSpec | undefined {
  return byId.get(id);
}

/** Zona mais específica (menor raio) que contém o ponto; telhados só com |y − altura| < 3 m. */
export function zoneAt(x: number, z: number, y = 0): ZoneSpec | null {
  let best: ZoneSpec | null = null;
  for (const zone of SECTOR17_ZONES) {
    const [cx, cy, cz] = zone.center;
    if (cy > 2 && Math.abs(y - cy) > 3) continue;
    if (cy <= 2 && y > 4) continue; // em cima de um telhado não está "na praça"
    const d = Math.hypot(x - cx, z - cz);
    if (d > zone.radius) continue;
    if (!best || zone.radius < best.radius) best = zone;
  }
  return best;
}

/** Todas as zonas que contêm o ponto (para gatilhos que observam várias). */
export function zonesAt(x: number, z: number, y = 0): ZoneSpec[] {
  return SECTOR17_ZONES.filter((zone) => {
    const [cx, cy, cz] = zone.center;
    if (cy > 2 && Math.abs(y - cy) > 3) return false;
    if (cy <= 2 && y > 4) return false;
    return Math.hypot(x - cx, z - cz) <= zone.radius;
  });
}

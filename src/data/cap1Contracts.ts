/**
 * Contratos do Capítulo 1 "Setor 17" compartilhados entre as frentes (Enredo, Gameplay, Mapas, Áudio, UI).
 * Só tipos, ids e nomes de flags — sem lógica. Ver `docs/GDD_CAPITULO_1.md`.
 *
 * Convenção de flags: `cap1.<missao>.<evento>`; valores de escolha são strings curtas em minúsculas.
 */

/** ids das missões do capítulo (QuestLog) */
export const QUEST_RASTRO_DO_LOTE = "rastro_do_lote"; // M2
export const QUEST_A_VIGILIA = "a_vigilia"; // M3
export const QUEST_PARTIDA = "partida"; // M4

/** flags de decisão (valores possíveis documentados ao lado) */
export const CAP1_FLAGS = {
  /** M1 (existe): "registro" | "silencio" */
  carregamentoDecisao: "carregamento.decisao",
  /** M2: Matias montou o nome de Samuel Brandão a partir das pistas */
  brandaoIdentificado: "cap1.m2.brandao_identificado",
  /** M2: "denuncia" | "silencio" */
  m2Decisao: "cap1.m2.decisao",
  /** M2: entrega do remédio ao posto dentro do tempo */
  entregaNoPrazo: "cap1.m2.entrega_no_prazo",
  /** M3: Matias foi detectado pelos Custódios durante o toque de recolher */
  detectado: "cap1.m3.detectado",
  /** M3: Matias atirou em Custódios (eles ficam hostis em M4) */
  custodiosHostis: "cap1.m3.custodios_hostis",
  /** M3: "guardou" | "miriam" */
  documento: "cap1.m3.documento",
  /** M4: "vai" | "fica" — decisão da Ana */
  ana: "cap1.m4.ana",
  /** confiança no sistema (herdada do prólogo): booleana (true = confia), como o prólogo grava */
  matiasConfia: "matiasTrustsSystem",
} as const;

export type Cap1Flag = (typeof CAP1_FLAGS)[keyof typeof CAP1_FLAGS];

/** Pista do diário: o texto é do Enredo (`src/data/clues.ts`), o sistema é do Gameplay (`src/narrative/clues.ts`). */
export interface ClueDef {
  /** `pista.<slug>` */
  id: string;
  title: string;
  /** 1–3 frases, PT-BR, na voz do diário de Matias */
  text: string;
  /** onde foi encontrada (nome do lugar/objeto/pessoa) */
  source: string;
  /** missão em que aparece */
  quest: typeof QUEST_RASTRO_DO_LOTE | typeof QUEST_A_VIGILIA | typeof QUEST_PARTIDA | "o_carregamento";
}

/** Efeito observável no bairro, aplicado ao iniciar uma missão a partir das flags (tabela do Enredo). */
export type ConsequenceEffect =
  | { kind: "agua"; delta: number } // medidor de água do bairro (0–100)
  | { kind: "estoque_raquel"; delta: number } // caixas no posto (0–6)
  | { kind: "preco_banca"; fator: number } // multiplicador de preço na banca
  | { kind: "patrulha"; nivel: "cordial" | "tensa" | "hostil" } // postura dos Custódios
  | { kind: "fala"; npc: string; set: string } // substitui o nó inicial de diálogo de um NPC
  | { kind: "presenca"; npc: string; presente: boolean } // NPC aparece ou não
  | { kind: "aviso"; texto: string }; // aviso na HUD ao começar a missão

export interface ConsequenceRule {
  /** flag observada */
  flag: Cap1Flag | string;
  /** valor que dispara (true para booleanas) */
  equals: string | boolean;
  /** missão em que o efeito é aplicado */
  quest: typeof QUEST_RASTRO_DO_LOTE | typeof QUEST_A_VIGILIA | typeof QUEST_PARTIDA;
  effects: ConsequenceEffect[];
}

/** Gatilhos que o roteiro pode usar e que o Gameplay implementa de forma genérica. */
export type MissionTrigger =
  | { kind: "zona"; id: string } // Matias entrou numa zona nomeada
  | { kind: "examinar"; objeto: string } // examinou um objeto nomeado
  | { kind: "pista"; id: string } // pista adicionada ao diário
  | { kind: "reparo"; maquina: string } // reparo concluído
  | { kind: "timer"; id: string; segundos: number } // contagem regressiva (entrega)
  | { kind: "detectado" } // furtividade: detecção
  | { kind: "dialogo"; npc: string; no: string } // nó de diálogo alcançado
  | { kind: "veiculo"; id: string; dentro: boolean }; // entrou/saiu de veículo

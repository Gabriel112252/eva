import { CAP1_FLAGS, QUEST_A_VIGILIA, QUEST_PARTIDA, QUEST_RASTRO_DO_LOTE, type ConsequenceRule } from "./cap1Contracts";
import { CAP1_AUX_FLAGS } from "./dialogues";

/**
 * Tabela de consequências do Capítulo 1 (Enredo). O Gameplay (`src/narrative/consequences.ts`) aplica, ao
 * INICIAR cada missão, os efeitos de toda regra cuja flag tenha o valor indicado.
 *
 * Regras de resolução (para o Gameplay):
 * - `agua` e `estoque_raquel`: os deltas somam; o resultado é limitado a 0–100 e 0–6, respectivamente.
 * - `preco_banca`: os fatores multiplicam (ex.: 1.5 × 1.25).
 * - `patrulha`: vale o nível mais severo (cordial < tensa < hostil).
 * - `fala`: quando mais de uma regra define o nó inicial de um mesmo NPC, vale a ÚLTIMA regra da tabela
 *   (a ordem abaixo já é de prioridade crescente). Os grafos em `dialogues.ts` resolvem as mesmas condições
 *   no `start`, então o efeito é redundante por segurança — nunca contraditório.
 * - `presenca`: Brandão só existe quando uma regra o coloca em cena (ausente por padrão em M4).
 * - `aviso`: todos os avisos são exibidos, na ordem da tabela.
 *
 * Decisões cobertas (GDD §4): M1 `carregamento.decisao`; M2 `cap1.m2.decisao` e `cap1.m2.entrega_no_prazo`;
 * M3 `cap1.m3.detectado`, `cap1.m3.custodios_hostis` e `cap1.m3.documento`. A decisão de M4 (`cap1.m4.ana`)
 * é consumida pela cutscene de partida e pelo Capítulo 2, não por esta tabela.
 */
const F = CAP1_FLAGS;
const X = CAP1_AUX_FLAGS;

export const CONSEQUENCES: ConsequenceRule[] = [
  // ---------------------------------------------------------------------------------------
  // M1 "O Carregamento" → M2 "Rastro do Lote"
  // ---------------------------------------------------------------------------------------
  {
    flag: F.carregamentoDecisao,
    equals: "registro",
    quest: QUEST_RASTRO_DO_LOTE,
    effects: [
      { kind: "patrulha", nivel: "cordial" },
      { kind: "fala", npc: "custodio", set: "m2_registro" },
      { kind: "agua", delta: 5 },
      { kind: "aviso", texto: "O conselho registrou o lote. A fila da água tem gente de outros setores." },
    ],
  },
  {
    flag: F.carregamentoDecisao,
    equals: "silencio",
    quest: QUEST_RASTRO_DO_LOTE,
    effects: [
      { kind: "patrulha", nivel: "tensa" },
      { kind: "fala", npc: "custodio", set: "m2_silencio" },
      { kind: "agua", delta: -10 },
      { kind: "aviso", texto: "O conselho cortou um dia de água do setor enquanto 'apura o sumiço' do lote." },
    ],
  },
  {
    flag: F.matiasConfia,
    equals: true,
    quest: QUEST_RASTRO_DO_LOTE,
    effects: [{ kind: "fala", npc: "ana", set: "m2_manha" }],
  },
  {
    flag: F.matiasConfia,
    equals: false,
    quest: QUEST_RASTRO_DO_LOTE,
    effects: [{ kind: "fala", npc: "ana", set: "m2_manha_b" }],
  },

  // ---------------------------------------------------------------------------------------
  // M2 → M3 "A Vigília"
  // ---------------------------------------------------------------------------------------
  {
    flag: F.m2Decisao,
    equals: "denuncia",
    quest: QUEST_A_VIGILIA,
    effects: [
      { kind: "patrulha", nivel: "tensa" },
      { kind: "fala", npc: "miriam", set: "m3_tarde" },
      { kind: "aviso", texto: "Toque de recolher antecipado. Pedido do depósito, dizem na fila." },
    ],
  },
  {
    flag: F.m2Decisao,
    equals: "silencio",
    quest: QUEST_A_VIGILIA,
    effects: [
      { kind: "patrulha", nivel: "cordial" },
      { kind: "fala", npc: "miriam", set: "m3_tarde" },
      { kind: "aviso", texto: "A lista de sexta circula cedo. O nome de Ana subiu. Ninguém comenta." },
    ],
  },
  {
    flag: F.entregaNoPrazo,
    equals: false,
    quest: QUEST_A_VIGILIA,
    effects: [{ kind: "aviso", texto: "A Central recolheu o que sobrou ao meio-dia. Raquel fechou o posto mais cedo." }],
  },

  // ---------------------------------------------------------------------------------------
  // M1/M2/M3 → M4 "Partida" (o bairro reflete tudo)
  // ---------------------------------------------------------------------------------------
  // água do bairro (continua refletindo M1)
  { flag: F.carregamentoDecisao, equals: "registro", quest: QUEST_PARTIDA, effects: [{ kind: "agua", delta: 5 }] },
  { flag: F.carregamentoDecisao, equals: "silencio", quest: QUEST_PARTIDA, effects: [{ kind: "agua", delta: -5 }] },
  // entrega contra o tempo
  {
    flag: F.entregaNoPrazo,
    equals: true,
    quest: QUEST_PARTIDA,
    effects: [
      { kind: "estoque_raquel", delta: 1 },
      { kind: "fala", npc: "raquel", set: "m4_inicio" },
    ],
  },
  {
    flag: F.entregaNoPrazo,
    equals: false,
    quest: QUEST_PARTIDA,
    effects: [
      { kind: "estoque_raquel", delta: -2 },
      { kind: "fala", npc: "raquel", set: "m4_inicio_tarde" },
      { kind: "aviso", texto: "A fila do posto dobrou a esquina: Raquel não atendeu todo mundo ontem." },
    ],
  },
  // decisão com Brandão
  {
    flag: F.m2Decisao,
    equals: "denuncia",
    quest: QUEST_PARTIDA,
    effects: [
      { kind: "preco_banca", fator: 1.5 },
      { kind: "fala", npc: "comerciante", set: "m4_denuncia" },
      { kind: "aviso", texto: "A banca perdeu o fornecedor da tarde. Munição e kit custam o dobro." },
    ],
  },
  {
    flag: F.m2Decisao,
    equals: "silencio",
    quest: QUEST_PARTIDA,
    effects: [
      { kind: "preco_banca", fator: 1 },
      { kind: "estoque_raquel", delta: 1 },
      { kind: "presenca", npc: "brandao", presente: false },
      { kind: "fala", npc: "comerciante", set: "m4_acordo" },
      { kind: "fala", npc: "custodio", set: "m4_lista" },
      { kind: "aviso", texto: "A lista nova traz Ana em prioridade dois. Ninguém pergunta por quê." },
    ],
  },
  // destino de Brandão (derivado em M2 a partir de M1 + denúncia)
  {
    flag: X.brandaoPreso,
    equals: true,
    quest: QUEST_PARTIDA,
    effects: [
      { kind: "presenca", npc: "brandao", presente: true },
      { kind: "fala", npc: "brandao", set: "m4_preso" },
      { kind: "fala", npc: "custodio", set: "m4_preso" },
      { kind: "estoque_raquel", delta: 2 },
      { kind: "patrulha", nivel: "cordial" },
      { kind: "aviso", texto: "Brandão está algemado no portão da Central. Duas caixas voltaram ao posto." },
    ],
  },
  {
    flag: X.brandaoSolto,
    equals: true,
    quest: QUEST_PARTIDA,
    effects: [
      { kind: "presenca", npc: "brandao", presente: true },
      { kind: "fala", npc: "brandao", set: "m4_solto" },
      { kind: "fala", npc: "custodio", set: "m4_transferido" },
      { kind: "patrulha", nivel: "tensa" },
      { kind: "aviso", texto: "Brandão continua no depósito. O Custódio da praça será transferido no fim do mês." },
    ],
  },
  // furtividade de M3
  {
    flag: F.detectado,
    equals: true,
    quest: QUEST_PARTIDA,
    effects: [
      { kind: "patrulha", nivel: "tensa" },
      { kind: "fala", npc: "custodio", set: "m4_detectado" },
      { kind: "aviso", texto: "Os Custódios sabem que alguém andou pela rua depois do toque." },
    ],
  },
  {
    flag: F.custodiosHostis,
    equals: true,
    quest: QUEST_PARTIDA,
    effects: [
      { kind: "patrulha", nivel: "hostil" },
      { kind: "fala", npc: "custodio", set: "m4_hostil" },
      { kind: "fala", npc: "comerciante", set: "m4_hostis" },
      { kind: "preco_banca", fator: 1.25 },
      { kind: "aviso", texto: "Dois Custódios feridos ontem à noite. A praça procura quem atirou." },
    ],
  },
  // documento de 2056
  {
    flag: F.documento,
    equals: "miriam",
    quest: QUEST_PARTIDA,
    effects: [
      { kind: "presenca", npc: "miriam", presente: true },
      { kind: "fala", npc: "miriam", set: "m4_doc" },
      { kind: "aviso", texto: "Miriam espera diante da oficina, antes da fila." },
    ],
  },
  {
    flag: F.documento,
    equals: "guardou",
    quest: QUEST_PARTIDA,
    effects: [
      { kind: "presenca", npc: "miriam", presente: true },
      { kind: "fala", npc: "miriam", set: "m4_semdoc" },
      { kind: "aviso", texto: "Miriam espera diante da oficina. Ela registrou o voo de ontem como 'manutenção'." },
    ],
  },
];

/** Decisões do GDD §4 que a tabela precisa cobrir (flag → valores possíveis); usado pelos testes. */
export const CAP1_DECISIONS: Array<{ flag: string; values: Array<string | boolean> }> = [
  { flag: F.carregamentoDecisao, values: ["registro", "silencio"] },
  { flag: F.m2Decisao, values: ["denuncia", "silencio"] },
  { flag: F.entregaNoPrazo, values: [true, false] },
  { flag: F.detectado, values: [true] },
  { flag: F.custodiosHostis, values: [true] },
  { flag: F.documento, values: ["guardou", "miriam"] },
  { flag: F.matiasConfia, values: [true, false] },
];

import { QUEST_A_VIGILIA, QUEST_PARTIDA, QUEST_RASTRO_DO_LOTE, type ClueDef } from "./cap1Contracts";
import { QUEST_CARREGAMENTO } from "./quests";

/**
 * Pistas do diário de Matias (Capítulo 1). Texto do Enredo; o sistema (`src/narrative/clues.ts`) é do Gameplay.
 * Convenção: ao adicionar a pista `pista.<slug>` ao diário, o Gameplay define a flag `pista.<slug> = true`
 * (como o prólogo já faz com `pista.carregamento`), para que diálogos e consequências possam reagir.
 * Roteiro e gatilhos de cada pista: docs/ROTEIRO_CAP1.md.
 */
export const CLUES: ClueDef[] = [
  // --- Prólogo (retroativa; já plantada pelo diálogo de Miriam) -----------------------------
  {
    id: "pista.carregamento",
    title: "Um lote fora das cotas",
    text: "Miriam deixou escapar: um lote chegou ao depósito da zona de distribuição e não está nas cotas de ninguém. Papel não mente sozinho.",
    source: "Miriam, balcão da Apuração",
    quest: QUEST_CARREGAMENTO,
  },
  // --- M2 Rastro do Lote --------------------------------------------------------------------
  {
    id: "pista.manifesto_rasurado",
    title: "Manifesto rasurado",
    text: "Seis volumes viraram três com a mesma caneta. Rubrica ao lado da rasura: S.B. Quem corrige um manifesto assina a correção — hábito de quem nunca foi questionado.",
    source: "Manifesto da van Módulo V-7",
    quest: QUEST_RASTRO_DO_LOTE,
  },
  {
    id: "pista.selo_nao_bate",
    title: "Selo do depósito, não do conselho",
    text: "O carimbo do manifesto é o do depósito da zona, não o do conselho de distribuição. O papel foi refeito depois que o lote entrou no depósito.",
    source: "Manifesto da van Módulo V-7",
    quest: QUEST_RASTRO_DO_LOTE,
  },
  {
    id: "pista.lacres_refeitos",
    title: "Lacres cortados e refeitos",
    text: "Os lacres das três caixas foram cortados e refeitos com alicate de depósito. Ninguém abre lacre com calma no meio de um tiroteio.",
    source: "Caixas na van",
    quest: QUEST_RASTRO_DO_LOTE,
  },
  {
    id: "pista.caixas_vazias",
    title: "Três caixas vazias",
    text: "Atrás dos sacos de farinha, três caixas da mesma série, vazias, ainda com cheiro de álcool do antibiótico. A metade que falta saiu daqui, não da rua.",
    source: "Fundos do depósito",
    quest: QUEST_RASTRO_DO_LOTE,
  },
  {
    id: "pista.caderno_de_saida",
    title: "Caderno de saída: Brandão",
    text: "Saída das 21h40: lote CS-17, seis volumes. Oficial de turno: Brandão. Seis saíram no papel; três chegaram na van. O desvio aconteceu no turno dele.",
    source: "Caderno de saída do depósito",
    quest: QUEST_RASTRO_DO_LOTE,
  },
  {
    id: "pista.testemunha_samuel",
    title: "O Samuel da banca",
    text: "Um 'Samuel' de farda cinza deixa sobras de remédio na banca em troca de Selos, no fim da tarde, num Atlas com faixa de cobre. Samuel. Brandão. S.B.",
    source: "Comerciante, banca do mercado",
    quest: QUEST_RASTRO_DO_LOTE,
  },
  // --- M3 A Vigília -------------------------------------------------------------------------
  {
    id: "pista.assinatura_2056",
    title: "A minha assinatura, 2056",
    text: "Última folha de um documento técnico de 2056. A assinatura é minha; a data, de antes da Ruptura. As outras linhas estão tarjadas. Eu sei que assinei. Não sei o que isso fez.",
    source: "Cópia entregue por Elias Nobre",
    quest: QUEST_A_VIGILIA,
  },
  {
    id: "pista.toque_pedido_pelo_deposito",
    title: "Toque pedido pelo depósito",
    text: "O toque de recolher antecipado foi pedido pelo depósito da zona, não pelos Custódios. Miriam viu o pedido. Brandão move patrulhas com uma assinatura.",
    source: "Miriam, por Ana",
    quest: QUEST_A_VIGILIA,
  },
  {
    id: "pista.rastro_na_escola",
    title: "Uma Rastro na doca da escola",
    text: "Etiqueta de manutenção: rotor B, vibração, aguardando peça do Vale dos Sinos. Bateria pela metade. É por isso que os Custódios rondam a escola à noite.",
    source: "Doca no telhado da escola",
    quest: QUEST_A_VIGILIA,
  },
  // --- M4 Partida (condicional: só no caminho do acordo com Brandão) --------------------------
  {
    id: "pista.lista_prioridade_dois",
    title: "Prioridade dois, sem pergunta",
    text: "A lista nova traz Ana em prioridade dois, com o carimbo do depósito. Ninguém perguntou por quê. Eu sei por quê.",
    source: "Lista da Apuração, posto",
    quest: QUEST_PARTIDA,
  },
];

export const CLUE_IDS: ReadonlySet<string> = new Set(CLUES.map((c) => c.id));

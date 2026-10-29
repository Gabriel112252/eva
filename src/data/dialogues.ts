import type { DialogueEffect, DialogueGraph, DialogueLine } from "@/narrative/dialogue";
import type { Condition, FlagValue } from "@/narrative/flags";
import { CAP1_FLAGS, QUEST_A_VIGILIA, QUEST_PARTIDA, QUEST_RASTRO_DO_LOTE } from "./cap1Contracts";
import { QUEST_APURACAO, QUEST_CARREGAMENTO } from "./quests";

/**
 * Diálogos do prólogo "A Apuração" em português brasileiro.
 * Falas canônicas de docs/PROLOGO_A_APURACAO.md foram preservadas literalmente.
 * Campos `voice` ficam vazios: não existem arquivos de dublagem ainda (ver docs/STATUS.md);
 * a voz provisória vem da síntese de fala do navegador.
 */

export const SPEAKER_NAMES: Record<string, string> = {
  matias: "Matias",
  miriam: "Miriam",
  custodio: "Custódio",
  comerciante: "Comerciante",
  raquel: "Raquel",
  ana: "Ana",
  radio: "Rádio do Setor",
  desviador: "Desviador",
  // Capítulo 1
  elias: "Elias Nobre",
  brandao: "Samuel Brandão",
};

export const RADIO_BULLETIN = [
  "O setor dezessete deve apresentar registros para a Apuração das quinze horas.",
  "Cotas de água permanecem em regime de terça e sexta. Evitem acumular em recipientes abertos.",
  "O conselho de distribuição informa: medicamentos de emergência seguem reservados aos casos prioritários.",
];

export const DIALOGUE_COMERCIANTE: DialogueGraph = {
  id: "comerciante",
  start: [
    { condition: { flag: "comerciante.conversou", is: true }, node: "repete" },
    { node: "inicio" },
  ],
  lines: {
    inicio: { id: "inicio", speaker: "comerciante", text: "Matias. Vai pra Apuração? Vai cedo. Semana passada a fila dos Vinculados nem chegou no balcão.", next: "m1", shot: "speaker" },
    m1: { id: "m1", speaker: "matias", text: "Vinculado não come?", next: "c2", shot: "listener" },
    c2: {
      id: "c2",
      speaker: "comerciante",
      text: "Come o que sobra. Registrado tem cota fechada: água, farinha, óleo. Vinculado tem “prioridade conforme disponibilidade”. Bonito, né? Eu vendo raiz pra quem tem Selo e troco por conserto pra quem não tem.",
      choices: [
        { text: "Quem define essa “disponibilidade”?", next: "c3a", effects: [{ type: "setFlag", key: "comerciante.perguntouDisponibilidade", value: true }] },
        { text: "O sistema ainda alimenta mais gente do que deixa sem.", next: "c3b", effects: [{ type: "increment", key: "matiasDefendeSistema" }] },
      ],
      shot: "speaker",
    },
    c3a: { id: "c3a", speaker: "comerciante", text: "O conselho. Dizem que vem do relatório da Mãe. Eu só sei que o papel chega de carroça, toda semana, com o mensageiro. Quem lê o papel é gente.", next: "fim", shot: "speaker" },
    c3b: { id: "c3b", speaker: "comerciante", text: "Hoje, sim. Minha irmã em Nova Aurora diz que lá sobra. Aqui, depende de quem conta — e de quem está na fila.", next: "fim", shot: "speaker" },
    fim: {
      id: "fim",
      speaker: "comerciante",
      text: "Leva uma mandioca pra Ana. Paga quando puder. E vai logo, que o Custódio hoje está com a cara fechada.",
      effects: [{ type: "setFlag", key: "comerciante.conversou", value: true }],
      shot: "speaker",
    },
    repete: { id: "repete", speaker: "comerciante", text: "Ainda aqui? Fila dos Registrados é a da esquerda. A outra... a outra é a que sobra.", shot: "speaker" },
  },
};

export const DIALOGUE_RAQUEL: DialogueGraph = {
  id: "raquel",
  start: [
    { condition: { flag: "raquel.conversou", is: true }, node: "repete" },
    { node: "inicio" },
  ],
  lines: {
    inicio: {
      id: "inicio",
      speaker: "raquel",
      text: "Matias. Ela passou a noite melhor. Mas o quadro não melhora sozinho: precisa do tratamento contínuo, e o lote que viria pro bairro foi remanejado.",
      next: "m1",
      shot: "speaker",
    },
    m1: { id: "m1", speaker: "matias", text: "Remanejado pra onde?", next: "r2", shot: "listener" },
    r2: { id: "r2", speaker: "raquel", text: "Nova Aurora. Casos prioritários. Aqui chega em semanas. Talvez mais.", next: "a3", shot: "speaker" },
    a3: {
      id: "a3",
      speaker: "ana",
      text: "Pai, a Apuração de hoje recalcula as prioridades. A Miriam disse que o relatório novo chegou ontem.",
      choices: [
        {
          text: "Então vamos confiar na Apuração. Se o relatório estiver certo, você sobe na lista.",
          next: "a4a",
          effects: [{ type: "setFlag", key: "matiasTrustsSystem", value: true }],
        },
        {
          text: "Relatório nenhum vai decidir isso por mim. Eu vou falar com a Miriam.",
          next: "a4b",
          effects: [{ type: "setFlag", key: "matiasTrustsSystem", value: false }],
        },
      ],
      shot: "two",
    },
    a4a: { id: "a4a", speaker: "ana", text: "Viu? Às vezes o senhor só precisa deixar o sistema trabalhar.", next: "r5a", shot: "speaker" },
    r5a: { id: "r5a", speaker: "raquel", text: "Tomara. Mas leva o cartão até o balcão você mesmo. Papel que não chega na mão da Miriam não existe.", next: "fim", shot: "speaker" },
    a4b: { id: "a4b", speaker: "ana", text: "O senhor sempre acha que sabe mais que todo mundo.", next: "r5b", shot: "speaker" },
    r5b: { id: "r5b", speaker: "raquel", text: "Fala com ela. Mas não grite. A Miriam é a única lá que lê o papel inteiro.", next: "fim", shot: "speaker" },
    fim: {
      id: "fim",
      speaker: "raquel",
      text: "Vai. A gente fica na fila.",
      effects: [
        { type: "setFlag", key: "raquel.conversou", value: true },
        { type: "questObjective", quest: QUEST_APURACAO, objective: "raquel" },
      ],
      shot: "speaker",
    },
    repete: {
      id: "repete",
      speaker: "raquel",
      text: "Ela está bem por enquanto. Resolve o registro. Eu fico de olho.",
      condition: { flag: "apuracao.concluida", isNot: true },
      elseNext: "depois",
      shot: "speaker",
    },
    depois: { id: "depois", speaker: "raquel", text: "Prioridade três. Eu ouvi daqui. Matias... a gente dá um jeito. Sempre deu.", shot: "speaker" },
  },
};

export const DIALOGUE_ANA: DialogueGraph = {
  id: "ana",
  start: [
    { condition: { flag: "apuracao.concluida", is: true }, node: "depois" },
    { condition: { flag: "ana.conversou", is: true }, node: "repete" },
    { node: "inicio" },
  ],
  lines: {
    inicio: { id: "inicio", speaker: "ana", text: "Pai. A Raquel disse que eu posso ficar na fila com ela.", next: "m1", shot: "speaker" },
    m1: { id: "m1", speaker: "matias", text: "Você devia estar sentada.", next: "a2", shot: "listener" },
    a2: {
      id: "a2",
      speaker: "ana",
      text: "Eu estou bem hoje. E eu quero ver a Apuração. Quero ver como é que eles decidem.",
      choices: [
        { text: "Fica perto da Raquel.", next: "a3a" },
        { text: "Eu também quero ver.", next: "a3b", effects: [{ type: "setFlag", key: "ana.pediuCalma", value: true }] },
      ],
      shot: "speaker",
    },
    a3a: { id: "a3a", speaker: "ana", text: "Tá. Mas eu ouço daqui, viu?", effects: [{ type: "setFlag", key: "ana.conversou", value: true }], shot: "speaker" },
    a3b: { id: "a3b", speaker: "ana", text: "Então vamos juntos. E não briga com a Miriam. Ela só lê o que mandam.", effects: [{ type: "setFlag", key: "ana.conversou", value: true }], shot: "speaker" },
    repete: { id: "repete", speaker: "ana", text: "Vai logo, pai. A fila anda.", shot: "speaker" },
    depois: { id: "depois", speaker: "ana", text: "Pai... tem gente aqui esperando há mais tempo que eu.", shot: "speaker" },
  },
};

export const DIALOGUE_MIRIAM: DialogueGraph = {
  id: "miriam",
  start: [
    { condition: { flag: "apuracao.concluida", is: true }, node: "depois" },
    { condition: { flag: "cartao.pego", isNot: true }, node: "semCartao" },
    { node: "inicio" },
  ],
  lines: {
    semCartao: { id: "semCartao", speaker: "miriam", text: "Matias, sem o cartão de registro eu não consigo abrir a sua linha. Volta com ele.", shot: "speaker" },
    inicio: {
      id: "inicio",
      speaker: "miriam",
      text: "A cota do Setor Dezessete foi recalculada. Medicamentos de emergência permanecem reservados aos casos prioritários.",
      next: "m1",
      shot: "speaker",
    },
    m1: { id: "m1", speaker: "matias", text: "Quem definiu prioritário?", next: "mi2", shot: "listener" },
    mi2: { id: "mi2", speaker: "miriam", text: "O conselho de distribuição. Com base no relatório da Mãe.", next: "m3", shot: "speaker" },
    m3: { id: "m3", speaker: "matias", text: "Eu perguntei quem decidiu. Não quem assinou o relatório.", next: "mi4", shot: "listener" },
    mi4: {
      id: "mi4",
      speaker: "miriam",
      text: "Matias... o nome da Ana está na lista. Prioridade três. O lote deste mês cobre até a dois.",
      next: "a5",
      shot: "speaker",
    },
    a5: { id: "a5", speaker: "ana", text: "Pai... tem gente aqui esperando há mais tempo que eu.", next: "r6", shot: "two" },
    r6: {
      id: "r6",
      speaker: "raquel",
      text: "A fórmula não sabe o que fazer com alguém que não cabe nas categorias.",
      choices: [
        {
          text: "Então a decisão foi humana. Eu quero o nome de quem assinou a lista.",
          next: "mi7a",
          effects: [
            { type: "setFlag", key: "apuracao.postura", value: "confronto" },
            { type: "increment", key: "miriamTensao" },
          ],
        },
        {
          text: "Eu sei que você só lê o papel, Miriam. Me ajuda a entender a conta.",
          next: "mi7b",
          effects: [{ type: "setFlag", key: "apuracao.postura", value: "dialogo" }],
        },
      ],
      shot: "two",
    },
    mi7a: {
      id: "mi7a",
      speaker: "miriam",
      text: "Fala baixo. O Custódio está olhando pra cá. A lista vem assinada pelo conselho, e o conselho não assina nada com nome de gente. Só carimbo.",
      next: "mi8",
      shot: "speaker",
    },
    mi7b: {
      id: "mi7b",
      speaker: "miriam",
      text: "A conta é simples e é isso que me incomoda. Três categorias, um número por pessoa. A Ana não cabe em nenhuma. Então sobra pra ela o que sobra.",
      next: "mi8",
      shot: "speaker",
    },
    mi8: {
      id: "mi8",
      speaker: "miriam",
      text: "Eu não devia dizer isso. O papel cita um lote que já chegou ao depósito da zona de distribuição. Não está nas cotas de ninguém. Não pergunta mais nada hoje.",
      effects: [
        { type: "setFlag", key: "pista.carregamento", value: true },
        { type: "setFlag", key: "apuracao.concluida", value: true },
        { type: "questObjective", quest: QUEST_APURACAO, objective: "miriam" },
      ],
      next: "m9",
      shot: "speaker",
    },
    m9: {
      id: "m9",
      speaker: "matias",
      text: "Um lote que não está nas cotas de ninguém.",
      effects: [{ type: "questObjective", quest: QUEST_APURACAO, objective: "desfecho" }],
      shot: "listener",
    },
    depois: { id: "depois", speaker: "miriam", text: "Eu já disse mais do que devia, Matias. Prioridade três. Volta na próxima Apuração.", shot: "speaker" },
  },
};

export const DIALOGUE_CUSTODIO: DialogueGraph = {
  id: "custodio",
  start: [
    { condition: { flag: "carregamento.fuga", is: true }, node: "fuga_repete" },
    { condition: { flag: "carregamento.vencido", is: true }, node: "fuga" },
    { condition: { flag: "carregamento.armado", is: true }, node: "combate_repete" },
    { condition: { flag: "carregamento.anoitecer", is: true }, node: "noite" },
    { condition: { flag: "apuracao.concluida", is: true }, node: "tarde" },
    { condition: { flag: "apuracao.postura", is: "confronto" }, node: "aviso" },
    { condition: { flag: "custodio.conversou", is: true }, node: "repete" },
    { node: "inicio" },
  ],
  lines: {
    // --- O Carregamento ---------------------------------------------------------------------
    tarde: {
      id: "tarde",
      speaker: "custodio",
      text: "A Miriam falou demais, eu vi a cara do senhor. Olha: o lote sai da Central hoje, na van, assim que escurecer. Ordem do conselho. Se quiser ver com os próprios olhos, fique longe do portão até lá.",
      effects: [
        { type: "setFlag", key: "custodio.avisouLote", value: true },
        { type: "startQuest", quest: QUEST_CARREGAMENTO },
      ],
      next: "tarde_m",
      shot: "speaker",
    },
    tarde_m: { id: "tarde_m", speaker: "matias", text: "Então eu volto quando escurecer.", shot: "listener" },
    noite: {
      id: "noite",
      speaker: "custodio",
      text: "Senhor Matias, não é hora. Tem gente armada vindo pela rua — não são nossos. Dois caminhões de homens, e eu sou um.",
      next: "noite_m1",
      shot: "speaker",
    },
    noite_m1: { id: "noite_m1", speaker: "matias", text: "Desviadores. Querem o lote.", next: "noite_c2", shot: "listener" },
    noite_c2: {
      id: "noite_c2",
      speaker: "custodio",
      text: "O senhor foi segurança da EVA. Sabe usar isto. Não me obrigue a me arrepender.",
      next: "noite_m2",
      shot: "speaker",
    },
    noite_m2: {
      id: "noite_m2",
      speaker: "matias",
      text: "Doze no pente. Fica atrás da van e não levanta a cabeça.",
      effects: [
        { type: "setFlag", key: "carregamento.armado", value: true },
        { type: "questObjective", quest: QUEST_CARREGAMENTO, objective: "portao" },
      ],
      shot: "listener",
    },
    combate_repete: { id: "combate_repete", speaker: "custodio", text: "Eles estão vindo pela praça. Atira só em quem atirar.", shot: "speaker" },
    fuga: {
      id: "fuga",
      speaker: "custodio",
      text: "Pegou de raspão... eu fico. Leva a van — o lote está nela. Pra oficina do senhor, longe do portão. Amanhã eu digo ao conselho que o carregamento sumiu no tiroteio.",
      next: "fuga_m",
      shot: "speaker",
    },
    fuga_m: {
      id: "fuga_m",
      speaker: "matias",
      text: "Você está mentindo pro conselho por um lote.",
      next: "fuga_c",
      shot: "listener",
    },
    fuga_c: {
      id: "fuga_c",
      speaker: "custodio",
      text: "Estou mentindo por uma menina de quinze anos. Vai.",
      effects: [{ type: "setFlag", key: "carregamento.fuga", value: true }],
      shot: "speaker",
    },
    fuga_repete: { id: "fuga_repete", speaker: "custodio", text: "A van, senhor Matias. Antes que voltem.", shot: "speaker" },
    // --- A Apuração -------------------------------------------------------------------------
    inicio: { id: "inicio", speaker: "custodio", text: "Senhor Matias. Hoje é dia de Apuração. Fila organizada, voz baixa. Ninguém passa do portão.", next: "m1", shot: "speaker" },
    m1: { id: "m1", speaker: "matias", text: "Eu vim pelo registro da minha filha.", next: "c2", shot: "listener" },
    c2: {
      id: "c2",
      speaker: "custodio",
      text: "Então o seu lugar é no balcão, com a Miriam. A Central não recebe ninguém hoje. Nem o senhor.",
      choices: [
        { text: "Entendido.", next: "c3a" },
        { text: "Quem mandou fechar?", next: "c3b", effects: [{ type: "increment", key: "custodioQuestionado" }] },
      ],
      shot: "speaker",
    },
    c3a: { id: "c3a", speaker: "custodio", text: "Agradeço.", effects: [{ type: "setFlag", key: "custodio.conversou", value: true }], shot: "speaker" },
    c3b: {
      id: "c3b",
      speaker: "custodio",
      text: "Ordem do conselho. Eu cumpro, não escolho. Vai pro balcão, senhor Matias.",
      effects: [{ type: "setFlag", key: "custodio.conversou", value: true }],
      shot: "speaker",
    },
    repete: { id: "repete", speaker: "custodio", text: "O balcão é pra lá. O portão fica fechado.", shot: "speaker" },
    aviso: {
      id: "aviso",
      speaker: "custodio",
      text: "Já ouvi o senhor lá no balcão. Respeito a preocupação. Mas se levantar a voz de novo, eu tiro o senhor da praça. Sem prazer nenhum nisso.",
      effects: [{ type: "setFlag", key: "custodio.avisou", value: true }],
      shot: "speaker",
    },
  },
};

/** Decisão final no rádio da oficina (Raquel chama). Não decide a história: registra a postura de Matias. */
export const DIALOGUE_RADIO_FINAL: DialogueGraph = {
  id: "radio_final",
  start: [{ node: "r1" }],
  lines: {
    r1: { id: "r1", speaker: "raquel", text: "Matias? É a Raquel. O Custódio me chamou pelo rádio da praça. Disse que o lote está com você. Está inteiro?", next: "m1", shot: "speaker" },
    m1: { id: "m1", speaker: "matias", text: "Inteiro. Soro, antibiótico, o que a Ana precisa e mais gente também. Não está nas cotas de ninguém.", next: "r2", shot: "listener" },
    r2: {
      id: "r2",
      speaker: "raquel",
      text: "Então ele é de quem? Se eu usar isso no posto amanhã, o conselho pergunta de onde veio. Se eu não usar, a fórmula continua certa e a Ana continua sem.",
      choices: [
        { text: "Entrega ao posto. Com registro. Eu assino de onde veio.", next: "fim_sistema", effects: [{ type: "setFlag", key: "carregamento.decisao", value: "registro" }, { type: "increment", key: "matiasDefendeSistema" }] },
        { text: "Distribui em silêncio. Os Silenciosos sabem fazer isso.", next: "fim_silencio", effects: [{ type: "setFlag", key: "carregamento.decisao", value: "silencio" }, { type: "increment", key: "matiasContestaSistema" }] },
      ],
      shot: "speaker",
    },
    fim_sistema: {
      id: "fim_sistema",
      speaker: "raquel",
      text: "Vai dar problema. Mas dá pra defender. Deixa a van trancada; eu passo aí ao amanhecer.",
      effects: [{ type: "questObjective", quest: QUEST_CARREGAMENTO, objective: "decisao" }],
      shot: "speaker",
    },
    fim_silencio: {
      id: "fim_silencio",
      speaker: "raquel",
      text: "Então ninguém sabe de nada. Nem eu. Trava a van e dorme, se conseguir. Eu passo aí ao amanhecer.",
      effects: [{ type: "questObjective", quest: QUEST_CARREGAMENTO, objective: "decisao" }],
      shot: "speaker",
    },
  },
};

// =========================================================================================
// CAPÍTULO 1 — "Setor 17": M2 Rastro do Lote · M3 A Vigília · M4 Partida
// Roteiro completo com falas numeradas e gatilhos: docs/ROTEIRO_CAP1.md.
// Ids de missão e flags de decisão: src/data/cap1Contracts.ts (CAP1_FLAGS).
// Os grafos do prólogo acima permanecem intactos: os do capítulo são EXTENSÕES (nós `m2_*`, `m3_*`, `m4_*`)
// cujas entradas de `start` só disparam depois de `carregamento.decisao` existir (fim de M1).
// =========================================================================================

/**
 * Flags auxiliares de progresso do capítulo (não são decisões; as decisões estão em CAP1_FLAGS).
 * Mesma convenção `cap1.<missao>.<evento>`. Booleanas, exceto `anaPontos` (contador).
 */
export const CAP1_AUX_FLAGS = {
  /** M2: Raquel e Matias conferiram a van (início da missão) */
  vanConferida: "cap1.m2.van_conferida",
  /** M2: o Custódio abriu o depósito (caminho "registro") */
  depositoLiberado: "cap1.m2.deposito_liberado",
  /** M2: o Custódio indicou a grade dos fundos (caminho "silencio") */
  depositoFundos: "cap1.m2.deposito_fundos",
  /** M2: o comerciante emprestou o Atlas T-3 (começa a entrega contra o tempo) */
  atlasEmprestado: "cap1.m2.atlas_emprestado",
  /** M2: Raquel recebeu (ou não) as caixas; Brandão aparece em seguida */
  entregaConversada: "cap1.m2.entrega_conversada",
  /** M2→M4: denúncia com lote registrado em M1 — Brandão é preso */
  brandaoPreso: "cap1.m2.brandao_preso",
  /** M2→M4: denúncia com lote silenciado em M1 — Brandão continua solto, o Custódio paga */
  brandaoSolto: "cap1.m2.brandao_solto",
  /** M3: recado de Elias ouvido no rádio */
  recadoOuvido: "cap1.m3.recado_ouvido",
  /** M3: Matias chegou a Elias na quadra */
  eliasEncontrado: "cap1.m3.elias_encontrado",
  /** M3: Elias foi embora pelos fundos (Rastro liberada) */
  eliasPartiu: "cap1.m3.elias_partiu",
  /** M3: Matias contou a Ana o que recebeu (true) ou escondeu (false) */
  anaSabe: "cap1.m3.ana_sabe",
  /** M4: conversas feitas */
  miriamConversou: "cap1.m4.miriam_conversou",
  custodioConversou: "cap1.m4.custodio_conversou",
  comercianteConversou: "cap1.m4.comerciante_conversou",
  brandaoConversou: "cap1.m4.brandao_conversou",
  raquelConversou: "cap1.m4.raquel_conversou",
  /** M4: contador de confiança que Ana acumula durante a conversa final (decide "vai"/"fica") */
  anaPontos: "cap1.m4.ana_pontos",
} as const;

/** Pistas cuja flag `pista.<slug>` é lida por diálogos (ver src/data/clues.ts). */
const PISTA_CADERNO = "pista.caderno_de_saida";
const PISTA_ASSINATURA = "pista.assinatura_2056";

const F = CAP1_FLAGS;
const X = CAP1_AUX_FLAGS;
type StartEntry = { condition?: Condition; node: string };

const has = (flag: string): Condition => ({ flag, exists: true });
const lacks = (flag: string): Condition => ({ flag, exists: false });
const is = (flag: string, value: FlagValue): Condition => ({ flag, is: value });
const all = (...conditions: Condition[]): Condition => ({ all: conditions });
const any = (...conditions: Condition[]): Condition => ({ any: conditions });
const set = (key: string, value: FlagValue): DialogueEffect => ({ type: "setFlag", key, value });
const inc = (key: string, by = 1): DialogueEffect => ({ type: "increment", key, by });
const obj = (quest: string, objective: string): DialogueEffect => ({ type: "questObjective", quest, objective });
const startQuest = (quest: string): DialogueEffect => ({ type: "startQuest", quest });

/** M1 terminou (decisão do rádio tomada). */
const M1_FEITA = has(F.carregamentoDecisao);
/** M2 terminou (denúncia ou acordo). */
const M2_FEITA = has(F.m2Decisao);
/** M3 terminou (destino do documento decidido). */
const M3_FEITA = has(F.documento);

function toLines(list: DialogueLine[]): Record<string, DialogueLine> {
  const out: Record<string, DialogueLine> = {};
  for (const line of list) {
    if (out[line.id]) throw new Error(`nó de diálogo duplicado: ${line.id}`);
    out[line.id] = line;
  }
  return out;
}

/** Prepõe entradas de `start` e acrescenta nós a um grafo existente sem alterar os nós originais. */
function extendGraph(base: DialogueGraph, ext: { start: StartEntry[]; lines: DialogueLine[] }): DialogueGraph {
  const baseStart: StartEntry[] = typeof base.start === "string" ? [{ node: base.start }] : base.start;
  const merged: Record<string, DialogueLine> = { ...base.lines };
  for (const line of ext.lines) {
    if (merged[line.id]) throw new Error(`${base.id}: nó ${line.id} já existe no prólogo`);
    merged[line.id] = line;
  }
  return { id: base.id, start: [...ext.start, ...baseStart], lines: merged };
}

// --- RAQUEL (M2 manhã · M2 entrega · M3 · M4) -------------------------------------------------
const RAQUEL_CAP1: DialogueLine[] = [
  // M2 — amanhecer, diante da van
  { id: "m2_inicio", speaker: "raquel", text: "Matias. Abre a van. Eu quero contar antes que a rua acorde.", next: "m2_m1", shot: "speaker" },
  { id: "m2_m1", speaker: "matias", text: "O Custódio disse seis caixas.", next: "m2_r2", shot: "listener" },
  { id: "m2_r2", speaker: "raquel", text: "Eu conto três. Soro inteiro, antibiótico pela metade.", next: "m2_r3", shot: "speaker" },
  {
    id: "m2_r3",
    speaker: "raquel",
    text: "O manifesto diz seis volumes. E olha os lacres: cortados e refeitos com alicate de depósito.",
    choices: [
      { text: "Os desviadores levaram metade no tiroteio.", next: "m2_r4a" },
      { text: "Essa van saiu da Central já pela metade.", next: "m2_r4b" },
    ],
    shot: "speaker",
  },
  { id: "m2_r4a", speaker: "raquel", text: "Ninguém abriu a van no tiroteio, eu vi dali. Isso foi feito com calma. Por dentro.", next: "m2_r5_registro", shot: "speaker" },
  { id: "m2_r4b", speaker: "raquel", text: "Então alguém lá dentro abriu, tirou e lacrou de novo. Antes do tiroteio. Antes do Custódio.", next: "m2_r5_registro", shot: "speaker" },
  {
    id: "m2_r5_registro",
    speaker: "raquel",
    text: "Você assinou de onde veio. Hoje o conselho sabe que o lote existe — e que está pela metade.",
    condition: is(F.carregamentoDecisao, "registro"),
    next: "m2_r6",
    elseNext: "m2_r5_silencio",
    shot: "speaker",
  },
  { id: "m2_r5_silencio", speaker: "raquel", text: "O Custódio disse ao conselho que o lote sumiu no tiroteio. Se você fuçar o depósito, ele cai junto.", next: "m2_r6", shot: "speaker" },
  { id: "m2_r6", speaker: "raquel", text: "Ao meio-dia a Central passa recolhendo o que sobrou. O que não estiver no posto até lá, some.", next: "m2_m7", shot: "speaker" },
  {
    id: "m2_m7",
    speaker: "matias",
    text: "Então eu tenho uma manhã. Me mostra esse manifesto.",
    effects: [set(X.vanConferida, true), startQuest(QUEST_RASTRO_DO_LOTE)],
    next: "m2_r8",
    shot: "listener",
  },
  { id: "m2_r8", speaker: "raquel", text: "A Ana dormiu no posto. Melhor assim. Vai — e não grita com ninguém.", shot: "speaker" },
  { id: "m2_repete", speaker: "raquel", text: "Meio-dia, Matias. Depois disso não existe mais lote.", shot: "speaker" },
  // M2 — posto, chegada do Atlas (entrega_no_prazo definida pelo Gameplay)
  {
    id: "m2_entrega",
    speaker: "raquel",
    text: "Chegou. Caixote no chão, devagar: soro não gosta de solavanco.",
    condition: is(F.entregaNoPrazo, true),
    next: "m2_ana1",
    elseNext: "m2_entrega_tarde",
    shot: "speaker",
  },
  { id: "m2_entrega_tarde", speaker: "raquel", text: "A Central já passou. Levou duas que eu tinha separado. O que você trouxe eu guardo — e amanhã a fila dobra.", next: "m2_ana1", shot: "speaker" },
  { id: "m2_ana1", speaker: "ana", text: "Pai! O senhor veio de triciclo?", next: "m2_ana2", shot: "two" },
  {
    id: "m2_ana2",
    speaker: "ana",
    text: "Então sexta a gente registra essas caixas na Apuração. Do jeito certo.",
    condition: is(F.matiasConfia, true),
    next: "m2_entrega_fim",
    elseNext: "m2_ana2b",
    shot: "speaker",
  },
  { id: "m2_ana2b", speaker: "ana", text: "O senhor está com cara de quem vai brigar com alguém. De novo.", next: "m2_entrega_fim", shot: "speaker" },
  {
    id: "m2_entrega_fim",
    speaker: "raquel",
    text: "Farda cinza vindo pela praça, sem armadura. Não é Custódio. É do depósito.",
    effects: [set(X.entregaConversada, true)],
    shot: "speaker",
  },
  { id: "m2_espera_brandao", speaker: "raquel", text: "Deixa ele falar primeiro.", shot: "speaker" },
  // M3 — fim de tarde, no posto
  { id: "m3_noite", speaker: "raquel", text: "Vai pra casa antes do toque, Matias. Eu tranco o posto por dentro.", shot: "speaker" },
  // M4 — amanhecer, no posto
  {
    id: "m4_inicio",
    speaker: "raquel",
    text: "Soro pra dez dias. Antibiótico pra seis; oito, se ninguém piorar.",
    condition: is(F.entregaNoPrazo, true),
    next: "m4_r2",
    elseNext: "m4_inicio_tarde",
    shot: "speaker",
  },
  { id: "m4_inicio_tarde", speaker: "raquel", text: "A fila dobrou a esquina. Eu atendo metade. A outra metade volta amanhã, se der.", next: "m4_r2", shot: "speaker" },
  {
    id: "m4_r2",
    speaker: "raquel",
    text: "Duas caixas do Brandão voltaram hoje cedo. Sem bilhete. Com Custódio.",
    condition: has(X.brandaoPreso),
    next: "m4_r3",
    elseNext: "m4_r2b",
    shot: "speaker",
  },
  {
    id: "m4_r2b",
    speaker: "raquel",
    text: "Chegou uma caixa 'pra doutora'. Sem remetente. Eu sei de quem é. Eu usei.",
    condition: is(F.m2Decisao, "silencio"),
    next: "m4_r3",
    elseNext: "m4_r3",
    shot: "speaker",
  },
  { id: "m4_r3", speaker: "raquel", text: "Ela está lá fora, esperando você. Não decide por ela, Matias.", next: "m4_m4", shot: "speaker" },
  { id: "m4_m4", speaker: "matias", text: "Ela tem quinze anos.", next: "m4_r5", shot: "listener" },
  {
    id: "m4_r5",
    speaker: "raquel",
    text: "E conhece essa fila melhor que você. Vai falar com ela.",
    effects: [set(X.raquelConversou, true), obj(QUEST_PARTIDA, "raquel")],
    shot: "speaker",
  },
  { id: "m4_repete", speaker: "raquel", text: "Vai falar com a Ana. Ela está esperando.", shot: "speaker" },
  {
    id: "m4_depois",
    speaker: "raquel",
    text: "Separei as doses dela pra duas semanas. Depois disso, Nova Aurora ou nada.",
    condition: is(F.ana, "vai"),
    elseNext: "m4_depois_fica",
    shot: "speaker",
  },
  { id: "m4_depois_fica", speaker: "raquel", text: "Ela fica comigo. Eu cuido. Você volta.", shot: "speaker" },
];

const RAQUEL_CAP1_START: StartEntry[] = [
  { condition: all(M3_FEITA, has(F.ana)), node: "m4_depois" },
  { condition: all(M3_FEITA, has(X.raquelConversou)), node: "m4_repete" },
  { condition: M3_FEITA, node: "m4_inicio" },
  { condition: M2_FEITA, node: "m3_noite" },
  { condition: all(M1_FEITA, has(X.entregaConversada)), node: "m2_espera_brandao" },
  { condition: all(M1_FEITA, has(F.entregaNoPrazo)), node: "m2_entrega" },
  { condition: all(M1_FEITA, has(X.vanConferida)), node: "m2_repete" },
  { condition: M1_FEITA, node: "m2_inicio" },
];

// --- CUSTÓDIO (M2 portão · M3 toque · M4 portão) ----------------------------------------------
const CUSTODIO_CAP1: DialogueLine[] = [
  // M2 — caminho "registro": ajuda aberta
  { id: "m2_registro", speaker: "custodio", text: "Senhor Matias. O braço aguenta. O conselho recebeu o seu registro: lote existente, pela metade, origem assinada.", next: "m2_m1", shot: "speaker" },
  { id: "m2_m1", speaker: "matias", text: "E agora?", next: "m2_c2", shot: "listener" },
  { id: "m2_c2", speaker: "custodio", text: "Agora querem saber onde está a outra metade. Eu também. O depósito está aberto pro senhor conferir. Ordem minha.", next: "m2_m3", shot: "speaker" },
  { id: "m2_m3", speaker: "matias", text: "Por que me ajudar?", next: "m2_c4", shot: "listener" },
  {
    id: "m2_c4",
    speaker: "custodio",
    text: "Porque eu levei um tiro por aquele lote e alguém abriu as caixas antes de mim. Não gosto de ser feito de bobo.",
    effects: [set(X.depositoLiberado, true)],
    shot: "speaker",
  },
  // M2 — caminho "silencio": ajuda relutante
  { id: "m2_silencio", speaker: "custodio", text: "Senhor Matias. Não chega perto do depósito hoje.", next: "m2_m5", shot: "speaker" },
  { id: "m2_m5", speaker: "matias", text: "Faltam três caixas. Alguém abriu o lote antes do tiroteio.", next: "m2_c6", shot: "listener" },
  {
    id: "m2_c6",
    speaker: "custodio",
    text: "Eu disse ao conselho que o lote sumiu inteiro. Se o senhor entra ali conferindo manifesto, quem some sou eu.",
    choices: [
      { text: "Então me diz por onde eu entro sem passar por você.", next: "m2_c7a" },
      { text: "Você levou um tiro por esse lote. Quer saber quem abriu ou não quer?", next: "m2_c7b", effects: [inc("custodioQuestionado")] },
    ],
    shot: "speaker",
  },
  { id: "m2_c7a", speaker: "custodio", text: "Nos fundos tem uma grade de ventilação solta, rente ao chão. Agachado passa. Eu não vi nada.", effects: [set(X.depositoFundos, true)], shot: "speaker" },
  { id: "m2_c7b", speaker: "custodio", text: "...Quero. Grade dos fundos, rente ao chão, agachado passa. Se perguntarem, o senhor pulou o muro sozinho.", effects: [set(X.depositoFundos, true)], shot: "speaker" },
  { id: "m2_repete", speaker: "custodio", text: "O depósito está aberto. Não demore, que o turno da manhã chega às dez.", condition: has(X.depositoLiberado), elseNext: "m2_repete_fundos", shot: "speaker" },
  { id: "m2_repete_fundos", speaker: "custodio", text: "Eu não vi nada, senhor Matias. Continuo não vendo.", shot: "speaker" },
  // M3 — toque de recolher
  { id: "m3_tarde", speaker: "custodio", text: "Toque de recolher mais cedo hoje. Ordem de cima. Tranca a porta e apaga a luz, senhor Matias.", shot: "speaker" },
  { id: "m3_aviso", speaker: "custodio", text: "Toque de recolher, senhor Matias. Casa. Agora. Eu não vou pedir duas vezes.", shot: "speaker" },
  // M4 — Custódios hostis (Matias atirou em M3)
  { id: "m4_hostil", speaker: "custodio", text: "Parado aí, senhor Matias. Alguém atirou em dois dos meus ontem à noite.", next: "m4_hm1", shot: "speaker" },
  { id: "m4_hm1", speaker: "matias", text: "Eles estão vivos?", next: "m4_hc2", shot: "listener" },
  { id: "m4_hc2", speaker: "custodio", text: "Estão. Por pouco. Eu disse ao conselho que não sei quem foi. Eu sei.", next: "m4_hc3", shot: "speaker" },
  {
    id: "m4_hc3",
    speaker: "custodio",
    text: "Some da minha praça hoje. E não volte por um tempo.",
    effects: [set(X.custodioConversou, true), obj(QUEST_PARTIDA, "custodio")],
    shot: "speaker",
  },
  { id: "m4_hostil_repete", speaker: "custodio", text: "Eu disse hoje, senhor Matias. Não amanhã.", shot: "speaker" },
  // M4 — Brandão preso (registro + denúncia)
  { id: "m4_preso", speaker: "custodio", text: "O Brandão está no portão, algemado. O conselho veio buscar de Javali. O seu registro valeu alguma coisa.", next: "m4_pm1", shot: "speaker" },
  { id: "m4_pm1", speaker: "matias", text: "E a metade que faltava?", next: "m4_pc2", shot: "listener" },
  { id: "m4_pc2", speaker: "custodio", text: "Duas caixas no quartinho da casa dele. Vão pro posto hoje. A terceira já virou Selo.", next: "m4_detectado_extra", shot: "speaker" },
  // M4 — Brandão solto, Custódio transferido (silêncio + denúncia)
  { id: "m4_transferido", speaker: "custodio", text: "O senhor disse o nome dele pra meia praça. Eu disse ao conselho que o lote sumiu inteiro. Um de nós mentiu.", next: "m4_tm1", shot: "speaker" },
  { id: "m4_tm1", speaker: "matias", text: "Eu não menti.", next: "m4_tc2", shot: "listener" },
  { id: "m4_tc2", speaker: "custodio", text: "Eu sei. Por isso saio do Setor 17 no fim do mês. Transferido. E o Brandão continua no depósito.", next: "m4_detectado_extra", shot: "speaker" },
  // M4 — acordo com Brandão
  { id: "m4_lista", speaker: "custodio", text: "A lista nova saiu cedo. Sua filha em prioridade dois. Parabéns.", next: "m4_lm1", shot: "speaker" },
  { id: "m4_lm1", speaker: "matias", text: "Você não acredita em parabéns.", next: "m4_lc2", shot: "listener" },
  { id: "m4_lc2", speaker: "custodio", text: "Acredito em lista. Só não sei quem escreveu essa.", next: "m4_detectado_extra", shot: "speaker" },
  {
    id: "m4_detectado_extra",
    speaker: "custodio",
    text: "E alguém andou pela rua depois do toque. Agachado, mas andou. Eu não vi o rosto. Prefiro assim.",
    condition: is(F.detectado, true),
    next: "m4_fim",
    elseNext: "m4_fim",
    shot: "speaker",
  },
  // M4 — só detectado em M3
  { id: "m4_detectado", speaker: "custodio", text: "Alguém andou pela rua depois do toque ontem, senhor Matias. Agachado, mas andou.", next: "m4_dm1", shot: "speaker" },
  { id: "m4_dm1", speaker: "matias", text: "Alguém.", next: "m4_dc2", shot: "listener" },
  { id: "m4_dc2", speaker: "custodio", text: "Alguém. Eu não vi o rosto. Prefiro assim.", next: "m4_fim", shot: "speaker" },
  // M4 — cordial
  { id: "m4_cordial", speaker: "custodio", text: "Bom dia, senhor Matias. A Raquel disse que vocês saem hoje.", next: "m4_fim", shot: "speaker" },
  {
    id: "m4_fim",
    speaker: "custodio",
    text: "Estrada até a Nove está calma até o viaduto. Depois, não garanto. Boa viagem.",
    effects: [set(X.custodioConversou, true), obj(QUEST_PARTIDA, "custodio")],
    shot: "speaker",
  },
  { id: "m4_repete", speaker: "custodio", text: "Boa viagem, senhor Matias.", shot: "speaker" },
];

const CUSTODIO_CAP1_START: StartEntry[] = [
  { condition: all(M3_FEITA, has(X.custodioConversou), is(F.custodiosHostis, true)), node: "m4_hostil_repete" },
  { condition: all(M3_FEITA, has(X.custodioConversou)), node: "m4_repete" },
  { condition: all(M3_FEITA, is(F.custodiosHostis, true)), node: "m4_hostil" },
  { condition: all(M3_FEITA, has(X.brandaoPreso)), node: "m4_preso" },
  { condition: all(M3_FEITA, has(X.brandaoSolto)), node: "m4_transferido" },
  { condition: all(M3_FEITA, is(F.m2Decisao, "silencio")), node: "m4_lista" },
  { condition: all(M3_FEITA, is(F.detectado, true)), node: "m4_detectado" },
  { condition: M3_FEITA, node: "m4_cordial" },
  { condition: all(M2_FEITA, has(X.recadoOuvido)), node: "m3_aviso" },
  { condition: M2_FEITA, node: "m3_tarde" },
  { condition: all(M1_FEITA, any(has(X.depositoLiberado), has(X.depositoFundos))), node: "m2_repete" },
  { condition: all(M1_FEITA, is(F.carregamentoDecisao, "registro")), node: "m2_registro" },
  { condition: M1_FEITA, node: "m2_silencio" },
];

// --- COMERCIANTE (M2 testemunha e Atlas · M3 · M4 preço) --------------------------------------
const COMERCIANTE_CAP1: DialogueLine[] = [
  // M2 — antes de ter algo escrito
  { id: "m2_cedo", speaker: "comerciante", text: "Matias? Com essa cara, veio comprar ou perguntar?", next: "m2_cm1", shot: "speaker" },
  { id: "m2_cm1", speaker: "matias", text: "Perguntar. Quem vende antibiótico por fora, no mercado?", next: "m2_cc2", shot: "listener" },
  { id: "m2_cc2", speaker: "comerciante", text: "Baixa a voz. Eu não digo nome de ninguém de farda sem ter o que me segure. Traz alguma coisa escrita.", shot: "speaker" },
  // M2 — com o caderno de saída
  { id: "m2_testemunha", speaker: "comerciante", text: "Matias. Essa cara é de quem não dormiu.", next: "m2_tm1", shot: "speaker" },
  { id: "m2_tm1", speaker: "matias", text: "Quem vende antibiótico por fora, nesta banca?", next: "m2_tc2", shot: "listener" },
  { id: "m2_tc2", speaker: "comerciante", text: "Baixa a voz.", next: "m2_tm3", shot: "speaker" },
  { id: "m2_tm3", speaker: "matias", text: "Caderno de saída do depósito. Oficial de turno: Brandão. Saíram seis volumes. Chegaram três.", next: "m2_tc4", shot: "listener" },
  { id: "m2_tc4", speaker: "comerciante", text: "Brandão... Eu só conheço o Samuel. Farda cinza, sem armadura. Vem no fim da tarde num Atlas com faixa de cobre.", next: "m2_tc5", shot: "speaker" },
  {
    id: "m2_tc5",
    speaker: "comerciante",
    text: "Deixa o que 'sobrou', leva Selo. Eu revendo pra quem não tem fila: Sem Registro, Vinculado sem cota. Gente que a Apuração não vê.",
    choices: [
      { text: "Você revende remédio desviado e me fala de gente que a Apuração não vê?", next: "m2_tc6a", effects: [inc("matiasDefendeSistema")] },
      { text: "Samuel. Brandão. S.B. — a rubrica do manifesto.", next: "m2_tc6b" },
    ],
    shot: "speaker",
  },
  { id: "m2_tc6a", speaker: "comerciante", text: "Eu falo de gente. Devolver pra Central é deixar morrer quem não está em lista nenhuma. Me julga depois.", next: "m2_nome", shot: "speaker" },
  { id: "m2_tc6b", speaker: "comerciante", text: "Se é ele, não foi a primeira vez. Foi a primeira que a metade era de uma menina que eu conheço.", next: "m2_nome", shot: "speaker" },
  {
    id: "m2_nome",
    speaker: "matias",
    text: "Samuel Brandão. Oficial de saída do depósito.",
    effects: [set(F.brandaoIdentificado, true), obj(QUEST_RASTRO_DO_LOTE, "testemunha")],
    next: "m2_atlas",
    shot: "listener",
  },
  { id: "m2_atlas", speaker: "comerciante", text: "Agora me escuta. Meio-dia a Central recolhe o que sobrou. Leva o Atlas: as caixas da van cabem no caixote.", next: "m2_am1", shot: "speaker" },
  { id: "m2_am1", speaker: "matias", text: "Você empresta o triciclo pra quem acabou de te acusar?", next: "m2_ac2", shot: "listener" },
  { id: "m2_ac2", speaker: "comerciante", text: "Eu empresto pra Ana. Pedala.", effects: [set(X.atlasEmprestado, true)], shot: "speaker" },
  { id: "m2_repete", speaker: "comerciante", text: "O Atlas, Matias. Meio-dia.", shot: "speaker" },
  // M3 — fim de tarde
  { id: "m3_fechando", speaker: "comerciante", text: "Fechando a banca. Toque hoje é mais cedo. Vai pra casa, Matias.", shot: "speaker" },
  // M4 — Custódios hostis
  { id: "m4_hostis", speaker: "comerciante", text: "Baixa a cabeça. Os Custódios procuram quem atirou neles ontem. E olham pra sua oficina.", next: "m4_hostis2", shot: "speaker" },
  {
    id: "m4_hostis2",
    speaker: "comerciante",
    text: "E o meu fornecedor da tarde não vem mais. Munição e kit custam o dobro hoje.",
    condition: is(F.m2Decisao, "denuncia"),
    next: "m4_fim",
    elseNext: "m4_fim",
    shot: "speaker",
  },
  // M4 — Brandão denunciado: preço sobe
  { id: "m4_denuncia", speaker: "comerciante", text: "Matias. Meu fornecedor da tarde não vem mais. Munição e kit custam o dobro hoje.", next: "m4_dm1", shot: "speaker" },
  { id: "m4_dm1", speaker: "matias", text: "Você ganhava com ele.", next: "m4_dc2", shot: "listener" },
  {
    id: "m4_dc2",
    speaker: "comerciante",
    text: "Eu ganhava. E a fila dos sem-lista ganhava. Agora ninguém ganha. Me diz que isso é justiça.",
    choices: [
      { text: "É justiça.", next: "m4_dc3a", effects: [inc("matiasDefendeSistema")] },
      { text: "Não é. Mas é o começo.", next: "m4_dc3b", effects: [inc("matiasContestaSistema")] },
    ],
    shot: "speaker",
  },
  { id: "m4_dc3a", speaker: "comerciante", text: "Então justiça é cara.", next: "m4_fim", shot: "speaker" },
  { id: "m4_dc3b", speaker: "comerciante", text: "Começo é o que a gente mais tem por aqui.", next: "m4_fim", shot: "speaker" },
  // M4 — acordo com Brandão
  { id: "m4_acordo", speaker: "comerciante", text: "Matias. O Samuel passou cedo. Deixou uma caixa 'pra doutora', de graça. Ele nunca dá nada.", next: "m4_am1", shot: "speaker" },
  { id: "m4_am1", speaker: "matias", text: "Hoje deu.", next: "m4_ac2", shot: "listener" },
  { id: "m4_ac2", speaker: "comerciante", text: "Hoje alguém pagou por ele. Eu não pergunto quem.", next: "m4_fim", shot: "speaker" },
  { id: "m4_fim", speaker: "comerciante", text: "Leva farinha pra estrada. Dessa vez eu anoto.", effects: [set(X.comercianteConversou, true)], shot: "speaker" },
  { id: "m4_repete", speaker: "comerciante", text: "Estrada boa, Matias.", shot: "speaker" },
];

const COMERCIANTE_CAP1_START: StartEntry[] = [
  { condition: all(M3_FEITA, has(X.comercianteConversou)), node: "m4_repete" },
  { condition: all(M3_FEITA, is(F.custodiosHostis, true)), node: "m4_hostis" },
  { condition: all(M3_FEITA, is(F.m2Decisao, "denuncia")), node: "m4_denuncia" },
  { condition: M3_FEITA, node: "m4_acordo" },
  { condition: M2_FEITA, node: "m3_fechando" },
  { condition: all(M1_FEITA, has(X.atlasEmprestado)), node: "m2_repete" },
  { condition: all(M1_FEITA, is(F.brandaoIdentificado, true)), node: "m2_atlas" },
  { condition: all(M1_FEITA, is(PISTA_CADERNO, true)), node: "m2_testemunha" },
  { condition: M1_FEITA, node: "m2_cedo" },
];

// --- MIRIAM (M2 · M3 · M4 documento) -----------------------------------------------------------
const MIRIAM_CAP1: DialogueLine[] = [
  { id: "m2_dia", speaker: "miriam", text: "Hoje não tem Apuração, Matias. Sexta. O que tiver a dizer, diz lá, na frente de todos: é o único lugar que fica registrado.", shot: "speaker" },
  { id: "m2_sexta", speaker: "miriam", text: "Sexta, então. Eu vou ler a lista inteira. Inteira. E quem assinou cada linha.", shot: "speaker" },
  { id: "m2_lista", speaker: "miriam", text: "A lista de sexta já chegou pra mim. O nome da Ana subiu. Eu não perguntei por quê, e você não vai me dizer.", shot: "speaker" },
  { id: "m3_tarde", speaker: "miriam", text: "O toque de hoje foi pedido pelo depósito. Eu vi o pedido. Isso não é normal, Matias. Tranca a porta.", shot: "speaker" },
  // M4 — Matias entrega o documento
  { id: "m4_doc", speaker: "miriam", text: "Matias. Antes da fila, como eu disse.", next: "m4_dm1", shot: "speaker" },
  { id: "m4_dm1", speaker: "matias", text: "Você disse que lê o papel inteiro. Lê este.", next: "m4_dmi2", shot: "listener" },
  { id: "m4_dmi2", speaker: "miriam", text: "Cinquenta e seis. Cadeia de revisão. E a sua assinatura.", next: "m4_dmi3", shot: "speaker" },
  { id: "m4_dmi3", speaker: "miriam", text: "As outras linhas estão tarjadas. Por quem?", next: "m4_dm4", shot: "speaker" },
  { id: "m4_dm4", speaker: "matias", text: "Por quem guardou.", next: "m4_dmi5", shot: "listener" },
  { id: "m4_dmi5", speaker: "miriam", text: "Eu já vi esse cabeçalho. Documentos técnicos do Complexo, no arquivo da Central. Nenhum com a última folha.", next: "m4_dmi6", shot: "speaker" },
  {
    id: "m4_dmi6",
    speaker: "miriam",
    text: "Eu não vou denunciar você. E não vou guardar isto por você. Leva. Quando achar o resto, me procura.",
    choices: [
      { text: "Você acredita que a Mãe salvou vocês. E ainda assim quer ver o resto.", next: "m4_dmi7a" },
      { text: "Se o conselho souber que você viu isto...", next: "m4_dmi7b" },
    ],
    shot: "two",
  },
  { id: "m4_dmi7a", speaker: "miriam", text: "Acredito. E é por isso. 'A dúvida deve servir à verdade.' Está no dogma; a gente é que esquece.", next: "m4_sexta", shot: "speaker" },
  { id: "m4_dmi7b", speaker: "miriam", text: "O conselho sabe o que eu registro. Isto eu não registrei.", next: "m4_sexta", shot: "speaker" },
  // M4 — Matias guardou o documento
  { id: "m4_semdoc", speaker: "miriam", text: "Matias. Os Custódios registraram um voo não autorizado sobre a rua ontem. Eu registrei 'manutenção'.", next: "m4_sm1", shot: "speaker" },
  { id: "m4_sm1", speaker: "matias", text: "Por quê?", next: "m4_smi2", shot: "listener" },
  { id: "m4_smi2", speaker: "miriam", text: "Porque eu não sei o que foi. E o que eu não sei, eu não condeno.", next: "m4_smi3", shot: "speaker" },
  { id: "m4_smi3", speaker: "miriam", text: "O toque de ontem foi pedido pelo depósito. Eu vi o pedido: assinado por Brandão.", next: "m4_sm4", shot: "speaker" },
  { id: "m4_sm4", speaker: "matias", text: "Eu sei.", next: "m4_smi5", shot: "listener" },
  { id: "m4_smi5", speaker: "miriam", text: "Então sabe mais do que me conta. Tudo bem. Eu também.", next: "m4_sexta", shot: "speaker" },
  {
    id: "m4_sexta",
    speaker: "miriam",
    text: "Sexta eu leio a lista inteira, com ou sem vocês na praça. O nome dele incluído.",
    condition: is(F.m2Decisao, "denuncia"),
    next: "m4_fim",
    elseNext: "m4_fim",
    shot: "speaker",
  },
  {
    id: "m4_fim",
    speaker: "miriam",
    text: "Vão pra Estação Nove; a Raquel me contou. Levem água da cota do posto. Eu assino.",
    effects: [set(X.miriamConversou, true), obj(QUEST_PARTIDA, "miriam")],
    shot: "speaker",
  },
  { id: "m4_repete", speaker: "miriam", text: "Vai, Matias. A fila não espera, e eu também não devia.", shot: "speaker" },
];

const MIRIAM_CAP1_START: StartEntry[] = [
  { condition: all(M3_FEITA, has(X.miriamConversou)), node: "m4_repete" },
  { condition: all(M3_FEITA, is(F.documento, "miriam")), node: "m4_doc" },
  { condition: M3_FEITA, node: "m4_semdoc" },
  { condition: all(M2_FEITA, has(X.recadoOuvido)), node: "m3_tarde" },
  { condition: is(F.m2Decisao, "denuncia"), node: "m2_sexta" },
  { condition: is(F.m2Decisao, "silencio"), node: "m2_lista" },
  { condition: M1_FEITA, node: "m2_dia" },
];

// --- ANA (M2 posto · M3 oficina, decisão do documento · M4 decisão dela) ------------------------
const ANA_CAP1: DialogueLine[] = [
  // M2 — manhã, no posto
  { id: "m2_manha", speaker: "ana", text: "A Raquel disse que faltou metade. Gente da Igreja não faria isso, pai.", next: "m2_mm1", shot: "speaker" },
  { id: "m2_manha_b", speaker: "ana", text: "A Raquel disse que faltou metade. O senhor vai dizer que foi a Igreja. Não foi a Igreja. Foi alguém.", next: "m2_mm1", shot: "speaker" },
  { id: "m2_mm1", speaker: "matias", text: "Gente é gente, Ana. Com ou sem farda.", next: "m2_ma2", shot: "listener" },
  { id: "m2_ma2", speaker: "ana", text: "Então acha quem foi. Mas não grita na praça.", shot: "speaker" },
  { id: "m2_posto_repete", speaker: "ana", text: "Pai. Ele está olhando pra gente.", shot: "speaker" },
  // M2 — depois da decisão com Brandão
  { id: "m2_depois", speaker: "ana", text: "Sexta eu vou junto. Na frente de todo mundo, igual o senhor.", condition: is(F.m2Decisao, "denuncia"), elseNext: "m2_depois_acordo", shot: "speaker" },
  { id: "m2_depois_acordo", speaker: "ana", text: "Eu não quero falar agora, pai.", shot: "speaker" },
  // M3 — antes do toque
  { id: "m3_antes", speaker: "ana", text: "Eu vou dormir. Se o senhor sair depois do toque, eu não vi nada.", shot: "speaker" },
  // M3 — madrugada, depois do voo
  { id: "m3_inicio", speaker: "ana", text: "Pai?! A rua inteira ouviu isso. Eu ouvi isso.", effects: [obj(QUEST_A_VIGILIA, "ana")], next: "m3_m1", shot: "speaker" },
  { id: "m3_m1", speaker: "matias", text: "Fala baixo.", next: "m3_a2", shot: "listener" },
  { id: "m3_a2", speaker: "ana", text: "Eu falo baixo. O senhor pousou uma Rastro dos Custódios na nossa porta.", next: "m3_a3", shot: "speaker" },
  { id: "m3_a3", speaker: "ana", text: "Dois Custódios passaram aqui. E a Miriam, antes do toque. Ela te procurou.", next: "m3_m4", shot: "speaker" },
  { id: "m3_m4", speaker: "matias", text: "A Miriam? O que ela queria?", next: "m3_a5", shot: "listener" },
  { id: "m3_a5", speaker: "ana", text: "Disse que o toque de hoje foi pedido por alguém do depósito. Que isso não é normal. Volta de manhã, antes da fila.", next: "m3_a6", shot: "speaker" },
  {
    id: "m3_a6",
    speaker: "ana",
    text: "O que te deram lá?",
    choices: [
      { text: "Uma folha. Com a minha assinatura. De antes de você nascer.", next: "m3_a7a" },
      { text: "Nada que você precise carregar.", next: "m3_a7b" },
    ],
    shot: "two",
  },
  { id: "m3_a7a", speaker: "ana", text: "De antes da Ruptura.", next: "m3_a7a2", shot: "speaker" },
  { id: "m3_a7a2", speaker: "ana", text: "O senhor assinou o quê?", next: "m3_m8a", shot: "speaker" },
  { id: "m3_m8a", speaker: "matias", text: "Eu não sei o que aquilo fez, Ana. Eu sei que assinei.", next: "m3_a9a", shot: "listener" },
  { id: "m3_a9a", speaker: "ana", text: "Então descobre.", effects: [set(X.anaSabe, true)], next: "m3_a10", shot: "speaker" },
  { id: "m3_a7b", speaker: "ana", text: "Eu tenho quinze anos, pai. Não cinco.", effects: [set(X.anaSabe, false)], next: "m3_a10", shot: "speaker" },
  {
    id: "m3_a10",
    speaker: "ana",
    text: "A Miriam lê o papel inteiro. Se alguém vai saber o que é isso, é ela.",
    choices: [
      { text: "Amanhã eu mostro à Miriam.", next: "m3_a11a", effects: [set(F.documento, "miriam")] },
      { text: "Isso fica comigo. Ninguém vê.", next: "m3_a11b", effects: [set(F.documento, "guardou")] },
    ],
    shot: "speaker",
  },
  {
    id: "m3_a11a",
    speaker: "ana",
    text: "Tá. Eu vou junto.",
    condition: is(X.anaSabe, true),
    effects: [obj(QUEST_A_VIGILIA, "decisao")],
    elseNext: "m3_a11a2",
    shot: "speaker",
  },
  { id: "m3_a11a2", speaker: "ana", text: "Pra Miriam pode. Pra mim, não. ...Eu vou junto mesmo assim.", effects: [obj(QUEST_A_VIGILIA, "decisao")], shot: "speaker" },
  { id: "m3_a11b", speaker: "ana", text: "Ninguém. Nem eu.", next: "m3_m12b", shot: "speaker" },
  { id: "m3_m12b", speaker: "matias", text: "Por enquanto.", next: "m3_a13b", shot: "listener" },
  { id: "m3_a13b", speaker: "ana", text: "'Por enquanto' é a palavra preferida do senhor.", effects: [obj(QUEST_A_VIGILIA, "decisao")], shot: "speaker" },
  // M4 — amanhecer
  { id: "m4_antes", speaker: "ana", text: "Fala com a Raquel primeiro. Ela guardou um sermão pro senhor.", shot: "speaker" },
  { id: "m4_inicio", speaker: "ana", text: "A Raquel disse que o senhor vai pra Estação Nove.", next: "m4_m1", shot: "speaker" },
  { id: "m4_m1", speaker: "matias", text: "Hoje. Na Módulo.", next: "m4_a2", shot: "listener" },
  {
    id: "m4_a2",
    speaker: "ana",
    text: "O senhor não me perguntou.",
    choices: [
      { text: "Estou perguntando agora. Eu preciso de você comigo.", next: "m4_a3a", effects: [inc(X.anaPontos)] },
      { text: "Você vai. Não é pergunta.", next: "m4_a3b", effects: [inc(X.anaPontos, -1)] },
      { text: "Acho que você fica mais segura com a Raquel.", next: "m4_a3c" },
    ],
    shot: "two",
  },
  { id: "m4_a3a", speaker: "ana", text: "Precisa. Isso é novo.", next: "m4_lembra_m1", shot: "speaker" },
  { id: "m4_a3b", speaker: "ana", text: "Não é pergunta. Então não precisa de resposta.", next: "m4_lembra_m1", shot: "speaker" },
  { id: "m4_a3c", speaker: "ana", text: "O senhor acha. Eu decido.", next: "m4_lembra_m1", shot: "speaker" },
  // Ana recapitula o que viu; cada lembrança boa soma um ponto
  { id: "m4_lembra_m1", speaker: "ana", text: "O senhor assinou o lote na frente da Raquel. Com nome. Eu vi.", condition: is(F.carregamentoDecisao, "registro"), effects: [inc(X.anaPontos)], next: "m4_lembra_m2", elseNext: "m4_lembra_m1b", shot: "speaker" },
  { id: "m4_lembra_m1b", speaker: "ana", text: "O senhor sumiu com o lote como se fosse contrabando. Mesmo sendo pra mim.", next: "m4_lembra_m2", shot: "speaker" },
  { id: "m4_lembra_m2", speaker: "ana", text: "E não vendeu o meu nome pro Brandão.", condition: is(F.m2Decisao, "denuncia"), effects: [inc(X.anaPontos)], next: "m4_lembra_m3", elseNext: "m4_lembra_m2b", shot: "speaker" },
  { id: "m4_lembra_m2b", speaker: "ana", text: "E comprou o meu lugar na lista. Eu sei que foi por mim. Eu não pedi.", next: "m4_lembra_m3", shot: "speaker" },
  { id: "m4_lembra_m3", speaker: "ana", text: "E me contou da folha. Podia não ter contado.", condition: is(X.anaSabe, true), effects: [inc(X.anaPontos)], next: "m4_lembra_doc", elseNext: "m4_lembra_m3b", shot: "speaker" },
  { id: "m4_lembra_m3b", speaker: "ana", text: "E voltou de madrugada com um segredo que eu 'não preciso carregar'.", next: "m4_lembra_doc", shot: "speaker" },
  { id: "m4_lembra_doc", speaker: "ana", text: "E mostrou pra Miriam. Confiou em alguém, pra variar.", condition: is(F.documento, "miriam"), effects: [inc(X.anaPontos)], next: "m4_lembra_confia", elseNext: "m4_lembra_docb", shot: "speaker" },
  { id: "m4_lembra_docb", speaker: "ana", text: "E guardou o papel no bolso, como guarda tudo.", next: "m4_lembra_confia", shot: "speaker" },
  { id: "m4_lembra_confia", speaker: "ana", text: "No posto, o senhor disse pra confiar na Apuração. Eu guardei isso.", condition: is(F.matiasConfia, true), effects: [inc(X.anaPontos)], next: "m4_pergunta", elseNext: "m4_lembra_confiab", shot: "speaker" },
  { id: "m4_lembra_confiab", speaker: "ana", text: "O senhor nunca confiou em nada que não fosse o senhor mesmo.", next: "m4_pergunta", shot: "speaker" },
  { id: "m4_pergunta", speaker: "matias", text: "O que você quer, Ana?", next: "m4_decide", shot: "listener" },
  // Decisão dela: 3 ou mais pontos → vai
  {
    id: "m4_decide",
    speaker: "ana",
    text: "Eu vou.",
    condition: any(is(X.anaPontos, 3), is(X.anaPontos, 4), is(X.anaPontos, 5), is(X.anaPontos, 6)),
    next: "m4_vai2",
    elseNext: "m4_fica",
    shot: "speaker",
  },
  { id: "m4_vai2", speaker: "ana", text: "Não porque o senhor pediu. Porque eu quero ver o que o senhor assinou.", next: "m4_vai3", shot: "speaker" },
  { id: "m4_vai3", speaker: "ana", text: "E porque alguém precisa lembrar o senhor de comer.", effects: [set(F.ana, "vai"), obj(QUEST_PARTIDA, "ana")], shot: "two" },
  { id: "m4_fica", speaker: "ana", text: "Eu fico.", next: "m4_fica2", shot: "speaker" },
  { id: "m4_fica2", speaker: "ana", text: "A Raquel precisa de alguém que leia a lista inteira. E o senhor precisa de um motivo pra voltar.", next: "m4_m_fica", shot: "speaker" },
  { id: "m4_m_fica", speaker: "matias", text: "Ana—", next: "m4_fica3", shot: "listener" },
  { id: "m4_fica3", speaker: "ana", text: "Não é castigo, pai. É escolha. Minha.", effects: [set(F.ana, "fica"), obj(QUEST_PARTIDA, "ana")], shot: "two" },
  { id: "m4_depois", speaker: "ana", text: "Já guardei minhas coisas. E as suas. Vamos.", condition: is(F.ana, "vai"), elseNext: "m4_depois_fica", shot: "speaker" },
  { id: "m4_depois_fica", speaker: "ana", text: "Vai logo, pai. E volta.", shot: "speaker" },
];

const ANA_CAP1_START: StartEntry[] = [
  { condition: all(M3_FEITA, has(F.ana)), node: "m4_depois" },
  { condition: all(M3_FEITA, has(X.raquelConversou)), node: "m4_inicio" },
  { condition: M3_FEITA, node: "m4_antes" },
  { condition: all(M2_FEITA, has(X.eliasPartiu)), node: "m3_inicio" },
  { condition: all(M2_FEITA, has(X.recadoOuvido)), node: "m3_antes" },
  { condition: M2_FEITA, node: "m2_depois" },
  { condition: all(M1_FEITA, has(X.entregaConversada)), node: "m2_posto_repete" },
  { condition: all(M1_FEITA, is(F.matiasConfia, true)), node: "m2_manha" },
  { condition: M1_FEITA, node: "m2_manha_b" },
];

// --- SAMUEL BRANDÃO (novo NPC; variante de personagem a criar: ver docs/ROTEIRO_CAP1.md) -------
export const DIALOGUE_BRANDAO: DialogueGraph = {
  id: "brandao",
  start: [
    { condition: all(M3_FEITA, has(X.brandaoConversou)), node: "m4_repete" },
    { condition: all(M3_FEITA, has(X.brandaoPreso)), node: "m4_preso" },
    { condition: all(M3_FEITA, has(X.brandaoSolto)), node: "m4_solto" },
    { condition: M3_FEITA, node: "m4_repete" },
    { condition: M2_FEITA, node: "m2_repete" },
    { node: "m2_inicio" },
  ],
  lines: toLines([
    { id: "m2_inicio", speaker: "brandao", text: "Doutora. Vim conferir o inventário do posto. Rotina.", next: "m2_r1", shot: "speaker" },
    { id: "m2_r1", speaker: "raquel", text: "Rotina é a Central recolher ao meio-dia. O senhor nunca pisou aqui.", next: "m2_b2", shot: "speaker" },
    { id: "m2_b2", speaker: "brandao", text: "Nunca tinha faltado metade de um lote. O senhor é o Matias? O engenheiro.", next: "m2_m3", shot: "speaker" },
    { id: "m2_m3", speaker: "matias", text: "Samuel Brandão. Oficial de turno na noite em que seis volumes viraram três.", next: "m2_b4", shot: "listener" },
    { id: "m2_b4", speaker: "brandao", text: "Fala baixo. Tem gente nessa fila que depende mais de mim do que da Apuração.", next: "m2_m5", shot: "speaker" },
    { id: "m2_m5", speaker: "matias", text: "Depende de você vender o que é deles?", next: "m2_b6", shot: "listener" },
    { id: "m2_b6", speaker: "brandao", text: "Deles? A lista diz quem recebe. Quem não está na lista não existe. Eu vendo pra quem não existe.", next: "m2_b7", shot: "speaker" },
    { id: "m2_b7", speaker: "brandao", text: "E fico com a minha parte, sim. Minha mãe é Vinculada. 'Conforme disponibilidade.' O senhor sabe o que isso quer dizer.", next: "m2_a8", shot: "speaker" },
    { id: "m2_a8", speaker: "ana", text: "Isso não dá direito de tirar da Raquel.", next: "m2_b9", shot: "speaker" },
    { id: "m2_b9", speaker: "brandao", text: "Não dá, menina. Mas eu não vim discutir direito. Vim fazer uma proposta ao seu pai.", next: "m2_b10", shot: "speaker" },
    { id: "m2_b10", speaker: "brandao", text: "Sexta, na Apuração, eu carimbo a Ana como prioridade dois. Uma linha. Em troca, o caderno some e o senhor esquece meu nome.", next: "m2_a11", shot: "speaker" },
    { id: "m2_a11", speaker: "ana", text: "Pai. Não. Se eu subo assim, alguém desce.", next: "m2_r12", shot: "speaker" },
    {
      id: "m2_r12",
      speaker: "raquel",
      text: "Matias... é a Ana. Eu não vou te julgar.",
      choices: [
        {
          text: "Sexta eu digo o seu nome na frente de todo mundo. Leve suas testemunhas.",
          next: "m2_denuncia_b",
          effects: [set(F.m2Decisao, "denuncia"), inc("matiasDefendeSistema"), obj(QUEST_RASTRO_DO_LOTE, "brandao")],
        },
        {
          text: "Prioridade dois. E a metade que falta volta pro posto hoje.",
          next: "m2_acordo_b",
          effects: [set(F.m2Decisao, "silencio"), inc("matiasContestaSistema"), obj(QUEST_RASTRO_DO_LOTE, "brandao")],
        },
      ],
      shot: "two",
    },
    // denúncia
    {
      id: "m2_denuncia_b",
      speaker: "brandao",
      text: "Então sexta. Eu levo as minhas. O senhor leva um lote que assinou como seu — com metade sumida.",
      condition: is(F.carregamentoDecisao, "registro"),
      effects: [set(X.brandaoPreso, true)],
      next: "m2_denuncia_a",
      elseNext: "m2_denuncia_b2",
      shot: "speaker",
    },
    {
      id: "m2_denuncia_b2",
      speaker: "brandao",
      text: "Então sexta. Eu levo as minhas. O senhor leva um lote que, pro conselho, sumiu num tiroteio. Boa sorte.",
      effects: [set(X.brandaoSolto, true)],
      next: "m2_denuncia_a",
      shot: "speaker",
    },
    { id: "m2_denuncia_a", speaker: "ana", text: "Obrigada, pai.", next: "m2_denuncia_fim", shot: "speaker" },
    { id: "m2_denuncia_fim", speaker: "raquel", text: "Ele vai se mexer antes de sexta. Dorme com a porta trancada.", effects: [obj(QUEST_RASTRO_DO_LOTE, "decisao")], shot: "speaker" },
    // acordo
    { id: "m2_acordo_b", speaker: "brandao", text: "A metade virou Selo ontem mesmo. Eu devolvo uma caixa. É o que tenho.", next: "m2_acordo_a", shot: "speaker" },
    { id: "m2_acordo_a", speaker: "ana", text: "Eu não pedi isso.", next: "m2_acordo_r", shot: "speaker" },
    { id: "m2_acordo_r", speaker: "raquel", text: "Ana— ...Deixa. Ela volta.", next: "m2_acordo_b2", shot: "speaker" },
    { id: "m2_acordo_b2", speaker: "brandao", text: "Sexta a lista sai com o nome dela. Ninguém pergunta por quê. Ninguém nunca pergunta.", effects: [obj(QUEST_RASTRO_DO_LOTE, "decisao")], shot: "speaker" },
    { id: "m2_repete", speaker: "brandao", text: "Sexta, engenheiro.", condition: is(F.m2Decisao, "denuncia"), elseNext: "m2_repete_acordo", shot: "speaker" },
    { id: "m2_repete_acordo", speaker: "brandao", text: "Fica tranquilo. A lista sai.", shot: "speaker" },
    // M4 — preso, no portão da Central
    { id: "m4_preso", speaker: "brandao", text: "Senhor Matias. Veio ver?", next: "m4_pm1", shot: "speaker" },
    { id: "m4_pm1", speaker: "matias", text: "Vim ver as caixas voltarem.", next: "m4_pb2", shot: "listener" },
    { id: "m4_pb2", speaker: "brandao", text: "Duas. A terceira alimentou gente que não existe. Lembre disso quando a lista de sexta sair.", effects: [set(X.brandaoConversou, true)], shot: "speaker" },
    // M4 — solto, no depósito
    { id: "m4_solto", speaker: "brandao", text: "O senhor fez barulho e eu continuo aqui. Sabe por quê? Porque a lista precisa de alguém que a cumpra.", next: "m4_sm1", shot: "speaker" },
    { id: "m4_sm1", speaker: "matias", text: "A lista precisa de alguém que a abra.", next: "m4_sb2", shot: "listener" },
    { id: "m4_sb2", speaker: "brandao", text: "Então vá abrir. Em Nova Aurora. Aqui ela fecha ao meio-dia.", effects: [set(X.brandaoConversou, true)], shot: "speaker" },
    { id: "m4_repete", speaker: "brandao", text: "Já dissemos tudo, engenheiro.", shot: "speaker" },
  ]),
};

// --- ELIAS NOBRE (novo NPC; quadra escolar, M3) -----------------------------------------------
export const DIALOGUE_ELIAS: DialogueGraph = {
  id: "elias",
  start: [
    { condition: has(X.eliasPartiu), node: "m3_partiu" },
    { condition: is(PISTA_ASSINATURA, true), node: "m3_depois" },
    { condition: has(X.eliasEncontrado), node: "m3_espera" },
    { node: "m3_inicio" },
  ],
  lines: toLines([
    { id: "m3_inicio", speaker: "elias", text: "Agachado mesmo. Bom. Senta. A arquibancada tapa a lanterna do portão.", next: "m3_m1", shot: "speaker" },
    { id: "m3_m1", speaker: "matias", text: "Você é dos Silenciosos.", next: "m3_e2", shot: "listener" },
    { id: "m3_e2", speaker: "elias", text: "Eu sou o que carrega. Quem guarda é outro. Elias.", next: "m3_m3", shot: "speaker" },
    { id: "m3_m3", speaker: "matias", text: "Matias. Você disse que tem algo com o meu nome.", next: "m3_e4", shot: "listener" },
    { id: "m3_e4", speaker: "elias", text: "Uma folha. Só a última. Copiada de um documento de cinquenta e seis.", next: "m3_e5", shot: "speaker" },
    {
      id: "m3_e5",
      speaker: "elias",
      text: "Eu não li o resto. Não me deixam. O que está tarjado fui eu que tarjei, por ordem.",
      effects: [set(X.eliasEncontrado, true), obj(QUEST_A_VIGILIA, "elias")],
      next: "m3_e6",
      shot: "speaker",
    },
    { id: "m3_e6", speaker: "elias", text: "Está na bancada. Olha com calma. Eu vigio o portão.", shot: "speaker" },
    { id: "m3_espera", speaker: "elias", text: "A bancada, engenheiro. Eu vigio.", shot: "speaker" },
    // depois de examinar o documento (pista.assinatura_2056)
    { id: "m3_depois", speaker: "elias", text: "E então? É a sua letra?", next: "m3_m7", shot: "speaker" },
    { id: "m3_m7", speaker: "matias", text: "É a minha assinatura. E a data é de cinquenta e seis.", next: "m3_m8", shot: "listener" },
    {
      id: "m3_m8",
      speaker: "matias",
      text: "Eu sei que assinei. Eu não sei o que isso fez.",
      choices: [
        { text: "Onde está o resto do documento?", next: "m3_e9a" },
        { text: "Por que me mostrar isso agora?", next: "m3_e9b" },
      ],
      shot: "listener",
    },
    { id: "m3_e9a", speaker: "elias", text: "Com quem guarda. Estação Nove. Eles decidem quando mostrar, e pra quem. Eu só trouxe a pergunta.", next: "m3_e10", shot: "speaker" },
    {
      id: "m3_e9b",
      speaker: "elias",
      text: "Porque o senhor apareceu. Quinze anos sem nome e, numa semana, um lote registrado com a sua assinatura.",
      condition: is(F.carregamentoDecisao, "registro"),
      next: "m3_e10",
      elseNext: "m3_e9b2",
      shot: "speaker",
    },
    { id: "m3_e9b2", speaker: "elias", text: "Porque o senhor apareceu. Quinze anos sem nome e a doutora distribui um lote pela nossa rede em seu nome.", next: "m3_e10", shot: "speaker" },
    { id: "m3_e10", speaker: "elias", text: "A folha veio do acervo de uma auditora. Íris Serra. Antes de eu nascer, quase.", next: "m3_m11", shot: "speaker" },
    { id: "m3_m11", speaker: "matias", text: "Todo mundo no Complexo conhecia a Íris.", next: "m3_e12", shot: "listener" },
    { id: "m3_e12", speaker: "elias", text: "Então o senhor sabe por que ela sumiu.", next: "m3_m13", shot: "speaker" },
    { id: "m3_m13", speaker: "matias", text: "Não. Ninguém sabe.", next: "m3_e14", shot: "listener" },
    { id: "m3_e14", speaker: "elias", text: "Lanterna no portão. Eles nunca entram na quadra. Hoje entraram.", next: "m3_e15", shot: "speaker" },
    { id: "m3_e15", speaker: "elias", text: "Eu saio pelos fundos; eu sei o caminho, o senhor não. Telhado: tem uma Rastro dos Custódios na doca, em manutenção.", next: "m3_e16", shot: "speaker" },
    { id: "m3_e16", speaker: "elias", text: "É por isso que rondam a escola. Voa baixo.", next: "m3_m17", shot: "speaker" },
    { id: "m3_m17", speaker: "matias", text: "Eu nunca pilotei uma dessas.", next: "m3_e18", shot: "listener" },
    {
      id: "m3_e18",
      speaker: "elias",
      text: "O senhor ajudou a construir coisa pior. Estação Nove, engenheiro. Quando puder.",
      effects: [set(X.eliasPartiu, true)],
      shot: "speaker",
    },
    { id: "m3_partiu", speaker: "elias", text: "Vai, engenheiro. Pelo telhado.", shot: "speaker" },
  ]),
};

/** Recado de Elias pelo rádio da oficina (anoitecer do dia 2). Inicia a missão "A Vigília". */
export const DIALOGUE_RADIO_ELIAS: DialogueGraph = {
  id: "radio_elias",
  start: [{ node: "m3_e1" }],
  lines: toLines([
    { id: "m3_e1", speaker: "elias", text: "Oficina do engenheiro. Está ouvindo? Não responde. Só escuta.", next: "m3_e2", shot: "speaker" },
    {
      id: "m3_e2",
      speaker: "elias",
      text: "Quem distribuiu o lote em silêncio manda lembranças.",
      condition: is(F.carregamentoDecisao, "silencio"),
      next: "m3_e3",
      elseNext: "m3_e2b",
      shot: "speaker",
    },
    { id: "m3_e2b", speaker: "elias", text: "Quem leu o seu registro na Central manda lembranças.", next: "m3_e3", shot: "speaker" },
    { id: "m3_e3", speaker: "elias", text: "Quadra da escola. Depois do toque. Sozinho e agachado: os Custódios dobraram a ronda hoje.", next: "m3_e4", shot: "speaker" },
    { id: "m3_e4", speaker: "elias", text: "Eu tenho uma coisa com o seu nome. De antes da Ruptura.", next: "m3_m5", shot: "speaker" },
    {
      id: "m3_m5",
      speaker: "matias",
      text: "De antes da Ruptura.",
      effects: [set(X.recadoOuvido, true), startQuest(QUEST_A_VIGILIA), obj(QUEST_A_VIGILIA, "recado")],
      shot: "listener",
    },
  ]),
};

/**
 * Direção de tom por fala (chave `grafo:nó`, ou `grafo:nó:índice` para uma escolha), para o roteiro e a dublagem.
 * Só onde a intenção não é óbvia pelo texto.
 */
export const CAP1_DIRECAO: Record<string, string> = {
  "raquel:m2_inicio": "baixo, antes de a rua acordar",
  "raquel:m2_r2": "contando com o dedo; sem drama",
  "raquel:m2_r5_silencio": "aviso, não censura",
  "raquel:m2_r8": "meio sorriso cansado",
  "raquel:m2_entrega_tarde": "seca; não culpa, constata",
  "raquel:m2_entrega_fim": "voz baixa, olhando por cima do ombro de Matias",
  "raquel:m4_r3": "firme",
  "raquel:m4_depois": "prática, já separando as doses",
  "custodio:m2_registro": "braço na tipoia; formal",
  "custodio:m2_c4": "sem heroísmo; orgulho ferido",
  "custodio:m2_c6": "tenso, quase sussurrando",
  "custodio:m2_c7b": "pausa longa antes do 'quero'",
  "custodio:m3_aviso": "alto, ordem de patrulha; sem raiva",
  "custodio:m4_hostil": "frio; mão perto do coldre",
  "custodio:m4_hc3": "contido; é um favor, não uma ameaça",
  "custodio:m4_transferido": "amargo, sem levantar a voz",
  "custodio:m4_lista": "seco, irônico",
  "custodio:m4_fim": "cordial, sincero",
  "comerciante:m2_cc2": "baixo, olhando a fila",
  "comerciante:m2_tc5": "defensivo, mas não envergonhado",
  "comerciante:m2_tc6a": "firme; ele acredita no que faz",
  "comerciante:m2_ac2": "curto, virando as costas",
  "comerciante:m4_dc2": "irritado, sem gritar",
  "comerciante:m4_dc3a": "resignado",
  "miriam:m2_lista": "evitando o olhar de Matias",
  "miriam:m4_dmi2": "lendo em voz baixa; pausa antes de 'assinatura'",
  "miriam:m4_dmi5": "escolhendo as palavras",
  "miriam:m4_dmi7a": "fé serena; cita o quarto dogma sem ironia",
  "miriam:m4_smi2": "sincera",
  "ana:m2_manha": "convicta; defende a Igreja sem gritar",
  "ana:m3_inicio": "sussurro alto, assustada e furiosa",
  "ana:m3_a2": "meio riso nervoso",
  "ana:m3_a7a": "quase para si",
  "ana:m3_a9a": "simples, decidida",
  "ana:m3_a7b": "magoada, seca",
  "ana:m3_a13b": "imitando o tom do pai",
  "ana:m4_a2": "calma; é uma constatação",
  "ana:m4_a3b": "fria",
  "ana:m4_lembra_m1b": "sem acusação; só lembrando",
  "ana:m4_lembra_m2b": "baixo",
  "ana:m4_decide": "pausa longa antes; decidida",
  "ana:m4_vai3": "meio sorriso",
  "ana:m4_fica": "pausa longa antes; firme",
  "ana:m4_fica3": "carinhosa, sem chorar",
  "brandao:m2_inicio": "educado, cansado; não é vilão",
  "brandao:m2_b4": "baixo, olhando a fila",
  "brandao:m2_b7": "a única fala em que ele se exalta um pouco",
  "brandao:m2_b10": "tom de quem já fez essa proposta antes",
  "brandao:m2_denuncia_b2": "quase pena",
  "brandao:m2_acordo_b2": "sem triunfo",
  "brandao:m4_pb2": "algemado; sem arrependimento fácil, sem bravata",
  "brandao:m4_solto": "calmo, convencido do que diz",
  "elias:m3_inicio": "jovem, rápido, sussurrando",
  "elias:m3_e5": "um pouco envergonhado da tarja",
  "elias:m3_e9a": "neutro; ele é só o mensageiro",
  "elias:m3_e18": "provocação leve, sem crueldade; já saindo",
  "radio_elias:m3_e1": "pelo rádio, com estática; voz jovem e firme",
  "radio_elias:m3_e4": "pausa antes de 'De antes da Ruptura'",
  "radio_elias:m3_m5": "para si, depois do clique do rádio",
  "brandao:m2_a8": "indignada, voz jovem",
  "brandao:m2_a11": "firme; não é birra",
  "brandao:m2_acordo_a": "saindo de cena",
  "brandao:m2_r12": "baixo, quase um pedido de desculpas",
  "elias:m3_m8": "lento; é uma confissão",
  "elias:m3_m13": "seco; não quer continuar o assunto",
  "ana:m4_m_fica": "interrompido",
  "ana:m2_depois_acordo": "sem olhar para o pai",
};

/** Grafos por NPC: prólogo + Capítulo 1 (chave = variante do personagem). */
export const DIALOGUES: Record<string, DialogueGraph> = {
  comerciante: extendGraph(DIALOGUE_COMERCIANTE, { start: COMERCIANTE_CAP1_START, lines: COMERCIANTE_CAP1 }),
  raquel: extendGraph(DIALOGUE_RAQUEL, { start: RAQUEL_CAP1_START, lines: RAQUEL_CAP1 }),
  ana: extendGraph(DIALOGUE_ANA, { start: ANA_CAP1_START, lines: ANA_CAP1 }),
  miriam: extendGraph(DIALOGUE_MIRIAM, { start: MIRIAM_CAP1_START, lines: MIRIAM_CAP1 }),
  custodio: extendGraph(DIALOGUE_CUSTODIO, { start: CUSTODIO_CAP1_START, lines: CUSTODIO_CAP1 }),
  brandao: DIALOGUE_BRANDAO,
  elias: DIALOGUE_ELIAS,
};

/** Todos os grafos que contêm falas do Capítulo 1 (nós `m2_*`, `m3_*`, `m4_*`), incluindo os de rádio. */
export const CAP1_DIALOGUE_GRAPHS: DialogueGraph[] = [...Object.values(DIALOGUES), DIALOGUE_RADIO_ELIAS];

/** Um nó pertence ao Capítulo 1 quando seu id começa por `m2_`, `m3_` ou `m4_`. */
export const isCap1Node = (lineId: string): boolean => /^m[234]_/.test(lineId);

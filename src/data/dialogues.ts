import type { DialogueGraph } from "@/narrative/dialogue";
import { QUEST_APURACAO } from "./quests";

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
    { condition: { flag: "apuracao.postura", is: "confronto" }, node: "aviso" },
    { condition: { flag: "custodio.conversou", is: true }, node: "repete" },
    { node: "inicio" },
  ],
  lines: {
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

export const DIALOGUES: Record<string, DialogueGraph> = {
  comerciante: DIALOGUE_COMERCIANTE,
  raquel: DIALOGUE_RAQUEL,
  ana: DIALOGUE_ANA,
  miriam: DIALOGUE_MIRIAM,
  custodio: DIALOGUE_CUSTODIO,
};

import type { QuestDef } from "@/narrative/quests";
import { QUEST_A_VIGILIA, QUEST_PARTIDA, QUEST_RASTRO_DO_LOTE } from "./cap1Contracts";

export const QUEST_APURACAO = "a_apuracao";
export const QUEST_CARREGAMENTO = "o_carregamento";
export { QUEST_A_VIGILIA, QUEST_PARTIDA, QUEST_RASTRO_DO_LOTE };

export const QUESTS: QuestDef[] = [
  {
    id: QUEST_APURACAO,
    title: "A Apuração",
    description: "O Setor 17 apresenta registros para a Apuração das quinze horas. Ana precisa de prioridade para o tratamento.",
    objectives: [
      { id: "cartao", text: "Pegue o cartão de registro na mesa da oficina", hint: "Mesa junto à porta" },
      { id: "praca", text: "Vá até a praça do Setor 17", hint: "Fim da rua, a leste" },
      { id: "raquel", text: "Encontre Raquel e Ana perto da fila", hint: "Praça" },
      { id: "miriam", text: "Apresente o registro a Miriam no posto de distribuição", hint: "Balcão sob a cobertura" },
      { id: "desfecho", text: "Decida o que fazer com o que ouviu de Miriam", hint: "Fale com o Custódio no portão" },
    ],
  },
  {
    id: QUEST_CARREGAMENTO,
    title: "O Carregamento",
    description: "O lote que não está nas cotas de ninguém vai sair da Central ao anoitecer. Alguém mais sabe disso.",
    objectives: [
      { id: "portao", text: "Volte ao portão da Central ao anoitecer", hint: "Norte da praça, junto à van" },
      { id: "defender", text: "Defenda o carregamento dos desviadores", hint: "Botão direito mira · esquerdo atira · R recarrega" },
      { id: "segunda_leva", text: "Aguente a segunda leva", hint: "Use os caixotes e a van como cobertura" },
      { id: "van", text: "Entre na van Módulo V-7 com o carregamento", hint: "E junto à porta do motorista" },
      { id: "oficina", text: "Leve a van até a oficina de Matias", hint: "Fim da rua, a oeste" },
      { id: "trancar", text: "Desça e tranque o carregamento na oficina", hint: "Porta da oficina" },
      { id: "decisao", text: "Decida o destino do lote", hint: "Raquel chama pelo rádio" },
    ],
  },
  // ---------------------------------------------------------------------------------------
  // Capítulo 1 — "Setor 17" (roteiro: docs/ROTEIRO_CAP1.md · contratos: src/data/cap1Contracts.ts)
  // ---------------------------------------------------------------------------------------
  {
    id: QUEST_RASTRO_DO_LOTE,
    title: "Rastro do Lote",
    description: "A van saiu da Central com metade do lote. O manifesto tem um selo que não bate. Alguém abriu as caixas antes do tiroteio.",
    objectives: [
      { id: "manifesto", text: "Confira a van com Raquel e examine o manifesto e os lacres", hint: "Van Módulo V-7 diante da oficina" },
      { id: "deposito", text: "Entre no depósito da zona de distribuição", hint: "Fale com o Custódio no portão ou procure outra entrada" },
      { id: "pistas", text: "Examine o depósito: caixas vazias e caderno de saída", hint: "Fundos do depósito, atrás dos sacos de farinha" },
      { id: "testemunha", text: "Pergunte ao comerciante quem vende remédio por fora", hint: "Banca do mercado · leve o que encontrou no depósito" },
      { id: "entrega", text: "Leve as caixas da van ao posto antes de a Central recolher", hint: "Atlas T-3 junto à banca · meio-dia" },
      { id: "brandao", text: "Encare Samuel Brandão no posto", hint: "Posto médico" },
      { id: "decisao", text: "Decida: denunciar Brandão na Apuração ou aceitar o acordo", hint: "Ana e Raquel estão ouvindo" },
    ],
  },
  {
    id: QUEST_A_VIGILIA,
    title: "A Vigília",
    description: "Um recado no rádio da oficina: encontro na quadra escolar, depois do toque de recolher. Alguém tem algo com o nome de Matias, de antes da Ruptura.",
    objectives: [
      { id: "recado", text: "Ouça o recado no rádio da oficina", hint: "Rádio da oficina, ao anoitecer" },
      { id: "toque", text: "Saia depois do toque de recolher sem ser visto", hint: "Agachado faz ruído a 4 m · correndo, a 15 m" },
      { id: "quadra", text: "Chegue à quadra escolar", hint: "Dois quarteirões ao sul · evite as lanternas" },
      { id: "elias", text: "Encontre Elias Nobre", hint: "Arquibancada da quadra" },
      { id: "documento", text: "Examine o documento de 2056", hint: "Bancada sob o alpendre" },
      { id: "telhado", text: "Suba ao telhado da escola e chegue à Rastro", hint: "Escada de serviço nos fundos" },
      { id: "voo", text: "Voe baixo até a oficina", hint: "Sobre os telhados · lanternas no chão" },
      { id: "ana", text: "Fale com Ana na oficina", hint: "Oficina" },
      { id: "decisao", text: "Decida o destino do documento", hint: "Ana espera uma resposta" },
    ],
  },
  {
    id: QUEST_PARTIDA,
    title: "Partida",
    description: "Amanhece no Setor 17. O bairro carrega as escolhas dos últimos dois dias. A Estação Nove fica depois do viaduto; Ana decide se vai.",
    objectives: [
      { id: "amanhecer", text: "Saia para a rua e veja o Setor 17 ao amanhecer", hint: "Rua da oficina" },
      { id: "miriam", text: "Fale com Miriam", hint: "Diante da oficina" },
      { id: "custodio", text: "Passe pelo portão da Central", hint: "Norte da praça" },
      { id: "raquel", text: "Fale com Raquel no posto", hint: "Posto médico" },
      { id: "ana", text: "Converse com Ana sobre a viagem", hint: "Praça, junto ao posto" },
      { id: "partida", text: "Entre na Módulo V-7 e deixe o Setor 17", hint: "Van diante da oficina · rumo à Estação Nove" },
    ],
  },
];

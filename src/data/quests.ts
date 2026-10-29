import type { QuestDef } from "@/narrative/quests";

export const QUEST_APURACAO = "a_apuracao";
export const QUEST_CARREGAMENTO = "o_carregamento";

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
];

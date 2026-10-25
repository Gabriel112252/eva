import type { QuestDef } from "@/narrative/quests";

export const QUEST_APURACAO = "a_apuracao";

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
      { id: "desfecho", text: "Decida o que fazer com o que ouviu de Miriam", hint: "Continua na próxima etapa" },
    ],
  },
];

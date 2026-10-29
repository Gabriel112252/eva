import type { ClueDef } from "./cap1Contracts";

/**
 * Pistas do diário de Matias. O texto definitivo é do agente de Enredo; estas duas entradas existem só
 * para o sistema (`src/narrative/clues.ts`) ter dados de exemplo e para os testes automatizados.
 */
export const CLUES: ClueDef[] = [
  // placeholder: o Enredo substitui
  {
    id: "pista.manifesto_selo",
    title: "Selo que não bate",
    text: "O manifesto da van traz um selo de cota que não existe na lista do Setor 17. Alguém carimbou por fora do registro.",
    source: "Manifesto da van — depósito da distribuição",
    quest: "rastro_do_lote",
  },
  // placeholder: o Enredo substitui
  {
    id: "pista.caixa_vazia",
    title: "Caixa vazia com lacre rompido",
    text: "Lacre cortado com cuidado e refeito com fita. Quem fez isso sabia que ninguém ia conferir duas vezes.",
    source: "Caixa vazia — depósito da distribuição",
    quest: "rastro_do_lote",
  },
];

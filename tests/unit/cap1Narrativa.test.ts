import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DialogueRunner, type DialogueChoice, type DialogueGraph, type DialogueLine, type DialoguePresenter } from "@/narrative/dialogue";
import { GameFlags, type Condition } from "@/narrative/flags";
import { QuestLog } from "@/narrative/quests";
import { CAP1_FLAGS, QUEST_A_VIGILIA, QUEST_PARTIDA, QUEST_RASTRO_DO_LOTE } from "@/data/cap1Contracts";
import {
  CAP1_AUX_FLAGS,
  CAP1_DIALOGUE_GRAPHS,
  CAP1_DIRECAO,
  DIALOGUE_ANA,
  DIALOGUE_COMERCIANTE,
  DIALOGUE_CUSTODIO,
  DIALOGUE_MIRIAM,
  DIALOGUE_RADIO_ELIAS,
  DIALOGUE_RADIO_FINAL,
  DIALOGUE_RAQUEL,
  DIALOGUES,
  SPEAKER_NAMES,
  isCap1Node,
} from "@/data/dialogues";
import { QUESTS } from "@/data/quests";
import { CLUES, CLUE_IDS } from "@/data/clues";
import { CAP1_DECISIONS, CONSEQUENCES } from "@/data/consequences";

const F = CAP1_FLAGS;
const X = CAP1_AUX_FLAGS;
const ROTEIRO = readFileSync(fileURLToPath(new URL("../../docs/ROTEIRO_CAP1.md", import.meta.url)), "utf8");

// --- utilidades -----------------------------------------------------------------------------

function startEntries(graph: DialogueGraph): Array<{ condition?: Condition; node: string }> {
  return typeof graph.start === "string" ? [{ node: graph.start }] : graph.start;
}

function flagsInCondition(c: Condition | undefined, out: Set<string>): void {
  if (!c) return;
  if ("all" in c) return c.all.forEach((x) => flagsInCondition(x, out));
  if ("any" in c) return c.any.forEach((x) => flagsInCondition(x, out));
  out.add(c.flag);
}

function flagsInLine(line: DialogueLine, out: Set<string>): void {
  flagsInCondition(line.condition, out);
  for (const e of line.effects ?? []) if (e.type === "setFlag" || e.type === "increment") out.add(e.key);
  for (const c of line.choices ?? []) {
    flagsInCondition(c.condition, out);
    for (const e of c.effects ?? []) if (e.type === "setFlag" || e.type === "increment") out.add(e.key);
  }
}

const PROLOGUE_GRAPHS = [DIALOGUE_COMERCIANTE, DIALOGUE_RAQUEL, DIALOGUE_ANA, DIALOGUE_MIRIAM, DIALOGUE_CUSTODIO, DIALOGUE_RADIO_FINAL];
const PROLOGUE_FLAGS = new Set<string>();
for (const g of PROLOGUE_GRAPHS) {
  for (const s of startEntries(g)) flagsInCondition(s.condition, PROLOGUE_FLAGS);
  for (const l of Object.values(g.lines)) flagsInLine(l, PROLOGUE_FLAGS);
}

const ALLOWED_FLAGS = new Set<string>([...Object.values(F), ...Object.values(X), ...PROLOGUE_FLAGS, ...CLUE_IDS]);

const cap1Lines = (graph: DialogueGraph): DialogueLine[] => Object.values(graph.lines).filter((l) => isCap1Node(l.id));

function presenter(pick: (choices: DialogueChoice[]) => number): DialoguePresenter & { seen: string[] } {
  const seen: string[] = [];
  return {
    seen,
    async showLine(line, speakerName) {
      seen.push(`${speakerName}: ${line.text}`);
    },
    async showChoices(choices) {
      return pick(choices);
    },
    end() {
      /* noop */
    },
  };
}

async function run(graph: DialogueGraph, flags: GameFlags, pick: (choices: DialogueChoice[]) => number = () => 0) {
  const runner = new DialogueRunner(flags, SPEAKER_NAMES);
  const effects: string[] = [];
  runner.onEffect.on((e) => effects.push(e.type === "questObjective" ? `${e.quest}:${e.objective}` : e.type === "startQuest" ? `start:${e.quest}` : e.type));
  const p = presenter(pick);
  await runner.run(graph, p);
  return { seen: p.seen, effects, runner };
}

const CAP1_QUEST_IDS = [QUEST_RASTRO_DO_LOTE, QUEST_A_VIGILIA, QUEST_PARTIDA];
/** Objetivos completados pelo Gameplay (gatilhos de zona/examinar/timer/veículo), não por diálogo. Ver ROTEIRO_CAP1.md. */
const GAMEPLAY_OBJECTIVES: Record<string, string[]> = {
  [QUEST_RASTRO_DO_LOTE]: ["manifesto", "deposito", "pistas", "entrega"],
  [QUEST_A_VIGILIA]: ["toque", "quadra", "documento", "telhado", "voo"],
  [QUEST_PARTIDA]: ["amanhecer", "partida"],
};

// --- estrutura dos grafos --------------------------------------------------------------------

describe("Capítulo 1 — grafos de diálogo", () => {
  it("todo nó referenciado existe (start, next, elseNext, escolhas)", () => {
    for (const graph of CAP1_DIALOGUE_GRAPHS) {
      for (const s of startEntries(graph)) expect(graph.lines[s.node], `${graph.id}: start → ${s.node}`).toBeDefined();
      for (const line of Object.values(graph.lines)) {
        expect(line.id in graph.lines && graph.lines[line.id] === line, `${graph.id}:${line.id} chave ≠ id`).toBe(true);
        if (line.next) expect(graph.lines[line.next], `${graph.id}:${line.id} → ${line.next}`).toBeDefined();
        if (line.elseNext) expect(graph.lines[line.elseNext], `${graph.id}:${line.id} else→ ${line.elseNext}`).toBeDefined();
        for (const c of line.choices ?? []) if (c.next) expect(graph.lines[c.next], `${graph.id}:${line.id} escolha "${c.text}" → ${c.next}`).toBeDefined();
      }
    }
  });

  it("nenhum nó órfão: todo nó é alcançável a partir de alguma entrada de start", () => {
    for (const graph of CAP1_DIALOGUE_GRAPHS) {
      const reached = new Set<string>();
      const queue = startEntries(graph).map((s) => s.node);
      while (queue.length) {
        const id = queue.pop()!;
        if (reached.has(id)) continue;
        reached.add(id);
        const line = graph.lines[id];
        if (!line) continue;
        if (line.next) queue.push(line.next);
        if (line.elseNext) queue.push(line.elseNext);
        for (const c of line.choices ?? []) if (c.next) queue.push(c.next);
      }
      const orphans = Object.keys(graph.lines).filter((id) => !reached.has(id));
      expect(orphans, `${graph.id}: nós órfãos`).toEqual([]);
    }
  });

  it("os grafos do prólogo continuam intactos dentro dos grafos estendidos", () => {
    for (const base of [DIALOGUE_COMERCIANTE, DIALOGUE_RAQUEL, DIALOGUE_ANA, DIALOGUE_MIRIAM, DIALOGUE_CUSTODIO]) {
      const merged = DIALOGUES[base.id]!;
      for (const [id, line] of Object.entries(base.lines)) expect(merged.lines[id], `${base.id}:${id}`).toBe(line);
      const baseStart = startEntries(base);
      const mergedStart = startEntries(merged);
      expect(mergedStart.slice(mergedStart.length - baseStart.length)).toEqual(baseStart);
    }
  });

  it("toda flag usada está em CAP1_FLAGS, no prólogo, em CAP1_AUX_FLAGS ou é uma pista existente", () => {
    const used = new Set<string>();
    for (const graph of CAP1_DIALOGUE_GRAPHS) {
      for (const s of startEntries(graph)) flagsInCondition(s.condition, used);
      for (const line of cap1Lines(graph)) flagsInLine(line, used);
    }
    const unknown = [...used].filter((f) => !ALLOWED_FLAGS.has(f));
    expect(unknown).toEqual([]);
    // decisões (valores em string) só podem ser gravadas em flags do contrato
    const decisionFlags = new Set<string>(Object.values(F));
    for (const graph of CAP1_DIALOGUE_GRAPHS) {
      for (const line of cap1Lines(graph)) {
        const effects = [...(line.effects ?? []), ...(line.choices ?? []).flatMap((c) => c.effects ?? [])];
        for (const e of effects) {
          if (e.type === "setFlag" && typeof e.value === "string") expect(decisionFlags.has(e.key), `${graph.id}:${line.id} grava "${e.value}" em ${e.key}`).toBe(true);
        }
      }
    }
  });

  it("toda pista referenciada existe em clues.ts; ids e missões válidos; mínimo de 6 pistas em M2+M3", () => {
    const used = new Set<string>();
    for (const graph of CAP1_DIALOGUE_GRAPHS) {
      for (const s of startEntries(graph)) flagsInCondition(s.condition, used);
      for (const line of cap1Lines(graph)) flagsInLine(line, used);
    }
    for (const rule of CONSEQUENCES) used.add(rule.flag);
    for (const f of used) if (f.startsWith("pista.") && f !== "pista.carregamento") expect(CLUE_IDS.has(f), `pista ${f}`).toBe(true);
    const validQuests = new Set([...CAP1_QUEST_IDS, "o_carregamento"]);
    const ids = new Set<string>();
    for (const clue of CLUES) {
      expect(clue.id).toMatch(/^pista\.[a-z0-9_]+$/);
      expect(ids.has(clue.id), `pista duplicada ${clue.id}`).toBe(false);
      ids.add(clue.id);
      expect(validQuests.has(clue.quest), `${clue.id} missão ${clue.quest}`).toBe(true);
      expect(clue.text.length).toBeGreaterThan(20);
      expect(clue.title.length).toBeGreaterThan(3);
      expect(clue.source.length).toBeGreaterThan(3);
    }
    expect(CLUES.filter((c) => c.quest === QUEST_RASTRO_DO_LOTE || c.quest === QUEST_A_VIGILIA).length).toBeGreaterThanOrEqual(6);
    // as três pistas que montam o nome "Samuel Brandão"
    for (const id of ["pista.manifesto_rasurado", "pista.caderno_de_saida", "pista.testemunha_samuel"]) expect(CLUE_IDS.has(id)).toBe(true);
  });

  it("todo objetivo e missão referenciados existem; nenhum objetivo fica sem forma de ser concluído", () => {
    const byId = new Map(QUESTS.map((q) => [q.id, q]));
    const completedByDialogue = new Set<string>();
    for (const graph of CAP1_DIALOGUE_GRAPHS) {
      for (const line of Object.values(graph.lines)) {
        const effects = [...(line.effects ?? []), ...(line.choices ?? []).flatMap((c) => c.effects ?? [])];
        for (const e of effects) {
          if (e.type === "questObjective") {
            const q = byId.get(e.quest);
            expect(q, `${graph.id}:${line.id} missão ${e.quest}`).toBeDefined();
            expect(q!.objectives.some((o) => o.id === e.objective), `${graph.id}:${line.id} objetivo ${e.quest}/${e.objective}`).toBe(true);
            completedByDialogue.add(`${e.quest}/${e.objective}`);
          }
          if (e.type === "startQuest" || e.type === "completeQuest") expect(byId.has(e.quest), `${graph.id}:${line.id} missão ${e.quest}`).toBe(true);
        }
      }
    }
    for (const questId of CAP1_QUEST_IDS) {
      const q = byId.get(questId)!;
      expect(q).toBeDefined();
      for (const o of q.objectives) {
        expect(o.id).toMatch(/^[a-z_]+$/);
        const covered = completedByDialogue.has(`${questId}/${o.id}`) || GAMEPLAY_OBJECTIVES[questId]!.includes(o.id);
        expect(covered, `${questId}/${o.id} sem diálogo nem gatilho de gameplay`).toBe(true);
      }
      for (const g of GAMEPLAY_OBJECTIVES[questId]!) expect(q.objectives.some((o) => o.id === g), `${questId}/${g} listado como gameplay mas inexistente`).toBe(true);
    }
    // as três missões do capítulo podem ser concluídas pelo QuestLog
    const log = new QuestLog(QUESTS);
    for (const questId of CAP1_QUEST_IDS) {
      log.start(questId);
      for (const o of byId.get(questId)!.objectives) log.completeObjective(questId, o.id);
      expect(log.get(questId)?.state.status).toBe("completed");
    }
  });

  it("falas do capítulo têm no máximo 140 caracteres e falantes conhecidos", () => {
    let count = 0;
    for (const graph of CAP1_DIALOGUE_GRAPHS) {
      for (const line of cap1Lines(graph)) {
        count++;
        expect(SPEAKER_NAMES[line.speaker], `${graph.id}:${line.id} falante ${line.speaker}`).toBeDefined();
        expect(line.text.length, `${graph.id}:${line.id} (${line.text.length}): ${line.text}`).toBeLessThanOrEqual(140);
        expect(line.text.trim().length).toBeGreaterThan(1);
        for (const c of line.choices ?? []) expect(c.text.length, `${graph.id}:${line.id} escolha: ${c.text}`).toBeLessThanOrEqual(140);
      }
    }
    expect(count).toBeGreaterThan(150);
  });

  it("toda direção de tom aponta para um nó existente", () => {
    const graphs = new Map(CAP1_DIALOGUE_GRAPHS.map((g) => [g.id, g]));
    for (const key of Object.keys(CAP1_DIRECAO)) {
      const [graphId, nodeId] = key.split(":");
      expect(graphs.get(graphId!)?.lines[nodeId!], `direção ${key}`).toBeDefined();
    }
  });

  it("o roteiro (docs/ROTEIRO_CAP1.md) contém todas as falas e escolhas do capítulo, literalmente", () => {
    const missing: string[] = [];
    for (const graph of CAP1_DIALOGUE_GRAPHS) {
      for (const line of cap1Lines(graph)) {
        if (!ROTEIRO.includes(line.text)) missing.push(`${graph.id}:${line.id}`);
        for (const c of line.choices ?? []) if (!ROTEIRO.includes(c.text)) missing.push(`${graph.id}:${line.id} escolha "${c.text}"`);
      }
    }
    expect(missing).toEqual([]);
    for (const id of ["[M2-001]", "[M3-001]", "[M4-001]"]) expect(ROTEIRO).toContain(id);
  });
});

// --- consequências ---------------------------------------------------------------------------

describe("Capítulo 1 — tabela de consequências", () => {
  it("cada decisão do GDD tem ao menos uma regra para cada valor possível", () => {
    for (const d of CAP1_DECISIONS) {
      for (const v of d.values) expect(CONSEQUENCES.some((r) => r.flag === d.flag && r.equals === v), `${d.flag} = ${String(v)}`).toBe(true);
    }
    // cobre fila da água, estoque, preço, patrulha, falas, presença e avisos
    const kinds = new Set(CONSEQUENCES.flatMap((r) => r.effects.map((e) => e.kind)));
    for (const k of ["agua", "estoque_raquel", "preco_banca", "patrulha", "fala", "presenca", "aviso"]) expect(kinds.has(k as never), k).toBe(true);
  });

  it("regras válidas: missão, flags, NPCs e nós de fala existentes", () => {
    const presentSpeakers = new Set(Object.keys(SPEAKER_NAMES));
    for (const rule of CONSEQUENCES) {
      expect(CAP1_QUEST_IDS.includes(rule.quest), `missão ${rule.quest}`).toBe(true);
      expect(ALLOWED_FLAGS.has(rule.flag), `flag ${rule.flag}`).toBe(true);
      expect(rule.effects.length).toBeGreaterThan(0);
      for (const e of rule.effects) {
        if (e.kind === "fala") {
          const graph = DIALOGUES[e.npc];
          expect(graph, `fala: NPC ${e.npc}`).toBeDefined();
          expect(graph!.lines[e.set], `fala: ${e.npc}:${e.set}`).toBeDefined();
        }
        if (e.kind === "presenca") expect(presentSpeakers.has(e.npc), `presenca: ${e.npc}`).toBe(true);
        if (e.kind === "agua") expect(Math.abs(e.delta)).toBeLessThanOrEqual(100);
        if (e.kind === "estoque_raquel") expect(Math.abs(e.delta)).toBeLessThanOrEqual(6);
        if (e.kind === "preco_banca") expect(e.fator).toBeGreaterThan(0);
        if (e.kind === "aviso") expect(e.texto.length).toBeLessThanOrEqual(140);
      }
    }
  });

  it("Brandão só aparece em M4 por regra explícita e cada destino define o nó do Custódio", () => {
    const m4 = CONSEQUENCES.filter((r) => r.quest === QUEST_PARTIDA);
    const presenca = m4.flatMap((r) => r.effects.filter((e) => e.kind === "presenca" && e.npc === "brandao"));
    expect(presenca.length).toBeGreaterThanOrEqual(2);
    expect(m4.some((r) => r.flag === X.brandaoPreso && r.effects.some((e) => e.kind === "fala" && e.npc === "custodio" && e.set === "m4_preso"))).toBe(true);
    expect(m4.some((r) => r.flag === X.brandaoSolto && r.effects.some((e) => e.kind === "fala" && e.npc === "custodio" && e.set === "m4_transferido"))).toBe(true);
  });
});

// --- execução ---------------------------------------------------------------------------------

describe("Capítulo 1 — execução dos diálogos", () => {
  it("sem flags do capítulo, os NPCs ainda começam pelo prólogo", async () => {
    const flags = new GameFlags();
    const runner = new DialogueRunner(flags, SPEAKER_NAMES);
    expect(runner.resolveStart(DIALOGUES.raquel!)).toBe("inicio");
    expect(runner.resolveStart(DIALOGUES.custodio!)).toBe("inicio");
    expect(runner.resolveStart(DIALOGUES.miriam!)).toBe("semCartao");
    flags.set("carregamento.fuga", true);
    expect(runner.resolveStart(DIALOGUES.custodio!)).toBe("fuga_repete");
  });

  it("M2: Raquel abre a missão e o caminho muda com a decisão de M1", async () => {
    for (const [decisao, trecho] of [
      ["registro", "Você assinou de onde veio"],
      ["silencio", "ele cai junto"],
    ] as const) {
      const flags = new GameFlags();
      flags.set(F.carregamentoDecisao, decisao);
      const { seen, effects } = await run(DIALOGUES.raquel!, flags, () => 1);
      expect(seen[0]).toContain("Abre a van");
      expect(seen.some((s) => s.includes(trecho))).toBe(true);
      expect(effects).toContain(`start:${QUEST_RASTRO_DO_LOTE}`);
      expect(flags.getBool(X.vanConferida)).toBe(true);
      const runner = new DialogueRunner(flags, SPEAKER_NAMES);
      expect(runner.resolveStart(DIALOGUES.raquel!)).toBe("m2_repete");
    }
  });

  it("M2: o Custódio ajuda aberto (registro) ou indica a grade dos fundos (silêncio)", async () => {
    const aberto = new GameFlags();
    aberto.set(F.carregamentoDecisao, "registro");
    await run(DIALOGUES.custodio!, aberto);
    expect(aberto.getBool(X.depositoLiberado)).toBe(true);
    const fundos = new GameFlags();
    fundos.set(F.carregamentoDecisao, "silencio");
    const r = await run(DIALOGUES.custodio!, fundos, () => 1);
    expect(fundos.getBool(X.depositoFundos)).toBe(true);
    expect(r.seen.some((s) => s.includes("Grade dos fundos"))).toBe(true);
  });

  it("M2: o comerciante só testemunha com o caderno de saída e então o nome é montado", async () => {
    const flags = new GameFlags();
    flags.set(F.carregamentoDecisao, "registro");
    const cedo = await run(DIALOGUES.comerciante!, flags);
    expect(cedo.seen.at(-1)).toContain("Traz alguma coisa escrita");
    expect(flags.getBool(F.brandaoIdentificado)).toBe(false);
    flags.set("pista.caderno_de_saida", true);
    const dep = await run(DIALOGUES.comerciante!, flags, () => 1);
    expect(dep.seen).toContain("Matias: Samuel Brandão. Oficial de saída do depósito.");
    expect(flags.getBool(F.brandaoIdentificado)).toBe(true);
    expect(flags.getBool(X.atlasEmprestado)).toBe(true);
    expect(dep.effects).toContain(`${QUEST_RASTRO_DO_LOTE}:testemunha`);
  });

  it("M2: a decisão com Brandão grava cap1.m2.decisao e deriva o destino dele a partir de M1", async () => {
    const casos = [
      { m1: "registro", escolha: 0, decisao: "denuncia", preso: true, solto: false },
      { m1: "silencio", escolha: 0, decisao: "denuncia", preso: false, solto: true },
      { m1: "registro", escolha: 1, decisao: "silencio", preso: false, solto: false },
    ] as const;
    for (const c of casos) {
      const flags = new GameFlags();
      flags.set(F.carregamentoDecisao, c.m1);
      flags.set(X.entregaConversada, true);
      const { seen, effects } = await run(DIALOGUES.brandao!, flags, () => c.escolha);
      expect(seen[0]).toContain("inventário do posto");
      expect(seen).toContain("Ana: Pai. Não. Se eu subo assim, alguém desce.");
      expect(flags.get(F.m2Decisao)).toBe(c.decisao);
      expect(flags.getBool(X.brandaoPreso)).toBe(c.preso);
      expect(flags.getBool(X.brandaoSolto)).toBe(c.solto);
      expect(effects).toContain(`${QUEST_RASTRO_DO_LOTE}:decisao`);
    }
  });

  it("M3: o recado do rádio varia com M1, inicia a missão e Elias conduz ao documento e à Rastro", async () => {
    const flags = new GameFlags();
    flags.set(F.carregamentoDecisao, "silencio");
    flags.set(F.m2Decisao, "denuncia");
    const radio = await run(DIALOGUE_RADIO_ELIAS, flags);
    expect(radio.seen.some((s) => s.includes("em silêncio manda lembranças"))).toBe(true);
    expect(radio.effects).toContain(`start:${QUEST_A_VIGILIA}`);
    expect(flags.getBool(X.recadoOuvido)).toBe(true);
    const encontro = await run(DIALOGUES.elias!, flags);
    expect(encontro.seen[0]).toContain("Agachado mesmo");
    expect(flags.getBool(X.eliasEncontrado)).toBe(true);
    expect(encontro.effects).toContain(`${QUEST_A_VIGILIA}:elias`);
    flags.set("pista.assinatura_2056", true);
    const depois = await run(DIALOGUES.elias!, flags, () => 1);
    expect(depois.seen[0]).toContain("É a sua letra?");
    expect(depois.seen.some((s) => s.includes("pela nossa rede"))).toBe(true);
    expect(depois.seen.some((s) => s.includes("Íris Serra"))).toBe(true);
    expect(depois.seen).toContain("Matias: Não. Ninguém sabe.");
    expect(flags.getBool(X.eliasPartiu)).toBe(true);
  });

  it("M3: Ana registra se soube da folha e a decisão do documento", async () => {
    for (const [conta, destino, esperado] of [
      [0, 0, "miriam"],
      [1, 1, "guardou"],
    ] as const) {
      const flags = new GameFlags();
      flags.set(F.carregamentoDecisao, "registro");
      flags.set(F.m2Decisao, "denuncia");
      flags.set(X.eliasPartiu, true);
      let n = 0;
      const { effects } = await run(DIALOGUES.ana!, flags, () => (n++ === 0 ? conta : destino));
      expect(flags.get(X.anaSabe)).toBe(conta === 0);
      expect(flags.get(F.documento)).toBe(esperado);
      expect(effects).toContain(`${QUEST_A_VIGILIA}:ana`);
      expect(effects).toContain(`${QUEST_A_VIGILIA}:decisao`);
    }
  });

  it("M4: Miriam reage ao documento entregue ou guardado", async () => {
    const entregue = new GameFlags();
    entregue.set(F.carregamentoDecisao, "registro");
    entregue.set(F.m2Decisao, "denuncia");
    entregue.set(F.documento, "miriam");
    const a = await run(DIALOGUES.miriam!, entregue);
    expect(a.seen.some((s) => s.includes("Cinquenta e seis"))).toBe(true);
    expect(a.seen.some((s) => s.includes("dúvida deve servir à verdade"))).toBe(true);
    expect(a.effects).toContain(`${QUEST_PARTIDA}:miriam`);
    const guardado = new GameFlags();
    guardado.set(F.carregamentoDecisao, "registro");
    guardado.set(F.m2Decisao, "denuncia");
    guardado.set(F.documento, "guardou");
    const b = await run(DIALOGUES.miriam!, guardado);
    expect(b.seen[0]).toContain("manutenção");
    expect(b.seen.some((s) => s.includes("Cinquenta e seis"))).toBe(false);
  });

  it("M4: o Custódio começa pelo nó certo conforme as consequências", () => {
    const base = () => {
      const f = new GameFlags();
      f.set(F.carregamentoDecisao, "registro");
      f.set(F.m2Decisao, "denuncia");
      f.set(F.documento, "guardou");
      return f;
    };
    const runner = (f: GameFlags) => new DialogueRunner(f, SPEAKER_NAMES);
    let f = base();
    expect(runner(f).resolveStart(DIALOGUES.custodio!)).toBe("m4_cordial");
    f.set(F.detectado, true);
    expect(runner(f).resolveStart(DIALOGUES.custodio!)).toBe("m4_detectado");
    f.set(X.brandaoPreso, true);
    expect(runner(f).resolveStart(DIALOGUES.custodio!)).toBe("m4_preso");
    f.set(F.custodiosHostis, true);
    expect(runner(f).resolveStart(DIALOGUES.custodio!)).toBe("m4_hostil");
    f = base();
    f.set(F.m2Decisao, "silencio");
    expect(runner(f).resolveStart(DIALOGUES.custodio!)).toBe("m4_lista");
    f.set(X.brandaoSolto, true);
    expect(runner(f).resolveStart(DIALOGUES.custodio!)).toBe("m4_transferido");
  });

  it("M4: Ana decide por ela mesma — vai com confiança acumulada, fica sem ela", async () => {
    const confianca = new GameFlags();
    confianca.set(F.carregamentoDecisao, "registro");
    confianca.set(F.m2Decisao, "denuncia");
    confianca.set(F.documento, "miriam");
    confianca.set(X.anaSabe, true);
    confianca.set(F.matiasConfia, true);
    confianca.set(X.raquelConversou, true);
    const vai = await run(DIALOGUES.ana!, confianca, () => 0);
    expect(vai.seen).toContain("Ana: Eu vou.");
    expect(confianca.get(F.ana)).toBe("vai");
    expect(confianca.get(X.anaPontos)).toBe(6);
    expect(vai.effects).toContain(`${QUEST_PARTIDA}:ana`);

    const desconfianca = new GameFlags();
    desconfianca.set(F.carregamentoDecisao, "silencio");
    desconfianca.set(F.m2Decisao, "silencio");
    desconfianca.set(F.documento, "guardou");
    desconfianca.set(X.anaSabe, false);
    desconfianca.set(F.matiasConfia, false);
    desconfianca.set(X.raquelConversou, true);
    const fica = await run(DIALOGUES.ana!, desconfianca, () => 1);
    expect(fica.seen).toContain("Ana: Eu fico.");
    expect(fica.seen).toContain("Ana: Não é castigo, pai. É escolha. Minha.");
    expect(desconfianca.get(F.ana)).toBe("fica");

    // caso limite: pedir "fica mais segura com a Raquel" (0 pontos) com três lembranças boas → ela vai mesmo assim
    const limite = new GameFlags();
    limite.set(F.carregamentoDecisao, "registro");
    limite.set(F.m2Decisao, "denuncia");
    limite.set(F.documento, "guardou");
    limite.set(X.anaSabe, true);
    limite.set(F.matiasConfia, false);
    limite.set(X.raquelConversou, true);
    const r = await run(DIALOGUES.ana!, limite, () => 2);
    expect(r.seen).toContain("Ana: O senhor acha. Eu decido.");
    expect(limite.get(F.ana)).toBe("vai");
    // depois da decisão, Raquel e Ana comentam
    const runner = new DialogueRunner(limite, SPEAKER_NAMES);
    expect(runner.resolveStart(DIALOGUES.ana!)).toBe("m4_depois");
    expect(runner.resolveStart(DIALOGUES.raquel!)).toBe("m4_depois");
    const fecho = await run(DIALOGUES.raquel!, limite);
    expect(fecho.seen[0]).toContain("duas semanas");
  });
});

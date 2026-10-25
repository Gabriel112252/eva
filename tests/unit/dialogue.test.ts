import { describe, expect, it } from "vitest";
import { DialogueRunner, type DialogueChoice, type DialogueLine, type DialoguePresenter } from "@/narrative/dialogue";
import { GameFlags, evalCondition } from "@/narrative/flags";
import { DIALOGUE_MIRIAM, DIALOGUE_RAQUEL, DIALOGUES, SPEAKER_NAMES } from "@/data/dialogues";

function presenter(choicePicker: (choices: DialogueChoice[]) => number, seen: string[] = []): DialoguePresenter & { seen: string[] } {
  return {
    seen,
    async showLine(line: DialogueLine, speakerName: string) {
      seen.push(`${speakerName}: ${line.text}`);
    },
    async showChoices(choices) {
      return choicePicker(choices);
    },
    end() {
      /* noop */
    },
  };
}

describe("DialogueRunner", () => {
  it("bloqueia Miriam sem o cartão de registro", async () => {
    const flags = new GameFlags();
    const runner = new DialogueRunner(flags, SPEAKER_NAMES);
    const p = presenter(() => 0);
    await runner.run(DIALOGUE_MIRIAM, p);
    expect(p.seen).toHaveLength(1);
    expect(p.seen[0]).toContain("sem o cartão");
    expect(flags.getBool("apuracao.concluida")).toBe(false);
  });

  it("percorre a Apuração com as falas canônicas e persiste a postura escolhida", async () => {
    const flags = new GameFlags();
    flags.set("cartao.pego", true);
    const runner = new DialogueRunner(flags, SPEAKER_NAMES);
    const effects: string[] = [];
    runner.onEffect.on((e) => effects.push(e.type));
    const p = presenter((choices) => choices.findIndex((c) => c.text.includes("Me ajuda")));
    await runner.run(DIALOGUE_MIRIAM, p);
    expect(p.seen[0]).toBe("Miriam: A cota do Setor Dezessete foi recalculada. Medicamentos de emergência permanecem reservados aos casos prioritários.");
    expect(p.seen[1]).toBe("Matias: Quem definiu prioritário?");
    expect(p.seen[2]).toBe("Miriam: O conselho de distribuição. Com base no relatório da Mãe.");
    expect(p.seen[3]).toBe("Matias: Eu perguntei quem decidiu. Não quem assinou o relatório.");
    expect(p.seen).toContain("Ana: Pai... tem gente aqui esperando há mais tempo que eu.");
    expect(p.seen).toContain("Raquel: A fórmula não sabe o que fazer com alguém que não cabe nas categorias.");
    expect(flags.get("apuracao.postura")).toBe("dialogo");
    expect(flags.getBool("apuracao.concluida")).toBe(true);
    expect(flags.getBool("pista.carregamento")).toBe(true);
    expect(effects).toContain("questObjective");
    expect(runner.history.length).toBeGreaterThan(5);
    // segunda visita: fala de encerramento
    const p2 = presenter(() => 0);
    await runner.run(DIALOGUE_MIRIAM, p2);
    expect(p2.seen).toHaveLength(1);
    expect(p2.seen[0]).toContain("Prioridade três");
  });

  it("registra matiasTrustsSystem de acordo com a escolha com Raquel e Ana", async () => {
    for (const [index, expected] of [
      [0, true],
      [1, false],
    ] as const) {
      const flags = new GameFlags();
      const runner = new DialogueRunner(flags, SPEAKER_NAMES);
      await runner.run(DIALOGUE_RAQUEL, presenter(() => index));
      expect(flags.get("matiasTrustsSystem")).toBe(expected);
      expect(flags.getBool("raquel.conversou")).toBe(true);
    }
  });

  it("todos os grafos referenciam nós existentes", () => {
    for (const graph of Object.values(DIALOGUES)) {
      const starts = typeof graph.start === "string" ? [graph.start] : graph.start.map((s) => s.node);
      for (const s of starts) expect(graph.lines[s], `${graph.id}:${s}`).toBeDefined();
      for (const line of Object.values(graph.lines)) {
        if (line.next) expect(graph.lines[line.next], `${graph.id}:${line.id}->${line.next}`).toBeDefined();
        if (line.elseNext) expect(graph.lines[line.elseNext]).toBeDefined();
        for (const c of line.choices ?? []) if (c.next) expect(graph.lines[c.next], `${graph.id}:${line.id} choice ${c.text}`).toBeDefined();
        expect(SPEAKER_NAMES[line.speaker], `speaker ${line.speaker}`).toBeDefined();
        expect(line.text.length).toBeGreaterThan(3);
      }
    }
  });

  it("avalia condições compostas", () => {
    const flags = new GameFlags();
    flags.set("a", 1);
    expect(evalCondition({ all: [{ flag: "a", is: 1 }, { flag: "b", exists: false }] }, flags)).toBe(true);
    expect(evalCondition({ any: [{ flag: "a", is: 2 }, { flag: "a", isNot: 2 }] }, flags)).toBe(true);
    expect(evalCondition({ flag: "a", is: 2 }, flags)).toBe(false);
  });
});

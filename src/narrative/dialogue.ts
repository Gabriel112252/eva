import { TypedEvent } from "@/core/events";
import { evalCondition, type Condition, type FlagValue, type GameFlags } from "./flags";

/** Efeito colateral disparado por uma linha ou escolha. */
export type DialogueEffect =
  | { type: "setFlag"; key: string; value: FlagValue }
  | { type: "increment"; key: string; by?: number }
  | { type: "questObjective"; quest: string; objective: string }
  | { type: "startQuest"; quest: string }
  | { type: "completeQuest"; quest: string };

export interface DialogueChoice {
  text: string;
  next?: string;
  effects?: DialogueEffect[];
  condition?: Condition;
}

export interface DialogueLine {
  id: string;
  /** chave do personagem que fala ("matias", "miriam", …) */
  speaker: string;
  text: string;
  /** caminho de arquivo de voz (ex.: "voice/pt-BR/miriam_01.ogg") — opcional; sem arquivo usa síntese provisória */
  voice?: string;
  /** próximo nó; ausente + sem escolhas = fim */
  next?: string;
  choices?: DialogueChoice[];
  effects?: DialogueEffect[];
  condition?: Condition;
  /** nó alternativo se a condição falhar */
  elseNext?: string;
  /** câmera: quem enquadrar */
  shot?: "speaker" | "listener" | "two";
}

export interface DialogueGraph {
  id: string;
  /** nó inicial; pode ser uma lista de entradas condicionais avaliadas em ordem */
  start: string | Array<{ condition?: Condition; node: string }>;
  lines: Record<string, DialogueLine>;
}

export interface DialoguePresenter {
  showLine(line: DialogueLine, speakerName: string): Promise<void>;
  showChoices(choices: DialogueChoice[]): Promise<number>;
  end(): void;
}

export interface DialogueRunEvent {
  graph: DialogueGraph;
  line: DialogueLine;
}

/** Nome de exibição por chave de falante. */
export type SpeakerNames = Record<string, string>;

/**
 * Executor de diálogos: percorre o grafo, aplica efeitos, avalia condições e
 * delega apresentação (legendas/escolhas/voz) a um `DialoguePresenter`.
 * Lógica pura — testável sem engine.
 */
export class DialogueRunner {
  readonly onLine = new TypedEvent<DialogueRunEvent>();
  readonly onChoice = new TypedEvent<{ graph: DialogueGraph; line: DialogueLine; choice: DialogueChoice; index: number }>();
  readonly onEffect = new TypedEvent<DialogueEffect>();
  readonly onEnd = new TypedEvent<DialogueGraph>();
  readonly history: string[] = [];
  private running = false;

  constructor(
    private readonly flags: GameFlags,
    private readonly names: SpeakerNames,
  ) {}

  get isRunning(): boolean {
    return this.running;
  }

  resolveStart(graph: DialogueGraph): string | null {
    if (typeof graph.start === "string") return graph.start;
    for (const entry of graph.start) {
      if (evalCondition(entry.condition, this.flags)) return entry.node;
    }
    return null;
  }

  private applyEffects(effects: DialogueEffect[] | undefined): void {
    if (!effects) return;
    for (const e of effects) {
      switch (e.type) {
        case "setFlag":
          this.flags.set(e.key, e.value);
          break;
        case "increment":
          this.flags.increment(e.key, e.by ?? 1);
          break;
        default:
          break;
      }
      this.onEffect.emit(e);
    }
  }

  async run(graph: DialogueGraph, presenter: DialoguePresenter): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      let nodeId = this.resolveStart(graph);
      let guard = 0;
      while (nodeId && guard++ < 200) {
        const line: DialogueLine | undefined = graph.lines[nodeId];
        if (!line) break;
        if (!evalCondition(line.condition, this.flags)) {
          nodeId = line.elseNext ?? line.next ?? null;
          continue;
        }
        this.history.push(`${graph.id}:${line.id}`);
        this.applyEffects(line.effects);
        this.onLine.emit({ graph, line });
        await presenter.showLine(line, this.names[line.speaker] ?? line.speaker);
        const choices = (line.choices ?? []).filter((c) => evalCondition(c.condition, this.flags));
        if (choices.length > 0) {
          const index = await presenter.showChoices(choices);
          const choice = choices[Math.max(0, Math.min(choices.length - 1, index))]!;
          this.applyEffects(choice.effects);
          this.onChoice.emit({ graph, line, choice, index });
          nodeId = choice.next ?? null;
        } else {
          nodeId = line.next ?? null;
        }
      }
    } finally {
      this.running = false;
      presenter.end();
      this.onEnd.emit(graph);
    }
  }
}

import { TypedEvent } from "@/core/events";

export interface ObjectiveDef {
  id: string;
  text: string;
  /** opcional: dica de direção/local para o HUD */
  hint?: string;
}

export interface QuestDef {
  id: string;
  title: string;
  description: string;
  objectives: ObjectiveDef[];
}

export type QuestStatus = "inactive" | "active" | "completed";

export interface QuestState {
  status: QuestStatus;
  objectives: Record<string, boolean>;
}

export interface QuestSnapshot {
  [questId: string]: QuestState;
}

/** Registro de missões: ativa missões, completa objetivos em ordem e emite mudanças para o HUD. */
export class QuestLog {
  readonly onChange = new TypedEvent<{ quest: QuestDef; state: QuestState; objective?: ObjectiveDef }>();
  private defs = new Map<string, QuestDef>();
  private states = new Map<string, QuestState>();

  constructor(defs: QuestDef[]) {
    for (const d of defs) {
      this.defs.set(d.id, d);
      this.states.set(d.id, { status: "inactive", objectives: Object.fromEntries(d.objectives.map((o) => [o.id, false])) });
    }
  }

  get(id: string): { def: QuestDef; state: QuestState } | undefined {
    const def = this.defs.get(id);
    const state = this.states.get(id);
    return def && state ? { def, state } : undefined;
  }

  start(id: string): void {
    const q = this.get(id);
    if (!q || q.state.status !== "inactive") return;
    q.state.status = "active";
    this.onChange.emit({ quest: q.def, state: q.state });
  }

  isActive(id: string): boolean {
    return this.states.get(id)?.status === "active";
  }

  isObjectiveDone(questId: string, objectiveId: string): boolean {
    return this.states.get(questId)?.objectives[objectiveId] === true;
  }

  completeObjective(questId: string, objectiveId: string): boolean {
    const q = this.get(questId);
    if (!q) return false;
    if (q.state.status === "inactive") this.start(questId);
    if (q.state.status === "completed") return false;
    if (q.state.objectives[objectiveId]) return false;
    const def = q.def.objectives.find((o) => o.id === objectiveId);
    if (!def) return false;
    q.state.objectives[objectiveId] = true;
    this.onChange.emit({ quest: q.def, state: q.state, objective: def });
    if (q.def.objectives.every((o) => q.state.objectives[o.id])) this.complete(questId);
    return true;
  }

  complete(id: string): void {
    const q = this.get(id);
    if (!q || q.state.status === "completed") return;
    q.state.status = "completed";
    for (const o of q.def.objectives) q.state.objectives[o.id] = true;
    this.onChange.emit({ quest: q.def, state: q.state });
  }

  /** Primeiro objetivo pendente da primeira missão ativa (para o HUD). */
  currentObjective(): { quest: QuestDef; objective: ObjectiveDef } | null {
    for (const def of this.defs.values()) {
      const st = this.states.get(def.id)!;
      if (st.status !== "active") continue;
      const next = def.objectives.find((o) => !st.objectives[o.id]);
      if (next) return { quest: def, objective: next };
    }
    return null;
  }

  activeQuests(): Array<{ def: QuestDef; state: QuestState }> {
    return [...this.defs.values()].filter((d) => this.states.get(d.id)!.status === "active").map((def) => ({ def, state: this.states.get(def.id)! }));
  }

  toJSON(): QuestSnapshot {
    const out: QuestSnapshot = {};
    for (const [id, st] of this.states) out[id] = { status: st.status, objectives: { ...st.objectives } };
    return out;
  }

  load(snapshot: QuestSnapshot | undefined): void {
    if (!snapshot) return;
    for (const [id, st] of Object.entries(snapshot)) {
      const current = this.states.get(id);
      if (!current) continue;
      current.status = st.status === "active" || st.status === "completed" ? st.status : "inactive";
      for (const key of Object.keys(current.objectives)) current.objectives[key] = st.objectives?.[key] === true;
    }
  }
}

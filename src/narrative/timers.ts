import { TypedEvent } from "@/core/events";

export interface MissionTimer {
  id: string;
  /** segundos totais ao iniciar */
  total: number;
  /** segundos restantes */
  remaining: number;
  /** rótulo curto para a HUD ("Entrega ao posto"); sem rótulo o timer roda escondido */
  label?: string;
}

export type TimerSnapshot = Record<string, { remaining: number; total?: number; label?: string }>;

/** "mm:ss" (arredonda para cima: 2,1 s mostra 00:03, zero só ao expirar). */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds - 1e-6));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Contagens regressivas nomeadas da missão (entrega contra o tempo, toque de recolher). Lógica pura:
 * o jogo chama `update(dt)` só enquanto joga, então pausa/menus congelam os timers de graça.
 * Ao zerar emite `onExpired` (o roteiro liga isso ao gatilho `{kind:"timer"}`).
 */
export class MissionTimers {
  readonly onExpired = new TypedEvent<MissionTimer>();
  readonly onStart = new TypedEvent<MissionTimer>();
  readonly onCancel = new TypedEvent<MissionTimer>();
  private readonly timers = new Map<string, MissionTimer>();
  /** ordem de criação (o mais recente com rótulo aparece na HUD) */
  private order: string[] = [];

  /** Inicia (ou reinicia) um timer. */
  start(id: string, seconds: number, label?: string): MissionTimer {
    const t: MissionTimer = { id, total: Math.max(0, seconds), remaining: Math.max(0, seconds), ...(label ? { label } : {}) };
    this.timers.set(id, t);
    this.order = this.order.filter((x) => x !== id);
    this.order.push(id);
    this.onStart.emit(t);
    return t;
  }

  /** Acrescenta (ou tira, negativo) segundos a um timer ativo; devolve o restante ou null se não existe. */
  add(id: string, seconds: number): number | null {
    const t = this.timers.get(id);
    if (!t) return null;
    t.remaining = Math.max(0, t.remaining + seconds);
    t.total = Math.max(t.total, t.remaining);
    return t.remaining;
  }

  /** Para sem disparar `onExpired` (entrega concluída a tempo). Devolve os segundos que sobraram. */
  cancel(id: string): number | null {
    const t = this.timers.get(id);
    if (!t) return null;
    this.timers.delete(id);
    this.order = this.order.filter((x) => x !== id);
    this.onCancel.emit(t);
    return t.remaining;
  }

  has(id: string): boolean {
    return this.timers.has(id);
  }

  get(id: string): MissionTimer | undefined {
    return this.timers.get(id);
  }

  remaining(id: string): number | null {
    return this.timers.get(id)?.remaining ?? null;
  }

  /** Timer a exibir na HUD: o mais recente com rótulo. */
  get display(): MissionTimer | null {
    for (let i = this.order.length - 1; i >= 0; i--) {
      const t = this.timers.get(this.order[i]!);
      if (t?.label) return t;
    }
    return null;
  }

  get active(): MissionTimer[] {
    return this.order.map((id) => this.timers.get(id)!).filter(Boolean);
  }

  /** Avança o relógio; timers que zeram são removidos e emitidos (em ordem de criação). */
  update(dt: number): void {
    if (dt <= 0 || this.timers.size === 0) return;
    const expired: MissionTimer[] = [];
    for (const id of this.order) {
      const t = this.timers.get(id);
      if (!t) continue;
      t.remaining = Math.max(0, t.remaining - dt);
      if (t.remaining <= 0) expired.push(t);
    }
    for (const t of expired) {
      this.timers.delete(t.id);
      this.order = this.order.filter((x) => x !== t.id);
      this.onExpired.emit(t);
    }
  }

  clear(): void {
    this.timers.clear();
    this.order = [];
  }

  toJSON(): TimerSnapshot {
    const out: TimerSnapshot = {};
    for (const id of this.order) {
      const t = this.timers.get(id);
      if (t) out[id] = { remaining: t.remaining, total: t.total, ...(t.label ? { label: t.label } : {}) };
    }
    return out;
  }

  /** Restaura do save sem emitir `onStart`. */
  load(data: TimerSnapshot | undefined): void {
    this.clear();
    if (!data || typeof data !== "object") return;
    for (const [id, v] of Object.entries(data)) {
      if (!v || typeof v.remaining !== "number" || v.remaining <= 0) continue;
      const total = typeof v.total === "number" ? Math.max(v.total, v.remaining) : v.remaining;
      this.timers.set(id, { id, total, remaining: v.remaining, ...(typeof v.label === "string" ? { label: v.label } : {}) });
      this.order.push(id);
    }
  }
}

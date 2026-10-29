import { TypedEvent } from "@/core/events";
import type { ClueDef } from "@/data/cap1Contracts";

/** Estado serializado do diário: ids na ordem em que foram descobertas. */
export type ClueSnapshot = string[];

/**
 * Diário de pistas de Matias. Lógica pura (sem engine): recebe as definições (`src/data/clues.ts`),
 * guarda a ordem de descoberta, avisa quem ouve (`onAdded`) e serializa para o save.
 */
export class ClueLog {
  readonly onAdded = new TypedEvent<ClueDef>();
  private readonly defs = new Map<string, ClueDef>();
  private found: string[] = [];

  constructor(defs: readonly ClueDef[] = []) {
    this.register(defs);
  }

  /** Acrescenta/atualiza definições (ex.: pistas de outro capítulo carregadas depois). */
  register(defs: readonly ClueDef[]): void {
    for (const d of defs) this.defs.set(d.id, d);
  }

  /** Definição de uma pista (encontrada ou não). */
  get(id: string): ClueDef | undefined {
    return this.defs.get(id);
  }

  /** Marca a pista como encontrada; devolve false se já estava no diário ou se o id não existe. */
  add(id: string): boolean {
    const def = this.defs.get(id);
    if (!def) {
      console.warn(`[pistas] pista desconhecida: ${id}`);
      return false;
    }
    if (this.found.includes(id)) return false;
    this.found.push(id);
    this.onAdded.emit(def);
    return true;
  }

  has(id: string): boolean {
    return this.found.includes(id);
  }

  /** Todas as encontradas, na ordem da descoberta (opcionalmente só de uma missão). */
  list(quest?: ClueDef["quest"]): ClueDef[] {
    const out: ClueDef[] = [];
    for (const id of this.found) {
      const d = this.defs.get(id);
      if (d && (!quest || d.quest === quest)) out.push(d);
    }
    return out;
  }

  get count(): number {
    return this.found.length;
  }

  /** Todas as pistas de `ids` já estão no diário? (ex.: as 3 que montam o nome de Brandão) */
  hasAll(ids: readonly string[]): boolean {
    return ids.every((id) => this.found.includes(id));
  }

  toJSON(): ClueSnapshot {
    return [...this.found];
  }

  /** Restaura do save; ids que não existem mais nas definições são descartados. Não emite `onAdded`. */
  load(data: ClueSnapshot | undefined): void {
    this.found = [];
    if (!Array.isArray(data)) return;
    for (const id of data) if (typeof id === "string" && this.defs.has(id) && !this.found.includes(id)) this.found.push(id);
  }

  clear(): void {
    this.found = [];
  }
}

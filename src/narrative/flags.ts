import { TypedEvent } from "@/core/events";

export type FlagValue = boolean | number | string;

/** Variáveis de estado narrativo (ex.: matiasTrustsSystem). */
export class GameFlags {
  readonly onChange = new TypedEvent<{ key: string; value: FlagValue }>();
  private values = new Map<string, FlagValue>();

  get(key: string): FlagValue | undefined {
    return this.values.get(key);
  }

  getBool(key: string): boolean {
    return this.values.get(key) === true;
  }

  set(key: string, value: FlagValue): void {
    if (this.values.get(key) === value) return;
    this.values.set(key, value);
    this.onChange.emit({ key, value });
  }

  increment(key: string, by = 1): number {
    const v = this.values.get(key);
    const next = (typeof v === "number" ? v : 0) + by;
    this.set(key, next);
    return next;
  }

  has(key: string): boolean {
    return this.values.has(key);
  }

  toJSON(): Record<string, FlagValue> {
    return Object.fromEntries(this.values);
  }

  load(data: Record<string, FlagValue> | undefined): void {
    this.values.clear();
    if (!data) return;
    for (const [k, v] of Object.entries(data)) {
      if (typeof v === "boolean" || typeof v === "number" || typeof v === "string") this.values.set(k, v);
    }
  }
}

/** Condição avaliável sobre flags. */
export type Condition =
  | { flag: string; is: FlagValue }
  | { flag: string; isNot: FlagValue }
  | { flag: string; exists: boolean }
  | { all: Condition[] }
  | { any: Condition[] };

export function evalCondition(c: Condition | undefined, flags: GameFlags): boolean {
  if (!c) return true;
  if ("all" in c) return c.all.every((x) => evalCondition(x, flags));
  if ("any" in c) return c.any.some((x) => evalCondition(x, flags));
  if ("is" in c) return flags.get(c.flag) === c.is;
  if ("isNot" in c) return flags.get(c.flag) !== c.isNot;
  return flags.has(c.flag) === c.exists;
}

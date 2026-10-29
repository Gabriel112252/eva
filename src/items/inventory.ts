import { TypedEvent } from "@/core/events";

export type ItemId = "cartao" | "pistola" | "municao_pistola" | "kit_medico" | "selos" | "mandioca";

export interface ItemDef {
  id: ItemId;
  name: string;
  /** descrição curta para a mochila */
  note?: string;
  stackable: boolean;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  cartao: { id: "cartao", name: "Cartão de registro", note: "Matias · Setor 17", stackable: false },
  pistola: { id: "pistola", name: "Pistola de serviço", note: "dos Custódios", stackable: false },
  municao_pistola: { id: "municao_pistola", name: "Munição de pistola", note: "cartuchos", stackable: true },
  kit_medico: { id: "kit_medico", name: "Kit médico", note: "H para usar", stackable: true },
  selos: { id: "selos", name: "Selos de Permanência", note: "créditos locais", stackable: true },
  mandioca: { id: "mandioca", name: "Mandioca", note: "do comerciante, para Ana", stackable: true },
};

/** Mochila simples: contagem por item, com eventos para HUD e salvamento. */
export class Inventory {
  readonly onChange = new TypedEvent<void>();
  private items = new Map<ItemId, number>();

  count(id: ItemId): number {
    return this.items.get(id) ?? 0;
  }

  has(id: ItemId): boolean {
    return this.count(id) > 0;
  }

  add(id: ItemId, amount = 1): number {
    const def = ITEMS[id];
    const cur = this.count(id);
    const next = def.stackable ? cur + amount : Math.min(1, cur + amount);
    this.items.set(id, next);
    this.onChange.emit();
    return next - cur;
  }

  remove(id: ItemId, amount = 1): boolean {
    const cur = this.count(id);
    if (cur < amount) return false;
    if (cur - amount <= 0) this.items.delete(id);
    else this.items.set(id, cur - amount);
    this.onChange.emit();
    return true;
  }

  list(): Array<{ id: ItemId; name: string; count: number; note?: string }> {
    return [...this.items.entries()].filter(([, n]) => n > 0).map(([id, count]) => ({ id, name: ITEMS[id].name, count, note: ITEMS[id].note }));
  }

  toJSON(): Partial<Record<ItemId, number>> {
    return Object.fromEntries(this.items) as Partial<Record<ItemId, number>>;
  }

  load(data: Partial<Record<ItemId, number>> | undefined): void {
    this.items.clear();
    if (data) for (const [k, v] of Object.entries(data)) if (k in ITEMS && typeof v === "number" && v > 0) this.items.set(k as ItemId, v);
    this.onChange.emit();
  }
}

import { TypedEvent } from "@/core/events";

export interface DamageInfo {
  amount: number;
  /** origem do dano (mundo), para direção da reação/vinheta */
  from?: { x: number; y: number; z: number };
  headshot?: boolean;
  source?: string;
}

/** Vida com regeneração lenta fora de combate e janela de invulnerabilidade curta após dano. */
export class Health {
  readonly onDamage = new TypedEvent<DamageInfo>();
  readonly onDeath = new TypedEvent<void>();
  readonly onChange = new TypedEvent<number>();
  current: number;
  /** tempo desde o último dano (s) */
  sinceDamage = 999;
  invulnerable = false;

  constructor(
    readonly max: number,
    /** vida por segundo regenerada após `regenDelay` sem dano (0 = não regenera) */
    readonly regenPerSecond = 0,
    readonly regenDelay = 6,
  ) {
    this.current = max;
  }

  get alive(): boolean {
    return this.current > 0;
  }

  get fraction(): number {
    return Math.max(0, Math.min(1, this.current / this.max));
  }

  damage(info: DamageInfo): boolean {
    if (!this.alive || this.invulnerable || info.amount <= 0) return false;
    this.current = Math.max(0, this.current - info.amount);
    this.sinceDamage = 0;
    this.onDamage.emit(info);
    this.onChange.emit(this.current);
    if (this.current <= 0) this.onDeath.emit();
    return true;
  }

  heal(amount: number): number {
    if (!this.alive) return 0;
    const before = this.current;
    this.current = Math.min(this.max, this.current + amount);
    if (this.current !== before) this.onChange.emit(this.current);
    return this.current - before;
  }

  reset(): void {
    this.current = this.max;
    this.sinceDamage = 999;
    this.onChange.emit(this.current);
  }

  update(dt: number): void {
    this.sinceDamage += dt;
    if (this.alive && this.regenPerSecond > 0 && this.sinceDamage > this.regenDelay && this.current < this.max) {
      this.heal(this.regenPerSecond * dt);
    }
  }
}

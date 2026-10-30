import { TypedEvent } from "@/core/events";
import type { MissionTrigger } from "@/data/cap1Contracts";

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/** Zona nomeada do mapa: cilindro vertical (`radius`) ou caixa alinhada aos eixos (`size`, dimensões totais). */
export interface ZoneSpec {
  id: string;
  center: Vec3Like;
  /** raio horizontal (m) — cilindro; ignora y a menos que `height` seja dado */
  radius?: number;
  /** caixa: largura (x), altura (y) e profundidade (z) totais */
  size?: Vec3Like;
  /** altura do cilindro (m) centrada em `center.y`; sem isso a zona vale em qualquer altura */
  height?: number;
  /** a pé, só em veículo, ou qualquer um (padrão) */
  requires?: "pe" | "veiculo" | "qualquer";
  /** dispara só na primeira entrada (padrão true) */
  once?: boolean;
}

export type TriggerCallback = (trigger: MissionTrigger) => void;

interface Subscription {
  pattern: MissionTrigger;
  cb: TriggerCallback;
  once: boolean;
}

/** Um ponto está dentro da zona? (lógica pura) */
export function zoneContains(zone: ZoneSpec, p: Vec3Like): boolean {
  const dx = p.x - zone.center.x;
  const dy = p.y - zone.center.y;
  const dz = p.z - zone.center.z;
  if (zone.size) {
    return Math.abs(dx) <= zone.size.x / 2 && Math.abs(dy) <= zone.size.y / 2 && Math.abs(dz) <= zone.size.z / 2;
  }
  const r = zone.radius ?? 2;
  if (dx * dx + dz * dz > r * r) return false;
  return zone.height === undefined || Math.abs(dy) <= zone.height / 2;
}

/**
 * O gatilho `t` satisfaz o padrão `pattern`? Mesmo `kind` e, campo a campo, valores iguais; no padrão,
 * `"*"` numa string aceita qualquer valor e `segundos` (timer) é ignorado.
 */
export function triggerMatches(pattern: MissionTrigger, t: MissionTrigger): boolean {
  if (pattern.kind !== t.kind) return false;
  const p = pattern as unknown as Record<string, unknown>;
  const q = t as unknown as Record<string, unknown>;
  for (const key of Object.keys(p)) {
    if (key === "kind" || key === "segundos") continue;
    const pv = p[key];
    if (pv === "*" || pv === undefined) continue;
    if (pv !== q[key]) return false;
  }
  return true;
}

/** Chave estável de um gatilho (para histórico/depuração): `zona:deposito`, `timer:entrega`, `detectado`. */
export function triggerKey(t: MissionTrigger): string {
  switch (t.kind) {
    case "zona":
      return `zona:${t.id}`;
    case "examinar":
      return `examinar:${t.objeto}`;
    case "pista":
      return `pista:${t.id}`;
    case "reparo":
      return `reparo:${t.maquina}`;
    case "timer":
      return `timer:${t.id}`;
    case "detectado":
      return "detectado";
    case "dialogo":
      return `dialogo:${t.npc}:${t.no}`;
    case "veiculo":
      return `veiculo:${t.id}:${t.dentro ? "entrou" : "saiu"}`;
    default:
      return (t as { kind: string }).kind;
  }
}

/**
 * Registro de gatilhos de missão: o roteiro assina padrões (`on`) e os sistemas disparam gatilhos
 * (`fire`). Zonas são definidas por dados (`ZoneSpec`) e verificadas em `update` (entrada = borda de
 * subida; `once` controla repetição). Lógica pura, testável; `window.eva.triggers` expõe `fire()`.
 */
export class MissionScript {
  /** todo gatilho disparado (para depuração/HUD) */
  readonly onAny = new TypedEvent<MissionTrigger>();
  /** histórico dos últimos gatilhos (mais recente por último) */
  readonly history: MissionTrigger[] = [];
  readonly zones = new Map<string, ZoneSpec>();
  private subs: Subscription[] = [];
  private inside = new Set<string>();
  private firedZones = new Set<string>();
  private historyLimit = 64;

  /** Assina um padrão; devolve a função para cancelar. `once` remove após o primeiro disparo. */
  on(pattern: MissionTrigger, cb: TriggerCallback, opts: { once?: boolean } = {}): () => void {
    const sub: Subscription = { pattern, cb, once: opts.once ?? false };
    this.subs.push(sub);
    return () => {
      this.subs = this.subs.filter((s) => s !== sub);
    };
  }

  once(pattern: MissionTrigger, cb: TriggerCallback): () => void {
    return this.on(pattern, cb, { once: true });
  }

  /** Dispara um gatilho; devolve quantas assinaturas foram chamadas. */
  fire(trigger: MissionTrigger): number {
    this.history.push(trigger);
    if (this.history.length > this.historyLimit) this.history.splice(0, this.history.length - this.historyLimit);
    let n = 0;
    const matched = this.subs.filter((s) => triggerMatches(s.pattern, trigger));
    for (const s of matched) {
      if (s.once) this.subs = this.subs.filter((x) => x !== s);
      s.cb(trigger);
      n++;
    }
    this.onAny.emit(trigger);
    return n;
  }

  /** O gatilho já disparou alguma vez (histórico)? */
  fired(pattern: MissionTrigger): boolean {
    return this.history.some((t) => triggerMatches(pattern, t));
  }

  // --- zonas ------------------------------------------------------------------------------------
  addZone(spec: ZoneSpec): void {
    this.zones.set(spec.id, spec);
  }

  addZones(specs: readonly ZoneSpec[]): void {
    for (const s of specs) this.addZone(s);
  }

  removeZone(id: string): void {
    this.zones.delete(id);
    this.inside.delete(id);
    this.firedZones.delete(id);
  }

  /** Permite que uma zona `once` dispare de novo (nova missão). */
  resetZone(id: string): void {
    this.firedZones.delete(id);
    this.inside.delete(id);
  }

  isInside(id: string): boolean {
    return this.inside.has(id);
  }

  /** Verifica as zonas para a posição do jogador (pés ou veículo); dispara `{kind:"zona"}` ao entrar. */
  update(position: Vec3Like, inVehicle: boolean): void {
    for (const zone of this.zones.values()) {
      const allowed = !zone.requires || zone.requires === "qualquer" || (zone.requires === "veiculo") === inVehicle;
      const now = allowed && zoneContains(zone, position);
      const was = this.inside.has(zone.id);
      if (now && !was) {
        this.inside.add(zone.id);
        const once = zone.once ?? true;
        if (!once || !this.firedZones.has(zone.id)) {
          this.firedZones.add(zone.id);
          this.fire({ kind: "zona", id: zone.id });
        }
      } else if (!now && was) {
        this.inside.delete(zone.id);
      }
    }
  }

  /** Novo jogo: zonas voltam a poder disparar e o histórico zera; assinaturas e zonas ficam. */
  resetZones(): void {
    this.inside.clear();
    this.firedZones.clear();
    this.history.length = 0;
  }

  /** Remove assinaturas e zonas (novo jogo). Mantém o histórico vazio. */
  clear(): void {
    this.subs = [];
    this.zones.clear();
    this.inside.clear();
    this.firedZones.clear();
    this.history.length = 0;
  }

  get subscriptionCount(): number {
    return this.subs.length;
  }
}

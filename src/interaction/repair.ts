import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Interactable } from "./interactable";
import type { GameFlags } from "@/narrative/flags";
import { TypedEvent } from "@/core/events";

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/** Máquina reparável definida por dados (gerador, bomba d'água, rádio). */
export interface RepairSpec {
  /** nome da máquina — vai no gatilho `{kind:"reparo", maquina}` */
  id: string;
  position: Vec3Like;
  radius?: number;
  title: string;
  /** texto do prompt (padrão "Reparar: <title>") */
  prompt?: string;
  /** rodadas (padrão 3) */
  steps?: number;
  /** segundos para a barra encher (padrão 1.6; cada passo varia ±15 %) */
  fillTime?: number;
  /** largura da faixa-alvo em fração da barra (padrão 0.2) */
  zoneWidth?: number;
  /** segundos de bloqueio após errar (padrão 0.9) — a falha custa tempo, não vida */
  penalty?: number;
  /** flag posta em true ao concluir (além de `reparado.<id>`) */
  flag?: string;
  /** máquina consertada some do prompt (padrão true) */
  once?: boolean;
}

export type RepairPhase = "idle" | "filling" | "penalty" | "done";
export type RepairResult = "hit" | "miss";
export type RepairTick = "step" | "done" | "miss" | null;

export interface RepairView {
  title: string;
  step: number;
  steps: number;
  fill: number;
  zone: [number, number];
  result: RepairResult | null;
}

export interface RepairParams {
  steps: number;
  fillTime: number;
  zoneWidth: number;
  penalty: number;
}

export const REPAIR_DEFAULTS: RepairParams = { steps: 3, fillTime: 1.6, zoneWidth: 0.2, penalty: 0.9 };

/**
 * Minigame de reparo (lógica pura): segurar E enche a barra; soltar dentro da faixa conclui o passo.
 * Soltar fora, ou deixar a barra estourar, repete o passo depois de uma penalidade de tempo.
 * Determinístico com `rng` injetado (testes).
 */
export class RepairMinigame {
  readonly params: RepairParams;
  phase: RepairPhase = "idle";
  step = 0;
  fill = 0;
  zone: [number, number] = [0.5, 0.7];
  failures = 0;
  /** segundos gastos no total (inclui penalidades) */
  elapsed = 0;
  lastResult: RepairResult | null = null;
  private penaltyLeft = 0;
  private stepFillTime: number;

  constructor(
    readonly title: string,
    params: Partial<RepairParams> = {},
    private readonly rng: () => number = Math.random,
  ) {
    this.params = { ...REPAIR_DEFAULTS, ...params };
    this.stepFillTime = this.params.fillTime;
    this.newZone();
  }

  private newZone(): void {
    const w = Math.max(0.05, Math.min(0.6, this.params.zoneWidth));
    const start = 0.3 + this.rng() * (0.95 - w - 0.3);
    this.zone = [start, start + w];
    this.stepFillTime = this.params.fillTime * (0.85 + this.rng() * 0.3);
  }

  get done(): boolean {
    return this.phase === "done";
  }

  /** Começa a encher (E pressionado). Ignorado em penalidade ou concluído. */
  press(): boolean {
    if (this.phase !== "idle") return false;
    this.phase = "filling";
    this.fill = 0;
    this.lastResult = null;
    return true;
  }

  /** Soltou E: avalia a posição da barra. */
  release(): RepairResult | null {
    if (this.phase !== "filling") return null;
    const hit = this.fill >= this.zone[0] && this.fill <= this.zone[1];
    return hit ? this.succeed() : this.fail();
  }

  private succeed(): RepairResult {
    this.lastResult = "hit";
    this.step++;
    if (this.step >= this.params.steps) {
      this.phase = "done";
      this.fill = 1;
    } else {
      this.phase = "idle";
      this.fill = 0;
      this.newZone();
    }
    return "hit";
  }

  private fail(): RepairResult {
    this.lastResult = "miss";
    this.failures++;
    this.phase = "penalty";
    this.penaltyLeft = this.params.penalty;
    return "miss";
  }

  /** Avança o relógio; devolve o evento do quadro ("step" ao concluir um passo pelo estouro não existe: estourar é "miss"). */
  update(dt: number): RepairTick {
    if (dt <= 0 || this.phase === "done") return null;
    this.elapsed += dt;
    if (this.phase === "filling") {
      this.fill += dt / this.stepFillTime;
      if (this.fill > 1) {
        this.fill = 1;
        this.fail();
        return "miss";
      }
      return null;
    }
    if (this.phase === "penalty") {
      this.penaltyLeft -= dt;
      if (this.penaltyLeft <= 0) {
        this.phase = "idle";
        this.fill = 0;
      }
    }
    return null;
  }

  get view(): RepairView {
    return { title: this.title, step: this.step, steps: this.params.steps, fill: this.fill, zone: [this.zone[0], this.zone[1]], result: this.lastResult };
  }
}

export interface RepairHost {
  hud: { setRepair(view: RepairView | null): void };
  flags: GameFlags;
  /** trava o jogador e esconde o prompt */
  begin(): void;
  end(): void;
  /** som: `switch` ao apertar/soltar; `done` ao concluir */
  sound(kind: "press" | "hit" | "miss" | "done"): void;
}

/** Interactable "Reparar: <nome>". */
export class Repairable implements Interactable {
  readonly id: string;
  readonly radius: number;
  readonly clip = "Interact" as const;
  private readonly pos: Vector3;

  constructor(
    readonly spec: RepairSpec,
    private readonly controller: RepairController,
  ) {
    this.id = `reparar_${spec.id}`;
    this.radius = spec.radius ?? 2.2;
    this.pos = new Vector3(spec.position.x, spec.position.y, spec.position.z);
  }

  get repaired(): boolean {
    return this.controller.isRepaired(this.spec.id);
  }

  getPosition(): Vector3 {
    return this.pos;
  }

  getPrompt(): string | null {
    if ((this.spec.once ?? true) && this.repaired) return null;
    if (this.controller.active) return null;
    return this.spec.prompt ?? `Reparar: ${this.spec.title}`;
  }

  interact(): void {
    this.controller.open(this);
  }
}

/**
 * Sessão de reparo: o `Game` encaminha E (pressionar/soltar) e chama `update(dt)`; ao concluir, põe a
 * flag `reparado.<id>` (+ `spec.flag`) e emite `onComplete` → gatilho `{kind:"reparo", maquina}`.
 */
export class RepairController {
  readonly onComplete = new TypedEvent<{ spec: RepairSpec; failures: number; elapsed: number }>();
  readonly onStep = new TypedEvent<{ spec: RepairSpec; result: RepairResult; step: number }>();
  active: { item: Repairable; game: RepairMinigame } | null = null;
  private readonly items: Repairable[] = [];
  private closeTimer = 0;

  constructor(
    private readonly host: RepairHost,
    private readonly rng: () => number = Math.random,
  ) {}

  create(spec: RepairSpec): Repairable {
    const r = new Repairable(spec, this);
    this.items.push(r);
    return r;
  }

  createMany(specs: readonly RepairSpec[]): Repairable[] {
    return specs.map((s) => this.create(s));
  }

  find(id: string): Repairable | undefined {
    return this.items.find((r) => r.spec.id === id);
  }

  get all(): readonly Repairable[] {
    return this.items;
  }

  isRepaired(id: string): boolean {
    return this.host.flags.getBool(`reparado.${id}`);
  }

  open(item: Repairable): void {
    if (this.active) return;
    const s = item.spec;
    const game = new RepairMinigame(s.title, { ...(s.steps !== undefined ? { steps: s.steps } : {}), ...(s.fillTime !== undefined ? { fillTime: s.fillTime } : {}), ...(s.zoneWidth !== undefined ? { zoneWidth: s.zoneWidth } : {}), ...(s.penalty !== undefined ? { penalty: s.penalty } : {}) }, this.rng);
    this.active = { item, game };
    this.closeTimer = 0;
    this.tapMode = false;
    this.host.begin();
    this.host.hud.setRepair(game.view);
  }

  /**
   * E pressionado. Segurar/soltar é o normal; um toque curto (botão de toque: pressiona e solta no mesmo
   * instante) entra em "modo toque": a barra segue enchendo e o próximo toque vale como soltar.
   */
  press(): void {
    if (!this.active) return;
    const { game } = this.active;
    if (game.phase === "filling" && this.tapMode) {
      this.evaluate();
      return;
    }
    if (game.press()) {
      this.pressedAt = game.elapsed;
      this.tapMode = false;
      this.host.sound("press");
    }
  }

  /** E solto. */
  release(): void {
    if (!this.active) return;
    const { game } = this.active;
    if (game.phase !== "filling") return;
    // soltou quase junto com o apertar e a barra mal saiu do zero: foi um toque, não um "soltar"
    if (game.elapsed - this.pressedAt < 0.12 && game.fill < 0.1) {
      this.tapMode = true;
      return;
    }
    this.evaluate();
  }

  private evaluate(): void {
    const a = this.active;
    if (!a) return;
    const { game, item } = a;
    const r = game.release();
    if (!r) return;
    this.tapMode = false;
    this.host.sound(r);
    this.onStep.emit({ spec: item.spec, result: r, step: game.step });
    if (game.done) this.finish();
  }

  private pressedAt = 0;
  private tapMode = false;

  private finish(): void {
    const a = this.active;
    if (!a) return;
    const { item, game } = a;
    this.host.flags.set(`reparado.${item.spec.id}`, true);
    if (item.spec.flag) this.host.flags.set(item.spec.flag, true);
    this.host.sound("done");
    this.host.hud.setRepair(game.view);
    this.onComplete.emit({ spec: item.spec, failures: game.failures, elapsed: game.elapsed });
    // a barra cheia fica um instante na tela antes de fechar
    this.closeTimer = 0.9;
  }

  /** Desiste (Esc/afastar): sem penalidade além do tempo já gasto. */
  cancel(): void {
    if (!this.active) return;
    this.active = null;
    this.host.hud.setRepair(null);
    this.host.end();
  }

  update(dt: number): void {
    const a = this.active;
    if (!a) return;
    if (a.game.done) {
      this.closeTimer -= dt;
      if (this.closeTimer <= 0) this.cancel();
      return;
    }
    const ev = a.game.update(dt);
    if (ev === "miss") {
      this.host.sound("miss");
      this.onStep.emit({ spec: a.item.spec, result: "miss", step: a.game.step });
    }
    this.host.hud.setRepair(a.game.view);
  }
}

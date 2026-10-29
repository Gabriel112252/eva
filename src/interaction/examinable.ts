import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Interactable } from "./interactable";
import type { GameFlags } from "@/narrative/flags";
import type { ClueLog } from "@/narrative/clues";
import type { ThirdPersonCamera } from "@/player/thirdPersonCamera";
import { TypedEvent } from "@/core/events";

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/** Objeto examinável definido por dados (manifesto, lacre, caixa vazia…). */
export interface ExaminableSpec {
  /** nome do objeto — vai no gatilho `{kind:"examinar", objeto}` e no id do Interactable */
  id: string;
  position: Vec3Like;
  /** distância (m) para o prompt aparecer (padrão 2.2) */
  radius?: number;
  title: string;
  /** texto mostrado no close-up (1–3 frases) */
  text: string;
  /** pista adicionada ao diário ao examinar */
  clue?: string;
  /** flag booleana posta em true ao examinar */
  flag?: string;
  /** texto do prompt (padrão "Examinar: <title>") */
  prompt?: string;
  /** some do prompt depois de examinado uma vez (padrão false: pode reler) */
  once?: boolean;
  /** ponto de foco da câmera acima de `position` (m) */
  focusHeight?: number;
  /** distância da câmera ao objeto (m, padrão 1.1) */
  cameraDistance?: number;
}

export interface ExamineHost {
  camera: Pick<ThirdPersonCamera, "setInspectShot">;
  hud: { showExamine(title: string, text: string): void; hideExamine(): void };
  flags: GameFlags;
  clues: ClueLog;
  /** cabeça de quem olha (Matias) — define o lado do close-up */
  viewerHead(): Vector3;
  /** o jogo trava o movimento, muda de estado e esconde o prompt */
  begin(): void;
  /** o jogo devolve o controle e a câmera de seguimento */
  end(): void;
}

/** Interactable "Examinar: <nome>": abre o close-up via `ExamineController`. */
export class Examinable implements Interactable {
  readonly id: string;
  readonly radius: number;
  readonly clip = "Interact" as const;
  private readonly pos: Vector3;

  constructor(
    readonly spec: ExaminableSpec,
    private readonly controller: ExamineController,
  ) {
    this.id = `examinar_${spec.id}`;
    this.radius = spec.radius ?? 2.2;
    this.pos = new Vector3(spec.position.x, spec.position.y, spec.position.z);
  }

  getPosition(): Vector3 {
    return this.pos;
  }

  /** já foi examinado (persistido na flag `examinado.<id>`) */
  get examined(): boolean {
    return this.controller.isExamined(this.spec.id);
  }

  getPrompt(): string | null {
    if (this.spec.once && this.examined) return null;
    if (this.controller.active) return null;
    return this.spec.prompt ?? `Examinar: ${this.spec.title}`;
  }

  interact(): void {
    this.controller.open(this);
  }

  /** Ponto que a câmera enquadra. */
  get focus(): Vector3 {
    return this.pos.add(new Vector3(0, this.spec.focusHeight ?? 0, 0));
  }
}

/**
 * Sessão de exame: close-up da câmera no objeto, título + texto na HUD, pista/flag ao abrir, fecha com
 * E/Esc/Espaço/toque (o `Game` encaminha as ações para `close()` enquanto `active`).
 */
export class ExamineController {
  /** emitido ao abrir (primeira vez ou não) — o Game liga ao gatilho `{kind:"examinar"}` */
  readonly onExamined = new TypedEvent<{ spec: ExaminableSpec; first: boolean }>();
  readonly onClose = new TypedEvent<ExaminableSpec>();
  active: Examinable | null = null;
  private readonly items: Examinable[] = [];

  constructor(private readonly host: ExamineHost) {}

  /** Cria um Interactable a partir dos dados (registrar na lista de interagíveis do jogo). */
  create(spec: ExaminableSpec): Examinable {
    const ex = new Examinable(spec, this);
    this.items.push(ex);
    return ex;
  }

  createMany(specs: readonly ExaminableSpec[]): Examinable[] {
    return specs.map((s) => this.create(s));
  }

  get all(): readonly Examinable[] {
    return this.items;
  }

  find(id: string): Examinable | undefined {
    return this.items.find((e) => e.spec.id === id);
  }

  remove(ex: Examinable): void {
    const i = this.items.indexOf(ex);
    if (i >= 0) this.items.splice(i, 1);
    if (this.active === ex) this.close();
  }

  open(ex: Examinable): void {
    if (this.active) return;
    this.active = ex;
    const first = !ex.examined;
    this.host.flags.set(`examinado.${ex.spec.id}`, true);
    this.host.begin();
    this.host.camera.setInspectShot(ex.focus, this.host.viewerHead(), ex.spec.cameraDistance ?? 1.1);
    this.host.hud.showExamine(ex.spec.title, ex.spec.text);
    if (ex.spec.flag) this.host.flags.set(ex.spec.flag, true);
    if (ex.spec.clue) this.host.clues.add(ex.spec.clue);
    this.onExamined.emit({ spec: ex.spec, first });
  }

  close(): void {
    const ex = this.active;
    if (!ex) return;
    this.active = null;
    this.host.hud.hideExamine();
    this.host.end();
    this.onClose.emit(ex.spec);
  }

  /** O objeto já foi examinado? (flag `examinado.<id>`, salva com o jogo) */
  isExamined(id: string): boolean {
    return this.host.flags.getBool(`examinado.${id}`);
  }
}

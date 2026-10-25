import { TypedEvent } from "./events";

/** Ações lógicas de jogo — permite remapear teclas sem mexer na lógica. */
export type GameAction =
  | "forward"
  | "back"
  | "left"
  | "right"
  | "run"
  | "crouchHold"
  | "crouchToggle"
  | "interact"
  | "pause"
  | "advance"
  | "choice1"
  | "choice2"
  | "choice3"
  | "choice4"
  | "objectives";

const DEFAULT_BINDINGS: Record<string, GameAction> = {
  KeyW: "forward",
  ArrowUp: "forward",
  KeyS: "back",
  ArrowDown: "back",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  ShiftLeft: "run",
  ShiftRight: "run",
  ControlLeft: "crouchHold",
  ControlRight: "crouchHold",
  KeyC: "crouchToggle",
  KeyE: "interact",
  Escape: "pause",
  Space: "advance",
  Enter: "advance",
  Digit1: "choice1",
  Digit2: "choice2",
  Digit3: "choice3",
  Digit4: "choice4",
  Tab: "objectives",
};

/**
 * Gerenciador de entrada: teclado, mouse (pointer lock) e roda.
 * Não conhece Babylon — testável isoladamente.
 */
export class InputManager {
  readonly onAction = new TypedEvent<GameAction>();
  readonly onActionReleased = new TypedEvent<GameAction>();
  readonly onPointerLockChange = new TypedEvent<boolean>();
  readonly onWheel = new TypedEvent<number>();

  private held = new Set<GameAction>();
  private mouseDx = 0;
  private mouseDy = 0;
  private wheelDelta = 0;
  private bindings = { ...DEFAULT_BINDINGS };
  private attachedTo: HTMLElement | null = null;
  /** Quando falso, teclas de movimento são ignoradas (menus/diálogo). */
  enabled = true;

  private readonly keyDown = (e: KeyboardEvent) => {
    const action = this.bindings[e.code];
    if (!action) return;
    // Evita rolagem/atalhos do navegador nas teclas de jogo (Tab, Space, setas).
    if (e.code === "Tab" || e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
    if (e.repeat) return;
    this.held.add(action);
    this.onAction.emit(action);
  };

  private readonly keyUp = (e: KeyboardEvent) => {
    const action = this.bindings[e.code];
    if (!action) return;
    this.held.delete(action);
    this.onActionReleased.emit(action);
  };

  private ignoreMouseUntil = 0;

  private readonly mouseMove = (e: MouseEvent) => {
    if (!this.isPointerLocked) return;
    // O Chromium dispara um mousemove com delta enorme logo após travar o cursor
    // (distância até a última posição conhecida): ignora os primeiros instantes e limita.
    if (performance.now() < this.ignoreMouseUntil) return;
    // Um único evento com centenas de pixels é o "salto" do pointer lock, não movimento real.
    if (Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) return;
    const dx = Math.max(-150, Math.min(150, e.movementX));
    const dy = Math.max(-150, Math.min(150, e.movementY));
    this.mouseDx += dx;
    this.mouseDy += dy;
  };

  private readonly wheel = (e: WheelEvent) => {
    if (!this.isPointerLocked) return;
    e.preventDefault();
    const d = Math.sign(e.deltaY);
    this.wheelDelta += d;
    this.onWheel.emit(d);
  };

  private readonly lockChange = () => {
    const locked = this.isPointerLocked;
    if (!locked) this.held.clear();
    this.mouseDx = 0;
    this.mouseDy = 0;
    this.ignoreMouseUntil = performance.now() + 200;
    this.onPointerLockChange.emit(locked);
  };

  private readonly blur = () => {
    this.held.clear();
  };

  attach(element: HTMLElement): void {
    this.detach();
    this.attachedTo = element;
    window.addEventListener("keydown", this.keyDown);
    window.addEventListener("keyup", this.keyUp);
    window.addEventListener("mousemove", this.mouseMove);
    element.addEventListener("wheel", this.wheel, { passive: false });
    document.addEventListener("pointerlockchange", this.lockChange);
    window.addEventListener("blur", this.blur);
  }

  detach(): void {
    if (!this.attachedTo) return;
    window.removeEventListener("keydown", this.keyDown);
    window.removeEventListener("keyup", this.keyUp);
    window.removeEventListener("mousemove", this.mouseMove);
    this.attachedTo.removeEventListener("wheel", this.wheel);
    document.removeEventListener("pointerlockchange", this.lockChange);
    window.removeEventListener("blur", this.blur);
    this.attachedTo = null;
  }

  get isPointerLocked(): boolean {
    return !!this.attachedTo && document.pointerLockElement === this.attachedTo;
  }

  async requestPointerLock(): Promise<void> {
    if (!this.attachedTo || this.isPointerLocked) return;
    try {
      const p = this.attachedTo.requestPointerLock({ unadjustedMovement: true } as PointerLockOptions) as unknown;
      if (p instanceof Promise) await p;
    } catch {
      try {
        this.attachedTo.requestPointerLock();
      } catch {
        /* navegador sem suporte */
      }
    }
  }

  exitPointerLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isHeld(action: GameAction): boolean {
    return this.enabled && this.held.has(action);
  }

  /** Vetor de movimento no plano (x: direita, y: frente), normalizado. */
  moveAxis(): { x: number; y: number } {
    if (!this.enabled) return { x: 0, y: 0 };
    let x = 0;
    let y = 0;
    if (this.held.has("forward")) y += 1;
    if (this.held.has("back")) y -= 1;
    if (this.held.has("right")) x += 1;
    if (this.held.has("left")) x -= 1;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  /** Consome o delta do mouse acumulado desde a última chamada. */
  consumeMouseDelta(): { dx: number; dy: number } {
    const d = { dx: this.mouseDx, dy: this.mouseDy };
    this.mouseDx = 0;
    this.mouseDy = 0;
    return d;
  }

  consumeWheel(): number {
    const d = this.wheelDelta;
    this.wheelDelta = 0;
    return d;
  }

  clearHeld(): void {
    this.held.clear();
  }

  /** Simula pressionar/soltar uma ação (testes, controles virtuais/touch). */
  simulate(action: GameAction, pressed: boolean): void {
    if (pressed) {
      if (!this.held.has(action)) {
        this.held.add(action);
        this.onAction.emit(action);
      }
    } else if (this.held.delete(action)) {
      this.onActionReleased.emit(action);
    }
  }

  /** Injeta movimento de mouse (testes/controles virtuais). */
  injectMouseDelta(dx: number, dy: number): void {
    this.mouseDx += dx;
    this.mouseDy += dy;
  }
}

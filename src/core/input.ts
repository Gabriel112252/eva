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
  | "objectives"
  | "fire"
  | "aim"
  | "reload"
  | "inventory"
  | "heal"
  | "lights"
  | "jump"
  | "dodge";

/**
 * Tecla → ação(ões). Espaço gera "advance" (avançar fala, freio de mão, subir a aeromoto) E "jump": a pé o
 * PlayerController pula; em diálogo/veículo o pulo é ignorado e só o "advance" vale. Enter só avança.
 */
const DEFAULT_BINDINGS: Record<string, GameAction | readonly GameAction[]> = {
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
  Space: ["advance", "jump"],
  Enter: "advance",
  Digit1: "choice1",
  Digit2: "choice2",
  Digit3: "choice3",
  Digit4: "choice4",
  Tab: "objectives",
  KeyR: "reload",
  KeyI: "inventory",
  KeyH: "heal",
  KeyF: "lights",
  KeyQ: "dodge",
};

function actionsOf(binding: GameAction | readonly GameAction[] | undefined): readonly GameAction[] {
  if (binding === undefined) return [];
  return typeof binding === "string" ? [binding] : binding;
}

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
  /** apertos (bordas de descida) ainda não consumidos — pulo/esquiva são lidos por quadro com consumePress */
  private presses = new Map<GameAction, number>();
  /** Eixo analógico (joystick virtual/gamepad): x direita, y frente, módulo ≤ 1. */
  private analogX = 0;
  private analogY = 0;
  private mouseDx = 0;
  private mouseDy = 0;
  private wheelDelta = 0;
  private bindings = { ...DEFAULT_BINDINGS };
  private attachedTo: HTMLElement | null = null;
  /** Quando falso, teclas de movimento são ignoradas (menus/diálogo). */
  enabled = true;

  private readonly keyDown = (e: KeyboardEvent) => {
    const actions = actionsOf(this.bindings[e.code]);
    if (actions.length === 0) return;
    // Evita rolagem/atalhos do navegador nas teclas de jogo (Tab, Space, setas).
    if (e.code === "Tab" || e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
    if (e.repeat) return;
    for (const action of actions) {
      this.held.add(action);
      this.countPress(action);
      this.onAction.emit(action);
    }
  };

  private readonly keyUp = (e: KeyboardEvent) => {
    for (const action of actionsOf(this.bindings[e.code])) {
      this.held.delete(action);
      this.onActionReleased.emit(action);
    }
  };

  private countPress(action: GameAction): void {
    this.presses.set(action, (this.presses.get(action) ?? 0) + 1);
  }

  /**
   * Houve aperto de `action` desde a última leitura? Zera o contador (cada aperto vale uma vez).
   * Com a entrada desabilitada (menus) devolve falso, mas também descarta o aperto.
   */
  consumePress(action: GameAction): boolean {
    const n = this.presses.get(action) ?? 0;
    if (n > 0) this.presses.delete(action);
    return this.enabled && n > 0;
  }

  private ignoreMouseUntil = 0;
  /** Botão esquerdo pressionado sobre a cena sem pointer lock: arrastar gira a câmera. */
  private dragLook = false;
  /**
   * Quando falso, o jogo nunca pede pointer lock (`?pointerlock=0`): o mouse gira a câmera
   * arrastando. Útil em iframes sem permissão de pointer lock e em testes automatizados.
   */
  pointerLockAllowed = true;
  /** Emitido quando o navegador recusa o pointer lock (iframe sem permissão, política do navegador). */
  readonly onPointerLockError = new TypedEvent<void>();

  private dragLast = { x: 0, y: 0 };

  /** Com pointer lock: movimento relativo do mouse (mousemove, movementX/Y). */
  private readonly mouseMove = (e: MouseEvent) => {
    if (!this.isPointerLocked) return;
    // O Chromium dispara um mousemove com delta enorme logo após travar o cursor
    // (distância até a última posição conhecida): ignora os primeiros instantes e limita.
    if (performance.now() < this.ignoreMouseUntil) return;
    // Um único evento com centenas de pixels é o "salto" do pointer lock, não movimento real.
    if (Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) return;
    this.mouseDx += Math.max(-150, Math.min(150, e.movementX));
    this.mouseDy += Math.max(-150, Math.min(150, e.movementY));
  };

  // Botões do mouse: esquerdo = atirar, direito = mirar (com o cursor travado). Sem pointer lock, o
  // botão direito ainda mira e o esquerdo atira enquanto se mira; fora disso, arrastar com o esquerdo
  // gira a câmera. Usa Pointer Events porque o Babylon cancela o pointerdown na cena, o que suprime
  // mousedown/mousemove/mouseup do navegador.
  private readonly pointerDown = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    if (e.button === 2) {
      this.press("aim");
      return;
    }
    if (e.button !== 0) return;
    if (this.isPointerLocked || this.held.has("aim")) {
      this.press("fire");
      return;
    }
    this.dragLook = true;
    this.dragLast = { x: e.clientX, y: e.clientY };
  };

  private press(action: GameAction): void {
    if (this.held.has(action)) return;
    this.held.add(action);
    this.countPress(action);
    this.onAction.emit(action);
  }

  private release(action: GameAction): void {
    if (this.held.delete(action)) this.onActionReleased.emit(action);
  }

  private readonly contextMenu = (e: Event) => e.preventDefault();

  private readonly pointerMove = (e: PointerEvent) => {
    if (!this.dragLook || e.pointerType !== "mouse" || this.isPointerLocked) return;
    const mx = e.clientX - this.dragLast.x;
    const my = e.clientY - this.dragLast.y;
    this.dragLast = { x: e.clientX, y: e.clientY };
    this.mouseDx += Math.max(-150, Math.min(150, mx));
    this.mouseDy += Math.max(-150, Math.min(150, my));
  };

  private readonly pointerUp = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    this.dragLook = false;
    if (e.button === 0) this.release("fire");
    if (e.button === 2) this.release("aim");
  };

  private readonly wheel = (e: WheelEvent) => {
    // a cena ocupa a tela inteira: a roda sobre ela é sempre zoom da câmera, nunca rolagem
    e.preventDefault();
    const d = Math.sign(e.deltaY);
    this.wheelDelta += d;
    this.onWheel.emit(d);
  };

  private readonly lockChange = () => {
    const locked = this.isPointerLocked;
    if (!locked) this.held.clear();
    this.dragLook = false;
    this.mouseDx = 0;
    this.mouseDy = 0;
    this.ignoreMouseUntil = performance.now() + 200;
    this.onPointerLockChange.emit(locked);
  };

  private readonly lockError = () => {
    this.onPointerLockError.emit();
  };

  private readonly blur = () => {
    this.held.clear();
    this.presses.clear();
    this.dragLook = false;
  };

  attach(element: HTMLElement): void {
    this.detach();
    this.attachedTo = element;
    window.addEventListener("keydown", this.keyDown);
    window.addEventListener("keyup", this.keyUp);
    window.addEventListener("mousemove", this.mouseMove);
    element.addEventListener("pointerdown", this.pointerDown);
    window.addEventListener("pointermove", this.pointerMove);
    window.addEventListener("pointerup", this.pointerUp);
    window.addEventListener("pointercancel", this.pointerUp);
    element.addEventListener("wheel", this.wheel, { passive: false });
    element.addEventListener("contextmenu", this.contextMenu);
    document.addEventListener("pointerlockchange", this.lockChange);
    document.addEventListener("pointerlockerror", this.lockError);
    window.addEventListener("blur", this.blur);
  }

  detach(): void {
    if (!this.attachedTo) return;
    window.removeEventListener("keydown", this.keyDown);
    window.removeEventListener("keyup", this.keyUp);
    window.removeEventListener("mousemove", this.mouseMove);
    this.attachedTo.removeEventListener("pointerdown", this.pointerDown);
    window.removeEventListener("pointermove", this.pointerMove);
    window.removeEventListener("pointerup", this.pointerUp);
    window.removeEventListener("pointercancel", this.pointerUp);
    this.attachedTo.removeEventListener("wheel", this.wheel);
    this.attachedTo.removeEventListener("contextmenu", this.contextMenu);
    document.removeEventListener("pointerlockchange", this.lockChange);
    document.removeEventListener("pointerlockerror", this.lockError);
    window.removeEventListener("blur", this.blur);
    this.attachedTo = null;
  }

  get isPointerLocked(): boolean {
    return !!this.attachedTo && document.pointerLockElement === this.attachedTo;
  }

  /** Pede o pointer lock; resolve quando o pedido é aceito/recusado (sem lançar). */
  async requestPointerLock(): Promise<void> {
    if (!this.attachedTo || this.isPointerLocked || !this.pointerLockAllowed) return;
    try {
      const p = this.attachedTo.requestPointerLock({ unadjustedMovement: true } as PointerLockOptions) as unknown;
      if (p instanceof Promise) await p;
    } catch {
      try {
        const p = this.attachedTo.requestPointerLock() as unknown;
        if (p instanceof Promise) await p;
      } catch {
        /* navegador sem suporte ou permissão: o arrastar do mouse assume (mouseDown/mouseMove) */
      }
    }
  }

  exitPointerLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isHeld(action: GameAction): boolean {
    return this.enabled && this.held.has(action);
  }

  /** Vetor de movimento no plano (x: direita, y: frente): teclas digitais + eixo analógico, módulo ≤ 1. */
  moveAxis(): { x: number; y: number } {
    const { x, y } = this.rawAxis();
    const len = Math.hypot(x, y);
    if (len > 1) return { x: x / len, y: y / len };
    return { x, y };
  }

  /** Eixos sem normalização (veículos: acelerador e volante independentes), cada um em [-1, 1]. */
  rawAxis(): { x: number; y: number } {
    if (!this.enabled) return { x: 0, y: 0 };
    let x = this.analogX;
    let y = this.analogY;
    if (this.held.has("forward")) y += 1;
    if (this.held.has("back")) y -= 1;
    if (this.held.has("right")) x += 1;
    if (this.held.has("left")) x -= 1;
    return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
  }

  /**
   * Define o eixo analógico de movimento (joystick virtual de toque ou gamepad).
   * Valores fora do círculo unitário são normalizados; NaN é tratado como zero.
   */
  setAnalogAxis(x: number, y: number): void {
    const ax = Number.isFinite(x) ? x : 0;
    const ay = Number.isFinite(y) ? y : 0;
    const len = Math.hypot(ax, ay);
    if (len > 1) {
      this.analogX = ax / len;
      this.analogY = ay / len;
    } else {
      this.analogX = ax;
      this.analogY = ay;
    }
  }

  get analogAxis(): { x: number; y: number } {
    return { x: this.analogX, y: this.analogY };
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
    this.presses.clear();
    this.analogX = 0;
    this.analogY = 0;
  }

  /** Simula pressionar/soltar uma ação (testes, controles virtuais/touch). */
  simulate(action: GameAction, pressed: boolean): void {
    if (pressed) {
      if (!this.held.has(action)) {
        this.held.add(action);
        this.countPress(action);
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

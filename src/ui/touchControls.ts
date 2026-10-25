import { TypedEvent } from "@/core/events";
import type { GameAction, InputManager } from "@/core/input";

/** Em que contexto os controles de toque estão: define o que aparece na tela. */
export type TouchMode = "hidden" | "play" | "dialogue" | "choices";

/** Raio (px CSS) em que o polegar atinge o módulo 1 do joystick. */
export const JOYSTICK_RADIUS = 58;
/** Fração do raio ignorada em torno do centro (evita andar ao encostar o dedo). */
export const JOYSTICK_DEADZONE = 0.16;
/** Fração do raio a partir da qual o joystick passa a correr. */
export const JOYSTICK_RUN_THRESHOLD = 0.88;
/** Pixels de "mouse" por pixel de dedo arrastado na metade direita da tela. */
export const TOUCH_LOOK_GAIN = 2.4;
/** Toque curto: menos que isto em ms e em px conta como "tap" (avança diálogo). */
const TAP_MAX_MS = 320;
const TAP_MAX_PX = 12;

export interface JoystickSample {
  /** Eixo x (direita) e y (frente) já normalizados — módulo 1 fora da zona morta, 0 dentro. */
  x: number;
  y: number;
  /** Deslocamento do polegar em relação ao raio, limitado a 1 (para desenhar o botão). */
  magnitude: number;
  /** Polegar além do limiar de corrida. */
  run: boolean;
}

/**
 * Lógica pura do joystick virtual (testável sem DOM): converte o deslocamento do dedo
 * em px (y cresce para baixo na tela) num eixo de movimento com zona morta e anel de corrida.
 * A direção é normalizada para que a velocidade de caminhada (e a animação) fique constante;
 * empurrar além do limiar troca andar por correr.
 */
export function joystickVector(dx: number, dy: number, radius = JOYSTICK_RADIUS, deadzone = JOYSTICK_DEADZONE, runThreshold = JOYSTICK_RUN_THRESHOLD): JoystickSample {
  const nx = dx / radius;
  const ny = -dy / radius;
  const raw = Math.hypot(nx, ny);
  const magnitude = Math.min(1, raw);
  if (!(raw > deadzone)) return { x: 0, y: 0, magnitude: Number.isFinite(magnitude) ? magnitude : 0, run: false };
  return { x: nx / raw, y: ny / raw, magnitude, run: raw >= runThreshold };
}

/**
 * Decide se os controles de toque devem começar ativos.
 * `?touch=1|0` força; `true` para ponteiro grosso (celular/tablet); `null` quando há
 * tela sensível mas o ponteiro principal é fino (notebook com touch) — ativa no primeiro toque.
 */
export function detectTouchPreference(win: Window = window): boolean | null {
  const forced = new URLSearchParams(win.location.search).get("touch");
  if (forced === "1" || forced === "true") return true;
  if (forced === "0" || forced === "false") return false;
  const nav = win.navigator;
  const touchCapable = (nav.maxTouchPoints ?? 0) > 0 || "ontouchstart" in win;
  if (!touchCapable) return false;
  const coarse = win.matchMedia?.("(pointer: coarse)").matches || win.matchMedia?.("(hover: none)").matches;
  return coarse ? true : null;
}

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`Elemento #${id} não encontrado no index.html`);
  return e as T;
}

/**
 * Controles de toque para celular/tablet: joystick virtual flutuante na metade esquerda
 * (empurrar mais = correr), arrastar na metade direita gira a câmera (sem pointer lock),
 * botões de Interagir/Agachar/Correr/Pausa e toque curto para avançar o diálogo.
 * Alimenta o mesmo InputManager do teclado, então toda a lógica do jogo permanece igual.
 */
export class TouchControls {
  /** Toque curto na cena (sem arrastar) — o jogo decide se avança uma fala. */
  readonly onTap = new TypedEvent<void>();
  readonly onEnabledChange = new TypedEvent<boolean>();
  enabled = false;
  mode: TouchMode = "hidden";

  private readonly root = el("touch");
  private readonly joystick = el("joystick");
  private readonly knob = el("joystick-knob");
  private readonly btnInteract = el<HTMLButtonElement>("tc-interact");
  private readonly btnCrouch = el<HTMLButtonElement>("tc-crouch");
  private readonly btnRun = el<HTMLButtonElement>("tc-run");
  private readonly btnPause = el<HTMLButtonElement>("tc-pause");

  private joyPointer: number | null = null;
  private joyOrigin = { x: 0, y: 0 };
  private joyRun = false;
  private runLatch = false;
  private lookPointer: number | null = null;
  private lookLast = { x: 0, y: 0 };
  private lookStart = { x: 0, y: 0, t: 0 };
  private lookMoved = false;

  constructor(
    private readonly input: InputManager,
    private readonly canvas: HTMLCanvasElement,
  ) {
    const pref = detectTouchPreference();
    if (pref === true) this.enable();
    else if (pref === null) window.addEventListener("pointerdown", this.firstTouch, { passive: true });

    canvas.addEventListener("pointerdown", this.pointerDown);
    window.addEventListener("pointermove", this.pointerMove);
    window.addEventListener("pointerup", this.pointerUp);
    window.addEventListener("pointercancel", this.pointerUp);
    // iOS/Android: impede rolagem, zoom por pinça e "puxar para atualizar" sobre a cena
    const block = (e: Event) => {
      if (this.enabled) e.preventDefault();
    };
    canvas.addEventListener("touchstart", block, { passive: false });
    canvas.addEventListener("touchmove", block, { passive: false });
    this.root.addEventListener("touchmove", block, { passive: false });

    this.bindPress(this.btnInteract, "interact");
    this.bindPress(this.btnCrouch, "crouchToggle");
    this.bindPress(this.btnPause, "pause");
    this.bindTap(this.btnRun, () => {
      this.runLatch = !this.runLatch;
      this.btnRun.classList.toggle("latched", this.runLatch);
      this.updateRun();
    });
    // tocar no objetivo mostra a descrição da missão (equivale ao Tab)
    document.getElementById("objective")?.addEventListener("click", () => {
      if (this.enabled && this.mode === "play") this.press("objectives");
    });
    this.setMode("hidden");
  }

  /** Liga os controles (ponteiro grosso detectado ou primeiro toque na tela). */
  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    document.body.classList.add("touch-mode");
    window.removeEventListener("pointerdown", this.firstTouch);
    const hint = document.getElementById("menu-controls-hint");
    if (hint) hint.textContent = "Joystick à esquerda · arraste à direita para olhar · botões E, agachar e correr";
    const cont = document.getElementById("subtitle-continue");
    if (cont) cont.textContent = "Toque na tela · continuar";
    this.applyMode();
    this.onEnabledChange.emit(true);
  }

  setMode(mode: TouchMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    if (mode !== "play") this.releaseJoystick();
    this.applyMode();
  }

  /** Destaca o botão E quando há algo interagível à frente. */
  setInteractAvailable(available: boolean): void {
    this.btnInteract.classList.toggle("active", available);
  }

  setCrouched(crouched: boolean): void {
    this.btnCrouch.classList.toggle("latched", crouched);
  }

  /** Tela cheia + orientação horizontal quando o navegador permitir (chamar a partir de um gesto do usuário). */
  async requestImmersive(): Promise<void> {
    if (!this.enabled) return;
    const doc = document as Document & { webkitFullscreenElement?: Element };
    try {
      if (document.fullscreenEnabled && !document.fullscreenElement && !doc.webkitFullscreenElement) {
        await document.documentElement.requestFullscreen({ navigationUI: "hide" });
      }
    } catch {
      /* iOS Safari não permite tela cheia para páginas; segue sem */
    }
    try {
      const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      if (orientation?.lock && document.fullscreenElement) await orientation.lock("landscape");
    } catch {
      /* travar orientação é opcional */
    }
  }

  private applyMode(): void {
    const visible = this.enabled && this.mode !== "hidden";
    this.root.classList.toggle("visible", visible);
    this.root.setAttribute("aria-hidden", visible ? "false" : "true");
    for (const m of ["play", "dialogue", "choices"] as const) this.root.classList.toggle(`mode-${m}`, this.mode === m);
  }

  private readonly firstTouch = (e: PointerEvent) => {
    if (e.pointerType === "touch") this.enable();
  };

  private isTouch(e: PointerEvent): boolean {
    return e.pointerType === "touch" || e.pointerType === "pen";
  }

  private readonly pointerDown = (e: PointerEvent) => {
    if (!this.isTouch(e)) return;
    if (!this.enabled) this.enable();
    if (this.mode === "hidden" || this.mode === "choices") return;
    const leftHalf = e.clientX < window.innerWidth * 0.5;
    if (this.mode === "play" && leftHalf && this.joyPointer === null) {
      this.joyPointer = e.pointerId;
      this.joyOrigin = { x: e.clientX, y: e.clientY };
      this.joystick.classList.add("active");
      this.placeJoystick(e.clientX, e.clientY);
      this.moveKnob(0, 0);
      e.preventDefault();
      return;
    }
    if (this.lookPointer === null) {
      this.lookPointer = e.pointerId;
      this.lookLast = { x: e.clientX, y: e.clientY };
      this.lookStart = { x: e.clientX, y: e.clientY, t: performance.now() };
      this.lookMoved = false;
      e.preventDefault();
    }
  };

  private readonly pointerMove = (e: PointerEvent) => {
    if (e.pointerId === this.joyPointer) {
      const dx = e.clientX - this.joyOrigin.x;
      const dy = e.clientY - this.joyOrigin.y;
      const s = joystickVector(dx, dy);
      this.input.setAnalogAxis(s.x, s.y);
      this.joyRun = s.run;
      this.updateRun();
      const k = s.magnitude * JOYSTICK_RADIUS;
      const len = Math.hypot(dx, dy) || 1;
      this.moveKnob((dx / len) * k, (dy / len) * k);
      this.joystick.classList.toggle("running", s.run);
    } else if (e.pointerId === this.lookPointer) {
      const dx = e.clientX - this.lookLast.x;
      const dy = e.clientY - this.lookLast.y;
      this.lookLast = { x: e.clientX, y: e.clientY };
      if (Math.hypot(e.clientX - this.lookStart.x, e.clientY - this.lookStart.y) > TAP_MAX_PX) this.lookMoved = true;
      if (this.mode === "play") this.input.injectMouseDelta(dx * TOUCH_LOOK_GAIN, dy * TOUCH_LOOK_GAIN);
    }
  };

  private readonly pointerUp = (e: PointerEvent) => {
    if (e.pointerId === this.joyPointer) {
      this.releaseJoystick();
    } else if (e.pointerId === this.lookPointer) {
      this.lookPointer = null;
      const quick = performance.now() - this.lookStart.t < TAP_MAX_MS;
      if (quick && !this.lookMoved && e.type === "pointerup") this.onTap.emit();
    }
  };

  private releaseJoystick(): void {
    if (this.joyPointer === null && !this.joyRun) return;
    this.joyPointer = null;
    this.joyRun = false;
    this.input.setAnalogAxis(0, 0);
    this.updateRun();
    this.joystick.classList.remove("active", "running");
    this.joystick.style.left = "";
    this.joystick.style.top = "";
    this.moveKnob(0, 0);
  }

  private updateRun(): void {
    this.input.simulate("run", this.runLatch || this.joyRun);
  }

  private placeJoystick(x: number, y: number): void {
    this.joystick.style.left = `${x}px`;
    this.joystick.style.top = `${y}px`;
  }

  private moveKnob(x: number, y: number): void {
    this.knob.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  }

  private press(action: GameAction): void {
    this.input.simulate(action, true);
    this.input.simulate(action, false);
  }

  /** Botão que dispara a ação ao encostar (resposta imediata, sem esperar o click de 300 ms). */
  private bindPress(button: HTMLButtonElement, action: GameAction): void {
    this.bindTap(button, () => this.press(action));
  }

  private bindTap(button: HTMLButtonElement, handler: () => void): void {
    let activePointer: number | null = null;
    button.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (activePointer !== null) return;
      activePointer = e.pointerId;
      button.classList.add("pressed");
      handler();
    });
    const release = (e: PointerEvent) => {
      if (e.pointerId !== activePointer) return;
      activePointer = null;
      button.classList.remove("pressed");
    };
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("pointerleave", release);
    // o click sintético chega depois do pointerdown; já tratamos — evita ação duplicada
    button.addEventListener("click", (e) => e.preventDefault());
    button.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  /** Estado para testes automatizados. */
  snapshot(): Record<string, unknown> {
    return { enabled: this.enabled, mode: this.mode, joystickActive: this.joyPointer !== null, lookActive: this.lookPointer !== null, runLatch: this.runLatch };
  }
}

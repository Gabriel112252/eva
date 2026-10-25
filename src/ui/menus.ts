import { TypedEvent } from "@/core/events";
import { sanitizeSettings, type GameSettings } from "@/core/settings";

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`Elemento #${id} não encontrado`);
  return e as T;
}

export type ScreenName = "loading" | "menu" | "pause" | "options" | "about" | "none";

/** Telas de menu (principal, pausa, opções, sobre) e tela de carregamento. */
export class Menus {
  readonly onContinue = new TypedEvent<void>();
  readonly onNewGame = new TypedEvent<void>();
  readonly onResume = new TypedEvent<void>();
  readonly onSave = new TypedEvent<void>();
  readonly onQuitToMenu = new TypedEvent<void>();
  readonly onSettingsChanged = new TypedEvent<GameSettings>();

  private screens: Record<Exclude<ScreenName, "none">, HTMLElement> = {
    loading: el("loading"),
    menu: el("menu"),
    pause: el("pause"),
    options: el("options"),
    about: el("about"),
  };
  private current: ScreenName = "loading";
  private optionsReturnTo: ScreenName = "menu";
  private form = el<HTMLFormElement>("options-form");
  private settings: GameSettings;

  constructor(settings: GameSettings) {
    this.settings = settings;
    el("btn-continue").addEventListener("click", () => this.onContinue.emit());
    el("btn-new").addEventListener("click", () => this.onNewGame.emit());
    el("btn-options").addEventListener("click", () => this.openOptions("menu"));
    el("btn-about").addEventListener("click", () => this.show("about"));
    el("btn-about-back").addEventListener("click", () => this.show("menu"));
    el("btn-resume").addEventListener("click", () => this.onResume.emit());
    el("btn-save").addEventListener("click", () => this.onSave.emit());
    el("btn-pause-options").addEventListener("click", () => this.openOptions("pause"));
    el("btn-quit").addEventListener("click", () => this.onQuitToMenu.emit());
    el("btn-options-back").addEventListener("click", () => this.show(this.optionsReturnTo));
    this.form.addEventListener("input", () => this.readForm());
    this.form.addEventListener("change", () => this.readForm());
    this.writeForm();
  }

  get currentScreen(): ScreenName {
    return this.current;
  }

  show(name: ScreenName): void {
    for (const [key, node] of Object.entries(this.screens)) node.classList.toggle("visible", key === name);
    this.current = name;
    if (name === "menu") {
      const first = el("btn-continue").hidden ? el("btn-new") : el("btn-continue");
      first.focus();
    } else if (name === "pause") {
      el("btn-resume").focus();
    }
  }

  setContinueAvailable(available: boolean): void {
    el("btn-continue").hidden = !available;
  }

  setLoading(progress: number, label: string): void {
    el("loading-bar").style.width = `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`;
    el("loading-label").textContent = label;
  }

  setLoadingError(message: string): void {
    const e = el("loading-error");
    e.hidden = false;
    e.textContent = message;
  }

  setPauseStatus(text: string): void {
    el("pause-status").textContent = text;
  }

  private openOptions(returnTo: ScreenName): void {
    this.optionsReturnTo = returnTo;
    this.writeForm();
    this.show("options");
  }

  private writeForm(): void {
    const f = this.form;
    for (const [key, value] of Object.entries(this.settings)) {
      const input = f.elements.namedItem(key) as HTMLInputElement | HTMLSelectElement | null;
      if (!input) continue;
      if (input instanceof HTMLInputElement && input.type === "checkbox") input.checked = value === true;
      else input.value = String(value);
      const out = input.parentElement?.querySelector("output");
      if (out) out.textContent = typeof value === "number" ? value.toFixed(2) : "";
    }
  }

  private readForm(): void {
    const f = this.form;
    const raw: Record<string, unknown> = {};
    for (const key of Object.keys(this.settings)) {
      const input = f.elements.namedItem(key) as HTMLInputElement | HTMLSelectElement | null;
      if (!input) continue;
      if (input instanceof HTMLInputElement && input.type === "checkbox") raw[key] = input.checked;
      else if (input instanceof HTMLInputElement && input.type === "range") raw[key] = Number(input.value);
      else raw[key] = input.value;
      const out = input.parentElement?.querySelector("output");
      if (out && input instanceof HTMLInputElement && input.type === "range") out.textContent = Number(input.value).toFixed(2);
    }
    this.settings = sanitizeSettings({ ...this.settings, ...raw });
    this.onSettingsChanged.emit(this.settings);
  }
}

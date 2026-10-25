import type { DialogueChoice } from "@/narrative/dialogue";
import type { InputManager, GameAction } from "@/core/input";

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`Elemento #${id} não encontrado no index.html`);
  return e as T;
}

/** HUD discreto: objetivo, prompt de interação, avisos, legendas, escolhas, letterbox e fade. */
export class Hud {
  private root = el("hud");
  private objective = el("objective");
  private objectiveText = el("objective-text");
  private objectiveHint = el("objective-hint");
  private notice = el("notice");
  private prompt = el("prompt");
  private promptText = el("prompt-text");
  private clickHint = el("click-hint");
  private letterTop = el("letterbox-top");
  private letterBottom = el("letterbox-bottom");
  private subtitle = el("subtitle");
  private subtitleSpeaker = el("subtitle-speaker");
  private subtitleText = el("subtitle-text");
  private choices = el("choices");
  private fade = el("fade");
  private noticeTimer = 0;
  private typingTimer = 0;
  private choiceResolver: ((index: number) => void) | null = null;
  private choiceButtons: HTMLButtonElement[] = [];
  private focusedChoice = 0;
  subtitlesEnabled = true;

  constructor(private readonly input: InputManager) {
    input.onAction.on((a) => this.handleAction(a));
  }

  show(): void {
    this.root.classList.remove("hidden");
  }

  hide(): void {
    this.root.classList.add("hidden");
  }

  private objectiveHidden = false;
  private hasObjective = false;

  setObjective(text: string | null, hint = ""): void {
    this.hasObjective = !!text;
    if (!text) {
      this.objective.classList.remove("visible");
      return;
    }
    this.objectiveText.textContent = text;
    this.objectiveHint.textContent = hint;
    this.objective.classList.toggle("visible", !this.objectiveHidden);
  }

  /** Oculta temporariamente o objetivo (diálogos em letterbox). */
  setObjectiveVisible(visible: boolean): void {
    this.objectiveHidden = !visible;
    this.objective.classList.toggle("visible", visible && this.hasObjective);
  }

  showNotice(text: string, seconds = 3.5): void {
    window.clearTimeout(this.noticeTimer);
    this.notice.textContent = text;
    this.notice.classList.add("visible");
    this.noticeTimer = window.setTimeout(() => this.notice.classList.remove("visible"), seconds * 1000);
  }

  setPrompt(text: string | null): void {
    if (!text) {
      this.prompt.classList.remove("visible");
      return;
    }
    if (this.promptText.textContent !== text) this.promptText.textContent = text;
    this.prompt.classList.add("visible");
  }

  setClickHint(visible: boolean): void {
    this.clickHint.classList.toggle("visible", visible);
  }

  setLetterbox(visible: boolean): void {
    this.letterTop.classList.toggle("visible", visible);
    this.letterBottom.classList.toggle("visible", visible);
  }

  /** Fade para preto (true) ou revela a cena (false). */
  setFade(black: boolean): void {
    this.fade.classList.toggle("clear", !black);
  }

  /** Mostra uma legenda com efeito de digitação curto. */
  showSubtitle(speaker: string, text: string, canContinue: boolean): void {
    window.clearInterval(this.typingTimer);
    this.subtitleSpeaker.textContent = speaker;
    this.subtitle.classList.toggle("can-continue", false);
    if (!this.subtitlesEnabled) {
      this.subtitleText.textContent = "";
      this.subtitle.classList.remove("visible");
      return;
    }
    this.subtitle.classList.add("visible");
    let i = 0;
    const total = text.length;
    const step = Math.max(1, Math.round(total / 40));
    this.subtitleText.textContent = "";
    this.typingTimer = window.setInterval(() => {
      i = Math.min(total, i + step);
      this.subtitleText.textContent = text.slice(0, i);
      if (i >= total) {
        window.clearInterval(this.typingTimer);
        if (canContinue) this.subtitle.classList.add("can-continue");
      }
    }, 16);
  }

  markCanContinue(): void {
    this.subtitle.classList.add("can-continue");
  }

  hideSubtitle(): void {
    window.clearInterval(this.typingTimer);
    this.subtitle.classList.remove("visible");
    this.subtitle.classList.remove("can-continue");
  }

  /** Lista de escolhas; resolve com o índice (teclado 1–4, setas+Enter, ou clique). */
  showChoices(choices: DialogueChoice[]): Promise<number> {
    this.choices.innerHTML = "";
    this.choiceButtons = [];
    this.focusedChoice = 0;
    choices.forEach((c, i) => {
      const b = document.createElement("button");
      b.className = "choice-btn";
      b.type = "button";
      b.innerHTML = `<kbd>${i + 1}</kbd><span></span>`;
      b.querySelector("span")!.textContent = c.text;
      b.addEventListener("click", () => this.resolveChoice(i));
      b.addEventListener("mouseenter", () => this.focusChoice(i));
      this.choices.appendChild(b);
      this.choiceButtons.push(b);
    });
    this.choices.classList.add("visible");
    this.focusChoice(0);
    return new Promise<number>((resolve) => {
      this.choiceResolver = resolve;
    });
  }

  private focusChoice(i: number): void {
    this.focusedChoice = i;
    this.choiceButtons.forEach((b, k) => b.classList.toggle("focused", k === i));
  }

  private resolveChoice(i: number): void {
    const r = this.choiceResolver;
    if (!r) return;
    this.choiceResolver = null;
    this.choices.classList.remove("visible");
    this.choices.innerHTML = "";
    this.choiceButtons = [];
    r(i);
  }

  get hasPendingChoice(): boolean {
    return this.choiceResolver !== null;
  }

  private handleAction(a: GameAction): void {
    if (!this.choiceResolver) return;
    switch (a) {
      case "choice1":
      case "choice2":
      case "choice3":
      case "choice4": {
        const i = Number(a.slice(-1)) - 1;
        if (i < this.choiceButtons.length) this.resolveChoice(i);
        break;
      }
      case "forward":
        this.focusChoice((this.focusedChoice - 1 + this.choiceButtons.length) % this.choiceButtons.length);
        break;
      case "back":
        this.focusChoice((this.focusedChoice + 1) % this.choiceButtons.length);
        break;
      case "advance":
      case "interact":
        this.resolveChoice(this.focusedChoice);
        break;
      default:
        break;
    }
  }
}

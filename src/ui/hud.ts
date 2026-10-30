import type { DialogueChoice } from "@/narrative/dialogue";
import type { InputManager, GameAction } from "@/core/input";
import { TypedEvent } from "@/core/events";

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
  private vitals = el("vitals");
  private healthBar = el("health-bar");
  private ammo = el("ammo");
  private ammoMag = el("ammo-mag");
  private ammoReserve = el("ammo-reserve");
  private ammoLabel = el("ammo-label");
  private crosshair = el("crosshair");
  private hitmarker = el("hitmarker");
  private damageVignette = el("damage-vignette");
  private vehicleHud = el("vehicle-hud");
  private vehicleName = el("vehicle-name");
  private vehicleSpeed = el("vehicle-speed");
  private vehicleAlt = el("vehicle-alt");
  private vehicleHint = el("vehicle-hint");
  private inventory = el("inventory");
  private inventoryList = el("inventory-list");
  private clueList = el("clue-list");
  private clueCount = el("inventory-clue-count");
  private tabItems = el<HTMLButtonElement>("inventory-tab-items");
  private tabClues = el<HTMLButtonElement>("inventory-tab-clues");
  private missionTimer = el("mission-timer");
  private missionTimerLabel = el("mission-timer-label");
  private missionTimerClock = el("mission-timer-clock");
  private awareness = el("awareness");
  private awarenessFill = el("awareness-fill");
  private awarenessLabel = el("awareness-label");
  private repair = el("repair");
  private repairName = el("repair-name");
  private repairStep = el("repair-step");
  private repairZone = el("repair-zone");
  private repairBar = el("repair-bar");
  private examine = el("examine");
  private examineTitle = el("examine-title");
  private examineText = el("examine-text");
  /** aba ativa da mochila */
  inventoryTab: "itens" | "pistas" = "itens";
  private death = el("death");
  private deathText = el("death-text");
  private missionEnd = el("mission-end");
  private missionEndTitle = el("mission-end-title");
  private missionEndText = el("mission-end-text");
  private missionEndStats = el("mission-end-stats");
  private missionEndKicker = el("mission-end-kicker");
  private missionEndContinue = el<HTMLButtonElement>("btn-mission-continue");
  readonly onRetry = new TypedEvent<void>();
  readonly onMissionContinue = new TypedEvent<void>();
  readonly onMissionMenu = new TypedEvent<void>();
  private hitTimer = 0;
  private vignetteTimer = 0;
  private noticeTimer = 0;
  private typingTimer = 0;
  private choiceResolver: ((index: number) => void) | null = null;
  private choiceButtons: HTMLButtonElement[] = [];
  private focusedChoice = 0;
  subtitlesEnabled = true;

  constructor(private readonly input: InputManager) {
    input.onAction.on((a) => this.handleAction(a));
    el("btn-retry").addEventListener("click", () => this.onRetry.emit());
    el("btn-mission-continue").addEventListener("click", () => this.onMissionContinue.emit());
    el("btn-mission-menu").addEventListener("click", () => this.onMissionMenu.emit());
    this.tabItems.addEventListener("click", () => this.setInventoryTab("itens"));
    this.tabClues.addEventListener("click", () => this.setInventoryTab("pistas"));
  }

  // --- Capítulo 1: pistas, timer, furtividade, reparo, exame -----------------------------------
  setInventoryTab(tab: "itens" | "pistas"): void {
    this.inventoryTab = tab;
    this.tabItems.classList.toggle("active", tab === "itens");
    this.tabClues.classList.toggle("active", tab === "pistas");
    this.inventoryList.hidden = tab !== "itens";
    this.clueList.hidden = tab !== "pistas";
  }

  /** Aba "Pistas" da mochila (ordem de descoberta). */
  setClues(clues: Array<{ title: string; text: string; source: string }>): void {
    this.clueCount.textContent = clues.length ? `(${clues.length})` : "";
    this.clueList.replaceChildren(
      ...(clues.length
        ? clues.map((c) => {
            const li = document.createElement("li");
            const t = document.createElement("span");
            t.className = "clue-title";
            t.textContent = c.title;
            const x = document.createElement("span");
            x.className = "clue-text";
            x.textContent = c.text;
            const s = document.createElement("span");
            s.className = "clue-source";
            s.textContent = c.source;
            li.append(t, x, s);
            return li;
          })
        : [Object.assign(document.createElement("li"), { textContent: "Nenhuma pista anotada ainda", className: "empty" })]),
    );
  }

  /** Contagem regressiva no canto superior direito; `null` esconde. */
  setTimer(label: string | null, clock = "", urgent = false): void {
    this.missionTimer.classList.toggle("visible", label !== null);
    if (label === null) return;
    if (this.missionTimerLabel.textContent !== label) this.missionTimerLabel.textContent = label;
    if (this.missionTimerClock.textContent !== clock) this.missionTimerClock.textContent = clock;
    this.missionTimer.classList.toggle("urgent", urgent);
  }

  /**
   * Olho que enche: `level` 0..1 (0 esconde), `state` muda a cor (suspeito claro, alerta âmbar,
   * perseguição vermelho).
   */
  setAwareness(level: number, state: "calmo" | "suspeito" | "alerta" | "perseguicao"): void {
    const visible = level > 0.001 && state !== "calmo";
    this.awareness.classList.toggle("visible", visible);
    if (!visible) return;
    const pct = Math.max(0, Math.min(1, level));
    // o retângulo de recorte sobe do fundo (y=40) até o topo (y=0)
    this.awarenessFill.setAttribute("y", (40 - pct * 40).toFixed(1));
    this.awareness.classList.toggle("alert", state === "alerta");
    this.awareness.classList.toggle("pursuit", state === "perseguicao");
    const label = state === "suspeito" ? "suspeita" : state === "alerta" ? "alerta" : "perseguição";
    if (this.awarenessLabel.textContent !== label) this.awarenessLabel.textContent = label;
  }

  /** Barra do minigame de reparo; `null` esconde. */
  setRepair(view: { title: string; step: number; steps: number; fill: number; zone: [number, number]; result: "hit" | "miss" | null } | null): void {
    this.repair.classList.toggle("visible", view !== null);
    if (!view) return;
    if (this.repairName.textContent !== view.title) this.repairName.textContent = view.title;
    const stepText = `passo ${Math.min(view.step + 1, view.steps)}/${view.steps}`;
    if (this.repairStep.textContent !== stepText) this.repairStep.textContent = stepText;
    this.repairZone.style.left = `${(view.zone[0] * 100).toFixed(1)}%`;
    this.repairZone.style.width = `${((view.zone[1] - view.zone[0]) * 100).toFixed(1)}%`;
    this.repairBar.style.width = `${(Math.max(0, Math.min(1, view.fill)) * 100).toFixed(1)}%`;
    this.repair.classList.toggle("failed", view.result === "miss");
    this.repair.classList.toggle("hit", view.result === "hit");
  }

  showExamine(title: string, text: string): void {
    this.examineTitle.textContent = title;
    this.examineText.textContent = text;
    this.examine.classList.add("visible");
  }

  hideExamine(): void {
    this.examine.classList.remove("visible");
  }

  get examineVisible(): boolean {
    return this.examine.classList.contains("visible");
  }

  // --- vertical slice: vitais, mira, veículo, mochila, morte, fim de missão ----------------------
  /** Barra de vida (0..1). `visible` false esconde o bloco todo (antes de Matias ter uma arma). */
  setVitals(visible: boolean, health01: number): void {
    this.vitals.classList.toggle("visible", visible);
    const pct = Math.max(0, Math.min(1, health01));
    this.healthBar.style.width = `${(pct * 100).toFixed(0)}%`;
    this.healthBar.classList.toggle("low", pct < 0.3);
  }

  setAmmo(weaponName: string | null, mag: number, reserve: number, reloading: boolean): void {
    if (!weaponName) {
      this.ammo.style.display = "none";
      return;
    }
    this.ammo.style.display = "flex";
    this.ammoMag.textContent = reloading ? "…" : String(mag);
    this.ammoReserve.textContent = `/ ${reserve}`;
    this.ammoLabel.textContent = weaponName;
    this.ammo.classList.toggle("reloading", reloading);
  }

  setCrosshair(visible: boolean, spread = false): void {
    this.crosshair.classList.toggle("visible", visible);
    this.crosshair.classList.toggle("spread", spread);
  }

  /** Marcador de acerto (X) — vermelho quando o tiro derrubou o alvo. */
  showHitMarker(kill: boolean): void {
    window.clearTimeout(this.hitTimer);
    this.hitmarker.classList.remove("fading");
    this.hitmarker.classList.toggle("kill", kill);
    this.hitmarker.classList.add("visible");
    this.hitTimer = window.setTimeout(() => {
      this.hitmarker.classList.add("fading");
      this.hitmarker.classList.remove("visible");
    }, 90);
  }

  /** Vinheta vermelha ao sofrer dano. */
  flashDamage(): void {
    window.clearTimeout(this.vignetteTimer);
    this.damageVignette.classList.add("visible");
    this.vignetteTimer = window.setTimeout(() => this.damageVignette.classList.remove("visible"), 220);
  }

  setVehicle(name: string | null, hint = ""): void {
    this.vehicleHud.classList.toggle("visible", !!name);
    if (name) {
      this.vehicleName.textContent = name;
      this.vehicleHint.textContent = hint;
    }
  }

  setVehicleSpeed(kmh: number, altitude: number | null): void {
    const v = String(Math.round(kmh));
    if (this.vehicleSpeed.textContent !== v) this.vehicleSpeed.textContent = v;
    this.vehicleAlt.textContent = altitude === null ? "" : altitude >= 1000 ? `alt ${(altitude / 1000).toFixed(altitude >= 10000 ? 0 : 1)} km` : `alt ${altitude.toFixed(1)} m`;
  }

  setInventory(visible: boolean, items: Array<{ name: string; count: number; note?: string }>): void {
    this.inventory.classList.toggle("visible", visible);
    if (!visible) return;
    this.inventoryList.replaceChildren(
      ...(items.length
        ? items.map((it) => {
            const li = document.createElement("li");
            const a = document.createElement("span");
            a.textContent = it.name;
            const b = document.createElement("span");
            b.textContent = it.note ? `${it.count} · ${it.note}` : String(it.count);
            li.append(a, b);
            return li;
          })
        : [Object.assign(document.createElement("li"), { textContent: "Nada além das ferramentas", className: "empty" })]),
    );
  }

  get inventoryVisible(): boolean {
    return this.inventory.classList.contains("visible");
  }

  showDeath(text: string): void {
    this.deathText.textContent = text;
    this.death.classList.add("visible");
    el("btn-retry").focus();
  }

  hideDeath(): void {
    this.death.classList.remove("visible");
  }

  /**
   * Tela de conclusão. `opts.kicker` troca a linha de cima (padrão "Capítulo 0 concluído"; o Capítulo 1 usa
   * "Fim do Capítulo 1") e `opts.continueLabel` o texto do botão de continuar.
   */
  showMissionEnd(title: string, text: string, stats: Array<[string, string]>, opts: { kicker?: string; continueLabel?: string } = {}): void {
    this.missionEndKicker.textContent = opts.kicker ?? "Capítulo 0 concluído";
    this.missionEndContinue.textContent = opts.continueLabel ?? "Continuar explorando";
    this.missionEndTitle.textContent = title;
    this.missionEndText.textContent = text;
    this.missionEndStats.replaceChildren(
      ...stats.map(([k, v]) => {
        const li = document.createElement("li");
        const a = document.createElement("span");
        a.textContent = k;
        const b = document.createElement("span");
        b.textContent = v;
        li.append(a, b);
        return li;
      }),
    );
    this.missionEnd.classList.add("visible");
  }

  hideMissionEnd(): void {
    this.missionEnd.classList.remove("visible");
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
    if (!this.choiceResolver) {
      // mochila aberta: 1/2 alternam Mochila/Pistas
      if (this.inventoryVisible && a === "choice1") this.setInventoryTab("itens");
      else if (this.inventoryVisible && a === "choice2") this.setInventoryTab("pistas");
      return;
    }
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

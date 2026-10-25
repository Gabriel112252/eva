import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { SpotLight } from "@babylonjs/core/Lights/spotLight";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import "@babylonjs/core/Physics/physicsEngineComponent";
import "@babylonjs/core/Physics/v2/physicsEngineComponent";

import { InputManager, type GameAction } from "./input";
import { DEFAULT_SETTINGS, type GameSettings } from "./settings";
import { enableHavok } from "@/physics/havok";
import { Environment } from "@/world/environment";
import { buildWorld, type World } from "@/world/worldBuilder";
import { loadHeroAssets } from "@/world/heroAssets";
import { loadEvaStaticVehicles } from "@/world/vehiclesPack";
import { STREET } from "@/world/street";
import { loadCharacter, type CharacterModel } from "@/characters/characterModel";
import { Npc } from "@/characters/npc";
import { PlayerController } from "@/player/playerController";
import { ThirdPersonCamera } from "@/player/thirdPersonCamera";
import { pickInteractable, type Interactable } from "@/interaction/interactable";
import { GameFlags } from "@/narrative/flags";
import { DialogueRunner, type DialogueChoice, type DialogueEffect, type DialogueLine, type DialoguePresenter } from "@/narrative/dialogue";
import { QuestLog } from "@/narrative/quests";
import { QUESTS, QUEST_APURACAO } from "@/data/quests";
import { DIALOGUES, RADIO_BULLETIN, SPEAKER_NAMES } from "@/data/dialogues";
import { CHARACTERS, type CharacterVariant } from "@/data/characters";
import { AudioEngine } from "@/audio/audioEngine";
import { VoiceService } from "@/audio/voice";
import { Hud } from "@/ui/hud";
import { Menus } from "@/ui/menus";
import { TouchControls } from "@/ui/touchControls";
import { openStore } from "@/persistence/saveStore";
import { SaveSystem, createEmptySave, type SaveData } from "@/persistence/saveSystem";

export type GameState = "loading" | "menu" | "playing" | "paused" | "dialogue";

const NPC_VARIANTS: CharacterVariant[] = ["miriam", "custodio", "comerciante", "raquel", "ana"];

/** Orquestra engine, mundo, jogador, NPCs, narrativa, áudio, UI e salvamento. */
export class Game {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly input = new InputManager();
  state: GameState = "loading";
  settings: GameSettings = { ...DEFAULT_SETTINGS };

  private env!: Environment;
  private world!: World;
  private player!: PlayerController;
  private camera!: ThirdPersonCamera;
  private npcs: Npc[] = [];
  private interactables: Interactable[] = [];
  private flags = new GameFlags();
  private quests = new QuestLog(QUESTS);
  private dialogue = new DialogueRunner(this.flags, SPEAKER_NAMES);
  private audio!: AudioEngine;
  private voice!: VoiceService;
  private hud!: Hud;
  private menus!: Menus;
  touch!: TouchControls;
  private saves!: SaveSystem;
  private flickerLights: SpotLight[] = [];
  private radioOn = true;
  private radioTimer = 4;
  private radioIndex = 0;
  private radioSpeaking = false;
  private playTime = 0;
  private autosaveTimer = 0;
  private currentPrompt: Interactable | null = null;
  private advanceResolver: (() => void) | null = null;
  private lockWasAcquired = false;
  private matias!: CharacterModel;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, { stencil: true, antialias: true, preserveDrawingBuffer: false, powerPreference: "high-performance" }, false);
    this.scene = new Scene(this.engine);
    // a interação é por raio próprio (pickInteractable); o picking do Babylon em toques/cliques só custaria CPU
    this.scene.skipPointerMovePicking = true;
    this.scene.skipPointerDownPicking = true;
    this.scene.skipPointerUpPicking = true;
    this.scene.autoClear = true;
    window.addEventListener("resize", () => this.engine.resize());
  }

  // ---------------------------------------------------------------------
  // Inicialização
  // ---------------------------------------------------------------------
  async init(): Promise<void> {
    this.saves = new SaveSystem(await openStore());
    const hasSavedSettings = await this.saves.hasSettings();
    this.settings = await this.saves.loadSettings();
    this.touch = new TouchControls(this.input, this.canvas);
    // celular/tablet sem configuração salva: começa em qualidade baixa (GPU móvel, bateria)
    if (this.touch.enabled && !hasSavedSettings) this.settings = { ...this.settings, quality: "baixa" };
    // ?quality=baixa|media|alta força a qualidade nesta sessão (útil em máquinas fracas e testes automatizados)
    const params = new URLSearchParams(window.location.search);
    const q = params.get("quality");
    if (q === "baixa" || q === "media" || q === "alta") this.settings = { ...this.settings, quality: q };
    // ?pointerlock=0: nunca trava o cursor; o mouse gira a câmera arrastando (iframes sem permissão, testes)
    if (params.get("pointerlock") === "0") this.input.pointerLockAllowed = false;
    this.menus = new Menus(this.settings);
    this.hud = new Hud(this.input);
    this.audio = new AudioEngine(this.settings);
    this.voice = new VoiceService(this.audio);
    this.applySettings(this.settings);
    this.input.attach(this.canvas);

    const progress = (p: number, label: string) => this.menus.setLoading(p, label);
    progress(0.02, "Iniciando física Havok…");
    await enableHavok(this.scene);
    progress(0.1, "Luz, céu e sombras…");
    this.env = new Environment(this.scene, this.settings.quality);
    // em telas de alta densidade o canvas já renderiza em px CSS (bem menos que os px físicos); não reduz mais
    if (this.settings.quality === "baixa") this.engine.setHardwareScalingLevel(window.devicePixelRatio > 1.5 ? 1 : 1.35);

    let worldStep = 0;
    this.world = buildWorld(this.scene, this.settings.quality, (label) => {
      worldStep++;
      progress(0.1 + Math.min(0.35, worldStep * 0.06), label);
    });
    progress(0.46, "Montando a praça da Apuração (módulos PBR)…");
    let heroCasters: import("@babylonjs/core/Meshes/abstractMesh").AbstractMesh[] = [];
    try {
      const hero = await loadHeroAssets(this.scene, this.world.ctx);
      heroCasters = hero.shadowCasters;
    } catch (err) {
      console.error("[heroAssets] falha ao carregar os módulos da praça", err);
    }
    progress(0.48, "Estacionando os veículos…");
    try {
      const vehicles = await loadEvaStaticVehicles(this.scene, this.world.ctx);
      heroCasters = [...heroCasters, ...vehicles.shadowCasters];
    } catch (err) {
      console.error("[vehiclesPack] falha ao carregar os veículos", err);
    }
    progress(0.5, "Carregando Matias…");
    this.matias = await loadCharacter(this.scene, "matias");
    const spawn = this.world.spawns.get("oficina")!;
    this.player = new PlayerController(this.scene, this.matias, spawn.position, spawn.yaw);
    this.player.onFootstep.on((step) => this.audio.playFootstep(step.kind, step.surface));
    this.camera = new ThirdPersonCamera(this.scene, spawn.yaw);
    this.scene.activeCamera = this.camera.camera;

    for (let i = 0; i < NPC_VARIANTS.length; i++) {
      const v = NPC_VARIANTS[i]!;
      progress(0.55 + i * 0.07, `Carregando ${CHARACTERS[v].displayName}…`);
      const model = await loadCharacter(this.scene, v);
      const sp = this.world.spawns.get(v)!;
      const npc = new Npc(this.scene, model, sp.position, sp.yaw);
      npc.onInteract = (n) => void this.startDialogue(n);
      this.npcs.push(npc);
      this.interactables.push(npc);
    }
    progress(0.92, "Sombras e pós-processamento…");
    // em qualidade baixa só Matias projeta sombra (NPCs são o custo dominante de skinning no mapa de sombras)
    this.env.addShadowCasters([...this.world.shadowCasters, ...heroCasters, ...this.matias.meshes, ...(this.settings.quality === "baixa" ? [] : this.npcs.flatMap((n) => n.model.meshes))]);
    this.env.attachPostProcessing(this.camera.camera);
    this.collectFlickerLights();
    this.setupWorldInteractables();
    this.wireEvents();

    progress(1, "Pronto.");
    this.engine.runRenderLoop(() => this.frame());
    this.menus.setContinueAvailable(await this.saves.hasSave());
    this.camera.setMenuOrbit();
    this.hud.setFade(false);
    this.state = "menu";
    this.menus.show("menu");
  }

  private collectFlickerLights(): void {
    for (const l of this.scene.lights) {
      const meta = l.metadata as { flicker?: boolean } | null;
      if (meta?.flicker) this.flickerLights.push(l as SpotLight);
    }
  }

  private setupWorldInteractables(): void {
    const { radio, radioLed, card } = this.world.workshop;
    const radioPos = radio.getAbsolutePosition().clone();
    const cardPos = card.getAbsolutePosition().clone();
    this.interactables.push({
      id: "radio",
      radius: 2.0,
      getPosition: () => radioPos,
      getPrompt: () => (this.radioOn ? "Desligar o rádio" : "Ligar o rádio"),
      interact: () => this.toggleRadio(radioLed),
    });
    this.interactables.push({
      id: "cartao",
      radius: 1.8,
      clip: "PickUp",
      getPosition: () => cardPos,
      getPrompt: () => (this.flags.getBool("cartao.pego") ? null : "Pegar o cartão de registro"),
      interact: () => this.pickUpCard(card),
    });
  }

  private wireEvents(): void {
    this.input.onAction.on((a) => this.handleAction(a));
    this.input.onPointerLockChange.on((locked) => {
      if (this.state === "playing" || this.state === "dialogue") this.hud.setClickHint(!locked && !this.touch.enabled);
      // Esc (ou alt-tab) solta o cursor: abre a pausa para o jogador não perder o controle
      if (!locked && (this.state === "playing" || this.state === "dialogue") && this.lockWasAcquired) {
        this.pause();
      }
      if (locked) this.lockWasAcquired = true;
    });
    this.canvas.addEventListener("click", () => {
      if (this.state === "playing" || this.state === "dialogue") {
        void this.audio.unlock().then(() => this.startAmbience());
        if (!this.touch.enabled) void this.input.requestPointerLock();
        // clicou na cena: ou o cursor trava, ou arrastar com o mouse já gira a câmera — a dica cumpriu o papel
        this.hud.setClickHint(false);
      }
    });
    let lockErrorShown = false;
    this.input.onPointerLockError.on(() => {
      if (lockErrorShown || this.touch.enabled) return;
      lockErrorShown = true;
      this.hud.setClickHint(false);
      this.hud.showNotice("Cursor não travado pelo navegador: arraste com o mouse para olhar em volta", 4);
    });
    // toque curto na cena durante uma fala = avançar (como Espaço); nunca escolhe uma resposta por acidente
    this.touch.onTap.on(() => {
      if (this.state === "dialogue" && this.advanceResolver && !this.hud.hasPendingChoice) this.handleAction("advance");
    });
    this.touch.onEnabledChange.on(() => {
      // notebook com tela sensível: ao primeiro toque, deixa de exigir o cursor travado
      if (this.state === "playing" || this.state === "dialogue") {
        this.hud.setClickHint(false);
        this.lockWasAcquired = false;
        this.input.exitPointerLock();
        this.touch.setMode(this.state === "dialogue" ? (this.hud.hasPendingChoice ? "choices" : "dialogue") : "play");
      }
    });
    this.menus.onNewGame.on(() => void this.startNewGame());
    this.menus.onContinue.on(() => void this.continueGame());
    this.menus.onResume.on(() => this.resume());
    this.menus.onSave.on(() => void this.saveGame(true));
    this.menus.onQuitToMenu.on(() => void this.quitToMenu());
    this.menus.onSettingsChanged.on((s) => {
      this.applySettings(s);
      void this.saves.saveSettings(s);
    });
    this.dialogue.onEffect.on((e) => this.applyDialogueEffect(e));
    this.bindQuestLog();
    this.flags.onChange.on(() => {
      if (this.state !== "loading" && this.state !== "menu") void this.saveGame(false);
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        void this.saveGame(false);
        void this.audio.suspend();
      } else if (this.state === "playing" || this.state === "dialogue") {
        void this.audio.resume();
      }
    });
  }

  // ---------------------------------------------------------------------
  // Fluxo de jogo
  // ---------------------------------------------------------------------
  private async startNewGame(): Promise<void> {
    await this.saves.clear();
    this.flags.load({});
    this.quests = new QuestLog(QUESTS);
    this.dialogue = new DialogueRunner(this.flags, SPEAKER_NAMES);
    this.dialogue.onEffect.on((e) => this.applyDialogueEffect(e));
    this.bindQuestLog();
    this.playTime = 0;
    this.resetWorldState();
    const spawn = this.world.spawns.get("oficina")!;
    this.player.setCrouched(false);
    this.player.teleport(spawn.position, spawn.yaw);
    this.quests.start(QUEST_APURACAO);
    await this.enterPlay(spawn.yaw);
    this.hud.showNotice("São Paulo Velha · Setor 17 · 2072", 4.5);
    window.setTimeout(() => this.hud.showNotice("Dia de Apuração", 3.5), 5200);
  }

  private async continueGame(): Promise<void> {
    const data = await this.saves.load();
    if (!data) {
      await this.startNewGame();
      return;
    }
    this.applySave(data);
    await this.enterPlay(data.player.yaw);
    this.hud.showNotice("Jogo carregado", 2.5);
  }

  private async enterPlay(yaw: number): Promise<void> {
    this.menus.show("none");
    this.hud.setFade(true);
    this.camera.setFollow();
    this.camera.snapBehind(yaw);
    this.state = "playing";
    this.player.locked = false;
    this.hud.show();
    this.refreshObjective();
    this.input.clearHeld();
    await this.audio.unlock();
    this.startAmbience();
    if (this.touch.enabled) {
      this.touch.setMode("play");
      void this.touch.requestImmersive();
    } else {
      await this.input.requestPointerLock();
    }
    window.setTimeout(() => this.hud.setFade(false), 150);
    this.hud.setClickHint(!this.input.isPointerLocked && !this.touch.enabled && this.input.pointerLockAllowed);
  }

  private pause(): void {
    if (this.state !== "playing" && this.state !== "dialogue") return;
    this.lockWasAcquired = false;
    this.input.exitPointerLock();
    this.voice.cancel();
    this.state = "paused";
    this.player.locked = true;
    this.menus.setPauseStatus(`Salvamento local: ${this.saves.backend === "indexeddb" ? "IndexedDB" : "memória (sem persistência)"}`);
    this.menus.show("pause");
    this.hud.setClickHint(false);
    this.hud.hide();
    this.touch.setMode("hidden");
    void this.audio.suspend();
  }

  private resume(): void {
    if (this.state !== "paused") return;
    this.menus.show("none");
    this.state = this.dialogue.isRunning ? "dialogue" : "playing";
    this.player.locked = this.state === "dialogue";
    this.hud.show();
    void this.audio.resume();
    if (this.touch.enabled) this.touch.setMode(this.state === "dialogue" ? (this.hud.hasPendingChoice ? "choices" : "dialogue") : "play");
    else void this.input.requestPointerLock();
  }

  private async quitToMenu(): Promise<void> {
    await this.saveGame(false);
    this.voice.cancel();
    this.state = "menu";
    this.touch.setMode("hidden");
    this.hud.hide();
    this.hud.hideSubtitle();
    this.hud.setLetterbox(false);
    this.camera.setMenuOrbit();
    this.menus.setContinueAvailable(await this.saves.hasSave());
    this.menus.show("menu");
  }

  private handleAction(a: GameAction): void {
    switch (this.state) {
      case "playing":
        if (a === "pause") {
          this.pause();
        } else if (a === "interact") {
          this.tryInteract();
        } else if (a === "crouchToggle") {
          if (!this.player.setCrouched(!this.player.crouched)) this.hud.showNotice("Não há espaço para levantar", 1.5);
        } else if (a === "objectives") {
          const q = this.quests.get(QUEST_APURACAO);
          if (q) this.hud.showNotice(`${q.def.title}: ${q.def.description}`, 4);
        }
        break;
      case "dialogue":
        if (a === "pause") {
          this.pause();
        } else if ((a === "advance" || a === "interact") && this.advanceResolver && !this.hud.hasPendingChoice) {
          const r = this.advanceResolver;
          this.advanceResolver = null;
          r();
        }
        break;
      case "paused":
        if (a === "pause") this.resume();
        break;
      default:
        break;
    }
  }

  private tryInteract(): void {
    const target = this.currentPrompt;
    if (!target) return;
    this.audio.playUi("ui_select", 0.5);
    this.matias.animator.playOneShot(target.clip ?? "Interact");
    target.interact();
  }

  // ---------------------------------------------------------------------
  // Utilitários de depuração/teste (expostos em window.eva)
  // ---------------------------------------------------------------------
  /** Teleporta Matias (pés) para uma posição do mundo. */
  teleportPlayer(x: number, y: number, z: number, yaw: number): void {
    this.player.teleport(new Vector3(x, y, z), yaw);
    this.camera.snapBehind(yaw);
  }

  /** Coloca Matias de frente para um NPC, a `distance` metros, pronto para interagir. */
  approachNpc(variant: CharacterVariant, distance = 1.6): boolean {
    const npc = this.npcs.find((n) => n.variant === variant);
    if (!npc) return false;
    const p = npc.getPosition();
    const f = npc.facing;
    const feet = new Vector3(p.x + f.x * distance, p.y + 0.1, p.z + f.z * distance);
    const yaw = Math.atan2(p.x - feet.x, p.z - feet.z);
    this.player.teleport(feet, yaw);
    this.camera.snapBehind(yaw);
    return true;
  }

  /**
   * Modo de captura determinística (vídeos de avaliação): para o loop de renderização e passa a
   * avançar o jogo com dt fixo a cada `captureFrame()`, devolvendo o quadro como JPEG (data URL).
   * Assim a gravação sai a `fps` reais mesmo num renderizador lento (SwiftShader).
   */
  private captureDtMs: number | null = null;
  private captureScaling = 1;
  captureStart(fps = 30): void {
    if (this.captureDtMs !== null) return;
    this.captureDtMs = 1000 / fps;
    this.engine.stopRenderLoop();
    // resolução cheia do canvas (qualidade baixa reduz a escala) para o vídeo não sair pequeno
    this.captureScaling = this.engine.getHardwareScalingLevel();
    this.engine.setHardwareScalingLevel(1);
    // física e lógica usam engine.getDeltaTime(): fixa-o
    (this.engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => this.captureDtMs ?? 16;
    // as animações esqueléticas usam o relógio de parede (Scene._animate): força o mesmo dt fixo
    const scene = this.scene as unknown as { _animate: (customDeltaTime?: number) => void };
    const original = scene._animate;
    this.captureRestoreAnimate = () => {
      scene._animate = original;
    };
    scene._animate = () => original.call(this.scene, this.captureDtMs ?? 16);
  }

  private captureRestoreAnimate: (() => void) | null = null;

  captureFrame(quality = 0.9): string {
    this.frame();
    return this.canvas.toDataURL("image/jpeg", quality);
  }

  /** Posição mundial dos dedos dos pés de Matias (métrica de deslizamento em testes). */
  captureFeet(): { l: number[]; r: number[] } {
    const find = (name: string) => this.matias.root.getChildTransformNodes(false, (n) => n.name === name)[0]?.getAbsolutePosition();
    const l = find("mixamorig:LeftToeBase");
    const r = find("mixamorig:RightToeBase");
    return { l: l ? [l.x, l.y, l.z] : [0, 0, 0], r: r ? [r.x, r.y, r.z] : [0, 0, 0] };
  }

  captureStop(): void {
    if (this.captureDtMs === null) return;
    this.captureDtMs = null;
    delete (this.engine as unknown as { getDeltaTime?: () => number }).getDeltaTime;
    this.captureRestoreAnimate?.();
    this.captureRestoreAnimate = null;
    this.engine.setHardwareScalingLevel(this.captureScaling);
    this.engine.runRenderLoop(() => this.frame());
  }

  /** Estado resumido para testes automatizados. */
  snapshot(): Record<string, unknown> {
    const feet = this.player.feet;
    return {
      state: this.state,
      feet: { x: feet.x, y: feet.y, z: feet.z },
      yaw: this.player.yaw,
      cameraYaw: this.camera.yaw,
      crouched: this.player.crouched,
      moveState: this.player.state,
      clip: this.matias.animator.clip,
      heldForward: this.input.isHeld("forward"),
      pointerLocked: this.input.isPointerLocked,
      prompt: document.getElementById("prompt-text")?.textContent ?? "",
      flags: this.flags.toJSON(),
      objectiveDone: Object.fromEntries((this.quests.get(QUEST_APURACAO)?.def.objectives ?? []).map((o) => [o.id, this.quests.isObjectiveDone(QUEST_APURACAO, o.id)])),
      saveBackend: this.saves.backend,
      fps: Number(this.engine.getFps().toFixed(1)),
      audioReady: this.audio.isReady,
      analog: this.input.analogAxis,
      heldRun: this.input.isHeld("run"),
      touch: this.touch.snapshot(),
      quality: this.settings.quality,
    };
  }

  // ---------------------------------------------------------------------
  // Objetos do mundo
  // ---------------------------------------------------------------------
  private toggleRadio(led: Mesh): void {
    this.radioOn = !this.radioOn;
    this.flags.set("radio.ligado", this.radioOn);
    led.isVisible = this.radioOn;
    this.audio.playAt(this.audio.pickVariation("switch", 3, "switch"), led.getAbsolutePosition(), 0.5);
    if (this.radioOn) {
      const e = this.world.emitters.find((x) => x.kind === "radio");
      if (e) this.audio.startEmitter("radio", "radio_static", e.position, e.volume * 0.5, e.radius);
      this.radioTimer = 1.5;
    } else {
      this.audio.stopEmitter("radio");
      if (this.radioSpeaking) this.voice.cancel();
      this.hud.hideSubtitle();
    }
  }

  private pickUpCard(card: Mesh): void {
    if (this.flags.getBool("cartao.pego")) return;
    this.flags.set("cartao.pego", true);
    card.isVisible = false;
    this.audio.playUi(this.audio.pickVariation("pickup", 3, "paper"), 0.6);
    this.audio.playUi("paper", 0.5);
    this.hud.showNotice("Cartão de Registro — Matias · Setor 17 · Apuração 15h", 4);
    this.quests.completeObjective(QUEST_APURACAO, "cartao");
  }

  private resetWorldState(): void {
    this.radioOn = true;
    this.radioIndex = 0;
    this.radioTimer = 4;
    this.world.workshop.radioLed.isVisible = true;
    this.world.workshop.card.isVisible = true;
  }

  private startAmbience(): void {
    if (!this.audio.isReady) return;
    this.audio.startLoop("wind", "wind", 0.5);
    for (const e of this.world.emitters) {
      switch (e.kind) {
        case "generator":
          this.audio.startEmitter("generator", "generator", e.position, e.volume, e.radius);
          break;
        case "crowd":
          this.audio.startEmitter("crowd", "crowd", e.position, e.volume, e.radius);
          break;
        case "flicker":
          this.audio.startEmitter("flicker", "flicker", e.position, e.volume, e.radius);
          break;
        case "radio":
          if (this.radioOn) this.audio.startEmitter("radio", "radio_static", e.position, e.volume * 0.5, e.radius);
          break;
        default:
          break;
      }
    }
  }

  // ---------------------------------------------------------------------
  // Diálogo
  // ---------------------------------------------------------------------
  private async startDialogue(npc: Npc): Promise<void> {
    if (this.state !== "playing" || this.dialogue.isRunning) return;
    const graph = DIALOGUES[npc.variant];
    if (!graph) return;
    this.state = "dialogue";
    this.player.locked = true;
    this.hud.setPrompt(null);
    this.touch.setInteractAvailable(false);
    this.touch.setMode("dialogue");
    this.hud.setLetterbox(true);
    this.hud.setObjectiveVisible(false);
    this.audio.duck(true);
    const playerFeet = this.player.feet;
    npc.setAttention(playerFeet);
    // Matias encara o NPC
    const d = npc.getPosition().subtract(playerFeet);
    this.player.yaw = Math.atan2(d.x, d.z);
    this.matias.setYaw(this.player.yaw);
    this.matias.animator.play("Idle");

    const presenter: DialoguePresenter = {
      showLine: async (line: DialogueLine, speakerName: string) => {
        const speakerNpc = this.npcs.find((n) => n.variant === line.speaker);
        const isMatias = line.speaker === "matias";
        for (const n of this.npcs) n.setTalking(n === speakerNpc);
        if (isMatias) this.matias.animator.play("Talk");
        else this.matias.animator.play("Idle");
        this.frameShot(npc, speakerNpc ?? null, line.shot ?? "speaker", isMatias);
        if (this.state === "dialogue") this.touch.setMode("dialogue");
        const profile = CHARACTERS[(line.speaker in CHARACTERS ? line.speaker : "matias") as CharacterVariant].voice;
        this.hud.showSubtitle(speakerName, line.text, false);
        const playback = this.voice.speak(line.text, profile, line.voice);
        const minTime = new Promise<void>((r) => window.setTimeout(r, 650));
        let advanced = false;
        const advance = new Promise<void>((resolve) => {
          this.advanceResolver = () => {
            advanced = true;
            resolve();
          };
        });
        await minTime;
        this.hud.markCanContinue();
        await Promise.race([playback.done.then(() => new Promise<void>((r) => window.setTimeout(r, 350))), advance]);
        if (advanced) playback.cancel();
        this.advanceResolver = null;
      },
      showChoices: (choices: DialogueChoice[]) => {
        this.matias.animator.play("Idle");
        for (const n of this.npcs) n.setTalking(false);
        this.hud.hideSubtitle();
        this.frameShot(npc, npc, "listener", false);
        if (this.state === "dialogue") this.touch.setMode("choices");
        return this.hud.showChoices(choices);
      },
      end: () => {
        this.hud.hideSubtitle();
      },
    };
    await this.dialogue.run(graph, presenter);
    // encerramento
    for (const n of this.npcs) {
      n.setTalking(false);
      n.setAttention(null);
    }
    this.matias.animator.play("Idle");
    this.hud.setLetterbox(false);
    this.hud.setObjectiveVisible(true);
    this.env.setDialogueFocus(false);
    this.audio.duck(false);
    this.camera.setFollow();
    this.camera.snapBehind(this.player.yaw);
    if (this.state === "dialogue") {
      this.state = "playing";
      this.player.locked = false;
      this.touch.setMode("play");
    }
    await this.saveGame(false);
  }

  /** Enquadramento cinematográfico: sobre o ombro de quem ouve, olhando para quem fala. */
  private frameShot(npc: Npc, speaker: Npc | null, shot: "speaker" | "listener" | "two", matiasSpeaks: boolean): void {
    const matiasHead = this.player.feet.add(new Vector3(0, 1.62, 0));
    const npcHead = (speaker ?? npc).headPosition;
    const toNpc = npcHead.subtract(matiasHead);
    toNpc.y = 0;
    const dist = Math.max(0.8, toNpc.length());
    toNpc.normalize();
    const right = new Vector3(toNpc.z, 0, -toNpc.x);
    let from: Vector3;
    let at: Vector3;
    if (shot === "two") {
      const mid = Vector3.Lerp(matiasHead, npcHead, 0.5);
      from = mid.add(right.scale(dist * 1.1 + 1.8)).add(new Vector3(0, 0.1, 0));
      at = mid.add(new Vector3(0, -0.15, 0));
    } else if (matiasSpeaks || shot === "listener") {
      // sobre o ombro do NPC, olhando para Matias (ombro no terço esquerdo do quadro)
      from = npcHead.add(toNpc.scale(1.35)).add(right.scale(-0.85)).add(new Vector3(0, 0.05, 0));
      at = matiasHead.add(right.scale(-0.15)).add(new Vector3(0, -0.12, 0));
    } else {
      // sobre o ombro de Matias, olhando para o NPC que fala
      from = matiasHead.add(toNpc.scale(-1.35)).add(right.scale(0.85)).add(new Vector3(0, 0.05, 0));
      at = npcHead.add(right.scale(0.15)).add(new Vector3(0, -0.12, 0));
    }
    this.camera.setDialogueShot(from, at);
    this.env.setDialogueFocus(true, Vector3.Distance(from, at));
  }

  private applyDialogueEffect(e: DialogueEffect): void {
    switch (e.type) {
      case "questObjective":
        this.quests.completeObjective(e.quest, e.objective);
        break;
      case "startQuest":
        this.quests.start(e.quest);
        break;
      case "completeQuest":
        this.quests.complete(e.quest);
        break;
      default:
        break;
    }
  }

  private bindQuestLog(): void {
    this.quests.onChange.on(({ quest, state, objective }) => {
      if (objective) {
        this.audio.playUi("objective", 0.6);
        this.hud.showNotice(`Objetivo concluído: ${objective.text}`, 3.2);
      }
      if (state.status === "completed") this.hud.showNotice(`${quest.title} — fim do protótipo M0. A escolha de Matias continua na próxima etapa.`, 7);
      this.refreshObjective();
      void this.saveGame(false);
    });
  }

  private refreshObjective(): void {
    const cur = this.quests.currentObjective();
    if (cur) this.hud.setObjective(cur.objective.text, cur.objective.hint ?? "");
    else this.hud.setObjective(null);
  }

  // ---------------------------------------------------------------------
  // Salvamento
  // ---------------------------------------------------------------------
  private buildSave(): SaveData {
    const feet = this.player.feet;
    const data = createEmptySave({ position: { x: feet.x, y: feet.y, z: feet.z }, yaw: this.player.yaw, crouched: this.player.crouched });
    data.flags = this.flags.toJSON();
    data.quests = this.quests.toJSON();
    data.dialogueHistory = [...this.dialogue.history];
    data.world = { radioOn: this.radioOn, radioIndex: this.radioIndex };
    data.playTimeSeconds = this.playTime;
    return data;
  }

  private saving = false;
  async saveGame(notify: boolean): Promise<void> {
    if (this.state === "loading" || this.state === "menu" || this.saving) return;
    this.saving = true;
    try {
      await this.saves.save(this.buildSave());
      if (notify) {
        this.menus.setPauseStatus("Jogo salvo.");
        this.hud.showNotice("Jogo salvo", 1.8);
      }
    } catch (err) {
      console.error("Falha ao salvar", err);
      if (notify) this.menus.setPauseStatus("Falha ao salvar (ver console).");
    } finally {
      this.saving = false;
    }
  }

  private applySave(data: SaveData): void {
    this.flags.load(data.flags);
    this.quests = new QuestLog(QUESTS);
    this.quests.load(data.quests);
    this.bindQuestLog();
    if (!this.quests.get(QUEST_APURACAO) || this.quests.get(QUEST_APURACAO)!.state.status === "inactive") this.quests.start(QUEST_APURACAO);
    this.dialogue = new DialogueRunner(this.flags, SPEAKER_NAMES);
    this.dialogue.history.push(...data.dialogueHistory);
    this.dialogue.onEffect.on((e) => this.applyDialogueEffect(e));
    this.playTime = data.playTimeSeconds;
    this.radioOn = data.world.radioOn !== false;
    this.radioIndex = typeof data.world.radioIndex === "number" ? data.world.radioIndex : 0;
    this.world.workshop.radioLed.isVisible = this.radioOn;
    this.world.workshop.card.isVisible = !this.flags.getBool("cartao.pego");
    this.player.setCrouched(false);
    this.player.teleport(new Vector3(data.player.position.x, data.player.position.y, data.player.position.z), data.player.yaw);
    if (data.player.crouched) this.player.setCrouched(true);
  }

  // ---------------------------------------------------------------------
  // Configurações
  // ---------------------------------------------------------------------
  applySettings(s: GameSettings): void {
    this.settings = s;
    this.audio?.applySettings(s);
    if (this.camera) {
      this.camera.sensitivity = s.mouseSensitivity;
      this.camera.invertY = s.invertY;
    }
    if (this.hud) this.hud.subtitlesEnabled = s.subtitles;
    if (this.voice) this.voice.enabled = s.voiceTts;
  }

  // ---------------------------------------------------------------------
  // Loop
  // ---------------------------------------------------------------------
  private frame(): void {
    const dt = Math.min(0.05, this.engine.getDeltaTime() / 1000);
    switch (this.state) {
      case "menu":
      case "loading":
        this.camera.update(dt, this.input, Vector3.Zero(), 1.5);
        this.updateLights(dt);
        break;
      case "paused":
        break;
      case "playing":
      case "dialogue":
        this.updatePlaying(dt);
        break;
    }
    if (this.state !== "paused") this.scene.render();
  }

  private updatePlaying(dt: number): void {
    this.playTime += dt;
    // soltar Ctrl levanta
    if (this.player.crouched && !this.input.isHeld("crouchHold") && !this.input.isHeld("crouchToggle") && this.crouchFromHold) {
      if (this.player.setCrouched(false)) this.crouchFromHold = false;
    }
    if (this.input.isHeld("crouchHold")) this.crouchFromHold = true;

    const camYaw = this.camera.yaw;
    this.player.update(dt, this.input, camYaw);
    const feet = this.player.feet;
    for (const n of this.npcs) n.update(dt, feet);
    this.camera.update(dt, this.input, feet, this.player.eyeHeight);
    // oculta Matias quando a câmera encosta nele
    this.matias.setVisible(this.camera.mode !== "follow" || this.camera.distanceTo(feet.add(new Vector3(0, this.player.eyeHeight, 0))) > 0.75);
    // ouvinte de áudio na câmera
    const cam = this.camera.camera;
    const fwd = cam.getDirection(Vector3.Forward());
    this.audio.updateListener(cam.position, fwd, Vector3.Up());
    this.updateLights(dt);
    this.updateRadio(dt, feet);
    this.updateTriggers(feet);

    if (this.state === "playing") {
      const pick = pickInteractable(this.interactables, { x: feet.x, z: feet.z }, this.player.forward, 0.2);
      this.currentPrompt = pick?.target ?? null;
      this.hud.setPrompt(pick ? pick.prompt : null);
      if (this.touch.enabled) {
        this.touch.setInteractAvailable(!!pick);
        this.touch.setCrouched(this.player.crouched);
      }
    } else {
      this.currentPrompt = null;
    }
    this.autosaveTimer += dt;
    if (this.autosaveTimer > 45) {
      this.autosaveTimer = 0;
      void this.saveGame(false);
    }
  }

  private crouchFromHold = false;

  private updateLights(dt: number): void {
    const t = performance.now() / 1000;
    for (const l of this.flickerLights) {
      const meta = l.metadata as { base: number; glow: Mesh };
      const n = Math.sin(t * 17.3) * Math.sin(t * 7.1) + Math.sin(t * 31.7) * 0.5;
      const on = n > -0.35;
      l.intensity = on ? meta.base * (0.7 + 0.3 * Math.abs(Math.sin(t * 23))) : meta.base * 0.05;
      meta.glow.isVisible = on;
    }
    void dt;
  }

  /** Boletim do rádio da oficina: estática espacial + fala sintetizada quando Matias está perto. */
  private updateRadio(dt: number, feet: Vector3): void {
    if (!this.radioOn || this.state !== "playing") return;
    const radio = this.world.emitters.find((e) => e.kind === "radio");
    if (!radio) return;
    const dist = Vector3.Distance(feet, radio.position);
    this.radioTimer -= dt;
    if (this.radioTimer <= 0 && !this.radioSpeaking && dist < 7) {
      this.radioSpeaking = true;
      const text = RADIO_BULLETIN[this.radioIndex % RADIO_BULLETIN.length]!;
      this.radioIndex++;
      this.flags.set("radio.ouviuBoletim", true);
      const playback = this.voice.speak(text, { pitch: 0.9, rate: 0.95, gender: "male" });
      this.hud.showSubtitle(SPEAKER_NAMES.radio!, text, false);
      void playback.done.then(() => {
        this.radioSpeaking = false;
        this.radioTimer = 14 + Math.random() * 6;
        if (this.state === "playing") this.hud.hideSubtitle();
      });
    }
    if (this.radioSpeaking && dist > 9) {
      this.voice.cancel();
      this.hud.hideSubtitle();
      this.radioSpeaking = false;
      this.radioTimer = 8;
    }
  }

  private updateTriggers(feet: Vector3): void {
    if (feet.x > STREET.plaza.x0 - 1 && !this.quests.isObjectiveDone(QUEST_APURACAO, "praca")) {
      this.quests.completeObjective(QUEST_APURACAO, "praca");
    }
  }
}

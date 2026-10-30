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
import { vehicleSpawns } from "@/world/vehiclesPack";
import { Vehicle } from "@/vehicles/vehicle";
import { Quaternion } from "@babylonjs/core/Maths/math.vector";
import { STREET } from "@/world/street";
import { loadCharacter, type CharacterModel } from "@/characters/characterModel";
import { Npc } from "@/characters/npc";
import { PlayerController } from "@/player/playerController";
import { ThirdPersonCamera } from "@/player/thirdPersonCamera";
import { pickInteractable, type Interactable } from "@/interaction/interactable";
import { GameFlags } from "@/narrative/flags";
import { DialogueRunner, type DialogueChoice, type DialogueEffect, type DialogueLine, type DialoguePresenter } from "@/narrative/dialogue";
import { QuestLog } from "@/narrative/quests";
import { QUESTS, QUEST_APURACAO, QUEST_CARREGAMENTO } from "@/data/quests";
import { DIALOGUES, DIALOGUE_RADIO_FINAL, RADIO_BULLETIN, SPEAKER_NAMES } from "@/data/dialogues";
import type { DialogueGraph } from "@/narrative/dialogue";
import { PlayerCombat, propUrl } from "@/combat/playerCombat";
import { CombatEffects } from "@/combat/effects";
import { EnemyManager } from "@/ai/enemyManager";
import { Inventory } from "@/items/inventory";
import { Pickup, type PickupSpec } from "@/items/pickup";
import { MissionDirector, MISSION_POINTS, type MissionHost } from "@/narrative/missionDirector";
import { WORKSHOP } from "@/world/workshop";
import { CHARACTERS, characterUrl, type CharacterVariant } from "@/data/characters";
import { AudioEngine } from "@/audio/audioEngine";
import { VoiceService } from "@/audio/voice";
import { Hud } from "@/ui/hud";
import { Menus } from "@/ui/menus";
import { TouchControls } from "@/ui/touchControls";
import { openStore } from "@/persistence/saveStore";
import { SaveSystem, createEmptySave, type SaveData } from "@/persistence/saveSystem";
import { ClueLog } from "@/narrative/clues";
import { CLUES } from "@/data/clues";
import { MissionTimers, formatClock } from "@/narrative/timers";
import { MissionScript, type ZoneSpec } from "@/narrative/missionScript";
import { DeliveryCargo } from "@/narrative/delivery";
import { ExamineController, type ExaminableSpec } from "@/interaction/examinable";
import { RepairController, type RepairSpec } from "@/interaction/repair";
import type { EnemySpawnSpec } from "@/ai/enemyManager";
import { VEHICLE_NOISE } from "@/ai/stealth";
import type { MissionTrigger } from "@/data/cap1Contracts";

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
  player!: PlayerController;
  camera!: ThirdPersonCamera;
  private npcs: Npc[] = [];
  private interactables: Interactable[] = [];
  flags = new GameFlags();
  quests = new QuestLog(QUESTS);
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
  /** veículos jogáveis e o que Matias está dirigindo */
  vehicles: Vehicle[] = [];
  driving: Vehicle | null = null;
  /** combate, inimigos, itens e missão (vertical slice) */
  combat!: PlayerCombat;
  effects!: CombatEffects;
  enemies!: EnemyManager;
  inventory = new Inventory();
  pickups: Pickup[] = [];
  director!: MissionDirector;
  /** sistemas genéricos do Capítulo 1 (ver docs/SISTEMAS_CAP1.md) */
  clues = new ClueLog(CLUES);
  timers = new MissionTimers();
  script = new MissionScript();
  examine!: ExamineController;
  repair!: RepairController;
  cargo!: DeliveryCargo;
  private noiseTimer = 0;
  private deathTimer = -1;
  private cameraShake = 0;
  private boundsNoticeShown = false;
  private thinAirNoticeShown = false;

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
    for (const sp of vehicleSpawns()) {
      try {
        const v = await Vehicle.load(this.scene, sp.id, sp.position, sp.yaw);
        v.onEnter = (veh) => this.enterVehicle(veh);
        this.vehicles.push(v);
        this.interactables.push(v);
        heroCasters = [...heroCasters, ...v.meshes.filter((m) => !/vidro|parabrisa|para_brisa|glass/i.test(m.name))];
      } catch (err) {
        console.error(`[vehicles] falha ao carregar ${sp.id}`, err);
      }
    }
    progress(0.5, "Carregando Matias…");
    this.matias = await loadCharacter(this.scene, "matias");
    const spawn = this.world.spawns.get("oficina")!;
    this.player = new PlayerController(this.scene, this.matias, spawn.position, spawn.yaw);
    this.player.onFootstep.on((step) => this.audio.playFootstep(step.kind, step.surface));
    this.camera = new ThirdPersonCamera(this.scene, spawn.yaw);
    this.scene.activeCamera = this.camera.camera;
    this.effects = new CombatEffects(this.scene);
    this.enemies = new EnemyManager(this.scene);
    this.combat = new PlayerCombat(this.scene, this.matias, this.effects);
    this.combat.resolver = this.enemies;
    this.director = new MissionDirector(this.missionHost());
    this.registerObstacles();
    this.wireCombat();
    this.setupChapterSystems();

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
    // aquece o cache HTTP dos modelos dos inimigos e dos props da missão (carregados sob demanda no confronto)
    for (const v of ["saqueador_a", "saqueador_b"] as const) void fetch(characterUrl(v)).catch(() => undefined);
    for (const p of ["pistola", "caixa_municao", "kit_medico"]) void fetch(propUrl(p)).catch(() => undefined);
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
    this.bindDialogueTriggers();
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
    this.bindDialogueTriggers();
    this.bindQuestLog();
    this.playTime = 0;
    this.resetWorldState();
    this.resetSliceState();
    const spawn = this.world.spawns.get("oficina")!;
    this.player.setCrouched(false);
    this.player.teleport(spawn.position, spawn.yaw);
    this.quests.start(QUEST_APURACAO);
    this.director = new MissionDirector(this.missionHost());
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
    this.state = this.dialogue.isRunning || this.examine.active ? "dialogue" : "playing";
    this.player.locked = this.state === "dialogue" || this.repair.active !== null;
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
        } else if (a === "interact" && this.repair.active) {
          this.repair.press();
        } else if (a === "interact") {
          if (this.driving) this.exitVehicle();
          else this.tryInteract();
        } else if (a === "lights" && this.driving) {
          this.driving.setLights(!this.driving.lights);
        } else if (a === "inventory") {
          this.hud.setClues(this.clues.list());
          this.hud.setInventory(!this.hud.inventoryVisible, this.inventory.list());
        } else if (a === "heal") {
          this.useMedkit();
        } else if (a === "crouchToggle" && this.driving) {
          // sem agachar ao volante
        } else if (a === "crouchToggle") {
          if (!this.player.setCrouched(!this.player.crouched)) this.hud.showNotice("Não há espaço para levantar", 1.5);
        } else if (a === "objectives") {
          const q = this.quests.get(QUEST_APURACAO);
          if (q) this.hud.showNotice(`${q.def.title}: ${q.def.description}`, 4);
        }
        break;
      case "dialogue":
        if (a === "pause" && this.examine.active) {
          this.examine.close();
        } else if (a === "pause") {
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
  /** Aponta a câmera (e Matias, se estiver mirando) para um ponto do mundo — testes. */
  aimAt(x: number, y: number, z: number): void {
    // a partir da posição atual da câmera (o tiro sai do centro da tela)
    const eye = this.camera.camera.position;
    const d = new Vector3(x, y, z).subtract(eye);
    this.camera.yaw = Math.atan2(d.x, d.z);
    this.camera.pitch = -Math.atan2(d.y, Math.hypot(d.x, d.z));
  }

  /** Teleporta Matias (pés) para uma posição do mundo. */
  teleportPlayer(x: number, y: number, z: number, yaw: number): void {
    if (this.driving) this.exitVehicle();
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
      driving: this.driving?.def.id ?? null,
      altitude: this.driving?.hover ? { ground: this.driving.altitude, abs: this.driving.altitudeAbs, air: this.driving.air, farLayer: this.env.planet?.isActive ?? false, space: this.env.spaceLevel } : null,
      health: this.combat?.health.current ?? null,
      ammo: this.combat?.weapon ? { mag: this.combat.weapon.magazine, reserve: this.combat.weapon.reserve, phase: this.combat.weapon.phase } : null,
      aiming: this.combat?.aiming ?? false,
      dead: this.combat?.dead ?? false,
      enemies: this.enemies ? { total: this.enemies.enemies.length, alive: this.enemies.aliveCount, states: this.enemies.enemies.map((e) => e.state) } : null,
      phase: this.director?.phase ?? null,
      inventory: this.inventory.toJSON(),
      overlay: this.matias?.animator.currentOverlay ?? null,
      touch: this.touch.snapshot(),
      quality: this.settings.quality,
      // sistemas do Capítulo 1
      awareness: this.enemies ? { ...this.enemies.awarenessSummary(), perEnemy: this.enemies.enemies.map((e) => ({ role: e.role, state: e.awareness.state, suspicion: Number(e.awareness.suspicion.toFixed(2)), hostile: e.hostile, detections: e.detections, flashlight: e.flashlightOn })) } : null,
      clues: this.clues.toJSON(),
      timers: this.timers.toJSON(),
      examining: this.examine?.active?.spec.id ?? null,
      repair: this.repair?.active ? this.repair.active.game.view : null,
      cargo: this.cargo?.attachedTo ?? null,
      curfew: this.enemies?.curfew ?? false,
      triggers: this.script.history.slice(-8),
      zonesInside: [...this.script.zones.keys()].filter((id) => this.script.isInside(id)),
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
    this.inventory.add("cartao", 1);
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
  private async startDialogue(npc: Npc, graphOverride?: DialogueGraph): Promise<void> {
    if (this.state !== "playing" || this.dialogue.isRunning) return;
    const graph = graphOverride ?? DIALOGUES[npc.variant];
    if (!graph) return;
    if (this.driving) this.exitVehicle();
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
    // Matias encara o NPC (sem a pose de pistola durante a conversa)
    const d = npc.getPosition().subtract(playerFeet);
    this.player.yaw = Math.atan2(d.x, d.z);
    this.matias.setYaw(this.player.yaw);
    this.matias.animator.setOverlay(null);
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
      if (state.status === "completed" && quest.id === QUEST_APURACAO) this.hud.showNotice(`${quest.title} concluída. O Custódio no portão sabe mais sobre o lote.`, 6);
      if (state.status === "completed" && quest.id === QUEST_CARREGAMENTO) window.setTimeout(() => this.showMissionEnd(), 1500);
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
    const feet = this.driving ? this.driving.exitPosition() : this.player.feet;
    const data = createEmptySave({ position: { x: feet.x, y: feet.y, z: feet.z }, yaw: this.player.yaw, crouched: this.player.crouched });
    data.flags = this.flags.toJSON();
    data.quests = this.quests.toJSON();
    data.dialogueHistory = [...this.dialogue.history];
    data.world = {
      radioOn: this.radioOn,
      radioIndex: this.radioIndex,
      vehicles: JSON.stringify(this.vehicles.map((v) => ({ id: v.def.id, x: v.position.x, y: v.position.y, z: v.position.z, yaw: v.heading }))),
      ammoReserve: this.combat.weapon?.reserve ?? 0,
      ammoMag: this.combat.weapon?.magazine ?? 0,
      ...(this.driving ? { drivingId: this.driving.def.id } : {}),
    };
    data.inventory = this.inventory.toJSON();
    data.clues = this.clues.toJSON();
    data.timers = this.timers.toJSON();
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
    this.bindDialogueTriggers();
    this.playTime = data.playTimeSeconds;
    this.radioOn = data.world.radioOn !== false;
    this.radioIndex = typeof data.world.radioIndex === "number" ? data.world.radioIndex : 0;
    this.world.workshop.radioLed.isVisible = this.radioOn;
    this.world.workshop.card.isVisible = !this.flags.getBool("cartao.pego");
    this.player.setCrouched(false);
    if (this.driving) this.exitVehicle();
    this.player.teleport(new Vector3(data.player.position.x, data.player.position.y, data.player.position.z), data.player.yaw);
    if (data.player.crouched) this.player.setCrouched(true);
    this.resetSliceState();
    this.inventory.load(data.inventory);
    this.clues.load(data.clues);
    this.timers.load(data.timers);
    const w = data.world;
    if (typeof w.vehicles === "string") {
      try {
        const list = JSON.parse(w.vehicles) as Array<{ id: string; x: number; y: number; z: number; yaw: number }>;
        for (const e of list) {
          const v = this.vehicles.find((x) => x.def.id === e.id);
          if (v) v.teleport(new Vector3(e.x, e.y, e.z), e.yaw);
        }
      } catch {
        /* ignora */
      }
    }
    if (this.flags.getBool("carregamento.armado")) void this.combat.equipPistol(typeof w.ammoReserve === "number" ? w.ammoReserve : 24).then(() => {
      if (this.combat.weapon && typeof w.ammoMag === "number") this.combat.weapon.magazine = w.ammoMag;
    });
    this.director = new MissionDirector(this.missionHost());
    this.director.syncFromFlags();
    if (typeof w.drivingId === "string") {
      const v = this.vehicles.find((x) => x.def.id === w.drivingId);
      if (v) window.setTimeout(() => this.enterVehicle(v), 50);
    }
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
    this.effects?.setQuality(s.quality);
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
    for (const v of this.vehicles) v.update(dt);
    if (this.driving) this.updateDriving(dt);
    // combate: mira/tiro/recarga (antes do movimento, para o personagem encarar a câmera ao mirar)
    const camNode = this.camera.camera;
    const camFwd = camNode.getDirection(Vector3.Forward());
    const aiming = this.combat.update(dt, this.input, camNode.position, camFwd, this.camera.pitch, this.state !== "playing" || this.player.locked, this.driving !== null);
    this.player.aimYaw = aiming ? this.camera.yaw : null;
    this.player.locked = this.player.locked || this.combat.dead;
    this.player.update(dt, this.input, camYaw);
    const feet = this.driving ? this.driving.position : this.player.feet;
    for (const n of this.npcs) n.update(dt, feet);
    this.enemies.update(dt, this.player.feet, !this.combat.dead && !this.driving);
    this.runOverEnemies();
    for (const p of this.pickups) p.update(dt);
    this.effects.update(dt);
    if (this.state === "playing") this.director.update(dt);
    // sistemas do Capítulo 1: timers só correm jogando (pausa/menus congelam), reparo, zonas, ruído, HUD
    if (this.state === "playing") {
      this.timers.update(dt);
      this.repair.update(dt);
      this.script.update(feet, this.driving !== null);
    }
    this.updateNoise(dt, feet);
    this.updateChapterHud();
    this.updateDeath(dt);
    if (this.driving) this.camera.update(dt, this.input, feet, 0, this.driving.heading);
    else this.camera.update(dt, this.input, feet, this.player.eyeHeight);
    this.applyCameraShake(dt);
    if (!this.driving && this.camera.mode === "follow") {
      const profile = aiming ? { distance: 1.75, shoulder: 0.6, fov: 0.72, minDistance: 1.2 } : { distance: 2.9, shoulder: 0.42, fov: 0.95, minDistance: 1.4 };
      if (this.camera.fovTarget !== profile.fov) this.camera.setProfile(profile);
    }
    this.hud.setCrosshair(this.combat.armed && !this.driving && !this.combat.dead && this.state === "playing", !aiming);
    this.touch.setArmed(this.combat.armed && !this.driving && !this.combat.dead && this.state === "playing");
    if (this.combat.weapon) this.hud.setAmmo(this.combat.weapon.weapon.displayName, this.combat.weapon.magazine, this.combat.weapon.reserve, this.combat.weapon.phase === "reloading");
    this.hud.setVitals(this.combat.armed || this.combat.health.current < this.combat.health.max, this.combat.health.fraction);
    // oculta Matias quando a câmera encosta nele (no close-up de exame, quando passa por cima do ombro dele)
    const headDist = this.camera.distanceTo(feet.add(new Vector3(0, this.player.eyeHeight, 0)));
    this.matias.setVisible(this.driving !== null || (this.camera.mode === "inspect" ? headDist > 1.25 : this.camera.mode !== "follow" || headDist > 0.75));
    // ouvinte de áudio na câmera
    const cam = this.camera.camera;
    const fwd = cam.getDirection(Vector3.Forward());
    this.audio.updateListener(cam.position, fwd, Vector3.Up());
    this.updateLights(dt);
    this.env.updateTimeOfDay(dt);
    this.env.updateAltitude(cam, Math.max(0, cam.globalPosition.y));
    this.updateRadio(dt, feet);
    this.updateTriggers(feet);

    if (this.state === "playing" && this.driving) {
      this.currentPrompt = null;
      this.hud.setPrompt(this.driving.speedKmh < 8 ? "Sair do veículo" : null);
      if (this.touch.enabled) this.touch.setInteractAvailable(this.driving.speedKmh < 8);
    } else if (this.state === "playing" && this.repair.active) {
      this.currentPrompt = null; // o E vai para o minigame; o prompt dá lugar à barra
    } else if (this.state === "playing") {
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

  // ---------------------------------------------------------------------
  // Combate, itens e missão (vertical slice)
  // ---------------------------------------------------------------------
  private wireCombat(): void {
    this.combat.onShot.on((e) => {
      this.audio.playUi(this.audio.pickVariation("gunshot", 3, "switch"), 0.9);
      this.enemies.noise(this.player.feet, 34);
      if (e.enemyHit) this.hud.showHitMarker(e.enemyHit.killed);
      else if (e.hit) this.audio.playAt(this.audio.pickVariation("ricochet", 3, "switch"), e.hit.point, 0.5);
      this.camera.pitch -= this.combat.weapon?.weapon.recoil ?? 0;
      this.cameraShake = Math.max(this.cameraShake, 0.35);
    });
    this.combat.onReloadStart.on(() => this.audio.playUi("mag_click", 0.6));
    this.combat.onReloadEnd.on(() => this.audio.playUi("mag_click", 0.5));
    this.combat.onEmptyClick.on(() => this.audio.playUi("ui_click", 0.4));
    this.combat.health.onDamage.on(() => {
      this.hud.flashDamage();
      this.audio.playUi(this.audio.pickVariation("hurt", 3, "paper"), 0.5);
      this.cameraShake = Math.max(this.cameraShake, 0.6);
    });
    this.combat.health.onDeath.on(() => {
      this.deathTimer = 2.4;
      this.hud.setPrompt(null);
      this.hud.setCrosshair(false);
    });
    this.enemies.onEnemyShot.on(({ enemy, shot }) => {
      this.effects.muzzleFlash(shot.from, shot.to.subtract(shot.from));
      this.effects.tracer(shot.from, shot.to);
      this.audio.playAt(this.audio.pickVariation("gunshot", 3, "switch"), shot.from, 0.8, 4, 60);
      if (shot.hitPlayer && !this.driving && enemy.hasLineOfSight(this.player.feet.add(new Vector3(0, 1.25, 0)))) {
        this.combat.takeDamage(shot.damage, enemy.feet);
      } else if (!shot.hitPlayer) {
        // o tiro passa perto: impacto no mundo atrás de Matias
        this.effects.impact(shot.to, new Vector3(0, 1, 0));
      }
    });
    this.enemies.onEnemyDeath.on((enemy) => {
      this.audio.playAt(this.audio.pickVariation("hurt", 3, "paper"), enemy.chest, 0.6);
      // deixa munição no chão
      void this.spawnPickup({ id: `municao_${Date.now()}_${Math.floor(Math.random() * 1000)}`, item: "municao_pistola", amount: enemy.dropAmmo, position: enemy.feet.add(new Vector3(0.4, 0, 0.3)), model: "caixa_municao", prompt: `Pegar munição (${enemy.dropAmmo})` });
    });
    this.hud.onRetry.on(() => this.retryFromCheckpoint());
    this.hud.onMissionContinue.on(() => {
      this.hud.hideMissionEnd();
      if (!this.touch.enabled) void this.input.requestPointerLock();
    });
    this.hud.onMissionMenu.on(() => {
      this.hud.hideMissionEnd();
      void this.quitToMenu();
    });
    this.inventory.onChange.on(() => {
      if (this.hud.inventoryVisible) this.hud.setInventory(true, this.inventory.list());
    });
    // porta da oficina: trancar o carregamento
    const door = new Vector3(WORKSHOP.doorX, 0.12, WORKSHOP.zFront + 0.6);
    this.interactables.push({
      id: "oficina_porta",
      radius: 2.4,
      getPosition: () => door,
      getPrompt: () => (this.director.phase === "trancar" && !this.driving ? "Trancar o carregamento na oficina" : null),
      interact: () => {
        if (this.director.phase !== "trancar") return;
        this.flags.set("carregamento.trancado", true);
        this.audio.playUi(this.audio.pickVariation("switch", 3, "switch"), 0.7);
        this.quests.completeObjective(QUEST_CARREGAMENTO, "trancar");
      },
    });
  }

  /** Esferas de desvio para a IA dos inimigos a partir dos colisores estáticos pequenos da praça e dos veículos. */
  private registerObstacles(): void {
    const engine = this.scene.getPhysicsEngine() as import("@babylonjs/core/Physics/v2/physicsEngine").PhysicsEngine | null;
    if (!engine) return;
    for (const body of engine.getBodies()) {
      const node = body.transformNode;
      if (!node || !node.name.startsWith("col_")) continue;
      const shape = body.shape;
      if (!shape) continue;
      const bb = shape.getBoundingBox();
      const ext = bb.extendSize;
      const r = Math.max(ext.x, ext.z) * Math.max(Math.abs(node.scaling.x), Math.abs(node.scaling.z));
      if (r > 3.5 || r < 0.2) continue; // prédios e muros não; postes/bancos/árvores/caixas sim
      const p = node.getAbsolutePosition();
      if (p.x < STREET.plaza.x0 - 2 || p.x > STREET.plaza.x1 + 2 || p.z < STREET.plaza.z0 - 2 || p.z > STREET.plaza.z1 + 2) continue;
      this.enemies.addObstacle(new Vector3(p.x, 0, p.z), r + 0.3);
    }
    for (const v of this.vehicles) {
      const e = this.enemies.addDynamicObstacle(v.position, Math.max(v.def.chassisSize.x, v.def.chassisSize.z) / 2 + 0.4);
      this.scene.onBeforeRenderObservable.add(() => {
        const p = v.position;
        e.position.set(p.x, 0, p.z);
      });
    }
  }

  async spawnPickup(spec: PickupSpec): Promise<void> {
    if (this.flags.getBool(`pickup.${spec.id}`)) return; // já recolhido (jogo carregado)
    const pickup = new Pickup(this.scene, spec);
    await pickup.load();
    pickup.onTaken = (p) => {
      if (!p.spec.id.startsWith("municao_1") && !/^municao_\d{10,}/.test(p.spec.id)) this.flags.set(`pickup.${p.spec.id}`, true);
      this.inventory.add(p.spec.item, p.spec.amount);
      if (p.spec.item === "municao_pistola") {
        const added = this.combat.addAmmo(p.spec.amount);
        this.hud.showNotice(added > 0 ? `Munição +${added}` : "Munição cheia", 2);
      } else {
        this.hud.showNotice(`${p.spec.prompt.replace(/^Pegar /, "")} na mochila`, 2);
      }
      this.audio.playUi(this.audio.pickVariation("pickup", 3, "paper"), 0.6);
      this.interactables = this.interactables.filter((i) => i !== p);
      this.pickups = this.pickups.filter((i) => i !== p);
      p.dispose();
    };
    this.pickups.push(pickup);
    this.interactables.push(pickup);
    this.env.addShadowCasters(pickup.shadowCasters);
  }

  /** Veículo em movimento atinge um desviador: dano proporcional à velocidade (só inimigos; NPCs são sólidos). */
  private runOverEnemies(): void {
    for (const v of this.vehicles) {
      const speed = Math.abs(v.speed);
      if (speed < 3) continue;
      const inv = v.anchor.getWorldMatrix().clone().invert();
      const half = v.def.chassisSize.scale(0.5);
      for (const e of this.enemies.enemies) {
        if (!e.alive) continue;
        const local = Vector3.TransformCoordinates(e.chest, inv);
        if (Math.abs(local.x) < half.x + 0.45 && Math.abs(local.z) < half.z + 0.6 && local.y > -0.2 && local.y < v.def.chassisSize.y + 0.6) {
          const killed = e.takeDamage(30 + speed * 8, v.position, false);
          if (killed) this.combat.stats.kills++;
          this.audio.playAt("car_impact", e.chest, 0.8);
        }
      }
    }
  }

  private useMedkit(): void {
    if (this.state !== "playing" || this.combat.dead) return;
    if (!this.inventory.has("kit_medico")) {
      this.hud.showNotice("Sem kit médico", 1.5);
      return;
    }
    if (this.combat.health.current >= this.combat.health.max - 1) {
      this.hud.showNotice("Matias não está ferido", 1.5);
      return;
    }
    this.inventory.remove("kit_medico", 1);
    this.combat.health.heal(55);
    this.audio.playUi("paper", 0.6);
    this.hud.showNotice("Kit médico usado", 2);
  }

  private updateDeath(dt: number): void {
    if (this.deathTimer < 0) return;
    this.deathTimer -= dt;
    if (this.deathTimer <= 0) {
      this.deathTimer = -1;
      this.input.exitPointerLock();
      this.hud.showDeath(this.director.inCombat || this.director.phase === "onda1" || this.director.phase === "onda2" ? "Os desviadores tomaram a praça. O último ponto é junto à van." : "Volte ao último ponto.");
    }
  }

  private retryFromCheckpoint(): void {
    this.hud.hideDeath();
    if (this.driving) this.exitVehicle();
    this.director.restartWave();
    this.combat.revive();
    if (this.combat.weapon && this.combat.weapon.reserve < 12) this.combat.weapon.reserve = 12;
    this.player.locked = false;
    const rp = this.director.respawnPoint;
    this.player.teleport(rp, Math.PI);
    this.camera.setWalkProfile();
    this.camera.snapBehind(Math.PI);
    this.hud.setFade(true);
    window.setTimeout(() => this.hud.setFade(false), 200);
    if (!this.touch.enabled) void this.input.requestPointerLock();
    this.hud.showNotice("De volta ao portão.", 2.5);
  }

  private applyCameraShake(dt: number): void {
    if (this.cameraShake <= 0) return;
    this.cameraShake = Math.max(0, this.cameraShake - dt * 2.2);
    const k = this.cameraShake * 0.02;
    const cam = this.camera.camera;
    cam.position.addInPlace(new Vector3((Math.random() - 0.5) * k, (Math.random() - 0.5) * k, (Math.random() - 0.5) * k));
  }

  private showMissionEnd(): void {
    if (this.driving) this.exitVehicle();
    this.input.exitPointerLock();
    const st = this.combat.stats;
    const acc = st.shots ? Math.round((st.hits / st.shots) * 100) : 0;
    const decision = this.flags.get("carregamento.decisao");
    const text =
      decision === "registro"
        ? "O lote vai ao posto médico com registro e assinatura de Matias. O conselho vai perguntar de onde veio — e ele vai responder."
        : decision === "silencio"
          ? "O lote some das contas. Os Silenciosos distribuem em silêncio; Ana recebe o que precisa, e ninguém sabe de nada."
          : "O carregamento está na oficina.";
    const min = Math.floor(this.playTime / 60);
    const sec = Math.floor(this.playTime % 60);
    this.hud.showMissionEnd("O Carregamento", text, [
      ["Tempo de jogo", `${min}m ${sec.toString().padStart(2, "0")}s`],
      ["Disparos / acertos", `${st.shots} / ${st.hits} (${acc}%)`],
      ["Desviadores neutralizados", String(st.kills)],
      ["Dano sofrido", `${Math.round(st.damageTaken)}`],
      ["Quedas", String(st.deaths)],
      ["Postura de Matias", decision === "registro" ? "confia no registro" : decision === "silencio" ? "age em silêncio" : "—"],
    ]);
    void this.saveGame(false);
  }

  private resetSliceState(): void {
    this.enemies.clear();
    for (const p of this.pickups) {
      this.interactables = this.interactables.filter((i) => i !== p);
      p.dispose();
    }
    this.pickups = [];
    this.inventory.load({});
    this.combat.revive();
    this.combat.stats = { shots: 0, hits: 0, kills: 0, damageTaken: 0, deaths: 0 };
    this.env.setDusk(0);
    this.hud.hideDeath();
    this.hud.hideMissionEnd();
    this.hud.setInventory(false, []);
    this.deathTimer = -1;
    for (const v of this.vehicles) v.setLights(false);
    // sistemas do Capítulo 1
    this.examine.close();
    this.repair.cancel();
    this.clues.clear();
    this.timers.clear();
    this.script.resetZones();
    this.cargo.detach();
    this.enemies.setCurfew(false);
    this.enemies.setFlashlights(false);
    this.hud.setClues([]);
    this.hud.setTimer(null);
    this.hud.setAwareness(0, "calmo");
  }

  /** Interface que o diretor da missão usa para agir sobre o jogo. */
  private missionHost(): MissionHost {
    return {
      flags: this.flags,
      quests: this.quests,
      enemies: this.enemies,
      setDusk: (t) => this.env.setDusk(t),
      dusk: () => this.env.duskLevel,
      playerFeet: () => this.player.feet,
      playerAlive: () => !this.combat.dead,
      drivingId: () => this.driving?.def.id ?? null,
      vehiclePosition: (id) => this.vehicles.find((v) => v.def.id === id)?.position ?? null,
      notice: (t, s) => this.hud.showNotice(t, s),
      equipPistol: async (ammo) => {
        await this.combat.equipPistol(ammo);
        this.inventory.add("pistola", 1);
        this.inventory.add("municao_pistola", ammo);
      },
      spawnPickup: (spec) => this.spawnPickup(spec),
      checkpoint: () => void this.saveGame(false),
      startRadioFinal: () => {
        const raquel = this.npcs.find((n) => n.variant === "raquel");
        if (raquel) void this.startRadioDialogue(raquel, DIALOGUE_RADIO_FINAL);
      },
      talkTo: (variant, maxDistance) => {
        const npc = this.npcs.find((n) => n.variant === variant);
        if (!npc || this.state !== "playing") return false;
        if (Vector3.Distance(npc.getPosition(), this.player.feet) > maxDistance) return false;
        void this.startDialogue(npc);
        return true;
      },
      npcPosition: (variant) => this.npcs.find((n) => n.variant === variant)?.getPosition() ?? null,
      playSting: (kind) => this.audio.playUi(kind === "vitoria" ? "chime" : "objective", 0.7),
    };
  }

  // ---------------------------------------------------------------------
  // Sistemas genéricos do Capítulo 1: pistas, exame, reparo, furtividade, timers, gatilhos, carga
  // ---------------------------------------------------------------------
  private setupChapterSystems(): void {
    this.effects.setQuality(this.settings.quality);
    this.cargo = new DeliveryCargo(this.scene);
    // exame: close-up + texto; usa o estado "dialogue" (movimento travado, prompt escondido, toque avança)
    this.examine = new ExamineController({
      camera: this.camera,
      hud: this.hud,
      flags: this.flags,
      clues: this.clues,
      viewerHead: () => this.player.feet.add(new Vector3(0, 1.62, 0)),
      begin: () => {
        this.state = "dialogue";
        this.player.locked = true;
        this.hud.setPrompt(null);
        this.hud.setObjectiveVisible(false);
        this.touch.setInteractAvailable(false);
        this.touch.setMode("dialogue");
        this.matias.animator.setOverlay(null);
        this.advanceResolver = () => this.examine.close();
      },
      end: () => {
        this.advanceResolver = null;
        this.hud.setObjectiveVisible(true);
        this.camera.setFollow();
        this.camera.snapBehind(this.player.yaw);
        if (this.state === "dialogue") {
          this.state = "playing";
          this.player.locked = false;
          this.touch.setMode("play");
        }
      },
    });
    this.examine.onExamined.on(({ spec }) => this.script.fire({ kind: "examinar", objeto: spec.id }));
    // reparo: minigame no prompt (E segurar/soltar), jogador travado enquanto dura
    this.repair = new RepairController({
      hud: this.hud,
      flags: this.flags,
      begin: () => {
        this.player.locked = true;
        this.hud.setPrompt(null);
        this.touch.setInteractAvailable(true);
      },
      end: () => {
        if (this.state === "playing") this.player.locked = false;
      },
      sound: (kind) => {
        if (kind === "done") this.audio.playUi("objective", 0.6);
        else this.audio.playUi(this.audio.pickVariation("switch", 3, "switch"), kind === "miss" ? 0.35 : 0.6);
      },
    });
    this.repair.onComplete.on(({ spec }) => {
      this.hud.showNotice(`${spec.title}: reparo concluído`, 3);
      this.script.fire({ kind: "reparo", maquina: spec.id });
    });
    this.input.onActionReleased.on((a) => {
      if (a === "interact" && this.repair.active && this.state === "playing") this.repair.release();
    });
    // pistas: aviso na HUD, aba da mochila, flag `pista.<slug>` (convenção do Enredo), gatilho e autosave
    this.clues.onAdded.on((c) => {
      this.audio.playUi("paper", 0.5);
      this.hud.showNotice(`Nova pista: ${c.title}`, 3.5);
      this.hud.setClues(this.clues.list());
      this.flags.set(c.id, true);
      this.script.fire({ kind: "pista", id: c.id });
      void this.saveGame(false);
    });
    // o caminho inverso: um diálogo que põe `pista.<slug> = true` (setFlag) também anota a pista no diário
    this.flags.onChange.on(({ key, value }) => {
      if (value === true && key.startsWith("pista.") && this.clues.get(key)) this.clues.add(key);
    });
    // timers: gatilho ao zerar
    this.timers.onExpired.on((t) => {
      this.audio.playUi("ui_click", 0.6);
      this.script.fire({ kind: "timer", id: t.id, segundos: t.total });
    });
    // furtividade: voz de prisão (fala provisória sintetizada) e gatilho de detecção
    this.enemies.onDetected.on(({ count, hostile }) => {
      const line = hostile ? "Última vez! Mãos para cima — vocês da oficina nunca aprendem." : count > 1 ? "De novo você? Parado aí, Setor 17, vou te levar." : "Toque de recolher! Parado aí — identifique-se!";
      this.hud.showSubtitle(CHARACTERS.custodio.displayName, line, false);
      const playback = this.voice.speak(line, CHARACTERS.custodio.voice);
      void playback.done.then(() => {
        if (this.state === "playing") this.hud.hideSubtitle();
      });
      this.audio.playUi("objective", 0.5);
      this.script.fire({ kind: "detectado" });
    });
    this.enemies.onCaught.on(() => this.hud.showNotice("Um Custódio alcançou Matias.", 3));
  }

  /** Nó de diálogo alcançado → gatilho `{kind:"dialogo"}` (ligado a cada DialogueRunner novo). */
  private bindDialogueTriggers(): void {
    this.dialogue.onLine.on(({ graph, line }) => this.script.fire({ kind: "dialogo", npc: graph.id, no: line.id }));
  }

  /** Ruído de Matias/veículo para a IA (passos por estado, motor), amostrado 5× por segundo. */
  private updateNoise(dt: number, feet: Vector3): void {
    this.noiseTimer -= dt;
    if (this.noiseTimer > 0) return;
    this.noiseTimer = 0.2;
    const radius = this.driving ? (Math.abs(this.driving.speed) > 1.5 ? VEHICLE_NOISE : 0) : this.player.noiseRadius;
    if (radius > 0) this.enemies.noise(feet, radius);
  }

  /** HUD dos sistemas: olho de detecção e timer. */
  private updateChapterHud(): void {
    const aw = this.enemies.awarenessSummary();
    this.hud.setAwareness(aw.level, aw.state);
    const t = this.timers.display;
    this.hud.setTimer(t ? (t.label ?? "") : null, t ? formatClock(t.remaining) : "", t ? t.remaining <= 15 : false);
  }

  // --- utilitários de depuração/roteiro (window.eva) --------------------------------------------
  /** Gatilhos de missão (fire manual: `eva.triggers.fire({kind:"zona", id:"x"})`). */
  get triggers(): MissionScript {
    return this.script;
  }

  addZone(spec: ZoneSpec): void {
    this.script.addZone(spec);
  }

  /** Cria um objeto examinável no mundo (dados). */
  addExaminable(spec: ExaminableSpec): void {
    this.interactables.push(this.examine.create(spec));
  }

  /** Cria uma máquina reparável no mundo (dados). */
  addRepairable(spec: RepairSpec): void {
    this.interactables.push(this.repair.create(spec));
  }

  /** Spawn de um Custódio de patrulha (não atira até ser provocado). */
  spawnCustodio(x: number, z: number, yaw: number, patrol: Array<[number, number]> = [], extra: Partial<EnemySpawnSpec> = {}): Promise<import("@/ai/enemy").Enemy> {
    return this.enemies.spawn({ position: new Vector3(x, 0.12, z), yaw, patrol: patrol.map(([px, pz]) => new Vector3(px, 0.12, pz)), role: "custodio", variant: "custodio", ...extra });
  }

  /** Toque de recolher: visão curta + audição longa dos guardas e lanternas acesas. */
  setCurfew(on: boolean): void {
    this.enemies.setCurfew(on);
    this.enemies.setFlashlights(on || this.env.isNight);
  }

  /** Prende a carga visível a um veículo (entrega ativa) ou solta (`null`). */
  setCargo(vehicleId: string | null): boolean {
    if (!vehicleId) {
      this.cargo.detach();
      return true;
    }
    const v = this.vehicles.find((x) => x.def.id === vehicleId);
    if (!v) return false;
    this.cargo.attach(v);
    return true;
  }

  /** Último gatilho disparado (testes). */
  lastTrigger(): MissionTrigger | null {
    return this.script.history[this.script.history.length - 1] ?? null;
  }

  /** Diálogo pelo rádio: sem NPC presente, a câmera fica em Matias e a voz vem com estática. */
  private async startRadioDialogue(remote: Npc, graph: DialogueGraph): Promise<void> {
    if (this.state !== "playing" || this.dialogue.isRunning) return;
    this.audio.playUi("radio_static", 0.3);
    this.hud.showNotice("O rádio da oficina chama.", 2.5);
    // usa o fluxo normal de diálogo; o NPC remoto só empresta nome e voz (a câmera enquadra Matias)
    await this.startDialogue(remote, graph);
  }

  // ---------------------------------------------------------------------
  // Veículos
  // ---------------------------------------------------------------------
  enterVehicle(v: Vehicle): void {
    if (this.state !== "playing" || this.driving || v.occupied) return;
    this.driving = v;
    v.occupied = true;
    v.controls = { throttle: 0, steer: 0, handbrake: false, lift: 0, boost: false };
    this.player.detachForVehicle();
    const root = this.matias.root;
    root.parent = v.seat;
    root.position.setAll(0);
    root.rotationQuaternion = Quaternion.Identity();
    this.matias.animator.setOverlay(null);
    this.matias.animator.play(v.def.driverClip);
    this.matias.setVisible(true);
    this.combat.setPistolVisible(false);
    if (v.hover) v.hover.setPowered(true);
    this.camera.setProfile({ distance: v.def.camera.distance, shoulder: 0, fov: 1.05, pitch: v.def.camera.pitch, pivotLift: v.def.camera.height, minDistance: 3.5 });
    this.camera.yaw = v.heading;
    this.camera.snapBehind(v.heading);
    const hint = v.def.kind === "hover" ? "Mouse aponta (olhe para cima para subir) · W/S empuxo · A/D deslocar · Espaço sobe · Ctrl desce · Shift turbo · E sair" : "W/S acelerar/frear · A/D virar · Espaço freio de mão · F faróis · E sair";
    this.hud.setVehicle(v.def.displayName, hint);
    this.audio.startEngine(v.def.kind);
    this.audio.playUi("switch", 0.5);
    if (this.env.isNight) v.setLights(true);
    this.flags.set(`veiculo.${v.def.id}.entrou`, true);
    this.script.fire({ kind: "veiculo", id: v.def.id, dentro: true });
  }

  exitVehicle(): void {
    const v = this.driving;
    if (!v) return;
    if (v.hover && v.altitude > 3) {
      this.hud.showNotice("Pouse antes de descer da aeromoto (Ctrl desce).", 3);
      return;
    }
    const pos = v.exitPosition();
    const d = pos.subtract(v.position);
    const yaw = Math.atan2(d.x, d.z);
    v.occupied = false;
    v.controls = { throttle: 0, steer: 0, handbrake: false, lift: 0, boost: false };
    if (v.hover) v.hover.setPowered(false);
    this.driving = null;
    this.player.attachFromVehicle(pos, yaw);
    this.matias.animator.play(this.combat.armed ? "PistolIdle" : "Idle");
    this.combat.setPistolVisible(this.combat.armed);
    this.camera.setWalkProfile();
    this.camera.yaw = yaw;
    this.camera.snapBehind(yaw);
    this.hud.setVehicle(null);
    this.hud.setPrompt(null);
    this.audio.stopEngine();
    this.script.fire({ kind: "veiculo", id: v.def.id, dentro: false });
  }

  private updateDriving(dt: number): void {
    const v = this.driving!;
    const axis = this.input.rawAxis();
    const held = (a: GameAction) => this.input.isHeld(a);
    const throttle = Math.max(-1, Math.min(1, axis.y));
    let lift = 0;
    let headingTarget: number | null = null;
    if (v.def.kind === "hover") {
      // Espaço/Ctrl mandam; sem eles, acelerando (W) a moto sobe ou desce conforme a câmera olha para cima
      // ou para baixo (zona morta de ±0,08 rad em torno da inclinação neutra do perfil da câmera)
      const direct = (held("advance") ? 1 : 0) - (held("crouchHold") || held("crouchToggle") ? 1 : 0);
      if (direct !== 0) lift = direct;
      else if (throttle > 0.05) {
        const look = -(this.camera.pitch - v.def.camera.pitch);
        const dead = 0.08;
        lift = Math.abs(look) < dead ? 0 : Math.max(-1, Math.min(1, (look - Math.sign(look) * dead) / 0.45));
      }
      headingTarget = this.camera.yaw;
    }
    v.controls = {
      throttle,
      steer: Math.max(-1, Math.min(1, axis.x)),
      handbrake: v.def.kind !== "hover" && held("advance"),
      lift,
      boost: held("run"),
      headingTarget,
    };
    this.hud.setVehicleSpeed(v.speedKmh, v.def.kind === "hover" ? v.altitudeAbs : null);
    if (v.outOfBounds && !this.boundsNoticeShown) {
      this.boundsNoticeShown = true;
      this.hud.showNotice("Limite do setor construído — suba para ir mais longe ou volte ao quarteirão.", 3);
      window.setTimeout(() => (this.boundsNoticeShown = false), 8000);
    }
    if (v.hover && v.air < 1 && !this.thinAirNoticeShown) {
      this.thinAirNoticeShown = true;
      this.hud.showNotice("Ar rarefeito: os rotores perdem sustentação acima de 60 km.", 4);
    }
    const rpm = Math.min(1, v.speedKmh / (v.def.maxSpeed * 3.6));
    this.audio.updateEngine(rpm, Math.abs(v.controls.throttle) * (v.def.kind === "hover" ? 1 : 1 - rpm * 0.5));
    if (v.lastImpact > 0) {
      this.audio.playAt("car_impact", v.position, Math.min(1, v.lastImpact / 4));
      v.lastImpact = 0;
    }
    void dt;
  }

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

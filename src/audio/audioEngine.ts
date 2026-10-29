import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { GameSettings } from "@/core/settings";
import { FOOTSTEP_VARIATIONS, SAMPLES, sampleUrl } from "@/data/sounds";
import type { Surface } from "@/world/surfaces";
import * as synth from "./synth";

export type Bus = "ambience" | "sfx" | "voice";

interface Emitter {
  id: string;
  source: AudioBufferSourceNode;
  panner: PannerNode;
  gain: GainNode;
  position: Vector3;
  baseVolume: number;
  stop(): void;
}

/**
 * Motor de áudio sobre a Web Audio API: barramentos (ambiente/efeitos/voz),
 * emissores espaciais (PannerNode) sincronizados com a câmera, passos e
 * feedback de interação. Passos e impactos são gravações CC0 (src/data/sounds.ts);
 * ambiente e interface ainda são sintetizados (ver synth.ts), que também serve de
 * fallback quando um arquivo não carrega.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buses: Record<Bus, GainNode> | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private emitters = new Map<string, Emitter>();
  private settings: GameSettings;
  private stepCounter = 0;
  private unlocked = false;

  constructor(settings: GameSettings) {
    this.settings = settings;
  }

  get isReady(): boolean {
    return this.unlocked && !!this.ctx;
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  /** Deve ser chamado a partir de um gesto do usuário (clique/tecla). */
  async unlock(): Promise<void> {
    if (this.unlocked) {
      if (this.ctx && this.ctx.state === "suspended") await this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    await this.ctx.resume();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.buses = {
      ambience: this.ctx.createGain(),
      sfx: this.ctx.createGain(),
      voice: this.ctx.createGain(),
    };
    for (const g of Object.values(this.buses)) g.connect(this.master);
    this.unlocked = true;
    this.applySettings(this.settings);
    this.prepareBuffers();
    void this.loadSamples();
  }

  /** Chaves de samples gravados já decodificados (para testes/diagnóstico). */
  readonly loadedSamples = new Set<string>();

  /** Baixa e decodifica os efeitos gravados; falhas mantêm o som sintetizado da mesma chave. */
  private async loadSamples(): Promise<void> {
    if (!this.ctx) return;
    await Promise.all(
      SAMPLES.map(async ({ key, file }) => {
        try {
          const res = await fetch(sampleUrl(file));
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.arrayBuffer();
          const buffer = await this.ctx!.decodeAudioData(data);
          this.buffers.set(key, buffer);
          this.loadedSamples.add(key);
        } catch (err) {
          console.warn(`[audio] sample ${file} indisponível (${(err as Error).message}); mantendo síntese`);
        }
      }),
    );
  }

  applySettings(settings: GameSettings): void {
    this.settings = settings;
    if (!this.ctx || !this.master || !this.buses) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(settings.muted ? 0 : settings.volumeMaster, t, 0.05);
    this.buses.ambience.gain.setTargetAtTime(settings.volumeAmbience, t, 0.05);
    this.buses.sfx.gain.setTargetAtTime(settings.volumeSfx, t, 0.05);
    this.buses.voice.gain.setTargetAtTime(settings.volumeVoice, t, 0.05);
  }

  private toBuffer(sb: synth.SynthBuffer): AudioBuffer {
    const buf = this.ctx!.createBuffer(sb.channels.length, sb.channels[0]!.length, sb.sampleRate);
    sb.channels.forEach((ch, i) => buf.copyToChannel(ch, i));
    return buf;
  }

  private prepareBuffers(): void {
    if (!this.ctx) return;
    const sr = this.ctx.sampleRate;
    const put = (key: string, sb: synth.SynthBuffer) => this.buffers.set(key, this.toBuffer(sb));
    for (let i = 0; i < 4; i++) {
      put(`step_walk_${i}`, synth.footstep(sr, "walk", 100 + i));
      put(`step_run_${i}`, synth.footstep(sr, "run", 200 + i));
      put(`step_crouch_${i}`, synth.footstep(sr, "crouch", 300 + i));
    }
    put("wind", synth.windLoop(sr, 8, 7));
    put("generator", synth.generatorLoop(sr, 3, 9));
    put("crowd", synth.crowdLoop(sr, 6, 13));
    put("radio_static", synth.radioStaticLoop(sr, 3, 17));
    put("flicker", synth.fluorescentBuzz(sr, 1));
    put("ui_click", synth.click(sr, 1800, 1));
    put("ui_select", synth.click(sr, 1200, 2));
    put("switch", synth.click(sr, 600, 3));
    put("chime", synth.chime(sr, 520));
    put("objective", synth.chime(sr, 392));
    put("paper", synth.paperRustle(sr, 5));
    // vertical slice (sintetizados, provisórios)
    put("engine_car", synth.engineLoop(sr, 1.5, 21));
    put("engine_trike", synth.engineLoop(sr, 1.2, 23));
    put("rotor", synth.rotorLoop(sr, 2.0, 25));
    for (let i = 0; i < 3; i++) {
      put(`gunshot_${i}`, synth.gunshot(sr, 31 + i));
      put(`ricochet_${i}`, synth.ricochet(sr, 41 + i));
      put(`hurt_${i}`, synth.hurtGrunt(sr, 51 + i, 1 - i * 0.1));
    }
    put("mag_click", synth.magazineClick(sr, 61));
    put("car_impact", synth.carImpact(sr, 71));
  }

  // --- motor do veículo (loop com tom e volume controlados por rotação) ------------------------
  private engineSource: AudioBufferSourceNode | null = null;
  private engineGain: GainNode | null = null;
  private engineKind: "car" | "trike" | "hover" | null = null;

  startEngine(kind: "car" | "trike" | "hover"): void {
    if (!this.ctx || !this.buses) return;
    this.stopEngine();
    const key = kind === "hover" ? "rotor" : kind === "trike" ? "engine_trike" : "engine_car";
    const buf = this.buffers.get(key);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.0001;
    src.connect(gain);
    gain.connect(this.buses.sfx);
    src.start();
    this.engineSource = src;
    this.engineGain = gain;
    this.engineKind = kind;
    gain.gain.setTargetAtTime(kind === "hover" ? 0.5 : 0.35, this.ctx.currentTime, 0.4);
  }

  /** `rpm` 0..1 (rotação normalizada), `load` 0..1 (acelerador). */
  updateEngine(rpm: number, load: number): void {
    if (!this.ctx || !this.engineSource || !this.engineGain) return;
    const t = this.ctx.currentTime;
    const rate = this.engineKind === "hover" ? 0.85 + rpm * 0.5 : 0.8 + rpm * 1.6;
    this.engineSource.playbackRate.setTargetAtTime(rate, t, 0.12);
    const vol = (this.engineKind === "hover" ? 0.45 : 0.3) + load * 0.25 + rpm * 0.1;
    this.engineGain.gain.setTargetAtTime(vol, t, 0.15);
  }

  stopEngine(): void {
    if (!this.ctx) return;
    const src = this.engineSource;
    const gain = this.engineGain;
    if (src && gain) {
      gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.25);
      window.setTimeout(() => {
        try {
          src.stop();
        } catch {
          /* já parado */
        }
        src.disconnect();
        gain.disconnect();
      }, 700);
    }
    this.engineSource = null;
    this.engineGain = null;
    this.engineKind = null;
  }

  /** Som não espacial (interface). */
  playUi(key: string, volume = 1): void {
    this.playBuffer(key, "sfx", volume);
  }

  private playBuffer(key: string, bus: Bus, volume: number, playbackRate = 1): AudioBufferSourceNode | null {
    if (!this.ctx || !this.buses) return null;
    const buffer = this.buffers.get(key);
    if (!buffer) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = playbackRate;
    const g = this.ctx.createGain();
    g.gain.value = volume;
    src.connect(g);
    g.connect(this.buses[bus]);
    src.start();
    src.onended = () => {
      src.disconnect();
      g.disconnect();
    };
    return src;
  }

  private lastStepIndex = -1;

  /**
   * Passo de Matias: gravação da superfície (concreto/terra/madeira) sorteada sem repetir a anterior,
   * tom ±6 % e volume por marcha; correr soma um impacto surdo. Sem sample carregado, cai na síntese.
   */
  playFootstep(kind: "walk" | "run" | "crouch", surface: Surface = "concrete"): void {
    this.stepCounter++;
    let i = Math.floor(Math.random() * FOOTSTEP_VARIATIONS);
    if (i === this.lastStepIndex) i = (i + 1) % FOOTSTEP_VARIATIONS;
    this.lastStepIndex = i;
    const key = `step_${surface}_${i}`;
    const vol = kind === "run" ? 0.85 : kind === "crouch" ? 0.3 : 0.55;
    if (this.buffers.has(key)) {
      const rate = (kind === "run" ? 0.96 : kind === "crouch" ? 1.02 : 1.0) * (0.94 + Math.random() * 0.12);
      this.playBuffer(key, "sfx", vol, rate);
      return;
    }
    const synthIndex = this.stepCounter % 4;
    this.playBuffer(`step_${kind}_${synthIndex}`, "sfx", vol, 0.92 + ((this.stepCounter * 7) % 5) * 0.04);
  }

  /** Sorteia uma variação gravada (`prefix_N`); devolve a chave sintetizada se nenhuma estiver carregada. */
  pickVariation(prefix: string, count: number, fallback: string): string {
    const i = Math.floor(Math.random() * count);
    for (let k = 0; k < count; k++) {
      const key = `${prefix}_${(i + k) % count}`;
      if (this.loadedSamples.has(key)) return key;
    }
    return fallback;
  }

  /** Som pontual espacializado numa posição. */
  playAt(key: string, position: Vector3, volume = 1, refDistance = 2, maxDistance = 20): void {
    if (!this.ctx || !this.buses) return;
    const buffer = this.buffers.get(key);
    if (!buffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const panner = this.makePanner(position, refDistance, maxDistance);
    const g = this.ctx.createGain();
    g.gain.value = volume;
    src.connect(g);
    g.connect(panner);
    panner.connect(this.buses.sfx);
    src.start();
    src.onended = () => {
      src.disconnect();
      g.disconnect();
      panner.disconnect();
    };
  }

  private makePanner(position: Vector3, refDistance: number, maxDistance: number): PannerNode {
    const p = this.ctx!.createPanner();
    p.panningModel = "HRTF";
    p.distanceModel = "inverse";
    p.refDistance = refDistance;
    p.maxDistance = maxDistance;
    p.rolloffFactor = 1.4;
    p.positionX.value = position.x;
    p.positionY.value = position.y;
    p.positionZ.value = position.z;
    return p;
  }

  /** Emissor contínuo (loop) numa posição do mundo. */
  startEmitter(id: string, key: string, position: Vector3, volume: number, radius: number, bus: Bus = "ambience"): void {
    if (!this.ctx || !this.buses || this.emitters.has(id)) return;
    const buffer = this.buffers.get(key);
    if (!buffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const panner = this.makePanner(position, Math.max(1, radius * 0.15), radius);
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain);
    gain.connect(panner);
    panner.connect(this.buses[bus]);
    src.start(0, Math.random() * buffer.duration);
    this.emitters.set(id, {
      id,
      source: src,
      panner,
      gain,
      position: position.clone(),
      baseVolume: volume,
      stop: () => {
        try {
          src.stop();
        } catch {
          /* já parado */
        }
        src.disconnect();
        gain.disconnect();
        panner.disconnect();
      },
    });
  }

  /** Som global em loop (não espacial), ex.: vento. */
  startLoop(id: string, key: string, volume: number, bus: Bus = "ambience"): void {
    if (!this.ctx || !this.buses || this.emitters.has(id)) return;
    const buffer = this.buffers.get(key);
    if (!buffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain);
    gain.connect(this.buses[bus]);
    src.start();
    const panner = this.ctx.createPanner();
    this.emitters.set(id, {
      id,
      source: src,
      panner,
      gain,
      position: new Vector3(),
      baseVolume: volume,
      stop: () => {
        try {
          src.stop();
        } catch {
          /* já parado */
        }
        src.disconnect();
        gain.disconnect();
      },
    });
  }

  setEmitterVolume(id: string, volume: number, seconds = 0.3): void {
    const e = this.emitters.get(id);
    if (!e || !this.ctx) return;
    e.gain.gain.setTargetAtTime(volume, this.ctx.currentTime, seconds);
  }

  stopEmitter(id: string, fadeSeconds = 0.2): void {
    const e = this.emitters.get(id);
    if (!e || !this.ctx) return;
    e.gain.gain.setTargetAtTime(0, this.ctx.currentTime, fadeSeconds / 3);
    this.emitters.delete(id);
    window.setTimeout(() => e.stop(), fadeSeconds * 1000 + 50);
  }

  hasEmitter(id: string): boolean {
    return this.emitters.has(id);
  }

  /** Atualiza o ouvinte com a câmera (posição e orientação). */
  updateListener(position: Vector3, forward: Vector3, up: Vector3): void {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(position.x, t, 0.02);
      l.positionY.setTargetAtTime(position.y, t, 0.02);
      l.positionZ.setTargetAtTime(position.z, t, 0.02);
      l.forwardX.setTargetAtTime(forward.x, t, 0.02);
      l.forwardY.setTargetAtTime(forward.y, t, 0.02);
      l.forwardZ.setTargetAtTime(forward.z, t, 0.02);
      l.upX.setTargetAtTime(up.x, t, 0.02);
      l.upY.setTargetAtTime(up.y, t, 0.02);
      l.upZ.setTargetAtTime(up.z, t, 0.02);
    } else {
      const legacy = l as unknown as { setPosition(x: number, y: number, z: number): void; setOrientation(a: number, b: number, c: number, d: number, e: number, f: number): void };
      legacy.setPosition(position.x, position.y, position.z);
      legacy.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }

  /** Abafa tudo que não é voz durante diálogos. */
  duck(active: boolean): void {
    if (!this.ctx || !this.buses) return;
    const t = this.ctx.currentTime;
    this.buses.ambience.gain.setTargetAtTime(active ? this.settings.volumeAmbience * 0.45 : this.settings.volumeAmbience, t, 0.3);
    this.buses.sfx.gain.setTargetAtTime(active ? this.settings.volumeSfx * 0.6 : this.settings.volumeSfx, t, 0.3);
  }

  async suspend(): Promise<void> {
    if (this.ctx && this.ctx.state === "running") await this.ctx.suspend();
  }

  async resume(): Promise<void> {
    if (this.ctx && this.ctx.state === "suspended") await this.ctx.resume();
  }
}

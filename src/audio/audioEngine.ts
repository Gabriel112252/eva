import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { GameSettings } from "@/core/settings";
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
 * feedback de interação. Todos os sons são sintetizados (ver synth.ts).
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

  /** Passo de Matias: variações aleatórias e tom levemente diferente a cada passo. */
  playFootstep(kind: "walk" | "run" | "crouch"): void {
    const i = this.stepCounter++ % 4;
    const rate = 0.92 + ((this.stepCounter * 7) % 5) * 0.04;
    const vol = kind === "run" ? 0.9 : kind === "crouch" ? 0.35 : 0.6;
    this.playBuffer(`step_${kind}_${i}`, "sfx", vol, rate);
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

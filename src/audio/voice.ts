import type { AudioEngine } from "./audioEngine";

export interface VoiceProfile {
  pitch: number;
  rate: number;
  gender: "male" | "female";
}

export interface VoicePlayback {
  /** resolve quando a fala termina (ou quando interrompida) */
  done: Promise<void>;
  cancel(): void;
  /** "tts" = síntese do navegador (provisória); "file" = arquivo gravado; "none" = sem áudio disponível */
  mode: "tts" | "file" | "none";
}

/**
 * Serviço de voz dos diálogos.
 *  - Se a linha tiver `voice` (arquivo em public/assets/audio/voice/), toca o arquivo.
 *  - Senão, usa a síntese de fala do navegador em pt-BR (PROVISÓRIO, não é dublagem).
 *  - Sem suporte: só legendas, com duração estimada pela leitura.
 */
export class VoiceService {
  private voices: SpeechSynthesisVoice[] = [];
  private current: VoicePlayback | null = null;
  enabled = true;

  constructor(private readonly audio: AudioEngine) {
    if (typeof speechSynthesis !== "undefined") {
      const load = () => {
        this.voices = speechSynthesis.getVoices();
      };
      load();
      speechSynthesis.addEventListener?.("voiceschanged", load);
    }
  }

  get ttsAvailable(): boolean {
    return typeof speechSynthesis !== "undefined" && typeof SpeechSynthesisUtterance !== "undefined";
  }

  /** Voz pt-BR preferida (Google/Microsoft/Luciana/Felipe…), por gênero quando possível. */
  pickVoice(gender: "male" | "female"): SpeechSynthesisVoice | null {
    if (this.voices.length === 0 && this.ttsAvailable) this.voices = speechSynthesis.getVoices();
    const ptBr = this.voices.filter((v) => /pt[-_]BR/i.test(v.lang));
    const pt = ptBr.length ? ptBr : this.voices.filter((v) => /^pt/i.test(v.lang));
    if (pt.length === 0) return null;
    const maleHints = /felipe|daniel|ricardo|thiago|antonio|male|masc/i;
    const femaleHints = /luciana|francisca|maria|vitoria|camila|female|fem/i;
    const byGender = pt.find((v) => (gender === "male" ? maleHints : femaleHints).test(v.name));
    if (byGender) return byGender;
    const google = pt.find((v) => /google/i.test(v.name));
    return google ?? pt[0] ?? null;
  }

  /** Estimativa de leitura em segundos (para legendas sem voz). */
  static readingTime(text: string): number {
    const words = text.trim().split(/\s+/).length;
    return Math.max(1.6, Math.min(9, 0.9 + words * 0.36));
  }

  speak(text: string, profile: VoiceProfile, file?: string): VoicePlayback {
    this.cancel();
    if (file) {
      const pb = this.playFile(file, text);
      this.current = pb;
      return pb;
    }
    if (!this.enabled || !this.ttsAvailable) {
      const pb = this.silent(text);
      this.current = pb;
      return pb;
    }
    const u = new SpeechSynthesisUtterance(text);
    const voice = this.pickVoice(profile.gender);
    if (voice) u.voice = voice;
    u.lang = "pt-BR";
    u.pitch = profile.pitch;
    u.rate = profile.rate;
    u.volume = 1;
    let resolveDone: () => void = () => undefined;
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });
    let finished = false;
    let fallbackTimer = 0;
    const started = performance.now();
    const readingMs = VoiceService.readingTime(text) * 1000;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(fallbackTimer);
      resolveDone();
    };
    // Se a síntese falhar ou terminar cedo demais (sem voz instalada, erro do navegador),
    // mantém a legenda pelo tempo de leitura em vez de pular a fala.
    const finishOrHold = () => {
      if (finished) return;
      const elapsed = performance.now() - started;
      if (elapsed < readingMs * 0.5) fallbackTimer = window.setTimeout(finish, readingMs - elapsed);
      else finish();
    };
    u.onend = finishOrHold;
    u.onerror = finishOrHold;
    // Proteção: alguns navegadores nunca disparam onend após cancel()/pausa
    const safety = window.setTimeout(finish, readingMs + 4000);
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    const pb: VoicePlayback = {
      done,
      mode: "tts",
      cancel: () => {
        window.clearTimeout(safety);
        speechSynthesis.cancel();
        finish();
      },
    };
    this.current = pb;
    return pb;
  }

  private silent(text: string): VoicePlayback {
    let timer = 0;
    let resolveDone: () => void = () => undefined;
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve;
      timer = window.setTimeout(resolve, VoiceService.readingTime(text) * 1000);
    });
    return {
      done,
      mode: "none",
      cancel: () => {
        window.clearTimeout(timer);
        resolveDone();
      },
    };
  }

  private playFile(url: string, text: string): VoicePlayback {
    const el = new Audio(url);
    el.preload = "auto";
    let resolveDone: () => void = () => undefined;
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });
    const ctx = this.audio.context;
    let node: MediaElementAudioSourceNode | null = null;
    if (ctx) {
      try {
        node = ctx.createMediaElementSource(el);
        node.connect(ctx.destination);
      } catch {
        node = null;
      }
    }
    el.onended = () => resolveDone();
    el.onerror = () => {
      // arquivo ausente: cai para o tempo de leitura
      window.setTimeout(resolveDone, VoiceService.readingTime(text) * 1000);
    };
    void el.play().catch(() => window.setTimeout(resolveDone, VoiceService.readingTime(text) * 1000));
    return {
      done,
      mode: "file",
      cancel: () => {
        el.pause();
        node?.disconnect();
        resolveDone();
      },
    };
  }

  cancel(): void {
    this.current?.cancel();
    this.current = null;
  }
}

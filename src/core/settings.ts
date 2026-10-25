/** Configurações do jogador (persistidas localmente). */
export type QualityLevel = "baixa" | "media" | "alta";

export interface GameSettings {
  mouseSensitivity: number; // 0.2 – 3.0
  invertY: boolean;
  volumeMaster: number; // 0 – 1
  volumeAmbience: number;
  volumeSfx: number;
  volumeVoice: number;
  muted: boolean;
  quality: QualityLevel;
  subtitles: boolean;
  voiceTts: boolean; // usa síntese de voz do navegador quando não há arquivo de voz
}

export const DEFAULT_SETTINGS: GameSettings = {
  mouseSensitivity: 1.0,
  invertY: false,
  volumeMaster: 0.9,
  volumeAmbience: 0.8,
  volumeSfx: 0.9,
  volumeVoice: 1.0,
  muted: false,
  quality: "media",
  subtitles: true,
  voiceTts: true,
};

export function sanitizeSettings(input: unknown): GameSettings {
  const src = (input && typeof input === "object" ? input : {}) as Partial<Record<keyof GameSettings, unknown>>;
  const num = (v: unknown, def: number, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
  const bool = (v: unknown, def: boolean) => (typeof v === "boolean" ? v : def);
  const quality: QualityLevel = src.quality === "baixa" || src.quality === "media" || src.quality === "alta" ? src.quality : DEFAULT_SETTINGS.quality;
  return {
    mouseSensitivity: num(src.mouseSensitivity, DEFAULT_SETTINGS.mouseSensitivity, 0.2, 3),
    invertY: bool(src.invertY, DEFAULT_SETTINGS.invertY),
    volumeMaster: num(src.volumeMaster, DEFAULT_SETTINGS.volumeMaster, 0, 1),
    volumeAmbience: num(src.volumeAmbience, DEFAULT_SETTINGS.volumeAmbience, 0, 1),
    volumeSfx: num(src.volumeSfx, DEFAULT_SETTINGS.volumeSfx, 0, 1),
    volumeVoice: num(src.volumeVoice, DEFAULT_SETTINGS.volumeVoice, 0, 1),
    muted: bool(src.muted, DEFAULT_SETTINGS.muted),
    quality,
    subtitles: bool(src.subtitles, DEFAULT_SETTINGS.subtitles),
    voiceTts: bool(src.voiceTts, DEFAULT_SETTINGS.voiceTts),
  };
}

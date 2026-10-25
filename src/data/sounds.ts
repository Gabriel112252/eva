/**
 * Efeitos sonoros gravados (arquivos em public/assets/audio/sfx/). Origem e licença em
 * public/assets/licenses/ASSETS.md (Kenney Impact Sounds, CC0). Quando um arquivo falta ou não
 * carrega, o motor mantém o som sintetizado de mesma chave como fallback.
 */
export interface SampleSpec {
  /** chave usada pelo AudioEngine (ex.: step_concrete_0) */
  key: string;
  /** nome do arquivo em assets/audio/sfx/ */
  file: string;
}

export const FOOTSTEP_SURFACES = ["concrete", "grass", "wood"] as const;
export const FOOTSTEP_VARIATIONS = 5;

export const SAMPLES: SampleSpec[] = [
  ...FOOTSTEP_SURFACES.flatMap((s) => Array.from({ length: FOOTSTEP_VARIATIONS }, (_, i) => ({ key: `step_${s}_${i}`, file: `step_${s}_${i}.ogg` }))),
  ...[0, 1, 2].map((i) => ({ key: `switch_${i}`, file: `switch_${i}.ogg` })),
  ...[0, 1, 2].map((i) => ({ key: `pickup_${i}`, file: `pickup_${i}.ogg` })),
  ...[0, 1, 2].map((i) => ({ key: `wood_bump_${i}`, file: `wood_bump_${i}.ogg` })),
];

export function sampleUrl(file: string): string {
  return `${import.meta.env.BASE_URL}assets/audio/sfx/${file}`;
}

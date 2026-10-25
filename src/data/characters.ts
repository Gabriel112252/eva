/** Metadados dos personagens 3D (arquivos em public/assets/characters/, gerados por tools/gen-character.mjs). */
export type CharacterVariant = "matias" | "miriam" | "custodio" | "comerciante" | "raquel" | "ana";

export interface CharacterInfo {
  variant: CharacterVariant;
  /** nome exibido nas legendas */
  displayName: string;
  /** altura em metros do modelo */
  height: number;
  /** raio da cápsula de colisão */
  radius: number;
  /** prompt de interação (NPCs) */
  prompt?: string;
  /** perfil de voz provisório (síntese do navegador) */
  voice: { pitch: number; rate: number; gender: "male" | "female" };
}

export const CHARACTERS: Record<CharacterVariant, CharacterInfo> = {
  matias: { variant: "matias", displayName: "Matias", height: 1.76, radius: 0.32, voice: { pitch: 0.82, rate: 0.95, gender: "male" } },
  miriam: { variant: "miriam", displayName: "Miriam", height: 1.68, radius: 0.3, prompt: "Falar com Miriam", voice: { pitch: 1.05, rate: 0.98, gender: "female" } },
  custodio: { variant: "custodio", displayName: "Custódio", height: 1.83, radius: 0.34, prompt: "Falar com o Custódio", voice: { pitch: 0.75, rate: 0.92, gender: "male" } },
  comerciante: { variant: "comerciante", displayName: "Comerciante", height: 1.7, radius: 0.32, prompt: "Falar com o comerciante", voice: { pitch: 0.95, rate: 1.05, gender: "male" } },
  raquel: { variant: "raquel", displayName: "Raquel", height: 1.65, radius: 0.3, prompt: "Falar com Raquel", voice: { pitch: 1.0, rate: 0.95, gender: "female" } },
  ana: { variant: "ana", displayName: "Ana", height: 1.6, radius: 0.28, prompt: "Falar com Ana", voice: { pitch: 1.2, rate: 1.02, gender: "female" } },
};

export const ANIMATION_CLIPS = ["Idle", "Walk", "Run", "CrouchIdle", "CrouchWalk", "Talk", "Interact", "PickUp"] as const;
export type AnimationClip = (typeof ANIMATION_CLIPS)[number];
/** Clipes tocados uma vez (não em loop). */
export const ONE_SHOT_CLIPS: readonly AnimationClip[] = ["Interact", "PickUp"];

/**
 * Velocidade natural (m/s) de cada clipe de locomoção a 1× — medida pela velocidade do pé apoiado nos
 * loops in-place da Quaternius Universal Animation Library (manequim de ~1,80 m). O controlador ajusta
 * a velocidade de reprodução para `velocidade real / (natural × altura/1,80)`, eliminando pés deslizando.
 */
export const CLIP_SPEEDS: Partial<Record<AnimationClip, number>> = { Walk: 0.98, Run: 6.1, CrouchWalk: 0.7 };
export const CLIP_REFERENCE_HEIGHT = 1.8;

/**
 * URL do modelo. VITE_CHARACTER_EXT permite renomear os .glb em hospedagens que
 * restringem extensões servidas (ex.: ".glb.wasm" em builds de teste); o loader
 * recebe pluginExtension ".glb" explicitamente, então o nome do arquivo não importa.
 */
export function characterUrl(variant: CharacterVariant): string {
  const ext = (import.meta.env.VITE_CHARACTER_EXT as string | undefined) ?? ".glb";
  return `${import.meta.env.BASE_URL}assets/characters/${variant}${ext}`;
}

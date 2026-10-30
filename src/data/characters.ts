/** Metadados dos personagens 3D (arquivos em public/assets/characters/, gerados por tools/blender/make_character.py). */
export type CharacterVariant = "matias" | "miriam" | "custodio" | "comerciante" | "raquel" | "ana" | "saqueador_a" | "saqueador_b" | "brandao" | "elias";

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
  saqueador_a: { variant: "saqueador_a", displayName: "Desviador", height: 1.78, radius: 0.32, voice: { pitch: 0.85, rate: 1.0, gender: "male" } },
  saqueador_b: { variant: "saqueador_b", displayName: "Desviador", height: 1.74, radius: 0.32, voice: { pitch: 0.78, rate: 0.97, gender: "male" } },
  // Capítulo 1 (carregados sob demanda pelo diretor; não nascem com a praça)
  brandao: { variant: "brandao", displayName: "Samuel Brandão", height: 1.74, radius: 0.33, prompt: "Falar com Samuel Brandão", voice: { pitch: 0.68, rate: 0.9, gender: "male" } },
  elias: { variant: "elias", displayName: "Elias Nobre", height: 1.79, radius: 0.3, prompt: "Falar com Elias", voice: { pitch: 1.02, rate: 1.12, gender: "male" } },
};

/** Variantes que são NPCs falantes da praça/rua (os saqueadores são inimigos: ver src/ai/). */
export const NPC_TALKERS: CharacterVariant[] = ["miriam", "custodio", "comerciante", "raquel", "ana"];
export const ENEMY_VARIANTS: CharacterVariant[] = ["saqueador_a", "saqueador_b"];

/**
 * Elenco do Capítulo 1 carregado sob demanda pelo diretor (docs/ROTEIRO_CAP1.md §1): papéis que não nascem com a
 * praça. Cada papel tem GLB próprio gerado por tools/blender/make_character.py — `brandao.glb` (farda cinza de
 * oficial de distribuição, sem armadura, prancheta e crachá) e `elias.glb` (mensageiro de 24 anos: jaqueta leve
 * aberta, lenço, bolsa transversal com documentos). O nome nas legendas vem de `SPEAKER_NAMES` (dialogues.ts).
 */
export type CastRole = "brandao" | "elias";

export interface CastInfo {
  role: CastRole;
  /** GLB do papel (a própria variante) */
  model: CharacterVariant;
  displayName: string;
  prompt: string;
  /** perfil de voz provisório (síntese do navegador), distinto dos demais falantes */
  voice: CharacterInfo["voice"];
  /** o que ainda falta para o papel */
  pending: string;
}

function castOf(role: CastRole, pending: string): CastInfo {
  const info = CHARACTERS[role];
  return { role, model: role, displayName: info.displayName, prompt: info.prompt ?? `Falar com ${info.displayName}`, voice: info.voice, pending };
}

export const CHAPTER1_CAST: Record<CastRole, CastInfo> = {
  brandao: castOf("brandao", "dublagem (voz sintetizada provisória)"),
  elias: castOf("elias", "dublagem (voz sintetizada provisória)"),
};

/**
 * Papéis que ainda reaproveitam o GLB de outra variante (provisório declarado em docs/STATUS.md).
 * Vazio desde 30/10/2026: Brandão e Elias ganharam modelos próprios (`CHAPTER1_CAST`).
 */
export const PROVISIONAL_CAST: Readonly<Record<string, CastInfo>> = {};

/** Papel de um NPC/falante: variante da praça ou papel do elenco do capítulo. */
export type NpcRole = CharacterVariant | CastRole;

export function isCastRole(role: string): role is CastRole {
  return role in CHAPTER1_CAST;
}

/** Perfil de voz de um falante (variante, papel do elenco ou Matias como padrão). */
export function speakerVoice(speaker: string): CharacterInfo["voice"] {
  if (isCastRole(speaker)) return CHAPTER1_CAST[speaker].voice;
  if (speaker in CHARACTERS) return CHARACTERS[speaker as CharacterVariant].voice;
  return CHARACTERS.matias.voice;
}

export const ANIMATION_CLIPS = ["Idle", "Walk", "Run", "CrouchIdle", "CrouchWalk", "Talk", "Interact", "PickUp", "PistolIdle", "PistolAim", "PistolShoot", "PistolReload", "Hit", "Death", "Driving", "Sit"] as const;
export type AnimationClip = (typeof ANIMATION_CLIPS)[number];
/** Clipes tocados uma vez (não em loop). */
export const ONE_SHOT_CLIPS: readonly AnimationClip[] = ["Interact", "PickUp", "PistolShoot", "PistolReload", "Hit", "Death"];
/** Clipes que param no último quadro em vez de voltar ao anterior (morte). */
export const HOLD_LAST_FRAME_CLIPS: readonly AnimationClip[] = ["Death"];

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

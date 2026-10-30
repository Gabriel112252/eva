/** Metadados dos personagens 3D (arquivos em public/assets/characters/, gerados por tools/gen-character.mjs). */
export type CharacterVariant = "matias" | "miriam" | "custodio" | "comerciante" | "raquel" | "ana" | "saqueador_a" | "saqueador_b";

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
};

/** Variantes que são NPCs falantes da praça/rua (os saqueadores são inimigos: ver src/ai/). */
export const NPC_TALKERS: CharacterVariant[] = ["miriam", "custodio", "comerciante", "raquel", "ana"];
export const ENEMY_VARIANTS: CharacterVariant[] = ["saqueador_a", "saqueador_b"];

/**
 * Elenco do Capítulo 1 SEM GLB próprio (docs/ROTEIRO_CAP1.md §1): cada papel reaproveita o modelo rigado de
 * outra variante — **PROVISÓRIO e declarado** (docs/STATUS.md) até a Arte gerar `brandao.glb`/`elias.glb`.
 * O nome nas legendas vem de `SPEAKER_NAMES` (dialogues.ts); aqui ficam o modelo, o prompt e a voz sintetizada.
 * Os modelos escolhidos não aparecem na mesma cena que o papel (os saqueadores só existem como inimigos em M1).
 */
export type CastRole = "brandao" | "elias";

export interface CastInfo {
  role: CastRole;
  /** GLB reaproveitado (provisório) */
  model: CharacterVariant;
  displayName: string;
  prompt: string;
  /** perfil de voz provisório (síntese do navegador), distinto dos demais falantes */
  voice: CharacterInfo["voice"];
  /** o que falta para o papel deixar de ser provisório */
  pending: string;
}

export const PROVISIONAL_CAST: Record<CastRole, CastInfo> = {
  brandao: {
    role: "brandao",
    model: "saqueador_b",
    displayName: "Samuel Brandão",
    prompt: "Falar com Samuel Brandão",
    voice: { pitch: 0.68, rate: 0.9, gender: "male" },
    pending: "GLB próprio: oficial de distribuição, farda cinza sem armadura, ~45 anos (hoje usa saqueador_b, 41 anos, camisa cinza-azulada)",
  },
  elias: {
    role: "elias",
    model: "saqueador_a",
    displayName: "Elias Nobre",
    prompt: "Falar com Elias",
    voice: { pitch: 1.02, rate: 1.12, gender: "male" },
    pending: "GLB próprio: mensageiro dos Silenciosos, 24 anos, roupa leve de quem carrega (hoje usa saqueador_a, 29 anos)",
  },
};

/** Papel de um NPC/falante: variante com GLB próprio ou papel do elenco provisório. */
export type NpcRole = CharacterVariant | CastRole;

export function isCastRole(role: string): role is CastRole {
  return role in PROVISIONAL_CAST;
}

/** Perfil de voz de um falante (variante, papel provisório ou Matias como padrão). */
export function speakerVoice(speaker: string): CharacterInfo["voice"] {
  if (isCastRole(speaker)) return PROVISIONAL_CAST[speaker].voice;
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

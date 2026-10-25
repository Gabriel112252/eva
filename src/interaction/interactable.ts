import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AnimationClip } from "@/data/characters";

/** Qualquer coisa com a qual Matias pode interagir pressionando E. */
export interface Interactable {
  readonly id: string;
  /** Distância máxima (m) para o prompt aparecer. */
  readonly radius: number;
  /** Clipe que Matias toca ao interagir (padrão: "Interact" — estender a mão; "PickUp" para pegar de uma mesa). */
  readonly clip?: AnimationClip;
  /** Posição mundial de referência. */
  getPosition(): Vector3;
  /** Texto do prompt (ex.: "Falar com Miriam"); null quando indisponível. */
  getPrompt(): string | null;
  /** Executa a interação. */
  interact(): void;
}

export interface InteractionCandidate {
  target: Interactable;
  distance: number;
  prompt: string;
}

/**
 * Escolhe o melhor alvo: dentro do raio e dentro de um cone à frente do personagem
 * (ou da câmera). Lógica pura — testável sem engine.
 */
export function pickInteractable(
  list: readonly Interactable[],
  origin: { x: number; z: number },
  forward: { x: number; z: number },
  coneCos = 0.35,
): InteractionCandidate | null {
  let best: InteractionCandidate | null = null;
  for (const it of list) {
    const prompt = it.getPrompt();
    if (!prompt) continue;
    const p = it.getPosition();
    const dx = p.x - origin.x;
    const dz = p.z - origin.z;
    const dist = Math.hypot(dx, dz);
    if (dist > it.radius) continue;
    // muito perto: ignora o cone (o jogador está "em cima" do objeto)
    if (dist > 0.6) {
      const dot = (dx * forward.x + dz * forward.z) / (dist || 1);
      if (dot < coneCos) continue;
    }
    const score = dist;
    if (!best || score < best.distance) best = { target: it, distance: score, prompt };
  }
  return best;
}

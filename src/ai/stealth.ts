import type { MoveState } from "@/player/playerController";

/**
 * Furtividade — regras puras (sem engine), compartilhadas por `Enemy` (Custódio de patrulha), HUD e testes.
 *
 * Estados de percepção de um guarda:
 *   calmo → suspeito (viu algo; a suspeita enche em ~2 s olhando) → perseguição (detectou)
 *   suspeito → alerta (perdeu de vista antes de confirmar: vai olhar o último ponto) → calmo
 *   alerta → suspeito (viu de novo; confirma mais rápido)
 *   perseguição → alerta (perdeu o alvo por `loseTime`) → calmo
 * Barulho (passos/tiro) leva direto a alerta no ponto do som.
 */
export type AwarenessState = "calmo" | "suspeito" | "alerta" | "perseguicao";

export interface Awareness {
  state: AwarenessState;
  /** 0..1: quanto falta para confirmar a detecção (enche olhando) */
  suspicion: number;
  /** segundos no estado atual */
  time: number;
  /** segundos sem ver o alvo (suspeito/perseguição) */
  lost: number;
  /** maior suspeita atingida no episódio atual (decide se vale ir procurar) */
  peak: number;
}

export interface AwarenessInput {
  /** vê o jogador neste quadro (cone + linha de visada) */
  sees: boolean;
  /** ouviu um barulho neste quadro */
  heard: boolean;
  /** 0 longe (borda do alcance) … 1 colado: acelera a confirmação */
  proximity: number;
  /** já chegou ao último ponto conhecido (alerta: procura por lá) */
  atLastKnown: boolean;
  dt: number;
}

export interface AwarenessParams {
  /** segundos olhando para confirmar a detecção (longe) */
  confirmTime: number;
  /** segundos sem ver, em suspeito, antes de desistir */
  graceTime: number;
  /** segundos procurando no último ponto antes de voltar a calmo */
  searchTime: number;
  /** segundos sem ver, em perseguição, antes de passar a procurar */
  loseTime: number;
}

export const AWARENESS_DEFAULTS: AwarenessParams = { confirmTime: 2.0, graceTime: 1.5, searchTime: 8, loseTime: 6 };

export type AwarenessEvent = "suspeitou" | "detectou" | "perdeu" | "acalmou" | null;

export function createAwareness(): Awareness {
  return { state: "calmo", suspicion: 0, time: 0, lost: 0, peak: 0 };
}

/** Transição pura: devolve o próximo estado e o evento relevante (se houve). */
export function stepAwareness(a: Awareness, input: AwarenessInput, params: AwarenessParams = AWARENESS_DEFAULTS): { next: Awareness; event: AwarenessEvent } {
  const dt = Math.max(0, input.dt);
  const next: Awareness = { ...a, time: a.time + dt };
  let event: AwarenessEvent = null;
  const go = (s: AwarenessState, ev: AwarenessEvent = null) => {
    next.state = s;
    next.time = 0;
    next.lost = 0;
    if (ev) event = ev;
  };
  // perto confirma mais rápido: proximidade 1 → 2,5× a velocidade
  const fillRate = (1 + 1.5 * Math.max(0, Math.min(1, input.proximity))) / Math.max(0.05, params.confirmTime);
  switch (a.state) {
    case "calmo":
      next.suspicion = 0;
      next.peak = 0;
      if (input.sees) {
        go("suspeito", "suspeitou");
        next.suspicion = Math.min(1, fillRate * dt);
        next.peak = next.suspicion;
      } else if (input.heard) {
        go("alerta");
      }
      break;
    case "suspeito":
      if (input.sees) {
        next.lost = 0;
        next.suspicion = Math.min(1, a.suspicion + fillRate * dt);
        next.peak = Math.max(a.peak, next.suspicion);
        if (next.suspicion >= 1) go("perseguicao", "detectou");
      } else {
        next.lost = a.lost + dt;
        next.suspicion = Math.max(0, a.suspicion - dt / (params.graceTime * 2));
        if (next.lost >= params.graceTime) {
          // viu algo mas não confirmou: vai olhar o último ponto se chegou a desconfiar de verdade
          if (a.peak >= 0.25 || input.heard) go("alerta", "perdeu");
          else go("calmo", "acalmou");
        }
      }
      break;
    case "alerta":
      if (input.sees) {
        go("suspeito", "suspeitou");
        next.suspicion = Math.max(0.5, a.suspicion);
        next.peak = next.suspicion;
      } else if (input.heard) {
        next.time = 0; // barulho novo: continua procurando
      } else if (input.atLastKnown && next.time >= params.searchTime) {
        go("calmo", "acalmou");
      } else if (next.time >= params.searchTime * 2) {
        go("calmo", "acalmou"); // não conseguiu chegar lá: desiste
      }
      break;
    case "perseguicao":
      next.suspicion = 1;
      if (input.sees || input.heard) next.lost = 0;
      else {
        next.lost = a.lost + dt;
        if (next.lost >= params.loseTime) go("alerta", "perdeu");
      }
      break;
    default:
      break;
  }
  return { next, event };
}

/** Nível 0..1 para o "olho que enche" da HUD. */
export function awarenessLevel(a: Awareness): number {
  switch (a.state) {
    case "calmo":
      return 0;
    case "suspeito":
      return 0.15 + 0.6 * a.suspicion;
    case "alerta":
      return 0.75;
    case "perseguicao":
      return 1;
    default:
      return 0;
  }
}

/** Ordem de gravidade (para escolher o pior estado entre vários guardas). */
export const AWARENESS_RANK: Record<AwarenessState, number> = { calmo: 0, suspeito: 1, alerta: 2, perseguicao: 3 };

// --- ruído do jogador ------------------------------------------------------------------------------
/** Raio (m) em que os passos de Matias são ouvidos, por estado de movimento. */
export const NOISE_RADIUS: Record<MoveState, number> = { idle: 0, crouchIdle: 0, crouchWalk: 4, walk: 9, run: 15 };
/** Raio (m) de um tiro. */
export const GUNSHOT_NOISE = 34;
/** Raio (m) de um veículo em movimento. */
export const VEHICLE_NOISE = 20;

export function noiseRadiusFor(state: MoveState): number {
  return NOISE_RADIUS[state] ?? 0;
}

// --- visão -------------------------------------------------------------------------------------------
export interface VisionParams {
  /** abertura total do cone (graus) */
  angleDeg: number;
  /** alcance (m) */
  range: number;
  /** multiplicador da audição */
  hearing: number;
}

/** Visão do Custódio de patrulha (dia). */
export const CUSTODIO_VISION: VisionParams = { angleDeg: 70, range: 22, hearing: 1 };
/** Visão do saqueador (combate aberto, como já existia). */
export const SAQUEADOR_VISION: VisionParams = { angleDeg: 110, range: 28, hearing: 1 };

/** Toque de recolher (noite): enxerga mais perto, ouve mais longe. */
export function curfewVision(base: VisionParams, curfew: boolean): VisionParams {
  if (!curfew) return base;
  return { angleDeg: base.angleDeg, range: base.range * 0.7, hearing: base.hearing * 1.5 };
}

/**
 * O alvo está dentro do cone? `forward` e `toTarget` no plano XZ (não precisam ser unitários).
 * Alvo a menos de `nearRadius` é visto em qualquer direção (percepção periférica/colado).
 */
export function inVisionCone(forward: { x: number; z: number }, toTarget: { x: number; z: number }, dist: number, params: VisionParams, nearRadius = 2.5): boolean {
  if (dist > params.range) return false;
  if (dist <= nearRadius) return true;
  const fl = Math.hypot(forward.x, forward.z) || 1;
  const tl = Math.hypot(toTarget.x, toTarget.z) || 1;
  const cos = (forward.x * toTarget.x + forward.z * toTarget.z) / (fl * tl);
  return cos >= Math.cos(((params.angleDeg / 2) * Math.PI) / 180);
}

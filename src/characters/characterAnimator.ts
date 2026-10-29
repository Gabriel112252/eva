import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { HOLD_LAST_FRAME_CLIPS, ONE_SHOT_CLIPS, type AnimationClip } from "@/data/characters";

interface Track {
  group: AnimationGroup;
  weight: number;
  target: number;
  loop: boolean;
}

/** Ossos do tronco/braços/cabeça: camada superior (mira, tiro, recarga) sobre a locomoção das pernas. */
const UPPER_BODY = /^(mixamorig:)?(Spine\d?|Neck|Head|HeadTop_End|(Left|Right)(Shoulder|Arm|ForeArm|Hand).*)$/;
/** Clipes que ganham variante só-pernas quando há uma camada superior ativa. */
const LOWER_VARIANTS: AnimationClip[] = ["Idle", "Walk", "Run", "CrouchIdle", "CrouchWalk", "PistolIdle"];

/**
 * Mistura clipes esqueléticos por peso (cross-fade) sobre os AnimationGroups
 * carregados do GLB. Todos os clipes animam os mesmos ossos, então a mistura
 * ponderada do Babylon produz transições suaves (sem "teleporte" de pose).
 */
export class CharacterAnimator {
  private tracks = new Map<string, Track>();
  private current: AnimationClip = "Idle";
  private oneShot: string | null = null;
  private oneShotDone: (() => void) | null = null;
  /** camada superior ativa (ex.: PistolAim) — as pernas seguem o clipe-base */
  private overlay: AnimationClip | null = null;
  private maskedBuilt = false;
  /** velocidade da transição (unidades de peso por segundo) */
  fadeSpeed = 6;

  constructor(groups: AnimationGroup[]) {
    for (const g of groups) {
      const name = g.name as AnimationClip;
      const loop = !ONE_SHOT_CLIPS.includes(name);
      g.stop();
      g.reset();
      this.tracks.set(name, { group: g, weight: 0, target: 0, loop });
    }
    const idle = this.tracks.get("Idle");
    if (idle) {
      idle.group.start(true, 1.0);
      idle.group.setWeightForAllAnimatables(1);
      idle.weight = 1;
      idle.target = 1;
    }
  }

  get clip(): AnimationClip {
    return this.current;
  }

  has(clip: AnimationClip): boolean {
    return this.tracks.has(clip);
  }

  /** Define o clipe-base (loop). Mantém a fase entre Walk/Run/CrouchWalk para pés sincronizados. */
  play(clip: AnimationClip, speed = 1): void {
    const key = this.baseKey(clip);
    const track = this.tracks.get(key);
    if (!track) return;
    const currentKey = this.baseKey(this.current);
    if (currentKey !== key) {
      const prev = this.tracks.get(currentKey);
      const gaits: string[] = ["Walk", "Run", "CrouchWalk", "Walk_lower", "Run_lower", "CrouchWalk_lower"];
      let phase = 0;
      if (prev && gaits.includes(currentKey) && gaits.includes(key) && prev.group.isPlaying) {
        const span = prev.group.to - prev.group.from || 1;
        const a = prev.group.animatables[0];
        if (a) phase = ((a.masterFrame - prev.group.from) / span) % 1;
      }
      if (!track.group.isPlaying) {
        track.group.start(track.loop, speed);
        track.group.setWeightForAllAnimatables(track.weight);
      }
      if (phase > 0) {
        const span = track.group.to - track.group.from;
        track.group.goToFrame(track.group.from + phase * span);
      }
    }
    this.current = clip;
    track.group.speedRatio = speed;
    this.retarget();
  }

  /** Chave da trilha-base: variante só-pernas quando há camada superior. */
  private baseKey(clip: AnimationClip): string {
    if (this.overlay && this.tracks.has(`${clip}_lower`)) return `${clip}_lower`;
    return clip;
  }

  /** Recalcula os pesos-alvo: base (+ camada superior) ou o one-shot em curso. */
  private retarget(): void {
    const base = this.baseKey(this.current);
    const overlayKey = this.overlay ? `${this.overlay}_upper` : null;
    for (const [name, t] of this.tracks) {
      if (name === this.oneShot) continue;
      if (this.oneShot && this.oneShot.endsWith("_upper") && name === overlayKey) {
        t.target = 0; // one-shot superior substitui a camada superior
        continue;
      }
      t.target = name === base || name === overlayKey ? 1 : 0;
      if (t.target === 1 && !t.group.isPlaying) {
        t.group.start(t.loop, t.group.speedRatio || 1);
        t.group.setWeightForAllAnimatables(t.weight);
      }
    }
  }

  /**
   * Camada superior (tronco/braços/cabeça) por cima da locomoção: `setOverlay("PistolAim")` mantém as
   * pernas andando/paradas e os braços na pose de mira. `null` desliga.
   */
  setOverlay(clip: AnimationClip | null): void {
    if (clip && !this.tracks.has(clip)) clip = null;
    if (clip === this.overlay) return;
    this.buildMasked();
    this.overlay = clip;
    // a trilha-base pode trocar entre versão completa e só-pernas: mantém a fase
    const fullKey = this.current;
    const prev = this.tracks.get(this.overlay ? fullKey : `${fullKey}_lower`);
    const next = this.tracks.get(this.baseKey(this.current));
    if (prev && next && prev !== next && prev.group.isPlaying) {
      const span = prev.group.to - prev.group.from || 1;
      const a = prev.group.animatables[0];
      const phase = a ? ((a.masterFrame - prev.group.from) / span) % 1 : 0;
      if (!next.group.isPlaying) next.group.start(next.loop, prev.group.speedRatio || 1);
      next.group.goToFrame(next.group.from + phase * (next.group.to - next.group.from));
      next.group.speedRatio = prev.group.speedRatio;
    }
    this.retarget();
  }

  get currentOverlay(): AnimationClip | null {
    return this.overlay;
  }

  /** Cria as variantes mascaradas (`<clipe>_lower` só pernas/quadril; `<clipe>_upper` só tronco/braços). */
  private buildMasked(): void {
    if (this.maskedBuilt) return;
    this.maskedBuilt = true;
    const make = (src: AnimationGroup, name: string, upper: boolean): AnimationGroup | null => {
      const first = src.targetedAnimations[0]?.target as TransformNode | undefined;
      const scene = first?.getScene();
      if (!scene) return null;
      const g = new AnimationGroup(name, scene);
      for (const ta of src.targetedAnimations) {
        const target = ta.target as TransformNode;
        const isUpper = UPPER_BODY.test(target.name);
        if (isUpper === upper) g.addTargetedAnimation(ta.animation, target);
      }
      if (g.targetedAnimations.length === 0) {
        g.dispose();
        return null;
      }
      g.stop();
      g.reset();
      return g;
    };
    for (const [name, t] of [...this.tracks]) {
      if (name.includes("_")) continue;
      const clip = name as AnimationClip;
      if (LOWER_VARIANTS.includes(clip)) {
        const g = make(t.group, `${name}_lower`, false);
        if (g) this.tracks.set(`${name}_lower`, { group: g, weight: 0, target: 0, loop: true });
      }
      if (["PistolAim", "PistolIdle", "PistolShoot", "PistolReload", "Hit", "Interact"].includes(clip)) {
        const g = make(t.group, `${name}_upper`, true);
        if (g) this.tracks.set(`${name}_upper`, { group: g, weight: 0, target: 0, loop: t.loop });
      }
    }
  }

  /**
   * Toca um clipe único (ex.: Interact) por cima do clipe-base e volta sozinho.
   * `upperOnly`: só tronco/braços (tiro/recarga enquanto anda). Clipes de HOLD_LAST_FRAME_CLIPS (morte)
   * ficam parados no último quadro.
   */
  playOneShot(clip: AnimationClip, onDone?: () => void, upperOnly = false): void {
    if (upperOnly) this.buildMasked();
    const key = upperOnly && this.tracks.has(`${clip}_upper`) ? `${clip}_upper` : clip;
    const track = this.tracks.get(key);
    if (!track) {
      onDone?.();
      return;
    }
    const hold = HOLD_LAST_FRAME_CLIPS.includes(clip);
    this.oneShot = key;
    this.oneShotDone = onDone ?? null;
    track.group.stop();
    track.group.reset();
    track.group.start(false, 1.0);
    track.group.setWeightForAllAnimatables(track.weight);
    track.target = 1;
    if (key.endsWith("_upper")) {
      // só a camada superior é substituída; as pernas continuam no clipe-base
      this.retarget();
      track.target = 1;
    } else {
      for (const [name, t] of this.tracks) if (name !== key) t.target = 0;
    }
    track.group.onAnimationGroupEndObservable.addOnce(() => {
      if (this.oneShot !== key) return;
      if (hold) {
        // mantém a pose final: reinicia em loop e pausa no último quadro
        track.group.start(true, 1.0);
        track.group.goToFrame(track.group.to - 0.01);
        track.group.pause();
        track.weight = 1;
        track.target = 1;
        track.group.setWeightForAllAnimatables(1);
        this.held = key;
        this.oneShot = null;
        const cb = this.oneShotDone;
        this.oneShotDone = null;
        cb?.();
        return;
      }
      this.oneShot = null;
      track.target = 0;
      this.retarget();
      const cb = this.oneShotDone;
      this.oneShotDone = null;
      cb?.();
    });
  }

  /** Clipe segurado no último quadro (morte) — `releaseHold()` volta ao clipe-base. */
  private held: string | null = null;

  releaseHold(): void {
    if (!this.held) return;
    const t = this.tracks.get(this.held);
    if (t) {
      t.target = 0;
      t.group.play(true);
    }
    this.held = null;
    this.retarget();
  }

  get isHoldingPose(): boolean {
    return this.held !== null;
  }

  get isOneShotPlaying(): boolean {
    return this.oneShot !== null;
  }

  /** Avança os pesos (chamar a cada frame). */
  update(dt: number): void {
    const step = this.fadeSpeed * dt;
    for (const [name, t] of this.tracks) {
      if (name === this.held) continue;
      if (t.weight === t.target) continue;
      t.weight = t.weight < t.target ? Math.min(t.target, t.weight + step) : Math.max(t.target, t.weight - step);
      t.group.setWeightForAllAnimatables(t.weight);
      if (t.weight <= 0 && t.target <= 0 && t.group.isPlaying && t.loop) {
        t.group.pause();
      } else if (t.weight > 0 && !t.group.isPlaying && t.loop) {
        t.group.play(true);
      }
    }
  }

  dispose(): void {
    for (const t of this.tracks.values()) t.group.dispose();
    this.tracks.clear();
  }
}

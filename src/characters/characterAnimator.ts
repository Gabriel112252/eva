import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { ONE_SHOT_CLIPS, type AnimationClip } from "@/data/characters";

interface Track {
  group: AnimationGroup;
  weight: number;
  target: number;
  loop: boolean;
}

/**
 * Mistura clipes esqueléticos por peso (cross-fade) sobre os AnimationGroups
 * carregados do GLB. Todos os clipes animam os mesmos ossos, então a mistura
 * ponderada do Babylon produz transições suaves (sem "teleporte" de pose).
 */
export class CharacterAnimator {
  private tracks = new Map<AnimationClip, Track>();
  private current: AnimationClip = "Idle";
  private oneShot: AnimationClip | null = null;
  private oneShotDone: (() => void) | null = null;
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
    const track = this.tracks.get(clip);
    if (!track) return;
    if (this.current !== clip) {
      const prev = this.tracks.get(this.current);
      const gaits: AnimationClip[] = ["Walk", "Run", "CrouchWalk"];
      let phase = 0;
      if (prev && gaits.includes(this.current) && gaits.includes(clip) && prev.group.isPlaying) {
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
      this.current = clip;
    }
    track.group.speedRatio = speed;
    for (const [name, t] of this.tracks) {
      if (name === this.oneShot) continue;
      t.target = name === clip ? 1 : 0;
    }
  }

  /** Toca um clipe único (ex.: Interact) por cima do clipe-base e volta sozinho. */
  playOneShot(clip: AnimationClip, onDone?: () => void): void {
    const track = this.tracks.get(clip);
    if (!track) {
      onDone?.();
      return;
    }
    this.oneShot = clip;
    this.oneShotDone = onDone ?? null;
    track.group.stop();
    track.group.reset();
    track.group.start(false, 1.0);
    track.group.setWeightForAllAnimatables(track.weight);
    track.target = 1;
    for (const [name, t] of this.tracks) if (name !== clip) t.target = 0;
    track.group.onAnimationGroupEndObservable.addOnce(() => {
      if (this.oneShot !== clip) return;
      this.oneShot = null;
      track.target = 0;
      const base = this.tracks.get(this.current);
      if (base) {
        if (!base.group.isPlaying) base.group.start(base.loop, base.group.speedRatio || 1);
        base.target = 1;
      }
      const cb = this.oneShotDone;
      this.oneShotDone = null;
      cb?.();
    });
  }

  get isOneShotPlaying(): boolean {
    return this.oneShot !== null;
  }

  /** Avança os pesos (chamar a cada frame). */
  update(dt: number): void {
    const step = this.fadeSpeed * dt;
    for (const t of this.tracks.values()) {
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

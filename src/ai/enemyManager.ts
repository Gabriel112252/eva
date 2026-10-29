import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import { GameEntity, Vector3 as YVector3 } from "yuka";
import { loadCharacter, type CharacterModel } from "@/characters/characterModel";
import { ENEMY_VARIANTS, type CharacterVariant } from "@/data/characters";
import type { HitResolver } from "@/combat/playerCombat";
import { TypedEvent } from "@/core/events";
import { Enemy, type DetectionEvent, type EnemyConfig, type EnemyShot } from "./enemy";
import { AWARENESS_RANK, awarenessLevel, type AwarenessEvent, type AwarenessState } from "./stealth";

export interface EnemySpawnSpec extends EnemyConfig {
  position: Vector3;
  yaw: number;
  variant?: CharacterVariant;
}

/** Quantas lanternas podem ficar acesas ao mesmo tempo (limite de luzes por material no WebGL). */
export const MAX_FLASHLIGHTS = 2;
/** Lanternas além desta distância do jogador ficam apagadas. */
export const FLASHLIGHT_CULL_DISTANCE = 45;

/**
 * Distância ao longo do raio (`from + dir·t`, dir unitário) em que ele entra no cilindro vertical de
 * raio `radius` e altura `height` apoiado em `feet` (aproximação da cápsula do personagem); null se não toca
 * antes de `maxDist`.
 */
export function rayCapsuleDistance(from: Vector3, dir: Vector3, feet: Vector3, height: number, radius: number, maxDist: number): number | null {
  const ox = from.x - feet.x;
  const oz = from.z - feet.z;
  const a = dir.x * dir.x + dir.z * dir.z;
  const b = 2 * (ox * dir.x + oz * dir.z);
  const c = ox * ox + oz * oz - radius * radius;
  let t: number;
  if (a < 1e-8) {
    // raio vertical: só acerta se já estiver dentro do círculo
    if (c > 0) return null;
    t = 0;
  } else {
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const sq = Math.sqrt(disc);
    t = (-b - sq) / (2 * a);
    if (t < 0) t = (-b + sq) / (2 * a); // começa dentro
    if (t < 0) return null;
  }
  if (t > maxDist) return null;
  // o ponto de entrada precisa estar na faixa de altura do personagem; se entrar acima/abaixo,
  // procura onde o raio cruza a altura da tampa dentro do círculo
  const y = from.y + dir.y * t;
  const yMin = feet.y;
  const yMax = feet.y + height;
  if (y >= yMin && y <= yMax) return t;
  if (Math.abs(dir.y) < 1e-6) return null;
  const yCap = y > yMax ? yMax : yMin;
  const tCap = (yCap - from.y) / dir.y;
  if (tCap < 0 || tCap > maxDist) return null;
  const px = ox + dir.x * tCap;
  const pz = oz + dir.z * tCap;
  return px * px + pz * pz <= radius * radius ? tCap : null;
}

/** Gerencia inimigos: carga de modelos, obstáculos de desvio, tiros deles e contra eles, limpeza de corpos. */
export class EnemyManager implements HitResolver {
  readonly enemies: Enemy[] = [];
  readonly obstacles: GameEntity[] = [];
  readonly onEnemyShot = new TypedEvent<{ enemy: Enemy; shot: EnemyShot }>();
  readonly onEnemyDeath = new TypedEvent<Enemy>();
  readonly onAllDead = new TypedEvent<void>();
  /** custódio detectou Matias (voz de prisão) */
  readonly onDetected = new TypedEvent<DetectionEvent>();
  /** custódio alcançou Matias em perseguição */
  readonly onCaught = new TypedEvent<Enemy>();
  readonly onAwareness = new TypedEvent<{ enemy: Enemy; state: AwarenessState; event: AwarenessEvent }>();
  private models = new Map<CharacterVariant, Promise<CharacterModel>>();
  private spawnCounter = 0;
  private aliveWatch = false;
  private curfewOn = false;
  private flashlightsOn = true;

  constructor(private readonly scene: Scene) {}

  /** Toque de recolher: visão 30 % mais curta e audição 50 % mais longa para todos (atuais e futuros). */
  setCurfew(on: boolean): void {
    this.curfewOn = on;
    for (const e of this.enemies) e.curfew = on;
  }

  get curfew(): boolean {
    return this.curfewOn;
  }

  /** Lanternas dos custódios (desligar de dia). */
  setFlashlights(on: boolean): void {
    this.flashlightsOn = on;
    if (!on) for (const e of this.enemies) e.setFlashlight(false);
  }

  /** Pior estado de percepção entre os custódios vivos (HUD: olho que enche). */
  awarenessSummary(): { state: AwarenessState; level: number } {
    let best: { state: AwarenessState; level: number } = { state: "calmo", level: 0 };
    for (const e of this.enemies) {
      if (!e.alive || e.role !== "custodio") continue;
      if (e.hostile) return { state: "perseguicao", level: 1 };
      const a = e.awareness;
      const rank = AWARENESS_RANK[a.state];
      const level = awarenessLevel(a);
      if (rank > AWARENESS_RANK[best.state] || (rank === AWARENESS_RANK[best.state] && level > best.level)) best = { state: a.state, level };
    }
    return best;
  }

  /** Esfera de desvio de obstáculo (posição no mundo + raio horizontal). */
  addObstacle(position: Vector3, radius: number): void {
    const e = new GameEntity();
    e.position.set(position.x, position.y, position.z);
    e.boundingRadius = radius;
    this.obstacles.push(e);
  }

  /** Obstáculo que se move (veículo): devolve a entidade para o chamador atualizar a posição. */
  addDynamicObstacle(position: Vector3, radius: number): GameEntity {
    const e = new GameEntity();
    e.position.set(position.x, position.y, position.z);
    e.boundingRadius = radius;
    this.obstacles.push(e);
    return e;
  }

  private async loadModel(variant: CharacterVariant, suffix: string): Promise<CharacterModel> {
    // cada inimigo precisa do próprio esqueleto animado: carrega o GLB de novo (cache HTTP do navegador)
    void this.models;
    return loadCharacter(this.scene, variant, suffix);
  }

  async spawn(spec: EnemySpawnSpec): Promise<Enemy> {
    const variant = spec.variant ?? ENEMY_VARIANTS[this.spawnCounter % ENEMY_VARIANTS.length]!;
    const model = await this.loadModel(variant, `_inimigo_${this.spawnCounter++}`);
    const enemy = new Enemy(this.scene, model, spec.position, spec.yaw, spec, this.obstacles);
    enemy.curfew = this.curfewOn;
    enemy.onShot.on((shot) => this.onEnemyShot.emit({ enemy, shot }));
    enemy.onDetected.on((ev) => this.onDetected.emit(ev));
    enemy.onCaught.on((e) => this.onCaught.emit(e));
    enemy.onAwareness.on((ev) => this.onAwareness.emit(ev));
    enemy.onDeath.on((e) => {
      this.onEnemyDeath.emit(e);
      if (this.aliveWatch && this.aliveCount === 0) {
        this.aliveWatch = false;
        this.onAllDead.emit();
      }
    });
    this.enemies.push(enemy);
    this.aliveWatch = true;
    return enemy;
  }

  get aliveCount(): number {
    return this.enemies.filter((e) => e.alive).length;
  }

  /** Alerta todos os que estão em patrulha num raio (tiro de Matias). */
  noise(at: Vector3, loudness = 30): void {
    for (const e of this.enemies) e.hearNoise(at, loudness);
  }

  castShot(from: Vector3, direction: Vector3, maxDistance: number, damage: number, headshotMultiplier: number): { point: Vector3; damage: number; killed: boolean; headshot: boolean } | null {
    let best: { enemy: Enemy; t: number; headshot: boolean } | null = null;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const feet = e.feet;
      const h = e.model.height;
      // cabeça: esfera no topo
      const headCenter = feet.add(new Vector3(0, h - 0.12, 0));
      const oc = from.subtract(headCenter);
      const b = 2 * Vector3.Dot(oc, direction);
      const c = Vector3.Dot(oc, oc) - 0.14 * 0.14;
      const disc = b * b - 4 * c;
      let tHead: number | null = null;
      if (disc >= 0) {
        const t = (-b - Math.sqrt(disc)) / 2;
        if (t >= 0 && t <= maxDistance) tHead = t;
      }
      const tBody = rayCapsuleDistance(from, direction, feet, h, 0.34, maxDistance);
      const t = tHead !== null && (tBody === null || tHead <= tBody + 0.05) ? tHead : tBody;
      if (t === null) continue;
      if (!best || t < best.t) best = { enemy: e, t, headshot: tHead !== null && t === tHead };
    }
    if (!best) return null;
    const point = from.add(direction.scale(best.t));
    const dmg = best.headshot ? damage * headshotMultiplier : damage;
    const killed = best.enemy.takeDamage(dmg, from, best.headshot);
    return { point, damage: dmg, killed, headshot: best.headshot };
  }

  update(dt: number, playerFeet: Vector3, playerAlive: boolean): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i]!;
      e.update(dt, playerFeet, playerAlive);
      if (!e.alive && e.timeDead > 25) {
        e.dispose();
        this.enemies.splice(i, 1);
      }
    }
    this.updateFlashlights(playerFeet);
  }

  /** Acende só as `MAX_FLASHLIGHTS` lanternas mais próximas do jogador (e dentro do raio de corte). */
  private updateFlashlights(playerFeet: Vector3): void {
    if (!this.flashlightsOn) return;
    const candidates = this.enemies.filter((e) => e.alive && e.flashlight).map((e) => ({ e, d: Vector3.Distance(e.feet, playerFeet) }));
    if (candidates.length === 0) return;
    candidates.sort((a, b) => a.d - b.d);
    candidates.forEach(({ e, d }, i) => e.setFlashlight(i < MAX_FLASHLIGHTS && d < FLASHLIGHT_CULL_DISTANCE));
  }

  /** Remove todos (reinício de missão). */
  clear(): void {
    for (const e of this.enemies) e.dispose();
    this.enemies.length = 0;
    this.aliveWatch = false;
  }

  /** Posição do inimigo vivo mais próximo (para a bússola/HUD). */
  nearest(from: Vector3): Enemy | null {
    let best: Enemy | null = null;
    let bd = Infinity;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = Vector3.Distance(e.feet, from);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  static yv(v: Vector3): YVector3 {
    return new YVector3(v.x, v.y, v.z);
  }
}

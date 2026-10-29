import { ImportMeshAsync } from "@babylonjs/core/Loading/sceneLoader";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { PhysicsRaycastResult } from "@babylonjs/core/Physics/physicsRaycastResult";
import type { PhysicsEngine } from "@babylonjs/core/Physics/v2/physicsEngine";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import type { Scene } from "@babylonjs/core/scene";
import type { Observer } from "@babylonjs/core/Misc/observable";
import { TypedEvent } from "@/core/events";
import type { InputManager } from "@/core/input";
import type { CharacterModel } from "@/characters/characterModel";
import { COLLISION } from "@/world/context";
import { Health } from "./health";
import { WEAPONS, addReserve, canFire, canReload, createWeaponState, fire, spreadDirection, startReload, tick, type WeaponState } from "./weapons";
import type { CombatEffects } from "./effects";

export interface ShotHit {
  point: Vector3;
  normal: Vector3;
  body: PhysicsBody | null;
  nodeName: string;
}

export interface ShotEvent {
  from: Vector3;
  to: Vector3;
  hit: ShotHit | null;
  /** dano aplicado a um inimigo, com flag de abate */
  enemyHit: { damage: number; killed: boolean; headshot: boolean } | null;
}

/**
 * Resolve inimigos atingidos por um raio de tiro (as cápsulas dos personagens do Havok não são corpos
 * rígidos, então o teste é segmento × cápsula feito pelo gerenciador de inimigos).
 */
export interface HitResolver {
  /** inimigo mais próximo atingido pelo raio antes de `maxDistance`; aplica o dano e devolve o resultado */
  castShot(from: Vector3, direction: Vector3, maxDistance: number, damage: number, headshotMultiplier: number): { point: Vector3; damage: number; killed: boolean; headshot: boolean } | null;
}

export function propUrl(name: string): string {
  const ext = (import.meta.env.VITE_CHARACTER_EXT as string | undefined) ?? ".glb";
  return `${import.meta.env.BASE_URL}assets/props/${name}${ext}`;
}

/**
 * Combate de Matias em terceira pessoa: arma na mão direita, modo de mira (botão direito) com câmera no
 * ombro e tronco acompanhando o pitch, tiro por raio a partir do centro da câmera, recarga, vida e morte.
 */
export class PlayerCombat {
  readonly health = new Health(100, 4, 7);
  readonly onShot = new TypedEvent<ShotEvent>();
  readonly onReloadStart = new TypedEvent<void>();
  readonly onReloadEnd = new TypedEvent<void>();
  readonly onEmptyClick = new TypedEvent<void>();
  /** arma equipada (null = desarmado: sem HUD de munição/mira) */
  weapon: WeaponState | null = null;
  aiming = false;
  /** pitch da câmera (rad) aplicado ao tronco quando mirando */
  aimPitch = 0;
  private pistolRoot: TransformNode | null = null;
  private pistolMeshes: AbstractMesh[] = [];
  private muzzle: TransformNode | null = null;
  private readonly ray = new PhysicsRaycastResult();
  private readonly engine: PhysicsEngine;
  private spineObserver: Observer<Scene> | null = null;
  private spine1: TransformNode | null = null;
  private spine2: TransformNode | null = null;
  private hand: TransformNode | null = null;
  private fireHeld = false;
  private rnd = Math.random;
  /** estatísticas da missão */
  stats = { shots: 0, hits: 0, kills: 0, damageTaken: 0, deaths: 0 };
  resolver: HitResolver | null = null;
  /** matias morto (animação de morte em curso ou pose segurada) */
  dead = false;

  constructor(
    private readonly scene: Scene,
    private readonly model: CharacterModel,
    private readonly effects: CombatEffects,
  ) {
    this.engine = scene.getPhysicsEngine() as PhysicsEngine;
    const nodes = model.root.getChildTransformNodes(false);
    this.spine1 = nodes.find((n) => n.name === "mixamorig:Spine1") ?? null;
    this.spine2 = nodes.find((n) => n.name === "mixamorig:Spine2") ?? null;
    this.hand = nodes.find((n) => n.name === "mixamorig:RightHand") ?? null;
    this.spineObserver = scene.onAfterAnimationsObservable.add(() => this.applyAimPitch());
    this.health.onDeath.on(() => this.die());
  }

  get armed(): boolean {
    return this.weapon !== null;
  }

  /** Dá a pistola a Matias (carrega o modelo e prende na mão direita). */
  async equipPistol(reserve = 36): Promise<void> {
    if (this.weapon) {
      addReserve(this.weapon, reserve);
      return;
    }
    this.weapon = createWeaponState(WEAPONS.pistola, reserve);
    if (!this.pistolRoot) {
      try {
        const result = await ImportMeshAsync(propUrl("pistola"), this.scene, { pluginExtension: ".glb" });
        const root = result.meshes.find((m) => !m.parent) ?? result.meshes[0]!;
        this.pistolMeshes = result.meshes.filter((m) => m.getTotalVertices() > 0);
        for (const m of this.pistolMeshes) {
          m.isPickable = false;
          m.receiveShadows = true;
        }
        this.pistolRoot = new TransformNode("pistola_matias", this.scene);
        root.parent = this.pistolRoot;
        // boca do cano: 11 cm à frente e 6 cm acima da origem (empunhadura)
        this.muzzle = new TransformNode("pistola_boca", this.scene);
        this.muzzle.parent = this.pistolRoot;
        this.muzzle.position.set(0, 0.06, 0.11);
      } catch (err) {
        console.error("[combat] falha ao carregar a pistola", err);
      }
    }
    this.attachPistol();
    this.model.animator.play("PistolIdle");
  }

  /** Prende a pistola no osso da mão direita (ajuste empírico da empunhadura no rig Mixamo). */
  private attachPistol(): void {
    if (!this.pistolRoot || !this.hand) return;
    this.pistolRoot.parent = this.hand;
    this.pistolRoot.position.set(0.03, 0.08, 0.025);
    this.pistolRoot.rotationQuaternion = Quaternion.RotationYawPitchRoll(-Math.PI / 2, -0.25, Math.PI / 2 + 0.35);
    this.pistolRoot.scaling.setAll(1);
    this.setPistolVisible(true);
  }

  setPistolVisible(visible: boolean): void {
    for (const m of this.pistolMeshes) m.isVisible = visible;
  }

  get pistolNodes(): AbstractMesh[] {
    return this.pistolMeshes;
  }

  /** Munição reserva recolhida (caixas, inimigos); devolve quanto entrou. */
  addAmmo(amount: number): number {
    if (!this.weapon) return 0;
    return addReserve(this.weapon, amount);
  }

  /**
   * Atualiza mira/tiro/recarga. `cameraForward`/`cameraPosition` definem o raio de tiro; `locked` = em diálogo/menu.
   * Devolve se Matias está mirando (para a câmera e o controlador de movimento).
   */
  update(dt: number, input: InputManager, cameraPosition: Vector3, cameraForward: Vector3, cameraPitch: number, locked: boolean, inVehicle: boolean): boolean {
    this.health.update(dt);
    if (!this.weapon || this.dead) {
      this.aiming = false;
      return false;
    }
    const w = this.weapon;
    const reloadDone = tick(w, dt);
    if (reloadDone) this.onReloadEnd.emit();

    const canAct = !locked && !inVehicle;
    const wantAim = canAct && input.isHeld("aim");
    if (wantAim !== this.aiming) {
      this.aiming = wantAim;
      if (!this.aiming) this.aimPitch = 0;
    }
    this.aimPitch = this.aiming ? cameraPitch : 0;

    // camada superior: mira (ou pose de pistola relaxada quando armado)
    const anim = this.model.animator;
    if (canAct && w.phase !== "reloading") anim.setOverlay(this.aiming ? "PistolAim" : "PistolIdle");

    // recarga: R, ou automática ao tentar atirar com o pente vazio
    if (canAct && input.isHeld("reload") && canReload(w)) this.reload();

    // tiro semiautomático: um por clique (segurar não repete)
    const fireNow = canAct && input.isHeld("fire");
    if (fireNow && !this.fireHeld) {
      if (canFire(w)) this.shoot(cameraPosition, cameraForward);
      else if (w.magazine === 0 && w.phase === "ready") {
        this.onEmptyClick.emit();
        if (canReload(w)) this.reload();
      }
    }
    this.fireHeld = fireNow;
    return this.aiming;
  }

  reload(): void {
    if (!this.weapon || !startReload(this.weapon)) return;
    this.onReloadStart.emit();
    this.model.animator.playOneShot("PistolReload", undefined, true);
  }

  private shoot(cameraPosition: Vector3, cameraForward: Vector3): void {
    const w = this.weapon!;
    if (!fire(w)) return;
    this.stats.shots++;
    const spread = this.aiming ? w.weapon.spreadAim : w.weapon.spreadHip;
    const d = spreadDirection({ x: cameraForward.x, y: cameraForward.y, z: cameraForward.z }, spread, this.rnd);
    const dir = new Vector3(d.x, d.y, d.z);
    // o raio sai da câmera (centro da mira) e começa à frente de Matias para não acertar o próprio corpo
    const from = cameraPosition.add(dir.scale(1.6));
    const to = cameraPosition.add(dir.scale(w.weapon.range));
    this.engine.raycastToRef(from, to, this.ray, { membership: COLLISION.PLAYER, collideWith: COLLISION.WORLD | COLLISION.PROP | COLLISION.NPC | COLLISION.VEHICLE });
    let hit: ShotHit | null = null;
    let end = to;
    let maxDist = w.weapon.range;
    if (this.ray.hasHit) {
      hit = { point: this.ray.hitPointWorld.clone(), normal: this.ray.hitNormalWorld.clone(), body: this.ray.body ?? null, nodeName: this.ray.body?.transformNode?.name ?? "" };
      end = hit.point;
      maxDist = Vector3.Distance(from, end);
    }
    // inimigos (cápsulas) antes do que o mundo bloqueou
    const enemy = this.resolver?.castShot(from, dir, maxDist, w.weapon.damage, w.weapon.headshotMultiplier) ?? null;
    const muzzle = this.muzzle ? this.muzzle.getAbsolutePosition() : from;
    this.effects.muzzleFlash(muzzle);
    let enemyHit: ShotEvent["enemyHit"] = null;
    if (enemy) {
      end = enemy.point;
      hit = { point: enemy.point, normal: dir.scale(-1), body: null, nodeName: "inimigo" };
      enemyHit = { damage: enemy.damage, killed: enemy.killed, headshot: enemy.headshot };
      this.stats.hits++;
      if (enemy.killed) this.stats.kills++;
      this.effects.flesh(enemy.point, dir);
    } else if (hit) {
      this.effects.impact(hit.point, hit.normal, /metal|veiculo|tambor|barril|gerador|poste/i.test(hit.nodeName));
    }
    this.effects.tracer(muzzle, end);
    this.model.animator.playOneShot("PistolShoot", undefined, true);
    this.onShot.emit({ from: muzzle, to: end, hit, enemyHit });
  }

  /** Dano recebido (inimigos, colisões). */
  takeDamage(amount: number, from?: Vector3): boolean {
    if (this.dead) return false;
    const ok = this.health.damage({ amount, from: from ? { x: from.x, y: from.y, z: from.z } : undefined });
    if (ok) {
      this.stats.damageTaken += amount;
      if (this.health.alive && !this.model.animator.isOneShotPlaying) this.model.animator.playOneShot("Hit", undefined, true);
    }
    return ok;
  }

  private die(): void {
    if (this.dead) return;
    this.dead = true;
    this.stats.deaths++;
    this.aiming = false;
    this.aimPitch = 0;
    this.model.animator.setOverlay(null);
    this.model.animator.playOneShot("Death");
  }

  /** Reviver no último ponto (vida cheia, pente cheio se houver reserva). */
  revive(): void {
    this.dead = false;
    this.health.reset();
    this.model.animator.releaseHold();
    this.model.animator.play(this.weapon ? "PistolIdle" : "Idle");
    if (this.weapon && this.weapon.magazine === 0) startReload(this.weapon), tick(this.weapon, this.weapon.weapon.reloadTime + 0.1);
  }

  /** Aplica o pitch da mira ao tronco (depois das animações, antes do render). */
  private applyAimPitch(): void {
    if (Math.abs(this.aimPitch) < 1e-3 || !this.spine1 || !this.spine2) return;
    // eixo "direita" do personagem no mundo → espaço do pai de cada osso
    const yawQ = this.model.root.rotationQuaternion ?? Quaternion.Identity();
    const rightWorld = new Vector3(1, 0, 0).rotateByQuaternionToRef(yawQ, new Vector3());
    const apply = (node: TransformNode, angle: number) => {
      const parent = node.parent as TransformNode | null;
      if (!parent) return;
      parent.computeWorldMatrix(true);
      const inv = parent.getWorldMatrix().clone().invert();
      const axisLocal = Vector3.TransformNormal(rightWorld, inv).normalize();
      const q = Quaternion.RotationAxis(axisLocal, angle);
      const cur = node.rotationQuaternion ?? Quaternion.FromEulerVector(node.rotation);
      node.rotationQuaternion = q.multiply(cur);
    };
    // mirar para baixo (pitch > 0 na câmera = olhar para baixo) inclina o tronco para a frente
    apply(this.spine1, this.aimPitch * 0.45);
    apply(this.spine2, this.aimPitch * 0.45);
  }

  dispose(): void {
    if (this.spineObserver) this.scene.onAfterAnimationsObservable.remove(this.spineObserver);
    this.pistolRoot?.dispose(false, true);
  }
}

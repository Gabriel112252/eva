import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { PhysicsShapeCapsule } from "@babylonjs/core/Physics/v2/physicsShape";
import type { Scene } from "@babylonjs/core/scene";
import type { CharacterModel } from "./characterModel";
import type { Interactable } from "@/interaction/interactable";
import { CHARACTERS, type CharacterVariant } from "@/data/characters";
import { COLLISION } from "@/world/context";
import { angleDelta } from "@/player/playerController";

/** Personagem não jogável: modelo rigado, colisão, atenção ao jogador e diálogo. */
export class Npc implements Interactable {
  readonly id: string;
  readonly radius = 2.4;
  readonly variant: CharacterVariant;
  readonly displayName: string;
  private body: PhysicsBody;
  private collider: TransformNode;
  private baseYaw: number;
  private yaw: number;
  private talking = false;
  private attentionTarget: Vector3 | null = null;
  private idleGestureTimer = 2 + Math.random() * 6;
  promptOverride: string | null = null;
  /** chamado quando o jogador interage; deve iniciar o diálogo */
  onInteract: ((npc: Npc) => void) | null = null;

  constructor(
    scene: Scene,
    readonly model: CharacterModel,
    position: Vector3,
    yaw: number,
  ) {
    this.variant = model.variant;
    this.id = `npc_${model.variant}`;
    this.displayName = CHARACTERS[model.variant].displayName;
    this.baseYaw = yaw;
    this.yaw = yaw;
    model.root.position.copyFrom(position);
    model.setYaw(yaw);

    const info = CHARACTERS[model.variant];
    this.collider = new TransformNode(`${this.id}_col`, scene);
    this.collider.position.set(position.x, position.y + info.height / 2, position.z);
    this.collider.rotationQuaternion = Quaternion.Identity();
    const shape = new PhysicsShapeCapsule(new Vector3(0, -info.height / 2 + info.radius, 0), new Vector3(0, info.height / 2 - info.radius, 0), info.radius, scene);
    shape.filterMembershipMask = COLLISION.NPC | COLLISION.CAMERA_BLOCKER;
    shape.filterCollideMask = COLLISION.PLAYER | COLLISION.PROP;
    this.body = new PhysicsBody(this.collider, PhysicsMotionType.STATIC, false, scene);
    this.body.shape = shape;
  }

  getPosition(): Vector3 {
    return this.model.root.position;
  }

  get headPosition(): Vector3 {
    const h = this.model.head?.getAbsolutePosition();
    if (h) return h;
    return this.model.root.position.add(new Vector3(0, this.model.height - 0.12, 0));
  }

  get facing(): Vector3 {
    return new Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  getPrompt(): string | null {
    if (this.talking) return null;
    return this.promptOverride ?? CHARACTERS[this.variant].prompt ?? `Falar com ${this.displayName}`;
  }

  interact(): void {
    this.onInteract?.(this);
  }

  /** Vira-se para uma posição (jogador perto ou em diálogo). */
  setAttention(target: Vector3 | null): void {
    this.attentionTarget = target ? target.clone() : null;
  }

  setTalking(talking: boolean): void {
    if (this.talking === talking) return;
    this.talking = talking;
    this.model.animator.play(talking ? "Talk" : "Idle");
  }

  get isTalking(): boolean {
    return this.talking;
  }

  update(dt: number, playerFeet: Vector3): void {
    const toPlayer = playerFeet.subtract(this.model.root.position);
    const dist = Math.hypot(toPlayer.x, toPlayer.z);
    // olha para o jogador quando ele se aproxima; volta à pose base quando se afasta
    let targetYaw = this.baseYaw;
    const target = this.attentionTarget ?? (dist < 3.2 ? playerFeet : null);
    if (target) {
      const d = target.subtract(this.model.root.position);
      targetYaw = Math.atan2(d.x, d.z);
    }
    const delta = angleDelta(this.yaw, targetYaw);
    const step = Math.sign(delta) * Math.min(Math.abs(delta), 3.5 * dt);
    if (Math.abs(delta) > 0.01) {
      this.yaw += step;
      this.model.setYaw(this.yaw);
    }
    // gesto ocasional em idle (conversa com vizinhos, ajeita objetos)
    if (!this.talking && !this.model.animator.isOneShotPlaying) {
      this.idleGestureTimer -= dt;
      if (this.idleGestureTimer <= 0) {
        this.idleGestureTimer = 6 + Math.random() * 10;
        this.model.animator.playOneShot("Interact");
      }
    }
    this.model.animator.update(dt);
  }

  dispose(): void {
    this.body.dispose();
    this.collider.dispose();
    this.model.dispose();
  }
}

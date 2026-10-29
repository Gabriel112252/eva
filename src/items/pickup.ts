import { ImportMeshAsync } from "@babylonjs/core/Loading/sceneLoader";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";
import type { Interactable } from "@/interaction/interactable";
import type { ItemId } from "./inventory";
import { propUrl } from "@/combat/playerCombat";

export interface PickupSpec {
  id: string;
  item: ItemId;
  amount: number;
  position: Vector3;
  /** GLB em public/assets/props (sem extensão); null = sem modelo (ex.: item dado em diálogo) */
  model: "caixa_municao" | "kit_medico" | null;
  prompt: string;
}

/** Item no chão que Matias pega com E. O modelo flutua/gira de leve para chamar atenção. */
export class Pickup implements Interactable {
  readonly id: string;
  readonly radius = 1.9;
  readonly clip = "PickUp" as const;
  taken = false;
  onTaken: ((p: Pickup) => void) | null = null;
  private root: TransformNode | null = null;
  private meshes: AbstractMesh[] = [];
  private t = Math.random() * 10;

  constructor(
    private readonly scene: Scene,
    readonly spec: PickupSpec,
  ) {
    this.id = `pickup_${spec.id}`;
  }

  async load(): Promise<void> {
    if (!this.spec.model) return;
    try {
      const result = await ImportMeshAsync(propUrl(this.spec.model), this.scene, { pluginExtension: ".glb" });
      const gltfRoot = result.meshes.find((m) => !m.parent) ?? result.meshes[0]!;
      this.root = new TransformNode(`${this.id}_root`, this.scene);
      this.root.position.copyFrom(this.spec.position);
      gltfRoot.parent = this.root;
      this.meshes = result.meshes.filter((m) => m.getTotalVertices() > 0);
      for (const m of this.meshes) {
        m.isPickable = false;
        m.receiveShadows = true;
      }
    } catch (err) {
      console.error(`[pickup] falha ao carregar ${this.spec.model}`, err);
    }
  }

  get shadowCasters(): AbstractMesh[] {
    return this.meshes;
  }

  update(dt: number): void {
    if (this.taken || !this.root) return;
    this.t += dt;
    this.root.position.y = this.spec.position.y + 0.04 + Math.sin(this.t * 2) * 0.03;
    this.root.rotation.y = this.t * 0.8;
  }

  getPosition(): Vector3 {
    return this.spec.position;
  }

  getPrompt(): string | null {
    return this.taken ? null : this.spec.prompt;
  }

  interact(): void {
    if (this.taken) return;
    this.taken = true;
    this.root?.setEnabled(false);
    this.onTaken?.(this);
  }

  /** Recoloca o item (reinício de missão). */
  reset(): void {
    this.taken = false;
    this.root?.setEnabled(true);
  }

  dispose(): void {
    this.root?.dispose(false, true);
  }
}

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import type { Scene } from "@babylonjs/core/scene";
import type { Vehicle } from "@/vehicles/vehicle";

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface CargoPlacement {
  /** posição local no chassi (eixo do veículo: +z frente) */
  offset: Vec3Like;
  /** dimensões da caixa (m) */
  size: Vec3Like;
}

/**
 * Onde a carga fica em cada veículo. Os GLB não têm nó de carga, então a posição é dada por dados:
 * Atlas → caçamba atrás do banco; van → compartimento traseiro; Javali → porta-malas; Rastro → bagageiro.
 */
export const CARGO_PLACEMENTS: Record<string, CargoPlacement> = {
  atlas_t3: { offset: { x: 0, y: 0.98, z: -0.95 }, size: { x: 0.72, y: 0.5, z: 0.72 } },
  modulo_v7: { offset: { x: 0, y: 1.1, z: -1.2 }, size: { x: 0.8, y: 0.6, z: 0.8 } },
  javali_vb4: { offset: { x: 0, y: 1.75, z: -1.6 }, size: { x: 0.7, y: 0.5, z: 0.7 } },
  rastro_av4: { offset: { x: 0, y: 1.05, z: -1.05 }, size: { x: 0.5, y: 0.4, z: 0.5 } },
};

/** Posição de carga a partir do banco quando o veículo não está na tabela (atrás e um pouco acima). */
export function fallbackPlacement(seat: Vec3Like): CargoPlacement {
  return { offset: { x: seat.x, y: seat.y + 0.3, z: seat.z - 1.1 }, size: { x: 0.6, y: 0.45, z: 0.6 } };
}

/**
 * Caixa de carga visível presa ao veículo enquanto uma entrega está ativa (M2: remédio no Atlas T-3).
 * Um único mesh reutilizado; sem física (vai junto com o chassi).
 */
export class DeliveryCargo {
  private box: Mesh | null = null;
  private vehicle: Vehicle | null = null;
  /** rótulo da carga (para a HUD/mochila) */
  label = "Carga";

  constructor(private readonly scene: Scene) {}

  get attachedTo(): string | null {
    return this.vehicle?.def.id ?? null;
  }

  get mesh(): Mesh | null {
    return this.box;
  }

  private ensureMesh(size: Vec3Like): Mesh {
    if (this.box) {
      this.box.scaling.set(size.x, size.y, size.z);
      return this.box;
    }
    const box = MeshBuilder.CreateBox("carga_entrega", { size: 1 }, this.scene);
    box.scaling.set(size.x, size.y, size.z);
    box.isPickable = false;
    const mat = new StandardMaterial("carga_entrega_mat", this.scene);
    mat.diffuseTexture = this.crateTexture();
    mat.specularColor = new Color3(0.08, 0.08, 0.08);
    box.material = mat;
    this.box = box;
    return box;
  }

  /** Textura procedural de caixote de madeira com tábuas e marca de lote. */
  private crateTexture(): DynamicTexture {
    const size = 128;
    const dt = new DynamicTexture("carga_entrega_tex", { width: size, height: size }, this.scene, true);
    const ctx = dt.getContext() as CanvasRenderingContext2D;
    ctx.fillStyle = "#8a6a3e";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 5; i++) {
      const y = i * (size / 5);
      ctx.fillStyle = i % 2 ? "#7a5c34" : "#93714a";
      ctx.fillRect(0, y, size, size / 5 - 2);
      ctx.fillStyle = "rgba(40, 25, 10, 0.55)";
      ctx.fillRect(0, y + size / 5 - 2, size, 2);
    }
    ctx.strokeStyle = "rgba(60, 40, 18, 0.9)";
    ctx.lineWidth = 7;
    ctx.strokeRect(5, 5, size - 10, size - 10);
    ctx.beginPath();
    ctx.moveTo(8, 8);
    ctx.lineTo(size - 8, size - 8);
    ctx.moveTo(size - 8, 8);
    ctx.lineTo(8, size - 8);
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = "rgba(30, 20, 10, 0.85)";
    ctx.font = "bold 18px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("LOTE 17", size / 2, size / 2 + 6);
    dt.update();
    return dt;
  }

  /** Prende a caixa ao veículo (posição por tabela ou a partir do banco). */
  attach(vehicle: Vehicle, placement?: CargoPlacement): void {
    const p = placement ?? CARGO_PLACEMENTS[vehicle.def.id] ?? fallbackPlacement(vehicle.def.seat);
    const box = this.ensureMesh(p.size);
    box.parent = vehicle.anchor;
    box.position.set(p.offset.x, p.offset.y, p.offset.z);
    box.rotation.set(0, 0, 0);
    box.setEnabled(true);
    this.vehicle = vehicle;
  }

  /** Solta a caixa (entrega concluída/cancelada). `at` deixa a caixa no chão nesse ponto; sem `at` some. */
  detach(at?: Vector3): void {
    if (!this.box) return;
    this.box.parent = null;
    if (at) {
      this.box.position.copyFrom(at.add(new Vector3(0, this.box.scaling.y / 2, 0)));
      this.box.setEnabled(true);
    } else {
      this.box.setEnabled(false);
    }
    this.vehicle = null;
  }

  dispose(): void {
    this.box?.dispose(false, true);
    this.box = null;
    this.vehicle = null;
  }
}

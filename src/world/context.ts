import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { PhysicsShapeBox, PhysicsShapeCylinder, PhysicsShapeSphere } from "@babylonjs/core/Physics/v2/physicsShape";
import type { Material } from "@babylonjs/core/Materials/material";
import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { MaterialLibrary } from "./materials";
import type { Interactable } from "@/interaction/interactable";

/** Camadas de colisão (membership/collideWith em máscaras de bits). */
export const COLLISION = {
  WORLD: 1 << 0,
  PLAYER: 1 << 1,
  NPC: 1 << 2,
  PROP: 1 << 3,
  CAMERA_BLOCKER: 1 << 4, // o que a câmera não atravessa
  VEHICLE: 1 << 5, // chassis dos veículos jogáveis
  ENEMY: 1 << 6, // cápsulas dos inimigos (alvos de tiro)
} as const;

export interface AmbientEmitterSpec {
  kind: "generator" | "crowd" | "wind" | "radio" | "drip" | "flicker";
  position: Vector3;
  radius: number;
  volume: number;
}

export interface SpawnPoint {
  position: Vector3;
  yaw: number;
}

/**
 * Contexto compartilhado pelos módulos de construção do mundo. Agrupa meshes
 * estáticos por material (para fusão posterior), cria corpos físicos estáticos
 * e registra pontos de interesse.
 */
export class WorldContext {
  readonly staticRoot: TransformNode;
  readonly dynamicRoot: TransformNode;
  readonly shadowCasters: AbstractMesh[] = [];
  readonly interactables: Interactable[] = [];
  readonly emitters: AmbientEmitterSpec[] = [];
  readonly spawns = new Map<string, SpawnPoint>();
  readonly colliderNodes: TransformNode[] = [];
  private readonly batches = new Map<Material, Mesh[]>();
  private readonly merged: Mesh[] = [];

  constructor(readonly scene: Scene, readonly mats: MaterialLibrary, readonly quality: "baixa" | "media" | "alta") {
    this.staticRoot = new TransformNode("mundo_estatico", scene);
    this.dynamicRoot = new TransformNode("mundo_dinamico", scene);
  }

  // ---------------------------------------------------------------------
  // Primitivas estáticas (fundidas por material no final)
  // ---------------------------------------------------------------------
  box(
    name: string,
    size: { w: number; h: number; d: number },
    position: Vector3,
    material: Material,
    o: { rotationY?: number; rotation?: Vector3; collider?: boolean; shadow?: boolean; batch?: boolean; cameraBlocker?: boolean; uvScale?: number } = {},
  ): Mesh {
    const m = MeshBuilder.CreateBox(name, { width: size.w, height: size.h, depth: size.d }, this.scene);
    m.position.copyFrom(position);
    if (o.rotation) m.rotation.copyFrom(o.rotation);
    else if (o.rotationY) m.rotation.y = o.rotationY;
    m.material = material;
    this.applyBoxUVs(m, size, material, o.uvScale ?? 1);
    if (o.collider) this.staticBoxCollider(name, size, position, o.rotation ?? new Vector3(0, o.rotationY ?? 0, 0), o.cameraBlocker ?? true);
    this.register(m, o.batch ?? true, o.shadow ?? true);
    return m;
  }

  /** Metros por repetição da textura (densidade de texel uniforme no mundo). */
  private tileSize(material: Material): number {
    const t = (material.metadata as { tileSize?: number } | null)?.tileSize;
    return typeof t === "number" && t > 0 ? t : 0;
  }

  private applyBoxUVs(m: Mesh, size: { w: number; h: number; d: number }, material: Material, extra: number): void {
    const tile = this.tileSize(material);
    if (!tile) return;
    const uvs = m.getVerticesData(VertexBuffer.UVKind);
    const normals = m.getVerticesData(VertexBuffer.NormalKind);
    if (!uvs || !normals) return;
    const out = new Float32Array(uvs.length);
    for (let i = 0; i < uvs.length / 2; i++) {
      const nx = Math.abs(normals[i * 3] ?? 0);
      const ny = Math.abs(normals[i * 3 + 1] ?? 0);
      let su: number;
      let sv: number;
      if (ny > 0.5) {
        su = size.w;
        sv = size.d;
      } else if (nx > 0.5) {
        su = size.d;
        sv = size.h;
      } else {
        su = size.w;
        sv = size.h;
      }
      out[i * 2] = ((uvs[i * 2] ?? 0) * su * extra) / tile;
      out[i * 2 + 1] = ((uvs[i * 2 + 1] ?? 0) * sv * extra) / tile;
    }
    m.setVerticesData(VertexBuffer.UVKind, out, false);
  }

  private applyPlanarUVs(m: Mesh, su: number, sv: number, material: Material): void {
    const tile = this.tileSize(material);
    if (!tile) return;
    const uvs = m.getVerticesData(VertexBuffer.UVKind);
    if (!uvs) return;
    const out = new Float32Array(uvs.length);
    for (let i = 0; i < uvs.length / 2; i++) {
      out[i * 2] = ((uvs[i * 2] ?? 0) * su) / tile;
      out[i * 2 + 1] = ((uvs[i * 2 + 1] ?? 0) * sv) / tile;
    }
    m.setVerticesData(VertexBuffer.UVKind, out, false);
  }

  cylinder(
    name: string,
    o: { height: number; diameterTop?: number; diameterBottom?: number; diameter?: number; tessellation?: number },
    position: Vector3,
    material: Material,
    opt: { collider?: boolean; shadow?: boolean; batch?: boolean; rotation?: Vector3 } = {},
  ): Mesh {
    const m = MeshBuilder.CreateCylinder(name, { height: o.height, diameter: o.diameter, diameterTop: o.diameterTop, diameterBottom: o.diameterBottom, tessellation: o.tessellation ?? 12 }, this.scene);
    m.position.copyFrom(position);
    if (opt.rotation) m.rotation.copyFrom(opt.rotation);
    m.material = material;
    const dia = o.diameter ?? Math.max(o.diameterTop ?? 0, o.diameterBottom ?? 0);
    this.applyPlanarUVs(m, Math.PI * dia, o.height, material);
    if (opt.collider) {
      this.staticCylinderCollider(name, dia / 2, o.height, position);
    }
    this.register(m, opt.batch ?? true, opt.shadow ?? true);
    return m;
  }

  plane(
    name: string,
    size: { w: number; h: number },
    position: Vector3,
    material: Material,
    o: { rotation?: Vector3; shadow?: boolean; batch?: boolean; sideOrientation?: number } = {},
  ): Mesh {
    const m = MeshBuilder.CreatePlane(name, { width: size.w, height: size.h, sideOrientation: o.sideOrientation ?? Mesh.FRONTSIDE }, this.scene);
    m.position.copyFrom(position);
    if (o.rotation) m.rotation.copyFrom(o.rotation);
    m.material = material;
    this.applyPlanarUVs(m, size.w, size.h, material);
    this.register(m, o.batch ?? true, o.shadow ?? false);
    return m;
  }

  ground(name: string, size: { w: number; h: number }, position: Vector3, material: Material, subdivisions = 1): Mesh {
    const m = MeshBuilder.CreateGround(name, { width: size.w, height: size.h, subdivisions }, this.scene);
    m.position.copyFrom(position);
    m.material = material;
    m.receiveShadows = true;
    this.applyPlanarUVs(m, size.w, size.h, material);
    this.register(m, true, false);
    return m;
  }

  register(mesh: Mesh, batch: boolean, shadow: boolean): void {
    mesh.parent = this.staticRoot;
    mesh.receiveShadows = true;
    mesh.isPickable = false;
    if (shadow) this.shadowCasters.push(mesh);
    if (batch && mesh.material) {
      const list = this.batches.get(mesh.material) ?? [];
      list.push(mesh);
      this.batches.set(mesh.material, list);
    } else {
      mesh.freezeWorldMatrix();
    }
  }

  // ---------------------------------------------------------------------
  // Colisores estáticos (Havok) — não precisam de malha visível
  // ---------------------------------------------------------------------
  staticBoxCollider(name: string, size: { w: number; h: number; d: number }, position: Vector3, rotation = Vector3.Zero(), cameraBlocker = true): PhysicsBody {
    const node = new TransformNode(`col_${name}`, this.scene);
    node.position.copyFrom(position);
    node.rotationQuaternion = Quaternion.FromEulerVector(rotation);
    const shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(size.w, size.h, size.d), this.scene);
    shape.filterMembershipMask = COLLISION.WORLD | (cameraBlocker ? COLLISION.CAMERA_BLOCKER : 0);
    shape.filterCollideMask = COLLISION.PLAYER | COLLISION.NPC | COLLISION.PROP | COLLISION.VEHICLE | COLLISION.ENEMY;
    shape.material = { friction: 0.6, restitution: 0.05 };
    const body = new PhysicsBody(node, PhysicsMotionType.STATIC, false, this.scene);
    body.shape = shape;
    this.colliderNodes.push(node);
    return body;
  }

  staticCylinderCollider(name: string, radius: number, height: number, position: Vector3): PhysicsBody {
    const node = new TransformNode(`col_${name}`, this.scene);
    node.position.copyFrom(position);
    const shape = new PhysicsShapeCylinder(new Vector3(0, -height / 2, 0), new Vector3(0, height / 2, 0), radius, this.scene);
    shape.filterMembershipMask = COLLISION.WORLD | COLLISION.CAMERA_BLOCKER;
    shape.filterCollideMask = COLLISION.PLAYER | COLLISION.NPC | COLLISION.PROP | COLLISION.VEHICLE | COLLISION.ENEMY;
    const body = new PhysicsBody(node, PhysicsMotionType.STATIC, false, this.scene);
    body.shape = shape;
    this.colliderNodes.push(node);
    return body;
  }

  staticSphereCollider(name: string, radius: number, position: Vector3): PhysicsBody {
    const node = new TransformNode(`col_${name}`, this.scene);
    node.position.copyFrom(position);
    const shape = new PhysicsShapeSphere(Vector3.Zero(), radius, this.scene);
    shape.filterMembershipMask = COLLISION.WORLD;
    shape.filterCollideMask = COLLISION.PLAYER | COLLISION.NPC | COLLISION.PROP | COLLISION.VEHICLE | COLLISION.ENEMY;
    const body = new PhysicsBody(node, PhysicsMotionType.STATIC, false, this.scene);
    body.shape = shape;
    this.colliderNodes.push(node);
    return body;
  }

  /** Corpo dinâmico leve (caixas/barris que o jogador empurra). */
  /** Corpo dinâmico (empurrável). `node` pode ser uma malha procedural ou o nó de um módulo GLB; `center` é o
   *  centro da caixa de colisão no espaço local do nó (módulos GLB têm a origem no chão). */
  dynamicBox(node: TransformNode, size: { w: number; h: number; d: number }, mass: number, center = Vector3.Zero()): PhysicsBody {
    const mesh = node;
    mesh.parent = this.dynamicRoot;
    const shape = new PhysicsShapeBox(center, Quaternion.Identity(), new Vector3(size.w, size.h, size.d), this.scene);
    shape.filterMembershipMask = COLLISION.PROP;
    shape.filterCollideMask = COLLISION.WORLD | COLLISION.PLAYER | COLLISION.NPC | COLLISION.PROP | COLLISION.VEHICLE | COLLISION.ENEMY;
    shape.material = { friction: 0.7, restitution: 0.05 };
    const body = new PhysicsBody(mesh, PhysicsMotionType.DYNAMIC, false, this.scene);
    body.shape = shape;
    body.setMassProperties({ mass });
    body.setLinearDamping(0.6);
    body.setAngularDamping(0.8);
    if (mesh instanceof Mesh) this.shadowCasters.push(mesh);
    else this.shadowCasters.push(...mesh.getChildMeshes(false).filter((c) => !c.name.includes("COL_")));
    return body;
  }

  // ---------------------------------------------------------------------
  /** Funde os meshes estáticos por material para reduzir draw calls. */
  finalize(): Mesh[] {
    for (const [material, meshes] of this.batches) {
      if (meshes.length === 0) continue;
      if (meshes.length === 1) {
        meshes[0]!.freezeWorldMatrix();
        continue;
      }
      const merged = Mesh.MergeMeshes(meshes, true, true, undefined, false, false);
      if (!merged) continue;
      merged.name = `lote_${material.name}`;
      merged.material = material;
      merged.parent = this.staticRoot;
      merged.receiveShadows = true;
      merged.isPickable = false;
      merged.freezeWorldMatrix();
      // substitui os meshes originais na lista de projetores de sombra
      for (const m of meshes) {
        const i = this.shadowCasters.indexOf(m);
        if (i >= 0) this.shadowCasters.splice(i, 1);
      }
      this.shadowCasters.push(merged);
      this.merged.push(merged);
    }
    this.batches.clear();
    return this.merged;
  }
}

import { ImportMeshAsync } from "@babylonjs/core/Loading/sceneLoader";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { BoundingInfo } from "@babylonjs/core/Culling/boundingInfo";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";
import type { Skeleton } from "@babylonjs/core/Bones/skeleton";
import "@babylonjs/loaders/glTF/2.0";
import { CharacterAnimator } from "./characterAnimator";
import { applyCharacterShading } from "./characterShading";
import { CHARACTERS, characterUrl, type CharacterVariant } from "@/data/characters";

export interface CharacterModel {
  variant: CharacterVariant;
  /** nó-raiz posicionado nos pés do personagem; rotação Y = direção que ele encara */
  root: TransformNode;
  meshes: AbstractMesh[];
  skeleton: Skeleton | null;
  animator: CharacterAnimator;
  /** nó da cabeça (para enquadramento de câmera nos diálogos) */
  head: TransformNode | null;
  height: number;
  setYaw(yaw: number): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

/**
 * Carrega um personagem GLB rigado (esqueleto + clipes) e o envolve num nó-raiz
 * cuja origem está nos pés. O glTF olha para +Z; o Babylon (sistema canhoto)
 * preserva isso no nó __root__ gerado pelo loader.
 */
export async function loadCharacter(scene: Scene, variant: CharacterVariant, suffix = "", source?: string): Promise<CharacterModel> {
  const result = await ImportMeshAsync(source ?? characterUrl(variant), scene, { name: `${variant}${suffix}`, pluginExtension: ".glb" });
  const root = new TransformNode(`char_${variant}${suffix}`, scene);
  root.rotationQuaternion = Quaternion.Identity();
  const gltfRoot = result.meshes[0];
  if (gltfRoot) gltfRoot.parent = root;
  const meshes = result.meshes.filter((m) => m.getTotalVertices() > 0);
  for (const m of meshes) {
    m.isPickable = false;
    m.receiveShadows = true;
    // caixa envolvente generosa em espaço local (cobre qualquer pose) para o frustum culling funcionar com
    // skinning; o Babylon a leva ao espaço do mundo a cada movimento (NUNCA usar doNotSyncBoundingInfo aqui:
    // a caixa ficaria presa na origem e o personagem sumiria longe dela)
    m.setBoundingInfo(new BoundingInfo(new Vector3(-0.9, -0.2, -0.9), new Vector3(0.9, 2.1, 0.9)));
  }
  // acabamento: luz de recorte e translucidez de pele (só material; ver characterShading.ts)
  applyCharacterShading(meshes);
  // rig Mixamo ("mixamorig:Head") ou rig simples ("Head")
  const head = result.transformNodes.find((t) => t.name === "mixamorig:Head" || t.name === "Head") ?? null;
  const animator = new CharacterAnimator(result.animationGroups);
  const info = CHARACTERS[variant];
  const skeleton = result.skeletons[0] ?? null;
  // 52 ossos × 4 vec4 excedem o limite de uniforms de vértice em GPUs modestas: usa textura de matrizes
  if (skeleton) skeleton.useTextureToStoreBoneMatrices = true;

  return {
    variant,
    root,
    meshes,
    skeleton,
    animator,
    head,
    height: info.height,
    setYaw(yaw: number) {
      Quaternion.RotationAxisToRef(Vector3.UpReadOnly, yaw, root.rotationQuaternion!);
    },
    setVisible(visible: boolean) {
      for (const m of meshes) m.isVisible = visible;
    },
    dispose() {
      animator.dispose();
      root.dispose(false, true);
    },
  };
}

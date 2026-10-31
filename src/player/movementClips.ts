import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import "@babylonjs/loaders/glTF/2.0";
import type { CharacterModel } from "@/characters/characterModel";
import { MOVEMENT_CLIPS, type CharacterVariant } from "@/data/characters";

/**
 * URL da biblioteca de movimento de um personagem (`<variante>_movimento.glb`: só a armadura do rig Mixamo e
 * os clipes de MOVEMENT_CLIPS, gerada por `tools/blender/retarget.py --clips movimento --anim-only`).
 * Usa a mesma extensão configurável dos outros GLBs (VITE_CHARACTER_EXT).
 */
export function movementClipsUrl(variant: CharacterVariant): string {
  const ext = (import.meta.env.VITE_CHARACTER_EXT as string | undefined) ?? ".glb";
  return `${import.meta.env.BASE_URL}assets/characters/${variant}_movimento${ext}`;
}

/**
 * Reaponta os grupos de animação da biblioteca para os ossos (TransformNodes) do modelo, por nome.
 * Faixas sem osso correspondente são descartadas. Função pura sobre os grupos — testável sem rede.
 */
export function retargetGroupsByName(groups: AnimationGroup[], model: CharacterModel, scene: Scene): AnimationGroup[] {
  const nodes = new Map<string, TransformNode>();
  for (const n of model.root.getChildTransformNodes(false)) if (!nodes.has(n.name)) nodes.set(n.name, n);
  const wanted = new Set<string>(MOVEMENT_CLIPS);
  const out: AnimationGroup[] = [];
  for (const g of groups) {
    if (!wanted.has(g.name)) continue;
    const ng = new AnimationGroup(g.name, scene);
    for (const ta of g.targetedAnimations) {
      const target = nodes.get((ta.target as TransformNode).name);
      if (target) ng.addTargetedAnimation(ta.animation, target);
    }
    if (ng.targetedAnimations.length === 0) {
      ng.dispose();
      continue;
    }
    out.push(ng);
  }
  return out;
}

/**
 * Carrega a biblioteca de movimento e acrescenta os clipes ao animador do modelo. Devolve os nomes ligados.
 * Sem a biblioteca (arquivo ausente/erro de rede) o movimento continua funcionando, só sem esses clipes.
 */
export async function loadMovementClips(scene: Scene, model: CharacterModel, source?: string): Promise<string[]> {
  const container = await LoadAssetContainerAsync(source ?? movementClipsUrl(model.variant), scene, { pluginExtension: ".glb" });
  try {
    const groups = retargetGroupsByName(container.animationGroups, model, scene);
    model.animator.addClips(groups);
    return groups.map((g) => g.name);
  } finally {
    container.dispose();
  }
}

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { WorldContext } from "./context";
import "@babylonjs/loaders/glTF";

/**
 * Pacote M1 — VÉICULOS / EVA.
 *
 * Função de importação OPT-IN: não chamada automaticamente no prólogo.
 * Integrar apenas após testar posições, NPCs e colisão junto à versão do Fable.
 *
 * GLB são modelos 3D de primeira passagem, estáticos e não pilotáveis.
 */
type StaticVehicle = {
  id: string;
  filename: string;
  position: readonly [number, number, number];
  yaw: number;
  footprint: readonly [number, number, number]; // largura, altura e comprimento de colisão
};

const VEHICLES: readonly StaticVehicle[] = [
  {
    id: "javali_vb4",
    filename: "javali_vb4.glb",
    position: [40.2, 0.12, 10.5],
    yaw: 0,
    footprint: [2.1, 1.5, 4.65],
  },
  {
    id: "atlas_t3",
    filename: "atlas_t3.glb",
    position: [-8.5, 0, 1.5],
    yaw: Math.PI / 2,
    footprint: [1.3, 0.9, 2.6],
  },
  {
    id: "modulo_v7",
    filename: "modulo_v7.glb",
    position: [24, 0.12, -12.5],
    yaw: Math.PI / 2,
    footprint: [1.95, 1.75, 5.2],
  },
] as const;

export async function loadEvaStaticVehicles(scene: Scene, ctx: WorldContext): Promise<TransformNode[]> {
  const anchors: TransformNode[] = [];

  for (const spec of VEHICLES) {
    // Carregamos primeiro para não criar colisor invisível se o arquivo não existir.
    const result = await SceneLoader.ImportMeshAsync("", "/assets/vehicles/", spec.filename, scene);
    const anchor = new TransformNode("EVA_PROP_" + spec.id, scene);
    const [x, y, z] = spec.position;
    anchor.position = new Vector3(x, y, z);
    anchor.rotation.y = spec.yaw;

    // Importer glTF cria __root__ que adapta coordenadas para Babylon (LH).
    // Não sobrescrever rotationQuaternion/scaling do __root__; usar anchor externo.
    for (const m of result.meshes) {
      if (!m.parent) m.parent = anchor;
      if (m.getTotalVertices() > 0) {
        m.isPickable = false;
        m.receiveShadows = true;
        ctx.shadowCasters.push(m);
      }
    }

    const [w, h, d] = spec.footprint;
    // Aproximação única por volume simplificado; não usar colisão TriMesh nos props.
    const collisionCenter = new Vector3(x, y + h / 2, z);
    ctx.staticBoxCollider("veiculo_" + spec.id, { w, h, d }, collisionCenter, new Vector3(0, spec.yaw, 0), true);

    anchors.push(anchor);
  }

  return anchors;
}

/**
 * Inserção sugerida em src/core/game.ts:
 *  this.world = buildWorld(...);
 *  await loadEvaStaticVehicles(this.scene, this.world.ctx);
 *  // prosseguir carregando Matias e NPCs...
 *
 * A chamada acima é responsabilidade de Fable após validar
 * posições, portas, navegação, física, sombras e FPS no build real.
 */

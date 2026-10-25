import { ImportMeshAsync } from "@babylonjs/core/Loading/sceneLoader";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { Scene } from "@babylonjs/core/scene";
import type { WorldContext } from "./context";
import { STREET } from "./street";

/**
 * Veículos da PR #1 (assets-src/vehicles, gerados por tools/generate-eva-vehicles.mjs e refinados por
 * tools/blender/refine_vehicles.py → public/assets/vehicles). São props estáticos, não pilotáveis:
 * só os três terrestres entram na São Paulo Velha; Rastro AV-4 (aeromoto) e Janus (estação orbital)
 * ficam fora do cenário (apenas no visualizador /preview-veiculos.html).
 */
export interface StaticVehicle {
  id: "javali_vb4" | "atlas_t3" | "modulo_v7";
  position: Vector3;
  /** rotação em torno de Y; o modelo tem a frente para +Z */
  yaw: number;
  /** caixa de colisão (largura, altura, comprimento) em metros */
  footprint: { w: number; h: number; d: number };
}

export function vehicleUrl(id: string): string {
  const ext = (import.meta.env.VITE_CHARACTER_EXT as string | undefined) ?? ".glb";
  return `${import.meta.env.BASE_URL}assets/vehicles/${id}${ext}`;
}

/** Posições revistas contra o layout atual (plaza.ts/heroAssets.ts/worldBuilder.ts): fora da fila,
 *  dos canteiros, das barracas e dos trajetos dos NPCs. */
export function staticVehicles(): StaticVehicle[] {
  const P = STREET.plaza;
  const y = STREET.curbHeight;
  const cx = (P.x0 + P.x1) / 2;
  const postX = cx + 4;
  return [
    // viatura dos Custódios estacionada junto à fachada da Central, a leste do portão (gerador/botijões ficam a sudoeste)
    { id: "javali_vb4", position: new Vector3(postX + 8.5, y, P.z1 - 1.7), yaw: Math.PI / 2, footprint: { w: 2.2, h: 2.1, d: 4.9 } },
    // van de suprimentos em frente ao posto médico (sul da praça), paralela à fachada
    { id: "modulo_v7", position: new Vector3(27.5, y, P.z0 + 3.6), yaw: Math.PI / 2, footprint: { w: 2.0, h: 2.5, d: 5.3 } },
    // triciclo de carga encostado no meio-fio, em frente à barraca do mercado (lado norte da rua)
    { id: "atlas_t3", position: new Vector3(-5.5, 0, STREET.halfWidth - 1.1), yaw: Math.PI / 2 + 0.25, footprint: { w: 1.4, h: 1.7, d: 2.8 } },
  ];
}

export interface VehiclesResult {
  meshes: AbstractMesh[];
  shadowCasters: AbstractMesh[];
}

export async function loadEvaStaticVehicles(scene: Scene, ctx: WorldContext, specs = staticVehicles()): Promise<VehiclesResult> {
  const placed: AbstractMesh[] = [];
  const shadowCasters: AbstractMesh[] = [];
  for (const spec of specs) {
    const result = await ImportMeshAsync(vehicleUrl(spec.id), scene, { pluginExtension: ".glb" });
    const anchor = new TransformNode(`veiculo_${spec.id}`, scene);
    anchor.position.copyFrom(spec.position);
    anchor.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), spec.yaw);
    // o __root__ do loader (conversão destro→canhoto) fica intacto sob o nó de posicionamento
    for (const m of result.meshes) if (!m.parent) m.parent = anchor;
    anchor.computeWorldMatrix(true);
    for (const m of result.meshes) {
      if (m.getTotalVertices() === 0) continue;
      m.computeWorldMatrix(true);
      m.isPickable = false;
      m.receiveShadows = true;
      m.freezeWorldMatrix();
      if (m.material instanceof PBRMaterial) m.material.environmentIntensity = 0.9;
      placed.push(m);
      if (!/vidro|parabrisa|para_brisa|glass/i.test(m.name)) shadowCasters.push(m);
    }
    const { w, h, d } = spec.footprint;
    ctx.staticBoxCollider(`veiculo_${spec.id}`, { w, h, d }, new Vector3(spec.position.x, spec.position.y + h / 2, spec.position.z), new Vector3(0, spec.yaw, 0), true);
  }
  return { meshes: placed, shadowCasters };
}

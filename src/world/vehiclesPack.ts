import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { STREET } from "./street";
import type { VehicleId } from "@/vehicles/vehicleDefs";

/**
 * Pontos de spawn dos veículos jogáveis na São Paulo Velha (modelos da PR #1 refinados por
 * tools/blender/refine_vehicles.py; física e controle em src/vehicles/). A Estação Janus não é um
 * veículo nem entra no cenário (só no visualizador /preview-veiculos.html).
 */
export interface VehicleSpawn {
  id: VehicleId;
  position: Vector3;
  /** rotação em torno de Y; o modelo tem a frente para +Z */
  yaw: number;
}

export function vehicleSpawns(): VehicleSpawn[] {
  const P = STREET.plaza;
  const y = STREET.curbHeight;
  const cx = (P.x0 + P.x1) / 2;
  const postX = cx + 4;
  return [
    // viatura dos Custódios estacionada no lado leste da praça, nariz para o centro (espaço para manobrar)
    { id: "javali_vb4", position: new Vector3(postX + 6.5, y, -12.5), yaw: -Math.PI / 2 },
    // van de suprimentos em frente ao posto médico (sul da praça), paralela à fachada
    { id: "modulo_v7", position: new Vector3(27.5, y, P.z0 + 3.6), yaw: Math.PI / 2 },
    // triciclo de carga encostado no meio-fio, em frente à barraca do mercado (lado norte da rua)
    { id: "atlas_t3", position: new Vector3(-5.5, 0, STREET.halfWidth - 1.1), yaw: Math.PI / 2 + 0.25 },
    // aeromoto de patrulha pousada no lado leste da praça, nariz para a praça
    { id: "rastro_av4", position: new Vector3(43.2, y, 9.8), yaw: -Math.PI / 2 },
  ];
}

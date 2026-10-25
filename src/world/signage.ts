import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { signTexture, type SignOptions } from "./textures";
import type { WorldContext } from "./context";

export interface SignPlacement {
  position: Vector3;
  /** rotação Y em radianos (0 = a face visível olha para -Z, como o plano padrão do Babylon) */
  yaw: number;
  width: number;
  height: number;
  emissive?: number;
  double?: boolean;
}

/** Placas, letreiros, pichações e cartazes em português brasileiro. */
export function placeSign(ctx: WorldContext, name: string, sign: Omit<SignOptions, "width" | "height"> & { pxWidth?: number; pxHeight?: number }, place: SignPlacement): Mesh {
  const pxW = sign.pxWidth ?? 1024;
  const pxH = sign.pxHeight ?? Math.round((pxW * place.height) / place.width);
  const tex = signTexture(ctx.scene, `sign_${name}`, { ...sign, width: pxW, height: pxH });
  const mat = new PBRMaterial(`mat_sign_${name}`, ctx.scene);
  if (tex) mat.albedoTexture = tex;
  else mat.albedoColor = Color3.FromHexString(sign.bg.startsWith("#") ? sign.bg : "#8a8378").toLinearSpace();
  mat.roughness = 0.75;
  mat.metallic = 0.05;
  mat.environmentIntensity = 0.6;
  if (place.emissive && tex) {
    mat.emissiveTexture = tex;
    mat.emissiveIntensity = place.emissive;
  }
  const n = new Vector3(Math.sin(place.yaw), 0, Math.cos(place.yaw)); // normal "para trás" do plano (frente olha para -n)
  const frontPos = place.double ? place.position.subtract(n.scale(0.004)) : place.position;
  const mesh = ctx.plane(`placa_${name}`, { w: place.width, h: place.height }, frontPos, mat, {
    rotation: new Vector3(0, place.yaw, 0),
    batch: false,
    shadow: false,
  });
  if (place.double) {
    // Placa legível dos dois lados: segundo plano virado 180°, colado ao primeiro
    // (um único plano com backFaceCulling=false mostraria o texto espelhado por trás).
    ctx.plane(`placa_${name}_verso`, { w: place.width, h: place.height }, place.position.add(n.scale(0.004)), mat, {
      rotation: new Vector3(0, place.yaw + Math.PI, 0),
      batch: false,
      shadow: false,
    });
  }
  return mesh;
}

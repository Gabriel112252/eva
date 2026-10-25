import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import HavokPhysics from "@babylonjs/havok";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import "@babylonjs/core/Physics/physicsEngineComponent";
import "@babylonjs/core/Physics/v2/physicsEngineComponent";
import "@babylonjs/loaders/glTF/2.0";
import type { CharacterVariant } from "@/data/characters";

export const ROOT = resolve(__dirname, "../..");

export function characterDataUrl(variant: CharacterVariant): string {
  const bytes = readFileSync(resolve(ROOT, `public/assets/characters/${variant}.glb`));
  return `data:model/gltf-binary;base64,${Buffer.from(bytes).toString("base64")}`;
}

export function characterBytes(variant: CharacterVariant): Uint8Array {
  return new Uint8Array(readFileSync(resolve(ROOT, `public/assets/characters/${variant}.glb`)));
}

/** Cena headless (NullEngine) com Havok real carregado do pacote npm. */
export async function createHeadlessScene(withPhysics = true): Promise<{ engine: NullEngine; scene: Scene }> {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  new FreeCamera("test_cam", new Vector3(0, 2, -5), scene);
  if (withPhysics) {
    const wasmFile = readFileSync(resolve(ROOT, "node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm"));
    const wasmBinary = wasmFile.buffer.slice(wasmFile.byteOffset, wasmFile.byteOffset + wasmFile.byteLength) as ArrayBuffer;
    const havok = await HavokPhysics({ wasmBinary });
    scene.enablePhysics(new Vector3(0, -9.81, 0), new HavokPlugin(true, havok));
  }
  return { engine, scene };
}

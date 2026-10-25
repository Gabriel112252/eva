import HavokPhysics, { type HavokPhysicsWithBindings } from "@babylonjs/havok";
import havokWasmUrl from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";

export const GRAVITY = new Vector3(0, -9.81, 0);

let instancePromise: Promise<HavokPhysicsWithBindings> | null = null;

/** Carrega o WASM do Havok uma única vez (a URL é resolvida pelo Vite). */
export function loadHavok(): Promise<HavokPhysicsWithBindings> {
  if (!instancePromise) {
    instancePromise = HavokPhysics({ locateFile: () => havokWasmUrl });
  }
  return instancePromise;
}

export async function enableHavok(scene: Scene): Promise<HavokPlugin> {
  const havok = await loadHavok();
  const plugin = new HavokPlugin(true, havok);
  scene.enablePhysics(GRAVITY, plugin);
  return plugin;
}

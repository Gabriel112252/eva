import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import "@babylonjs/loaders/glTF";

// Viewer isolated from the actual game; original gameplay isn't touched.
const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
const select = document.getElementById("model") as HTMLSelectElement;
const status = document.getElementById("status") as HTMLDivElement;

const engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: true });
const scene = new Scene(engine);
scene.clearColor = new Color4(0.075, 0.095, 0.11, 1);
const cam = new ArcRotateCamera("preview_cam", Math.PI * 1.26, Math.PI * 0.39, 9, new Vector3(0, 1, 0), scene);
cam.attachControl(canvas, true);
cam.lowerRadiusLimit = 2;
cam.upperRadiusLimit = 40;
cam.wheelPrecision = 30;
const hemi = new HemisphericLight("sky", new Vector3(0, 1, 0), scene);
hemi.intensity = 1.8;
const sun = new DirectionalLight("sun", new Vector3(-0.5, -1, 0.6), scene);
sun.intensity = 2;
const ground = MeshBuilder.CreateGround("inspection_floor", { width: 80, height: 80 }, scene);
ground.position.y = -0.03;
const groundMaterial = new StandardMaterial("floor_material", scene);
groundMaterial.diffuseColor = new Color3(0.16, 0.19, 0.19);
groundMaterial.specularColor = new Color3(0.015, 0.015, 0.015);
ground.material = groundMaterial;
let loaded: AssetContainer | null = null;
let version = 0;

async function loadVehicle(filename: string): Promise<void> {
  const seq = ++version;
  status.textContent = "Carregando " + filename + "...";
  try {
    const next = await SceneLoader.LoadAssetContainerAsync("/assets-src/vehicles/", filename, scene);
    if (seq !== version) { next.dispose(); return; }
    loaded?.removeAllFromScene();
    loaded?.dispose();
    loaded = next;
    loaded.addAllToScene();
    const meshes = loaded.meshes.filter(m => m.getTotalVertices() > 0);
    let min = new Vector3(Infinity, Infinity, Infinity);
    let max = new Vector3(-Infinity, -Infinity, -Infinity);
    let tris = 0;
    for (const m of meshes) {
      m.computeWorldMatrix(true);
      const b = m.getBoundingInfo().boundingBox;
      min = Vector3.Minimize(min, b.minimumWorld);
      max = Vector3.Maximize(max, b.maximumWorld);
      tris += m.getTotalIndices() / 3;
    }
    const size = max.subtract(min);
    const center = min.add(max).scale(0.5);
    cam.setTarget(center);
    cam.radius = Math.min(30, Math.max(4, Math.max(size.x, size.y, size.z) * 1.85));
    status.textContent = meshes.length + " peças · " + Math.round(tris).toLocaleString("pt-BR") +
      " triângulos · " + size.x.toFixed(1) + " × " + size.y.toFixed(1) + " × " + size.z.toFixed(1) + " m";
  } catch (error) {
    status.textContent = "Falha ao abrir modelo: " + String(error) +
      ". Execute npm run dev e abra a prévia na raiz do projeto.";
  }
}
select.addEventListener("change", () => { void loadVehicle(select.value); });
void loadVehicle(select.value);
engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());

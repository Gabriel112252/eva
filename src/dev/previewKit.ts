import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { EquiRectangularCubeTexture } from "@babylonjs/core/Materials/Textures/equiRectangularCubeTexture";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import "@babylonjs/loaders/glTF";

/**
 * Visualizador do kit modular "três camadas" (public/assets/environments/kit_tech.glb, gerado por
 * tools/blender/make_kit_tech.py). Isolado do jogo: lista as peças por categoria, mostra uma de cada vez
 * (câmera orbital) e, com `?demo=1`, monta um quarteirão de 24 m com as camadas aplicadas.
 * Expõe `window.kit` para o teste headless (tools/kit-test.mjs).
 */
export interface KitPiece {
  name: string;
  category: string;
  tris: number;
  draws: number;
  colliders: number;
  size: [number, number, number];
}

const CATEGORIES: Record<string, string> = { FACHADA: "Fachadas", TECH: "Camada tech", REMENDO: "Remendos", MARCO: "Marcos", PROP: "Props" };

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
const listEl = document.getElementById("list") as HTMLUListElement;
const catsEl = document.getElementById("cats") as HTMLDivElement;
const statusEl = document.getElementById("status") as HTMLDivElement;
const params = new URLSearchParams(location.search);
const DEMO = params.get("demo") === "1";
/** Em teste headless (Playwright) renderiza só sob demanda — SwiftShader é lento demais para o loop contínuo. */
const ON_DEMAND = params.get("loop") === "0" || navigator.webdriver;

const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
const scene = new Scene(engine);
scene.clearColor = new Color4(0.42, 0.5, 0.58, 1);
// a frente das peças é +Z: a câmera fica do lado +Z (alpha ≈ +π/2), ligeiramente à esquerda
const cam = new ArcRotateCamera("cam", Math.PI / 2 + 0.55, 1.2, 10, new Vector3(0, 1.5, 0), scene);
cam.attachControl(canvas, true);
cam.lowerRadiusLimit = 1;
cam.upperRadiusLimit = 120;
cam.wheelPrecision = 20;
cam.minZ = 0.1;
cam.maxZ = 400;
const hemi = new HemisphericLight("sky", new Vector3(0, 1, 0), scene);
hemi.intensity = 0.45;
hemi.groundColor = new Color3(0.3, 0.26, 0.22);
// sol vindo da frente-direita (+Z, +X), como o fim de tarde da referência
const sun = new DirectionalLight("sun", new Vector3(-0.5, -1, -0.65), scene);
sun.intensity = 3.0;
sun.position = new Vector3(25, 45, 35);
sun.shadowMinZ = 1;
sun.shadowMaxZ = 120;
const shadows = new ShadowGenerator(ON_DEMAND ? 1024 : 2048, sun);
shadows.usePercentageCloserFiltering = !ON_DEMAND;
shadows.useExponentialShadowMap = ON_DEMAND;
shadows.bias = 0.0015;
shadows.normalBias = 0.02;
scene.environmentTexture = proceduralEnvironment(scene);
scene.environmentIntensity = 0.7;
scene.imageProcessingConfiguration.toneMappingEnabled = true;
scene.imageProcessingConfiguration.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
scene.imageProcessingConfiguration.exposure = 1.05;
scene.imageProcessingConfiguration.contrast = 1.12;

const ground = MeshBuilder.CreateGround("floor", { width: DEMO ? 90 : 40, height: DEMO ? 90 : 40 }, scene);
const groundMat = new PBRMaterial("floor_mat", scene);
groundMat.albedoColor = new Color3(0.2, 0.19, 0.18);
groundMat.roughness = 0.95;
groundMat.metallic = 0;
ground.material = groundMat;
ground.receiveShadows = true;
ground.position.y = -0.005;

let container: AssetContainer | null = null;
let conversionRot = Quaternion.Identity();
let conversionScale = new Vector3(1, 1, 1);
const sources = new Map<string, TransformNode>();
const pieces: KitPiece[] = [];
let shownWrapper: TransformNode | null = null;
let shownName = "";

function proceduralEnvironment(s: Scene): EquiRectangularCubeTexture | null {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, "#5b86c7");
  g.addColorStop(0.42, "#9fbbe0");
  g.addColorStop(0.5, "#d9c9ad");
  g.addColorStop(0.55, "#8d7f6c");
  g.addColorStop(1, "#4a4038");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 128);
  const tex = new EquiRectangularCubeTexture(c.toDataURL("image/png"), s, 64, false, true);
  tex.gammaSpace = true;
  return tex;
}

/** Instancia uma peça do kit num nó de posicionamento (mesma conversão destro→canhoto de heroAssets.ts). */
function place(name: string, position: Vector3, yaw = 0, id = ""): TransformNode | null {
  const src = sources.get(name);
  if (!src) return null;
  const wrapper = new TransformNode(`kit_${name}${id ? `_${id}` : ""}`, scene);
  wrapper.position.copyFrom(position);
  wrapper.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), yaw);
  const clone = src.instantiateHierarchy(wrapper, undefined, (source, target) => {
    target.name = `${source.name}#${id}`;
  }) as TransformNode | null;
  if (!clone) return null;
  clone.position.setAll(0);
  clone.rotationQuaternion = conversionRot.clone();
  clone.scaling.copyFrom(conversionScale);
  for (const m of clone.getChildMeshes(false)) {
    if (/(^|#)COL_/.test(m.name) || m.name.startsWith("COL_")) {
      m.setEnabled(false);
      continue;
    }
    m.receiveShadows = true;
    m.isPickable = false;
    if (!/mancha|vidro|fio|cabo|folhas|mato|roupa|lona/i.test(m.name)) shadows.addShadowCaster(m, false);
  }
  return wrapper;
}

function boundsOf(node: TransformNode): { min: Vector3; max: Vector3 } {
  node.computeWorldMatrix(true);
  let min = new Vector3(Infinity, Infinity, Infinity);
  let max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const m of node.getChildMeshes(false)) {
    if (!m.isEnabled() || m.getTotalVertices() === 0) continue;
    m.computeWorldMatrix(true);
    const b = m.getBoundingInfo().boundingBox;
    min = Vector3.Minimize(min, b.minimumWorld);
    max = Vector3.Maximize(max, b.maximumWorld);
  }
  return { min, max };
}

async function load(): Promise<void> {
  const url = `${import.meta.env.BASE_URL}assets/environments/kit_tech.glb`;
  container = await LoadAssetContainerAsync(url, scene, { pluginExtension: ".glb" });
  container.addAllToScene();
  const root = container.meshes.find((m) => m.name === "__root__") ?? null;
  conversionRot = root?.rotationQuaternion?.clone() ?? Quaternion.Identity();
  conversionScale = root?.scaling.clone() ?? new Vector3(1, 1, 1);
  const candidates: TransformNode[] = root ? (root.getChildren((n) => n instanceof TransformNode, true) as TransformNode[]) : [];
  for (const n of candidates) {
    sources.set(n.name, n);
    const meshes = n.getChildMeshes(false) as AbstractMesh[];
    const vis = meshes.filter((m) => !m.name.startsWith("COL_") && m.getTotalVertices() > 0);
    const cols = meshes.filter((m) => m.name.startsWith("COL_"));
    n.computeWorldMatrix(true);
    let min = new Vector3(Infinity, Infinity, Infinity);
    let max = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const m of vis) {
      m.computeWorldMatrix(true);
      const b = m.getBoundingInfo().boundingBox;
      min = Vector3.Minimize(min, b.minimumWorld);
      max = Vector3.Maximize(max, b.maximumWorld);
    }
    const size = max.subtract(min);
    pieces.push({ name: n.name, category: n.name.split("_")[0] ?? n.name, tris: Math.round(vis.reduce((a, m) => a + m.getTotalIndices() / 3, 0)), draws: vis.length, colliders: cols.length, size: [+size.x.toFixed(2), +size.y.toFixed(2), +size.z.toFixed(2)] });
  }
  pieces.sort((a, b) => a.name.localeCompare(b.name));
  if (root) root.setEnabled(false);
  for (const m of container.meshes) if (m.material instanceof PBRMaterial) m.material.environmentIntensity = 0.9;
  if (ON_DEMAND) scene.render();
}

function fitCamera(node: TransformNode): void {
  const { min, max } = boundsOf(node);
  const size = max.subtract(min);
  const center = min.add(max).scale(0.5);
  cam.setTarget(center);
  const extent = Math.max(size.x, size.y, size.z);
  cam.radius = Math.max(2.5, extent * 1.6);
  cam.alpha = Math.PI / 2 + 0.55;
  cam.beta = extent > 8 ? 1.15 : 1.25;
}

async function show(name: string): Promise<KitPiece | null> {
  const piece = pieces.find((p) => p.name === name);
  if (!piece) return null;
  shownWrapper?.dispose(false, false);
  shownWrapper = place(name, Vector3.Zero(), 0, "view");
  shownName = name;
  let lifted = 0;
  if (shownWrapper) {
    // peças com origem na altura de fixação (fiação, varal, ar-condicionado) pendem abaixo de y=0:
    // no visualizador sobem até ficarem acima do chão
    const { min } = boundsOf(shownWrapper);
    if (min.y < -0.02) {
      lifted = -min.y + 0.05;
      shownWrapper.position.y = lifted;
    }
    fitCamera(shownWrapper);
  }
  for (const li of Array.from(listEl.children)) li.classList.toggle("on", (li as HTMLElement).dataset.name === name);
  statusEl.textContent = `${name}\n${piece.tris.toLocaleString("pt-BR")} triângulos · ${piece.draws} draw calls · ${piece.colliders} colisor(es)\n${piece.size[0]} × ${piece.size[1]} × ${piece.size[2]} m (L × A × P)${lifted ? `\norigem na altura de fixação (exibida ${lifted.toFixed(1)} m acima do chão)` : ""}`;
  // os shaders compilam em paralelo (KHR_parallel_shader_compile): sem esperar, o primeiro quadro sai vazio
  await scene.whenReadyAsync(true);
  scene.render();
  return piece;
}

function buildUi(): void {
  let current = "FACHADA";
  const renderList = () => {
    listEl.innerHTML = "";
    for (const p of pieces.filter((p) => p.category === current)) {
      const li = document.createElement("li");
      li.dataset.name = p.name;
      li.innerHTML = `<b>${p.name.replace(/^[A-Z]+_/, "")}</b><span>${p.tris} tri</span>`;
      const pieceName = p.name;
      li.addEventListener("click", () => void show(pieceName));
      listEl.appendChild(li);
    }
  };
  for (const [key, label] of Object.entries(CATEGORIES)) {
    const b = document.createElement("button");
    b.textContent = `${label} (${pieces.filter((p) => p.category === key).length})`;
    b.classList.toggle("on", key === current);
    b.addEventListener("click", () => {
      current = key;
      for (const o of Array.from(catsEl.children)) o.classList.remove("on");
      b.classList.add("on");
      renderList();
    });
    catsEl.appendChild(b);
  }
  renderList();
}

/** Quarteirão de demonstração (24 m): três camadas + marcos + props, só no visualizador. */
function buildDemo(): void {
  const P = (name: string, x: number, y: number, z: number, yaw = 0, id?: string) => place(name, new Vector3(x, y, z), yaw, id ?? `${x}_${y}_${z}`);
  // massa do edifício atrás das fachadas (volume cego) e calçada
  const mass = MeshBuilder.CreateBox("massa", { width: 24.6, height: 10.0, depth: 10 }, scene);
  mass.position.set(0, 5.0, -5.4);
  const massMat = new PBRMaterial("massa_mat", scene);
  massMat.albedoColor = new Color3(0.42, 0.4, 0.36);
  massMat.roughness = 1;
  massMat.metallic = 0;
  mass.material = massMat;
  mass.receiveShadows = true;
  shadows.addShadowCaster(mass);
  const walk = MeshBuilder.CreateBox("calcada", { width: 28, height: 0.15, depth: 4.2 }, scene);
  walk.position.set(0, 0.075, 2.1);
  const walkMat = new PBRMaterial("calcada_mat", scene);
  walkMat.albedoColor = new Color3(0.55, 0.52, 0.47);
  walkMat.roughness = 1;
  walkMat.metallic = 0;
  walk.material = walkMat;
  walk.receiveShadows = true;
  const y0 = 0.15;
  // base antiga: 4 módulos × 3 pavimentos + topos + esquinas
  const rows = [
    ["FACHADA_terreo_loja_0", "FACHADA_terreo_casa_0", "FACHADA_terreo_loja_1", "FACHADA_galpao_0"],
    ["FACHADA_apto_janelas_0", "FACHADA_apto_sacada_0", "FACHADA_apto_servico_0", "FACHADA_apto_janelas_1"],
    ["FACHADA_apto_sacada_1", "FACHADA_apto_janelas_1", "FACHADA_apto_janelas_0", "FACHADA_apto_servico_1"],
    ["FACHADA_topo_0", "FACHADA_topo_1", "FACHADA_topo_0", "FACHADA_topo_1"],
  ];
  rows.forEach((row, f) => row.forEach((name, i) => P(name, -9 + i * 6, y0 + f * 3, 0, 0, `r${f}_${i}`)));
  P("FACHADA_esquina_0", -12.1, y0, -0.1, 0, "esq_e");
  P("FACHADA_esquina_0", -12.1, y0 + 3, -0.1, 0, "esq_e1");
  P("FACHADA_esquina_0", -12.1, y0 + 6, -0.1, 0, "esq_e2");
  P("FACHADA_esquina_1", 12.1, y0, -0.1, 0, "esq_d");
  P("FACHADA_esquina_1", 12.1, y0 + 3, -0.1, 0, "esq_d1");
  P("FACHADA_esquina_1", 12.1, y0 + 6, -0.1, 0, "esq_d2");
  // camada tecnológica
  P("TECH_pele_fotovoltaica_rasgada", -9, y0 + 3, 0);
  P("TECH_pele_fotovoltaica_inteira", -9, y0 + 6, 0);
  P("TECH_letreiro_led_farmacia", 5.75, y0 + 2.5, 0);
  P("TECH_letreiro_led_agua", -5.9, y0 + 2.6, 0);
  P("TECH_totem_recarga", 5.6, y0, 2.4, 0.3);
  P("TECH_caixa_baterias", 10.6, y0, 1.2, 0.1);
  P("TECH_poste_sensor", -1.6, y0, 3.7, Math.PI);
  P("TECH_anexo_modular", -6, 10.0, -3.6, 0.0);
  P("TECH_canopy_solar", 6.2, 10.0, -3.2);
  P("TECH_reciclador_agua", 0.4, 10.0, -7.5, 0.4);
  // remendos
  P("REMENDO_caixa_dagua", 9.2, 10.0, -7.0);
  P("REMENDO_fiacao_12m", 4.4, y0 + 7.0, 3.7);
  P("REMENDO_fiacao_6m", -9, y0 + 5.75, 0.3);
  P("REMENDO_lona", -8.4, y0, 0.05, 0.0);
  P("REMENDO_toldo", 3.0, y0, 0.02);
  P("REMENDO_varal", -3.9, y0 + 5.1, 0.08);
  P("REMENDO_tubo_agua", -3, y0, 0.02);
  P("REMENDO_ar_condicionado", 7.0, y0 + 3.35, 0.02);
  // marcos: viaduto cruzando à direita (ao longo de z) e torre ao fundo
  P("MARCO_viaduto_maglev", 17.5, 0, 2.0, Math.PI / 2);
  P("MARCO_torre_fazenda", -9, 0, -24.5, Math.PI);
  // props na calçada e na rua
  P("PROP_banca_dobravel", -9.6, y0, 3.2, -0.2);
  P("PROP_engradado", -7.6, y0, 2.0, 0.4);
  P("PROP_engradado", -7.55, y0 + 0.31, 2.02, 0.1, "eng2");
  P("PROP_botijao", -5.2, y0, 1.0, 0.6);
  P("PROP_mesa_bar", 0.6, y0, 2.6, 0);
  P("PROP_cadeira_plastica", 0.0, y0, 2.2, 0.9, "cad1");
  P("PROP_cadeira_plastica", 1.3, y0, 2.9, -2.4, "cad2");
  P("PROP_cadeira_plastica", 1.1, y0, 1.9, 2.0, "cad3");
  P("PROP_placa_rua", -12.6, y0, 3.9, 0.2);
  P("PROP_caixa_distribuicao", 11.2, y0, 3.4, Math.PI);
  P("PROP_gerador", 8.6, y0, 1.1, 1.3);
  P("PROP_bancada_oficina", 9.5, -0.0, -1.2 + 2.3, Math.PI);
  P("PROP_bicicleta", 4.0, y0, 3.5, 0.15);
  P("PROP_grade", -11.0, y0, 1.6, Math.PI / 2 + 0.1);
  P("PROP_carrinho_mao", 6.9, y0, 3.3, 2.2);
  P("PROP_barril_metalico", 10.4, y0, 3.0, 0.3, "bar1");
  P("PROP_barril_metalico", 10.9, y0, 3.6, 1.1, "bar2");
  P("PROP_conteiner_pequeno", -6.0, 0, 9.5, -0.35);
  P("PROP_cavalete", 2.0, 0, 7.5, 0.4);
  P("PROP_cone", 3.4, 0, 6.9, 0, "cone1");
  P("PROP_cone", -1.0, 0, 8.2, 0, "cone2");
  P("PROP_pneu", 8.0, 0, 7.0, 0.3, "pneu1");
  P("PROP_pneu", 8.1, 0.2, 7.0, 1.4, "pneu2");
  P("PROP_saco_lixo", -3.0, y0, 3.6, 0.5, "saco1");
  P("PROP_saco_lixo", -2.4, y0, 3.3, 2.1, "saco2");
  P("PROP_banco_praca", -10.5, 0, 6.8, 0.1);
  P("PROP_caixa_hidrante", 1.2, y0, 0.45, 0, "hidr");
  cam.setTarget(new Vector3(0, 4.5, 0));
  cam.radius = 38;
  cam.alpha = Math.PI / 2 + 0.62;
  cam.beta = 1.22;
  statusEl.textContent = `Quarteirão de demonstração: ${scene.meshes.filter((m) => m.isEnabled() && m.getTotalVertices() > 0).length} malhas ativas`;
}

async function snapshot(quality = 0.9): Promise<string> {
  await scene.whenReadyAsync(true);
  scene.render();
  return canvas.toDataURL("image/jpeg", quality);
}

declare global {
  interface Window {
    kit: { _scene: Scene; ready: Promise<void>; pieces: KitPiece[]; show: (name: string) => Promise<KitPiece | null>; snapshot: (q?: number) => Promise<string>; demo: boolean; current: () => string; setView: (alpha: number, beta: number, radiusScale: number) => void };
  }
}

const ready = load()
  .then(async () => {
    buildUi();
    if (DEMO) {
      buildDemo();
      await scene.whenReadyAsync(true);
      scene.render();
    } else if (pieces.length > 0) await show(pieces.find((p) => p.category === "FACHADA")?.name ?? pieces[0]!.name);
  })
  .catch((e: unknown) => {
    statusEl.textContent = `Falha ao abrir kit_tech.glb: ${String(e)}. Rode npm run assets:kit e npm run build/dev.`;
    throw e;
  });

window.kit = {
  _scene: scene,
  ready,
  pieces,
  show,
  snapshot,
  demo: DEMO,
  current: () => shownName,
  setView: (alpha, beta, radiusScale) => {
    cam.alpha = alpha;
    cam.beta = beta;
    cam.radius *= radiusScale;
    scene.render();
  },
};

if (!ON_DEMAND) engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => {
  engine.resize();
  if (ON_DEMAND) scene.render();
});
if (ON_DEMAND) canvas.addEventListener("pointermove", () => scene.render());

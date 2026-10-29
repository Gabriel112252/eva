import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { CascadedShadowGenerator } from "@babylonjs/core/Lights/Shadows/cascadedShadowGenerator";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Scene } from "@babylonjs/core/scene";
import { SkyMaterial } from "@babylonjs/materials/sky/skyMaterial";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { EquiRectangularCubeTexture } from "@babylonjs/core/Materials/Textures/equiRectangularCubeTexture";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { QualityLevel } from "@/core/settings";
import { CANVAS_AVAILABLE } from "./textures";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import "@babylonjs/core/Rendering/depthRendererSceneComponent";

/**
 * Luz, céu, névoa, sombras e pós-processamento cinematográfico.
 * Hora da cena: ~14h30, outubro, São Paulo — sol alto a noroeste, luz quente e seca.
 */
export class Environment {
  readonly sun: DirectionalLight;
  readonly sky: HemisphericLight;
  readonly skyDome: Mesh;
  readonly shadows: CascadedShadowGenerator | ShadowGenerator;
  pipeline: DefaultRenderingPipeline | null = null;
  /** 0 = tarde (14h30), 1 = anoitecer (18h40): o confronto da missão acontece ao cair da noite */
  private dusk = 0;
  private duskTarget = 0;
  private skyMaterial: SkyMaterial | null = null;

  constructor(
    readonly scene: Scene,
    readonly quality: QualityLevel,
  ) {
    scene.clearColor = new Color4(0.72, 0.78, 0.84, 1);
    scene.ambientColor = new Color3(0.18, 0.18, 0.2);

    // --- Sol -------------------------------------------------------------
    const sunDir = new Vector3(0.52, -0.68, -0.52).normalize();
    this.sun = new DirectionalLight("sol", sunDir, scene);
    this.sun.position = sunDir.scale(-80);
    this.sun.intensity = 3.2;
    this.sun.diffuse = new Color3(1.0, 0.93, 0.82);
    this.sun.specular = new Color3(1.0, 0.95, 0.88);
    this.sun.shadowMinZ = 1;
    this.sun.shadowMaxZ = 140;

    // --- Luz do céu ------------------------------------------------------
    this.sky = new HemisphericLight("ceu", new Vector3(0, 1, 0), scene);
    this.sky.intensity = 0.55;
    this.sky.diffuse = new Color3(0.78, 0.86, 1.0);
    this.sky.groundColor = new Color3(0.42, 0.36, 0.3);
    this.sky.specular = Color3.Black();

    // --- Névoa seca / poeira --------------------------------------------
    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.0085;
    scene.fogColor = new Color3(0.78, 0.76, 0.7);

    // --- Céu -------------------------------------------------------------
    const skyMat = new SkyMaterial("ceu_material", scene);
    skyMat.backFaceCulling = false;
    skyMat.useSunPosition = true;
    skyMat.sunPosition = sunDir.scale(-100);
    skyMat.turbidity = 6.5;
    skyMat.luminance = 0.9;
    skyMat.rayleigh = 1.6;
    skyMat.mieCoefficient = 0.012;
    skyMat.mieDirectionalG = 0.86;
    skyMat.fogEnabled = false;
    this.skyMaterial = skyMat;
    // metade da aresta (200) × √3 ≈ 346 m < maxZ da câmera (500): o domo nunca é cortado pelo plano distante
    this.skyDome = MeshBuilder.CreateBox("ceu_domo", { size: 400 }, scene);
    this.skyDome.material = skyMat;
    this.skyDome.infiniteDistance = true;
    this.skyDome.isPickable = false;
    this.skyDome.applyFog = false;

    // --- Ambiente para PBR (equirect procedural, sem arquivos externos) ----
    const envTex = createProceduralEnvironment(scene);
    if (envTex) scene.environmentTexture = envTex;
    scene.environmentIntensity = 0.7;

    // --- Sombras ---------------------------------------------------------
    if (quality === "baixa") {
      const sg = new ShadowGenerator(768, this.sun);
      sg.usePercentageCloserFiltering = true;
      sg.filteringQuality = ShadowGenerator.QUALITY_LOW;
      sg.bias = 0.0015;
      this.shadows = sg;
    } else {
      const csm = new CascadedShadowGenerator(quality === "alta" ? 2048 : 1536, this.sun);
      csm.numCascades = 3;
      csm.lambda = 0.85;
      csm.shadowMaxZ = 110;
      csm.autoCalcDepthBounds = false;
      csm.stabilizeCascades = true;
      csm.usePercentageCloserFiltering = true;
      csm.filteringQuality = quality === "alta" ? ShadowGenerator.QUALITY_HIGH : ShadowGenerator.QUALITY_MEDIUM;
      csm.bias = 0.0025;
      csm.normalBias = 0.02;
      csm.cascadeBlendPercentage = 0.1;
      this.shadows = csm;
    }
    this.shadows.setDarkness(0.25);
  }

  get isNight(): boolean {
    return this.dusk > 0.5;
  }

  get duskLevel(): number {
    return this.dusk;
  }

  /** Alvo da transição tarde→anoitecer (0..1); a cena interpola em ~segundos. */
  setDusk(target: number): void {
    this.duskTarget = Math.max(0, Math.min(1, target));
  }

  /** Interpola sol, céu, névoa e ambiente entre tarde e anoitecer (chamar a cada frame). */
  updateTimeOfDay(dt: number): void {
    if (Math.abs(this.duskTarget - this.dusk) < 1e-4) return;
    this.dusk += (this.duskTarget - this.dusk) * Math.min(1, dt * 0.35);
    const k = this.dusk;
    // sol baixo a oeste, alaranjado
    const day = new Vector3(0.52, -0.68, -0.52).normalize();
    const eve = new Vector3(0.86, -0.18, -0.48).normalize();
    const dir = Vector3.Lerp(day, eve, k).normalize();
    this.sun.direction = dir;
    this.sun.position = dir.scale(-80);
    this.sun.intensity = 3.2 * (1 - k) + 1.1 * k;
    this.sun.diffuse = Color3.Lerp(new Color3(1.0, 0.93, 0.82), new Color3(1.0, 0.58, 0.32), k);
    this.sky.intensity = 0.55 * (1 - k) + 0.28 * k;
    this.sky.diffuse = Color3.Lerp(new Color3(0.78, 0.86, 1.0), new Color3(0.36, 0.4, 0.62), k);
    this.sky.groundColor = Color3.Lerp(new Color3(0.42, 0.36, 0.3), new Color3(0.2, 0.16, 0.16), k);
    this.scene.fogColor = Color3.Lerp(new Color3(0.78, 0.76, 0.7), new Color3(0.36, 0.3, 0.32), k);
    this.scene.fogDensity = 0.0085 + 0.004 * k;
    this.scene.environmentIntensity = 0.7 * (1 - k) + 0.35 * k;
    this.scene.ambientColor = Color3.Lerp(new Color3(0.18, 0.18, 0.2), new Color3(0.12, 0.1, 0.14), k);
    if (this.skyMaterial) {
      this.skyMaterial.sunPosition = dir.scale(-100);
      this.skyMaterial.luminance = 0.9 * (1 - k) + 0.45 * k;
      this.skyMaterial.turbidity = 6.5 + 5 * k;
    }
  }

  addShadowCasters(meshes: AbstractMesh[]): void {
    for (const m of meshes) this.shadows.addShadowCaster(m, true);
  }

  /** Pós-processamento: tonemapping ACES, bloom suave, vinheta, grão e DOF (diálogo). */
  attachPostProcessing(camera: Camera): DefaultRenderingPipeline {
    this.pipeline?.dispose();
    const hdr = this.quality !== "baixa";
    const p = new DefaultRenderingPipeline("cine", hdr, this.scene, [camera]);
    p.fxaaEnabled = true;
    p.samples = this.quality === "alta" ? 4 : 1;
    p.imageProcessingEnabled = true;
    p.imageProcessing.toneMappingEnabled = true;
    p.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    p.imageProcessing.exposure = 1.05;
    p.imageProcessing.contrast = 1.12;
    p.imageProcessing.vignetteEnabled = true;
    p.imageProcessing.vignetteWeight = 1.6;
    p.imageProcessing.vignetteStretch = 0.4;
    p.imageProcessing.vignetteColor = new Color4(0.02, 0.015, 0.01, 0);
    p.imageProcessing.colorCurvesEnabled = true;
    if (p.imageProcessing.colorCurves) {
      p.imageProcessing.colorCurves.globalSaturation = -8;
      p.imageProcessing.colorCurves.shadowsHue = 215;
      p.imageProcessing.colorCurves.shadowsSaturation = 12;
      p.imageProcessing.colorCurves.highlightsHue = 35;
      p.imageProcessing.colorCurves.highlightsSaturation = 10;
    }
    if (this.quality !== "baixa") {
      p.bloomEnabled = true;
      p.bloomThreshold = 0.85;
      p.bloomWeight = 0.12;
      p.bloomKernel = 48;
      p.bloomScale = 0.5;
      p.grainEnabled = true;
      p.grain.intensity = 7;
      p.grain.animated = true;
      p.chromaticAberrationEnabled = true;
      p.chromaticAberration.aberrationAmount = 4;
      p.chromaticAberration.radialIntensity = 0.6;
    }
    p.depthOfFieldEnabled = false;
    p.depthOfField.fStop = 2.2;
    p.depthOfField.focalLength = 60;
    p.depthOfField.focusDistance = 2500;
    this.pipeline = p;
    return p;
  }

  setDialogueFocus(enabled: boolean, focusDistanceMeters = 2.5): void {
    if (!this.pipeline) return;
    if (this.quality === "baixa") return;
    this.pipeline.depthOfFieldEnabled = enabled;
    this.pipeline.depthOfField.focusDistance = focusDistanceMeters * 1000;
  }
}

/** Equirect sintética (gradiente de céu + horizonte quente) para IBL dos materiais PBR. */
function createProceduralEnvironment(scene: Scene): EquiRectangularCubeTexture | null {
  if (!CANVAS_AVAILABLE) return null;
  const w = 256;
  const h = 128;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0.0, "#5b86c7");
  grad.addColorStop(0.42, "#9fbbe0");
  grad.addColorStop(0.5, "#d9c9ad");
  grad.addColorStop(0.55, "#8d7f6c");
  grad.addColorStop(1.0, "#4a4038");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  // sol
  const sg = ctx.createRadialGradient(w * 0.68, h * 0.22, 2, w * 0.68, h * 0.22, 26);
  sg.addColorStop(0, "rgba(255,246,220,1)");
  sg.addColorStop(1, "rgba(255,246,220,0)");
  ctx.fillStyle = sg;
  ctx.fillRect(0, 0, w, h);
  const url = canvas.toDataURL("image/png");
  const tex = new EquiRectangularCubeTexture(url, scene, 64, false, true);
  tex.gammaSpace = true;
  return tex;
}

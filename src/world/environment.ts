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
import type { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { EquiRectangularCubeTexture } from "@babylonjs/core/Materials/Textures/equiRectangularCubeTexture";
import { CubeTexture } from "@babylonjs/core/Materials/Textures/cubeTexture";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { Material } from "@babylonjs/core/Materials/material";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { QualityLevel } from "@/core/settings";
import { CANVAS_AVAILABLE } from "./textures";
import { PlanetLayer } from "./planet";
import { PostFx } from "./postfx";
import { setCharacterShadingQuality, setRimLight } from "@/characters/characterShading";
import "@babylonjs/core/Materials/Textures/Loaders/envTextureLoader";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import "@babylonjs/core/Rendering/depthRendererSceneComponent";

/**
 * Luz, céu, névoa, sombras e pós-processamento cinematográfico.
 * Hora da cena: ~14h30, outubro, São Paulo — sol alto a noroeste, luz quente e seca.
 *
 * Iluminação baseada em imagem: dois HDRIs CC0 reais (Poly Haven, via pmndrs/assets) pré-filtrados para PBR em
 * `public/assets/env/*.env` — tarde (praça urbana com céu claro) e anoitecer (praça ao pôr do sol). Ambos foram
 * girados para o brilho do céu cair no azimute do sol da cena e tiveram o disco do sol cortado (o sol é a
 * DirectionalLight). O céu visível continua sendo o SkyMaterial (que escurece com a altitude da aeromoto).
 */
export class Environment {
  readonly sun: DirectionalLight;
  readonly sky: HemisphericLight;
  readonly skyDome: Mesh;
  readonly shadows: CascadedShadowGenerator | ShadowGenerator;
  pipeline: DefaultRenderingPipeline | null = null;
  /** pós-processamento por qualidade (SSAO2, SSR, TAA, raios, LUT…) — ver postfx.ts */
  post: PostFx | null = null;
  /** IBL: HDRIs pré-filtrados (tarde/anoitecer); null em testes sem DOM ou se o arquivo falhar */
  private envDay: CubeTexture | null = null;
  private envDusk: CubeTexture | null = null;
  private envFallback: EquiRectangularCubeTexture | null = null;
  /** materiais congelados (freeze) descongelados enquanto o ambiente muda (o UBO congelado não relê IBL/emissivo) */
  private thawed: Material[] = [];
  private thawFrames = 0;
  private startThawDone = false;
  /** 0 = tarde (14h30), 1 = anoitecer (18h40): o confronto da missão acontece ao cair da noite */
  private dusk = 0;
  private duskTarget = 0;
  private skyMaterial: SkyMaterial | null = null;
  /** Terra vista de cima (ligada quando a câmera passa de ~140 m) */
  planet: PlanetLayer | null = null;
  /** 0..1: a névoa se dissipa entre 100 m e 1,5 km de altitude */
  private altFog = 0;
  /** 0..1: o céu escurece até o espaço entre 8 km e 80 km */
  private altSpace = 0;
  /** valores-base da hora do dia (antes do efeito da altitude) */
  private base = { ...DAY_ATMOSPHERE };

  constructor(
    readonly scene: Scene,
    readonly quality: QualityLevel,
  ) {
    scene.clearColor = new Color4(0.72, 0.78, 0.84, 1);
    scene.ambientColor = new Color3(0.18, 0.18, 0.2);
    setCharacterShadingQuality(quality);
    setRimLight(DAY_LIGHT.rim, DAY_LIGHT.rimIntensity, DAY_SUN_DIR.scale(-1));

    // --- Sol -------------------------------------------------------------
    const sunDir = DAY_SUN_DIR.clone();
    this.sun = new DirectionalLight("sol", sunDir, scene);
    this.sun.position = sunDir.scale(-80);
    this.sun.intensity = DAY_LIGHT.sun;
    this.sun.diffuse = DAY_LIGHT.sunColor.clone();
    this.sun.specular = new Color3(1.0, 0.95, 0.88);
    this.sun.shadowMinZ = 1;
    this.sun.shadowMaxZ = 140;

    // --- Luz do céu ------------------------------------------------------
    // com o IBL real o céu/chão já entram pelo HDRI; a hemisférica fica só como preenchimento leve
    // (materiais não-PBR e o caso sem HDRI)
    this.sky = new HemisphericLight("ceu", new Vector3(0, 1, 0), scene);
    this.sky.intensity = DAY_ATMOSPHERE.skyIntensity;
    this.sky.diffuse = DAY_LIGHT.skyColor.clone();
    this.sky.groundColor = DAY_LIGHT.groundColor.clone();
    this.sky.specular = Color3.Black();

    // --- Névoa seca / poeira --------------------------------------------
    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogDensity = DAY_ATMOSPHERE.fogDensity;
    scene.fogColor = DAY_LIGHT.fogColor.clone();

    // --- Céu -------------------------------------------------------------
    const skyMat = new SkyMaterial("ceu_material", scene);
    skyMat.backFaceCulling = false;
    skyMat.useSunPosition = true;
    skyMat.sunPosition = sunDir.scale(-100);
    skyMat.turbidity = DAY_ATMOSPHERE.skyTurb;
    skyMat.luminance = DAY_ATMOSPHERE.skyLum;
    skyMat.rayleigh = DAY_ATMOSPHERE.skyRayleigh;
    skyMat.mieCoefficient = DAY_ATMOSPHERE.skyMie;
    skyMat.mieDirectionalG = 0.84;
    skyMat.fogEnabled = false;
    // o céu não escreve profundidade: SSAO/SSR/raios tratam o fundo como céu e o brilho do sol fica atrás dos prédios
    skyMat.disableDepthWrite = true;
    this.skyMaterial = skyMat;
    // metade da aresta (200) × √3 ≈ 346 m < maxZ da câmera (500): o domo nunca é cortado pelo plano distante
    this.skyDome = MeshBuilder.CreateBox("ceu_domo", { size: 400 }, scene);
    this.skyDome.material = skyMat;
    this.skyDome.infiniteDistance = true;
    this.skyDome.isPickable = false;
    this.skyDome.applyFog = false;

    // --- Ambiente para PBR: HDRI real pré-filtrado (.env) --------------------
    this.envDay = loadEnvironment(
      scene,
      "tarde",
      () => {
        // a do anoitecer vem depois, sem disputar banda com a carga inicial
        if (!this.envDusk) this.envDusk = loadEnvironment(scene, "anoitecer", undefined, () => (this.envDusk = null));
      },
      () => {
        // sem o arquivo (404/rede): volta ao equirect procedural para os materiais PBR não ficarem esperando
        this.envDay = null;
        this.envFallback ??= createProceduralEnvironment(scene);
        scene.environmentTexture = this.envFallback;
      },
    );
    if (this.envDay) {
      scene.environmentTexture = this.envDay;
    } else {
      // sem DOM (testes) ou sem suporte: equirect procedural
      this.envFallback = createProceduralEnvironment(scene);
      if (this.envFallback) scene.environmentTexture = this.envFallback;
    }
    scene.environmentIntensity = DAY_ATMOSPHERE.envIntensity;

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
    // sombra quase cheia: o preenchimento vem do IBL/hemisférica (antes 0,25 deixava o sol vazar e achatava a cena)
    this.shadows.setDarkness(0.06);

    // --- Terra vista de cima (voo da aeromoto) ---------------------------
    try {
      this.planet = new PlanetLayer(scene, this.skyDome, quality);
    } catch (err) {
      console.warn("[ambiente] camada distante indisponível", err);
      this.planet = null;
    }
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
    if (!this.startThawDone) {
      // primeiros quadros do jogo: materiais congelados na carga reavaliam o shader uma vez com o conjunto final
      // de luzes (pool do Setor 17, exclusões do kit) — corrige variantes com luzes fantasmas e evita compilar
      // tudo isso no meio da transição para o anoitecer
      this.startThawDone = true;
      this.thawFrozenMaterials(10);
    }
    this.tickThaw();
    if (Math.abs(this.duskTarget - this.dusk) < 1e-4) return;
    this.dusk += (this.duskTarget - this.dusk) * Math.min(1, dt * 0.35);
    if (Math.abs(this.duskTarget - this.dusk) < 1e-4) this.dusk = this.duskTarget;
    const k = this.dusk;
    // sol baixo a oeste, alaranjado
    const dir = Vector3.Lerp(DAY_SUN_DIR, DUSK_SUN_DIR, k).normalize();
    this.sun.direction = dir;
    this.sun.position = dir.scale(-80);
    this.sun.intensity = DAY_LIGHT.sun * (1 - k) + DUSK_LIGHT.sun * k;
    this.sun.diffuse = Color3.Lerp(DAY_LIGHT.sunColor, DUSK_LIGHT.sunColor, k);
    this.sky.diffuse = Color3.Lerp(DAY_LIGHT.skyColor, DUSK_LIGHT.skyColor, k);
    this.sky.groundColor = Color3.Lerp(DAY_LIGHT.groundColor, DUSK_LIGHT.groundColor, k);
    this.scene.fogColor = Color3.Lerp(DAY_LIGHT.fogColor, DUSK_LIGHT.fogColor, k);
    this.scene.ambientColor = Color3.Lerp(new Color3(0.18, 0.18, 0.2), new Color3(0.12, 0.1, 0.14), k);
    if (this.skyMaterial) this.skyMaterial.sunPosition = dir.scale(-100);
    for (const key of Object.keys(DAY_ATMOSPHERE) as Array<keyof typeof DAY_ATMOSPHERE>) this.base[key] = DAY_ATMOSPHERE[key] * (1 - k) + DUSK_ATMOSPHERE[key] * k;
    // IBL: troca o HDRI na metade da transição; a intensidade passa por um vale ali para a troca não estalar
    const wantDusk = k > 0.5 && !!this.envDusk?.isReady();
    const tex = wantDusk ? this.envDusk : this.envDay;
    if (tex && this.scene.environmentTexture !== tex) {
      this.scene.environmentTexture = tex;
      this.post?.setEnvironmentTexture(tex);
    }
    if (this.envDay) this.base.envIntensity *= 0.55 + 0.45 * Math.min(1, Math.abs(k - 0.5) * 4);
    this.applyNightEmissives(k);
    this.post?.setTimeOfDay(k);
    setRimLight(Color3.Lerp(DAY_LIGHT.rim, DUSK_LIGHT.rim, k), DAY_LIGHT.rimIntensity * (1 - k) + DUSK_LIGHT.rimIntensity * k, dir.scale(-1));
    this.applyAtmosphere();
    // UBO de materiais congelados guarda IBL/emissivo: descongela até a transição assentar (+ alguns quadros)
    this.thawFrozenMaterials(4);
  }

  /** Janelas acesas e LEDs um pouco mais vivos à noite (blockout e kit). */
  private applyNightEmissives(k: number): void {
    const boost = 1 + 0.45 * k;
    for (const [name, base] of NIGHT_EMISSIVES) {
      const m = this.scene.getMaterialByName(name);
      if (m instanceof PBRMaterial) m.emissiveIntensity = base * boost;
    }
  }

  /** Descongela os materiais congelados por `frames` quadros (o UBO de um material congelado não é reenviado). */
  private thawFrozenMaterials(frames: number): void {
    if (this.thawFrames === 0) {
      for (const m of this.scene.materials) {
        if (m.isFrozen) {
          m.unfreeze();
          this.thawed.push(m);
        }
      }
    }
    this.thawFrames = Math.max(this.thawFrames, frames);
  }

  private tickThaw(): void {
    if (this.thawFrames <= 0) return;
    this.thawFrames--;
    if (this.thawFrames === 0) {
      const alive = new Set(this.scene.materials);
      for (const m of this.thawed) if (alive.has(m)) m.freeze();
      this.thawed = [];
    }
  }

  /**
   * Efeito da altitude da câmera (m): dissipa a névoa, abre o plano distante, escurece o céu até o espaço
   * e atualiza a Terra vista de cima. Chamar a cada quadro.
   */
  updateAltitude(camera: Camera, altitude: number): void {
    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
    // a poeira da rua some rápido com a altitude (visibilidade de ~250 m no chão → quilômetros a 1 km)
    const aFog = clamp01((altitude - 20) / 400);
    const aSpace = clamp01((altitude - 8000) / 72000);
    if (Math.abs(aFog - this.altFog) > 1e-4 || Math.abs(aSpace - this.altSpace) > 1e-4) {
      this.altFog = aFog;
      this.altSpace = aSpace;
      this.applyAtmosphere();
    }
    camera.maxZ = 500 + aFog * 5500;
    this.planet?.update(camera, altitude, clamp01((altitude - 35000) / 45000), aFog);
  }

  /** Combina hora do dia e altitude em névoa, céu, luz difusa e ambiente. */
  private applyAtmosphere(): void {
    const aFog = this.altFog;
    const aSpace = this.altSpace;
    this.scene.fogDensity = this.base.fogDensity * (1 - aFog) * (1 - aFog);
    this.sky.intensity = this.base.skyIntensity * (1 - 0.8 * aSpace);
    this.scene.environmentIntensity = this.base.envIntensity * (1 - 0.6 * aSpace);
    if (this.skyMaterial) {
      // no SkyMaterial, luminance maior = céu mais escuro (fator log2(2/l⁴) → 0 em l≈1,19): espaço ≈ 1,15
      this.skyMaterial.luminance = this.base.skyLum * (1 - aSpace) + 1.15 * aSpace;
      this.skyMaterial.turbidity = this.base.skyTurb * (1 - aSpace) + 1.0 * aSpace;
      this.skyMaterial.rayleigh = this.base.skyRayleigh * (1 - aSpace);
      this.skyMaterial.mieCoefficient = this.base.skyMie * (1 - aSpace) + 0.0005 * aSpace;
    }
  }

  /** 0..1 — quanto do céu já virou espaço (para HUD/testes). */
  get spaceLevel(): number {
    return this.altSpace;
  }

  addShadowCasters(meshes: AbstractMesh[]): void {
    for (const m of meshes) this.shadows.addShadowCaster(m, true);
  }

  /**
   * Pós-processamento por qualidade (postfx.ts): SSAO2, SSR, TAA, raios de sol, bloom, LUT de gradação, vinheta,
   * grão e DOF de diálogo. Devolve o pipeline padrão (tonemapping/bloom/DOF) por compatibilidade.
   */
  attachPostProcessing(camera: Camera): DefaultRenderingPipeline {
    this.post?.dispose();
    this.post = new PostFx(this.scene, camera, this.quality, this.sun);
    this.post.setTimeOfDay(this.dusk);
    this.pipeline = this.post.pipeline;
    return this.pipeline;
  }

  setDialogueFocus(enabled: boolean, focusDistanceMeters = 2.5): void {
    this.post?.setDialogueFocus(enabled, focusDistanceMeters);
  }
}

// ---------------------------------------------------------------------------------------------------------
// Hora do dia: tarde (14h30) e anoitecer (18h40)
// ---------------------------------------------------------------------------------------------------------

const DAY_SUN_DIR = new Vector3(0.52, -0.68, -0.52).normalize();
const DUSK_SUN_DIR = new Vector3(0.86, -0.18, -0.48).normalize();

/** Luz e cor por hora do dia (interpoladas em updateTimeOfDay). */
const DAY_LIGHT = {
  sun: 3.0,
  sunColor: new Color3(1.0, 0.86, 0.68),
  skyColor: new Color3(0.72, 0.82, 1.0),
  groundColor: new Color3(0.45, 0.38, 0.3),
  fogColor: new Color3(0.7, 0.71, 0.7),
  rim: new Color3(1.0, 0.86, 0.68),
  rimIntensity: 0.32,
};
const DUSK_LIGHT = {
  sun: 1.5,
  sunColor: new Color3(1.0, 0.52, 0.26),
  skyColor: new Color3(0.32, 0.38, 0.62),
  groundColor: new Color3(0.2, 0.15, 0.14),
  fogColor: new Color3(0.27, 0.28, 0.33),
  rim: new Color3(1.0, 0.55, 0.3),
  rimIntensity: 0.4,
};
/** Parâmetros numéricos da atmosfera (a altitude da aeromoto é aplicada por cima, em applyAtmosphere). */
const DAY_ATMOSPHERE = { fogDensity: 0.0072, skyLum: 0.95, skyTurb: 8.5, skyRayleigh: 1.25, skyMie: 0.009, skyIntensity: 0.18, envIntensity: 0.95 };
const DUSK_ATMOSPHERE = { fogDensity: 0.0105, skyLum: 0.5, skyTurb: 12, skyRayleigh: 1.4, skyMie: 0.014, skyIntensity: 0.1, envIntensity: 0.8 };

/** Emissivos que ganham força ao anoitecer: nome do material → intensidade de dia. */
const NIGHT_EMISSIVES: Array<[string, number]> = [
  ["mat_vidro_aceso", 1.6],
  ["mat_lampada", 3.0],
  ["mat_led_vermelho", 2.5],
  ["mat_led_verde", 2.0],
  ["kit_paleta", 4],
];

/** HDRI pré-filtrado (`public/assets/env/<nome>.env`); null sem DOM (testes headless). */
function loadEnvironment(scene: Scene, name: string, onLoad?: () => void, onError?: () => void): CubeTexture | null {
  if (!CANVAS_AVAILABLE) return null;
  try {
    // VITE_ENV_EXT: hospedagens que restringem extensões (como VITE_CHARACTER_EXT para os .glb); o loader recebe
    // ".env" explicitamente, então o nome do arquivo não importa. Se nada carregar, volta ao equirect procedural.
    const ext = (import.meta.env.VITE_ENV_EXT as string | undefined) ?? ".env";
    const url = `${import.meta.env.BASE_URL}assets/env/${name}${ext}`;
    const fail = (msg?: string) => {
      console.warn(`[ambiente] HDRI ${name} indisponível`, msg);
      onError?.();
    };
    const tex = new CubeTexture(url, scene, null, false, null, () => onLoad?.(), fail, undefined, true, ".env", false);
    tex.name = `ibl_${name}`;
    return tex;
  } catch (err) {
    console.warn(`[ambiente] HDRI ${name} indisponível`, err);
    return null;
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

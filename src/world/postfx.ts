import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { SSAO2RenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline";
import { SSRRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssrRenderingPipeline";
import { TAARenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/taaRenderingPipeline";
import { VolumetricLightScatteringPostProcess } from "@babylonjs/core/PostProcesses/volumetricLightScatteringPostProcess";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { RawTexture3D } from "@babylonjs/core/Materials/Textures/rawTexture3D";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { CubeTexture } from "@babylonjs/core/Materials/Textures/cubeTexture";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Constants } from "@babylonjs/core/Engines/constants";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { Scene } from "@babylonjs/core/scene";
import type { QualityLevel } from "@/core/settings";

/**
 * Pós-processamento por qualidade (ver docs/DIRECAO_ARTE.md, "Pipeline de render").
 *
 * Ordem na câmera (a ordem de criação define a ordem dos passes):
 *   TAA (alta) → SSAO2 (média/alta) → SSR (alta, só poças/vidro) → raios de sol (alta) → DefaultRenderingPipeline
 *   (bloom, nitidez, DOF de diálogo, tonemapping ACES, LUT de gradação, vinheta, grão, FXAA).
 * O TAA precisa ser o primeiro pós da câmera (exigência do Babylon). Nenhum desses pipelines é ligado/desligado
 * em tempo de jogo — religar reanexa os pós no fim da lista (depois do tonemapping); o que varia é só parâmetro.
 *
 * - baixa: só o pipeline padrão sem HDR (FXAA, tonemapping, LUT, vinheta) — o mesmo custo de antes.
 * - média: HDR, SSAO2 em meia resolução (8 amostras), bloom calibrado para emissivos, LUT, vinheta e grão.
 * - alta: tudo da média com SSAO2 de 16 amostras e desfoque bilateral, TAA com reprojeção por velocidade (no lugar
 *   do MSAA 4×), SSR limitado a superfícies com F0 alto (poças e vidro), raios volumétricos e nitidez leve.
 */
export class PostFx {
  readonly pipeline: DefaultRenderingPipeline;
  readonly taa: TAARenderingPipeline | null = null;
  readonly ssao: SSAO2RenderingPipeline | null = null;
  readonly ssr: SSRRenderingPipeline | null = null;
  readonly rays: VolumetricLightScatteringPostProcess | null = null;
  private sunGlow: Mesh | null = null;
  private sunGlowMat: StandardMaterial | null = null;
  private lut: RawTexture3D | null = null;
  private readonly observers: Array<Observer<Scene>> = [];
  /** 0 = tarde, 1 = anoitecer */
  private dusk = 0;
  private inDialogue = false;

  constructor(
    private readonly scene: Scene,
    private readonly camera: Camera,
    readonly quality: QualityLevel,
    private readonly sun: DirectionalLight,
  ) {
    const engine = scene.getEngine();
    const hdr = quality !== "baixa";
    const webgl2 = ((engine as unknown as { webGLVersion?: number }).webGLVersion ?? 1) >= 2 || engine.isWebGPU;
    const half = engine.getCaps().textureHalfFloatRender ? Constants.TEXTURETYPE_HALF_FLOAT : Constants.TEXTURETYPE_UNSIGNED_BYTE;

    // --- TAA (alta): primeiro da câmera; reprojeta o histórico com a velocidade do pré-passe -------------
    if (quality === "alta" && webgl2) {
      const taa = new TAARenderingPipeline("taa", scene, [camera], half);
      if (taa.isSupported) {
        taa.samples = 8;
        taa.factor = 0.1;
        taa.disableOnCameraMove = false;
        taa.reprojectHistory = true;
        taa.clampHistory = true;
        this.taa = taa;
      } else {
        taa.dispose();
      }
    }

    // --- SSAO2 (média/alta): contato e cantos; meia resolução --------------------------------------------
    if (quality !== "baixa" && webgl2) {
      const alta = quality === "alta";
      const ssao = new SSAO2RenderingPipeline("ssao", scene, { ssaoRatio: 0.5, blurRatio: alta ? 1 : 0.5 }, [camera], false, half);
      if (ssao.isSupported) {
        ssao.radius = 1.4;
        ssao.totalStrength = 1.35;
        ssao.base = 0.04;
        ssao.samples = alta ? 16 : 8;
        ssao.maxZ = 70;
        ssao.minZAspect = 0.35;
        ssao.epsilon = 0.02;
        ssao.expensiveBlur = alta;
        ssao.bilateralSamples = alta ? 12 : 8;
        ssao.bilateralSoften = 0.6;
        ssao.bilateralTolerance = 0.4;
        this.ssao = ssao;
      } else {
        ssao.dispose();
      }
    }

    // --- SSR (alta): só onde o F0 passa de 0,05 — poças/manchas molhadas e vidro (materials.ts) -----------
    if (quality === "alta" && webgl2) {
      const ssr = new SSRRenderingPipeline("ssr", scene, [camera], false, half);
      if (ssr.isSupported) {
        ssr.reflectivityThreshold = 0.05;
        ssr.strength = 1.0;
        ssr.reflectionSpecularFalloffExponent = 1.0;
        // passos de 3 px (em ½ resolução) × 100: reflexos de até ~600 px de tela, o bastante para a fachada na poça
        ssr.step = 3;
        ssr.maxSteps = 100;
        ssr.maxDistance = 90;
        ssr.thickness = 0.6;
        ssr.roughnessFactor = 0.15;
        ssr.ssrDownsample = 1;
        ssr.blurDispersionStrength = 0.025;
        ssr.blurDownsample = 1;
        ssr.enableSmoothReflections = true;
        ssr.selfCollisionNumSkip = 2;
        ssr.attenuateScreenBorders = true;
        ssr.attenuateIntersectionDistance = true;
        ssr.attenuateBackfaceReflection = true;
        ssr.useFresnel = true;
        ssr.clipToFrustum = true;
        ssr.inputTextureColorIsInGammaSpace = false;
        ssr.generateOutputInGammaSpace = false;
        if (scene.environmentTexture instanceof CubeTexture) ssr.environmentTexture = scene.environmentTexture;
        this.ssr = ssr;
      } else {
        ssr.dispose();
      }
    }

    // --- raios de sol (alta): passe de oclusão em ¼ de resolução só com as massas grandes ------------------
    if (quality === "alta") this.rays = this.createSunRays();

    // --- pipeline padrão -----------------------------------------------------------------------------------
    const p = new DefaultRenderingPipeline("cine", hdr, scene, [camera]);
    p.samples = this.taa ? 1 : quality === "alta" ? 4 : 1;
    p.fxaaEnabled = !this.taa;
    p.imageProcessingEnabled = true;
    const ip = p.imageProcessing;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = 0.92;
    ip.contrast = 1.0;
    ip.vignetteEnabled = true;
    ip.vignetteWeight = 1.15;
    ip.vignetteStretch = 0.35;
    ip.vignetteColor = new Color4(0.02, 0.025, 0.035, 0);
    ip.ditheringEnabled = hdr;
    ip.ditheringIntensity = 0.5 / 255;
    // gradação: LUT 3D gerada por código (WebGL2); sem 3D, as curvas de cor fazem uma versão aproximada
    this.lut = webgl2 ? createGradingLut(scene) : null;
    if (this.lut) {
      ip.colorCurvesEnabled = false;
      ip.colorGradingEnabled = true;
      ip.colorGradingTexture = this.lut;
      ip.imageProcessingConfiguration.colorGradingWithGreenDepth = false;
      ip.imageProcessingConfiguration.colorGradingBGR = false;
    } else {
      ip.colorCurvesEnabled = true;
      if (ip.colorCurves) {
        ip.colorCurves.globalSaturation = -4;
        ip.colorCurves.shadowsHue = 200;
        ip.colorCurves.shadowsSaturation = 14;
        ip.colorCurves.highlightsHue = 35;
        ip.colorCurves.highlightsSaturation = 12;
      }
      ip.contrast = 1.12;
    }
    if (hdr) {
      p.bloomEnabled = true;
      p.bloomKernel = 64;
      p.bloomScale = 0.5;
      // grão é um passe a mais em tela cheia: só na alta
      p.grainEnabled = quality === "alta";
      p.grain.intensity = 4;
      p.grain.animated = true;
      p.chromaticAberrationEnabled = false;
      if (this.taa) {
        // o TAA amacia o detalhe fino: devolve um pouco de nitidez
        p.sharpenEnabled = true;
        p.sharpen.edgeAmount = 0.22;
        p.sharpen.colorAmount = 1.0;
      }
    }
    p.depthOfFieldEnabled = false;
    p.depthOfField.fStop = 2.2;
    p.depthOfField.focalLength = 60;
    p.depthOfField.focusDistance = 2500;
    this.pipeline = p;
    this.setTimeOfDay(0);

    // o sol (e o brilho dos raios) acompanha a câmera; o passe de oclusão só roda com o sol à vista
    this.observers.push(scene.onBeforeRenderObservable.add(() => this.updateSun()));
  }

  /** Tarde (0) → anoitecer (1): bloom mais sensível à noite (emissivos), raios mais quentes e longos. */
  setTimeOfDay(dusk: number): void {
    this.dusk = dusk;
    const p = this.pipeline;
    if (p.bloomEnabled) {
      // de dia só o que passa do reboco ao sol (letreiros, lâmpadas, céu perto do sol); de noite janelas e LEDs
      p.bloomThreshold = 2.1 * (1 - dusk) + 0.75 * dusk;
      p.bloomWeight = 0.16 * (1 - dusk) + 0.32 * dusk;
    }
    // nunca exatamente 1,0: o Babylon só inclui o termo de exposição no shader quando ≠ 1 (mudar recompilaria)
    const exposure = 0.92 + 0.12 * dusk;
    p.imageProcessing.exposure = Math.abs(exposure - 1) < 1e-3 ? 1.001 : exposure;
    if (this.rays) {
      // (a exposição dos raios é recalculada por quadro em updateSun, com o sol à vista)
      this.rays.decay = 0.962 * (1 - dusk) + 0.972 * dusk;
      this.rays.weight = 0.42;
      this.rays.density = 0.9;
    }
    if (this.sunGlowMat) {
      const c = Color3.Lerp(new Color3(1.0, 0.9, 0.72), new Color3(1.0, 0.55, 0.25), dusk);
      this.sunGlowMat.emissiveColor = c.scale(0.55 + 0.25 * dusk);
    }
  }

  /** Atualiza o IBL de reserva do SSR quando o ambiente troca (tarde ↔ anoitecer). */
  setEnvironmentTexture(tex: CubeTexture | null): void {
    if (this.ssr) this.ssr.environmentTexture = tex;
  }

  /** Diálogo: liga o DOF (o pipeline padrão se recompõe sozinho, sempre no fim da lista). */
  setDialogueFocus(enabled: boolean, focusDistanceMeters = 2.5): void {
    if (this.quality === "baixa") return;
    this.inDialogue = enabled;
    this.pipeline.depthOfFieldEnabled = enabled;
    this.pipeline.depthOfField.focusDistance = focusDistanceMeters * 1000;
  }

  /** Malhas que passam a ocluir os raios de sol (ex.: kit carregado depois). */
  addSunOccluders(meshes: AbstractMesh[]): void {
    if (!this.rays) return;
    for (const m of sunOccluders(meshes)) if (!this.rays.includedMeshes.includes(m)) this.rays.includedMeshes.push(m);
  }

  dispose(): void {
    for (const o of this.observers) this.scene.onBeforeRenderObservable.remove(o);
    this.pipeline.dispose();
    this.ssr?.dispose();
    this.ssao?.dispose();
    this.taa?.dispose();
    if (this.rays) this.rays.dispose(this.camera);
    this.sunGlow?.dispose(false, true);
    this.lut?.dispose();
  }

  // ---------------------------------------------------------------------------------------------------------

  private createSunRays(): VolumetricLightScatteringPostProcess | null {
    const scene = this.scene;
    const glow = CreatePlane("sol_brilho", { size: 1 }, scene);
    glow.billboardMode = TransformNode.BILLBOARDMODE_ALL;
    glow.isPickable = false;
    glow.applyFog = false;
    glow.receiveShadows = false;
    glow.doNotSyncBoundingInfo = true;
    glow.alwaysSelectAsActiveMesh = true;
    const mat = new StandardMaterial("sol_brilho_mat", scene);
    const tex = radialGlowTexture(scene);
    mat.emissiveTexture = tex;
    mat.opacityTexture = tex;
    mat.disableLighting = true;
    mat.diffuseColor = Color3.Black();
    mat.specularColor = Color3.Black();
    mat.alphaMode = Constants.ALPHA_ADD;
    mat.backFaceCulling = false;
    mat.fogEnabled = false;
    mat.disableDepthWrite = true;
    glow.material = mat;
    glow.scaling.setAll(46);
    this.sunGlow = glow;
    this.sunGlowMat = mat;
    const rays = new VolumetricLightScatteringPostProcess(
      "raios_de_sol",
      { postProcessRatio: 1.0, passRatio: 0.25 },
      this.camera,
      glow,
      64,
      Texture.BILINEAR_SAMPLINGMODE,
      scene.getEngine(),
      false,
      scene,
    );
    rays.useCustomMeshPosition = false;
    rays.invert = true;
    // só as massas grandes (prédios, viaduto, árvores) entram no passe de oclusão: bem menos draw calls
    rays.includedMeshes = [glow, ...sunOccluders(scene.meshes)];
    return rays;
  }

  /** Brilho do sol a ~420 m na direção do sol (dentro do maxZ de 500 m) e liga/desliga o passe de oclusão. */
  private updateSun(): void {
    if (!this.sunGlow || !this.rays) return;
    const cam = this.scene.activeCamera ?? this.camera;
    const toSun = this.sun.direction.scale(-1).normalize();
    this.sunGlow.position.copyFrom(cam.globalPosition).addInPlace(toSun.scale(420));
    // passe de oclusão parado quando o sol está fora de vista (atrás da câmera ou abaixo do horizonte)
    const fwd = cam.getDirection(Vector3.Forward());
    const facing = Vector3.Dot(fwd, toSun);
    const visible = facing > 0.15 && toSun.y > -0.02 && !this.inDialogue;
    const pass = this.rays.getPass();
    pass.refreshRate = visible ? 1 : 1e9;
    // fora de vista os raios somem suavemente (sem estalo quando o passe volta)
    const target = visible ? 1 : 0;
    const k = this.raysFade + (target - this.raysFade) * 0.15;
    this.raysFade = Math.abs(k - target) < 0.01 ? target : k;
    const base = 0.16 * (1 - this.dusk) + 0.3 * this.dusk;
    this.rays.exposure = base * this.raysFade;
  }

  private raysFade = 0;
}

/**
 * Ocluidores dos raios: malhas grandes (raio da esfera envolvente ≥ 1,8 m), menos céu e chão. Instâncias entram
 * pela malha-fonte (é ela que desenha o lote — e pode estar com `isVisible = false`).
 */
function sunOccluders(meshes: AbstractMesh[]): AbstractMesh[] {
  const out = new Set<AbstractMesh>();
  for (const m of meshes) {
    if (!m.isEnabled() || m.infiniteDistance || m.getTotalVertices() === 0) continue;
    if (/^(ceu|sol_brilho|planeta|far_)|chao|asfalto|calcada|rua_|piso|terreno|sombra/i.test(m.name)) continue;
    if (m.getBoundingInfo().boundingSphere.radiusWorld < 1.8) continue;
    const src = (m as AbstractMesh & { sourceMesh?: AbstractMesh }).sourceMesh;
    if (src) out.add(src);
    else if (m.isVisible || (m as AbstractMesh & { instances?: unknown[] }).instances?.length) out.add(m);
  }
  return [...out];
}

/** Disco de brilho suave (gaussiana) para a fonte dos raios. */
function radialGlowTexture(scene: Scene): RawTexture {
  const n = 64;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (x + 0.5) / n - 0.5;
      const dy = (y + 0.5) / n - 0.5;
      const r = Math.sqrt(dx * dx + dy * dy) * 2;
      const core = Math.exp(-r * r * 60);
      const halo = Math.exp(-r * r * 7) * 0.35;
      const v = Math.max(0, Math.min(1, (core + halo) * (1 - smooth(0.85, 1.0, r))));
      const b = Math.round(v * 255);
      data.set([b, b, b, b], (y * n + x) * 4);
    }
  }
  const t = RawTexture.CreateRGBATexture(data, n, n, scene, false, false, Texture.BILINEAR_SAMPLINGMODE);
  t.name = "sol_brilho_tex";
  t.hasAlpha = true;
  t.wrapU = Texture.CLAMP_ADDRESSMODE;
  t.wrapV = Texture.CLAMP_ADDRESSMODE;
  return t;
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------------------------------------------------
// Gradação de cor (LUT 3D gerada por código)
// ---------------------------------------------------------------------------------------------------------

export interface GradingOptions {
  /** inclinação da curva em S no meio-tom (1 = neutro) */
  contrast: number;
  /** ponto de pivô da curva (espaço gama) */
  pivot: number;
  /** tom das sombras (somado, espaço gama) */
  shadowTint: [number, number, number];
  /** tom das altas luzes (somado, espaço gama) */
  highlightTint: [number, number, number];
  /** saturação nos meios-tons / nas sombras profundas / nas altas luzes */
  satMid: number;
  satShadow: number;
  satHighlight: number;
  /** preto mínimo (levanta um pouco o preto, com o tom das sombras) */
  blackLift: number;
}

/** Gradação do jogo: quente nas luzes, ciano nas sombras, contraste de cinema, saturação contida. */
export const GRADING: GradingOptions = {
  contrast: 1.2,
  pivot: 0.42,
  shadowTint: [-0.022, 0.006, 0.03],
  highlightTint: [0.028, 0.008, -0.03],
  satMid: 1.06,
  satShadow: 0.86,
  satHighlight: 0.92,
  blackLift: 0.012,
};

/** Aplica a gradação a uma cor em espaço gama (0..1). Pura: usada para gerar a LUT (e testável). */
export function gradeColor(r: number, g: number, b: number, o: GradingOptions = GRADING): [number, number, number] {
  const luma = (x: number, y: number, z: number) => 0.2126 * x + 0.7152 * y + 0.0722 * z;
  const L = luma(r, g, b);
  // curva em S com inclinação `contrast` no pivô, preservando 0 e 1
  const p = o.pivot;
  const k = o.contrast;
  const Lc = L <= p ? p * Math.pow(L / p, k) : 1 - (1 - p) * Math.pow((1 - L) / (1 - p), k);
  // aplica a nova luminância por soma (estável nas sombras) misturada com escala (preserva matiz nas luzes)
  const add = Lc - L;
  const scl = L > 1e-4 ? Lc / L : 1;
  const w = smooth(0.15, 0.6, L);
  let R = (r + add) * (1 - w) + r * scl * w;
  let G = (g + add) * (1 - w) + g * scl * w;
  let B = (b + add) * (1 - w) + b * scl * w;
  // saturação por faixa de luminância
  const L2 = luma(R, G, B);
  const sh = 1 - smooth(0.0, 0.35, L2);
  const hi = smooth(0.65, 1.0, L2);
  const sat = o.satMid * (1 - sh - hi) + o.satShadow * sh + o.satHighlight * hi;
  R = L2 + (R - L2) * sat;
  G = L2 + (G - L2) * sat;
  B = L2 + (B - L2) * sat;
  // tons divididos: ciano nas sombras, âmbar nas luzes (pesos que somem nos extremos para não tingir preto/branco puros)
  const ws = Math.pow(1 - smooth(0.0, 0.6, L2), 1.2) * smooth(0.0, 0.06, L2 + 0.02);
  const wh = smooth(0.45, 0.95, L2) * (1 - smooth(0.97, 1.0, L2));
  R += o.shadowTint[0] * ws + o.highlightTint[0] * wh;
  G += o.shadowTint[1] * ws + o.highlightTint[1] * wh;
  B += o.shadowTint[2] * ws + o.highlightTint[2] * wh;
  // preto levemente levantado e frio (filme), sem lavar
  const lift = o.blackLift;
  R = lift * 0.7 + R * (1 - lift * 0.7);
  G = lift * 0.9 + G * (1 - lift * 0.9);
  B = lift * 1.1 + B * (1 - lift * 1.1);
  const c = (v: number) => Math.max(0, Math.min(1, v));
  return [c(R), c(G), c(B)];
}

/** Gera os texels RGBA8 de uma LUT size³ (eixo x = vermelho, y = verde, z = azul). */
export function buildGradingLutData(size = 32, o: GradingOptions = GRADING): Uint8Array {
  const data = new Uint8Array(size * size * size * 4);
  for (let bi = 0; bi < size; bi++) {
    for (let gi = 0; gi < size; gi++) {
      for (let ri = 0; ri < size; ri++) {
        const [r, g, b] = gradeColor(ri / (size - 1), gi / (size - 1), bi / (size - 1), o);
        const i = (ri + gi * size + bi * size * size) * 4;
        data[i] = Math.round(r * 255);
        data[i + 1] = Math.round(g * 255);
        data[i + 2] = Math.round(b * 255);
        data[i + 3] = 255;
      }
    }
  }
  return data;
}

function createGradingLut(scene: Scene): RawTexture3D | null {
  try {
    const size = 32;
    const tex = new RawTexture3D(buildGradingLutData(size), size, size, size, Constants.TEXTUREFORMAT_RGBA, scene, false, false, Texture.BILINEAR_SAMPLINGMODE, Constants.TEXTURETYPE_UNSIGNED_BYTE);
    tex.name = "lut_gradacao";
    tex.wrapU = Texture.CLAMP_ADDRESSMODE;
    tex.wrapV = Texture.CLAMP_ADDRESSMODE;
    tex.wrapR = Texture.CLAMP_ADDRESSMODE;
    tex.level = 1;
    return tex;
  } catch (err) {
    console.warn("[postfx] LUT 3D indisponível", err);
    return null;
  }
}

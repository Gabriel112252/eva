/**
 * Camada distante ("far layer"): a Terra vista de cima quando a aeromoto sobe.
 *
 * O mundo jogável é plano e pequeno (centenas de metros). Para ver a curvatura do planeta a dezenas de
 * quilômetros de altitude sem perder precisão de ponto flutuante, a Terra é desenhada em outra escala
 * (1 unidade = 1 km) por uma segunda câmera que copia a orientação da câmera principal e tem a posição
 * dividida por 1000. O resultado vai para uma textura e é exibido como fundo (Layer) atrás da cidade.
 * Os ângulos são preservados pela semelhança de triângulos, então o horizonte e a curvatura aparecem
 * exatamente onde deveriam.
 *
 * Conteúdo da camada: domo do céu (o mesmo SkyMaterial, escurecendo com a altitude), estrelas,
 * esfera da Terra (textura pintada em projeção planar local), calota regional (~300 km, imagem de
 * satélite gerada) e calota da cidade (~6 km).
 */
import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import { Constants } from "@babylonjs/core/Engines/constants";
import { Layer } from "@babylonjs/core/Layers/layer";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { FresnelParameters } from "@babylonjs/core/Materials/fresnelParameters";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { QualityLevel } from "@/core/settings";
import { CANVAS_AVAILABLE } from "./textures";
import "@babylonjs/core/Layers/layerSceneComponent";

/** bit de camada visível só para a câmera distante (a principal usa 0x0FFFFFFF) */
export const FAR_LAYER_MASK = 0x10000000;
const MAIN_LAYER_MASK = 0x0fffffff;
/** raio médio da Terra (km) */
export const EARTH_RADIUS_KM = 6371;
/** altitude (m) a partir da qual a camada distante é ligada */
export const FAR_LAYER_ON = 140;

function texUrl(file: string): string {
  return `${import.meta.env.BASE_URL}assets/textures/aereo/${file}`;
}

/**
 * Calota esférica tangente ao plano y=0 na origem: malha em grade (x,z) ∈ [-S,S] km com
 * y = √(R² − x² − z²) − R + lift, UV planar (imagem de satélite).
 */
function createCap(name: string, halfSizeKm: number, liftKm: number, segments: number, scene: Scene): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const R = EARTH_RADIUS_KM;
  for (let j = 0; j <= segments; j++) {
    for (let i = 0; i <= segments; i++) {
      const x = (i / segments - 0.5) * 2 * halfSizeKm;
      const z = (j / segments - 0.5) * 2 * halfSizeKm;
      const y = Math.sqrt(Math.max(0, R * R - x * x - z * z)) - R + liftKm;
      positions.push(x, y, z);
      const n = new Vector3(x, y - liftKm + R, z).normalize();
      normals.push(n.x, n.y, n.z);
      uvs.push(0.5 + x / (2 * halfSizeKm), 0.5 - z / (2 * halfSizeKm));
    }
  }
  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * (segments + 1) + i;
      const b = a + 1;
      const c = a + segments + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const mesh = new Mesh(name, scene);
  const vd = new VertexData();
  vd.positions = positions;
  vd.normals = normals;
  vd.uvs = uvs;
  vd.indices = indices;
  vd.applyToMesh(mesh);
  return mesh;
}

/** Textura da Terra em projeção planar local (±3000 km): oceano a sudeste, interior a noroeste, ruído de relevo. */
function paintEarth(scene: Scene): DynamicTexture | null {
  if (!CANVAS_AVAILABLE) return null;
  const size = 1024;
  const tex = new DynamicTexture("far_terra_tex", { width: size, height: size }, scene, true);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  const kmPerPx = 6000 / size;
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const hash = (x: number, y: number) => {
    const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return s - Math.floor(s);
  };
  const noise = (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const a = hash(xi, yi);
    const b = hash(xi + 1, yi);
    const c = hash(xi, yi + 1);
    const e = hash(xi + 1, yi + 1);
    const u = fx * fx * (3 - 2 * fx);
    const v = fy * fy * (3 - 2 * fy);
    return a + (b - a) * u + (c - a) * v + (a - b - c + e) * u * v;
  };
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      // mundo: x para leste (direita), z para sul (baixo); a imagem regional tem o mar no canto inferior direito
      const x = (px - size / 2) * kmPerPx;
      const z = (py - size / 2) * kmPerPx;
      const n1 = noise(px * 0.02, py * 0.02);
      const n2 = noise(px * 0.08, py * 0.08) * 0.5;
      // linha da costa: x/84 + z/150 = 1 na escala regional, prolongada; ondulada por ruído
      const coast = x / 84 + z / 150 - 1 + (n1 - 0.5) * 2.2;
      const i = (py * size + px) * 4;
      if (coast > 0) {
        // mar: tom medido na borda da imagem regional (≈ 8, 51, 85), mais escuro ao largo
        const deep = Math.min(1, coast / 3);
        d[i] = 8 + (1 - deep) * 10 + n2 * 6;
        d[i + 1] = 51 - deep * 14 + n2 * 8;
        d[i + 2] = 85 - deep * 20 + n2 * 10;
      } else {
        // terra: média da borda da imagem regional (≈ 113, 120, 98) com mosaico suave de mata e lavoura
        const n3 = noise(px * 0.25, py * 0.25);
        const t = Math.max(-1, Math.min(1, (n1 * 0.55 + n2 * 0.7 + n3 * 0.25 - 0.55) * 2.2));
        const fine = (n3 - 0.5) * 16;
        const urban = Math.max(0, 1 - Math.hypot(x, z) / 90);
        d[i] = 113 + t * 34 + fine + urban * 50;
        d[i + 1] = 120 + t * 22 + fine + urban * 38;
        d[i + 2] = 98 + t * 10 + fine + urban * 44;
      }
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  tex.update(false);
  return tex;
}

/** Gradiente radial de opacidade para suavizar a borda da calota da cidade sobre a regional. */
function paintRadialAlpha(scene: Scene): DynamicTexture | null {
  if (!CANVAS_AVAILABLE) return null;
  const s = 256;
  const tex = new DynamicTexture("far_alpha_tex", { width: s, height: s }, scene, false);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(s / 2, s / 2, s * 0.2, s / 2, s / 2, s * 0.5);
  g.addColorStop(0, "#fff");
  g.addColorStop(0.8, "#fff");
  g.addColorStop(1, "#000");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  tex.update(false);
  return tex;
}

export class PlanetLayer {
  readonly farCamera: TargetCamera;
  readonly rtt: RenderTargetTexture;
  readonly layer: Layer;
  private readonly meshes: AbstractMesh[] = [];
  private readonly starsMat: StandardMaterial;
  private active = false;
  private readonly ratio: number;
  /** 0..1: quanto a névoa da camada já virou bruma azulada de altitude */
  private haze = 0;

  constructor(
    readonly scene: Scene,
    private readonly skyDome: Mesh,
    quality: QualityLevel,
  ) {
    this.ratio = quality === "alta" ? 0.75 : 0.5;
    const cam = new TargetCamera("far_cam", Vector3.Zero(), scene);
    cam.minZ = 0.05;
    cam.maxZ = 40000;
    cam.layerMask = FAR_LAYER_MASK;
    cam.rotationQuaternion = Quaternion.Identity();
    this.farCamera = cam;

    const engine = scene.getEngine();
    const size = { width: Math.max(64, Math.round(engine.getRenderWidth() * this.ratio)), height: Math.max(64, Math.round(engine.getRenderHeight() * this.ratio)) };
    const rtt = new RenderTargetTexture("far_rtt", size, scene, { generateMipMaps: false, generateDepthBuffer: true, samplingMode: Texture.BILINEAR_SAMPLINGMODE });
    rtt.activeCamera = cam;
    rtt.clearColor = new Color4(0, 0, 0, 1);
    rtt.renderList = [];
    // a névoa da cena está em 1/m; na camada (em km) multiplica por 1000 para coincidir na costura
    let savedFog = 0;
    const savedColor = new Color3();
    const hazeColor = new Color3(0.68, 0.76, 0.88);
    rtt.onBeforeRenderObservable.add(() => {
      savedFog = scene.fogDensity;
      savedColor.copyFrom(scene.fogColor);
      // perspectiva atmosférica: mesmo sem poeira, o chão a centenas de km some num azul leitoso
      scene.fogDensity = Math.max(savedFog * 1000, 0.0009);
      Color3.LerpToRef(savedColor, hazeColor, this.haze, scene.fogColor);
    });
    rtt.onAfterRenderObservable.add(() => {
      scene.fogDensity = savedFog;
      scene.fogColor.copyFrom(savedColor);
    });
    this.rtt = rtt;
    engine.onResizeObservable.add(() => {
      rtt.resize({ width: Math.max(64, Math.round(engine.getRenderWidth() * this.ratio)), height: Math.max(64, Math.round(engine.getRenderHeight() * this.ratio)) });
    });

    const layer = new Layer("far_layer", null, scene, true);
    layer.texture = rtt;
    layer.layerMask = MAIN_LAYER_MASK;
    layer.isEnabled = false;
    this.layer = layer;

    // --- estrelas (grupo 1: por cima do céu, sem teste de profundidade; a Terra no grupo 2 cobre) ------
    // nuvem de pontos (2 px) a 20 000 km, presa à câmera: nítida em qualquer resolução
    const stars = new Mesh("far_estrelas", scene);
    {
      const n = 2200;
      const positions = new Float32Array(n * 3);
      const colors = new Float32Array(n * 4);
      let seed = 11;
      const rnd = () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      };
      for (let i = 0; i < n; i++) {
        // distribuição uniforme na esfera
        const u = rnd() * 2 - 1;
        const phi = rnd() * Math.PI * 2;
        const r = Math.sqrt(1 - u * u);
        positions[i * 3] = r * Math.cos(phi) * 20000;
        positions[i * 3 + 1] = u * 20000;
        positions[i * 3 + 2] = r * Math.sin(phi) * 20000;
        const b = 0.45 + rnd() * 0.55;
        const warm = rnd() < 0.25;
        colors[i * 4] = b * (warm ? 1 : 0.9);
        colors[i * 4 + 1] = b * 0.92;
        colors[i * 4 + 2] = b * (warm ? 0.8 : 1);
        colors[i * 4 + 3] = 1;
      }
      const vd = new VertexData();
      vd.positions = positions;
      vd.colors = colors;
      vd.indices = Array.from({ length: n }, (_, i) => i);
      vd.applyToMesh(stars);
    }
    stars.infiniteDistance = true;
    const starsMat = new StandardMaterial("far_estrelas_mat", scene);
    starsMat.disableLighting = true;
    starsMat.pointsCloud = true;
    starsMat.pointSize = 2;
    // sem luzes, a cor final = emissiveColor × cor do vértice: emissivo branco deixa a cor de cada estrela
    starsMat.emissiveColor = Color3.White();
    starsMat.diffuseColor = Color3.Black();
    starsMat.specularColor = Color3.Black();
    starsMat.alpha = 0;
    starsMat.depthFunction = Constants.ALWAYS;
    starsMat.disableDepthWrite = true;
    starsMat.fogEnabled = false;
    stars.material = starsMat;
    stars.renderingGroupId = 1;
    this.starsMat = starsMat;
    this.addFar(stars);

    // --- Terra -------------------------------------------------------------------------------------
    const R = EARTH_RADIUS_KM;
    const earth = MeshBuilder.CreateSphere("far_terra", { diameter: 2 * (R - 0.6), segments: 384 }, scene);
    earth.position.set(0, -R, 0);
    // UV planar a partir das posições (±3000 km em torno do ponto de tangência)
    const pos = earth.getVerticesData(VertexBuffer.PositionKind)!;
    const uv = new Float32Array((pos.length / 3) * 2);
    for (let i = 0; i < pos.length / 3; i++) {
      uv[i * 2] = 0.5 + pos[i * 3]! / 6000;
      uv[i * 2 + 1] = 0.5 - pos[i * 3 + 2]! / 6000;
    }
    earth.setVerticesData(VertexBuffer.UVKind, uv);
    const earthMat = new StandardMaterial("far_terra_mat", scene);
    const earthTex = paintEarth(scene);
    if (earthTex) {
      earthTex.wrapU = Texture.CLAMP_ADDRESSMODE;
      earthTex.wrapV = Texture.CLAMP_ADDRESSMODE;
      earthMat.diffuseTexture = earthTex;
    } else earthMat.diffuseColor = new Color3(0.3, 0.36, 0.28);
    earthMat.specularColor = new Color3(0.08, 0.08, 0.1);
    earthMat.fogEnabled = true;
    earth.material = earthMat;
    earth.renderingGroupId = 2;
    this.addFar(earth);

    // --- calota regional (~300 km) e calota da cidade (~6 km) ------------------------------------
    const region = createCap("far_regiao", 150, 0, 48, scene);
    const regionMat = new StandardMaterial("far_regiao_mat", scene);
    const regionTex = new Texture(texUrl("regiao.jpg"), scene, false, true, Texture.TRILINEAR_SAMPLINGMODE);
    regionTex.wrapU = Texture.CLAMP_ADDRESSMODE;
    regionTex.wrapV = Texture.CLAMP_ADDRESSMODE;
    regionMat.diffuseTexture = regionTex;
    const regionAlpha = paintRadialAlpha(scene);
    if (regionAlpha) {
      regionMat.opacityTexture = regionAlpha;
      regionAlpha.getAlphaFromRGB = true;
    }
    regionMat.specularColor = new Color3(0.05, 0.05, 0.06);
    regionMat.backFaceCulling = false;
    regionMat.zOffset = -1;
    regionMat.zOffsetUnits = -4;
    region.material = regionMat;
    region.renderingGroupId = 2;
    region.alphaIndex = 1;
    this.addFar(region);

    const city = createCap("far_cidade", 3, 0.02, 16, scene);
    const cityMat = new StandardMaterial("far_cidade_mat", scene);
    const cityTex = new Texture(texUrl("cidade.jpg"), scene, false, true, Texture.TRILINEAR_SAMPLINGMODE);
    cityTex.wrapU = Texture.CLAMP_ADDRESSMODE;
    cityTex.wrapV = Texture.CLAMP_ADDRESSMODE;
    cityMat.diffuseTexture = cityTex;
    const alphaTex = paintRadialAlpha(scene);
    if (alphaTex) {
      cityMat.opacityTexture = alphaTex;
      alphaTex.getAlphaFromRGB = true;
    }
    cityMat.specularColor = new Color3(0.05, 0.05, 0.06);
    cityMat.backFaceCulling = false;
    cityMat.zOffset = -2;
    cityMat.zOffsetUnits = -12;
    city.material = cityMat;
    city.renderingGroupId = 2;
    city.alphaIndex = 2; // desenhada depois da calota regional (ambas translúcidas nas bordas)
    this.addFar(city);

    // --- limbo atmosférico: visto de fora (acima de ~70 km) como um aro azul na borda do planeta ---------
    const atmo = MeshBuilder.CreateSphere("far_atmosfera", { diameter: 2 * (R + 70), segments: 192 }, scene);
    atmo.position.set(0, -R, 0);
    const atmoMat = new StandardMaterial("far_atmosfera_mat", scene);
    atmoMat.disableLighting = true;
    atmoMat.emissiveColor = new Color3(0.42, 0.62, 1.0);
    atmoMat.diffuseColor = Color3.Black();
    atmoMat.specularColor = Color3.Black();
    // alpha final = alpha + fresnel(left→right): com alpha 0 o aro só aparece nos ângulos rasantes (limbo)
    atmoMat.alpha = 0;
    atmoMat.fogEnabled = false;
    atmoMat.backFaceCulling = true; // por dentro (abaixo de 70 km) não aparece
    atmoMat.opacityFresnelParameters = new FresnelParameters({ bias: 0, power: 1.8, leftColor: Color3.Black(), rightColor: Color3.White() });
    atmo.material = atmoMat;
    atmo.renderingGroupId = 2;
    atmo.alphaIndex = 3;
    this.addFar(atmo);

    scene.setRenderingAutoClearDepthStencil(1, false);
    scene.setRenderingAutoClearDepthStencil(2, true);
  }

  private addFar(mesh: AbstractMesh): void {
    mesh.layerMask = FAR_LAYER_MASK;
    mesh.isPickable = false;
    mesh.receiveShadows = false;
    mesh.applyFog = true;
    this.meshes.push(mesh);
    this.rtt.renderList!.push(mesh);
  }

  get isActive(): boolean {
    return this.active;
  }

  /**
   * Atualiza por quadro. `altitude` em metros (câmera). `spaceFactor` 0..1 controla a opacidade das estrelas;
   * `hazeBlend` 0..1 troca a cor da névoa pela bruma azulada de altitude.
   */
  update(mainCamera: Camera, altitude: number, spaceFactor: number, hazeBlend = 0): void {
    this.haze = Math.max(0, Math.min(1, hazeBlend));
    const shouldBeActive = altitude > FAR_LAYER_ON;
    if (shouldBeActive !== this.active) {
      this.active = shouldBeActive;
      const list = this.scene.customRenderTargets;
      const idx = list.indexOf(this.rtt);
      if (shouldBeActive) {
        if (idx < 0) list.push(this.rtt);
        if (!this.rtt.renderList!.includes(this.skyDome)) this.rtt.renderList!.unshift(this.skyDome);
        this.skyDome.layerMask = FAR_LAYER_MASK;
      } else {
        if (idx >= 0) list.splice(idx, 1);
        this.skyDome.layerMask = MAIN_LAYER_MASK;
      }
      this.layer.isEnabled = shouldBeActive;
    }
    if (!this.active) return;
    const cam = this.farCamera;
    const p = mainCamera.globalPosition;
    cam.position.set(p.x / 1000, p.y / 1000, p.z / 1000);
    const world = mainCamera.getWorldMatrix();
    Quaternion.FromRotationMatrixToRef(world.getRotationMatrix(), cam.rotationQuaternion!);
    cam.fov = mainCamera.fov;
    cam.fovMode = mainCamera.fovMode;
    this.starsMat.alpha = Math.max(0, Math.min(1, spaceFactor));
  }

  dispose(): void {
    const idx = this.scene.customRenderTargets.indexOf(this.rtt);
    if (idx >= 0) this.scene.customRenderTargets.splice(idx, 1);
    this.layer.dispose();
    this.rtt.dispose();
    for (const m of this.meshes) m.dispose(false, true);
    this.farCamera.dispose();
  }
}

import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Scene } from "@babylonjs/core/scene";
import { CANVAS_AVAILABLE, detailTextures, foliageAlpha, heightField, normalMap, plasterBrickAlbedo, surfaceAlbedo, wetnessTextures, type HeightField } from "./textures";

/** Biblioteca de materiais PBR do quarteirão (texturas procedurais provisórias). */
export class MaterialLibrary {
  readonly asphalt: PBRMaterial;
  readonly sidewalk: PBRMaterial;
  readonly concrete: PBRMaterial;
  readonly plaster: PBRMaterial[];
  readonly burnt: PBRMaterial;
  readonly soil: PBRMaterial;
  readonly metalRust: PBRMaterial;
  readonly metalDark: PBRMaterial;
  readonly metalPainted: PBRMaterial;
  readonly wood: PBRMaterial;
  readonly woodDark: PBRMaterial;
  readonly glass: PBRMaterial;
  readonly glassLit: PBRMaterial;
  readonly tarpBlue: PBRMaterial;
  readonly tarpOrange: PBRMaterial;
  readonly tarpOlive: PBRMaterial;
  readonly plasticBlue: PBRMaterial;
  readonly rubber: PBRMaterial;
  readonly bark: PBRMaterial;
  readonly leaves: PBRMaterial;
  readonly grass: PBRMaterial;
  readonly vines: PBRMaterial;
  readonly paperWhite: PBRMaterial;
  readonly rope: PBRMaterial;
  readonly puddle: PBRMaterial;
  readonly lampGlow: PBRMaterial;
  readonly emissiveRed: PBRMaterial;
  readonly emissiveGreen: PBRMaterial;
  /** Materiais PBR de texturas fotográficas CC0 (ambientCG) — ver public/assets/textures e ASSETS.md. */
  readonly pavingStones: PBRMaterial;
  readonly plasterPhoto: { gray: PBRMaterial; warm: PBRMaterial; sand: PBRMaterial };
  readonly concretePhoto: PBRMaterial;
  /** telha metálica ondulada (CorrugatedSteel005, CC0) — galpões, marquises, telhados do Setor 17 */
  readonly corrugated: PBRMaterial;
  /** piso pintado de quadra esportiva (verde desbotado) */
  readonly courtGreen: PBRMaterial;

  private readonly all: PBRMaterial[] = [];

  constructor(private readonly scene: Scene, quality: "baixa" | "media" | "alta") {
    const texSize = quality === "baixa" ? 256 : 512;

    // --- asfalto rachado -----------------------------------------------
    const asphaltHf = heightField(texSize, 6, 5, 11, 0.55);
    this.asphalt = this.pbr("asfalto", {
      tileSize: 5,
      albedo: surfaceAlbedo(scene, "tex_asfalto", texSize, asphaltHf, { base: "#3b3a38", dark: "#262523", light: "#55524d", grime: 0.33, cracks: 1.2, seed: 11 }, { u: 1, v: 1 }),
      bump: normalMap(scene, "nrm_asfalto", asphaltHf, 2.2, { u: 1, v: 1 }),
      roughness: 0.92,
    });

    // --- calçada de concreto -------------------------------------------
    const sidewalkHf = heightField(texSize, 8, 4, 21, 0.5);
    this.sidewalk = this.pbr("calcada", {
      tileSize: 3,
      albedo: surfaceAlbedo(scene, "tex_calcada", texSize, sidewalkHf, { base: "#8d8a82", dark: "#6a665f", light: "#a9a69c", grime: 0.3, cracks: 0.8, seed: 21 }, { u: 1, v: 1 }),
      bump: normalMap(scene, "nrm_calcada", sidewalkHf, 1.6, { u: 1, v: 1 }),
      roughness: 0.88,
    });

    // --- concreto bruto ------------------------------------------------
    const concreteHf = heightField(texSize, 5, 4, 31, 0.5);
    this.concrete = this.pbr("concreto", {
      tileSize: 2.5,
      albedo: surfaceAlbedo(scene, "tex_concreto", texSize, concreteHf, { base: "#7d7a74", dark: "#5c5955", light: "#97948d", grime: 0.4, seed: 31 }, { u: 1, v: 1 }),
      bump: normalMap(scene, "nrm_concreto", concreteHf, 1.4, { u: 1, v: 1 }),
      roughness: 0.9,
    });

    // --- reboco com tijolo exposto (variações de cor típicas de SP) -----
    const plasterSpecs: Array<[string, string, string, number]> = [
      ["#c9b89a", "#9a4f3a", "#8d867c", 41], // ocre
      ["#8aa3a8", "#a0563f", "#8d867c", 43], // azul desbotado
      ["#b8b0a6", "#9b4a36", "#8f887e", 47], // cinza claro
      ["#c5867a", "#a35541", "#8d867c", 53], // rosa queimado
      ["#9f9a6e", "#9a4f3a", "#8d867c", 59], // verde oliva
    ];
    this.plaster = plasterSpecs.map(([plaster, brick, mortar, seed], i) => {
      const { albedo, height } = plasterBrickAlbedo(scene, `tex_reboco_${i}`, texSize, plaster, brick, mortar, seed, { u: 1, v: 1 });
      return this.pbr(`reboco_${i}`, { tileSize: 3.2, albedo, bump: normalMap(scene, `nrm_reboco_${i}`, height, 2.0, { u: 1, v: 1 }), roughness: 0.9 });
    });

    // --- fachada queimada ----------------------------------------------
    const burntHf = heightField(texSize, 5, 5, 61, 0.6);
    this.burnt = this.pbr("queimado", {
      tileSize: 2.5,
      albedo: surfaceAlbedo(scene, "tex_queimado", texSize, burntHf, { base: "#2e2a27", dark: "#151312", light: "#4d443d", grime: 0.5, seed: 61 }, { u: 1, v: 1 }),
      bump: normalMap(scene, "nrm_queimado", burntHf, 2.4, { u: 1, v: 1 }),
      roughness: 0.95,
    });

    // --- solo / terra --------------------------------------------------
    const soilHf = heightField(texSize, 7, 4, 71, 0.55);
    this.soil = this.pbr("terra", {
      tileSize: 3,
      albedo: surfaceAlbedo(scene, "tex_terra", texSize, soilHf, { base: "#6b5236", dark: "#4a3524", light: "#8c6d4a", grime: 0.2, seed: 71 }, { u: 1, v: 1 }),
      bump: normalMap(scene, "nrm_terra", soilHf, 2.0, { u: 1, v: 1 }),
      roughness: 0.95,
    });

    // --- metais --------------------------------------------------------
    const rustHf = heightField(texSize, 6, 4, 81, 0.6);
    this.metalRust = this.pbr("metal_enferrujado", {
      tileSize: 1.5,
      albedo: surfaceAlbedo(scene, "tex_ferrugem", texSize, rustHf, { base: "#6e4a32", dark: "#3d2a1d", light: "#9c7a55", grime: 0.35, seed: 81 }, { u: 1, v: 1 }),
      bump: normalMap(scene, "nrm_ferrugem", rustHf, 1.8, { u: 1, v: 1 }),
      roughness: 0.8,
      metallic: 0.35,
    });
    this.metalDark = this.pbr("metal_escuro", { color: "#2b2d30", roughness: 0.55, metallic: 0.8 });
    const paintHf = heightField(texSize, 4, 3, 91, 0.5);
    this.metalPainted = this.pbr("metal_pintado", {
      tileSize: 1.5,
      albedo: surfaceAlbedo(scene, "tex_metal_pintado", texSize, paintHf, { base: "#4a6b5c", dark: "#2f4a3e", light: "#6a8b7a", grime: 0.3, seed: 91 }, { u: 1, v: 1 }),
      bump: normalMap(scene, "nrm_metal_pintado", paintHf, 0.8, { u: 1, v: 1 }),
      roughness: 0.6,
      metallic: 0.5,
    });

    // --- madeira -------------------------------------------------------
    const woodHf = heightField(texSize, 2, 5, 101, 0.65);
    this.wood = this.pbr("madeira", {
      tileSize: 1.2,
      albedo: surfaceAlbedo(scene, "tex_madeira", texSize, woodHf, { base: "#8b6a44", dark: "#5e4428", light: "#a88a5e", grime: 0.2, seed: 101 }, { u: 1, v: 1 }),
      bump: normalMap(scene, "nrm_madeira", woodHf, 1.2, { u: 1, v: 1 }),
      roughness: 0.85,
    });
    this.woodDark = this.pbr("madeira_escura", { color: "#4a3522", roughness: 0.9 });

    // --- vidro ---------------------------------------------------------
    this.glass = this.pbr("vidro", { color: "#1b2229", roughness: 0.15, metallic: 0.3 });
    this.glassLit = this.pbr("vidro_aceso", { color: "#3a2d16", roughness: 0.3, emissive: "#ffb65c", emissiveIntensity: 1.6 });

    // --- lonas e plásticos ---------------------------------------------
    const tarpHf = heightField(texSize, 8, 3, 111, 0.45);
    const tarp = (name: string, base: string, dark: string, light: string, seed: number) =>
      this.pbr(name, {
        tileSize: 1.5,
        albedo: surfaceAlbedo(scene, `tex_${name}`, texSize, tarpHf, { base, dark, light, grime: 0.25, seed }, { u: 1, v: 1 }),
        roughness: 0.75,
        twoSided: true,
      });
    this.tarpBlue = tarp("lona_azul", "#2c5aa0", "#1f3f73", "#4d7cc4", 112);
    this.tarpOrange = tarp("lona_laranja", "#c76b2c", "#8f4a1b", "#e08a4a", 113);
    this.tarpOlive = tarp("lona_oliva", "#6d7445", "#4b5030", "#8b9260", 114);
    this.plasticBlue = this.pbr("plastico_azul", { color: "#1d4f9c", roughness: 0.45 });
    this.rubber = this.pbr("borracha", { color: "#1a1a1a", roughness: 0.95 });

    // --- vegetação -----------------------------------------------------
    const barkHf = heightField(texSize, 3, 5, 121, 0.6);
    this.bark = this.pbr("casca", {
      tileSize: 1.2,
      albedo: surfaceAlbedo(scene, "tex_casca", texSize, barkHf, { base: "#5b4a3a", dark: "#3b2e24", light: "#7a6652", seed: 121 }, { u: 1, v: 1 }),
      bump: normalMap(scene, "nrm_casca", barkHf, 2.5, { u: 1, v: 1 }),
      roughness: 0.95,
    });
    this.leaves = this.alphaFoliage("folhas", foliageAlpha(scene, "tex_folhas", 256, "#3f6b2a", "#8da33f", 131, "leaves"));
    this.grass = this.alphaFoliage("mato", foliageAlpha(scene, "tex_mato", 256, "#5c7a2e", "#a3a84a", 141, "grass"));
    this.vines = this.alphaFoliage("trepadeira", foliageAlpha(scene, "tex_trepadeira", 256, "#2f5a26", "#6b8a37", 151, "leaves"));

    // --- diversos ------------------------------------------------------
    this.paperWhite = this.pbr("papel", { color: "#d8d2c2", roughness: 0.95 });
    this.rope = this.pbr("corda", { color: "#8a7a5a", roughness: 0.95 });
    this.puddle = this.pbr("poca", { color: "#2a2e30", roughness: 0.08, metallic: 0.1 });
    this.lampGlow = this.pbr("lampada", { color: "#ffe8b0", roughness: 0.3, emissive: "#ffd28a", emissiveIntensity: 3.0 });
    this.emissiveRed = this.pbr("led_vermelho", { color: "#ff3b30", roughness: 0.4, emissive: "#ff2a1a", emissiveIntensity: 2.5 });
    this.emissiveGreen = this.pbr("led_verde", { color: "#5bff6a", roughness: 0.4, emissive: "#38ff4a", emissiveIntensity: 2.0 });

    // --- texturas fotográficas CC0 (ambientCG) ----------------------------
    this.pavingStones = this.photoPbr("pedra_praca", "PavingStones070", { tileSize: 2.6, tint: "#e2ddd2", roughness: 1.0, ao: true });
    this.plasterPhoto = {
      gray: this.photoPbr("reboco_foto_cinza", "PaintedPlaster017", { tileSize: 1.6, tint: "#b9b7b2" }),
      warm: this.photoPbr("reboco_foto_quente", "PaintedPlaster017", { tileSize: 1.6, tint: "#d9c9ad" }),
      sand: this.photoPbr("reboco_foto_areia", "PaintedPlaster017", { tileSize: 1.6, tint: "#d6c6a2" }),
    };
    this.concretePhoto = this.photoPbr("concreto_foto", "Concrete034", { tileSize: 2.0, tint: "#d8d6d0" });
    this.corrugated = this.photoPbr("telha_metalica", "CorrugatedSteel005", { tileSize: 1.8, tint: "#b5b8b6", roughness: 0.85, ao: true });
    this.corrugated.metallic = 0.35;
    this.courtGreen = this.pbr("piso_quadra", { color: "#3f6b4b", roughness: 0.92 });

    // --- acabamento (média/alta): microdetalhe de perto, umidade no asfalto, F0 de poças e vidro --------
    if (quality !== "baixa") this.addSurfaceFinish(quality === "alta");
  }

  /**
   * Microdetalhe (mapa de detalhe do Babylon, ~0,6 m por repetição) nas superfícies grandes do blockout e da
   * praça; asfalto com manchas de umidade e poças (rugosidade em escala de ~24 m); na alta, poças e vidros com F0 um
   * pouco maior — só eles passam do limiar do SSR (postfx.ts).
   */
  private addSurfaceFinish(ssr: boolean): void {
    const scene = this.scene;
    const detail = detailTextures(scene, 256, 917);
    if (detail) {
      const add = (m: PBRMaterial, o: { albedo: number; rough: number; bump: number } = { albedo: 0.14, rough: 0.25, bump: 0.32 }) => {
        // ~0,6 m por repetição do detalhe (a UV-base repete a cada `tileSize` metros)
        m.detailMap.texture = detail(((m.metadata as { tileSize?: number } | null)?.tileSize || 2) / 0.6);
        m.detailMap.isEnabled = true;
        m.detailMap.diffuseBlendLevel = o.albedo;
        m.detailMap.roughnessBlendLevel = o.rough;
        m.detailMap.bumpLevel = o.bump;
      };
      for (const m of [this.asphalt, this.sidewalk, this.concrete, this.burnt, this.soil, ...this.plaster]) add(m);
      for (const m of [this.pavingStones, this.concretePhoto, this.plasterPhoto.gray, this.plasterPhoto.warm, this.plasterPhoto.sand]) add(m, { albedo: 0.1, rough: 0.2, bump: 0.25 });
    }
    const wet = wetnessTextures(scene, "umidade_asfalto", 256, 4242);
    if (wet) {
      const reps = 5 / 24; // asfalto: 5 m por repetição da textura-base → umidade a cada 24 m
      for (const t of [wet.roughness, wet.reflectance]) {
        t.uScale = reps;
        t.vScale = reps;
      }
      const a = this.asphalt;
      a.metallicTexture = wet.roughness;
      a.useRoughnessFromMetallicTextureAlpha = false;
      a.useRoughnessFromMetallicTextureGreen = true;
      a.useMetallnessFromMetallicTextureBlue = true;
      a.metallic = 1;
      a.roughness = 1;
      if (ssr) {
        // F0 dielétrico = 0,04 × 1,5 × textura: seco 0,67 → 0,04 (como antes), poça 1,0 → 0,06 (passa do limiar do SSR)
        a.metallicReflectanceTexture = wet.reflectance;
        a.metallicReflectanceColor = new Color3(1.5, 1.5, 1.5);
      } else {
        wet.reflectance.dispose();
      }
    }
    // alta: vidro com F0 ~0,065 (antes ~0,03) — passa do limiar do SSR e reflete a rua. As poças-malha (água da
    // fonte etc.) ficam como estavam: com F0 maior viravam um disco branco refletindo o céu.
    if (ssr) this.glass.metallicReflectanceColor = new Color3(2.2, 2.2, 2.2);
  }

  /**
   * Material PBR a partir de um conjunto Color/NormalGL/Roughness(/AmbientOcclusion) em
   * public/assets/textures/<id>/ (CC0). Em testes headless (sem DOM) fica só a cor.
   */
  private photoPbr(name: string, id: string, o: { tileSize: number; tint: string; roughness?: number; ao?: boolean }): PBRMaterial {
    const m = this.pbr(name, { color: o.tint, roughness: o.roughness ?? 1.0, tileSize: o.tileSize });
    if (!CANVAS_AVAILABLE) return m;
    const base = `${import.meta.env.BASE_URL}assets/textures/${id}/`;
    const tex = (file: string, srgb: boolean) => {
      const t = new Texture(base + file, this.scene, false, true, Texture.TRILINEAR_SAMPLINGMODE);
      t.gammaSpace = srgb;
      t.wrapU = Texture.WRAP_ADDRESSMODE;
      t.wrapV = Texture.WRAP_ADDRESSMODE;
      t.anisotropicFilteringLevel = 8;
      return t;
    };
    m.albedoTexture = tex("Color.jpg", true);
    m.albedoColor = Color3.FromHexString(o.tint).toLinearSpace();
    m.bumpTexture = tex("NormalGL.jpg", false);
    // mapa OpenGL (Y para cima) numa cena canhota: mesma convenção que o loader glTF do Babylon
    m.invertNormalMapX = true;
    m.invertNormalMapY = false;
    m.metallicTexture = tex("Roughness.jpg", false);
    m.useRoughnessFromMetallicTextureAlpha = false;
    m.useRoughnessFromMetallicTextureGreen = true;
    m.useMetallnessFromMetallicTextureBlue = false;
    m.metallic = 0;
    m.roughness = o.roughness ?? 1.0;
    if (o.ao) {
      m.ambientTexture = tex("AmbientOcclusion.jpg", false);
      m.ambientTextureStrength = 1.0;
    }
    return m;
  }

  private pbr(
    name: string,
    o: {
      albedo?: Texture | null;
      bump?: Texture | null;
      /** cor base (usada também como fallback quando não há textura, ex.: testes headless) */
      color?: string;
      roughness?: number;
      metallic?: number;
      emissive?: string;
      emissiveIntensity?: number;
      twoSided?: boolean;
      /** metros por repetição da textura (densidade uniforme no mundo) */
      tileSize?: number;
    },
  ): PBRMaterial {
    const m = new PBRMaterial(`mat_${name}`, this.scene);
    m.metadata = { tileSize: o.tileSize ?? 0 };
    if (o.albedo) m.albedoTexture = o.albedo;
    if (o.color) m.albedoColor = Color3.FromHexString(o.color).toLinearSpace();
    else if (!o.albedo) m.albedoColor = Color3.FromHexString("#8a8378").toLinearSpace();
    if (o.bump) m.bumpTexture = o.bump;
    m.roughness = o.roughness ?? 0.9;
    m.metallic = o.metallic ?? 0;
    if (o.emissive) {
      m.emissiveColor = Color3.FromHexString(o.emissive).toLinearSpace();
      m.emissiveIntensity = o.emissiveIntensity ?? 1;
    }
    if (o.twoSided) {
      m.backFaceCulling = false;
      m.twoSidedLighting = true;
    }
    m.environmentIntensity = 0.9;
    this.all.push(m);
    return m;
  }

  private alphaFoliage(name: string, tex: Texture | null): PBRMaterial {
    const m = this.pbr(name, { albedo: tex, color: tex ? undefined : "#4f7a32", roughness: 0.85, twoSided: true });
    if (tex) {
      m.useAlphaFromAlbedoTexture = true;
      m.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATEST;
      m.alphaCutOff = 0.45;
    }
    return m;
  }

  /** Congela os materiais estáticos (menos trabalho por frame). */
  freezeAll(): void {
    for (const m of this.all) m.freeze();
  }
}

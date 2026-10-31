import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Material } from "@babylonjs/core/Materials/material";
import type { MaterialDefines } from "@babylonjs/core/Materials/materialDefines";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { QualityLevel } from "@/core/settings";

/**
 * Acabamento dos personagens (só material/sombreamento — modelos, rig e animações intocados):
 * - **luz de recorte (rim)** por Fresnel: um contorno quente no lado oposto à câmera, mais forte no lado do sol,
 *   que separa a silhueta do fundo (leitura cinematográfica de personagem, como nos jogos de referência);
 * - **pele** com translucidez leve (PBR `subSurface`): a luz que passa por orelhas/nariz/bordas ganha um tom
 *   avermelhado em vez do cinza de um material opaco.
 * Qualidade baixa fica como antes (custo zero).
 */

/** Estado global da luz de recorte (atualizado pelo ambiente conforme a hora do dia). */
export const RIM_LIGHT = {
  color: new Color3(1.0, 0.86, 0.68),
  /** intensidade em unidades lineares de HDR */
  intensity: 0.32,
  /** direção PARA o sol (o recorte fica mais forte nas bordas viradas para ele) */
  toSun: new Vector3(-0.52, 0.68, 0.52).normalize(),
  /** expoente do Fresnel (maior = contorno mais fino) */
  power: 3.2,
};

let shadingQuality: QualityLevel = "media";

/** Qualidade do acabamento (definida pelo ambiente antes de os personagens carregarem). */
export function setCharacterShadingQuality(q: QualityLevel): void {
  shadingQuality = q;
}

/** Ajusta cor/intensidade/direção do recorte (tarde → anoitecer). */
export function setRimLight(color: Color3, intensity: number, toSun: Vector3): void {
  RIM_LIGHT.color.copyFrom(color);
  RIM_LIGHT.intensity = intensity;
  RIM_LIGHT.toSun.copyFrom(toSun).normalize();
}

/** Plugin de material PBR: soma ao emissivo um contorno de Fresnel iluminado pelo lado do sol. */
export class RimLightPlugin extends MaterialPluginBase {
  /** fator por material (cabelo e pele recebem menos: o topo da cabeça virava um brilho grisalho) */
  constructor(
    material: Material,
    private readonly strength = 1,
  ) {
    super(material, "EvaRimLight", 210, { EVA_RIM: false });
    this._enable(true);
  }

  override prepareDefines(defines: MaterialDefines): void {
    defines["EVA_RIM"] = true;
  }

  override getClassName(): string {
    return "EvaRimLightPlugin";
  }

  override getUniforms() {
    return {
      ubo: [
        { name: "evaRimColor", size: 4, type: "vec4" },
        { name: "evaRimDir", size: 4, type: "vec4" },
      ],
      fragment: `#ifdef EVA_RIM
uniform vec4 evaRimColor;
uniform vec4 evaRimDir;
#endif`,
    };
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer): void {
    const c = RIM_LIGHT.color;
    const d = RIM_LIGHT.toSun;
    uniformBuffer.updateFloat4("evaRimColor", c.r, c.g, c.b, RIM_LIGHT.intensity * this.strength);
    uniformBuffer.updateFloat4("evaRimDir", d.x, d.y, d.z, RIM_LIGHT.power);
  }

  override getCustomCode(shaderType: string) {
    if (shaderType !== "fragment") return null;
    return {
      CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION: `
#ifdef EVA_RIM
{
  float evaNdV = clamp(dot(normalW, viewDirectionW), 0.0, 1.0);
  float evaFres = pow(1.0 - evaNdV, evaRimDir.w);
  // mais forte nas bordas viradas para o sol e para o céu; nunca some de todo (contorno do céu)
  float evaSide = clamp(dot(normalW, evaRimDir.xyz) * 0.6 + 0.4, 0.0, 1.0);
  float evaUp = clamp(normalW.y * 0.5 + 0.5, 0.0, 1.0);
  finalEmissive += evaRimColor.rgb * evaRimColor.a * evaFres * mix(0.25, 1.0, evaSide) * mix(0.6, 1.0, evaUp);
}
#endif
`,
    };
  }
}

/** Aplica recorte (todos os materiais) e translucidez de pele (materiais `*skin*`/`pele`) a um personagem. */
export function applyCharacterShading(meshes: AbstractMesh[]): void {
  if (shadingQuality === "baixa") return;
  const seen = new Set<Material>();
  for (const mesh of meshes) {
    const mat = mesh.material;
    if (!(mat instanceof PBRMaterial) || seen.has(mat)) continue;
    seen.add(mat);
    if (/lens|lente|eyes|olho/i.test(mat.name) || mat.pluginManager?.getPlugin("EvaRimLight")) continue;
    const skin = /skin|pele/i.test(mat.name);
    new RimLightPlugin(mat, /hair|cabelo/i.test(mat.name) ? 0.45 : skin ? 0.75 : 1);
    if (skin) {
      const ss = mat.subSurface;
      ss.isTranslucencyEnabled = true;
      ss.translucencyIntensity = shadingQuality === "alta" ? 0.3 : 0.24;
      ss.tintColor = new Color3(1.0, 0.64, 0.54);
      ss.tintColorAtDistance = 0.6;
      ss.minimumThickness = 0;
      ss.maximumThickness = 0.9;
      ss.useAlbedoToTintTranslucency = false;
    }
  }
}

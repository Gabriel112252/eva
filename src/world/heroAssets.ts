import { ImportMeshAsync } from "@babylonjs/core/Loading/sceneLoader";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { WorldContext } from "./context";
import { STREET } from "./street";
import { sector17KitPending } from "./sector17Kit";

/**
 * Módulos de cenário modelados em Blender (tools/blender/make_environment.py) com texturas PBR CC0:
 * fachada da Central de Suprimentos, posto de distribuição, banca, props. Cada nó raiz do GLB é um
 * asset na própria origem, frente para +Z; malhas "COL_*" viram colisores estáticos invisíveis.
 */
export interface HeroPlacement {
  asset: string;
  position: Vector3;
  yaw: number;
  /** nome único quando o mesmo asset é colocado mais de uma vez */
  id?: string;
  /** escala uniforme (árvores) */
  scale?: number;
  /** massa em kg: o módulo vira corpo dinâmico empurrável (caixa COL_ do próprio GLB) */
  dynamic?: number;
}

export function heroAssetsUrl(): string {
  const ext = (import.meta.env.VITE_CHARACTER_EXT as string | undefined) ?? ".glb";
  return `${import.meta.env.BASE_URL}assets/environments/praca_hero${ext}`;
}

/** Posições do "hero corner" da praça (coerentes com plaza.ts: posto em (cx+4, 11.5), Central em z=18). */
export function heroPlacements(): HeroPlacement[] {
  const P = STREET.plaza;
  const y = STREET.curbHeight;
  const cx = (P.x0 + P.x1) / 2;
  const postX = cx + 4;
  const postZ = 11.5;
  const east = P.x1; // parede oeste do prédio p_leste (olha para -X, para dentro da praça)
  const list: HeroPlacement[] = [
    // fachada da Central: 16 m centrados em x=38, frente em z=18 olhando para -Z (praça ao sul)
    { asset: "fachada_central", position: new Vector3(38, y, P.z1), yaw: Math.PI },
    // sobrados residenciais (8 m cada) fechando o lado norte-oeste (p_norte_1) e o lado leste (p_leste)
    { asset: "fachada_residencial_0", position: new Vector3(P.x0 + 4, y, P.z1), yaw: Math.PI, id: "res_n1" },
    { asset: "fachada_residencial_1", position: new Vector3(P.x0 + 12, y, P.z1), yaw: Math.PI, id: "res_n2" },
    { asset: "fachada_residencial_1", position: new Vector3(east, y, 5), yaw: -Math.PI / 2, id: "res_l1" },
    { asset: "fachada_residencial_0", position: new Vector3(east, y, 13), yaw: -Math.PI / 2, id: "res_l2" },
    { asset: "posto_distribuicao", position: new Vector3(postX, y, postZ), yaw: Math.PI },
    { asset: "banca_feira", position: new Vector3(postX - 8.5, y, postZ - 2.2), yaw: Math.PI - 0.35 },
    { asset: "gerador", position: new Vector3(postX + 7.3, y, postZ + 2.4), yaw: Math.PI / 2 },
    { asset: "botijao", position: new Vector3(postX + 6.3, y, postZ + 3.3), yaw: 0.4, id: "botijao_1" },
    { asset: "botijao", position: new Vector3(postX + 6.7, y, postZ + 3.1), yaw: 2.1, id: "botijao_2" },
    { asset: "barril_metal", position: new Vector3(postX - 3.2, y, postZ + 1.6), yaw: 0.3, id: "barril_1" },
    { asset: "barril_metal", position: new Vector3(postX + 3.4, y, postZ + 1.9), yaw: 1.2, id: "barril_2" },
    { asset: "banco_praca", position: new Vector3(postX - 6.2, y, postZ - 7.2), yaw: Math.PI * 0.5 + 0.2 },
    { asset: "caixa_eletrica", position: new Vector3(postX - 5.0, y, P.z1 - 2.4), yaw: Math.PI * 0.75 },
    // estoque do posto: caixotes empilhados e tambores de água (substituem as caixas/cilindros procedurais)
    { asset: "caixote", position: new Vector3(postX - 2.0, y, postZ + 1.3), yaw: 0.1, id: "cx_1" },
    { asset: "caixote", position: new Vector3(postX - 1.95, y + 0.55, postZ + 1.25), yaw: -0.2, id: "cx_2" },
    { asset: "caixote", position: new Vector3(postX - 2.05, y + 1.1, postZ + 1.35), yaw: 0.35, id: "cx_3" },
    { asset: "caixote", position: new Vector3(postX + 2.1, y, postZ + 1.4), yaw: -0.3, id: "cx_4" },
    { asset: "caixote", position: new Vector3(postX + 2.0, y + 0.55, postZ + 1.45), yaw: 0.15, id: "cx_5" },
    { asset: "caixote", position: new Vector3(postX + 2.75, y, postZ + 1.35), yaw: 0.5, id: "cx_6" },
    { asset: "barril_plastico", position: new Vector3(postX + 1.0, y, postZ + 1.5), yaw: 0.6, id: "tambor_1" },
    { asset: "barril_plastico", position: new Vector3(postX + 0.3, y, postZ + 1.6), yaw: 2.4, id: "tambor_2" },
    { asset: "barril_plastico", position: new Vector3(postX - 3.6, y, postZ - 2.5), yaw: 1.0, id: "tambor_solto", dynamic: 12 },
    // caixotes soltos no lado oeste da praça (o de cima é empurrável)
    { asset: "caixote", position: new Vector3(P.x0 + 9, y, 14), yaw: 0.3, id: "cx_p1" },
    { asset: "caixote", position: new Vector3(P.x0 + 9.05, y + 0.55, 13.95), yaw: -0.4, id: "cx_p2", dynamic: 6 },
    // postes da praça (a luz continua em props.streetLamp; aqui só a geometria). Braço para -X: yaw -π/2
    { asset: "poste_luz", position: new Vector3(cx + 3, y, 3.0), yaw: -Math.PI / 2, id: "poste_1" },
    { asset: "poste_luz", position: new Vector3(cx + 10, y, -5), yaw: -Math.PI / 2, id: "poste_2" },
  ];
  // árvores dos canteiros (posições de plaza.ts), alternando variantes e escala
  const pits: Array<[number, number]> = [
    [P.x0 + 5, 7],
    [P.x0 + 5, -7],
    [P.x1 - 6, -8],
    [cx - 9, -12],
  ];
  pits.forEach(([x, z], i) => {
    list.push({ asset: i % 2 === 0 ? "arvore_0" : "arvore_1", position: new Vector3(x, y + 0.3, z), yaw: i * 1.9, scale: 1.0 + (i % 3) * 0.12, id: `arvore_${i}` });
  });
  return list;
}

export interface HeroAssetsResult {
  meshes: AbstractMesh[];
  shadowCasters: AbstractMesh[];
  bytesHint: number;
}

export async function loadHeroAssets(scene: Scene, ctx: WorldContext, placements = heroPlacements(), url = heroAssetsUrl()): Promise<HeroAssetsResult> {
  // o kit do Setor 17 (sector17Kit.ts) começa a carregar em buildWorld; o jogo só abre depois dele
  const kit = sector17KitPending(ctx);
  let hero: HeroAssetsResult;
  try {
    hero = await placeHeroAssets(scene, ctx, placements, url);
  } catch (err) {
    if (kit) await kit;
    throw err;
  }
  const k = kit ? await kit : null;
  if (k) {
    hero.meshes.push(...k.meshes);
    hero.shadowCasters.push(...k.shadowCasters);
  }
  return hero;
}

async function placeHeroAssets(scene: Scene, ctx: WorldContext, placements: HeroPlacement[], url: string): Promise<HeroAssetsResult> {
  const result = await ImportMeshAsync(url, scene, { pluginExtension: ".glb" });
  // o loader cria um "__root__" que converte o glTF (destro) para a cena do Babylon (canhota);
  // cada asset recebe uma cópia dessa conversão e é pendurado num nó de posicionamento no mundo
  const gltfRoot = result.meshes.find((m) => m.name === "__root__") ?? null;
  const conversionRot = gltfRoot?.rotationQuaternion?.clone() ?? Quaternion.Identity();
  const conversionScale = gltfRoot?.scaling.clone() ?? new Vector3(1, 1, 1);
  const assetNodes = new Map<string, TransformNode>();
  const candidates: TransformNode[] = gltfRoot ? (gltfRoot.getChildren((n) => n instanceof TransformNode, true) as TransformNode[]) : [];
  for (const n of candidates) assetNodes.set(n.name, n);

  const placed: AbstractMesh[] = [];
  const shadowCasters: AbstractMesh[] = [];
  const used = new Set<string>();
  for (const p of placements) {
    const src = assetNodes.get(p.asset);
    if (!src) {
      console.warn(`[heroAssets] asset '${p.asset}' não encontrado em ${url}`);
      continue;
    }
    const wrapper = new TransformNode(`hero_${p.asset}${p.id ? `_${p.id}` : ""}`, scene);
    wrapper.position.copyFrom(p.position);
    wrapper.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), p.yaw);
    if (p.scale) wrapper.scaling.setAll(p.scale);
    let node: TransformNode;
    if (used.has(p.asset)) {
      const clone = src.instantiateHierarchy(wrapper, undefined, (source, target) => {
        target.name = `${source.name}#${p.id ?? ""}`;
      });
      if (!clone) continue;
      node = clone as TransformNode;
    } else {
      node = src;
      used.add(p.asset);
    }
    node.parent = wrapper;
    node.position.setAll(0);
    node.rotationQuaternion = conversionRot.clone();
    node.scaling.copyFrom(conversionScale);
    wrapper.computeWorldMatrix(true);
    for (const m of node.getChildMeshes(false)) {
      m.computeWorldMatrix(true);
      if (/(^|#)COL_/.test(m.name) || m.name.startsWith("COL_")) {
        if (p.dynamic) makeDynamic(ctx, wrapper, m, p.dynamic);
        else makeCollider(ctx, m, p.yaw);
        m.setEnabled(false);
        continue;
      }
      m.receiveShadows = true;
      m.isPickable = false;
      if (!p.dynamic) m.freezeWorldMatrix();
      if (m.material instanceof PBRMaterial) m.material.environmentIntensity = 0.9;
      placed.push(m);
      if (!p.dynamic && !/mancha|lona|vidro|fio|cabo/i.test(m.name)) shadowCasters.push(m);
    }
  }
  if (gltfRoot) gltfRoot.setEnabled(false);
  return { meshes: placed, shadowCasters, bytesHint: 0 };
}

/** Caixa de colisão estática a partir da malha COL_* (tamanho local × rotação do asset). */
function makeCollider(ctx: WorldContext, m: AbstractMesh, yaw: number): void {
  const bb = m.getBoundingInfo().boundingBox;
  const ext = bb.extendSize; // metade do tamanho local
  const scale = m.absoluteScaling;
  const size = { w: ext.x * 2 * Math.abs(scale.x), h: ext.y * 2 * Math.abs(scale.y), d: ext.z * 2 * Math.abs(scale.z) };
  const center = bb.centerWorld.clone();
  ctx.staticBoxCollider(`hero_${m.name}`, size, center, new Vector3(0, yaw, 0), true);
}

/** Corpo dinâmico no nó de posicionamento, com a caixa COL_ (origem do módulo no chão → centro deslocado). */
function makeDynamic(ctx: WorldContext, wrapper: TransformNode, m: AbstractMesh, mass: number): void {
  const bb = m.getBoundingInfo().boundingBox;
  const ext = bb.extendSize;
  const scale = m.absoluteScaling;
  const size = { w: ext.x * 2 * Math.abs(scale.x), h: ext.y * 2 * Math.abs(scale.y), d: ext.z * 2 * Math.abs(scale.z) };
  wrapper.computeWorldMatrix(true);
  const centerLocal = Vector3.TransformCoordinates(bb.centerWorld, wrapper.getWorldMatrix().clone().invert());
  ctx.dynamicBox(wrapper, size, mass, centerLocal);
}

export type { Mesh };

import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import type { PhysicsEngine } from "@babylonjs/core/Physics/v2/physicsEngine";
import type { INavMeshParameters } from "@babylonjs/core/Navigation/INavigationEngine";
import type { Scene } from "@babylonjs/core/scene";
import { SECTOR_BOUNDS, type Rect } from "./bounds";

/**
 * Malha de navegação do Setor 17, gerada em tempo de carga a partir dos colisores estáticos do Havok
 * (chão, calçadas, interiores, telhados, muros, props). Motor preferido: Recast/Detour via `recast-detour`
 * (porta WASM, licença zlib) com o `RecastJSPlugin` do Babylon; se o módulo não carregar, entra um grafo
 * em grade (células de 0,5 m, A*) só no nível do chão, documentado em docs/MAPA_SETOR17.md.
 */
export interface Navmesh {
  readonly kind: "recast" | "grade";
  readonly stats: NavmeshStats;
  /** caminho (pontos no mundo) entre dois pontos; vazio se não houver */
  findPath(from: Vector3, to: Vector3): Vector3[];
  /** ponto navegável aleatório a até `radius` m de `around` */
  getRandomPointAround(around: Vector3, radius: number): Vector3;
  /** ponto navegável mais próximo */
  getClosestPoint(p: Vector3): Vector3;
  /** malha de depuração (`?navmesh=1`) */
  showDebug(scene: Scene): void;
  hideDebug(): void;
}

export interface NavmeshStats {
  kind: "recast" | "grade";
  /** colisores usados como geometria */
  sources: number;
  /** triângulos da malha (recast) ou células livres (grade) */
  triangles: number;
  buildMs: number;
  area: Rect;
}

/** Caixa estática extraída de um colisor (centro no mundo, meio-tamanho local, rotação). */
export interface StaticBox {
  name: string;
  center: Vector3;
  half: Vector3;
  rotation: Quaternion;
}

/**
 * Parâmetros do Recast (unidades em células; cs = 0,2 m, ch = 0,15 m). Com células de 0,35 m a erosão do raio
 * do agente fechava as portas de 1,3–1,4 m (oficina, escola) e as escadas de 1,3 m: os interiores viravam
 * ilhas e os caminhos voltavam vazios.
 */
export const RECAST_PARAMS: INavMeshParameters = {
  cs: 0.2,
  ch: 0.15,
  walkableSlopeAngle: 50,
  walkableHeight: 12, // 1,8 m
  walkableClimb: 3, // 0,45 m (meio-fio de 0,12 m, soleiras)
  walkableRadius: 2, // 0,4 m ≈ raio da cápsula de Matias (0,32) + folga
  maxEdgeLen: 34,
  maxSimplificationError: 1.3,
  minRegionArea: 8,
  mergeRegionArea: 20,
  maxVertsPerPoly: 6,
  detailSampleDist: 6,
  detailSampleMaxError: 1,
};

/**
 * Colisores estáticos do Havok dentro da área (menos o chão regional e o chão base, que são substituídos
 * por um plano exato da área). Nós `col_*` vêm de WorldContext.staticBoxCollider/Cylinder (inclui os
 * COL_* dos módulos GLB); cilindros entram pela caixa envolvente.
 */
export function collectStaticBoxes(scene: Scene, area: Rect): StaticBox[] {
  const engine = scene.getPhysicsEngine() as PhysicsEngine | null;
  if (!engine) return [];
  const out: StaticBox[] = [];
  for (const body of engine.getBodies()) {
    const node = body.transformNode;
    if (!node || body.motionType !== PhysicsMotionType.STATIC) continue;
    if (!node.name.startsWith("col_")) continue;
    if (node.name === "col_chao" || node.name === "col_chao_regiao") continue;
    const shape = body.shape;
    if (!shape) continue;
    const bb = shape.getBoundingBox();
    const half = bb.extendSize.clone();
    if (half.x > 400 || half.z > 400) continue; // nada do tamanho do mundo
    node.computeWorldMatrix(true);
    const rot = node.rotationQuaternion?.clone() ?? Quaternion.FromEulerVector(node.rotation);
    const centerLocal = bb.center.clone();
    const center = node.getAbsolutePosition().add(centerLocal.applyRotationQuaternion(rot));
    if (center.x + half.x < area.x0 - 2 || center.x - half.x > area.x1 + 2 || center.z + half.z < area.z0 - 2 || center.z - half.z > area.z1 + 2) continue;
    out.push({ name: node.name, center, half, rotation: rot });
  }
  return out;
}

interface RecastModuleFactory {
  (): Promise<unknown>;
}

/** Carrega o módulo WASM do recast-detour (import dinâmico: entra num chunk próprio do Vite). */
async function loadRecast(): Promise<unknown> {
  const mod = (await import("recast-detour")) as unknown as { default?: RecastModuleFactory } | RecastModuleFactory;
  const factory = (typeof mod === "function" ? mod : (mod as { default?: RecastModuleFactory }).default) as RecastModuleFactory | undefined;
  if (!factory) throw new Error("recast-detour: fábrica do módulo não encontrada");
  // o build ES do recast-detour faz `this["Recast"] = Module` dentro da fábrica; chamada solta em módulo
  // estrito deixa `this` indefinido e quebra — chama com um receptor explícito
  return await factory.call({});
}

/**
 * Constrói a malha de navegação (Recast, com a grade como alternativa). `boxes` pode ser passado nos
 * testes; por padrão vem dos colisores da cena.
 */
export async function buildNavmesh(scene: Scene, area: Rect = SECTOR_BOUNDS, boxes = collectStaticBoxes(scene, area)): Promise<Navmesh> {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  try {
    const recast = await loadRecast();
    const { RecastJSPlugin } = await import("@babylonjs/core/Navigation/Plugins/recastJSPlugin");
    const plugin = new RecastJSPlugin(recast);
    if (!plugin.isSupported()) throw new Error("RecastJSPlugin não suportado");
    const temp: Mesh[] = [];
    const root = new TransformNode("navmesh_fonte", scene);
    temp.push(MeshBuilder.CreateGround("navmesh_chao", { width: area.x1 - area.x0 + 4, height: area.z1 - area.z0 + 4 }, scene));
    temp[0]!.position.set((area.x0 + area.x1) / 2, 0, (area.z0 + area.z1) / 2);
    for (const [i, b] of boxes.entries()) {
      const m = MeshBuilder.CreateBox(`navmesh_src_${i}`, { width: b.half.x * 2, height: b.half.y * 2, depth: b.half.z * 2 }, scene);
      m.position.copyFrom(b.center);
      m.rotationQuaternion = b.rotation.clone();
      temp.push(m);
    }
    for (const m of temp) {
      m.parent = root;
      m.isVisible = false;
      m.computeWorldMatrix(true);
    }
    plugin.createNavMesh(temp, RECAST_PARAMS);
    root.dispose(false, true);
    const debug = plugin.createDebugNavMesh(scene);
    const triangles = debug.getTotalIndices() / 3;
    debug.dispose();
    const stats: NavmeshStats = { kind: "recast", sources: boxes.length, triangles, buildMs: Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - t0), area };
    return new RecastNavmesh(plugin, stats);
  } catch (err) {
    console.warn("[navmesh] Recast indisponível, usando grade A*:", err);
    const grid = GridNavmesh.fromBoxes(area, boxes, 0.5);
    grid.stats.buildMs = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - t0);
    return grid;
  }
}

class RecastNavmesh implements Navmesh {
  readonly kind = "recast" as const;
  private debug: Mesh | null = null;
  constructor(
    private readonly plugin: import("@babylonjs/core/Navigation/Plugins/recastJSPlugin").RecastJSPlugin,
    readonly stats: NavmeshStats,
  ) {
    // busca do polígono mais próximo: larga na horizontal e curta na vertical — com 4 m de altura o ponto de
    // uma sala do térreo "grudava" na laje do andar de cima (3,5 m) e o caminho saía vazio
    plugin.setDefaultQueryExtent(new Vector3(5, 1.2, 5));
  }
  findPath(from: Vector3, to: Vector3): Vector3[] {
    const a = this.plugin.getClosestPoint(from);
    const b = this.plugin.getClosestPoint(to);
    const far = (p: Vector3, q: Vector3) => Math.hypot(p.x - q.x, p.z - q.z) > 5 || Math.abs(p.y - q.y) > 1.5;
    if (far(a, from) || far(b, to)) return [];
    const path = this.plugin.computePath(a, b);
    if (path.length < 2) return [];
    // caminho inacabado (Detour pára na borda do polígono mais próximo do destino)
    if (Vector3.Distance(path[path.length - 1]!, b) > 2.5) return [];
    return path;
  }
  getRandomPointAround(around: Vector3, radius: number): Vector3 {
    return this.plugin.getRandomPointAround(around, radius);
  }
  getClosestPoint(p: Vector3): Vector3 {
    return this.plugin.getClosestPoint(p);
  }
  showDebug(scene: Scene): void {
    if (this.debug) return;
    const m = this.plugin.createDebugNavMesh(scene);
    m.name = "navmesh_debug";
    m.position.y = 0.05;
    const mat = new StandardMaterial("navmesh_debug_mat", scene);
    mat.diffuseColor = new Color3(0.2, 0.9, 0.5);
    mat.emissiveColor = new Color3(0.1, 0.5, 0.3);
    mat.alpha = 0.45;
    mat.wireframe = false;
    mat.backFaceCulling = false;
    m.material = mat;
    m.isPickable = false;
    this.debug = m;
  }
  hideDebug(): void {
    this.debug?.dispose(false, true);
    this.debug = null;
  }
}

/**
 * Alternativa sem WASM: grade de ocupação no nível do chão (uma célula é bloqueada quando uma caixa
 * estática ocupa a faixa de altura 0,3–1,9 m sobre ela). A* 8-conexo com suavização por linha de visada.
 */
export class GridNavmesh implements Navmesh {
  readonly kind = "grade" as const;
  readonly stats: NavmeshStats;
  private debug: Mesh | null = null;

  private constructor(
    readonly area: Rect,
    readonly cell: number,
    readonly cols: number,
    readonly rows: number,
    readonly blocked: Uint8Array,
    sources: number,
  ) {
    let free = 0;
    for (const b of blocked) if (!b) free++;
    this.stats = { kind: "grade", sources, triangles: free, buildMs: 0, area };
  }

  static fromBoxes(area: Rect, boxes: StaticBox[], cell = 0.5): GridNavmesh {
    const cols = Math.ceil((area.x1 - area.x0) / cell);
    const rows = Math.ceil((area.z1 - area.z0) / cell);
    const blocked = new Uint8Array(cols * rows);
    const margin = 0.3; // raio de Matias
    for (const b of boxes) {
      const bottom = b.center.y - b.half.y;
      const top = b.center.y + b.half.y;
      if (top < 0.3 || bottom > 1.9) continue; // pisos baixos e coisas acima da cabeça não bloqueiam
      // caixa girada → polígono no plano; teste por amostragem do centro da célula
      const inv = Quaternion.Inverse(b.rotation);
      const r = Math.hypot(b.half.x, b.half.z) + margin;
      const c0 = Math.max(0, Math.floor((b.center.x - r - area.x0) / cell));
      const c1 = Math.min(cols - 1, Math.ceil((b.center.x + r - area.x0) / cell));
      const r0 = Math.max(0, Math.floor((b.center.z - r - area.z0) / cell));
      const r1 = Math.min(rows - 1, Math.ceil((b.center.z + r - area.z0) / cell));
      for (let row = r0; row <= r1; row++) {
        for (let col = c0; col <= c1; col++) {
          const p = new Vector3(area.x0 + (col + 0.5) * cell - b.center.x, 0, area.z0 + (row + 0.5) * cell - b.center.z).applyRotationQuaternion(inv);
          if (Math.abs(p.x) <= b.half.x + margin && Math.abs(p.z) <= b.half.z + margin) blocked[row * cols + col] = 1;
        }
      }
    }
    return new GridNavmesh(area, cell, cols, rows, blocked, boxes.length);
  }

  private toCell(p: Vector3): [number, number] {
    return [Math.min(this.cols - 1, Math.max(0, Math.floor((p.x - this.area.x0) / this.cell))), Math.min(this.rows - 1, Math.max(0, Math.floor((p.z - this.area.z0) / this.cell)))];
  }
  private toWorld(col: number, row: number): Vector3 {
    return new Vector3(this.area.x0 + (col + 0.5) * this.cell, 0, this.area.z0 + (row + 0.5) * this.cell);
  }
  isFree(col: number, row: number): boolean {
    return col >= 0 && row >= 0 && col < this.cols && row < this.rows && this.blocked[row * this.cols + col] === 0;
  }

  getClosestPoint(p: Vector3): Vector3 {
    const [c, r] = this.toCell(p);
    if (this.isFree(c, r)) return this.toWorld(c, r);
    for (let ring = 1; ring < 12; ring++) {
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
          if (this.isFree(c + dc, r + dr)) return this.toWorld(c + dc, r + dr);
        }
      }
    }
    return p.clone();
  }

  getRandomPointAround(around: Vector3, radius: number): Vector3 {
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * radius;
      const p = new Vector3(around.x + Math.cos(a) * d, 0, around.z + Math.sin(a) * d);
      const [c, r] = this.toCell(p);
      if (this.isFree(c, r)) return this.toWorld(c, r);
    }
    return this.getClosestPoint(around);
  }

  findPath(from: Vector3, to: Vector3): Vector3[] {
    const start = this.toCell(this.getClosestPoint(from));
    const goal = this.toCell(this.getClosestPoint(to));
    const key = (c: number, r: number) => r * this.cols + c;
    const open: Array<{ c: number; r: number; f: number }> = [{ c: start[0], r: start[1], f: 0 }];
    const g = new Map<number, number>([[key(start[0], start[1]), 0]]);
    const came = new Map<number, number>();
    const closed = new Set<number>();
    const h = (c: number, r: number) => Math.hypot(c - goal[0], r - goal[1]);
    let found = false;
    let guard = 0;
    while (open.length && guard++ < 400000) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i]!.f < open[bi]!.f) bi = i;
      const cur = open.splice(bi, 1)[0]!;
      const ck = key(cur.c, cur.r);
      if (closed.has(ck)) continue;
      closed.add(ck);
      if (cur.c === goal[0] && cur.r === goal[1]) {
        found = true;
        break;
      }
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dc && !dr) continue;
          const nc = cur.c + dc;
          const nr = cur.r + dr;
          if (!this.isFree(nc, nr)) continue;
          if (dc && dr && (!this.isFree(cur.c + dc, cur.r) || !this.isFree(cur.c, cur.r + dr))) continue; // não corta quinas
          const nk = key(nc, nr);
          const ng = (g.get(ck) ?? 0) + (dc && dr ? 1.4142 : 1);
          if (ng < (g.get(nk) ?? Infinity)) {
            g.set(nk, ng);
            came.set(nk, ck);
            open.push({ c: nc, r: nr, f: ng + h(nc, nr) });
          }
        }
      }
    }
    if (!found) return [];
    const cells: Array<[number, number]> = [];
    let k = key(goal[0], goal[1]);
    while (true) {
      cells.push([k % this.cols, Math.floor(k / this.cols)]);
      const prev = came.get(k);
      if (prev === undefined) break;
      k = prev;
    }
    cells.reverse();
    // suavização: pula células intermediárias enquanto houver linha de visada livre
    const pts: Vector3[] = [];
    let i = 0;
    while (i < cells.length) {
      let j = cells.length - 1;
      while (j > i + 1 && !this.lineFree(cells[i]!, cells[j]!)) j--;
      pts.push(this.toWorld(cells[i]![0], cells[i]![1]));
      if (j === i) break;
      i = j;
      if (i === cells.length - 1) {
        pts.push(this.toWorld(cells[i]![0], cells[i]![1]));
        break;
      }
    }
    return pts;
  }

  private lineFree(a: [number, number], b: [number, number]): boolean {
    const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) * 2;
    for (let s = 0; s <= n; s++) {
      const t = n === 0 ? 0 : s / n;
      const c = Math.round(a[0] + (b[0] - a[0]) * t);
      const r = Math.round(a[1] + (b[1] - a[1]) * t);
      if (!this.isFree(c, r)) return false;
    }
    return true;
  }

  showDebug(scene: Scene): void {
    if (this.debug) return;
    // uma caixa fina por célula livre seria pesado: desenha a grade bloqueada como caixas fundidas por linha
    const boxes: Mesh[] = [];
    for (let r = 0; r < this.rows; r++) {
      let runStart = -1;
      for (let c = 0; c <= this.cols; c++) {
        const free = c < this.cols && this.isFree(c, r);
        if (free && runStart < 0) runStart = c;
        if (!free && runStart >= 0) {
          const len = c - runStart;
          const m = MeshBuilder.CreateBox(`navgrid_${r}_${runStart}`, { width: len * this.cell, height: 0.04, depth: this.cell }, scene);
          m.position.set(this.area.x0 + (runStart + len / 2) * this.cell, 0.06, this.area.z0 + (r + 0.5) * this.cell);
          boxes.push(m);
          runStart = -1;
        }
      }
    }
    const merged = Mesh.MergeMeshes(boxes, true, true, undefined, false, false);
    if (!merged) return;
    merged.name = "navmesh_debug";
    const mat = new StandardMaterial("navmesh_debug_mat", scene);
    mat.diffuseColor = new Color3(0.2, 0.9, 0.5);
    mat.emissiveColor = new Color3(0.1, 0.5, 0.3);
    mat.alpha = 0.45;
    merged.material = mat;
    merged.isPickable = false;
    this.debug = merged;
  }
  hideDebug(): void {
    this.debug?.dispose(false, true);
    this.debug = null;
  }
}

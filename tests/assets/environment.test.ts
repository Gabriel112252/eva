import { describe, expect, it } from "vitest";
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import validator from "gltf-validator";
import { heroPlacements } from "@/world/heroAssets";
import { ROOT } from "../helpers/headless";

const FILE = resolve(ROOT, "public/assets/environments/praca_hero.glb");

function gltfJson(file: string): { nodes: Array<{ name?: string; children?: number[]; mesh?: number }>; materials: Array<{ name?: string; alphaMode?: string; doubleSided?: boolean }>; images?: unknown[] } {
  const buf = readFileSync(file);
  const len = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + len).toString("utf8"));
}

describe("Módulos da praça (public/assets/environments/praca_hero.glb)", () => {
  it("existe, passa no validador glTF da Khronos e cabe no orçamento de download", async () => {
    expect(existsSync(FILE), FILE).toBe(true);
    const bytes = readFileSync(FILE);
    const report = (await validator.validateBytes(new Uint8Array(bytes), { maxIssues: 500 })) as {
      issues: { numErrors: number; messages: Array<{ message: string; pointer?: string }> };
      info?: { totalTriangleCount?: number; materialCount?: number };
    };
    expect(report.issues.numErrors, JSON.stringify(report.issues.messages.slice(0, 5))).toBe(0);
    expect(report.info?.totalTriangleCount ?? 0).toBeGreaterThan(20000);
    expect(statSync(FILE).size).toBeLessThan(6 * 1024 * 1024);
  });

  it("contém todos os assets referenciados pelas colocações (heroPlacements), cada um com colisor COL_", () => {
    const gltf = gltfJson(FILE);
    const names = new Set(gltf.nodes.map((n) => n.name ?? ""));
    const roots = new Map<string, number[]>();
    for (const n of gltf.nodes) if (n.children && n.name) roots.set(n.name, n.children);
    const wanted = new Set(heroPlacements().map((p) => p.asset));
    for (const asset of wanted) {
      expect(names.has(asset), `asset '${asset}' ausente no GLB`).toBe(true);
      const children = roots.get(asset) ?? [];
      const hasCollider = children.some((i) => (gltf.nodes[i]?.name ?? "").startsWith("COL_"));
      expect(hasCollider, `asset '${asset}' sem malha COL_`).toBe(true);
    }
  });

  it("folhagem usa alpha-test (MASK, dupla face) e manchas usam BLEND", () => {
    const gltf = gltfJson(FILE);
    const byName = new Map(gltf.materials.map((m) => [m.name, m]));
    expect(byName.get("leaves")?.alphaMode).toBe("MASK");
    expect(byName.get("leaves")?.doubleSided).toBe(true);
    expect(byName.get("stain")?.alphaMode).toBe("BLEND");
    expect((gltf.images ?? []).length).toBeGreaterThan(8);
  });
});

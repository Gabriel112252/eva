import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import validator from "gltf-validator";
import { staticVehicles } from "@/world/vehiclesPack";
import { ROOT } from "../helpers/headless";

const ALL = ["javali_vb4", "atlas_t3", "modulo_v7", "rastro_av4", "janus_station"];

describe("Veículos (PR #1 refinados em public/assets/vehicles)", () => {
  it("os cinco GLB refinados existem, passam no validador Khronos e têm texturas embutidas", async () => {
    for (const id of ALL) {
      const file = resolve(ROOT, `public/assets/vehicles/${id}.glb`);
      expect(existsSync(file), file).toBe(true);
      const report = (await validator.validateBytes(new Uint8Array(readFileSync(file)), { maxIssues: 200 })) as {
        issues: { numErrors: number; messages: Array<{ message: string; pointer?: string }> };
        info?: { totalTriangleCount?: number; materialCount?: number; drawCallCount?: number; hasTextures?: boolean };
      };
      expect(report.issues.numErrors, `${id}: ${JSON.stringify(report.issues.messages.slice(0, 3))}`).toBe(0);
      expect(report.info?.totalTriangleCount ?? 0, id).toBeGreaterThan(3000);
      expect(report.info?.drawCallCount ?? 99, id).toBeLessThanOrEqual(12);
      if (id !== "janus_station") expect(report.info?.hasTextures, id).toBe(true); // a estação usa só materiais lisos (metal, cerâmica, painel solar)
    }
  });

  it("só Javali, Atlas e Módulo entram na São Paulo Velha (aeromoto e Janus ficam fora do cenário)", () => {
    const ids = staticVehicles().map((v) => v.id).sort();
    expect(ids).toEqual(["atlas_t3", "javali_vb4", "modulo_v7"]);
    for (const v of staticVehicles()) {
      expect(v.footprint.h).toBeGreaterThan(1);
      expect(v.footprint.d).toBeGreaterThan(v.footprint.w);
    }
  });

  it("as fontes originais (assets-src/vehicles) continuam válidas para o validador estrutural da PR", () => {
    for (const id of ALL) {
      const buf = readFileSync(resolve(ROOT, `assets-src/vehicles/${id}.glb`));
      expect(buf.readUInt32LE(0)).toBe(0x46546c67);
      expect(buf.readUInt32LE(8)).toBe(buf.length);
    }
  });
});

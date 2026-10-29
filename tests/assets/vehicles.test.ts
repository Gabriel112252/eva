import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import validator from "gltf-validator";
import { vehicleSpawns } from "@/world/vehiclesPack";
import { VEHICLE_DEFS } from "@/vehicles/vehicleDefs";
import { resolveDrive, steerLimit } from "@/vehicles/vehicle";
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
      // rodas/rotores ficam separados (giram no jogo), cada um com 2–3 materiais
      expect(report.info?.drawCallCount ?? 99, id).toBeLessThanOrEqual(24);
      if (id !== "janus_station") expect(report.info?.hasTextures, id).toBe(true); // a estação usa só materiais lisos (metal, cerâmica, painel solar)
    }
  });

  it("os quatro veículos jogáveis têm spawn na São Paulo Velha; a Estação Janus não entra no cenário", () => {
    const ids = vehicleSpawns().map((v) => v.id).sort();
    expect(ids).toEqual(["atlas_t3", "javali_vb4", "modulo_v7", "rastro_av4"]);
    for (const sp of vehicleSpawns()) {
      const def = VEHICLE_DEFS[sp.id];
      expect(def.mass).toBeGreaterThan(100);
      expect(def.chassisSize.z).toBeGreaterThan(def.chassisSize.x);
      expect(def.kind === "hover" ? def.hover !== undefined : def.engineForce > 0).toBe(true);
    }
  });

  it("motor/freio: acelerar andando de ré freia; freio quando andando para a frente; limite de velocidade", () => {
    const def = VEHICLE_DEFS.javali_vb4;
    expect(resolveDrive(1, 0, def).engine).toBeGreaterThan(0);
    expect(resolveDrive(1, def.maxSpeed, def).engine).toBe(0);
    expect(resolveDrive(1, -2, def)).toEqual({ engine: 0, brake: def.brakeForce });
    expect(resolveDrive(-1, 5, def).brake).toBeCloseTo(def.brakeForce);
    expect(resolveDrive(-1, 0, def).engine).toBeLessThan(0);
    expect(resolveDrive(0, 5, def)).toEqual({ engine: 0, brake: 0 });
    expect(steerLimit(0.5, 0)).toBeCloseTo(0.5);
    expect(steerLimit(0.5, 30)).toBeLessThan(0.2);
  });

  it("as fontes originais (assets-src/vehicles) continuam válidas para o validador estrutural da PR", () => {
    for (const id of ALL) {
      const buf = readFileSync(resolve(ROOT, `assets-src/vehicles/${id}.glb`));
      expect(buf.readUInt32LE(0)).toBe(0x46546c67);
      expect(buf.readUInt32LE(8)).toBe(buf.length);
    }
  });
});

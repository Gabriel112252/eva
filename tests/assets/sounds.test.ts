import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { SAMPLES, FOOTSTEP_SURFACES, FOOTSTEP_VARIATIONS } from "@/data/sounds";
import { ROOT } from "../helpers/headless";

describe("Efeitos sonoros gravados (CC0)", () => {
  it("todos os samples do manifesto existem e são Ogg válidos", () => {
    expect(SAMPLES.length).toBeGreaterThanOrEqual(FOOTSTEP_SURFACES.length * FOOTSTEP_VARIATIONS);
    for (const { key, file } of SAMPLES) {
      const path = resolve(ROOT, "public/assets/audio/sfx", file);
      expect(existsSync(path), `${key}: ${file}`).toBe(true);
      const head = readFileSync(path).subarray(0, 4).toString("latin1");
      expect(head, `${file} não é Ogg`).toBe("OggS");
    }
  });

  it("a licença dos samples acompanha os arquivos", () => {
    const lic = readFileSync(resolve(ROOT, "public/assets/audio/sfx/LICENSE-kenney.txt"), "utf8");
    expect(lic).toMatch(/CC0/);
    expect(lic).toMatch(/kenney/i);
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import validator from "gltf-validator";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ANIMATION_CLIPS, CHARACTERS, type CharacterVariant } from "@/data/characters";
import { loadCharacter } from "@/characters/characterModel";
import { characterBytes, characterDataUrl, createHeadlessScene, ROOT } from "../helpers/headless";

const variants = Object.keys(CHARACTERS) as CharacterVariant[];

describe("Personagens GLB (modelos rigados reais)", () => {
  it("todos os arquivos existem e passam no validador glTF da Khronos sem erros", async () => {
    for (const v of variants) {
      const file = resolve(ROOT, `public/assets/characters/${v}.glb`);
      expect(existsSync(file), file).toBe(true);
      const report = (await validator.validateBytes(characterBytes(v), { maxIssues: 50 })) as {
        issues: { numErrors: number; numWarnings: number; messages: Array<{ message: string; pointer?: string }> };
        info: { hasSkins?: boolean; animationCount?: number; totalTriangleCount?: number };
      };
      expect(report.issues.numErrors, JSON.stringify(report.issues.messages)).toBe(0);
      expect(report.info.hasSkins).toBe(true);
      expect(report.info.animationCount).toBe(ANIMATION_CLIPS.length);
      expect(report.info.totalTriangleCount ?? 0).toBeGreaterThan(20000);
    }
  });

  it("o manifesto lista os mesmos clipes e ossos usados pelo jogo", () => {
    const manifest = JSON.parse(readFileSync(resolve(ROOT, "public/assets/characters/characters.json"), "utf8")) as { bones: string[]; clips: Record<string, unknown>; characters: Record<string, { height: number }> };
    expect(Object.keys(manifest.clips).sort()).toEqual([...ANIMATION_CLIPS].sort());
    expect(manifest.bones).toContain("mixamorig:Hips");
    expect(manifest.bones).toContain("mixamorig:Head");
    for (const v of variants) expect(manifest.characters[v]?.height).toBeCloseTo(CHARACTERS[v].height, 2);
  });

  it("carrega no Babylon com esqueleto Mixamo (52 ossos), 7 clipes e olhando para +Z; a animação move os ossos", async () => {
    const { engine, scene } = await createHeadlessScene(false);
    const model = await loadCharacter(scene, "matias", "", characterDataUrl("matias"));
    expect(model.skeleton?.bones.length).toBe(52);
    expect(model.meshes.length).toBeGreaterThan(0);
    for (const clip of ANIMATION_CLIPS) expect(model.animator.has(clip), clip).toBe(true);
    expect(model.head).not.toBeNull();
    scene.render();
    // frente do modelo (pés) em +Z, cabeça acima de 1,7 m
    let maxZ = -Infinity;
    let maxY = -Infinity;
    for (const m of model.meshes) {
      const pos = m.getVerticesData("position")!;
      const wm = m.computeWorldMatrix(true);
      for (let i = 0; i < pos.length; i += 3) {
        const p = Vector3.TransformCoordinates(new Vector3(pos[i]!, pos[i + 1]!, pos[i + 2]!), wm);
        maxZ = Math.max(maxZ, p.z);
        maxY = Math.max(maxY, p.y);
      }
    }
    expect(maxZ).toBeGreaterThan(0.1);
    expect(maxY).toBeGreaterThan(1.7);
    // tocar Walk altera a rotação da coxa (prova de animação esquelética real)
    const leg = scene.getTransformNodeByName("mixamorig:LeftUpLeg")!;
    model.animator.play("Walk");
    for (let i = 0; i < 20; i++) {
      scene.render();
      model.animator.update(1 / 60);
    }
    const q = leg.rotationQuaternion!;
    expect(Math.abs(q.x) + Math.abs(q.y) + Math.abs(q.z)).toBeGreaterThan(0.01);
    expect(model.animator.clip).toBe("Walk");
    engine.dispose();
  });
});

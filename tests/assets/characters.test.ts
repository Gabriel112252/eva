import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import validator from "gltf-validator";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
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
    const manifest = JSON.parse(readFileSync(resolve(ROOT, "public/assets/characters/characters.json"), "utf8")) as { animations: string; bones: string[]; clips: Record<string, { source: string; frames?: number; duration: number }>; characters: Record<string, { height: number }> };
    expect(Object.keys(manifest.clips).sort()).toEqual([...ANIMATION_CLIPS].sort());
    expect(manifest.bones).toContain("mixamorig:Hips");
    expect(manifest.bones).toContain("mixamorig:Head");
    for (const v of variants) expect(manifest.characters[v]?.height).toBeCloseTo(CHARACTERS[v].height, 2);
    // os clipes vêm da biblioteca CC0 retargeteada, nunca dos procedurais provisórios
    expect(manifest.animations).toMatch(/Universal Animation Library/);
    for (const [name, clip] of Object.entries(manifest.clips)) {
      expect(clip.source, name).not.toBe("procedural");
      // poses estáticas (mira) têm poucos quadros; clipes de movimento, dezenas
      expect(clip.frames ?? 0, name).toBeGreaterThanOrEqual(name === "PistolAim" ? 3 : 11);
    }
    expect(manifest.clips.Walk!.source).toBe("Walk_Loop");
    expect(manifest.clips.PickUp!.source).toBe("PickUp_Table");
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

  it("a caixa envolvente acompanha o personagem pelo mundo (frustum culling não o apaga longe da origem)", async () => {
    const { engine, scene } = await createHeadlessScene(false);
    const model = await loadCharacter(scene, "ana", "", characterDataUrl("ana"));
    const far = new Vector3(20.14, 0.12, -2.19); // praça: posição onde os personagens sumiam
    model.root.position.copyFrom(far);
    scene.render();
    for (const m of model.meshes) {
      m.computeWorldMatrix(true);
      const bb = m.getBoundingInfo().boundingBox;
      expect(bb.minimumWorld.x, m.name).toBeLessThan(far.x);
      expect(bb.maximumWorld.x, m.name).toBeGreaterThan(far.x);
      expect(bb.minimumWorld.z, m.name).toBeLessThan(far.z);
      expect(bb.maximumWorld.z, m.name).toBeGreaterThan(far.z);
      expect(bb.maximumWorld.y, m.name).toBeGreaterThan(far.y + 1.5);
      // a câmera olhando para o personagem o considera visível
      const cam = scene.activeCamera as TargetCamera;
      cam.position.copyFrom(far.add(new Vector3(0, 1.5, -4)));
      cam.setTarget(far.add(new Vector3(0, 1, 0)));
      cam.getViewMatrix(true);
      cam.getProjectionMatrix(true);
      expect(cam.isInFrustum(m), `${m.name} fora do frustum`).toBe(true);
    }
    engine.dispose();
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import validator from "gltf-validator";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import { ANIMATION_CLIPS, CHAPTER1_CAST, CHARACTERS, PROVISIONAL_CAST, speakerVoice, type CharacterVariant } from "@/data/characters";
import { SPEAKER_NAMES } from "@/data/dialogues";
import { loadCharacter } from "@/characters/characterModel";
import { characterBytes, characterDataUrl, createHeadlessScene, ROOT } from "../helpers/headless";

const variants = Object.keys(CHARACTERS) as CharacterVariant[];

/** Nomes das malhas de um GLB (chunk JSON). */
function glbMeshNames(bytes: Uint8Array): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const len = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + len))) as { meshes: Array<{ name: string }> };
  return json.meshes.map((m) => m.name);
}

/** Variantes geradas com o passe de roupas volumétricas/equipamento (30/10/2026) e o que cada uma precisa ter. */
const OUTFITTED: Record<"brandao" | "elias" | "custodio", string[]> = {
  // farda cinza sem armadura: gola alta, filetes de cobre, prancheta, papel (crachá/lista)
  brandao: ["brandao_shirt", "brandao_collar", "brandao_trim", "brandao_clipboard", "brandao_paper"],
  // jaqueta aberta (com capuz), camiseta, lenço, bolsa transversal com papéis
  elias: ["elias_jacket", "elias_shirt", "elias_scarf", "elias_bag", "elias_papers"],
  // armadura humana fabricável: placas de cerâmica, colete índigo, detalhes de cobre e índigo, viseira do capacete
  custodio: ["custodio_plate", "custodio_vest", "custodio_trim", "custodio_indigo", "custodio_visor"],
};

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

  it("elenco do Capítulo 1 com GLB próprio: Brandão e Elias são variantes reais, nenhum papel usa modelo emprestado", () => {
    expect(Object.keys(PROVISIONAL_CAST)).toHaveLength(0);
    for (const info of Object.values(CHAPTER1_CAST)) {
      expect(info.model).toBe(info.role);
      expect(CHARACTERS[info.model].displayName).toBe(info.displayName);
      expect(SPEAKER_NAMES[info.role]).toBe(info.displayName);
      expect(existsSync(resolve(ROOT, `public/assets/characters/${info.model}.glb`))).toBe(true);
      expect(speakerVoice(info.role)).toEqual(info.voice);
      expect(info.voice).not.toEqual(CHARACTERS.matias.voice);
      // silhuetas próprias: não é mais o GLB de um desviador de cargas
      expect(info.model).not.toMatch(/^saqueador/);
    }
  });

  it("variantes com roupa volumétrica/equipamento: peças distintas, orçamento de triângulos, peso e draw calls", async () => {
    for (const [v, required] of Object.entries(OUTFITTED) as Array<[CharacterVariant, string[]]>) {
      const bytes = characterBytes(v);
      const names = glbMeshNames(bytes);
      for (const n of required) expect(names, `${v}: ${n}`).toContain(n);
      // peças fundidas por material: cada malha é um draw call no Babylon
      expect(names.length, `${v}: ${names.join(", ")}`).toBeLessThanOrEqual(12);
      // dentro do orçamento dos NPCs atuais (Raquel ~50 mil triângulos, ~3,3 MB)
      expect(bytes.length).toBeLessThan(3.4 * 1024 * 1024);
      const report = (await validator.validateBytes(bytes, { maxIssues: 500 })) as { info: { totalTriangleCount?: number } };
      expect(report.info.totalTriangleCount ?? 0).toBeLessThanOrEqual(50000);
    }
  });

  it("Brandão, Elias e o Custódio carregam no Babylon com o mesmo rig (52 ossos) e todos os clipes", async () => {
    const { engine, scene } = await createHeadlessScene(false);
    for (const v of ["brandao", "elias", "custodio"] as const) {
      const model = await loadCharacter(scene, v, `_${v}`, characterDataUrl(v));
      expect(model.skeleton?.bones.length, v).toBe(52);
      for (const clip of ANIMATION_CLIPS) expect(model.animator.has(clip), `${v} ${clip}`).toBe(true);
      // a malha tem a altura declarada (a cápsula de colisão usa CHARACTERS[v].height); capacete/cabelo somam poucos cm
      scene.render();
      let top = -Infinity;
      for (const m of model.meshes) {
        const pos = m.getVerticesData("position")!;
        const wm = m.computeWorldMatrix(true);
        for (let i = 0; i < pos.length; i += 3) top = Math.max(top, Vector3.TransformCoordinates(new Vector3(pos[i]!, pos[i + 1]!, pos[i + 2]!), wm).y);
      }
      expect(top, v).toBeGreaterThan(CHARACTERS[v].height - 0.03);
      expect(top, v).toBeLessThan(CHARACTERS[v].height + 0.08);
      model.dispose();
    }
    engine.dispose();
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

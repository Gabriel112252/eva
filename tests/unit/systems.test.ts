import { describe, expect, it, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { QuestLog } from "@/narrative/quests";
import { QUESTS, QUEST_APURACAO } from "@/data/quests";
import { openStore } from "@/persistence/saveStore";
import { SaveSystem, createEmptySave, migrateSave, SAVE_SCHEMA_VERSION } from "@/persistence/saveSystem";
import { DEFAULT_SETTINGS, sanitizeSettings } from "@/core/settings";
import { cameraRelativeDirection, resolveMoveState, angleDelta } from "@/player/playerController";
import { damp } from "@/player/thirdPersonCamera";
import { pickInteractable, type Interactable } from "@/interaction/interactable";
import { InputManager } from "@/core/input";
import { joystickVector, detectTouchPreference, JOYSTICK_RADIUS, JOYSTICK_DEADZONE, JOYSTICK_RUN_THRESHOLD } from "@/ui/touchControls";
import * as synth from "@/audio/synth";

describe("QuestLog", () => {
  it("completa objetivos em ordem e encerra a missão", () => {
    const log = new QuestLog(QUESTS);
    const events: string[] = [];
    log.onChange.on((e) => events.push(e.objective?.id ?? e.state.status));
    expect(log.currentObjective()).toBeNull();
    log.start(QUEST_APURACAO);
    expect(log.currentObjective()?.objective.id).toBe("cartao");
    expect(log.completeObjective(QUEST_APURACAO, "cartao")).toBe(true);
    expect(log.completeObjective(QUEST_APURACAO, "cartao")).toBe(false);
    expect(log.currentObjective()?.objective.id).toBe("praca");
    for (const o of ["praca", "raquel", "miriam", "desfecho"]) log.completeObjective(QUEST_APURACAO, o);
    expect(log.get(QUEST_APURACAO)?.state.status).toBe("completed");
    expect(events).toContain("completed");
    const snap = log.toJSON();
    const restored = new QuestLog(QUESTS);
    restored.load(snap);
    expect(restored.get(QUEST_APURACAO)?.state).toEqual(log.get(QUEST_APURACAO)?.state);
  });
});

describe("SaveSystem (IndexedDB)", () => {
  beforeEach(() => {
    (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  });

  it("salva e recarrega flags, missões e posição", async () => {
    const store = await openStore();
    expect(store.backend).toBe("indexeddb");
    const saves = new SaveSystem(store);
    expect(await saves.hasSave()).toBe(false);
    const data = createEmptySave({ position: { x: 1, y: 0.1, z: -2 }, yaw: 1.2, crouched: true });
    data.flags = { matiasTrustsSystem: false, "apuracao.postura": "dialogo" };
    data.quests = { [QUEST_APURACAO]: { status: "active", objectives: { cartao: true, praca: false, raquel: false, miriam: false, desfecho: false } } };
    await saves.save(data);
    const loaded = await saves.load();
    expect(loaded?.version).toBe(SAVE_SCHEMA_VERSION);
    expect(loaded?.flags).toEqual(data.flags);
    expect(loaded?.player).toEqual(data.player);
    expect(loaded?.quests[QUEST_APURACAO]?.objectives.cartao).toBe(true);
    // reabrir o banco (simula refresh) mantém o save
    const saves2 = new SaveSystem(await openStore());
    expect((await saves2.load())?.flags["apuracao.postura"]).toBe("dialogo");
    await saves2.clear();
    expect(await saves2.hasSave()).toBe(false);
  });

  it("migra/rejeita saves inválidos e persiste configurações", async () => {
    expect(migrateSave(null)).toBeNull();
    expect(migrateSave({ foo: 1 })).toBeNull();
    expect(migrateSave({ version: 0, player: { position: { x: 1 } } })?.player.position).toEqual({ x: 1, y: 0, z: 0 });
    const saves = new SaveSystem(await openStore());
    expect(await saves.loadSettings()).toEqual(DEFAULT_SETTINGS);
    await saves.saveSettings({ ...DEFAULT_SETTINGS, mouseSensitivity: 9, muted: true });
    const s = await saves.loadSettings();
    expect(s.mouseSensitivity).toBe(3); // saturado no limite
    expect(s.muted).toBe(true);
    expect(sanitizeSettings({ quality: "ultra" }).quality).toBe("media");
  });
});

describe("Movimento e interação (lógica pura)", () => {
  it("converte eixo de input para direção relativa à câmera", () => {
    const f = cameraRelativeDirection({ x: 0, y: 1 }, 0);
    expect(f.x).toBeCloseTo(0);
    expect(f.z).toBeCloseTo(1);
    const r = cameraRelativeDirection({ x: 1, y: 0 }, 0);
    expect(r.x).toBeCloseTo(1);
    expect(r.z).toBeCloseTo(0);
    const turned = cameraRelativeDirection({ x: 0, y: 1 }, Math.PI / 2);
    expect(turned.x).toBeCloseTo(1);
    expect(turned.z).toBeCloseTo(0);
  });

  it("resolve estados de locomoção", () => {
    expect(resolveMoveState(false, false, false)).toBe("idle");
    expect(resolveMoveState(true, false, false)).toBe("walk");
    expect(resolveMoveState(true, true, false)).toBe("run");
    expect(resolveMoveState(false, false, true)).toBe("crouchIdle");
    expect(resolveMoveState(true, true, true)).toBe("crouchWalk");
  });

  it("calcula menor delta angular e suavização", () => {
    expect(angleDelta(0, Math.PI * 1.5)).toBeCloseTo(-Math.PI / 2);
    expect(angleDelta(-3, 3)).toBeCloseTo(-(2 * Math.PI - 6));
    const v = damp(0, 10, 5, 0.2);
    expect(v).toBeGreaterThan(5);
    expect(v).toBeLessThan(10);
  });

  it("escolhe o interagível mais próximo dentro do cone à frente", () => {
    const mk = (id: string, x: number, z: number, prompt: string | null): Interactable => ({
      id,
      radius: 2.5,
      getPosition: () => ({ x, y: 0, z }) as never,
      getPrompt: () => prompt,
      interact: () => undefined,
    });
    const list = [mk("atras", 0, -1, "Atrás"), mk("frente", 0, 1.5, "Frente"), mk("longe", 0, 4, "Longe"), mk("sem_prompt", 0, 1, null)];
    const pick = pickInteractable(list, { x: 0, z: 0 }, { x: 0, z: 1 });
    expect(pick?.target.id).toBe("frente");
    expect(pick?.prompt).toBe("Frente");
    expect(pickInteractable(list, { x: 0, z: 0 }, { x: 0, z: -1 })?.target.id).toBe("atras");
  });

  it("InputManager normaliza o eixo de movimento", () => {
    const input = new InputManager();
    input.simulate("forward", true);
    input.simulate("right", true);
    const axis = input.moveAxis();
    expect(Math.hypot(axis.x, axis.y)).toBeCloseTo(1);
    input.enabled = false;
    expect(input.moveAxis()).toEqual({ x: 0, y: 0 });
    input.enabled = true;
    input.simulate("forward", false);
    expect(input.moveAxis().y).toBe(0);
  });

  it("InputManager combina eixo analógico (joystick) com teclas e limpa em clearHeld", () => {
    const input = new InputManager();
    input.setAnalogAxis(0, 0.6);
    expect(input.moveAxis()).toEqual({ x: 0, y: 0.6 });
    // analógico + tecla: soma e normaliza
    input.simulate("right", true);
    const both = input.moveAxis();
    expect(Math.hypot(both.x, both.y)).toBeCloseTo(1);
    expect(both.x).toBeGreaterThan(0);
    expect(both.y).toBeGreaterThan(0);
    // fora do círculo unitário é normalizado; NaN vira zero
    input.simulate("right", false);
    input.setAnalogAxis(3, 4);
    expect(input.moveAxis()).toEqual({ x: 0.6, y: 0.8 });
    input.setAnalogAxis(Number.NaN, 1);
    expect(input.moveAxis()).toEqual({ x: 0, y: 1 });
    input.clearHeld();
    expect(input.moveAxis()).toEqual({ x: 0, y: 0 });
    // movimento de câmera injetado (arrastar na tela) é consumido como mouse
    input.injectMouseDelta(12, -4);
    expect(input.consumeMouseDelta()).toEqual({ dx: 12, dy: -4 });
    expect(input.consumeMouseDelta()).toEqual({ dx: 0, dy: 0 });
  });
});

describe("Controles de toque (lógica pura)", () => {
  it("joystick: zona morta, direção normalizada e anel de corrida", () => {
    const r = JOYSTICK_RADIUS;
    expect(joystickVector(0, 0)).toEqual({ x: 0, y: 0, magnitude: 0, run: false });
    // dentro da zona morta não anda
    const dead = joystickVector(r * JOYSTICK_DEADZONE * 0.5, 0);
    expect(dead.x).toBe(0);
    expect(dead.y).toBe(0);
    // polegar para cima na tela (dy negativo) = frente; meio curso anda, não corre
    const walk = joystickVector(0, -r * 0.5);
    expect(walk.x).toBeCloseTo(0);
    expect(walk.y).toBeCloseTo(1);
    expect(walk.magnitude).toBeCloseTo(0.5);
    expect(walk.run).toBe(false);
    // diagonal além do limiar: direção unitária e corrida
    const run = joystickVector(r * 1.4, -r * 1.4);
    expect(Math.hypot(run.x, run.y)).toBeCloseTo(1);
    expect(run.x).toBeCloseTo(Math.SQRT1_2);
    expect(run.y).toBeCloseTo(Math.SQRT1_2);
    expect(run.magnitude).toBe(1);
    expect(run.run).toBe(true);
    const edge = joystickVector(0, r * JOYSTICK_RUN_THRESHOLD);
    expect(edge.y).toBeCloseTo(-1);
    expect(edge.run).toBe(true);
    // entrada inválida não propaga NaN
    expect(joystickVector(Number.NaN, 0).x).toBe(0);
  });

  it("detecta preferência por toque pelo ponteiro grosso e pelo parâmetro ?touch", () => {
    const fake = (search: string, maxTouchPoints: number, coarse: boolean) =>
      ({
        location: { search },
        navigator: { maxTouchPoints },
        matchMedia: (q: string) => ({ matches: coarse && q.includes("coarse") }),
      }) as unknown as Window;
    expect(detectTouchPreference(fake("", 5, true))).toBe(true); // celular
    expect(detectTouchPreference(fake("", 0, false))).toBe(false); // desktop
    expect(detectTouchPreference(fake("", 10, false))).toBeNull(); // notebook com tela sensível: decide no 1º toque
    expect(detectTouchPreference(fake("?touch=1", 0, false))).toBe(true);
    expect(detectTouchPreference(fake("?touch=0", 5, true))).toBe(false);
  });
});

describe("Áudio sintetizado", () => {
  const sr = 22050;
  it("gera buffers válidos (sem NaN, com energia) e loops contínuos", () => {
    const buffers = [
      synth.footstep(sr, "walk", 1),
      synth.footstep(sr, "run", 2),
      synth.footstep(sr, "crouch", 3),
      synth.windLoop(sr, 2, 4),
      synth.generatorLoop(sr, 1, 5),
      synth.crowdLoop(sr, 2, 6),
      synth.radioStaticLoop(sr, 1, 7),
      synth.fluorescentBuzz(sr, 0.5),
      synth.click(sr),
      synth.chime(sr),
      synth.paperRustle(sr),
    ];
    for (const b of buffers) {
      for (const ch of b.channels) {
        expect(ch.length).toBeGreaterThan(100);
        expect(ch.every((v) => Number.isFinite(v) && Math.abs(v) <= 1)).toBe(true);
        expect(synth.rms(ch)).toBeGreaterThan(0.01);
      }
    }
    const loop = synth.generatorLoop(sr, 1, 5).channels[0]!;
    expect(Math.abs((loop[loop.length - 1] ?? 0) - (loop[0] ?? 0))).toBeLessThan(0.08);
  });
});

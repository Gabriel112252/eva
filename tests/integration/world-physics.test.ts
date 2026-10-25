import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import type { Scene } from "@babylonjs/core/scene";
import { buildWorld, type World } from "@/world/worldBuilder";
import { Environment } from "@/world/environment";
import { STREET } from "@/world/street";
import { WORKSHOP } from "@/world/workshop";
import { loadCharacter } from "@/characters/characterModel";
import { Npc } from "@/characters/npc";
import { PlayerController, PLAYER_SPEEDS } from "@/player/playerController";
import { ThirdPersonCamera } from "@/player/thirdPersonCamera";
import { InputManager } from "@/core/input";
import { pickInteractable } from "@/interaction/interactable";
import { characterDataUrl, createHeadlessScene } from "../helpers/headless";

let engine: NullEngine;
let scene: Scene;
let world: World;
let player: PlayerController;
let camera: ThirdPersonCamera;
const input = new InputManager();
const DT = 1 / 60;

function step(frames: number, camYaw = 0): void {
  for (let i = 0; i < frames; i++) {
    player.update(DT, input, camYaw);
    camera.update(DT, input, player.feet, player.eyeHeight);
    scene.render();
  }
}

beforeAll(async () => {
  ({ engine, scene } = await createHeadlessScene(true));
  new Environment(scene, "baixa");
  world = buildWorld(scene, "baixa");
  const matias = await loadCharacter(scene, "matias", "", characterDataUrl("matias"));
  const spawn = world.spawns.get("oficina")!;
  player = new PlayerController(scene, matias, spawn.position, spawn.yaw);
  camera = new ThirdPersonCamera(scene, spawn.yaw);
  scene.activeCamera = camera.camera;
  step(30); // assenta no chão
});

afterAll(() => {
  engine.dispose();
});

describe("Mundo 3D + física Havok (headless)", () => {
  it("constrói o quarteirão com geometria, colisores e pontos de interesse", () => {
    expect(scene.meshes.length).toBeGreaterThan(40);
    expect(world.ctx.colliderNodes.length).toBeGreaterThan(60);
    expect(world.shadowCasters.length).toBeGreaterThan(10);
    for (const key of ["oficina", "praca", "miriam", "custodio", "comerciante", "raquel", "ana"]) expect(world.spawns.has(key), key).toBe(true);
    expect(world.emitters.map((e) => e.kind)).toEqual(expect.arrayContaining(["generator", "crowd", "radio", "flicker"]));
    expect(world.workshop.radio).toBeDefined();
    expect(world.workshop.card).toBeDefined();
  });

  it("Matias nasce em pé dentro da oficina, apoiado no chão", () => {
    const feet = player.feet;
    expect(feet.x).toBeGreaterThan(WORKSHOP.x0);
    expect(feet.x).toBeLessThan(WORKSHOP.x1);
    expect(feet.z).toBeLessThan(WORKSHOP.zFront);
    expect(feet.z).toBeGreaterThan(WORKSHOP.zBack);
    expect(feet.y).toBeGreaterThan(0.05);
    expect(feet.y).toBeLessThan(0.4);
    expect(player.state).toBe("idle");
    expect(player.model.animator.clip).toBe("Idle");
  });

  it("anda para frente (W) com a animação Walk e para ao soltar", () => {
    const before = player.feet.clone();
    input.simulate("forward", true);
    step(90); // 1,5 s
    const after = player.feet.clone();
    const dist = Vector3.Distance(new Vector3(before.x, 0, before.z), new Vector3(after.x, 0, after.z));
    expect(dist).toBeGreaterThan(1.2);
    expect(dist).toBeLessThan(PLAYER_SPEEDS.walk * 1.6);
    expect(player.state).toBe("walk");
    expect(player.model.animator.clip).toBe("Walk");
    input.simulate("forward", false);
    step(60);
    expect(player.state).toBe("idle");
    const stopped = player.feet.clone();
    step(30);
    expect(Vector3.Distance(stopped, player.feet)).toBeLessThan(0.05);
  });

  it("corre com Shift mais rápido do que anda e emite passos", () => {
    let steps = 0;
    const off = player.onFootstep.on(() => steps++);
    const yawToDoor = 0; // porta ao norte (+Z)
    input.simulate("forward", true);
    input.simulate("run", true);
    const start = player.feet.clone();
    step(60, yawToDoor);
    const dist = Vector3.Distance(new Vector3(start.x, 0, start.z), new Vector3(player.feet.x, 0, player.feet.z));
    input.simulate("run", false);
    input.simulate("forward", false);
    off();
    expect(player.state === "run" || dist > PLAYER_SPEEDS.walk).toBe(true);
    expect(dist).toBeGreaterThan(PLAYER_SPEEDS.walk * 0.8);
    expect(steps).toBeGreaterThan(0);
  });

  it("colide com paredes da oficina (não atravessa)", () => {
    // teleporta para perto da parede oeste e empurra contra ela
    player.teleport(new Vector3(WORKSHOP.x0 + 1.6, 0.2, (WORKSHOP.zFront + WORKSHOP.zBack) / 2), -Math.PI / 2);
    step(10);
    input.simulate("forward", true);
    step(120, -Math.PI / 2); // câmera olhando para -X
    input.simulate("forward", false);
    expect(player.feet.x).toBeGreaterThan(WORKSHOP.x0 + 0.3); // parede tem 0,3 m + raio da cápsula
    step(20);
  });

  it("sobe o meio-fio (degrau de 12 cm) da calçada para a rua e volta", () => {
    const zCurb = -(STREET.halfWidth + 1.0);
    player.teleport(new Vector3(-26, STREET.curbHeight + 0.05, zCurb), 0);
    step(20);
    expect(player.feet.y).toBeGreaterThan(STREET.curbHeight - 0.06);
    input.simulate("forward", true);
    step(120, 0); // anda para +Z: desce da calçada para o asfalto
    input.simulate("forward", false);
    step(30);
    expect(player.feet.z).toBeGreaterThan(-STREET.halfWidth);
    expect(player.feet.y).toBeLessThan(0.06);
    // volta e sobe o degrau
    input.simulate("back", true);
    step(150, 0);
    input.simulate("back", false);
    step(30);
    expect(player.feet.z).toBeLessThan(-STREET.halfWidth + 0.2);
    expect(player.feet.y).toBeGreaterThan(STREET.curbHeight - 0.06);
  });

  it("agacha (cápsula menor, CrouchIdle) e não levanta sob a mesa da oficina", () => {
    player.teleport(new Vector3(-20, 0.05, 0), 0);
    step(10);
    expect(player.setCrouched(true)).toBe(true);
    step(20);
    expect(player.crouched).toBe(true);
    expect(player.state).toBe("crouchIdle");
    expect(player.eyeHeight).toBeLessThan(1.2);
    expect(player.canStandUp()).toBe(true);
    expect(player.setCrouched(false)).toBe(true);
    step(10);
    expect(player.state).toBe("idle");
    // sob a laje da cobertura do posto a 3,4 m há espaço; sob a bancada (0,95 m) não há
    player.setCrouched(true);
    const benchX = WORKSHOP.x0 + 0.75;
    player.teleport(new Vector3(benchX, 0.15, (WORKSHOP.zFront + WORKSHOP.zBack) / 2 - 0.5), 0);
    step(5);
    expect(player.canStandUp()).toBe(false);
    expect(player.setCrouched(false)).toBe(false);
    player.teleport(new Vector3(-20, 0.05, 0), 0);
    step(5);
    expect(player.setCrouched(false)).toBe(true);
  });

  it("NPC rigado é carregado, bloqueia o jogador e oferece prompt de interação", async () => {
    const model = await loadCharacter(scene, "miriam", "", characterDataUrl("miriam"));
    const npc = new Npc(scene, model, new Vector3(-10, 0.0, 0), Math.PI);
    expect(npc.getPrompt()).toBe("Falar com Miriam");
    player.teleport(new Vector3(-10, 0.05, -3), 0);
    step(10);
    input.simulate("forward", true);
    step(150, 0);
    input.simulate("forward", false);
    step(10);
    // a cápsula do NPC impede atravessá-lo
    expect(player.feet.z).toBeLessThan(-0.3);
    const pick = pickInteractable([npc], { x: player.feet.x, z: player.feet.z }, player.forward, 0.2);
    expect(pick?.target).toBe(npc);
    // NPC virou-se para o jogador
    npc.update(1, player.feet);
    npc.update(1, player.feet);
    expect(npc.facing.z).toBeLessThan(-0.5);
    npc.setTalking(true);
    expect(npc.model.animator.clip).toBe("Talk");
    npc.dispose();
  });

  it("câmera em terceira pessoa fica atrás do personagem e não entra nas paredes", () => {
    player.teleport(new Vector3(WORKSHOP.x0 + 1.2, 0.05, WORKSHOP.zBack + 1.0), 0);
    camera.setFollow();
    camera.snapBehind(0);
    step(60);
    const cam = camera.camera.position;
    expect(cam.z).toBeLessThan(player.feet.z); // atrás (olhando para +Z)
    expect(cam.z).toBeGreaterThan(WORKSHOP.zBack - 0.05); // não atravessa a parede do fundo
    expect(cam.y).toBeGreaterThan(0.3);
  });
});

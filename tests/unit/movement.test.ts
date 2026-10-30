import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import type { Scene } from "@babylonjs/core/scene";
import { buildWorld } from "@/world/worldBuilder";
import { Environment } from "@/world/environment";
import { STREET } from "@/world/street";
import { loadCharacter } from "@/characters/characterModel";
import { MOVEMENT_CLIPS } from "@/data/characters";
import { PlayerController } from "@/player/playerController";
import { ThirdPersonCamera } from "@/player/thirdPersonCamera";
import { characterDataUrl, createHeadlessScene, ROOT } from "../helpers/headless";
import {
  MOVEMENT_NOISE,
  MOVEMENT_TUNING,
  MovementStateMachine,
  apexAccelRate,
  classifyLanding,
  landingNoise,
  landingShake,
  rollSpeedAt,
  sprintCharge,
  type MotionEvent,
  type MotionSample,
} from "@/player/movement";
import { InputManager } from "@/core/input";
import { turnRateFor, PLAYER_SPEEDS } from "@/player/playerController";
import type { GameAction } from "@/core/input";

const DT = 1 / 60;
const ground = (y = 0): MotionSample => ({ grounded: true, y, vy: 0, locked: false });
const air = (y: number, vy = 0): MotionSample => ({ grounded: false, y, vy, locked: false });
const types = (ev: MotionEvent[]) => ev.map((e) => e.type);

/** Avança `n` quadros com o mesmo apoio e junta os eventos. */
function run(m: MovementStateMachine, n: number, s: MotionSample): MotionEvent[] {
  const all: MotionEvent[] = [];
  for (let i = 0; i < n; i++) all.push(...m.update(DT, s));
  return all;
}

describe("Movimento de ação — máquina de estados (lógica pura)", () => {
  it("pula do chão, ignora o apoio no impulso, aterrissa e reconhece a queda", () => {
    const m = new MovementStateMachine();
    run(m, 5, ground());
    m.requestJump();
    const ev = m.update(DT, ground());
    expect(ev).toEqual([{ type: "jump", double: false, fromSlide: false, fromRoll: false, coyote: false }]);
    expect(m.phase).toBe("air");
    // no 1º quadro após o impulso o Havok ainda acusa apoio: não pode "aterrissar" ali
    expect(types(m.update(DT, { grounded: true, y: 0.02, vy: 6, locked: false }))).toEqual([]);
    expect(m.airborne).toBe(true);
    run(m, 20, air(1.2, 1));
    const land = m.update(DT, ground(0));
    expect(land[0]?.type).toBe("land");
    const l = land[0] as Extract<MotionEvent, { type: "land" }>;
    expect(l.drop).toBeCloseTo(1.2, 5);
    expect(l.impact).toBe("soft");
    expect(m.phase).toBe("ground");
  });

  it("pulo duplo: uma vez por salto; o segundo aperto no ar só vale depois do coiote", () => {
    const m = new MovementStateMachine();
    m.requestJump();
    m.update(DT, ground());
    run(m, 10, air(0.6, 4));
    m.requestJump();
    const ev = run(m, 2, air(0.9, 3));
    expect(ev.filter((e) => e.type === "jump")).toEqual([{ type: "jump", double: true, fromSlide: false, fromRoll: false, coyote: false }]);
    expect(m.doubleJumpUsed).toBe(true);
    // terceiro aperto no ar: nada (fica no buffer e expira)
    m.requestJump();
    const none = run(m, 20, air(1.5, -1));
    expect(none.some((e) => e.type === "jump")).toBe(false);
    // ao tocar o chão o pulo duplo volta
    m.update(DT, ground());
    expect(m.doubleJumpUsed).toBe(false);
  });

  it("tempo de coiote: pular logo depois de sair da borda conta como pulo do chão", () => {
    const m = new MovementStateMachine();
    run(m, 3, ground(2));
    // saiu da borda: 0,08 s sem apoio
    run(m, 5, air(1.98, -0.5));
    expect(m.phase).toBe("ground");
    m.requestJump();
    const ev = m.update(DT, air(1.97, -0.6));
    expect(ev[0]).toMatchObject({ type: "jump", double: false, coyote: true });
    // passado o coiote, a mesma situação vira queda e o aperto vira o pulo de ar
    const m2 = new MovementStateMachine();
    run(m2, 3, ground(2));
    const fall = run(m2, 10, air(1.9, -1.5));
    expect(types(fall)).toContain("fall");
    m2.requestJump();
    expect(m2.update(DT, air(1.8, -2))[0]).toMatchObject({ type: "jump", double: true });
  });

  it("buffer de pulo: apertar um pouco antes de tocar o chão pula na aterrissagem", () => {
    const m = new MovementStateMachine();
    m.requestJump();
    m.update(DT, ground());
    run(m, 15, air(1, 2));
    m.requestJump(); // pulo duplo
    m.update(DT, air(1.1, 1));
    run(m, 20, air(0.5, -6));
    m.requestJump(); // sem pulo duplo: fica guardado
    run(m, 4, air(0.1, -8)); // 0,067 s depois...
    const ev = m.update(DT, ground());
    expect(types(ev)).toEqual(["land", "jump"]);
    // fora da janela (0,15 s) o aperto expira
    const m2 = new MovementStateMachine();
    m2.requestJump();
    m2.update(DT, ground());
    m2.update(DT, air(0.3, 3));
    run(m2, 12, air(0.8, 1));
    m2.requestJump();
    m2.update(DT, air(0.9, 0.5));
    m2.requestJump();
    run(m2, 15, air(0.4, -6)); // 0,25 s
    expect(types(m2.update(DT, ground()))).toEqual(["land"]);
  });

  it("esquiva no chão rola por rollDuration e respeita a recarga de 1,1 s (contada do início)", () => {
    const m = new MovementStateMachine();
    m.requestDodge();
    expect(types(m.update(DT, ground()))).toEqual(["roll"]);
    expect(m.phase).toBe("roll");
    const during = run(m, Math.ceil(MOVEMENT_TUNING.rollDuration / DT), ground());
    expect(types(during)).toContain("rollEnd");
    expect(m.phase).toBe("ground");
    // recarga ainda correndo
    m.requestDodge();
    expect(m.update(DT, ground())).toEqual([{ type: "dodgeDenied", reason: "cooldown" }]);
    expect(m.dodgeCooldownLeft).toBeGreaterThan(0.4);
    run(m, Math.ceil((MOVEMENT_TUNING.dodgeCooldown - MOVEMENT_TUNING.rollDuration) / DT) + 2, ground());
    expect(m.dodgeCooldownLeft).toBe(0);
    m.requestDodge();
    expect(types(m.update(DT, ground()))).toEqual(["roll"]);
  });

  it("impulso no ar: uma vez por salto, divide a recarga com o rolamento, e o pulo emenda no fim do rolamento", () => {
    const m = new MovementStateMachine();
    m.requestJump();
    m.update(DT, ground());
    run(m, 10, air(0.8, 3));
    m.requestDodge();
    expect(types(m.update(DT, air(0.9, 2)))).toEqual(["airDash"]);
    expect(m.phase).toBe("airDash");
    expect(types(run(m, Math.ceil(MOVEMENT_TUNING.airDashDuration / DT) + 1, air(1, 0)))).toContain("airDashEnd");
    expect(m.phase).toBe("air");
    m.requestDodge();
    expect(m.update(DT, air(1, -1))).toEqual([{ type: "dodgeDenied", reason: "cooldown" }]);
    // aterrissa, espera a recarga: no ar de novo, o impulso volta
    m.update(DT, ground());
    run(m, 70, ground());
    m.requestDodge();
    // no chão vira rolamento; a partir da metade dá para pular dele
    expect(types(m.update(DT, ground()))).toEqual(["roll"]);
    m.requestJump();
    const early = m.update(DT, ground());
    expect(early.some((e) => e.type === "jump")).toBe(false);
    // o aperto cedo demais expira (buffer de 0,15 s); apertado perto da janela, emenda assim que ela abre
    run(m, Math.floor((MOVEMENT_TUNING.rollDuration * MOVEMENT_TUNING.rollJumpFrom) / DT) - 6, ground());
    expect(m.phase).toBe("roll");
    m.requestJump();
    const later = run(m, 8, ground());
    expect(types(later)).toEqual(["rollEnd", "jump"]);
    expect(later[1]).toMatchObject({ fromRoll: true });
  });

  it("deslize: só correndo no chão; desacelera por atrito e termina agachado; rampa abaixo prolonga", () => {
    const m = new MovementStateMachine();
    expect(m.tryStartSlide(PLAYER_SPEEDS.walk, true)).toBe(false);
    expect(m.tryStartSlide(PLAYER_SPEEDS.run, false)).toBe(false);
    expect(m.tryStartSlide(PLAYER_SPEEDS.run, true)).toBe(true);
    expect(m.phase).toBe("slide");
    expect(m.slideSpeed).toBeCloseTo(PLAYER_SPEEDS.run * MOVEMENT_TUNING.slideBoost, 5);
    let t = 0;
    let end: MotionEvent | undefined;
    while (!end && t < 3) {
      end = m.update(DT, ground()).find((e) => e.type === "slideEnd");
      t += DT;
    }
    expect(end).toMatchObject({ type: "slideEnd" });
    expect(t).toBeGreaterThan(0.5);
    expect(t).toBeLessThan(MOVEMENT_TUNING.slideMaxTime + 0.05);
    expect(m.phase).toBe("ground");
    // descendo uma rampa a velocidade se mantém e o tempo máximo não corta
    const d = new MovementStateMachine();
    d.tryStartSlide(PLAYER_SPEEDS.run, true);
    run(d, 90, { ...ground(), slopeAccel: 6 });
    expect(d.phase).toBe("slide");
    // pular no deslize emenda (sai do deslize com o embalo)
    d.requestJump();
    expect(types(d.update(DT, ground()))).toEqual(["slideEnd", "jump"]);
    // sem espaço para ficar de pé, não pula
    const low = new MovementStateMachine();
    low.tryStartSlide(PLAYER_SPEEDS.run, true);
    low.requestJump();
    expect(low.update(DT, { ...ground(), canJump: false }).some((e) => e.type === "jump")).toBe(false);
    expect(low.cancelSlide()).toBe(true);
  });

  it("travado (diálogo/menu) descarta pedidos; reset volta ao chão sem eventos", () => {
    const m = new MovementStateMachine();
    m.requestJump();
    m.requestDodge();
    expect(m.update(DT, { ...ground(), locked: true })).toEqual([]);
    expect(m.update(DT, ground())).toEqual([]);
    m.requestJump();
    m.update(DT, ground());
    m.reset(3);
    expect(m.phase).toBe("ground");
    expect(m.update(DT, ground(3))).toEqual([]);
  });

  it("aterrissagem: degrau não conta; suave, pesada e dura por altura; ruído e tranco crescem", () => {
    expect(classifyLanding(0.2)).toBeNull();
    expect(classifyLanding(1.2)).toBe("soft");
    expect(classifyLanding(2.4)).toBe("heavy");
    expect(classifyLanding(6)).toBe("hard");
    expect(classifyLanding(Number.NaN)).toBeNull();
    expect(landingNoise(null)).toBe(0);
    expect(landingNoise("soft")).toBeLessThan(landingNoise("heavy"));
    expect(landingNoise("heavy")).toBeLessThan(landingNoise("hard"));
    expect(landingShake("soft")).toBeLessThan(landingShake("hard"));
    // ruídos coerentes com a furtividade: aterrissagem e rolamento audíveis (≥ andar, 9 m), deslize médio
    expect(MOVEMENT_NOISE.landSoft).toBeGreaterThanOrEqual(9);
    expect(MOVEMENT_NOISE.roll).toBeGreaterThanOrEqual(9);
    expect(MOVEMENT_NOISE.slide).toBeGreaterThan(4);
    expect(MOVEMENT_NOISE.slide).toBeLessThan(9);
  });

  it("curvas, rolamento e embalo: números de controle", () => {
    // curva de aceleração do ápice: mais rápida parado, igual à base no alvo
    expect(apexAccelRate(12, 0)).toBeCloseTo(26.4, 5);
    expect(apexAccelRate(12, 1)).toBe(12);
    // rolamento: velocidade cheia no começo, termina na velocidade da locomoção
    expect(rollSpeedAt(0.1, 0)).toBe(MOVEMENT_TUNING.rollSpeed);
    expect(rollSpeedAt(MOVEMENT_TUNING.rollDuration, PLAYER_SPEEDS.run)).toBeCloseTo(PLAYER_SPEEDS.run, 5);
    expect(rollSpeedAt(MOVEMENT_TUNING.rollDuration, 0)).toBeCloseTo(0, 5);
    // embalo acumula só elegível
    expect(sprintCharge(0.5, 0.1, true)).toBeCloseTo(0.6, 5);
    expect(sprintCharge(0.5, 0.1, false)).toBe(0);
    // curva quase instantânea andando, com embalo no sprint
    expect(turnRateFor(PLAYER_SPEEDS.walk)).toBe(20);
    expect(turnRateFor(PLAYER_SPEEDS.sprint)).toBeCloseTo(9, 5);
    // alturas: pulo ~1,3 m; pulo duplo no ápice passa de 2,2 m
    const h1 = MOVEMENT_TUNING.jumpVelocity ** 2 / (2 * MOVEMENT_TUNING.riseGravity);
    const h2 = MOVEMENT_TUNING.doubleJumpVelocity ** 2 / (2 * MOVEMENT_TUNING.riseGravity);
    expect(h1).toBeGreaterThan(1.1);
    expect(h1 + h2).toBeGreaterThan(2.2);
  });

  it("InputManager: Espaço vira avançar + pular; apertos são consumidos uma vez e limpos com clearHeld", () => {
    const input = new InputManager();
    // o tratador de teclado é uma função-propriedade: chamada direta, sem DOM
    const key = (input as unknown as { keyDown: (e: unknown) => void; keyUp: (e: unknown) => void });
    const seen: string[] = [];
    input.onAction.on((a) => seen.push(a));
    key.keyDown({ code: "Space", repeat: false, preventDefault() {} });
    expect(seen).toEqual(["advance", "jump"]);
    expect(input.isHeld("advance") && input.isHeld("jump")).toBe(true);
    key.keyUp({ code: "Space" });
    expect(input.isHeld("jump")).toBe(false);
    key.keyDown({ code: "KeyQ", repeat: false, preventDefault() {} });
    key.keyDown({ code: "Enter", repeat: false, preventDefault() {} });
    expect(seen.slice(2)).toEqual(["dodge", "advance"]);
    expect(input.consumePress("dodge")).toBe(true);
    expect(input.consumePress("jump")).toBe(true);
    expect(input.consumePress("jump")).toBe(false);
    input.simulate("jump", true);
    input.simulate("jump", true); // segurar não conta de novo
    expect(input.consumePress("jump")).toBe(true);
    expect(input.consumePress("jump")).toBe(false);
    input.simulate("jump", false);
    input.simulate("dodge", true);
    input.simulate("dodge", false);
    input.clearHeld();
    expect(input.consumePress("dodge")).toBe(false);
    input.enabled = false;
    input.simulate("jump", true);
    expect(input.consumePress("jump")).toBe(false);
    input.enabled = true;
    expect(input.consumePress("jump")).toBe(false);
  });
});

describe("Movimento de ação — física Havok headless (PlayerController + biblioteca de clipes)", () => {
  let engine: NullEngine;
  let scene: Scene;
  let player: PlayerController;
  let camera: ThirdPersonCamera;
  let clips: string[] = [];
  const input = new InputManager();
  const events: MotionEvent[] = [];
  const FDT = 1 / 30; // mesmo passo dos testes de navegador (captura a 30 fps)
  /** rua de 8 m de largura, livre de x=-48 a x=14: corre para oeste (câmera olhando para -X) */
  const YAW = -Math.PI / 2;
  const START = new Vector3(-14, 0.02, 0);
  let maxY = -Infinity;
  const step = (n: number) => {
    for (let i = 0; i < n; i++) {
      player.update(FDT, input, YAW);
      camera.update(FDT, input, player.feet, player.eyeHeight);
      scene.render();
      maxY = Math.max(maxY, player.feet.y);
    }
  };
  const tap = (a: GameAction) => {
    input.simulate(a, true);
    step(1);
    input.simulate(a, false);
  };
  const reset = (at = START) => {
    input.clearHeld();
    if (player.crouched) player.setCrouched(false);
    player.teleport(at, YAW);
    step(12);
    events.length = 0;
    maxY = -Infinity;
  };

  beforeAll(async () => {
    ({ engine, scene } = await createHeadlessScene(true));
    new Environment(scene, "baixa");
    buildWorld(scene, "baixa");
    const matias = await loadCharacter(scene, "matias", "", characterDataUrl("matias"));
    player = new PlayerController(scene, matias, START, YAW);
    camera = new ThirdPersonCamera(scene, YAW);
    scene.activeCamera = camera.camera;
    player.attachCamera(camera);
    const glb = readFileSync(resolve(ROOT, "public/assets/characters/matias_movimento.glb"));
    clips = await player.loadMovementClips(`data:model/gltf-binary;base64,${glb.toString("base64")}`);
    player.onMotion.on((e) => events.push(e));
    step(20);
  });

  afterAll(() => {
    engine.dispose();
  });

  it("liga os clipes de movimento da biblioteca ao esqueleto de Matias (sem mexer nos clipes do GLB)", () => {
    expect([...clips].sort()).toEqual([...MOVEMENT_CLIPS].sort());
    for (const c of MOVEMENT_CLIPS) expect(player.model.animator.has(c), c).toBe(true);
    expect(player.model.animator.has("Walk")).toBe(true);
  });

  it("pulo sobe ~1,3 m, toca JumpStart/JumpLoop e volta ao chão sem atravessá-lo", () => {
    reset();
    const y0 = player.feet.y;
    tap("jump");
    expect(player.airborne).toBe(true);
    expect(player.model.animator.oneShotClip).toBe("JumpStart");
    step(10);
    expect(player.model.animator.clip).toBe("JumpLoop");
    step(30);
    expect(maxY - y0).toBeGreaterThan(1.0);
    expect(maxY - y0).toBeLessThan(1.6);
    expect(player.airborne).toBe(false);
    expect(Math.abs(player.feet.y - y0)).toBeLessThan(0.03);
    expect(events.map((e) => e.type)).toEqual(["jump", "land"]);
    expect(player.lastLanding?.impact).toBe("soft");
  });

  it("pulo duplo alcança mais altura que o simples; aterrissagem pesada dá tranco de câmera e ruído audível", () => {
    reset();
    const y0 = player.feet.y;
    tap("jump");
    step(9);
    tap("jump");
    step(8);
    const peakSoFar = maxY - y0;
    step(40);
    expect(events.filter((e) => e.type === "jump").length).toBe(2);
    expect(peakSoFar).toBeGreaterThan(2.0);
    const land = events.find((e) => e.type === "land") as Extract<MotionEvent, { type: "land" }>;
    expect(land.impact).toBe("heavy");
    expect(Math.abs(player.feet.y - y0)).toBeLessThan(0.03);
    // ruído da aterrissagem segue audível por um instante; o tranco já passou
    expect(camera.impactOffset).toBeLessThan(0.01);
    tap("jump");
    step(9);
    tap("jump");
    for (let i = 0; i < 60 && player.airborne; i++) step(1);
    expect(player.noiseRadius).toBeGreaterThanOrEqual(MOVEMENT_NOISE.landHeavy);
    step(1);
    expect(camera.impactOffset).toBeLessThan(-0.01);
  });

  it("esquiva rola mais de 2 m (cápsula baixa), nega durante a recarga e volta depois de 1,1 s", () => {
    reset();
    const a = player.feet.clone();
    tap("dodge");
    expect(player.motionPhase).toBe("roll");
    expect(player.model.animator.oneShotClip).toBe("Roll");
    expect(player.noiseRadius).toBeGreaterThanOrEqual(MOVEMENT_NOISE.roll);
    step(19);
    expect(Vector3.Distance(a, player.feet)).toBeGreaterThan(2.0);
    expect(player.motionPhase).toBe("ground");
    expect(player.eyeHeight).toBeGreaterThan(1.4); // levantou no fim (espaço livre)
    const b = player.feet.clone();
    tap("dodge");
    step(6);
    expect(events.some((e) => e.type === "dodgeDenied")).toBe(true);
    expect(Vector3.Distance(b, player.feet)).toBeLessThan(0.05);
    step(15);
    const c = player.feet.clone();
    tap("dodge");
    step(19);
    expect(Vector3.Distance(c, player.feet)).toBeGreaterThan(2.0);
  });

  it("corrida engata o embalo no plano; Ctrl correndo desliza mais longe do que agachado e termina agachado", () => {
    reset();
    input.simulate("forward", true);
    input.simulate("run", true);
    step(24);
    expect(player.speed).toBeCloseTo(PLAYER_SPEEDS.run, 1);
    step(36);
    expect(player.sprinting).toBe(true);
    expect(player.speed).toBeGreaterThan(PLAYER_SPEEDS.run + 1);
    expect(player.model.animator.clip).toBe("Sprint");
    const a = player.feet.clone();
    input.simulate("crouchHold", true);
    step(1);
    expect(player.motionPhase).toBe("slide");
    expect(player.noiseRadius).toBeGreaterThanOrEqual(MOVEMENT_NOISE.slide);
    step(44);
    const slid = Math.hypot(player.feet.x - a.x, player.feet.z - a.z);
    expect(slid).toBeGreaterThan(4); // agachado andaria 1,2 m no mesmo tempo
    expect(player.motionPhase).toBe("ground");
    expect(player.crouched).toBe(true);
    expect(player.state).toBe("crouchWalk");
    input.simulate("crouchHold", false);
    input.simulate("run", false);
    input.simulate("forward", false);
    expect(player.setCrouched(false)).toBe(true);
  });

  it("descer o meio-fio correndo é encaixe, não queda; cair de 6 m aterrissa duro sem atravessar o chão", () => {
    reset(new Vector3(-30, STREET.curbHeight + 0.02, -(STREET.halfWidth + 2)));
    // câmera olhando para -X: "direita" é +Z, da calçada sul para a rua
    input.simulate("run", true);
    input.simulate("right", true);
    step(30);
    input.simulate("right", false);
    input.simulate("run", false);
    expect(player.feet.z).toBeGreaterThan(-STREET.halfWidth + 0.5);
    expect(events.some((e) => e.type === "fall" || e.type === "land")).toBe(false);
    reset();
    const ground = player.feet.y;
    player.teleport(new Vector3(START.x, ground + 6, START.z), YAW);
    step(50);
    expect(player.airborne).toBe(false);
    expect(player.lastLanding?.impact).toBe("hard");
    expect(player.feet.y).toBeGreaterThan(ground - 0.03);
    expect(player.feet.y).toBeLessThan(ground + 0.05);
  });

  it("impulso no ar empurra na horizontal e o FOV abre com a velocidade", () => {
    reset();
    const a = player.feet.clone();
    tap("jump");
    step(5);
    tap("dodge");
    expect(player.motionPhase).toBe("airDash");
    step(30);
    expect(Math.hypot(player.feet.x - a.x, player.feet.z - a.z)).toBeGreaterThan(3);
    reset();
    input.simulate("forward", true);
    input.simulate("run", true);
    step(70);
    expect(camera.motionFov).toBeGreaterThan(0.08);
    expect(camera.camera.fov).toBeGreaterThan(0.95 + 0.05);
    input.clearHeld();
    step(40);
    expect(camera.motionFov).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { AWARENESS_DEFAULTS, awarenessLevel, createAwareness, curfewVision, CUSTODIO_VISION, inVisionCone, noiseRadiusFor, stepAwareness, type Awareness, type AwarenessEvent } from "@/ai/stealth";
import { REPAIR_DEFAULTS, RepairMinigame } from "@/interaction/repair";

/** Avança a máquina `seconds` segundos em passos de 1/30 s com a mesma entrada; devolve os eventos. */
function run(a: Awareness, seconds: number, input: { sees?: boolean; heard?: boolean; proximity?: number; atLastKnown?: boolean }): { a: Awareness; events: AwarenessEvent[] } {
  const events: AwarenessEvent[] = [];
  const dt = 1 / 30;
  let cur = a;
  for (let t = 0; t < seconds - 1e-9; t += dt) {
    const r = stepAwareness(cur, { sees: input.sees ?? false, heard: input.heard ?? false, proximity: input.proximity ?? 0, atLastKnown: input.atLastKnown ?? false, dt });
    cur = r.next;
    if (r.event) events.push(r.event);
  }
  return { a: cur, events };
}

describe("Furtividade: máquina de percepção do Custódio", () => {
  it("calmo → suspeito ao ver; confirma (detectou) depois de ~2 s olhando de longe", () => {
    let r = run(createAwareness(), 0.5, { sees: true });
    expect(r.a.state).toBe("suspeito");
    expect(r.events).toEqual(["suspeitou"]);
    expect(r.a.suspicion).toBeGreaterThan(0.2);
    expect(r.a.suspicion).toBeLessThan(0.4);
    r = run(r.a, 1.0, { sees: true });
    expect(r.a.state).toBe("suspeito"); // 1,5 s: ainda não
    r = run(r.a, 0.7, { sees: true });
    expect(r.a.state).toBe("perseguicao");
    expect(r.events).toEqual(["detectou"]);
    expect(awarenessLevel(r.a)).toBe(1);
  });

  it("perto confirma mais rápido", () => {
    const far = run(createAwareness(), 1.2, { sees: true, proximity: 0 });
    const near = run(createAwareness(), 1.2, { sees: true, proximity: 1 });
    expect(far.a.state).toBe("suspeito");
    expect(near.a.state).toBe("perseguicao");
  });

  it("perde de vista antes de confirmar → alerta (procura) → calmo depois de procurar no último ponto", () => {
    let r = run(createAwareness(), 1.0, { sees: true }); // ~0,5 de suspeita
    expect(r.a.state).toBe("suspeito");
    r = run(r.a, AWARENESS_DEFAULTS.graceTime + 0.1, { sees: false });
    expect(r.a.state).toBe("alerta");
    expect(r.events).toContain("perdeu");
    // ainda não chegou ao último ponto: continua procurando
    r = run(r.a, 3, { atLastKnown: false });
    expect(r.a.state).toBe("alerta");
    // chegou: espera searchTime e acalma
    r = run(r.a, AWARENESS_DEFAULTS.searchTime + 0.1, { atLastKnown: true });
    expect(r.a.state).toBe("calmo");
    expect(r.events).toEqual(["acalmou"]);
  });

  it("um vislumbre curto volta direto a calmo; barulho leva a alerta; em alerta ver de novo confirma mais rápido", () => {
    let r = run(createAwareness(), 0.2, { sees: true }); // suspeita baixa
    r = run(r.a, AWARENESS_DEFAULTS.graceTime + 0.1, { sees: false });
    expect(r.a.state).toBe("calmo");
    r = run(createAwareness(), 0.1, { heard: true });
    expect(r.a.state).toBe("alerta");
    const fromAlert = run(r.a, 1.1, { sees: true });
    expect(fromAlert.a.state).toBe("perseguicao"); // começa em 0,5 de suspeita
  });

  it("perseguição: perde o alvo por loseTime → alerta; agachado longe (sem ver/ouvir) nunca sai de calmo", () => {
    const chase: Awareness = { state: "perseguicao", suspicion: 1, time: 0, lost: 0, peak: 1 };
    let r = run(chase, AWARENESS_DEFAULTS.loseTime - 0.5, { sees: false });
    expect(r.a.state).toBe("perseguicao");
    r = run(r.a, 1, { sees: false });
    expect(r.a.state).toBe("alerta");
    const calm = run(createAwareness(), 10, { sees: false, heard: false });
    expect(calm.a.state).toBe("calmo");
    expect(calm.events).toEqual([]);
    expect(awarenessLevel(calm.a)).toBe(0);
  });
});

describe("Furtividade: ruído, cone de visão e toque de recolher", () => {
  it("raios de ruído por estado de movimento", () => {
    expect(noiseRadiusFor("idle")).toBe(0);
    expect(noiseRadiusFor("crouchIdle")).toBe(0);
    expect(noiseRadiusFor("crouchWalk")).toBe(4);
    expect(noiseRadiusFor("walk")).toBe(9);
    expect(noiseRadiusFor("run")).toBe(15);
  });

  it("cone de 70°/22 m do Custódio; toque de recolher encurta a visão e alonga a audição", () => {
    const fwd = { x: 0, z: 1 };
    expect(inVisionCone(fwd, { x: 0, z: 10 }, 10, CUSTODIO_VISION)).toBe(true);
    expect(inVisionCone(fwd, { x: 0, z: 25 }, 25, CUSTODIO_VISION)).toBe(false); // longe
    // 30° do eixo: dentro (meio-ângulo 35°); 40°: fora
    const a30 = { x: Math.sin(Math.PI / 6), z: Math.cos(Math.PI / 6) };
    const a40 = { x: Math.sin((40 * Math.PI) / 180), z: Math.cos((40 * Math.PI) / 180) };
    expect(inVisionCone(fwd, a30, 10, CUSTODIO_VISION)).toBe(true);
    expect(inVisionCone(fwd, a40, 10, CUSTODIO_VISION)).toBe(false);
    expect(inVisionCone(fwd, { x: 0, z: -1 }, 1.5, CUSTODIO_VISION)).toBe(true); // colado: percebe atrás
    const night = curfewVision(CUSTODIO_VISION, true);
    expect(night.range).toBeCloseTo(22 * 0.7, 5);
    expect(night.hearing).toBeCloseTo(1.5, 5);
    expect(inVisionCone(fwd, { x: 0, z: 18 }, 18, night)).toBe(false);
    expect(curfewVision(CUSTODIO_VISION, false)).toEqual(CUSTODIO_VISION);
  });
});

describe("Reparo: minigame de 3 passos", () => {
  it("soltar na faixa avança; fora repete após penalidade; estourar a barra é erro; conclui em 3 acertos", () => {
    // rng fixo: faixa sempre começa em 0,3 + 0,5·(0,95-0,2-0,3) = 0,525 … 0,725; tempo de enchimento = fillTime
    const seq = [0.5, 0.5];
    const rng = () => seq[(rngCalls++) % 2]!;
    let rngCalls = 0;
    const g = new RepairMinigame("Gerador", {}, rng);
    expect(g.params).toEqual(REPAIR_DEFAULTS);
    expect(g.zone[0]).toBeCloseTo(0.525, 3);
    expect(g.zone[1]).toBeCloseTo(0.725, 3);
    expect(g.release()).toBeNull(); // sem apertar antes
    // passo 1: solta cedo demais → erro + penalidade
    expect(g.press()).toBe(true);
    g.update(0.3);
    expect(g.release()).toBe("miss");
    expect(g.phase).toBe("penalty");
    expect(g.press()).toBe(false); // bloqueado na penalidade
    g.update(REPAIR_DEFAULTS.penalty + 0.01);
    expect(g.phase).toBe("idle");
    expect(g.step).toBe(0);
    expect(g.failures).toBe(1);
    // passo 1 de novo: deixa estourar
    g.press();
    expect(g.update(REPAIR_DEFAULTS.fillTime * 1.05)).toBe("miss");
    expect(g.failures).toBe(2);
    g.update(REPAIR_DEFAULTS.penalty + 0.01);
    // três acertos: solta a ~0,6 da barra
    for (let i = 0; i < 3; i++) {
      expect(g.press()).toBe(true);
      g.update(REPAIR_DEFAULTS.fillTime * 0.62);
      expect(g.fill).toBeGreaterThan(g.zone[0]);
      expect(g.fill).toBeLessThan(g.zone[1]);
      expect(g.release()).toBe("hit");
      expect(g.step).toBe(i + 1);
    }
    expect(g.done).toBe(true);
    expect(g.phase).toBe("done");
    expect(g.press()).toBe(false);
    expect(g.elapsed).toBeGreaterThan(REPAIR_DEFAULTS.fillTime * 2);
    const v = g.view;
    expect(v.steps).toBe(3);
    expect(v.result).toBe("hit");
  });
});

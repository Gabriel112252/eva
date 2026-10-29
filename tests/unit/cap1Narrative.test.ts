import { describe, expect, it } from "vitest";
import { ClueLog } from "@/narrative/clues";
import { CLUES } from "@/data/clues";
import { MissionTimers, formatClock } from "@/narrative/timers";
import { MissionScript, triggerKey, triggerMatches, zoneContains } from "@/narrative/missionScript";
import type { MissionTrigger } from "@/data/cap1Contracts";
import { createEmptySave, migrateSave } from "@/persistence/saveSystem";

describe("ClueLog (diário de pistas)", () => {
  it("adiciona uma vez, lista em ordem de descoberta e emite onAdded", () => {
    const log = new ClueLog(CLUES);
    const added: string[] = [];
    log.onAdded.on((c) => added.push(c.id));
    expect(log.count).toBe(0);
    expect(log.add("pista.caixa_vazia")).toBe(true);
    expect(log.add("pista.manifesto_selo")).toBe(true);
    expect(log.add("pista.caixa_vazia")).toBe(false); // repetida
    expect(log.add("pista.inexistente")).toBe(false); // desconhecida
    expect(added).toEqual(["pista.caixa_vazia", "pista.manifesto_selo"]);
    expect(log.list().map((c) => c.id)).toEqual(["pista.caixa_vazia", "pista.manifesto_selo"]);
    expect(log.has("pista.caixa_vazia")).toBe(true);
    expect(log.hasAll(["pista.caixa_vazia", "pista.manifesto_selo"])).toBe(true);
    expect(log.hasAll(["pista.caixa_vazia", "pista.x"])).toBe(false);
    expect(log.list("rastro_do_lote")).toHaveLength(2);
    expect(log.list("a_vigilia")).toHaveLength(0);
  });

  it("serializa e restaura sem emitir, ignorando ids desconhecidos", () => {
    const log = new ClueLog(CLUES);
    log.add("pista.manifesto_selo");
    const snap = log.toJSON();
    expect(snap).toEqual(["pista.manifesto_selo"]);
    const other = new ClueLog(CLUES);
    let emitted = 0;
    other.onAdded.on(() => emitted++);
    other.load([...snap, "pista.fantasma", "pista.manifesto_selo"]);
    expect(other.toJSON()).toEqual(["pista.manifesto_selo"]);
    expect(emitted).toBe(0);
    other.clear();
    expect(other.count).toBe(0);
  });

  it("entra no save (campos novos) e sobrevive à migração", () => {
    const data = createEmptySave({ position: { x: 0, y: 0, z: 0 }, yaw: 0, crouched: false });
    data.clues = ["pista.caixa_vazia"];
    data.timers = { entrega: { remaining: 42, label: "Entrega" } };
    data.inventory = { kit_medico: 1 };
    const migrated = migrateSave(JSON.parse(JSON.stringify(data)));
    expect(migrated?.clues).toEqual(["pista.caixa_vazia"]);
    expect(migrated?.timers?.entrega?.remaining).toBe(42);
    expect(migrated?.inventory).toEqual({ kit_medico: 1 });
  });
});

describe("MissionTimers (entrega contra o tempo)", () => {
  it("conta, formata mm:ss, dispara ao zerar e some", () => {
    const t = new MissionTimers();
    const expired: string[] = [];
    t.onExpired.on((x) => expired.push(x.id));
    t.start("entrega", 90, "Entrega ao posto");
    expect(t.display?.id).toBe("entrega");
    expect(formatClock(t.remaining("entrega")!)).toBe("01:30");
    t.update(30);
    expect(formatClock(t.remaining("entrega")!)).toBe("01:00");
    t.update(59.5);
    expect(formatClock(t.remaining("entrega")!)).toBe("00:01");
    expect(expired).toEqual([]);
    t.update(1);
    expect(expired).toEqual(["entrega"]);
    expect(t.has("entrega")).toBe(false);
    expect(t.display).toBeNull();
  });

  it("cancelar não dispara; add estende; sem rótulo não vai à HUD; snapshot e load", () => {
    const t = new MissionTimers();
    let fired = 0;
    t.onExpired.on(() => fired++);
    t.start("oculto", 10);
    t.start("visivel", 20, "Visível");
    expect(t.display?.id).toBe("visivel");
    expect(t.add("oculto", 5)).toBe(15);
    expect(t.add("nada", 5)).toBeNull();
    expect(t.cancel("visivel")).toBe(20);
    expect(t.display).toBeNull();
    const snap = t.toJSON();
    expect(snap.oculto?.remaining).toBe(15);
    const u = new MissionTimers();
    u.load(snap);
    expect(u.remaining("oculto")).toBe(15);
    u.update(16);
    expect(u.has("oculto")).toBe(false);
    expect(fired).toBe(0);
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(125)).toBe("02:05");
  });
});

describe("MissionScript (gatilhos e zonas)", () => {
  it("casa padrões por kind e campos, com curinga e ignorando segundos do timer", () => {
    expect(triggerMatches({ kind: "zona", id: "deposito" }, { kind: "zona", id: "deposito" })).toBe(true);
    expect(triggerMatches({ kind: "zona", id: "deposito" }, { kind: "zona", id: "banca" })).toBe(false);
    expect(triggerMatches({ kind: "zona", id: "*" }, { kind: "zona", id: "banca" })).toBe(true);
    expect(triggerMatches({ kind: "timer", id: "entrega", segundos: 0 }, { kind: "timer", id: "entrega", segundos: 90 })).toBe(true);
    expect(triggerMatches({ kind: "detectado" }, { kind: "zona", id: "x" })).toBe(false);
    expect(triggerMatches({ kind: "veiculo", id: "atlas_t3", dentro: true }, { kind: "veiculo", id: "atlas_t3", dentro: false })).toBe(false);
    expect(triggerKey({ kind: "dialogo", npc: "raquel", no: "fim" })).toBe("dialogo:raquel:fim");
    expect(triggerKey({ kind: "veiculo", id: "atlas_t3", dentro: true })).toBe("veiculo:atlas_t3:entrou");
  });

  it("on/once/fire com histórico", () => {
    const s = new MissionScript();
    const got: string[] = [];
    const off = s.on({ kind: "pista", id: "*" }, (t) => got.push(triggerKey(t)));
    s.once({ kind: "reparo", maquina: "gerador" }, (t) => got.push(`once:${triggerKey(t)}`));
    expect(s.fire({ kind: "pista", id: "a" })).toBe(1);
    expect(s.fire({ kind: "reparo", maquina: "gerador" })).toBe(1);
    expect(s.fire({ kind: "reparo", maquina: "gerador" })).toBe(0); // once já saiu
    off();
    expect(s.fire({ kind: "pista", id: "b" })).toBe(0);
    expect(got).toEqual(["pista:a", "once:reparo:gerador"]);
    expect(s.history.map(triggerKey)).toEqual(["pista:a", "reparo:gerador", "reparo:gerador", "pista:b"]);
    expect(s.fired({ kind: "pista", id: "b" })).toBe(true);
    expect(s.fired({ kind: "detectado" })).toBe(false);
  });

  it("zonas cilíndricas e em caixa disparam na entrada (uma vez, ou sempre), respeitando a pé/veículo", () => {
    expect(zoneContains({ id: "c", center: { x: 0, y: 0, z: 0 }, radius: 2 }, { x: 1.5, y: 10, z: 0 })).toBe(true);
    expect(zoneContains({ id: "c", center: { x: 0, y: 0, z: 0 }, radius: 2, height: 4 }, { x: 1.5, y: 10, z: 0 })).toBe(false);
    expect(zoneContains({ id: "b", center: { x: 0, y: 0, z: 0 }, size: { x: 4, y: 2, z: 2 } }, { x: 1.9, y: 0.9, z: -0.9 })).toBe(true);
    expect(zoneContains({ id: "b", center: { x: 0, y: 0, z: 0 }, size: { x: 4, y: 2, z: 2 } }, { x: 2.1, y: 0, z: 0 })).toBe(false);

    const s = new MissionScript();
    const fired: MissionTrigger[] = [];
    s.on({ kind: "zona", id: "*" }, (t) => fired.push(t));
    s.addZones([
      { id: "deposito", center: { x: 10, y: 0, z: 0 }, radius: 3 },
      { id: "posto", center: { x: 0, y: 0, z: 10 }, radius: 3, once: false, requires: "veiculo" },
    ]);
    s.update({ x: 0, y: 0, z: 0 }, false);
    expect(fired).toHaveLength(0);
    s.update({ x: 10, y: 0, z: 1 }, false);
    s.update({ x: 10, y: 0, z: 1.5 }, false); // continua dentro: não repete
    expect(fired.map(triggerKey)).toEqual(["zona:deposito"]);
    expect(s.isInside("deposito")).toBe(true);
    s.update({ x: 20, y: 0, z: 0 }, false);
    s.update({ x: 10, y: 0, z: 0 }, false); // voltou: once → não dispara
    expect(fired).toHaveLength(1);
    s.update({ x: 0, y: 0, z: 10 }, false); // a pé numa zona de veículo
    expect(fired).toHaveLength(1);
    s.update({ x: 0, y: 0, z: 10 }, true);
    s.update({ x: 0, y: 0, z: 30 }, true);
    s.update({ x: 0, y: 0, z: 10 }, true); // once:false → repete
    expect(fired.map(triggerKey)).toEqual(["zona:deposito", "zona:posto", "zona:posto"]);
    s.resetZones();
    s.update({ x: 10, y: 0, z: 0 }, false);
    expect(fired.map(triggerKey).filter((k) => k === "zona:deposito")).toHaveLength(2);
  });
});

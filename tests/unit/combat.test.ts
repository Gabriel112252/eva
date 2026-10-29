import { describe, expect, it } from "vitest";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { WEAPONS, addReserve, canFire, canReload, createWeaponState, fire, spreadDirection, startReload, tick } from "@/combat/weapons";
import { Health } from "@/combat/health";
import { rayCapsuleDistance } from "@/ai/enemyManager";
import { Inventory } from "@/items/inventory";

describe("Arma: pente, cadência e recarga", () => {
  it("atira até esvaziar o pente respeitando a cadência; recarrega da reserva", () => {
    const s = createWeaponState(WEAPONS.pistola, 20);
    expect(canFire(s)).toBe(true);
    expect(fire(s)).toBe(true);
    expect(s.magazine).toBe(11);
    expect(fire(s)).toBe(false); // em cooldown
    tick(s, WEAPONS.pistola.fireInterval + 0.01);
    expect(fire(s)).toBe(true);
    for (let i = 0; i < 20; i++) {
      tick(s, 1);
      fire(s);
    }
    expect(s.magazine).toBe(0);
    expect(canFire(s)).toBe(false);
    expect(canReload(s)).toBe(true);
    expect(startReload(s)).toBe(true);
    expect(canFire(s)).toBe(false);
    expect(tick(s, WEAPONS.pistola.reloadTime / 2)).toBe(false);
    expect(tick(s, WEAPONS.pistola.reloadTime)).toBe(true);
    expect(s.magazine).toBe(12);
    expect(s.reserve).toBe(8);
    // reserva curta: recarga parcial
    s.magazine = 2;
    startReload(s);
    tick(s, 5);
    expect(s.magazine).toBe(10);
    expect(s.reserve).toBe(0);
    expect(canReload(s)).toBe(false);
    expect(addReserve(s, 100, 36)).toBe(36);
  });

  it("dispersão desvia dentro do cone e mantém o vetor unitário", () => {
    const dir = { x: 0, y: 0, z: 1 };
    let seq = [0.99, 0.3];
    const rnd = () => seq.shift() ?? 0.5;
    const d = spreadDirection(dir, 0.05, rnd);
    expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 5);
    const angle = Math.acos(d.z);
    expect(angle).toBeLessThanOrEqual(0.05 + 1e-6);
    expect(angle).toBeGreaterThan(0.03);
    seq = [0, 0];
    const straight = spreadDirection(dir, 0.05, rnd);
    expect(straight.z).toBeCloseTo(1, 5);
    expect(spreadDirection(dir, 0, rnd)).toEqual(dir);
  });
});

describe("Vida: dano, morte, regeneração", () => {
  it("regenera só depois do intervalo sem dano e dispara morte uma vez", () => {
    const h = new Health(100, 10, 2);
    let deaths = 0;
    h.onDeath.on(() => deaths++);
    expect(h.damage({ amount: 30 })).toBe(true);
    expect(h.current).toBe(70);
    h.update(1);
    expect(h.current).toBe(70);
    h.update(1.5);
    expect(h.current).toBeGreaterThan(70);
    h.damage({ amount: 500 });
    expect(h.alive).toBe(false);
    expect(deaths).toBe(1);
    expect(h.damage({ amount: 5 })).toBe(false);
    h.reset();
    expect(h.current).toBe(100);
  });
});

describe("Raio × cápsula (acerto em inimigos)", () => {
  const feet = new Vector3(10, 0, 0);
  it("acerta o tronco de frente e devolve a distância de entrada", () => {
    const t = rayCapsuleDistance(new Vector3(0, 1.2, 0), new Vector3(1, 0, 0), feet, 1.8, 0.34, 50);
    expect(t).not.toBeNull();
    expect(t!).toBeCloseTo(10 - 0.34, 2);
  });
  it("erra ao lado e acima; não acerta atrás do alcance", () => {
    expect(rayCapsuleDistance(new Vector3(0, 1.2, 0.6), new Vector3(1, 0, 0), feet, 1.8, 0.34, 50)).toBeNull();
    expect(rayCapsuleDistance(new Vector3(0, 2.5, 0), new Vector3(1, 0, 0), feet, 1.8, 0.34, 50)).toBeNull();
    expect(rayCapsuleDistance(new Vector3(0, 1.2, 0), new Vector3(1, 0, 0), feet, 1.8, 0.34, 5)).toBeNull();
  });
  it("raio descendente entra pela tampa superior", () => {
    const dir = new Vector3(1, -0.25, 0).normalize();
    const t = rayCapsuleDistance(new Vector3(0, 4.3, 0), dir, feet, 1.8, 0.34, 50);
    expect(t).not.toBeNull();
    const p = new Vector3(0, 4.3, 0).add(dir.scale(t!));
    expect(p.y).toBeCloseTo(1.8, 1);
  });
});

describe("Mochila", () => {
  it("empilha itens empilháveis, não duplica únicos e serializa", () => {
    const inv = new Inventory();
    inv.add("municao_pistola", 12);
    inv.add("municao_pistola", 6);
    inv.add("pistola", 1);
    inv.add("pistola", 1);
    expect(inv.count("municao_pistola")).toBe(18);
    expect(inv.count("pistola")).toBe(1);
    expect(inv.remove("kit_medico", 1)).toBe(false);
    const json = inv.toJSON();
    const inv2 = new Inventory();
    inv2.load(json);
    expect(inv2.list().map((i) => i.id).sort()).toEqual(["municao_pistola", "pistola"]);
  });
});

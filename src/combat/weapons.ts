/** Armas e lógica pura de munição/recarga (testável sem Babylon). */
export type WeaponId = "pistola";

export interface WeaponDef {
  id: WeaponId;
  displayName: string;
  /** dano por tiro no corpo; cabeça multiplica por `headshotMultiplier` */
  damage: number;
  headshotMultiplier: number;
  magazineSize: number;
  /** intervalo mínimo entre tiros (s) */
  fireInterval: number;
  reloadTime: number;
  /** dispersão em radianos (meio-ângulo) sem mirar / mirando */
  spreadHip: number;
  spreadAim: number;
  range: number;
  /** coice aplicado ao pitch da câmera (rad) */
  recoil: number;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistola: {
    id: "pistola",
    displayName: "Pistola de serviço",
    damage: 26,
    headshotMultiplier: 2.2,
    magazineSize: 12,
    fireInterval: 0.22,
    reloadTime: 1.7,
    spreadHip: 0.035,
    spreadAim: 0.008,
    range: 70,
    recoil: 0.028,
  },
};

export type WeaponPhase = "ready" | "reloading";

export interface WeaponState {
  weapon: WeaponDef;
  magazine: number;
  reserve: number;
  phase: WeaponPhase;
  /** tempo restante da recarga (s) */
  reloadLeft: number;
  /** tempo até poder atirar de novo (s) */
  cooldown: number;
}

export function createWeaponState(weapon: WeaponDef, reserve: number): WeaponState {
  return { weapon, magazine: weapon.magazineSize, reserve, phase: "ready", reloadLeft: 0, cooldown: 0 };
}

export function canFire(s: WeaponState): boolean {
  return s.phase === "ready" && s.cooldown <= 0 && s.magazine > 0;
}

/** Consome um tiro; devolve false se não pôde atirar (vazio/recarregando/cadência). */
export function fire(s: WeaponState): boolean {
  if (!canFire(s)) return false;
  s.magazine--;
  s.cooldown = s.weapon.fireInterval;
  return true;
}

export function canReload(s: WeaponState): boolean {
  return s.phase === "ready" && s.reserve > 0 && s.magazine < s.weapon.magazineSize;
}

export function startReload(s: WeaponState): boolean {
  if (!canReload(s)) return false;
  s.phase = "reloading";
  s.reloadLeft = s.weapon.reloadTime;
  return true;
}

/** Avança temporizadores; completa a recarga quando chega a zero. Devolve true no instante em que a recarga termina. */
export function tick(s: WeaponState, dt: number): boolean {
  if (s.cooldown > 0) s.cooldown = Math.max(0, s.cooldown - dt);
  if (s.phase === "reloading") {
    s.reloadLeft -= dt;
    if (s.reloadLeft <= 0) {
      const need = s.weapon.magazineSize - s.magazine;
      const take = Math.min(need, s.reserve);
      s.magazine += take;
      s.reserve -= take;
      s.phase = "ready";
      s.reloadLeft = 0;
      return true;
    }
  }
  return false;
}

export function addReserve(s: WeaponState, amount: number, max = 120): number {
  const before = s.reserve;
  s.reserve = Math.min(max, s.reserve + amount);
  return s.reserve - before;
}

/** Direção com dispersão: desvia `dir` (unitário) por um ângulo aleatório ≤ spread, usando `rnd()` em [0,1). */
export function spreadDirection(dir: { x: number; y: number; z: number }, spread: number, rnd: () => number): { x: number; y: number; z: number } {
  if (spread <= 0) return { ...dir };
  // base ortonormal em torno de dir
  const up = Math.abs(dir.y) < 0.99 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const rx = { x: up.y * dir.z - up.z * dir.y, y: up.z * dir.x - up.x * dir.z, z: up.x * dir.y - up.y * dir.x };
  const rl = Math.hypot(rx.x, rx.y, rx.z) || 1;
  rx.x /= rl;
  rx.y /= rl;
  rx.z /= rl;
  const ry = { x: dir.y * rx.z - dir.z * rx.y, y: dir.z * rx.x - dir.x * rx.z, z: dir.x * rx.y - dir.y * rx.x };
  const angle = Math.sqrt(rnd()) * spread; // distribuição uniforme no disco
  const theta = rnd() * Math.PI * 2;
  const ox = Math.cos(theta) * Math.tan(angle);
  const oy = Math.sin(theta) * Math.tan(angle);
  const out = { x: dir.x + rx.x * ox + ry.x * oy, y: dir.y + rx.y * ox + ry.y * oy, z: dir.z + rx.z * ox + ry.z * oy };
  const l = Math.hypot(out.x, out.y, out.z) || 1;
  return { x: out.x / l, y: out.y / l, z: out.z / l };
}

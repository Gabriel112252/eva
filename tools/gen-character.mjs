#!/usr/bin/env node
/**
 * Gerador de personagens provisórios (manequins) em GLB 2.0.
 *
 * Produz modelos 3D REAIS: malha triangulada, esqueleto de 16 ossos, skinning
 * (JOINTS_0/WEIGHTS_0, inverseBindMatrices) e clipes de animação esquelética
 * amostrados a 30 fps (Idle, Walk, Run, CrouchIdle, CrouchWalk, Talk, Interact).
 *
 * Estes manequins são PLACEHOLDERS de produção: têm proporções, cores de pele,
 * roupas, óculos/mochila e nenhuma marca comercial, mas não são os modelos
 * finais (ver docs/STATUS.md). A hierarquia e os nomes de clipes seguem um
 * padrão compatível com um rig Mixamo-like, para troca futura sem mexer no código
 * de gameplay.
 *
 * Uso:  node tools/gen-character.mjs [diretório de saída]
 * Saída padrão: public/assets/characters/<nome>.glb (+ characters.json)
 *
 * Convenções glTF: sistema destro, +Y para cima, personagem olhando para +Z.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(process.argv[2] ?? resolve(__dirname, "../public/assets/characters"));
const FPS = 30;

// ---------------------------------------------------------------------------
// Matemática mínima
// ---------------------------------------------------------------------------
const DEG = Math.PI / 180;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smoothstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Euler XYZ (graus) -> quaternion [x,y,z,w]. Ordem de aplicação: Z, depois Y, depois X (intrínseca XYZ). */
function eulerToQuat(rxDeg, ryDeg, rzDeg) {
  const hx = (rxDeg * DEG) / 2;
  const hy = (ryDeg * DEG) / 2;
  const hz = (rzDeg * DEG) / 2;
  const cx = Math.cos(hx), sx = Math.sin(hx);
  const cy = Math.cos(hy), sy = Math.sin(hy);
  const cz = Math.cos(hz), sz = Math.sin(hz);
  // q = qx * qy * qz
  const qx = [sx, 0, 0, cx];
  const qy = [0, sy, 0, cy];
  const qz = [0, 0, sz, cz];
  return quatMul(quatMul(qx, qy), qz);
}
function quatMul(a, b) {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

// ---------------------------------------------------------------------------
// Esqueleto base (altura 1,76 m). Offsets locais em relação ao osso pai.
// +X = lado esquerdo do personagem (ele olha para +Z).
// ---------------------------------------------------------------------------
const BASE_HEIGHT = 1.76;
const BONE_DEFS = [
  { name: "Hips", parent: null, offset: [0, 0.95, 0] },
  { name: "Spine", parent: "Hips", offset: [0, 0.12, 0] },
  { name: "Chest", parent: "Spine", offset: [0, 0.17, 0] },
  { name: "Neck", parent: "Chest", offset: [0, 0.25, 0] },
  { name: "Head", parent: "Neck", offset: [0, 0.09, 0] },
  { name: "LeftUpperArm", parent: "Chest", offset: [0.215, 0.2, 0] },
  { name: "LeftLowerArm", parent: "LeftUpperArm", offset: [0, -0.28, 0] },
  { name: "LeftHand", parent: "LeftLowerArm", offset: [0, -0.26, 0] },
  { name: "RightUpperArm", parent: "Chest", offset: [-0.215, 0.2, 0] },
  { name: "RightLowerArm", parent: "RightUpperArm", offset: [0, -0.28, 0] },
  { name: "RightHand", parent: "RightLowerArm", offset: [0, -0.26, 0] },
  { name: "LeftUpperLeg", parent: "Hips", offset: [0.1, -0.05, 0] },
  { name: "LeftLowerLeg", parent: "LeftUpperLeg", offset: [0, -0.42, 0] },
  { name: "LeftFoot", parent: "LeftLowerLeg", offset: [0, -0.42, 0] },
  { name: "RightUpperLeg", parent: "Hips", offset: [-0.1, -0.05, 0] },
  { name: "RightLowerLeg", parent: "RightUpperLeg", offset: [0, -0.42, 0] },
  { name: "RightFoot", parent: "RightLowerLeg", offset: [0, -0.42, 0] },
];
const BONE_INDEX = Object.fromEntries(BONE_DEFS.map((b, i) => [b.name, i]));

// ---------------------------------------------------------------------------
// Variantes (personagens do prólogo). Cores sem marcas; proporções plausíveis.
// ---------------------------------------------------------------------------
const VARIANTS = {
  matias: {
    label: "Matias (58) — protagonista, placeholder",
    height: 1.76,
    build: 1.0,
    skin: "#8b5a3c",
    hair: "#221a16",
    hairStyle: "short-wavy",
    shirt: "#4a5663",
    sleeves: "#4a5663",
    pants: "#5a4a3b",
    boots: "#2a2420",
    glasses: true,
    backpack: "#3b3a33",
    toolbelt: true,
    beardShadow: true,
  },
  miriam: {
    label: "Miriam (36) — arquivista religiosa da Apuração, placeholder",
    height: 1.68,
    build: 0.92,
    skin: "#c99a78",
    hair: "#3a2920",
    hairStyle: "bun",
    shirt: "#d8d0bf",
    sleeves: "#d8d0bf",
    pants: "#8a8176",
    boots: "#3a332f",
    sash: "#b89036",
    headscarf: "#e9e2d2",
  },
  custodio: {
    label: "Custódio da praça — segurança, placeholder",
    height: 1.83,
    build: 1.12,
    skin: "#6a4832",
    hair: "#111111",
    hairStyle: "cap",
    shirt: "#3a4a40",
    sleeves: "#2f3a33",
    pants: "#2b2f2b",
    boots: "#1c1c1c",
    vest: "#232a26",
    cap: "#1f2622",
  },
  comerciante: {
    label: "Comerciante do bairro, placeholder",
    height: 1.7,
    build: 1.05,
    skin: "#a3714f",
    hair: "#6f6a62",
    hairStyle: "short-wavy",
    shirt: "#8c3b2f",
    sleeves: "#8c3b2f",
    pants: "#44403a",
    boots: "#2a2622",
    apron: "#d6cdbc",
  },
  raquel: {
    label: "Raquel (40) — médica da comunidade, placeholder",
    height: 1.65,
    build: 0.9,
    skin: "#5c3e2d",
    hair: "#0e0a08",
    hairStyle: "bun",
    shirt: "#e8e4dc",
    sleeves: "#e8e4dc",
    pants: "#3f4b57",
    boots: "#242424",
    coat: "#ece9e2",
  },
  ana: {
    label: "Ana (15) — filha de Matias, placeholder",
    height: 1.6,
    build: 0.82,
    skin: "#9a6a4a",
    hair: "#2a1c16",
    hairStyle: "ponytail",
    shirt: "#6b7fa3",
    sleeves: "#6b7fa3",
    pants: "#3a4048",
    boots: "#333333",
  },
};

// ---------------------------------------------------------------------------
// Construção de geometria (espaço do modelo, pose de descanso)
// ---------------------------------------------------------------------------
class GeometryBuilder {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.joints = [];
    this.weights = [];
    this.indicesByMaterial = new Map();
    this.materials = new Map();
  }

  materialIndex(key, spec) {
    if (!this.materials.has(key)) {
      this.materials.set(key, { index: this.materials.size, ...spec });
    }
    return this.materials.get(key).index;
  }

  _push(positions, normals, indices, bone, matKey, matSpec) {
    const base = this.positions.length / 3;
    this.positions.push(...positions);
    this.normals.push(...normals);
    const n = positions.length / 3;
    for (let i = 0; i < n; i++) {
      this.joints.push(bone, 0, 0, 0);
      this.weights.push(1, 0, 0, 0);
    }
    const mi = this.materialIndex(matKey, matSpec);
    if (!this.indicesByMaterial.has(mi)) this.indicesByMaterial.set(mi, []);
    const list = this.indicesByMaterial.get(mi);
    for (const idx of indices) list.push(base + idx);
  }

  /**
   * Caixa alinhada aos eixos, com afunilamento opcional (taperTop: escala XZ no topo).
   * Normais planas (vértices duplicados por face).
   */
  box({ center, size, bone, material, color, roughness = 0.85, metallic = 0, taperTop = 1, taperBottom = 1 }) {
    const [cx, cy, cz] = center;
    const [sx, sy, sz] = size;
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const corner = (ix, iy, iz) => {
      const t = iy > 0 ? taperTop : taperBottom;
      return [cx + ix * hx * t, cy + iy * hy, cz + iz * hz * t];
    };
    const faces = [
      { n: [0, 0, 1], v: [corner(-1, -1, 1), corner(1, -1, 1), corner(1, 1, 1), corner(-1, 1, 1)] }, // +Z frente
      { n: [0, 0, -1], v: [corner(1, -1, -1), corner(-1, -1, -1), corner(-1, 1, -1), corner(1, 1, -1)] }, // -Z
      { n: [1, 0, 0], v: [corner(1, -1, 1), corner(1, -1, -1), corner(1, 1, -1), corner(1, 1, 1)] }, // +X
      { n: [-1, 0, 0], v: [corner(-1, -1, -1), corner(-1, -1, 1), corner(-1, 1, 1), corner(-1, 1, -1)] }, // -X
      { n: [0, 1, 0], v: [corner(-1, 1, 1), corner(1, 1, 1), corner(1, 1, -1), corner(-1, 1, -1)] }, // +Y
      { n: [0, -1, 0], v: [corner(-1, -1, -1), corner(1, -1, -1), corner(1, -1, 1), corner(-1, -1, 1)] }, // -Y
    ];
    const positions = [], normals = [], indices = [];
    faces.forEach((f, fi) => {
      const b = fi * 4;
      for (const v of f.v) {
        positions.push(...v);
        normals.push(...f.n);
      }
      indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
    });
    this._push(positions, normals, indices, bone, material, { color, roughness, metallic });
  }

  /** Esfera UV (normais suaves), com escala por eixo. */
  sphere({ center, radius, scale = [1, 1, 1], bone, material, color, roughness = 0.85, metallic = 0, segments = 12, rings = 10 }) {
    const positions = [], normals = [], indices = [];
    for (let r = 0; r <= rings; r++) {
      const phi = (r / rings) * Math.PI;
      for (let s = 0; s <= segments; s++) {
        const theta = (s / segments) * Math.PI * 2;
        const nx = Math.sin(phi) * Math.cos(theta);
        const ny = Math.cos(phi);
        const nz = Math.sin(phi) * Math.sin(theta);
        positions.push(center[0] + nx * radius * scale[0], center[1] + ny * radius * scale[1], center[2] + nz * radius * scale[2]);
        // normal aproximada para elipsoide
        const inx = nx / scale[0], iny = ny / scale[1], inz = nz / scale[2];
        const len = Math.hypot(inx, iny, inz) || 1;
        normals.push(inx / len, iny / len, inz / len);
      }
    }
    const stride = segments + 1;
    for (let r = 0; r < rings; r++) {
      for (let s = 0; s < segments; s++) {
        const a = r * stride + s;
        const b = a + stride;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    this._push(positions, normals, indices, bone, material, { color, roughness, metallic });
  }

  /** Cilindro vertical (eixo Y) com raios distintos no topo e na base. */
  cylinder({ center, height, radiusTop, radiusBottom, bone, material, color, roughness = 0.85, metallic = 0, segments = 10 }) {
    const positions = [], normals = [], indices = [];
    const [cx, cy, cz] = center;
    const top = cy + height / 2, bottom = cy - height / 2;
    for (let s = 0; s <= segments; s++) {
      const theta = (s / segments) * Math.PI * 2;
      const nx = Math.cos(theta), nz = Math.sin(theta);
      positions.push(cx + nx * radiusTop, top, cz + nz * radiusTop);
      normals.push(nx, 0, nz);
      positions.push(cx + nx * radiusBottom, bottom, cz + nz * radiusBottom);
      normals.push(nx, 0, nz);
    }
    for (let s = 0; s < segments; s++) {
      const a = s * 2;
      indices.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
    // tampas
    const capStart = positions.length / 3;
    positions.push(cx, top, cz); normals.push(0, 1, 0);
    positions.push(cx, bottom, cz); normals.push(0, -1, 0);
    const ringTop = positions.length / 3;
    for (let s = 0; s <= segments; s++) {
      const theta = (s / segments) * Math.PI * 2;
      positions.push(cx + Math.cos(theta) * radiusTop, top, cz + Math.sin(theta) * radiusTop);
      normals.push(0, 1, 0);
    }
    const ringBottom = positions.length / 3;
    for (let s = 0; s <= segments; s++) {
      const theta = (s / segments) * Math.PI * 2;
      positions.push(cx + Math.cos(theta) * radiusBottom, bottom, cz + Math.sin(theta) * radiusBottom);
      normals.push(0, -1, 0);
    }
    for (let s = 0; s < segments; s++) {
      indices.push(capStart, ringTop + s + 1, ringTop + s);
      indices.push(capStart + 1, ringBottom + s, ringBottom + s + 1);
    }
    this._push(positions, normals, indices, bone, material, { color, roughness, metallic });
  }
}

/** Posições mundiais (pose de descanso) de cada osso, já escaladas. */
function computeBindPositions(scale) {
  const world = [];
  for (const def of BONE_DEFS) {
    const parent = def.parent === null ? [0, 0, 0] : world[BONE_INDEX[def.parent]];
    world.push([parent[0] + def.offset[0] * scale, parent[1] + def.offset[1] * scale, parent[2] + def.offset[2] * scale]);
  }
  return world;
}

function buildCharacterGeometry(variant) {
  const g = new GeometryBuilder();
  const s = variant.height / BASE_HEIGHT; // escala vertical global
  const w = variant.build * s; // escala de largura
  const B = computeBindPositions(s);
  const P = (name) => B[BONE_INDEX[name]];
  const J = (name) => BONE_INDEX[name];
  const skin = variant.skin;

  // --- Tronco ---------------------------------------------------------------
  const hips = P("Hips");
  g.box({ center: [hips[0], hips[1] - 0.02 * s, hips[2]], size: [0.33 * w, 0.2 * s, 0.21 * w], bone: J("Hips"), material: "pants", color: variant.pants, taperTop: 0.96 });
  const spine = P("Spine");
  g.box({ center: [spine[0], spine[1] + 0.07 * s, spine[2]], size: [0.31 * w, 0.17 * s, 0.2 * w], bone: J("Spine"), material: "shirt", color: variant.shirt, taperTop: 1.08 });
  const chest = P("Chest");
  g.box({ center: [chest[0], chest[1] + 0.13 * s, chest[2]], size: [0.36 * w, 0.26 * s, 0.22 * w], bone: J("Chest"), material: "shirt", color: variant.shirt, taperTop: 1.1, taperBottom: 0.94 });
  if (variant.vest) {
    g.box({ center: [chest[0], chest[1] + 0.12 * s, chest[2]], size: [0.39 * w, 0.24 * s, 0.25 * w], bone: J("Chest"), material: "vest", color: variant.vest, roughness: 0.7, taperTop: 1.08 });
  }
  if (variant.coat) {
    g.box({ center: [chest[0], chest[1] + 0.1 * s, chest[2]], size: [0.385 * w, 0.28 * s, 0.245 * w], bone: J("Chest"), material: "coat", color: variant.coat, taperTop: 1.08 });
    g.box({ center: [spine[0], spine[1] + 0.04 * s, spine[2]], size: [0.345 * w, 0.2 * s, 0.235 * w], bone: J("Spine"), material: "coat", color: variant.coat });
  }
  if (variant.apron) {
    g.box({ center: [chest[0], chest[1] + 0.06 * s, chest[2] + 0.1 * w], size: [0.26 * w, 0.3 * s, 0.03 * w], bone: J("Chest"), material: "apron", color: variant.apron });
    g.box({ center: [hips[0], hips[1] - 0.05 * s, hips[2] + 0.1 * w], size: [0.3 * w, 0.26 * s, 0.03 * w], bone: J("Hips"), material: "apron", color: variant.apron });
  }
  if (variant.sash) {
    // faixa dourada discreta (iconografia da Igreja da Continuidade) no ombro esquerdo
    g.box({ center: [chest[0] + 0.1 * w, chest[1] + 0.16 * s, chest[2]], size: [0.07 * w, 0.26 * s, 0.24 * w], bone: J("Chest"), material: "sash", color: variant.sash, roughness: 0.5, metallic: 0.2 });
  }
  if (variant.backpack) {
    g.box({ center: [chest[0], chest[1] + 0.06 * s, chest[2] - 0.19 * w], size: [0.3 * w, 0.36 * s, 0.15 * w], bone: J("Chest"), material: "backpack", color: variant.backpack, roughness: 0.9 });
    g.box({ center: [chest[0] + 0.11 * w, chest[1] + 0.14 * s, chest[2] - 0.05 * w], size: [0.04 * w, 0.26 * s, 0.22 * w], bone: J("Chest"), material: "strap", color: "#2a2924" });
    g.box({ center: [chest[0] - 0.11 * w, chest[1] + 0.14 * s, chest[2] - 0.05 * w], size: [0.04 * w, 0.26 * s, 0.22 * w], bone: J("Chest"), material: "strap", color: "#2a2924" });
  }
  if (variant.toolbelt) {
    g.box({ center: [hips[0], hips[1] - 0.04 * s, hips[2]], size: [0.35 * w, 0.05 * s, 0.23 * w], bone: J("Hips"), material: "belt", color: "#2b231c", roughness: 0.7 });
    g.box({ center: [hips[0] + 0.19 * w, hips[1] - 0.09 * s, hips[2] + 0.02 * w], size: [0.07 * w, 0.12 * s, 0.1 * w], bone: J("Hips"), material: "pouch", color: "#4a3d2f" });
    g.box({ center: [hips[0] - 0.19 * w, hips[1] - 0.1 * s, hips[2] - 0.02 * w], size: [0.05 * w, 0.16 * s, 0.05 * w], bone: J("Hips"), material: "tool", color: "#8a8f94", roughness: 0.4, metallic: 0.8 });
  }

  // --- Pescoço e cabeça -----------------------------------------------------
  const neck = P("Neck");
  g.cylinder({ center: [neck[0], neck[1] + 0.045 * s, neck[2]], height: 0.1 * s, radiusTop: 0.055 * w, radiusBottom: 0.06 * w, bone: J("Neck"), material: "skin", color: skin });
  const head = P("Head");
  const headC = [head[0], head[1] + 0.105 * s, head[2]];
  g.sphere({ center: headC, radius: 0.105 * s, scale: [0.95 * variant.build, 1.12, 1.0], bone: J("Head"), material: "skin", color: skin, segments: 14, rings: 12 });
  // olhos
  const eyeY = headC[1] + 0.012 * s;
  const eyeZ = headC[2] + 0.088 * s;
  for (const side of [-1, 1]) {
    g.sphere({ center: [headC[0] + side * 0.035 * s, eyeY, eyeZ], radius: 0.014 * s, bone: J("Head"), material: "eye", color: "#f3efe8", roughness: 0.3, segments: 8, rings: 6 });
    g.sphere({ center: [headC[0] + side * 0.035 * s, eyeY, eyeZ + 0.009 * s], radius: 0.007 * s, bone: J("Head"), material: "pupil", color: "#1b1410", roughness: 0.2, segments: 6, rings: 4 });
  }
  // nariz e boca
  g.box({ center: [headC[0], headC[1] - 0.015 * s, headC[2] + 0.1 * s], size: [0.024 * s, 0.045 * s, 0.03 * s], bone: J("Head"), material: "skin", color: skin });
  g.box({ center: [headC[0], headC[1] - 0.052 * s, headC[2] + 0.093 * s], size: [0.05 * s, 0.008 * s, 0.01 * s], bone: J("Head"), material: "mouth", color: "#5a3a34" });
  if (variant.beardShadow) {
    g.box({ center: [headC[0], headC[1] - 0.075 * s, headC[2] + 0.06 * s], size: [0.12 * s, 0.045 * s, 0.09 * s], bone: J("Head"), material: "beard", color: "#3a2c25", roughness: 0.95, taperBottom: 0.75 });
  }
  // cabelo
  switch (variant.hairStyle) {
    case "short-wavy":
      g.sphere({ center: [headC[0], headC[1] + 0.03 * s, headC[2] - 0.01 * s], radius: 0.108 * s, scale: [0.97 * variant.build, 0.9, 1.0], bone: J("Head"), material: "hair", color: variant.hair, roughness: 0.95, segments: 14, rings: 6 });
      break;
    case "bun":
      g.sphere({ center: [headC[0], headC[1] + 0.03 * s, headC[2] - 0.01 * s], radius: 0.108 * s, scale: [0.97 * variant.build, 0.92, 1.0], bone: J("Head"), material: "hair", color: variant.hair, roughness: 0.95, segments: 14, rings: 6 });
      g.sphere({ center: [headC[0], headC[1] + 0.02 * s, headC[2] - 0.11 * s], radius: 0.045 * s, bone: J("Head"), material: "hair", color: variant.hair, roughness: 0.95, segments: 8, rings: 6 });
      break;
    case "ponytail":
      g.sphere({ center: [headC[0], headC[1] + 0.03 * s, headC[2] - 0.01 * s], radius: 0.108 * s, scale: [0.97 * variant.build, 0.92, 1.0], bone: J("Head"), material: "hair", color: variant.hair, roughness: 0.95, segments: 14, rings: 6 });
      g.box({ center: [headC[0], headC[1] - 0.06 * s, headC[2] - 0.11 * s], size: [0.05 * s, 0.22 * s, 0.04 * s], bone: J("Head"), material: "hair", color: variant.hair, roughness: 0.95, taperBottom: 0.6 });
      break;
    case "cap":
      g.sphere({ center: [headC[0], headC[1] + 0.035 * s, headC[2]], radius: 0.112 * s, scale: [0.98 * variant.build, 0.8, 1.0], bone: J("Head"), material: "cap", color: variant.cap, roughness: 0.8, segments: 14, rings: 6 });
      g.box({ center: [headC[0], headC[1] + 0.035 * s, headC[2] + 0.12 * s], size: [0.17 * s, 0.012 * s, 0.07 * s], bone: J("Head"), material: "cap", color: variant.cap, roughness: 0.8 });
      break;
  }
  if (variant.headscarf) {
    g.box({ center: [headC[0], headC[1] - 0.03 * s, headC[2] - 0.075 * s], size: [0.2 * s, 0.26 * s, 0.07 * s], bone: J("Head"), material: "scarf", color: variant.headscarf, roughness: 0.95, taperBottom: 1.15 });
  }
  if (variant.glasses) {
    const gz = headC[2] + 0.1 * s;
    for (const side of [-1, 1]) {
      const cx = headC[0] + side * 0.035 * s;
      // armação: quatro barras finas formando um retângulo
      g.box({ center: [cx, eyeY + 0.02 * s, gz], size: [0.05 * s, 0.004 * s, 0.004 * s], bone: J("Head"), material: "frame", color: "#141414", roughness: 0.4, metallic: 0.3 });
      g.box({ center: [cx, eyeY - 0.02 * s, gz], size: [0.05 * s, 0.004 * s, 0.004 * s], bone: J("Head"), material: "frame", color: "#141414", roughness: 0.4, metallic: 0.3 });
      g.box({ center: [cx + side * 0.025 * s, eyeY, gz], size: [0.004 * s, 0.04 * s, 0.004 * s], bone: J("Head"), material: "frame", color: "#141414", roughness: 0.4, metallic: 0.3 });
      g.box({ center: [cx - side * 0.025 * s, eyeY, gz], size: [0.004 * s, 0.04 * s, 0.004 * s], bone: J("Head"), material: "frame", color: "#141414", roughness: 0.4, metallic: 0.3 });
      // lente
      g.box({ center: [cx, eyeY, gz - 0.002 * s], size: [0.046 * s, 0.036 * s, 0.002 * s], bone: J("Head"), material: "lens", color: "#9fb4c4", roughness: 0.15, metallic: 0.1 });
      // haste
      g.box({ center: [headC[0] + side * 0.1 * s, eyeY + 0.015 * s, headC[2] + 0.03 * s], size: [0.004 * s, 0.004 * s, 0.14 * s], bone: J("Head"), material: "frame", color: "#141414", roughness: 0.4, metallic: 0.3 });
    }
    g.box({ center: [headC[0], eyeY + 0.012 * s, gz], size: [0.024 * s, 0.004 * s, 0.004 * s], bone: J("Head"), material: "frame", color: "#141414", roughness: 0.4, metallic: 0.3 });
  }

  // --- Braços ---------------------------------------------------------------
  for (const side of ["Left", "Right"]) {
    const ua = P(`${side}UpperArm`);
    g.sphere({ center: ua, radius: 0.06 * w, bone: J(`${side}UpperArm`), material: "sleeves", color: variant.sleeves, segments: 10, rings: 8 });
    g.box({ center: [ua[0], ua[1] - 0.15 * s, ua[2]], size: [0.1 * w, 0.26 * s, 0.1 * w], bone: J(`${side}UpperArm`), material: "sleeves", color: variant.sleeves, taperBottom: 0.85 });
    const la = P(`${side}LowerArm`);
    g.sphere({ center: la, radius: 0.045 * w, bone: J(`${side}LowerArm`), material: "sleeves", color: variant.sleeves, segments: 10, rings: 8 });
    g.box({ center: [la[0], la[1] - 0.13 * s, la[2]], size: [0.085 * w, 0.22 * s, 0.085 * w], bone: J(`${side}LowerArm`), material: "skin", color: skin, taperBottom: 0.8 });
    const hand = P(`${side}Hand`);
    g.box({ center: [hand[0], hand[1] - 0.07 * s, hand[2]], size: [0.07 * w, 0.14 * s, 0.035 * w], bone: J(`${side}Hand`), material: "skin", color: skin, taperBottom: 0.8 });
  }

  // --- Pernas ---------------------------------------------------------------
  for (const side of ["Left", "Right"]) {
    const ul = P(`${side}UpperLeg`);
    g.box({ center: [ul[0], ul[1] - 0.21 * s, ul[2]], size: [0.14 * w, 0.42 * s, 0.15 * w], bone: J(`${side}UpperLeg`), material: "pants", color: variant.pants, taperBottom: 0.82 });
    const ll = P(`${side}LowerLeg`);
    g.sphere({ center: ll, radius: 0.06 * w, bone: J(`${side}LowerLeg`), material: "pants", color: variant.pants, segments: 10, rings: 8 });
    g.box({ center: [ll[0], ll[1] - 0.2 * s, ll[2]], size: [0.115 * w, 0.4 * s, 0.125 * w], bone: J(`${side}LowerLeg`), material: "pants", color: variant.pants, taperBottom: 0.8 });
    const ft = P(`${side}Foot`);
    g.box({ center: [ft[0], ft[1] - 0.025 * s, ft[2] + 0.05 * w], size: [0.11 * w, 0.065 * s, 0.26 * w], bone: J(`${side}Foot`), material: "boots", color: variant.boots, roughness: 0.75, taperTop: 0.9 });
  }

  return { geometry: g, bindPositions: B, scale: s };
}

// ---------------------------------------------------------------------------
// Animações — pose por osso em função da fase p ∈ [0,1)
// Ângulos em graus (rx, ry, rz) no espaço local do osso; translação extra do Hips.
// Convenção: rx negativo = membro inferior balança para frente (+Z);
// rx positivo = tronco inclina para frente.
// ---------------------------------------------------------------------------
const TAU = Math.PI * 2;

function restPose() {
  const pose = {};
  for (const b of BONE_DEFS) pose[b.name] = [0, 0, 0];
  pose.hipsOffset = [0, 0, 0];
  return pose;
}

function addRot(pose, bone, rx = 0, ry = 0, rz = 0) {
  pose[bone][0] += rx;
  pose[bone][1] += ry;
  pose[bone][2] += rz;
}

/** Braços relaxados ligeiramente afastados do corpo para não atravessar o tronco. */
function relaxedArms(pose, spread = 7) {
  addRot(pose, "LeftUpperArm", 0, 0, spread);
  addRot(pose, "RightUpperArm", 0, 0, -spread);
  addRot(pose, "LeftLowerArm", -10, 0, 0);
  addRot(pose, "RightLowerArm", -10, 0, 0);
}

function gaitPose(p, { legAmp, kneeAmp, armAmp, elbow, lean, bob, twist, duration }) {
  const pose = restPose();
  const s = Math.sin(TAU * p);
  // Pernas (esquerda para frente quando s > 0)
  addRot(pose, "LeftUpperLeg", -legAmp * s);
  addRot(pose, "RightUpperLeg", legAmp * s);
  const kneeL = kneeAmp * Math.max(0, Math.sin(TAU * (p - 0.7))) + 4;
  const kneeR = kneeAmp * Math.max(0, Math.sin(TAU * (p - 0.2))) + 4;
  addRot(pose, "LeftLowerLeg", kneeL);
  addRot(pose, "RightLowerLeg", kneeR);
  // pé: compensa parcialmente a flexão para não "espetar" o chão
  addRot(pose, "LeftFoot", -kneeL * 0.35 + legAmp * s * 0.25);
  addRot(pose, "RightFoot", -kneeR * 0.35 - legAmp * s * 0.25);
  // Braços em oposição às pernas
  addRot(pose, "LeftUpperArm", armAmp * s, 0, 6);
  addRot(pose, "RightUpperArm", -armAmp * s, 0, -6);
  addRot(pose, "LeftLowerArm", elbow - 8 * Math.max(0, s));
  addRot(pose, "RightLowerArm", elbow - 8 * Math.max(0, -s));
  // Tronco: inclinação, torção pélvica e contra-rotação do peito
  addRot(pose, "Spine", lean * 0.6, 0, 0);
  addRot(pose, "Chest", lean * 0.4, -twist * s, 0);
  addRot(pose, "Hips", 0, twist * s, 0);
  addRot(pose, "Head", -lean * 0.5, twist * 0.3 * s, 0);
  // Subida e descida do quadril (duas vezes por ciclo; mais baixo no apoio duplo)
  pose.hipsOffset = [0, -bob * (1 - Math.cos(2 * TAU * p)) / 2, 0];
  void duration;
  return pose;
}

const CLIPS = {
  Idle: {
    duration: 4.0,
    loop: true,
    pose(p) {
      const pose = restPose();
      const breath = Math.sin(TAU * p);
      addRot(pose, "Chest", 1.6 * breath, 0, 0);
      addRot(pose, "Spine", 0.6 * breath, 0, 0);
      addRot(pose, "Head", -0.8 * breath, 4 * Math.sin(TAU * p * 0.5 + 0.4), 0);
      relaxedArms(pose, 7 + 0.8 * breath);
      addRot(pose, "LeftUpperArm", 1.5 * breath, 0, 0);
      addRot(pose, "RightUpperArm", 1.5 * breath, 0, 0);
      pose.hipsOffset = [0, 0.004 * breath, 0];
      return pose;
    },
  },
  Walk: {
    duration: 1.05,
    loop: true,
    pose: (p) => gaitPose(p, { legAmp: 27, kneeAmp: 42, armAmp: 18, elbow: -14, lean: 3, bob: 0.018, twist: 3 }),
  },
  Run: {
    duration: 0.62,
    loop: true,
    pose: (p) => {
      const pose = gaitPose(p, { legAmp: 46, kneeAmp: 78, armAmp: 38, elbow: -78, lean: 12, bob: 0.045, twist: 5 });
      return pose;
    },
  },
  CrouchIdle: {
    duration: 3.5,
    loop: true,
    pose(p) {
      const pose = restPose();
      const breath = Math.sin(TAU * p);
      addRot(pose, "LeftUpperLeg", -60, 0, 6);
      addRot(pose, "RightUpperLeg", -60, 0, -6);
      addRot(pose, "LeftLowerLeg", 98);
      addRot(pose, "RightLowerLeg", 98);
      addRot(pose, "LeftFoot", -38);
      addRot(pose, "RightFoot", -38);
      addRot(pose, "Spine", 18 + 0.6 * breath);
      addRot(pose, "Chest", 8 + 1.2 * breath);
      addRot(pose, "Head", -20, 3 * Math.sin(TAU * p * 0.5), 0);
      addRot(pose, "LeftUpperArm", -22, 0, 12);
      addRot(pose, "RightUpperArm", -22, 0, -12);
      addRot(pose, "LeftLowerArm", -55);
      addRot(pose, "RightLowerArm", -55);
      pose.hipsOffset = [0, -0.35, 0.02];
      return pose;
    },
  },
  CrouchWalk: {
    duration: 1.1,
    loop: true,
    pose(p) {
      const pose = restPose();
      const s = Math.sin(TAU * p);
      addRot(pose, "LeftUpperLeg", -58 - 16 * s, 0, 5);
      addRot(pose, "RightUpperLeg", -58 + 16 * s, 0, -5);
      const kneeL = 96 + 14 * Math.max(0, Math.sin(TAU * (p - 0.7)));
      const kneeR = 96 + 14 * Math.max(0, Math.sin(TAU * (p - 0.2)));
      addRot(pose, "LeftLowerLeg", kneeL);
      addRot(pose, "RightLowerLeg", kneeR);
      addRot(pose, "LeftFoot", -38 - 8 * s);
      addRot(pose, "RightFoot", -38 + 8 * s);
      addRot(pose, "Spine", 20);
      addRot(pose, "Chest", 8, -3 * s, 0);
      addRot(pose, "Hips", 0, 3 * s, 0);
      addRot(pose, "Head", -22, 2 * s, 0);
      addRot(pose, "LeftUpperArm", -18 + 12 * s, 0, 12);
      addRot(pose, "RightUpperArm", -18 - 12 * s, 0, -12);
      addRot(pose, "LeftLowerArm", -50);
      addRot(pose, "RightLowerArm", -50);
      pose.hipsOffset = [0, -0.33 - 0.012 * (1 - Math.cos(2 * TAU * p)) / 2, 0.02];
      return pose;
    },
  },
  Talk: {
    duration: 4.0,
    loop: true,
    pose(p) {
      const pose = restPose();
      const breath = Math.sin(TAU * p);
      addRot(pose, "Chest", 1.4 * breath, 2.5 * Math.sin(TAU * p * 0.5), 0);
      addRot(pose, "Spine", 0.5 * breath, 0, 0);
      addRot(pose, "Head", 3 * Math.sin(TAU * p * 2), 5 * Math.sin(TAU * p), 1.5 * Math.sin(TAU * p * 1.5));
      relaxedArms(pose, 7);
      // braço direito gesticula
      addRot(pose, "RightUpperArm", -22 - 9 * Math.sin(TAU * p * 2), 0, -10);
      addRot(pose, "RightLowerArm", -62 + 16 * Math.sin(TAU * p * 3));
      addRot(pose, "LeftUpperArm", -6, 0, 0);
      addRot(pose, "LeftLowerArm", -22 + 6 * Math.sin(TAU * p * 2 + 1));
      pose.hipsOffset = [0, 0.003 * breath, 0];
      return pose;
    },
  },
  Interact: {
    duration: 1.2,
    loop: false,
    pose(p) {
      const pose = restPose();
      const reach = smoothstep(0, 0.35, p) - smoothstep(0.62, 1.0, p);
      relaxedArms(pose, 7);
      addRot(pose, "RightUpperArm", -78 * reach, 0, 0);
      addRot(pose, "RightLowerArm", -12 * reach, 0, 0);
      addRot(pose, "Spine", 7 * reach, 0, 0);
      addRot(pose, "Chest", 2 * reach, -4 * reach, 0);
      addRot(pose, "Head", 9 * reach, -5 * reach, 0);
      return pose;
    },
  },
};

function sampleClip(name, clip, scale) {
  const frames = Math.max(2, Math.round(clip.duration * FPS)) + 1;
  const times = new Float32Array(frames);
  const rot = {};
  for (const b of BONE_DEFS) rot[b.name] = new Float32Array(frames * 4);
  const hipsTrans = new Float32Array(frames * 3);
  const hipsBind = BONE_DEFS[0].offset;
  for (let f = 0; f < frames; f++) {
    const t = (f / (frames - 1)) * clip.duration;
    const p = clip.loop ? (f / (frames - 1)) % 1 : f / (frames - 1);
    times[f] = t;
    const pose = clip.pose(p);
    for (const b of BONE_DEFS) {
      const [rx, ry, rz] = pose[b.name];
      const q = eulerToQuat(rx, ry, rz);
      rot[b.name].set(q, f * 4);
    }
    const [ox, oy, oz] = pose.hipsOffset;
    hipsTrans.set([(hipsBind[0] + ox) * scale, (hipsBind[1] + oy) * scale, (hipsBind[2] + oz) * scale], f * 3);
  }
  return { name, times, rot, hipsTrans, duration: clip.duration };
}

// ---------------------------------------------------------------------------
// Escrita do GLB
// ---------------------------------------------------------------------------
class GlbWriter {
  constructor() {
    this.chunks = []; // Buffer
    this.byteLength = 0;
    this.bufferViews = [];
    this.accessors = [];
  }
  _align(n = 4) {
    const pad = (n - (this.byteLength % n)) % n;
    if (pad) {
      this.chunks.push(Buffer.alloc(pad));
      this.byteLength += pad;
    }
  }
  addBufferView(typedArray, target) {
    this._align(4);
    const buf = Buffer.from(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
    const view = { buffer: 0, byteOffset: this.byteLength, byteLength: buf.byteLength };
    if (target) view.target = target;
    this.chunks.push(buf);
    this.byteLength += buf.byteLength;
    this.bufferViews.push(view);
    return this.bufferViews.length - 1;
  }
  addAccessor(typedArray, { componentType, type, count, target, min, max, normalized }) {
    const bufferView = this.addBufferView(typedArray, target);
    const acc = { bufferView, componentType, count, type };
    if (min) acc.min = min;
    if (max) acc.max = max;
    if (normalized) acc.normalized = true;
    this.accessors.push(acc);
    return this.accessors.length - 1;
  }
  finish(json) {
    json.buffers = [{ byteLength: this.byteLength }];
    json.bufferViews = this.bufferViews;
    json.accessors = this.accessors;
    const jsonStr = JSON.stringify(json);
    let jsonBuf = Buffer.from(jsonStr, "utf8");
    const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
    if (jsonPad) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);
    this._align(4);
    const bin = Buffer.concat(this.chunks);
    const header = Buffer.alloc(12);
    header.writeUInt32LE(0x46546c67, 0); // 'glTF'
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + bin.length, 8);
    const jsonHeader = Buffer.alloc(8);
    jsonHeader.writeUInt32LE(jsonBuf.length, 0);
    jsonHeader.writeUInt32LE(0x4e4f534a, 4); // 'JSON'
    const binHeader = Buffer.alloc(8);
    binHeader.writeUInt32LE(bin.length, 0);
    binHeader.writeUInt32LE(0x004e4942, 4); // 'BIN\0'
    return Buffer.concat([header, jsonHeader, jsonBuf, binHeader, bin]);
  }
}

const FLOAT = 5126, UBYTE = 5121, USHORT = 5123, UINT = 5125;
const ARRAY_BUFFER = 34962, ELEMENT_ARRAY_BUFFER = 34963;

function hexToLinear(hex) {
  const n = parseInt(hex.slice(1), 16);
  const toLin = (c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return [toLin((n >> 16) & 255), toLin((n >> 8) & 255), toLin(n & 255), 1];
}

function minMax(arr, stride) {
  const min = new Array(stride).fill(Infinity);
  const max = new Array(stride).fill(-Infinity);
  for (let i = 0; i < arr.length; i += stride) {
    for (let k = 0; k < stride; k++) {
      const v = arr[i + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  return { min, max };
}

function buildGlb(variantName, variant) {
  const { geometry: g, bindPositions, scale } = buildCharacterGeometry(variant);
  const writer = new GlbWriter();

  // --- Malha --------------------------------------------------------------
  const positions = new Float32Array(g.positions);
  const normals = new Float32Array(g.normals);
  const joints = new Uint8Array(g.joints);
  const weights = new Float32Array(g.weights);
  const vertexCount = positions.length / 3;
  const pmm = minMax(positions, 3);
  const posAcc = writer.addAccessor(positions, { componentType: FLOAT, type: "VEC3", count: vertexCount, target: ARRAY_BUFFER, min: pmm.min, max: pmm.max });
  const nrmAcc = writer.addAccessor(normals, { componentType: FLOAT, type: "VEC3", count: vertexCount, target: ARRAY_BUFFER });
  const jntAcc = writer.addAccessor(joints, { componentType: UBYTE, type: "VEC4", count: vertexCount, target: ARRAY_BUFFER });
  const wgtAcc = writer.addAccessor(weights, { componentType: FLOAT, type: "VEC4", count: vertexCount, target: ARRAY_BUFFER });

  const materials = [...g.materials.values()].sort((a, b) => a.index - b.index);
  const primitives = [];
  for (const [mi, indexList] of [...g.indicesByMaterial.entries()].sort((a, b) => a[0] - b[0])) {
    const useInt = vertexCount > 65535;
    const idx = useInt ? new Uint32Array(indexList) : new Uint16Array(indexList);
    const idxAcc = writer.addAccessor(idx, { componentType: useInt ? UINT : USHORT, type: "SCALAR", count: idx.length, target: ELEMENT_ARRAY_BUFFER });
    primitives.push({
      attributes: { POSITION: posAcc, NORMAL: nrmAcc, JOINTS_0: jntAcc, WEIGHTS_0: wgtAcc },
      indices: idxAcc,
      material: mi,
      mode: 4,
    });
  }

  // --- Esqueleto -----------------------------------------------------------
  // Nós: 0 = raiz "Armature", 1..N = ossos, N+1 = nó da malha
  const nodes = [{ name: `${variantName}_armature`, children: [1] }];
  const jointNodeIndices = [];
  BONE_DEFS.forEach((b, i) => {
    const nodeIndex = i + 1;
    jointNodeIndices.push(nodeIndex);
    const node = { name: b.name, translation: b.offset.map((v) => v * scale), rotation: [0, 0, 0, 1] };
    nodes.push(node);
  });
  BONE_DEFS.forEach((b, i) => {
    if (b.parent !== null) {
      const parentNode = nodes[BONE_INDEX[b.parent] + 1];
      parentNode.children = parentNode.children ?? [];
      parentNode.children.push(i + 1);
    }
  });
  const ibm = new Float32Array(BONE_DEFS.length * 16);
  bindPositions.forEach((p, i) => {
    // matriz coluna-maior: translação (-p)
    ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -p[0], -p[1], -p[2], 1], i * 16);
  });
  const ibmAcc = writer.addAccessor(ibm, { componentType: FLOAT, type: "MAT4", count: BONE_DEFS.length });
  const meshNodeIndex = nodes.length;
  nodes.push({ name: `${variantName}_mesh`, mesh: 0, skin: 0 });

  // --- Animações -----------------------------------------------------------
  const animations = [];
  for (const [clipName, clip] of Object.entries(CLIPS)) {
    const sampled = sampleClip(clipName, clip, scale);
    const timeAcc = writer.addAccessor(sampled.times, {
      componentType: FLOAT,
      type: "SCALAR",
      count: sampled.times.length,
      min: [0],
      max: [sampled.times[sampled.times.length - 1]],
    });
    const samplers = [];
    const channels = [];
    BONE_DEFS.forEach((b, i) => {
      const outAcc = writer.addAccessor(sampled.rot[b.name], { componentType: FLOAT, type: "VEC4", count: sampled.times.length });
      samplers.push({ input: timeAcc, output: outAcc, interpolation: "LINEAR" });
      channels.push({ sampler: samplers.length - 1, target: { node: i + 1, path: "rotation" } });
    });
    const hipsAcc = writer.addAccessor(sampled.hipsTrans, { componentType: FLOAT, type: "VEC3", count: sampled.times.length });
    samplers.push({ input: timeAcc, output: hipsAcc, interpolation: "LINEAR" });
    channels.push({ sampler: samplers.length - 1, target: { node: 1, path: "translation" } });
    animations.push({ name: clipName, samplers, channels, extras: { loop: clip.loop, duration: clip.duration } });
  }

  const json = {
    asset: {
      version: "2.0",
      generator: "eva tools/gen-character.mjs",
      copyright: "Projeto O Último Veto — EVA. Manequim provisório gerado proceduralmente; sem marcas.",
      extras: { license: "CC0-1.0 (asset do próprio projeto)", variant: variantName, label: variant.label },
    },
    scene: 0,
    scenes: [{ name: variantName, nodes: [0, meshNodeIndex] }],
    nodes,
    meshes: [{ name: `${variantName}_body`, primitives }],
    skins: [{ name: `${variantName}_skin`, inverseBindMatrices: ibmAcc, joints: jointNodeIndices, skeleton: 1 }],
    materials: materials.map((m) => ({
      name: m.key ?? undefined,
      pbrMetallicRoughness: { baseColorFactor: hexToLinear(m.color), metallicFactor: m.metallic, roughnessFactor: m.roughness },
      doubleSided: false,
    })),
    animations,
  };
  // nome dos materiais
  for (const [key, m] of g.materials.entries()) json.materials[m.index].name = key;

  return { glb: writer.finish(json), stats: { vertices: vertexCount, triangles: [...g.indicesByMaterial.values()].reduce((a, l) => a + l.length / 3, 0), bones: BONE_DEFS.length, clips: Object.keys(CLIPS) } };
}

// ---------------------------------------------------------------------------
mkdirSync(OUT_DIR, { recursive: true });
const manifest = { generator: "tools/gen-character.mjs", fps: FPS, bones: BONE_DEFS.map((b) => b.name), clips: {}, characters: {} };
for (const [name, clip] of Object.entries(CLIPS)) manifest.clips[name] = { duration: clip.duration, loop: clip.loop };
for (const [name, variant] of Object.entries(VARIANTS)) {
  const { glb, stats } = buildGlb(name, variant);
  const file = resolve(OUT_DIR, `${name}.glb`);
  writeFileSync(file, glb);
  manifest.characters[name] = { file: `${name}.glb`, label: variant.label, height: variant.height, ...stats };
  console.log(`✔ ${name}.glb — ${stats.vertices} vértices, ${stats.triangles} triângulos, ${stats.bones} ossos, ${stats.clips.length} clipes (${(glb.length / 1024).toFixed(1)} KB)`);
}
writeFileSync(resolve(OUT_DIR, "characters.json"), JSON.stringify(manifest, null, 2));
console.log(`Manifesto: ${resolve(OUT_DIR, "characters.json")}`);

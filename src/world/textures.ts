/**
 * Texturas procedurais geradas em canvas na inicialização.
 * Origem: código do próprio projeto (sem imagens externas). São provisórias:
 * em produção devem ser substituídas por texturas PBR fotografadas/escaneadas
 * com licença registrada em public/assets/licenses/ASSETS.md.
 */
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Scene } from "@babylonjs/core/scene";

/** Há um canvas 2D disponível? (false em testes headless/Node: materiais caem para cores lisas) */
export const CANVAS_AVAILABLE: boolean = (() => {
  try {
    return typeof document !== "undefined" && typeof document.createElement === "function" && !!document.createElement("canvas").getContext("2d");
  } catch {
    return false;
  }
})();

// --- Ruído determinístico -----------------------------------------------------
function hash2(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 1446997) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function smoothNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** fBm periódico aproximado (usa coordenadas em "células"; para tiling, usa-se frequência inteira). */
export function fbm(x: number, y: number, octaves: number, seed: number, lacunarity = 2, gain = 0.5): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += smoothNoise(x * freq, y * freq, seed + i * 17) * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

export interface HeightField {
  size: number;
  data: Float32Array;
}

/** Campo de altura periódico (tileable) — amostra o ruído com frequência inteira. */
export function heightField(size: number, cells: number, octaves: number, seed: number, gain = 0.5): HeightField {
  const data = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Para ser tileable usamos a "distância toroidal" misturando quatro amostras.
      const fx = (x / size) * cells;
      const fy = (y / size) * cells;
      const n00 = fbm(fx, fy, octaves, seed, 2, gain);
      const n10 = fbm(fx - cells, fy, octaves, seed, 2, gain);
      const n01 = fbm(fx, fy - cells, octaves, seed, 2, gain);
      const n11 = fbm(fx - cells, fy - cells, octaves, seed, 2, gain);
      const u = x / size;
      const v = y / size;
      const n = n00 * (1 - u) * (1 - v) + n10 * u * (1 - v) + n01 * (1 - u) * v + n11 * u * v;
      data[y * size + x] = n;
    }
  }
  return { size, data };
}

type RGB = [number, number, number];

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

interface AlbedoOptions {
  base: string;
  dark: string;
  light: string;
  /** pontos escuros esparsos (sujeira) 0–1 */
  grime?: number;
  /** linhas de rachadura */
  cracks?: number;
  seed: number;
}

function makeTexture(scene: Scene, name: string, size: number, draw: (ctx: CanvasRenderingContext2D) => void, opts: { uScale?: number; vScale?: number; hasAlpha?: boolean } = {}): Texture | null {
  if (!CANVAS_AVAILABLE) return null;
  const tex = new DynamicTexture(name, { width: size, height: size }, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  draw(ctx);
  tex.update(true);
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  tex.uScale = opts.uScale ?? 1;
  tex.vScale = opts.vScale ?? 1;
  tex.hasAlpha = opts.hasAlpha ?? false;
  tex.anisotropicFilteringLevel = 8;
  return tex;
}

/** Albedo de superfície granulada a partir de um campo de altura. */
export function surfaceAlbedo(scene: Scene, name: string, size: number, hf: HeightField, o: AlbedoOptions, tiling: { u: number; v: number }): Texture | null {
  const base = hexToRgb(o.base);
  const dark = hexToRgb(o.dark);
  const light = hexToRgb(o.light);
  const grime = hf.size === size ? heightField(size, 3, 3, o.seed + 99, 0.6) : null;
  return makeTexture(
    scene,
    name,
    size,
    (ctx) => {
      const img = ctx.createImageData(size, size);
      const d = img.data;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const i = y * size + x;
          const h = hf.data[i] ?? 0.5;
          let c = h < 0.5 ? mix(dark, base, h * 2) : mix(base, light, (h - 0.5) * 2);
          if (grime && o.grime) {
            const g = grime.data[i] ?? 0.5;
            if (g < o.grime) c = mix(c, [c[0] * 0.55, c[1] * 0.5, c[2] * 0.45], (o.grime - g) / o.grime);
          }
          if (o.cracks) {
            // "rachaduras": vales estreitos do ruído de baixa frequência
            const cr = Math.abs((hf.data[i] ?? 0.5) - 0.5);
            if (cr < 0.012 * o.cracks) c = mix(c, [20, 18, 16], 1 - cr / (0.012 * o.cracks));
          }
          const p = i * 4;
          d[p] = c[0];
          d[p + 1] = c[1];
          d[p + 2] = c[2];
          d[p + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    },
    { uScale: tiling.u, vScale: tiling.v },
  );
}

/** Mapa de normais tangentes a partir de um campo de altura. */
export function normalMap(scene: Scene, name: string, hf: HeightField, strength: number, tiling: { u: number; v: number }): Texture | null {
  const size = hf.size;
  return makeTexture(
    scene,
    name,
    size,
    (ctx) => {
      const img = ctx.createImageData(size, size);
      const d = img.data;
      const at = (x: number, y: number) => hf.data[((y + size) % size) * size + ((x + size) % size)] ?? 0.5;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
          const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
          let nx = -dx;
          let ny = dy; // a textura é enviada com invertY, logo +v aponta para linhas menores do canvas
          let nz = 1;
          const len = Math.hypot(nx, ny, nz);
          nx /= len;
          ny /= len;
          nz /= len;
          const p = (y * size + x) * 4;
          d[p] = (nx * 0.5 + 0.5) * 255;
          d[p + 1] = (ny * 0.5 + 0.5) * 255;
          d[p + 2] = (nz * 0.5 + 0.5) * 255;
          d[p + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    },
    { uScale: tiling.u, vScale: tiling.v },
  );
}

/** Textura de tijolos/reboco: tijolos aparentes onde o reboco caiu. */
export function plasterBrickAlbedo(scene: Scene, name: string, size: number, plaster: string, brick: string, mortar: string, seed: number, tiling: { u: number; v: number }): { albedo: Texture | null; height: HeightField } {
  const hf = heightField(size, 4, 4, seed, 0.55);
  const damage = heightField(size, 2, 3, seed + 7, 0.5);
  const pl = hexToRgb(plaster);
  const br = hexToRgb(brick);
  const mo = hexToRgb(mortar);
  const out = new Float32Array(size * size);
  const albedo = makeTexture(
    scene,
    name,
    size,
    (ctx) => {
      const img = ctx.createImageData(size, size);
      const d = img.data;
      const brickH = size / 16;
      const brickW = size / 8;
      for (let y = 0; y < size; y++) {
        const row = Math.floor(y / brickH);
        for (let x = 0; x < size; x++) {
          const i = y * size + x;
          const n = hf.data[i] ?? 0.5;
          const dmg = damage.data[i] ?? 0.5;
          const exposed = dmg < 0.38;
          let c: RGB;
          let h: number;
          if (exposed) {
            const xo = (x + (row % 2) * brickW * 0.5) % brickW;
            const yo = y % brickH;
            const isMortar = xo < brickW * 0.06 || yo < brickH * 0.12;
            c = isMortar ? mo : mix(br, [br[0] * 0.7, br[1] * 0.7, br[2] * 0.7], n);
            h = isMortar ? 0.2 : 0.55 + n * 0.2;
          } else {
            const t = (0.38 - dmg) * -6; // borda do reboco mais escura
            c = mix(pl, [pl[0] * 0.75, pl[1] * 0.73, pl[2] * 0.7], Math.max(0, Math.min(1, n * 0.8 + Math.max(0, 0.25 - Math.abs(t)) * 2)));
            if (n > 0.72) c = mix(c, [c[0] * 0.6, c[1] * 0.6, c[2] * 0.58], (n - 0.72) * 2.5); // manchas de umidade
            h = 0.85 + n * 0.12;
          }
          out[i] = h;
          const p = i * 4;
          d[p] = c[0];
          d[p + 1] = c[1];
          d[p + 2] = c[2];
          d[p + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    },
    { uScale: tiling.u, vScale: tiling.v },
  );
  return { albedo, height: { size, data: out } };
}

/** Textura de folhagem/mato com alpha (quatro tufos). */
export function foliageAlpha(scene: Scene, name: string, size: number, colorA: string, colorB: string, seed: number, kind: "grass" | "leaves"): Texture | null {
  const ca = hexToRgb(colorA);
  const cb = hexToRgb(colorB);
  return makeTexture(
    scene,
    name,
    size,
    (ctx) => {
      ctx.clearRect(0, 0, size, size);
      if (kind === "grass") {
        const blades = 160;
        for (let i = 0; i < blades; i++) {
          const x0 = hash2(i, 1, seed) * size;
          const h = (0.35 + hash2(i, 2, seed) * 0.6) * size;
          const lean = (hash2(i, 3, seed) - 0.5) * size * 0.35;
          const w = 2 + hash2(i, 4, seed) * 4;
          const c = mix(ca, cb, hash2(i, 5, seed));
          ctx.strokeStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
          ctx.lineWidth = w;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(x0, size);
          ctx.quadraticCurveTo(x0 + lean * 0.4, size - h * 0.6, x0 + lean, size - h);
          ctx.stroke();
        }
      } else {
        const leaves = 420;
        for (let i = 0; i < leaves; i++) {
          const x = hash2(i, 1, seed) * size;
          const y = hash2(i, 2, seed) * size;
          const r = 4 + hash2(i, 3, seed) * 10;
          const c = mix(ca, cb, hash2(i, 5, seed));
          ctx.fillStyle = `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${0.85 + hash2(i, 6, seed) * 0.15})`;
          ctx.beginPath();
          ctx.ellipse(x, y, r, r * 0.55, hash2(i, 7, seed) * Math.PI, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },
    { hasAlpha: true },
  );
}

export interface SignOptions {
  width: number;
  height: number;
  bg: string;
  fg: string;
  lines: string[];
  font?: string;
  border?: string;
  weathered?: number; // 0–1
  seed?: number;
  align?: "left" | "center";
}

/** Placa/letreiro em português — texto renderizado em canvas, aplicado em geometria 3D. */
export function signTexture(scene: Scene, name: string, o: SignOptions): Texture | null {
  if (!CANVAS_AVAILABLE) return null;
  const size = 512;
  const tex = new DynamicTexture(name, { width: o.width, height: o.height }, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.fillStyle = o.bg;
  ctx.fillRect(0, 0, o.width, o.height);
  if (o.border) {
    ctx.strokeStyle = o.border;
    ctx.lineWidth = Math.max(4, o.height * 0.04);
    ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, o.width - ctx.lineWidth, o.height - ctx.lineWidth);
  }
  const font = o.font ?? `bold ${Math.floor(o.height / (o.lines.length + 0.8))}px "Arial Narrow", "Helvetica Neue", Arial, sans-serif`;
  ctx.font = font;
  ctx.fillStyle = o.fg;
  ctx.textAlign = o.align ?? "center";
  ctx.textBaseline = "middle";
  const lineH = o.height / (o.lines.length + 0.4);
  o.lines.forEach((line, i) => {
    const y = lineH * (i + 0.7);
    const x = (o.align ?? "center") === "center" ? o.width / 2 : o.width * 0.06;
    ctx.fillText(line, x, y, o.width * 0.92);
  });
  if (o.weathered) {
    const seed = o.seed ?? 3;
    const spots = Math.floor(o.weathered * 260);
    for (let i = 0; i < spots; i++) {
      const x = hash2(i, 11, seed) * o.width;
      const y = hash2(i, 12, seed) * o.height;
      const r = 2 + hash2(i, 13, seed) * 14;
      ctx.fillStyle = `rgba(60,45,30,${0.08 + hash2(i, 14, seed) * 0.35})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // escorrido de ferrugem
    for (let i = 0; i < spots / 6; i++) {
      const x = hash2(i, 15, seed) * o.width;
      const y0 = hash2(i, 16, seed) * o.height * 0.5;
      ctx.fillStyle = "rgba(110,60,25,0.25)";
      ctx.fillRect(x, y0, 2 + hash2(i, 17, seed) * 3, o.height - y0);
    }
  }
  void size;
  tex.update(true);
  tex.hasAlpha = false;
  return tex;
}

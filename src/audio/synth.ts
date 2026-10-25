/**
 * Sons sintetizados proceduralmente (PROVISÓRIOS). Não existem arquivos de
 * áudio gravados no projeto ainda; estes geradores produzem buffers reais
 * em tempo de execução para comprovar o fluxo de áudio espacial, passos,
 * ambiente e feedback de interface. Ver docs/STATUS.md para o plano de
 * substituição por gravações licenciadas.
 *
 * Funções puras (sem Web Audio) — testáveis em Node.
 */

export interface SynthBuffer {
  sampleRate: number;
  channels: Float32Array<ArrayBuffer>[];
}

/** Gerador pseudoaleatório determinístico (xorshift). */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

function envelope(t: number, attack: number, decay: number): number {
  if (t < attack) return t / attack;
  return Math.exp(-(t - attack) / decay);
}

/** Filtro passa-baixa de 1 polo aplicado in-place. */
function lowpass(data: Float32Array, sampleRate: number, cutoff: number): void {
  const rc = 1 / (2 * Math.PI * cutoff);
  const dt = 1 / sampleRate;
  const a = dt / (rc + dt);
  let y = 0;
  for (let i = 0; i < data.length; i++) {
    y += a * ((data[i] ?? 0) - y);
    data[i] = y;
  }
}

/** Filtro passa-alta de 1 polo aplicado in-place. */
function highpass(data: Float32Array, sampleRate: number, cutoff: number): void {
  const rc = 1 / (2 * Math.PI * cutoff);
  const dt = 1 / sampleRate;
  const a = rc / (rc + dt);
  let yPrev = 0;
  let xPrev = 0;
  for (let i = 0; i < data.length; i++) {
    const x = data[i] ?? 0;
    const y = a * (yPrev + x - xPrev);
    data[i] = y;
    yPrev = y;
    xPrev = x;
  }
}

function normalize(data: Float32Array, peak = 0.9): void {
  let max = 0;
  for (let i = 0; i < data.length; i++) max = Math.max(max, Math.abs(data[i] ?? 0));
  if (max < 1e-6) return;
  const g = peak / max;
  for (let i = 0; i < data.length; i++) data[i] = (data[i] ?? 0) * g;
}

/** Passo sobre concreto: pulso de ruído filtrado + leve transiente grave. */
export function footstep(sampleRate: number, kind: "walk" | "run" | "crouch", seed: number): SynthBuffer {
  const rng = makeRng(seed);
  const dur = kind === "run" ? 0.16 : kind === "crouch" ? 0.11 : 0.13;
  const n = Math.floor(dur * sampleRate);
  const data = new Float32Array(n);
  const decay = kind === "run" ? 0.045 : 0.035;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const noise = rng() * 2 - 1;
    const thump = Math.sin(2 * Math.PI * (70 + 40 * Math.exp(-t * 40)) * t) * Math.exp(-t * 30);
    data[i] = noise * envelope(t, 0.003, decay) * 0.8 + thump * (kind === "run" ? 0.6 : 0.35);
  }
  lowpass(data, sampleRate, kind === "crouch" ? 1800 : 3200);
  highpass(data, sampleRate, 120);
  normalize(data, kind === "run" ? 0.9 : kind === "crouch" ? 0.45 : 0.7);
  return { sampleRate, channels: [data] };
}

/** Vento seco + poeira: ruído marrom modulado lentamente (loop). */
export function windLoop(sampleRate: number, seconds: number, seed: number): SynthBuffer {
  const rng = makeRng(seed);
  const n = Math.floor(seconds * sampleRate);
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  let bl = 0;
  let br = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const mod = 0.55 + 0.45 * Math.sin(2 * Math.PI * (t / seconds) * 3 + 0.5) * Math.sin(2 * Math.PI * (t / seconds) * 7);
    bl += (rng() * 2 - 1) * 0.02;
    br += (rng() * 2 - 1) * 0.02;
    bl *= 0.995;
    br *= 0.995;
    left[i] = bl * mod;
    right[i] = br * mod;
  }
  lowpass(left, sampleRate, 900);
  lowpass(right, sampleRate, 900);
  const l = crossfadeLoop(left, Math.floor(sampleRate * 0.5));
  const r = crossfadeLoop(right, Math.floor(sampleRate * 0.5));
  normalize(l, 0.5);
  normalize(r, 0.5);
  return { sampleRate, channels: [l, r] };
}

/** Zumbido de gerador a combustível (loop): fundamental grave + harmônicos + ruído mecânico. */
export function generatorLoop(sampleRate: number, seconds: number, seed: number): SynthBuffer {
  const rng = makeRng(seed);
  const n = Math.floor(seconds * sampleRate);
  const data = new Float32Array(n);
  const f0 = 48;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const wobble = 1 + 0.01 * Math.sin(2 * Math.PI * 2.3 * t);
    let v = 0;
    v += Math.sin(2 * Math.PI * f0 * wobble * t) * 0.5;
    v += Math.sin(2 * Math.PI * f0 * 2 * wobble * t) * 0.25;
    v += Math.sin(2 * Math.PI * f0 * 3 * wobble * t) * 0.15;
    v += Math.sin(2 * Math.PI * f0 * 4.5 * wobble * t) * 0.08;
    v += (rng() * 2 - 1) * 0.08;
    // batidas de pistão
    const knock = ((t * f0 * 0.5) % 1) < 0.08 ? 0.25 : 0;
    data[i] = v + knock * (rng() * 2 - 1);
  }
  lowpass(data, sampleRate, 1400);
  const out = crossfadeLoop(data, Math.floor(sampleRate * 0.2));
  normalize(out, 0.6);
  return { sampleRate, channels: [out] };
}

/** Murmúrio de multidão distante: várias bandas de ruído moduladas (sem palavras). */
export function crowdLoop(sampleRate: number, seconds: number, seed: number): SynthBuffer {
  const rng = makeRng(seed);
  const n = Math.floor(seconds * sampleRate);
  const data = new Float32Array(n);
  const voices = 9;
  const phases = Array.from({ length: voices }, () => rng() * 100);
  const rates = Array.from({ length: voices }, () => 0.8 + rng() * 2.5);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    let amp = 0;
    for (let v = 0; v < voices; v++) {
      const m = Math.max(0, Math.sin(2 * Math.PI * (rates[v] ?? 1) * t + (phases[v] ?? 0)));
      amp += m * m;
    }
    data[i] = (rng() * 2 - 1) * (amp / voices);
  }
  lowpass(data, sampleRate, 1100);
  highpass(data, sampleRate, 220);
  const out = crossfadeLoop(data, Math.floor(sampleRate * 0.5));
  normalize(out, 0.35);
  return { sampleRate, channels: [out] };
}

/** Estática de rádio AM com estalos (loop). */
export function radioStaticLoop(sampleRate: number, seconds: number, seed: number): SynthBuffer {
  const rng = makeRng(seed);
  const n = Math.floor(seconds * sampleRate);
  const data = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const hiss = (rng() * 2 - 1) * 0.35;
    const crackle = rng() < 0.0008 ? (rng() * 2 - 1) * 1.0 : 0;
    const hum = Math.sin(2 * Math.PI * 60 * t) * 0.06;
    data[i] = hiss + crackle + hum;
  }
  highpass(data, sampleRate, 400);
  lowpass(data, sampleRate, 3800);
  const out = crossfadeLoop(data, Math.floor(sampleRate * 0.1));
  normalize(out, 0.4);
  return { sampleRate, channels: [out] };
}

/** Zumbido elétrico de lâmpada falhando (loop curto). */
export function fluorescentBuzz(sampleRate: number, seconds: number): SynthBuffer {
  const n = Math.floor(seconds * sampleRate);
  const data = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    data[i] = Math.sin(2 * Math.PI * 120 * t) * 0.4 + Math.sin(2 * Math.PI * 240 * t) * 0.2 + Math.sin(2 * Math.PI * 3600 * t) * 0.05;
  }
  const out = crossfadeLoop(data, Math.floor(sampleRate * 0.05));
  normalize(out, 0.25);
  return { sampleRate, channels: [out] };
}

/** Clique curto de interface / interruptor. */
export function click(sampleRate: number, pitch = 1800, seed = 1): SynthBuffer {
  const rng = makeRng(seed);
  const n = Math.floor(0.06 * sampleRate);
  const data = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    data[i] = (Math.sin(2 * Math.PI * pitch * t) * 0.7 + (rng() * 2 - 1) * 0.3) * Math.exp(-t * 90);
  }
  normalize(data, 0.5);
  return { sampleRate, channels: [data] };
}

/** Tom de confirmação (pegar objeto / objetivo concluído): dois harmônicos suaves. */
export function chime(sampleRate: number, base = 520): SynthBuffer {
  const n = Math.floor(0.7 * sampleRate);
  const data = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const env = envelope(t, 0.01, 0.22);
    data[i] = (Math.sin(2 * Math.PI * base * t) * 0.6 + Math.sin(2 * Math.PI * base * 1.5 * t) * 0.3 * Math.exp(-t * 3)) * env;
  }
  normalize(data, 0.45);
  return { sampleRate, channels: [data] };
}

/** Papel sendo pego. */
export function paperRustle(sampleRate: number, seed = 3): SynthBuffer {
  const rng = makeRng(seed);
  const n = Math.floor(0.35 * sampleRate);
  const data = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const env = Math.sin(Math.PI * Math.min(1, t / 0.35)) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 23 * t));
    data[i] = (rng() * 2 - 1) * env;
  }
  highpass(data, sampleRate, 1500);
  normalize(data, 0.35);
  return { sampleRate, channels: [data] };
}

/**
 * Garante loop sem clique: a cauda é fundida com o início e descartada, de modo
 * que o último sample emenda continuamente no primeiro. Retorna um novo buffer
 * com `fadeSamples` amostras a menos.
 */
export function crossfadeLoop(data: Float32Array, fadeSamples: number): Float32Array<ArrayBuffer> {
  const n = data.length;
  const f = Math.max(1, Math.min(fadeSamples, Math.floor(n / 2)));
  const out = new Float32Array(n - f);
  for (let i = 0; i < n - f; i++) {
    if (i < f) {
      const t = i / f;
      out[i] = (data[i] ?? 0) * t + (data[n - f + i] ?? 0) * (1 - t);
    } else {
      out[i] = data[i] ?? 0;
    }
  }
  return out;
}

/** Valor RMS (para testes e calibração de volume). */
export function rms(data: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += (data[i] ?? 0) ** 2;
  return Math.sqrt(sum / Math.max(1, data.length));
}

/**
 * Grava um vídeo curto do jogo (andar, correr, agachar, pegar objeto) com quadros determinísticos:
 * o jogo é avançado com dt fixo (30 fps) e cada quadro é lido do canvas, então o vídeo tem a
 * velocidade real mesmo quando o Chromium renderiza por software a 1–3 fps.
 *
 * Uso: node tools/capture-video.mjs [--out docs/videos/locomocao.mp4] [--width 960] [--height 540] [--fps 30]
 * Requer: npm run build (dist/), Playwright + Chromium, ffmpeg.
 */
import { mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { loadPlaywright, serveDist, CHROMIUM_ARGS, argValue } from "./lib/harness.mjs";

const { chromium } = loadPlaywright();
const OUT = resolve(argValue("--out", "docs/videos/locomocao.mp4"));
const W = Number(argValue("--width", "960"));
const H = Number(argValue("--height", "540"));
const FPS = Number(argValue("--fps", "30"));
const FRAMES_DIR = resolve(argValue("--frames", join(dirname(OUT), ".frames")));
await mkdir(dirname(OUT), { recursive: true });
await rm(FRAMES_DIR, { recursive: true, force: true });
await mkdir(FRAMES_DIR, { recursive: true });

const { base, close } = await serveDist();
const browser = await chromium.launch({ headless: true, args: CHROMIUM_ARGS });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.setDefaultTimeout(180_000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

let frameIndex = 0;
/**
 * Deslizamento dos pés: velocidade mundial do pé enquanto apoiado (altura perto do mínimo), projetada
 * na direção do deslocamento. Com a reprodução sincronizada à velocidade real, o pé apoiado fica parado
 * no chão: a média com sinal fica ≈ 0 (negativa = "moonwalk", clipe rápido demais; positiva = clipe lento).
 * A mediana do módulo inclui o movimento próprio do pé no clipe (calcanhar/ponta) e serve só de referência.
 */
function footSlide(samples, dir) {
  const out = {};
  for (const side of ["l", "r"]) {
    const pts = samples.map((s) => s[side]);
    const ymin = Math.min(...pts.map((p) => p[1]));
    const signed = [];
    const abs = [];
    for (let i = 1; i < pts.length; i++) {
      if (pts[i][1] > ymin + 0.03 || pts[i - 1][1] > ymin + 0.03) continue;
      const vx = (pts[i][0] - pts[i - 1][0]) * FPS;
      const vz = (pts[i][2] - pts[i - 1][2]) * FPS;
      signed.push(vx * dir.x + vz * dir.z);
      abs.push(Math.hypot(vx, vz));
    }
    abs.sort((a, b) => a - b);
    const mean = signed.reduce((a, b) => a + b, 0) / (signed.length || 1);
    out[side] = { stanceFrames: signed.length, mean, median: abs.length ? abs[Math.floor(abs.length / 2)] : 0 };
  }
  return out;
}

/** Avança `seconds` de jogo gravando quadros; `label` vai para o log. Devolve o snapshot e a métrica dos pés. */
async function record(seconds, label, measureFeet = false) {
  const n = Math.round(seconds * FPS);
  const t0 = Date.now();
  const feet = [];
  const start = measureFeet ? await page.evaluate(() => window.eva.snapshot().feet) : null;
  for (let i = 0; i < n; i++) {
    const { dataUrl, f } = await page.evaluate((m) => ({ dataUrl: window.eva.captureFrame(0.88), f: m ? window.eva.captureFeet() : null }), measureFeet);
    await writeFile(join(FRAMES_DIR, `f${String(frameIndex++).padStart(5, "0")}.jpg`), Buffer.from(dataUrl.split(",")[1], "base64"));
    if (f) feet.push(f);
  }
  const s = await page.evaluate(() => window.eva.snapshot());
  let slide = null;
  if (measureFeet && feet.length > 10) {
    const dx = s.feet.x - start.x;
    const dz = s.feet.z - start.z;
    const len = Math.hypot(dx, dz) || 1;
    // ignora o 1º terço (aceleração/transição de clipe)
    slide = footSlide(feet.slice(Math.floor(feet.length / 3)), { x: dx / len, z: dz / len });
    const fmt = (x) => `média ${x.mean >= 0 ? "+" : ""}${x.mean.toFixed(2)} m/s (|v| mediana ${x.median.toFixed(2)}, ${x.stanceFrames} quadros apoiados)`;
    console.log(`  ${label}: deslizamento do pé apoiado — esq ${fmt(slide.l)} · dir ${fmt(slide.r)}`);
  }
  console.log(`  ${label}: ${n} quadros em ${((Date.now() - t0) / 1000).toFixed(0)}s · estado=${s.moveState} clipe=${s.clip} pés=(${s.feet.x.toFixed(1)}, ${s.feet.z.toFixed(1)})`);
  return { ...s, slide };
}
const press = (action, down) => page.evaluate(([a, d]) => window.eva.input.simulate(a, d), [action, down]);
const tap = async (action) => {
  await press(action, true);
  await press(action, false);
};

try {
  await page.goto(`${base}?quality=baixa&pointerlock=0`, { waitUntil: "load" });
  await page.waitForFunction(() => document.getElementById("menu")?.classList.contains("visible"));
  await page.click("#btn-new");
  await page.waitForFunction(() => window.eva.state === "playing");
  await page.waitForTimeout(1500);
  // rua, de frente para o leste (praça ao fundo); câmera atrás
  await page.evaluate(() => {
    window.eva.teleportPlayer(-27, 0.12, 0.5, Math.PI / 2);
    window.eva["hud"].setObjectiveVisible(false);
  });
  await page.waitForTimeout(1200);
  await page.evaluate((fps) => window.eva.captureStart(fps), FPS);
  console.log(`Gravando ${W}x${H} a ${FPS} fps…`);
  const p0 = await record(1.0, "parado (Idle)");
  await press("forward", true);
  const p1 = await record(3.0, "andando (Walk)", true);
  await press("run", true);
  const p2 = await record(3.0, "correndo (Run)", true);
  await press("run", false);
  await press("forward", false);
  await record(1.2, "freando");
  await tap("crouchToggle");
  await record(1.0, "agachando (CrouchIdle)");
  await press("forward", true);
  const p3 = await record(2.5, "andando agachado (CrouchWalk)", true);
  await press("forward", false);
  await tap("crouchToggle");
  await record(1.0, "levantando");
  // corte: cartão de registro na oficina (clipe PickUp)
  await page.evaluate(() => {
    const g = window.eva;
    const card = g["world"].workshop.card.getAbsolutePosition();
    g.teleportPlayer(card.x - 0.2, 0.15, card.z - 1.0, 0.15);
  });
  await record(0.8, "na oficina");
  await tap("interact");
  await record(2.2, "pegando o cartão (PickUp)");
  await page.evaluate(() => window.eva.captureStop());

  const walked = Math.hypot(p1.feet.x - p0.feet.x, p1.feet.z - p0.feet.z);
  const ran = Math.hypot(p2.feet.x - p1.feet.x, p2.feet.z - p1.feet.z);
  console.log(`  deslocamento: andou ${walked.toFixed(2)} m em 3 s (${(walked / 3).toFixed(2)} m/s), correu ${ran.toFixed(2)} m em 3 s (${(ran / 3).toFixed(2)} m/s), agachado ${Math.hypot(p3.feet.x - p2.feet.x, p3.feet.z - p2.feet.z).toFixed(2)} m em 2,5 s`);
  // critério: deslizamento sistemático do pé apoiado (média com sinal) abaixo de 0,2 m/s em andar/correr/agachado
  for (const [label, p] of [["Walk", p1], ["Run", p2], ["CrouchWalk", p3]]) {
    const worst = Math.max(Math.abs(p.slide?.l.mean ?? 9), Math.abs(p.slide?.r.mean ?? 9));
    console.log(`  ${worst < 0.2 ? "✔" : "✘"} ${label}: deslizamento sistemático ${worst.toFixed(2)} m/s`);
    if (worst >= 0.2) process.exitCode = 1;
  }
} catch (e) {
  console.error("✘ falha na captura:", e);
  process.exitCode = 1;
} finally {
  await browser.close();
  close();
}

if (!existsSync(join(FRAMES_DIR, "f00000.jpg"))) {
  console.error("Nenhum quadro gravado.");
  process.exit(1);
}
// MP4 (H.264, yuv420p) + GIF pequeno para pré-visualização
const mp4 = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", join(FRAMES_DIR, "f%05d.jpg"), "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-movflags", "+faststart", OUT], { stdio: "inherit" });
if (mp4.status !== 0) {
  console.error("ffmpeg falhou ao gerar o MP4");
  process.exit(1);
}
const gif = OUT.replace(/\.mp4$/, ".gif");
spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", join(FRAMES_DIR, "f%05d.jpg"), "-vf", `fps=12,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=96[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5`, gif], { stdio: "inherit" });
await rm(FRAMES_DIR, { recursive: true, force: true });
console.log(`Vídeo: ${OUT}${existsSync(gif) ? ` · GIF: ${gif}` : ""} · ${frameIndex} quadros (${(frameIndex / FPS).toFixed(1)} s)`);
if (errors.length) {
  console.log(`Erros de console: ${errors.length}`);
  for (const e of errors.slice(0, 5)) console.log("  -", e.slice(0, 200));
  process.exit(1);
}

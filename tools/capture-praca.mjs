/**
 * Vídeo curto (~11 s) do "hero corner" da praça da Apuração: Matias anda e corre entre a banca,
 * o posto de distribuição, os tambores e o portão da Central, com a câmera de gameplay girando.
 * Quadros determinísticos (dt fixo), como em capture-video.mjs.
 *
 * Uso: node tools/capture-praca.mjs [--out docs/videos/praca_hero.mp4] [--width 960] [--height 540] [--fps 24] [--quality media]
 * Requer: npm run build (dist/), Playwright + Chromium, ffmpeg.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadPlaywright, serveDist, CHROMIUM_ARGS, argValue } from "./lib/harness.mjs";

const { chromium } = loadPlaywright();
const OUT = resolve(argValue("--out", "docs/videos/praca_hero.mp4"));
const W = Number(argValue("--width", "960"));
const H = Number(argValue("--height", "540"));
const FPS = Number(argValue("--fps", "24"));
const QUALITY = argValue("--quality", "media");
const FRAMES_DIR = resolve(argValue("--frames", join(dirname(OUT), ".frames_praca")));
rmSync(FRAMES_DIR, { recursive: true, force: true });
mkdirSync(FRAMES_DIR, { recursive: true });
mkdirSync(dirname(OUT), { recursive: true });

const { base, close } = await serveDist();
const browser = await chromium.launch({ headless: true, args: CHROMIUM_ARGS });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
let frameIndex = 0;
const t0 = Date.now();

/** Avança `seconds` gravando quadros; `turn` = delta de mouse por quadro (px) para girar a câmera. */
async function record(seconds, label, turn = { dx: 0, dy: 0 }) {
  const n = Math.round(seconds * FPS);
  for (let i = 0; i < n; i++) {
    const dataUrl = await page.evaluate(
      ([t, q]) => {
        if (t.dx || t.dy) window.eva.input.injectMouseDelta(t.dx, t.dy);
        return window.eva.captureFrame(q);
      },
      [turn, 0.9],
    );
    writeFileSync(join(FRAMES_DIR, `f${String(frameIndex++).padStart(5, "0")}.jpg`), Buffer.from(dataUrl.split(",")[1], "base64"));
  }
  const s = await page.evaluate(() => window.eva.snapshot());
  console.log(`  ${label}: ${n} quadros · estado=${s.moveState} clipe=${s.clip} pés=(${s.feet.x.toFixed(1)}, ${s.feet.z.toFixed(1)}) · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  return s;
}
const press = (action, down) => page.evaluate(([a, d]) => window.eva.input.simulate(a, d), [action, down]);

try {
  await page.goto(`${base}?quality=${QUALITY}&pointerlock=0`, { waitUntil: "load" });
  await page.waitForFunction(() => document.getElementById("menu")?.classList.contains("visible"));
  await page.click("#btn-new");
  await page.waitForFunction(() => window.eva.state === "playing");
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    window.eva.teleportPlayer(21.5, 0.22, 5.5, Math.PI / 2);
    window.eva["hud"].setObjectiveVisible(false);
  });
  await page.waitForTimeout(1500);
  await page.evaluate((fps) => window.eva.captureStart(fps), FPS);
  console.log(`Gravando ${W}x${H} a ${FPS} fps (qualidade ${QUALITY})…`);
  await record(0.8, "parado diante da praça");
  await press("forward", true);
  await record(2.6, "andando pela banca");
  await press("run", true);
  await record(1.7, "correndo pela fila do posto (sobrados ao leste)", { dx: 3, dy: 0 });
  await press("run", false);
  await record(2.8, "andando e virando para o posto e a Central", { dx: -17, dy: -0.5 });
  await press("forward", false);
  await record(1.0, "freando");
  await record(1.6, "olhando a fachada da Central", { dx: 0, dy: -3 });
  await page.evaluate(() => window.eva.captureStop());
} finally {
  await browser.close();
  await close();
}
if (errors.length) {
  console.error("Erros de página:", errors);
  process.exit(1);
}
const vf = `fps=${FPS},scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p`;
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", join(FRAMES_DIR, "f%05d.jpg"), "-vf", vf, "-c:v", "libx264", "-crf", "20", "-preset", "medium", "-movflags", "+faststart", OUT], { stdio: "inherit" });
const bytes = readFileSync(OUT).length;
console.log(`✔ ${OUT} (${(bytes / 1024).toFixed(0)} KB, ${frameIndex} quadros, ${(frameIndex / FPS).toFixed(1)} s)`);
rmSync(FRAMES_DIR, { recursive: true, force: true });

/**
 * Vídeo curto (~9 s) do confronto da missão: Matias armado junto à van ao anoitecer, primeira leva de
 * desviadores chegando, mira e tiros. Quadros determinísticos (dt fixo), como em capture-praca.mjs.
 *
 * Uso: node tools/capture-combate.mjs [--out docs/videos/combate.mp4] [--width 960] [--height 540] [--fps 20]
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadPlaywright, serveDist, CHROMIUM_ARGS, argValue } from "./lib/harness.mjs";

const { chromium } = loadPlaywright();
const OUT = resolve(argValue("--out", "docs/videos/combate.mp4"));
const W = Number(argValue("--width", "960"));
const H = Number(argValue("--height", "540"));
const FPS = Number(argValue("--fps", "20"));
const FRAMES_DIR = resolve(argValue("--frames", join(dirname(OUT), ".frames_combate")));
rmSync(FRAMES_DIR, { recursive: true, force: true });
mkdirSync(FRAMES_DIR, { recursive: true });
mkdirSync(dirname(OUT), { recursive: true });

const { base, close } = await serveDist();
const browser = await chromium.launch({ headless: true, args: CHROMIUM_ARGS });
const page = await browser.newPage({ viewport: { width: W, height: H } });
let frameIndex = 0;
const t0 = Date.now();
const press = (action, down) => page.evaluate(([a, d]) => window.eva.input.simulate(a, d), [action, down]);

async function record(seconds, label, perFrame = null) {
  const n = Math.round(seconds * FPS);
  for (let i = 0; i < n; i++) {
    if (perFrame) await perFrame(i);
    const dataUrl = await page.evaluate(() => window.eva.captureFrame(0.9));
    writeFileSync(join(FRAMES_DIR, `f${String(frameIndex++).padStart(5, "0")}.jpg`), Buffer.from(dataUrl.split(",")[1], "base64"));
  }
  const s = await page.evaluate(() => window.eva.snapshot());
  console.log(`  ${label}: ${n} quadros · vida=${s.health} munição=${s.ammo?.mag} inimigos vivos=${s.enemies?.alive} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

try {
  await page.goto(`${base}?quality=media&pointerlock=0`, { waitUntil: "load" });
  await page.waitForFunction(() => document.getElementById("menu")?.classList.contains("visible"), null, { timeout: 120000 });
  await page.click("#btn-new");
  await page.waitForFunction(() => window.eva.state === "playing");
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    const g = window.eva;
    g.flags.set("cartao.pego", true);
    g.flags.set("apuracao.concluida", true);
    g.flags.set("custodio.avisouLote", true);
    g.quests.start("o_carregamento");
    g.teleportPlayer(29.5, 0.22, 11.5, Math.PI * 0.75);
    g["hud"].setObjectiveVisible(false);
  });
  await page.evaluate(() => window.eva.captureStart(30));
  // anoitecer rápido + arma + primeira onda
  for (let i = 0; i < 90; i++) await page.evaluate(() => window.eva.captureFrame(0.2));
  await page.evaluate(() => { window.eva.flags.set("carregamento.anoitecer", true); window.eva.flags.set("carregamento.armado", true); });
  for (let i = 0; i < 60; i++) {
    await page.evaluate(() => window.eva.captureFrame(0.2));
    const s = await page.evaluate(() => window.eva.snapshot());
    if (s.enemies && s.enemies.total >= 3 && s.ammo) break;
  }
  await page.evaluate(() => window.eva.captureStop());
  await page.evaluate((fps) => window.eva.captureStart(fps), FPS);
  console.log(`Gravando ${W}x${H} a ${FPS} fps…`);
  // olha para a rua (de onde vêm) e espera
  await page.evaluate(() => window.eva.aimAt(14, 1.4, 2));
  await record(2.0, "esperando os desviadores");
  await press("aim", true);
  await record(1.0, "mirando");
  // atira no inimigo mais próximo, 1 tiro a cada ~0,6 s, re-mirando
  let shots = 0;
  await record(5.0, "trocando tiros", async (i) => {
    if (i % 3 === 0) await page.evaluate(() => { const e = window.eva.enemies.enemies.find((x) => x.alive); if (e) { const c = e.chest; window.eva.aimAt(c.x, c.y + 0.1, c.z); } });
    if (i % 12 === 2) {
      await press("fire", true);
      shots++;
    }
    if (i % 12 === 4) await press("fire", false);
  });
  await press("aim", false);
  await record(1.0, "fim");
  console.log(`  tiros disparados no vídeo: ${shots}`);
  await page.evaluate(() => window.eva.captureStop());
} finally {
  await browser.close();
  await close();
}
const vf = `fps=${FPS},scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p`;
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", join(FRAMES_DIR, "f%05d.jpg"), "-vf", vf, "-c:v", "libx264", "-crf", "20", "-preset", "medium", "-movflags", "+faststart", OUT], { stdio: "inherit" });
console.log(`✔ ${OUT} (${(readFileSync(OUT).length / 1024).toFixed(0)} KB, ${frameIndex} quadros, ${(frameIndex / FPS).toFixed(1)} s)`);
rmSync(FRAMES_DIR, { recursive: true, force: true });

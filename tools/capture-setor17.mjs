/**
 * Capturas do Setor 17 em blockout (qualidade média): 4 ao nível da rua, 1 aérea a 150 m e 1 do depósito por
 * dentro, salvas em docs/screenshots/setor17/. A câmera é posicionada livremente (modo "dialogue" da
 * ThirdPersonCamera) e Matias é teleportado para dar escala.
 *
 * Uso: npm run build && node tools/capture-setor17.mjs [--out docs/screenshots/setor17] [--quality media] [--navmesh]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadPlaywright, serveDist, CHROMIUM_ARGS, argValue } from "./lib/harness.mjs";

const { chromium } = loadPlaywright();
const OUT = resolve(argValue("--out", "docs/screenshots/setor17"));
const QUALITY = argValue("--quality", "media");
const NAVMESH = process.argv.includes("--navmesh");
mkdirSync(OUT, { recursive: true });

/** [nome, olho, alvo, posição de Matias (ou null), yaw de Matias] */
const SHOTS = [
  ["01_rua_recicladores", [30, 1.9, 43.5], [-24, 9, 46], [24, 0.12, 44], -Math.PI / 2],
  ["02_av_maglev_feira", [63.5, 1.9, -34], [72.5, 7, -2], [68, 0.12, -27], 0],
  ["03_rua_escola_quadra", [0, 1.8, -41.5], [-22, 4.5, -24], [-8, 0.12, -39], Math.PI * 0.75],
  ["04_largo_mercado", [40, 1.9, -11], [60, 5, -8], [46, 0.12, -12], Math.PI / 2],
  ["05_aerea_150m", [13 + 95, 150, 3 - 150], [13, 0, 3], null, 0],
  ["06_deposito_interior", [33.5, 1.7, 59.2], [34.5, 2.2, 71], [31.5, 0.12, 63], 0],
];

const { base, close } = await serveDist();
const browser = await chromium.launch({ headless: true, args: CHROMIUM_ARGS });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !/favicon/.test(m.text())) errors.push(m.text()); });
const step = (n) => page.evaluate((k) => { for (let i = 0; i < k; i++) window.eva.captureFrame(0.3); }, n);
try {
  await page.goto(`${base}?quality=${QUALITY}&pointerlock=0${NAVMESH ? "&navmesh=1" : ""}`, { waitUntil: "load" });
  await page.waitForFunction(() => document.getElementById("menu")?.classList.contains("visible"), null, { timeout: 240000 });
  await page.click("#btn-new");
  await page.waitForFunction(() => window.eva.state === "playing");
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    window.eva.captureStart(30);
    window.eva["hud"].setObjectiveVisible(false);
  });
  for (const [name, eye, at, feet, yaw] of SHOTS) {
    await page.evaluate(([eye, at, feet, yaw]) => {
      const g = window.eva;
      if (feet) g.teleportPlayer(feet[0], feet[1], feet[2], yaw);
      const cam = g.camera;
      cam.mode = "dialogue";
      cam.dialogueFrom.set(eye[0], eye[1], eye[2]);
      cam.dialogueAt.set(at[0], at[1], at[2]);
      cam.initialized = false;
      cam.camera.fov = 0.95;
      cam.fovTarget = 0.95;
    }, [eye, at, feet, yaw]);
    await step(10); // luzes por distância, sombras e névoa assentam
    const info = await page.evaluate(() => {
      const g = window.eva;
      const e = g.scene.getEngine();
      const b = e._drawCalls.current;
      g.captureFrame(0.3);
      const draw = e._drawCalls.current - b;
      g.scene.shadowsEnabled = false;
      const b2 = e._drawCalls.current;
      g.captureFrame(0.3);
      const drawNoShadow = e._drawCalls.current - b2;
      g.scene.shadowsEnabled = true;
      g.captureFrame(0.3);
      return { draw, drawNoShadow, active: g.scene.getActiveMeshes().length, lights: g.snapshot().lightsActive, zone: g.snapshot().zone };
    });
    const dataUrl = await page.evaluate(() => window.eva.captureFrame(0.9));
    writeFileSync(resolve(OUT, `${name}.jpg`), Buffer.from(dataUrl.split(",")[1], "base64"));
    console.log(`  ${name}: draw calls ${info.draw} (sem sombras ${info.drawNoShadow}) · malhas ativas ${info.active} · luzes locais ${info.lights} · zona ${info.zone}`);
  }
  const nav = await page.evaluate(() => window.eva.snapshot().navmesh);
  console.log("  navmesh:", JSON.stringify(nav));
  if (errors.length) console.log("erros:", errors.slice(0, 6));
  console.log(`✔ capturas em ${OUT}`);
} finally {
  await browser.close();
  await close();
}
process.exit(errors.length ? 1 : 0);

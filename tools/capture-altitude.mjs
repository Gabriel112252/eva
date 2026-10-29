/**
 * Capturas da aeromoto em várias altitudes (céu sem teto): valida visualmente a camada distante
 * (Terra vista de cima, curvatura, bruma, céu escurecendo, estrelas).
 *
 * Uso: npm run build && node tools/capture-altitude.mjs [--out docs/screenshots/altitude] [--quality media]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadPlaywright, serveDist, CHROMIUM_ARGS, argValue } from "./lib/harness.mjs";

const { chromium } = loadPlaywright();
const OUT = resolve(argValue("--out", "docs/screenshots/altitude"));
const QUALITY = argValue("--quality", "media");
mkdirSync(OUT, { recursive: true });
const ALTITUDES = [300, 3000, 12000, 40000, 90000];
const { base, close } = await serveDist();
const browser = await chromium.launch({ headless: true, args: CHROMIUM_ARGS });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !/favicon/.test(m.text())) errors.push(m.text()); });
const step = (n) => page.evaluate((k) => { for (let i = 0; i < k; i++) window.eva.captureFrame(0.3); }, n);
const press = (a, d) => page.evaluate(([x, y]) => window.eva.input.simulate(x, y), [a, d]);
try {
  await page.goto(`${base}?quality=${QUALITY}&pointerlock=0`, { waitUntil: "load" });
  await page.waitForFunction(() => document.getElementById("menu")?.classList.contains("visible"), null, { timeout: 120000 });
  await page.click("#btn-new");
  await page.waitForFunction(() => window.eva.state === "playing");
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.eva.captureStart(30));
  const ras = await page.evaluate(() => { const v = window.eva.vehicles.find((x) => x.def.id === "rastro_av4"); const p = v.position; return [p.x, p.y, p.z]; });
  await page.evaluate(([x, z]) => window.eva.teleportPlayer(x + 2.2, 0.22, z, -Math.PI / 2), [ras[0], ras[2]]);
  await step(15);
  await press("interact", true);
  await press("interact", false);
  await step(10);
  await page.evaluate(() => window.eva["hud"].setObjectiveVisible(false));
  for (const h of ALTITUDES) {
    await page.evaluate(([x, y, z]) => {
      const v = window.eva.driving;
      v.teleport(v.position.constructor.FromArray([x, y, z]), Math.PI);
      v.hover.setPowered(true);
      // olha um pouco para baixo para enquadrar o horizonte e o chão
      window.eva.camera.pitch = y > 1000 ? 0.32 : 0.22;
    }, [ras[0], h, ras[2]]);
    await step(24);
    const s = await page.evaluate(() => window.eva.snapshot());
    const dataUrl = await page.evaluate(() => window.eva.captureFrame(0.88));
    const name = h >= 1000 ? `${Math.round(h / 1000)}km` : `${h}m`;
    writeFileSync(resolve(OUT, `rastro_${name}.jpg`), Buffer.from(dataUrl.split(",")[1], "base64"));
    console.log(`  ${name}: alt ${(s.altitude?.abs ?? 0).toFixed(0)} m · camada distante ${s.altitude?.farLayer} · espaço ${(s.altitude?.space ?? 0).toFixed(2)} · ar ${(s.altitude?.air ?? 0).toFixed(2)} · fps ${s.fps}`);
  }
  if (errors.length) console.log("erros:", errors.slice(0, 5));
  console.log(`✔ capturas em ${OUT}`);
} finally {
  await browser.close();
  await close();
}

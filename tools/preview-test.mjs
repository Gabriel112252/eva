/**
 * Testa o visualizador isolado de veículos (preview-veiculos.html) no build: abre cada modelo,
 * confere que carregou (status com peças/triângulos) e salva uma captura por modelo.
 *
 * Uso: npm run build && node tools/preview-test.mjs [--out docs/screenshots/veiculos/preview]
 */
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { loadPlaywright, serveDist, CHROMIUM_ARGS, argValue } from "./lib/harness.mjs";

const { chromium } = loadPlaywright();
const OUT = resolve(argValue("--out", "docs/screenshots/veiculos/preview"));
mkdirSync(OUT, { recursive: true });
const { base, close } = await serveDist();
const browser = await chromium.launch({ headless: true, args: CHROMIUM_ARGS });
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
let failed = 0;
try {
  await page.goto(`${base}preview-veiculos.html`, { waitUntil: "load" });
  const options = await page.$$eval("#model option", (os) => os.map((o) => o.value));
  for (const value of options) {
    await page.selectOption("#model", value);
    await page.waitForFunction(() => /triângulos/.test(document.getElementById("status")?.textContent ?? ""), null, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const status = await page.$eval("#status", (e) => e.textContent);
    const ok = /triângulos/.test(status ?? "");
    if (!ok) failed++;
    console.log(`  ${ok ? "✔" : "✘"} ${value}: ${status}`);
    await page.screenshot({ path: `${OUT}/${value.replace(/\.glb$/, "")}.jpg`, type: "jpeg", quality: 80 });
  }
} finally {
  await browser.close();
  await close();
}
if (errors.length) {
  console.error("Erros de página:", errors);
  failed++;
}
console.log(failed ? `✘ ${failed} modelo(s) falharam` : "✔ visualizador OK");
process.exit(failed ? 1 : 0);

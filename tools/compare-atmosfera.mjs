/**
 * Experimento visual A/B de atmosfera de São Paulo Velha.
 * npm run build && node tools/compare-atmosfera.mjs
 *
 * Requer Playwright/Chromium; usa dist/ estático, mesmo quadro e configuração.
 * Imagens, FPS e logs gerados em docs/screenshots/atmosfera/.
 */
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
function getPlaywright() {
  for (const id of ["playwright", "/opt/npm-tools/node_modules/playwright", process.env.HOME + "/.npm-global/lib/node_modules/playwright"]) {
    try { return require(id); } catch { /* next */ }
  }
  throw new Error("Playwright não instalado; use npm i -D playwright e npx playwright install chromium.");
}
const { chromium } = getPlaywright();
const DIST = resolve("dist");
const OUT = resolve("docs/screenshots/atmosfera");
if (!existsSync(DIST)) throw new Error("dist/ ausente: execute npm run build primeiro.");
await mkdir(OUT, { recursive: true });
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".glb": "model/gltf-binary", ".wasm": "application/wasm", ".png": "image/png", ".ogg": "audio/ogg", ".json": "application/json" };
const server = createServer(async (req,res) => {
  const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
  const path = resolve(DIST, "." + (url === "/" ? "/index.html" : url));
  if (!(path === DIST || path.startsWith(DIST + sep))) { res.writeHead(403); res.end(); return; }
  try { const data = await readFile(path); res.writeHead(200, { "Content-Type": mime[extname(path)] ?? "application/octet-stream" }); res.end(data); }
  catch { res.writeHead(404); res.end("not found"); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const url = "http://127.0.0.1:" + server.address().port + "/";
const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl", "--autoplay-policy=no-user-gesture-required"] });
const results = [];
try {
  for (const mode of ["off", "nublado", "chuva"]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(120_000);
    const errors = [];
    page.on("pageerror", err => errors.push(err.message));
    page.on("console", msg => { if (msg.type() === "error") errors.push(msg.text()); });
    await page.goto(url + "?quality=media&pointerlock=0" + (mode==="off" ? "" : "&atmosfera="+mode), { waitUntil:"load" });
    await page.waitForFunction(() => window.eva && window.eva.state === "menu", null, { timeout:120_000 });
    await page.locator("#btn-new").click();
    await page.waitForFunction(() => window.eva?.state === "playing");
    await page.evaluate(() => window.eva.teleportPlayer(30, 0.14, -5.0, 0));
    await page.waitForTimeout(1900);
    const status = await page.evaluate(() => {
      const g = window.eva;
      return { fps: Number(g.engine.getFps().toFixed(1)), state:g.state, fogDensity:g.scene.fogDensity,
        sunIntensity:g.scene.getLightByName("sol")?.intensity ?? 0,
        particles:g.scene.particleSystems.map(p=>({ name:p.name,emitRate:p.emitRate,capacity:p.getCapacity() })),
        snapshot:g.snapshot() };
    });
    await page.screenshot({ path: OUT + "/" + mode + ".jpg", type:"jpeg", quality:88 });
    results.push({mode,...status,errors});
    console.log(mode, JSON.stringify({ fps:status.fps, fog:status.fogDensity, errors:errors.length, particles:status.particles }));
    await page.close();
  }
  await writeFile(OUT + "/resultado.json", JSON.stringify({note:"FPS são de Chromium headless/SwiftShader; não equivalem a GPU real",results},null,2)+"\n");
  const anyErrors=results.some(x=>x.errors.length>0);
  if(anyErrors){console.error("Erros de console/página:",results.filter(x=>x.errors.length));process.exitCode=1;}
} finally {
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}

/**
 * Screenshots A/B reproduzíveis: câmera fixa (posição/alvo), Matias numa posição definida,
 * HUD oculto, quadros determinísticos. Mesmo comando antes e depois = comparação justa.
 *
 * Uso: node tools/shot.mjs --out docs/screenshots/m1/antes_hero.jpg --cam 24.5,2.4,3 --at 34,1.6,12.5 --player 29,0.22,7,0.9
 *      [--width 1280 --height 720] [--quality alta] [--follow]   (--follow usa a câmera de gameplay atrás de Matias)
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadPlaywright, serveDist, CHROMIUM_ARGS, argValue } from "./lib/harness.mjs";

const { chromium } = loadPlaywright();
const OUT = resolve(argValue("--out", "docs/screenshots/m1/shot.jpg"));
const W = Number(argValue("--width", "1280"));
const H = Number(argValue("--height", "720"));
const quality = argValue("--quality", "alta");
const cam = argValue("--cam", "24.5,2.4,3").split(",").map(Number);
const at = argValue("--at", "34,1.6,12.5").split(",").map(Number);
const player = argValue("--player", "29,0.22,7,0.9").split(",").map(Number);
const follow = process.argv.includes("--follow");
await mkdir(dirname(OUT), { recursive: true });

const { base, close } = await serveDist();
const browser = await chromium.launch({ headless: true, args: CHROMIUM_ARGS });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.setDefaultTimeout(240_000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
try {
  await page.goto(`${base}?quality=${quality}&pointerlock=0`, { waitUntil: "load" });
  await page.waitForFunction(() => document.getElementById("menu")?.classList.contains("visible"));
  await page.click("#btn-new");
  await page.waitForFunction(() => window.eva.state === "playing");
  await page.waitForTimeout(800);
  const info = await page.evaluate(
    ([cam, at, player, follow]) => {
      const g = window.eva;
      g.teleportPlayer(player[0], player[1], player[2], player[3]);
      g["hud"].hide();
      g.captureStart(30);
      if (!follow) {
        const C = g["camera"];
        const V = g.scene.activeCamera.position.constructor;
        C.setDialogueShot(new V(cam[0], cam[1], cam[2]), new V(at[0], at[1], at[2]));
        C["initialized"] = false; // corta direto para o enquadramento
      }
      for (let i = 0; i < 6; i++) g.captureFrame(0.5);
      const dataUrl = g.captureFrame(0.92);
      const scene = g.scene;
      const bytes = performance.getEntriesByType("resource").filter((r) => /assets\//.test(r.name)).reduce((a, r) => a + (r.transferSize || r.encodedBodySize || 0), 0);
      g.captureStop();
      return { dataUrl, activeMeshes: scene.getActiveMeshes().length, totalMeshes: scene.meshes.length, vertices: scene.getTotalVertices(), activeIndices: scene.getActiveIndices(), materials: scene.materials.length, textures: scene.textures.length, assetBytes: bytes };
    },
    [cam, at, player, follow],
  );
  await writeFile(OUT, Buffer.from(info.dataUrl.split(",")[1], "base64"));
  console.log(`${OUT}: meshes ativos ${info.activeMeshes}/${info.totalMeshes} · vértices ${info.vertices} · índices ativos ${info.activeIndices} · materiais ${info.materials} · texturas ${info.textures} · assets baixados ${(info.assetBytes / 1048576).toFixed(1)} MB`);
} finally {
  await browser.close();
  close();
}
if (errors.length) {
  console.log("Erros:", errors.slice(0, 5));
  process.exit(1);
}

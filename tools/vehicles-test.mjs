/**
 * Teste dos veículos estáticos (PR #1) no jogo construído: carregamento, escala, colisão (Matias anda
 * contra cada veículo e é bloqueado), sombras ativas e custo de cena (malhas/vértices/draw calls).
 *
 * Uso: npm run build && node tools/vehicles-test.mjs
 */
import { loadPlaywright, serveDist, CHROMIUM_ARGS } from "./lib/harness.mjs";

const { chromium } = loadPlaywright();
const { base, close } = await serveDist();
const browser = await chromium.launch({ headless: true, args: CHROMIUM_ARGS });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error" && !/favicon/.test(m.text())) errors.push(m.text());
});
let failed = 0;
const check = (ok, label) => {
  console.log(`  ${ok ? "✔" : "✘"} ${label}`);
  if (!ok) failed++;
};

try {
  await page.goto(`${base}?quality=baixa&pointerlock=0`, { waitUntil: "load" });
  await page.waitForFunction(() => document.getElementById("menu")?.classList.contains("visible"));
  await page.click("#btn-new");
  await page.waitForFunction(() => window.eva.state === "playing");
  await page.waitForTimeout(2000);

  const info = await page.evaluate(() => {
    const scene = window.eva.scene;
    const out = {};
    for (const id of ["javali_vb4", "modulo_v7", "atlas_t3"]) {
      const anchor = scene.getTransformNodeByName(`veiculo_${id}`);
      if (!anchor) {
        out[id] = null;
        continue;
      }
      const meshes = anchor.getChildMeshes(false).filter((m) => m.getTotalVertices() > 0);
      let min = [Infinity, Infinity, Infinity];
      let max = [-Infinity, -Infinity, -Infinity];
      for (const m of meshes) {
        m.computeWorldMatrix(true);
        const b = m.getBoundingInfo().boundingBox;
        min = [Math.min(min[0], b.minimumWorld.x), Math.min(min[1], b.minimumWorld.y), Math.min(min[2], b.minimumWorld.z)];
        max = [Math.max(max[0], b.maximumWorld.x), Math.max(max[1], b.maximumWorld.y), Math.max(max[2], b.maximumWorld.z)];
      }
      const collider = scene.getTransformNodeByName(`col_veiculo_${id}`);
      const renderList = window.eva["env"]?.["shadows"]?.getShadowMap()?.renderList ?? [];
      out[id] = { meshes: meshes.length, tris: meshes.reduce((a, m) => a + m.getTotalIndices() / 3, 0), min, max, size: max.map((v, i) => +(v - min[i]).toFixed(2)), collider: !!collider, shadow: meshes.filter((m) => renderList.includes(m)).length };
    }
    const engine = scene.getEngine();
    engine._drawCalls?.fetchNewFrame();
    scene.render();
    out.scene = { activeMeshes: scene.getActiveMeshes().length, totalMeshes: scene.meshes.length, drawCalls: engine._drawCalls?.current ?? null, vertices: scene.getTotalVertices() };
    return out;
  });
  for (const id of ["javali_vb4", "modulo_v7", "atlas_t3"]) {
    const v = info[id];
    check(v && v.meshes > 0, `${id}: carregado (${v?.meshes ?? 0} malhas, ${Math.round(v?.tris ?? 0)} tri, ${v?.size?.join(" × ")} m, ${v?.shadow ?? 0} malhas com sombra)`);
    if (!v) continue;
    check(v.collider, `${id}: colisor estático registrado`);
    check(v.min[1] > -0.05 && v.min[1] < 0.35, `${id}: apoiado no chão (y mínimo ${v.min[1].toFixed(2)} m)`);
    check(v.size[1] > 1.4 && v.size[1] < 3.0 && v.size[0] < 6 && v.size[2] < 6, `${id}: escala plausível (altura ${v.size[1]} m)`);
  }
  console.log(`  cena: ${info.scene.activeMeshes}/${info.scene.totalMeshes} malhas ativas · ${info.scene.vertices} vértices${info.scene.drawCalls != null ? ` · ${info.scene.drawCalls} draw calls` : ""}`);

  // Colisão: anda 3 s de jogo (dt fixo, 30 quadros/s) contra cada veículo; deve avançar e parar antes de atravessar
  await page.evaluate(() => window.eva.captureStart(30));
  const step = (n) => page.evaluate((k) => { for (let i = 0; i < k; i++) window.eva.captureFrame(0.3); }, n);
  const walkInto = async (label, from, yaw, axis, limit, sign) => {
    await page.evaluate(([x, y, z, w]) => window.eva.teleportPlayer(x, y, z, w), [...from, yaw]);
    await step(10);
    const start = await page.evaluate(() => window.eva.snapshot().feet);
    await page.evaluate(() => window.eva.input.simulate("forward", true));
    await step(90);
    await page.evaluate(() => window.eva.input.simulate("forward", false));
    const end = await page.evaluate(() => window.eva.snapshot().feet);
    const moved = Math.abs(end[axis] - start[axis]);
    const crossed = sign > 0 ? end[axis] > limit : end[axis] < limit;
    check(moved > 0.5 && !crossed, `${label}: andou ${moved.toFixed(2)} m e parou em ${axis}=${end[axis].toFixed(2)} (limite ${limit})`);
  };
  await walkInto("Javali", [42.5, 0.22, 12.0], 0, "z", 15.3, 1);
  await walkInto("Módulo V-7", [27.5, 0.22, -10.5], Math.PI, "z", -13.3, -1);
  await walkInto("Atlas T-3", [-5.5, 0.12, -0.5], 0, "z", 2.1, 1);
  await page.evaluate(() => window.eva.captureStop());

  // FPS (renderização por software: só referência relativa)
  const fps = await page.evaluate(async () => {
    const e = window.eva.scene.getEngine();
    await new Promise((r) => setTimeout(r, 1500));
    return e.getFps();
  });
  console.log(`  fps (SwiftShader, referência): ${fps.toFixed(1)}`);
} finally {
  await browser.close();
  await close();
}
if (errors.length) {
  console.error("Erros:", errors);
  failed++;
}
console.log(failed ? `✘ ${failed} verificação(ões) falharam` : "✔ veículos OK");
process.exit(failed ? 1 : 0);

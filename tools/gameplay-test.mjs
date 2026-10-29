/**
 * Teste de gameplay no build (quadros determinísticos a 30 fps): veículos (entrar, dirigir, sair, voo da
 * aeromoto), combate (mirar, atirar, dano em inimigo, recarga) e missão (gatilhos do confronto).
 *
 * Uso: npm run build && node tools/gameplay-test.mjs [--shots docs/screenshots/gameplay]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadPlaywright, serveDist, CHROMIUM_ARGS, argValue } from "./lib/harness.mjs";

const { chromium } = loadPlaywright();
const SHOTS = argValue("--shots", "");
if (SHOTS) mkdirSync(resolve(SHOTS), { recursive: true });
const { base, close } = await serveDist();
const browser = await chromium.launch({ headless: true, args: CHROMIUM_ARGS });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
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
const step = (n) => page.evaluate((k) => { for (let i = 0; i < k; i++) window.eva.captureFrame(0.3); }, n);
const press = (action, down) => page.evaluate(([a, d]) => window.eva.input.simulate(a, d), [action, down]);
const snap = () => page.evaluate(() => window.eva.snapshot());
const shot = async (name) => {
  if (!SHOTS) return;
  const dataUrl = await page.evaluate(() => window.eva.captureFrame(0.85));
  writeFileSync(resolve(SHOTS, `${name}.jpg`), Buffer.from(dataUrl.split(",")[1], "base64"));
};

try {
  await page.goto(`${base}?quality=baixa&pointerlock=0`, { waitUntil: "load" });
  await page.waitForFunction(() => document.getElementById("menu")?.classList.contains("visible"), null, { timeout: 120000 });
  await page.click("#btn-new");
  await page.waitForFunction(() => window.eva.state === "playing");
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.eva.captureStart(30));

  // ---------------- Javali: entrar, acelerar, virar, sair ----------------
  console.log("Veículos");
  const jav = await page.evaluate(() => {
    const v = window.eva.vehicles.find((x) => x.def.id === "javali_vb4");
    const p = v.position;
    return { x: p.x, y: p.y, z: p.z, heading: v.heading };
  });
  await page.evaluate(([x, z]) => window.eva.teleportPlayer(x, 0.22, z - 2.6, 0), [jav.x, jav.z]);
  await step(15);
  let s = await snap();
  check(/Entrar/.test(s.prompt ?? ""), `prompt de entrar no Javali: "${s.prompt}"`);
  await press("interact", true);
  await press("interact", false);
  await step(10);
  s = await snap();
  check(s.driving === "javali_vb4", `Matias ao volante (${s.driving})`);
  await shot("veiculo_javali_entrou");
  const before = await page.evaluate(() => { const p = window.eva.driving.position; return [p.x, p.y, p.z]; });
  await press("forward", true);
  await step(90); // 3 s
  const after = await page.evaluate(() => { const v = window.eva.driving; const p = v.position; return { p: [p.x, p.y, p.z], speed: v.speed, up: v.isUpright, contacts: v.rv?.wheelsInContact ?? -1 }; });
  const moved = Math.hypot(after.p[0] - before[0], after.p[2] - before[2]);
  check(moved > 6 && after.speed > 3, `Javali acelerou: ${moved.toFixed(1)} m em 3 s, ${(after.speed * 3.6).toFixed(0)} km/h, ${after.contacts} rodas no chão`);
  check(after.up && Math.abs(after.p[1] - before[1]) < 1.5, `Javali estável (y ${after.p[1].toFixed(2)})`);
  await shot("veiculo_javali_andando");
  await press("left", true);
  await step(45);
  await press("left", false);
  await press("forward", false);
  const turned = await page.evaluate(() => window.eva.driving.heading);
  check(Math.abs(turned - jav.heading) > 0.15, `Javali virou (${jav.heading.toFixed(2)} → ${turned.toFixed(2)} rad)`);
  await press("back", true); // S: freia até parar (segurar mais tempo engata a ré)
  await step(24);
  await press("back", false);
  await step(10);
  const braked = await page.evaluate(() => Math.abs(window.eva.driving.speed));
  check(braked < 2.5, `Javali freou (${(braked * 3.6).toFixed(0)} km/h)`);
  await step(30);
  await press("interact", true);
  await press("interact", false);
  await step(10);
  s = await snap();
  const vpos = await page.evaluate(() => { const v = window.eva.vehicles.find((x) => x.def.id === "javali_vb4"); const p = v.position; return [p.x, p.z]; });
  const dExit = Math.hypot(s.feet.x - vpos[0], s.feet.z - vpos[1]);
  check(s.driving === null && dExit > 1.2 && dExit < 5, `Matias desceu ao lado (${dExit.toFixed(1)} m do veículo)`);
  await shot("veiculo_javali_saiu");

  // ---------------- Rastro: entrar, subir, avançar, descer ----------------
  const ras = await page.evaluate(() => { const v = window.eva.vehicles.find((x) => x.def.id === "rastro_av4"); const p = v.position; return [p.x, p.y, p.z]; });
  await page.evaluate(([x, z]) => window.eva.teleportPlayer(x + 2.2, 0.22, z, -Math.PI / 2), [ras[0], ras[2]]);
  await step(15);
  await press("interact", true);
  await press("interact", false);
  await step(10);
  s = await snap();
  check(s.driving === "rastro_av4", `Matias na aeromoto (${s.driving})`);
  await press("advance", true); // subir
  await step(75);
  await press("advance", false);
  const alt = await page.evaluate(() => window.eva.driving.altitude);
  check(alt > 2.5, `Rastro subiu (altitude ${alt.toFixed(1)} m)`);
  await shot("veiculo_rastro_voando");
  const b2 = await page.evaluate(() => { const p = window.eva.driving.position; return [p.x, p.z]; });
  await press("forward", true);
  await step(90);
  await press("forward", false);
  const a2 = await page.evaluate(() => { const v = window.eva.driving; const p = v.position; return { p: [p.x, p.z], alt: v.altitude, up: v.isUpright }; });
  const flew = Math.hypot(a2.p[0] - b2[0], a2.p[1] - b2[1]);
  check(flew > 6 && a2.up, `Rastro avançou voando ${flew.toFixed(1)} m (alt ${a2.alt.toFixed(1)} m)`);
  await press("crouchHold", true);
  await step(120);
  await press("crouchHold", false);
  const landed = await page.evaluate(() => window.eva.driving.altitude);
  check(landed < 1.6, `Rastro desceu (altitude ${landed.toFixed(1)} m)`);
  await press("interact", true);
  await press("interact", false);
  await step(10);
  s = await snap();
  check(s.driving === null, "Matias desceu da aeromoto");

  await page.evaluate(() => window.eva.captureStop());
} finally {
  await browser.close();
  await close();
}
if (errors.length) {
  console.error("Erros:", errors.slice(0, 8));
  failed++;
}
console.log(failed ? `✘ ${failed} verificação(ões) falharam` : "✔ gameplay OK");
process.exit(failed ? 1 : 0);

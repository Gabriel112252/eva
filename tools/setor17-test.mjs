/**
 * Teste do Setor 17 no build (Chromium/SwiftShader, quadros determinísticos):
 *  - navmesh gerado (Recast ou grade) e caminhos oficina → depósito, oficina → escola, pátio → telhado da escola;
 *  - Matias percorre os caminhos (teleporte por ponto + física) sem atravessar paredes e entra no depósito andando;
 *  - a van Módulo V-7 cabe na rota portão → oficina → depósito (teleporte por ponto + entrada física pela porta);
 *  - a Rastro pousa no telhado da escola (teleporte a 30 m, rotores ligados, Ctrl até assentar);
 *  - draw calls por quadro na rota principal (limite 450 sem as passagens de sombra; o total é reportado);
 *  - luzes locais acesas ≤ 6 em todos os pontos.
 *
 * Uso: npm run build && node tools/setor17-test.mjs [--quality media|baixa] [--shots docs/screenshots/setor17/teste]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadPlaywright, serveDist, CHROMIUM_ARGS, argValue } from "./lib/harness.mjs";

const { chromium } = loadPlaywright();
const QUALITY = argValue("--quality", "media");
const SHOTS = argValue("--shots", "");
const DRAW_LIMIT = 450;
if (SHOTS) mkdirSync(resolve(SHOTS), { recursive: true });
const { base, close } = await serveDist();
const browser = await chromium.launch({ headless: true, args: CHROMIUM_ARGS });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !/favicon/.test(m.text())) errors.push(m.text()); });
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
/** Caminho pelo navmesh entre dois pontos (arrays [x,y,z]). */
const findPath = (a, b) => page.evaluate(([a, b]) => {
  const g = window.eva;
  const V = g.player.feet.constructor;
  const path = g.world.navmesh.findPath(V.FromArray(a), V.FromArray(b));
  return path.map((p) => [p.x, p.y, p.z]);
}, [a, b]);
/** Teleporta Matias por cada ponto do caminho e confere que a física o mantém ali (sem atravessar nada). */
async function followPath(path, label) {
  let worst = 0;
  let fell = false;
  for (let i = 0; i < path.length; i++) {
    const [x, y, z] = path[i];
    const next = path[Math.min(i + 1, path.length - 1)];
    const yaw = Math.atan2(next[0] - x, next[2] - z);
    await page.evaluate(([x, y, z, yaw]) => window.eva.teleportPlayer(x, y + 0.08, z, yaw), [x, y, z, yaw]);
    await step(3);
    const s = await snap();
    const d = Math.hypot(s.feet.x - x, s.feet.z - z);
    worst = Math.max(worst, d);
    if (Math.abs(s.feet.y - y) > 0.6) fell = true;
  }
  check(worst < 0.7 && !fell, `${label}: ${path.length} pontos percorridos (desvio máx. ${worst.toFixed(2)} m, queda ${fell})`);
}
const measureDraw = () => page.evaluate(() => {
  const g = window.eva;
  const e = g.scene.getEngine();
  const run = (n) => { const b = e._drawCalls.current; for (let i = 0; i < n; i++) g.captureFrame(0.3); return Math.round((e._drawCalls.current - b) / n); };
  const total = run(2);
  g.scene.shadowsEnabled = false;
  const semSombras = run(2);
  g.scene.shadowsEnabled = true;
  return { total, semSombras, active: g.scene.getActiveMeshes().length, lights: g.snapshot().lightsActive, zone: g.snapshot().zone };
});

try {
  await page.goto(`${base}?quality=${QUALITY}&pointerlock=0`, { waitUntil: "load" });
  await page.waitForFunction(() => document.getElementById("menu")?.classList.contains("visible"), null, { timeout: 240000 });
  await page.click("#btn-new");
  await page.waitForFunction(() => window.eva.state === "playing");
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.eva.captureStart(30));
  let s = await snap();

  // ---------------- navmesh ----------------
  console.log("Navmesh");
  const nav = s.navmesh;
  check(nav && nav.triangles > 100, `malha de navegação (${nav?.kind}): ${nav?.triangles} ${nav?.kind === "recast" ? "triângulos" : "células"}, ${nav?.sources} colisores, ${nav?.buildMs} ms`);
  const OFICINA = [-30, 0.12, -10.5];
  const DEPOSITO = [34.5, 0.12, 65.5];
  const ESCOLA = [-10, 0.12, -30];
  const QUADRA = [-28, 0.12, -26];
  const pathDep = await findPath(OFICINA, DEPOSITO);
  check(pathDep.length >= 2 && Math.hypot(pathDep.at(-1)[0] - DEPOSITO[0], pathDep.at(-1)[2] - DEPOSITO[2]) < 2.5, `caminho oficina → depósito: ${pathDep.length} pontos, ${pathDep.length ? pathDep.reduce((acc, p, i) => (i ? acc + Math.hypot(p[0] - pathDep[i - 1][0], p[2] - pathDep[i - 1][2]) : 0), 0).toFixed(0) : "?"} m`);
  const pathEsc = await findPath(OFICINA, ESCOLA);
  check(pathEsc.length >= 2 && Math.hypot(pathEsc.at(-1)[0] - ESCOLA[0], pathEsc.at(-1)[2] - ESCOLA[2]) < 2.5, `caminho oficina → sala da escola: ${pathEsc.length} pontos`);
  const pathQuadra = await findPath(ESCOLA, QUADRA);
  check(pathQuadra.length >= 2, `caminho sala → quadra (portão do pátio): ${pathQuadra.length} pontos`);
  if (nav?.kind === "recast") {
    const pathRoof = await findPath([6, 0.12, -28], [-6, 7.0, -29]);
    check(pathRoof.length >= 2 && pathRoof.at(-1)[1] > 6.4, `caminho pátio → telhado da escola pela escada: ${pathRoof.length} pontos, chega a y=${pathRoof.length ? pathRoof.at(-1)[1].toFixed(1) : "?"}`);
    const pathDepRoof = await findPath([20, 0.12, 60], [34.5, 6.8, 65.5]);
    check(pathDepRoof.length >= 2 && pathDepRoof.at(-1)[1] > 6.2, `caminho pátio → telhado do depósito pela escada: ${pathDepRoof.length} pontos`);
    const rnd = await page.evaluate(() => { const V = window.eva.player.feet.constructor; const p = window.eva.world.navmesh.getRandomPointAround(V.FromArray([30, 0.12, 0]), 6); return [p.x, p.y, p.z]; });
    check(Math.hypot(rnd[0] - 30, rnd[2]) < 7, `getRandomPointAround na praça → (${rnd.map((n) => n.toFixed(1)).join(", ")})`);
  }

  // ---------------- Matias percorre os caminhos ----------------
  console.log("Matias");
  if (pathDep.length) await followPath(pathDep, "oficina → depósito");
  s = await snap();
  check(s.zone === "zona.deposito", `Matias dentro do depósito (zona ${s.zone})`);
  await shot("matias_deposito");
  // entra andando pela porta (física real): da frente da porta até o corredor central
  await page.evaluate(() => window.eva.teleportPlayer(33.5, 0.2, 54.5, 0));
  await step(3);
  await press("forward", true);
  await press("run", true);
  await step(55);
  await press("run", false);
  await press("forward", false);
  s = await snap();
  check(s.feet.z > 59.5 && s.zone === "zona.deposito", `entrou no depósito pela porta correndo (z=${s.feet.z.toFixed(1)}, zona ${s.zone})`);
  if (pathEsc.length) await followPath(pathEsc, "oficina → escola");
  s = await snap();
  check(s.zone === "zona.escola_salas", `Matias na sala de aula (zona ${s.zone})`);
  // sobe a escada externa da escola andando
  // pé da escada no pátio (norte do bloco, x≈2,85), sobe para o sul até o patamar do canto sudeste; lá vira a
  // oeste e entra no telhado pela abertura do guarda-corpo
  await page.evaluate(() => window.eva.teleportPlayer(2.85, 0.2, -23.4, Math.PI));
  await step(3);
  await press("forward", true);
  await press("run", true);
  await step(150);
  await page.evaluate(() => { window.eva.camera.yaw = -Math.PI / 2; });
  await step(45);
  await press("run", false);
  await press("forward", false);
  s = await snap();
  check(s.feet.y > 6.5 && s.zone === "zona.telhado_escola", `subiu a escada até o telhado da escola correndo (y=${s.feet.y.toFixed(2)}, zona ${s.zone})`);
  await shot("matias_telhado_escola");

  // ---------------- van na rota ----------------
  console.log("Van");
  const VAN_ROUTE = [[34, 13], [30, -4], [12, 0], [-30, -2.5], [24, -8], [52.5, -9], [65, 20], [65, 43], [48, 43], [40, 50], [36, 54.5], [33.5, 58], [33.5, 64]];
  let vanWorst = 0;
  let vanUp = true;
  for (let i = 0; i < VAN_ROUTE.length; i++) {
    const [x, z] = VAN_ROUTE[i];
    const next = VAN_ROUTE[Math.min(i + 1, VAN_ROUTE.length - 1)];
    const yaw = Math.atan2(next[0] - x, next[1] - z);
    await page.evaluate(([x, z, yaw]) => { const v = window.eva.vehicles.find((v) => v.def.id === "modulo_v7"); v.teleport(v.position.constructor.FromArray([x, 0.4, z]), yaw); }, [x, z, yaw]);
    await step(6);
    const r = await page.evaluate(() => { const v = window.eva.vehicles.find((v) => v.def.id === "modulo_v7"); const p = v.position; return { x: p.x, y: p.y, z: p.z, up: v.isUpright }; });
    vanWorst = Math.max(vanWorst, Math.hypot(r.x - x, r.z - z));
    if (!r.up || r.y > 2.5 || r.y < -0.5) vanUp = false;
  }
  check(vanWorst < 1.2 && vanUp, `van assentada em ${VAN_ROUTE.length} pontos da rota portão → oficina → depósito (desvio máx. ${vanWorst.toFixed(2)} m, em pé ${vanUp})`);
  // dirige de verdade do pátio para dentro do depósito pela porta de 5 m
  await page.evaluate(() => { const v = window.eva.vehicles.find((v) => v.def.id === "modulo_v7"); v.teleport(v.position.constructor.FromArray([33.5, 0.4, 52]), 0); });
  await step(10);
  await page.evaluate(() => window.eva.teleportPlayer(35.8, 0.2, 52, -Math.PI / 2));
  await step(8);
  s = await snap();
  if (!/Entrar/.test(s.prompt ?? "")) {
    await page.evaluate(() => window.eva.teleportPlayer(31.2, 0.2, 52, Math.PI / 2));
    await step(8);
    s = await snap();
  }
  check(/Entrar/.test(s.prompt ?? ""), `prompt da van no pátio: "${s.prompt}"`);
  await press("interact", true);
  await press("interact", false);
  await step(12);
  s = await snap();
  check(s.driving === "modulo_v7", `Matias ao volante da van (${s.driving})`);
  await press("forward", true);
  await step(60);
  await press("forward", false);
  const van = await page.evaluate(() => { const v = window.eva.driving ?? window.eva.vehicles.find((v) => v.def.id === "modulo_v7"); const p = v.position; return { x: p.x, y: p.y, z: p.z, up: v.isUpright, speed: v.speed }; });
  check(van.z > 60 && van.up && Math.abs(van.x - 33.5) < 2.5, `van entrou no depósito pela porta (x=${van.x.toFixed(1)}, z=${van.z.toFixed(1)}, em pé ${van.up})`);
  await shot("van_deposito");
  await press("back", true);
  await step(20);
  await press("back", false);
  await step(10);
  await press("interact", true);
  await press("interact", false);
  await step(8);
  s = await snap();
  check(s.driving === null, "Matias desceu da van");

  // ---------------- Rastro pousa no telhado da escola ----------------
  console.log("Rastro");
  const ras = await page.evaluate(() => { const v = window.eva.vehicles.find((x) => x.def.id === "rastro_av4"); const p = v.position; return [p.x, p.y, p.z]; });
  await page.evaluate(([x, z]) => window.eva.teleportPlayer(x + 2.2, 0.22, z, -Math.PI / 2), [ras[0], ras[2]]);
  await step(10);
  await press("interact", true);
  await press("interact", false);
  await step(10);
  s = await snap();
  check(s.driving === "rastro_av4", `Matias na aeromoto (${s.driving})`);
  const ROOF = { x: -6, y: 7.0, z: -29 };
  await page.evaluate(([x, y, z]) => { const v = window.eva.driving; v.teleport(v.position.constructor.FromArray([x, y + 30, z]), Math.PI); v.hover.setPowered(true); }, [ROOF.x, ROOF.y, ROOF.z]);
  await step(15);
  await press("crouchHold", true);
  let landed = null;
  for (let i = 0; i < 16; i++) {
    await step(12);
    landed = await page.evaluate(() => { const v = window.eva.driving; const p = v.position; return { alt: v.altitude, x: p.x, y: p.y, z: p.z, up: v.isUpright, vy: Math.abs(v.body.getLinearVelocity().y) }; });
    if (landed.alt < 1.6 && landed.vy < 0.3) break;
  }
  await press("crouchHold", false);
  await step(10);
  landed = await page.evaluate(() => { const v = window.eva.driving; const p = v.position; return { alt: v.altitude, x: p.x, y: p.y, z: p.z, up: v.isUpright }; });
  const onRoof = Math.hypot(landed.x - ROOF.x, landed.z - ROOF.z) < 8 && landed.y > ROOF.y - 0.3 && landed.y < ROOF.y + 2.5;
  check(landed.alt < 1.6 && landed.up && onRoof, `Rastro pousou no telhado da escola: altura sobre a laje ${landed.alt.toFixed(2)} m, y=${landed.y.toFixed(2)} (laje ${ROOF.y}), em pé ${landed.up}`);
  await shot("rastro_telhado_escola");
  await press("interact", true);
  await press("interact", false);
  await step(8);
  s = await snap();
  check(s.driving === null && s.zone === "zona.telhado_escola", `Matias desceu no telhado (zona ${s.zone})`);

  // ---------------- draw calls e luzes na rota principal ----------------
  console.log(`Desempenho (qualidade ${QUALITY}, ${DRAW_LIMIT} draw calls sem sombras)`);
  const POINTS = [["oficina", -30, -10.5, 0], ["rua da Apuração", -20, 0, Math.PI / 2], ["praça", 24, 0, Math.PI / 2], ["Largo do Mercado", 50, -14, Math.PI / 2], ["feira do viaduto", 66, -25, 0.3], ["rua dos Recicladores", 50, 43, -Math.PI / 2], ["depósito (interior)", 33.5, 62, 0], ["pátio da escola", 8, -28, -Math.PI / 2], ["rua da Escola", -30, -41, Math.PI / 2], ["torre", -26, 50, Math.PI]];
  let worstNoShadow = 0;
  let worstTotal = 0;
  let worstLights = 0;
  for (const [name, x, z, yaw] of POINTS) {
    await page.evaluate(([x, z, yaw]) => window.eva.teleportPlayer(x, 0.2, z, yaw), [x, z, yaw]);
    await step(6);
    const m = await measureDraw();
    worstNoShadow = Math.max(worstNoShadow, m.semSombras);
    worstTotal = Math.max(worstTotal, m.total);
    worstLights = Math.max(worstLights, m.lights);
    console.log(`    ${name.padEnd(22)} draw ${String(m.semSombras).padStart(4)} sem sombras · ${String(m.total).padStart(4)} com sombras (CSM) · malhas ativas ${m.active} · luzes locais ${m.lights} · zona ${m.zone}`);
  }
  check(worstNoShadow <= DRAW_LIMIT, `draw calls sem sombras ≤ ${DRAW_LIMIT} em toda a rota (máx. ${worstNoShadow}; com as 3 cascatas de sombra o máximo é ${worstTotal})`);
  check(worstLights <= 6, `luzes locais acesas ≤ 6 (máx. ${worstLights})`);
  await page.evaluate(() => window.eva.captureStop());
} finally {
  await browser.close();
  await close();
}
if (errors.length) {
  console.error("Erros:", errors.slice(0, 8));
  failed++;
}
console.log(failed ? `✘ ${failed} verificação(ões) falharam` : "✔ Setor 17 OK");
process.exit(failed ? 1 : 0);

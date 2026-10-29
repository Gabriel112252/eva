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
const ONLY = argValue("--only", ""); // "veiculos" | "missao" | "" (tudo)
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
  let s;

  // ---------------- Javali: entrar, acelerar, virar, sair ----------------
  if (ONLY !== "missao") {
  console.log("Veículos");
  const jav = await page.evaluate(() => {
    const v = window.eva.vehicles.find((x) => x.def.id === "javali_vb4");
    const p = v.position;
    return { x: p.x, y: p.y, z: p.z, heading: v.heading };
  });
  await page.evaluate(([x, z]) => window.eva.teleportPlayer(x, 0.22, z - 2.6, 0), [jav.x, jav.z]);
  await step(15);
  s = await snap();
  check(/Entrar/.test(s.prompt ?? ""), `prompt de entrar no Javali: "${s.prompt}"`);
  await press("interact", true);
  await press("interact", false);
  await step(10);
  s = await snap();
  check(s.driving === "javali_vb4", `Matias ao volante (${s.driving})`);
  await shot("veiculo_javali_entrou");
  const before = await page.evaluate(() => { const p = window.eva.driving.position; return [p.x, p.y, p.z]; });
  await press("forward", true);
  await step(45); // 1,5 s (a praça é curta para mais que isso a 50 km/h)
  const after = await page.evaluate(() => { const v = window.eva.driving; const p = v.position; return { p: [p.x, p.y, p.z], speed: v.speed, up: v.isUpright, contacts: v.rv?.wheelsInContact ?? -1 }; });
  const moved = Math.hypot(after.p[0] - before[0], after.p[2] - before[2]);
  check(moved > 4 && after.speed > 3, `Javali acelerou: ${moved.toFixed(1)} m em 1,5 s, ${(after.speed * 3.6).toFixed(0)} km/h, ${after.contacts} rodas no chão`);
  check(after.up && Math.abs(after.p[1] - before[1]) < 1.5, `Javali estável (y ${after.p[1].toFixed(2)})`);
  await shot("veiculo_javali_andando");
  await press("left", true);
  await step(30);
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
  // --- céu sem teto: subir com turbo além do antigo teto (28 m) ---
  await press("advance", true);
  await press("run", true);
  await step(90); // 3 s
  await press("run", false);
  await press("advance", false);
  const high = await page.evaluate(() => window.eva.driving.altitude);
  check(high > 30, `Rastro passou do antigo teto (altitude ${high.toFixed(1)} m)`);
  // --- estratosfera: teletransporte a 40 km para validar voo livre, céu escuro e a Terra vista de cima ---
  await page.evaluate(() => {
    const v = window.eva.driving;
    const p = v.position;
    v.teleport(p.constructor.FromArray([p.x, 40000, p.z]), v.heading);
    v.hover.setPowered(true);
  });
  await step(20);
  s = await snap();
  const altInfo = s.altitude ?? {};
  check(altInfo.abs > 30000 && altInfo.farLayer === true && altInfo.space > 0.3, `Estratosfera: alt ${((altInfo.abs ?? 0) / 1000).toFixed(1)} km · camada distante ${altInfo.farLayer} · espaço ${(altInfo.space ?? 0).toFixed(2)} · ar ${(altInfo.air ?? 0).toFixed(2)}`);
  const hoverSpeed = await page.evaluate(() => { const v = window.eva.driving; const vel = v.body.getLinearVelocity(); return Math.abs(vel.y); });
  check(hoverSpeed < 12, `Rastro paira em voo livre (velocidade vertical ${hoverSpeed.toFixed(1)} m/s)`);
  await shot("veiculo_rastro_estratosfera");
  // volta para perto do chão, sobre a praça (a subida com turbo deriva para oeste, por cima dos telhados), para pousar
  await page.evaluate(([x, z]) => {
    const v = window.eva.driving;
    v.teleport(v.position.constructor.FromArray([x, 5, z]), v.heading);
    v.hover.setPowered(true);
  }, [ras[0], ras[2]]);
  await step(20);
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
  }
  if (ONLY !== "veiculos") {

  // ---------------- Combate e missão "O Carregamento" ----------------
  console.log("Combate e missão");
  // avança a narrativa até o Custódio armar Matias (flags da fase), como se os diálogos tivessem ocorrido
  await page.evaluate(() => {
    const g = window.eva;
    g.flags.set("cartao.pego", true);
    g.flags.set("apuracao.concluida", true);
    g.flags.set("custodio.avisouLote", true);
    g.quests.start("o_carregamento");
    g.teleportPlayer(30.5, 0.22, 12.5, Math.PI);
  });
  await step(30);
  await page.evaluate(() => { window.eva.flags.set("carregamento.anoitecer", true); window.eva.flags.set("carregamento.armado", true); });
  // espera a pistola carregar e a primeira onda surgir (3 s de jogo + carga dos GLB)
  for (let i = 0; i < 40; i++) {
    await step(10);
    const sn = await snap();
    if (sn.enemies && sn.enemies.total >= 3 && sn.ammo) break;
  }
  s = await snap();
  check(s.ammo && s.ammo.mag === 12, `pistola equipada (${s.ammo?.mag}/${s.ammo?.reserve})`);
  check(s.enemies && s.enemies.total === 3, `primeira onda em campo (${s.enemies?.total} inimigos, estados ${JSON.stringify(s.enemies?.states)})`);
  check(s.phase === "onda1", `fase da missão: ${s.phase}`);
  await shot("combate_onda1");
  // mira no inimigo mais próximo e atira até derrubá-lo
  const target = await page.evaluate(() => {
    const e = window.eva.enemies.nearest(window.eva.player.feet);
    const c = e.chest;
    return { x: c.x, y: c.y, z: c.z, hp: e.health.current, dist: window.eva.player.feet.subtract(e.feet).length() };
  });
  await press("aim", true);
  await step(15);
  s = await snap();
  check(s.aiming === true && s.overlay === "PistolAim", `mirando (overlay ${s.overlay})`);
  let fired = 0;
  let hp = target.hp;
  for (let i = 0; i < 11 && hp > 0; i++) {
    await page.evaluate(() => { const e = window.eva.enemies.enemies.find((x) => x.alive); const c = e.chest; window.eva.aimAt(c.x, c.y, c.z); });
    await step(3);
    await press("fire", true);
    await step(2);
    await press("fire", false);
    await step(6);
    fired++;
    hp = await page.evaluate(() => { const e = window.eva.enemies.enemies.find((x) => x.alive); return e ? e.health.current : 0; });
  }
  await press("aim", false);
  s = await snap();
  const stats = await page.evaluate(() => window.eva.combat.stats);
  check(stats.hits > 0, `acertou o inimigo (${stats.hits}/${stats.shots} disparos, munição ${s.ammo?.mag}/${s.ammo?.reserve})`);
  check(stats.kills >= 1 || s.enemies.alive < 3, `inimigo derrubado (vivos: ${s.enemies?.alive})`);
  check(s.ammo && s.ammo.mag < 12, `munição consumida (${s.ammo?.mag})`);
  await shot("combate_tiro");
  // recarga
  await press("reload", true);
  await step(3);
  await press("reload", false);
  await step(70);
  s = await snap();
  check(s.ammo && s.ammo.mag === 12 && s.ammo.reserve < 36, `recarregou (${s.ammo?.mag}/${s.ammo?.reserve})`);
  // inimigos reagem: alguém atirou em Matias?
  await step(90);
  s = await snap();
  console.log(`  vida de Matias após 3 s sob fogo: ${s.health}`);
  // encerra a onda 1 por depuração e confere a transição para a onda 2
  await page.evaluate(() => { for (const e of window.eva.enemies.enemies) if (e.alive) e.takeDamage(999, window.eva.player.feet, false); });
  for (let i = 0; i < 30; i++) {
    await step(10);
    const sn = await snap();
    if (sn.phase === "onda2" && sn.enemies.alive >= 4) break;
  }
  s = await snap();
  check(s.phase === "onda2" && s.enemies.alive >= 4, `segunda onda (${s.enemies?.alive} vivos, fase ${s.phase})`);
  await page.evaluate(() => { for (const e of window.eva.enemies.enemies) if (e.alive) e.takeDamage(999, window.eva.player.feet, false); });
  await step(20);
  s = await snap();
  check(s.phase === "fuga", `praça limpa → fase ${s.phase}`);
  // o Custódio ferido puxa conversa quando Matias está perto: avança as falas
  let sawCustodio = false;
  for (let i = 0; i < 14; i++) {
    await page.waitForTimeout(600);
    const st = await page.evaluate(() => window.eva.state);
    if (st !== "dialogue") {
      if (sawCustodio) break;
      await step(5);
      continue;
    }
    sawCustodio = true;
    await press("advance", true);
    await press("advance", false);
  }
  check(sawCustodio, "Custódio ferido falou com Matias após o combate");
  // entra na van e leva até a oficina
  const van = await page.evaluate(() => { const v = window.eva.vehicles.find((x) => x.def.id === "modulo_v7"); const p = v.position; return [p.x, p.z]; });
  await page.evaluate(([x, z]) => window.eva.teleportPlayer(x + 0.3, 0.22, z + 2.2, Math.PI), van);
  await step(10);
  s = await snap();
  const vinfo = await page.evaluate(() => { const v = window.eva.vehicles.find((x) => x.def.id === "modulo_v7"); const p = v.position; return { p: [p.x, p.y, p.z].map((n) => +n.toFixed(2)), up: v.isUpright, occ: v.occupied, prompt: v.getPrompt(), feet: window.eva.snapshot().feet }; });
  check(/Entrar/.test(s.prompt ?? ""), `prompt da van: "${s.prompt}" (${JSON.stringify(vinfo)})`);
  await press("interact", true);
  await press("interact", false);
  await step(15);
  s = await snap();
  check(s.driving === "modulo_v7" && s.phase === "entrega", `na van (${s.driving}), fase ${s.phase}`);
  if (s.driving !== "modulo_v7") throw new Error("não entrou na van");
  await page.evaluate(() => { const v = window.eva.driving; v.teleport(v.position.constructor.FromArray([-30, 0.12, -2.5]), -Math.PI / 2); });
  await step(30);
  s = await snap();
  check(s.phase === "trancar", `van na oficina → fase ${s.phase}`);
  await press("interact", true);
  await press("interact", false);
  await step(10);
  await page.evaluate(() => window.eva.teleportPlayer(-30, 0.12, -5.6, Math.PI));
  await step(10);
  s = await snap();
  check(/Trancar/.test(s.prompt ?? ""), `prompt da porta: "${s.prompt}"`);
  await press("interact", true);
  await press("interact", false);
  let radioStarted = false;
  for (let i = 0; i < 40; i++) {
    await step(5);
    await page.waitForTimeout(300);
    if ((await page.evaluate(() => window.eva.state)) === "dialogue") {
      radioStarted = true;
      break;
    }
  }
  check(radioStarted, `rádio final iniciado (fase ${await page.evaluate(() => window.eva.director.phase)})`);
  // avança o diálogo até a escolha e escolhe a primeira opção
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(700);
    const pending = await page.evaluate(() => window.eva["hud"].hasPendingChoice);
    if (pending) break;
    await press("advance", true);
    await press("advance", false);
  }
  await press("choice1", true);
  await press("choice1", false);
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(700);
    const st = await page.evaluate(() => window.eva.state);
    if (st === "playing") break;
    await press("advance", true);
    await press("advance", false);
  }
  let end = null;
  for (let i = 0; i < 30; i++) {
    await step(5);
    await page.waitForTimeout(300);
    end = await page.evaluate(() => ({ phase: window.eva.director.phase, visible: document.getElementById("mission-end")?.classList.contains("visible"), decision: window.eva.flags.get("carregamento.decisao") }));
    if (end.visible) break;
  }
  check(end.phase === "concluida" && end.visible === true, `missão concluída (fase ${end.phase}, decisão ${end.decision}, tela final ${end.visible})`);
  await shot("missao_fim");
  }

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

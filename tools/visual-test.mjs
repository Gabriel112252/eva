/**
 * Teste visual automatizado: serve `dist/`, abre no Chromium (Playwright),
 * captura erros de console, inicia um novo jogo, simula WASD/Shift/C/E,
 * tira screenshots e valida estado do jogo via window.eva.
 *
 * Uso: node tools/visual-test.mjs [--headed] [--out docs/screenshots] [--quality baixa] [--lock]
 * Requer: npm run build (dist/) e Playwright + Chromium instalados.
 *
 * Por padrão abre o jogo com `?pointerlock=0` (câmera por arrastar do mouse): no Chromium headless
 * com SwiftShader, o pointer lock ativo deixa cada frame 5–10× mais lento (artefato do ambiente,
 * não do jogo), o que inviabiliza andar/correr no tempo do teste. `--lock` testa o caminho com pointer lock.
 */
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { createRequire } from "node:module";

// Playwright pode estar instalado globalmente (ex.: /opt/npm-tools) em vez de em node_modules.
const require = createRequire(import.meta.url);
function loadPlaywright() {
  const candidates = ["playwright", "/opt/npm-tools/node_modules/playwright", `${process.env.HOME}/.npm-global/lib/node_modules/playwright`];
  for (const c of candidates) {
    try {
      return require(c);
    } catch {
      /* tenta o próximo */
    }
  }
  throw new Error("Playwright não encontrado. Instale com `npm i -D playwright` e `npx playwright install chromium`.");
}
const { chromium } = loadPlaywright();

const DIST = resolve("dist");
const OUT = resolve(process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "docs/screenshots");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".glb": "model/gltf-binary", ".json": "application/json", ".png": "image/png" };

if (!existsSync(DIST)) {
  console.error("dist/ não existe. Rode `npm run build` antes.");
  process.exit(1);
}
await mkdir(OUT, { recursive: true });

const server = createServer(async (req, res) => {
  const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
  const file = join(DIST, url === "/" ? "index.html" : url);
  try {
    const data = await readFile(file);
    res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}/`;
console.log("Servindo", base);

const browser = await chromium.launch({
  headless: !process.argv.includes("--headed"),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl", "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({ viewport: { width: 1024, height: 576 } });
page.setDefaultTimeout(120_000);
const errors = [];
const warnings = [];
page.on("console", (m) => {
  const t = m.type();
  if (t === "error") errors.push(m.text());
  else if (t === "warning") warnings.push(m.text());
});
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

let failed = 0;
const check = (cond, label) => {
  console.log(`${cond ? "✔" : "✘"} ${label}`);
  if (!cond) failed++;
};

try {
  const quality = process.argv.includes("--quality") ? process.argv[process.argv.indexOf("--quality") + 1] : "baixa";
  await page.goto(`${base}?quality=${quality}${process.argv.includes("--lock") ? "" : "&pointerlock=0"}`, { waitUntil: "load" });
  await page.waitForFunction(() => document.getElementById("menu")?.classList.contains("visible"), null, { timeout: 120_000 });
  check(true, "carregou até o menu principal");
  await page.screenshot({ path: join(OUT, "01-menu.jpg"), type: "jpeg", quality: 82 });

  await page.waitForTimeout(3000);
  const stats = await page.evaluate(() => {
    const g = window.eva;
    return { meshes: g.scene.meshes.length, lights: g.scene.lights.length, materials: g.scene.materials.length, physics: !!g.scene.getPhysicsEngine(), state: g.state, fps: Number(g.engine.getFps().toFixed(1)), drawCalls: g.scene.getActiveMeshes().length };
  });
  console.log("  cena:", JSON.stringify(stats));
  check(stats.meshes > 50, `cena com ${stats.meshes} meshes`);
  check(stats.physics, "Havok ativo");

  // Novo jogo
  await page.click("#btn-new");
  await page.waitForFunction(() => window.eva.state === "playing", null, { timeout: 30_000 });
  check(true, "estado 'playing' após Novo jogo");
  await page.waitForTimeout(1500);
  const snap = () => page.evaluate(() => window.eva.snapshot());
  const p0 = await snap();
  console.log("  spawn:", JSON.stringify({ feet: p0.feet, clip: p0.clip, fps: p0.fps, audio: p0.audioReady, lock: p0.pointerLocked }));
  check(p0.clip === "Idle", "animação Idle no spawn");
  await page.screenshot({ path: join(OUT, "02-oficina.jpg"), type: "jpeg", quality: 82 });

  // O renderizador por software roda a poucos FPS; a lógica usa dt real (limitado a 50 ms),
  // então mantemos as teclas por tempo suficiente para vários frames.
  const holdMs = 4000;

  // Andar para frente (W)
  await page.focus("#game");
  /** Espera (até maxMs) o snapshot satisfazer a condição — tolera o renderizador por software lento. */
  const waitState = async (pred, maxMs = 12_000) => {
    const t0 = Date.now();
    let last = await snap();
    while (!pred(last) && Date.now() - t0 < maxMs) {
      await page.waitForTimeout(400);
      last = await snap();
    }
    return last;
  };

  await page.keyboard.down("KeyW");
  const mid = await waitState((s) => s.moveState === "walk" && s.clip === "Walk");
  console.log("  durante W:", JSON.stringify({ held: mid.heldForward, moveState: mid.moveState, clip: mid.clip, camYaw: mid.cameraYaw }));
  await page.waitForTimeout(holdMs);
  const p1 = await snap();
  await page.screenshot({ path: join(OUT, "03-andando.jpg"), type: "jpeg", quality: 82 });
  await page.keyboard.up("KeyW");
  const walked = Math.hypot(p1.feet.x - p0.feet.x, p1.feet.z - p0.feet.z);
  console.log("  andou", walked.toFixed(2), "m; de", JSON.stringify(p0.feet), "para", JSON.stringify(p1.feet));
  check(mid.heldForward, "tecla W registrada pelo InputManager");
  check(walked > 0.3, "Matias anda com W");
  check(mid.clip === "Walk", "clipe Walk durante a caminhada");
  check(Math.abs(p1.feet.x - p0.feet.x) < 0.1 && Math.abs(mid.cameraYaw) < 0.05, `anda em linha reta (câmera yaw ${mid.cameraYaw.toFixed(3)})`);
  await waitState((s) => s.moveState === "idle");

  // Câmera com o mouse: com pointer lock (--lock) o movimento relativo gira; sem ele, arrastar com o botão esquerdo
  const yawBefore = (await snap()).cameraYaw;
  await page.mouse.move(640, 300);
  await page.mouse.down();
  await page.mouse.move(500, 300, { steps: 10 });
  await page.mouse.up();
  const turned = await waitState((s) => Math.abs(s.cameraYaw - yawBefore) > 0.15, 8000);
  console.log("  câmera yaw com o mouse:", yawBefore.toFixed(3), "→", turned.cameraYaw.toFixed(3), "lock:", turned.pointerLocked);
  check(Math.abs(turned.cameraYaw - yawBefore) > 0.15, "o mouse gira a câmera");
  const hintVisible = await page.evaluate(() => document.getElementById("click-hint")?.classList.contains("visible"));
  check(!hintVisible, "dica 'clique na cena' some após o clique");

  // Correr
  await page.keyboard.down("ShiftLeft");
  await page.keyboard.down("KeyW");
  const run = await waitState((s) => s.moveState === "run" && s.clip === "Run");
  await page.screenshot({ path: join(OUT, "04-correndo.jpg"), type: "jpeg", quality: 82 });
  await page.keyboard.up("KeyW");
  await page.keyboard.up("ShiftLeft");
  check(run.moveState === "run" && run.clip === "Run", `corrida com Shift: ${run.moveState}/${run.clip}`);
  await waitState((s) => s.moveState === "idle");

  // Agachar
  await page.keyboard.press("KeyC");
  const crouch = await waitState((s) => s.crouched && s.clip === "CrouchIdle");
  check(crouch.crouched && crouch.clip === "CrouchIdle", `agachado: ${crouch.crouched}/${crouch.clip}`);
  await page.screenshot({ path: join(OUT, "05-agachado.jpg"), type: "jpeg", quality: 82 });
  await page.keyboard.press("KeyC");
  const stood = await waitState((s) => !s.crouched);
  check(!stood.crouched, "levanta com C");

  // Rádio e cartão na oficina: aproxima-se da mesa e interage com E
  await page.evaluate(() => {
    const g = window.eva;
    const card = g["world"].workshop.card.getAbsolutePosition();
    g.teleportPlayer(card.x - 0.2, 0.15, card.z - 1.0, 0.15);
  });
  await page.waitForTimeout(1500);
  const promptCard = (await snap()).prompt;
  console.log("  prompt na mesa:", promptCard);
  check(promptCard === "Pegar o cartão de registro", "prompt do cartão de registro");
  await page.screenshot({ path: join(OUT, "02b-cartao.jpg"), type: "jpeg", quality: 82 });
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(1500);
  const afterCard = await snap();
  check(afterCard.flags["cartao.pego"] === true && afterCard.objectiveDone.cartao, "cartão pego: flag + objetivo concluído");

  // Praça: trigger de objetivo
  await page.evaluate(() => {
    const sp = window.eva["world"].spawns.get("praca");
    window.eva.teleportPlayer(sp.position.x, sp.position.y, sp.position.z, sp.yaw);
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(OUT, "06-praca.jpg"), type: "jpeg", quality: 82 });
  check((await snap()).objectiveDone.praca, "objetivo 'praça' concluído ao entrar na praça (trigger)");

  // Aproxima-se de Raquel e interage
  await page.evaluate(() => window.eva.approachNpc("raquel", 1.6));
  await page.waitForTimeout(1500);
  const prompt = (await snap()).prompt;
  console.log("  prompt perto de Raquel:", prompt);
  check(prompt === "Falar com Raquel", "prompt de interação com Raquel");
  await page.screenshot({ path: join(OUT, "07-prompt.jpg"), type: "jpeg", quality: 82 });
  await page.keyboard.press("KeyE");
  await page.waitForFunction(() => window.eva.state === "dialogue", null, { timeout: 15000 });
  await page.waitForTimeout(2500);
  const sub = await page.evaluate(() => ({ speaker: document.getElementById("subtitle-speaker")?.textContent, text: document.getElementById("subtitle-text")?.textContent, visible: document.getElementById("subtitle")?.classList.contains("visible") }));
  console.log("  legenda:", JSON.stringify(sub));
  check(sub.visible && sub.speaker === "Raquel" && (sub.text ?? "").length > 10, "legenda de Raquel visível");
  await page.screenshot({ path: join(OUT, "08-dialogo.jpg"), type: "jpeg", quality: 82 });

  // Avança falas até as escolhas
  for (let i = 0; i < 6; i++) {
    const hasChoices = await page.evaluate(() => document.getElementById("choices")?.classList.contains("visible"));
    if (hasChoices) break;
    await page.keyboard.press("Space");
    await page.waitForTimeout(1500);
  }
  const choices = await page.evaluate(() => [...document.querySelectorAll(".choice-btn span")].map((e) => e.textContent));
  console.log("  escolhas:", JSON.stringify(choices));
  check(choices.length === 2, "duas escolhas exibidas");
  await page.screenshot({ path: join(OUT, "09-escolhas.jpg"), type: "jpeg", quality: 82 });
  await page.keyboard.press("Digit2"); // não confia no sistema
  await page.waitForTimeout(1200);
  for (let i = 0; i < 8; i++) {
    const st = await page.evaluate(() => window.eva.state);
    if (st === "playing") break;
    await page.keyboard.press("Space");
    await page.waitForTimeout(1200);
  }
  await page.waitForFunction(() => window.eva.state === "playing", null, { timeout: 30_000 });
  const afterDialogue = await snap();
  check(afterDialogue.flags.matiasTrustsSystem === false, `flag matiasTrustsSystem = ${afterDialogue.flags.matiasTrustsSystem}`);
  check(afterDialogue.objectiveDone.raquel, "objetivo 'raquel' concluído após o diálogo");

  // Persistência: recarrega e confere o save em IndexedDB
  await page.evaluate(() => window.eva.saveGame(false));
  await page.waitForTimeout(500);
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => document.getElementById("menu")?.classList.contains("visible"), null, { timeout: 120_000 });
  const canContinue = await page.evaluate(() => !document.getElementById("btn-continue").hidden);
  check(canContinue, "botão Continuar disponível após refresh");
  await page.click("#btn-continue");
  await page.waitForFunction(() => window.eva.state === "playing", null, { timeout: 30_000 });
  await page.waitForTimeout(800);
  const restored = await snap();
  console.log("  restaurado:", JSON.stringify({ flag: restored.flags.matiasTrustsSystem, raquel: restored.objectiveDone.raquel, cartao: restored.objectiveDone.cartao, backend: restored.saveBackend }));
  check(restored.flags.matiasTrustsSystem === false && restored.objectiveDone.raquel && restored.objectiveDone.cartao && restored.saveBackend === "indexeddb", "escolha persistiu em IndexedDB após refresh");
  await page.screenshot({ path: join(OUT, "10-continuar.jpg"), type: "jpeg", quality: 82 });

  // Pausa
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  const paused = await page.evaluate(() => window.eva.state);
  check(paused === "paused", `pausa com Esc (${paused})`);
  await page.screenshot({ path: join(OUT, "11-pausa.jpg"), type: "jpeg", quality: 82 });

  console.log(`  FPS no menu (SwiftShader, renderização por software, sem GPU): ${stats.fps}`);
} catch (e) {
  failed++;
  console.error("✘ exceção no teste:", e);
  await page.screenshot({ path: join(OUT, "erro.jpg"), type: "jpeg", quality: 82 }).catch(() => {});
} finally {
  const realErrors = errors.filter((e) => !/favicon/i.test(e));
  console.log(`\nErros de console: ${realErrors.length}`);
  for (const e of realErrors.slice(0, 15)) console.log("  -", e.slice(0, 300));
  console.log(`Avisos: ${warnings.length}`);
  for (const w of [...new Set(warnings)].slice(0, 8)) console.log("  -", w.slice(0, 200));
  await browser.close();
  server.close();
  console.log(failed === 0 ? "\nTESTE VISUAL: OK" : `\nTESTE VISUAL: ${failed} falha(s)`);
  process.exit(failed === 0 && realErrors.length === 0 ? 0 : 1);
}

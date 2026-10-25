/**
 * Teste dos controles de toque: emula um celular na horizontal (tela sensível, sem mouse)
 * no Chromium, inicia um novo jogo e usa SOMENTE toques — joystick virtual (andar/correr),
 * arrastar para girar a câmera, botões de agachar/correr/interagir/pausa e toque para
 * avançar o diálogo — validando o estado via window.eva. Salva screenshots em docs/screenshots/.
 *
 * Uso: node tools/touch-test.mjs [--headed] [--out docs/screenshots] [--quality baixa]
 * Requer: npm run build (dist/) e Playwright + Chromium.
 */
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { loadPlaywright, serveDist, CHROMIUM_ARGS, argValue } from "./lib/harness.mjs";

const { chromium } = loadPlaywright();
const OUT = resolve(argValue("--out", "docs/screenshots"));
await mkdir(OUT, { recursive: true });
const { base, close } = await serveDist();
console.log("Servindo", base);

const browser = await chromium.launch({ headless: !process.argv.includes("--headed"), args: CHROMIUM_ARGS });
// celular comum na horizontal (ex.: 851×393 px CSS); DPR 1 para o renderizador por software aguentar
const context = await browser.newContext({ viewport: { width: 851, height: 393 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36" });
const page = await context.newPage();
page.setDefaultTimeout(120_000);
const cdp = await context.newCDPSession(page);
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

let failed = 0;
const check = (cond, label) => {
  console.log(`${cond ? "✔" : "✘"} ${label}`);
  if (!cond) failed++;
};
const snap = () => page.evaluate(() => window.eva.snapshot());
const shot = (name) => page.screenshot({ path: join(OUT, name), type: "jpeg", quality: 82 });
/** Espera (até maxMs) o snapshot satisfazer a condição — tolera o renderizador por software lento. */
const waitState = async (pred, maxMs = 20_000) => {
  const t0 = Date.now();
  let last = await snap();
  while (!pred(last) && Date.now() - t0 < maxMs) {
    await page.waitForTimeout(350);
    last = await snap();
  }
  return last;
};

// --- toques reais via CDP (o Playwright só oferece tap; arrastar exige touchStart/Move/End) ---
const touchStart = (id, x, y) => cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id, radiusX: 6, radiusY: 6, force: 1 }] });
const touchMove = (id, x, y) => cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y, id, radiusX: 6, radiusY: 6, force: 1 }] });
const touchEnd = () => cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
/** Arrasta de (x0,y0) a (x1,y1) em `steps` passos e mantém o dedo pousado. */
const dragHold = async (id, x0, y0, x1, y1, steps = 6) => {
  await touchStart(id, x0, y0);
  for (let i = 1; i <= steps; i++) {
    await touchMove(id, x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps);
    await page.waitForTimeout(30);
  }
};

try {
  await page.goto(`${base}?quality=${argValue("--quality", "baixa")}`, { waitUntil: "load" });
  await page.waitForFunction(() => document.getElementById("menu")?.classList.contains("visible"), null, { timeout: 120_000 });
  const detect = await page.evaluate(() => ({ touch: window.eva.touch.snapshot(), bodyClass: document.body.className, hint: document.getElementById("menu-controls-hint")?.textContent, coarse: matchMedia("(pointer: coarse)").matches, maxTouchPoints: navigator.maxTouchPoints, quality: window.eva.settings.quality }));
  console.log("  detecção:", JSON.stringify(detect));
  check(detect.touch.enabled && detect.bodyClass.includes("touch-mode"), "controles de toque detectados automaticamente no celular emulado");
  check(/joystick/i.test(detect.hint ?? ""), "dica de controles do menu adaptada ao toque");
  await shot("12-celular-menu.jpg");

  // Novo jogo por toque
  await page.tap("#btn-new");
  await page.waitForFunction(() => window.eva.state === "playing", null, { timeout: 30_000 });
  await page.waitForTimeout(1200);
  const p0 = await snap();
  console.log("  início:", JSON.stringify({ mode: p0.touch.mode, lock: p0.pointerLocked, clip: p0.clip, fps: p0.fps }));
  check(p0.touch.mode === "play" && !p0.pointerLocked, "modo 'play' sem pointer lock");
  const visible = await page.evaluate(() => ({ touch: getComputedStyle(document.getElementById("touch")).display, actions: getComputedStyle(document.querySelector(".touch-actions")).display, hint: getComputedStyle(document.getElementById("click-hint")).display }));
  check(visible.touch === "block" && visible.actions === "block" && visible.hint === "none", `camada de toque visível, dica de clique oculta (${JSON.stringify(visible)})`);

  // Joystick: meio curso para a frente = andar
  const jx = 170;
  const jy = 290;
  await dragHold(1, jx, jy, jx, jy - 36);
  const walking = await waitState((s) => s.moveState === "walk" && s.clip === "Walk");
  console.log("  joystick meio curso:", JSON.stringify({ analog: walking.analog, moveState: walking.moveState, clip: walking.clip, run: walking.heldRun, joy: walking.touch.joystickActive }));
  check(walking.touch.joystickActive, "joystick ativo com o dedo pousado");
  check(Math.abs(walking.analog.y - 1) < 1e-6 && Math.abs(walking.analog.x) < 1e-6, "eixo analógico normalizado para a frente");
  check(walking.moveState === "walk" && walking.clip === "Walk" && !walking.heldRun, "anda (sem correr) com meio curso");
  await page.waitForTimeout(3000);
  await shot("13-celular-joystick.jpg");
  const p1 = await snap();
  const walked = Math.hypot(p1.feet.x - p0.feet.x, p1.feet.z - p0.feet.z);
  console.log("  andou", walked.toFixed(2), "m");
  check(walked > 0.25, "Matias se desloca com o joystick");
  // empurra até o anel externo = correr
  await touchMove(1, jx, jy - 80);
  const running = await waitState((s) => s.moveState === "run" && s.clip === "Run");
  check(running.heldRun && running.moveState === "run" && running.clip === "Run", `curso total corre (${running.moveState}/${running.clip})`);
  const ring = await page.evaluate(() => document.getElementById("joystick").classList.contains("running"));
  check(ring, "anel do joystick indica corrida");
  await touchEnd();
  const stopped = await waitState((s) => s.moveState === "idle" && !s.touch.joystickActive);
  check(stopped.analog.x === 0 && stopped.analog.y === 0 && !stopped.heldRun && stopped.moveState === "idle", "soltar o joystick zera o eixo e para");

  // Câmera: arrastar na metade direita gira o yaw
  const yaw0 = (await snap()).cameraYaw;
  await dragHold(2, 640, 180, 520, 180, 8);
  await touchEnd();
  const turned = await waitState((s) => Math.abs(s.cameraYaw - yaw0) > 0.2, 8000);
  console.log("  câmera yaw:", yaw0.toFixed(3), "→", turned.cameraYaw.toFixed(3));
  check(Math.abs(turned.cameraYaw - yaw0) > 0.2, "arrastar à direita gira a câmera");
  check(turned.state === "playing", "arrastar não dispara ação");
  const feetAfterLook = turned.feet;
  check(Math.hypot(feetAfterLook.x - p1.feet.x, feetAfterLook.z - p1.feet.z) < 1.5, "olhar não move o personagem");

  // Botões: agachar (alterna) e correr (trava)
  await page.tap("#tc-crouch");
  const crouched = await waitState((s) => s.crouched && s.clip === "CrouchIdle");
  check(crouched.crouched && crouched.clip === "CrouchIdle", "botão Agachar agacha");
  const latchedCrouch = await page.evaluate(() => document.getElementById("tc-crouch").classList.contains("latched"));
  check(latchedCrouch, "botão Agachar fica marcado enquanto agachado");
  await page.tap("#tc-crouch");
  check(!(await waitState((s) => !s.crouched)).crouched, "botão Agachar levanta");
  await page.tap("#tc-run");
  const runLatch = await snap();
  check(runLatch.touch.runLatch && runLatch.heldRun, "botão Correr trava a corrida");
  await dragHold(1, jx, jy, jx, jy - 36);
  const latchedRun = await waitState((s) => s.moveState === "run");
  check(latchedRun.moveState === "run", "com Correr travado, meio curso já corre");
  await touchEnd();
  await page.tap("#tc-run");
  await waitState((s) => s.moveState === "idle");
  check(!(await snap()).heldRun, "destravar Correr solta a corrida");

  // Interagir: cartão de registro
  await page.evaluate(() => {
    const g = window.eva;
    const card = g["world"].workshop.card.getAbsolutePosition();
    g.teleportPlayer(card.x - 0.2, 0.15, card.z - 1.0, 0.15);
  });
  const withPrompt = await waitState((s) => s.prompt === "Pegar o cartão de registro", 8000);
  check(withPrompt.prompt === "Pegar o cartão de registro", "prompt do cartão");
  const eActive = await page.evaluate(() => document.getElementById("tc-interact").classList.contains("active"));
  check(eActive, "botão E destacado quando há interação");
  await shot("14-celular-interagir.jpg");
  await page.tap("#tc-interact");
  const picked = await waitState((s) => s.flags["cartao.pego"] === true, 8000);
  check(picked.flags["cartao.pego"] === true, "botão E pega o cartão");

  // Diálogo por toque
  await page.evaluate(() => window.eva.approachNpc("raquel", 1.6));
  await waitState((s) => s.prompt === "Falar com Raquel", 8000);
  await page.tap("#tc-interact");
  await page.waitForFunction(() => window.eva.state === "dialogue", null, { timeout: 15_000 });
  await page.waitForTimeout(2500);
  const dlg = await page.evaluate(() => ({ mode: window.eva.touch.snapshot().mode, actions: getComputedStyle(document.querySelector(".touch-actions")).display, joystick: getComputedStyle(document.getElementById("joystick")).display, cont: document.getElementById("subtitle-continue")?.textContent, text: document.getElementById("subtitle-text")?.textContent }));
  console.log("  diálogo:", JSON.stringify(dlg));
  check(dlg.mode === "dialogue" && dlg.actions === "none" && dlg.joystick === "none", "no diálogo o joystick e os botões somem");
  check(/toque/i.test(dlg.cont ?? ""), "legenda pede 'toque' para continuar");
  await shot("15-celular-dialogo.jpg");
  // toque curto avança a fala
  await page.touchscreen.tap(420, 150);
  await page.waitForTimeout(1500);
  const text2 = await page.evaluate(() => document.getElementById("subtitle-text")?.textContent);
  check(text2 !== dlg.text, "toque na tela avança a fala");
  // avança até as escolhas
  for (let i = 0; i < 8; i++) {
    const hasChoices = await page.evaluate(() => document.getElementById("choices")?.classList.contains("visible"));
    if (hasChoices) break;
    await page.touchscreen.tap(420, 150);
    await page.waitForTimeout(1500);
  }
  const choicesInfo = await page.evaluate(() => ({ n: document.querySelectorAll(".choice-btn").length, mode: window.eva.touch.snapshot().mode, kbd: getComputedStyle(document.querySelector(".choice-btn kbd")).display }));
  check(choicesInfo.n === 2 && choicesInfo.mode === "choices", `duas escolhas, modo 'choices' (${JSON.stringify(choicesInfo)})`);
  // um toque fora dos botões NÃO escolhe por acidente
  await page.touchscreen.tap(420, 60);
  await page.waitForTimeout(800);
  check(await page.evaluate(() => document.getElementById("choices")?.classList.contains("visible")), "toque fora das opções não escolhe nada");
  await shot("16-celular-escolhas.jpg");
  await page.tap(".choice-btn:nth-child(2)"); // não confia no sistema
  await page.waitForTimeout(1200);
  for (let i = 0; i < 10; i++) {
    if ((await page.evaluate(() => window.eva.state)) === "playing") break;
    await page.touchscreen.tap(420, 150);
    await page.waitForTimeout(1200);
  }
  await page.waitForFunction(() => window.eva.state === "playing", null, { timeout: 30_000 });
  const after = await snap();
  check(after.flags.matiasTrustsSystem === false && after.touch.mode === "play", `escolha registrada por toque e volta ao modo 'play' (flag=${after.flags.matiasTrustsSystem})`);

  // Pausa pelo botão e retomar pelo menu
  await page.tap("#tc-pause");
  await page.waitForTimeout(500);
  const paused = await snap();
  check(paused.state === "paused" && paused.touch.mode === "hidden", "botão de pausa abre o menu e esconde os controles");
  await shot("17-celular-pausa.jpg");
  await page.tap("#btn-resume");
  await page.waitForTimeout(500);
  const resumed = await snap();
  check(resumed.state === "playing" && resumed.touch.mode === "play", "Continuar retoma com os controles de toque");
  console.log(`  FPS (SwiftShader, sem GPU): ${resumed.fps}`);
} catch (e) {
  failed++;
  console.error("✘ exceção no teste:", e);
  await shot("erro-celular.jpg").catch(() => {});
} finally {
  const realErrors = errors.filter((e) => !/favicon/i.test(e));
  console.log(`\nErros de console: ${realErrors.length}`);
  for (const e of realErrors.slice(0, 15)) console.log("  -", e.slice(0, 300));
  await browser.close();
  close();
  console.log(failed === 0 ? "\nTESTE DE TOQUE: OK" : `\nTESTE DE TOQUE: ${failed} falha(s)`);
  process.exit(failed === 0 && realErrors.length === 0 ? 0 : 1);
}

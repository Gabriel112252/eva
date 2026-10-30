/**
 * Prova visual do pipeline de render: os mesmos 5 enquadramentos (praça de dia, Rua dos Recicladores, Avenida do
 * Maglev, praça ao anoitecer e close de Matias) em cada qualidade, com câmera fixa, HUD oculto e quadros
 * determinísticos (`captureStart`). Para cada enquadramento mede draw calls e o tempo médio de quadro com
 * `gl.finish()` — menor de duas medianas de N quadros (SwiftShader: custo de CPU que acompanha o trabalho de pixel; vale como
 * comparação relativa antes/depois na mesma máquina, não como FPS real de GPU).
 *
 * Uso: npm run build && flock /home/claude/.eva-browser.lock node tools/capture-visual.mjs \
 *        [--out docs/screenshots/visual/depois] [--quality alta,media] [--only 01_praca_dia,05_close_matias] [--settle 12] [--timed 5]
 *        [--dist dist]   (outra pasta de build: ex. uma cópia do dist de antes da mudança)
 * Saída: <out>/<qualidade>/<nome>.jpg e <out>/metricas.json
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadPlaywright, serveDist, CHROMIUM_ARGS, argValue } from "./lib/harness.mjs";

const { chromium } = loadPlaywright();
const OUT = resolve(argValue("--out", "docs/screenshots/visual/depois"));
const QUALITIES = argValue("--quality", "alta,media").split(",");
const ONLY = argValue("--only", "");
const SETTLE = Number(argValue("--settle", "12"));
const TIMED = Number(argValue("--timed", "5"));
const W = Number(argValue("--width", "1280"));
const H = Number(argValue("--height", "720"));
const DIST = argValue("--dist", "dist");

/** nome, olho, alvo, pés de Matias [x,y,z] (ou null), yaw de Matias, anoitecer (0..1), fov */
const SHOTS = [
  ["01_praca_dia", [32, 7, -17], [31, 1.5, 8], [30.5, 0.22, -6], Math.PI, 0, 0.95],
  ["02_rua_recicladores", [30, 1.9, 43.5], [-24, 9, 46], [24, 0.12, 44], -Math.PI / 2, 0, 0.95],
  ["03_av_maglev", [63.5, 1.9, -34], [72.5, 7, -2], [68, 0.12, -27], 0, 0, 0.95],
  ["04_praca_anoitecer", [32, 7, -17], [31, 1.5, 8], [30.5, 0.22, -6], Math.PI, 1, 0.95],
  ["05_close_matias", [28.25, 1.86, -6.5], [29.5, 1.72, -5.5], [29.5, 0.22, -5.5], -2.25, 0, 0.62],
];

const { base, close } = await serveDist(resolve(DIST));
const browser = await chromium.launch({ headless: true, args: CHROMIUM_ARGS });
const metrics = existsSync(resolve(OUT, "metricas.json")) ? JSON.parse(readFileSync(resolve(OUT, "metricas.json"), "utf8")) : {};
const errors = [];
try {
  for (const quality of QUALITIES) {
    const dir = resolve(OUT, quality);
    mkdirSync(dir, { recursive: true });
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.setDefaultTimeout(300_000);
    page.on("pageerror", (e) => errors.push(`[${quality}] ${e}`));
    page.on("console", (m) => {
      if (m.type() === "error" && !/favicon/.test(m.text())) errors.push(`[${quality}] ${m.text()}`);
    });
    const t0 = Date.now();
    await page.goto(`${base}?quality=${quality}&pointerlock=0`, { waitUntil: "load" });
    await page.waitForFunction(() => document.getElementById("menu")?.classList.contains("visible"), null, { timeout: 300_000 });
    await page.click("#btn-new", { timeout: 300_000 });
    await page.waitForFunction(() => window.eva.state === "playing", null, { timeout: 300_000, polling: 500 });
    const loadS = (Date.now() - t0) / 1000;
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const g = window.eva;
      g.captureStart(30);
      g["hud"].hide();
    });
    metrics[quality] = { loadSeconds: Number(loadS.toFixed(1)), shots: {} };
    console.log(`[${quality}] jogo aberto em ${loadS.toFixed(0)} s`);
    let first = true;
    for (const [name, eye, at, feet, yaw, dusk, fov] of SHOTS.filter(([n]) => !ONLY || ONLY.split(",").includes(n))) {
      // o primeiro enquadramento depois da carga compila os pós e boa parte dos materiais: assenta mais
      const settle = first ? SETTLE * 3 : SETTLE;
      first = false;
      const info = await page.evaluate(
        ([eye, at, feet, yaw, dusk, fov, settle, timed]) => {
          const g = window.eva;
          const env = g["env"];
          env.setDusk(dusk);
          env.updateTimeOfDay(10);
          if (feet) g.teleportPlayer(feet[0], feet[1], feet[2], yaw);
          const C = g["camera"];
          const V = g.scene.activeCamera.position.constructor;
          C.setDialogueShot(new V(eye[0], eye[1], eye[2]), new V(at[0], at[1], at[2]));
          C["initialized"] = false;
          C.camera.fov = fov;
          C.fovTarget = fov;
          for (let i = 0; i < settle; i++) g.frame();
          const e = g.scene.getEngine();
          const gl = e._gl;
          gl.finish();
          const d0 = e._drawCalls.current;
          g.frame();
          const draw = e._drawCalls.current - d0;
          // mediana de quadros individuais, duas séries, fica a menor (a máquina é compartilhada e o SwiftShader ainda
          // pode estar terminando de compilar variantes de shader na primeira série)
          const series = () => {
            const times = [];
            for (let i = 0; i < timed; i++) {
              const t = performance.now();
              g.frame();
              gl.finish();
              times.push(performance.now() - t);
            }
            times.sort((a, b) => a - b);
            return times[Math.floor(times.length / 2)];
          };
          const frameMs = Math.min(series(), series());
          const snap = g.snapshot();
          return {
            draw,
            frameMs: Number(frameMs.toFixed(1)),
            activeMeshes: g.scene.getActiveMeshes().length,
            postProcesses: (g.scene.activeCamera._postProcesses ?? []).filter(Boolean).length,
            lights: snap.lightsActive,
            dusk: Number(env.duskLevel.toFixed(2)),
          };
        },
        [eye, at, feet, yaw, dusk, fov, settle, TIMED],
      );
      const dataUrl = await page.evaluate(() => window.eva.captureFrame(0.92));
      writeFileSync(resolve(dir, `${name}.jpg`), Buffer.from(dataUrl.split(",")[1], "base64"));
      metrics[quality].shots[name] = info;
      console.log(`  ${quality}/${name}: ${info.frameMs} ms/quadro · draw calls ${info.draw} · malhas ativas ${info.activeMeshes} · pós ${info.postProcesses} · luzes ${info.lights} · anoitecer ${info.dusk}`);
    }
    const shots = Object.values(metrics[quality].shots);
    metrics[quality].meanFrameMs = Number((shots.reduce((a, s) => a + s.frameMs, 0) / Math.max(1, shots.length)).toFixed(1));
    metrics[quality].meanDraw = Math.round(shots.reduce((a, s) => a + s.draw, 0) / Math.max(1, shots.length));
    console.log(`[${quality}] média: ${metrics[quality].meanFrameMs} ms/quadro · ${metrics[quality].meanDraw} draw calls`);
    await page.close();
  }
  writeFileSync(resolve(OUT, "metricas.json"), JSON.stringify(metrics, null, 2) + "\n");
  if (errors.length) console.log("erros:", errors.slice(0, 8));
  console.log(`✔ capturas em ${OUT}`);
} finally {
  await browser.close();
  close();
}
process.exit(errors.length ? 1 : 0);

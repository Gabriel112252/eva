/**
 * Teste do kit modular "três camadas" (public/assets/environments/kit_tech.glb):
 *  1. valida o GLB com o validador oficial da Khronos (0 erros);
 *  2. lê o GLB e confere, por peça: nome dentro da convenção (FACHADA_/TECH_/REMENDO_/MARCO_/PROP_),
 *     triângulos ≤ orçamento da categoria, draw calls, colisores COL_, texturas ≤ 1024 px, kit ≤ 12 MB;
 *  3. abre o visualizador (kit-tech.html) no Chromium headless, mostra cada peça e salva folhas de
 *     contato por categoria + a cena de demonstração (?demo=1) em docs/screenshots/kit_tech/.
 *
 * Uso: npm run build && node tools/kit-test.mjs [--out docs/screenshots/kit_tech] [--no-shots]
 */
import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import validator from "gltf-validator";
import { loadPlaywright, serveDist, CHROMIUM_ARGS, argValue } from "./lib/harness.mjs";

const GLB = resolve("public/assets/environments/kit_tech.glb");
const OUT = resolve(argValue("--out", "docs/screenshots/kit_tech"));
const SHOTS = !process.argv.includes("--no-shots");
const BUDGET = { FACHADA: 1500, TECH: 1500, REMENDO: 1000, MARCO: 9000, PROP: 600 };
const MAX_BYTES = 12 * 1024 * 1024;
const MAX_TEX = 1024;
mkdirSync(OUT, { recursive: true });

let failed = 0;
const check = (ok, label) => {
  console.log(`  ${ok ? "✔" : "✘"} ${label}`);
  if (!ok) failed++;
};

// --- 1. validador Khronos -------------------------------------------------------------------
const bytes = readFileSync(GLB);
const report = await validator.validateBytes(new Uint8Array(bytes), { maxIssues: 200 });
const { numErrors, numWarnings } = report.issues;
check(numErrors === 0, `validador glTF: ${numErrors} erro(s), ${numWarnings} aviso(s)`);
for (const m of report.issues.messages.filter((m) => m.severity <= 1).slice(0, 10)) console.log(`     ${m.code}: ${m.message} (${m.pointer ?? ""})`);
check(bytes.length <= MAX_BYTES, `tamanho do kit: ${(bytes.length / 1048576).toFixed(2)} MB (≤ 12 MB)`);

// --- 2. leitura do GLB: peças, triângulos, draw calls, texturas -----------------------------
const jsonLen = bytes.readUInt32LE(12);
const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLen).toString("utf8"));
const binStart = 20 + jsonLen + 8;
const trisOfMesh = (i) => gltf.meshes[i].primitives.reduce((a, p) => a + (p.indices != null ? gltf.accessors[p.indices].count / 3 : gltf.accessors[p.attributes.POSITION].count / 3), 0);
const walk = (ni, acc) => {
  const node = gltf.nodes[ni];
  const isCol = /^COL_/.test(node.name ?? "");
  if (node.mesh != null) {
    if (isCol) acc.colliders++;
    else {
      acc.tris += trisOfMesh(node.mesh);
      acc.draws += gltf.meshes[node.mesh].primitives.length;
    }
  }
  for (const c of node.children ?? []) walk(c, acc);
  return acc;
};
const pieces = [];
for (const ni of gltf.scenes[0].nodes) {
  const name = gltf.nodes[ni].name ?? `node_${ni}`;
  const acc = walk(ni, { tris: 0, draws: 0, colliders: 0 });
  pieces.push({ name, category: name.split("_")[0], tris: Math.round(acc.tris), draws: acc.draws, colliders: acc.colliders });
}
const byCat = {};
for (const p of pieces) (byCat[p.category] ??= []).push(p);
check(pieces.every((p) => /^(FACHADA|TECH|REMENDO|MARCO|PROP)_[a-z0-9_]+$/.test(p.name)), `nomes dentro da convenção (${pieces.length} peças)`);
const over = pieces.filter((p) => p.tris > (BUDGET[p.category] ?? 1e9));
check(over.length === 0, `orçamento de triângulos por categoria${over.length ? `: ${over.map((p) => `${p.name}=${p.tris}`).join(", ")}` : ""}`);
check((byCat.FACHADA?.length ?? 0) >= 12 && (byCat.PROP?.length ?? 0) >= 20 && (byCat.MARCO?.length ?? 0) >= 2 && (byCat.TECH?.length ?? 0) >= 7 && (byCat.REMENDO?.length ?? 0) >= 6, `contagem mínima: ${Object.entries(byCat).map(([k, v]) => `${k}=${v.length}`).join(" ")}`);
check(pieces.filter((p) => p.category !== "REMENDO" && p.category !== "TECH").every((p) => p.colliders > 0), "fachadas, marcos e props têm colisor COL_");

const imageSize = (img) => {
  const bv = gltf.bufferViews[img.bufferView];
  const off = binStart + (bv.byteOffset ?? 0);
  const b = bytes.subarray(off, off + bv.byteLength);
  if (b[0] === 0x89 && b[1] === 0x50) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
};
const sizes = (gltf.images ?? []).map(imageSize);
check(sizes.every((s) => s && s[0] <= MAX_TEX && s[1] <= MAX_TEX), `texturas ≤ ${MAX_TEX} px (${sizes.length} imagens, maior ${Math.max(0, ...sizes.map((s) => (s ? Math.max(s[0], s[1]) : 0)))} px)`);
const masks = (gltf.materials ?? []).filter((m) => m.alphaMode === "MASK").length;
console.log(`  · ${gltf.materials.length} materiais (${masks} alpha MASK), ${pieces.reduce((a, p) => a + p.tris, 0).toLocaleString("pt-BR")} triângulos no kit, ${pieces.reduce((a, p) => a + p.draws, 0)} draw calls somados`);
for (const [cat, list] of Object.entries(byCat)) console.log(`  · ${cat}: ${list.length} peças, ${list.reduce((a, p) => a + p.tris, 0)} tri, máx ${Math.max(...list.map((p) => p.tris))} (${list.find((p) => p.tris === Math.max(...list.map((q) => q.tris))).name})`);

// --- 3. visualizador no Chromium: folhas de contato e quarteirão de demonstração -------------
if (SHOTS) {
  const { chromium } = loadPlaywright();
  const { base, close } = await serveDist();
  const browser = await chromium.launch({ headless: true, args: CHROMIUM_ARGS });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 400, height: 280 } });
    page.setDefaultTimeout(240_000);
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error" && !/favicon/.test(m.text())) errors.push(m.text());
    });
    await page.goto(`${base}kit-tech.html`, { waitUntil: "load" });
    await page.evaluate(() => window.kit.ready);
    const viewerPieces = await page.evaluate(() => window.kit.pieces);
    check(viewerPieces.length === pieces.length, `visualizador carregou ${viewerPieces.length}/${pieces.length} peças`);
    const shots = {};
    const t0 = Date.now();
    for (const p of viewerPieces) {
      const info = await page.evaluate(async (name) => {
        const r = await window.kit.show(name);
        return { ...r, data: await window.kit.snapshot(0.82) };
      }, p.name);
      shots[p.name] = info.data;
      const gltfPiece = pieces.find((q) => q.name === p.name);
      if (gltfPiece && Math.abs(gltfPiece.tris - info.tris) > 2) check(false, `${p.name}: triângulos divergem (GLB ${gltfPiece.tris} × visualizador ${info.tris})`);
      p.size = info.size;
      if (gltfPiece) gltfPiece.size = info.size; // largura × altura × profundidade (m), eixos do Babylon
    }
    console.log(`  · ${viewerPieces.length} capturas em ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    // folhas de contato por categoria (grade HTML com as capturas)
    const sheet = await browser.newPage({ viewport: { width: 1700, height: 400 } });
    for (const [cat, list] of Object.entries(byCat)) {
      const cells = list
        .map((p) => {
          const vp = viewerPieces.find((q) => q.name === p.name);
          return `<figure><img src="${shots[p.name]}"><figcaption><b>${p.name}</b><br>${p.tris} tri · ${p.draws} dc · ${vp?.size?.join(" × ") ?? "?"} m</figcaption></figure>`;
        })
        .join("");
      await sheet.setContent(`<html><body style="margin:0;background:#15181a;color:#eee;font:12px system-ui"><h2 style="margin:10px 14px;font-size:15px">kit_tech.glb — ${cat} (${list.length} peças)</h2><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:0 10px 10px">${cells}</div><style>figure{margin:0;background:#23282b;border-radius:6px;overflow:hidden}img{width:100%;display:block}figcaption{padding:4px 6px;line-height:1.35}</style></body></html>`);
      const rows = Math.ceil(list.length / 4);
      await sheet.setViewportSize({ width: 1700, height: 60 + rows * 356 });
      await sheet.screenshot({ path: `${OUT}/folha_${cat.toLowerCase()}.jpg`, type: "jpeg", quality: 82, fullPage: true });
    }
    await sheet.close();
    // quarteirão de demonstração: vista geral e vista de rua
    const demo = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    demo.setDefaultTimeout(240_000);
    demo.on("pageerror", (e) => errors.push(String(e)));
    await demo.goto(`${base}kit-tech.html?demo=1`, { waitUntil: "load" });
    await demo.evaluate(() => window.kit.ready);
    await demo.waitForTimeout(1500);
    const active = await demo.evaluate(() => document.getElementById("status")?.textContent ?? "");
    check(/malhas ativas/.test(active), `demo montada (${active.trim()})`);
    // captura pelo próprio canvas (toDataURL): em modo sob demanda o compositor do Chromium headless não
    // apresenta quadros novos, e page.screenshot devolveria só a cor de fundo
    const saveShot = async (file, alpha, beta, scale) => {
      const data = await demo.evaluate(
        ([a, b, s]) => {
          window.kit.setView(a, b, s);
          return window.kit.snapshot(0.88);
        },
        [alpha, beta, scale],
      );
      writeFileSync(`${OUT}/${file}`, Buffer.from(data.split(",")[1], "base64"));
    };
    await saveShot("quarteirao_demo.jpg", Math.PI / 2 + 0.62, 1.22, 1.0);
    await saveShot("quarteirao_demo_rua.jpg", Math.PI / 2 - 0.5, 1.45, 0.5);
    await saveShot("quarteirao_demo_alto.jpg", Math.PI / 2 + 1.1, 0.95, 1.1);
    await demo.close();
  } finally {
    await browser.close();
    await close();
  }
  check(errors.length === 0, `sem erros de página${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`);
}

writeFileSync(`${OUT}/catalogo.json`, JSON.stringify({ bytes: bytes.length, generatedAt: new Date().toISOString(), pieces }, null, 1));
console.log(failed ? `✘ ${failed} verificação(ões) falharam` : `✔ kit_tech.glb OK (${statSync(GLB).size} bytes, ${pieces.length} peças)`);
process.exit(failed ? 1 : 0);

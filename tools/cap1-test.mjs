/**
 * Teste do Capítulo 1 no build (quadros determinísticos a 30 fps): joga M2 "Rastro do Lote", M3 "A Vigília" e
 * M4 "Partida" de ponta a ponta, encadeadas ao fim do Capítulo 0 ("Continuar explorando" → amanhecer), com
 * teleportes, `input.simulate` e diálogos avançados com escolhas — sem atalhos no diretor.
 *
 * Verifica: as três pistas montam o nome de Brandão; a entrega no prazo grava a flag; a decisão de M2 fica
 * salva; no toque, ser visto dispara a detecção e a prisão devolve ao último ponto; o encontro com Elias e o
 * documento; a fuga de Rastro pousa na rua da oficina; M4 aplica as consequências; a partida termina na tela
 * "Fim do Capítulo 1".
 *
 * Uso: npm run build && node tools/cap1-test.mjs [--shots docs/screenshots/cap1] [--dist dist]
 * (SwiftShader: ~1–2 s por quadro; o teste avança poucos quadros e espera o resto em tempo real.)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadPlaywright, serveDist, CHROMIUM_ARGS, argValue } from "./lib/harness.mjs";

const { chromium } = loadPlaywright();
const SHOTS = argValue("--shots", "");
if (SHOTS) mkdirSync(resolve(SHOTS), { recursive: true });
// --dist <pasta>: testa um build fora de dist/ (ex.: enquanto outro teste usa o dist/)
const { base, close } = await serveDist(resolve(argValue("--dist", "dist")));
const browser = await chromium.launch({ headless: true, args: CHROMIUM_ARGS });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error" && !/favicon/.test(m.text())) errors.push(m.text());
});
const t0 = Date.now();
const elapsed = () => `${((Date.now() - t0) / 1000).toFixed(0)} s`;
let failed = 0;
const check = (ok, label) => {
  console.log(`  ${ok ? "✔" : "✘"} ${label}`);
  if (!ok) failed++;
  return ok;
};

// --- utilitários ----------------------------------------------------------------------------------
const step = (n) => page.evaluate((k) => { for (let i = 0; i < k; i++) window.eva.captureFrame(0.3); }, n);
const hold = (action, down) => page.evaluate(([a, d]) => window.eva.input.simulate(a, d), [action, down]);
const press = async (action) => {
  await hold(action, true);
  await hold(action, false);
};
const snap = () => page.evaluate(() => window.eva.snapshot());
const flag = (k) => page.evaluate((key) => window.eva.flags.get(key), k);
const shot = async (name) => {
  if (!SHOTS) return;
  // SwiftShader recompila materiais quando as luzes mudam (faróis, lanternas) e o Babylon pula o que não está
  // pronto: espera a cena ficar pronta para a captura não sair com o cenário em branco
  await page.evaluate(() => { for (let i = 0; i < 12 && !window.eva.scene.isReady(); i++) window.eva.captureFrame(0.3); });
  const dataUrl = await page.evaluate(() => window.eva.captureFrame(0.85));
  writeFileSync(resolve(SHOTS, `${name}.jpg`), Buffer.from(dataUrl.split(",")[1], "base64"));
};
/** Repete até `fn` (avaliada na página) ser verdadeira, avançando `perStep` quadros e/ou esperando `waitMs`. */
async function until(fn, arg, { tries = 30, perStep = 1, waitMs = 0 } = {}) {
  for (let i = 0; i < tries; i++) {
    if (await page.evaluate(fn, arg)) return true;
    if (perStep) await step(perStep);
    if (waitMs) await page.waitForTimeout(waitMs);
  }
  return page.evaluate(fn, arg);
}
const historyLength = () => page.evaluate(() => window.eva.dialogue.history.length);
/**
 * Conduz o diálogo em curso; `choices` = respostas na ordem (1 = primeira). Devolve os nós falados (`grafo:nó`)
 * desde `from` (tamanho do histórico ANTES de a conversa começar — ela pode abrir na mesma chamada do E).
 */
async function runDialogue(choices = [], from = null) {
  if (from === null) from = await historyLength();
  let ci = 0;
  for (let i = 0; i < 400; i++) {
    await page.waitForTimeout(230);
    const st = await page.evaluate(() => ({ state: window.eva.state, pending: window.eva.hud.hasPendingChoice }));
    if (st.state !== "dialogue") break;
    if (st.pending) await press(`choice${choices[ci++] ?? 1}`);
    else await press("advance");
  }
  return page.evaluate((k) => window.eva.dialogue.history.slice(k), from);
}
/** Aproxima Matias do ator (de frente), aperta E e conduz a conversa. */
async function talk(role, choices = [], distance = 1.6) {
  const ok = await page.evaluate(([r, d]) => window.eva.approachNpc(r, d), [role, distance]);
  if (!ok) return { ok: false, prompt: "", lines: [] };
  await step(2);
  const prompt = (await snap()).prompt;
  const from = await historyLength();
  await press("interact");
  const started = await until(() => window.eva.state === "dialogue", null, { tries: 4 });
  if (!started) return { ok: false, prompt, lines: [] };
  const lines = await runDialogue(choices, from);
  await step(1);
  return { ok: true, prompt, lines };
}
const examinePos = (id) =>
  page.evaluate((i) => {
    const it = window.eva.chapter1Stage.examinables.get(i);
    if (!it) return null;
    const p = it.getPosition();
    return [p.x, p.y, p.z];
  }, id);
/** Posiciona Matias em `stand` olhando para o objeto, abre o exame com E e fecha (opcional: captura aberto). */
async function examine(id, offset, standY, shotName) {
  const p = await examinePos(id);
  if (!p) return { opened: null, prompt: "(sem objeto)" };
  const sx = p[0] + offset[0];
  const sz = p[2] + offset[1];
  const yaw = Math.atan2(p[0] - sx, p[2] - sz);
  await page.evaluate(([x, y, z, w]) => window.eva.teleportPlayer(x, y, z, w), [sx, standY, sz, yaw]);
  await step(2);
  const prompt = (await snap()).prompt;
  await press("interact");
  await step(2);
  const opened = (await snap()).examining;
  if (shotName) await shot(shotName);
  await page.waitForTimeout(200);
  await press("advance");
  await step(1);
  return { opened, prompt };
}
const vehicle = (id) =>
  page.evaluate((i) => {
    const v = window.eva.vehicles.find((x) => x.def.id === i);
    const p = v.position;
    return { x: p.x, y: p.y, z: p.z, heading: v.heading, altitude: v.hover ? v.altitude : 0 };
  }, id);
const moveVehicle = (id, x, y, z, yaw) =>
  page.evaluate(
    ([i, px, py, pz, w]) => {
      const v = window.eva.vehicles.find((q) => q.def.id === i);
      v.teleport(v.position.constructor.FromArray([px, py, pz]), w);
    },
    [id, x, y, z, yaw],
  );
const enter = (id) =>
  page.evaluate((i) => {
    const v = window.eva.vehicles.find((q) => q.def.id === i);
    const p = v.position;
    window.eva.teleportPlayer(p.x + 1.8, p.y + 0.3, p.z, -Math.PI / 2);
    window.eva.enterVehicle(v);
    return window.eva.driving?.def.id ?? null;
  }, id);
const near = (a, b, r) => Math.hypot(a.x - b[0], a.z - b[1]) <= r;

try {
  await page.goto(`${base}?quality=baixa&pointerlock=0`, { waitUntil: "load" });
  await page.waitForFunction(() => document.getElementById("menu")?.classList.contains("visible"), null, { timeout: 180000 });
  await page.click("#btn-new");
  await page.waitForFunction(() => window.eva.state === "playing");
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.eva.captureStart(30));
  let s;
  let c;

  // ======================================================== fim do Capítulo 0 → amanhecer do dia 2
  console.log(`Fim do Capítulo 0 → dia 2 (${elapsed()})`);
  await page.evaluate(() => {
    const g = window.eva;
    // como se o prólogo e "O Carregamento" tivessem sido jogados: lote registrado, Matias confia na Apuração
    g.flags.set("cartao.pego", true);
    g.flags.set("apuracao.concluida", true);
    g.flags.set("matiasTrustsSystem", true);
    g.flags.set("carregamento.decisao", "registro");
    g.quests.complete("a_apuracao");
    g.quests.start("o_carregamento");
    g.quests.complete("o_carregamento");
  });
  const endShown = await until(() => document.getElementById("mission-end")?.classList.contains("visible"), null, { tries: 20, perStep: 0, waitMs: 300 });
  check(endShown, "tela de conclusão do Capítulo 0");
  await page.click("#btn-mission-continue");
  const inM2 = await until(() => window.eva.chapter1.phase === "m2" && !window.eva.chapter1.busy, null, { tries: 30, perStep: 1, waitMs: 250 });
  s = await snap();
  c = s.chapter1;
  check(inM2 && s.quests.rastro_do_lote?.status === "active", `"Continuar explorando" → amanhece e começa M2 (fase ${c.phase})`);
  check(c.agua === 55, `consequência de M1 aplicada: água do bairro ${c.agua}/100`);
  check(near(s.feet, [-30, -10.6], 1.2), `Matias acorda na oficina (${s.feet.x.toFixed(1)}, ${s.feet.z.toFixed(1)})`);

  // ======================================================== M2 — Rastro do Lote
  console.log(`M2 — Rastro do Lote (${elapsed()})`);
  const r1 = await talk("raquel", [2], 1.4);
  check(r1.ok && r1.lines.includes("raquel:m2_m7"), `Raquel na van abre a missão (${r1.lines.length} falas; prompt "${r1.prompt}")`);
  await shot("cap1_m2_van_raquel");
  for (const [id, off] of [
    ["manifesto_van", [0, 1.15]],
    ["lacres_van", [1.15, 0]],
  ]) {
    const e = await examine(id, off, 0.25, id === "manifesto_van" ? "cap1_m2_exame_manifesto" : undefined);
    check(e.opened === id, `examinou ${id} (prompt "${e.prompt}")`);
  }
  s = await snap();
  check(s.quests.rastro_do_lote.objectives.manifesto && ["pista.manifesto_rasurado", "pista.selo_nao_bate", "pista.lacres_refeitos"].every((p) => s.clues.includes(p)), `manifesto, selo e lacres no diário (${s.clues.length} pistas)`);
  const cu = await talk("custodio");
  check(cu.lines.includes("custodio:m2_registro") && cu.lines.includes("custodio:m2_c4"), `Custódio (lote registrado) libera o depósito (${cu.lines.length} falas)`);
  await step(2);
  c = (await snap()).chapter1;
  check(!c.actors.pieces.includes("porta_deposito") && c.actors.pieces.includes("grade_fundos"), "portão do depósito aberto; a grade dos fundos continua (rota agachada)");
  check(c.actors.raquel?.visible && near(c.actors.raquel, [24.4, -15], 0.5), "Raquel voltou ao posto quando Matias se afastou da van");
  await page.evaluate(() => window.eva.teleportPlayer(33.5, 0.25, 63, 0));
  await step(3);
  s = await snap();
  check(s.quests.rastro_do_lote.objectives.deposito, "entrou no depósito (gatilho de zona)");
  await shot("cap1_m2_deposito");
  const cx = await examine("caixas_vazias", [0, -2.2], 0.25);
  const cd = await examine("caderno_saida", [0, -1.1], 0.25, "cap1_m2_caderno");
  s = await snap();
  check(cx.opened === "caixas_vazias" && cd.opened === "caderno_saida" && s.quests.rastro_do_lote.objectives.pistas, `caixas vazias e caderno de saída examinados (objetivo pistas)`);
  check(s.flags["pista.caderno_de_saida"] === true, "flag pista.caderno_de_saida (gate do comerciante)");
  const co = await talk("comerciante", [2], 2.2);
  s = await snap();
  check(co.lines.includes("comerciante:m2_testemunha") && co.lines.includes("comerciante:m2_nome") && co.lines.includes("comerciante:m2_ac2"), `comerciante testemunha e empresta o Atlas (${co.lines.length} falas; prompt "${co.prompt}")`);
  check(
    s.flags["cap1.m2.brandao_identificado"] === true && ["pista.manifesto_rasurado", "pista.caderno_de_saida", "pista.testemunha_samuel"].every((p) => s.clues.includes(p)),
    "as três pistas (S.B. + Brandão + Samuel) montam o nome: Samuel Brandão",
  );
  check((s.timers.entrega_posto?.remaining ?? 0) > 100, `prazo do meio-dia correndo (${(s.timers.entrega_posto?.remaining ?? 0).toFixed(0)} s)`);
  // Atlas: encosta na van (carga no caixote) e leva ao posto
  check((await enter("atlas_t3")) === "atlas_t3", "Matias no Atlas T-3 da banca");
  await moveVehicle("atlas_t3", -25.4, 0.35, -2.1, -Math.PI / 2);
  await step(4);
  s = await snap();
  check(s.cargo === "atlas_t3" && s.flags["cap1.m2.carga_no_atlas"] === true, "as caixas da van vão para o caixote do Atlas (carga visível)");
  await shot("cap1_m2_atlas_carga");
  await moveVehicle("atlas_t3", 24.4, 0.35, -10.2, Math.PI);
  await step(4);
  s = await snap();
  check(s.flags["cap1.m2.entrega_no_prazo"] === true && s.quests.rastro_do_lote.objectives.entrega && !s.timers.entrega_posto, "entrega no prazo: flag cap1.m2.entrega_no_prazo = true e objetivo concluído");
  const fromRaquel = await historyLength();
  await press("interact");
  await step(2);
  if ((await page.evaluate(() => window.eva.state)) !== "dialogue") await page.evaluate(() => window.eva.approachNpc("raquel", 1.6));
  const autoRaquel = await until(() => window.eva.state === "dialogue", null, { tries: 5 });
  const re = autoRaquel ? await runDialogue([], fromRaquel) : [];
  check(autoRaquel && re.includes("raquel:m2_entrega") && re.includes("raquel:m2_entrega_fim"), `Raquel puxa a conversa da entrega (${re.length} falas)`);
  const bReady = await until(() => window.eva.chapter1Stage.actorReady("brandao"), null, { tries: 40, perStep: 1, waitMs: 400 });
  await step(6);
  c = (await snap()).chapter1;
  check(bReady && c.actors.brandao?.visible, `Samuel Brandão atravessa a praça (andando: ${c.actors.brandao?.walking})`);
  await shot("cap1_m2_brandao");
  const br = await talk("brandao", [1]);
  s = await snap();
  check(br.lines.includes("brandao:m2_r12") && br.lines.includes("brandao:m2_denuncia_b") && br.lines.includes("brandao:m2_denuncia_fim"), `conversa com Brandão e escolha (${br.lines.length} falas; prompt "${br.prompt}")`);
  check(s.flags["cap1.m2.decisao"] === "denuncia" && s.flags["cap1.m2.brandao_preso"] === true, "decisão de M2 gravada: denúncia (lote registrado → Brandão preso)");
  await step(2);
  s = await snap();
  check(s.chapter1.phase === "m3_tarde" && s.quests.rastro_do_lote.status === "completed" && s.quests.a_vigilia?.status === "active", `M2 concluída → fim de tarde, M3 ativa (fase ${s.chapter1.phase})`);

  // ======================================================== M3 — A Vigília
  console.log(`M3 — A Vigília (${elapsed()})`);
  const fromRadio = await historyLength();
  await page.evaluate(() => window.eva.teleportPlayer(-30, 0.25, -10.4, 0));
  await step(2);
  const radio = await until(() => window.eva.state === "dialogue", null, { tries: 30, perStep: 1, waitMs: 250 });
  const rl = radio ? await runDialogue([], fromRadio) : [];
  s = await snap();
  check(radio && rl.includes("radio_elias:m3_e2b") && rl.includes("radio_elias:m3_m5"), `recado de Elias pelo rádio da oficina (${rl.length} falas, variante do lote registrado)`);
  check(s.quests.a_vigilia.objectives.recado && s.timers.toque_recolher && s.flags["cap1.m3.entardecer"] === true, "recado ouvido; contagem para o toque de recolher");
  const rastroDoca = await vehicle("rastro_av4");
  check(near(rastroDoca, [-6, -29], 2.5) && rastroDoca.y > 6, `a Rastro AV-4 está na doca do telhado da escola (${rastroDoca.x.toFixed(1)}, ${rastroDoca.y.toFixed(1)}, ${rastroDoca.z.toFixed(1)})`);
  await page.evaluate(() => window.eva.timers.add("toque_recolher", -999));
  await step(2);
  const patrolsUp = await until(() => window.eva.enemies.enemies.length >= 3, null, { tries: 50, perStep: 1, waitMs: 300 });
  s = await snap();
  check(s.chapter1.phase === "m3_toque" && s.curfew === true && patrolsUp, `toque de recolher: ${s.enemies?.total} Custódios de ronda (postura ${s.chapter1.patrulha})`);
  // ser visto: de pé, a 1,8 m de um Custódio da ronda
  const guard = await page.evaluate(() => {
    const e = window.eva.enemies.enemies.find((x) => x.alive && x.role === "custodio");
    const p = e.feet;
    return [p.x, p.z];
  });
  await page.evaluate(([x, z]) => window.eva.teleportPlayer(x + 1.8, 0.25, z, -Math.PI / 2), guard);
  let detected = false;
  const seen = new Set();
  for (let i = 0; i < 40 && !detected; i++) {
    await step(3);
    s = await snap();
    for (const e of s.awareness?.perEnemy ?? []) seen.add(e.state);
    detected = s.flags["cap1.m3.detectado"] === true;
  }
  check(detected && s.triggers.some((t) => t.kind === "detectado"), `visto no toque → detecção grava cap1.m3.detectado (estados: ${[...seen].join(", ")})`);
  await shot("cap1_m3_detectado");
  // a perseguição alcança Matias → preso → último ponto
  let caught = false;
  for (let i = 0; i < 30 && !caught; i++) {
    await step(3);
    caught = (await flag("cap1.m3.preso")) === 1;
  }
  if (!caught) {
    console.log("  (Custódio não alcançou Matias em 3 s de jogo: dispara onCaught do gerenciador de inimigos)");
    await page.evaluate(() => window.eva.enemies.onCaught.emit(window.eva.enemies.enemies[0]));
  }
  await until(() => !window.eva.chapter1.busy && window.eva.flags.get("cap1.m3.preso") === 1, null, { tries: 15, perStep: 1, waitMs: 300 });
  s = await snap();
  check(near(s.feet, [-30, -3.6], 1.5) && s.flags["cap1.m3.preso"] === 1, `preso → volta ao último ponto (rua da oficina) com aviso (${caught ? "perseguição real" : "evento simulado"})`);
  // quadra: Elias e o documento de 2056
  await page.evaluate(() => window.eva.teleportPlayer(-26, 0.25, -27, 0));
  await step(3);
  s = await snap();
  check(s.quests.a_vigilia.objectives.toque && s.quests.a_vigilia.objectives.quadra, "chegou à quadra escolar (objetivos toque e quadra)");
  const eReady = await until(() => window.eva.chapter1Stage.actorReady("elias"), null, { tries: 30, perStep: 1, waitMs: 300 });
  const e1 = eReady ? await talk("elias") : { ok: false, lines: [], prompt: "" };
  check(e1.lines.includes("elias:m3_inicio") && e1.lines.includes("elias:m3_e5"), `encontro com Elias Nobre (${e1.lines.length} falas; prompt "${e1.prompt}")`);
  await shot("cap1_m3_elias");
  const doc = await examine("documento_2056", [0, -1.2], 0.25, "cap1_m3_documento");
  s = await snap();
  check(doc.opened === "documento_2056" && s.clues.includes("pista.assinatura_2056") && s.quests.a_vigilia.objectives.documento, "examinou a última folha de 2056 (pista e objetivo)");
  const e2 = await talk("elias", [1]);
  check(e2.lines.includes("elias:m3_depois") && e2.lines.includes("elias:m3_e10") && e2.lines.includes("elias:m3_e18"), `Elias fala de Íris Serra e da Rastro, e sai (${e2.lines.length} falas)`);
  await step(3);
  s = await snap();
  check(s.chapter1.phase === "m3_fuga" && s.flags["cap1.m3.elias_partiu"] === true, `lanternas no portão: fase ${s.chapter1.phase}`);
  // telhado, etiqueta e voo
  await page.evaluate(() => window.eva.teleportPlayer(-2.5, 7.3, -26.5, -Math.PI / 2));
  await step(4);
  s = await snap();
  check(s.quests.a_vigilia.objectives.telhado, "subiu ao telhado da escola (objetivo telhado)");
  const ras = await vehicle("rastro_av4");
  const et = await examine("rastro_etiqueta", [1.3, 0], 7.3);
  check(et.opened === "rastro_etiqueta" && (await snap()).clues.includes("pista.rastro_na_escola"), `etiqueta de manutenção da Rastro (prompt "${et.prompt}")`);
  await shot("cap1_m3_telhado_rastro");
  check((await enter("rastro_av4")) === "rastro_av4", `Matias na Rastro (doca em ${ras.x.toFixed(1)}, ${ras.y.toFixed(1)}, ${ras.z.toFixed(1)})`);
  const alt0 = (await vehicle("rastro_av4")).y;
  await hold("advance", true);
  await step(24);
  await hold("advance", false);
  const alt1 = (await vehicle("rastro_av4")).y;
  check(alt1 > alt0 + 0.8, `decolou do telhado (y ${alt0.toFixed(1)} → ${alt1.toFixed(1)})`);
  // voo baixo até a rua da oficina (teleporte encurta os ~40 m de voo)
  await moveVehicle("rastro_av4", -26.5, 4, 1.2, -Math.PI / 2);
  await step(3);
  s = await snap();
  check(s.quests.a_vigilia.objectives.voo && s.flags["cap1.m3.pousou"] === true, "voo até a oficina (objetivo voo)");
  await shot("cap1_m3_voo_oficina");
  await moveVehicle("rastro_av4", -26.5, 0.8, 1.2, -Math.PI / 2); // na rua, ao lado da van (a van está em −31, −2)
  await step(12);
  const landed = await vehicle("rastro_av4");
  const fromAna = await historyLength();
  await press("interact");
  await step(2);
  s = await snap();
  check(s.driving === null && landed.altitude < 3 && near(landed, [-30, -2.5], 6), `pousou na rua da oficina e desceu (altitude ${landed.altitude.toFixed(1)} m)`);
  if (s.state !== "dialogue") await page.evaluate(() => window.eva.approachNpc("ana", 1.6));
  const anaTalk = await until(() => window.eva.state === "dialogue", null, { tries: 5 });
  const al = anaTalk ? await runDialogue([1, 1], fromAna) : [];
  s = await snap();
  check(anaTalk && al.includes("ana:m3_inicio") && al.includes("ana:m3_a9a") && al.includes("ana:m3_a11a"), `Ana acordou com o barulho e puxa a conversa (${al.length} falas)`);
  check(s.flags["cap1.m3.documento"] === "miriam" && s.flags["cap1.m3.ana_sabe"] === true && s.clues.includes("pista.toque_pedido_pelo_deposito"), "decisão do documento gravada: mostrar a Miriam (Ana sabe da folha)");

  // ======================================================== M4 — Partida
  console.log(`M4 — Partida (${elapsed()})`);
  const inM4 = await until(() => window.eva.chapter1.phase === "m4" && !window.eva.chapter1.busy, null, { tries: 30, perStep: 1, waitMs: 300 });
  s = await snap();
  c = s.chapter1;
  check(inM4 && s.quests.a_vigilia.status === "completed" && s.quests.partida?.status === "active" && s.curfew === false, `amanhece o dia 3: M3 concluída, M4 ativa (fase ${c.phase})`);
  check(c.agua === 60 && c.estoque === 6 && c.preco === 1.5 && c.patrulha === "tensa", `consequências: água ${c.agua}/100, caixas ${c.estoque}/6, preço ×${c.preco}, patrulha ${c.patrulha}`);
  check(c.consequencias?.presenca?.brandao === true && c.actors.brandao?.visible && near(c.actors.brandao, [38.4, 13.8], 0.6), "Brandão algemado no portão da Central (presença por regra)");
  check(c.actors.miriam?.visible && near(c.actors.miriam, [-27, -3], 0.6), "Miriam espera diante da oficina");
  await page.evaluate(() => window.eva.teleportPlayer(-30, 0.25, -4.6, 0));
  await step(2);
  s = await snap();
  check(s.quests.partida.objectives.amanhecer, "saiu para a rua ao amanhecer (objetivo amanhecer)");
  await shot("cap1_m4_amanhecer");
  const mi = await talk("miriam", [1]);
  check(mi.lines.includes("miriam:m4_doc") && mi.lines.includes("miriam:m4_dmi7a") && mi.lines.includes("miriam:m4_fim"), `Miriam lê a folha e cita o quarto dogma (${mi.lines.length} falas)`);
  const cm = await talk("custodio");
  check(cm.lines.includes("custodio:m4_preso") && cm.lines.includes("custodio:m4_detectado_extra") && cm.lines.includes("custodio:m4_fim"), `Custódio no portão: Brandão preso + "alguém andou depois do toque" (${cm.lines.length} falas)`);
  const bm = await talk("brandao");
  check(bm.lines.includes("brandao:m4_preso") && bm.lines.includes("brandao:m4_pb2"), `Brandão algemado fala (${bm.lines.length} falas)`);
  const rm = await talk("raquel");
  check(rm.lines.includes("raquel:m4_inicio") && rm.lines.includes("raquel:m4_r2") && rm.lines.includes("raquel:m4_r5"), `Raquel: soro pra dez dias, duas caixas de Brandão voltaram (${rm.lines.length} falas)`);
  const am = await talk("ana", [1]);
  s = await snap();
  check(am.lines.includes("ana:m4_decide") && am.lines.includes("ana:m4_vai3") && s.flags["cap1.m4.ana"] === "vai", `Ana decide por ela mesma: vai (${s.flags["cap1.m4.ana_pontos"]} pontos de confiança)`);
  check(["miriam", "custodio", "raquel", "ana"].every((o) => s.quests.partida.objectives[o]), "Miriam, Custódio, Raquel e Ana: objetivos de M4 concluídos");
  check((await enter("modulo_v7")) === "modulo_v7", "Matias na Módulo V-7");
  const pass = await until(() => window.eva.chapter1Stage.passenger !== null, null, { tries: 25, perStep: 1, waitMs: 300 });
  check(pass, "Ana no banco do passageiro");
  await moveVehicle("modulo_v7", 66.5, 0.4, 64.5, 0);
  await step(4);
  s = await snap();
  check(s.chapter1.phase === "m4_partida" || s.chapter1.phase === "fim", `limite do setor → cena de partida (fase ${s.chapter1.phase})`);
  await step(6);
  await shot("cap1_m4_partida");
  const endCh1 = await until(() => document.getElementById("mission-end")?.classList.contains("visible") && document.getElementById("mission-end-kicker")?.textContent === "Fim do Capítulo 1", null, { tries: 20, perStep: 1, waitMs: 300 });
  s = await snap();
  const endText = await page.evaluate(() => ({ title: document.getElementById("mission-end-title")?.textContent, stats: document.getElementById("mission-end-stats")?.textContent }));
  check(endCh1 && s.chapter1.phase === "fim" && s.quests.partida.status === "completed", `tela "Fim do Capítulo 1" — ${endText.title}`);
  check(/vai com Matias/.test(endText.stats ?? "") && /denunciado — preso/.test(endText.stats ?? ""), "resumo das escolhas na tela final");
  await page.click("#btn-mission-continue");
  await step(2);
  s = await snap();
  check(s.state === "playing", "continuar explorando depois do capítulo");
  console.log(`  (capítulo inteiro em ${elapsed()})`);
  await page.evaluate(() => window.eva.captureStop());
} catch (err) {
  console.error(err);
  failed++;
} finally {
  await browser.close();
  await close();
}
if (errors.length) {
  console.error("Erros no console:", errors.slice(0, 8));
  failed++;
}
console.log(failed ? `✘ ${failed} verificação(ões) falharam` : "✔ Capítulo 1 OK");
process.exit(failed ? 1 : 0);

import { describe, expect, it } from "vitest";
import { GameFlags, evalCondition, type FlagValue } from "@/narrative/flags";
import { QuestLog } from "@/narrative/quests";
import { ClueLog } from "@/narrative/clues";
import { MissionTimers } from "@/narrative/timers";
import { MissionScript } from "@/narrative/missionScript";
import { DialogueRunner, type DialogueGraph } from "@/narrative/dialogue";
import { QUESTS, QUEST_APURACAO, QUEST_CARREGAMENTO } from "@/data/quests";
import { CLUES } from "@/data/clues";
import { CAP1_FLAGS, QUEST_A_VIGILIA, QUEST_PARTIDA, QUEST_RASTRO_DO_LOTE } from "@/data/cap1Contracts";
import { CAP1_AUX_FLAGS, DIALOGUES, DIALOGUE_RADIO_ELIAS, SPEAKER_NAMES } from "@/data/dialogues";
import { CHAPTER1_CAST, PROVISIONAL_CAST, speakerVoice, CHARACTERS } from "@/data/characters";
import {
  CAP1_POINTS,
  CAP1_SPOTS,
  CAP1_STAGE_FLAGS as D,
  Chapter1Director,
  M3_PATROLS,
  PARTIDA_CAMERA_AREA,
  TIMER_ENTREGA,
  TIMER_TOQUE,
  departureShot,
  deriveChapter1Phase,
  npcLayout,
  resolveConsequences,
  type AutoDrive,
  type Cap1Actor,
  type Chapter1Host,
  type PatrolSpec,
  type Placement,
  type PropKind,
  type Vec3,
} from "@/narrative/chapter1Director";
import type { ExaminableSpec } from "@/interaction/examinable";

const F = CAP1_FLAGS;
const X = CAP1_AUX_FLAGS;

// --- dublê do jogo ------------------------------------------------------------------------------
class FakeHost implements Chapter1Host {
  flags = new GameFlags();
  quests = new QuestLog(QUESTS);
  clues = new ClueLog(CLUES);
  timers = new MissionTimers();
  script = new MissionScript();
  feet: Vec3 = { x: -30, y: 0.2, z: -10 };
  driving: string | null = null;
  playing = true;
  vehicles = new Map<string, Placement>([
    ["modulo_v7", { x: 26, y: 0.12, z: 13, yaw: 0 }],
    ["atlas_t3", { x: -5.5, y: 0, z: 2.9, yaw: 0 }],
    ["rastro_av4", { x: 43.2, y: 0.12, z: 9.8, yaw: 0 }],
    ["javali_vb4", { x: 40.5, y: 0.12, z: -12.5, yaw: 0 }],
  ]);
  npcs = new Map<string, Placement | null>();
  walking = new Map<string, Placement>();
  examinables = new Map<string, ExaminableSpec>();
  props = new Set<string>();
  patrols: PatrolSpec[] = [];
  notices: string[] = [];
  talked: string[] = [];
  radios: DialogueGraph[] = [];
  curfew = false;
  dusk = 0;
  cargo: string | null = null;
  dropped: Vec3 | null = null;
  passenger: string | null = null;
  autoDrive: AutoDrive | null = null;
  cinematic = false;
  letterbox = false;
  black = false;
  checkpoints = 0;
  ended: { title: string; text: string; stats: Array<[string, string]> } | null = null;

  constructor() {
    // como o Game: pista nova → flag `pista.<slug>` + gatilho
    this.clues.onAdded.on((c) => {
      this.flags.set(c.id, true);
      this.script.fire({ kind: "pista", id: c.id });
    });
    this.timers.onExpired.on((t) => this.script.fire({ kind: "timer", id: t.id, segundos: t.total }));
  }
  notice(text: string): void {
    this.notices.push(text);
  }
  fade(black: boolean): void {
    this.black = black;
  }
  wait(): Promise<void> {
    return Promise.resolve();
  }
  setDusk(level: number): void {
    this.dusk = level;
  }
  setCurfew(on: boolean): void {
    this.curfew = on;
  }
  setLetterbox(on: boolean): void {
    this.letterbox = on;
  }
  checkpoint(): void {
    this.checkpoints++;
  }
  sting(): void {}
  isPlaying(): boolean {
    return this.playing;
  }
  playerFeet(): Vec3 {
    return this.feet;
  }
  teleportPlayer(p: Vec3): void {
    this.feet = { x: p.x, y: p.y, z: p.z };
    this.driving = null;
  }
  drivingId(): string | null {
    return this.driving;
  }
  exitVehicle(): void {
    this.driving = null;
  }
  vehiclePlacement(id: string): Placement | null {
    return this.vehicles.get(id) ?? null;
  }
  placeVehicle(id: string, p: Placement): void {
    this.vehicles.set(id, { ...p });
  }
  setCargo(id: string | null): void {
    this.cargo = id;
  }
  dropCargo(at: Vec3): void {
    this.cargo = null;
    this.dropped = at;
  }
  setPassenger(_v: string, role: "ana" | null): void {
    this.passenger = role;
  }
  setAutoDrive(c: AutoDrive | null): void {
    this.autoDrive = c;
  }
  setCinematicShot(from: Vec3 | null): void {
    this.cinematic = from !== null;
  }
  spawnPlacement(role: Cap1Actor): Placement | null {
    return { x: 100, y: 0, z: 100, yaw: role.length };
  }
  placeNpc(role: Cap1Actor, p: Placement): void {
    this.walking.delete(role);
    this.npcs.set(role, p);
  }
  hideNpc(role: Cap1Actor): void {
    this.walking.delete(role);
    this.npcs.set(role, null);
  }
  walkNpc(role: Cap1Actor, to: Placement, _speed: number, hideAtEnd = false): void {
    this.walking.set(role, to);
    if (hideAtEnd) this.npcs.set(role, null);
  }
  stopWalk(role: Cap1Actor): void {
    this.walking.delete(role);
  }
  npcPosition(role: Cap1Actor): Vec3 | null {
    return this.npcs.get(role) ?? null;
  }
  talkTo(role: Cap1Actor): boolean {
    this.talked.push(role);
    return true;
  }
  startRadio(graph: DialogueGraph): void {
    this.radios.push(graph);
  }
  addExaminable(spec: ExaminableSpec): void {
    this.examinables.set(spec.id, spec);
  }
  removeExaminable(id: string): void {
    this.examinables.delete(id);
  }
  addProp(id: string, _k: PropKind): void {
    this.props.add(id);
  }
  addBarrier(id: string): void {
    this.props.add(id);
  }
  removeProp(id: string): void {
    this.props.delete(id);
  }
  clearStage(): void {
    this.examinables.clear();
    this.props.clear();
  }
  spawnPatrol(spec: PatrolSpec): void {
    this.patrols.push(spec);
  }
  clearPatrols(): void {
    this.patrols = [];
  }
  showChapterEnd(title: string, text: string, stats: Array<[string, string]>): void {
    this.ended = { title, text, stats };
  }
}

/** Primeiro nó efetivamente falado (o executor pula nós cuja condição falha). */
function effectiveStart(graph: DialogueGraph, flags: GameFlags): string | null {
  let node = new DialogueRunner(flags, SPEAKER_NAMES).resolveStart(graph);
  for (let guard = 0; node && guard < 20; guard++) {
    const line = graph.lines[node];
    if (!line) return null;
    if (evalCondition(line.condition, flags)) return node;
    node = line.elseNext ?? line.next ?? null;
  }
  return node;
}

function flagsWith(entries: Record<string, FlagValue | undefined>): GameFlags {
  const f = new GameFlags();
  for (const [k, v] of Object.entries(entries)) if (v !== undefined) f.set(k, v);
  return f;
}

/** Prólogo + M1 concluídos, como no fim do Capítulo 0. */
function endOfChapter0(host: FakeHost, decisao: "registro" | "silencio" = "registro", confia = true): void {
  host.flags.set(F.carregamentoDecisao, decisao);
  host.flags.set(F.matiasConfia, confia);
  host.quests.start(QUEST_APURACAO);
  host.quests.complete(QUEST_APURACAO);
  host.quests.start(QUEST_CARREGAMENTO);
  host.quests.complete(QUEST_CARREGAMENTO);
}

// --- tabela de consequências ----------------------------------------------------------------------
describe("Capítulo 1 — resolução da tabela de consequências", () => {
  it("M2: o lote registrado ajuda (água +5, patrulha cordial); silenciado custa um dia de água", () => {
    const reg = resolveConsequences(flagsWith({ [F.carregamentoDecisao]: "registro", [F.matiasConfia]: true }), QUEST_RASTRO_DO_LOTE);
    expect(reg).toMatchObject({ agua: 5, patrulha: "cordial", preco: 1, estoque: 0 });
    expect(reg.falas).toEqual({ custodio: "m2_registro", ana: "m2_manha" });
    expect(reg.avisos).toHaveLength(1);
    const sil = resolveConsequences(flagsWith({ [F.carregamentoDecisao]: "silencio", [F.matiasConfia]: false }), QUEST_RASTRO_DO_LOTE);
    expect(sil).toMatchObject({ agua: -10, patrulha: "tensa" });
    expect(sil.falas).toEqual({ custodio: "m2_silencio", ana: "m2_manha_b" });
  });

  it("M4: deltas somam, preços multiplicam, patrulha é a mais severa, presença por regra", () => {
    const melhor = resolveConsequences(
      flagsWith({ [F.carregamentoDecisao]: "registro", [F.m2Decisao]: "denuncia", [X.brandaoPreso]: true, [F.entregaNoPrazo]: true, [F.detectado]: true, [F.documento]: "miriam" }),
      QUEST_PARTIDA,
    );
    expect(melhor).toMatchObject({ agua: 5, estoque: 3, preco: 1.5, patrulha: "tensa" });
    expect(melhor.presenca).toEqual({ brandao: true, miriam: true });
    expect(melhor.falas).toMatchObject({ custodio: "m4_preso", brandao: "m4_preso", comerciante: "m4_denuncia", raquel: "m4_inicio", miriam: "m4_doc" });
    const pior = resolveConsequences(
      flagsWith({ [F.carregamentoDecisao]: "silencio", [F.m2Decisao]: "silencio", [F.entregaNoPrazo]: false, [F.custodiosHostis]: true, [F.detectado]: true, [F.documento]: "guardou" }),
      QUEST_PARTIDA,
    );
    expect(pior).toMatchObject({ agua: -5, estoque: -1, preco: 1.25, patrulha: "hostil" });
    expect(pior.presenca).toEqual({ brandao: false, miriam: true });
    expect(pior.falas).toMatchObject({ custodio: "m4_hostil", comerciante: "m4_hostis", raquel: "m4_inicio_tarde", miriam: "m4_semdoc" });
    expect(pior.avisos.length).toBeGreaterThanOrEqual(5);
  });

  it("a fala da tabela é sempre o primeiro nó que o grafo fala (M2 ao amanhecer, M3 após o rádio, M4 ao amanhecer)", () => {
    let combos = 0;
    for (const m1 of ["registro", "silencio"] as const)
      for (const confia of [true, false]) {
        const m2flags = flagsWith({ [F.carregamentoDecisao]: m1, [F.matiasConfia]: confia });
        for (const [npc, node] of Object.entries(resolveConsequences(m2flags, QUEST_RASTRO_DO_LOTE).falas)) expect(effectiveStart(DIALOGUES[npc]!, m2flags), `M2 ${m1} ${npc}`).toBe(node);
        for (const m2 of ["denuncia", "silencio"] as const)
          for (const prazo of [true, false])
            for (const detectado of [true, undefined])
              for (const hostis of [true, undefined])
                for (const doc of ["miriam", "guardou"] as const) {
                  const base = {
                    [F.carregamentoDecisao]: m1,
                    [F.matiasConfia]: confia,
                    [F.m2Decisao]: m2,
                    [F.entregaNoPrazo]: prazo,
                    [X.brandaoPreso]: m2 === "denuncia" && m1 === "registro" ? true : undefined,
                    [X.brandaoSolto]: m2 === "denuncia" && m1 === "silencio" ? true : undefined,
                  };
                  const m3 = flagsWith({ ...base, [X.recadoOuvido]: true });
                  for (const [npc, node] of Object.entries(resolveConsequences(m3, QUEST_A_VIGILIA).falas)) expect(effectiveStart(DIALOGUES[npc]!, m3), `M3 ${npc}`).toBe(node);
                  const m4 = flagsWith({ ...base, [X.recadoOuvido]: true, [F.detectado]: detectado, [F.custodiosHostis]: hostis, [F.documento]: doc });
                  const r = resolveConsequences(m4, QUEST_PARTIDA);
                  for (const [npc, node] of Object.entries(r.falas)) expect(effectiveStart(DIALOGUES[npc]!, m4), `M4 ${JSON.stringify(base)} det=${detectado} hostis=${hostis} ${npc}`).toBe(node);
                  combos++;
                }
      }
    expect(combos).toBe(128);
  });
});

// --- fase, elenco e posições ----------------------------------------------------------------------
describe("Capítulo 1 — fase e posições a partir do estado salvo", () => {
  it("deriva a fase de flags e missões", () => {
    const h = new FakeHost();
    expect(deriveChapter1Phase(h.flags, h.quests)).toBe("inativo");
    endOfChapter0(h);
    expect(deriveChapter1Phase(h.flags, h.quests)).toBe("m1_fim");
    h.flags.set(D.dia2, true);
    expect(deriveChapter1Phase(h.flags, h.quests)).toBe("m2");
    h.quests.start(QUEST_RASTRO_DO_LOTE);
    h.quests.complete(QUEST_RASTRO_DO_LOTE);
    expect(deriveChapter1Phase(h.flags, h.quests)).toBe("m3_tarde");
    h.quests.start(QUEST_A_VIGILIA);
    h.flags.set(D.toque, true);
    expect(deriveChapter1Phase(h.flags, h.quests)).toBe("m3_toque");
    h.flags.set(X.eliasPartiu, true);
    expect(deriveChapter1Phase(h.flags, h.quests)).toBe("m3_fuga");
    h.quests.complete(QUEST_A_VIGILIA);
    expect(deriveChapter1Phase(h.flags, h.quests)).toBe("m4");
    h.flags.set(D.fim, true);
    expect(deriveChapter1Phase(h.flags, h.quests)).toBe("fim");
  });

  it("posiciona os atores por fase: Raquel na van e depois no posto; toque esvazia a rua; Brandão por regra em M4", () => {
    let f = flagsWith({ [F.carregamentoDecisao]: "registro" });
    expect(npcLayout("m2", f).raquel).toEqual(CAP1_SPOTS.raquelVan);
    f.set(X.vanConferida, true);
    expect(npcLayout("m2", f).raquel).toEqual(CAP1_SPOTS.raquelPosto);
    expect(npcLayout("m2", f).brandao).toBeNull();
    f.set(X.entregaConversada, true);
    expect(npcLayout("m2", f).brandao).toEqual(CAP1_SPOTS.brandaoPosto);
    const toque = npcLayout("m3_toque", f);
    expect([toque.raquel, toque.comerciante, toque.miriam]).toEqual([null, null, null]);
    expect(toque.elias).toEqual(CAP1_SPOTS.eliasQuadra);
    expect(toque.ana).toEqual(CAP1_SPOTS.anaOficina);
    f = flagsWith({ [F.carregamentoDecisao]: "registro", [F.m2Decisao]: "denuncia", [X.brandaoPreso]: true, [F.documento]: "guardou" });
    expect(npcLayout("m4", f).brandao).toEqual(CAP1_SPOTS.brandaoPreso);
    expect(npcLayout("m4", f).miriam).toEqual(CAP1_SPOTS.miriamOficina);
    f = flagsWith({ [F.carregamentoDecisao]: "silencio", [F.m2Decisao]: "denuncia", [X.brandaoSolto]: true, [F.documento]: "miriam" });
    expect(npcLayout("m4", f).brandao).toEqual(CAP1_SPOTS.brandaoDeposito);
    f = flagsWith({ [F.m2Decisao]: "silencio", [F.documento]: "miriam", [F.ana]: "fica", [D.embarcou]: true });
    expect(npcLayout("m4", f).brandao).toBeNull();
    expect(npcLayout("m4", f).ana).toEqual(CAP1_SPOTS.anaPortaPosto);
    f.set(F.ana, "vai");
    expect(npcLayout("m4", f).ana).toBeNull(); // no banco do passageiro
  });

  it("elenco do capítulo: Brandão e Elias usam os próprios GLBs, nenhum papel emprestado, voz própria", () => {
    expect(Object.keys(PROVISIONAL_CAST)).toHaveLength(0);
    for (const info of Object.values(CHAPTER1_CAST)) {
      expect(info.model).toBe(info.role);
      expect(CHARACTERS[info.model]).toBeDefined();
      expect(SPEAKER_NAMES[info.role]).toBe(info.displayName);
      expect(speakerVoice(info.role)).toEqual(info.voice);
      expect(speakerVoice(info.role)).not.toEqual(CHARACTERS.matias.voice);
    }
    expect(speakerVoice("radio")).toEqual(CHARACTERS.matias.voice);
  });

  it("câmera da partida: atrás e à esquerda da van, presa ao asfalto da avenida", () => {
    const norte = departureShot({ x: 66.5, y: 0.1, z: 62, yaw: 0 });
    expect(norte.x).toBeCloseTo(63.7, 5);
    expect(norte.z).toBeCloseTo(54.5, 5);
    expect(norte.y).toBeCloseTo(2.4, 5);
    // van já junto da cancela, virada para leste: o ponto não passa da guarita nem sai da avenida
    const leste = departureShot({ x: 80, y: 0, z: 76, yaw: Math.PI / 2 });
    expect(leste.x).toBeCloseTo(72.5, 5);
    expect(leste.z).toBe(PARTIDA_CAMERA_AREA.z1);
    const oeste = departureShot({ x: 63, y: 0, z: 50, yaw: Math.PI / 2 });
    expect(oeste.x).toBe(PARTIDA_CAMERA_AREA.x0);
  });
});

// --- diretor de ponta a ponta -----------------------------------------------------------------
describe("Capítulo 1 — diretor de ponta a ponta (M2 → M3 → M4)", () => {
  const settle = async (d: Chapter1Director, h: FakeHost, frames = 2) => {
    for (let i = 0; i < frames; i++) {
      d.update(0.05, h.playing);
      await d.idle();
    }
  };

  it("joga o capítulo inteiro reagindo aos gatilhos e aplica as consequências em cada amanhecer", async () => {
    const h = new FakeHost();
    const d = new Chapter1Director(h);
    endOfChapter0(h, "registro", true);
    await settle(d, h);
    expect(d.phase).toBe("m1_fim");

    // ---------------- M2: amanhecer
    d.onMissionContinue();
    await d.idle();
    expect(d.phase).toBe("m2");
    expect(h.quests.isActive(QUEST_RASTRO_DO_LOTE)).toBe(true);
    expect(h.flags.get(D.agua)).toBe(55);
    expect(h.vehicles.get("modulo_v7")).toMatchObject({ x: CAP1_POINTS.vanOficina.x, z: CAP1_POINTS.vanOficina.z });
    expect(h.npcs.get("raquel")).toEqual(CAP1_SPOTS.raquelVan);
    expect(h.feet).toMatchObject({ x: CAP1_POINTS.oficinaDentro.x, z: CAP1_POINTS.oficinaDentro.z });
    expect(h.props.has("porta_deposito") && h.props.has("grade_fundos")).toBe(true);
    // Raquel abre a missão: manifesto e lacres ficam examináveis
    h.flags.set(X.vanConferida, true);
    h.script.fire({ kind: "dialogo", npc: "raquel", no: "m2_m7" });
    expect(h.examinables.has("manifesto_van") && h.examinables.has("lacres_van")).toBe(true);
    h.clues.add("pista.manifesto_rasurado");
    h.script.fire({ kind: "examinar", objeto: "manifesto_van" });
    expect(h.clues.has("pista.selo_nao_bate")).toBe(true);
    h.clues.add("pista.lacres_refeitos");
    expect(h.quests.isObjectiveDone(QUEST_RASTRO_DO_LOTE, "manifesto")).toBe(true);
    // Raquel volta ao posto quando Matias se afasta
    h.feet = { x: 30, y: 0, z: 15 };
    await settle(d, h);
    expect(h.npcs.get("raquel")).toEqual(CAP1_SPOTS.raquelPosto);
    // Custódio (registro) abre o depósito; zona e pistas do depósito
    h.flags.set(X.depositoLiberado, true);
    await settle(d, h);
    expect(h.props.has("porta_deposito")).toBe(false);
    h.script.fire({ kind: "zona", id: "deposito" });
    expect(h.quests.isObjectiveDone(QUEST_RASTRO_DO_LOTE, "deposito")).toBe(true);
    h.clues.add("pista.caixas_vazias");
    h.clues.add("pista.caderno_de_saida");
    expect(h.quests.isObjectiveDone(QUEST_RASTRO_DO_LOTE, "pistas")).toBe(true);
    // comerciante: testemunha monta o nome; empresta o Atlas e o prazo começa
    h.flags.set(F.brandaoIdentificado, true);
    h.quests.completeObjective(QUEST_RASTRO_DO_LOTE, "testemunha");
    h.script.fire({ kind: "dialogo", npc: "comerciante", no: "m2_nome" });
    expect(h.clues.hasAll(["pista.manifesto_rasurado", "pista.caderno_de_saida", "pista.testemunha_samuel"])).toBe(true);
    h.flags.set(X.atlasEmprestado, true);
    h.script.fire({ kind: "dialogo", npc: "comerciante", no: "m2_ac2" });
    expect(h.timers.has(TIMER_ENTREGA)).toBe(true);
    // no Atlas, encosta na van: carga no caixote; chega ao posto no prazo
    h.driving = "atlas_t3";
    h.vehicles.set("atlas_t3", { x: -27, y: 0, z: -2, yaw: 0 });
    await settle(d, h);
    expect(h.flags.getBool(D.cargaNoAtlas) && h.cargo === "atlas_t3").toBe(true);
    h.timers.update(30);
    h.script.fire({ kind: "zona", id: "posto" });
    expect(h.flags.get(F.entregaNoPrazo)).toBe(true);
    expect(h.timers.has(TIMER_ENTREGA)).toBe(false);
    expect(h.dropped).toEqual(CAP1_POINTS.postoCaixa);
    expect(h.quests.isObjectiveDone(QUEST_RASTRO_DO_LOTE, "entrega")).toBe(true);
    // Matias desce perto de Raquel: ela puxa a conversa; "farda cinza" → Brandão atravessa a praça
    h.driving = null;
    h.feet = { x: 24.4, y: 0, z: -13 };
    await settle(d, h);
    expect(h.talked).toContain("raquel");
    h.flags.set(X.entregaConversada, true);
    h.script.fire({ kind: "dialogo", npc: "raquel", no: "m2_entrega_fim" });
    await settle(d, h);
    expect(h.walking.get("brandao")).toEqual(CAP1_SPOTS.brandaoPosto);
    h.script.fire({ kind: "dialogo", npc: "brandao", no: "m2_inicio" });
    expect(h.walking.has("brandao")).toBe(false);
    // decisão: denúncia (lote registrado → Brandão preso)
    h.flags.set(F.m2Decisao, "denuncia");
    h.flags.set(X.brandaoPreso, true);
    h.quests.completeObjective(QUEST_RASTRO_DO_LOTE, "brandao");
    h.quests.completeObjective(QUEST_RASTRO_DO_LOTE, "decisao");
    await settle(d, h);

    // ---------------- M3: fim de tarde
    expect(d.phase).toBe("m3_tarde");
    expect(h.quests.get(QUEST_RASTRO_DO_LOTE)?.state.status).toBe("completed");
    expect(h.quests.isActive(QUEST_A_VIGILIA)).toBe(true);
    expect(h.flags.get(`cap1.patrulha.${QUEST_A_VIGILIA}`)).toBe("tensa");
    h.script.fire({ kind: "zona", id: "oficina_tarde" });
    await d.idle();
    await settle(d, h);
    expect(h.flags.getBool(D.entardecer)).toBe(true);
    expect(h.vehicles.get("rastro_av4")).toMatchObject({ x: CAP1_POINTS.rastroTelhado.x, y: CAP1_POINTS.rastroTelhado.y });
    expect(h.npcs.get("ana")).toEqual(CAP1_SPOTS.anaOficina);
    expect(h.radios).toEqual([DIALOGUE_RADIO_ELIAS]);
    // recado ouvido → contagem do toque; zerou → noite, ronda e Elias na quadra
    h.flags.set(X.recadoOuvido, true);
    h.script.fire({ kind: "dialogo", npc: "radio_elias", no: "m3_m5" });
    expect(h.timers.has(TIMER_TOQUE)).toBe(true);
    h.timers.update(60);
    expect(d.phase).toBe("m3_toque");
    expect(h.curfew && h.dusk === 1).toBe(true);
    expect(h.patrols.map((p) => p.id)).toEqual(M3_PATROLS.map((p) => p.id)); // postura tensa: 3 Custódios
    expect(h.npcs.get("elias")).toEqual(CAP1_SPOTS.eliasQuadra);
    expect(h.npcs.get("raquel")).toBeNull();
    // visto → flag; preso → volta ao último ponto com a ronda refeita
    h.script.fire({ kind: "detectado" });
    expect(h.flags.get(F.detectado)).toBe(true);
    expect(d.detectionLine(1, false)).toBe(DIALOGUES.custodio!.lines.m3_aviso!.text);
    h.feet = { x: 30, y: 0, z: -12 };
    expect(d.onCaught()).toBe(true);
    await d.idle();
    expect(h.feet).toMatchObject({ x: CAP1_POINTS.oficinaRua.x, z: CAP1_POINTS.oficinaRua.z });
    expect(h.patrols).toHaveLength(3);
    expect(h.flags.get(D.preso)).toBe(1);
    // quadra → Elias → documento → Elias sai e a ronda entra
    h.script.fire({ kind: "zona", id: "quadra" });
    expect(h.quests.isObjectiveDone(QUEST_A_VIGILIA, "toque") && h.quests.isObjectiveDone(QUEST_A_VIGILIA, "quadra")).toBe(true);
    expect(d.respawnPoint()).toEqual(CAP1_POINTS.quadraArquibancada);
    h.flags.set(X.eliasEncontrado, true);
    h.script.fire({ kind: "dialogo", npc: "elias", no: "m3_e5" });
    expect(h.examinables.get("documento_2056")?.clue).toBe("pista.assinatura_2056");
    h.clues.add("pista.assinatura_2056");
    expect(h.quests.isObjectiveDone(QUEST_A_VIGILIA, "documento")).toBe(true);
    // um tiro num Custódio: hostis em M4
    h.patrols[0]!.onHurt?.();
    expect(h.flags.get(F.custodiosHostis)).toBe(true);
    h.flags.set(X.eliasPartiu, true);
    h.script.fire({ kind: "dialogo", npc: "elias", no: "m3_e18" });
    await settle(d, h);
    expect(d.phase).toBe("m3_fuga");
    expect(h.walking.get("elias")).toEqual(CAP1_SPOTS.eliasSaida);
    expect(h.patrols.map((p) => p.id)).toContain("quadra");
    expect(d.respawnPoint()).toEqual(CAP1_POINTS.patioEscada);
    // telhado → etiqueta; voo até a oficina → Ana na porta, ronda dispensada
    h.script.fire({ kind: "zona", id: "telhado_escola" });
    expect(h.quests.isObjectiveDone(QUEST_A_VIGILIA, "telhado")).toBe(true);
    expect(h.examinables.has("rastro_etiqueta")).toBe(true);
    h.driving = "rastro_av4";
    h.script.fire({ kind: "zona", id: "oficina" });
    expect(h.quests.isObjectiveDone(QUEST_A_VIGILIA, "voo")).toBe(true);
    expect(h.npcs.get("ana")).toEqual(CAP1_SPOTS.anaPortaOficina);
    expect(h.patrols).toHaveLength(0);
    h.driving = null;
    h.feet = { x: -29.5, y: 0, z: -3 };
    h.talked = [];
    await settle(d, h);
    expect(h.talked).toEqual(["ana"]);
    // decisão do documento
    h.flags.set(X.anaSabe, true);
    h.flags.set(F.documento, "miriam");
    h.quests.completeObjective(QUEST_A_VIGILIA, "ana");
    h.quests.completeObjective(QUEST_A_VIGILIA, "decisao");
    await settle(d, h, 3);

    // ---------------- M4: amanhecer do dia 3
    expect(d.phase).toBe("m4");
    expect(h.quests.get(QUEST_A_VIGILIA)?.state.status).toBe("completed");
    expect(h.quests.isActive(QUEST_PARTIDA)).toBe(true);
    expect(h.curfew).toBe(false);
    expect(h.flags.get(D.agua)).toBe(60);
    expect(h.flags.get(D.estoque)).toBe(6);
    expect(h.flags.get(D.preco)).toBe(1.875); // denúncia ×1,5 e tiros ×1,25
    expect(h.flags.get(`cap1.patrulha.${QUEST_PARTIDA}`)).toBe("hostil");
    expect(h.npcs.get("brandao")).toEqual(CAP1_SPOTS.brandaoPreso);
    expect(h.npcs.get("miriam")).toEqual(CAP1_SPOTS.miriamOficina);
    expect(h.vehicles.get("javali_vb4")).toMatchObject({ x: CAP1_POINTS.javaliPortao.x });
    expect(h.examinables.get("quadro_avisos")?.text).toContain("60/100");
    expect(h.examinables.get("tabela_banca")?.text).toContain("11 Selos");
    expect(h.examinables.has("lista_apuracao")).toBe(false); // só no acordo
    h.script.fire({ kind: "zona", id: "rua_amanhecer" });
    expect(h.quests.isObjectiveDone(QUEST_PARTIDA, "amanhecer")).toBe(true);
    // sem falar com todos, a van não sai
    h.driving = "modulo_v7";
    h.script.fire({ kind: "zona", id: "limite_setor" });
    expect(d.phase).toBe("m4");
    expect(h.notices.at(-1)).toMatch(/^Ainda não\./);
    for (const o of ["miriam", "custodio", "raquel", "ana"]) h.quests.completeObjective(QUEST_PARTIDA, o);
    h.flags.set(F.ana, "vai");
    h.script.fire({ kind: "veiculo", id: "modulo_v7", dentro: true });
    expect(h.passenger).toBe("ana");
    expect(h.npcs.get("ana")).toBeNull();
    h.script.fire({ kind: "zona", id: "limite_setor" });
    await d.idle();
    expect(d.phase).toBe("fim");
    expect(h.quests.get(QUEST_PARTIDA)?.state.status).toBe("completed");
    expect(h.ended?.title).toBe("Partida");
    expect(h.ended?.stats).toContainEqual(["Ana", "vai com Matias"]);
    expect(h.ended?.stats).toContainEqual(["Samuel Brandão", "denunciado — preso"]);
    expect(h.autoDrive?.handbrake).toBe(true);
    d.onMissionContinue();
    expect(h.autoDrive).toBeNull();
    expect(h.cinematic).toBe(false);

    // um jogo carregado no fim reconstrói a mesma fase
    const d2 = new Chapter1Director(h);
    d2.syncFromFlags();
    expect(d2.phase).toBe("fim");
  });

  it("falha branda: o prazo do meio-dia estoura e a entrega chega atrasada", async () => {
    const h = new FakeHost();
    const d = new Chapter1Director(h);
    endOfChapter0(h, "silencio", false);
    await settle(d, h);
    await d.beginDay2();
    expect(h.flags.get(D.agua)).toBe(40);
    expect(h.props.has("porta_deposito")).toBe(true); // silêncio: o Custódio não abre; resta a grade dos fundos
    h.flags.set(X.atlasEmprestado, true);
    h.script.fire({ kind: "dialogo", npc: "comerciante", no: "m2_ac2" });
    h.timers.update(1000);
    expect(h.flags.getBool(D.timerEstourou)).toBe(true);
    h.driving = "atlas_t3";
    h.vehicles.set("atlas_t3", { x: -28, y: 0, z: -2, yaw: 0 });
    await settle(d, h);
    h.script.fire({ kind: "zona", id: "posto" });
    expect(h.flags.get(F.entregaNoPrazo)).toBe(false);
    expect(h.quests.isObjectiveDone(QUEST_RASTRO_DO_LOTE, "entrega")).toBe(true);
  });

  it("carregar no meio do toque remonta a noite: patrulhas, Elias, documento e checkpoint da quadra", () => {
    const h = new FakeHost();
    endOfChapter0(h, "registro");
    h.flags.set(D.dia2, true);
    h.flags.set(F.m2Decisao, "silencio");
    h.quests.start(QUEST_RASTRO_DO_LOTE);
    h.quests.complete(QUEST_RASTRO_DO_LOTE);
    h.quests.start(QUEST_A_VIGILIA);
    h.flags.set(`cap1.consequencias.${QUEST_A_VIGILIA}`, true);
    h.flags.set(`cap1.patrulha.${QUEST_A_VIGILIA}`, "cordial");
    h.flags.set(D.entardecer, true);
    h.flags.set(X.recadoOuvido, true);
    h.flags.set(D.toque, true);
    h.flags.set(X.eliasEncontrado, true);
    h.quests.completeObjective(QUEST_A_VIGILIA, "quadra");
    const d = new Chapter1Director(h);
    d.syncFromFlags();
    expect(d.phase).toBe("m3_toque");
    expect(h.patrols.map((p) => p.id)).toEqual(["praca_sul", "rua_escola"]); // ronda cordial: 2 Custódios
    expect(h.patrols[0]!.awareness?.confirmTime).toBeGreaterThan(2);
    expect(h.npcs.get("elias")).toEqual(CAP1_SPOTS.eliasQuadra);
    expect(h.examinables.has("documento_2056")).toBe(true);
    expect(h.props.has("bancada")).toBe(true);
    expect(d.respawn()).toEqual(CAP1_POINTS.quadraArquibancada);
    // o novo jogo devolve o mundo ao prólogo
    d.reset();
    expect(d.phase).toBe("inativo");
    expect(d.respawn()).toBeNull();
    expect(d.onCaught()).toBe(false);
  });
});

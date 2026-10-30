/**
 * Diretor do Capítulo 1 "Setor 17": M2 "Rastro do Lote", M3 "A Vigília" e M4 "Partida".
 * Roteiro (beats, gatilhos, falas): docs/ROTEIRO_CAP1.md · sistemas: docs/SISTEMAS_CAP1.md · mapa: docs/MAPA_SETOR17.md.
 *
 * Mesmo espírito do `MissionDirector` (Capítulo 0): a fase sai do estado salvo (flags + missões,
 * `deriveChapter1Phase`), o diretor reage aos gatilhos do `MissionScript` (diálogo, zona, exame, pista, timer,
 * detecção, veículo) e age sobre o jogo por uma interface (`Chapter1Host`). Falas, pistas, missões e a tabela de
 * consequências continuam em src/data/; aqui ficam só os dados de encenação do capítulo (pontos, rotas de
 * patrulha, textos de exame, prazos).
 *
 * Organização do arquivo:
 * 1. dados de encenação (`CAP1_POINTS`, `CAP1_SPOTS`, `M3_PATROLS`, prazos);
 * 2. lógica pura e testável: `resolveConsequences`, `deriveChapter1Phase`, `npcLayout`;
 * 3. `Chapter1Director`: fases, transições (amanhecer, fim de tarde, toque, amanhecer do dia 3, partida),
 *    checkpoints e recomeço (morte/prisão);
 * 4. `Chapter1Stage`: o palco Babylon que implementa `Chapter1Host` sobre uma ponte mínima com o `Game`
 *    (reposicionar NPCs, elenco provisório, objetos de cena, barreiras, patrulhas, passageira, câmera).
 *
 * Segredos do cânone (UNIVERSO_CANONICO.md §9) não são resolvidos aqui: o exame do documento de 2056 mostra só
 * o que o roteiro autoriza (assinatura de Matias e o ano; o resto tarjado).
 */
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Material } from "@babylonjs/core/Materials/material";
import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { PhysicsShapeBox } from "@babylonjs/core/Physics/v2/physicsShape";
import type { Scene } from "@babylonjs/core/scene";

import { CAP1_FLAGS, QUEST_A_VIGILIA, QUEST_PARTIDA, QUEST_RASTRO_DO_LOTE, type ConsequenceRule, type MissionTrigger } from "@/data/cap1Contracts";
import { CONSEQUENCES } from "@/data/consequences";
import { CAP1_AUX_FLAGS, DIALOGUES, DIALOGUE_RADIO_ELIAS } from "@/data/dialogues";
import { QUESTS, QUEST_CARREGAMENTO } from "@/data/quests";
import { PROVISIONAL_CAST, isCastRole, type CastRole } from "@/data/characters";
import { loadCharacter, type CharacterModel } from "@/characters/characterModel";
import { Npc } from "@/characters/npc";
import { COLLISION } from "@/world/context";
import { vehicleSpawns } from "@/world/vehiclesPack";
import type { MaterialLibrary } from "@/world/materials";
import type { Navmesh } from "@/world/navmesh";
import type { Vehicle } from "@/vehicles/vehicle";
import type { Enemy } from "@/ai/enemy";
import type { EnemyManager, EnemySpawnSpec } from "@/ai/enemyManager";
import type { ExaminableSpec } from "@/interaction/examinable";
import type { Interactable } from "@/interaction/interactable";
import type { DeliveryCargo } from "./delivery";
import type { DialogueGraph } from "./dialogue";
import type { FlagValue, GameFlags } from "./flags";
import type { QuestLog } from "./quests";
import type { ClueLog } from "./clues";
import type { MissionTimers } from "./timers";
import type { MissionScript, ZoneSpec } from "./missionScript";

// =============================================================================================
// 1. Dados de encenação
// =============================================================================================

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
export interface Placement extends Vec3 {
  yaw: number;
}
const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const at = (x: number, y: number, z: number, yaw: number): Placement => ({ x, y, z, yaw });

/** Atores do capítulo (chave = falante/grafo em dialogues.ts). */
export const CAP1_ACTORS = ["raquel", "ana", "custodio", "comerciante", "miriam", "brandao", "elias"] as const;
export type Cap1Actor = (typeof CAP1_ACTORS)[number];

export type Chapter1Phase = "inativo" | "m1_fim" | "m2" | "m3_tarde" | "m3_toque" | "m3_fuga" | "m4" | "m4_partida" | "fim";
export type PatrolLevel = "cordial" | "tensa" | "hostil";

/** Flags próprias do diretor (estado de encenação; as de decisão/contrato estão em cap1Contracts e dialogues). */
export const CAP1_STAGE_FLAGS = {
  /** amanheceu o dia 2 (M2 montada) */
  dia2: "cap1.dia2",
  /** as caixas da van estão no caixote do Atlas */
  cargaNoAtlas: "cap1.m2.carga_no_atlas",
  /** o prazo do meio-dia estourou antes da entrega */
  timerEstourou: "cap1.m2.timer_estourou",
  /** as caixas chegaram ao posto (objetivo `entrega`) */
  entregue: "cap1.m2.entregue",
  /** fim de tarde na oficina (rádio de Elias a seguir) */
  entardecer: "cap1.m3.entardecer",
  /** começou o toque de recolher */
  toque: "cap1.m3.toque",
  /** vezes que Matias foi preso pelos Custódios em M3 */
  preso: "cap1.m3.preso",
  /** a Rastro chegou à rua da oficina (objetivo `voo`) */
  pousou: "cap1.m3.pousou",
  /** Matias entrou na van depois da decisão de Ana (passageira / despedida montadas) */
  embarcou: "cap1.m4.embarcou",
  /** fim do capítulo mostrado */
  fim: "cap1.fim",
  /** medidor de água do bairro (0–100), cumulativo entre as missões */
  agua: "cap1.bairro.agua",
  /** caixas no posto da Raquel (0–6) */
  estoque: "cap1.posto.estoque",
  /** fator de preço da banca na missão atual */
  preco: "cap1.banca.preco",
} as const;
const D = CAP1_STAGE_FLAGS;
const F = CAP1_FLAGS;
const X = CAP1_AUX_FLAGS;
const patrolFlag = (quest: string) => `cap1.patrulha.${quest}`;
const appliedFlag = (quest: string) => `cap1.consequencias.${quest}`;

/** Valores iniciais do bairro antes das consequências (água 0–100, caixas 0–6, preço ×1). */
export const BAIRRO_BASE = { agua: 50, estoque: 3, preco: 1 } as const;
/** Preços de referência da banca em Selos de Permanência — PROVISÓRIOS (o GDD não fixa valores; não há loja ainda). */
export const BANCA_PRECOS = { municao: 6, kit: 10 } as const;
/** Prazos (s). Entrega: feira → oficina → posto (~160 m) no Atlas a 27 km/h, com folga; toque: janela de despedidas. */
export const CAP1_TIMERS = { entrega: 150, toque: 45 } as const;
export const TIMER_ENTREGA = "entrega_posto";
export const TIMER_TOQUE = "toque_recolher";
/** Céu por momento (0 = dia claro, 1 = anoitecer). Não há amanhecer no `Environment`: 0,42 → 0,18 imita a luz baixa. */
export const CAP1_DUSK = { manha: 0, tarde: 0.45, entardecer: 0.78, noite: 1, amanhecer: 0.42, manhaDia3: 0.18 } as const;

/** Pontos do Setor 17 usados pelo capítulo (metros; X = leste, Z = norte; ver docs/MAPA_SETOR17.md). */
export const CAP1_POINTS = {
  oficinaDentro: at(-30, 0.2, -10.6, 0),
  oficinaRua: at(-30, 0.12, -3.6, Math.PI / 2),
  vanOficina: at(-31, 0.12, -2.0, -Math.PI / 2),
  vanPartida: at(-31, 0.12, -2.0, Math.PI / 2),
  rastroRua: at(-39, 0.12, 1.6, Math.PI / 2),
  rastroTelhado: at(-6, 7.4, -29, 0),
  atlasFeira: at(67.5, 0.12, -9, -Math.PI / 2),
  javaliPortao: at(41.6, 0.12, 12.4, Math.PI),
  postoCaixa: v3(23.0, 0.12, -16.2),
  quadraArquibancada: at(-22.5, 0.12, -23.6, Math.PI),
  patioEscada: at(5.2, 0.12, -31.0, -Math.PI / 2),
  guarita: v3(79.5, 3.6, 75.5),
  /** fora de vista (terreno baldio do canto sudoeste): onde ficam os NPCs "em casa" */
  bastidor: at(-72, 0.12, -66, 0),
} as const;

/** Onde cada ator fica em cada momento. */
export const CAP1_SPOTS = {
  raquelVan: at(-26.6, 0.12, -4.4, -0.67),
  raquelPosto: at(24.4, 0.12, -15.0, 0),
  raquelPortaPosto: at(25.6, 0.12, -15.4, 0),
  anaPosto: at(22.6, 0.12, -13.8, 0.4),
  anaAfastada: at(18.6, 0.12, -9.0, -1.9),
  anaOficina: at(-27.4, 0.12, -11.4, -Math.PI / 2),
  anaPortaOficina: at(-28.7, 0.12, -5.4, 0.3),
  anaPraca: at(22.0, 0.12, -10.5, 0.6),
  anaPortaPosto: at(23.0, 0.12, -15.4, 0),
  /** atrás do balcão da banca da feira (a frente da banca dá para a pista oeste da avenida) */
  comercianteFeira: at(73.6, 0.15, -14.0, -Math.PI / 2),
  miriamOficina: at(-27.0, 0.12, -3.0, -2.5),
  brandaoChegada: at(31.0, 0.12, -4.0, -2.6),
  brandaoPosto: at(25.8, 0.12, -12.4, -2.65),
  brandaoPreso: at(38.4, 0.12, 13.8, Math.PI),
  brandaoDeposito: at(33.5, 0.12, 56.4, Math.PI),
  eliasQuadra: at(-24.6, 0.12, -22.4, Math.PI),
  eliasSaida: at(-38.5, 0.12, -30.5, -2.2),
} as const;

/**
 * Patrulhas do toque de recolher (M3) pelas duas rotas até a quadra (MAPA_SETOR17.md: praça → Largo → beco →
 * rua da Escola → portão sul). As rotas entre âncoras saem da navmesh; `min` = postura mínima para a patrulha
 * existir (cordial: 2 Custódios; tensa/hostil: 3).
 */
export interface PatrolDef {
  id: string;
  start: Placement;
  route: Vec3[];
  min: PatrolLevel;
}
export const M3_PATROLS: PatrolDef[] = [
  { id: "praca_sul", start: at(20, 0.12, -11.5, Math.PI / 2), route: [v3(20, 0.12, -11.5), v3(43.5, 0.12, -12.5)], min: "cordial" },
  { id: "rua_escola", start: at(-31, 0.12, -38.5, Math.PI / 2), route: [v3(-31, 0.12, -38.5), v3(9, 0.12, -38.5)], min: "cordial" },
  { id: "largo_beco", start: at(47.5, 0.12, -17, Math.PI), route: [v3(47.5, 0.12, -17), v3(47.5, 0.12, -32.5)], min: "tensa" },
];
/** Lanternas no portão: a ronda que entra na quadra depois que Elias sai (beat 3 de M3). */
export const M3_QUADRA_PATROL: PatrolDef = { id: "quadra", start: at(-28.5, 0.12, -38, 0), route: [v3(-28.5, 0.12, -38), v3(-28, 0.12, -24.5), v3(-19, 0.12, -24.5)], min: "cordial" };

const VAN_CLUES = ["pista.manifesto_rasurado", "pista.selo_nao_bate", "pista.lacres_refeitos"];
const DEPOSITO_CLUES = ["pista.caixas_vazias", "pista.caderno_de_saida"];
/** Objetivos de M4 exigidos antes da partida (o último, `partida`, é a própria saída). */
const M4_REQUIRED = ["miriam", "custodio", "raquel", "ana"] as const;

// =============================================================================================
// 2. Lógica pura
// =============================================================================================

export interface FlagReader {
  get(key: string): FlagValue | undefined;
}
export interface QuestReader {
  get(id: string): { state: { status: string; objectives?: Record<string, boolean> } } | undefined;
}

export interface ResolvedConsequences {
  quest: string;
  /** soma dos deltas de água */
  agua: number;
  /** soma dos deltas de caixas no posto */
  estoque: number;
  /** produto dos fatores de preço (1 = sem regra) */
  preco: number;
  /** nível mais severo entre as regras (null = nenhuma regra de patrulha) */
  patrulha: PatrolLevel | null;
  /** nó inicial por NPC (a última regra da tabela vence) */
  falas: Record<string, string>;
  /** presença por NPC (a última regra vence; sem regra = padrão do diretor) */
  presenca: Record<string, boolean>;
  /** avisos na ordem da tabela */
  avisos: string[];
  /** quantas regras casaram */
  regras: number;
}

const SEVERITY: Record<PatrolLevel, number> = { cordial: 0, tensa: 1, hostil: 2 };

/**
 * Resolve a tabela `CONSEQUENCES` para uma missão a partir das flags (regras de src/data/consequences.ts):
 * água e estoque somam; preço multiplica; patrulha = mais severa; fala e presença = última regra; avisos em ordem.
 */
export function resolveConsequences(flags: FlagReader, quest: string, rules: readonly ConsequenceRule[] = CONSEQUENCES): ResolvedConsequences {
  const out: ResolvedConsequences = { quest, agua: 0, estoque: 0, preco: 1, patrulha: null, falas: {}, presenca: {}, avisos: [], regras: 0 };
  for (const rule of rules) {
    if (rule.quest !== quest || flags.get(rule.flag) !== rule.equals) continue;
    out.regras++;
    for (const e of rule.effects) {
      switch (e.kind) {
        case "agua":
          out.agua += e.delta;
          break;
        case "estoque_raquel":
          out.estoque += e.delta;
          break;
        case "preco_banca":
          out.preco *= e.fator;
          break;
        case "patrulha":
          if (!out.patrulha || SEVERITY[e.nivel] > SEVERITY[out.patrulha]) out.patrulha = e.nivel;
          break;
        case "fala":
          out.falas[e.npc] = e.set;
          break;
        case "presenca":
          out.presenca[e.npc] = e.presente;
          break;
        case "aviso":
          out.avisos.push(e.texto);
          break;
        default:
          break;
      }
    }
  }
  return out;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const num = (v: FlagValue | undefined, fallback: number) => (typeof v === "number" ? v : fallback);

/** Fase do capítulo a partir do estado salvo (novo jogo, carregar, conferência a cada quadro). */
export function deriveChapter1Phase(flags: FlagReader, quests: QuestReader): Chapter1Phase {
  const st = (id: string) => quests.get(id)?.state.status ?? "inactive";
  if (flags.get(D.fim) === true) return "fim";
  if (st(QUEST_PARTIDA) !== "inactive" || st(QUEST_A_VIGILIA) === "completed") return "m4";
  if (st(QUEST_A_VIGILIA) === "active") {
    if (flags.get(X.eliasPartiu) === true) return "m3_fuga";
    if (flags.get(D.toque) === true) return "m3_toque";
    return "m3_tarde";
  }
  if (st(QUEST_RASTRO_DO_LOTE) === "completed") return "m3_tarde";
  if (st(QUEST_RASTRO_DO_LOTE) === "active" || flags.get(D.dia2) === true) return "m2";
  if (st(QUEST_CARREGAMENTO) === "completed") return "m1_fim";
  return "inativo";
}

/**
 * Onde cada ator do capítulo está numa fase, a partir das flags (null = fora de cena; "spawn" = posição do
 * prólogo). Função pura: o mesmo resultado monta a cena ao carregar um jogo salvo e nas transições.
 */
export function npcLayout(phase: Chapter1Phase, flags: FlagReader): Record<Cap1Actor, Placement | "spawn" | null> {
  const S = CAP1_SPOTS;
  const is = (k: string, val: FlagValue) => flags.get(k) === val;
  const has = (k: string) => flags.get(k) !== undefined;
  const acordo = is(F.m2Decisao, "silencio");
  const layout: Record<Cap1Actor, Placement | "spawn" | null> = { raquel: "spawn", ana: "spawn", custodio: "spawn", comerciante: "spawn", miriam: "spawn", brandao: null, elias: null };
  switch (phase) {
    case "m2":
      layout.raquel = is(X.vanConferida, true) ? S.raquelPosto : S.raquelVan;
      layout.ana = has(F.m2Decisao) && acordo ? S.anaAfastada : S.anaPosto;
      layout.comerciante = S.comercianteFeira;
      layout.brandao = is(X.entregaConversada, true) && !has(F.m2Decisao) ? S.brandaoPosto : null;
      break;
    case "m3_tarde":
      layout.raquel = S.raquelPosto;
      layout.ana = is(D.entardecer, true) ? S.anaOficina : acordo ? S.anaAfastada : S.anaPosto;
      layout.comerciante = S.comercianteFeira;
      break;
    case "m3_toque":
    case "m3_fuga":
      // toque de recolher: o posto, a banca e o balcão fecham; Ana dorme na oficina e sai quando a Rastro pousa
      layout.raquel = null;
      layout.comerciante = null;
      layout.miriam = null;
      layout.ana = is(D.pousou, true) ? S.anaPortaOficina : S.anaOficina;
      layout.elias = is(X.eliasPartiu, true) ? null : S.eliasQuadra;
      break;
    case "m4":
    case "m4_partida":
    case "fim": {
      const presenca = resolveConsequences(flags, QUEST_PARTIDA).presenca;
      const embarcou = is(D.embarcou, true);
      const fica = is(F.ana, "fica");
      layout.raquel = embarcou && fica ? S.raquelPortaPosto : S.raquelPosto;
      layout.ana = embarcou ? (fica ? S.anaPortaPosto : null) : S.anaPraca;
      layout.comerciante = S.comercianteFeira;
      layout.miriam = presenca.miriam === false ? null : S.miriamOficina;
      layout.brandao = presenca.brandao ? (is(X.brandaoPreso, true) ? S.brandaoPreso : S.brandaoDeposito) : null;
      break;
    }
    default:
      break;
  }
  return layout;
}

// =============================================================================================
// 3. Diretor
// =============================================================================================

export type PropKind = "caixa" | "saco" | "caderno" | "bancada" | "folha" | "lista" | "porta" | "grade";

export interface PatrolSpec {
  id: string;
  start: Placement;
  route: Vec3[];
  awareness?: { confirmTime?: number; graceTime?: number; searchTime?: number; loseTime?: number };
  /** chamado quando o Custódio leva um tiro de Matias */
  onHurt?: () => void;
}

export interface AutoDrive {
  throttle: number;
  steer: number;
  handbrake: boolean;
}

/** O que o diretor precisa do jogo (implementado por `Chapter1Stage`; nos testes, por um dublê). */
export interface Chapter1Host {
  readonly flags: GameFlags;
  readonly quests: QuestLog;
  readonly clues: ClueLog;
  readonly timers: MissionTimers;
  readonly script: MissionScript;
  // HUD, tempo e ambiente
  notice(text: string, seconds?: number): void;
  fade(black: boolean): void;
  /** espera em tempo real (transições atrás do fade) */
  wait(ms: number): Promise<void>;
  setDusk(level: number, instant: boolean): void;
  setCurfew(on: boolean): void;
  setLetterbox(on: boolean): void;
  checkpoint(): void;
  sting(kind: "alerta" | "vitoria"): void;
  /** jogando (sem diálogo, exame ou menu) */
  isPlaying(): boolean;
  // jogador e veículos
  playerFeet(): Vec3;
  teleportPlayer(p: Vec3, yaw: number): void;
  drivingId(): string | null;
  exitVehicle(): void;
  vehiclePlacement(id: string): Placement | null;
  placeVehicle(id: string, p: Placement): void;
  setCargo(vehicleId: string | null): void;
  dropCargo(at: Vec3): void;
  setPassenger(vehicleId: string, role: "ana" | null): void;
  setAutoDrive(c: AutoDrive | null): void;
  /** câmera de cena fixa em `from` acompanhando um veículo; null devolve a câmera ao jogador */
  setCinematicShot(from: Vec3 | null, followVehicle?: string): void;
  // atores
  spawnPlacement(role: Cap1Actor): Placement | null;
  placeNpc(role: Cap1Actor, p: Placement): void;
  hideNpc(role: Cap1Actor): void;
  walkNpc(role: Cap1Actor, to: Placement, speed: number, hideAtEnd?: boolean): void;
  stopWalk(role: Cap1Actor): void;
  /** posição do ator em cena (null = fora de cena ou ainda carregando) */
  npcPosition(role: Cap1Actor): Vec3 | null;
  talkTo(role: Cap1Actor, maxDistance: number): boolean;
  startRadio(graph: DialogueGraph): void;
  // objetos de cena
  addExaminable(spec: ExaminableSpec): void;
  removeExaminable(id: string): void;
  addProp(id: string, kind: PropKind, p: Vec3, yaw?: number): void;
  addBarrier(id: string, kind: PropKind, center: Vec3, size: Vec3): void;
  removeProp(id: string): void;
  /** remove exames, objetos e barreiras criados pelo capítulo */
  clearStage(): void;
  // furtividade
  spawnPatrol(spec: PatrolSpec): void;
  clearPatrols(): void;
  // final
  showChapterEnd(title: string, text: string, stats: Array<[string, string]>): void;
  /** palco por quadro (caminhadas, câmera de cena, passageira) */
  update?(dt: number): void;
  /** volta o mundo ao prólogo: NPCs nas posições originais, elenco fora de cena, sem objetos/patrulhas */
  resetWorld?(vehiclesToo: boolean): void;
  snapshotActors?(): Record<string, unknown>;
}

const dist2d = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * Diretor do Capítulo 1: monta cada missão (atores, objetos, zonas, ambiente), reage aos gatilhos e conduz as
 * transições entre os dias. O estado durável fica todo em flags/missões/pistas/timers (salvos pelo `Game`);
 * `syncFromFlags` remonta a cena exata ao carregar.
 */
export class Chapter1Director {
  phase: Chapter1Phase = "inativo";
  private seq: Promise<void> | null = null;
  private notices: Array<{ text: string; seconds: number }> = [];
  private noticeTimer = 1.2;
  private pendingDay2 = false;
  private pendingBrandao = false;
  private pendingEliasExit = false;
  private radioPending = false;
  private raquelAtPosto = false;
  private autoTalked = new Set<string>();
  private zones = new Set<string>();
  private barriers = new Set<string>();
  private resolved: ResolvedConsequences | null = null;

  constructor(private readonly host: Chapter1Host) {
    this.bindTriggers();
  }

  // ------------------------------------------------------------------ ciclo de vida
  /** Novo jogo: o mundo volta ao prólogo. */
  reset(): void {
    this.clearMemory();
    this.host.resetWorld?.(true);
    this.phase = "inativo";
  }

  /** Jogo carregado: remonta a fase atual a partir das flags (sem reaplicar consequências). */
  syncFromFlags(): void {
    this.clearMemory();
    this.host.resetWorld?.(false);
    const phase = deriveChapter1Phase(this.host.flags, this.host.quests);
    this.phase = phase;
    const f = this.host.flags;
    const q = this.host.quests;
    switch (phase) {
      case "m1_fim":
        this.pendingDay2 = true; // a tela final do Capítulo 0 já foi vista: amanhece direto
        break;
      case "m2":
        q.start(QUEST_RASTRO_DO_LOTE);
        this.applyConsequences(QUEST_RASTRO_DO_LOTE);
        this.raquelAtPosto = f.getBool(X.vanConferida);
        this.enterPhase("m2", true);
        break;
      case "m3_tarde":
        q.complete(QUEST_RASTRO_DO_LOTE);
        q.start(QUEST_A_VIGILIA);
        this.applyConsequences(QUEST_A_VIGILIA);
        this.enterPhase("m3_tarde", true);
        this.radioPending = f.getBool(D.entardecer) && !f.getBool(X.recadoOuvido);
        break;
      case "m3_toque":
      case "m3_fuga":
        this.resolved = resolveConsequences(f, QUEST_A_VIGILIA);
        this.enterPhase(phase, true);
        break;
      case "m4":
        if (q.get(QUEST_PARTIDA)?.state.status === "inactive") {
          this.phase = "m3_fuga";
          void this.beginDay3();
        } else {
          this.resolved = resolveConsequences(f, QUEST_PARTIDA);
          this.enterPhase("m4", true);
        }
        break;
      case "fim":
        this.resolved = resolveConsequences(f, QUEST_PARTIDA);
        this.enterPhase("fim", true);
        break;
      default:
        break;
    }
  }

  private clearMemory(): void {
    this.seq = null;
    this.notices = [];
    this.noticeTimer = 1.2;
    this.pendingDay2 = false;
    this.pendingBrandao = false;
    this.pendingEliasExit = false;
    this.radioPending = false;
    this.raquelAtPosto = false;
    this.autoTalked.clear();
    for (const id of this.zones) this.host.script.removeZone(id);
    this.zones.clear();
    this.barriers.clear();
    this.resolved = null;
  }

  /** Capítulo 1 em andamento (fora do prólogo)? */
  get active(): boolean {
    return this.phase !== "inativo" && this.phase !== "m1_fim";
  }

  /** Há uma transição (fade) em andamento — testes esperam com `await idle()`. */
  get busy(): boolean {
    return this.seq !== null;
  }

  idle(): Promise<void> {
    return this.seq ?? Promise.resolve();
  }

  /** Botão "Continuar explorando" da tela de conclusão. */
  onMissionContinue(): void {
    if (this.phase === "inativo" && deriveChapter1Phase(this.host.flags, this.host.quests) === "m1_fim") this.phase = "m1_fim";
    if (this.phase === "m1_fim") void this.beginDay2();
    else if (this.phase === "fim") {
      const h = this.host;
      h.setAutoDrive(null);
      h.setCinematicShot(null);
      h.setLetterbox(false);
      h.fade(false);
    }
  }

  // ------------------------------------------------------------------ quadro a quadro
  /** `playing` = estado "playing" (sem diálogo/exame/menu); o palco anda nos dois casos. */
  update(dt: number, playing = true): void {
    this.host.update?.(dt);
    if (!playing) return;
    this.pumpNotices(dt);
    if (this.seq) return;
    switch (this.phase) {
      case "inativo":
        if (this.host.quests.get(QUEST_CARREGAMENTO)?.state.status === "completed") this.phase = "m1_fim";
        break;
      case "m1_fim":
        if (this.pendingDay2) {
          this.pendingDay2 = false;
          void this.beginDay2();
        }
        break;
      case "m2":
        this.updateM2();
        break;
      case "m3_tarde":
        this.updateM3Tarde();
        break;
      case "m3_toque":
      case "m3_fuga":
        this.updateM3Night();
        break;
      default:
        break;
    }
  }

  private updateM2(): void {
    const h = this.host;
    const f = h.flags;
    const q = h.quests;
    // Raquel volta ao posto quando Matias se afasta da van (não some na frente dele)
    if (f.getBool(X.vanConferida) && !this.raquelAtPosto) {
      const p = h.npcPosition("raquel");
      if (!p || dist2d(h.playerFeet(), p) > 22) {
        h.placeNpc("raquel", CAP1_SPOTS.raquelPosto);
        this.raquelAtPosto = true;
      }
    }
    // o Custódio abriu o depósito (caminho "registro")
    if (f.getBool(X.depositoLiberado) && this.barriers.has("porta_deposito")) {
      h.removeProp("porta_deposito");
      this.barriers.delete("porta_deposito");
      h.notice("O portão do depósito está aberto. Ordem do Custódio.", 3.5);
    }
    // Atlas emprestado encosta na van: as caixas vão para o caixote
    if (f.getBool(X.atlasEmprestado) && !f.getBool(D.cargaNoAtlas) && !f.getBool(D.entregue) && h.drivingId() === "atlas_t3") {
      const van = h.vehiclePlacement("modulo_v7");
      const atlas = h.vehiclePlacement("atlas_t3");
      if (van && atlas && dist2d(van, atlas) < 7) this.loadCargo();
    }
    // a carga chegou: Raquel puxa a conversa quando Matias desce do triciclo
    if (f.getBool(D.entregue) && !f.getBool(X.entregaConversada) && h.drivingId() === null && !this.autoTalked.has("raquel_entrega")) {
      const rp = h.npcPosition("raquel");
      if (rp && dist2d(rp, h.playerFeet()) < 4.5 && h.talkTo("raquel", 4.5)) this.autoTalked.add("raquel_entrega");
    }
    // "Farda cinza vindo pela praça": Brandão atravessa a praça até o posto
    if (this.pendingBrandao) {
      this.pendingBrandao = false;
      h.placeNpc("brandao", CAP1_SPOTS.brandaoChegada);
      h.walkNpc("brandao", CAP1_SPOTS.brandaoPosto, 1.25);
    }
    // decisão tomada → fim de M2 (objetivos de exame pulados não travam a história)
    if (q.isObjectiveDone(QUEST_RASTRO_DO_LOTE, "decisao") || q.get(QUEST_RASTRO_DO_LOTE)?.state.status === "completed") this.endM2();
  }

  private updateM3Tarde(): void {
    const h = this.host;
    const f = h.flags;
    if (this.radioPending && h.isPlaying() && !f.getBool(X.recadoOuvido)) {
      this.radioPending = false;
      h.startRadio(DIALOGUE_RADIO_ELIAS);
    }
    if (f.getBool(X.recadoOuvido) && !f.getBool(D.toque) && !h.timers.has(TIMER_TOQUE)) h.timers.start(TIMER_TOQUE, CAP1_TIMERS.toque, "Toque de recolher");
  }

  private updateM3Night(): void {
    const h = this.host;
    const f = h.flags;
    const q = h.quests;
    if (this.pendingEliasExit) {
      this.pendingEliasExit = false;
      this.eliasExit();
    }
    // Ana acordou com o barulho: puxa a conversa quando Matias desce da Rastro
    if (f.getBool(D.pousou) && h.drivingId() === null && !this.autoTalked.has("ana_m3") && !q.isObjectiveDone(QUEST_A_VIGILIA, "ana")) {
      const ap = h.npcPosition("ana");
      if (ap && dist2d(ap, h.playerFeet()) < 5.5 && h.talkTo("ana", 5.5)) this.autoTalked.add("ana_m3");
    }
    if (q.isObjectiveDone(QUEST_A_VIGILIA, "decisao")) void this.beginDay3();
  }

  // ------------------------------------------------------------------ gatilhos
  private bindTriggers(): void {
    const on = (p: MissionTrigger, cb: () => void) => this.host.script.on(p, cb);
    // --- M2
    on({ kind: "dialogo", npc: "raquel", no: "m2_m7" }, () => {
      if (this.phase === "m2") this.addVanExaminables();
    });
    on({ kind: "examinar", objeto: "manifesto_van" }, () => {
      if (this.phase === "m2") this.host.clues.add("pista.selo_nao_bate");
    });
    on({ kind: "pista", id: "*" }, () => this.checkClueObjectives());
    on({ kind: "zona", id: "deposito" }, () => {
      if (this.phase === "m2") this.host.quests.completeObjective(QUEST_RASTRO_DO_LOTE, "deposito");
    });
    on({ kind: "dialogo", npc: "comerciante", no: "m2_nome" }, () => {
      if (this.phase === "m2") this.host.clues.add("pista.testemunha_samuel");
    });
    on({ kind: "dialogo", npc: "comerciante", no: "m2_ac2" }, () => {
      if (this.phase === "m2") this.startEntrega();
    });
    on({ kind: "timer", id: TIMER_ENTREGA, segundos: 0 }, () => this.onEntregaExpired());
    on({ kind: "zona", id: "posto" }, () => this.tryDeliver());
    on({ kind: "dialogo", npc: "raquel", no: "m2_entrega_fim" }, () => {
      if (this.phase === "m2") this.pendingBrandao = true;
    });
    on({ kind: "dialogo", npc: "brandao", no: "m2_inicio" }, () => this.host.stopWalk("brandao"));
    // --- M3
    on({ kind: "zona", id: "oficina_tarde" }, () => this.onOficinaTarde());
    on({ kind: "dialogo", npc: "radio_elias", no: "m3_m5" }, () => this.onRecadoOuvido());
    on({ kind: "timer", id: TIMER_TOQUE, segundos: 0 }, () => this.beginCurfew());
    on({ kind: "detectado" }, () => {
      if (this.isNight()) this.host.flags.set(F.detectado, true);
    });
    on({ kind: "zona", id: "quadra" }, () => this.onQuadra());
    on({ kind: "dialogo", npc: "elias", no: "m3_e5" }, () => {
      if (this.isNight()) this.addDocumento();
    });
    on({ kind: "dialogo", npc: "elias", no: "m3_e18" }, () => {
      if (this.phase === "m3_toque") this.pendingEliasExit = true;
    });
    on({ kind: "zona", id: "telhado_escola" }, () => this.onTelhado());
    on({ kind: "zona", id: "oficina" }, () => this.onOficinaVoo());
    on({ kind: "dialogo", npc: "ana", no: "m3_a5" }, () => {
      if (this.isNight()) this.host.clues.add("pista.toque_pedido_pelo_deposito");
    });
    // --- M4
    on({ kind: "zona", id: "rua_amanhecer" }, () => {
      if (this.phase === "m4") this.host.quests.completeObjective(QUEST_PARTIDA, "amanhecer");
    });
    on({ kind: "veiculo", id: "modulo_v7", dentro: true }, () => this.onVanEntered());
    on({ kind: "zona", id: "limite_setor" }, () => this.onLimiteSetor());
  }

  private isNight(): boolean {
    return this.phase === "m3_toque" || this.phase === "m3_fuga";
  }

  private checkClueObjectives(): void {
    const c = this.host.clues;
    const q = this.host.quests;
    if (this.phase === "m2") {
      if (c.hasAll(VAN_CLUES)) q.completeObjective(QUEST_RASTRO_DO_LOTE, "manifesto");
      if (c.hasAll(DEPOSITO_CLUES)) q.completeObjective(QUEST_RASTRO_DO_LOTE, "pistas");
    }
    if (this.isNight() && c.has("pista.assinatura_2056")) q.completeObjective(QUEST_A_VIGILIA, "documento");
  }

  // ------------------------------------------------------------------ M2
  private addVanExaminables(): void {
    const van = this.host.vehiclePlacement("modulo_v7");
    if (!van) return;
    const fwd = { x: Math.sin(van.yaw), z: Math.cos(van.yaw) };
    const right = { x: Math.cos(van.yaw), z: -Math.sin(van.yaw) };
    this.host.addExaminable(EXAMES.manifesto(v3(van.x + fwd.x * 1.4 + right.x * 1.3, 1.35, van.z + fwd.z * 1.4 + right.z * 1.3)));
    this.host.addExaminable(EXAMES.lacres(v3(van.x - fwd.x * 2.8, 1.0, van.z - fwd.z * 2.8)));
  }

  private startEntrega(): void {
    const h = this.host;
    if (h.flags.getBool(D.entregue) || h.timers.has(TIMER_ENTREGA)) return;
    h.timers.start(TIMER_ENTREGA, CAP1_TIMERS.entrega, "Entrega ao posto");
    this.queueNotices(["O Atlas T-3 está ao lado da banca. Busque as caixas na van da oficina e leve ao posto antes do meio-dia."]);
  }

  private onEntregaExpired(): void {
    const h = this.host;
    if (this.phase !== "m2" || h.flags.getBool(D.entregue)) return;
    h.flags.set(D.timerEstourou, true);
    h.notice("Meio-dia: a Central passou recolhendo o que sobrou. Leve as caixas ao posto mesmo assim.", 5);
  }

  private loadCargo(): void {
    const h = this.host;
    h.flags.set(D.cargaNoAtlas, true);
    h.setCargo("atlas_t3");
    h.notice("As três caixas da van vão para o caixote do Atlas. Agora, o posto.", 4);
  }

  private tryDeliver(): void {
    const h = this.host;
    const f = h.flags;
    if (this.phase !== "m2" || f.getBool(D.entregue) || !f.getBool(D.cargaNoAtlas) || h.drivingId() !== "atlas_t3") return;
    const noPrazo = h.timers.has(TIMER_ENTREGA) && !f.getBool(D.timerEstourou);
    h.timers.cancel(TIMER_ENTREGA);
    f.set(F.entregaNoPrazo, noPrazo);
    f.set(D.entregue, true);
    f.set(D.cargaNoAtlas, false);
    h.dropCargo(CAP1_POINTS.postoCaixa);
    h.quests.completeObjective(QUEST_RASTRO_DO_LOTE, "entrega");
    h.notice(noPrazo ? "Entregue antes do meio-dia. Desça e fale com Raquel." : "Entregue depois do meio-dia. Desça e fale com Raquel.", 4);
    h.checkpoint();
  }

  private endM2(): void {
    const h = this.host;
    const f = h.flags;
    h.quests.complete(QUEST_RASTRO_DO_LOTE);
    // Brandão vai embora pela praça; no acordo, Ana sai de cena ("Eu não pedi isso")
    h.walkNpc("brandao", CAP1_SPOTS.brandaoChegada, 1.3, true);
    if (f.get(F.m2Decisao) === "silencio") h.walkNpc("ana", CAP1_SPOTS.anaAfastada, 1.1);
    h.quests.start(QUEST_A_VIGILIA);
    this.applyConsequences(QUEST_A_VIGILIA);
    this.enterPhase("m3_tarde", false, new Set<Cap1Actor>(["brandao", "ana", "raquel"]));
    h.notice("A tarde cai sobre o Setor 17. Volte à oficina: o rádio vai chamar.", 4.5);
    h.checkpoint();
  }

  // ------------------------------------------------------------------ M3
  private onOficinaTarde(): void {
    if (this.phase !== "m3_tarde" || this.host.flags.getBool(D.entardecer) || this.seq) return;
    void this.run(async () => {
      const h = this.host;
      h.fade(true);
      await h.wait(800);
      h.flags.set(D.entardecer, true);
      // a Rastro da Custódia está na doca do telhado da escola, em manutenção (motivo da ronda)
      h.placeVehicle("rastro_av4", CAP1_POINTS.rastroTelhado);
      this.enterPhase("m3_tarde", true);
      h.checkpoint();
      await h.wait(400);
      h.fade(false);
      h.notice("Fim de tarde. O rádio da oficina chia.", 3.5);
      await h.wait(1300);
      this.radioPending = true;
    });
  }

  private onRecadoOuvido(): void {
    if (this.phase !== "m3_tarde") return;
    const h = this.host;
    if (!h.flags.getBool(D.toque) && !h.timers.has(TIMER_TOQUE)) h.timers.start(TIMER_TOQUE, CAP1_TIMERS.toque, "Toque de recolher");
    this.queueNotices(["O toque de recolher vem aí. A quadra fica para depois do toque — fale com Ana, se quiser."]);
  }

  /** Começa o toque de recolher (timer zerado): noite, Custódios de ronda, Elias na quadra. */
  beginCurfew(): void {
    const h = this.host;
    if (this.phase !== "m3_tarde" || h.flags.getBool(D.toque)) return;
    h.timers.cancel(TIMER_TOQUE);
    h.flags.set(D.toque, true);
    this.enterPhase("m3_toque", false);
    h.sting("alerta");
    h.notice("Toque de recolher. Agachado (C/Ctrl) seus passos somem a 4 m; correndo, a 15 m. Evite as lanternas.", 6);
    h.checkpoint();
  }

  private onQuadra(): void {
    if (this.phase !== "m3_toque") return;
    const q = this.host.quests;
    q.completeObjective(QUEST_A_VIGILIA, "toque");
    q.completeObjective(QUEST_A_VIGILIA, "quadra");
    this.host.notice("A quadra. Elias espera junto à arquibancada.", 3.5);
    this.host.checkpoint();
  }

  private addDocumento(): void {
    this.host.addExaminable(EXAMES.documento(v3(-21.4, 0.84, -22.2)));
  }

  private eliasExit(): void {
    const h = this.host;
    this.phase = "m3_fuga";
    h.walkNpc("elias", CAP1_SPOTS.eliasSaida, 2.2, true);
    h.spawnPatrol(this.patrolSpec(M3_QUADRA_PATROL, this.patrolLevel()));
    h.checkpoint();
    h.notice("Lanternas no portão. Saia da quadra e suba ao telhado da escola: escada de serviço do lado do pátio.", 5.5);
  }

  private onTelhado(): void {
    if (this.phase !== "m3_fuga") return;
    const q = this.host.quests;
    if (q.completeObjective(QUEST_A_VIGILIA, "telhado")) this.host.checkpoint();
    this.addEtiqueta();
  }

  private addEtiqueta(): void {
    const r = this.host.vehiclePlacement("rastro_av4") ?? CAP1_POINTS.rastroTelhado;
    this.host.addExaminable(EXAMES.etiqueta(v3(r.x + 1.1, r.y + 0.9, r.z)));
  }

  private onOficinaVoo(): void {
    const h = this.host;
    const f = h.flags;
    if (this.phase !== "m3_fuga" || f.getBool(D.pousou) || h.drivingId() !== "rastro_av4") return;
    f.set(D.pousou, true);
    h.quests.completeObjective(QUEST_A_VIGILIA, "voo");
    h.clearPatrols();
    h.placeNpc("ana", CAP1_SPOTS.anaPortaOficina);
    h.notice("A rua inteira ouviu. Pouse (Ctrl desce) e desça da Rastro (E).", 5);
    h.checkpoint();
  }

  /** Custódio levou tiro de Matias: as consequências chegam em M4. */
  private onPatrolHurt(): void {
    if (this.isNight()) this.host.flags.set(F.custodiosHostis, true);
  }

  private patrolLevel(): PatrolLevel {
    const v = this.host.flags.get(patrolFlag(QUEST_A_VIGILIA));
    return v === "cordial" || v === "tensa" || v === "hostil" ? v : "tensa";
  }

  private patrolSpec(def: PatrolDef, level: PatrolLevel): PatrolSpec {
    // ronda cordial demora mais para confirmar o que viu; tensa/hostil é mais rápida
    const confirmTime = level === "cordial" ? 2.6 : level === "tensa" ? 2.0 : 1.6;
    return { id: def.id, start: def.start, route: def.route, awareness: { confirmTime }, onHurt: () => this.onPatrolHurt() };
  }

  private spawnPatrols(): void {
    const h = this.host;
    h.clearPatrols();
    const level = this.patrolLevel();
    for (const p of M3_PATROLS) if (SEVERITY[level] >= SEVERITY[p.min]) h.spawnPatrol(this.patrolSpec(p, level));
    if (this.phase === "m3_fuga" && !h.flags.getBool(D.pousou)) h.spawnPatrol(this.patrolSpec(M3_QUADRA_PATROL, level));
  }

  /** Um Custódio alcançou Matias (prisão): volta ao último ponto com aviso. Devolve se o capítulo tratou. */
  onCaught(): boolean {
    if (!this.isNight()) return false;
    if (this.seq) return true;
    void this.run(async () => {
      const h = this.host;
      h.flags.increment(D.preso);
      h.fade(true);
      await h.wait(700);
      h.exitVehicle();
      const p = this.respawnPoint();
      h.teleportPlayer(p, p.yaw);
      this.spawnPatrols();
      await h.wait(400);
      h.fade(false);
      h.notice("Preso pelos Custódios e levado de volta. De volta ao último ponto.", 4.5);
    });
    return true;
  }

  /** Fala de voz de prisão na 1ª detecção do toque (roteiro `custodio:m3_aviso`); null = fala padrão do sistema. */
  detectionLine(count: number, hostile: boolean): string | null {
    if (!this.isNight() || hostile || count !== 1) return null;
    return DIALOGUES.custodio?.lines.m3_aviso?.text ?? null;
  }

  /** Último ponto para recomeçar (morte ou prisão). */
  respawnPoint(): Placement {
    const q = this.host.quests;
    const f = this.host.flags;
    if (this.phase === "m3_fuga" && !f.getBool(D.pousou)) return CAP1_POINTS.patioEscada;
    if (this.phase === "m3_toque" && q.isObjectiveDone(QUEST_A_VIGILIA, "quadra")) return CAP1_POINTS.quadraArquibancada;
    return CAP1_POINTS.oficinaRua;
  }

  /** Matias caiu e o jogador pediu para tentar de novo: ponto de recomeço do capítulo (null fora dele). */
  respawn(): Placement | null {
    if (!this.active) return null;
    if (this.isNight()) this.spawnPatrols();
    return this.respawnPoint();
  }

  // ------------------------------------------------------------------ M4
  private onVanEntered(): void {
    const h = this.host;
    const f = h.flags;
    if (this.phase !== "m4" || !f.has(F.ana) || f.getBool(D.embarcou)) return;
    f.set(D.embarcou, true);
    if (f.get(F.ana) === "vai") {
      h.hideNpc("ana");
      h.setPassenger("modulo_v7", "ana");
    } else {
      h.placeNpc("ana", CAP1_SPOTS.anaPortaPosto);
      h.placeNpc("raquel", CAP1_SPOTS.raquelPortaPosto);
    }
  }

  private onLimiteSetor(): void {
    const h = this.host;
    if (this.phase !== "m4" || this.seq || h.drivingId() !== "modulo_v7") return;
    const missing = M4_REQUIRED.filter((o) => !h.quests.isObjectiveDone(QUEST_PARTIDA, o));
    if (missing.length > 0) {
      const def = QUESTS.find((q) => q.id === QUEST_PARTIDA)?.objectives.find((o) => o.id === missing[0]);
      h.notice(`Ainda não. ${def?.text ?? "Falta resolver algo no setor"}.`, 4);
      return;
    }
    void this.departure();
  }

  /** Cutscene curta: a van segue sozinha até o posto de controle, fade e letreiro de fim do capítulo. */
  departure(): Promise<void> {
    return this.run(async () => {
      const h = this.host;
      this.phase = "m4_partida";
      h.setLetterbox(true);
      h.setAutoDrive({ throttle: 0.32, steer: 0, handbrake: false });
      h.setCinematicShot(CAP1_POINTS.guarita, "modulo_v7");
      await h.wait(2600);
      h.fade(true);
      await h.wait(1100);
      h.setAutoDrive({ throttle: 0, steer: 0, handbrake: true });
      h.flags.set(D.fim, true);
      h.quests.completeObjective(QUEST_PARTIDA, "partida");
      h.quests.complete(QUEST_PARTIDA);
      this.phase = "fim";
      h.sting("vitoria");
      h.checkpoint();
      h.showChapterEnd("Partida", this.endText(), this.endStats());
    });
  }

  private endText(): string {
    const vai = this.host.flags.get(F.ana) === "vai";
    return vai
      ? "A Módulo V-7 cruza o limite do Setor 17 rumo à Estação Nove. Ana vai no banco do passageiro, a mochila no colo — não porque o pai pediu. A seguir: Capítulo 2 — Estação Nove (em produção)."
      : "Ana fica com Raquel na porta do posto e levanta a mão, sem acenar. A Módulo V-7 cruza o limite do Setor 17 rumo à Estação Nove. A seguir: Capítulo 2 — Estação Nove (em produção).";
  }

  /** Resumo das escolhas do capítulo (tela final). */
  endStats(): Array<[string, string]> {
    const f = this.host.flags;
    const m2 = f.get(F.m2Decisao);
    const brandao = m2 === "silencio" ? "acordo (Ana em prioridade dois)" : f.getBool(X.brandaoPreso) ? "denunciado — preso" : f.getBool(X.brandaoSolto) ? "denunciado — continua no depósito" : "—";
    const noite = f.getBool(F.custodiosHostis) ? "atirou em Custódios" : f.getBool(F.detectado) ? "visto pelos Custódios" : "sem ser visto";
    return [
      ["Ana", f.get(F.ana) === "vai" ? "vai com Matias" : f.get(F.ana) === "fica" ? "fica com Raquel" : "—"],
      ["O lote (M1)", f.get(F.carregamentoDecisao) === "registro" ? "registrado com assinatura" : f.get(F.carregamentoDecisao) === "silencio" ? "distribuído em silêncio" : "—"],
      ["Samuel Brandão", brandao],
      ["Entrega ao posto", f.get(F.entregaNoPrazo) === true ? "antes do meio-dia" : f.get(F.entregaNoPrazo) === false ? "depois do meio-dia" : "—"],
      ["A Vigília", noite],
      ["Documento de 2056", f.get(F.documento) === "miriam" ? "mostrado a Miriam" : f.get(F.documento) === "guardou" ? "guardado" : "—"],
      ["Água do bairro", `${num(f.get(D.agua), BAIRRO_BASE.agua)}/100`],
      ["Caixas no posto", `${num(f.get(D.estoque), BAIRRO_BASE.estoque)}/6`],
    ];
  }

  // ------------------------------------------------------------------ transições
  /** "Continuar explorando" depois do Capítulo 0: amanhece o dia 2 e começa M2. */
  beginDay2(): Promise<void> {
    return this.run(async () => {
      const h = this.host;
      h.fade(true);
      await h.wait(900);
      h.exitVehicle();
      h.flags.set(D.dia2, true);
      h.quests.start(QUEST_RASTRO_DO_LOTE);
      this.applyConsequences(QUEST_RASTRO_DO_LOTE);
      h.placeVehicle("modulo_v7", CAP1_POINTS.vanOficina);
      h.placeVehicle("atlas_t3", CAP1_POINTS.atlasFeira);
      this.raquelAtPosto = false;
      this.enterPhase("m2", true);
      h.teleportPlayer(CAP1_POINTS.oficinaDentro, CAP1_POINTS.oficinaDentro.yaw);
      h.checkpoint();
      await h.wait(500);
      h.fade(false);
      h.notice("Dia 2 · 6h. Raquel espera junto à van, diante da oficina.", 5);
    });
  }

  /** Decisão do documento tomada: amanhece o dia 3 com as consequências de tudo (M4). */
  beginDay3(): Promise<void> {
    return this.run(async () => {
      const h = this.host;
      await h.wait(500);
      h.fade(true);
      await h.wait(1000);
      h.exitVehicle();
      h.quests.complete(QUEST_A_VIGILIA);
      h.quests.start(QUEST_PARTIDA);
      this.applyConsequences(QUEST_PARTIDA);
      h.placeVehicle("modulo_v7", CAP1_POINTS.vanPartida);
      h.placeVehicle("rastro_av4", CAP1_POINTS.rastroRua);
      if (h.flags.getBool(X.brandaoPreso)) h.placeVehicle("javali_vb4", CAP1_POINTS.javaliPortao);
      this.enterPhase("m4", true);
      h.teleportPlayer(CAP1_POINTS.oficinaDentro, CAP1_POINTS.oficinaDentro.yaw);
      h.checkpoint();
      await h.wait(500);
      h.fade(false);
      h.notice("Dia 3 · amanhecer. O Setor 17 carrega as escolhas dos últimos dois dias.", 5);
    });
  }

  private run(fn: () => Promise<void>): Promise<void> {
    if (this.seq) return this.seq;
    const p = (async () => {
      try {
        await fn();
      } catch (err) {
        console.error("[cap1] transição falhou", err);
      } finally {
        this.seq = null;
      }
    })();
    this.seq = p;
    return p;
  }

  // ------------------------------------------------------------------ montagem de cada fase
  /**
   * Entra numa fase: limpa a cena do capítulo, posiciona os atores (`npcLayout`), monta objetos/zonas e o
   * ambiente. `keep` = atores que já estão em cena e seguem o que estavam fazendo (sem teleporte à vista).
   */
  private enterPhase(phase: Chapter1Phase, instant: boolean, keep: ReadonlySet<Cap1Actor> = new Set()): void {
    this.phase = phase;
    const h = this.host;
    h.clearStage();
    for (const id of this.zones) h.script.removeZone(id);
    this.zones.clear();
    this.barriers.clear();
    const layout = npcLayout(phase, h.flags);
    for (const role of CAP1_ACTORS) {
      if (keep.has(role)) continue;
      const p = layout[role];
      const target = p === "spawn" ? h.spawnPlacement(role) : p;
      if (target) h.placeNpc(role, target);
      else h.hideNpc(role);
    }
    this.buildStage();
    this.applyEnvironment(instant);
  }

  private zone(spec: ZoneSpec): void {
    this.host.script.addZone(spec);
    this.host.script.resetZone(spec.id);
    this.zones.add(spec.id);
  }

  private barrier(id: string, kind: PropKind, center: Vec3, size: Vec3): void {
    this.host.addBarrier(id, kind, center, size);
    this.barriers.add(id);
  }

  private buildStage(): void {
    const h = this.host;
    const f = h.flags;
    switch (this.phase) {
      case "m2": {
        this.zone({ id: "deposito", center: v3(34.5, 1, 65.5), size: v3(20, 4, 14) });
        this.zone({ id: "posto", center: v3(24.4, 1, -12.5), radius: 6.5, requires: "veiculo", once: false });
        // portão de correr fechado até o Custódio liberar; grade de ventilação dos fundos (só agachado passa)
        if (!f.getBool(X.depositoLiberado)) this.barrier("porta_deposito", "porta", v3(33.5, 2.1, 57.75), v3(5.3, 4.2, 0.14));
        this.barrier("grade_fundos", "grade", v3(44.8, 1.87, 70), v3(0.5, 1.0, 1.4));
        // fundos do depósito: sacos de farinha na frente, caixas vazias atrás (a do meio é do mapa)
        h.addProp("saco_1", "saco", v3(33.1, 0.1, 69.3), 0.2);
        h.addProp("saco_2", "saco", v3(34.3, 0.1, 69.1), -0.1);
        h.addProp("saco_3", "saco", v3(35.5, 0.1, 69.4), 0.35);
        h.addProp("caixa_vazia_2", "caixa", v3(32.8, 0.1, 71.0), 0.3);
        h.addProp("caixa_vazia_3", "caixa", v3(35.2, 0.1, 71.1), -0.4);
        h.addProp("caderno", "caderno", v3(43.1, 0.81, 71.6), 0.25);
        h.addExaminable(EXAMES.caixas(v3(34, 0.6, 70.6)));
        h.addExaminable(EXAMES.caderno(v3(43.1, 0.83, 71.6)));
        if (f.getBool(X.vanConferida)) this.addVanExaminables();
        this.addBoards(false);
        if (f.getBool(D.entregue)) h.dropCargo(CAP1_POINTS.postoCaixa);
        else if (f.getBool(D.cargaNoAtlas)) h.setCargo("atlas_t3");
        else h.setCargo(null);
        break;
      }
      case "m3_tarde":
        if (!f.getBool(D.entardecer)) this.zone({ id: "oficina_tarde", center: v3(-30, 1.2, -10.5), size: v3(9.4, 4, 6.2), requires: "pe" });
        this.addBoards(false);
        h.dropCargo(CAP1_POINTS.postoCaixa);
        break;
      case "m3_toque":
      case "m3_fuga":
        this.zone({ id: "quadra", center: v3(-28, 1, -26.25), size: v3(25, 4, 14), requires: "pe" });
        this.zone({ id: "telhado_escola", center: v3(-6, 7, -29), radius: 8, height: 4, once: false });
        this.zone({ id: "oficina", center: v3(-30, 3, -2.5), radius: 10, height: 16, requires: "veiculo", once: false });
        h.addProp("bancada", "bancada", v3(-21.4, 0, -22.2), 0.1);
        h.addProp("folha_2056", "folha", v3(-21.4, 0.81, -22.2), 0.35);
        if (f.getBool(X.eliasEncontrado)) this.addDocumento();
        if (h.quests.isObjectiveDone(QUEST_A_VIGILIA, "telhado")) this.addEtiqueta();
        h.dropCargo(CAP1_POINTS.postoCaixa);
        break;
      case "m4":
      case "m4_partida":
      case "fim":
        this.zone({ id: "rua_amanhecer", center: v3(-30, 0.5, -4.4), radius: 2.8, requires: "pe" });
        this.zone({ id: "limite_setor", center: v3(72.5, 1, 70.5), radius: 9, requires: "veiculo", once: false });
        this.addBoards(true);
        if (f.get(F.m2Decisao) === "silencio") {
          h.addProp("lista", "lista", v3(25.9, 0, -16.2), 0);
          h.addExaminable(EXAMES.lista(v3(25.9, 1.45, -16.2)));
        }
        if (f.getBool(D.embarcou) && f.get(F.ana) === "vai") h.setPassenger("modulo_v7", "ana");
        h.setCargo(null);
        break;
      default:
        break;
    }
  }

  /** Quadro de avisos da praça (água e caixas — o "medidor do bairro" sem HUD nova) e tabela da banca. */
  private addBoards(withStock: boolean): void {
    const f = this.host.flags;
    const agua = num(f.get(D.agua), BAIRRO_BASE.agua);
    const estoque = num(f.get(D.estoque), BAIRRO_BASE.estoque);
    const preco = num(f.get(D.preco), BAIRRO_BASE.preco);
    this.host.addExaminable(EXAMES.quadro(agua, withStock ? estoque : null));
    this.host.addExaminable(EXAMES.tabela(preco));
  }

  private applyEnvironment(instant: boolean): void {
    const h = this.host;
    const f = h.flags;
    switch (this.phase) {
      case "m2":
        h.setDusk(CAP1_DUSK.manha, instant);
        h.setCurfew(false);
        h.clearPatrols();
        break;
      case "m3_tarde":
        h.setDusk(f.getBool(D.entardecer) ? CAP1_DUSK.entardecer : CAP1_DUSK.tarde, instant);
        h.setCurfew(false);
        h.clearPatrols();
        break;
      case "m3_toque":
      case "m3_fuga":
        h.setDusk(CAP1_DUSK.noite, instant);
        h.setCurfew(true);
        if (f.getBool(D.pousou)) h.clearPatrols();
        else this.spawnPatrols();
        break;
      case "m4":
      case "m4_partida":
      case "fim":
        h.setDusk(CAP1_DUSK.amanhecer, true);
        h.setDusk(CAP1_DUSK.manhaDia3, false);
        h.setCurfew(false);
        h.clearPatrols();
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------------ consequências
  /**
   * Aplica a tabela `CONSEQUENCES` ao iniciar uma missão (uma vez por missão; ao carregar só resolve de novo):
   * água/caixas cumulativos em flags, preço da banca, postura da patrulha e avisos em fila na HUD. Falas: os
   * grafos já começam pelos mesmos nós (testado em tests/unit/chapter1Director.test.ts); presença: `npcLayout`.
   */
  applyConsequences(quest: string): ResolvedConsequences {
    const f = this.host.flags;
    const r = resolveConsequences(f, quest);
    this.resolved = r;
    if (f.getBool(appliedFlag(quest))) return r;
    f.set(D.agua, clamp(num(f.get(D.agua), BAIRRO_BASE.agua) + r.agua, 0, 100));
    f.set(D.estoque, clamp(num(f.get(D.estoque), BAIRRO_BASE.estoque) + r.estoque, 0, 6));
    f.set(D.preco, Math.round(r.preco * 1000) / 1000);
    if (r.patrulha) f.set(patrolFlag(quest), r.patrulha);
    f.set(appliedFlag(quest), true);
    this.queueNotices(r.avisos);
    return r;
  }

  private queueNotices(texts: readonly string[]): void {
    for (const t of texts) this.notices.push({ text: t, seconds: 4.2 });
  }

  private pumpNotices(dt: number): void {
    if (this.notices.length === 0) return;
    this.noticeTimer -= dt;
    if (this.noticeTimer > 0) return;
    const n = this.notices.shift()!;
    this.host.notice(n.text, n.seconds);
    this.noticeTimer = n.seconds + 0.4;
  }

  // ------------------------------------------------------------------ depuração/testes
  snapshot(): Record<string, unknown> {
    const f = this.host.flags;
    return {
      phase: this.phase,
      busy: this.busy,
      agua: num(f.get(D.agua), BAIRRO_BASE.agua),
      estoque: num(f.get(D.estoque), BAIRRO_BASE.estoque),
      preco: num(f.get(D.preco), BAIRRO_BASE.preco),
      patrulha: f.get(patrolFlag(QUEST_PARTIDA)) ?? f.get(patrolFlag(QUEST_A_VIGILIA)) ?? f.get(patrolFlag(QUEST_RASTRO_DO_LOTE)) ?? null,
      consequencias: this.resolved ? { quest: this.resolved.quest, falas: this.resolved.falas, presenca: this.resolved.presenca, avisos: this.resolved.avisos.length } : null,
      noticesQueued: this.notices.length,
      zones: [...this.zones],
      actors: this.host.snapshotActors?.() ?? null,
    };
  }
}

// ---------------------------------------------------------------------------------------------
// Textos de exame (o que o close-up mostra). As pistas do diário são do Enredo (src/data/clues.ts).
// ---------------------------------------------------------------------------------------------
const EXAMES = {
  manifesto: (p: Vec3): ExaminableSpec => ({
    id: "manifesto_van",
    position: p,
    radius: 2.2,
    title: "Manifesto do lote CS-17",
    text: "Preso ao painel da van. 'Seis volumes' riscado para três, com a mesma caneta; ao lado, a rubrica S.B. O carimbo é do depósito da zona, não do conselho.",
    clue: "pista.manifesto_rasurado",
    prompt: "Ler o manifesto da van",
    cameraDistance: 1.0,
  }),
  lacres: (p: Vec3): ExaminableSpec => ({
    id: "lacres_van",
    position: p,
    radius: 2.4,
    title: "Lacres das caixas",
    text: "Três caixas no compartimento de carga. Os lacres foram cortados e refeitos: plástico novo, marca de dente de alicate de depósito.",
    clue: "pista.lacres_refeitos",
    prompt: "Examinar os lacres das caixas",
    cameraDistance: 1.2,
  }),
  caixas: (p: Vec3): ExaminableSpec => ({
    id: "caixas_vazias",
    position: p,
    radius: 2.4,
    title: "Caixas atrás dos sacos de farinha",
    text: "Três caixas da série CS-17, vazias. Ainda cheiram ao álcool do antibiótico.",
    clue: "pista.caixas_vazias",
    prompt: "Examinar as caixas atrás dos sacos",
    cameraDistance: 1.4,
  }),
  caderno: (p: Vec3): ExaminableSpec => ({
    id: "caderno_saida",
    position: p,
    radius: 2.0,
    title: "Caderno de saída do depósito",
    text: "Turno da noite, 21h40: lote CS-17, seis volumes. Oficial de turno: Brandão.",
    clue: "pista.caderno_de_saida",
    prompt: "Ler o caderno de saída",
    cameraDistance: 0.9,
  }),
  documento: (p: Vec3): ExaminableSpec => ({
    id: "documento_2056",
    position: p,
    radius: 2.0,
    title: "A última folha (2056)",
    text: "Cópia dobrada em quatro. Cabeçalho do Complexo Central, quase apagado: '…cadeia de revisão…', fl. 14/14. Só se leem a minha assinatura e o ano, 2056. O resto é tarja preta feita à mão.",
    clue: "pista.assinatura_2056",
    prompt: "Examinar a folha na bancada",
    cameraDistance: 0.9,
  }),
  etiqueta: (p: Vec3): ExaminableSpec => ({
    id: "rastro_etiqueta",
    position: p,
    radius: 2.2,
    title: "Etiqueta de manutenção",
    text: "CUSTÓDIA · EM MANUTENÇÃO. Rotor B: vibração. Aguardando peça do Vale dos Sinos. Bateria: metade.",
    clue: "pista.rastro_na_escola",
    prompt: "Ler a etiqueta da Rastro",
    cameraDistance: 1.0,
  }),
  lista: (p: Vec3): ExaminableSpec => ({
    id: "lista_apuracao",
    position: p,
    radius: 2.2,
    title: "Lista da Apuração de sexta",
    text: "Cópia afixada no posto. Ana aparece em prioridade dois, com o carimbo do depósito ao lado da linha.",
    clue: "pista.lista_prioridade_dois",
    prompt: "Ler a lista afixada",
    cameraDistance: 1.0,
  }),
  quadro: (agua: number, estoque: number | null): ExaminableSpec => ({
    id: "quadro_avisos",
    position: v3(23, 1.35, 10.5),
    radius: 2.4,
    title: "Quadro de avisos da praça",
    text: `Água do bairro nesta semana: ${agua}/100 (cotas de terça e sexta).${estoque !== null ? ` Caixas no posto da Raquel: ${estoque} de 6.` : ""}`,
    prompt: "Ler o quadro de avisos",
    cameraDistance: 1.3,
  }),
  tabela: (preco: number): ExaminableSpec => ({
    id: "tabela_banca",
    position: v3(71.9, 1.3, -15.4),
    radius: 1.6,
    title: "Tabela da banca (Selos)",
    text:
      preco > 1.001
        ? `Munição de pistola (12): ${Math.round(BANCA_PRECOS.municao * preco)} Selos. Kit médico: ${Math.round(BANCA_PRECOS.kit * preco)} Selos. O preço de ontem está riscado a giz.`
        : `Munição de pistola (12): ${BANCA_PRECOS.municao} Selos. Kit médico: ${BANCA_PRECOS.kit} Selos.`,
    prompt: "Ler a tabela da banca",
    cameraDistance: 1.2,
  }),
};

// =============================================================================================
// 4. Palco (Babylon)
// =============================================================================================

/** O que o `Game` entrega ao palco do capítulo (integração mínima em src/core/game.ts). */
export interface Chapter1Bridge {
  readonly scene: Scene;
  readonly mats: MaterialLibrary;
  readonly flags: GameFlags;
  readonly clues: ClueLog;
  readonly timers: MissionTimers;
  readonly script: MissionScript;
  readonly cargo: DeliveryCargo;
  readonly enemies: EnemyManager;
  quests(): QuestLog;
  spawnPoint(id: string): { position: Vector3; yaw: number } | undefined;
  npcs(): readonly Npc[];
  roleOf(npc: Npc): string;
  registerNpc(npc: Npc, role: string): void;
  createExaminable(spec: ExaminableSpec): Interactable;
  removeExaminable(it: Interactable): void;
  vehicles(): readonly Vehicle[];
  drivingId(): string | null;
  exitVehicle(): void;
  setCargo(vehicleId: string | null): boolean;
  spawnCustodio(x: number, z: number, yaw: number, patrol: Array<[number, number]>, extra: Partial<EnemySpawnSpec>): Promise<Enemy>;
  setCurfew(on: boolean): void;
  navmesh(): Navmesh | null;
  setDusk(level: number, instant: boolean): void;
  notice(text: string, seconds?: number): void;
  fade(black: boolean): void;
  setLetterbox(on: boolean): void;
  showMissionEnd(title: string, text: string, stats: Array<[string, string]>, opts: { kicker?: string; continueLabel?: string }): void;
  /** câmera de cena (null = volta a seguir o jogador) */
  setCameraShot(from: Vector3 | null, at?: Vector3): void;
  playerFeet(): Vector3;
  teleportPlayer(p: Vector3, yaw: number): void;
  isPlaying(): boolean;
  startDialogue(npc: Npc): void;
  startRadio(graph: DialogueGraph): void;
  setAutoDrive(c: AutoDrive | null): void;
  save(): void;
  sting(kind: "alerta" | "vitoria"): void;
  playTime(): number;
  addShadowCasters(meshes: AbstractMesh[]): void;
}

interface NpcInternals {
  collider?: TransformNode;
  body?: PhysicsBody;
  baseYaw?: number;
  yaw?: number;
  idleGestureTimer?: number;
}

/**
 * Reposiciona um NPC (modelo + colisor estático). O `Npc` não tem API de movimento; o corpo estático é
 * sincronizado pelo pré-passo da física (`disablePreStep = false` → teleporte a cada passo, custo desprezível).
 */
export function moveNpc(npc: Npc, p: Vec3, yaw: number): void {
  const inner = npc as unknown as NpcInternals;
  npc.model.root.position.set(p.x, p.y, p.z);
  npc.model.setYaw(yaw);
  if (typeof inner.baseYaw === "number") inner.baseYaw = yaw;
  if (typeof inner.yaw === "number") inner.yaw = yaw;
  if (inner.collider) inner.collider.position.set(p.x, p.y + npc.model.height / 2, p.z);
  if (inner.body) inner.body.disablePreStep = false;
}

interface Piece {
  meshes: Mesh[];
  nodes: TransformNode[];
  bodies: PhysicsBody[];
}

/** Palco do capítulo sobre o motor: implementa `Chapter1Host` para o diretor. */
export class Chapter1Stage implements Chapter1Host {
  private cast = new Map<CastRole, Npc>();
  private castLoading = new Map<CastRole, Promise<Npc | null>>();
  /** última ordem por ator (null = fora de cena) — aplicada também quando o elenco termina de carregar */
  private desired = new Map<string, Placement | null>();
  private hidden = new Set<string>();
  private walks = new Map<string, { to: Placement; speed: number; hide: boolean }>();
  private examinables = new Map<string, Interactable>();
  private pieces = new Map<string, Piece>();
  private patrols: Enemy[] = [];
  private patrolGen = 0;
  private passenger: { model: CharacterModel; vehicleId: string } | null = null;
  private passengerGen = 0;
  private shot: { from: Vector3; follow: string } | null = null;
  private ownMats = new Map<string, StandardMaterial>();

  constructor(private readonly b: Chapter1Bridge) {}

  get flags(): GameFlags {
    return this.b.flags;
  }
  get quests(): QuestLog {
    return this.b.quests();
  }
  get clues(): ClueLog {
    return this.b.clues;
  }
  get timers(): MissionTimers {
    return this.b.timers;
  }
  get script(): MissionScript {
    return this.b.script;
  }

  // --- HUD, tempo, ambiente
  notice(text: string, seconds?: number): void {
    this.b.notice(text, seconds);
  }
  fade(black: boolean): void {
    this.b.fade(black);
  }
  wait(ms: number): Promise<void> {
    return new Promise((r) => window.setTimeout(r, ms));
  }
  setDusk(level: number, instant: boolean): void {
    this.b.setDusk(level, instant);
  }
  setCurfew(on: boolean): void {
    this.b.setCurfew(on);
  }
  setLetterbox(on: boolean): void {
    this.b.setLetterbox(on);
  }
  checkpoint(): void {
    this.b.save();
  }
  sting(kind: "alerta" | "vitoria"): void {
    this.b.sting(kind);
  }
  isPlaying(): boolean {
    return this.b.isPlaying();
  }

  // --- jogador e veículos
  playerFeet(): Vec3 {
    return this.b.playerFeet();
  }
  teleportPlayer(p: Vec3, yaw: number): void {
    this.b.teleportPlayer(new Vector3(p.x, p.y, p.z), yaw);
  }
  drivingId(): string | null {
    return this.b.drivingId();
  }
  exitVehicle(): void {
    this.b.exitVehicle();
  }
  private vehicle(id: string): Vehicle | undefined {
    return this.b.vehicles().find((v) => v.def.id === id);
  }
  vehiclePlacement(id: string): Placement | null {
    const v = this.vehicle(id);
    if (!v) return null;
    const p = v.position;
    return { x: p.x, y: p.y, z: p.z, yaw: v.heading };
  }
  placeVehicle(id: string, p: Placement): void {
    const v = this.vehicle(id);
    if (!v || v.occupied) return;
    v.teleport(new Vector3(p.x, p.y, p.z), p.yaw);
  }
  setCargo(vehicleId: string | null): void {
    this.b.setCargo(vehicleId);
  }
  dropCargo(p: Vec3): void {
    // a caixa só existe depois de presa a um veículo: prende ao Atlas e solta no chão do posto
    if (!this.b.cargo.mesh) this.b.setCargo("atlas_t3");
    this.b.cargo.detach(new Vector3(p.x, p.y, p.z));
  }
  setPassenger(vehicleId: string, role: "ana" | null): void {
    const gen = ++this.passengerGen;
    if (this.passenger) {
      this.passenger.model.dispose();
      this.passenger = null;
    }
    if (!role) return;
    void loadCharacter(this.b.scene, role, "_passageira")
      .then((model) => {
        const v = this.vehicle(vehicleId);
        if (gen !== this.passengerGen || !v) {
          model.dispose();
          return;
        }
        // banco do passageiro: espelho do banco do motorista (o GLB do veículo não tem nó para isso)
        model.root.parent = v.anchor;
        model.root.position.set(-v.def.seat.x, v.def.seat.y, v.def.seat.z);
        model.root.rotationQuaternion = Quaternion.Identity();
        model.animator.play("Sit");
        this.passenger = { model, vehicleId };
      })
      .catch((err) => console.error("[cap1] passageira", err));
  }
  setAutoDrive(c: AutoDrive | null): void {
    this.b.setAutoDrive(c);
  }
  setCinematicShot(from: Vec3 | null, followVehicle?: string): void {
    if (!from || !followVehicle) {
      this.shot = null;
      this.b.setCameraShot(null);
      return;
    }
    this.shot = { from: new Vector3(from.x, from.y, from.z), follow: followVehicle };
  }

  // --- atores
  private npc(role: string): Npc | null {
    if (isCastRole(role)) return this.cast.get(role) ?? null;
    return this.b.npcs().find((n) => this.b.roleOf(n) === role) ?? null;
  }

  spawnPlacement(role: Cap1Actor): Placement | null {
    const sp = this.b.spawnPoint(role);
    return sp ? { x: sp.position.x, y: sp.position.y, z: sp.position.z, yaw: sp.yaw } : null;
  }

  private apply(role: string, npc: Npc, p: Placement | null): void {
    if (p) {
      moveNpc(npc, p, p.yaw);
      npc.model.setVisible(true);
      this.hidden.delete(role);
    } else {
      moveNpc(npc, CAP1_POINTS.bastidor, 0);
      npc.model.setVisible(false);
      npc.setTalking(false);
      this.hidden.add(role);
    }
  }

  placeNpc(role: Cap1Actor, p: Placement): void {
    this.walks.delete(role);
    this.desired.set(role, p);
    const npc = this.npc(role);
    if (npc) this.apply(role, npc, p);
    else if (isCastRole(role)) void this.ensureCast(role);
  }

  hideNpc(role: Cap1Actor): void {
    this.walks.delete(role);
    this.desired.set(role, null);
    const npc = this.npc(role);
    if (npc) this.apply(role, npc, null);
  }

  walkNpc(role: Cap1Actor, to: Placement, speed: number, hideAtEnd = false): void {
    const npc = this.npc(role);
    if (!npc && !isCastRole(role)) return;
    if (npc && this.hidden.has(role)) {
      // fora de cena não anda: aparece direto no destino (ou continua fora)
      this.desired.set(role, hideAtEnd ? null : to);
      this.apply(role, npc, hideAtEnd ? null : to);
      return;
    }
    this.walks.set(role, { to, speed, hide: hideAtEnd });
    this.desired.set(role, hideAtEnd ? null : to);
    if (!npc && isCastRole(role)) void this.ensureCast(role);
  }

  stopWalk(role: Cap1Actor): void {
    if (!this.walks.delete(role)) return;
    const npc = this.npc(role);
    if (!npc) return;
    // para onde está, encarando Matias (a conversa começou no meio do caminho)
    const p = npc.getPosition();
    const feet = this.b.playerFeet();
    const yaw = Math.atan2(feet.x - p.x, feet.z - p.z);
    const here = { x: p.x, y: p.y, z: p.z, yaw };
    this.desired.set(role, here);
    this.apply(role, npc, here);
  }

  npcPosition(role: Cap1Actor): Vec3 | null {
    const npc = this.npc(role);
    if (!npc || this.hidden.has(role)) return null;
    const p = npc.getPosition();
    return { x: p.x, y: p.y, z: p.z };
  }

  talkTo(role: Cap1Actor, maxDistance: number): boolean {
    const npc = this.npc(role);
    if (!npc || this.hidden.has(role) || !this.b.isPlaying()) return false;
    if (dist2d(npc.getPosition(), this.b.playerFeet()) > maxDistance) return false;
    this.b.startDialogue(npc);
    return true;
  }

  startRadio(graph: DialogueGraph): void {
    this.b.startRadio(graph);
  }

  /** Carrega o papel provisório (GLB de outra variante) e o registra como NPC falante. */
  private ensureCast(role: CastRole): Promise<Npc | null> {
    const loading = this.castLoading.get(role);
    if (loading) return loading;
    const info = PROVISIONAL_CAST[role];
    const p = (async () => {
      try {
        const start = this.desired.get(role) ?? CAP1_POINTS.bastidor;
        const model = await loadCharacter(this.b.scene, info.model, `_${role}`);
        const npc = new Npc(this.b.scene, model, new Vector3(start.x, start.y, start.z), start.yaw);
        npc.promptOverride = info.prompt;
        this.cast.set(role, npc);
        this.b.registerNpc(npc, role);
        this.b.addShadowCasters(model.meshes);
        this.apply(role, npc, this.desired.get(role) ?? null);
        return npc;
      } catch (err) {
        console.error(`[cap1] falha ao carregar o papel ${role}`, err);
        this.castLoading.delete(role);
        return null;
      }
    })();
    this.castLoading.set(role, p);
    return p;
  }

  /** O ator está em cena e pronto (elenco carregado)? — testes. */
  actorReady(role: Cap1Actor): boolean {
    return this.npc(role) !== null && !this.hidden.has(role);
  }

  // --- objetos de cena
  addExaminable(spec: ExaminableSpec): void {
    this.removeExaminable(spec.id);
    this.examinables.set(spec.id, this.b.createExaminable(spec));
  }
  removeExaminable(id: string): void {
    const it = this.examinables.get(id);
    if (!it) return;
    this.b.removeExaminable(it);
    this.examinables.delete(id);
  }

  private mat(key: string, hex: string): StandardMaterial {
    let m = this.ownMats.get(key);
    if (!m) {
      m = new StandardMaterial(`cap1_mat_${key}`, this.b.scene);
      m.diffuseColor = Color3.FromHexString(hex);
      m.specularColor = new Color3(0.05, 0.05, 0.05);
      this.ownMats.set(key, m);
    }
    return m;
  }

  private box(piece: Piece, name: string, size: Vec3, center: Vec3, yaw: number, mat: Material, collider: boolean): void {
    const m: Mesh = MeshBuilder.CreateBox(`cap1_${name}`, { width: size.x, height: size.y, depth: size.z }, this.b.scene);
    m.position.set(center.x, center.y, center.z);
    m.rotation.y = yaw;
    m.material = mat;
    m.isPickable = false;
    m.receiveShadows = true;
    piece.meshes.push(m);
    if (collider) {
      const node = new TransformNode(`col_cap1_${name}`, this.b.scene);
      node.position.set(center.x, center.y, center.z);
      node.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), yaw);
      const shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(size.x, size.y, size.z), this.b.scene);
      shape.filterMembershipMask = COLLISION.WORLD | COLLISION.CAMERA_BLOCKER;
      shape.filterCollideMask = COLLISION.PLAYER | COLLISION.NPC | COLLISION.PROP | COLLISION.VEHICLE | COLLISION.ENEMY;
      const body = new PhysicsBody(node, PhysicsMotionType.STATIC, false, this.b.scene);
      body.shape = shape;
      piece.bodies.push(body);
      piece.nodes.push(node);
    }
  }

  addProp(id: string, kind: PropKind, p: Vec3, yaw = 0): void {
    this.removeProp(id);
    const piece: Piece = { meshes: [], nodes: [], bodies: [] };
    const M = this.b.mats;
    switch (kind) {
      case "caixa":
        this.box(piece, id, v3(0.9, 0.5, 0.6), v3(p.x, p.y + 0.25, p.z), yaw, M.wood, true);
        break;
      case "saco":
        this.box(piece, id, v3(0.72, 0.36, 0.46), v3(p.x, p.y + 0.18, p.z), yaw, this.mat("saco", "#cdbf9c"), false);
        this.box(piece, `${id}_b`, v3(0.6, 0.3, 0.4), v3(p.x + 0.05, p.y + 0.5, p.z + 0.02), yaw + 0.3, this.mat("saco", "#cdbf9c"), false);
        break;
      case "caderno":
        this.box(piece, id, v3(0.24, 0.03, 0.32), v3(p.x, p.y + 0.015, p.z), yaw, this.mat("caderno", "#2c3e31"), false);
        break;
      case "bancada":
        this.box(piece, id, v3(1.3, 0.78, 0.6), v3(p.x, p.y + 0.39, p.z), yaw, M.wood, true);
        break;
      case "folha":
        this.box(piece, id, v3(0.3, 0.005, 0.21), v3(p.x, p.y, p.z), yaw, M.paperWhite, false);
        break;
      case "lista":
        this.box(piece, `${id}_poste`, v3(0.06, 1.5, 0.06), v3(p.x, p.y + 0.75, p.z), yaw, M.woodDark, false);
        this.box(piece, id, v3(0.46, 0.62, 0.02), v3(p.x, p.y + 1.45, p.z + 0.05), yaw, M.paperWhite, false);
        break;
      case "porta":
      case "grade":
        break;
      default:
        break;
    }
    this.pieces.set(id, piece);
  }

  addBarrier(id: string, kind: PropKind, center: Vec3, size: Vec3): void {
    this.removeProp(id);
    const piece: Piece = { meshes: [], nodes: [], bodies: [] };
    this.box(piece, id, size, center, 0, kind === "grade" ? this.b.mats.metalRust : this.b.mats.metalPainted, true);
    this.pieces.set(id, piece);
  }

  removeProp(id: string): void {
    const piece = this.pieces.get(id);
    if (!piece) return;
    for (const b of piece.bodies) b.dispose();
    for (const n of piece.nodes) n.dispose();
    for (const m of piece.meshes) m.dispose();
    this.pieces.delete(id);
  }

  clearStage(): void {
    for (const id of [...this.examinables.keys()]) this.removeExaminable(id);
    for (const id of [...this.pieces.keys()]) this.removeProp(id);
  }

  // --- furtividade
  spawnPatrol(spec: PatrolSpec): void {
    const gen = this.patrolGen;
    const loop = this.patrolLoop(spec.route);
    void this.b
      .spawnCustodio(spec.start.x, spec.start.z, spec.start.yaw, loop, { awareness: spec.awareness, detectionsToHostile: 99 })
      .then((enemy) => {
        if (gen !== this.patrolGen) {
          this.removeEnemy(enemy); // a ronda foi desfeita enquanto o modelo carregava
          return;
        }
        this.patrols.push(enemy);
        enemy.health.onDamage.on(() => spec.onHurt?.());
      })
      .catch((err) => console.error(`[cap1] patrulha ${spec.id}`, err));
  }

  clearPatrols(): void {
    this.patrolGen++;
    for (const e of this.patrols) this.removeEnemy(e);
    this.patrols = [];
  }

  private removeEnemy(e: Enemy): void {
    const list = this.b.enemies.enemies;
    const i = list.indexOf(e);
    if (i >= 0) list.splice(i, 1);
    e.dispose();
  }

  /** Laço de patrulha pelas âncoras, seguindo a navmesh entre elas (sem navmesh: linha reta). */
  private patrolLoop(route: readonly Vec3[]): Array<[number, number]> {
    const nav = this.b.navmesh();
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < route.length; i++) {
      const a = route[i]!;
      const c = route[(i + 1) % route.length]!;
      let seg: Vec3[] = [];
      if (nav) {
        try {
          seg = nav.findPath(new Vector3(a.x, 0.1, a.z), new Vector3(c.x, 0.1, c.z));
        } catch {
          seg = [];
        }
      }
      if (seg.length < 2) seg = [a, c];
      for (let k = 0; k < seg.length - 1; k++) {
        const s = seg[k]!;
        const last = pts[pts.length - 1];
        if (!last || Math.hypot(last[0] - s.x, last[1] - s.z) > 0.5) pts.push([s.x, s.z]);
      }
    }
    return pts;
  }

  // --- final
  showChapterEnd(title: string, text: string, stats: Array<[string, string]>): void {
    const t = this.b.playTime();
    const min = Math.floor(t / 60);
    const sec = Math.floor(t % 60);
    this.b.showMissionEnd(title, text, [...stats, ["Tempo de jogo", `${min}m ${String(sec).padStart(2, "0")}s`]], { kicker: "Fim do Capítulo 1", continueLabel: "Continuar explorando" });
  }

  // --- quadro a quadro
  update(dt: number): void {
    for (const [role, w] of [...this.walks]) {
      const npc = this.npc(role);
      if (!npc) continue;
      const pos = npc.getPosition();
      const dx = w.to.x - pos.x;
      const dz = w.to.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.08) {
        this.walks.delete(role);
        this.apply(role, npc, w.hide ? null : w.to);
        npc.model.animator.play("Idle");
        continue;
      }
      const step = Math.min(d, w.speed * dt);
      moveNpc(npc, { x: pos.x + (dx / d) * step, y: w.to.y, z: pos.z + (dz / d) * step }, Math.atan2(dx, dz));
      (npc as unknown as NpcInternals).idleGestureTimer = 5; // sem gesto de "mexer em objetos" andando
      if (!npc.isTalking && npc.model.animator.clip !== "Walk") npc.model.animator.play("Walk");
    }
    this.passenger?.model.animator.update(dt);
    if (this.shot) {
      const v = this.vehicle(this.shot.follow);
      if (v) this.b.setCameraShot(this.shot.from, v.position.add(new Vector3(0, 1.3, 0)));
    }
  }

  // --- novo jogo / carregar
  resetWorld(vehiclesToo: boolean): void {
    this.walks.clear();
    this.desired.clear();
    this.clearStage();
    this.clearPatrols();
    this.setPassenger("modulo_v7", null);
    this.setCinematicShot(null);
    this.b.setAutoDrive(null);
    for (const role of CAP1_ACTORS) {
      const npc = this.npc(role);
      if (!npc) continue;
      if (isCastRole(role)) this.apply(role, npc, null);
      else this.apply(role, npc, this.spawnPlacement(role));
    }
    if (vehiclesToo) {
      for (const sp of vehicleSpawns()) {
        const v = this.vehicle(sp.id);
        if (v && !v.occupied) v.teleport(sp.position.clone(), sp.yaw);
      }
    }
  }

  snapshotActors(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const role of CAP1_ACTORS) {
      const npc = this.npc(role);
      if (!npc) {
        out[role] = isCastRole(role) && this.castLoading.has(role) ? "carregando" : null;
        continue;
      }
      const p = npc.getPosition();
      out[role] = { x: +p.x.toFixed(2), z: +p.z.toFixed(2), visible: !this.hidden.has(role), walking: this.walks.has(role) };
    }
    out.patrols = this.patrols.length;
    out.passenger = this.passenger ? this.passenger.vehicleId : null;
    out.examinables = [...this.examinables.keys()];
    out.pieces = [...this.pieces.keys()];
    return out;
  }
}

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { GameFlags } from "./flags";
import type { QuestLog } from "./quests";
import { QUEST_CARREGAMENTO } from "@/data/quests";
import type { EnemyManager, EnemySpawnSpec } from "@/ai/enemyManager";
import type { PickupSpec } from "@/items/pickup";
import { WORKSHOP } from "@/world/workshop";
import { STREET } from "@/world/street";

export type MissionPhase = "apuracao" | "anoitecer" | "armado" | "onda1" | "onda2" | "fuga" | "entrega" | "trancar" | "decisao" | "concluida";

/** O que o diretor precisa do jogo (implementado por Game). */
export interface MissionHost {
  flags: GameFlags;
  quests: QuestLog;
  enemies: EnemyManager;
  setDusk(target: number): void;
  dusk(): number;
  playerFeet(): Vector3;
  playerAlive(): boolean;
  drivingId(): string | null;
  vehiclePosition(id: string): Vector3 | null;
  notice(text: string, seconds?: number): void;
  equipPistol(ammo: number): Promise<void>;
  spawnPickup(spec: PickupSpec): Promise<void>;
  checkpoint(): void;
  /** inicia o diálogo do rádio final (Raquel) */
  startRadioFinal(): void;
  /** inicia o diálogo com um NPC se Matias estiver perto; devolve se iniciou */
  talkTo(variant: "custodio", maxDistance: number): boolean;
  npcPosition(variant: "custodio"): Vector3 | null;
  playSting(kind: "alerta" | "vitoria"): void;
}

/** Zonas e pontos da missão (coordenadas do mundo atual). */
export const MISSION_POINTS = {
  gate: new Vector3(34, 0.12, 15),
  vanSpawn: new Vector3(26, 0.12, 13),
  workshopFront: new Vector3(WORKSHOP.doorX, 0.12, -2.5),
  workshopDoor: new Vector3(WORKSHOP.doorX, 0.12, WORKSHOP.zFront + 0.7),
  checkpoint: new Vector3(30.5, 0.12, 12.5),
};

const P = STREET.plaza;

export const WAVE_1: EnemySpawnSpec[] = [
  { position: new Vector3(9.5, 0.12, 1.5), yaw: Math.PI / 2, patrol: [new Vector3(20, 0.12, 5), new Vector3(27, 0.12, 9), new Vector3(31, 0.12, 13)], variant: "saqueador_a" },
  { position: new Vector3(8, 0.12, -2), yaw: Math.PI / 2, patrol: [new Vector3(19, 0.12, -1), new Vector3(29, 0.12, 6), new Vector3(33, 0.12, 11)], variant: "saqueador_b", accuracy: 0.5 },
  { position: new Vector3(11, 0.12, 4.5), yaw: Math.PI / 2, patrol: [new Vector3(18, 0.12, 9), new Vector3(24, 0.12, 11), new Vector3(28, 0.12, 14)], variant: "saqueador_a", health: 60 },
];

export const WAVE_2: EnemySpawnSpec[] = [
  { position: new Vector3(P.x1 - 2, 0.12, P.z0 + 2), yaw: -Math.PI / 2, patrol: [], hostile: true, variant: "saqueador_b" },
  { position: new Vector3(36, 0.12, P.z0 + 1.5), yaw: 0, patrol: [], hostile: true, variant: "saqueador_a", accuracy: 0.6 },
  { position: new Vector3(12, 0.12, 0), yaw: Math.PI / 2, patrol: [], hostile: true, variant: "saqueador_b", health: 80, damage: 10 },
  { position: new Vector3(P.x1 - 3, 0.12, -4), yaw: -Math.PI / 2, patrol: [], hostile: true, variant: "saqueador_a" },
];

/**
 * Diretor da missão "O Carregamento": lê flags/objetivos e dispara anoitecer, armamento, ondas de inimigos,
 * fuga de van, entrega e decisão final. Também reinicia a onda atual quando Matias cai.
 */
export class MissionDirector {
  phase: MissionPhase = "apuracao";
  private waveTimer = 0;
  private pendingWave: 1 | 2 | null = null;
  private deathTimer = 0;
  private vanNoticeShown = false;
  readonly onPhaseChange: ((phase: MissionPhase) => void)[] = [];

  constructor(private readonly host: MissionHost) {}

  /** Recalcula a fase a partir das flags (novo jogo, carregar). */
  syncFromFlags(): void {
    const f = this.host.flags;
    const q = this.host.quests;
    const done = (o: string) => q.isObjectiveDone(QUEST_CARREGAMENTO, o);
    if (q.get(QUEST_CARREGAMENTO)?.state.status === "completed") this.setPhase("concluida");
    else if (done("trancar")) this.setPhase("decisao");
    else if (done("oficina")) this.setPhase("trancar");
    else if (done("van")) this.setPhase("entrega");
    else if (f.getBool("carregamento.vencido")) this.setPhase("fuga");
    else if (f.getBool("carregamento.onda1")) this.setPhase("onda2");
    else if (f.getBool("carregamento.armado")) this.setPhase("onda1");
    else if (f.getBool("custodio.avisouLote")) this.setPhase("anoitecer");
    else this.setPhase("apuracao");
    if (this.phase !== "apuracao") this.host.setDusk(1);
    if (this.phase !== "apuracao" && this.phase !== "anoitecer") void this.placeStaticPickups();
    // ondas pendentes ao carregar no meio do combate: recria a onda
    if (this.phase === "onda1" || this.phase === "onda2") {
      this.pendingWave = this.phase === "onda1" ? 1 : 2;
      this.waveTimer = 1.0;
    }
  }

  private setPhase(p: MissionPhase): void {
    if (this.phase === p) return;
    this.phase = p;
    for (const cb of this.onPhaseChange) cb(p);
  }

  update(dt: number): void {
    const h = this.host;
    const f = h.flags;
    switch (this.phase) {
      case "apuracao":
        if (f.getBool("custodio.avisouLote")) {
          this.setPhase("anoitecer");
          h.setDusk(1);
          h.notice("O sol começa a baixar sobre o Setor 17.", 4);
        }
        break;
      case "anoitecer":
        if (h.dusk() > 0.8 && !f.getBool("carregamento.anoitecer")) {
          f.set("carregamento.anoitecer", true);
          h.notice("Anoiteceu. Volte ao portão da Central.", 4);
        }
        if (f.getBool("carregamento.armado")) {
          this.setPhase("armado");
          void this.arm();
        }
        break;
      case "armado":
        // aguarda a pistola e dispara a primeira onda
        this.waveTimer -= dt;
        if (this.pendingWave === 1 && this.waveTimer <= 0) {
          this.pendingWave = null;
          void this.spawnWave(1);
          this.setPhase("onda1");
        }
        break;
      case "onda1":
      case "onda2":
        this.updateCombat(dt);
        break;
      case "fuga": {
        // Custódio ferido fala quando Matias se aproxima; entrar na van avança de qualquer jeito
        if (!f.getBool("carregamento.fuga")) {
          const cp = h.npcPosition("custodio");
          if (cp && Vector3.Distance(cp, h.playerFeet()) < 7) h.talkTo("custodio", 7);
        }
        if (h.drivingId() === "modulo_v7") {
          f.set("carregamento.fuga", true);
          h.quests.completeObjective(QUEST_CARREGAMENTO, "van");
          this.setPhase("entrega");
          h.checkpoint();
        }
        break;
      }
      case "entrega": {
        const vp = h.vehiclePosition("modulo_v7");
        if (vp && Vector3.Distance(new Vector3(vp.x, 0, vp.z), new Vector3(MISSION_POINTS.workshopFront.x, 0, MISSION_POINTS.workshopFront.z)) < 7) {
          h.quests.completeObjective(QUEST_CARREGAMENTO, "oficina");
          this.setPhase("trancar");
          h.notice("Desça da van e tranque o carregamento na oficina.", 4);
          h.checkpoint();
        } else if (!this.vanNoticeShown && h.drivingId() !== "modulo_v7" && vp && Vector3.Distance(vp, h.playerFeet()) > 12) {
          this.vanNoticeShown = true;
          h.notice("O carregamento está na van. Leve-a até a oficina.", 4);
        }
        break;
      }
      case "trancar":
        if (h.quests.isObjectiveDone(QUEST_CARREGAMENTO, "trancar")) {
          this.setPhase("decisao");
          window.setTimeout(() => h.startRadioFinal(), 1200);
        }
        break;
      case "decisao":
        if (h.quests.get(QUEST_CARREGAMENTO)?.state.status === "completed") {
          this.setPhase("concluida");
          h.playSting("vitoria");
        }
        break;
      default:
        break;
    }
  }

  private async placeStaticPickups(): Promise<void> {
    const h = this.host;
    await h.spawnPickup({ id: "municao_van_1", item: "municao_pistola", amount: 12, position: MISSION_POINTS.vanSpawn.add(new Vector3(2.2, 0, -2.4)), model: "caixa_municao", prompt: "Pegar munição (12)" });
    await h.spawnPickup({ id: "municao_van_2", item: "municao_pistola", amount: 12, position: new Vector3(37.5, 0.12, 14.2), model: "caixa_municao", prompt: "Pegar munição (12)" });
    await h.spawnPickup({ id: "kit_posto", item: "kit_medico", amount: 1, position: new Vector3(31.5, 0.12, 9.2), model: "kit_medico", prompt: "Pegar kit médico" });
  }

  private async arm(): Promise<void> {
    const h = this.host;
    h.quests.completeObjective(QUEST_CARREGAMENTO, "portao");
    await h.equipPistol(36);
    await this.placeStaticPickups();
    h.checkpoint();
    h.notice("Pistola de serviço: botão direito mira, esquerdo atira, R recarrega.", 5);
    this.pendingWave = 1;
    this.waveTimer = 3.0;
  }

  private async spawnWave(n: 1 | 2): Promise<void> {
    const h = this.host;
    h.enemies.clear();
    const specs = n === 1 ? WAVE_1 : WAVE_2;
    for (const spec of specs) await h.enemies.spawn(spec);
    h.playSting("alerta");
    h.notice(n === 1 ? "Desviadores chegando pela rua." : "Mais homens pelo lado leste da praça!", 4);
  }

  private updateCombat(dt: number): void {
    const h = this.host;
    const f = h.flags;
    if (this.pendingWave !== null) {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) {
        const w = this.pendingWave;
        this.pendingWave = null;
        void this.spawnWave(w);
      }
      return;
    }
    if (!h.playerAlive()) return;
    if (h.enemies.enemies.length === 0) return; // ainda carregando
    if (h.enemies.aliveCount > 0) return;
    if (this.phase === "onda1") {
      f.set("carregamento.onda1", true);
      h.quests.completeObjective(QUEST_CARREGAMENTO, "defender");
      h.checkpoint();
      this.setPhase("onda2");
      this.pendingWave = 2;
      this.waveTimer = 4.0;
    } else if (this.phase === "onda2") {
      f.set("carregamento.vencido", true);
      h.quests.completeObjective(QUEST_CARREGAMENTO, "segunda_leva");
      h.notice("Silêncio na praça. O Custódio está ferido junto à van.", 4);
      this.setPhase("fuga");
      h.checkpoint();
    }
  }

  /** Matias caiu: recomeça a onda atual. */
  restartWave(): void {
    if (this.phase === "onda1" || this.phase === "onda2") {
      this.pendingWave = this.phase === "onda1" ? 1 : 2;
      this.waveTimer = 1.5;
      this.host.enemies.clear();
    }
  }

  get inCombat(): boolean {
    return (this.phase === "onda1" || this.phase === "onda2") && this.host.enemies.aliveCount > 0;
  }

  /** Posição de renascimento (junto à van, atrás da cobertura). */
  get respawnPoint(): Vector3 {
    return MISSION_POINTS.checkpoint.clone();
  }
}

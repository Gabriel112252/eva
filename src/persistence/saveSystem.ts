import type { KeyValueStore } from "./saveStore";
import type { FlagValue } from "@/narrative/flags";
import type { QuestSnapshot } from "@/narrative/quests";
import { DEFAULT_SETTINGS, sanitizeSettings, type GameSettings } from "@/core/settings";

export const SAVE_SCHEMA_VERSION = 1;
export const SAVE_SLOT_KEY = "save:slot0";
export const SETTINGS_KEY = "settings";

export interface PlayerSave {
  position: { x: number; y: number; z: number };
  yaw: number;
  crouched: boolean;
}

export interface SaveData {
  version: number;
  savedAt: string;
  chapter: string;
  player: PlayerSave;
  flags: Record<string, FlagValue>;
  quests: QuestSnapshot;
  dialogueHistory: string[];
  /** estado de objetos do mundo (rádio desligado, cartão pego, etc.) */
  world: Record<string, FlagValue>;
  playTimeSeconds: number;
}

export function createEmptySave(player: PlayerSave): SaveData {
  return {
    version: SAVE_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    chapter: "prologo_a_apuracao",
    player,
    flags: {},
    quests: {},
    dialogueHistory: [],
    world: {},
    playTimeSeconds: 0,
  };
}

/** Migração de esquema: cada versão antiga é promovida até a atual. */
export function migrateSave(raw: unknown): SaveData | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Partial<SaveData> & { version?: number };
  if (typeof data.version !== "number") return null;
  let current: Partial<SaveData> = { ...data };
  // v0 → v1 (exemplo de migração futura; hoje só normaliza campos ausentes)
  if ((current.version ?? 0) < 1) {
    current = { ...current, version: 1, world: current.world ?? {}, playTimeSeconds: current.playTimeSeconds ?? 0 };
  }
  if (!current.player || typeof current.player !== "object") return null;
  return {
    version: SAVE_SCHEMA_VERSION,
    savedAt: typeof current.savedAt === "string" ? current.savedAt : new Date().toISOString(),
    chapter: typeof current.chapter === "string" ? current.chapter : "prologo_a_apuracao",
    player: {
      position: {
        x: Number(current.player.position?.x ?? 0),
        y: Number(current.player.position?.y ?? 0),
        z: Number(current.player.position?.z ?? 0),
      },
      yaw: Number(current.player.yaw ?? 0),
      crouched: current.player.crouched === true,
    },
    flags: current.flags && typeof current.flags === "object" ? current.flags : {},
    quests: current.quests && typeof current.quests === "object" ? current.quests : {},
    dialogueHistory: Array.isArray(current.dialogueHistory) ? current.dialogueHistory.filter((s): s is string => typeof s === "string") : [],
    world: current.world && typeof current.world === "object" ? current.world : {},
    playTimeSeconds: Number(current.playTimeSeconds ?? 0),
  };
}

export class SaveSystem {
  constructor(private readonly store: KeyValueStore) {}

  get backend(): string {
    return this.store.backend;
  }

  async load(): Promise<SaveData | null> {
    const raw = await this.store.get<unknown>(SAVE_SLOT_KEY);
    return migrateSave(raw);
  }

  async save(data: SaveData): Promise<void> {
    await this.store.set(SAVE_SLOT_KEY, { ...data, version: SAVE_SCHEMA_VERSION, savedAt: new Date().toISOString() });
  }

  async clear(): Promise<void> {
    await this.store.delete(SAVE_SLOT_KEY);
  }

  async hasSave(): Promise<boolean> {
    return (await this.load()) !== null;
  }

  async loadSettings(): Promise<GameSettings> {
    const raw = await this.store.get<unknown>(SETTINGS_KEY);
    return raw ? sanitizeSettings(raw) : { ...DEFAULT_SETTINGS };
  }

  async saveSettings(settings: GameSettings): Promise<void> {
    await this.store.set(SETTINGS_KEY, sanitizeSettings(settings));
  }
}

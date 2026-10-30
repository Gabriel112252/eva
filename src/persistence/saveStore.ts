/**
 * Camada mínima sobre IndexedDB (promessas), com fallback em memória quando o
 * banco não está disponível (modo privado restrito, testes sem polyfill).
 *
 * Resiliência (iOS/Safari): o navegador pode fechar a conexão a qualquer momento — ao trocar de aba,
 * ao suspender a página, em iframes com armazenamento particionado — e uma transação numa conexão
 * fechada lança `InvalidStateError: The database connection is closing`. Por isso:
 * - a conexão é reaberta sob demanda (e descartada em `close`/`versionchange`);
 * - cada operação tenta de novo uma vez com conexão nova;
 * - se ainda falhar, a operação NÃO rejeita: o jogo segue com uma cópia em memória (o progresso da
 *   sessão continua valendo; só não persiste entre recargas enquanto o banco estiver indisponível);
 * - a abertura tem tempo-limite (o Safari às vezes nunca responde ao `open`).
 */
const DB_NAME = "eva-ultimo-veto";
const DB_VERSION = 1;
const STORE = "kv";
const OPEN_TIMEOUT_MS = 4000;

export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
  readonly backend: "indexeddb" | "memory";
}

function clone<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

class MemoryStore implements KeyValueStore {
  readonly backend = "memory" as const;
  private map = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> {
    const v = this.map.get(key);
    return v === undefined ? undefined : (clone(v) as T);
  }
  async set<T>(key: string, value: T): Promise<void> {
    this.map.set(key, clone(value));
  }
  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }
  async keys(): Promise<string[]> {
    return [...this.map.keys()];
  }
}

/** Abre o banco; resolve null em erro, bloqueio ou tempo esgotado. */
function openDb(factory: IDBFactory): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (db: IDBDatabase | null) => {
      if (settled) {
        // chegou depois do tempo-limite: fecha para não segurar a conexão
        db?.close();
        return;
      }
      settled = true;
      resolve(db);
    };
    let req: IDBOpenDBRequest;
    try {
      req = factory.open(DB_NAME, DB_VERSION);
    } catch {
      done(null);
      return;
    }
    const timer = setTimeout(() => done(null), OPEN_TIMEOUT_MS);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => {
      clearTimeout(timer);
      done(req.result);
    };
    req.onerror = () => {
      clearTimeout(timer);
      done(null);
    };
    req.onblocked = () => {
      clearTimeout(timer);
      done(null);
    };
  });
}

class IndexedDbStore implements KeyValueStore {
  private db: IDBDatabase | null;
  /** espelho em memória: garante leitura do que foi escrito nesta sessão mesmo se o banco cair */
  private readonly mirror = new MemoryStore();
  private degraded = false;
  private reopening: Promise<IDBDatabase | null> | null = null;

  constructor(
    db: IDBDatabase,
    private readonly factory: IDBFactory,
  ) {
    this.db = null;
    this.attach(db);
  }

  get backend(): "indexeddb" | "memory" {
    return this.degraded ? "memory" : "indexeddb";
  }

  private attach(db: IDBDatabase): void {
    this.db = db;
    db.onclose = () => {
      if (this.db === db) this.db = null;
    };
    db.onversionchange = () => {
      db.close();
      if (this.db === db) this.db = null;
    };
  }

  private async connection(): Promise<IDBDatabase | null> {
    if (this.db) return this.db;
    if (!this.reopening) {
      this.reopening = openDb(this.factory).then((db) => {
        this.reopening = null;
        if (db) this.attach(db);
        return db;
      });
    }
    return this.reopening;
  }

  private request<T>(req: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
    });
  }

  /** Executa `op` com uma conexão viva; reabre e tenta de novo uma vez; null se o banco estiver indisponível. */
  private async run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<{ ok: true; value: T } | { ok: false }> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const db = await this.connection();
      if (!db) break;
      try {
        const value = await this.request(op(db.transaction(STORE, mode).objectStore(STORE)));
        if (this.degraded) this.degraded = false;
        return { ok: true, value };
      } catch (err) {
        // conexão fechando/fechada ou transação abortada: descarta e tenta com uma nova
        if (this.db === db) this.db = null;
        try {
          db.close();
        } catch {
          /* já fechada */
        }
        if (attempt === 1) console.warn("[save] IndexedDB indisponível; seguindo em memória nesta sessão:", err);
      }
    }
    this.degraded = true;
    return { ok: false };
  }

  async get<T>(key: string): Promise<T | undefined> {
    const r = await this.run<T | undefined>("readonly", (s) => s.get(key) as IDBRequest<T | undefined>);
    if (r.ok) {
      if (r.value !== undefined) await this.mirror.set(key, r.value);
      return r.value ?? (await this.mirror.get<T>(key));
    }
    return this.mirror.get<T>(key);
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.mirror.set(key, value);
    await this.run("readwrite", (s) => s.put(value, key));
  }

  async delete(key: string): Promise<void> {
    await this.mirror.delete(key);
    await this.run("readwrite", (s) => s.delete(key));
  }

  async keys(): Promise<string[]> {
    const r = await this.run("readonly", (s) => s.getAllKeys());
    const mirrored = await this.mirror.keys();
    if (!r.ok) return mirrored;
    return [...new Set([...r.value.map(String), ...mirrored])];
  }
}

export function openStore(factory: IDBFactory | undefined = typeof indexedDB !== "undefined" ? indexedDB : undefined): Promise<KeyValueStore> {
  if (!factory) return Promise.resolve(new MemoryStore());
  return openDb(factory).then((db) => (db ? new IndexedDbStore(db, factory) : new MemoryStore()));
}

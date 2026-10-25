/**
 * Camada mínima sobre IndexedDB (promessas), com fallback em memória quando o
 * banco não está disponível (modo privado restrito, testes sem polyfill).
 */
const DB_NAME = "eva-ultimo-veto";
const DB_VERSION = 1;
const STORE = "kv";

export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
  readonly backend: "indexeddb" | "memory";
}

class MemoryStore implements KeyValueStore {
  readonly backend = "memory" as const;
  private map = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> {
    return this.map.get(key) as T | undefined;
  }
  async set<T>(key: string, value: T): Promise<void> {
    this.map.set(key, structuredClone(value));
  }
  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }
  async keys(): Promise<string[]> {
    return [...this.map.keys()];
  }
}

class IndexedDbStore implements KeyValueStore {
  readonly backend = "indexeddb" as const;
  constructor(private readonly db: IDBDatabase) {}

  private tx(mode: IDBTransactionMode): IDBObjectStore {
    return this.db.transaction(STORE, mode).objectStore(STORE);
  }

  private request<T>(req: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
    });
  }

  get<T>(key: string): Promise<T | undefined> {
    return this.request(this.tx("readonly").get(key)) as Promise<T | undefined>;
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.request(this.tx("readwrite").put(value, key));
  }

  async delete(key: string): Promise<void> {
    await this.request(this.tx("readwrite").delete(key));
  }

  async keys(): Promise<string[]> {
    const keys = await this.request(this.tx("readonly").getAllKeys());
    return keys.map(String);
  }
}

export function openStore(factory: IDBFactory | undefined = typeof indexedDB !== "undefined" ? indexedDB : undefined): Promise<KeyValueStore> {
  if (!factory) return Promise.resolve(new MemoryStore());
  return new Promise((resolve) => {
    let req: IDBOpenDBRequest;
    try {
      req = factory.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(new MemoryStore());
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(new IndexedDbStore(req.result));
    req.onerror = () => resolve(new MemoryStore());
    req.onblocked = () => resolve(new MemoryStore());
  });
}

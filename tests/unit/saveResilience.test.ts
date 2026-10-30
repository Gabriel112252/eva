import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { openStore } from "@/persistence/saveStore";
import { SaveSystem, createEmptySave } from "@/persistence/saveSystem";

const player = { position: { x: 1, y: 0, z: 2 }, yaw: 0.5, crouched: false };

/**
 * Reproduz o erro do iOS: "Failed to execute 'transaction' on 'IDBDatabase': The database connection is closing".
 * A primeira conexão é fechada pelo navegador depois de aberta; a camada deve reabrir e seguir.
 */
describe("SaveStore — conexão fechada pelo navegador (iOS)", () => {
  it("reabre a conexão quando ela fecha e não derruba o jogo", async () => {
    const factory = new IDBFactory();
    const store = await openStore(factory);
    expect(store.backend).toBe("indexeddb");
    await store.set("a", { v: 1 });
    // o navegador fecha a conexão (aba em segundo plano, armazenamento particionado…)
    (store as unknown as { db: IDBDatabase }).db.close();
    const saves = new SaveSystem(store);
    await expect(saves.hasSave()).resolves.toBe(false);
    expect(await store.get("a")).toEqual({ v: 1 });
    await store.set("b", 2);
    expect(await store.get("b")).toBe(2);
    expect(store.backend).toBe("indexeddb");
  });

  it("se o banco não reabre, segue em memória sem rejeitar (o progresso vale na sessão)", async () => {
    const factory = new IDBFactory();
    const store = await openStore(factory);
    await store.set("x", "persistido");
    // a partir daqui toda transação lança, e a reabertura falha
    const db = (store as unknown as { db: IDBDatabase }).db;
    db.transaction = () => {
      throw new DOMException("The database connection is closing.", "InvalidStateError");
    };
    (factory as unknown as { open: () => never }).open = () => {
      throw new DOMException("blocked", "InvalidStateError");
    };
    const saves = new SaveSystem(store);
    await expect(saves.hasSave()).resolves.toBe(false);
    await expect(saves.save(createEmptySave(player))).resolves.toBeUndefined();
    expect(await saves.hasSave()).toBe(true);
    expect((await saves.load())?.player.position.x).toBe(1);
    expect(await store.get("x")).toBe("persistido");
    expect(store.backend).toBe("memory");
  });
});

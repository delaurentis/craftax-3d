// IndexedDB: your worlds (My Worlds), one record a world ({id, name, seed, version, updated, floor, score, steps, done, snap}), in
// the database `name` (js/local.ts picks it: your own worlds, a scene's, ?god's...).
import type { SaveRecord } from "../src/core/types";

export function savesDb(name: string) {
  let db: Promise<IDBDatabase> | null = null;
  const open = () => (db ??= new Promise((ok, fail) => {
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("worlds", { keyPath: "id" });
    r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error);
  }));
  // any: a request's result is whatever the store holds (a SaveRecord, a list of them, or a key)
  const txn = async (mode: IDBTransactionMode, f: (st: IDBObjectStore) => IDBRequest): Promise<any> => {
    const d = await open();
    return new Promise((ok, fail) => {
      const tx = d.transaction("worlds", mode), r = f(tx.objectStore("worlds"));
      tx.oncomplete = () => ok(r.result); tx.onerror = () => fail(tx.error);
    });
  };
  return {
    put: (rec: SaveRecord) => txn("readwrite", (st) => st.put(rec)),
    get: (id: string): Promise<SaveRecord | undefined> => txn("readonly", (st) => st.get(id)),
    all: (): Promise<SaveRecord[]> => txn("readonly", (st) => st.getAll()),
    del: (id: string) => txn("readwrite", (st) => st.delete(id)),
  };
}

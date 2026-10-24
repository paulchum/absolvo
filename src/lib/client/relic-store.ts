/**
 * The browser keeps its own copy of the confession so the burn after the Stripe redirect needs no
 * second trip through the server. Every call is best-effort: private modes may refuse IndexedDB.
 */
const DB = "absolvo";
const STORE = "relics";

export interface Relic { kind: "image" | "text"; blob?: Blob; text?: string; savedAt: number }

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  try {
    const database = await open();
    return await new Promise<T>((resolve, reject) => {
      const request = act(database.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).finally(() => database.close());
  } catch {
    return undefined;
  }
}

export const saveRelic = (id: string, relic: Relic) => run("readwrite", store => store.put(relic, id));
export const loadRelic = (id: string) => run<Relic>("readonly", store => store.get(id) as IDBRequest<Relic>);
export const forgetRelic = (id: string) => run("readwrite", store => store.delete(id));

const DATABASE = 'afrimind-offline-v1';
export type OfflineOperation = {
  id: string; owner: string; institution: string; url: string; method: string;
  data: string | undefined; version?: number; createdAt: number;
  status: 'pending' | 'conflict' | 'rejected'; error?: string;
};
let opening: Promise<IDBDatabase> | undefined;
function database(): Promise<IDBDatabase> {
  if (!opening) opening = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('cache', { keyPath: 'key' });
      request.result.createObjectStore('outbox', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return opening;
}
export async function storeRead<T>(store: string, key: string): Promise<T | undefined> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function storeWrite(store: string, value: any): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
export async function storeDelete(store: string, key: string): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
  });
}
export async function operations(owner?: string): Promise<OfflineOperation[]> {
  const db = await database();
  const all = await new Promise<OfflineOperation[]>((resolve, reject) => {
    const request = db.transaction('outbox').objectStore('outbox').getAll();
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  return all.filter(row => !owner || row.owner === owner).sort((a, b) => a.createdAt - b.createdAt);
}

export async function expireReadCopies(): Promise<void> {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('cache', 'readwrite');
    const request = tx.objectStore('cache').openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      if (Date.now() - cursor.value.savedAt > 24 * 60 * 60 * 1000) cursor.delete();
      cursor.continue();
    };
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
  });
}

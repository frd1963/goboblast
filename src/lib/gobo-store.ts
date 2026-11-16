const DB_NAME = "goboblast";
const DB_VERSION = 1;
const STORE = "images";
const KEY = "gobo";

export type StoredGoboImage = {
  blob: Blob;
  name: string;
  type: string;
};

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open image storage"));
  });
}

export async function saveGoboImage(blob: Blob, name: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ blob, name, type: blob.type } satisfies StoredGoboImage, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Could not store the image"));
  });
  db.close();
}

export async function loadGoboImage(): Promise<StoredGoboImage | null> {
  const db = await openDb();
  const record = await new Promise<StoredGoboImage | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(KEY);
    request.onsuccess = () => resolve((request.result as StoredGoboImage | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("Could not read the image"));
  });
  db.close();
  if (!record || !(record.blob instanceof Blob)) return null;
  return record;
}

export async function clearGoboImage() {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Could not clear the image"));
  });
  db.close();
}

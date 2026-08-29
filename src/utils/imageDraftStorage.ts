export interface StoredMaterialImage {
  id: string;
  name: string;
  type: string;
  blob: Blob;
  selected: boolean;
  status: 'pending' | 'ready' | 'error';
  text: string;
  error?: string;
}

const DB_NAME = 'AulaClara_ImageDrafts';
const STORE_NAME = 'material-images';
const DRAFT_KEY = 'active-material';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveMaterialImageDraft(images: StoredMaterialImage[], draftKey = DRAFT_KEY): Promise<void> {
  if (!window.indexedDB) return;
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(images, draftKey);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function loadMaterialImageDraft(draftKey = DRAFT_KEY): Promise<StoredMaterialImage[]> {
  if (!window.indexedDB) return [];
  const database = await openDatabase();
  const images = await new Promise<StoredMaterialImage[]>((resolve) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(draftKey);
    request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
    request.onerror = () => resolve([]);
  });
  database.close();
  return images;
}

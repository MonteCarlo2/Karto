const DB_NAME = "karto-ai-training-images-v1";
const STORE = "images";

type StoredImage = {
  key: string;
  shopId: string;
  blob: Blob;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB недоступен"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB error"));
  });
}

function imageKey(shopId: string, id: string) {
  return `${shopId}:${id}`;
}

export async function saveTrainingImage(shopId: string, id: string, blob: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ key: imageKey(shopId, id), shopId, blob } satisfies StoredImage);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("save failed"));
  });
  db.close();
}

export async function loadTrainingImage(shopId: string, id: string): Promise<Blob | null> {
  const db = await openDb();
  const row = await new Promise<StoredImage | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(imageKey(shopId, id));
    req.onsuccess = () => resolve(req.result as StoredImage | undefined);
    req.onerror = () => reject(req.error ?? new Error("load failed"));
  });
  db.close();
  return row?.blob ?? null;
}

export async function deleteTrainingImage(shopId: string, id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(imageKey(shopId, id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("delete failed"));
  });
  db.close();
}

export async function compressTrainingImage(file: File, maxSide = 1280, quality = 0.86): Promise<Blob> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Нужно изображение");
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas недоступен");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", quality)
  );
  if (!blob) throw new Error("Не удалось сжать изображение");
  return blob;
}

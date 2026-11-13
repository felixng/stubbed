const lifetime = 60 * 60 * 1000;

async function operate<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("stubbed-gallery-checkout", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("draft");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction("draft", mode);
      const request = action(transaction.objectStore("draft"));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

export async function rememberGalleryCheckout<T>(account: string, entry: string, draft: T) {
  await operate("readwrite", (store) => store.put({ account, entry, draft, expiresAt: Date.now() + lifetime }, "current"));
}

export async function readGalleryCheckout<T>(account: string, entry: string): Promise<T | null> {
  return operate("readwrite", (store) => {
    const request = store.get("current");
    request.onsuccess = () => {
      const value = request.result;
      if (!value) return;
      if (value.account !== account || value.expiresAt <= Date.now()) store.delete("current");
    };
    return request;
  }).then((value) => value?.account === account && value.entry === entry && value.expiresAt > Date.now()
    ? value.draft as T : null);
}

export async function clearGalleryCheckout() {
  await operate("readwrite", (store) => store.delete("current"));
}

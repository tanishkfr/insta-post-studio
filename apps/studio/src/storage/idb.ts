/** Shared IndexedDB helpers with explicit transaction completion semantics. */

export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

export function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction was aborted."));
  });
}

export function openDatabase(
  factory: IDBFactory,
  name: string,
  version: number,
  upgrade: (database: IDBDatabase, oldVersion: number) => void,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, version);
    request.onupgradeneeded = (event) => {
      const database = request.result;
      try {
        upgrade(database, event.oldVersion);
      } catch (error) {
        request.transaction?.abort();
        reject(error);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error(`Could not open IndexedDB database ${name}.`));
    request.onblocked = () =>
      reject(new Error(`Database ${name} is blocked by another open tab.`));
  });
}

export function decodeBytes(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

export function encodeText(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

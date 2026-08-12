const DB_NAME = 'yoman-mesimot'
const DB_VERSION = 2

export type StoreName = 'tasks' | 'categories' | 'tasks_queue' | 'categories_queue'

const STORE_NAMES: StoreName[] = [
  'tasks',
  'categories',
  'tasks_queue',
  'categories_queue',
]

export interface KeyValueStore<T> {
  getAll(): Promise<T[]>
  put(record: T): Promise<void>
  remove(id: string): Promise<void>
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      for (const name of STORE_NAMES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id' })
        }
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function waitForTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

function runRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function getAll<T>(storeName: StoreName): Promise<T[]> {
  const db = await openDb()
  const tx = db.transaction(storeName, 'readonly')
  return runRequest<T[]>(tx.objectStore(storeName).getAll())
}

export async function putRecord<T extends { id: string }>(
  storeName: StoreName,
  record: T,
): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(storeName, 'readwrite')
  tx.objectStore(storeName).put(record)
  return waitForTransaction(tx)
}

export async function putAll<T extends { id: string }>(
  storeName: StoreName,
  records: T[],
): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(storeName, 'readwrite')
  const store = tx.objectStore(storeName)
  for (const record of records) {
    store.put(record)
  }
  return waitForTransaction(tx)
}

export async function removeRecord(storeName: StoreName, id: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(storeName, 'readwrite')
  tx.objectStore(storeName).delete(id)
  return waitForTransaction(tx)
}

export function createIndexedDbStore<T extends { id: string }>(
  storeName: StoreName,
): KeyValueStore<T> {
  return {
    getAll: () => getAll<T>(storeName),
    put: (record) => putRecord(storeName, record),
    remove: (id) => removeRecord(storeName, id),
  }
}

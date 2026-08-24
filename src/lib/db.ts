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

/**
 * An open request that never settles would leave every caller awaiting
 * forever — a write that is neither delivered nor reported. Both ways that can
 * happen (another tab holding an older version open, and an engine that never
 * answers at all) are turned into a rejection instead.
 */
const OPEN_TIMEOUT_MS = 10_000

/** One connection for the whole app: reopening per call leaks handles, and a
 * leaked handle is exactly what blocks the next version upgrade. */
let connection: Promise<IDBDatabase> | null = null

function requestConnection(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable in this browser context'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)
    const timeout = setTimeout(() => {
      reject(new Error(`IndexedDB did not open within ${OPEN_TIMEOUT_MS}ms`))
    }, OPEN_TIMEOUT_MS)

    request.onupgradeneeded = () => {
      const db = request.result
      for (const name of STORE_NAMES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id' })
        }
      }
    }

    request.onblocked = () => {
      clearTimeout(timeout)
      reject(new Error('IndexedDB upgrade is blocked by another open tab'))
    }

    request.onsuccess = () => {
      clearTimeout(timeout)
      const db = request.result
      // Another tab needs to upgrade: let go so it is not blocked in turn.
      db.onversionchange = () => {
        db.close()
        connection = null
      }
      resolve(db)
    }

    request.onerror = () => {
      clearTimeout(timeout)
      reject(request.error ?? new Error('IndexedDB failed to open'))
    }
  })
}

function openDb(): Promise<IDBDatabase> {
  if (!connection) {
    connection = requestConnection().catch((error: unknown) => {
      // Do not cache the failure — the next call gets a fresh attempt.
      connection = null
      throw error
    })
  }
  return connection
}

/** Releases the cached connection. Used when a test needs a clean database. */
export async function closeDb(): Promise<void> {
  const pending = connection
  connection = null
  await pending?.then((db) => db.close()).catch(() => {})
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

import type { KeyValueStore } from './db'

export interface QueueItem<T> {
  id: string
  createdAt: string
  operation: T
}

/** Thrown by a processor to signal a transient connectivity failure — the item stays queued for retry. */
export class QueueNetworkError extends Error {
  constructor(message = 'network unreachable') {
    super(message)
    this.name = 'QueueNetworkError'
  }
}

type Processor<T> = (operation: T) => Promise<void>
type ErrorHandler<T> = (operation: T, error: unknown) => void

export class ActionQueue<T> {
  private readonly store: KeyValueStore<QueueItem<T>>
  private readonly processor: Processor<T>
  private readonly onError?: ErrorHandler<T>
  private draining = false

  constructor(options: {
    store: KeyValueStore<QueueItem<T>>
    processor: Processor<T>
    onError?: ErrorHandler<T>
  }) {
    this.store = options.store
    this.processor = options.processor
    this.onError = options.onError

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => void this.drain())
    }
  }

  /** Persists the operation to the local queue. Does not itself attempt delivery — call drain() for that. */
  async enqueue(operation: T): Promise<void> {
    const item: QueueItem<T> = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      operation,
    }
    await this.store.put(item)
  }

  /**
   * Processes queued items in order. Stops immediately on a network error so
   * later items keep their place and everything retries together once back
   * online. A non-network failure is permanent for that item: it is dropped
   * and reported via onError, and draining continues with the rest.
   */
  async drain(): Promise<void> {
    if (this.draining) {
      return
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return
    }

    this.draining = true
    try {
      const items = await this.store.getAll()
      items.sort((a, b) => a.createdAt.localeCompare(b.createdAt))

      for (const item of items) {
        try {
          await this.processor(item.operation)
          await this.store.remove(item.id)
        } catch (error) {
          if (error instanceof QueueNetworkError) {
            return
          }
          await this.store.remove(item.id)
          this.onError?.(item.operation, error)
        }
      }
    } finally {
      this.draining = false
    }
  }

  async pending(): Promise<T[]> {
    const items = await this.store.getAll()
    return items.map((item) => item.operation)
  }
}

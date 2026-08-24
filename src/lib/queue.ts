import type { KeyValueStore } from './db'

export interface QueueItem<T> {
  id: string
  createdAt: string
  operation: T
}

/**
 * Thrown by a processor to signal a failure the server may still accept later —
 * no connection, an expired token, a missing grant. The item stays queued and
 * draining stops so later items keep their place.
 */
export class QueueRetryError extends Error {
  readonly userMessage: string

  constructor(userMessage = 'השינוי ממתין לשליחה.') {
    super(userMessage)
    this.name = 'QueueRetryError'
    this.userMessage = userMessage
  }
}

type Processor<T> = (operation: T) => Promise<void>
type ErrorHandler<T> = (operation: T, error: unknown) => void

export class ActionQueue<T> {
  private readonly store: KeyValueStore<QueueItem<T>>
  private readonly processor: Processor<T>
  private readonly onPermanentError?: ErrorHandler<T>
  private readonly onRetryableError?: ErrorHandler<T>
  private readonly onDelivered?: (operation: T) => void
  private readonly onChange?: () => void
  private draining = false

  constructor(options: {
    store: KeyValueStore<QueueItem<T>>
    processor: Processor<T>
    /** The server rejected the operation for good — the caller should roll it back. */
    onPermanentError?: ErrorHandler<T>
    /** Delivery failed but the operation is still queued; report it, do not roll back. */
    onRetryableError?: ErrorHandler<T>
    /** The operation reached the server. */
    onDelivered?: (operation: T) => void
    /** Called whenever the queue's pending count may have changed (enqueued, delivered, or dropped). */
    onChange?: () => void
  }) {
    this.store = options.store
    this.processor = options.processor
    this.onPermanentError = options.onPermanentError
    this.onRetryableError = options.onRetryableError
    this.onDelivered = options.onDelivered
    this.onChange = options.onChange

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
    this.onChange?.()
  }

  /**
   * Processes queued items in order. Stops on a retryable failure so later
   * items keep their place and everything is tried again together; the item
   * stays queued and the failure is reported through onRetryableError. A
   * permanent rejection drops that one item, reports it through
   * onPermanentError so the caller can roll the change back, and draining
   * continues with the rest.
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
          this.onDelivered?.(item.operation)
          this.onChange?.()
        } catch (error) {
          if (error instanceof QueueRetryError) {
            this.onRetryableError?.(item.operation, error)
            this.onChange?.()
            return
          }
          await this.store.remove(item.id)
          this.onPermanentError?.(item.operation, error)
          this.onChange?.()
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

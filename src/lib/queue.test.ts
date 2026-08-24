import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KeyValueStore } from './db'
import { ActionQueue, QueueRetryError, type QueueItem } from './queue'

class MemoryStore<T extends { id: string }> implements KeyValueStore<T> {
  private items = new Map<string, T>()

  async getAll(): Promise<T[]> {
    return [...this.items.values()]
  }

  async put(record: T): Promise<void> {
    this.items.set(record.id, record)
  }

  async remove(id: string): Promise<void> {
    this.items.delete(id)
  }
}

describe('ActionQueue', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
  })

  it('processes a queued item and removes it once the processor succeeds', async () => {
    const store = new MemoryStore<QueueItem<string>>()
    const processor = vi.fn().mockResolvedValue(undefined)
    const queue = new ActionQueue<string>({ store, processor })

    await queue.enqueue('op-1')
    await queue.drain()

    expect(processor).toHaveBeenCalledWith('op-1')
    expect(await queue.pending()).toEqual([])
  })

  it('keeps items queued and stops draining on a retryable error', async () => {
    const store = new MemoryStore<QueueItem<string>>()
    const processor = vi.fn().mockRejectedValue(new QueueRetryError())
    const onRetryableError = vi.fn()
    const queue = new ActionQueue<string>({ store, processor, onRetryableError })

    await queue.enqueue('op-1')
    await queue.enqueue('op-2')
    await queue.drain()

    expect(processor).toHaveBeenCalledTimes(1)
    expect(await queue.pending()).toEqual(['op-1', 'op-2'])
  })

  it('reports a retryable failure so it can never pass unnoticed', async () => {
    const store = new MemoryStore<QueueItem<string>>()
    const failure = new QueueRetryError('אין חיבור לרשת.')
    const processor = vi.fn().mockRejectedValue(failure)
    const onRetryableError = vi.fn()
    const onPermanentError = vi.fn()
    const queue = new ActionQueue<string>({
      store,
      processor,
      onRetryableError,
      onPermanentError,
    })

    await queue.enqueue('op-1')
    await queue.drain()

    expect(onRetryableError).toHaveBeenCalledWith('op-1', failure)
    expect(onPermanentError).not.toHaveBeenCalled()
    expect(await queue.pending()).toEqual(['op-1'])
  })

  it('reports delivery so a caller can tell a stuck queue from a healthy one', async () => {
    const store = new MemoryStore<QueueItem<string>>()
    const processor = vi.fn().mockResolvedValue(undefined)
    const onDelivered = vi.fn()
    const queue = new ActionQueue<string>({ store, processor, onDelivered })

    await queue.enqueue('op-1')
    await queue.drain()

    expect(onDelivered).toHaveBeenCalledWith('op-1')
  })

  it('drops an item and reports the error on a permanent failure, then continues', async () => {
    const store = new MemoryStore<QueueItem<string>>()
    const failure = new Error('validation failed')
    const processor = vi
      .fn()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(undefined)
    const onPermanentError = vi.fn()
    const queue = new ActionQueue<string>({ store, processor, onPermanentError })

    await queue.enqueue('op-1')
    await queue.enqueue('op-2')
    await queue.drain()

    expect(onPermanentError).toHaveBeenCalledWith('op-1', failure)
    expect(processor).toHaveBeenCalledTimes(2)
    expect(await queue.pending()).toEqual([])
  })

  it('does not attempt to process anything while offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    const store = new MemoryStore<QueueItem<string>>()
    const processor = vi.fn().mockResolvedValue(undefined)
    const queue = new ActionQueue<string>({ store, processor })

    await queue.enqueue('op-1')
    await queue.drain()

    expect(processor).not.toHaveBeenCalled()
    expect(await queue.pending()).toEqual(['op-1'])
  })

  it('auto-drains once the browser reports it is back online', async () => {
    const store = new MemoryStore<QueueItem<string>>()
    const processor = vi.fn().mockResolvedValue(undefined)
    new ActionQueue<string>({ store, processor })

    await store.put({ id: '1', createdAt: new Date().toISOString(), operation: 'op-1' })
    window.dispatchEvent(new Event('online'))
    await vi.waitFor(() => expect(processor).toHaveBeenCalledWith('op-1'))
  })

  it('reports onChange after enqueueing and after each item settles', async () => {
    const store = new MemoryStore<QueueItem<string>>()
    const failure = new Error('validation failed')
    const processor = vi
      .fn()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(undefined)
    const onChange = vi.fn()
    const queue = new ActionQueue<string>({ store, processor, onChange })

    await queue.enqueue('op-1')
    expect(onChange).toHaveBeenCalledTimes(1)

    await queue.enqueue('op-2')
    expect(onChange).toHaveBeenCalledTimes(2)

    await queue.drain()
    expect(onChange).toHaveBeenCalledTimes(4)
  })

  it('reports onChange when a retryable error stops draining, so the indicator updates', async () => {
    const store = new MemoryStore<QueueItem<string>>()
    const processor = vi.fn().mockRejectedValue(new QueueRetryError())
    const onChange = vi.fn()
    const queue = new ActionQueue<string>({ store, processor, onChange })

    await queue.enqueue('op-1')
    onChange.mockClear()
    await queue.drain()

    expect(onChange).toHaveBeenCalledTimes(1)
  })
})

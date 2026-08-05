import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KeyValueStore } from './db'
import { ActionQueue, QueueNetworkError, type QueueItem } from './queue'

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

  it('keeps items queued and stops draining on a network error', async () => {
    const store = new MemoryStore<QueueItem<string>>()
    const processor = vi.fn().mockRejectedValue(new QueueNetworkError())
    const queue = new ActionQueue<string>({ store, processor })

    await queue.enqueue('op-1')
    await queue.enqueue('op-2')
    await queue.drain()

    expect(processor).toHaveBeenCalledTimes(1)
    expect(await queue.pending()).toEqual(['op-1', 'op-2'])
  })

  it('drops an item and reports the error on a non-network failure, then continues', async () => {
    const store = new MemoryStore<QueueItem<string>>()
    const failure = new Error('validation failed')
    const processor = vi
      .fn()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(undefined)
    const onError = vi.fn()
    const queue = new ActionQueue<string>({ store, processor, onError })

    await queue.enqueue('op-1')
    await queue.enqueue('op-2')
    await queue.drain()

    expect(onError).toHaveBeenCalledWith('op-1', failure)
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

  it('does not call onChange when a network error stops draining', async () => {
    const store = new MemoryStore<QueueItem<string>>()
    const processor = vi.fn().mockRejectedValue(new QueueNetworkError())
    const onChange = vi.fn()
    const queue = new ActionQueue<string>({ store, processor, onChange })

    await queue.enqueue('op-1')
    onChange.mockClear()
    await queue.drain()

    expect(onChange).not.toHaveBeenCalled()
  })
})

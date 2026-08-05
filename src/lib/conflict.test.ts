import { describe, expect, it } from 'vitest'
import { resolveConflict } from './conflict'

describe('resolveConflict', () => {
  it('picks the incoming record when it is newer', () => {
    const local = { id: '1', updated_at: '2026-01-01T00:00:00.000Z', value: 'local' }
    const incoming = {
      id: '1',
      updated_at: '2026-01-02T00:00:00.000Z',
      value: 'incoming',
    }

    expect(resolveConflict(local, incoming)).toBe(incoming)
  })

  it('keeps the local record when it is newer', () => {
    const local = { id: '1', updated_at: '2026-01-02T00:00:00.000Z', value: 'local' }
    const incoming = {
      id: '1',
      updated_at: '2026-01-01T00:00:00.000Z',
      value: 'incoming',
    }

    expect(resolveConflict(local, incoming)).toBe(local)
  })

  it('keeps the local record on an exact tie', () => {
    const timestamp = '2026-01-01T00:00:00.000Z'
    const local = { id: '1', updated_at: timestamp, value: 'local' }
    const incoming = { id: '1', updated_at: timestamp, value: 'incoming' }

    expect(resolveConflict(local, incoming)).toBe(local)
  })
})

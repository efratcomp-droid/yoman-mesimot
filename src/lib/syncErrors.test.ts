import { beforeEach, describe, expect, it } from 'vitest'
import { QueueRetryError } from './queue'
import { SyncRejectionError, classifySyncError, toQueueError } from './syncErrors'

const HEBREW_PATTERN = /[֐-׿]/

function setOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true })
}

beforeEach(() => setOnline(true))

describe('classifySyncError', () => {
  it('always produces a Hebrew message, whatever it was handed', () => {
    const inputs: unknown[] = [
      undefined,
      null,
      'boom',
      new Error('Unexpected token'),
      { code: '42501', message: 'permission denied for table tasks' },
      { code: 'PGRST204', message: "Could not find the 'x' column" },
      { code: '23503', message: 'foreign key violation' },
      { code: '08006', message: 'connection failure' },
    ]

    for (const input of inputs) {
      const { message } = classifySyncError(input)
      expect(message, `no Hebrew message for ${JSON.stringify(input)}`).toMatch(
        HEBREW_PATTERN,
      )
      expect(message.length).toBeGreaterThan(0)
    }
  })

  it('keeps a missing table grant retryable so the change is not thrown away', () => {
    // 42501 is what an ungranted role gets, before RLS is ever evaluated.
    // Fixing it is a server-side change, and the queued row then delivers.
    const failure = classifySyncError({
      code: '42501',
      message: 'permission denied for table tasks',
    })

    expect(failure.retryable).toBe(true)
  })

  it.each([
    ['PGRST301', 'an expired token'],
    ['08006', 'a dropped connection'],
    ['53300', 'an exhausted server'],
  ])('treats %s (%s) as retryable', (code) => {
    expect(classifySyncError({ code, message: code }).retryable).toBe(true)
  })

  it.each([
    ['PGRST204', 'a column the table does not have'],
    ['23503', 'a category that no longer exists'],
    ['23514', 'a value the table refuses'],
  ])('treats %s (%s) as permanent', (code) => {
    expect(classifySyncError({ code, message: code }).retryable).toBe(false)
  })

  it('treats a dropped fetch as retryable', () => {
    expect(classifySyncError(new TypeError('Failed to fetch')).retryable).toBe(true)
    expect(classifySyncError({ message: 'Load failed' }).retryable).toBe(true)
  })

  it('treats everything as retryable while the browser reports no connection', () => {
    setOnline(false)
    expect(classifySyncError({ code: '23514', message: 'check violation' }).retryable).toBe(
      true,
    )
  })

  it('defaults an unrecognised failure to permanent, but still explains it', () => {
    const failure = classifySyncError({ code: 'XX000', message: 'internal error' })

    expect(failure.retryable).toBe(false)
    expect(failure.message).toMatch(HEBREW_PATTERN)
  })
})

describe('toQueueError', () => {
  it('marks a retryable failure so the queue holds on to the operation', () => {
    const error = toQueueError({ code: '42501', message: 'permission denied' })

    expect(error).toBeInstanceOf(QueueRetryError)
    expect((error as QueueRetryError).userMessage).toMatch(HEBREW_PATTERN)
  })

  it('marks a permanent failure so the caller rolls the change back', () => {
    const error = toQueueError({ code: '23514', message: 'check violation' })

    expect(error).toBeInstanceOf(SyncRejectionError)
    expect((error as SyncRejectionError).userMessage).toMatch(HEBREW_PATTERN)
  })

  it('passes an already-classified failure through unchanged', () => {
    const original = new QueueRetryError('ההתחברות פגה.')

    expect(classifySyncError(original)).toEqual({
      retryable: true,
      message: 'ההתחברות פגה.',
    })
  })
})

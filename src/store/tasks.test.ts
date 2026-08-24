import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../types/database'
import { tableColumns } from '../test/schemaSql'

/**
 * The write path used to fail in production without a trace: the server
 * rejected every insert, the queue dropped it, and nothing on screen changed.
 * These tests exercise the real store, the real queue and a real IndexedDB, and
 * assert the two things that were missing — that a row leaves with a valid
 * owner, and that a write which does not land is always said out loud, in
 * Hebrew.
 */

const SESSION_USER_ID = '5e198eba-d9b6-4bf2-8c59-ad18244f10fd'
const OTHER_USER_ID = 'a7c31f02-4d55-4b18-9e6a-2f8c1b0d4e77'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HEBREW_PATTERN = /[֐-׿]/

interface PostgrestFailure {
  code: string
  message: string
}

const { server, auth } = vi.hoisted(() => ({
  server: {
    inserts: [] as Record<string, unknown>[],
    updates: [] as Record<string, unknown>[],
    insertError: null as PostgrestFailure | null,
    updateError: null as PostgrestFailure | null,
    selectError: null as PostgrestFailure | null,
    selectData: [] as unknown[],
  },
  auth: { userId: null as string | null },
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      insert: (payload: Record<string, unknown>) => {
        server.inserts.push(payload)
        return Promise.resolve({ error: server.insertError })
      },
      update: (changes: Record<string, unknown>) => ({
        eq: () => {
          server.updates.push(changes)
          return Promise.resolve({ error: server.updateError })
        },
      }),
      select: () => ({
        eq: () =>
          Promise.resolve({
            data: server.selectError ? null : server.selectData,
            error: server.selectError,
          }),
      }),
    }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => {},
  },
}))

vi.mock('./authStore', () => ({
  useAuthStore: {
    getState: () => ({
      session: auth.userId ? { user: { id: auth.userId } } : null,
    }),
  },
}))

function setOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true })
}

/** A fresh module registry per test, so each store gets its own queue. */
async function freshStore() {
  const { useTasksStore } = await import('./tasks')
  return useTasksStore
}

async function wipeDatabase() {
  const { closeDb } = await import('../lib/db')
  await closeDb()
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase('yoman-mesimot')
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
  })
}

beforeEach(async () => {
  await wipeDatabase()
  vi.resetModules()
  server.inserts = []
  server.updates = []
  server.insertError = null
  server.updateError = null
  server.selectError = null
  server.selectData = []
  auth.userId = SESSION_USER_ID
  setOnline(true)
})

afterEach(async () => {
  await wipeDatabase()
})

describe('addTask — what is actually sent to the database', () => {
  it('always attaches the signed-in user as the row owner', async () => {
    const store = await freshStore()

    await store.getState().addTask({ title: 'לשלם ארנונה' })
    await vi.waitFor(() => expect(server.inserts).toHaveLength(1))

    const [payload] = server.inserts
    expect(payload.user_id).toBe(SESSION_USER_ID)
    expect(String(payload.user_id)).toMatch(UUID_PATTERN)
  })

  it('attaches a valid owner to every insert, not just the first', async () => {
    const store = await freshStore()

    for (const title of ['ראשונה', 'שנייה', 'שלישית']) {
      await store.getState().addTask({ title })
    }
    await vi.waitFor(() => expect(server.inserts).toHaveLength(3))

    for (const payload of server.inserts) {
      expect(payload.user_id, `insert without a valid owner: ${payload.title}`).toBe(
        SESSION_USER_ID,
      )
    }
  })

  it('sends exactly the columns the tasks table declares', async () => {
    const store = await freshStore()

    await store.getState().addTask({
      title: 'משימה מלאה',
      notes: 'הערה',
      categoryId: null,
      priority: 1,
      dueDate: '2026-09-01',
    })
    await vi.waitFor(() => expect(server.inserts).toHaveLength(1))

    expect(Object.keys(server.inserts[0]).sort()).toEqual(tableColumns('tasks').sort())
  })

  it('refuses to send a row whose owner is not the signed-in user', async () => {
    // Queued while signed in as one user, drained after switching to another —
    // RLS would reject it, so it must never leave, and must not be silent.
    setOnline(false)
    const store = await freshStore()
    await store.getState().addTask({ title: 'משימה של מישהי אחרת' })

    auth.userId = OTHER_USER_ID
    setOnline(true)
    server.selectError = null
    await store.getState().load()

    await vi.waitFor(() => expect(store.getState().error).toBeTruthy())
    expect(server.inserts).toHaveLength(0)
    expect(store.getState().error).toMatch(HEBREW_PATTERN)
  })

  it('says so in Hebrew and sends nothing when there is no session', async () => {
    auth.userId = null
    const store = await freshStore()

    await store.getState().addTask({ title: 'בלי התחברות' })

    expect(server.inserts).toHaveLength(0)
    expect(store.getState().error).toMatch(HEBREW_PATTERN)
    expect(store.getState().tasks).toHaveLength(0)
  })
})

describe('addTask — a write the server refuses is never silent', () => {
  it('reports a permission failure in Hebrew instead of showing a synced app', async () => {
    // This is the production bug: RLS was fine, but the role held no table
    // grant, so PostgREST answered 403 / 42501 to every insert.
    server.insertError = { code: '42501', message: 'permission denied for table tasks' }
    const store = await freshStore()

    await store.getState().addTask({ title: 'לקנות חלב' })

    await vi.waitFor(() => expect(store.getState().error).toBeTruthy())
    expect(store.getState().error).toMatch(HEBREW_PATTERN)
    expect(store.getState().syncStatus).not.toBe('synced')
    expect(store.getState().syncStatus).toBe('error')
  })

  it('keeps the task and delivers it once the server accepts writes again', async () => {
    server.insertError = { code: '42501', message: 'permission denied for table tasks' }
    const store = await freshStore()

    await store.getState().addTask({ title: 'לקנות חלב' })
    await vi.waitFor(() => expect(store.getState().error).toBeTruthy())

    // The user's task is still hers — a server misconfiguration must not delete it.
    expect(store.getState().tasks.map((task) => task.title)).toEqual(['לקנות חלב'])

    server.insertError = null
    server.inserts = []
    await store.getState().load()

    await vi.waitFor(() => expect(server.inserts).toHaveLength(1))
    expect(server.inserts[0].title).toBe('לקנות חלב')
    await vi.waitFor(() => expect(store.getState().syncStatus).toBe('synced'))
  })

  it('rolls a permanently rejected task back and names it in the message', async () => {
    server.insertError = { code: '23502', message: 'null value in column "title"' }
    const store = await freshStore()

    await store.getState().addTask({ title: 'משימה פגומה' })

    await vi.waitFor(() => expect(store.getState().tasks).toHaveLength(0))
    expect(store.getState().error).toMatch(HEBREW_PATTERN)
    expect(store.getState().error).toContain('משימה פגומה')
  })

  it('treats a duplicate row as delivered rather than as a failure', async () => {
    // A retry after a response that was lost in transit must not look broken.
    server.insertError = { code: '23505', message: 'duplicate key value' }
    const store = await freshStore()

    await store.getState().addTask({ title: 'משימה כפולה' })

    await vi.waitFor(() => expect(store.getState().syncStatus).toBe('synced'))
    expect(store.getState().error).toBeNull()
    expect(store.getState().tasks).toHaveLength(1)
  })
})

describe('offline behaviour', () => {
  it('holds the task locally and delivers it when the connection returns', async () => {
    setOnline(false)
    const store = await freshStore()

    await store.getState().addTask({ title: 'משימה במצב לא מקוון' })

    expect(server.inserts).toHaveLength(0)
    await vi.waitFor(() => expect(store.getState().syncStatus).toBe('offline'))

    setOnline(true)
    window.dispatchEvent(new Event('online'))

    // Stores from earlier tests still listen on the shared jsdom window, so
    // count distinct rows rather than calls: the app only ever builds one.
    await vi.waitFor(() => expect(server.inserts.length).toBeGreaterThan(0))
    expect(new Set(server.inserts.map((payload) => payload.id)).size).toBe(1)
    expect(server.inserts[0].user_id).toBe(SESSION_USER_ID)
  })
})

describe('load — a rejected read is reported too', () => {
  it('never reports a healthy sync when the server refuses the read', async () => {
    server.selectError = { code: '42501', message: 'permission denied for table tasks' }
    const store = await freshStore()

    await store.getState().load()

    expect(store.getState().error).toMatch(HEBREW_PATTERN)
    expect(store.getState().syncStatus).toBe('error')
  })
})

describe('updates', () => {
  it('rolls a rejected change back to the previous value and explains why', async () => {
    const store = await freshStore()
    await store.getState().addTask({ title: 'משימה קיימת' })
    await vi.waitFor(() => expect(server.inserts).toHaveLength(1))

    const [task] = store.getState().tasks as Task[]
    server.updateError = { code: '23502', message: 'rejected' }

    await store.getState().markDone(task.id, true)

    await vi.waitFor(() => expect(store.getState().error).toBeTruthy())
    expect(store.getState().tasks[0].done).toBe(false)
    expect(store.getState().error).toMatch(HEBREW_PATTERN)
  })
})

describe('the sync indicator tells the truth', () => {
  it('keeps showing a failure after the message is dismissed', async () => {
    server.insertError = { code: '42501', message: 'permission denied for table tasks' }
    const store = await freshStore()

    await store.getState().addTask({ title: 'משימה תקועה' })
    await vi.waitFor(() => expect(store.getState().syncStatus).toBe('error'))

    store.getState().clearError()

    expect(store.getState().error).toBeNull()
    expect(store.getState().syncStatus).toBe('error')
  })
})

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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HEBREW_PATTERN = /[֐-׿]/

interface PostgrestFailure {
  code: string
  message: string
}

const { server, auth, realtime } = vi.hoisted(() => ({
  server: {
    inserts: [] as Record<string, unknown>[],
    updates: [] as Record<string, unknown>[],
    insertError: null as PostgrestFailure | null,
    updateError: null as PostgrestFailure | null,
    selectError: null as PostgrestFailure | null,
    selectData: [] as unknown[],
    selectFilters: [] as { column: string; value: unknown }[],
  },
  auth: { userId: null as string | null },
  realtime: {
    // Captured so a test can deliver an event exactly as Supabase would.
    handler: null as ((payload: unknown) => void) | null,
    filters: [] as Record<string, unknown>[],
  },
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
      select: () => {
        // Mirrors PostgREST: .is('deleted_at', null) filters server-side, so a
        // test that forgets it would see soft-deleted rows come back.
        const result = (onlyLive: boolean) =>
          Promise.resolve({
            data: server.selectError
              ? null
              : onlyLive
                ? (server.selectData as Task[]).filter((row) => !row.deleted_at)
                : server.selectData,
            error: server.selectError,
          })
        const eqResult = Object.assign(result(false), {
          is: (column: string, value: unknown) => {
            server.selectFilters.push({ column, value })
            return result(column === 'deleted_at' && value === null)
          },
        })
        return { eq: () => eqResult }
      },
    }),
    channel: () => ({
      on: (
        _event: string,
        filter: Record<string, unknown>,
        handler: (payload: unknown) => void,
      ) => {
        realtime.filters.push(filter)
        realtime.handler = handler
        return { subscribe: () => ({}) }
      },
    }),
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
  server.selectFilters = []
  realtime.handler = null
  realtime.filters = []
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

/**
 * A soft delete is an UPDATE that sets deleted_at, never a DELETE. Every one
 * of the three paths a deletion can travel has to end with the task gone:
 * deleted here, deleted on another device, or already deleted before this
 * device even opened.
 */
describe('deletion propagates on all three paths', () => {
  const REMOTE_TASK: Task = {
    id: 'c0ffee00-0000-4000-8000-000000000001',
    user_id: SESSION_USER_ID,
    title: 'משימה שנמחקה במכשיר אחר',
    notes: '',
    category_id: null,
    priority: 2,
    due_date: null,
    done: false,
    done_at: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    deleted_at: null,
  }

  it('local delete: marks the row deleted and sends deleted_at to the server', async () => {
    const store = await freshStore()
    await store.getState().addTask({ title: 'למחוק אותי' })
    await vi.waitFor(() => expect(server.inserts).toHaveLength(1))
    const id = store.getState().tasks[0].id

    await store.getState().softDeleteTask(id)
    await vi.waitFor(() => expect(server.updates).toHaveLength(1))

    expect(server.updates[0].deleted_at).toEqual(expect.any(String))
    // Kept in state so a permanent rejection can still roll it back, but no
    // longer visible anywhere in the app.
    const { filterTasks } = await import('../lib/taskFilters')
    expect(filterTasks(store.getState().tasks, 'all', '2026-08-26')).toHaveLength(0)
  })

  it('realtime delete: an UPDATE carrying deleted_at removes the task', async () => {
    const store = await freshStore()
    store.setState({ tasks: [REMOTE_TASK] })
    const { putRecord, getAll } = await import('../lib/db')
    await putRecord('tasks', REMOTE_TASK)

    store.getState().subscribeRealtime()
    expect(realtime.handler).not.toBeNull()

    realtime.handler!({
      eventType: 'UPDATE',
      new: {
        ...REMOTE_TASK,
        deleted_at: '2026-08-26T09:00:00.000Z',
        updated_at: '2026-08-26T09:00:00.000Z',
      },
      old: { id: REMOTE_TASK.id },
    })

    expect(store.getState().tasks).toHaveLength(0)
    // The cache must lose it too, or the next cold open shows it again.
    await vi.waitFor(async () => expect(await getAll<Task>('tasks')).toHaveLength(0))
  })

  it('realtime delete: a stale event does not undo a newer local edit', async () => {
    const store = await freshStore()
    const locallyEdited: Task = {
      ...REMOTE_TASK,
      title: 'נערך כאן אחרי המחיקה',
      updated_at: '2026-08-26T12:00:00.000Z',
    }
    store.setState({ tasks: [locallyEdited] })
    store.getState().subscribeRealtime()

    realtime.handler!({
      eventType: 'UPDATE',
      new: {
        ...REMOTE_TASK,
        deleted_at: '2026-08-26T09:00:00.000Z',
        updated_at: '2026-08-26T09:00:00.000Z',
      },
      old: { id: REMOTE_TASK.id },
    })

    expect(store.getState().tasks).toHaveLength(1)
    expect(store.getState().tasks[0].title).toBe('נערך כאן אחרי המחיקה')
  })

  it('realtime insert from another device still arrives', async () => {
    const store = await freshStore()
    store.getState().subscribeRealtime()

    realtime.handler!({ eventType: 'INSERT', new: REMOTE_TASK, old: {} })

    expect(store.getState().tasks).toEqual([REMOTE_TASK])
  })

  it('initial load: asks the server to exclude soft-deleted rows', async () => {
    const store = await freshStore()
    server.selectData = [
      REMOTE_TASK,
      {
        ...REMOTE_TASK,
        id: 'c0ffee00-0000-4000-8000-000000000002',
        deleted_at: '2026-08-26T09:00:00.000Z',
      },
    ]

    await store.getState().load()

    expect(server.selectFilters).toContainEqual({ column: 'deleted_at', value: null })
    expect(store.getState().tasks.map((task) => task.id)).toEqual([REMOTE_TASK.id])
  })

  it('initial load: drops a cached task the server no longer returns', async () => {
    const { putRecord, getAll } = await import('../lib/db')
    // The cached copy predates the delete, so it still looks alive here.
    await putRecord('tasks', REMOTE_TASK)
    const store = await freshStore()
    server.selectData = []

    await store.getState().load()

    expect(store.getState().tasks).toHaveLength(0)
    await vi.waitFor(async () => expect(await getAll<Task>('tasks')).toHaveLength(0))
  })

  it('initial load: keeps a task whose insert has not been delivered yet', async () => {
    server.insertError = { code: 'PGRST301', message: 'JWT expired' }
    const store = await freshStore()
    await store.getState().addTask({ title: 'עוד לא נשלחה' })
    await vi.waitFor(() => expect(server.inserts).toHaveLength(1))

    server.selectData = []
    await store.getState().load()

    expect(store.getState().tasks.map((task) => task.title)).toEqual(['עוד לא נשלחה'])
  })
})

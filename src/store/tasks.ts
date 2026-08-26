import { create } from 'zustand'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { getAll, createIndexedDbStore, putRecord, putAll, removeRecord } from '../lib/db'
import { ActionQueue, QueueRetryError, type QueueItem } from '../lib/queue'
import { SyncRejectionError, toQueueError, toUserMessage } from '../lib/syncErrors'
import { resolveConflict } from '../lib/conflict'
import { useAuthStore } from './authStore'
import type { Task, Priority } from '../types/database'

type TaskChanges = Partial<
  Pick<
    Task,
    | 'title'
    | 'notes'
    | 'category_id'
    | 'priority'
    | 'due_date'
    | 'done'
    | 'done_at'
    | 'deleted_at'
    | 'updated_at'
  >
>

export type TaskOperation =
  | { type: 'insert'; task: Task }
  | { type: 'update'; id: string; changes: TaskChanges; previousTask: Task }

const LOCAL_SAVE_ERROR = 'לא הצלחנו לשמור את המשימה במכשיר. נסי שוב.'
const LOAD_ERROR = 'לא הצלחנו לטעון את המשימות מהשרת. מוצג המידע השמור במכשיר.'
const NOT_SIGNED_IN = 'יש להתחבר כדי להוסיף משימה.'
const SESSION_LOST = 'ההתחברות פגה. התחברי מחדש כדי לשמור את השינויים.'
const WRONG_OWNER = 'המשימה שייכת למשתמשת אחרת ולא נשלחה. התחברי מחדש.'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The insert policy rejects any row whose user_id is not the caller's, and a
 * row that never carried one is rejected before the policy is even reached.
 * Checking it on the way out turns that into a Hebrew message instead of a
 * row that quietly never arrives.
 */
function assertInsertableByCurrentUser(task: Task): void {
  const sessionUserId = useAuthStore.getState().session?.user.id
  if (!sessionUserId) {
    // Retryable: the queue keeps the task until the session is back.
    throw new QueueRetryError(SESSION_LOST)
  }
  if (!task.user_id || !UUID_PATTERN.test(task.user_id)) {
    throw new SyncRejectionError(WRONG_OWNER)
  }
  if (task.user_id !== sessionUserId) {
    throw new SyncRejectionError(WRONG_OWNER)
  }
}

async function processTaskOperation(operation: TaskOperation): Promise<void> {
  try {
    if (operation.type === 'insert') {
      assertInsertableByCurrentUser(operation.task)
      const { error } = await supabase.from('tasks').insert(operation.task)
      // unique_violation: a previous attempt did land, so this one is done.
      if (error && error.code !== '23505') throw error
      return
    }

    const { error } = await supabase
      .from('tasks')
      .update(operation.changes)
      .eq('id', operation.id)
    if (error) throw error
  } catch (error) {
    throw toQueueError(error)
  }
}

export interface AddTaskInput {
  title: string
  notes?: string
  categoryId?: string | null
  priority?: Priority
  dueDate?: string | null
}

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error'

interface TasksState {
  tasks: Task[]
  status: 'idle' | 'loading' | 'ready'
  syncStatus: SyncStatus
  error: string | null
  load: () => Promise<void>
  addTask: (input: AddTaskInput) => Promise<void>
  updateTask: (id: string, changes: TaskChanges) => Promise<void>
  markDone: (id: string, done: boolean) => Promise<void>
  softDeleteTask: (id: string) => Promise<void>
  subscribeRealtime: () => () => void
  clearError: () => void
}

export const useTasksStore = create<TasksState>((set, get) => {
  /**
   * Set while the queue is holding something it could not deliver. Dismissing
   * the message must not make the indicator claim everything is synced, so the
   * indicator reads this rather than the banner text.
   */
  let deliveryFailure: string | null = null

  async function updateSyncStatus() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      set({ syncStatus: 'offline' })
      return
    }
    if (deliveryFailure) {
      set({ syncStatus: 'error' })
      return
    }
    const pending = await queue.pending()
    set({ syncStatus: pending.length > 0 ? 'syncing' : 'synced' })
  }

  const queue = new ActionQueue<TaskOperation>({
    store: createIndexedDbStore<QueueItem<TaskOperation>>('tasks_queue'),
    processor: processTaskOperation,
    onChange: () => void updateSyncStatus(),

    onDelivered: () => {
      deliveryFailure = null
    },

    // Still queued: keep the task exactly as the user left it, and say why it
    // has not arrived yet.
    onRetryableError: (_operation, error) => {
      deliveryFailure = toUserMessage(error)
      set({ error: deliveryFailure })
    },

    // The server will never accept this one. Roll it back so the screen stops
    // showing a task that does not exist, and say so.
    onPermanentError: (operation, error) => {
      const message = toUserMessage(error)
      if (operation.type === 'insert') {
        set((state) => ({
          tasks: state.tasks.filter((task) => task.id !== operation.task.id),
          error: `${message} המשימה «${operation.task.title}» לא נשמרה.`,
        }))
        void removeRecord('tasks', operation.task.id)
      } else {
        set((state) => ({
          tasks: state.tasks.map((task) =>
            task.id === operation.id ? operation.previousTask : task,
          ),
          error: message,
        }))
        void putRecord('tasks', operation.previousTask)
      }
    },
  })

  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => void updateSyncStatus())
    window.addEventListener('offline', () => void updateSyncStatus())
  }

  function applyUpdate(id: string, changes: TaskChanges) {
    const previousTask = get().tasks.find((task) => task.id === id)
    if (!previousTask) {
      return
    }

    const updatedAt = new Date().toISOString()
    const updatedTask: Task = { ...previousTask, ...changes, updated_at: updatedAt }

    set((state) => ({
      tasks: state.tasks.map((task) => (task.id === id ? updatedTask : task)),
    }))

    void queue
      .enqueue({
        type: 'update',
        id,
        changes: { ...changes, updated_at: updatedAt },
        previousTask,
      })
      .then(() => {
        void putRecord('tasks', updatedTask).catch(() => {})
        return queue.drain()
      })
      .catch(() => {
        // The change never reached the durable queue — undo it rather than
        // leaving a screen that disagrees with every other device.
        set((state) => ({
          tasks: state.tasks.map((task) => (task.id === id ? previousTask : task)),
          error: LOCAL_SAVE_ERROR,
          syncStatus: 'error',
        }))
      })
  }

  return {
    tasks: [],
    status: 'idle',
    syncStatus:
      typeof navigator !== 'undefined' && navigator.onLine === false
        ? 'offline'
        : 'synced',
    error: null,

    load: async () => {
      set({ status: 'loading' })
      const cached = await getAll<Task>('tasks').catch((): Task[] => [])
      set({ tasks: cached, status: 'ready' })

      // Anything left from a previous session gets another chance on open,
      // rather than waiting for the next action or for the network to flap.
      void queue.drain()

      const userId = useAuthStore.getState().session?.user.id
      if (!userId) {
        return
      }

      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', userId)
        // Without this every soft-deleted row is pulled back on every open,
        // so a delete made on another device is undone by the next refresh.
        .is('deleted_at', null)
      if (error || !data) {
        // A rejected read is the same symptom as a rejected write and must not
        // look like a healthy, quiet app.
        deliveryFailure = error ? toUserMessage(error) : LOAD_ERROR
        set({ error: LOAD_ERROR, syncStatus: 'error' })
        return
      }

      const pendingInsertIds = new Set(
        (await queue.pending())
          .filter((operation) => operation.type === 'insert')
          .map((operation) => operation.task.id),
      )

      const remoteIds = new Set(data.map((task) => task.id))
      const merged: Task[] = data.map((remoteTask) => {
        const localTask = cached.find((task) => task.id === remoteTask.id)
        return localTask ? resolveConflict(localTask, remoteTask) : remoteTask
      })

      for (const localTask of cached) {
        if (!remoteIds.has(localTask.id) && pendingInsertIds.has(localTask.id)) {
          merged.push(localTask)
        }
      }

      set({ tasks: merged })
      await putAll('tasks', merged).catch(() => {})

      // putAll only writes. Anything the server no longer returns — deleted
      // here or on another device — would otherwise sit in the cache forever
      // and be shown again on the next cold open.
      const mergedIds = new Set(merged.map((task) => task.id))
      for (const localTask of cached) {
        if (!mergedIds.has(localTask.id)) {
          void removeRecord('tasks', localTask.id).catch(() => {})
        }
      }

      void updateSyncStatus()
    },

    addTask: async (input) => {
      const userId = useAuthStore.getState().session?.user.id
      if (!userId) {
        set({ error: NOT_SIGNED_IN })
        return
      }

      const now = new Date().toISOString()
      const task: Task = {
        id: crypto.randomUUID(),
        user_id: userId,
        title: input.title,
        notes: input.notes ?? '',
        category_id: input.categoryId ?? null,
        priority: input.priority ?? 2,
        due_date: input.dueDate ?? null,
        done: false,
        done_at: null,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      }

      set((state) => ({ tasks: [...state.tasks, task] }))

      // The queue is what makes the task durable, so it goes first. The
      // IndexedDB copy under 'tasks' is only a render cache: if it fails the
      // task is still on its way, and it must never block the send.
      try {
        await queue.enqueue({ type: 'insert', task })
      } catch {
        set((state) => ({
          tasks: state.tasks.filter((existing) => existing.id !== task.id),
          error: LOCAL_SAVE_ERROR,
          syncStatus: 'error',
        }))
        return
      }

      void putRecord('tasks', task).catch(() => {})
      void queue.drain()
    },

    updateTask: async (id, changes) => {
      applyUpdate(id, changes)
    },

    markDone: async (id, done) => {
      applyUpdate(id, { done, done_at: done ? new Date().toISOString() : null })
    },

    softDeleteTask: async (id) => {
      applyUpdate(id, { deleted_at: new Date().toISOString() })
    },

    subscribeRealtime: () => {
      const userId = useAuthStore.getState().session?.user.id
      if (!userId) {
        return () => {}
      }

      const handlePayload = (payload: RealtimePostgresChangesPayload<Task>) => {
        if (payload.eventType === 'DELETE') {
          const deletedId = payload.old.id
          if (!deletedId) {
            return
          }
          set((state) => ({ tasks: state.tasks.filter((task) => task.id !== deletedId) }))
          void removeRecord('tasks', deletedId)
          return
        }

        const incoming = payload.new
        const existing = get().tasks.find((task) => task.id === incoming.id)
        const resolved = existing ? resolveConflict(existing, incoming) : incoming

        // A soft delete reaches other devices as an UPDATE carrying
        // deleted_at — Postgres never emits a DELETE for it. Dropping the row
        // here is what makes the deletion propagate; leaving it in state kept
        // the task on screen and its tombstone in the cache.
        if (resolved.deleted_at) {
          set((state) => ({
            tasks: state.tasks.filter((task) => task.id !== incoming.id),
          }))
          void removeRecord('tasks', incoming.id).catch(() => {})
          return
        }

        set((state) => ({
          tasks: existing
            ? state.tasks.map((task) => (task.id === incoming.id ? resolved : task))
            : [...state.tasks, resolved],
        }))
        void putRecord('tasks', resolved).catch(() => {})
      }

      const channel = supabase
        .channel('tasks-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'tasks',
            filter: `user_id=eq.${userId}`,
          },
          handlePayload,
        )
        .subscribe()

      return () => {
        void supabase.removeChannel(channel)
      }
    },

    // Dismisses the message only. If the queue is still stuck the indicator
    // keeps saying so.
    clearError: () => set({ error: null }),
  }
})

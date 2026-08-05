import { create } from 'zustand'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { getAll, createIndexedDbStore, putRecord, putAll, removeRecord } from '../lib/db'
import { ActionQueue, QueueNetworkError, type QueueItem } from '../lib/queue'
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

const SYNC_ERROR_MESSAGE = 'השינוי לא נשמר בשרת. נסי שוב.'

function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true
  }
  return error instanceof TypeError
}

async function processTaskOperation(operation: TaskOperation): Promise<void> {
  try {
    if (operation.type === 'insert') {
      const { error } = await supabase.from('tasks').insert(operation.task)
      if (error) throw error
      return
    }

    const { error } = await supabase
      .from('tasks')
      .update(operation.changes)
      .eq('id', operation.id)
    if (error) throw error
  } catch (error) {
    if (isNetworkError(error)) {
      throw new QueueNetworkError()
    }
    throw error
  }
}

export interface AddTaskInput {
  title: string
  notes?: string
  categoryId?: string | null
  priority?: Priority
  dueDate?: string | null
}

export type SyncStatus = 'synced' | 'syncing' | 'offline'

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
  async function updateSyncStatus() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      set({ syncStatus: 'offline' })
      return
    }
    const pending = await queue.pending()
    set({ syncStatus: pending.length > 0 ? 'syncing' : 'synced' })
  }

  const queue = new ActionQueue<TaskOperation>({
    store: createIndexedDbStore<QueueItem<TaskOperation>>('tasks_queue'),
    processor: processTaskOperation,
    onChange: () => void updateSyncStatus(),
    onError: (operation) => {
      if (operation.type === 'insert') {
        set((state) => ({
          tasks: state.tasks.filter((task) => task.id !== operation.task.id),
          error: SYNC_ERROR_MESSAGE,
        }))
        void removeRecord('tasks', operation.task.id)
      } else {
        set((state) => ({
          tasks: state.tasks.map((task) =>
            task.id === operation.id ? operation.previousTask : task,
          ),
          error: SYNC_ERROR_MESSAGE,
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
    void putRecord('tasks', updatedTask)
    void queue
      .enqueue({
        type: 'update',
        id,
        changes: { ...changes, updated_at: updatedAt },
        previousTask,
      })
      .then(() => queue.drain())
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
      const cached = await getAll<Task>('tasks')
      set({ tasks: cached, status: 'ready' })

      const userId = useAuthStore.getState().session?.user.id
      if (!userId) {
        return
      }

      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', userId)
      if (error || !data) {
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
      await putAll('tasks', merged)
      void updateSyncStatus()
    },

    addTask: async (input) => {
      const userId = useAuthStore.getState().session?.user.id
      if (!userId) {
        set({ error: 'יש להתחבר כדי להוסיף משימה.' })
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
      await putRecord('tasks', task)
      await queue.enqueue({ type: 'insert', task })
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
        set((state) => {
          const existing = state.tasks.find((task) => task.id === incoming.id)
          const resolved = existing ? resolveConflict(existing, incoming) : incoming
          const tasks = existing
            ? state.tasks.map((task) => (task.id === incoming.id ? resolved : task))
            : [...state.tasks, resolved]
          return { tasks }
        })
        const stored = get().tasks.find((task) => task.id === incoming.id)
        if (stored) {
          void putRecord('tasks', stored)
        }
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

    clearError: () => set({ error: null }),
  }
})

import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { getAll, createIndexedDbStore, putRecord, putAll, removeRecord } from '../lib/db'
import { ActionQueue, QueueRetryError, type QueueItem } from '../lib/queue'
import { SyncRejectionError, toQueueError, toUserMessage } from '../lib/syncErrors'
import { useAuthStore } from './authStore'
import type { Category } from '../types/database'

type CategoryChanges = Partial<Pick<Category, 'name' | 'color' | 'position'>>

export type CategoryOperation =
  | { type: 'insert'; category: Category }
  | { type: 'update'; id: string; changes: CategoryChanges; previousCategory: Category }
  | { type: 'delete'; id: string; previousCategory: Category }

const LOCAL_SAVE_ERROR = 'לא הצלחנו לשמור את הקטגוריה במכשיר. נסי שוב.'
const LOAD_ERROR = 'לא הצלחנו לטעון את הקטגוריות מהשרת. מוצג המידע השמור במכשיר.'
const NOT_SIGNED_IN = 'יש להתחבר כדי להוסיף קטגוריה.'
const SESSION_LOST = 'ההתחברות פגה. התחברי מחדש כדי לשמור את השינויים.'
const WRONG_OWNER = 'הקטגוריה שייכת למשתמשת אחרת ולא נשלחה. התחברי מחדש.'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Same reason as in the tasks store: a row without a valid owner can only be
 * rejected by RLS, so it is caught here where it can still be explained. */
function assertInsertableByCurrentUser(userId: string): void {
  const sessionUserId = useAuthStore.getState().session?.user.id
  if (!sessionUserId) {
    throw new QueueRetryError(SESSION_LOST)
  }
  if (!userId || !UUID_PATTERN.test(userId) || userId !== sessionUserId) {
    throw new SyncRejectionError(WRONG_OWNER)
  }
}

async function processCategoryOperation(operation: CategoryOperation): Promise<void> {
  try {
    if (operation.type === 'insert') {
      assertInsertableByCurrentUser(operation.category.user_id)
      const { error } = await supabase.from('categories').insert(operation.category)
      if (error && error.code !== '23505') throw error
      return
    }
    if (operation.type === 'update') {
      const { error } = await supabase
        .from('categories')
        .update(operation.changes)
        .eq('id', operation.id)
      if (error) throw error
      return
    }
    const { error } = await supabase.from('categories').delete().eq('id', operation.id)
    if (error) throw error
  } catch (error) {
    throw toQueueError(error)
  }
}

interface CategoriesState {
  categories: Category[]
  status: 'idle' | 'loading' | 'ready'
  error: string | null
  load: () => Promise<void>
  addCategory: (name: string) => Promise<void>
  renameCategory: (id: string, name: string) => Promise<void>
  recolorCategory: (id: string, color: string) => Promise<void>
  deleteCategory: (id: string) => Promise<void>
  clearError: () => void
}

const DEFAULT_COLOR = '#4A2C52'

export const useCategoriesStore = create<CategoriesState>((set, get) => {
  const queue = new ActionQueue<CategoryOperation>({
    store: createIndexedDbStore<QueueItem<CategoryOperation>>('categories_queue'),
    processor: processCategoryOperation,

    // Still queued — keep the change and explain the delay.
    onRetryableError: (_operation, error) => set({ error: toUserMessage(error) }),

    onPermanentError: (operation, error) => {
      const message = toUserMessage(error)
      if (operation.type === 'insert') {
        set((state) => ({
          categories: state.categories.filter(
            (category) => category.id !== operation.category.id,
          ),
          error: message,
        }))
        void removeRecord('categories', operation.category.id)
      } else {
        set((state) => ({
          categories: state.categories.some(
            (category) => category.id === operation.previousCategory.id,
          )
            ? state.categories.map((category) =>
                category.id === operation.previousCategory.id
                  ? operation.previousCategory
                  : category,
              )
            : [...state.categories, operation.previousCategory],
          error: message,
        }))
        void putRecord('categories', operation.previousCategory)
      }
    },
  })

  function applyUpdate(id: string, changes: CategoryChanges) {
    const previousCategory = get().categories.find((category) => category.id === id)
    if (!previousCategory) {
      return
    }

    const updatedCategory: Category = { ...previousCategory, ...changes }
    set((state) => ({
      categories: state.categories.map((category) =>
        category.id === id ? updatedCategory : category,
      ),
    }))
    void queue
      .enqueue({ type: 'update', id, changes, previousCategory })
      .then(() => {
        void putRecord('categories', updatedCategory).catch(() => {})
        return queue.drain()
      })
      .catch(() => {
        set((state) => ({
          categories: state.categories.map((category) =>
            category.id === id ? previousCategory : category,
          ),
          error: LOCAL_SAVE_ERROR,
        }))
      })
  }

  return {
    categories: [],
    status: 'idle',
    error: null,

    load: async () => {
      set({ status: 'loading' })
      const cached = await getAll<Category>('categories').catch((): Category[] => [])
      set({ categories: cached, status: 'ready' })
      void queue.drain()

      const userId = useAuthStore.getState().session?.user.id
      if (!userId) {
        return
      }

      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('user_id', userId)
        .order('position', { ascending: true })
      if (error || !data) {
        set({ error: LOAD_ERROR })
        return
      }

      const pendingInsertIds = new Set(
        (await queue.pending())
          .filter((operation) => operation.type === 'insert')
          .map((operation) => operation.category.id),
      )

      const remoteIds = new Set(data.map((category) => category.id))
      const merged: Category[] = [...data]
      for (const localCategory of cached) {
        if (!remoteIds.has(localCategory.id) && pendingInsertIds.has(localCategory.id)) {
          merged.push(localCategory)
        }
      }

      set({ categories: merged })
      await putAll('categories', merged).catch(() => {})
    },

    addCategory: async (name) => {
      const userId = useAuthStore.getState().session?.user.id
      if (!userId) {
        set({ error: NOT_SIGNED_IN })
        return
      }

      const trimmed = name.trim()
      if (!trimmed) {
        return
      }

      const position = get().categories.length
      const category: Category = {
        id: crypto.randomUUID(),
        user_id: userId,
        name: trimmed,
        color: DEFAULT_COLOR,
        position,
      }

      set((state) => ({ categories: [...state.categories, category] }))

      // Durability first, render cache second — see the tasks store.
      try {
        await queue.enqueue({ type: 'insert', category })
      } catch {
        set((state) => ({
          categories: state.categories.filter((existing) => existing.id !== category.id),
          error: LOCAL_SAVE_ERROR,
        }))
        return
      }

      void putRecord('categories', category).catch(() => {})
      void queue.drain()
    },

    renameCategory: async (id, name) => {
      const trimmed = name.trim()
      if (!trimmed) {
        return
      }
      applyUpdate(id, { name: trimmed })
    },

    recolorCategory: async (id, color) => {
      applyUpdate(id, { color })
    },

    deleteCategory: async (id) => {
      const previousCategory = get().categories.find((category) => category.id === id)
      if (!previousCategory) {
        return
      }

      set((state) => ({
        categories: state.categories.filter((category) => category.id !== id),
      }))

      try {
        await queue.enqueue({ type: 'delete', id, previousCategory })
      } catch {
        set((state) => ({
          categories: [...state.categories, previousCategory],
          error: LOCAL_SAVE_ERROR,
        }))
        return
      }

      void removeRecord('categories', id).catch(() => {})
      void queue.drain()
    },

    clearError: () => set({ error: null }),
  }
})

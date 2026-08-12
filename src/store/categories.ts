import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { getAll, createIndexedDbStore, putRecord, putAll, removeRecord } from '../lib/db'
import { ActionQueue, QueueNetworkError, type QueueItem } from '../lib/queue'
import { useAuthStore } from './authStore'
import type { Category } from '../types/database'

type CategoryChanges = Partial<Pick<Category, 'name' | 'color' | 'position'>>

export type CategoryOperation =
  | { type: 'insert'; category: Category }
  | { type: 'update'; id: string; changes: CategoryChanges; previousCategory: Category }
  | { type: 'delete'; id: string; previousCategory: Category }

const SYNC_ERROR_MESSAGE = 'השינוי לא נשמר בשרת. נסי שוב.'

function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true
  }
  return error instanceof TypeError
}

async function processCategoryOperation(operation: CategoryOperation): Promise<void> {
  try {
    if (operation.type === 'insert') {
      const { error } = await supabase.from('categories').insert(operation.category)
      if (error) throw error
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
    if (isNetworkError(error)) {
      throw new QueueNetworkError()
    }
    throw error
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
    onError: (operation) => {
      if (operation.type === 'insert') {
        set((state) => ({
          categories: state.categories.filter(
            (category) => category.id !== operation.category.id,
          ),
          error: SYNC_ERROR_MESSAGE,
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
          error: SYNC_ERROR_MESSAGE,
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
    void putRecord('categories', updatedCategory)
    void queue
      .enqueue({ type: 'update', id, changes, previousCategory })
      .then(() => queue.drain())
  }

  return {
    categories: [],
    status: 'idle',
    error: null,

    load: async () => {
      set({ status: 'loading' })
      const cached = await getAll<Category>('categories')
      set({ categories: cached, status: 'ready' })

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
      await putAll('categories', merged)
    },

    addCategory: async (name) => {
      const userId = useAuthStore.getState().session?.user.id
      if (!userId) {
        set({ error: 'יש להתחבר כדי להוסיף קטגוריה.' })
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
      await putRecord('categories', category)
      await queue.enqueue({ type: 'insert', category })
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
      await removeRecord('categories', id)
      await queue.enqueue({ type: 'delete', id, previousCategory })
      void queue.drain()
    },

    clearError: () => set({ error: null }),
  }
})

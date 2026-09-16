import { beforeEach, describe, expect, it } from 'vitest'
import {
  ALL_CATEGORIES,
  filterByCategory,
  readStoredCategoryFilter,
  resolveCategoryFilter,
  sortCategories,
  writeStoredCategoryFilter,
} from './categoryFilter'
import type { Category, Task } from '../types/database'

function makeCategory(overrides: Partial<Category>): Category {
  return {
    id: 'id',
    user_id: 'user-1',
    name: 'קטגוריה',
    color: '#4A2C52',
    position: 0,
    ...overrides,
  }
}

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: 'id',
    user_id: 'user-1',
    title: 'משימה',
    notes: '',
    category_id: null,
    priority: 2,
    due_date: null,
    done: false,
    done_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  }
}

describe('categoryFilter', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to all categories when nothing is stored', () => {
    expect(readStoredCategoryFilter()).toBe(ALL_CATEGORIES)
  })

  it('stores and restores a chosen category', () => {
    writeStoredCategoryFilter('cat-1')
    expect(readStoredCategoryFilter()).toBe('cat-1')
  })

  it('clears the stored value when all categories are selected again', () => {
    writeStoredCategoryFilter('cat-1')
    writeStoredCategoryFilter(ALL_CATEGORIES)
    expect(readStoredCategoryFilter()).toBe(ALL_CATEGORIES)
  })

  it('keeps a stored category that still exists', () => {
    const categories = [makeCategory({ id: 'cat-1' })]
    expect(resolveCategoryFilter('cat-1', categories)).toBe('cat-1')
  })

  it('falls back to all categories when the stored one was deleted', () => {
    const categories = [makeCategory({ id: 'cat-2' })]
    expect(resolveCategoryFilter('cat-1', categories)).toBe(ALL_CATEGORIES)
  })

  it('filters tasks by category and passes everything through for "all"', () => {
    const tasks = [
      makeTask({ id: 'a', category_id: 'cat-1' }),
      makeTask({ id: 'b', category_id: 'cat-2' }),
      makeTask({ id: 'c', category_id: null }),
    ]
    expect(filterByCategory(tasks, 'cat-1').map((task) => task.id)).toEqual(['a'])
    expect(filterByCategory(tasks, ALL_CATEGORIES)).toHaveLength(3)
  })

  it('orders categories by position', () => {
    const categories = [
      makeCategory({ id: 'b', position: 2 }),
      makeCategory({ id: 'a', position: 1 }),
    ]
    expect(sortCategories(categories).map((category) => category.id)).toEqual(['a', 'b'])
  })
})

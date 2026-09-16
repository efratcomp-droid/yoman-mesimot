import type { Category, Task } from '../types/database'

/** Sentinel for "no category filter". Never a real category id (those are UUIDs). */
export const ALL_CATEGORIES = 'all'

const STORAGE_KEY = 'yoman-mesimot:category-filter'

/**
 * Only the selected chip lives in localStorage — a UI preference, not task
 * data. Every access is guarded: Safari in private mode throws on access.
 */
export function readStoredCategoryFilter(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? ALL_CATEGORIES
  } catch {
    return ALL_CATEGORIES
  }
}

export function writeStoredCategoryFilter(categoryId: string): void {
  try {
    if (categoryId === ALL_CATEGORIES) {
      localStorage.removeItem(STORAGE_KEY)
    } else {
      localStorage.setItem(STORAGE_KEY, categoryId)
    }
  } catch {
    // A preference that cannot be stored is not worth failing a render over.
  }
}

/** A stored category that no longer exists falls back to "all categories". */
export function resolveCategoryFilter(
  categoryId: string,
  categories: Category[],
): string {
  if (categoryId === ALL_CATEGORIES) {
    return ALL_CATEGORIES
  }
  return categories.some((category) => category.id === categoryId)
    ? categoryId
    : ALL_CATEGORIES
}

export function filterByCategory(tasks: Task[], categoryId: string): Task[] {
  if (categoryId === ALL_CATEGORIES) {
    return tasks
  }
  return tasks.filter((task) => task.category_id === categoryId)
}

/** Categories in the order the user arranged them. */
export function sortCategories(categories: Category[]): Category[] {
  return [...categories].sort((a, b) => a.position - b.position)
}

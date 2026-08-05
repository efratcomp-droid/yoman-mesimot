import type { Task } from '../types/database'
import { endOfWeek } from './formatDate'

export type FilterKey = 'today' | 'week' | 'all' | 'done'

export const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'today', label: 'היום' },
  { key: 'week', label: 'השבוע' },
  { key: 'all', label: 'הכול' },
  { key: 'done', label: 'בוצע' },
]

/** Excludes soft-deleted rows, then applies the selected tab. */
export function filterTasks(tasks: Task[], filter: FilterKey, today: string): Task[] {
  const visible = tasks.filter((task) => !task.deleted_at)

  switch (filter) {
    case 'today':
      return visible.filter(
        (task) => !task.done && task.due_date !== null && task.due_date <= today,
      )
    case 'week': {
      const end = endOfWeek(today)
      return visible.filter(
        (task) => !task.done && task.due_date !== null && task.due_date <= end,
      )
    }
    case 'all':
      return visible.filter((task) => !task.done)
    case 'done':
      return visible.filter((task) => task.done)
  }
}

/**
 * Default order from CLAUDE.md: open tasks first, the most overdue of them
 * at the top, then by due date ascending, then by priority within the same
 * date. Done tasks are grouped after open ones, most recently completed first.
 */
export function sortTasks(tasks: Task[], today: string): Task[] {
  return [...tasks].sort((a, b) => compareTasks(a, b, today))
}

function compareTasks(a: Task, b: Task, today: string): number {
  if (a.done !== b.done) {
    return a.done ? 1 : -1
  }

  if (a.done) {
    return (b.done_at ?? '').localeCompare(a.done_at ?? '')
  }

  const aOverdue = a.due_date !== null && a.due_date < today
  const bOverdue = b.due_date !== null && b.due_date < today
  if (aOverdue !== bOverdue) {
    return aOverdue ? -1 : 1
  }

  const aDue = a.due_date ?? '9999-99-99'
  const bDue = b.due_date ?? '9999-99-99'
  if (aDue !== bDue) {
    return aDue.localeCompare(bDue)
  }

  return a.priority - b.priority
}

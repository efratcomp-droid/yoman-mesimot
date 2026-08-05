import { describe, expect, it } from 'vitest'
import type { Task } from '../types/database'
import { filterTasks, sortTasks } from './taskFilters'

const today = '2026-08-05'

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: overrides.id ?? 'id',
    user_id: 'user-1',
    title: overrides.title ?? 'task',
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

describe('filterTasks', () => {
  const tasks = [
    makeTask({ id: 'overdue', due_date: '2026-08-01' }),
    makeTask({ id: 'today', due_date: today }),
    makeTask({ id: 'later-this-week', due_date: '2026-08-08' }),
    makeTask({ id: 'next-week', due_date: '2026-08-20' }),
    makeTask({ id: 'no-date', due_date: null }),
    makeTask({ id: 'done', due_date: today, done: true, done_at: today }),
    makeTask({ id: 'deleted', due_date: today, deleted_at: '2026-08-04T00:00:00.000Z' }),
  ]

  it('excludes soft-deleted rows from every tab', () => {
    for (const filter of ['today', 'week', 'all', 'done'] as const) {
      expect(
        filterTasks(tasks, filter, today).some((task) => task.id === 'deleted'),
      ).toBe(false)
    }
  })

  it('"today" shows overdue and due-today open tasks, not later ones', () => {
    const ids = filterTasks(tasks, 'today', today).map((task) => task.id)
    expect(ids.sort()).toEqual(['overdue', 'today'])
  })

  it('"week" also includes tasks due later in the current week', () => {
    const ids = filterTasks(tasks, 'week', today).map((task) => task.id)
    expect(ids.sort()).toEqual(['later-this-week', 'overdue', 'today'])
  })

  it('"all" shows every open task regardless of date', () => {
    const ids = filterTasks(tasks, 'all', today).map((task) => task.id)
    expect(ids.sort()).toEqual([
      'later-this-week',
      'next-week',
      'no-date',
      'overdue',
      'today',
    ])
  })

  it('"done" shows only completed tasks', () => {
    const ids = filterTasks(tasks, 'done', today).map((task) => task.id)
    expect(ids).toEqual(['done'])
  })
})

describe('sortTasks', () => {
  it('puts open tasks before done tasks', () => {
    const tasks = [
      makeTask({ id: 'done', done: true, done_at: today }),
      makeTask({ id: 'open', due_date: today }),
    ]
    expect(sortTasks(tasks, today).map((task) => task.id)).toEqual(['open', 'done'])
  })

  it('puts the most overdue task at the very top', () => {
    const tasks = [
      makeTask({ id: 'due-today', due_date: today }),
      makeTask({ id: 'overdue-1-day', due_date: '2026-08-04' }),
      makeTask({ id: 'overdue-3-days', due_date: '2026-08-02' }),
    ]
    expect(sortTasks(tasks, today).map((task) => task.id)).toEqual([
      'overdue-3-days',
      'overdue-1-day',
      'due-today',
    ])
  })

  it('sorts non-overdue open tasks by due date ascending, nulls last', () => {
    const tasks = [
      makeTask({ id: 'no-date', due_date: null }),
      makeTask({ id: 'later', due_date: '2026-08-10' }),
      makeTask({ id: 'sooner', due_date: '2026-08-06' }),
    ]
    expect(sortTasks(tasks, today).map((task) => task.id)).toEqual([
      'sooner',
      'later',
      'no-date',
    ])
  })

  it('breaks ties on the same due date by priority', () => {
    const tasks = [
      makeTask({ id: 'low', due_date: today, priority: 3 }),
      makeTask({ id: 'urgent', due_date: today, priority: 1 }),
      makeTask({ id: 'normal', due_date: today, priority: 2 }),
    ]
    expect(sortTasks(tasks, today).map((task) => task.id)).toEqual([
      'urgent',
      'normal',
      'low',
    ])
  })

  it('sorts done tasks most-recently-completed first', () => {
    const tasks = [
      makeTask({ id: 'done-earlier', done: true, done_at: '2026-08-01T00:00:00.000Z' }),
      makeTask({ id: 'done-later', done: true, done_at: '2026-08-04T00:00:00.000Z' }),
    ]
    expect(sortTasks(tasks, today).map((task) => task.id)).toEqual([
      'done-later',
      'done-earlier',
    ])
  })
})

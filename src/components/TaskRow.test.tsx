import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../types/database'
import TaskRow from './TaskRow'

const today = '2026-08-05'

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    user_id: 'user-1',
    title: 'להעביר דוח',
    notes: 'כולל נספחים',
    category_id: 'cat-1',
    priority: 1,
    due_date: '2026-08-31',
    done: false,
    done_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  }
}

const onToggleDone = vi.fn()
const onDelete = vi.fn()
const onEdit = vi.fn()

function renderRow(task: Task = makeTask(), categoryName = 'כספים') {
  return render(
    <TaskRow
      task={task}
      today={today}
      categoryName={categoryName}
      onToggleDone={onToggleDone}
      onDelete={onDelete}
      onEdit={onEdit}
    />,
  )
}

describe('TaskRow calendar link', () => {
  beforeEach(() => {
    onToggleDone.mockClear()
    onDelete.mockClear()
    onEdit.mockClear()
  })

  it('shows the calendar link when the task has a due date', () => {
    renderRow()

    const link = screen.getByRole('link', { name: 'הוספה ליומן' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')

    const params = new URL(link.getAttribute('href')!).searchParams
    expect(params.get('text')).toBe('להעביר דוח')
    expect(params.get('dates')).toBe('20260831/20260901')
    expect(params.get('details')).toBe('כולל נספחים\nקטגוריה: כספים\nעדיפות: דחוף')
  })

  it('omits the category line when the task has none', () => {
    renderRow(makeTask({ category_id: null }), 'ללא קטגוריה')

    const link = screen.getByRole('link', { name: 'הוספה ליומן' })
    const details = new URL(link.getAttribute('href')!).searchParams.get('details')
    expect(details).toBe('כולל נספחים\nעדיפות: דחוף')
  })

  it('hides the calendar link when the task has no due date', () => {
    renderRow(makeTask({ due_date: null }))

    expect(screen.queryByRole('link', { name: 'הוספה ליומן' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('הוספה ליומן')).not.toBeInTheDocument()
  })

  it('hides the calendar link on a completed task', () => {
    renderRow(makeTask({ done: true, done_at: '2026-08-05T09:00:00.000Z' }))

    expect(screen.queryByRole('link', { name: 'הוספה ליומן' })).not.toBeInTheDocument()
  })

  it('does not open the edit panel when the calendar link is clicked', async () => {
    renderRow()
    const user = userEvent.setup()

    await user.click(screen.getByRole('link', { name: 'הוספה ליומן' }))

    expect(onEdit).not.toHaveBeenCalled()
    expect(onDelete).not.toHaveBeenCalled()
    expect(onToggleDone).not.toHaveBeenCalled()
  })

  it('still opens the edit panel from the task title', async () => {
    renderRow()
    const user = userEvent.setup()

    await user.click(screen.getByText('להעביר דוח'))

    expect(onEdit).toHaveBeenCalledWith('task-1')
  })
})

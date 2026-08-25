import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../types/database'
import TaskEditPanel from './TaskEditPanel'

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    user_id: 'user-1',
    title: 'משימה לעריכה',
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

const onUpdate = vi.fn()
const onDelete = vi.fn()
const onClose = vi.fn()

/**
 * jsdom does not implement PointerEvent, so fireEvent.pointerMove drops
 * clientY. Dispatching a MouseEvent under the pointer type keeps coordinates.
 */
function pointerEventWithY(type: string, clientY: number): Event {
  return new MouseEvent(type, { clientY, bubbles: true })
}

function drag(handle: Element, fromY: number, toY: number) {
  fireEvent(handle, pointerEventWithY('pointerdown', fromY))
  fireEvent(handle, pointerEventWithY('pointermove', toY))
  fireEvent(handle, pointerEventWithY('pointerup', toY))
}

function renderPanel(task: Task = makeTask()) {
  return render(
    <TaskEditPanel
      task={task}
      categories={[
        { id: 'cat-1', user_id: 'user-1', name: 'כספים', color: '#4A2C52', position: 0 },
      ]}
      onUpdate={onUpdate}
      onDelete={onDelete}
      onClose={onClose}
    />,
  )
}

describe('TaskEditPanel', () => {
  beforeEach(() => {
    onUpdate.mockClear()
    onDelete.mockClear()
    onClose.mockClear()
  })

  it('renders every editable field', () => {
    renderPanel()
    expect(screen.getByRole('dialog', { name: 'עריכת משימה' })).toBeInTheDocument()
    expect(screen.getByLabelText('כותרת')).toBeInTheDocument()
    expect(screen.getByLabelText('הערות')).toBeInTheDocument()
    expect(screen.getByLabelText('קטגוריה')).toBeInTheDocument()
    expect(screen.getByLabelText('עדיפות')).toBeInTheDocument()
    expect(screen.getByLabelText('תאריך יעד')).toBeInTheDocument()
  })

  it('requires confirmation before deleting', async () => {
    renderPanel()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'מחיקת משימה' }))
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByText('למחוק את המשימה? הפעולה בלתי הפיכה.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'מחיקה' }))
    expect(onDelete).toHaveBeenCalledWith('task-1')
    expect(onClose).toHaveBeenCalled()
  })

  it('cancels the delete confirmation', async () => {
    renderPanel()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'מחיקת משימה' }))
    await user.click(screen.getByRole('button', { name: 'ביטול' }))

    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'מחיקת משימה' })).toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    renderPanel()
    const user = userEvent.setup()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('closes when dragged down past the threshold', () => {
    const { container } = renderPanel()
    const handle = container.querySelector('.cursor-grab')!

    drag(handle, 0, 120)

    expect(onClose).toHaveBeenCalled()
  })

  it('stays open when dragged down only slightly', () => {
    const { container } = renderPanel()
    const handle = container.querySelector('.cursor-grab')!

    drag(handle, 0, 20)

    expect(onClose).not.toHaveBeenCalled()
  })

  it('disables the calendar button when the task has no due date', () => {
    renderPanel()

    const button = screen.getByRole('button', { name: /הוספה ליומן/ })
    expect(button).toBeDisabled()
    expect(
      screen.getByText('כדי להוסיף ליומן צריך קודם לקבוע תאריך יעד.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /הוספה ליומן/ })).not.toBeInTheDocument()
  })

  it('links to Google Calendar when the task has a due date', () => {
    renderPanel(
      makeTask({
        title: 'להעביר דוח',
        notes: 'כולל נספחים',
        category_id: 'cat-1',
        priority: 1,
        due_date: '2026-08-31',
      }),
    )

    const link = screen.getByRole('link', { name: /הוספה ליומן/ })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')

    const params = new URL(link.getAttribute('href')!).searchParams
    expect(params.get('text')).toBe('להעביר דוח')
    expect(params.get('dates')).toBe('20260831/20260901')
    expect(params.get('details')).toBe('כולל נספחים\nקטגוריה: כספים\nעדיפות: דחוף')
  })

  it('updates priority immediately on change', async () => {
    renderPanel()
    const user = userEvent.setup()

    await user.selectOptions(screen.getByLabelText('עדיפות'), '1')

    expect(onUpdate).toHaveBeenCalledWith('task-1', { priority: 1 })
  })
})

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { Category, Task } from '../types/database'
import type { SyncStatus } from '../store/tasks'
import MainScreen from './MainScreen'

interface MockTasksState {
  tasks: Task[]
  syncStatus: SyncStatus
  error: string | null
  clearError: Mock<() => void>
  load: Mock<() => void>
  addTask: Mock<() => void>
  updateTask: Mock<(id: string, changes: Partial<Task>) => void>
  markDone: Mock<(id: string, done: boolean) => void>
  softDeleteTask: Mock<(id: string) => void>
  subscribeRealtime: Mock<() => () => void>
}

interface MockCategoriesState {
  categories: Category[]
  status: 'idle' | 'loading' | 'ready'
  load: Mock<() => void>
}

const { tasksState, categoriesState, unsubscribeMock } = vi.hoisted(() => ({
  tasksState: {
    tasks: [] as Task[],
    syncStatus: 'synced' as SyncStatus,
    error: null as string | null,
    clearError: vi.fn<() => void>(),
    load: vi.fn<() => void>(),
    addTask: vi.fn<() => void>(),
    updateTask: vi.fn<(id: string, changes: Partial<Task>) => void>(),
    markDone: vi.fn<(id: string, done: boolean) => void>(),
    softDeleteTask: vi.fn<(id: string) => void>(),
    subscribeRealtime: vi.fn<() => () => void>(),
  } satisfies MockTasksState,
  categoriesState: {
    categories: [] as Category[],
    status: 'ready' as 'idle' | 'loading' | 'ready',
    load: vi.fn<() => void>(),
  } satisfies MockCategoriesState,
  unsubscribeMock: vi.fn(),
}))

vi.mock('../store/tasks', () => ({
  useTasksStore: <T,>(selector: (state: MockTasksState) => T): T => selector(tasksState),
}))

vi.mock('../store/categories', () => ({
  useCategoriesStore: <T,>(selector: (state: MockCategoriesState) => T): T =>
    selector(categoriesState),
}))

function makeCategory(overrides: Partial<Category>): Category {
  return {
    id: overrides.id ?? 'cat',
    user_id: 'user-1',
    name: overrides.name ?? 'קטגוריה',
    color: '#4A2C52',
    position: 0,
    ...overrides,
  }
}

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

const onOpenSettings = vi.fn()

describe('MainScreen', () => {
  beforeEach(() => {
    tasksState.tasks = []
    tasksState.syncStatus = 'synced'
    tasksState.error = null
    tasksState.clearError.mockClear()
    tasksState.load.mockClear()
    tasksState.markDone.mockClear()
    tasksState.softDeleteTask.mockClear()
    categoriesState.categories = []
    categoriesState.status = 'ready'
    localStorage.clear()
    onOpenSettings.mockClear()
    unsubscribeMock.mockClear()
    tasksState.subscribeRealtime.mockClear()
    tasksState.subscribeRealtime.mockReturnValue(unsubscribeMock)
  })

  it('calls load and subscribeRealtime on mount, and unsubscribes on unmount', async () => {
    const { unmount } = render(<MainScreen onOpenSettings={onOpenSettings} />)
    expect(tasksState.load).toHaveBeenCalled()
    expect(tasksState.subscribeRealtime).toHaveBeenCalled()
    expect(unsubscribeMock).not.toHaveBeenCalled()
    await screen.findByText('אין משימות לתאריך של היום.')

    unmount()
    expect(unsubscribeMock).toHaveBeenCalled()
  })

  it('shows the sync status from the store', async () => {
    tasksState.syncStatus = 'offline'
    render(<MainScreen onOpenSettings={onOpenSettings} />)
    expect(await screen.findByText('אין חיבור')).toBeInTheDocument()
  })

  // A failed write used to leave no trace on screen at all: the store held an
  // error, nothing rendered it, and the indicator still read "מסונכרן".
  it('shows a failed write to the user instead of swallowing it', async () => {
    tasksState.error = 'לשרת אין הרשאה לקבל את השינוי.'
    tasksState.syncStatus = 'error'
    render(<MainScreen onOpenSettings={onOpenSettings} />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('לשרת אין הרשאה לקבל את השינוי.')
    expect(screen.getByText('השמירה נכשלה')).toBeInTheDocument()
    expect(screen.queryByText('מסונכרן')).not.toBeInTheDocument()
  })

  it('dismisses the failure message when the user closes it', async () => {
    tasksState.error = 'השמירה בשרת נכשלה. נסי שוב.'
    render(<MainScreen onOpenSettings={onOpenSettings} />)
    await screen.findByRole('alert')

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'סגירת ההודעה' }))

    expect(tasksState.clearError).toHaveBeenCalled()
  })

  it('shows no alert while everything is synced', async () => {
    render(<MainScreen onOpenSettings={onOpenSettings} />)
    await screen.findByText('אין משימות לתאריך של היום.')

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the CLAUDE.md empty-state message for the default "today" tab', async () => {
    render(<MainScreen onOpenSettings={onOpenSettings} />)
    expect(await screen.findByText('אין משימות לתאריך של היום.')).toBeInTheDocument()
  })

  it('opens settings when the gear button is clicked', async () => {
    render(<MainScreen onOpenSettings={onOpenSettings} />)
    await screen.findByText('אין משימות לתאריך של היום.')

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'הגדרות' }))

    expect(onOpenSettings).toHaveBeenCalled()
  })

  it('renders open tasks and switches tabs via the filter chips', async () => {
    const today = new Date().toISOString().slice(0, 10)
    tasksState.tasks = [
      makeTask({ id: 'open-today', title: 'משימה פתוחה', due_date: today }),
      makeTask({ id: 'done-task', title: 'משימה גמורה', done: true, done_at: today }),
    ]
    render(<MainScreen onOpenSettings={onOpenSettings} />)

    expect(await screen.findByText('משימה פתוחה')).toBeInTheDocument()
    expect(screen.queryByText('משימה גמורה')).not.toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'בוצע' }))

    expect(screen.getByText('משימה גמורה')).toBeInTheDocument()
    expect(screen.queryByText('משימה פתוחה')).not.toBeInTheDocument()
  })

  it('marks a task done when its checkbox is clicked', async () => {
    const today = new Date().toISOString().slice(0, 10)
    tasksState.tasks = [makeTask({ id: 'task-1', title: 'לסמן', due_date: today })]
    render(<MainScreen onOpenSettings={onOpenSettings} />)
    await screen.findByText('לסמן')

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'סימון כבוצע' }))

    expect(tasksState.markDone).toHaveBeenCalledWith('task-1', true)
  })

  it('opens the edit panel when a task title is clicked, and closes it on Escape', async () => {
    const today = new Date().toISOString().slice(0, 10)
    tasksState.tasks = [makeTask({ id: 'task-1', title: 'לערוך', due_date: today })]
    render(<MainScreen onOpenSettings={onOpenSettings} />)
    await screen.findByText('לערוך')

    const user = userEvent.setup()
    await user.click(screen.getByText('לערוך'))
    expect(screen.getByRole('dialog', { name: 'עריכת משימה' })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'עריכת משימה' })).not.toBeInTheDocument()
  })
  it('hides the category bar with fewer than two categories, and shows it with two', async () => {
    render(<MainScreen onOpenSettings={onOpenSettings} />)
    await screen.findByText('אין משימות לתאריך של היום.')
    expect(
      screen.queryByRole('group', { name: 'סינון לפי קטגוריה' }),
    ).not.toBeInTheDocument()

    categoriesState.categories = [makeCategory({ id: 'cat-1', name: 'כספים' })]
    const single = render(<MainScreen onOpenSettings={onOpenSettings} />)
    expect(
      screen.queryByRole('group', { name: 'סינון לפי קטגוריה' }),
    ).not.toBeInTheDocument()
    single.unmount()

    categoriesState.categories = [
      makeCategory({ id: 'cat-1', name: 'כספים', position: 1 }),
      makeCategory({ id: 'cat-2', name: 'תפעול', position: 0 }),
    ]
    render(<MainScreen onOpenSettings={onOpenSettings} />)
    const bar = await screen.findByRole('group', { name: 'סינון לפי קטגוריה' })
    expect(
      within(bar)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['כל הקטגוריות', 'תפעול', 'כספים'])
  })

  it('combines the date filter with the category filter, and leaves the counters alone', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const nextMonth = '2099-01-01'
    categoriesState.categories = [
      makeCategory({ id: 'cat-1', name: 'כספים', position: 0 }),
      makeCategory({ id: 'cat-2', name: 'תפעול', position: 1 }),
    ]
    tasksState.tasks = [
      makeTask({ id: 'a', title: 'כספים היום', due_date: today, category_id: 'cat-1' }),
      makeTask({ id: 'b', title: 'תפעול היום', due_date: today, category_id: 'cat-2' }),
      makeTask({
        id: 'c',
        title: 'כספים מאוחר',
        due_date: nextMonth,
        category_id: 'cat-1',
      }),
    ]
    render(<MainScreen onOpenSettings={onOpenSettings} />)
    await screen.findByText('כספים היום')

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'כספים' }))

    expect(screen.getByText('כספים היום')).toBeInTheDocument()
    expect(screen.queryByText('תפעול היום')).not.toBeInTheDocument()
    expect(screen.queryByText('כספים מאוחר')).not.toBeInTheDocument()

    // The counters keep counting everything: two tasks due today, three open.
    expect(screen.getByText('להיום').previousElementSibling).toHaveTextContent('2')
    expect(screen.getByText('פתוחות').previousElementSibling).toHaveTextContent('3')

    await user.click(screen.getByRole('button', { name: 'הכול' }))
    expect(screen.getByText('כספים מאוחר')).toBeInTheDocument()
    expect(screen.queryByText('תפעול היום')).not.toBeInTheDocument()
  })

  it('shows the category empty state when the selected category has no tasks', async () => {
    const today = new Date().toISOString().slice(0, 10)
    categoriesState.categories = [
      makeCategory({ id: 'cat-1', name: 'כספים', position: 0 }),
      makeCategory({ id: 'cat-2', name: 'תפעול', position: 1 }),
    ]
    tasksState.tasks = [
      makeTask({ id: 'a', title: 'כספים היום', due_date: today, category_id: 'cat-1' }),
    ]
    render(<MainScreen onOpenSettings={onOpenSettings} />)
    await screen.findByText('כספים היום')

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'תפעול' }))

    expect(screen.getByText('אין משימות בקטגוריה הזו.')).toBeInTheDocument()
  })

  it('remembers the selected category across openings', async () => {
    categoriesState.categories = [
      makeCategory({ id: 'cat-1', name: 'כספים', position: 0 }),
      makeCategory({ id: 'cat-2', name: 'תפעול', position: 1 }),
    ]
    const first = render(<MainScreen onOpenSettings={onOpenSettings} />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'תפעול' }))
    expect(screen.getByRole('button', { name: 'תפעול' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    first.unmount()

    render(<MainScreen onOpenSettings={onOpenSettings} />)
    expect(await screen.findByRole('button', { name: 'תפעול' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'כל הקטגוריות' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('falls back to all categories when the remembered one was deleted', async () => {
    const today = new Date().toISOString().slice(0, 10)
    categoriesState.categories = [
      makeCategory({ id: 'cat-1', name: 'כספים', position: 0 }),
      makeCategory({ id: 'cat-2', name: 'תפעול', position: 1 }),
    ]
    const first = render(<MainScreen onOpenSettings={onOpenSettings} />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'תפעול' }))
    first.unmount()

    // "תפעול" is gone by the next opening.
    categoriesState.categories = [
      makeCategory({ id: 'cat-1', name: 'כספים', position: 0 }),
      makeCategory({ id: 'cat-3', name: 'אישי', position: 1 }),
    ]
    tasksState.tasks = [
      makeTask({ id: 'a', title: 'כספים היום', due_date: today, category_id: 'cat-1' }),
    ]
    render(<MainScreen onOpenSettings={onOpenSettings} />)

    expect(await screen.findByText('כספים היום')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'כל הקטגוריות' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(localStorage.getItem('yoman-mesimot:category-filter')).toBeNull()
  })
})

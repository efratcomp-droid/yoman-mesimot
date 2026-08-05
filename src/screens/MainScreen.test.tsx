import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { Task } from '../types/database'
import type { SyncStatus } from '../store/tasks'
import MainScreen from './MainScreen'

interface MockAuthState {
  session: { user: { id: string; email: string } } | null
}

interface MockTasksState {
  tasks: Task[]
  syncStatus: SyncStatus
  load: Mock<() => void>
  addTask: Mock<() => void>
  markDone: Mock<(id: string, done: boolean) => void>
  softDeleteTask: Mock<(id: string) => void>
  subscribeRealtime: Mock<() => () => void>
}

const { authState, tasksState, unsubscribeMock } = vi.hoisted(() => ({
  authState: {
    session: { user: { id: 'user-1', email: 'user@example.com' } },
  } as MockAuthState,
  tasksState: {
    tasks: [] as Task[],
    syncStatus: 'synced' as SyncStatus,
    load: vi.fn<() => void>(),
    addTask: vi.fn<() => void>(),
    markDone: vi.fn<(id: string, done: boolean) => void>(),
    softDeleteTask: vi.fn<(id: string) => void>(),
    subscribeRealtime: vi.fn<() => () => void>(),
  } satisfies MockTasksState,
  unsubscribeMock: vi.fn(),
}))

vi.mock('../store/authStore', () => ({
  useAuthStore: <T,>(selector: (state: MockAuthState) => T): T => selector(authState),
}))

vi.mock('../store/tasks', () => ({
  useTasksStore: <T,>(selector: (state: MockTasksState) => T): T => selector(tasksState),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  },
}))

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

describe('MainScreen', () => {
  beforeEach(() => {
    tasksState.tasks = []
    tasksState.syncStatus = 'synced'
    tasksState.load.mockClear()
    tasksState.markDone.mockClear()
    unsubscribeMock.mockClear()
    tasksState.subscribeRealtime.mockClear()
    tasksState.subscribeRealtime.mockReturnValue(unsubscribeMock)
  })

  it('calls load and subscribeRealtime on mount, and unsubscribes on unmount', async () => {
    const { unmount } = render(<MainScreen />)
    expect(tasksState.load).toHaveBeenCalled()
    expect(tasksState.subscribeRealtime).toHaveBeenCalled()
    expect(unsubscribeMock).not.toHaveBeenCalled()
    await screen.findByText('אין משימות לתאריך של היום.')

    unmount()
    expect(unsubscribeMock).toHaveBeenCalled()
  })

  it('shows the sync status from the store', async () => {
    tasksState.syncStatus = 'offline'
    render(<MainScreen />)
    expect(await screen.findByText('אין חיבור')).toBeInTheDocument()
  })

  it('shows the CLAUDE.md empty-state message for the default "today" tab', async () => {
    render(<MainScreen />)
    expect(await screen.findByText('אין משימות לתאריך של היום.')).toBeInTheDocument()
  })

  it('renders open tasks and switches tabs via the filter chips', async () => {
    const today = new Date().toISOString().slice(0, 10)
    tasksState.tasks = [
      makeTask({ id: 'open-today', title: 'משימה פתוחה', due_date: today }),
      makeTask({ id: 'done-task', title: 'משימה גמורה', done: true, done_at: today }),
    ]
    render(<MainScreen />)

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
    render(<MainScreen />)
    await screen.findByText('לסמן')

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'סימון כבוצע' }))

    expect(tasksState.markDone).toHaveBeenCalledWith('task-1', true)
  })
})

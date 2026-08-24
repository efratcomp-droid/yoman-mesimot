import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { Category } from '../types/database'
import SettingsScreen from './SettingsScreen'

interface MockAuthState {
  signOut: Mock<() => void>
}

interface MockCategoriesState {
  categories: Category[]
  error: string | null
  clearError: Mock<() => void>
  load: Mock<() => void>
  addCategory: Mock<(name: string) => void>
  renameCategory: Mock<(id: string, name: string) => void>
  recolorCategory: Mock<(id: string, color: string) => void>
  deleteCategory: Mock<(id: string) => void>
}

const { authState, categoriesState } = vi.hoisted(() => ({
  authState: {
    signOut: vi.fn<() => void>(),
  } satisfies MockAuthState,
  categoriesState: {
    categories: [] as Category[],
    error: null as string | null,
    clearError: vi.fn<() => void>(),
    load: vi.fn<() => void>(),
    addCategory: vi.fn<(name: string) => void>(),
    renameCategory: vi.fn<(id: string, name: string) => void>(),
    recolorCategory: vi.fn<(id: string, color: string) => void>(),
    deleteCategory: vi.fn<(id: string) => void>(),
  } satisfies MockCategoriesState,
}))

vi.mock('../store/authStore', () => ({
  useAuthStore: <T,>(selector: (state: MockAuthState) => T): T => selector(authState),
}))

vi.mock('../store/categories', () => ({
  useCategoriesStore: <T,>(selector: (state: MockCategoriesState) => T): T =>
    selector(categoriesState),
}))

function makeCategory(overrides: Partial<Category>): Category {
  return {
    id: 'cat-1',
    user_id: 'user-1',
    name: 'כספים',
    color: '#4A2C52',
    position: 0,
    ...overrides,
  }
}

const onBack = vi.fn()

describe('SettingsScreen', () => {
  beforeEach(() => {
    categoriesState.categories = []
    categoriesState.error = null
    categoriesState.clearError.mockClear()
    categoriesState.load.mockClear()
    categoriesState.addCategory.mockClear()
    categoriesState.deleteCategory.mockClear()
    categoriesState.recolorCategory.mockClear()
    authState.signOut.mockClear()
    onBack.mockClear()
  })

  it('loads categories on mount and lists them', () => {
    categoriesState.categories = [
      makeCategory({ id: 'cat-1', name: 'כספים' }),
      makeCategory({ id: 'cat-2', name: 'תפעול' }),
    ]
    render(<SettingsScreen onBack={onBack} />)

    expect(categoriesState.load).toHaveBeenCalled()
    expect(screen.getByDisplayValue('כספים')).toBeInTheDocument()
    expect(screen.getByDisplayValue('תפעול')).toBeInTheDocument()
  })

  it('adds a category from the new-category form', async () => {
    render(<SettingsScreen onBack={onBack} />)

    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText('קטגוריה חדשה…'), 'אישי')
    await user.click(screen.getByRole('button', { name: 'הוספת קטגוריה' }))

    expect(categoriesState.addCategory).toHaveBeenCalledWith('אישי')
  })

  it('deletes a category', async () => {
    categoriesState.categories = [makeCategory({ id: 'cat-1', name: 'כספים' })]
    render(<SettingsScreen onBack={onBack} />)

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'מחיקת קטגוריית כספים' }))

    expect(categoriesState.deleteCategory).toHaveBeenCalledWith('cat-1')
  })

  it('signs out when the sign-out button is clicked', async () => {
    render(<SettingsScreen onBack={onBack} />)

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'יציאה מהחשבון' }))

    expect(authState.signOut).toHaveBeenCalled()
  })

  it('goes back via the back button and via Escape', async () => {
    render(<SettingsScreen onBack={onBack} />)

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'חזרה למסך הראשי' }))
    expect(onBack).toHaveBeenCalledTimes(1)

    await user.keyboard('{Escape}')
    expect(onBack).toHaveBeenCalledTimes(2)
  })

  it('shows the app version', () => {
    render(<SettingsScreen onBack={onBack} />)
    expect(screen.getByText(/^גרסה /)).toBeInTheDocument()
  })

  it('shows a category write failure instead of swallowing it', async () => {
    categoriesState.error = 'השמירה בשרת נכשלה. נסי שוב.'
    render(<SettingsScreen onBack={onBack} />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('השמירה בשרת נכשלה. נסי שוב.')

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'סגירת ההודעה' }))
    expect(categoriesState.clearError).toHaveBeenCalled()
  })
})

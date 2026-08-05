import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import LoginScreen from './LoginScreen'

interface MockAuthState {
  signIn: (email: string, password: string) => Promise<boolean>
  error: string | null
  clearError: () => void
}

const { signInMock, clearErrorMock } = vi.hoisted(() => ({
  signInMock: vi.fn(),
  clearErrorMock: vi.fn(),
}))

vi.mock('../store/authStore', () => ({
  useAuthStore: <T,>(selector: (state: MockAuthState) => T): T =>
    selector({ signIn: signInMock, error: null, clearError: clearErrorMock }),
}))

describe('LoginScreen', () => {
  it('renders email and password fields with a submit button', () => {
    render(<LoginScreen />)
    expect(screen.getByLabelText('אימייל')).toBeInTheDocument()
    expect(screen.getByLabelText('סיסמה')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'התחברות' })).toBeInTheDocument()
  })

  it('submits the entered credentials', async () => {
    const user = userEvent.setup()
    render(<LoginScreen />)

    await user.type(screen.getByLabelText('אימייל'), 'user@example.com')
    await user.type(screen.getByLabelText('סיסמה'), 'secret123')
    await user.click(screen.getByRole('button', { name: 'התחברות' }))

    expect(signInMock).toHaveBeenCalledWith('user@example.com', 'secret123')
  })
})

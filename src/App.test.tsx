import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

interface MockSession {
  user: { email: string }
}

interface MockAuthState {
  status: 'loading' | 'authenticated' | 'unauthenticated'
  init: () => void
  session: MockSession | null
  signOut: () => Promise<void>
}

const { mockState } = vi.hoisted(() => ({
  mockState: {
    status: 'unauthenticated' as MockAuthState['status'],
    init: vi.fn(),
    session: null as MockSession | null,
    signOut: vi.fn(),
  },
}))

vi.mock('./store/authStore', () => ({
  useAuthStore: <T,>(selector: (state: MockAuthState) => T): T => selector(mockState),
}))

describe('App', () => {
  it('shows the login screen when unauthenticated', () => {
    mockState.status = 'unauthenticated'
    render(<App />)
    expect(screen.getByRole('heading', { name: 'יומן משימות' })).toBeInTheDocument()
  })

  it('shows the main screen with a sign-out button when authenticated', () => {
    mockState.status = 'authenticated'
    mockState.session = { user: { email: 'user@example.com' } }
    render(<App />)
    expect(screen.getByRole('button', { name: 'יציאה מהחשבון' })).toBeInTheDocument()
  })
})

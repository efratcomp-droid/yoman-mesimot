import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

interface MockAuthState {
  status: 'loading' | 'authenticated' | 'unauthenticated'
  init: () => void
}

const { mockState } = vi.hoisted(() => ({
  mockState: {
    status: 'unauthenticated' as MockAuthState['status'],
    init: vi.fn(),
  },
}))

vi.mock('./store/authStore', () => ({
  useAuthStore: <T,>(selector: (state: MockAuthState) => T): T => selector(mockState),
}))

vi.mock('./screens/LoginScreen', () => ({
  default: () => <div>מסך התחברות מדומה</div>,
}))

vi.mock('./screens/MainScreen', () => ({
  default: () => <div>מסך ראשי מדומה</div>,
}))

describe('App', () => {
  it('shows the login screen when unauthenticated', () => {
    mockState.status = 'unauthenticated'
    render(<App />)
    expect(screen.getByText('מסך התחברות מדומה')).toBeInTheDocument()
  })

  it('shows the main screen when authenticated', () => {
    mockState.status = 'authenticated'
    render(<App />)
    expect(screen.getByText('מסך ראשי מדומה')).toBeInTheDocument()
  })
})

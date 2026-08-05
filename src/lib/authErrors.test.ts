import { describe, expect, it } from 'vitest'
import type { AuthError } from '@supabase/supabase-js'
import { toHebrewAuthError } from './authErrors'

function makeError(code: string | undefined, status: number | undefined): AuthError {
  return { name: 'AuthError', message: 'x', code, status } as AuthError
}

describe('toHebrewAuthError', () => {
  it('maps a known error code to its Hebrew message', () => {
    expect(toHebrewAuthError(makeError('invalid_credentials', 400))).toBe(
      'אימייל או סיסמה שגויים.',
    )
  })

  it('falls back to a network message when there is no HTTP status', () => {
    expect(toHebrewAuthError(makeError(undefined, undefined))).toBe(
      'אין חיבור לשרת. בדקי את החיבור לאינטרנט ונסי שוב.',
    )
  })

  it('falls back to a generic Hebrew message for unknown codes', () => {
    expect(toHebrewAuthError(makeError('something_else', 500))).toBe(
      'אירעה שגיאה בהתחברות. נסי שוב.',
    )
  })
})

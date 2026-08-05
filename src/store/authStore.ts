import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { toHebrewAuthError } from '../lib/authErrors'

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

interface AuthState {
  status: AuthStatus
  session: Session | null
  error: string | null
  init: () => void
  signIn: (email: string, password: string) => Promise<boolean>
  signOut: () => Promise<void>
  clearError: () => void
}

export const useAuthStore = create<AuthState>((set) => {
  supabase.auth.onAuthStateChange((_event, session) => {
    set({ session, status: session ? 'authenticated' : 'unauthenticated' })
  })

  return {
    status: 'loading',
    session: null,
    error: null,

    init: () => {
      supabase.auth.getSession().then(({ data }) => {
        set({
          session: data.session,
          status: data.session ? 'authenticated' : 'unauthenticated',
        })
      })
    },

    signIn: async (email, password) => {
      set({ error: null })
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        set({ error: toHebrewAuthError(error) })
        return false
      }
      set({ session: data.session, status: 'authenticated' })
      return true
    },

    signOut: async () => {
      await supabase.auth.signOut()
      set({ session: null, status: 'unauthenticated' })
    },

    clearError: () => set({ error: null }),
  }
})

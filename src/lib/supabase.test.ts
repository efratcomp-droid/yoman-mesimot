import { describe, expect, it } from 'vitest'

describe('supabase client', () => {
  it('is created without throwing when the env vars are present', async () => {
    const { supabase } = await import('./supabase')
    expect(supabase).toBeDefined()
  })
})

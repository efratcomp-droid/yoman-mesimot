import { useState, type FormEvent } from 'react'
import { useAuthStore } from '../store/authStore'

function LoginScreen() {
  const signIn = useAuthStore((state) => state.signIn)
  const error = useAuthStore((state) => state.error)
  const clearError = useAuthStore((state) => state.clearError)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    clearError()
    setIsSubmitting(true)
    await signIn(email, password)
    setIsSubmitting(false)
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-8 shadow-sm">
        <h1 className="font-heading text-3xl font-bold text-plum">יומן משימות</h1>
        <p className="mt-2 text-sm text-muted">התחברי כדי להמשיך</p>

        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium text-plum">
              אימייל
            </label>
            <input
              id="email"
              type="email"
              dir="ltr"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="rounded-lg border border-line bg-cream px-3 py-2 text-plum outline-none focus:border-plum"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium text-plum">
              סיסמה
            </label>
            <input
              id="password"
              type="password"
              dir="ltr"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="rounded-lg border border-line bg-cream px-3 py-2 text-plum outline-none focus:border-plum"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-rose">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 rounded-lg bg-plum py-2.5 font-medium text-cream disabled:opacity-60"
          >
            {isSubmitting ? 'מתחברת...' : 'התחברות'}
          </button>
        </form>
      </div>
    </main>
  )
}

export default LoginScreen

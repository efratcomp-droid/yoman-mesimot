import { useAuthStore } from '../store/authStore'

function MainScreen() {
  const session = useAuthStore((state) => state.session)
  const signOut = useAuthStore((state) => state.signOut)

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-cream px-4">
      <p className="text-muted">מחוברת כ־{session?.user.email}</p>
      <button
        type="button"
        onClick={() => void signOut()}
        className="rounded-lg border border-line bg-card px-4 py-2 font-medium text-plum"
      >
        יציאה מהחשבון
      </button>
    </main>
  )
}

export default MainScreen

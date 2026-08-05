import { useEffect } from 'react'
import { useAuthStore } from './store/authStore'
import LoginScreen from './screens/LoginScreen'
import MainScreen from './screens/MainScreen'

function App() {
  const status = useAuthStore((state) => state.status)
  const init = useAuthStore((state) => state.init)

  useEffect(() => {
    init()
  }, [init])

  if (status === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-cream">
        <p className="text-muted">טוענת...</p>
      </main>
    )
  }

  if (status === 'authenticated') {
    return <MainScreen />
  }

  return <LoginScreen />
}

export default App

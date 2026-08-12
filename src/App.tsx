import { useEffect, useState } from 'react'
import { useAuthStore } from './store/authStore'
import LoginScreen from './screens/LoginScreen'
import MainScreen from './screens/MainScreen'
import SettingsScreen from './screens/SettingsScreen'

function App() {
  const status = useAuthStore((state) => state.status)
  const init = useAuthStore((state) => state.init)
  const [showSettings, setShowSettings] = useState(false)

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

  if (status !== 'authenticated') {
    return <LoginScreen />
  }

  if (showSettings) {
    return <SettingsScreen onBack={() => setShowSettings(false)} />
  }

  return <MainScreen onOpenSettings={() => setShowSettings(true)} />
}

export default App

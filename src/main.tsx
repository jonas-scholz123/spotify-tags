import { createRoot } from 'react-dom/client'
import { App } from './App'
import { completeLoginIfRedirected } from './auth'
import './styles.css'

// The authorization code is single-use, so it is exchanged here, once, rather than in an effect.
let loginError: string | null = null
try {
  await completeLoginIfRedirected()
} catch (err) {
  loginError = err instanceof Error ? err.message : String(err)
}

createRoot(document.getElementById('root')!).render(<App loginError={loginError} />)

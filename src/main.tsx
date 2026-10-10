import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import '@fontsource-variable/fraunces/opsz.css'
import '@fontsource-variable/fraunces/opsz-italic.css'
import '@fontsource-variable/dm-sans'
import './styles/global.css'
import App from './App'
import { AuthProvider } from './lib/auth'

// Hash routing (/#/india-nepal/2026-10-14) so every link works on GitHub Pages,
// which can't rewrite unknown paths to index.html.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </HashRouter>
  </StrictMode>,
)

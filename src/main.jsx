import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/theme.css'
import App from './App.jsx'
import { ThemeProvider } from './contexts/ThemeContext.jsx'
import { registerAppSW } from './offline/sw-register'
import OutboxBadge from './offline/OutboxBadge'

// The app shell works offline from here on (public/sw.js); what the capture
// flows write while dark waits in the outbox. The badge is mounted outside the
// router so it survives the navigation a save makes, and it renders nothing
// unless there is something queued, failed, or in conflict.
registerAppSW()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <App />
      <OutboxBadge />
    </ThemeProvider>
  </StrictMode>,
)

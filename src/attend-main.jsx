import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import './styles/theme.css'
import Attend from './pages/Attend.jsx'
import { captureInstallPrompt, registerAttendSW } from './utils/attendPwa'

// The entry for /attend. Deliberately not App.jsx: the portal is one
// self-contained page and a vendor has no business downloading the staff
// application to use it. A Router is still needed because the work-order view
// the portal embeds reads its token through useParams when it is opened by URL.
//
// Both calls happen before render — beforeinstallprompt can fire before the
// first paint, and an event missed is an install button that never appears.
captureInstallPrompt()
registerAttendSW()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Attend />
    </BrowserRouter>
  </StrictMode>,
)

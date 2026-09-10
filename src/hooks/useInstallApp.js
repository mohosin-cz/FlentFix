import { useState, useEffect, useCallback } from 'react'
import { isStandalone, platform, getInstallPrompt, INSTALLABLE, INSTALLED } from '../utils/attendPwa'

const DISMISS_KEY = 'flent_attend_install_dismissed'

// What the portal knows about becoming an app on this particular phone.
//
// Android and desktop Chrome hand over a real prompt, so there the button
// installs in one tap. iOS gives no programmatic install at all — Safari's
// Share sheet is the only route — so there the app can only show the steps.
// Either way, nothing is offered once it is already installed.
export function useInstallApp() {
  const os = platform()
  const [installed, setInstalled] = useState(() => isStandalone())
  const [prompt, setPrompt]       = useState(() => getInstallPrompt())
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === '1' } catch { return false }
  })

  useEffect(() => {
    const onInstallable = () => setPrompt(getInstallPrompt())
    const onInstalled   = () => { setInstalled(true); setPrompt(null) }
    window.addEventListener(INSTALLABLE, onInstallable)
    window.addEventListener(INSTALLED, onInstalled)

    // Opened from the home screen in an already-running tab, or installed from
    // Chrome's own menu rather than our button — either way the offer has to
    // stop being made.
    let mq
    const onMq = () => setInstalled(isStandalone())
    try {
      mq = window.matchMedia('(display-mode: standalone)')
      if (mq.addEventListener) mq.addEventListener('change', onMq)
      else if (mq.addListener) mq.addListener(onMq)
    } catch { /* no matchMedia — the initial read stands */ }

    return () => {
      window.removeEventListener(INSTALLABLE, onInstallable)
      window.removeEventListener(INSTALLED, onInstalled)
      if (mq && mq.removeEventListener) mq.removeEventListener('change', onMq)
      else if (mq && mq.removeListener) mq.removeListener(onMq)
    }
  }, [])

  const install = useCallback(async () => {
    const p = prompt || getInstallPrompt()
    if (!p) return 'unavailable'
    try {
      p.prompt()
      const { outcome } = await p.userChoice
      // The event is single-use: once prompted it cannot be prompted again,
      // and holding a spent one would leave a button that does nothing.
      window.__flentInstallPrompt = null
      setPrompt(null)
      if (outcome === 'accepted') setInstalled(true)
      return outcome
    } catch {
      return 'unavailable'
    }
  }, [prompt])

  const dismiss = useCallback(() => {
    try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* noop */ }
    setDismissed(true)
  }, [])

  const canPrompt = !!prompt
  return {
    os, installed, canPrompt, install, dismiss, dismissed,
    // iOS can always be told how; everywhere else there has to be a live
    // prompt, or the button would be an instruction we cannot carry out.
    offerable: !installed && (canPrompt || os === 'ios'),
  }
}

// Making the vendor portal an app on the phone rather than a tab in a browser.
//
// The portal is served as its own document (attend.html) with its own
// manifest, which is what decides the icon's name and where it opens. The two
// pieces that have to happen at runtime live here: registering the service
// worker Chrome insists on before it will offer an install at all, and
// catching the install prompt.
//
// The prompt has to be caught before React mounts. Chrome fires
// `beforeinstallprompt` as soon as it has judged the page installable, which
// on a warm load is before the first render — miss it and the event is gone,
// and with it any chance of an in-app install button. So `captureInstallPrompt`
// is called at module scope from the entry, not from a component.

const PROMPT = '__flentInstallPrompt'
const WIRED  = '__flentInstallWired'

export const INSTALLABLE = 'flent:installable'
export const INSTALLED   = 'flent:installed'

// Already an app? Two answers, because Safari does not implement the standard
// one: display-mode for everyone else, and iOS's own navigator.standalone,
// which is all Safari sets for a home-screen app.
//
// Deliberately not display-mode: fullscreen. The manifest asks for
// standalone, so an installed portal never reports fullscreen — but a browser
// the vendor happened to put in fullscreen does, and reading that as
// "already installed" silently withholds the install offer from them.
export function isStandalone() {
  if (typeof window === 'undefined') return false
  try {
    return window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true
  } catch { return false }
}

// iPadOS reports itself as a Mac, and the only tell left is a touch screen.
export function platform() {
  if (typeof navigator === 'undefined') return 'desktop'
  const ua = navigator.userAgent || ''
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios'
  if (ua.includes('Macintosh') && typeof document !== 'undefined' && 'ontouchend' in document) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'desktop'
}

export function getInstallPrompt() {
  return (typeof window !== 'undefined' && window[PROMPT]) || null
}

export function captureInstallPrompt() {
  if (typeof window === 'undefined' || window[WIRED]) return
  window[WIRED] = true

  window.addEventListener('beforeinstallprompt', (e) => {
    // Hold on to it and keep Chrome's own mini-infobar out of the way — the
    // portal asks in its own words, in a place a vendor is looking.
    e.preventDefault()
    window[PROMPT] = e
    window.dispatchEvent(new Event(INSTALLABLE))
  })

  window.addEventListener('appinstalled', () => {
    window[PROMPT] = null
    window.dispatchEvent(new Event(INSTALLED))
  })
}

export function registerAttendSW() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  // In dev the modules are served unbundled and unhashed, so caching them
  // would serve yesterday's code back to whoever is editing it. The install
  // path is verified against a real build (`npm run build && npm run preview`),
  // which localhost counts as a secure context for.
  if (import.meta.env.DEV) return

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/attend-sw.js', { scope: '/attend' })
      .catch(err => console.warn('[attend] service worker did not register:', err && err.message))
  })
}

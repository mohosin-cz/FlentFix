// Registers the staff app's service worker (public/sw.js) at scope '/'.
//
// Mirrors registerAttendSW in utils/attendPwa.js on purpose: the two workers
// live on one origin and must behave the same way about updates. The portal's
// worker keeps its own, more specific scope ('/attend'), so a portal document
// is never controlled by this one.

export function registerAppSW() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  // Dev serves unbundled, unhashed modules; caching them would hand yesterday's
  // code back to whoever is editing it. Verify against `npm run build && npm run preview`.
  if (import.meta.env.DEV) return

  // If this page was already under a worker, the next controllerchange is a
  // new version arriving and the page should reload for it; if not, it is only
  // this registration taking charge and a reload would be a pointless flash.
  const hadController = !!navigator.serviceWorker.controller
  let refreshing = false

  // Reload once, and never out from under a thumb: a capture page that reloads
  // mid-inspection loses nothing (drafts are in localStorage, the outbox in
  // IndexedDB) but it is still a page vanishing. Wait until the app is hidden.
  function refreshWhenSafe() {
    if (refreshing) return
    refreshing = true
    if (document.visibilityState === 'hidden') { window.location.reload(); return }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') window.location.reload()
    }, { once: true })
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) refreshWhenSafe()
  })

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then((reg) => {
        // An installed app can sit open for days; ask for updates whenever it
        // comes back to the foreground, and hourly if it is simply left open.
        const check = () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {})
        }
        document.addEventListener('visibilitychange', check)
        setInterval(check, 60 * 60 * 1000)
        check()
      })
      .catch(err => console.warn('[pulse] service worker did not register:', err && err.message))
  })
}

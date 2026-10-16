// Service worker for the staff app, scoped to '/'.
//
// The same contract as attend-sw.js, which it deliberately mirrors rather than
// replaces: the shell loads offline, a deploy is picked up the moment there is
// signal, and nothing that is not a same-origin GET is ever touched. The
// inspection flows and the work-order page can be opened in an empty flat with
// no bars; what they write while dark goes through the outbox in IndexedDB,
// not through here. A cached Supabase response would be a lie about the
// property; those requests are left completely alone.
//
// Update semantics: skipWaiting on install, clients.claim on activate, and the
// page reloads once on controllerchange (src/offline/sw-register.js) — the
// same three moves the portal makes, so a deploy still lands.

const CACHE = 'pulse-app-v1'

// The shell, never the data. '/' is the document (every in-app route is a
// client-side route served from index.html); the rest is what the manifest
// and splash screen draw.
const SHELL = ['/', '/manifest.json', '/icon-192.png', '/icon-512.png', '/favicon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    // One unreachable URL must not fail the whole install.
    await Promise.all(SHELL.map(u => cache.add(new Request(u, { cache: 'reload' })).catch(() => {})))
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys()
    // Only our own old versions. The portal's worker keeps 'flent-attend-*'.
    await Promise.all(names.filter(n => n.startsWith('pulse-app-') && n !== CACHE).map(n => caches.delete(n)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return          // Supabase, Google Fonts — not ours to hold

  // The vendor portal is its own document with its own worker and manifest.
  // Before the portal's worker is registered (first visit), this one would be
  // asked for '/attend' — pass it straight through, never fall back to the
  // staff index.html for it.
  if (url.pathname === '/attend' || url.pathname.startsWith('/attend-') || url.pathname.startsWith('/attend/') || url.pathname === '/attend.html') return

  const navigating = req.mode === 'navigate'
  const immutable = url.pathname.startsWith('/assets/')   // content-hashed build output

  event.respondWith((async () => {
    const cache = await caches.open(CACHE)
    // Every route is the one document; keep one copy under '/'.
    const key = navigating ? '/' : req

    if (immutable) {
      const hit = await cache.match(req)
      if (hit) return hit
    }

    try {
      const res = await fetch(req)
      // Only full, same-origin successes are worth keeping. A 404 or an
      // opaque response cached here would outlive the outage that produced it.
      if (res && res.ok && res.type === 'basic') cache.put(key, res.clone())
      return res
    } catch (err) {
      const hit = await cache.match(key)
      if (hit) return hit
      throw err
    }
  })())
})

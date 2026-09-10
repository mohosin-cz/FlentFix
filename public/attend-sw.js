// Service worker for the vendor portal, scoped to /attend.
//
// It exists for two reasons, in this order:
//   1. Chrome will not offer to install a site without one. Without this file
//      an Android vendor gets a browser bookmark that opens in a tab with the
//      address bar on top — not an app.
//   2. A vendor in a stairwell with no signal can still open the portal.
//      Punching in still needs the network; the shell opening and saying so is
//      a great deal better than the offline dinosaur.
//
// What it deliberately does not do: touch anything that is not a same-origin
// GET. Every punch, selfie upload, break and RPC is a cross-origin request to
// Supabase, and an attendance record is not something to answer from a cache
// or replay out of one — a punch served from cache is a lie about where
// somebody was. Those requests are left completely alone.

const CACHE = 'flent-attend-v2'

// The shell, never the data. '/attend' is the document itself (Vercel rewrites
// it to attend.html); the icons are what the splash screen draws.
const SHELL = ['/attend', '/attend-manifest.json', '/icon-192.png', '/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    // One unreachable URL must not fail the whole install — a service worker
    // that never activates is a vendor who never gets offered the app.
    await Promise.all(SHELL.map(u => cache.add(new Request(u, { cache: 'reload' })).catch(() => {})))
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys()
    await Promise.all(names.filter(n => n !== CACHE).map(n => caches.delete(n)))
    await self.clients.claim()
  })())
})

// Build assets carry a content hash in the filename, so they can never go
// stale and cache-first makes a cold start on a bad connection quick.
// Everything else same-origin is network-first: a deploy is picked up the
// moment there is signal, and the cache is only the fallback. The document in
// particular is never served stale while online, which is what stops a vendor
// being stuck on a version of the app from last week.
self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return   // Supabase, Google Fonts — not ours to hold

  const navigating = req.mode === 'navigate'
  const immutable  = url.pathname.startsWith('/assets/')

  event.respondWith((async () => {
    const cache = await caches.open(CACHE)
    // However the document was requested, it is the portal — keep one copy of
    // it under the URL the manifest starts at.
    const key = navigating ? '/attend' : req

    if (immutable) {
      const hit = await cache.match(req)
      if (hit) return hit
    }

    try {
      const res = await fetch(req)
      // Only full, same-origin successes are worth keeping. An opaque or 404
      // response cached here would outlive the outage that produced it.
      if (res && res.ok && res.type === 'basic') cache.put(key, res.clone())
      return res
    } catch (err) {
      const hit = await cache.match(key)
      if (hit) return hit
      throw err
    }
  })())
})

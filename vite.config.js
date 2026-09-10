import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// Vercel rewrites /attend to /attend.html in production. The dev server would
// otherwise fall back to index.html and serve the portal off the staff bundle
// instead — so the one URL vendors use would be a different document in dev
// than the one that ships, which is the sort of gap a bug hides in.
function attendRewrite() {
  return {
    name: 'attend-rewrite',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const path = (req.url || '').split('?')[0]
        if (path === '/attend' || path === '/attend/') {
          req.url = '/attend.html' + (req.url.slice(path.length) || '')
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    attendRewrite(),
  ],
  build: {
    rollupOptions: {
      // Two documents, one app. The vendor portal is installable, and what a
      // browser installs is decided by the manifest in the document it was
      // installed from — so /attend needs a head of its own rather than
      // Pulse's. Shared code still lands in shared chunks.
      input: {
        main:   fileURLToPath(new URL('./index.html', import.meta.url)),
        attend: fileURLToPath(new URL('./attend.html', import.meta.url)),
      },
    },
  },
})

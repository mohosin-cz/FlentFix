import { useEffect } from 'react'

// Deep links into a list: /properties/214/work-orders#woi-<uuid>.
//
// Lineage routes land on a page and name the row. Once the page has rendered
// its rows (the caller passes `ready`), scroll that row into view and flash it
// so the eye lands on the right line, then leave the hash alone so a refresh
// does the same. Re-runs on hashchange, which LineageStrip fires when the
// target is on the page already open.
//
// Returns nothing; pass `onHit(id)` to also open a drawer or expand the row.
// Same thing as a renderable, for pages whose state lives too deep to reach
// from the top of the component.
export function HashScroll({ ready = true, prefix, onHit }) {
  useHashScroll(ready, { prefix, onHit })
  return null
}

export function useHashScroll(ready, { onHit, prefix } = {}) {
  useEffect(() => {
    if (!ready) return
    const run = () => {
      const hash = window.location.hash.replace(/^#/, '')
      if (!hash) return
      if (prefix && !hash.startsWith(prefix)) return
      const el = document.getElementById(hash)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      const prev = el.style.boxShadow
      el.style.transition = 'box-shadow 0.4s ease'
      el.style.boxShadow = '0 0 0 2px var(--accent, #c8963e)'
      const t = setTimeout(() => { el.style.boxShadow = prev }, 1800)
      if (onHit) onHit(prefix ? hash.slice(prefix.length) : hash)
      return () => clearTimeout(t)
    }
    const cleanup = run()
    window.addEventListener('hashchange', run)
    return () => { window.removeEventListener('hashchange', run); if (cleanup) cleanup() }
  }, [ready, onHit, prefix])
}

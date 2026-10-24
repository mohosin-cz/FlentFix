import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Someone with view-only access (profiles.role = 'viewer') can open everything
// but the database refuses their changes (viewer_role.sql). This says so up
// front, so a change that doesn't stick isn't a mystery. Renders nothing for
// everyone else, and outside the app's signed-in pages.
export default function ViewOnlyBadge() {
  const [viewer, setViewer] = useState(false)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const check = () => supabase.rpc('pulse_is_viewer').then(({ data }) => setViewer(!!data))
    check()
    const { data: sub } = supabase.auth.onAuthStateChange(() => check())
    return () => sub?.subscription?.unsubscribe()
  }, [])
  if (!viewer) return null
  return (
    <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
      style={{ position: 'fixed', left: 12, bottom: 'calc(72px + env(safe-area-inset-bottom, 0px))', zIndex: 900, maxWidth: 'min(86vw, 340px)', textAlign: 'left',
               padding: open ? '10px 12px' : '6px 11px', borderRadius: 999, border: '1px solid rgba(111,134,168,0.55)', background: 'rgba(22,24,32,0.92)',
               color: '#c9d4e6', fontFamily: "var(--font-nav, 'Urbanist', sans-serif)", fontSize: 12, fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,0,0,.35)' }}>
      👁 View only{open && <span style={{ display: 'block', fontWeight: 500, marginTop: 4, lineHeight: 1.45, color: '#9fb0cc' }}>You can look at everything in Pulse, but changes aren’t saved. Ask an admin if you need to edit.</span>}
    </button>
  )
}

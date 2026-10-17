import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import DashNav from './DashNav'
import ProfileDropdown from './ProfileDropdown'
import { CommandTrigger } from './command/CommandTrigger'
import { NotificationBell } from './alerts/NotificationBell'

// Home's header, for every wide page: logo, the primary nav, search, the
// bell, the avatar menu. Sticky, full width, no container. Pages pass
// `below` for a strip of their own under it (a scope toggle, a status rule).
//
// Phones: DashNav hides itself (.dash-nav) and FloatingNav carries the routes;
// the search box hides too, the bottom bar's Search tab is the door.
export default function AppHeader({ below, accent }) {
  const navigate = useNavigate()
  const { session } = useAuth()
  const email = session?.user?.email ?? ''
  const name = session?.user?.user_metadata?.full_name ?? email.split('@')[0].replace(/[._]/g, ' ')

  async function logout() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  return (
    <>
      <style>{`
        @media (min-width: 641px) { .dash-nav { display: flex !important; } .app-header-search { display: block !important; } }
        @media (max-width: 640px) { .dash-nav { display: none !important; } .app-header-search { display: none !important; } }
      `}</style>
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        padding: '0 20px', paddingTop: 'calc(env(safe-area-inset-top) + 0px)', minHeight: 56,
        background: 'var(--bg-panel, #1e2028)',
        borderBottom: accent ? `2px solid ${accent}` : '1px solid var(--border, #2e3040)',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
          <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }} aria-label="Home">
            {/* The wordmark is the nav's own type, a step up — it reads as part
                of the bar rather than a badge sitting on it. */}
            <span className="pulse-title" style={{ fontSize: 17, lineHeight: 1 }}>pulse</span>
          </button>
          <DashNav />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <div className="app-header-search" style={{ display: 'none' }}><CommandTrigger /></div>
          <NotificationBell />
          <ProfileDropdown name={name} email={email} onLogout={logout} />
        </div>
      </header>
      {below}
    </>
  )
}

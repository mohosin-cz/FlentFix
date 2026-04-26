import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
const PulseLogo = () => (
  <svg width="140" height="28" viewBox="0 0 300 68" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', maxWidth: '100%' }}>
    <style>{`.do{fill:#16171f;stroke:#c8963e;stroke-width:1.2}.dd{fill:none;stroke:#c8963e;stroke-width:0.5;opacity:0.15}`}</style>
    {[[1,1,1,0],[1,0,0,1],[1,1,1,0],[1,0,0,0],[1,0,0,0],[1,0,0,0]].map((r,ri)=>r.map((on,ci)=><rect key={`p${ri}${ci}`} className={on?'do':'dd'} x={ci*11} y={ri*11} width="8" height="8" rx="1.5"/>))}
    {[[1,0,0,1],[1,0,0,1],[1,0,0,1],[1,0,0,1],[1,0,0,1],[1,1,1,1]].map((r,ri)=>r.map((on,ci)=><rect key={`u${ri}${ci}`} className={on?'do':'dd'} x={52+ci*11} y={ri*11} width="8" height="8" rx="1.5"/>))}
    {[[1,0,0,0],[1,0,0,0],[1,0,0,0],[1,0,0,0],[1,0,0,0],[1,1,1,1]].map((r,ri)=>r.map((on,ci)=><rect key={`l${ri}${ci}`} className={on?'do':'dd'} x={100+ci*11} y={ri*11} width="8" height="8" rx="1.5"/>))}
    {[[1,1,1,1],[1,0,0,0],[1,1,1,1],[0,0,0,1],[0,0,0,1],[1,1,1,1]].map((r,ri)=>r.map((on,ci)=><rect key={`s${ri}${ci}`} className={on?'do':'dd'} x={148+ci*11} y={ri*11} width="8" height="8" rx="1.5"/>))}
    {[[1,1,1,1],[1,0,0,0],[1,1,1,0],[1,0,0,0],[1,0,0,0],[1,1,1,1]].map((r,ri)=>r.map((on,ci)=><rect key={`e${ri}${ci}`} className={on?'do':'dd'} x={196+ci*11} y={ri*11} width="8" height="8" rx="1.5"/>))}
    <line x1="248" y1="33" x2="258" y2="33" stroke="#c8963e" strokeWidth="1.5" opacity="0.4"/>
    <polyline points="258,33 264,12 268,54 274,20 278,33" fill="none" stroke="#c8963e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <line x1="278" y1="33" x2="296" y2="33" stroke="#c8963e" strokeWidth="1.5" opacity="0.4"/>
    <circle cx="296" cy="33" r="2.5" fill="#c8963e"/>
  </svg>
)

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    const { data: profile } = await supabase
      .from('profiles')
      .select('status')
      .eq('id', data.user.id)
      .single()
    if (profile?.status !== 'approved') {
      await supabase.auth.signOut()
      setError('Your account is pending approval. Contact mohosin@flent.in')
      setLoading(false)
      return
    }
    navigate('/', { replace: true })
  }

  return (
    <div style={s.page}>
      <div style={s.card}>

        {/* Pixel wordmark */}
        <div style={s.logoWrap}>
          <PulseLogo />
        </div>
        <p style={s.tagline}>Property Inspection Platform</p>

        <form onSubmit={handleSubmit} style={s.form} noValidate>
          {error && <div style={s.errorBox}>{error}</div>}

          <div style={s.fieldGroup}>
            <label style={s.label} htmlFor="email">email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              style={s.input}
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="user@flent.in"
              required
            />
          </div>

          <div style={s.fieldGroup}>
            <label style={s.label} htmlFor="password">password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              style={s.input}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            style={{
              ...s.btn,
              background: loading ? 'var(--accent-dim, #8a6428)' : 'var(--accent, #c8963e)',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.75 : 1,
            }}
            disabled={loading}
          >
            {loading ? '// AUTHENTICATING…' : 'SIGN IN →'}
          </button>
        </form>

        <p style={{ ...s.footer, marginTop: 20 }}>
          Don't have an account?{' '}
          <Link to="/signup" style={{ color: 'var(--accent, #c8963e)', textDecoration: 'none', fontWeight: 600 }}>
            Request access →
          </Link>
        </p>

        <p style={s.footer}>pulse v1.0 · Product Operations</p>
      </div>
    </div>
  )
}

const s = {
  page: {
    minHeight: '100svh',
    background: 'var(--bg, #16171f)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    fontFamily: 'var(--font-sans, Poppins, sans-serif)',
  },
  card: {
    width: '100%',
    maxWidth: 400,
    background: 'var(--bg-panel, #1e2028)',
    border: '1px dashed var(--border-dash, #3a3d52)',
    borderRadius: 12,
    padding: '36px 32px 28px',
    animation: 'fadeIn 0.35s ease',
  },
  logoWrap: {
    marginBottom: 6,
  },
  tagline: {
    margin: '0 0 28px',
    fontSize: 12,
    color: 'var(--text-muted, #6b6d82)',
    fontFamily: 'var(--font-mono, monospace)',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-dim, #9394a8)',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    fontFamily: 'var(--font-mono, monospace)',
  },
  input: {
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: 14,
    padding: '11px 14px',
    background: 'var(--bg-input, #252731)',
    border: '1px solid var(--border, #2e3040)',
    borderRadius: 6,
    color: 'var(--text, #e8e8f0)',
    outline: 'none',
    width: '100%',
    transition: 'border-color 0.15s',
  },
  errorBox: {
    background: 'rgba(224,92,106,0.10)',
    border: '1px solid rgba(224,92,106,0.3)',
    borderRadius: 6,
    padding: '10px 14px',
    fontSize: 13,
    color: 'var(--red, #e05c6a)',
    fontFamily: 'var(--font-mono, monospace)',
  },
  btn: {
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: 14,
    fontWeight: 600,
    padding: '13px 20px',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    letterSpacing: '0.02em',
    marginTop: 4,
    transition: 'background 0.15s, opacity 0.15s',
  },
  footer: {
    marginTop: 24,
    fontSize: 11,
    color: 'var(--text-muted, #6b6d82)',
    textAlign: 'center',
    fontFamily: 'var(--font-mono, monospace)',
  },
}

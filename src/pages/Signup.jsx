import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
const PulseLogo = () => (
  <svg width="140" height="28" viewBox="0 0 300 68" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', maxWidth: '100%' }}>
    <style>{`.do{fill:#16171f;stroke:#c8963e;stroke-width:1.2}.dd{fill:none;stroke:#c8963e;stroke-width:0.5;opacity:0.15}@keyframes ecg-fade{0%{stroke-dashoffset:100}100%{stroke-dashoffset:-100}}.ecg-line{stroke-dasharray:100;stroke-dashoffset:100;animation:ecg-fade 2s linear infinite}@keyframes ecg-dot{0%{opacity:0;transform:translateX(-20px)}50%{opacity:1}100%{opacity:0;transform:translateX(20px)}}.ecg-dot{animation:ecg-dot 2s linear infinite}`}</style>
    {[[1,1,1,0],[1,0,0,1],[1,1,1,0],[1,0,0,0],[1,0,0,0],[1,0,0,0]].map((r,ri)=>r.map((on,ci)=><rect key={`p${ri}${ci}`} className={on?'do':'dd'} x={ci*11} y={ri*11} width="8" height="8" rx="1.5"/>))}
    {[[1,0,0,1],[1,0,0,1],[1,0,0,1],[1,0,0,1],[1,0,0,1],[1,1,1,1]].map((r,ri)=>r.map((on,ci)=><rect key={`u${ri}${ci}`} className={on?'do':'dd'} x={52+ci*11} y={ri*11} width="8" height="8" rx="1.5"/>))}
    {[[1,0,0,0],[1,0,0,0],[1,0,0,0],[1,0,0,0],[1,0,0,0],[1,1,1,1]].map((r,ri)=>r.map((on,ci)=><rect key={`l${ri}${ci}`} className={on?'do':'dd'} x={100+ci*11} y={ri*11} width="8" height="8" rx="1.5"/>))}
    {[[1,1,1,1],[1,0,0,0],[1,1,1,1],[0,0,0,1],[0,0,0,1],[1,1,1,1]].map((r,ri)=>r.map((on,ci)=><rect key={`s${ri}${ci}`} className={on?'do':'dd'} x={148+ci*11} y={ri*11} width="8" height="8" rx="1.5"/>))}
    {[[1,1,1,1],[1,0,0,0],[1,1,1,0],[1,0,0,0],[1,0,0,0],[1,1,1,1]].map((r,ri)=>r.map((on,ci)=><rect key={`e${ri}${ci}`} className={on?'do':'dd'} x={196+ci*11} y={ri*11} width="8" height="8" rx="1.5"/>))}
    <line x1="248" y1="33" x2="262" y2="33" stroke="#c8963e" strokeWidth="1.5" opacity="0.3"/>
    <polyline className="ecg-line" points="262,33 268,12 272,54 278,20 284,33" fill="none" stroke="#c8963e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <line x1="284" y1="33" x2="300" y2="33" stroke="#c8963e" strokeWidth="1.5" opacity="0.3"/>
    <circle className="ecg-dot" cx="284" cy="33" r="2.5" fill="#c8963e"/>
  </svg>
)

export default function Signup() {
  const [fullName, setFullName]         = useState('')
  const [email, setEmail]               = useState('')
  const [password, setPassword]         = useState('')
  const [confirmPassword, setConfirm]   = useState('')
  const [error, setError]               = useState('')
  const [loading, setLoading]           = useState(false)
  const [submitted, setSubmitted]       = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      // Always sign out immediately — account needs admin approval before access
      await supabase.auth.signOut()
      setSubmitted(true)
    }
  }

  if (submitted) {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <div style={s.logoWrap}>
            <PulseLogo />
          </div>

          <div style={s.successWrap}>
            <div style={s.successIcon}>✓</div>
            <p style={s.successTitle}>Request submitted</p>
            <p style={s.successBody}>
              Your account is pending approval.<br />
              You'll receive an email once your account is approved.
            </p>
            <Link to="/login" style={s.backLink}>← Back to Sign In</Link>
          </div>

          <p style={s.footer}>pulse v1.0 · Product Operations</p>
        </div>
      </div>
    )
  }

  return (
    <div style={s.page}>
      <div style={s.card}>

        <div style={s.logoWrap}>
          <PixelLogo bg={null} width={160} height={38} />
        </div>
        <p style={s.tagline}>Property Inspection Platform</p>

        <form onSubmit={handleSubmit} style={s.form} noValidate>
          {error && <div style={s.errorBox}>{error}</div>}

          <div style={s.fieldGroup}>
            <label style={s.label} htmlFor="fullName">full name</label>
            <input
              id="fullName"
              type="text"
              autoComplete="name"
              style={s.input}
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="Your name"
              required
            />
          </div>

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
              autoComplete="new-password"
              style={s.input}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="min 8 characters"
              required
            />
          </div>

          <div style={s.fieldGroup}>
            <label style={s.label} htmlFor="confirm">confirm password</label>
            <input
              id="confirm"
              type="password"
              autoComplete="new-password"
              style={s.input}
              value={confirmPassword}
              onChange={e => setConfirm(e.target.value)}
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
            {loading ? '// SUBMITTING…' : 'REQUEST ACCESS →'}
          </button>
        </form>

        <p style={{ ...s.footer, marginTop: 20 }}>
          Already have an account?{' '}
          <Link to="/login" style={s.link}>Sign in →</Link>
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
    boxSizing: 'border-box',
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
  successWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    padding: '8px 0 20px',
  },
  successIcon: {
    width: 48,
    height: 48,
    borderRadius: '50%',
    background: 'rgba(61,186,122,0.12)',
    border: '1px solid rgba(61,186,122,0.35)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 22,
    color: 'var(--green, #3dba7a)',
    marginBottom: 16,
  },
  successTitle: {
    margin: '0 0 10px',
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--text, #e8e8f0)',
    fontFamily: 'var(--font-mono, monospace)',
  },
  successBody: {
    margin: '0 0 22px',
    fontSize: 13,
    color: 'var(--text-muted, #6b6d82)',
    fontFamily: 'var(--font-mono, monospace)',
    lineHeight: 1.65,
  },
  backLink: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--accent, #c8963e)',
    textDecoration: 'none',
    fontFamily: 'var(--font-mono, monospace)',
  },
  link: {
    color: 'var(--accent, #c8963e)',
    textDecoration: 'none',
    fontWeight: 600,
  },
  footer: {
    marginTop: 10,
    fontSize: 11,
    color: 'var(--text-muted, #6b6d82)',
    textAlign: 'center',
    fontFamily: 'var(--font-mono, monospace)',
  },
}

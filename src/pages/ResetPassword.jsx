import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword]       = useState('')
  const [confirm, setConfirm]         = useState('')
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const [success, setSuccess]         = useState(false)
  const [sessionReady, setSessionReady] = useState(false)

  useEffect(() => {
    // Supabase embeds the token in the URL hash — calling getSession picks it up
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) setSessionReady(true)
      else setError('Invalid or expired reset link. Please request a new one.')
    })
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const { error: updateErr } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (updateErr) {
      setError(updateErr.message)
      return
    }

    setSuccess(true)
    setTimeout(() => navigate('/login', { replace: true }), 2000)
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'var(--bg, #16171f)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-sans, Poppins, sans-serif)',
      color: 'var(--text, #e8e8f0)',
      padding: '24px 20px',
    }}>
      <div style={{
        width: '100%', maxWidth: 400,
        background: 'var(--bg-panel, #1e2028)',
        border: '1px dashed var(--border-dash, #3a3d52)',
        borderRadius: 14,
        padding: '32px 28px',
      }}>
        {/* Header */}
        <div style={{ marginBottom: 28, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', marginBottom: 6 }}>
            // reset_password
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text, #e8e8f0)', letterSpacing: '-0.3px' }}>
            Set New Password
          </h1>
        </div>

        {success ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
            padding: '20px 0', textAlign: 'center',
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: 'rgba(61,186,122,0.12)',
              border: '1px solid rgba(61,186,122,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M4 11l5 5 9-9" stroke="var(--green, #3dba7a)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--green, #3dba7a)' }}>Password updated</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>
              redirecting to login…
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* New Password */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{
                fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '0.08em', color: 'var(--text-dim, #9394a8)',
                fontFamily: 'var(--font-mono, monospace)',
              }}>
                New Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="min. 8 characters"
                required
                disabled={!sessionReady}
                style={{
                  width: '100%', padding: '11px 14px',
                  fontSize: 13, color: 'var(--text, #e8e8f0)',
                  background: 'var(--bg-input, #252731)',
                  border: '1px solid var(--border, #2e3040)',
                  borderRadius: 6, outline: 'none',
                  fontFamily: 'inherit',
                  opacity: sessionReady ? 1 : 0.5,
                }}
              />
            </div>

            {/* Confirm Password */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{
                fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '0.08em', color: 'var(--text-dim, #9394a8)',
                fontFamily: 'var(--font-mono, monospace)',
              }}>
                Confirm Password
              </label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="repeat password"
                required
                disabled={!sessionReady}
                style={{
                  width: '100%', padding: '11px 14px',
                  fontSize: 13, color: 'var(--text, #e8e8f0)',
                  background: 'var(--bg-input, #252731)',
                  border: '1px solid var(--border, #2e3040)',
                  borderRadius: 6, outline: 'none',
                  fontFamily: 'inherit',
                  opacity: sessionReady ? 1 : 0.5,
                }}
              />
            </div>

            {/* Error */}
            {error && (
              <div style={{
                fontSize: 12, color: 'var(--red, #e05c6a)',
                background: 'rgba(224,92,106,0.08)',
                border: '1px solid rgba(224,92,106,0.25)',
                borderRadius: 6, padding: '9px 12px',
                fontFamily: 'var(--font-mono, monospace)',
              }}>
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !sessionReady}
              style={{
                width: '100%', padding: '12px',
                background: loading || !sessionReady ? 'var(--accent-dim, #8a6428)' : 'var(--accent, #c8963e)',
                color: '#fff',
                fontSize: 13, fontWeight: 700,
                border: 'none', borderRadius: 6,
                cursor: loading || !sessionReady ? 'not-allowed' : 'pointer',
                opacity: loading || !sessionReady ? 0.75 : 1,
                fontFamily: 'var(--font-mono, monospace)',
                letterSpacing: '0.04em',
                transition: 'background 0.15s',
              }}
            >
              {loading ? 'UPDATING…' : 'UPDATE PASSWORD'}
            </button>

            <button
              type="button"
              onClick={() => navigate('/login')}
              style={{
                background: 'none', border: 'none',
                fontSize: 12, color: 'var(--text-muted, #6b6d82)',
                cursor: 'pointer', textAlign: 'center',
                fontFamily: 'var(--font-mono, monospace)',
                padding: '4px',
              }}
            >
              ← back to login
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

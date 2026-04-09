import { useNavigate } from 'react-router-dom'

export default function SOPs() {
  const navigate = useNavigate()

  return (
    <div style={s.page}>
      <div style={s.card}>
        <button onClick={() => navigate('/')} style={s.back}>← back</button>
        <div style={s.eyebrow}>// sops</div>
        <h1 style={s.title}>Standard Operating Procedures</h1>
        <p style={s.subtitle}>
          All Flent SOPs will be available here.
        </p>
      </div>
    </div>
  )
}

const s = {
  page: {
    minHeight: '100dvh',
    background: 'var(--bg, #16171f)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 20px',
    fontFamily: 'var(--font-sans, Poppins, sans-serif)',
    color: 'var(--text, #e8e8f0)',
  },
  card: {
    width: '100%',
    maxWidth: 480,
    background: 'var(--bg-panel, #1e2028)',
    border: '1px dashed var(--border-dash, #3a3d52)',
    borderRadius: 14,
    padding: '32px 28px',
  },
  back: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted, #6b6d82)',
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: 12,
    cursor: 'pointer',
    padding: 0,
    marginBottom: 20,
    display: 'block',
  },
  eyebrow: {
    fontSize: 11,
    color: 'var(--accent, #c8963e)',
    fontFamily: 'var(--font-mono, monospace)',
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: 'var(--text, #e8e8f0)',
    letterSpacing: '-0.4px',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 13,
    color: 'var(--text-muted, #6b6d82)',
    fontFamily: 'var(--font-mono, monospace)',
    lineHeight: 1.6,
  },
}

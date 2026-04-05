export default function StubPage({ title, onBack }) {
  return (
    <div style={s.page}>
      <header style={s.header}>
        <button style={s.backBtn} onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M12 5l-5 5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Back
        </button>
      </header>
      <main style={s.main}>
        <h1 style={s.title}>{title}</h1>
        <p style={s.note}>This section is coming soon.</p>
      </main>
    </div>
  )
}

const s = {
  page: {
    minHeight: '100svh',
    background: 'var(--bg)',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    padding: '16px 20px',
    background: 'var(--surface)',
    borderBottom: '1px solid var(--border)',
  },
  backBtn: {
    fontFamily: 'inherit',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--brand)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '6px 0',
  },
  main: {
    flex: 1,
    padding: '40px 20px',
    maxWidth: 600,
    width: '100%',
    margin: '0 auto',
    animation: 'fadeIn 0.3s ease',
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    margin: '0 0 12px',
    color: 'var(--text)',
  },
  note: {
    fontSize: 15,
    color: 'var(--text-secondary)',
  },
}

import { useNavigate, useParams } from 'react-router-dom'
import WorkOrdersSection from '../components/property/WorkOrdersSection'

const SANS = 'var(--font-sans, Poppins, sans-serif)'
const MONO = 'var(--font-mono, monospace)'

export default function PropertyWorkOrders() {
  const navigate = useNavigate()
  const { pid } = useParams()

  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', display: 'flex', flexDirection: 'column', fontFamily: SANS, color: 'var(--text, #e8e8f0)' }}>
      <header style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', minHeight: 56,
        paddingTop: 'env(safe-area-inset-top)', background: 'var(--bg-panel, #1e2028)',
        borderBottom: '1px solid var(--border, #2e3040)', position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button onClick={() => navigate(`/properties/${pid}`)} aria-label="Back to property"
          style={{ width: 40, height: 40, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', color: 'var(--text-dim, #9394a8)', cursor: 'pointer', flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="pulse-title" style={{ fontSize: 15.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Work orders</div>
          <div style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 1 }}>PID {pid}</div>
        </div>
        <button onClick={() => navigate(`/properties/${pid}/work-orders/report`)}
          title="Cost, time and vendors across every trade on this property"
          style={{ display: 'flex', alignItems: 'center', gap: 7, minHeight: 38, padding: '0 13px', borderRadius: 9, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--text-dim, #9394a8)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: MONO, flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 3v18h18" /><path d="M7 15l4-5 4 3 5-7" />
          </svg>
          Report
        </button>
      </header>

      <main style={{ flex: 1, width: '100%', maxWidth: 860, margin: '0 auto', padding: '4px 16px calc(90px + env(safe-area-inset-bottom))', boxSizing: 'border-box' }}>
        <WorkOrdersSection pid={pid} heading={null} />
      </main>
    </div>
  )
}

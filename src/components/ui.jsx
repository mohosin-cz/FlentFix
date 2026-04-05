// ─── Shared UI primitives — Dark Terminal Theme ────────────────────────────

// ── Page shell ───────────────────────────────────────────────────────────────
export function PageShell({ children }) {
  return (
    <div style={{
      minHeight: '100svh',
      background: 'var(--bg, #16171f)',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'var(--font-sans, Poppins, sans-serif)',
      color: 'var(--text, #e8e8f0)',
    }}>
      {children}
    </div>
  )
}

// ── Top nav bar ───────────────────────────────────────────────────────────────
export function NavBar({ title, subtitle, onBack, right }) {
  return (
    <header style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 20px',
      paddingTop: 'calc(env(safe-area-inset-top) + 0px)',
      minHeight: 56,
      background: 'var(--bg-panel, #1e2028)',
      borderBottom: '1px solid var(--border, #2e3040)',
      position: 'sticky', top: 0, zIndex: 100,
    }}>
      <button
        onClick={onBack}
        style={{
          width: 36, height: 36, borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--bg-input, #252731)',
          border: '1px solid var(--border, #2e3040)',
          color: 'var(--text-dim, #9394a8)',
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'border-color 0.15s',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      <div style={{ flex: 1, textAlign: 'center', padding: '0 12px' }}>
        <div style={{
          fontSize: 14, fontWeight: 600,
          color: 'var(--text, #e8e8f0)',
          letterSpacing: '-0.2px',
          fontFamily: 'var(--font-mono, monospace)',
        }}>{title}</div>
        {subtitle && (
          <div style={{
            fontSize: 11,
            color: 'var(--text-muted, #6b6d82)',
            marginTop: 1,
            fontFamily: 'var(--font-mono, monospace)',
          }}>{subtitle}</div>
        )}
      </div>
      <div style={{ width: 36, flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>{right || null}</div>
    </header>
  )
}

// ── Progress steps ────────────────────────────────────────────────────────────
export function StepBar({ steps, current }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 0,
      padding: '0 20px', height: 48,
      background: 'var(--bg-panel, #1e2028)',
      borderBottom: '1px solid var(--border, #2e3040)',
    }}>
      {steps.map((label, i) => {
        const done   = i < current
        const active = i === current
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 20, height: 20, borderRadius: 4,
                  background: done ? 'var(--green, #3dba7a)' : active ? 'var(--accent, #c8963e)' : 'var(--bg-input, #252731)',
                  border: `1.5px solid ${done ? 'var(--green, #3dba7a)' : active ? 'var(--accent, #c8963e)' : 'var(--border, #2e3040)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, transition: 'all 0.2s',
                }}>
                  {done
                    ? <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    : <span style={{ fontSize: 9, fontWeight: 700, color: active ? '#fff' : 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{i + 1}</span>
                  }
                </div>
                <span style={{
                  fontSize: 10, fontWeight: active ? 600 : 400,
                  color: active ? 'var(--accent, #c8963e)' : done ? 'var(--text-dim, #9394a8)' : 'var(--text-muted, #6b6d82)',
                  whiteSpace: 'nowrap',
                  fontFamily: 'var(--font-mono, monospace)',
                }}>{label}</span>
              </div>
            </div>
            {i < steps.length - 1 && (
              <div style={{
                width: 20, height: 1,
                background: done ? 'var(--green, #3dba7a)' : 'var(--border, #2e3040)',
                margin: '0 4px', flexShrink: 0, transition: 'background 0.2s',
              }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Section label ─────────────────────────────────────────────────────────────
export function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 600,
      color: 'var(--text-muted, #6b6d82)',
      letterSpacing: '0.1em', textTransform: 'uppercase',
      marginBottom: 10,
      fontFamily: 'var(--font-mono, monospace)',
    }}>{children}</div>
  )
}

// ── Field wrapper ─────────────────────────────────────────────────────────────
export function Field({ label, optional, error, hint, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{
        fontSize: 11, fontWeight: 600,
        color: error ? 'var(--red, #e05c6a)' : 'var(--text-dim, #9394a8)',
        textTransform: 'uppercase', letterSpacing: '0.08em',
        fontFamily: 'var(--font-mono, monospace)',
      }}>
        {label}
        {optional && <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-muted, #6b6d82)', marginLeft: 6, textTransform: 'none' }}>optional</span>}
      </label>
      {children}
      {error && (
        <span style={{ fontSize: 11, color: 'var(--red, #e05c6a)', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-mono, monospace)' }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2"/><path d="M6 4v3M6 8.5v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
          {error}
        </span>
      )}
      {hint && !error && (
        <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{hint}</span>
      )}
    </div>
  )
}

// ── Text input ────────────────────────────────────────────────────────────────
export function Input({ value, onChange, placeholder, type = 'text', error, ...rest }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%', padding: '10px 14px',
        fontSize: 13,
        color: 'var(--text, #e8e8f0)',
        background: 'var(--bg-input, #252731)',
        border: `1px solid ${error ? 'var(--red, #e05c6a)' : 'var(--border, #2e3040)'}`,
        borderRadius: 6, outline: 'none',
        transition: 'border-color 0.15s',
        boxShadow: error ? '0 0 0 2px rgba(224,92,106,0.15)' : 'none',
        fontFamily: 'inherit',
      }}
      {...rest}
    />
  )
}

// ── Textarea ──────────────────────────────────────────────────────────────────
export function Textarea({ value, onChange, placeholder, rows = 3 }) {
  return (
    <textarea
      rows={rows}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%', padding: '10px 14px',
        fontSize: 13,
        color: 'var(--text, #e8e8f0)',
        lineHeight: 1.6,
        background: 'var(--bg-input, #252731)',
        border: '1px solid var(--border, #2e3040)',
        borderRadius: 6, outline: 'none',
        resize: 'vertical', transition: 'border-color 0.15s',
        fontFamily: 'inherit',
      }}
    />
  )
}

// ── Pill selector ─────────────────────────────────────────────────────────────
export function PillGroup({ options, value, onChange, multi = false }) {
  function toggle(v) {
    if (multi) {
      const cur = value || []
      onChange(cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v])
    } else {
      onChange(value === v ? '' : v)
    }
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map(opt => {
        const v      = typeof opt === 'object' ? opt.value : opt
        const label  = typeof opt === 'object' ? opt.label : opt
        const active = multi ? (value || []).includes(v) : value === v
        return (
          <button
            key={v}
            onClick={() => toggle(v)}
            style={{
              padding: '7px 14px', fontSize: 12, fontWeight: active ? 600 : 400,
              borderRadius: 4,
              border: `1px solid ${active ? 'var(--accent, #c8963e)' : 'var(--border, #2e3040)'}`,
              background: active ? 'rgba(200,150,62,0.12)' : 'var(--bg-input, #252731)',
              color: active ? 'var(--accent, #c8963e)' : 'var(--text-dim, #9394a8)',
              transition: 'all 0.15s', cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
              fontFamily: 'inherit',
            }}
          >{label}</button>
        )
      })}
    </div>
  )
}

// ── Card toggle ───────────────────────────────────────────────────────────────
export function CardToggle({ options, value, onChange }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(options.length, 3)}, 1fr)`, gap: 10 }}>
      {options.map(opt => {
        const v      = typeof opt === 'object' ? opt.value : opt
        const label  = typeof opt === 'object' ? opt.label : opt
        const icon   = typeof opt === 'object' ? opt.icon : null
        const active = value === v
        return (
          <button
            key={v}
            onClick={() => onChange(active ? '' : v)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 8, padding: '14px 10px',
              border: `1px solid ${active ? 'var(--accent, #c8963e)' : 'var(--border, #2e3040)'}`,
              borderRadius: 8,
              background: active ? 'rgba(200,150,62,0.08)' : 'var(--bg-input, #252731)',
              cursor: 'pointer', position: 'relative',
              transition: 'all 0.15s',
              color: active ? 'var(--accent, #c8963e)' : 'var(--text-dim, #9394a8)',
            }}
          >
            {icon && <div style={{ lineHeight: 0 }}>{icon}</div>}
            <span style={{
              fontSize: 11, fontWeight: active ? 600 : 400,
              color: active ? 'var(--accent, #c8963e)' : 'var(--text-dim, #9394a8)',
              textAlign: 'center', lineHeight: 1.3,
              fontFamily: 'inherit',
            }}>{label}</span>
            {active && (
              <div style={{
                position: 'absolute', top: 6, right: 6,
                width: 16, height: 16, borderRadius: 3,
                background: 'var(--accent, #c8963e)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                  <path d="M1.5 4.5l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ── Health slider ─────────────────────────────────────────────────────────────
export function HealthSlider({ value, onChange }) {
  const color   = value === null ? 'var(--text-muted, #6b6d82)' : value >= 7 ? 'var(--green, #3dba7a)' : value >= 4 ? 'var(--amber, #c8963e)' : 'var(--red, #e05c6a)'
  const touched = value !== null && value !== undefined

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>
          0 — critical · 10 — excellent
        </span>
        <div style={{
          minWidth: 56, textAlign: 'center', padding: '3px 10px',
          borderRadius: 4, fontWeight: 700, fontSize: 14,
          background: touched ? color + '18' : 'var(--bg-input, #252731)',
          color: touched ? color : 'var(--text-muted, #6b6d82)',
          border: `1px solid ${touched ? color + '40' : 'var(--border, #2e3040)'}`,
          transition: 'all 0.2s',
          fontFamily: 'var(--font-mono, monospace)',
        }}>
          {touched ? `${value}/10` : '—'}
        </div>
      </div>
      <div style={{ position: 'relative' }}>
        <div style={{
          position: 'absolute', top: 0, left: 0,
          height: 4, borderRadius: 2,
          width: touched ? `${value * 10}%` : '0%',
          background: color, transition: 'width 0.1s, background 0.2s',
          pointerEvents: 'none',
        }} />
        <input
          type="range" min={0} max={10} step={1}
          value={touched ? value : 5}
          onMouseDown={() => { if (!touched) onChange(5) }}
          onTouchStart={() => { if (!touched) onChange(5) }}
          onChange={e => onChange(Number(e.target.value))}
          style={{ width: '100%' }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        {[0,1,2,3,4,5,6,7,8,9,10].map(i => (
          <span key={i} style={{
            fontSize: 9, fontWeight: touched && value === i ? 700 : 400,
            color: touched && value === i ? color : 'var(--border-dash, #3a3d52)',
            transition: 'color 0.15s',
            fontFamily: 'var(--font-mono, monospace)',
          }}>{i}</span>
        ))}
      </div>
    </div>
  )
}

// ── Media attach button ───────────────────────────────────────────────────────
export function MediaButton({ attached, onToggle, label = 'Attach Photos / Videos' }) {
  return (
    <button
      onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        width: '100%', padding: '10px 14px', textAlign: 'left',
        border: `1px dashed ${attached ? 'var(--green, #3dba7a)' : 'var(--border-dash, #3a3d52)'}`,
        borderRadius: 6, cursor: 'pointer',
        background: attached ? 'rgba(61,186,122,0.08)' : 'var(--bg-input, #252731)',
        color: attached ? 'var(--green, #3dba7a)' : 'var(--text-muted, #6b6d82)',
        fontSize: 13, fontWeight: 500,
        transition: 'all 0.15s',
        fontFamily: 'inherit',
      }}
    >
      {attached
        ? <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="8" stroke="currentColor" strokeWidth="1.4"/><path d="M5.5 9l2.5 2.5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
        : <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="1" y="4" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.4"/><circle cx="6" cy="9" r="2" stroke="currentColor" strokeWidth="1.2"/><path d="M1 13l3.5-3 3 3 2-2 7.5 4" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/><circle cx="14" cy="5" r="1.5" fill="currentColor"/></svg>
      }
      <span>{attached ? 'media attached ✓' : label}</span>
    </button>
  )
}

// ── Info banner ───────────────────────────────────────────────────────────────
export function Banner({ type = 'info', children }) {
  const c = {
    info:    { bg: 'rgba(61,186,122,0.08)',  color: 'var(--green, #3dba7a)',  border: 'rgba(61,186,122,0.25)',  icon: 'ℹ' },
    warning: { bg: 'rgba(200,150,62,0.08)',  color: 'var(--amber, #c8963e)', border: 'rgba(200,150,62,0.25)',  icon: '⚠' },
    danger:  { bg: 'rgba(224,92,106,0.08)', color: 'var(--red, #e05c6a)',   border: 'rgba(224,92,106,0.25)', icon: '!' },
    success: { bg: 'rgba(61,186,122,0.08)',  color: 'var(--green, #3dba7a)',  border: 'rgba(61,186,122,0.25)',  icon: '✓' },
  }[type]
  return (
    <div style={{
      display: 'flex', gap: 10, padding: '10px 14px',
      background: c.bg,
      border: `1px solid ${c.border}`,
      borderRadius: 6, fontSize: 12, color: c.color, fontWeight: 500,
      fontFamily: 'var(--font-mono, monospace)',
    }}>
      <span>{c.icon}</span>
      <span>{children}</span>
    </div>
  )
}

// ── Expandable accordion card ─────────────────────────────────────────────────
export function AccordionCard({ title, badge, status, isOpen, onToggle, children, headerAction }) {
  const borderColor = status === 'done'
    ? 'var(--green, #3dba7a)'
    : isOpen
      ? 'var(--accent, #c8963e)'
      : 'var(--border, #2e3040)'

  return (
    <div style={{
      border: `1px solid ${borderColor}`,
      borderRadius: 10,
      background: 'var(--bg-panel, #1e2028)',
      overflow: 'hidden',
      transition: 'border-color 0.2s, box-shadow 0.2s',
      boxShadow: isOpen ? '0 0 0 1px var(--accent, #c8963e), 0 4px 16px rgba(0,0,0,0.4)' : 'var(--shadow-xs, 0 1px 3px rgba(0,0,0,0.35))',
    }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', padding: '16px 18px',
          display: 'flex', alignItems: 'center', gap: 12,
          cursor: 'pointer', background: 'none', border: 'none', textAlign: 'left',
        }}
      >
        {/* status dot */}
        <div style={{
          width: 8, height: 8, borderRadius: 2, flexShrink: 0,
          background: status === 'done'
            ? 'var(--green, #3dba7a)'
            : status === 'partial'
              ? 'var(--amber, #c8963e)'
              : 'var(--border-dash, #3a3d52)',
          transition: 'background 0.2s',
        }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text, #e8e8f0)' }}>{title}</div>
          {badge && <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', marginTop: 2, fontFamily: 'var(--font-mono, monospace)' }}>{badge}</div>}
        </div>
        {status === 'done' && (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect width="16" height="16" rx="4" fill="var(--green, #3dba7a)"/>
            <path d="M4.5 8l3 3 4-4.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
        {headerAction && (
          <span onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center' }}>
            {headerAction}
          </span>
        )}
        <svg
          width="16" height="16" viewBox="0 0 16 16" fill="none"
          style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}
        >
          <path d="M4 6l4 4 4-4" stroke="var(--text-muted, #6b6d82)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {isOpen && (
        <div style={{
          borderTop: '1px solid var(--border, #2e3040)',
          padding: '18px',
          display: 'flex', flexDirection: 'column', gap: 20,
        }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ── Bottom sticky footer ───────────────────────────────────────────────────────
export function StickyFooter({ children, left }) {
  return (
    <div style={{
      position: 'sticky', bottom: 0,
      padding: '14px 20px',
      paddingBottom: 'max(14px, env(safe-area-inset-bottom))',
      background: 'var(--bg-panel, #1e2028)',
      borderTop: '1px solid var(--border, #2e3040)',
      zIndex: 50,
      display: 'flex', alignItems: 'center',
      justifyContent: left ? 'space-between' : 'flex-end',
      gap: 16,
    }}>
      {left && <div style={{ flex: 1 }}>{left}</div>}
      <div>{children}</div>
    </div>
  )
}

// ── Primary CTA button ────────────────────────────────────────────────────────
export function BtnPrimary({ children, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '11px 20px',
        background: disabled ? 'var(--bg-input, #252731)' : 'var(--accent, #c8963e)',
        color: disabled ? 'var(--text-muted, #6b6d82)' : '#fff',
        fontSize: 13, fontWeight: 700,
        border: `1px solid ${disabled ? 'var(--border, #2e3040)' : 'transparent'}`,
        borderRadius: 6,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.15s, opacity 0.15s',
        whiteSpace: 'nowrap',
        WebkitTapHighlightColor: 'transparent',
        fontFamily: 'var(--font-mono, monospace)',
        letterSpacing: '0.02em',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = 'var(--accent-dim, #8a6428)' }}
      onMouseLeave={e => { if (!disabled) e.currentTarget.style.background = 'var(--accent, #c8963e)' }}
    >{children}</button>
  )
}

// ── Ghost/outline button ──────────────────────────────────────────────────────
export function BtnSecondary({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '10px 18px',
        background: 'transparent',
        color: 'var(--text, #e8e8f0)',
        fontSize: 13, fontWeight: 600,
        border: '1px solid var(--border-dash, #3a3d52)',
        borderRadius: 6,
        cursor: 'pointer', whiteSpace: 'nowrap',
        transition: 'border-color 0.15s',
        fontFamily: 'inherit',
      }}
    >{children}</button>
  )
}

// ── Divider ───────────────────────────────────────────────────────────────────
export function Divider({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, height: 1, background: 'var(--border, #2e3040)' }} />
      {label && <span style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono, monospace)' }}>{label}</span>}
      <div style={{ flex: 1, height: 1, background: 'var(--border, #2e3040)' }} />
    </div>
  )
}

// ── Tab bar ───────────────────────────────────────────────────────────────────
export function TabBar({ tabs, active, onChange, counts }) {
  return (
    <div style={{
      display: 'flex',
      background: 'var(--bg-panel, #1e2028)',
      borderBottom: '1px solid var(--border, #2e3040)',
      position: 'sticky', top: 'calc(env(safe-area-inset-top) + 56px)', zIndex: 90,
      overflowX: 'auto',
    }}>
      {tabs.map((tab, i) => (
        <button
          key={tab}
          onClick={() => onChange(i)}
          style={{
            flex: 1, minWidth: 80, padding: '11px 8px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            background: 'none', border: 'none',
            borderBottom: `2px solid ${active === i ? 'var(--accent, #c8963e)' : 'transparent'}`,
            cursor: 'pointer', transition: 'all 0.15s',
            color: active === i ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)',
          }}
        >
          <span style={{
            fontSize: 12, fontWeight: active === i ? 700 : 400,
            fontFamily: 'inherit',
          }}>{tab}</span>
          {counts && (
            <span style={{
              fontSize: 9, fontWeight: 600,
              color: counts[i] > 0 ? 'var(--green, #3dba7a)' : 'var(--border-dash, #3a3d52)',
              fontFamily: 'var(--font-mono, monospace)',
            }}>
              {counts[i]}/{counts[`${i}_total`] ?? '?'}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

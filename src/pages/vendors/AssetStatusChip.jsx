import { STATUS_META } from '../../utils/assetMeta'

export default function AssetStatusChip({ status }) {
  const m = STATUS_META[status] || STATUS_META.in_stores
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 5, whiteSpace: 'nowrap',
      color: m.color, background: m.bg, border: `1px solid ${m.color}44`, fontFamily: 'var(--font-mono, monospace)' }}>
      {m.label}
    </span>
  )
}

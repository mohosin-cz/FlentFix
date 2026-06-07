import PixelLogo from './PixelLogo'

export default function LogoSpinner({ full = false }) {
  return (
    <div style={full ? {
      minHeight: '100svh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'var(--bg, #16171f)',
    } : {
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 0',
    }}>
      <PixelLogo width={120} height={24} />
    </div>
  )
}

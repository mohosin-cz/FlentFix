const CSS = `
@keyframes ecg-fade { 0% { stroke-dashoffset: 100 } 100% { stroke-dashoffset: -100 } }
@keyframes ecg-dot  { 0% { opacity:0; transform:translateX(-22px) } 50% { opacity:1 } 100% { opacity:0; transform:translateX(22px) } }
.ls-ecg  { stroke-dasharray:100; stroke-dashoffset:100; animation: ecg-fade 2s linear infinite }
.ls-dot  { animation: ecg-dot 2s linear infinite }
`

function WaveIcon() {
  return (
    <>
      <style>{CSS}</style>
      <svg width="80" height="32" viewBox="0 0 80 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <line x1="0"  y1="16" x2="18" y2="16" stroke="#c8963e" strokeWidth="1.5" opacity="0.3"/>
        <polyline
          className="ls-ecg"
          points="18,16 24,3 28,29 34,6 40,16"
          fill="none" stroke="#c8963e" strokeWidth="1.5"
          strokeLinecap="round" strokeLinejoin="round"
        />
        <line x1="40" y1="16" x2="80" y2="16" stroke="#c8963e" strokeWidth="1.5" opacity="0.3"/>
        <circle className="ls-dot" cx="40" cy="16" r="2.2" fill="#c8963e"/>
      </svg>
    </>
  )
}

export default function LogoSpinner({ full = false }) {
  return (
    <div style={full ? {
      minHeight: '100svh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'var(--bg, #16171f)',
    } : {
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 0',
    }}>
      <WaveIcon />
    </div>
  )
}

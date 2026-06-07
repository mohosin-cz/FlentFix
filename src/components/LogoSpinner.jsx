const style = `
@keyframes logoPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.88); }
}
.logo-spinner-img {
  animation: logoPulse 1.4s ease-in-out infinite;
}
`

export default function LogoSpinner({ size = 52, full = false }) {
  return (
    <>
      <style>{style}</style>
      <div style={full ? {
        minHeight: '100svh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: 'var(--bg, #16171f)',
      } : {
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 0',
      }}>
        <img
          src="/logo.svg"
          width={size}
          height={size}
          alt="Loading"
          className="logo-spinner-img"
        />
      </div>
    </>
  )
}

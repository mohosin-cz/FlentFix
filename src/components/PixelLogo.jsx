const PulseLogo = ({ width = 110, height = 22 }) => (
  <svg width={width} height={height} viewBox="0 0 300 68" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
    <style>{`.d1{fill:#c8963e}.d0{fill:#c8963e;opacity:.12}`}</style>
    {/* P */}
    {[[1,1,1,0],[1,0,0,1],[1,1,1,0],[1,0,0,0],[1,0,0,0],[1,0,0,0]].map((r,ri)=>r.map((on,ci)=><rect key={`p${ri}${ci}`} className={on?'d1':'d0'} x={ci*11} y={ri*11} width="8" height="8" rx="1.5"/>))}
    {/* U */}
    {[[1,0,0,1],[1,0,0,1],[1,0,0,1],[1,0,0,1],[1,0,0,1],[1,1,1,1]].map((r,ri)=>r.map((on,ci)=><rect key={`u${ri}${ci}`} className={on?'d1':'d0'} x={52+ci*11} y={ri*11} width="8" height="8" rx="1.5"/>))}
    {/* L */}
    {[[1,0,0,0],[1,0,0,0],[1,0,0,0],[1,0,0,0],[1,0,0,0],[1,1,1,1]].map((r,ri)=>r.map((on,ci)=><rect key={`l${ri}${ci}`} className={on?'d1':'d0'} x={100+ci*11} y={ri*11} width="8" height="8" rx="1.5"/>))}
    {/* S */}
    {[[1,1,1,1],[1,0,0,0],[1,1,1,1],[0,0,0,1],[0,0,0,1],[1,1,1,1]].map((r,ri)=>r.map((on,ci)=><rect key={`s${ri}${ci}`} className={on?'d1':'d0'} x={148+ci*11} y={ri*11} width="8" height="8" rx="1.5"/>))}
    {/* E */}
    {[[1,1,1,1],[1,0,0,0],[1,1,1,0],[1,0,0,0],[1,0,0,0],[1,1,1,1]].map((r,ri)=>r.map((on,ci)=><rect key={`e${ri}${ci}`} className={on?'d1':'d0'} x={196+ci*11} y={ri*11} width="8" height="8" rx="1.5"/>))}
    {/* Heartbeat */}
    <line x1="248" y1="33" x2="258" y2="33" stroke="#c8963e" strokeWidth="1.5" opacity="0.4"/>
    <polyline points="258,33 264,12 268,54 274,20 278,33" fill="none" stroke="#c8963e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <line x1="278" y1="33" x2="296" y2="33" stroke="#c8963e" strokeWidth="1.5" opacity="0.4"/>
    <circle cx="296" cy="33" r="2.5" fill="#c8963e"/>
  </svg>
)

export default function PixelLogo({ width = 110, height = 22 }) {
  return <PulseLogo width={width} height={height} />
}

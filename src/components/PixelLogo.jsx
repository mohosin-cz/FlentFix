const PulseLogo = ({ width = 110, height = 22 }) => (
  <svg width={width} height={height} viewBox="0 0 300 68" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
    <style>{`.do{fill:#16171f;stroke:#c8963e;stroke-width:1.2}.dd{fill:none;stroke:#c8963e;stroke-width:0.5;opacity:0.15}@keyframes ecg-fade{0%{stroke-dashoffset:100}100%{stroke-dashoffset:-100}}.ecg-line{stroke-dasharray:100;stroke-dashoffset:100;animation:ecg-fade 2s linear infinite}@keyframes ecg-dot{0%{opacity:0;transform:translateX(-20px)}50%{opacity:1}100%{opacity:0;transform:translateX(20px)}}.ecg-dot{animation:ecg-dot 2s linear infinite}`}</style>
    {/* P */}
    {[[1,1,1,0],[1,0,0,1],[1,1,1,0],[1,0,0,0],[1,0,0,0],[1,0,0,0]].map((r,ri)=>r.map((on,ci)=><rect key={`p${ri}${ci}`} className={on?'do':'dd'} x={ci*11} y={ri*11} width="8" height="8" rx="1.5"/>))}
    {/* U */}
    {[[1,0,0,1],[1,0,0,1],[1,0,0,1],[1,0,0,1],[1,0,0,1],[1,1,1,1]].map((r,ri)=>r.map((on,ci)=><rect key={`u${ri}${ci}`} className={on?'do':'dd'} x={52+ci*11} y={ri*11} width="8" height="8" rx="1.5"/>))}
    {/* L */}
    {[[1,0,0,0],[1,0,0,0],[1,0,0,0],[1,0,0,0],[1,0,0,0],[1,1,1,1]].map((r,ri)=>r.map((on,ci)=><rect key={`l${ri}${ci}`} className={on?'do':'dd'} x={100+ci*11} y={ri*11} width="8" height="8" rx="1.5"/>))}
    {/* S */}
    {[[1,1,1,1],[1,0,0,0],[1,1,1,1],[0,0,0,1],[0,0,0,1],[1,1,1,1]].map((r,ri)=>r.map((on,ci)=><rect key={`s${ri}${ci}`} className={on?'do':'dd'} x={148+ci*11} y={ri*11} width="8" height="8" rx="1.5"/>))}
    {/* E */}
    {[[1,1,1,1],[1,0,0,0],[1,1,1,0],[1,0,0,0],[1,0,0,0],[1,1,1,1]].map((r,ri)=>r.map((on,ci)=><rect key={`e${ri}${ci}`} className={on?'do':'dd'} x={196+ci*11} y={ri*11} width="8" height="8" rx="1.5"/>))}
    {/* Heartbeat */}
    <line x1="248" y1="33" x2="262" y2="33" stroke="#c8963e" strokeWidth="1.5" opacity="0.3"/>
    <polyline className="ecg-line" points="262,33 268,12 272,54 278,20 284,33" fill="none" stroke="#c8963e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <line x1="284" y1="33" x2="300" y2="33" stroke="#c8963e" strokeWidth="1.5" opacity="0.3"/>
    <circle className="ecg-dot" cx="284" cy="33" r="2.5" fill="#c8963e"/>
  </svg>
)

export default function PixelLogo({ width = 110, height = 22 }) {
  return <PulseLogo width={width} height={height} />
}

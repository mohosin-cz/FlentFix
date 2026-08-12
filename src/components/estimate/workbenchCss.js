// The workbench stylesheet, injected once by the page.
// ─── CSS (ported node-for-node from reference) ────────────────────────────────

export const CSS = `
/* Type comes from the app's tokens, not from a second font stack. This page
   used to pull IBM Plex Mono + Inter off Google Fonts while the rest of Pulse
   ran on Urbanist + JetBrains Mono, so the workbench read as a different
   product — and it cost an extra font request on top of the ones index.html
   already makes. --mono/--sans stay as local aliases so the rules below are
   untouched. */
:root{--bg:#0c0d11;--panel:#14161c;--panel2:#181b22;--line:#23272f;--line2:#2f343f;--ink:#eae8e2;--ink2:#c3c1ba;--muted:#868a94;--faint:#595e69;--gold:#e3aa5a;--teal:#5fb6a8;--clay:#d07050;--amber:#e1a93f;--good:#5fae6e;--blue:#6088c6;--mono:var(--font-mono,'JetBrains Mono','Fira Mono',monospace);--sans:var(--font-sans,'Urbanist','Poppins',sans-serif)}
*{box-sizing:border-box;margin:0;padding:0}
.ey{font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.cmd{position:sticky;top:0;z-index:6;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 22px;background:rgba(12,13,17,.95);border-bottom:1px solid var(--line);backdrop-filter:blur(8px)}
.cmd .l{display:flex;align-items:center;gap:12px}
.back{width:44px;height:44px;border:1px solid var(--line2);border-radius:5px;display:grid;place-items:center;color:var(--ink2);background:none;cursor:pointer;flex-shrink:0;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.back:hover{background:rgba(255,255,255,.06)}
.ttl{font-family:var(--mono);font-weight:600;font-size:15px;color:var(--ink)}
.sub{color:var(--muted);font-size:12px;font-family:var(--mono)}
.pill{font-family:var(--mono);font-size:10px;letter-spacing:.1em;padding:3px 7px;border-radius:4px;border:1px solid var(--line2);color:var(--muted)}
.pill.viewed{color:var(--gold);border-color:rgba(227,170,90,.4)}
.pill.status{text-transform:uppercase;letter-spacing:.08em}
.acts{display:flex;align-items:center;gap:8px}
/* Layout only. Surface, typography, the lit plateau and the press recess all
   come from .tct in theme.css, so these buttons are the same control as the
   Home header nav instead of a local imitation of it. */
.btn{font-size:13px;padding:10px 14px;min-height:44px;display:inline-flex;align-items:center;justify-content:center}
.btn.ghost{padding:8px 11px;min-height:44px}
/* The one exception: a send/save CTA is a filled affirmative, not a nav item,
   so it keeps the gold face and takes .tct's depth on top. */
.btn.primary{background:var(--gold);color:#231a0a;font-weight:600;box-shadow:inset 0 1px 0 rgba(255,255,255,.22),0 2px 6px rgba(0,0,0,.45)}
.btn.primary:hover{background:var(--gold);color:#231a0a;box-shadow:inset 0 1px 0 rgba(255,255,255,.3),0 3px 9px rgba(0,0,0,.5)}
.btn.primary:active{background:#d19a4a;color:#231a0a;box-shadow:inset 0 3px 6px rgba(0,0,0,.4)}
.btn:disabled{opacity:.45;cursor:not-allowed}
.btn:disabled:hover{background:var(--bg-input);box-shadow:inset 0 0 0 1px var(--border)}
.btn.primary:disabled:hover{background:var(--gold)}
.dash{display:grid;grid-template-columns:1.15fr 1fr 1.15fr 1fr;gap:12px;padding:13px 22px;border-bottom:1px solid var(--line);background:var(--panel);transition:margin-right .16s}
.card{border:1px solid var(--line);border-radius:7px;background:var(--panel2);padding:11px 13px;display:flex;flex-direction:column;gap:9px}
.card .ct{font-family:var(--mono);font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.big{font-family:var(--mono);font-weight:700;font-size:21px;color:var(--gold);line-height:1}
.mlrow{display:flex;justify-content:space-between;font-family:var(--mono);font-size:11px;color:var(--ink2)}
.mlrow .lbl{color:var(--muted)}
.splitbar,.stackbar{height:8px;border-radius:4px;overflow:hidden;display:flex;background:#23272f}
.splitbar i,.stackbar i{display:block;height:100%}
.condrow{display:flex;align-items:baseline;gap:9px}
.condnum{font-family:var(--mono);font-weight:700;font-size:21px;line-height:1}
.meter{height:8px;border-radius:4px;background:#23272f;overflow:hidden}
.meter>i{display:block;height:100%;border-radius:4px}
.dist,.legend{font-family:var(--mono);font-size:10px;color:var(--muted)}
.legend{display:flex;flex-wrap:wrap;gap:9px}
.legend span b{color:var(--ink2);font-weight:600}
.dot{display:inline-block;width:7px;height:7px;border-radius:2px;margin-right:4px;vertical-align:middle}
.flagrow{display:flex;align-items:center;justify-content:space-between;font-family:var(--mono);font-size:11.5px;color:var(--muted)}
.flagrow .clay{color:var(--clay)}
.board{padding:16px 22px 80px;transition:margin-right .16s}
.findbar{display:flex;align-items:center;gap:9px;margin-bottom:14px;padding:0 11px;height:38px;background:var(--panel2);border:1px solid var(--line);border-radius:7px;color:var(--muted)}
.findbar:focus-within{border-color:var(--gold)}
.findbar input{flex:1;min-width:0;background:none;border:none;outline:none;color:var(--ink);font-size:13px;font-family:var(--sans)}
.findbar input::placeholder{color:var(--faint)}
.findbar .cnt{font-family:var(--mono);font-size:10.5px;color:var(--muted);white-space:nowrap;flex-shrink:0}
.findbar .clr{background:none;border:none;color:var(--muted);font-size:16px;line-height:1;cursor:pointer;padding:0 2px;flex-shrink:0}
.findbar .clr:hover{color:var(--ink)}
.nores{padding:26px 14px;text-align:center;font-family:var(--mono);font-size:12px;color:var(--muted);border:1px dashed var(--line2);border-radius:7px;margin-bottom:16px}
.grp{margin-bottom:16px;border:1px solid var(--line);border-radius:7px;overflow:hidden;background:var(--panel)}
.ghead{display:flex;align-items:center;justify-content:space-between;padding:13px 13px;min-height:48px;border-bottom:1px solid var(--line);cursor:pointer;border-left:3px solid var(--muted);touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.ghead:hover{background:rgba(255,255,255,.02)}
.ghead .gt{font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink2);font-weight:600}
.ghead .gr{font-family:var(--mono);font-size:11px;color:var(--muted)}
.ghead .gr b{color:var(--ink)}
.grp-body{overflow-x:auto}
.colhead,.row{display:grid;grid-template-columns:16px 44px 148px 1fr 78px 78px 34px 88px 122px 56px 16px;gap:10px;align-items:center;padding:8px 13px;min-width:700px}
.colhead{padding:7px 13px;border-bottom:1px solid var(--line)}
.colhead span{font-family:var(--mono);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--faint)}
.row{border-bottom:1px solid rgba(35,39,47,.55);cursor:pointer;transition:background .1s}
.row:last-child{border-bottom:none}
.row:hover{background:var(--panel2)}
.row.active{background:rgba(227,170,90,.07);box-shadow:inset 2px 0 0 var(--gold)}
.row.dim{opacity:.5}
.hnd{color:var(--faint);font-size:12px;cursor:grab;user-select:none}
.hnd:active{cursor:grabbing}
.row.drag-over{background:rgba(227,170,90,.1)!important;box-shadow:inset 2px 0 0 var(--gold),inset 0 2px 0 rgba(227,170,90,.25)}
.grp.drag-target>.ghead{background:rgba(227,170,90,.06)}
.sc{font-family:var(--mono);font-weight:600;font-size:11px;padding:2px 0;border-radius:4px;text-align:center;display:block}
.sc.lo{color:#e8a3a3;background:rgba(208,112,80,.16);border:1px solid rgba(208,112,80,.4)}
.sc.mid{color:var(--amber);background:rgba(225,169,63,.13);border:1px solid rgba(225,169,63,.35)}
.sc.hi{color:#8fce9c;background:rgba(95,174,110,.13);border:1px solid rgba(95,174,110,.35)}
/* An unscored item is an absence, not a state — a bordered box around a dash
   reads as a value and adds a rectangle to every row that has no score. */
.sc.na{color:var(--faint);background:none;border:1px solid transparent}
.idn .it{font-weight:600;color:var(--ink);font-size:12.5px;display:flex;align-items:center;flex-wrap:wrap;gap:3px 0;min-width:0;white-space:nowrap}
.idn .itname{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:56px}
.idn .it>.spill,.idn .it>.qchip,.idn .it>.ddot{flex-shrink:0}
.idn .it>.spill:first-of-type{margin-left:5px}
.idn .ar{font-family:var(--mono);font-size:9px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted)}
.ddot{color:var(--clay);font-size:9px;margin-left:5px}
.fnd{color:var(--ink2);font-size:12px;line-height:1.4;overflow:hidden}
.fnd-txt{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.fnd .wd{display:block;color:var(--muted);font-size:11px;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* Components recede so the total reads as the number on the row; the split is
   still there when you look for it, but it no longer competes. */
.num{font-family:var(--mono);font-size:11.5px;color:var(--muted)}
.row:hover .num,.row.active .num{color:var(--ink2)}
.mut{font-family:var(--mono);font-size:11px;color:var(--faint)}
.tot-cell{font-family:var(--mono);font-weight:600;font-size:12.5px;color:var(--ink)}
.act-cell{font-family:var(--mono);font-size:10.5px;color:var(--teal);font-style:italic}
.none-cell{font-family:var(--mono);font-size:11.5px;color:var(--faint)}
.np-cell{font-family:var(--mono);font-size:12px;color:var(--amber)}
/* The type control sits on every row, so at rest it states the current type
   quietly and hides the alternative — thirty solid gold blocks were the
   loudest thing on the page and none of it was data. Touching or hovering the
   row promotes it back to a full segmented control you can act on. */
.seg{display:inline-flex;border:1px solid transparent;border-radius:5px;overflow:hidden;transition:border-color .1s}
.seg b{font-family:var(--mono);font-size:11px;padding:8px 10px;min-height:36px;color:var(--muted);font-weight:500;cursor:pointer;user-select:none;border:none;background:none;display:flex;align-items:center;touch-action:manipulation;-webkit-tap-highlight-color:transparent;transition:opacity .1s,color .1s,background .1s}
.seg b:hover{background:rgba(255,255,255,.05);color:var(--ink2)}
.seg b:not(.on){opacity:0}
.seg b.on{color:var(--gold);background:rgba(227,170,90,.12);font-weight:600}
.seg b.on.t{background:rgba(77,217,192,.12);color:var(--teal)}
.seg b.on.n{background:rgba(148,152,170,.10);color:var(--ink2)}
.row:hover .seg,.row.active .seg,.row:focus-within .seg{border-color:var(--line2)}
.row:hover .seg b:not(.on),.row.active .seg b:not(.on),
.row:focus-within .seg b:not(.on),.seg b:focus-visible{opacity:1}
.row:hover .seg b.on,.row.active .seg b.on{color:#231a0a;background:var(--gold)}
.row:hover .seg b.on.t,.row.active .seg b.on.t{background:var(--teal);color:#0a1f1b}
.row:hover .seg b.on.n,.row.active .seg b.on.n{background:#3a3f4b;color:var(--ink2)}
/* Coarse pointers get no hover, so the control stays fully visible there. */
@media (hover:none){
  .seg{border-color:var(--line2)}
  .seg b:not(.on){opacity:1}
  .seg b.on{color:#231a0a;background:var(--gold)}
  .seg b.on.t{background:var(--teal);color:#0a1f1b}
  .seg b.on.n{background:#3a3f4b;color:var(--ink2)}
}
.med{display:flex;align-items:center;gap:1px;flex-wrap:wrap}
.med .ms{font-family:var(--mono);font-size:10px;color:var(--muted);margin-right:6px}
/* Affordances, not content. Twenty-seven dashed "+ add" boxes and a ⋯ on every
   row were furniture the eye had to step over on the way to the finding; they
   come back the moment the pointer is on the row that could use them. */
.add-med{font-family:var(--mono);font-size:9.5px;color:var(--faint);border:1px dashed var(--line2);border-radius:4px;padding:4px 6px;cursor:pointer;opacity:0;transition:opacity .1s}
.add-med:hover{border-color:var(--muted);color:var(--muted)}
.kb{color:var(--faint);text-align:center;font-size:12px;opacity:0;transition:opacity .1s}
.row:hover .add-med,.row.active .add-med,.row:hover .kb,.row.active .kb,
.row:focus-within .add-med,.row:focus-within .kb,
.add-med:focus-visible,.kb:focus-visible{opacity:1}
@media (hover:none){.add-med,.kb{opacity:1}}
.addrow{padding:12px 13px;min-height:44px;font-family:var(--mono);font-size:12px;color:var(--muted);border-top:1px solid var(--line);cursor:pointer;display:flex;align-items:center;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.addrow:hover{color:var(--ink2);background:rgba(255,255,255,.02)}
.dwr{position:fixed;top:0;right:0;height:100%;width:min(412px,100vw);background:var(--panel);border-left:1px solid var(--line2);z-index:9;display:flex;flex-direction:column;transform:translateX(100%);transition:transform .16s}
.dwr.show{transform:none;box-shadow:-24px 0 60px rgba(0,0,0,.45)}
.dh{display:flex;align-items:flex-start;justify-content:space-between;padding:15px 18px;border-bottom:1px solid var(--line);flex-shrink:0}
.dh .ey-area{font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.dh .it{font-weight:600;font-size:16px;margin-top:3px;color:var(--ink)}
.dh .cnt{font-family:var(--mono);font-size:10px;color:var(--faint);margin-top:5px}
.dnav{display:flex;align-items:center;gap:6px;flex-shrink:0}
.ic{width:44px;height:44px;border:1px solid var(--line2);border-radius:5px;display:grid;place-items:center;color:var(--ink2);cursor:pointer;font-size:15px;background:none;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.ic:hover{background:rgba(255,255,255,.06);color:var(--ink)}
.ic:disabled{opacity:.3;cursor:default}
.db{padding:15px 18px;overflow-y:auto;flex:1}
.sec{margin-bottom:15px}
.sec>.ey{margin-bottom:7px;display:block}
.gal{display:flex;gap:8px;flex-wrap:wrap}
.gal .g{position:relative;width:80px;height:60px;border-radius:5px;background:#2a2f3a;border:1px solid var(--line2);overflow:hidden;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:18px;color:rgba(255,255,255,.4)}
.gal .g img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block;z-index:1}
.gal .g .bd{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;filter:blur(10px) brightness(0.45);transform:scale(1.1);z-index:0}
.gadd{width:60px;height:60px;border:1px dashed var(--line2);border-radius:5px;display:grid;place-items:center;color:var(--faint);font-family:var(--mono);font-size:10px;cursor:pointer;flex-shrink:0}
.gadd:hover{border-color:var(--muted);color:var(--muted)}
.fld{background:var(--panel2);border:1px solid var(--line);border-radius:5px;padding:10px 12px;color:var(--ink2);font-size:16px;line-height:1.5;min-height:44px}
.fld-ta{background:var(--panel2);border:1px solid var(--line);border-radius:5px;padding:10px 12px;color:var(--ink2);font-size:16px;line-height:1.5;width:100%;resize:vertical;outline:none;font-family:var(--sans);min-height:60px;transition:border-color .15s}
.fld-ta:focus{border-color:var(--gold)}
.crow{display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--line)}
.crow:last-child{border-bottom:none}
.crow .lbl{color:var(--muted);font-size:12px}
.crow .val{font-family:var(--mono);font-size:12.5px;color:var(--ink2)}
.crow .inp{background:var(--panel2);border:1px solid var(--line);border-radius:5px;padding:10px 10px;color:var(--ink);font-family:var(--mono);font-size:16px;width:110px;text-align:right;outline:none;transition:border-color .15s;min-height:44px}
.crow .inp:focus{border-color:var(--gold)}
.matpick{display:flex;align-items:center;gap:8px;background:var(--panel2);border:1px solid var(--line2);border-radius:5px;padding:8px 10px;cursor:pointer;transition:border-color .15s}
.matpick:hover{border-color:var(--gold)}
.matpick .fx{font-family:var(--mono);font-size:9.5px;color:var(--muted);flex-shrink:0}
.matpick .nm{font-size:12px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ink2)}
.matpick .pr{margin-left:auto;font-family:var(--mono);font-size:12px;color:var(--gold);flex-shrink:0}
.mat-search{background:var(--panel2);border:1px solid var(--line2);border-radius:5px;padding:8px 10px;color:var(--ink2);font-family:var(--mono);font-size:12px;width:100%;outline:none;margin-bottom:5px;transition:border-color .15s}
.mat-search:focus{border-color:var(--gold)}
.mat-results{background:var(--panel2);border:1px solid var(--line);border-radius:5px;max-height:180px;overflow-y:auto;margin-bottom:8px}
.mat-opt{padding:7px 10px;cursor:pointer;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;gap:8px}
.mat-opt:last-child{border-bottom:none}
.mat-opt:hover{background:rgba(255,255,255,.04)}
.mat-opt .mo-nm{font-size:12px;color:var(--ink2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mat-opt .mo-fx{font-family:var(--mono);font-size:9px;color:var(--muted)}
.mat-opt .mo-pr{font-family:var(--mono);font-size:12px;color:var(--gold);flex-shrink:0}
.tot2{display:flex;align-items:center;justify-content:space-between;margin-top:10px;padding-top:10px;border-top:1px solid var(--line2)}
.tot2 .v{font-family:var(--mono);font-weight:700;font-size:18px;color:var(--gold)}
.tg{display:flex;align-items:center;justify-content:space-between}
.sw{width:38px;height:21px;border-radius:11px;background:#2a2f3a;border:1px solid var(--line2);position:relative;cursor:pointer;flex-shrink:0;transition:background .12s;display:inline-block}
.sw::after{content:'';position:absolute;width:15px;height:15px;border-radius:50%;background:var(--muted);top:2px;left:2px;transition:left .12s,background .12s}
.sw.on{background:rgba(227,170,90,.35);border-color:var(--gold)}
.sw.on::after{left:20px;background:var(--gold)}
.cbar{height:6px;border-radius:3px;background:#23272f;overflow:hidden;margin-top:9px}
.cbar>i{display:block;height:100%;border-radius:3px}
.avl{font-family:var(--mono);font-size:11px;padding:3px 9px;border-radius:5px;border:1px solid var(--line2);color:var(--muted)}
.avl.ok{color:#8fce9c;border-color:rgba(95,174,110,.4)}
.avl.proc{color:var(--amber);border-color:rgba(225,169,63,.4)}
.margin-val{color:#8fce9c}
.hist{font-family:var(--mono);font-size:11px;color:var(--muted);line-height:1.8}
.disp-box{border:1px solid rgba(208,112,80,.4);border-radius:6px;background:rgba(208,112,80,.07);padding:11px}
.disp-box .who{font-family:var(--mono);font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--clay)}
.disp-box .msg{font-size:12px;color:var(--ink2);margin:6px 0}
.hint{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:20;font-family:var(--mono);font-size:11px;color:var(--ink2);background:rgba(20,22,28,.95);border:1px solid var(--line2);border-radius:6px;padding:7px 13px;white-space:nowrap;pointer-events:none}
.hint kbd{font-family:var(--mono);font-size:10px;color:var(--gold);border:1px solid var(--line2);border-radius:3px;padding:0 4px;margin:0 1px}
.drw-scrim{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:8;display:none}
.notes-bar{padding:10px 22px;border-bottom:1px solid var(--line);background:var(--panel);display:flex;align-items:flex-start;gap:10px}
.ctx-menu{position:fixed;background:var(--panel);border:1px solid var(--line2);border-radius:7px;box-shadow:0 8px 32px rgba(0,0,0,.5);z-index:600;min-width:140px;overflow:hidden}
.ctx-item{display:block;width:100%;padding:9px 13px;background:none;border:none;cursor:pointer;font-size:12px;text-align:left;font-family:var(--sans);color:var(--ink2)}
.ctx-item:hover{background:rgba(255,255,255,.06)}
@media(max-width:1100px){
  .drw-scrim{display:block}
  .board,.dash{margin-right:0!important}
}
/* Phone. The dashboard was a fixed 4-column grid that could not shrink below
   516px, pushing the whole page 126px sideways; the item table already scrolls
   inside .grp-body, so this is what was breaking it. The hint bar goes too —
   it lists keyboard shortcuts on a device with no keyboard, and it sat on top
   of the last row. */
@media(max-width:640px){
  .cmd{flex-wrap:wrap;height:auto;padding:9px 12px;gap:8px}
  .dash{grid-template-columns:1fr 1fr;gap:8px;padding:10px 12px}
  .board{padding:12px 12px 28px}
  .card{padding:10px 11px;gap:7px}
  .big,.condnum{font-size:19px}
  .flagrow{flex-wrap:wrap;justify-content:flex-start;gap:3px 12px}
  .legend{gap:6px 10px}
  .hint{display:none}
  /* Six action buttons in one non-wrapping row pushed the page 49px sideways.
     .cmd already wraps; .acts is the row inside it that did not. */
  .acts{flex-wrap:wrap;justify-content:flex-end;gap:6px;min-width:0}
  /* Full touch targets where there is no pointer to aim with. */
  .sfbtn{min-height:44px;padding:10px 14px}
}
@media(max-width:380px){
  .dash{grid-template-columns:1fr}
}
@keyframes lb-spin{to{transform:rotate(360deg)}}
.qchip{border:none;cursor:pointer;padding:0 6px;border-radius:4px;font-family:var(--mono);font-size:9px;font-weight:700;letter-spacing:.04em;margin-left:5px;height:17px;display:inline-flex;align-items:center;vertical-align:middle;line-height:1;white-space:nowrap}
.qchip-open{background:rgba(240,160,80,.18);color:#f0a050}
.qchip-done{background:rgba(95,174,110,.13);color:#5fae6e}
.qchip-approved{background:rgba(77,217,192,.13);color:#4dd9c0}
.spill{border:none;padding:0 7px;border-radius:4px;font-family:var(--mono);font-size:9px;font-weight:700;letter-spacing:.04em;margin-left:5px;height:17px;display:inline-flex;align-items:center;vertical-align:middle;line-height:1;white-space:nowrap;cursor:pointer}
/* Approved is the outcome we want, so it annotates rather than badges — a
   wall of thirty green chips carries no more information than one and drowns
   the two rows that actually need attention. Disputed keeps its chip. */
.spill-approved{background:none;color:#5a8f66;padding:0 0 0 5px}
.row:hover .spill-approved,.row.active .spill-approved{color:#6fc47f}
.spill-disputed{background:rgba(224,92,106,.16);color:#e8697a}
.spill-pending{background:rgba(148,152,170,.12);color:#8d90a3}
.spill-excluded{background:rgba(148,152,170,.10);color:#7a7d8e}
/* Same logic on the edge stripe: the norm is a hairline, the exception is bold. */
.row.s-approved:not(.active){box-shadow:inset 2px 0 0 rgba(95,174,110,.45)}
.row.s-disputed:not(.active){box-shadow:inset 3px 0 0 var(--clay,#e05c6a)}
.sbar{display:flex;height:8px;border-radius:4px;overflow:hidden;background:var(--panel2);margin-top:2px}
.sbar i{display:block;height:100%}
.sbar i+i{box-shadow:inset 1px 0 0 var(--panel)}
.slegend{display:flex;gap:12px;flex-wrap:wrap;font-family:var(--mono);font-size:10.5px;margin-top:7px}
.ownerfoot{font-family:var(--mono);font-size:10px;color:var(--muted);margin-top:7px;line-height:1.5}
.slegend b{font-weight:700}
.sfilter{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
/* Status filters are a tab set, which is exactly what .tct + .is-on is for —
   same gold-floor selected state as every other segmented control in Pulse. */
.sfbtn{font-size:12px;padding:8px 12px;min-height:36px;white-space:nowrap;display:inline-flex;align-items:center}
.row.q-open:not(.active){box-shadow:inset 3px 0 0 var(--amber)}
.row.q-approved:not(.active){box-shadow:inset 3px 0 0 var(--good);background:rgba(95,174,110,.03)}
@keyframes q-pulse-once{0%,100%{box-shadow:inset 3px 0 0 var(--amber)}50%{box-shadow:inset 3px 0 0 rgba(225,169,63,.1);background:rgba(225,169,63,.06)}}
.row.q-new:not(.active){animation:q-pulse-once .7s ease 2}
.dwr-tabs{display:flex;border-bottom:1px solid var(--line);flex-shrink:0;background:var(--panel)}
.dwr-tab{padding:9px 14px;background:none;border:none;border-bottom:2px solid transparent;font-size:11px;font-family:var(--mono);cursor:pointer;color:var(--muted);transition:color .12s;display:flex;align-items:center;gap:5px;min-height:40px}
.dwr-tab.on{color:var(--gold);border-bottom-color:var(--gold)}
.dwr-tab-dot{width:6px;height:6px;border-radius:50%;background:#f0a050;display:inline-block}
`


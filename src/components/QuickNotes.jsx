import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const STORAGE_KEY  = pid => `flent_quick_notes_${pid}`
const hasSpeech    = !!(window.SpeechRecognition || window.webkitSpeechRecognition)
const LONG_PRESS_MS = 400

export default function QuickNotes({ pid }) {
  const [open, setOpen]           = useState(false)
  const [notes, setNotes]         = useState('')
  const [listening, setListening] = useState(false)
  const [interim, setInterim]     = useState('')   // live unconfirmed transcript
  const [noSpeech, setNoSpeech]   = useState(false)

  const [pos, setPos]  = useState(null)  // { x, y } once dragged, null = default CSS

  const textareaRef    = useRef(null)
  const panelRef       = useRef(null)
  const btnRef         = useRef(null)
  const ring1Ref       = useRef(null)    // inner amplitude ring
  const ring2Ref       = useRef(null)    // outer amplitude ring
  const recognRef      = useRef(null)    // active SpeechRecognition instance
  const shouldRunRef   = useRef(false)   // true while user wants transcription on
  const pressTimer     = useRef(null)    // long-press timeout
  const wasLongPress   = useRef(false)   // distinguish tap vs hold
  const drag           = useRef({ active: false, ox: 0, oy: 0, moved: false, startX: 0, startY: 0 })

  // ── Audio analyser (amplitude → visuals) ─────────────────────────────────
  const audioCtxRef    = useRef(null)
  const analyserRef    = useRef(null)
  const streamRef      = useRef(null)
  const rafRef         = useRef(null)
  const smoothAmp      = useRef(0)       // exponentially smoothed amplitude

  const startAnalyser = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      streamRef.current = stream
      const ctx = new AudioContext()
      audioCtxRef.current = ctx
      const src = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      analyser.smoothingTimeConstant = 0.6
      src.connect(analyser)
      analyserRef.current = analyser
      const buf = new Uint8Array(analyser.frequencyBinCount)

      function tick() {
        rafRef.current = requestAnimationFrame(tick)
        analyser.getByteTimeDomainData(buf)

        // RMS amplitude — 0 (silence) → ~0.6 (very loud)
        let sum = 0
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128
          sum += v * v
        }
        const rms = Math.sqrt(sum / buf.length)

        // Smooth: fast attack, slow release
        smoothAmp.current = rms > smoothAmp.current
          ? smoothAmp.current * 0.4 + rms * 0.6
          : smoothAmp.current * 0.85 + rms * 0.15

        // Normalise to 0–1 (typical speech peaks ~0.15–0.4 RMS)
        const amp = Math.min(smoothAmp.current / 0.35, 1)

        // Drive visuals directly — no React re-render needed
        if (btnRef.current) {
          const scale = 1 + amp * 0.10
          const glow  = amp * 32
          btnRef.current.style.transform = `scale(${scale.toFixed(3)})`
          btnRef.current.style.boxShadow =
            `0 0 ${(glow).toFixed(1)}px rgba(224,92,106,${(amp * 0.7).toFixed(2)}), ` +
            `0 4px 24px rgba(224,92,106,0.45)`
        }
        if (ring1Ref.current) {
          const s = 1 + amp * 0.55
          ring1Ref.current.style.transform = `scale(${s.toFixed(3)})`
          ring1Ref.current.style.opacity   = (amp * 0.65).toFixed(2)
        }
        if (ring2Ref.current) {
          const s = 1 + amp * 1.1
          ring2Ref.current.style.transform = `scale(${s.toFixed(3)})`
          ring2Ref.current.style.opacity   = (amp * 0.35).toFixed(2)
        }
      }
      tick()
    } catch (_) {
      // Mic permission already granted to SpeechRecognition; failure here is non-fatal
    }
  }, [])

  const stopAnalyser = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    analyserRef.current = null
    audioCtxRef.current?.close()
    audioCtxRef.current = null
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    smoothAmp.current = 0
    // reset button visuals
    if (btnRef.current) {
      btnRef.current.style.transform = ''
      btnRef.current.style.boxShadow = ''
    }
    if (ring1Ref.current) { ring1Ref.current.style.transform = ''; ring1Ref.current.style.opacity = '0' }
    if (ring2Ref.current) { ring2Ref.current.style.transform = ''; ring2Ref.current.style.opacity = '0' }
  }, [])

  // Load from localStorage on mount / pid change
  useEffect(() => {
    if (!pid) return
    const saved = localStorage.getItem(STORAGE_KEY(pid)) || ''
    setNotes(saved)
  }, [pid])

  // Persist on every change — localStorage + Supabase
  useEffect(() => {
    if (!pid) return
    localStorage.setItem(STORAGE_KEY(pid), notes)
    supabase
      .from('quick_notes')
      .upsert(
        { pid, note: notes, created_by: 'anonymous', updated_at: new Date().toISOString() },
        { onConflict: 'pid', ignoreDuplicates: false }
      )
      .then(() => {})
  }, [notes, pid])

  // Focus textarea when panel opens
  useEffect(() => {
    if (open) setTimeout(() => textareaRef.current?.focus(), 80)
  }, [open])

  // Transcription intentionally keeps running when panel is collapsed

  // Close panel on outside click
  useEffect(() => {
    function handleClick(e) {
      if (
        panelRef.current && !panelRef.current.contains(e.target) &&
        !e.target.closest('[data-quicknotes-trigger]')
      ) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // ── Speech recognition ────────────────────────────────────────────────────

  // Spawns one recognition session. On end, auto-restarts if shouldRunRef is
  // still true — this covers Chrome's ~60s timeout and iOS Safari's lack of
  // true continuous mode.
  const spawnSession = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR || !shouldRunRef.current) return

    const recog = new SR()
    recog.continuous     = true
    recog.interimResults = true
    recog.maxAlternatives = 1
    recog.lang           = 'en-IN'

    recog.onstart = () => {
      setListening(true)
      setNoSpeech(false)
    }

    recog.onresult = e => {
      let finalChunk  = ''
      let interimChunk = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) finalChunk  += t
        else                       interimChunk += t
      }
      if (finalChunk) {
        setNotes(prev => {
          const base = prev.replace(/\s+$/, '')
          // capitalise first word if appending to empty or after sentence-ending punctuation
          const cap = (!base || /[.!?]\s*$/.test(base))
            ? finalChunk.trim().replace(/^\w/, c => c.toUpperCase())
            : finalChunk.trim()
          return base + (base ? ' ' : '') + cap
        })
        setInterim('')
      } else {
        setInterim(interimChunk)
      }
    }

    recog.onerror = e => {
      if (e.error === 'no-speech') { setNoSpeech(true); return }  // don't stop — just flag
      if (e.error === 'aborted')   return                          // we called .stop() ourselves
      // network / not-allowed / hardware errors — stop completely
      shouldRunRef.current = false
      setListening(false)
      setInterim('')
    }

    recog.onend = () => {
      setInterim('')
      if (shouldRunRef.current) {
        // Brief gap before restarting — avoids rapid-fire on some browsers
        setTimeout(spawnSession, 150)
      } else {
        setListening(false)
      }
    }

    recognRef.current = recog
    try { recog.start() } catch (_) {}
  }, [])

  const startListening = useCallback(() => {
    if (shouldRunRef.current) return
    shouldRunRef.current = true
    spawnSession()
    startAnalyser()
  }, [spawnSession, startAnalyser])

  const stopListening = useCallback(() => {
    shouldRunRef.current = false
    recognRef.current?.stop()
    recognRef.current = null
    setListening(false)
    setInterim('')
    setNoSpeech(false)
    stopAnalyser()
  }, [stopAnalyser])

  function toggleListening() {
    if (listening) stopListening()
    else startListening()
  }

  // ── Keyboard helpers ──────────────────────────────────────────────────────

  const lineCount = notes.split('\n').filter(l => l.trim()).length

  function handleKeyDown(e) {
    const ta = textareaRef.current
    const { selectionStart, selectionEnd, value } = ta
    if (e.key === 'Enter') {
      const lineStart   = value.lastIndexOf('\n', selectionStart - 1) + 1
      const currentLine = value.slice(lineStart, selectionStart)
      const bulletMatch = currentLine.match(/^(\s*[•\-]\s)/)
      if (bulletMatch) {
        e.preventDefault()
        const bullet = bulletMatch[1]
        if (currentLine.trim() === bulletMatch[0].trim()) {
          const newVal = value.slice(0, lineStart) + '\n' + value.slice(selectionEnd)
          setNotes(newVal)
          setTimeout(() => { ta.selectionStart = ta.selectionEnd = lineStart + 1 }, 0)
        } else {
          const insert = '\n' + bullet
          const newVal = value.slice(0, selectionStart) + insert + value.slice(selectionEnd)
          setNotes(newVal)
          setTimeout(() => { ta.selectionStart = ta.selectionEnd = selectionStart + insert.length }, 0)
        }
      }
    }
  }

  function insertBullet() {
    const ta = textareaRef.current
    if (!ta) return
    const { selectionStart, selectionEnd, value } = ta
    const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1
    const lineText  = value.slice(lineStart, selectionStart)
    let newVal, cursor
    if (lineText.match(/^[•\-]\s/)) {
      newVal = value.slice(0, lineStart) + lineText.slice(2) + value.slice(lineStart + lineText.length)
      cursor = selectionStart - 2
    } else {
      newVal = value.slice(0, lineStart) + '• ' + value.slice(lineStart)
      cursor = selectionStart + 2
    }
    setNotes(newVal)
    setTimeout(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = Math.max(0, cursor) }, 0)
  }

  function clearNotes() {
    if (window.confirm('Clear all notes for this property?')) setNotes('')
  }

  // ── Drag / panel position helpers ─────────────────────────────────────────

  // Returns fixed-position style for the panel, anchored near the button.
  function getPanelStyle() {
    const BW = 48, PW = Math.min(340, window.innerWidth - 32), PH = 400
    const gap = 12
    if (!pos) return { bottom: 148, right: 16, left: 'auto', top: 'auto' }

    // Centre panel horizontally on button, clamp to viewport
    let left = Math.round(pos.x + BW / 2 - PW / 2)
    left = Math.max(8, Math.min(window.innerWidth - PW - 8, left))

    // Prefer above; fall back to below if too close to top
    const top = pos.y > PH + gap + 8
      ? Math.round(pos.y - PH - gap)
      : Math.round(pos.y + BW + gap)

    return { top, left, bottom: 'auto', right: 'auto' }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Floating trigger button — tap to open, hold to transcribe, drag to move */}
      <button
        ref={btnRef}
        data-quicknotes-trigger
        onPointerDown={e => {
          e.preventDefault()
          // initialise drag tracking
          const rect = btnRef.current.getBoundingClientRect()
          const curX = pos?.x ?? rect.left
          const curY = pos?.y ?? rect.top
          drag.current = {
            active: true, moved: false,
            startX: e.clientX, startY: e.clientY,
            ox: e.clientX - curX, oy: e.clientY - curY,
          }
          btnRef.current.setPointerCapture(e.pointerId)
          // long-press timer (only fires if we haven't dragged)
          wasLongPress.current = false
          pressTimer.current = setTimeout(() => {
            if (!drag.current.moved) {
              wasLongPress.current = true
              setOpen(true)
              if (hasSpeech) startListening()
            }
          }, LONG_PRESS_MS)
        }}
        onPointerMove={e => {
          if (!drag.current.active) return
          const dx = e.clientX - drag.current.startX
          const dy = e.clientY - drag.current.startY
          if (!drag.current.moved && Math.hypot(dx, dy) > 6) {
            drag.current.moved = true
            clearTimeout(pressTimer.current)   // cancel long-press
            wasLongPress.current = false
          }
          if (drag.current.moved) {
            const newX = e.clientX - drag.current.ox
            const newY = e.clientY - drag.current.oy
            setPos({
              x: Math.max(0, Math.min(window.innerWidth  - 48, newX)),
              y: Math.max(0, Math.min(window.innerHeight - 48, newY)),
            })
          }
        }}
        onPointerUp={e => {
          e.preventDefault()
          drag.current.active = false
          clearTimeout(pressTimer.current)
          if (drag.current.moved) return          // was a drag — do nothing else
          if (wasLongPress.current) stopListening()
          else setOpen(p => !p)
        }}
        onPointerCancel={() => {
          drag.current.active = false
          clearTimeout(pressTimer.current)
        }}
        style={{
          position: 'fixed',
          ...(pos
            ? { left: pos.x, top: pos.y, bottom: 'auto', right: 'auto' }
            : { bottom: 88, right: 20 }),
          width: 48, height: 48, borderRadius: '50%',
          background: listening
            ? '#e05c6a'
            : open ? 'var(--accent, #c8963e)' : 'var(--bg-panel, #1e2028)',
          border: `2px solid ${listening ? '#e05c6a' : open ? 'var(--accent, #c8963e)' : 'var(--border, #2e3040)'}`,
          boxShadow: listening
            ? '0 4px 24px rgba(224,92,106,0.5)'
            : open ? '0 4px 20px rgba(200,150,62,0.35)' : '0 4px 16px rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: drag.current?.moved ? 'grabbing' : 'pointer',
          zIndex: 120,
          transition: drag.current?.moved
            ? 'none'
            : 'background 0.2s, border-color 0.2s, box-shadow 0.2s',
          WebkitTapHighlightColor: 'transparent',
          userSelect: 'none', touchAction: 'none',
          flexShrink: 0,
        }}
        title="Tap to open · Hold to transcribe · Drag to move"
      >
        {/* Amplitude-driven rings — shown while recording */}
        {listening && (<>
          <span ref={ring1Ref} style={{
            position: 'absolute', inset: -3,
            borderRadius: '50%',
            border: '2px solid #e05c6a',
            opacity: 0, pointerEvents: 'none',
            willChange: 'transform, opacity',
          }} />
          <span ref={ring2Ref} style={{
            position: 'absolute', inset: -3,
            borderRadius: '50%',
            border: '1.5px solid #e05c6a',
            opacity: 0, pointerEvents: 'none',
            willChange: 'transform, opacity',
          }} />
        </>)}
        {listening ? (
          /* Mic icon — pulsing while recording */
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            style={{ color: '#fff', animation: 'micPulse 1s ease-in-out infinite' }}>
            <rect x="9" y="2" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="2"/>
            <path d="M5 10a7 7 0 0 0 14 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <line x1="12" y1="17" x2="12" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <line x1="8" y1="21" x2="16" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        ) : (
          /* Pencil / notes icon */
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            style={{ color: open ? '#fff' : 'var(--text-dim, #9394a8)', transition: 'color 0.2s' }}>
            <path d="M12 20h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
        {lineCount > 0 && !open && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            minWidth: 17, height: 17, borderRadius: 9,
            background: 'var(--accent, #c8963e)', color: '#fff',
            fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-mono, monospace)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 4px', border: '2px solid var(--bg, #16171f)',
          }}>
            {lineCount}
          </span>
        )}
      </button>

      {/* Notes panel — follows button position */}
      {open && (
        <div ref={panelRef} style={{
          position: 'fixed', ...getPanelStyle(),
          width: 'min(340px, calc(100vw - 32px))',
          background: 'var(--bg-panel, #1e2028)',
          border: '1px solid var(--border, #2e3040)',
          borderRadius: 14,
          boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
          zIndex: 120, display: 'flex', flexDirection: 'column',
          overflow: 'hidden', animation: 'fadeIn 0.15s ease',
        }}>

          {/* Panel header */}
          <div style={{
            padding: '12px 14px 10px', borderBottom: '1px solid var(--border, #2e3040)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '-0.2px' }}>
                Quick Notes
                {listening && (
                  <span style={{ marginLeft: 8, fontSize: 9, color: '#e05c6a', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    ● live
                  </span>
                )}
              </div>
              <div style={{ fontSize: 9, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', marginTop: 1 }}>
                PID{pid} · {lineCount} line{lineCount !== 1 ? 's' : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {notes.trim() && (
                <button onClick={clearNotes} style={btn.icon} title="Clear notes">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                    <polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              )}
              <button onClick={() => setOpen(false)} style={btn.icon} title="Close">
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                  <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Toolbar */}
          <div style={{
            padding: '7px 12px', borderBottom: '1px solid var(--border, #2e3040)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {/* Bullet list */}
            <button onClick={insertBullet} style={btn.tool} title="Toggle bullet point">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="2.5" cy="5" r="1.5" fill="currentColor"/>
                <circle cx="2.5" cy="11" r="1.5" fill="currentColor"/>
                <line x1="6" y1="5" x2="15" y2="5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                <line x1="6" y1="11" x2="15" y2="11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
            </button>

            <div style={{ width: 1, background: 'var(--border, #2e3040)', alignSelf: 'stretch', margin: '2px 2px' }} />

            {/* Transcribe button */}
            {hasSpeech ? (
              <button
                onClick={toggleListening}
                style={{
                  ...btn.tool,
                  width: 'auto', paddingLeft: 10, paddingRight: 10, gap: 6,
                  display: 'flex', alignItems: 'center',
                  background: listening
                    ? 'rgba(224,92,106,0.15)'
                    : 'var(--bg-input, #252731)',
                  border: listening
                    ? '1px solid rgba(224,92,106,0.5)'
                    : '1px solid var(--border, #2e3040)',
                  color: listening ? '#e05c6a' : 'var(--text-dim, #9394a8)',
                  transition: 'all 0.2s',
                }}
                title={listening ? 'Stop transcribing' : 'Start live transcription'}
              >
                {/* Mic icon */}
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                  style={{ animation: listening ? 'micPulse 1.2s ease-in-out infinite' : 'none' }}>
                  <rect x="9" y="2" width="6" height="11" rx="3"
                    stroke="currentColor" strokeWidth="2"/>
                  <path d="M5 10a7 7 0 0 0 14 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="12" y1="17" x2="12" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="8" y1="21" x2="16" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                <span style={{ fontSize: 10, fontWeight: 600, fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.04em' }}>
                  {listening ? 'stop' : 'transcribe'}
                </span>
                {/* Pulsing dot when live */}
                {listening && (
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%', background: '#e05c6a',
                    animation: 'micPulse 1.2s ease-in-out infinite',
                  }} />
                )}
              </button>
            ) : (
              <span style={{ fontSize: 9, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', paddingLeft: 2 }}>
                transcription not supported in this browser
              </span>
            )}
          </div>

          {/* Interim transcript preview */}
          {interim && (
            <div style={{
              padding: '8px 16px',
              fontSize: 12, lineHeight: 1.6,
              color: 'var(--text-muted, #6b6d82)',
              fontFamily: 'var(--font-mono, monospace)',
              fontStyle: 'italic',
              borderBottom: '1px solid var(--border, #2e3040)',
              background: 'rgba(224,92,106,0.04)',
            }}>
              {interim}
              <span style={{ opacity: 0.4 }}>…</span>
            </div>
          )}

          {/* No-speech hint */}
          {noSpeech && !interim && (
            <div style={{
              padding: '6px 16px', fontSize: 10,
              color: 'var(--text-muted, #6b6d82)',
              fontFamily: 'var(--font-mono, monospace)',
              borderBottom: '1px solid var(--border, #2e3040)',
              background: 'rgba(200,150,62,0.04)',
            }}>
              No speech detected — speak clearly near the mic
            </div>
          )}

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={'Start typing — or tap Transcribe to speak\n\nTip: Click • for a bullet list'}
            style={{
              flex: 1, minHeight: 200, maxHeight: 280,
              padding: '14px 16px',
              background: 'transparent', border: 'none', outline: 'none',
              resize: 'none', fontSize: 13, lineHeight: 1.7,
              color: 'var(--text, #e8e8f0)',
              fontFamily: 'var(--font-mono, monospace)',
              caretColor: 'var(--accent, #c8963e)',
            }}
          />

          {/* Footer */}
          <div style={{
            padding: '8px 14px', borderTop: '1px solid var(--border, #2e3040)',
            fontSize: 9, color: 'var(--text-muted, #6b6d82)',
            fontFamily: 'var(--font-mono, monospace)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>{listening ? '🎙 transcribing…' : 'auto-saved locally'}</span>
            <span>{notes.length} chars</span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes micPulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.5; }
        }
      `}</style>
    </>
  )
}

const btn = {
  icon: {
    width: 28, height: 28,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: '1px solid transparent',
    borderRadius: 6, color: 'var(--text-muted, #6b6d82)',
    cursor: 'pointer', transition: 'background 0.12s, color 0.12s',
  },
  tool: {
    height: 28, width: 28,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--bg-input, #252731)',
    border: '1px solid var(--border, #2e3040)',
    borderRadius: 5, color: 'var(--text-dim, #9394a8)',
    cursor: 'pointer', transition: 'background 0.12s, color 0.12s',
  },
}

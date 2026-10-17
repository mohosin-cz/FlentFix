import { useState, useRef, useCallback, useEffect } from 'react'

// Speech-to-text for the notepad, lifted out of the inspection QuickNotes so
// every page's pen dictates the same way.
//
// One recognition session at a time; when the browser ends it (Chrome stops
// after ~60s, iOS Safari has no real continuous mode) it restarts on its own
// while dictation is still wanted. The mic level drives the pen's rings
// directly through refs — no re-render per animation frame.

export const hasSpeech = typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition)

export function useDictation(onFinal) {
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [noSpeech, setNoSpeech] = useState(false)

  const btnRef = useRef(null)
  const ring1Ref = useRef(null)
  const ring2Ref = useRef(null)
  const recognRef = useRef(null)
  const shouldRunRef = useRef(false)
  const onFinalRef = useRef(onFinal)
  useEffect(() => { onFinalRef.current = onFinal }, [onFinal])

  const audioCtxRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef = useRef(null)
  const smoothAmp = useRef(0)

  const startAnalyser = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      streamRef.current = stream
      const ctx = new AudioContext()
      audioCtxRef.current = ctx
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      analyser.smoothingTimeConstant = 0.6
      ctx.createMediaStreamSource(stream).connect(analyser)
      const buf = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        rafRef.current = requestAnimationFrame(tick)
        analyser.getByteTimeDomainData(buf)
        let sum = 0
        for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v }
        const rms = Math.sqrt(sum / buf.length)
        smoothAmp.current = rms > smoothAmp.current ? smoothAmp.current * 0.4 + rms * 0.6 : smoothAmp.current * 0.85 + rms * 0.15
        const amp = Math.min(smoothAmp.current / 0.35, 1)
        if (btnRef.current) {
          btnRef.current.style.transform = `scale(${(1 + amp * 0.1).toFixed(3)})`
          btnRef.current.style.boxShadow = `0 0 ${(amp * 32).toFixed(1)}px rgba(176,100,91,${(amp * 0.7).toFixed(2)}), 0 4px 24px rgba(176,100,91,0.45)`
        }
        if (ring1Ref.current) { ring1Ref.current.style.transform = `scale(${(1 + amp * 0.55).toFixed(3)})`; ring1Ref.current.style.opacity = (amp * 0.65).toFixed(2) }
        if (ring2Ref.current) { ring2Ref.current.style.transform = `scale(${(1 + amp * 1.1).toFixed(3)})`; ring2Ref.current.style.opacity = (amp * 0.35).toFixed(2) }
      }
      tick()
    } catch { /* the level meter is decoration; dictation still works without it */ }
  }, [])

  const stopAnalyser = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    audioCtxRef.current?.close()
    audioCtxRef.current = null
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    smoothAmp.current = 0
    if (btnRef.current) { btnRef.current.style.transform = ''; btnRef.current.style.boxShadow = '' }
    if (ring1Ref.current) { ring1Ref.current.style.transform = ''; ring1Ref.current.style.opacity = '0' }
    if (ring2Ref.current) { ring2Ref.current.style.transform = ''; ring2Ref.current.style.opacity = '0' }
  }, [])

  const spawnRef = useRef(null)
  const spawn = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR || !shouldRunRef.current) return
    const recog = new SR()
    recog.continuous = true
    recog.interimResults = true
    recog.maxAlternatives = 1
    recog.lang = 'en-IN'
    recog.onstart = () => { setListening(true); setNoSpeech(false) }
    recog.onresult = e => {
      let fin = '', mid = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) fin += t; else mid += t
      }
      if (fin) { onFinalRef.current?.(fin.trim()); setInterim('') } else setInterim(mid)
    }
    recog.onerror = e => {
      if (e.error === 'no-speech') { setNoSpeech(true); return }
      if (e.error === 'aborted') return
      shouldRunRef.current = false
      setListening(false); setInterim('')
    }
    recog.onend = () => {
      setInterim('')
      if (shouldRunRef.current) setTimeout(() => spawnRef.current?.(), 150)
      else setListening(false)
    }
    recognRef.current = recog
    try { recog.start() } catch { /* already running */ }
  }, [])
  useEffect(() => { spawnRef.current = spawn }, [spawn])

  const start = useCallback(() => {
    if (shouldRunRef.current || !hasSpeech) return
    shouldRunRef.current = true
    spawn(); startAnalyser()
  }, [spawn, startAnalyser])

  const stop = useCallback(() => {
    shouldRunRef.current = false
    recognRef.current?.stop()
    recognRef.current = null
    setListening(false); setInterim(''); setNoSpeech(false)
    stopAnalyser()
  }, [stopAnalyser])

  useEffect(() => () => { shouldRunRef.current = false; recognRef.current?.stop(); stopAnalyser() }, [stopAnalyser])

  return { listening, interim, noSpeech, start, stop, btnRef, ring1Ref, ring2Ref }
}

// Append dictated text to a note. A new sentence, or the start of a line
// (after a bullet or a checkbox), gets a capital.
export function appendDictated(prev, chunk) {
  if (!chunk) return prev || ''
  const capital = chunk.replace(/^\w/, c => c.toUpperCase())
  if (!prev) return capital
  const lastLine = prev.split('\n').pop()
  const fresh = /^[\s•☐☑-]*$/.test(lastLine) || /[.!?]\s*$/.test(prev)
  return prev + (/\s$/.test(prev) ? '' : ' ') + (fresh ? capital : chunk)
}

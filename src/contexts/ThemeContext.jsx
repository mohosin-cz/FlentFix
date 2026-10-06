import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import { THEME_KEY, storedPreference, savePreference, resolveTheme, watchSystemTheme, applyTheme } from '../utils/theme'

// Dark or light, chosen once and remembered.
//
// Three settings, not two: "system" is the one most people actually want —
// the phone is already set to go dark in the evening, and the app should go
// with it. Dark and light pin it regardless.
//
// The preference lives in localStorage rather than the database, because it
// describes this screen and not this person: the same account at a desk and on
// site wants different answers, and a display setting that needs a round trip
// to be read is a display setting that shows the wrong one first.

const ThemeCtx = createContext({ preference: 'system', theme: 'dark', setPreference: () => {} })

export function ThemeProvider({ children }) {
  const [preference, setPref] = useState(storedPreference)
  const [theme, setTheme] = useState(() => resolveTheme(storedPreference()))

  const commit = useCallback((p) => {
    setPref(p)
    const t = resolveTheme(p)
    setTheme(t)
    applyTheme(t)
  }, [])

  const setPreference = useCallback((p) => commit(savePreference(p)), [commit])

  // Follow the system while the preference is "system" — and only then, so a
  // pinned choice is not quietly overridden when the laptop dims at sunset.
  useEffect(() => {
    if (preference !== 'system') return
    return watchSystemTheme(() => { const t = resolveTheme('system'); setTheme(t); applyTheme(t) })
  }, [preference])

  // Another tab changing the setting changes this one too.
  useEffect(() => {
    const onStorage = (e) => { if (e.key === THEME_KEY) commit(storedPreference()) }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [commit])

  const value = useMemo(() => ({ preference, theme, setPreference }), [preference, theme, setPreference])
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>
}

export function useTheme() { return useContext(ThemeCtx) }

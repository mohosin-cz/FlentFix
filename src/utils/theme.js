// Reading and applying the appearance setting. Deliberately free of React, so
// the boot script in index.html, the provider and anything else all agree on
// what the setting means without one importing the other.

export const THEME_KEY = 'pulse-theme'
export const THEMES = ['system', 'dark', 'light']

const mql = () => (typeof window !== 'undefined' && window.matchMedia)
  ? window.matchMedia('(prefers-color-scheme: light)')
  : null

export function storedPreference() {
  try {
    const v = localStorage.getItem(THEME_KEY)
    return THEMES.includes(v) ? v : 'system'
  } catch { return 'system' }
}

export function savePreference(p) {
  const next = THEMES.includes(p) ? p : 'system'
  try { localStorage.setItem(THEME_KEY, next) } catch { /* private mode: this session only */ }
  return next
}

// What "system" currently means. Dark is the fallback everywhere — it is what
// the app has always been, so anything unknown lands on the familiar one.
export function resolveTheme(pref) {
  if (pref === 'light' || pref === 'dark') return pref
  return mql()?.matches ? 'light' : 'dark'
}

export function watchSystemTheme(onChange) {
  const m = mql()
  if (!m) return () => {}
  m.addEventListener('change', onChange)
  return () => m.removeEventListener('change', onChange)
}

// Applied to <html>, where [data-theme] in theme.css redefines every token.
// The browser chrome moves with it: <meta name="theme-color"> paints the iOS
// status bar and the Android address bar, and #root carries a background in
// index.html so the page has a colour before any CSS arrives — left behind,
// a light theme sits on a dark page through every refresh.
export function applyTheme(theme) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = theme
  const chrome = theme === 'light' ? '#fcfbf7' : '#16171f'
  document.documentElement.style.setProperty('--boot-bg', chrome)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', chrome)
}

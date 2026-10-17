import { createContext, useContext, useEffect, useState } from 'react'

// Which PID the page in front of you is about. Property pages carry it in the
// URL; inspection pages carry it in router state, so they say so themselves
// with useNotepadPid(pid). The notepad reads it to start new notes against
// that PID and to show the PID's shared team note.

const Ctx = createContext({ pagePid: null, setPagePid: () => {} })

export function NotepadProvider({ children }) {
  const [pagePid, setPagePid] = useState(null)
  return <Ctx.Provider value={{ pagePid, setPagePid }}>{children}</Ctx.Provider>
}

export function useNotepadContext() { return useContext(Ctx) }

export function useNotepadPid(pid) {
  const { setPagePid } = useContext(Ctx)
  useEffect(() => {
    if (!pid) return undefined
    setPagePid(String(pid))
    return () => setPagePid(p => (p === String(pid) ? null : p))
  }, [pid, setPagePid])
}

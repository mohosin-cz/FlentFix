import { useNotepadPid } from './notepad/NotepadContext'

// The inspection notepad now lives in the Pulse-wide pen (components/notepad).
// Inspection pages keep rendering <QuickNotes pid={pid} /> — all it does now is
// tell the pen which PID this page is about, so the PID's team note (the same
// quick_notes row as before) and new PID notes are right there.
export default function QuickNotes({ pid }) {
  useNotepadPid(pid)
  return null
}

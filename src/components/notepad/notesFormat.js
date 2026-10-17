// What a note looks like once it leaves Pulse: a title, one line saying when,
// who and what it is about, then the body — bullets as bullets, checkboxes as
// checkboxes. Written to the clipboard twice: as HTML (Slack, Docs, email keep
// the list) and as plain text (WhatsApp, SMS).

export function noteTitle(n) {
  const t = (n.title || '').trim()
  if (t) return t
  const first = (n.body || '').split('\n').map(l => l.replace(/^[\s•☐☑-]+/, '').trim()).find(Boolean)
  return first ? (first.length > 60 ? first.slice(0, 57) + '…' : first) : 'Untitled'
}

export function scopeLabel(pid, names = {}) {
  if (!pid) return 'General'
  return names[pid] ? `PID ${pid} · ${names[pid]}` : `PID ${pid}`
}

function when(ts) {
  return new Date(ts || Date.now()).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function lineKind(l) {
  if (/^\s*☐/.test(l)) return 'todo'
  if (/^\s*☑/.test(l)) return 'done'
  if (/^\s*[•-]\s/.test(l)) return 'bullet'
  return 'text'
}
const strip = l => l.replace(/^\s*[•☐☑-]\s?/, '').trim()
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function notePlain(n, { author, names } = {}) {
  const meta = [when(n.updated_at), author, scopeLabel(n.pid, names)].filter(Boolean).join(' · ')
  const body = (n.body || '').split('\n').map(l => {
    const k = lineKind(l)
    if (k === 'bullet') return `• ${strip(l)}`
    if (k === 'todo') return `☐ ${strip(l)}`
    if (k === 'done') return `☑ ${strip(l)}`
    return l.trimEnd()
  }).join('\n').replace(/\n{3,}/g, '\n\n').trim()
  return `${noteTitle(n)}\n${meta}\n\n${body}`.trim()
}

export function noteHtml(n, { author, names } = {}) {
  const meta = [when(n.updated_at), author, scopeLabel(n.pid, names)].filter(Boolean).join(' · ')
  const out = []
  let list = null
  const flush = () => { if (list) { out.push(`<ul>${list.join('')}</ul>`); list = null } }
  for (const raw of (n.body || '').split('\n')) {
    const k = lineKind(raw)
    if (k === 'text') {
      flush()
      if (raw.trim()) out.push(`<p>${esc(raw.trim())}</p>`)
      continue
    }
    list = list || []
    const mark = k === 'todo' ? '☐ ' : k === 'done' ? '☑ ' : ''
    list.push(`<li${mark ? ' style="list-style:none"' : ''}>${mark}${esc(strip(raw))}</li>`)
  }
  flush()
  return `<div><b>${esc(noteTitle(n))}</b><br><span style="color:#6b7280">${esc(meta)}</span>${out.join('')}</div>`
}

// Several notes in one go (the list's "Copy all").
export function notesPlain(list, opts) { return list.map(n => notePlain(n, opts)).join('\n\n———\n\n') }
export function notesHtml(list, opts) { return list.map(n => noteHtml(n, opts)).join('<hr>') }

export async function copyRich(html, text) {
  try {
    if (window.ClipboardItem && navigator.clipboard?.write) {
      await navigator.clipboard.write([new window.ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      })])
      return true
    }
  } catch { /* fall through to plain text */ }
  try { await navigator.clipboard.writeText(text); return true } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'
    document.body.appendChild(ta); ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch { return false }
}

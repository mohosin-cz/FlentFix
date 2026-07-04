// Returns 'fixture' | 'service' for a line item.
// Used to gate proof-video requirement — only fixtures need it.
//
// Layer 1: structural signals (trade/section name) win outright.
// Layer 2: text patterns on corpus (name + finding + action).
// Layer 3: default to 'fixture' — over-asking for proof is the cheap failure mode.
// Tiebreak: if both pattern sets match, fixture wins.

const SVC_RE = /deep\s*clean|pest\s*control|per\s+s[qf]t|all\s+rooms|(full|whole|entire|complete)\s+(home|house|flat)/i

const FIX_RE = /broken|damaged|not\s+working|leaking|cracked|missing|worn|loose|jammed|stuck|noisy|faulty|dead|burnt|replace|repair|install|\bfix\b|realign|needs?\s+|\b(fan|door|wc|toilet|geyser|tap|shower|switch|socket|window|wardrobe|mirror|sink|flush|exhaust|drawer|hinge|lock|light|bulb|tube|fitting|pipe|valve|handle|knob|rail|rod|shelf|bracket)\b/i

export function classifyItemKind(name = '', finding = '', action = '', section = '', trade = '') {
  if (/clean/i.test(trade)) return 'service'
  if (/clean/i.test(section)) return 'service'
  if (/\b(basics?|whole[\s-]?home|full[\s-]?home)\b/i.test(section)) return 'service'

  const corpus = `${name} ${finding} ${action}`
  const isFix = FIX_RE.test(corpus)
  const isSvc = SVC_RE.test(corpus)

  if (isFix) return 'fixture'  // tiebreak: fixture wins over service
  if (isSvc) return 'service'
  return 'fixture'
}

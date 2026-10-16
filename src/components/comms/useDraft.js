import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { buildDraft } from './templates'

/**
 * useDraft(pid, threadCode, opts) → { loading, error, draft, ctx, reload }
 *
 * One comms_context() round trip per open. The hook is meant to live inside
 * the sheet, which mounts when it opens and unmounts when it closes, so the
 * fetch happens lazily and exactly once per opening. Pass { enabled: false }
 * to hold it (nothing is fetched until enabled flips true).
 *
 * The draft is memoised on the context, the code and the options, so edits
 * in the textarea never re-render the template underneath the person.
 *
 * opts: { enabled = true, sender, lang, origin, workOrderId }
 *   sender      first name of whoever is sending — goes in the sign-off
 *   lang        language key in templates.LANG; only 'en' exists today
 *   workOrderId pin a vendor template to one work order (default: picked by thread)
 */
export function useDraft(pid, threadCode, opts = {}) {
  const { enabled = true, sender, lang, origin, workOrderId } = opts
  const [state, setState] = useState({ loading: false, error: null, ctx: null })

  const load = useCallback(async () => {
    if (!pid) { setState({ loading: false, error: 'No property', ctx: null }); return }
    setState(s => ({ ...s, loading: true, error: null }))
    const { data, error } = await supabase.rpc('comms_context', { p_pid: pid })
    if (error) { setState(s => ({ ...s, loading: false, error: error.message })); return }
    // a pid that is deleted or unknown comes back with property: null
    if (!data || !data.property) { setState({ loading: false, error: `No live property with PID ${pid}`, ctx: null }); return }
    setState({ loading: false, error: null, ctx: data })
  }, [pid])

  useEffect(() => { if (enabled) load() }, [enabled, load])

  const draft = useMemo(
    () => (state.ctx ? buildDraft(state.ctx, threadCode, { sender, lang, origin, workOrderId }) : null),
    [state.ctx, threadCode, sender, lang, origin, workOrderId],
  )

  return { loading: state.loading, error: state.error, ctx: state.ctx, draft, reload: load }
}

export default useDraft

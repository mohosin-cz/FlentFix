import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// A client that never carries a signed-in session.
//
// The vendor-facing pages authenticate on their own terms — a work order token,
// a portal password exchanged for an attend_session — and are meant to reach
// the database as `anon`. But supabase-js attaches whatever session it finds in
// localStorage, and localStorage is per origin, so a staff member who has
// logged into Pulse and then opens the vendor portal sends their JWT with every
// vendor request. The same upload then arrives as `authenticated` instead of
// `anon` and is judged by different policies: vendor-avatars grants INSERT to
// anon only, so the photo upload fails with "new row violates row-level
// security policy" for staff and works for the vendor stood in front of them.
//
// A vendor page behaving differently depending on who else uses that browser is
// the actual defect. This client has no session to attach and cannot acquire
// one, so those requests are anon for everybody. It also means the storage
// policy does not have to be widened to let staff credentials write to a bucket
// that only vendors have any business writing to.
export const anonSupabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    // its own key, so it can never read the session the staff client wrote
    storageKey: 'flent-anon-no-session',
  },
})

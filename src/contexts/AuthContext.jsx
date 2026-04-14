import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = loading

  useEffect(() => {
    let mounted = true

    async function initSession() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!mounted) return

      if (session) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('status')
          .eq('id', session.user.id)
          .single()

        if (!mounted) return

        if (profile?.status !== 'approved') {
          await supabase.auth.signOut()
          setSession(null)
        } else {
          setSession(session)
        }
      } else {
        setSession(null)
      }
    }

    initSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setSession(session)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  return (
    <AuthContext.Provider value={{ session, loading: session === undefined }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

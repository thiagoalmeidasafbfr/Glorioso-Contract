import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase, USE_SUPABASE, type UserProfile } from '../lib/supabase'
import type { Session } from '@supabase/supabase-js'

interface AuthContextValue {
  session: Session | null
  profile: UserProfile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
  isMaster: boolean
}

const AuthContext = createContext<AuthContextValue>({
  session: null, profile: null, loading: true,
  signIn: async () => null, signOut: async () => {},
  isMaster: false,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(USE_SUPABASE)

  useEffect(() => {
    if (!USE_SUPABASE) return

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data as UserProfile | null)
    setLoading(false)
  }

  async function signIn(email: string, password: string): Promise<string | null> {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? error.message : null
  }

  async function signOut() {
    await supabase.auth.signOut()
    setProfile(null)
  }

  return (
    <AuthContext.Provider value={{
      session, profile, loading,
      signIn, signOut,
      isMaster: profile?.role === 'master',
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

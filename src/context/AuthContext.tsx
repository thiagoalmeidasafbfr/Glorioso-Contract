import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase, USE_SUPABASE, AUTH_LINK_TYPE, type UserProfile } from '../lib/supabase'
import { allows, FULL_ACCESS, parsePermissions, type AccessLevel, type ModuleKey, type Permissions } from '../lib/access'
import type { Session } from '@supabase/supabase-js'

// Sessão, perfil e PERMISSÕES do usuário logado.
// O perfil (tabela profiles) aponta para um perfil de acesso (access_roles),
// que dá a cada módulo 'none' | 'view' | 'edit' — ver lib/access.ts.
// No modo local (sem Supabase) não há login: acesso total.

interface AuthContextValue {
  session: Session | null
  profile: UserProfile | null
  /** Nome do perfil de acesso (ex.: "Jurídico"). */
  roleName: string | null
  permissions: Permissions
  loading: boolean
  /** Chegou por link de convite/redefinição: precisa definir a senha. */
  mustSetPassword: boolean
  passwordDefined: () => void
  signIn: (email: string, password: string) => Promise<string | null>
  sendPasswordReset: (email: string) => Promise<string | null>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  /** Pode abrir (level 'view') ou alterar (level 'edit') o módulo? */
  can: (module: ModuleKey, level?: Exclude<AccessLevel, 'none'>) => boolean
  isMaster: boolean
}

const LOCAL_ACCESS = {
  permissions: FULL_ACCESS,
  can: () => true,
}

const AuthContext = createContext<AuthContextValue>({
  session: null, profile: null, roleName: null, loading: true,
  mustSetPassword: false, passwordDefined: () => {},
  signIn: async () => null, sendPasswordReset: async () => null, signOut: async () => {},
  refreshProfile: async () => {},
  isMaster: false,
  ...LOCAL_ACCESS,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [roleName, setRoleName] = useState<string | null>(null)
  const [permissions, setPermissions] = useState<Permissions>({})
  const [loading, setLoading] = useState(USE_SUPABASE)
  const [mustSetPassword, setMustSetPassword] = useState(AUTH_LINK_TYPE === 'invite' || AUTH_LINK_TYPE === 'recovery')

  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
    const p = data as UserProfile | null
    setProfile(p)
    // Usuário desativado não lê access_roles (RLS) — fica sem permissões.
    if (p?.ativo) {
      const { data: role } = await supabase
        .from('access_roles')
        .select('nome, permissions')
        .eq('key', p.role)
        .maybeSingle()
      setRoleName((role?.nome as string | undefined) ?? p.role)
      setPermissions(parsePermissions(role?.permissions))
    } else {
      setRoleName(null)
      setPermissions({})
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!USE_SUPABASE) return

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setMustSetPassword(true)
      setSession(session)
      // Renovação de token não muda o perfil — evita recarregar a cada hora.
      if (event === 'TOKEN_REFRESHED') return
      if (session) fetchProfile(session.user.id)
      else { setProfile(null); setPermissions({}); setRoleName(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [fetchProfile])

  async function signIn(email: string, password: string): Promise<string | null> {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    // Entrou com senha: um link de convite/redefinição anterior (ex.: expirado) não vale mais.
    if (!error) setMustSetPassword(false)
    return error ? error.message : null
  }

  async function sendPasswordReset(email: string): Promise<string | null> {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
    return error ? error.message : null
  }

  async function signOut() {
    await supabase.auth.signOut()
    setProfile(null)
    setPermissions({})
    setRoleName(null)
  }

  async function refreshProfile() {
    if (session) await fetchProfile(session.user.id)
  }

  const access = USE_SUPABASE
    ? { permissions, can: (m: ModuleKey, level: Exclude<AccessLevel, 'none'> = 'view') => allows(permissions, m, level) }
    : LOCAL_ACCESS

  return (
    <AuthContext.Provider value={{
      session, profile, roleName, loading,
      mustSetPassword, passwordDefined: () => setMustSetPassword(false),
      signIn, sendPasswordReset, signOut, refreshProfile,
      isMaster: profile?.role === 'master',
      ...access,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext)
}

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { supabase, USE_SUPABASE, AUTH_LINK_TYPE, type UserProfile } from '../lib/supabase'
import { invalidateCache } from '../lib/queryCache'
import { allows, FULL_ACCESS, parsePermissions, type AccessLevel, type ModuleKey, type Permissions } from '../lib/access'
import type { Session } from '@supabase/supabase-js'

// Sessão, perfil e PERMISSÕES do usuário logado.
// O perfil (tabela profiles) aponta para um perfil de acesso (access_roles),
// que dá a cada módulo 'none' | 'view' | 'edit' — ver lib/access.ts.
// No modo local (sem Supabase) não há login: acesso total.
//
// Regra do supabase-js: NUNCA chamar o Supabase de dentro do callback de
// onAuthStateChange — o cliente segura um lock de autenticação durante o
// callback e a consulta fica esperando por ele para sempre (o app "travava"
// ao voltar para a aba). O perfil é carregado logo DEPOIS, via setTimeout.

interface AuthContextValue {
  session: Session | null
  profile: UserProfile | null
  /** Nome do perfil de acesso (ex.: "Jurídico"). */
  roleName: string | null
  permissions: Permissions
  loading: boolean
  /** Falha ao carregar o perfil (rede/servidor) — não confundir com acesso negado. */
  authError: string | null
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
  session: null, profile: null, roleName: null, loading: true, authError: null,
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
  const [authError, setAuthError] = useState<string | null>(null)
  // Usuário cujo perfil já está carregado: a aba voltar ao foco ou o token ser
  // renovado não precisa buscar o perfil de novo.
  const loadedUser = useRef<string | null>(null)
  const [mustSetPassword, setMustSetPassword] = useState(AUTH_LINK_TYPE === 'invite' || AUTH_LINK_TYPE === 'recovery')

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()
      if (error) throw error
      const p = data as UserProfile | null
      // Usuário desativado não lê access_roles (RLS) — fica sem permissões.
      let role: { nome?: string; permissions?: unknown } | null = null
      if (p?.ativo) {
        const res = await supabase
          .from('access_roles')
          .select('nome, permissions')
          .eq('key', p.role)
          .maybeSingle()
        if (res.error) throw res.error
        role = res.data
      }
      setProfile(p)
      setRoleName(p?.ativo ? (role?.nome ?? p.role) : null)
      setPermissions(p?.ativo ? parsePermissions(role?.permissions) : {})
      setAuthError(null)
    } catch (err) {
      loadedUser.current = null
      setAuthError(err instanceof Error ? err.message : String((err as { message?: unknown })?.message ?? err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!USE_SUPABASE) return

    // INITIAL_SESSION chega logo ao assinar — dispensa o getSession() que
    // antes buscava o perfil uma segunda vez na abertura do app.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setMustSetPassword(true)
      setSession(session)
      if (!session) {
        // Saiu: nada do que este usuário leu pode servir ao próximo.
        invalidateCache()
        loadedUser.current = null
        setProfile(null); setPermissions({}); setRoleName(null); setAuthError(null); setLoading(false)
        return
      }
      if (loadedUser.current === session.user.id && event !== 'USER_UPDATED') return
      if (loadedUser.current && loadedUser.current !== session.user.id) invalidateCache()
      loadedUser.current = session.user.id
      const userId = session.user.id
      setTimeout(() => { fetchProfile(userId) }, 0)
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
    invalidateCache()
    setProfile(null)
    setPermissions({})
    setRoleName(null)
  }

  async function refreshProfile() {
    if (!session) return
    loadedUser.current = session.user.id
    setLoading(true)
    await fetchProfile(session.user.id)
  }

  const access = USE_SUPABASE
    ? { permissions, can: (m: ModuleKey, level: Exclude<AccessLevel, 'none'> = 'view') => allows(permissions, m, level) }
    : LOCAL_ACCESS

  return (
    <AuthContext.Provider value={{
      session, profile, roleName, loading, authError,
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

import { createClient } from '@supabase/supabase-js'

export const USE_SUPABASE = import.meta.env.VITE_USE_SUPABASE === 'true'

// Links de convite e de redefinição de senha chegam com `#...&type=invite|recovery`.
// Lido ANTES de criar o cliente, que limpa o fragmento ao abrir a sessão.
export const AUTH_LINK_TYPE: string | null = typeof window === 'undefined'
  ? null
  : new URLSearchParams(window.location.hash.slice(1)).get('type')

// Only instantiate the client when Supabase is actually enabled.
// createClient throws if supabaseUrl is empty, so guard it here.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

export const supabase = USE_SUPABASE
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createClient('https://placeholder.supabase.co', 'placeholder-key')

/** Chave de um perfil de acesso (tabela access_roles): 'master', 'juridico',
 *  'financeiro', 'consulta' ou um perfil criado em "Usuários e acessos". */
export type UserRole = string

export interface UserProfile {
  id: string
  email: string
  nome: string | null
  role: UserRole
  ativo: boolean
  created_at?: string
  updated_at?: string
}

/** Perfil de acesso: nível por módulo (ver lib/access.ts). */
export interface AccessRole {
  key: string
  nome: string
  descricao: string | null
  permissions: Record<string, string>
  is_system: boolean
}

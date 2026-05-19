import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export const USE_SUPABASE = import.meta.env.VITE_USE_SUPABASE === 'true'

export type UserRole = 'master' | 'juridico'

export interface UserProfile {
  id: string
  email: string
  nome: string | null
  role: UserRole
  ativo: boolean
}

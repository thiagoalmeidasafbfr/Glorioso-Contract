import { createClient } from '@supabase/supabase-js'

export const USE_SUPABASE = import.meta.env.VITE_USE_SUPABASE === 'true'

// Only instantiate the client when Supabase is actually enabled.
// createClient throws if supabaseUrl is empty, so guard it here.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

export const supabase = USE_SUPABASE
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createClient('https://placeholder.supabase.co', 'placeholder-key')

export type UserRole = 'master' | 'juridico'

export interface UserProfile {
  id: string
  email: string
  nome: string | null
  role: UserRole
  ativo: boolean
}

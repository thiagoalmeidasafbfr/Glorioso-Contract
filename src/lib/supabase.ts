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

// ── fetch do cliente ─────────────────────────────────────────────────────────
// 1) Prazo: sem ele, uma conexão que morre no meio (Wi-Fi, notebook que
//    dormiu, aba em segundo plano) deixa a requisição pendurada para sempre e
//    a tela presa em "Carregando…" até o F5. Estourado o prazo, a chamada
//    falha e a tela mostra o aviso com "Tentar novamente". O erro é um
//    AbortError de propósito: o supabase-js repete sozinho (3×) leituras que
//    falham por rede, mas não as abortadas — sem isso uma conexão travada
//    levaria ~1,5 min para virar aviso.
// 2) Escritas (POST/PATCH/DELETE em /rest/v1/<tabela>) avisam os ouvintes —
//    o cache de consultas (lib/queryCache) se limpa por aqui.
const REQUEST_TIMEOUT_MS = 20_000
const writeListeners = new Set<(table: string) => void>()

/** Chamado depois de cada escrita bem-sucedida na API REST, com o nome da tabela. */
export function onDataWrite(fn: (table: string) => void): () => void {
  writeListeners.add(fn)
  return () => { writeListeners.delete(fn) }
}

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(new DOMException('Tempo de resposta esgotado', 'AbortError')), REQUEST_TIMEOUT_MS)
  const outer = init?.signal
  if (outer) {
    if (outer.aborted) ctrl.abort(outer.reason)
    else outer.addEventListener('abort', () => ctrl.abort(outer.reason), { once: true })
  }
  try {
    const res = await fetch(input, { ...init, signal: ctrl.signal })
    const method = (init?.method ?? 'GET').toUpperCase()
    if (res.ok && method !== 'GET' && method !== 'HEAD') {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const table = /\/rest\/v1\/([^?/]+)/.exec(url)?.[1]
      if (table && table !== 'rpc') writeListeners.forEach(fn => fn(table))
    }
    return res
  } finally {
    clearTimeout(timer)
  }
}

export const supabase = USE_SUPABASE
  ? createClient(supabaseUrl, supabaseAnonKey, { global: { fetch: fetchWithTimeout } })
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

// src/lib/userAdmin.ts
// Dados do módulo "Usuários e acessos" (só no modo Supabase).
//   • perfis (profiles) e perfis de acesso (access_roles): direto nas tabelas,
//     protegidos pela RLS da migração 019 (edição em "usuarios");
//   • criar usuário, trocar senha e excluir: Edge Function `admin-users`,
//     que guarda a service role longe do navegador.

import { supabase, type AccessRole, type UserProfile } from './supabase'
import { friendlyAccessError, MODULE_KEYS, type Permissions } from './access'

function fail(error: { message: string }): never {
  throw new Error(friendlyAccessError(error.message))
}

export async function fetchProfiles(): Promise<UserProfile[]> {
  const { data, error } = await supabase.from('profiles').select('*').order('nome', { nullsFirst: false })
  if (error) fail(error)
  return (data ?? []) as UserProfile[]
}

export async function updateProfile(id: string, patch: Partial<Pick<UserProfile, 'nome' | 'role' | 'ativo'>>): Promise<void> {
  const { error } = await supabase.from('profiles').update(patch).eq('id', id)
  if (error) fail(error)
}

export async function fetchRoles(): Promise<AccessRole[]> {
  const { data, error } = await supabase.from('access_roles').select('*').order('created_at')
  if (error) fail(error)
  return (data ?? []) as AccessRole[]
}

/** Grava a matriz completa (todo módulo explícito, inclusive 'none'). */
function fullMatrix(p: Permissions): Record<string, string> {
  return Object.fromEntries(MODULE_KEYS.map(k => [k, p[k] ?? 'none']))
}

export async function createRole(input: { key: string; nome: string; descricao: string | null; permissions: Permissions }): Promise<void> {
  const { error } = await supabase.from('access_roles').insert({ ...input, permissions: fullMatrix(input.permissions) })
  if (error) fail(error.code === '23505' ? { message: 'Já existe um perfil com esta chave.' } : error)
}

export async function updateRole(key: string, patch: { nome: string; descricao: string | null; permissions: Permissions }): Promise<void> {
  const { error } = await supabase.from('access_roles').update({ ...patch, permissions: fullMatrix(patch.permissions) }).eq('key', key)
  if (error) fail(error)
}

export async function deleteRole(key: string): Promise<void> {
  const { error } = await supabase.from('access_roles').delete().eq('key', key)
  if (error) fail(error.code === '23503' ? { message: 'Há usuários com este perfil. Troque o perfil deles antes de excluir.' } : error)
}

/** Chave estável a partir do nome ("Auditoria Externa" → "auditoria_externa"). */
export function roleKeyFromName(nome: string): string {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    .replace(/^(\d)/, 'p_$1').slice(0, 40)
}

// ── Edge Function admin-users ───────────────────────────────────────────────

async function callAdmin<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: { redirectTo: window.location.origin, ...body },
  })
  if (error) {
    // Erros de negócio vêm no corpo JSON ({ error }) com status 4xx.
    let message: string | undefined
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      try { message = ((await ctx.json()) as { error?: string }).error } catch { /* corpo não-JSON */ }
    }
    // Sem resposta da função (rede/CORS) ou 404 do gateway: função não publicada.
    if (!message && (!ctx || ctx.status === 404)) {
      message = 'A função admin-users não está publicada no Supabase. Veja SETUP_SUPABASE.md (passo 3).'
    }
    throw new Error(message ?? error.message)
  }
  return data as T
}

export function createUser(input: { email: string; nome: string; role: string; password?: string }) {
  return callAdmin<{ id: string; invited: boolean }>({ action: 'create', ...input })
}

export function resetUserPassword(userId: string, password?: string) {
  return callAdmin<{ ok: true; emailed?: boolean }>({ action: 'reset_password', user_id: userId, password })
}

export function deleteUser(userId: string) {
  return callAdmin<{ ok: true }>({ action: 'delete', user_id: userId })
}

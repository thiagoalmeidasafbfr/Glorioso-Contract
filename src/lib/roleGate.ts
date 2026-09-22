// src/lib/roleGate.ts
// Checagem de papel (profiles.role) para as funcionalidades de movimentação,
// desempenho, fechamento de amortização e premissas. Segue a matriz da seção
// 020 de docs/CONTRATOS_BACKEND.md. O banco (RLS/RPC) é quem de fato barra —
// isto só esconde/desabilita botões que dariam erro 42501.
//
// Modo local (sem Supabase) é monousuário: tudo liberado.

import { USE_SUPABASE } from './supabase'
import { useAuth } from '../context/AuthContext'

export type RoleName =
  | 'master' | 'juridico' | 'tesouraria' | 'controladoria'
  | 'assessor' | 'futebol' | 'rh' | 'diretoria'

/** Papéis que podem chamar cada operação (espelha a matriz do backend). */
export const ROLES = {
  movimentacao: ['master', 'juridico', 'futebol'] as RoleName[],
  desfazerMovimentacao: ['master'] as RoleName[],
  desempenho: ['master', 'futebol'] as RoleName[],
  gatilhoValor: ['master', 'juridico', 'futebol'] as RoleName[],
  fechamentoAmortizacao: ['master', 'controladoria'] as RoleName[],
  premissas: ['master', 'assessor', 'controladoria'] as RoleName[],
}

export function roleAllowed(role: string | null | undefined, ativo: boolean | undefined, allowed: RoleName[]): boolean {
  if (!USE_SUPABASE) return true
  if (!role || ativo === false) return false
  return (allowed as string[]).includes(role)
}

/** Hook: o usuário logado tem um dos papéis? (modo local → sempre true) */
export function useHasRole(allowed: RoleName[]): boolean {
  const { profile } = useAuth()
  return roleAllowed(profile?.role, profile?.ativo, allowed)
}

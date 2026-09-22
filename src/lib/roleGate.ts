// src/lib/roleGate.ts
// Atalhos de permissão para movimentação, desempenho, gatilhos, fechamento de
// amortização e premissas. A matriz vive em ./permissoes (fonte única, espelha a
// seção 020 de docs/CONTRATOS_BACKEND.md); aqui só nomeamos as capacidades.
// O banco (RLS/RPC) é quem de fato barra — isto só esconde/desabilita botões.
// Modo local (sem Supabase) é monousuário: tudo liberado (via AuthContext.can).

import { useAuth } from '../context/AuthContext'
import type { Capability } from './permissoes'

export const ROLES = {
  movimentacao: 'registrarMovimentacao',
  desfazerMovimentacao: 'desfazerMovimentacao',
  desempenho: 'editarDesempenho',
  gatilhoValor: 'atualizarGatilho',
  fechamentoAmortizacao: 'fecharAmortizacao',
  premissas: 'editarPremissas',
} as const satisfies Record<string, Capability>

/** Hook: o usuário logado tem a capacidade? (modo local → sempre true) */
export function useHasRole(cap: Capability): boolean {
  return useAuth().can(cap)
}

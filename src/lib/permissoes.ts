// src/lib/permissoes.ts
// Matriz de capacidades por papel — espelha a RLS da migration 020 e os papéis
// aceitos por cada RPC (021–029). Ver docs/CONTRATOS_BACKEND.md.
//
// A UI usa isto só para ESCONDER/DESABILITAR ações; quem garante é o banco
// (RLS + RPCs com erro 42501). Em modo local (sem Supabase) tudo é liberado.

import type { UserRole } from './supabase'

export const ALL_ROLES: UserRole[] = [
  'master', 'juridico', 'tesouraria', 'controladoria', 'assessor', 'futebol', 'rh', 'diretoria',
]

export const ROLE_LABELS: Record<UserRole, string> = {
  master:        'Master',
  juridico:      'Jurídico',
  tesouraria:    'Tesouraria',
  controladoria: 'Controladoria',
  assessor:      'Assessoria (CFO)',
  futebol:       'Futebol',
  rh:            'RH',
  diretoria:     'Diretoria',
}

export type Capability =
  | 'editarContratos'        // contratos, cláusulas, passivos, atletas, cadastros (020)
  | 'baixarParcelas'         // rpc baixar_parcela (023)
  | 'estornarBaixa'          // rpc estornar_baixa (023)
  | 'editarPremissas'        // ac_premissas_atleta (020)
  | 'enviarRevisao'          // rpc enviar_para_revisao (022)
  | 'aprovar'                // rpc aprovar_registro / rejeitar_registro (022)
  | 'registrarMovimentacao'  // rpc registrar_movimentacao (026)
  | 'desfazerMovimentacao'   // rpc desfazer_movimentacao (026)
  | 'editarDesempenho'       // ac_desempenho_atleta (028)
  | 'atualizarGatilho'       // rpc atualizar_valor_gatilho (028)
  | 'fecharAmortizacao'      // ac_amortizacao_fechamentos (029)
  | 'gerenciarDocumentos'    // ac_documentos + bucket documentos (024)
  | 'verAuditoria'           // vw_ac_auditoria_resumo (021)
  | 'gerarAlertas'           // rpc gerar_alertas (027) — botão só p/ master na UI
  | 'gerenciarUsuarios'      // profiles.role / ativo (019)

const MATRIX: Record<Capability, UserRole[]> = {
  editarContratos:       ['master', 'juridico'],
  baixarParcelas:        ['master', 'tesouraria', 'juridico'],
  estornarBaixa:         ['master', 'tesouraria'],
  editarPremissas:       ['master', 'assessor', 'controladoria'],
  enviarRevisao:         ['master', 'juridico'],
  aprovar:               ['master', 'controladoria'],
  registrarMovimentacao: ['master', 'juridico', 'futebol'],
  desfazerMovimentacao:  ['master'],
  editarDesempenho:      ['master', 'futebol'],
  atualizarGatilho:      ['master', 'juridico', 'futebol'],
  fecharAmortizacao:     ['master', 'controladoria'],
  gerenciarDocumentos:   ['master', 'juridico'],
  verAuditoria:          ['master', 'controladoria', 'diretoria'],
  gerarAlertas:          ['master'],
  gerenciarUsuarios:     ['master'],
}

/** `true` se o papel (ativo) tem a capacidade. `null` = sem perfil/inativo → nada. */
export function roleCan(role: UserRole | null | undefined, cap: Capability): boolean {
  if (!role) return false
  return MATRIX[cap].includes(role)
}

/** Papéis que têm a capacidade (para mensagens "disponível para …"). */
export function rolesWith(cap: Capability): UserRole[] {
  return MATRIX[cap]
}

export function roleLabel(role: string | null | undefined): string {
  if (!role) return '—'
  return ROLE_LABELS[role as UserRole] ?? role
}

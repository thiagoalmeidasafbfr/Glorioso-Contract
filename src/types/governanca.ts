// src/types/governanca.ts
// Campos de governança (migrations 021–027) acrescentados às entidades do app.
// Todos OPCIONAIS: em modo local ou antes das migrations eles simplesmente não
// existem. Ver docs/CONTRATOS_BACKEND.md.

import type { UserRole } from '../lib/supabase'

// ── 022 — Workflow de aprovação (ac_contratos, ac_clausulas_fin) ─────────────
export type StatusAprovacao = 'RASCUNHO' | 'EM_REVISAO' | 'APROVADO' | 'REJEITADO'

export const STATUS_APROVACAO_LABELS: Record<StatusAprovacao, string> = {
  RASCUNHO:   'Rascunho',
  EM_REVISAO: 'Em revisão',
  APROVADO:   'Aprovado',
  REJEITADO:  'Rejeitado',
}

export interface AprovacaoFields {
  status_aprovacao?: StatusAprovacao | null
  aprovado_por?: string | null
  aprovado_em?: string | null
  motivo_rejeicao?: string | null
}

// ── 021 — Autoria ────────────────────────────────────────────────────────────
export interface AutoriaFields {
  created_by_uid?: string | null
  updated_by?: string | null
}

// ── 025 — Metadados estruturados (antes só em `notes`) ───────────────────────
export interface MetaRJFields {
  rj_data?: string | null
  recuperacao_judicial?: boolean | null
  renegociado_acordo_id?: string | null
}
export interface MetaClauseFields extends MetaRJFields {
  /** JSON do acordo (sem o prefixo __ACORDO__). */
  renegociacao?: Record<string, unknown> | null
}
export interface MetaTriggerFields {
  /** JSON do rateio de empréstimo (sem o prefixo __EMPRESTIMO__). */
  emprestimo_rateio?: Record<string, unknown> | null
}

// ── 023 — Baixa de parcela ───────────────────────────────────────────────────
export interface BaixaFields {
  pago_por?: string | null
  pago_em?: string | null
  valor_pago_moeda?: number | null
  ptax_utilizada?: number | null
}

// ── 027 — Alertas ────────────────────────────────────────────────────────────
export interface AlertaFields {
  contract_id?: string | null   // contrato_id (via fromAcFK)
  gatilho_id?: string | null
  chave?: string | null
  setores?: UserRole[] | string[] | null
  data_referencia?: string | null
  automatico?: boolean | null
  resolvido_em?: string | null
  notificado_em?: string | null
  updated_at?: string | null
}

// ── 021 — Auditoria (vw_ac_auditoria_resumo) ─────────────────────────────────
export type OperacaoAuditoria = 'INSERT' | 'UPDATE' | 'DELETE'
export interface AuditoriaRow {
  id: number
  tabela: string
  registro_id: string | null
  operacao: OperacaoAuditoria
  campos_alterados: string[] | null
  dados_antes: Record<string, unknown> | null
  dados_depois: Record<string, unknown> | null
  usuario_id: string | null
  usuario_email: string | null
  usuario_nome: string | null
  usuario_papel: string | null
  ocorrido_em: string
  atleta_id: string | null
}

// ── 024 — Documentos ─────────────────────────────────────────────────────────
export type TipoDocumento = 'CONTRATO' | 'ADITIVO' | 'OUTRO'
export const TIPO_DOCUMENTO_LABELS: Record<TipoDocumento, string> = {
  CONTRATO: 'Contrato', ADITIVO: 'Aditivo', OUTRO: 'Outro',
}
export interface Documento {
  id: string
  atleta_id: string
  contrato_id: string | null
  tipo: TipoDocumento | null
  storage_path: string
  nome_arquivo: string
  mime: string | null
  tamanho_bytes: number | null
  descricao: string | null
  enviado_por: string | null
  created_at: string
  updated_at: string
}

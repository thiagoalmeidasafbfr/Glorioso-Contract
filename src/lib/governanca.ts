// src/lib/governanca.ts
// Camada de dados da governança multissetorial (Fase 3 + alertas):
//   • perfis/usuários (019/020)      • auditoria (021)
//   • workflow de aprovação (022)    • documentos no Storage (024)
//   • central de alertas (027)
// Contrato exato do backend: docs/CONTRATOS_BACKEND.md.
//
// Modo local (sem Supabase): aprovação e alertas têm implementação local
// (localStorage); usuários, auditoria e documentos não existem sem backend —
// as funções devolvem vazio e a UI mostra "disponível apenas com Supabase".

import { supabase, USE_SUPABASE, type UserProfile, type UserRole } from './supabase'
import { local } from './localStore'
import {
  fetchAllContracts, fetchAllClauses, fetchAllAlerts, fetchAthletes,
} from './athleteQueries'
import { daysFromToday, fmtDate } from './format'
import type {
  Alert, AlertType, AlertSeverity, AlertWithDetails, Clause, ClauseInstallment, Contract,
} from '../types/athlete-system'
import type {
  AuditoriaRow, Documento, StatusAprovacao, TipoDocumento,
} from '../types/governanca'

/** Mensagem amigável para erros do PostgREST/RPC (convenção 42501/22023/P0002). */
export function mensagemErro(e: unknown): string {
  const err = e as { code?: string; message?: string } | null
  if (err?.code === '42501') return `Sem permissão para esta ação${err.message ? ` (${err.message})` : ''}.`
  if (err?.code === 'P0002') return 'Registro não encontrado.'
  if (err?.message) return err.message
  return String(e)
}

// ── Usuários (profiles) ──────────────────────────────────────────────────────

export async function fetchProfiles(): Promise<UserProfile[]> {
  if (!USE_SUPABASE) return []
  const { data, error } = await supabase.from('profiles').select('*').order('email')
  if (error) throw error
  return (data ?? []) as UserProfile[]
}

/** Altera papel/ativo/nome. Só master (RLS + trigger 019). 0 linhas = sem permissão. */
export async function updateProfile(id: string, patch: { role?: UserRole; ativo?: boolean; nome?: string | null }): Promise<UserProfile> {
  if (!USE_SUPABASE) throw new Error('Gestão de usuários disponível apenas com Supabase.')
  const { data, error } = await supabase.from('profiles').update(patch).eq('id', id).select()
  if (error) throw error
  if (!data || data.length === 0) throw new Error('Sem permissão para alterar este perfil (apenas Master).')
  return data[0] as UserProfile
}

/** id → nome/e-mail dos perfis visíveis (master vê todos; demais, só o próprio). */
export async function fetchProfileNames(): Promise<Map<string, string>> {
  const m = new Map<string, string>()
  if (!USE_SUPABASE) return m
  const { data } = await supabase.from('profiles').select('id, email, nome')
  for (const p of (data ?? []) as { id: string; email: string; nome: string | null }[]) m.set(p.id, p.nome || p.email)
  return m
}

// ── Workflow de aprovação (022) ──────────────────────────────────────────────

export type TabelaAprovacao = 'ac_contratos' | 'ac_clausulas_fin'

const LOCAL_TABLE: Record<TabelaAprovacao, string> = { ac_contratos: 'contracts', ac_clausulas_fin: 'clauses' }

/** Status efetivo: ausente/nulo = APROVADO (default do banco). */
export function statusAprovacao(r: { status_aprovacao?: StatusAprovacao | null }): StatusAprovacao {
  return r.status_aprovacao ?? 'APROVADO'
}

function localTransition(tabela: TabelaAprovacao, id: string, from: StatusAprovacao[], patch: Record<string, unknown>): void {
  const t = LOCAL_TABLE[tabela]
  const row = local.find<{ id: string; status_aprovacao?: StatusAprovacao | null }>(t, id)
  if (!row) throw new Error('Registro não encontrado.')
  const cur = statusAprovacao(row)
  if (!from.includes(cur)) throw new Error(`Transição inválida a partir de ${cur}.`)
  local.update(t, id, patch)
}

async function rpcAprovacao(fn: string, args: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.rpc(fn, args)
  if (error) throw new Error(mensagemErro(error))
}

export async function enviarParaRevisao(tabela: TabelaAprovacao, id: string): Promise<void> {
  if (!USE_SUPABASE) return localTransition(tabela, id, ['RASCUNHO', 'REJEITADO', 'APROVADO'],
    { status_aprovacao: 'EM_REVISAO', aprovado_por: null, aprovado_em: null })
  await rpcAprovacao('enviar_para_revisao', { p_tabela: tabela, p_id: id })
}

export async function aprovarRegistro(tabela: TabelaAprovacao, id: string): Promise<void> {
  if (!USE_SUPABASE) return localTransition(tabela, id, ['RASCUNHO', 'EM_REVISAO'],
    { status_aprovacao: 'APROVADO', aprovado_em: new Date().toISOString(), motivo_rejeicao: null })
  await rpcAprovacao('aprovar_registro', { p_tabela: tabela, p_id: id })
}

export async function rejeitarRegistro(tabela: TabelaAprovacao, id: string, motivo: string): Promise<void> {
  if (!motivo.trim()) throw new Error('Informe o motivo da rejeição.')
  if (!USE_SUPABASE) return localTransition(tabela, id, ['RASCUNHO', 'EM_REVISAO'],
    { status_aprovacao: 'REJEITADO', aprovado_em: new Date().toISOString(), motivo_rejeicao: motivo.trim() })
  await rpcAprovacao('rejeitar_registro', { p_tabela: tabela, p_id: id, p_motivo: motivo.trim() })
}

export interface PendenciasAprovacao { contracts: Contract[]; clauses: Clause[] }

/** Contratos e cláusulas nos status informados (padrão: EM_REVISAO). */
export async function fetchPendenciasAprovacao(status: StatusAprovacao[] = ['EM_REVISAO']): Promise<PendenciasAprovacao> {
  const [contracts, clauses] = await Promise.all([fetchAllContracts(), fetchAllClauses()])
  const ok = (r: { status_aprovacao?: StatusAprovacao | null }) => status.includes(statusAprovacao(r))
  return { contracts: contracts.filter(ok), clauses: clauses.filter(ok) }
}

// ── Alertas (027) ────────────────────────────────────────────────────────────

export type SetorAlerta = 'tesouraria' | 'juridico' | 'futebol' | 'controladoria'
export const SETOR_LABELS: Record<SetorAlerta, string> = {
  tesouraria: 'Tesouraria', juridico: 'Jurídico', futebol: 'Futebol', controladoria: 'Controladoria',
}

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  VENCIMENTO_PROXIMO:       'Vencimento próximo',
  EM_ATRASO:                'Parcela em atraso',
  SELL_ON_PENDENTE_REVISAO: 'Sell-on a revisar',
  ATINGIMENTO_PENDENTE:     'Gatilho atingido (pendente)',
  CONTRATO_EXPIRANDO:       'Contrato expirando',
  GATILHO_PROXIMO:          'Gatilho próximo',
}

/** Setores destinatários: coluna `setores` (027) ou inferência pelo tipo (legado/manual). */
export function setoresDoAlerta(a: Alert): string[] {
  if (a.setores && a.setores.length) return a.setores as string[]
  switch (a.alert_type) {
    case 'EM_ATRASO': case 'VENCIMENTO_PROXIMO': return ['tesouraria']
    case 'CONTRATO_EXPIRANDO': return ['juridico']
    case 'GATILHO_PROXIMO': case 'ATINGIMENTO_PENDENTE': return ['juridico', 'futebol']
    case 'SELL_ON_PENDENTE_REVISAO': return ['juridico', 'controladoria']
    default: return []
  }
}

/** Alertas abertos (resolvido_em nulo) com o nome do atleta. */
export async function fetchAlertasAbertos(): Promise<AlertWithDetails[]> {
  const [alerts, athletes] = await Promise.all([fetchAllAlerts(), fetchAthletes()])
  const names = new Map(athletes.map(a => [a.id, a.short_name || a.full_name]))
  return alerts.map(a => ({ ...a, athlete_name: names.get(a.athlete_id) ?? undefined }))
}

/** Nº de alertas abertos e não lidos (badge do menu). */
export async function contarAlertasNaoLidos(): Promise<number> {
  const alerts = await fetchAllAlerts()
  return alerts.filter(a => !a.is_read).length
}

export async function marcarAlertaNaoLido(id: string): Promise<void> {
  if (!USE_SUPABASE) { local.update<Alert>('alerts', id, { is_read: false }); return }
  const { error } = await supabase.rpc('marcar_alerta_lido', { p_id: id, p_lido: false })
  if (error) throw new Error(mensagemErro(error))
}

/**
 * Executa a geração de alertas. Supabase → rpc('gerar_alertas') (idempotente).
 * Modo local → mesmas regras de parcelas e contratos da 027 sobre o localStorage
 * (gatilhos dependem de desempenho, que só existe no Supabase).
 * Retorna o nº de alertas inseridos/reabertos.
 */
export async function gerarAlertas(): Promise<number> {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.rpc('gerar_alertas')
    if (error) throw new Error(mensagemErro(error))
    return Number(data ?? 0)
  }
  return gerarAlertasLocal()
}

interface AlertaDesejado {
  chave: string; alert_type: AlertType; severity: AlertSeverity; setores: string[]
  athlete_id: string; clause_id: string | null; installment_id: string | null
  contract_id: string | null; data_referencia: string; message: string
}

function gerarAlertasLocal(): number {
  const now = new Date().toISOString()
  const desired = new Map<string, AlertaDesejado>()
  const clauses = new Map(local.all<Clause>('clauses').map(c => [c.id, c]))

  for (const inst of local.all<ClauseInstallment>('clause_installments')) {
    if (inst.payment_status !== 'PENDENTE' && inst.payment_status !== 'EM_ATRASO') continue
    const cl = clauses.get(inst.clause_id)
    if (cl?.achievement_status === 'NAO_ATINGIDA') continue
    const d = daysFromToday(inst.due_date)
    if (d === null) continue
    const base = { athlete_id: inst.athlete_id, clause_id: inst.clause_id, installment_id: inst.id, contract_id: null, data_referencia: inst.due_date, setores: ['tesouraria'] }
    const desc = `Parcela ${inst.installment_number}${cl ? ` de ${cl.description}` : ''}`
    if (d < 0) {
      if (inst.payment_status === 'PENDENTE') local.update<ClauseInstallment>('clause_installments', inst.id, { payment_status: 'EM_ATRASO' })
      desired.set(`PARCELA_VENCIDA:${inst.id}`, { ...base, chave: `PARCELA_VENCIDA:${inst.id}`, alert_type: 'EM_ATRASO', severity: 'RED', message: `${desc} vencida em ${fmtDate(inst.due_date)}` })
    } else if (d <= 7) {
      desired.set(`PARCELA_D7:${inst.id}`, { ...base, chave: `PARCELA_D7:${inst.id}`, alert_type: 'VENCIMENTO_PROXIMO', severity: 'YELLOW', message: `${desc} vence em ${fmtDate(inst.due_date)} (${d} dia${d === 1 ? '' : 's'})` })
    } else if (d <= 30) {
      desired.set(`PARCELA_D30:${inst.id}`, { ...base, chave: `PARCELA_D30:${inst.id}`, alert_type: 'VENCIMENTO_PROXIMO', severity: 'GREEN', message: `${desc} vence em ${fmtDate(inst.due_date)} (${d} dias)` })
    }
  }

  for (const ct of local.all<Contract>('contracts')) {
    if (ct.status !== 'ATIVO' || !ct.end_date) continue
    if (!['ENTRADA', 'EMPRESTIMO_ENTRADA', 'EMPRESTIMO_SAIDA'].includes(ct.type)) continue
    const d = daysFromToday(ct.end_date)
    if (d === null || d < 0 || d > 180) continue
    const [stage, severity]: [string, AlertSeverity] = d <= 30 ? ['CONTRATO_D30', 'RED'] : d <= 90 ? ['CONTRATO_D90', 'YELLOW'] : ['CONTRATO_D180', 'GREEN']
    const chave = `${stage}:${ct.id}`
    desired.set(chave, {
      chave, alert_type: 'CONTRATO_EXPIRANDO', severity, setores: ['juridico'],
      athlete_id: ct.athlete_id, clause_id: null, installment_id: null, contract_id: ct.id,
      data_referencia: ct.end_date,
      message: `Contrato (${ct.counterpart_club || ct.type}) termina em ${fmtDate(ct.end_date)} (${d} dias)`,
    })
  }

  let count = 0
  const existing = local.all<Alert>('alerts')
  const byKey = new Map(existing.filter(a => a.chave).map(a => [a.chave as string, a]))
  for (const [chave, a] of desired) {
    const cur = byKey.get(chave)
    if (!cur) { local.insert('alerts', { ...a, is_read: false, automatico: true, resolvido_em: null }); count++ }
    else if (cur.resolvido_em) { local.update<Alert>('alerts', cur.id, { resolvido_em: null, is_read: false, message: a.message, severity: a.severity }); count++ }
    else if (cur.message !== a.message) local.update<Alert>('alerts', cur.id, { message: a.message })
  }
  for (const a of existing) {
    if (a.automatico && a.chave && !a.resolvido_em && !desired.has(a.chave)) {
      local.update<Alert>('alerts', a.id, { resolvido_em: now, is_read: true })
    }
  }
  return count
}

// ── Auditoria (021) ──────────────────────────────────────────────────────────

export interface FiltroAuditoria {
  atletaId?: string
  tabela?: string
  registroId?: string
  usuario?: string     // trecho do e-mail/nome
  de?: string          // YYYY-MM-DD
  ate?: string         // YYYY-MM-DD (inclusive)
  limit?: number
}

export const TABELA_LABELS: Record<string, string> = {
  ac_atletas: 'Atleta', ac_entidades: 'Entidade', ac_entidades_pj_imagem: 'PJ de imagem',
  ac_contratos: 'Contrato', ac_clausulas_fin: 'Cláusula', ac_parcelas_fin: 'Parcela',
  ac_titularidade_economica: 'Titularidade', ac_passivos_clube: 'Passivo (clube)',
  ac_passivos_agente: 'Passivo (agente)', ac_direitos_imagem: 'Direito de imagem',
  ac_gatilhos_salario: 'Gatilho salarial', ac_premissas_atleta: 'Premissas',
  ac_documentos: 'Documento', ac_movimentacoes: 'Movimentação',
  ac_desempenho_atleta: 'Desempenho', ac_amortizacao_fechamentos: 'Fechamento de amortização',
}

export async function fetchAuditoria(f: FiltroAuditoria = {}): Promise<AuditoriaRow[]> {
  if (!USE_SUPABASE) return []
  let q = supabase.from('vw_ac_auditoria_resumo').select('*')
  if (f.atletaId) q = q.eq('atleta_id', f.atletaId)
  if (f.tabela) q = q.eq('tabela', f.tabela)
  if (f.registroId) q = q.eq('registro_id', f.registroId)
  if (f.usuario) {
    const s = f.usuario.replace(/[,()%]/g, ' ').trim()
    if (s) q = q.or(`usuario_email.ilike.%${s}%,usuario_nome.ilike.%${s}%`)
  }
  if (f.de) q = q.gte('ocorrido_em', `${f.de}T00:00:00`)
  if (f.ate) q = q.lte('ocorrido_em', `${f.ate}T23:59:59.999`)
  const { data, error } = await q.order('ocorrido_em', { ascending: false }).limit(f.limit ?? 200)
  if (error) throw new Error(mensagemErro(error))
  return (data ?? []) as AuditoriaRow[]
}

/** Campos alterados com valor antes → depois (UPDATE); todos os campos em INSERT/DELETE. */
export function diffAuditoria(r: AuditoriaRow): { campo: string; antes: unknown; depois: unknown }[] {
  const ignore = new Set(['updated_at', 'updated_by', 'created_at'])
  const antes = r.dados_antes ?? {}
  const depois = r.dados_depois ?? {}
  const campos = r.operacao === 'UPDATE' && r.campos_alterados?.length
    ? r.campos_alterados
    : Object.keys(r.operacao === 'DELETE' ? antes : depois).sort()
  return campos.filter(c => !ignore.has(c)).map(c => ({ campo: c, antes: antes[c], depois: depois[c] }))
}

// ── Documentos (024) ─────────────────────────────────────────────────────────

const BUCKET = 'documentos'

export async function fetchDocumentos(atletaId: string): Promise<Documento[]> {
  if (!USE_SUPABASE) return []
  const { data, error } = await supabase.from('ac_documentos').select('*').eq('atleta_id', atletaId).order('created_at', { ascending: false })
  if (error) throw new Error(mensagemErro(error))
  return (data ?? []) as Documento[]
}

export async function uploadDocumento(input: {
  atletaId: string; contratoId: string | null; tipo: TipoDocumento; descricao: string; file: File
}): Promise<Documento> {
  if (!USE_SUPABASE) throw new Error('Upload disponível apenas com Supabase.')
  const safeName = input.file.name.replace(/[^\w.-]+/g, '_')
  const path = `${input.atletaId}/${input.contratoId ?? 'geral'}/${crypto.randomUUID()}-${safeName}`
  const up = await supabase.storage.from(BUCKET).upload(path, input.file, { contentType: input.file.type || undefined })
  if (up.error) throw new Error(mensagemErro(up.error))
  const { data, error } = await supabase.from('ac_documentos').insert({
    atleta_id: input.atletaId, contrato_id: input.contratoId, tipo: input.tipo,
    storage_path: path, nome_arquivo: input.file.name, mime: input.file.type || null,
    tamanho_bytes: input.file.size, descricao: input.descricao || null,
  }).select().single()
  if (error) {
    // Não deixa objeto órfão no bucket se a linha não foi gravada.
    await supabase.storage.from(BUCKET).remove([path])
    throw new Error(mensagemErro(error))
  }
  return data as Documento
}

export async function urlDocumento(doc: Documento, segundos = 300): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(doc.storage_path, segundos)
  if (error || !data) throw new Error(mensagemErro(error))
  return data.signedUrl
}

export async function deleteDocumento(doc: Documento): Promise<void> {
  const rm = await supabase.storage.from(BUCKET).remove([doc.storage_path])
  if (rm.error) throw new Error(mensagemErro(rm.error))
  const { data, error } = await supabase.from('ac_documentos').delete().eq('id', doc.id).select('id')
  if (error) throw new Error(mensagemErro(error))
  if (!data || data.length === 0) throw new Error('Sem permissão para excluir o documento.')
}

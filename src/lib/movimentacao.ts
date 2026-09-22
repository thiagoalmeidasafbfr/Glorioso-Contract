// src/lib/movimentacao.ts
// Movimentações do atleta (venda, compra, empréstimo, retorno, rescisão) —
// Fase 4.1/4.2 do plano. Contrato do backend: seção 026 de
// docs/CONTRATOS_BACKEND.md (tabela ac_movimentacoes + RPCs
// registrar_movimentacao / desfazer_movimentacao, ambas atômicas).
//
// Modo local (sem Supabase): os MESMOS efeitos são aplicados em JS contra o
// localStore, reaproveitando as funções de athleteQueries. Não é transacional
// (localStorage não tem transação), mas os efeitos ficam gravados em `efeitos`
// e podem ser desfeitos do mesmo jeito que no banco.
//
// A prévia (computeEfeitos) usa a mesma regra nos dois modos — é o que a tela
// mostra ANTES de confirmar.

import { supabase, USE_SUPABASE } from './supabase'
import { local } from './localStore'
import {
  fetchAthlete, updateAthlete,
  fetchAthleteContracts, updateContract,
  fetchAthleteClauses, fetchAthleteInstallments, updateInstallment,
  fetchAthleteImageRights, updateImageRight,
  fetchAthleteEconomicRights, updateEconomicRight, createEconomicRight, deleteEconomicRight,
} from './athleteQueries'
import type {
  Athlete, AthleteStatus, Contract, Clause, ClauseInstallment, ImageRight, EconomicRight, Currency,
} from '../types/athlete-system'
import { todayISO } from './format'

export type MovimentacaoTipo =
  | 'VENDA' | 'COMPRA' | 'EMPRESTIMO_SAIDA' | 'EMPRESTIMO_ENTRADA'
  | 'RETORNO_EMPRESTIMO' | 'RESCISAO'

export const MOVIMENTACAO_LABELS: Record<MovimentacaoTipo, string> = {
  VENDA:              'Venda',
  COMPRA:             'Compra',
  EMPRESTIMO_SAIDA:   'Empréstimo (saída)',
  EMPRESTIMO_ENTRADA: 'Empréstimo (entrada)',
  RETORNO_EMPRESTIMO: 'Retorno de empréstimo',
  RESCISAO:           'Rescisão',
}

export interface RegistrarMovimentacaoInput {
  atleta_id: string
  tipo: MovimentacaoTipo
  data_movimentacao: string
  clube_contraparte_id?: string | null
  clube_contraparte_nome?: string | null
  valor?: number | null
  moeda?: string
  percentual_direitos?: number | null
  data_retorno_prevista?: string | null
  opcao_compra_valor?: number | null
  contrato_id?: string | null
  observacoes?: string | null
  cancelar_salario?: boolean
}

export interface EfeitosMovimentacao {
  status_anterior: string
  status_novo: string
  contratos_encerrados: { id: string; status_anterior: string; data_fim_anterior: string | null }[]
  parcelas_canceladas: string[]
  direitos_imagem_cancelados: string[]
  titularidade: { id: string; percentual_anterior: number | null; percentual_novo: number; inserida: boolean } | null
}

export interface Movimentacao {
  id: string
  atleta_id: string
  tipo: MovimentacaoTipo
  data_movimentacao: string
  clube_contraparte_id: string | null
  clube_contraparte_nome: string | null
  valor: number | null
  moeda: string
  percentual_direitos: number | null
  data_retorno_prevista: string | null
  opcao_compra_valor: number | null
  contrato_id: string | null
  observacoes: string | null
  efeitos: EfeitosMovimentacao | Record<string, never>
  desfeita_em: string | null
  desfeita_por: string | null
  created_by?: string | null
  created_at: string
  updated_at: string
}

const TABLE = 'ac_movimentacoes'   // Supabase
const LOCAL = 'movimentacoes'      // localStore

// ── Regras (espelham a RPC registrar_movimentacao) ──────────────────────────

/** Status do atleta (no vocabulário do app) após a movimentação. */
export function statusAfter(tipo: MovimentacaoTipo): AthleteStatus {
  switch (tipo) {
    case 'VENDA': return 'VENDIDO'
    case 'RESCISAO': return 'DESLIGADO'        // banco grava LIBERADO; o app exibe DESLIGADO
    case 'EMPRESTIMO_SAIDA': return 'EMPRESTADO'
    default: return 'ATIVO'                     // COMPRA, EMPRESTIMO_ENTRADA, RETORNO_EMPRESTIMO
  }
}

function closesLabor(tipo: MovimentacaoTipo): boolean {
  return tipo === 'VENDA' || tipo === 'RESCISAO'
}
function cancelsRemuneration(input: Pick<RegistrarMovimentacaoInput, 'tipo' | 'cancelar_salario'>): boolean {
  return closesLabor(input.tipo) || (input.tipo === 'EMPRESTIMO_SAIDA' && !!input.cancelar_salario)
}
/** Vínculo de trabalho = contrato ATIVO de ENTRADA / EMPRESTIMO_ENTRADA. */
function isLaborContract(c: Contract): boolean {
  return c.status === 'ATIVO' && (c.type === 'ENTRADA' || c.type === 'EMPRESTIMO_ENTRADA')
}

export interface PreviewData {
  athlete: Athlete
  contracts: Contract[]
  clauses: Clause[]
  installments: ClauseInstallment[]
  imageRights: ImageRight[]
  rights: EconomicRight[]
}

export async function loadPreviewData(athleteId: string): Promise<PreviewData | null> {
  const [athlete, contracts, clauses, installments, imageRights, rights] = await Promise.all([
    fetchAthlete(athleteId), fetchAthleteContracts(athleteId), fetchAthleteClauses(athleteId),
    fetchAthleteInstallments(athleteId), fetchAthleteImageRights(athleteId), fetchAthleteEconomicRights(athleteId),
  ])
  if (!athlete) return null
  return { athlete, contracts, clauses, installments, imageRights, rights }
}

/** Efeitos que a movimentação vai aplicar (sem gravar nada). Mesma regra da RPC. */
export function computeEfeitos(input: RegistrarMovimentacaoInput, d: PreviewData): EfeitosMovimentacao {
  const date = input.data_movimentacao
  const contratos_encerrados = closesLabor(input.tipo)
    ? d.contracts.filter(isLaborContract).map(c => ({ id: c.id, status_anterior: c.status, data_fim_anterior: c.end_date ?? null }))
    : []

  let parcelas_canceladas: string[] = []
  let direitos_imagem_cancelados: string[] = []
  if (cancelsRemuneration(input)) {
    const remClauses = new Set(d.clauses.filter(c => c.clause_type === 'SALARIO_CETD' || c.clause_type === 'DIREITO_IMAGEM').map(c => c.id))
    parcelas_canceladas = d.installments
      .filter(i => remClauses.has(i.clause_id) && (i.payment_status === 'PENDENTE' || i.payment_status === 'EM_ATRASO') && i.due_date > date)
      .map(i => i.id)
    const ym = date.slice(0, 7)
    direitos_imagem_cancelados = d.imageRights
      .filter(r => (r.status === 'PENDENTE' || r.status === 'EM_ATRASO') && r.month > ym)
      .map(r => r.id)
  }

  let titularidade: EfeitosMovimentacao['titularidade'] = null
  const pct = input.percentual_direitos
  if (pct != null && (input.tipo === 'VENDA' || input.tipo === 'COMPRA')) {
    const bfr = [...d.rights].filter(r => r.holder_type === 'BFR').sort((a, b) => a.created_at.localeCompare(b.created_at))[0]
    if (bfr) {
      const novo = input.tipo === 'VENDA' ? Math.max(0, bfr.percentage - pct) : Math.min(100, bfr.percentage + pct)
      titularidade = { id: bfr.id, percentual_anterior: bfr.percentage, percentual_novo: novo, inserida: false }
    } else if (input.tipo === 'COMPRA') {
      titularidade = { id: '(nova)', percentual_anterior: null, percentual_novo: Math.min(100, pct), inserida: true }
    }
  }

  return {
    status_anterior: d.athlete.current_status,
    status_novo: statusAfter(input.tipo),
    contratos_encerrados, parcelas_canceladas, direitos_imagem_cancelados, titularidade,
  }
}

// ── Erros do backend → mensagem em português ────────────────────────────────
function rpcError(e: { code?: string; message?: string }): Error {
  if (e.code === '42501') return new Error('Sem permissão para esta operação (papel não autorizado ou perfil inativo).')
  if (e.code === 'PGRST202' || /Could not find the function/i.test(e.message ?? ''))
    return new Error('A função de movimentação não existe no banco — aplique a migration 026_movimentacoes.sql.')
  return new Error(e.message ?? 'Erro ao processar a movimentação.')
}

// ── API pública ─────────────────────────────────────────────────────────────

export async function fetchMovimentacoes(athleteId: string): Promise<Movimentacao[]> {
  const sortDesc = (a: Movimentacao, b: Movimentacao) =>
    b.data_movimentacao.localeCompare(a.data_movimentacao) || b.created_at.localeCompare(a.created_at)
  if (!USE_SUPABASE) return local.where<Movimentacao>(LOCAL, 'atleta_id', athleteId).sort(sortDesc)
  const { data, error } = await supabase.from(TABLE).select('*').eq('atleta_id', athleteId)
    .order('data_movimentacao', { ascending: false }).order('created_at', { ascending: false })
  if (error) {
    // Tabela ainda não criada (migration 026 pendente): lista vazia em vez de quebrar a ficha.
    if (error.code === 'PGRST205' || /schema cache/i.test(error.message)) return []
    throw error
  }
  return (data ?? []) as Movimentacao[]
}

/** Id da movimentação que pode ser desfeita (a mais recente não desfeita), ou null. */
export function latestUndoableId(movs: Movimentacao[]): string | null {
  const alive = movs.filter(m => !m.desfeita_em)
    .sort((a, b) => b.data_movimentacao.localeCompare(a.data_movimentacao) || b.created_at.localeCompare(a.created_at))
  return alive[0]?.id ?? null
}

export async function registrarMovimentacao(input: RegistrarMovimentacaoInput): Promise<string> {
  if (!input.atleta_id || !input.tipo || !input.data_movimentacao) throw new Error('Atleta, tipo e data são obrigatórios.')
  if (input.percentual_direitos != null && (input.percentual_direitos < 0 || input.percentual_direitos > 100))
    throw new Error('Percentual de direitos deve estar entre 0 e 100.')

  if (USE_SUPABASE) {
    const p: Record<string, unknown> = { ...input, moeda: input.moeda || 'EUR' }
    for (const k of Object.keys(p)) if (p[k] === '' || p[k] === undefined) p[k] = null
    const { data, error } = await supabase.rpc('registrar_movimentacao', { p })
    if (error) throw rpcError(error)
    return data as string
  }

  // ── Local: aplica os efeitos em sequência e grava a linha com `efeitos`. ──
  const d = await loadPreviewData(input.atleta_id)
  if (!d) throw new Error('Atleta não encontrado.')
  const ef = computeEfeitos(input, d)

  await updateAthlete(input.atleta_id, { current_status: ef.status_novo as AthleteStatus })
  const endStatus = input.tipo === 'VENDA' ? 'ENCERRADO' : 'RESCINDIDO'
  for (const c of ef.contratos_encerrados) {
    const ct = d.contracts.find(x => x.id === c.id)
    const end = ct && ct.start_date > input.data_movimentacao ? ct.start_date : input.data_movimentacao
    await updateContract(c.id, { status: endStatus, end_date: end })
  }
  for (const id of ef.parcelas_canceladas) await updateInstallment(id, { payment_status: 'CANCELADA' })
  for (const id of ef.direitos_imagem_cancelados) await updateImageRight(id, { status: 'CANCELADA' })
  if (ef.titularidade) {
    if (ef.titularidade.inserida) {
      const r = await createEconomicRight(input.atleta_id, { holder_type: 'BFR', holder_name: 'Botafogo SAF', percentage: ef.titularidade.percentual_novo, notes: 'Criada por registrar_movimentacao' })
      ef.titularidade = { ...ef.titularidade, id: r.id }
    } else {
      await updateEconomicRight(ef.titularidade.id, { percentage: ef.titularidade.percentual_novo })
    }
  }
  const row = local.insert<Movimentacao>(LOCAL, {
    atleta_id: input.atleta_id, tipo: input.tipo, data_movimentacao: input.data_movimentacao,
    clube_contraparte_id: input.clube_contraparte_id ?? null,
    clube_contraparte_nome: input.clube_contraparte_nome ?? null,
    valor: input.valor ?? null, moeda: input.moeda || 'EUR',
    percentual_direitos: input.percentual_direitos ?? null,
    data_retorno_prevista: input.data_retorno_prevista || null,
    opcao_compra_valor: input.opcao_compra_valor ?? null,
    contrato_id: input.contrato_id || null,
    observacoes: input.observacoes || null,
    efeitos: ef, desfeita_em: null, desfeita_por: null,
  })
  return row.id
}

export interface DesfazerResult { id: string; parcelas_restauradas: number; direitos_imagem_restaurados: number }

export async function desfazerMovimentacao(id: string): Promise<DesfazerResult> {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.rpc('desfazer_movimentacao', { p_id: id })
    if (error) throw rpcError(error)
    return data as DesfazerResult
  }

  const m = local.find<Movimentacao>(LOCAL, id)
  if (!m) throw new Error('Movimentação não encontrada.')
  if (m.desfeita_em) throw new Error('Movimentação já desfeita.')
  const all = local.where<Movimentacao>(LOCAL, 'atleta_id', m.atleta_id)
  if (latestUndoableId(all) !== id) throw new Error('Desfaça antes as movimentações posteriores deste atleta.')
  const e = m.efeitos as EfeitosMovimentacao

  if (e.status_anterior) await updateAthlete(m.atleta_id, { current_status: e.status_anterior as AthleteStatus })
  for (const c of e.contratos_encerrados ?? []) {
    await updateContract(c.id, { status: c.status_anterior as Contract['status'], end_date: c.data_fim_anterior })
  }
  const today = todayISO()
  let restauradas = 0
  const insts = new Map((await fetchAthleteInstallments(m.atleta_id)).map(i => [i.id, i]))
  for (const pid of e.parcelas_canceladas ?? []) {
    const i = insts.get(pid)
    if (!i || i.payment_status !== 'CANCELADA') continue
    await updateInstallment(pid, { payment_status: i.due_date < today ? 'EM_ATRASO' : 'PENDENTE' })
    restauradas++
  }
  let img = 0
  const imgs = new Map((await fetchAthleteImageRights(m.atleta_id)).map(r => [r.id, r]))
  for (const rid of e.direitos_imagem_cancelados ?? []) {
    const r = imgs.get(rid)
    if (!r || r.status !== 'CANCELADA') continue
    await updateImageRight(rid, { status: 'PENDENTE' })
    img++
  }
  if (e.titularidade) {
    if (e.titularidade.inserida) await deleteEconomicRight(e.titularidade.id)
    else await updateEconomicRight(e.titularidade.id, { percentage: e.titularidade.percentual_anterior ?? 0 })
  }
  local.update<Movimentacao>(LOCAL, id, { desfeita_em: new Date().toISOString(), desfeita_por: null })
  return { id, parcelas_restauradas: restauradas, direitos_imagem_restaurados: img }
}

/** Moedas oferecidas no formulário. */
export const MOV_CURRENCIES: Currency[] = ['EUR', 'USD', 'BRL', 'GBP']

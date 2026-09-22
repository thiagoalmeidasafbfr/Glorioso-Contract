// src/lib/desempenho.ts
// Desempenho esportivo do atleta (jogos/gols/assistências/minutos por temporada
// e competição) e progresso dos gatilhos salariais — Fase 5.3 do plano.
// Backend: seção 028 de docs/CONTRATOS_BACKEND.md (tabela ac_desempenho_atleta,
// view vw_ac_gatilhos_progresso, RPC atualizar_valor_gatilho).
//
// Modo local: a tabela vive no localStore e o progresso é calculado em JS com a
// MESMA regra da view (por temporada, a linha competicao='' é o total; senão
// soma as competições; com competição de referência, só aquela competição).

import { supabase, USE_SUPABASE } from './supabase'
import { local } from './localStore'
import { fetchAthleteSalaryTriggers } from './athleteQueries'
import type { SalaryTrigger, TriggerMetric } from '../types/athlete-system'

export interface Desempenho {
  id: string
  atleta_id: string
  temporada: string
  competicao: string        // '' = total da temporada
  jogos: number
  gols: number
  assistencias: number
  minutos: number
  fonte: string | null
  atualizado_em?: string
  created_at?: string
  updated_at?: string
}

export type DesempenhoInput = Omit<Desempenho, 'id' | 'atualizado_em' | 'created_at' | 'updated_at'>

export interface GatilhoProgresso {
  gatilho_id: string
  atleta_id: string
  contrato_id: string | null
  description: string
  metric: TriggerMetric
  status: string
  threshold: number | null
  temporada_referencia: string | null
  competicao_referencia: string | null
  valor_desempenho: number | null
  valor_atual: number | null
  valor_apurado: number | null
  fonte_valor: 'MANUAL' | 'DESEMPENHO' | null
  progresso: number | null   // fração (0.9 = 90%)
  atingido: boolean
}

const TABLE = 'ac_desempenho_atleta'
const LOCAL = 'desempenho_atleta'
const LOCAL_TRIGGERS = 'salary_triggers'   // mesmo nome usado por athleteQueries no modo local

function missingTable(e: { code?: string; message?: string }): boolean {
  return e.code === 'PGRST205' || e.code === '42P01' || /schema cache|does not exist/i.test(e.message ?? '')
}

export async function fetchDesempenho(athleteId: string): Promise<Desempenho[]> {
  const sort = (a: Desempenho, b: Desempenho) => b.temporada.localeCompare(a.temporada) || a.competicao.localeCompare(b.competicao)
  if (!USE_SUPABASE) return local.where<Desempenho>(LOCAL, 'atleta_id', athleteId).sort(sort)
  const { data, error } = await supabase.from(TABLE).select('*').eq('atleta_id', athleteId)
  if (error) { if (missingTable(error)) return []; throw error }
  return ((data ?? []) as Desempenho[]).sort(sort)
}

export async function fetchAllDesempenho(): Promise<Desempenho[]> {
  if (!USE_SUPABASE) return local.all<Desempenho>(LOCAL)
  const { data, error } = await supabase.from(TABLE).select('*')
  if (error) { if (missingTable(error)) return []; throw error }
  return (data ?? []) as Desempenho[]
}

function clean(input: DesempenhoInput): DesempenhoInput {
  const int = (v: unknown) => Math.max(0, Math.round(Number(v) || 0))
  return {
    atleta_id: input.atleta_id,
    temporada: String(input.temporada ?? '').trim(),
    competicao: String(input.competicao ?? '').trim(),
    jogos: int(input.jogos), gols: int(input.gols),
    assistencias: int(input.assistencias), minutos: int(input.minutos),
    fonte: input.fonte ?? 'MANUAL',
  }
}

/** Insere ou atualiza pela chave (atleta, temporada, competição). */
export async function upsertDesempenho(input: DesempenhoInput): Promise<Desempenho> {
  const row = clean(input)
  if (!row.atleta_id || !row.temporada) throw new Error('Atleta e temporada são obrigatórios.')
  if (!USE_SUPABASE) {
    const existing = local.where<Desempenho>(LOCAL, 'atleta_id', row.atleta_id)
      .find(r => r.temporada === row.temporada && r.competicao === row.competicao)
    if (existing) return local.update<Desempenho>(LOCAL, existing.id, { ...row, atualizado_em: new Date().toISOString() })
    return local.insert<Desempenho>(LOCAL, { ...row, atualizado_em: new Date().toISOString() })
  }
  const { data, error } = await supabase.from(TABLE).upsert(row, { onConflict: 'atleta_id,temporada,competicao' }).select().single()
  if (error) {
    if (error.code === '42501' || /row-level security/i.test(error.message)) throw new Error('Sem permissão: apenas master e futebol registram desempenho.')
    throw error
  }
  return data as Desempenho
}

export async function deleteDesempenho(id: string): Promise<void> {
  if (!USE_SUPABASE) return local.remove(LOCAL, id)
  const { data, error } = await supabase.from(TABLE).delete().eq('id', id).select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('Sem permissão para excluir (ou registro inexistente).')
}

// ── Progresso de gatilhos ───────────────────────────────────────────────────

const METRIC_FIELD: Partial<Record<TriggerMetric, keyof Pick<Desempenho, 'jogos' | 'gols' | 'assistencias' | 'minutos'>>> = {
  JOGOS: 'jogos', GOLS: 'gols', ASSISTENCIAS: 'assistencias', MINUTOS: 'minutos',
}

/** Valor agregado de desempenho para uma métrica (mesma regra da view 028). */
export function aggregateMetric(rows: Desempenho[], metric: TriggerMetric, temporada: string | null, competicao: string | null): number | null {
  const field = METRIC_FIELD[metric]
  if (!field) return null   // TITULO / OUTRO dependem de valor manual
  const pool = rows.filter(r => temporada == null || r.temporada === temporada)
  if (competicao != null && competicao !== '') {
    const hits = pool.filter(r => r.competicao === competicao)
    return hits.length ? hits.reduce((s, r) => s + (r[field] ?? 0), 0) : null
  }
  const seasons = new Map<string, Desempenho[]>()
  for (const r of pool) seasons.set(r.temporada, [...(seasons.get(r.temporada) ?? []), r])
  if (seasons.size === 0) return null
  let total = 0
  for (const list of seasons.values()) {
    const tot = list.find(r => r.competicao === '')
    total += tot ? tot[field] : list.reduce((s, r) => s + (r[field] ?? 0), 0)
  }
  return total
}

type LocalTrigger = SalaryTrigger & { valor_atual?: number | null; temporada_referencia?: string | null; competicao_referencia?: string | null }

function buildProgress(t: LocalTrigger, perf: Desempenho[]): GatilhoProgresso {
  const temporada = t.temporada_referencia ?? null
  const competicao = t.competicao_referencia ?? null
  const valor_desempenho = aggregateMetric(perf, t.metric, temporada, competicao)
  const valor_atual = t.valor_atual ?? null
  const valor_apurado = valor_atual ?? valor_desempenho
  const progresso = t.threshold && t.threshold > 0 && valor_apurado != null ? valor_apurado / t.threshold : null
  return {
    gatilho_id: t.id, atleta_id: t.athlete_id, contrato_id: t.contract_id,
    description: t.description, metric: t.metric, status: t.status, threshold: t.threshold,
    temporada_referencia: temporada, competicao_referencia: competicao,
    valor_desempenho, valor_atual, valor_apurado,
    fonte_valor: valor_atual != null ? 'MANUAL' : valor_desempenho != null ? 'DESEMPENHO' : null,
    progresso, atingido: progresso != null && progresso >= 1,
  }
}

export async function fetchGatilhosProgresso(athleteId: string): Promise<GatilhoProgresso[]> {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.from('vw_ac_gatilhos_progresso').select('*').eq('atleta_id', athleteId)
    if (!error) return (data ?? []) as GatilhoProgresso[]
    if (!missingTable(error)) throw error
    // View ainda não criada: calcula no cliente com o que existir.
  }
  const [triggers, perf] = await Promise.all([fetchAthleteSalaryTriggers(athleteId), fetchDesempenho(athleteId)])
  return (triggers as LocalTrigger[]).map(t => buildProgress(t, perf))
}

/** Valor apurado manualmente (sobrepõe o desempenho). null volta a usar o desempenho. */
export async function atualizarValorGatilho(triggerId: string, valor: number | null): Promise<void> {
  if (!USE_SUPABASE) { local.update<LocalTrigger>(LOCAL_TRIGGERS, triggerId, { valor_atual: valor }); return }
  const { error } = await supabase.rpc('atualizar_valor_gatilho', { p_id: triggerId, p_valor: valor })
  if (error) {
    if (error.code === '42501') throw new Error('Sem permissão para atualizar o valor do gatilho.')
    throw error
  }
}

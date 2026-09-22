// src/lib/amortizacaoFechamento.ts
// Fechamento mensal (competência) da amortização do intangível — Fase 5.6.
// Backend: seção 029 de docs/CONTRATOS_BACKEND.md (ac_amortizacao_fechamentos,
// chave única (competencia, atleta_id); escrita master/controladoria).
// Modo local: mesma forma de linha no localStore (tabela amortizacao_fechamentos).
//
// O fechamento "congela" os valores calculados pela calculadora (PageAmortizacao)
// para a competência escolhida — re-fechar a mesma competência sobrescreve.

import { supabase, USE_SUPABASE } from './supabase'
import { local } from './localStore'

export interface FechamentoRow {
  id?: string
  competencia: string               // YYYY-MM-01
  atleta_id: string
  valor_intangivel_brl: number
  amortizacao_mes_brl: number
  amortizacao_acumulada_brl: number
  saldo_liquido_brl: number
  ptax_aquisicao: number | null
  detalhes: Record<string, unknown>
  fechado_por?: string | null
  fechado_em?: string
}

const TABLE = 'ac_amortizacao_fechamentos'
const LOCAL = 'amortizacao_fechamentos'

/** 'YYYY-MM' ou 'YYYY-MM-DD' → 'YYYY-MM-01'. */
export function normCompetencia(v: string): string {
  return `${v.slice(0, 7)}-01`
}

/** Último dia do mês da competência (data de corte do cálculo). */
export function fimDaCompetencia(competencia: string): Date {
  const [y, m] = competencia.split('-').map(Number)
  return new Date(y, m, 0)   // dia 0 do mês seguinte
}

export async function fetchFechamentos(): Promise<FechamentoRow[]> {
  if (!USE_SUPABASE) {
    return local.all<FechamentoRow & { id: string }>(LOCAL)
      .sort((a, b) => b.competencia.localeCompare(a.competencia))
  }
  const { data, error } = await supabase.from(TABLE).select('*').order('competencia', { ascending: false })
  if (error) {
    if (error.code === 'PGRST205' || /schema cache/i.test(error.message))
      throw new Error('Tabela de fechamentos não existe — aplique a migration 029_amortizacao_competencia.sql.')
    throw error
  }
  return (data ?? []) as FechamentoRow[]
}

export async function fecharCompetencia(competencia: string, rows: Omit<FechamentoRow, 'competencia'>[]): Promise<number> {
  const comp = normCompetencia(competencia)
  const payload = rows.map(r => ({ ...r, competencia: comp }))
  if (!USE_SUPABASE) {
    local.defer()
    try {
      const existing = local.all<FechamentoRow & { id: string }>(LOCAL).filter(r => r.competencia === comp)
      const byAthlete = new Map(existing.map(r => [r.atleta_id, r]))
      const now = new Date().toISOString()
      for (const r of payload) {
        const cur = byAthlete.get(r.atleta_id)
        if (cur) local.update(LOCAL, cur.id, { ...r, fechado_em: now })
        else local.insert(LOCAL, { ...r, fechado_por: null, fechado_em: now })
      }
    } finally { local.flush() }
    return payload.length
  }
  if (payload.length === 0) return 0
  const { data, error } = await supabase.from(TABLE).upsert(payload, { onConflict: 'competencia,atleta_id' }).select('id')
  if (error) {
    if (error.code === '42501' || /row-level security/i.test(error.message))
      throw new Error('Sem permissão: apenas master e controladoria fecham competência.')
    throw error
  }
  if (!data || data.length === 0) throw new Error('Nenhuma linha gravada (verifique permissões).')
  return data.length
}

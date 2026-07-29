// src/lib/athleteOverview.ts
// Visão consolidada POR ATLETA e POR NATUREZA — a base da tabela expansível.
//
// Uma linha por atleta (o pai) e, ao expandir, uma linha por natureza (salário,
// imagem, luvas, agentes, transferências, gatilhos, acordos, obrigações de
// clube). Cada linha responde, sem abrir a ficha: está em dia? se não, quanto
// está em atraso, desde quando e qual obrigação abrir.

import type {
  Athlete, Clause, ClauseInstallment, ClubLiability, IntermediaryLiability,
  ClauseType, Currency,
} from '../types/athlete-system'
import { daysFromToday, isOverdue } from './format'
import { parseRJ } from './judicialRecovery'

export type NatureKey =
  | 'SALARIO' | 'IMAGEM' | 'LUVAS' | 'AGENTES' | 'TRANSFER' | 'GATILHOS' | 'ACORDOS' | 'CLUBES'

export const NATURE_LABEL: Record<NatureKey, string> = {
  SALARIO:  'Salário CLT',
  IMAGEM:   'Direito de imagem',
  LUVAS:    'Luvas',
  AGENTES:  'Agentes / intermediação',
  TRANSFER: 'Transferências e sell-on',
  GATILHOS: 'Gatilhos e cláusulas diversas',
  ACORDOS:  'Acordos e renegociações',
  CLUBES:   'Obrigações com clubes',
}

/** Ordem fixa das naturezas nas linhas filhas (previsibilidade de leitura). */
export const NATURE_ORDER: NatureKey[] = [
  'SALARIO', 'IMAGEM', 'LUVAS', 'AGENTES', 'TRANSFER', 'GATILHOS', 'ACORDOS', 'CLUBES',
]

const BY_CLAUSE_TYPE: Partial<Record<ClauseType, NatureKey>> = {
  SALARIO_CETD: 'SALARIO',
  DIREITO_IMAGEM: 'IMAGEM',
  LUVAS: 'LUVAS',
  INTERMEDIACAO: 'AGENTES',
  INTERMEDIACAO_VENDA_FUTURA: 'AGENTES',
  TRANSFER_FEE_FIXO: 'TRANSFER',
  TRANSFER_FEE_VARIAVEL: 'TRANSFER',
  SELL_ON_FEE: 'TRANSFER',
  SELL_ON_FEE_RECEBER: 'TRANSFER',
  EMPRESTIMO_TAXA: 'TRANSFER',
  PERCENTUAL_VENDA_ATLETA: 'TRANSFER',
  SOLIDARIEDADE_FIFA: 'CLUBES',
  ACORDO_RENEGOCIACAO: 'ACORDOS',
  BONUS_PERFORMANCE_ATLETA: 'GATILHOS',
  CLAUSULA_RESCISORIA: 'GATILHOS',
}
const natureOf = (t: ClauseType): NatureKey => BY_CLAUSE_TYPE[t] ?? 'GATILHOS'

const OPEN = ['PENDENTE', 'PARCIALMENTE_PAGA', 'EM_ATRASO', 'VENCIDA']
const APPROX_BRL: Record<string, number> = { BRL: 1, EUR: 6.10, USD: 5.55, GBP: 7.10 }
const toBRL = (v: number, c: Currency) => v * (APPROX_BRL[c] ?? 1)

export type NatureStatus = 'EM_DIA' | 'EM_ATRASO' | 'QUITADO' | 'RENEGOCIADO' | 'SEM_LANCAMENTO'

export interface NatureSummary {
  key: NatureKey
  label: string
  status: NatureStatus
  /** itens (parcelas/obrigações) em aberto e o total aproximado em BRL. */
  openCount: number
  openBRL: number
  /** subtotal em aberto por moeda — evita esconder EUR/USD atrás da conversão. */
  openByCurrency: Partial<Record<Currency, number>>
  /** o que já venceu e não foi pago. */
  overdueCount: number
  overdueBRL: number
  /** vencimento mais antigo em atraso e há quantos dias. */
  oldestOverdue: string | null
  daysLate: number
  nextDue: string | null
  paidCount: number
  totalCount: number
  /** obrigação a abrir ao clicar na linha (a mais atrasada; senão a próxima). */
  focusClauseId: string | null
  /** Valores travados em Recuperação Judicial — saem de "em aberto" e "em atraso"
   *  (viram um bucket próprio para leitura, cálculo e relatórios). */
  rjBRL: number
  rjCount: number
  rjByCurrency: Partial<Record<Currency, number>>
}

export interface AthleteOverview {
  athlete: Athlete
  natures: NatureSummary[]
  openBRL: number
  overdueBRL: number
  overdueCount: number
  daysLate: number
  nextDue: string | null
  /** Exposição travada em Recuperação Judicial (agregada). */
  rjBRL: number
  rjCount: number
  /** pior situação entre as naturezas — define o status da linha do atleta. */
  status: NatureStatus
}

interface Item {
  nature: NatureKey
  clauseId: string | null
  due: string | null
  amount: number
  currency: Currency
  status: string
  /** true quando o item — ou sua cláusula-mãe — foi marcado como RJ. */
  rj: boolean
}

function summarize(key: NatureKey, items: Item[]): NatureSummary {
  const label = NATURE_LABEL[key]
  const empty: NatureSummary = {
    key, label, status: 'SEM_LANCAMENTO', openCount: 0, openBRL: 0, openByCurrency: {},
    overdueCount: 0, overdueBRL: 0, oldestOverdue: null, daysLate: 0, nextDue: null,
    paidCount: 0, totalCount: 0, focusClauseId: null,
    rjBRL: 0, rjCount: 0, rjByCurrency: {},
  }
  if (items.length === 0) return empty
  const openByCurrency: Partial<Record<Currency, number>> = {}
  const rjByCurrency: Partial<Record<Currency, number>> = {}
  let openCount = 0, openBRL = 0, overdueCount = 0, overdueBRL = 0
  let paidCount = 0, canceledCount = 0
  let rjBRL = 0, rjCount = 0
  let oldestOverdue: string | null = null
  let nextDue: string | null = null
  let focusOverdue: string | null = null
  let focusNext: string | null = null

  for (const it of items) {
    if (it.status === 'PAGA') { paidCount++; continue }
    if (it.status === 'CANCELADA') { canceledCount++; continue }
    if (!OPEN.includes(it.status)) continue
    // Regra-mestra do sistema: itens marcados como Recuperação Judicial
    // continuam sendo obrigações, mas SAEM de "em aberto" e "em atraso" —
    // viram um bucket próprio (rjBRL) contabilizado à parte em toda a app.
    if (it.rj) {
      rjCount++
      rjBRL += toBRL(it.amount, it.currency)
      rjByCurrency[it.currency] = (rjByCurrency[it.currency] ?? 0) + it.amount
      continue
    }
    openCount++
    openBRL += toBRL(it.amount, it.currency)
    openByCurrency[it.currency] = (openByCurrency[it.currency] ?? 0) + it.amount
    const late = isOverdue(it.due, it.status)
    if (late && it.due) {
      overdueCount++
      overdueBRL += toBRL(it.amount, it.currency)
      if (!oldestOverdue || it.due < oldestOverdue) { oldestOverdue = it.due; focusOverdue = it.clauseId }
    } else if (it.due) {
      if (!nextDue || it.due < nextDue) { nextDue = it.due; focusNext = it.clauseId }
    } else if (!focusNext) {
      focusNext = it.clauseId
    }
  }

  const status: NatureStatus = overdueCount > 0 ? 'EM_ATRASO'
    : openCount > 0 ? 'EM_DIA'
    : paidCount > 0 ? 'QUITADO'
    : canceledCount > 0 ? 'RENEGOCIADO'   // tudo virou acordo/renegociação
    : rjCount > 0 ? 'EM_DIA'               // só RJ pendente ainda é "em dia"
    : 'SEM_LANCAMENTO'

  return {
    key, label, status, openCount, openBRL, openByCurrency,
    overdueCount, overdueBRL, oldestOverdue,
    daysLate: oldestOverdue ? Math.max(0, -(daysFromToday(oldestOverdue) ?? 0)) : 0,
    nextDue, paidCount, totalCount: items.length,
    focusClauseId: focusOverdue ?? focusNext ?? null,
    rjBRL, rjCount, rjByCurrency,
  }
}

export function buildAthleteOverview({
  athletes, clauses, installments, clubLiabs, intermLiabs,
}: {
  athletes: Athlete[]
  clauses: Clause[]
  installments: ClauseInstallment[]
  clubLiabs: ClubLiability[]
  intermLiabs: IntermediaryLiability[]
}): AthleteOverview[] {
  const clauseById = new Map(clauses.map(c => [c.id, c]))
  const withInst = new Set(installments.map(i => i.clause_id))
  // atleta → natureza → itens
  const byAthlete = new Map<string, Map<NatureKey, Item[]>>()
  const push = (athleteId: string, it: Item) => {
    let m = byAthlete.get(athleteId)
    if (!m) { m = new Map(); byAthlete.set(athleteId, m) }
    const arr = m.get(it.nature)
    if (arr) arr.push(it); else m.set(it.nature, [it])
  }

  // Parcelas (o vencimento real) e cláusulas de pagamento único.
  // Um item vira RJ quando a parcela OU a cláusula-mãe carrega o marcador.
  for (const i of installments) {
    const c = clauseById.get(i.clause_id)
    if (!c) continue
    const rj = !!parseRJ(i.notes) || !!parseRJ(c.notes)
    push(c.athlete_id, {
      nature: natureOf(c.clause_type), clauseId: c.id,
      due: i.due_date, amount: i.original_value, currency: i.currency, status: i.payment_status, rj,
    })
  }
  for (const c of clauses) {
    if (withInst.has(c.id)) continue
    if (c.original_value == null) continue
    push(c.athlete_id, {
      nature: natureOf(c.clause_type), clauseId: c.id,
      due: c.due_date, amount: c.original_value, currency: c.currency, status: c.payment_status,
      rj: !!parseRJ(c.notes),
    })
  }
  // Passivos importados (sem parcelas).
  for (const l of clubLiabs) {
    push(l.athlete_id, {
      nature: 'CLUBES', clauseId: null,
      due: l.due_date, amount: l.amount, currency: l.currency, status: l.status,
      rj: !!parseRJ(l.notes),
    })
  }
  for (const l of intermLiabs) {
    push(l.athlete_id, {
      nature: 'AGENTES', clauseId: null,
      due: l.due_date, amount: l.amount, currency: l.currency, status: l.status,
      rj: !!parseRJ(l.notes),
    })
  }

  return athletes.map(a => {
    const m = byAthlete.get(a.id) ?? new Map<NatureKey, Item[]>()
    const natures = NATURE_ORDER.map(k => summarize(k, m.get(k) ?? []))
    const openBRL = natures.reduce((s, n) => s + n.openBRL, 0)
    const overdueBRL = natures.reduce((s, n) => s + n.overdueBRL, 0)
    const overdueCount = natures.reduce((s, n) => s + n.overdueCount, 0)
    const rjBRL = natures.reduce((s, n) => s + n.rjBRL, 0)
    const rjCount = natures.reduce((s, n) => s + n.rjCount, 0)
    const daysLate = natures.reduce((s, n) => Math.max(s, n.daysLate), 0)
    const nextDue = natures
      .map(n => n.nextDue).filter((d): d is string => !!d)
      .sort()[0] ?? null
    const hasOpen = natures.some(n => n.openCount > 0)
    const hasPaid = natures.some(n => n.paidCount > 0)
    const hasRJ = rjCount > 0
    const status: NatureStatus = overdueCount > 0 ? 'EM_ATRASO'
      : hasOpen || hasRJ ? 'EM_DIA' : hasPaid ? 'QUITADO'
      : natures.some(n => n.status === 'RENEGOCIADO') ? 'RENEGOCIADO'
      : 'SEM_LANCAMENTO'
    return { athlete: a, natures, openBRL, overdueBRL, overdueCount, rjBRL, rjCount, daysLate, nextDue, status }
  })
}

/** Texto curto do atraso ("12 dias", "2 meses e 3 dias"). */
export function lateLabel(days: number): string {
  if (days <= 0) return '—'
  if (days < 31) return `${days} dia${days === 1 ? '' : 's'}`
  const months = Math.floor(days / 30)
  const rest = days % 30
  return rest === 0
    ? `${months} ${months === 1 ? 'mês' : 'meses'}`
    : `${months} ${months === 1 ? 'mês' : 'meses'} e ${rest} dia${rest === 1 ? '' : 's'}`
}

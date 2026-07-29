// src/lib/entityObligations.ts
// Amarração ENTIDADE (clube / agente) → ATLETA → VÍNCULO → OBRIGAÇÃO → PARCELA.
//
// As obrigações de um clube/agente não vivem em uma tabela só: elas vêm de
// (a) cláusulas financeiras cuja contraparte é a entidade — expandidas parcela
// por parcela — e (b) passivos "flat" de clube/agente. A lista e o CARD do
// cadastro precisam contar a MESMA coisa; por isso o cálculo mora aqui e é
// consumido por PageCadastros (contadores) e PageCadastroDetail (tabela).

import type {
  Clause, ClauseInstallment, ClubLiability, IntermediaryLiability,
  Contract, ClauseType, Currency, LiabilityDirection,
} from '../types/athlete-system'
import { norm } from './importHelpers'

export type EntityKind = 'clube' | 'intermediario'

/** Tipos de cláusula cuja contraparte natural é um CLUBE. */
export const CLUB_CLAUSE_TYPES: ClauseType[] = [
  'TRANSFER_FEE_FIXO', 'TRANSFER_FEE_VARIAVEL', 'SELL_ON_FEE', 'SELL_ON_FEE_RECEBER',
  'SOLIDARIEDADE_FIFA', 'EMPRESTIMO_TAXA', 'CLAUSULA_RESCISORIA', 'PERCENTUAL_VENDA_ATLETA',
  'ACORDO_RENEGOCIACAO',
]

/** Tipos de cláusula cuja contraparte natural é um AGENTE / intermediário. */
export const AGENT_CLAUSE_TYPES: ClauseType[] = [
  'INTERMEDIACAO', 'INTERMEDIACAO_VENDA_FUTURA', 'ACORDO_RENEGOCIACAO',
]

export const isBFRparty = (s: string | null | undefined) =>
  !!s && (s.toLowerCase().includes('botafogo') || s.toLowerCase() === 'bfr')

/** Uma linha de obrigação vinculada à entidade — parcela, cláusula ou passivo. */
export interface EntityObligation {
  /** id da linha (parcela, cláusula ou passivo) — único na tabela. */
  id: string
  kind: 'inst' | 'clause' | 'club' | 'agent'
  athlete_id: string
  clauseId: string | null
  contractId: string | null
  natureza: string
  description: string
  direction: LiabilityDirection
  amount: number
  currency: Currency
  due_date: string | null
  status: string
  notes: string | null
}

const OPEN_STATUSES = ['PENDENTE', 'PARCIALMENTE_PAGA', 'EM_ATRASO', 'VENCIDA']
export const isOpenStatus = (s: string) => OPEN_STATUSES.includes(s)

interface BuildArgs {
  entityName: string
  kind: EntityKind
  clauses: Clause[]
  installments: ClauseInstallment[]
  clubLiabs?: ClubLiability[]
  intermLiabs?: IntermediaryLiability[]
  /** Rótulo por tipo de cláusula (CLAUSE_TYPE_LABELS) para a coluna Natureza. */
  labels: Record<string, string>
}

/**
 * Monta TODAS as obrigações ligadas a um clube/agente pelo nome da contraparte.
 * Cláusulas com parcelas viram uma linha por parcela (é o vencimento real);
 * cláusulas sem parcelas viram uma linha única.
 */
export function buildEntityObligations({
  entityName, kind, clauses, installments, clubLiabs = [], intermLiabs = [], labels,
}: BuildArgs): EntityObligation[] {
  const target = norm(entityName)
  if (!target) return []
  const isClube = kind === 'clube'
  const types = isClube ? CLUB_CLAUSE_TYPES : AGENT_CLAUSE_TYPES
  const out: EntityObligation[] = []

  for (const c of clauses) {
    if (!types.includes(c.clause_type)) continue
    const pagar = isBFRparty(c.debtor_party)
    const contraparte = pagar ? c.creditor_party : c.debtor_party
    if (norm(contraparte) !== target) continue
    const direction: LiabilityDirection = pagar ? 'A_PAGAR' : 'A_RECEBER'
    const natureza = labels[c.clause_type] ?? c.clause_type
    const parcelas = installments
      .filter(i => i.clause_id === c.id)
      .sort((a, b) => a.installment_number - b.installment_number)
    if (parcelas.length > 0) {
      for (const p of parcelas) out.push({
        id: p.id, kind: 'inst', athlete_id: c.athlete_id, clauseId: c.id, contractId: c.contract_id,
        natureza, description: `${c.description} — parcela ${p.installment_number}`,
        direction, amount: p.original_value, currency: p.currency,
        due_date: p.due_date, status: p.payment_status, notes: p.notes ?? null,
      })
    } else {
      out.push({
        id: c.id, kind: 'clause', athlete_id: c.athlete_id, clauseId: c.id, contractId: c.contract_id,
        natureza, description: c.description, direction,
        amount: c.original_value ?? 0, currency: c.currency,
        due_date: c.due_date, status: c.payment_status, notes: c.notes ?? null,
      })
    }
  }

  if (isClube) {
    for (const l of clubLiabs) {
      if (norm(l.club_name) !== target) continue
      out.push({
        id: l.id, kind: 'club', athlete_id: l.athlete_id, clauseId: null, contractId: null,
        natureza: l.solidarity ? 'Solidariedade' : 'Obrigação clube',
        description: l.description ?? '—', direction: l.direction,
        amount: l.amount, currency: l.currency, due_date: l.due_date, status: l.status, notes: l.notes ?? null,
      })
    }
  } else {
    for (const l of intermLiabs) {
      if (norm(l.intermediary_name) !== target) continue
      out.push({
        id: l.id, kind: 'agent', athlete_id: l.athlete_id, clauseId: null, contractId: l.contract_id,
        natureza: 'Obrigação agente', description: l.description ?? '—', direction: l.direction,
        amount: l.amount, currency: l.currency, due_date: l.due_date, status: l.status, notes: l.notes ?? null,
      })
    }
  }

  out.sort((a, b) => (a.due_date ?? '9999-99-99').localeCompare(b.due_date ?? '9999-99-99'))
  return out
}

/** Totais por moeda e direção (somente itens em aberto). */
export function obligationTotals(rows: EntityObligation[]) {
  const open: Record<string, number> = {}
  const all: Record<string, number> = {}
  for (const r of rows) {
    const k = `${r.direction}|${r.currency}`
    all[k] = (all[k] ?? 0) + r.amount
    if (isOpenStatus(r.status)) open[k] = (open[k] ?? 0) + r.amount
  }
  return { open, all }
}

/** Contratos (vínculos) em que a entidade é a contraparte. */
export function contractsOfEntity(entityName: string, contracts: Contract[]): Contract[] {
  const target = norm(entityName)
  if (!target) return []
  return contracts
    .filter(c => norm(c.counterpart_club) === target)
    .sort((a, b) => (b.start_date ?? '').localeCompare(a.start_date ?? ''))
}

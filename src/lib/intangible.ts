// src/lib/intangible.ts
// INTANGÍVEL DO ATLETA — custo de aquisição e amortização linear.
//
// O contrato de ENTRADA mais recente compõe o intangível: soma de Transfer Fee
// fixo + Intermediação + Luvas desse contrato, em BRL (PTAX fixada na cláusula
// ou PTAX do dia). A amortização é linear pelo prazo do contrato, contado em
// meses inclusivos; o que ainda não foi amortizado é o valor contábil
// (residual). Outros contratos (empréstimo, agentes etc.) não entram aqui.
//
// Usado pela calculadora de amortização e pelo ranking de salários.

import type { Clause, Contract, Currency } from '../types/athlete-system'
import { toBRL } from './ptax'

// ── Helpers de data / meses ────────────────────────────────────────────────
export function parseISO(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}
export function monthsInclusive(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1
}

export const INTANGIBLE_CLAUSE_TYPES = new Set<Clause['clause_type']>([
  'TRANSFER_FEE_FIXO', 'INTERMEDIACAO', 'LUVAS',
])

export interface IntangibleItem {
  clauseType: Clause['clause_type']
  description: string
  currency: Currency
  originalValue: number
  brl: number
}

export interface AthleteIntangible {
  /** contrato de ENTRADA mais recente (null = atleta sem compra registrada). */
  entryContract: Contract | null
  contractMonths: number
  monthsElapsed: number
  monthsRemaining: number
  intangibleItems: IntangibleItem[]
  intangibleBRL: number             // custo de aquisição em BRL
  monthlyAmortBRL: number           // BRL / mês
  accumAmortBRL: number             // baixado até hoje
  residualBRL: number               // saldo do intangível (valor contábil)
}

/** Intangível do atleta a partir de TODOS os contratos e cláusulas cadastrados. */
export function computeIntangible(
  athleteId: string,
  contracts: Contract[],
  clauses: Clause[],
  ptax: Record<string, number>,
  today: Date = new Date(),
): AthleteIntangible {
  // Contrato de ENTRADA vigente ou mais recente
  const entry = contracts
    .filter(c => c.athlete_id === athleteId)
    .sort((x, y) => (y.start_date ?? '').localeCompare(x.start_date ?? ''))
    .find(c => c.type === 'ENTRADA') ?? null

  const startD = parseISO(entry?.start_date ?? null)
  const endD = parseISO(entry?.end_date ?? null)
  const contractMonths = startD && endD ? Math.max(0, monthsInclusive(startD, endD)) : 0

  let monthsElapsed = 0
  if (startD) {
    const cap = endD && today > endD ? endD : today
    monthsElapsed = Math.max(0, Math.min(contractMonths, monthsInclusive(startD, cap)))
  }
  const monthsRemaining = Math.max(0, contractMonths - monthsElapsed)

  // Cláusulas ligadas ao contrato de entrada
  const intangibleItems = clauses
    .filter(cl => cl.athlete_id === athleteId
      && (entry ? cl.contract_id === entry.id : false)
      && INTANGIBLE_CLAUSE_TYPES.has(cl.clause_type)
      && (cl.original_value ?? 0) > 0)
    .map(cl => ({
      clauseType: cl.clause_type,
      description: cl.description || cl.clause_type,
      currency: cl.currency,
      originalValue: cl.original_value ?? 0,
      brl: cl.fixed_exchange_rate
        ? (cl.original_value ?? 0) * cl.fixed_exchange_rate
        : toBRL(cl.original_value ?? 0, cl.currency, ptax),
    }))
  const intangibleBRL = intangibleItems.reduce((s, it) => s + it.brl, 0)

  const monthlyAmortBRL = contractMonths > 0 ? intangibleBRL / contractMonths : 0
  const accumAmortBRL = Math.min(intangibleBRL, monthlyAmortBRL * monthsElapsed)
  const residualBRL = Math.max(0, intangibleBRL - accumAmortBRL)

  return {
    entryContract: entry,
    contractMonths, monthsElapsed, monthsRemaining,
    intangibleItems, intangibleBRL,
    monthlyAmortBRL, accumAmortBRL, residualBRL,
  }
}

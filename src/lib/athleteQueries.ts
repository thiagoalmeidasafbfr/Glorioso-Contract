// src/lib/athleteQueries.ts
// Camada de acesso a dados para o sistema de gestão de atletas.
// Suporta modo Supabase (USE_SUPABASE=true) e modo mock (USE_SUPABASE=false).

import { supabase, USE_SUPABASE } from './supabase'
import {
  ATHLETES_MOCK, CONTRACTS_MOCK, CLAUSES_MOCK, INSTALLMENTS_MOCK, ALERTS_MOCK,
} from '../data/athletesMock'
import type {
  Athlete, Contract, Clause, ClauseInstallment, Alert,
  NewContractInput, NewClauseInput, PaymentInput,
  AthleteWithStats,
} from '../types/athlete-system'
import { isOverdue, isDueSoon, addMonths, todayISO } from './format'

// ── Athletes ──────────────────────────────────────────────────────────────

export async function fetchAthletes(): Promise<Athlete[]> {
  if (!USE_SUPABASE) return [...ATHLETES_MOCK]
  const { data, error } = await supabase
    .from('athletes')
    .select('*')
    .order('full_name')
  if (error) throw error
  return data
}

export async function fetchAthlete(id: string): Promise<Athlete | null> {
  if (!USE_SUPABASE) return ATHLETES_MOCK.find(a => a.id === id) ?? null
  const { data, error } = await supabase
    .from('athletes')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return null
  return data
}

export async function createAthlete(input: Omit<Athlete, 'id' | 'created_at' | 'updated_at'>): Promise<Athlete> {
  if (!USE_SUPABASE) {
    const a: Athlete = { ...input, id: crypto.randomUUID(), created_at: todayISO(), updated_at: todayISO() }
    ATHLETES_MOCK.push(a)
    return a
  }
  const { data, error } = await supabase.from('athletes').insert(input).select().single()
  if (error) throw error
  return data
}

export async function updateAthlete(id: string, input: Partial<Athlete>): Promise<Athlete> {
  if (!USE_SUPABASE) {
    const idx = ATHLETES_MOCK.findIndex(a => a.id === id)
    if (idx === -1) throw new Error('Atleta não encontrado')
    ATHLETES_MOCK[idx] = { ...ATHLETES_MOCK[idx], ...input, updated_at: todayISO() }
    return ATHLETES_MOCK[idx]
  }
  const { data, error } = await supabase
    .from('athletes').update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id).select().single()
  if (error) throw error
  return data
}

// ── Contracts ─────────────────────────────────────────────────────────────

export async function fetchAthleteContracts(athleteId: string): Promise<Contract[]> {
  if (!USE_SUPABASE) return CONTRACTS_MOCK.filter(c => c.athlete_id === athleteId)
    .sort((a, b) => b.start_date.localeCompare(a.start_date))
  const { data, error } = await supabase
    .from('contracts')
    .select('*')
    .eq('athlete_id', athleteId)
    .order('start_date', { ascending: false })
  if (error) throw error
  return data
}

export async function createContract(athleteId: string, input: NewContractInput): Promise<Contract> {
  const contractData = { ...input, athlete_id: athleteId }
  if (!USE_SUPABASE) {
    const c: Contract = { ...contractData, id: crypto.randomUUID(), created_by: 'usuario', created_at: todayISO(), updated_at: todayISO() }
    CONTRACTS_MOCK.push(c)
    return c
  }
  const { data, error } = await supabase.from('contracts').insert(contractData).select().single()
  if (error) throw error
  return data
}

// ── Clauses ───────────────────────────────────────────────────────────────

export async function fetchAthleteClauses(athleteId: string): Promise<Clause[]> {
  if (!USE_SUPABASE) return CLAUSES_MOCK.filter(c => c.athlete_id === athleteId)
  const { data, error } = await supabase
    .from('clauses')
    .select('*')
    .eq('athlete_id', athleteId)
    .order('due_date', { ascending: true, nullsFirst: false })
  if (error) throw error
  return data
}

export async function fetchContractClauses(contractId: string): Promise<Clause[]> {
  if (!USE_SUPABASE) return CLAUSES_MOCK.filter(c => c.contract_id === contractId)
  const { data, error } = await supabase
    .from('clauses')
    .select('*')
    .eq('contract_id', contractId)
  if (error) throw error
  return data
}

export async function createClause(contractId: string, athleteId: string, input: NewClauseInput): Promise<Clause> {
  const clauseData = { ...input, contract_id: contractId, athlete_id: athleteId }
  if (!USE_SUPABASE) {
    const c: Clause = {
      ...clauseData, id: crypto.randomUUID(),
      installments_paid: 0, achievement_status: 'PENDENTE' as const,
      achievement_date: null, payment_status: 'PENDENTE' as const,
      payment_date: null, amount_paid_currency: null, amount_paid_brl: null,
      exchange_rate: null, created_by: 'usuario',
      created_at: todayISO(), updated_at: todayISO(),
    }
    CLAUSES_MOCK.push(c)
    return c
  }
  const { data, error } = await supabase.from('clauses').insert(clauseData).select().single()
  if (error) throw error
  return data
}

export async function updateClause(id: string, input: Partial<Clause>): Promise<Clause> {
  if (!USE_SUPABASE) {
    const idx = CLAUSES_MOCK.findIndex(c => c.id === id)
    if (idx === -1) throw new Error('Cláusula não encontrada')
    CLAUSES_MOCK[idx] = { ...CLAUSES_MOCK[idx], ...input, updated_at: todayISO() }
    return CLAUSES_MOCK[idx]
  }
  const { data, error } = await supabase
    .from('clauses').update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function registerClausePayment(id: string, payment: PaymentInput): Promise<Clause> {
  return updateClause(id, {
    payment_status: 'PAGA',
    payment_date: payment.payment_date,
    amount_paid_currency: payment.amount_paid_currency,
    amount_paid_brl: payment.amount_paid_brl,
    exchange_rate: payment.exchange_rate,
    notes: payment.notes || undefined,
  })
}

// ── Installments ──────────────────────────────────────────────────────────

export async function fetchAthleteInstallments(athleteId: string): Promise<ClauseInstallment[]> {
  if (!USE_SUPABASE) return INSTALLMENTS_MOCK.filter(i => i.athlete_id === athleteId)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
  const { data, error } = await supabase
    .from('clause_installments')
    .select('*')
    .eq('athlete_id', athleteId)
    .order('due_date', { ascending: true })
  if (error) throw error
  return data
}

export async function fetchClauseInstallments(clauseId: string): Promise<ClauseInstallment[]> {
  if (!USE_SUPABASE) return INSTALLMENTS_MOCK.filter(i => i.clause_id === clauseId)
    .sort((a, b) => a.installment_number - b.installment_number)
  const { data, error } = await supabase
    .from('clause_installments')
    .select('*')
    .eq('clause_id', clauseId)
    .order('installment_number')
  if (error) throw error
  return data
}

export async function createInstallments(clauseId: string, athleteId: string, input: NewClauseInput): Promise<ClauseInstallment[]> {
  const installments: Omit<ClauseInstallment, 'id' | 'created_at' | 'updated_at'>[] = []
  const baseValue = (input.original_value ?? 0) / input.installments_total
  for (let i = 0; i < input.installments_total; i++) {
    installments.push({
      clause_id: clauseId,
      athlete_id: athleteId,
      installment_number: i + 1,
      due_date: addMonths(input.due_date, i),
      original_value: baseValue,
      currency: input.currency,
      payment_status: 'PENDENTE',
      payment_date: null,
      amount_paid_brl: null,
      exchange_rate: null,
      notes: null,
    })
  }

  if (!USE_SUPABASE) {
    const created = installments.map(inst => ({
      ...inst, id: crypto.randomUUID(), created_at: todayISO(), updated_at: todayISO(),
    })) as ClauseInstallment[]
    INSTALLMENTS_MOCK.push(...created)
    return created
  }
  const { data, error } = await supabase.from('clause_installments').insert(installments).select()
  if (error) throw error
  return data
}

export async function registerInstallmentPayment(id: string, payment: PaymentInput): Promise<ClauseInstallment> {
  if (!USE_SUPABASE) {
    const idx = INSTALLMENTS_MOCK.findIndex(i => i.id === id)
    if (idx === -1) throw new Error('Parcela não encontrada')
    INSTALLMENTS_MOCK[idx] = {
      ...INSTALLMENTS_MOCK[idx],
      payment_status: 'PAGA',
      payment_date: payment.payment_date,
      amount_paid_brl: payment.amount_paid_brl,
      exchange_rate: payment.exchange_rate,
      notes: payment.notes || null,
      updated_at: todayISO(),
    }
    return INSTALLMENTS_MOCK[idx]
  }
  const { data, error } = await supabase
    .from('clause_installments')
    .update({ payment_status: 'PAGA', payment_date: payment.payment_date, amount_paid_brl: payment.amount_paid_brl, exchange_rate: payment.exchange_rate, notes: payment.notes, updated_at: new Date().toISOString() })
    .eq('id', id).select().single()
  if (error) throw error
  return data
}

// ── Alerts ────────────────────────────────────────────────────────────────

export async function fetchAthleteAlerts(athleteId: string): Promise<Alert[]> {
  if (!USE_SUPABASE) return ALERTS_MOCK.filter(a => a.athlete_id === athleteId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  const { data, error } = await supabase
    .from('alerts')
    .select('*')
    .eq('athlete_id', athleteId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function fetchAllAlerts(): Promise<Alert[]> {
  if (!USE_SUPABASE) return [...ALERTS_MOCK].sort((a, b) => {
    const sev = { RED: 0, YELLOW: 1, GREEN: 2 }
    if (sev[a.severity] !== sev[b.severity]) return sev[a.severity] - sev[b.severity]
    return b.created_at.localeCompare(a.created_at)
  })
  const { data, error } = await supabase
    .from('alerts')
    .select('*')
    .order('severity')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function markAlertRead(id: string): Promise<void> {
  if (!USE_SUPABASE) {
    const idx = ALERTS_MOCK.findIndex(a => a.id === id)
    if (idx !== -1) ALERTS_MOCK[idx].is_read = true
    return
  }
  await supabase.from('alerts').update({ is_read: true }).eq('id', id)
}

// ── Computed Stats ────────────────────────────────────────────────────────

export async function fetchAthleteWithStats(id: string): Promise<AthleteWithStats | null> {
  const [athlete, clauses, installments] = await Promise.all([
    fetchAthlete(id),
    fetchAthleteClauses(id),
    fetchAthleteInstallments(id),
  ])
  if (!athlete) return null

  const openStatuses = ['PENDENTE', 'PARCIALMENTE_PAGA', 'EM_ATRASO']

  const overdueClauses = clauses.filter(c => isOverdue(c.due_date, c.payment_status))
  const dueSoon = clauses.filter(c => isDueSoon(c.due_date, c.payment_status))
  const overdueInst = installments.filter(i => isOverdue(i.due_date, i.payment_status))
  const dueSoonInst = installments.filter(i => isDueSoon(i.due_date, i.payment_status))

  const overdue_count = overdueClauses.length + overdueInst.length
  const due_soon_count = dueSoon.length + dueSoonInst.length

  // Next due date
  const openDates = [
    ...clauses.filter(c => openStatuses.includes(c.payment_status) && c.due_date).map(c => c.due_date!),
    ...installments.filter(i => openStatuses.includes(i.payment_status)).map(i => i.due_date),
  ].sort()
  const next_due_date = openDates[0] ?? null

  // Financial totals (in original currency)
  // Receivable: Botafogo is creditor
  const total_receivable_brl = clauses
    .filter(c => c.creditor_party.toLowerCase().includes('botafogo') && openStatuses.includes(c.payment_status) && c.original_value)
    .reduce((s, c) => s + (c.original_value ?? 0) * getApproxBRL(c.currency), 0)

  // Payable: Botafogo is debtor
  const total_payable_brl = clauses
    .filter(c => c.debtor_party.toLowerCase().includes('botafogo') && openStatuses.includes(c.payment_status) && c.original_value)
    .reduce((s, c) => s + (c.original_value ?? 0) * getApproxBRL(c.currency), 0)

  return {
    ...athlete,
    active_clauses_count: clauses.filter(c => !['CANCELADA', 'PAGA'].includes(c.payment_status)).length,
    overdue_count,
    due_soon_count,
    next_due_date,
    total_receivable_brl,
    total_payable_brl,
  }
}

// Approximate BRL conversion rates (for display only — use PTAX for actual payments)
function getApproxBRL(currency: string): number {
  const rates: Record<string, number> = { BRL: 1, EUR: 6.10, USD: 5.55, GBP: 7.10 }
  return rates[currency] ?? 1
}

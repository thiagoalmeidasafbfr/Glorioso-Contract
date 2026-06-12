// src/lib/athleteQueries.ts — 100% Supabase, no mock fallback

import { supabase } from './supabase'
import { logChange } from './intermediaryQueries'
import type {
  Athlete, Contract, Clause, ClauseInstallment, Alert,
  NewContractInput, NewClauseInput, PaymentInput,
  AthleteWithStats,
} from '../types/athlete-system'
import { isOverdue, isDueSoon, addMonths } from './format'

// ── Athletes ──────────────────────────────────────────────────────────────

export async function fetchAthletes(): Promise<Athlete[]> {
  const { data, error } = await supabase
    .from('athletes')
    .select('*, intermediaries(id, full_name, company_name)')
    .order('full_name')
  if (error) throw error
  return data
}

export async function fetchAthlete(id: string): Promise<Athlete | null> {
  const { data, error } = await supabase
    .from('athletes')
    .select('*, intermediaries(id, full_name, company_name)')
    .eq('id', id)
    .single()
  if (error) return null
  return data
}

export async function createAthlete(input: Omit<Athlete, 'id' | 'created_at' | 'updated_at'>): Promise<Athlete> {
  const { data, error } = await supabase.from('athletes').insert(input).select().single()
  if (error) throw error
  await logChange(data.id, 'athletes', data.id, 'INSERT', null, data)
  return data
}

export async function updateAthlete(id: string, input: Partial<Athlete>): Promise<Athlete> {
  const old = await fetchAthlete(id)
  const { data, error } = await supabase
    .from('athletes')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id).select().single()
  if (error) throw error
  await logChange(id, 'athletes', id, 'UPDATE', old, data)
  return data
}

// ── Contracts ─────────────────────────────────────────────────────────────

export async function fetchAthleteContracts(athleteId: string): Promise<Contract[]> {
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
  const { data, error } = await supabase.from('contracts').insert(contractData).select().single()
  if (error) throw error
  await logChange(athleteId, 'contracts', data.id, 'INSERT', null, data)
  return data
}

// ── Clauses ───────────────────────────────────────────────────────────────

export async function fetchAthleteClauses(athleteId: string): Promise<Clause[]> {
  const { data, error } = await supabase
    .from('clauses')
    .select('*')
    .eq('athlete_id', athleteId)
    .order('due_date', { ascending: true, nullsFirst: false })
  if (error) throw error
  return data
}

export async function fetchAllClauses(): Promise<Clause[]> {
  const { data, error } = await supabase
    .from('clauses')
    .select('*')
    .order('due_date', { ascending: true, nullsFirst: false })
  if (error) throw error
  return data
}

export async function fetchContractClauses(contractId: string): Promise<Clause[]> {
  const { data, error } = await supabase
    .from('clauses')
    .select('*')
    .eq('contract_id', contractId)
  if (error) throw error
  return data
}

export async function createClause(contractId: string, athleteId: string, input: NewClauseInput): Promise<Clause> {
  const clauseData = {
    ...input, contract_id: contractId, athlete_id: athleteId,
    installments_paid: 0, achievement_status: 'PENDENTE' as const,
    achievement_date: null, payment_status: 'PENDENTE' as const,
    payment_date: null, amount_paid_currency: null, amount_paid_brl: null,
    exchange_rate: null, created_by: null,
  }
  const { data, error } = await supabase.from('clauses').insert(clauseData).select().single()
  if (error) throw error
  await logChange(athleteId, 'clauses', data.id, 'INSERT', null, data)
  return data
}

export async function updateClause(id: string, input: Partial<Clause>): Promise<Clause> {
  const { data: old } = await supabase.from('clauses').select('*').eq('id', id).single()
  const { data, error } = await supabase
    .from('clauses')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id).select().single()
  if (error) throw error
  await logChange(data.athlete_id, 'clauses', id, 'UPDATE', old, data)
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
  const { data, error } = await supabase
    .from('clause_installments')
    .select('*')
    .eq('athlete_id', athleteId)
    .order('due_date', { ascending: true })
  if (error) throw error
  return data
}

export async function fetchAllInstallments(): Promise<ClauseInstallment[]> {
  const { data, error } = await supabase
    .from('clause_installments')
    .select('*')
    .order('due_date', { ascending: true })
  if (error) throw error
  return data
}

export async function fetchClauseInstallments(clauseId: string): Promise<ClauseInstallment[]> {
  const { data, error } = await supabase
    .from('clause_installments')
    .select('*')
    .eq('clause_id', clauseId)
    .order('installment_number')
  if (error) throw error
  return data
}

export async function createInstallments(clauseId: string, athleteId: string, input: NewClauseInput): Promise<ClauseInstallment[]> {
  const baseValue = (input.original_value ?? 0) / input.installments_total
  const installments = Array.from({ length: input.installments_total }, (_, i) => ({
    clause_id: clauseId,
    athlete_id: athleteId,
    installment_number: i + 1,
    due_date: addMonths(input.due_date, i),
    original_value: baseValue,
    currency: input.currency,
    payment_status: 'PENDENTE' as const,
    payment_date: null,
    amount_paid_brl: null,
    exchange_rate: null,
    notes: null,
  }))
  const { data, error } = await supabase.from('clause_installments').insert(installments).select()
  if (error) throw error
  return data
}

export async function registerInstallmentPayment(id: string, payment: PaymentInput): Promise<ClauseInstallment> {
  const { data: old } = await supabase.from('clause_installments').select('*').eq('id', id).single()
  const { data, error } = await supabase
    .from('clause_installments')
    .update({
      payment_status: 'PAGA',
      payment_date: payment.payment_date,
      amount_paid_brl: payment.amount_paid_brl,
      exchange_rate: payment.exchange_rate,
      notes: payment.notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id).select().single()
  if (error) throw error
  if (old) await logChange(data.athlete_id, 'clause_installments', id, 'UPDATE', old, data)
  return data
}

// ── Alerts ────────────────────────────────────────────────────────────────

export async function fetchAthleteAlerts(athleteId: string): Promise<Alert[]> {
  const { data, error } = await supabase
    .from('alerts')
    .select('*')
    .eq('athlete_id', athleteId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function fetchAllAlerts(): Promise<Alert[]> {
  const { data, error } = await supabase
    .from('alerts')
    .select('*')
    .order('severity')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function markAlertRead(id: string): Promise<void> {
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
  const overdue_count =
    clauses.filter(c => isOverdue(c.due_date, c.payment_status)).length +
    installments.filter(i => isOverdue(i.due_date, i.payment_status)).length
  const due_soon_count =
    clauses.filter(c => isDueSoon(c.due_date, c.payment_status)).length +
    installments.filter(i => isDueSoon(i.due_date, i.payment_status)).length

  const openDates = [
    ...clauses.filter(c => openStatuses.includes(c.payment_status) && c.due_date).map(c => c.due_date!),
    ...installments.filter(i => openStatuses.includes(i.payment_status)).map(i => i.due_date),
  ].sort()

  const rates: Record<string, number> = { BRL: 1, EUR: 6.10, USD: 5.55, GBP: 7.10 }
  const toBRL = (v: number, cur: string) => v * (rates[cur] ?? 1)

  const total_receivable_brl = clauses
    .filter(c => c.creditor_party.toLowerCase().includes('botafogo') && openStatuses.includes(c.payment_status) && c.original_value)
    .reduce((s, c) => s + toBRL(c.original_value ?? 0, c.currency), 0)

  const total_payable_brl = clauses
    .filter(c => c.debtor_party.toLowerCase().includes('botafogo') && openStatuses.includes(c.payment_status) && c.original_value)
    .reduce((s, c) => s + toBRL(c.original_value ?? 0, c.currency), 0)

  return {
    ...athlete,
    active_clauses_count: clauses.filter(c => !['CANCELADA', 'PAGA'].includes(c.payment_status)).length,
    overdue_count,
    due_soon_count,
    next_due_date: openDates[0] ?? null,
    total_receivable_brl,
    total_payable_brl,
  }
}

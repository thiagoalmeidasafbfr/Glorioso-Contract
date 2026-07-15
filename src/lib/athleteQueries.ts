// src/lib/athleteQueries.ts
// Camada de acesso a dados do sistema de gestão de atletas.
//
// Dois backends, MESMA API:
//   • Supabase  → quando VITE_USE_SUPABASE === 'true' (fonte da verdade em prod).
//   • localStore → caso contrário (navegador), começando SEM nenhum dado
//     fabricado. Não há mais "mock data": o que existir foi cadastrado ou
//     importado pelo usuário.
//
// O atleta é a figura central: contratos, cláusulas, parcelas, titularidade,
// gatilhos salariais, passivos (clube/intermediário) e direito de imagem são
// todos entidades-filhas com athlete_id.

import { supabase, USE_SUPABASE } from './supabase'
import { local } from './localStore'
import type {
  Athlete, Contract, Clause, ClauseInstallment, Alert, EconomicRight,
  SalaryTrigger, ClubLiability, IntermediaryLiability, ImageRight,
  Club, Intermediary, NewClubInput, NewIntermediaryInput,
  NewContractInput, NewClauseInput, PaymentInput, NewEconomicRightInput,
  NewSalaryTriggerInput, NewClubLiabilityInput, NewIntermediaryLiabilityInput,
  NewImageRightInput, AthleteWithStats,
} from '../types/athlete-system'
import { isOverdue, isDueSoon, addMonths } from './format'

// Nomes das tabelas (compartilhados por Supabase e localStore).
const T = {
  athletes: 'athletes',
  contracts: 'contracts',
  clauses: 'clauses',
  installments: 'clause_installments',
  alerts: 'alerts',
  economicRights: 'athlete_economic_rights',
  salaryTriggers: 'salary_triggers',
  clubLiabilities: 'club_liabilities',
  intermediaryLiabilities: 'intermediary_liabilities',
  imageRights: 'image_rights',
  clubs: 'clubs',
  intermediaries: 'intermediaries',
} as const

// ── Clubs (cadastro) ────────────────────────────────────────────────────────

export async function fetchClubs(): Promise<Club[]> {
  if (!USE_SUPABASE) return local.all<Club>(T.clubs).sort((a, b) => a.name.localeCompare(b.name))
  const { data, error } = await supabase.from(T.clubs).select('*').order('name')
  if (error) throw error
  return data
}

export async function fetchClub(id: string): Promise<Club | null> {
  if (!USE_SUPABASE) return local.find<Club>(T.clubs, id)
  const { data, error } = await supabase.from(T.clubs).select('*').eq('id', id).single()
  if (error) return null
  return data
}

export async function createClub(input: NewClubInput): Promise<Club> {
  const row = { name: input.name, country: input.country || null, logo_url: input.logo_url, notes: input.notes || null }
  if (!USE_SUPABASE) return local.insert<Club>(T.clubs, row)
  const { data, error } = await supabase.from(T.clubs).insert(row).select().single()
  if (error) throw error
  return data
}

export async function updateClub(id: string, input: Partial<Club>): Promise<Club> {
  if (!USE_SUPABASE) return local.update<Club>(T.clubs, id, input)
  const { data, error } = await supabase.from(T.clubs).update({ ...input, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteClub(id: string): Promise<void> {
  if (!USE_SUPABASE) return local.remove(T.clubs, id)
  const { error } = await supabase.from(T.clubs).delete().eq('id', id)
  if (error) throw error
}

// ── Intermediaries (cadastro) ────────────────────────────────────────────────

export async function fetchIntermediaries(): Promise<Intermediary[]> {
  if (!USE_SUPABASE) return local.all<Intermediary>(T.intermediaries).sort((a, b) => a.name.localeCompare(b.name))
  const { data, error } = await supabase.from(T.intermediaries).select('*').order('name')
  if (error) throw error
  return data
}

export async function fetchIntermediary(id: string): Promise<Intermediary | null> {
  if (!USE_SUPABASE) return local.find<Intermediary>(T.intermediaries, id)
  const { data, error } = await supabase.from(T.intermediaries).select('*').eq('id', id).single()
  if (error) return null
  return data
}

export async function createIntermediary(input: NewIntermediaryInput): Promise<Intermediary> {
  const row = { name: input.name, contact: input.contact || null, logo_url: input.logo_url, notes: input.notes || null }
  if (!USE_SUPABASE) return local.insert<Intermediary>(T.intermediaries, row)
  const { data, error } = await supabase.from(T.intermediaries).insert(row).select().single()
  if (error) throw error
  return data
}

export async function updateIntermediary(id: string, input: Partial<Intermediary>): Promise<Intermediary> {
  if (!USE_SUPABASE) return local.update<Intermediary>(T.intermediaries, id, input)
  const { data, error } = await supabase.from(T.intermediaries).update({ ...input, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteIntermediary(id: string): Promise<void> {
  if (!USE_SUPABASE) return local.remove(T.intermediaries, id)
  const { error } = await supabase.from(T.intermediaries).delete().eq('id', id)
  if (error) throw error
}

// ── Athletes ──────────────────────────────────────────────────────────────

export async function fetchAthletes(): Promise<Athlete[]> {
  if (!USE_SUPABASE) return local.all<Athlete>(T.athletes).sort((a, b) => a.full_name.localeCompare(b.full_name))
  const { data, error } = await supabase.from(T.athletes).select('*').order('full_name')
  if (error) throw error
  return data
}

export async function fetchAthlete(id: string): Promise<Athlete | null> {
  if (!USE_SUPABASE) return local.find<Athlete>(T.athletes, id)
  const { data, error } = await supabase.from(T.athletes).select('*').eq('id', id).single()
  if (error) return null
  return data
}

export async function createAthlete(input: Omit<Athlete, 'id' | 'created_at' | 'updated_at'>): Promise<Athlete> {
  if (!USE_SUPABASE) return local.insert<Athlete>(T.athletes, input)
  const { data, error } = await supabase.from(T.athletes).insert(input).select().single()
  if (error) throw error
  return data
}

export async function updateAthlete(id: string, input: Partial<Athlete>): Promise<Athlete> {
  if (!USE_SUPABASE) return local.update<Athlete>(T.athletes, id, input)
  const { data, error } = await supabase
    .from(T.athletes).update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id).select().single()
  if (error) throw error
  return data
}

// ── Economic Rights (titularidade) ──────────────────────────────────────────

export async function fetchAthleteEconomicRights(athleteId: string): Promise<EconomicRight[]> {
  if (!USE_SUPABASE) return local.where<EconomicRight>(T.economicRights, 'athlete_id', athleteId)
  const { data, error } = await supabase.from(T.economicRights).select('*').eq('athlete_id', athleteId).order('created_at')
  if (error) throw error
  return data
}

export async function fetchAllEconomicRights(): Promise<EconomicRight[]> {
  if (!USE_SUPABASE) return local.all<EconomicRight>(T.economicRights)
  const { data, error } = await supabase.from(T.economicRights).select('*')
  if (error) throw error
  return data
}

export async function createEconomicRight(athleteId: string, input: NewEconomicRightInput): Promise<EconomicRight> {
  const row = {
    athlete_id: athleteId,
    holder_type: input.holder_type,
    holder_name: input.holder_name || null,
    percentage: input.percentage,
    notes: input.notes || null,
  }
  if (!USE_SUPABASE) return local.insert<EconomicRight>(T.economicRights, row)
  const { data, error } = await supabase.from(T.economicRights).insert(row).select().single()
  if (error) throw error
  return data
}

export async function updateEconomicRight(id: string, input: Partial<EconomicRight>): Promise<EconomicRight> {
  if (!USE_SUPABASE) return local.update<EconomicRight>(T.economicRights, id, input)
  const { data, error } = await supabase
    .from(T.economicRights).update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteEconomicRight(id: string): Promise<void> {
  if (!USE_SUPABASE) return local.remove(T.economicRights, id)
  const { error } = await supabase.from(T.economicRights).delete().eq('id', id)
  if (error) throw error
}

// ── Contracts ─────────────────────────────────────────────────────────────

export async function fetchAthleteContracts(athleteId: string): Promise<Contract[]> {
  if (!USE_SUPABASE) return local.where<Contract>(T.contracts, 'athlete_id', athleteId)
    .sort((a, b) => b.start_date.localeCompare(a.start_date))
  const { data, error } = await supabase.from(T.contracts).select('*').eq('athlete_id', athleteId).order('start_date', { ascending: false })
  if (error) throw error
  return data
}

export async function fetchAllContracts(): Promise<Contract[]> {
  if (!USE_SUPABASE) return local.all<Contract>(T.contracts)
  const { data, error } = await supabase.from(T.contracts).select('*')
  if (error) throw error
  return data
}

export async function createContract(athleteId: string, input: NewContractInput): Promise<Contract> {
  const row = { ...input, athlete_id: athleteId, created_by: 'usuario' }
  if (!USE_SUPABASE) return local.insert<Contract>(T.contracts, row)
  const { data, error } = await supabase.from(T.contracts).insert({ ...input, athlete_id: athleteId }).select().single()
  if (error) throw error
  return data
}

export async function updateContract(id: string, input: Partial<Contract>): Promise<Contract> {
  if (!USE_SUPABASE) return local.update<Contract>(T.contracts, id, input)
  const { data, error } = await supabase
    .from(T.contracts).update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id).select().single()
  if (error) throw error
  return data
}

// ── Salary Triggers (mudança salarial por meta) ─────────────────────────────

export async function fetchAthleteSalaryTriggers(athleteId: string): Promise<SalaryTrigger[]> {
  if (!USE_SUPABASE) return local.where<SalaryTrigger>(T.salaryTriggers, 'athlete_id', athleteId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
  const { data, error } = await supabase.from(T.salaryTriggers).select('*').eq('athlete_id', athleteId).order('created_at')
  if (error) throw error
  return data
}

export async function fetchAllSalaryTriggers(): Promise<SalaryTrigger[]> {
  if (!USE_SUPABASE) return local.all<SalaryTrigger>(T.salaryTriggers)
  const { data, error } = await supabase.from(T.salaryTriggers).select('*')
  if (error) throw error
  return data
}

export async function createSalaryTrigger(athleteId: string, input: NewSalaryTriggerInput): Promise<SalaryTrigger> {
  const row = {
    athlete_id: athleteId,
    contract_id: input.contract_id,
    description: input.description,
    metric: input.metric,
    threshold: input.threshold,
    new_salary: input.new_salary,
    currency: input.currency,
    status: 'PENDENTE' as const,
    achieved_date: null,
    notes: input.notes || null,
  }
  if (!USE_SUPABASE) return local.insert<SalaryTrigger>(T.salaryTriggers, row)
  const { data, error } = await supabase.from(T.salaryTriggers).insert(row).select().single()
  if (error) throw error
  return data
}

export async function updateSalaryTrigger(id: string, input: Partial<SalaryTrigger>): Promise<SalaryTrigger> {
  if (!USE_SUPABASE) return local.update<SalaryTrigger>(T.salaryTriggers, id, input)
  const { data, error } = await supabase
    .from(T.salaryTriggers).update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id).select().single()
  if (error) throw error
  return data
}

/** Marca uma meta como atingida numa data — o salário muda a partir dela. */
export async function markTriggerAchieved(id: string, achievedDate: string): Promise<SalaryTrigger> {
  return updateSalaryTrigger(id, { status: 'ATINGIDA', achieved_date: achievedDate })
}

/** Reverte a meta para pendente (desfaz a mudança salarial). */
export async function resetTrigger(id: string): Promise<SalaryTrigger> {
  return updateSalaryTrigger(id, { status: 'PENDENTE', achieved_date: null })
}

export async function deleteSalaryTrigger(id: string): Promise<void> {
  if (!USE_SUPABASE) return local.remove(T.salaryTriggers, id)
  const { error } = await supabase.from(T.salaryTriggers).delete().eq('id', id)
  if (error) throw error
}

// ── Club Liabilities (passivos com clube, ligados ao atleta) ────────────────

export async function fetchAthleteClubLiabilities(athleteId: string): Promise<ClubLiability[]> {
  if (!USE_SUPABASE) return local.where<ClubLiability>(T.clubLiabilities, 'athlete_id', athleteId)
  const { data, error } = await supabase.from(T.clubLiabilities).select('*').eq('athlete_id', athleteId).order('due_date', { nullsFirst: false })
  if (error) throw error
  return data
}

export async function fetchAllClubLiabilities(): Promise<ClubLiability[]> {
  if (!USE_SUPABASE) return local.all<ClubLiability>(T.clubLiabilities)
  const { data, error } = await supabase.from(T.clubLiabilities).select('*')
  if (error) throw error
  return data
}

export async function createClubLiability(athleteId: string, input: NewClubLiabilityInput): Promise<ClubLiability> {
  const row = {
    athlete_id: athleteId,
    club_name: input.club_name,
    description: input.description || null,
    direction: input.direction,
    amount: input.amount,
    currency: input.currency,
    due_date: input.due_date,
    conditional: input.conditional,
    condition_description: input.condition_description || null,
    solidarity: input.solidarity,
    status: input.status,
    settled_date: null,
    notes: input.notes || null,
  }
  if (!USE_SUPABASE) return local.insert<ClubLiability>(T.clubLiabilities, row)
  const { data, error } = await supabase.from(T.clubLiabilities).insert(row).select().single()
  if (error) throw error
  return data
}

export async function updateClubLiability(id: string, input: Partial<ClubLiability>): Promise<ClubLiability> {
  if (!USE_SUPABASE) return local.update<ClubLiability>(T.clubLiabilities, id, input)
  const { data, error } = await supabase
    .from(T.clubLiabilities).update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteClubLiability(id: string): Promise<void> {
  if (!USE_SUPABASE) return local.remove(T.clubLiabilities, id)
  const { error } = await supabase.from(T.clubLiabilities).delete().eq('id', id)
  if (error) throw error
}

// ── Intermediary Liabilities (passivos com intermediário) ───────────────────

export async function fetchAthleteIntermediaryLiabilities(athleteId: string): Promise<IntermediaryLiability[]> {
  if (!USE_SUPABASE) return local.where<IntermediaryLiability>(T.intermediaryLiabilities, 'athlete_id', athleteId)
  const { data, error } = await supabase.from(T.intermediaryLiabilities).select('*').eq('athlete_id', athleteId).order('due_date', { nullsFirst: false })
  if (error) throw error
  return data
}

export async function fetchAllIntermediaryLiabilities(): Promise<IntermediaryLiability[]> {
  if (!USE_SUPABASE) return local.all<IntermediaryLiability>(T.intermediaryLiabilities)
  const { data, error } = await supabase.from(T.intermediaryLiabilities).select('*')
  if (error) throw error
  return data
}

export async function createIntermediaryLiability(athleteId: string, input: NewIntermediaryLiabilityInput): Promise<IntermediaryLiability> {
  const row = {
    athlete_id: athleteId,
    intermediary_name: input.intermediary_name,
    description: input.description || null,
    direction: input.direction,
    amount: input.amount,
    currency: input.currency,
    due_date: input.due_date,
    conditional: input.conditional,
    condition_description: input.condition_description || null,
    penalty_terms: input.penalty_terms || null,
    status: input.status,
    settled_date: null,
    notes: input.notes || null,
  }
  if (!USE_SUPABASE) return local.insert<IntermediaryLiability>(T.intermediaryLiabilities, row)
  const { data, error } = await supabase.from(T.intermediaryLiabilities).insert(row).select().single()
  if (error) throw error
  return data
}

export async function updateIntermediaryLiability(id: string, input: Partial<IntermediaryLiability>): Promise<IntermediaryLiability> {
  if (!USE_SUPABASE) return local.update<IntermediaryLiability>(T.intermediaryLiabilities, id, input)
  const { data, error } = await supabase
    .from(T.intermediaryLiabilities).update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteIntermediaryLiability(id: string): Promise<void> {
  if (!USE_SUPABASE) return local.remove(T.intermediaryLiabilities, id)
  const { error } = await supabase.from(T.intermediaryLiabilities).delete().eq('id', id)
  if (error) throw error
}

// ── Image Rights (direito de imagem, parcelas mensais) ──────────────────────

export async function fetchAthleteImageRights(athleteId: string): Promise<ImageRight[]> {
  if (!USE_SUPABASE) return local.where<ImageRight>(T.imageRights, 'athlete_id', athleteId)
    .sort((a, b) => a.month.localeCompare(b.month))
  const { data, error } = await supabase.from(T.imageRights).select('*').eq('athlete_id', athleteId).order('month')
  if (error) throw error
  return data
}

export async function fetchAllImageRights(): Promise<ImageRight[]> {
  if (!USE_SUPABASE) return local.all<ImageRight>(T.imageRights)
  const { data, error } = await supabase.from(T.imageRights).select('*')
  if (error) throw error
  return data
}

export async function createImageRight(athleteId: string, input: NewImageRightInput): Promise<ImageRight> {
  const row = {
    athlete_id: athleteId,
    month: input.month,
    amount: input.amount,
    currency: input.currency,
    status: input.status,
    paid_date: null,
    notes: input.notes || null,
  }
  if (!USE_SUPABASE) return local.insert<ImageRight>(T.imageRights, row)
  const { data, error } = await supabase.from(T.imageRights).insert(row).select().single()
  if (error) throw error
  return data
}

export async function updateImageRight(id: string, input: Partial<ImageRight>): Promise<ImageRight> {
  if (!USE_SUPABASE) return local.update<ImageRight>(T.imageRights, id, input)
  const { data, error } = await supabase
    .from(T.imageRights).update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteImageRight(id: string): Promise<void> {
  if (!USE_SUPABASE) return local.remove(T.imageRights, id)
  const { error } = await supabase.from(T.imageRights).delete().eq('id', id)
  if (error) throw error
}

// ── Clauses ───────────────────────────────────────────────────────────────

export async function fetchAthleteClauses(athleteId: string): Promise<Clause[]> {
  if (!USE_SUPABASE) return local.where<Clause>(T.clauses, 'athlete_id', athleteId)
  const { data, error } = await supabase.from(T.clauses).select('*').eq('athlete_id', athleteId).order('due_date', { ascending: true, nullsFirst: false })
  if (error) throw error
  return data
}

export async function fetchAllClauses(): Promise<Clause[]> {
  if (!USE_SUPABASE) return local.all<Clause>(T.clauses)
  const { data, error } = await supabase.from(T.clauses).select('*')
  if (error) throw error
  return data
}

export async function fetchContractClauses(contractId: string): Promise<Clause[]> {
  if (!USE_SUPABASE) return local.where<Clause>(T.clauses, 'contract_id', contractId)
  const { data, error } = await supabase.from(T.clauses).select('*').eq('contract_id', contractId)
  if (error) throw error
  return data
}

export async function createClause(contractId: string, athleteId: string, input: NewClauseInput): Promise<Clause> {
  const row = {
    ...input, contract_id: contractId, athlete_id: athleteId,
    installments_paid: 0, achievement_status: 'PENDENTE' as const,
    achievement_date: null, payment_status: 'PENDENTE' as const,
    payment_date: null, amount_paid_currency: null, amount_paid_brl: null,
    exchange_rate: null, created_by: 'usuario',
  }
  if (!USE_SUPABASE) return local.insert<Clause>(T.clauses, row)
  const { data, error } = await supabase.from(T.clauses).insert({ ...input, contract_id: contractId, athlete_id: athleteId }).select().single()
  if (error) throw error
  return data
}

export async function updateClause(id: string, input: Partial<Clause>): Promise<Clause> {
  if (!USE_SUPABASE) return local.update<Clause>(T.clauses, id, input)
  const { data, error } = await supabase
    .from(T.clauses).update({ ...input, updated_at: new Date().toISOString() })
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
  if (!USE_SUPABASE) return local.where<ClauseInstallment>(T.installments, 'athlete_id', athleteId)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
  const { data, error } = await supabase.from(T.installments).select('*').eq('athlete_id', athleteId).order('due_date', { ascending: true })
  if (error) throw error
  return data
}

export async function fetchAllInstallments(): Promise<ClauseInstallment[]> {
  if (!USE_SUPABASE) return local.all<ClauseInstallment>(T.installments)
  const { data, error } = await supabase.from(T.installments).select('*')
  if (error) throw error
  return data
}

export async function fetchClauseInstallments(clauseId: string): Promise<ClauseInstallment[]> {
  if (!USE_SUPABASE) return local.where<ClauseInstallment>(T.installments, 'clause_id', clauseId)
    .sort((a, b) => a.installment_number - b.installment_number)
  const { data, error } = await supabase.from(T.installments).select('*').eq('clause_id', clauseId).order('installment_number')
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
  if (!USE_SUPABASE) return local.insertMany<ClauseInstallment>(T.installments, installments)
  const { data, error } = await supabase.from(T.installments).insert(installments).select()
  if (error) throw error
  return data
}

export async function registerInstallmentPayment(id: string, payment: PaymentInput): Promise<ClauseInstallment> {
  const patch = {
    payment_status: 'PAGA' as const,
    payment_date: payment.payment_date,
    amount_paid_brl: payment.amount_paid_brl,
    exchange_rate: payment.exchange_rate,
    notes: payment.notes || null,
  }
  if (!USE_SUPABASE) return local.update<ClauseInstallment>(T.installments, id, patch)
  const { data, error } = await supabase
    .from(T.installments).update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id).select().single()
  if (error) throw error
  return data
}

// ── Alerts ────────────────────────────────────────────────────────────────

export async function fetchAthleteAlerts(athleteId: string): Promise<Alert[]> {
  if (!USE_SUPABASE) return local.where<Alert>(T.alerts, 'athlete_id', athleteId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  const { data, error } = await supabase.from(T.alerts).select('*').eq('athlete_id', athleteId).order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function fetchAllAlerts(): Promise<Alert[]> {
  const sev = { RED: 0, YELLOW: 1, GREEN: 2 }
  if (!USE_SUPABASE) return local.all<Alert>(T.alerts).sort((a, b) => {
    if (sev[a.severity] !== sev[b.severity]) return sev[a.severity] - sev[b.severity]
    return b.created_at.localeCompare(a.created_at)
  })
  const { data, error } = await supabase.from(T.alerts).select('*').order('severity').order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function markAlertRead(id: string): Promise<void> {
  if (!USE_SUPABASE) { local.update<Alert>(T.alerts, id, { is_read: true }); return }
  const { error } = await supabase.from(T.alerts).update({ is_read: true }).eq('id', id)
  if (error) throw error
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

  const openDates = [
    ...clauses.filter(c => openStatuses.includes(c.payment_status) && c.due_date).map(c => c.due_date!),
    ...installments.filter(i => openStatuses.includes(i.payment_status)).map(i => i.due_date),
  ].sort()
  const next_due_date = openDates[0] ?? null

  const total_receivable_brl = clauses
    .filter(c => c.creditor_party.toLowerCase().includes('botafogo') && openStatuses.includes(c.payment_status) && c.original_value)
    .reduce((s, c) => s + (c.original_value ?? 0) * getApproxBRL(c.currency), 0)

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

// Conversão aproximada p/ BRL (somente exibição — use PTAX p/ pagamentos reais).
function getApproxBRL(currency: string): number {
  const rates: Record<string, number> = { BRL: 1, EUR: 6.10, USD: 5.55, GBP: 7.10 }
  return rates[currency] ?? 1
}

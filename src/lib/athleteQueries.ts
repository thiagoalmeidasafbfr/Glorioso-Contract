// src/lib/athleteQueries.ts
// Camada de acesso a dados do sistema de gestão de atletas.
//
// Dois backends, MESMA API (mesmos tipos "achatados" consumidos pelas páginas):
//   • Supabase  → quando VITE_USE_SUPABASE === 'true'. A partir da migração 014,
//     grava/lê no schema ATLETA-CENTRAL (tabelas `ac_*`). Esta camada faz o
//     mapeamento entre os tipos do app (Athlete, Contract, Clause, ...) e as
//     linhas `ac_*` — as páginas/componentes não mudam.
//   • localStore → caso contrário (navegador), começando SEM nenhum dado
//     fabricado. Mantém as formas "achatadas" no localStorage (inalterado).
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
  NewImageRightInput, AthleteWithStats, AthletePJ, NewAthletePJInput, Currency,
} from '../types/athlete-system'
import { isOverdue, isDueSoon, addMonths } from './format'

// Nomes das tabelas no localStore (modo navegador — formas legadas "achatadas").
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
  athletePjs: 'athlete_pjs',
  clubs: 'clubs',
  intermediaries: 'intermediaries',
} as const

// Nomes das tabelas no Supabase (schema atleta-central, migrações 012 + 014).
const AC = {
  athletes: 'ac_atletas',
  entidades: 'ac_entidades',
  pjs: 'ac_entidades_pj_imagem',
  contracts: 'ac_contratos',
  clauses: 'ac_clausulas_fin',
  installments: 'ac_parcelas_fin',
  titular: 'ac_titularidade_economica',
  clubLiab: 'ac_passivos_clube',
  interLiab: 'ac_passivos_agente',
  image: 'ac_direitos_imagem',
  triggers: 'ac_gatilhos_salario',
  alerts: 'ac_alertas',
} as const

// Supabase rejeita string vazia em colunas date/numeric. Converte '' → null em
// todo payload de escrita (o modo local aceita ambos). Recursivo p/ arrays.
function nn<T>(v: T): T {
  if (Array.isArray(v)) return v.map(x => nn(x)) as unknown as T
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, val]) => [k, val === '' ? null : val]),
    ) as T
  }
  return v
}

// ── Mapeadores app-shape ↔ linhas ac_* (SOMENTE no backend Supabase) ─────────
// A maioria das entidades difere do legado apenas nas FKs (athlete_id → atleta_id,
// contract_id → contrato_id, clause_id → clausula_fin_id, installment_id →
// parcela_fin_id). Os dois helpers genéricos cuidam disso; as demais (atleta,
// contrato, clube, agente, PJ) têm mapeadores dedicados.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>

function toAcFK(patch: Row): Row {
  const o: Row = { ...patch }
  if ('athlete_id' in o) { o.atleta_id = o.athlete_id; delete o.athlete_id }
  if ('contract_id' in o) { o.contrato_id = o.contract_id; delete o.contract_id }
  if ('clause_id' in o) { o.clausula_fin_id = o.clause_id; delete o.clause_id }
  if ('installment_id' in o) { o.parcela_fin_id = o.installment_id; delete o.installment_id }
  return o
}
function fromAcFK<R>(r: Row): R {
  const o: Row = { ...r }
  if ('atleta_id' in o) { o.athlete_id = o.atleta_id; delete o.atleta_id }
  if ('contrato_id' in o) { o.contract_id = o.contrato_id; delete o.contrato_id }
  if ('clausula_fin_id' in o) { o.clause_id = o.clausula_fin_id; delete o.clausula_fin_id }
  if ('parcela_fin_id' in o) { o.installment_id = o.parcela_fin_id; delete o.parcela_fin_id }
  return o as R
}

// Status do atleta: legado (DESLIGADO) ↔ robusto (LIBERADO); LESIONADO→ATIVO na leitura.
function acAthleteStatus(s: string): string { return s === 'DESLIGADO' ? 'LIBERADO' : s }
function appAthleteStatus(s: string): Athlete['current_status'] {
  if (s === 'LIBERADO') return 'DESLIGADO'
  if (s === 'LESIONADO') return 'ATIVO'
  return s as Athlete['current_status']
}

function fromAcAthlete(r: Row): Athlete {
  return {
    id: r.id, external_ref: r.external_ref ?? null,
    full_name: r.nome_completo, short_name: r.nome,
    birth_date: r.data_nascimento ?? null, nationality: r.nacionalidade ?? null,
    cpf: r.cpf ?? null, passport_number: r.passaporte ?? null,
    agent_name: r.agente_nome ?? null, agent_contact: r.agente_contato ?? null,
    current_status: appAthleteStatus(r.status),
    category: (r.categoria ?? 'PROFISSIONAL'),
    position: r.posicao ?? null,
    profile_photo_url: r.foto_url ?? null,
    notes: r.observacoes ?? null,
    created_at: r.created_at, updated_at: r.updated_at,
  }
}
function toAcAthlete(a: Partial<Athlete>): Row {
  const o: Row = {}
  if (a.full_name !== undefined) o.nome_completo = a.full_name
  if (a.short_name !== undefined) o.nome = a.short_name
  if (a.birth_date !== undefined) o.data_nascimento = a.birth_date
  if (a.nationality !== undefined) o.nacionalidade = a.nationality
  if (a.cpf !== undefined) o.cpf = a.cpf
  if (a.passport_number !== undefined) o.passaporte = a.passport_number
  if (a.agent_name !== undefined) o.agente_nome = a.agent_name
  if (a.agent_contact !== undefined) o.agente_contato = a.agent_contact
  if (a.current_status !== undefined) o.status = acAthleteStatus(a.current_status)
  if (a.category !== undefined) o.categoria = a.category
  if (a.position !== undefined) o.posicao = a.position
  if (a.profile_photo_url !== undefined) o.foto_url = a.profile_photo_url
  if (a.notes !== undefined) o.observacoes = a.notes
  if (a.external_ref !== undefined) o.external_ref = a.external_ref
  return o
}

const CONTRACT_TIPO_ROBUSTO: Record<string, string> = {
  ENTRADA: 'AQUISICAO', SAIDA: 'VENDA',
  EMPRESTIMO_SAIDA: 'EMPRESTIMO', EMPRESTIMO_ENTRADA: 'EMPRESTIMO',
}
function fromAcContract(r: Row): Contract {
  return {
    id: r.id, athlete_id: r.atleta_id,
    type: (r.subtipo_legado ?? 'ENTRADA'),
    counterpart_club: r.contraparte_nome ?? '',
    counterpart_country: r.contraparte_pais ?? null,
    start_date: r.data_inicio, end_date: r.data_fim ?? null,
    status: r.status,
    transfer_fee_gross: r.transfer_fee_gross ?? null,
    transfer_currency: r.transfer_currency ?? 'EUR',
    base_salary: r.base_salary ?? null,
    salary_currency: r.salary_currency ?? 'BRL',
    image_value: r.image_value ?? null,
    other_value: r.other_value ?? null,
    description: r.descricao ?? null,
    created_by: r.created_by ?? null,
    created_at: r.created_at, updated_at: r.updated_at,
  }
}
function toAcContract(c: Partial<Contract>): Row {
  const o: Row = {}
  if (c.athlete_id !== undefined) o.atleta_id = c.athlete_id
  if (c.type !== undefined) { o.tipo = CONTRACT_TIPO_ROBUSTO[c.type] ?? 'AQUISICAO'; o.subtipo_legado = c.type }
  if (c.counterpart_club !== undefined) o.contraparte_nome = c.counterpart_club
  if (c.counterpart_country !== undefined) o.contraparte_pais = c.counterpart_country
  if (c.start_date !== undefined) o.data_inicio = c.start_date
  if (c.end_date !== undefined) o.data_fim = c.end_date
  if (c.status !== undefined) o.status = c.status
  if (c.transfer_fee_gross !== undefined) o.transfer_fee_gross = c.transfer_fee_gross
  if (c.transfer_currency !== undefined) o.transfer_currency = c.transfer_currency
  if (c.base_salary !== undefined) o.base_salary = c.base_salary
  if (c.salary_currency !== undefined) o.salary_currency = c.salary_currency
  if (c.image_value !== undefined) o.image_value = c.image_value
  if (c.other_value !== undefined) o.other_value = c.other_value
  if (c.description !== undefined) o.descricao = c.description
  if (c.created_by !== undefined) o.created_by = c.created_by
  return o
}

function fromAcClub(r: Row): Club {
  return {
    id: r.id, external_ref: r.external_ref ?? null,
    name: r.nome, country: r.pais ?? null,
    logo_url: r.logo_url ?? null, notes: r.observacoes ?? null,
    created_at: r.created_at, updated_at: r.updated_at,
  }
}
function toAcClub(c: Partial<Club>): Row {
  const o: Row = {}
  if (c.name !== undefined) o.nome = c.name
  if (c.country !== undefined) o.pais = c.country
  if (c.logo_url !== undefined) o.logo_url = c.logo_url
  if (c.notes !== undefined) o.observacoes = c.notes
  if (c.external_ref !== undefined) o.external_ref = c.external_ref
  return o
}
function fromAcInter(r: Row): Intermediary {
  return {
    id: r.id, external_ref: r.external_ref ?? null,
    name: r.nome, contact: r.contato ?? null,
    logo_url: r.logo_url ?? null, notes: r.observacoes ?? null,
    created_at: r.created_at, updated_at: r.updated_at,
  }
}
function toAcInter(c: Partial<Intermediary>): Row {
  const o: Row = {}
  if (c.name !== undefined) o.nome = c.name
  if (c.contact !== undefined) o.contato = c.contact
  if (c.logo_url !== undefined) o.logo_url = c.logo_url
  if (c.notes !== undefined) o.observacoes = c.notes
  if (c.external_ref !== undefined) o.external_ref = c.external_ref
  return o
}

// ── Clubs (cadastro) ────────────────────────────────────────────────────────

export async function fetchClubs(): Promise<Club[]> {
  if (!USE_SUPABASE) return local.all<Club>(T.clubs).sort((a, b) => a.name.localeCompare(b.name))
  const { data, error } = await supabase.from(AC.entidades).select('*').in('tipo', ['CLUBE', 'CLUBE_PROPRIO']).order('nome')
  if (error) throw error
  return data.map(fromAcClub)
}

export async function fetchClub(id: string): Promise<Club | null> {
  if (!USE_SUPABASE) return local.find<Club>(T.clubs, id)
  const { data, error } = await supabase.from(AC.entidades).select('*').eq('id', id).single()
  if (error) return null
  return fromAcClub(data)
}

export async function createClub(input: NewClubInput): Promise<Club> {
  const row = { name: input.name, country: input.country || null, logo_url: input.logo_url, notes: input.notes || null, external_ref: input.external_ref ?? null }
  if (!USE_SUPABASE) return local.insert<Club>(T.clubs, row)
  const { data, error } = await supabase.from(AC.entidades).insert(nn({ ...toAcClub(row), tipo: 'CLUBE' })).select().single()
  if (error) throw error
  return fromAcClub(data)
}

export async function updateClub(id: string, input: Partial<Club>): Promise<Club> {
  if (!USE_SUPABASE) return local.update<Club>(T.clubs, id, input)
  const { data, error } = await supabase.from(AC.entidades).update(nn(toAcClub(input))).eq('id', id).select().single()
  if (error) throw error
  return fromAcClub(data)
}

export async function deleteClub(id: string): Promise<void> {
  if (!USE_SUPABASE) return local.remove(T.clubs, id)
  const { error } = await supabase.from(AC.entidades).delete().eq('id', id)
  if (error) throw error
}

// ── Intermediaries (cadastro) ────────────────────────────────────────────────

export async function fetchIntermediaries(): Promise<Intermediary[]> {
  if (!USE_SUPABASE) return local.all<Intermediary>(T.intermediaries).sort((a, b) => a.name.localeCompare(b.name))
  const { data, error } = await supabase.from(AC.entidades).select('*').eq('tipo', 'AGENTE').order('nome')
  if (error) throw error
  return data.map(fromAcInter)
}

export async function fetchIntermediary(id: string): Promise<Intermediary | null> {
  if (!USE_SUPABASE) return local.find<Intermediary>(T.intermediaries, id)
  const { data, error } = await supabase.from(AC.entidades).select('*').eq('id', id).single()
  if (error) return null
  return fromAcInter(data)
}

export async function createIntermediary(input: NewIntermediaryInput): Promise<Intermediary> {
  const row = { name: input.name, contact: input.contact || null, logo_url: input.logo_url, notes: input.notes || null, external_ref: input.external_ref ?? null }
  if (!USE_SUPABASE) return local.insert<Intermediary>(T.intermediaries, row)
  const { data, error } = await supabase.from(AC.entidades).insert(nn({ ...toAcInter(row), tipo: 'AGENTE' })).select().single()
  if (error) throw error
  return fromAcInter(data)
}

export async function updateIntermediary(id: string, input: Partial<Intermediary>): Promise<Intermediary> {
  if (!USE_SUPABASE) return local.update<Intermediary>(T.intermediaries, id, input)
  const { data, error } = await supabase.from(AC.entidades).update(nn(toAcInter(input))).eq('id', id).select().single()
  if (error) throw error
  return fromAcInter(data)
}

export async function deleteIntermediary(id: string): Promise<void> {
  if (!USE_SUPABASE) return local.remove(T.intermediaries, id)
  const { error } = await supabase.from(AC.entidades).delete().eq('id', id)
  if (error) throw error
}

// ── Athletes ──────────────────────────────────────────────────────────────

export async function fetchAthletes(): Promise<Athlete[]> {
  if (!USE_SUPABASE) return local.all<Athlete>(T.athletes).sort((a, b) => a.full_name.localeCompare(b.full_name))
  const { data, error } = await supabase.from(AC.athletes).select('*').order('nome_completo')
  if (error) throw error
  return data.map(fromAcAthlete)
}

export async function fetchAthlete(id: string): Promise<Athlete | null> {
  if (!USE_SUPABASE) return local.find<Athlete>(T.athletes, id)
  const { data, error } = await supabase.from(AC.athletes).select('*').eq('id', id).single()
  if (error) return null
  return fromAcAthlete(data)
}

// category é opcional na entrada (default 'PROFISSIONAL') para não quebrar os
// importadores legados; a UI sempre informa o valor escolhido.
export async function createAthlete(
  input: Omit<Athlete, 'id' | 'created_at' | 'updated_at' | 'category'> & { category?: Athlete['category'] },
): Promise<Athlete> {
  const row = { ...input, category: input.category ?? 'PROFISSIONAL' }
  if (!USE_SUPABASE) return local.insert<Athlete>(T.athletes, row)
  const { data, error } = await supabase.from(AC.athletes).insert(nn(toAcAthlete(row))).select().single()
  if (error) throw error
  return fromAcAthlete(data)
}

export async function updateAthlete(id: string, input: Partial<Athlete>): Promise<Athlete> {
  if (!USE_SUPABASE) return local.update<Athlete>(T.athletes, id, input)
  const { data, error } = await supabase.from(AC.athletes).update(nn(toAcAthlete(input))).eq('id', id).select().single()
  if (error) throw error
  return fromAcAthlete(data)
}

// ── Economic Rights (titularidade) ──────────────────────────────────────────

export async function fetchAthleteEconomicRights(athleteId: string): Promise<EconomicRight[]> {
  if (!USE_SUPABASE) return local.where<EconomicRight>(T.economicRights, 'athlete_id', athleteId)
  const { data, error } = await supabase.from(AC.titular).select('*').eq('atleta_id', athleteId).order('created_at')
  if (error) throw error
  return data.map(r => fromAcFK<EconomicRight>(r))
}

export async function fetchAllEconomicRights(): Promise<EconomicRight[]> {
  if (!USE_SUPABASE) return local.all<EconomicRight>(T.economicRights)
  const { data, error } = await supabase.from(AC.titular).select('*')
  if (error) throw error
  return data.map(r => fromAcFK<EconomicRight>(r))
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
  const { data, error } = await supabase.from(AC.titular).insert(nn(toAcFK(row))).select().single()
  if (error) throw error
  return fromAcFK<EconomicRight>(data)
}

export async function updateEconomicRight(id: string, input: Partial<EconomicRight>): Promise<EconomicRight> {
  if (!USE_SUPABASE) return local.update<EconomicRight>(T.economicRights, id, input)
  const { data, error } = await supabase.from(AC.titular).update(nn(toAcFK(input))).eq('id', id).select().single()
  if (error) throw error
  return fromAcFK<EconomicRight>(data)
}

export async function deleteEconomicRight(id: string): Promise<void> {
  if (!USE_SUPABASE) return local.remove(T.economicRights, id)
  const { error } = await supabase.from(AC.titular).delete().eq('id', id)
  if (error) throw error
}

// ── Contracts ─────────────────────────────────────────────────────────────

export async function fetchAthleteContracts(athleteId: string): Promise<Contract[]> {
  if (!USE_SUPABASE) return local.where<Contract>(T.contracts, 'athlete_id', athleteId)
    .sort((a, b) => b.start_date.localeCompare(a.start_date))
  const { data, error } = await supabase.from(AC.contracts).select('*').eq('atleta_id', athleteId).order('data_inicio', { ascending: false })
  if (error) throw error
  return data.map(fromAcContract)
}

export async function fetchAllContracts(): Promise<Contract[]> {
  if (!USE_SUPABASE) return local.all<Contract>(T.contracts)
  const { data, error } = await supabase.from(AC.contracts).select('*')
  if (error) throw error
  return data.map(fromAcContract)
}

export async function createContract(athleteId: string, input: NewContractInput): Promise<Contract> {
  const row = { ...input, athlete_id: athleteId, created_by: 'usuario' }
  if (!USE_SUPABASE) return local.insert<Contract>(T.contracts, row)
  const { data, error } = await supabase.from(AC.contracts).insert(nn(toAcContract(row))).select().single()
  if (error) throw error
  return fromAcContract(data)
}

export async function updateContract(id: string, input: Partial<Contract>): Promise<Contract> {
  if (!USE_SUPABASE) return local.update<Contract>(T.contracts, id, input)
  const { data, error } = await supabase.from(AC.contracts).update(nn(toAcContract(input))).eq('id', id).select().single()
  if (error) throw error
  return fromAcContract(data)
}

// Propaga a moeda do vínculo para os fluxos gerados: salário/imagem seguem a
// salary_currency; transfer fee segue a transfer_currency. Atualiza a cláusula
// e todas as suas parcelas. Idempotente (só mexe onde a moeda difere).
export async function updateContractFlowsCurrency(
  contractId: string, salaryCurrency: Currency, transferCurrency: Currency,
): Promise<void> {
  const clauses = await fetchContractClauses(contractId)
  for (const c of clauses) {
    let cur: Currency | null = null
    if (c.clause_type === 'SALARIO_CETD' || c.clause_type === 'DIREITO_IMAGEM') cur = salaryCurrency
    else if (c.clause_type === 'TRANSFER_FEE_FIXO' || c.clause_type === 'TRANSFER_FEE_VARIAVEL' || c.clause_type === 'EMPRESTIMO_TAXA') cur = transferCurrency
    if (!cur || cur === c.currency) continue
    await updateClause(c.id, { currency: cur })
    if (!USE_SUPABASE) {
      for (const inst of local.where<ClauseInstallment>(T.installments, 'clause_id', c.id)) local.update<ClauseInstallment>(T.installments, inst.id, { currency: cur })
    } else {
      const { error } = await supabase.from(AC.installments).update({ currency: cur, updated_at: new Date().toISOString() }).eq('clausula_fin_id', c.id)
      if (error) throw error
    }
  }
}

export async function deleteContract(id: string): Promise<void> {
  if (!USE_SUPABASE) {
    // Remove o contrato e suas cláusulas/parcelas dependentes.
    const cls = local.where<Clause>(T.clauses, 'contract_id', id)
    for (const c of cls) {
      for (const inst of local.where<ClauseInstallment>(T.installments, 'clause_id', c.id)) local.remove(T.installments, inst.id)
      local.remove(T.clauses, c.id)
    }
    return local.remove(T.contracts, id)
  }
  // Supabase: FK on delete cascade em ac_clausulas_fin/ac_parcelas_fin cobre o resto.
  const { error } = await supabase.from(AC.contracts).delete().eq('id', id)
  if (error) throw error
}

// ── Salary Triggers (mudança salarial por meta) ─────────────────────────────

export async function fetchAthleteSalaryTriggers(athleteId: string): Promise<SalaryTrigger[]> {
  if (!USE_SUPABASE) return local.where<SalaryTrigger>(T.salaryTriggers, 'athlete_id', athleteId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
  const { data, error } = await supabase.from(AC.triggers).select('*').eq('atleta_id', athleteId).order('created_at')
  if (error) throw error
  return data.map(r => fromAcFK<SalaryTrigger>(r))
}

export async function fetchAllSalaryTriggers(): Promise<SalaryTrigger[]> {
  if (!USE_SUPABASE) return local.all<SalaryTrigger>(T.salaryTriggers)
  const { data, error } = await supabase.from(AC.triggers).select('*')
  if (error) throw error
  return data.map(r => fromAcFK<SalaryTrigger>(r))
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
  const { data, error } = await supabase.from(AC.triggers).insert(nn(toAcFK(row))).select().single()
  if (error) throw error
  return fromAcFK<SalaryTrigger>(data)
}

export async function updateSalaryTrigger(id: string, input: Partial<SalaryTrigger>): Promise<SalaryTrigger> {
  if (!USE_SUPABASE) return local.update<SalaryTrigger>(T.salaryTriggers, id, input)
  const { data, error } = await supabase.from(AC.triggers).update(nn(toAcFK(input))).eq('id', id).select().single()
  if (error) throw error
  return fromAcFK<SalaryTrigger>(data)
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
  const { error } = await supabase.from(AC.triggers).delete().eq('id', id)
  if (error) throw error
}

// ── Club Liabilities (passivos com clube, ligados ao atleta) ────────────────

export async function fetchAthleteClubLiabilities(athleteId: string): Promise<ClubLiability[]> {
  if (!USE_SUPABASE) return local.where<ClubLiability>(T.clubLiabilities, 'athlete_id', athleteId)
  const { data, error } = await supabase.from(AC.clubLiab).select('*').eq('atleta_id', athleteId).order('due_date', { nullsFirst: false })
  if (error) throw error
  return data.map(r => fromAcFK<ClubLiability>(r))
}

export async function fetchAllClubLiabilities(): Promise<ClubLiability[]> {
  if (!USE_SUPABASE) return local.all<ClubLiability>(T.clubLiabilities)
  const { data, error } = await supabase.from(AC.clubLiab).select('*')
  if (error) throw error
  return data.map(r => fromAcFK<ClubLiability>(r))
}

export async function createClubLiability(athleteId: string, input: NewClubLiabilityInput): Promise<ClubLiability> {
  const row = {
    athlete_id: athleteId,
    source_key: input.source_key ?? null,
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
  const { data, error } = await supabase.from(AC.clubLiab).insert(nn(toAcFK(row))).select().single()
  if (error) throw error
  return fromAcFK<ClubLiability>(data)
}

export async function updateClubLiability(id: string, input: Partial<ClubLiability>): Promise<ClubLiability> {
  if (!USE_SUPABASE) return local.update<ClubLiability>(T.clubLiabilities, id, input)
  const { data, error } = await supabase.from(AC.clubLiab).update(nn(toAcFK(input))).eq('id', id).select().single()
  if (error) throw error
  return fromAcFK<ClubLiability>(data)
}

export async function deleteClubLiability(id: string): Promise<void> {
  if (!USE_SUPABASE) return local.remove(T.clubLiabilities, id)
  const { error } = await supabase.from(AC.clubLiab).delete().eq('id', id)
  if (error) throw error
}

// ── Intermediary Liabilities (passivos com intermediário) ───────────────────

export async function fetchAthleteIntermediaryLiabilities(athleteId: string): Promise<IntermediaryLiability[]> {
  if (!USE_SUPABASE) return local.where<IntermediaryLiability>(T.intermediaryLiabilities, 'athlete_id', athleteId)
  const { data, error } = await supabase.from(AC.interLiab).select('*').eq('atleta_id', athleteId).order('due_date', { nullsFirst: false })
  if (error) throw error
  return data.map(r => fromAcFK<IntermediaryLiability>(r))
}

export async function fetchAllIntermediaryLiabilities(): Promise<IntermediaryLiability[]> {
  if (!USE_SUPABASE) return local.all<IntermediaryLiability>(T.intermediaryLiabilities)
  const { data, error } = await supabase.from(AC.interLiab).select('*')
  if (error) throw error
  return data.map(r => fromAcFK<IntermediaryLiability>(r))
}

export async function createIntermediaryLiability(athleteId: string, input: NewIntermediaryLiabilityInput): Promise<IntermediaryLiability> {
  const row = {
    athlete_id: athleteId,
    contract_id: input.contract_id ?? null,
    source_key: input.source_key ?? null,
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
  const { data, error } = await supabase.from(AC.interLiab).insert(nn(toAcFK(row))).select().single()
  if (error) throw error
  return fromAcFK<IntermediaryLiability>(data)
}

export async function updateIntermediaryLiability(id: string, input: Partial<IntermediaryLiability>): Promise<IntermediaryLiability> {
  if (!USE_SUPABASE) return local.update<IntermediaryLiability>(T.intermediaryLiabilities, id, input)
  const { data, error } = await supabase.from(AC.interLiab).update(nn(toAcFK(input))).eq('id', id).select().single()
  if (error) throw error
  return fromAcFK<IntermediaryLiability>(data)
}

export async function deleteIntermediaryLiability(id: string): Promise<void> {
  if (!USE_SUPABASE) return local.remove(T.intermediaryLiabilities, id)
  const { error } = await supabase.from(AC.interLiab).delete().eq('id', id)
  if (error) throw error
}

// ── Image Rights (direito de imagem, parcelas mensais) ──────────────────────

export async function fetchAthleteImageRights(athleteId: string): Promise<ImageRight[]> {
  if (!USE_SUPABASE) return local.where<ImageRight>(T.imageRights, 'athlete_id', athleteId)
    .sort((a, b) => a.month.localeCompare(b.month))
  const { data, error } = await supabase.from(AC.image).select('*').eq('atleta_id', athleteId).order('month')
  if (error) throw error
  return data.map(r => fromAcFK<ImageRight>(r))
}

export async function fetchAllImageRights(): Promise<ImageRight[]> {
  if (!USE_SUPABASE) return local.all<ImageRight>(T.imageRights)
  const { data, error } = await supabase.from(AC.image).select('*')
  if (error) throw error
  return data.map(r => fromAcFK<ImageRight>(r))
}

export async function createImageRight(athleteId: string, input: NewImageRightInput): Promise<ImageRight> {
  const row = {
    athlete_id: athleteId,
    pj_id: input.pj_id ?? null,
    source_key: input.source_key ?? null,
    month: input.month,
    amount: input.amount,
    currency: input.currency,
    status: input.status,
    paid_date: null,
    notes: input.notes || null,
  }
  if (!USE_SUPABASE) return local.insert<ImageRight>(T.imageRights, row)
  const { data, error } = await supabase.from(AC.image).insert(nn(toAcFK(row))).select().single()
  if (error) throw error
  return fromAcFK<ImageRight>(data)
}

// Cria várias parcelas de direito de imagem de uma vez (uma por mês). Usado ao
// criar um vínculo com valor de imagem mensal: gera 1 parcela por mês de vigência.
export async function createImageRights(athleteId: string, inputs: NewImageRightInput[]): Promise<ImageRight[]> {
  if (inputs.length === 0) return []
  const rows = inputs.map(input => ({
    athlete_id: athleteId,
    pj_id: input.pj_id ?? null,
    source_key: input.source_key ?? null,
    month: input.month,
    amount: input.amount,
    currency: input.currency,
    status: input.status,
    paid_date: null,
    notes: input.notes || null,
  }))
  if (!USE_SUPABASE) return local.insertMany<ImageRight>(T.imageRights, rows)
  const { data, error } = await supabase.from(AC.image).insert(nn(rows.map(toAcFK))).select()
  if (error) throw error
  return data.map(r => fromAcFK<ImageRight>(r))
}

export async function updateImageRight(id: string, input: Partial<ImageRight>): Promise<ImageRight> {
  if (!USE_SUPABASE) return local.update<ImageRight>(T.imageRights, id, input)
  const { data, error } = await supabase.from(AC.image).update(nn(toAcFK(input))).eq('id', id).select().single()
  if (error) throw error
  return fromAcFK<ImageRight>(data)
}

export async function deleteImageRight(id: string): Promise<void> {
  if (!USE_SUPABASE) return local.remove(T.imageRights, id)
  const { error } = await supabase.from(AC.image).delete().eq('id', id)
  if (error) throw error
}

// ── Athlete PJs (pessoa jurídica; recebem o direito de imagem) ──────────────
// No schema robusto uma PJ é uma ac_entidades (tipo=PJ_IMAGEM) + a extensão
// ac_entidades_pj_imagem (atleta_id, cnpj). O id da PJ é o id da entidade.

function fromAcPJ(ent: Row, ext: Row): AthletePJ {
  return {
    id: ent.id, athlete_id: ext.atleta_id,
    legal_name: ent.nome, cnpj: ext.cnpj ?? null, notes: ent.observacoes ?? null,
    created_at: ent.created_at, updated_at: ent.updated_at,
  }
}

async function loadPJs(filter: { athleteId?: string }): Promise<AthletePJ[]> {
  let q = supabase.from(AC.pjs).select('entidade_id, atleta_id, cnpj')
  if (filter.athleteId) q = q.eq('atleta_id', filter.athleteId)
  const { data: exts, error: e1 } = await q
  if (e1) throw e1
  if (!exts || exts.length === 0) return []
  const ids = exts.map(e => e.entidade_id)
  const { data: ents, error: e2 } = await supabase.from(AC.entidades).select('*').in('id', ids)
  if (e2) throw e2
  const entById = new Map((ents ?? []).map(e => [e.id, e]))
  return exts
    .map(ext => { const ent = entById.get(ext.entidade_id); return ent ? fromAcPJ(ent, ext) : null })
    .filter((p): p is AthletePJ => p !== null)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
}

export async function fetchAthletePJs(athleteId: string): Promise<AthletePJ[]> {
  if (!USE_SUPABASE) return local.where<AthletePJ>(T.athletePjs, 'athlete_id', athleteId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
  return loadPJs({ athleteId })
}

export async function fetchAllPJs(): Promise<AthletePJ[]> {
  if (!USE_SUPABASE) return local.all<AthletePJ>(T.athletePjs)
  return loadPJs({})
}

export async function createPJ(athleteId: string, input: NewAthletePJInput): Promise<AthletePJ> {
  const row = {
    athlete_id: athleteId,
    legal_name: input.legal_name,
    cnpj: input.cnpj || null,
    notes: input.notes || null,
  }
  if (!USE_SUPABASE) return local.insert<AthletePJ>(T.athletePjs, row)
  const { data: ent, error: e1 } = await supabase.from(AC.entidades)
    .insert(nn({ tipo: 'PJ_IMAGEM', nome: input.legal_name, observacoes: input.notes || null })).select().single()
  if (e1) throw e1
  const { error: e2 } = await supabase.from(AC.pjs)
    .insert(nn({ entidade_id: ent.id, atleta_id: athleteId, cnpj: input.cnpj || null }))
  if (e2) throw e2
  return fromAcPJ(ent, { atleta_id: athleteId, cnpj: input.cnpj || null })
}

export async function updatePJ(id: string, input: Partial<AthletePJ>): Promise<AthletePJ> {
  if (!USE_SUPABASE) return local.update<AthletePJ>(T.athletePjs, id, input)
  const entPatch: Row = {}
  if (input.legal_name !== undefined) entPatch.nome = input.legal_name
  if (input.notes !== undefined) entPatch.observacoes = input.notes
  if (Object.keys(entPatch).length) {
    const { error } = await supabase.from(AC.entidades).update(nn(entPatch)).eq('id', id)
    if (error) throw error
  }
  if (input.cnpj !== undefined) {
    const { error } = await supabase.from(AC.pjs).update(nn({ cnpj: input.cnpj })).eq('entidade_id', id)
    if (error) throw error
  }
  const { data: ent, error: e1 } = await supabase.from(AC.entidades).select('*').eq('id', id).single()
  if (e1) throw e1
  const { data: ext, error: e2 } = await supabase.from(AC.pjs).select('atleta_id, cnpj').eq('entidade_id', id).single()
  if (e2) throw e2
  return fromAcPJ(ent, ext)
}

export async function deletePJ(id: string): Promise<void> {
  if (!USE_SUPABASE) return local.remove(T.athletePjs, id)
  // Apaga a entidade; a extensão pj_imagem cai por cascata e image_rights.pj_id → null.
  const { error } = await supabase.from(AC.entidades).delete().eq('id', id)
  if (error) throw error
}

// ── Clauses ───────────────────────────────────────────────────────────────

function fromAcClause(r: Row): Clause { return fromAcFK<Clause>(r) }

export async function fetchAthleteClauses(athleteId: string): Promise<Clause[]> {
  if (!USE_SUPABASE) return local.where<Clause>(T.clauses, 'athlete_id', athleteId)
  const { data, error } = await supabase.from(AC.clauses).select('*').eq('atleta_id', athleteId).order('due_date', { ascending: true, nullsFirst: false })
  if (error) throw error
  return data.map(fromAcClause)
}

export async function fetchAllClauses(): Promise<Clause[]> {
  if (!USE_SUPABASE) return local.all<Clause>(T.clauses)
  const { data, error } = await supabase.from(AC.clauses).select('*')
  if (error) throw error
  return data.map(fromAcClause)
}

export async function fetchContractClauses(contractId: string): Promise<Clause[]> {
  if (!USE_SUPABASE) return local.where<Clause>(T.clauses, 'contract_id', contractId)
  const { data, error } = await supabase.from(AC.clauses).select('*').eq('contrato_id', contractId)
  if (error) throw error
  return data.map(fromAcClause)
}

export async function createClause(contractId: string | null, athleteId: string, input: NewClauseInput): Promise<Clause> {
  const row = {
    ...input, contract_id: contractId, athlete_id: athleteId,
    source_key: (input as { source_key?: string | null }).source_key ?? null,
    installments_paid: 0, achievement_status: 'PENDENTE' as const,
    achievement_date: null, payment_status: 'PENDENTE' as const,
    payment_date: null, amount_paid_currency: null, amount_paid_brl: null,
    exchange_rate: null, created_by: 'usuario',
  }
  if (!USE_SUPABASE) return local.insert<Clause>(T.clauses, row)
  const { data, error } = await supabase.from(AC.clauses).insert(nn(toAcFK(row))).select().single()
  if (error) throw error
  return fromAcClause(data)
}

export async function updateClause(id: string, input: Partial<Clause>): Promise<Clause> {
  if (!USE_SUPABASE) return local.update<Clause>(T.clauses, id, input)
  const { data, error } = await supabase.from(AC.clauses).update(nn(toAcFK(input))).eq('id', id).select().single()
  if (error) throw error
  return fromAcClause(data)
}

export async function deleteClause(id: string): Promise<void> {
  if (!USE_SUPABASE) {
    for (const inst of local.where<ClauseInstallment>(T.installments, 'clause_id', id)) local.remove(T.installments, inst.id)
    return local.remove(T.clauses, id)
  }
  // Supabase: FK on delete cascade em ac_parcelas_fin cobre as parcelas.
  const { error } = await supabase.from(AC.clauses).delete().eq('id', id)
  if (error) throw error
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
  const { data, error } = await supabase.from(AC.installments).select('*').eq('atleta_id', athleteId).order('due_date', { ascending: true })
  if (error) throw error
  return data.map(r => fromAcFK<ClauseInstallment>(r))
}

export async function fetchAllInstallments(): Promise<ClauseInstallment[]> {
  if (!USE_SUPABASE) return local.all<ClauseInstallment>(T.installments)
  const { data, error } = await supabase.from(AC.installments).select('*')
  if (error) throw error
  return data.map(r => fromAcFK<ClauseInstallment>(r))
}

export async function fetchClauseInstallments(clauseId: string): Promise<ClauseInstallment[]> {
  if (!USE_SUPABASE) return local.where<ClauseInstallment>(T.installments, 'clause_id', clauseId)
    .sort((a, b) => a.installment_number - b.installment_number)
  const { data, error } = await supabase.from(AC.installments).select('*').eq('clausula_fin_id', clauseId).order('installment_number')
  if (error) throw error
  return data.map(r => fromAcFK<ClauseInstallment>(r))
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
  const { data, error } = await supabase.from(AC.installments).insert(nn(installments.map(toAcFK))).select()
  if (error) throw error
  return data.map(r => fromAcFK<ClauseInstallment>(r))
}

// Cria parcelas com datas e valores EXPLÍCITOS (diferente de createInstallments,
// que divide o valor total em N parcelas mensais). Usado por fluxos com
// vencimentos específicos: transferência parcelada, salário (dia 5) e imagem
// (dia 20) mês a mês pela vigência do contrato.
export async function createClauseInstallments(
  clauseId: string, athleteId: string,
  rows: { installment_number: number; due_date: string; original_value: number; currency: Currency }[],
): Promise<ClauseInstallment[]> {
  if (rows.length === 0) return []
  const installments: Omit<ClauseInstallment, 'id' | 'created_at' | 'updated_at'>[] = rows.map(r => ({
    clause_id: clauseId, athlete_id: athleteId,
    installment_number: r.installment_number, due_date: r.due_date,
    original_value: r.original_value, currency: r.currency,
    payment_status: 'PENDENTE', payment_date: null,
    amount_paid_brl: null, exchange_rate: null, notes: null,
  }))
  if (!USE_SUPABASE) return local.insertMany<ClauseInstallment>(T.installments, installments)
  const { data, error } = await supabase.from(AC.installments).insert(nn(installments.map(toAcFK))).select()
  if (error) throw error
  return data.map(r => fromAcFK<ClauseInstallment>(r))
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
  const { data, error } = await supabase.from(AC.installments).update(nn(patch)).eq('id', id).select().single()
  if (error) throw error
  return fromAcFK<ClauseInstallment>(data)
}

// ── Alerts ────────────────────────────────────────────────────────────────

export async function fetchAthleteAlerts(athleteId: string): Promise<Alert[]> {
  if (!USE_SUPABASE) return local.where<Alert>(T.alerts, 'athlete_id', athleteId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  const { data, error } = await supabase.from(AC.alerts).select('*').eq('atleta_id', athleteId).order('created_at', { ascending: false })
  if (error) throw error
  return data.map(r => fromAcFK<Alert>(r))
}

export async function fetchAllAlerts(): Promise<Alert[]> {
  const sev = { RED: 0, YELLOW: 1, GREEN: 2 }
  if (!USE_SUPABASE) return local.all<Alert>(T.alerts).sort((a, b) => {
    if (sev[a.severity] !== sev[b.severity]) return sev[a.severity] - sev[b.severity]
    return b.created_at.localeCompare(a.created_at)
  })
  const { data, error } = await supabase.from(AC.alerts).select('*').order('severity').order('created_at', { ascending: false })
  if (error) throw error
  return data.map(r => fromAcFK<Alert>(r))
}

export async function markAlertRead(id: string): Promise<void> {
  if (!USE_SUPABASE) { local.update<Alert>(T.alerts, id, { is_read: true }); return }
  const { error } = await supabase.from(AC.alerts).update({ is_read: true }).eq('id', id)
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

// ── Apagar toda a base ──────────────────────────────────────────────────────
// Remove TODOS os registros de TODAS as tabelas do sistema. Ação destrutiva e
// irreversível — a UI deve confirmar antes de chamar. A ordem respeita as
// dependências (filhos antes dos pais) para não violar chaves estrangeiras.
const DELETE_ORDER: string[] = [
  T.installments,
  T.alerts,
  T.clauses,
  T.imageRights,
  T.salaryTriggers,
  T.clubLiabilities,
  T.intermediaryLiabilities,
  T.economicRights,
  T.athletePjs,
  T.contracts,
  T.athletes,
  T.clubs,
  T.intermediaries,
]

// Ordem para o Supabase (schema ac_*). Apagar atletas cascata os filhos; apagar
// entidades limpa clubes/agentes/PJs. Tabelas listadas têm coluna `id`.
const DELETE_ORDER_AC: string[] = [
  AC.installments,
  AC.alerts,
  AC.clauses,
  AC.image,
  AC.triggers,
  AC.clubLiab,
  AC.interLiab,
  AC.titular,
  AC.contracts,
  AC.athletes,
  AC.entidades,
]

export async function deleteAllData(): Promise<void> {
  if (!USE_SUPABASE) {
    for (const table of DELETE_ORDER) local.replaceAll(table, [])
    return
  }
  for (const table of DELETE_ORDER_AC) {
    // Supabase exige um filtro no delete; este casa com qualquer linha (id não nulo).
    const { error } = await supabase.from(table).delete().not('id', 'is', null)
    if (error) throw error
  }
}

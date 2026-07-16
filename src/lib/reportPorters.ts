// src/lib/reportPorters.ts
// Importadores das telas de relatório e consolidado. Cada função recebe as
// linhas exportadas (mesma estrutura do export) e recria as entidades-base
// correspondentes, resolvendo o atleta pelo nome e validando duplicidade.

import {
  fetchAthletes, createAthlete,
  fetchAllImageRights, createImageRight,
  fetchAllIntermediaryLiabilities, createIntermediaryLiability,
  fetchAllClubLiabilities, createClubLiability,
  fetchAllClauses, fetchAllContracts, createClause, createContract,
  fetchAllSalaryTriggers, createSalaryTrigger,
} from './athleteQueries'
import {
  S, N, Nn, cur, orNull, norm, toYearMonth,
  buildAthleteIndex, dupKey, emptyResult, type ImportResult,
} from './importHelpers'
import type { Athlete, Contract, LiabilityStatus } from '../types/athlete-system'

// Rótulos de status (como exportados) → enum de passivo/imagem.
const LIAB_STATUS: Record<string, LiabilityStatus> = {
  'pendente': 'PENDENTE', 'paga': 'PAGA', 'em atraso': 'EM_ATRASO', 'cancelada': 'CANCELADA',
}
const liabStatus = (v: unknown): LiabilityStatus => LIAB_STATUS[norm(v)] ?? 'PENDENTE'

type Rows = Record<string, string>[]

// Contrato "mais relevante" do atleta, para ancorar cláusulas de luvas.
function pickContract(contracts: Contract[]): Contract | null {
  if (contracts.length === 0) return null
  const byStart = (a: Contract, b: Contract) => (b.start_date ?? '').localeCompare(a.start_date ?? '')
  const ativos = contracts.filter(c => c.status === 'ATIVO').sort(byStart)
  return ativos[0] ?? [...contracts].sort(byStart)[0]
}

// ── Importadores por tipo de relatório ───────────────────────────────────────

async function importImagem(rows: Rows, idx: Map<string, string>): Promise<ImportResult> {
  const r = emptyResult()
  const existing = new Set((await fetchAllImageRights()).map(x => dupKey(x.athlete_id, x.month)))
  for (const row of rows) {
    const aid = idx.get(norm(row['Atleta']))
    if (!aid) { r.noAthlete++; continue }
    const month = toYearMonth(row['Vencimento']) || toYearMonth(row['Descrição'])
    if (!month) { r.invalid++; continue }
    const key = dupKey(aid, month)
    if (existing.has(key)) { r.dupSkipped++; continue }
    await createImageRight(aid, {
      month, amount: N(row['Valor']), currency: cur(row['Moeda']),
      status: liabStatus(row['Status']), notes: '',
    })
    existing.add(key); r.created++
  }
  return r
}

async function importIntermediarios(rows: Rows, idx: Map<string, string>): Promise<ImportResult> {
  const r = emptyResult()
  const existing = new Set((await fetchAllIntermediaryLiabilities())
    .map(x => dupKey(x.athlete_id, x.intermediary_name, x.description, x.amount)))
  for (const row of rows) {
    const aid = idx.get(norm(row['Atleta']))
    if (!aid) { r.noAthlete++; continue }
    const parte = S(row['Parte'])
    if (!parte) { r.invalid++; continue }
    const amount = N(row['Valor'])
    const desc = S(row['Descrição'])
    const key = dupKey(aid, parte, desc, amount)
    if (existing.has(key)) { r.dupSkipped++; continue }
    await createIntermediaryLiability(aid, {
      intermediary_name: parte, description: desc, direction: 'A_PAGAR',
      amount, currency: cur(row['Moeda']), due_date: orNull(row['Vencimento']),
      conditional: false, condition_description: '', penalty_terms: '',
      status: liabStatus(row['Status']), notes: '',
    })
    existing.add(key); r.created++
  }
  return r
}

async function importClubes(rows: Rows, idx: Map<string, string>): Promise<ImportResult> {
  const r = emptyResult()
  const existing = new Set((await fetchAllClubLiabilities())
    .map(x => dupKey(x.athlete_id, x.club_name, x.description, x.amount)))
  for (const row of rows) {
    const aid = idx.get(norm(row['Atleta']))
    if (!aid) { r.noAthlete++; continue }
    const parte = S(row['Parte'])
    if (!parte) { r.invalid++; continue }
    const amount = N(row['Valor'])
    const desc = S(row['Descrição'])
    const key = dupKey(aid, parte, desc, amount)
    if (existing.has(key)) { r.dupSkipped++; continue }
    await createClubLiability(aid, {
      club_name: parte, description: desc, direction: 'A_PAGAR',
      amount, currency: cur(row['Moeda']), due_date: orNull(row['Vencimento']),
      conditional: false, condition_description: '', solidarity: false,
      status: liabStatus(row['Status']), notes: '',
    })
    existing.add(key); r.created++
  }
  return r
}

async function importLuvas(rows: Rows, idx: Map<string, string>): Promise<ImportResult> {
  const r = emptyResult()
  const [clauses, contracts] = await Promise.all([fetchAllClauses(), fetchAllContracts()])
  const existing = new Set(clauses
    .filter(c => c.clause_type === 'LUVAS')
    .map(c => dupKey(c.athlete_id, c.description, c.original_value)))
  const contractsByAthlete = new Map<string, Contract[]>()
  for (const c of contracts) {
    const arr = contractsByAthlete.get(c.athlete_id) ?? []
    arr.push(c); contractsByAthlete.set(c.athlete_id, arr)
  }
  for (const row of rows) {
    const aid = idx.get(norm(row['Atleta']))
    if (!aid) { r.noAthlete++; continue }
    // "parcela N" é agregada; guardamos a descrição base para o dedup.
    const desc = S(row['Descrição']).replace(/\s*—\s*parcela\s*\d+/i, '')
    const value = Nn(row['Valor'])
    const key = dupKey(aid, desc, value)
    if (existing.has(key)) { r.dupSkipped++; continue }
    const contract = pickContract(contractsByAthlete.get(aid) ?? [])
    if (!contract) { r.invalid++; continue }   // luvas precisam de um vínculo
    await createClause(contract.id, aid, {
      clause_type: 'LUVAS', description: desc || 'Luvas',
      creditor_party: S(row['Parte']), debtor_party: 'Botafogo',
      currency: cur(row['Moeda']), original_value: value, percentage_value: null,
      condition_description: '', due_date: orNull(row['Vencimento']) ?? '',
      installments_total: 0, notes: '',
    })
    existing.add(key); r.created++
  }
  return r
}

async function importSalarios(rows: Rows, idx: Map<string, string>): Promise<ImportResult> {
  const r = emptyResult()
  const existing = new Set((await fetchAllSalaryTriggers())
    .map(t => dupKey(t.athlete_id, t.description, t.new_salary)))
  for (const row of rows) {
    // Só "Meta salarial" é reconstruível como entidade autônoma; o salário base
    // pertence ao contrato e é importado pela aba Vínculos.
    if (norm(row['Natureza']) !== 'meta salarial') { r.invalid++; continue }
    const aid = idx.get(norm(row['Atleta']))
    if (!aid) { r.noAthlete++; continue }
    const desc = S(row['Descrição'])
    const salary = N(row['Valor'])
    const key = dupKey(aid, desc, salary)
    if (existing.has(key)) { r.dupSkipped++; continue }
    await createSalaryTrigger(aid, {
      contract_id: null, description: desc || 'Meta', metric: 'OUTRO',
      threshold: null, new_salary: salary, currency: cur(row['Moeda']), notes: '',
    })
    existing.add(key); r.created++
  }
  return r
}

const IMPORTERS: Record<string, (rows: Rows, idx: Map<string, string>) => Promise<ImportResult>> = {
  imagem: importImagem,
  intermediarios: importIntermediarios,
  clubes: importClubes,
  luvas: importLuvas,
  salarios: importSalarios,
}

/** Importa as linhas de um relatório recriando as entidades-base. */
export async function importReport(kind: string, rows: Rows): Promise<ImportResult> {
  const fn = IMPORTERS[kind]
  if (!fn) return emptyResult()
  const idx = buildAthleteIndex(await fetchAthletes())
  return fn(rows, idx)
}

// ── Consolidado: upsert de atletas + vínculo principal ───────────────────────

export async function importConsolidado(rows: Rows): Promise<ImportResult> {
  const r = emptyResult()
  const athletes = await fetchAthletes()
  const idx = buildAthleteIndex(athletes)
  const contracts = await fetchAllContracts()
  const contractKeys = new Set(contracts.map(c => dupKey(c.athlete_id, c.counterpart_club, c.start_date)))

  for (const row of rows) {
    const nome = S(row['Nome'])
    const full = S(row['Nome Completo']) || nome
    if (!nome && !full) { r.invalid++; continue }
    let aid = idx.get(norm(nome)) ?? idx.get(norm(full))

    if (!aid) {
      // Cria o atleta a partir da linha consolidada.
      const created: Athlete = await createAthlete({
        full_name: full, short_name: nome || full.split(' ')[0],
        position: orNull(row['Posição']),
        current_status: (S(row['Status']) || 'ATIVO') as Athlete['current_status'],
        birth_date: null, nationality: null, cpf: null, passport_number: null,
        agent_name: null, agent_contact: null, profile_photo_url: null, notes: null,
      })
      aid = created.id
      idx.set(norm(created.short_name), aid)
      idx.set(norm(created.full_name), aid)
      r.created++
    } else {
      r.dupSkipped++
    }

    // Vínculo principal, se houver clube informado e ainda não existir.
    const club = S(row['Clube'])
    const start = S(row['Início'])
    if (club && club !== '—') {
      const key = dupKey(aid, club, start)
      if (!contractKeys.has(key)) {
        await createContract(aid, {
          type: 'ENTRADA', counterpart_club: club, counterpart_country: '',
          start_date: start || new Date().toISOString().slice(0, 10),
          end_date: S(row['Fim']), status: 'ATIVO',
          transfer_fee_gross: null, transfer_currency: 'BRL',
          base_salary: Nn(row['Salário Base']), salary_currency: cur(row['Moeda']),
          image_value: null, other_value: null, description: '',
        })
        contractKeys.add(key)
      }
    }
  }
  return r
}

// src/lib/importSheets.ts
// Importador dedicado dos workbooks "Ativos" e "Passivos".
// - Resolve atletas por chave natural (external_ref = CPF/passaporte) ou nome.
// - Clubes e agentes viram cadastros (getOrCreate por nome).
// - Cada linha de obrigação vira uma parcela idempotente (source_key): reimportar
//   NÃO duplica.
// Mapa: Ativos→club_liabilities(A_RECEBER); Federativos→club_liabilities(A_PAGAR);
// Intermediários→intermediary_liabilities; Luvas e Prêmios→clauses(sob vínculo de
// trabalho sintético); Controle de Imagem→image_rights.

import {
  fetchAthletes, createAthlete,
  fetchClubs, createClub, fetchIntermediaries, createIntermediary,
  fetchAllClubLiabilities, createClubLiability,
  fetchAllIntermediaryLiabilities, createIntermediaryLiability,
  fetchAllImageRights, createImageRight,
  fetchAllClauses, createClause, updateClause,
  fetchAllContracts, createContract,
} from './athleteQueries'
import { local } from './localStore'
import type { Athlete, Club, Intermediary, Contract, PaymentStatus } from '../types/athlete-system'
import {
  clean, normAthleteRef, normDoc, num, canonCurrency, canonLiabStatus, canonAthleteStatus,
  rawStatusLabel, parseParcela, parseVenc, conditional, sourceKey,
  competenceToYearMonth, pick, DIR_RECEBER, DIR_PAGAR,
} from './importCanon'

type Row = Record<string, string>
type Sheets = Record<string, Row[]>
const WORK_LABEL = 'Contrato de Trabalho'
const UP = (s: string | null) => (s ?? '').toUpperCase().replace(/\s+/g, ' ').trim()

export interface ImportReport {
  detected: string[]
  athletes: { created: number; existing: number }
  clubs: { created: number; existing: number }
  agents: { created: number; existing: number }
  obligations: Record<string, { created: number; skipped: number; orphan: number }>
  pending: Record<string, number>
}

const LIAB_TO_PAYMENT: Record<string, PaymentStatus> = {
  PAGA: 'PAGA', EM_ATRASO: 'EM_ATRASO', CANCELADA: 'CANCELADA', PENDENTE: 'PENDENTE',
}

export async function importWorkbook(sheets: Sheets): Promise<ImportReport> {
  local.defer()  // coalesce localStorage writes (no-op no modo Supabase)
  try {
    return await runImport(sheets)
  } finally {
    local.flush()
  }
}

async function runImport(rawSheets: Sheets): Promise<ImportReport> {
  // Normaliza chaves de coluna (remove espaços sobrando nos cabeçalhos).
  const sheets: Sheets = {}
  for (const [name, rows] of Object.entries(rawSheets)) {
    sheets[name] = rows.map(r => {
      const o: Record<string, string> = {}
      for (const [k, v] of Object.entries(r)) o[k.trim()] = v as string
      return o
    })
  }
  const report: ImportReport = {
    detected: Object.keys(sheets),
    athletes: { created: 0, existing: 0 }, clubs: { created: 0, existing: 0 }, agents: { created: 0, existing: 0 },
    obligations: {}, pending: {},
  }

  // ── Pré-carga ──
  const athletes = await fetchAthletes()
  const byRef = new Map<string, Athlete>()
  const byName = new Map<string, Athlete>()
  for (const a of athletes) { if (a.external_ref) byRef.set(a.external_ref, a); byName.set(UP(a.full_name), a) }

  const clubs = await fetchClubs()
  const clubByName = new Map<string, Club>(clubs.map(c => [UP(c.name), c]))
  const inters = await fetchIntermediaries()
  const interByName = new Map<string, Intermediary>(inters.map(i => [UP(i.name), i]))

  const seenKeys = new Set<string>()
  for (const l of await fetchAllClubLiabilities()) if (l.source_key) seenKeys.add(l.source_key)
  for (const l of await fetchAllIntermediaryLiabilities()) if (l.source_key) seenKeys.add(l.source_key)
  for (const l of await fetchAllImageRights()) if (l.source_key) seenKeys.add(l.source_key)
  for (const c of await fetchAllClauses()) if (c.source_key) seenKeys.add(c.source_key)

  const contracts = await fetchAllContracts()
  const workByAthlete = new Map<string, Contract>()
  for (const c of contracts) if (c.counterpart_club === WORK_LABEL) workByAthlete.set(c.athlete_id, c)

  // ── Resolução de atleta (ref → nome) ──
  async function resolveAthlete(ref: string | null, name: string | null, pos: string | null, status: string | null): Promise<Athlete | null> {
    const nm = clean(name)
    if (ref && byRef.has(ref)) return byRef.get(ref)!
    if (nm && byName.has(UP(nm))) { const a = byName.get(UP(nm))!; if (ref && !a.external_ref) { byRef.set(ref, a) } return a }
    if (!nm && !ref) return null
    const a = await createAthlete({
      external_ref: ref, full_name: nm ?? ref ?? 'Desconhecido', short_name: (nm ?? '').split(' ')[0] || (nm ?? ref ?? '—'),
      birth_date: null, nationality: null, cpf: ref && /^\d{11}$/.test(ref) ? ref : null, passport_number: ref && !/^\d{11}$/.test(ref) ? ref : null,
      agent_name: null, agent_contact: null, current_status: canonAthleteStatus(status), position: clean(pos), profile_photo_url: null, notes: null,
    })
    report.athletes.created++
    if (ref) byRef.set(ref, a); byName.set(UP(a.full_name), a)
    return a
  }
  async function resolveClub(name: string | null): Promise<Club | null> {
    const nm = clean(name); if (!nm) return null
    if (clubByName.has(UP(nm))) return clubByName.get(UP(nm))!
    const c = await createClub({ name: nm, country: '', logo_url: null, notes: '' }); report.clubs.created++
    clubByName.set(UP(nm), c); return c
  }
  async function resolveAgent(name: string | null, doc: string | null): Promise<Intermediary | null> {
    const nm = clean(name); if (!nm) return null
    if (interByName.has(UP(nm))) return interByName.get(UP(nm))!
    const it = await createIntermediary({ name: nm, contact: '', logo_url: null, notes: '', external_ref: normDoc(doc) }); report.agents.created++
    interByName.set(UP(nm), it); return it
  }
  async function workContract(a: Athlete): Promise<Contract> {
    if (workByAthlete.has(a.id)) return workByAthlete.get(a.id)!
    const c = await createContract(a.id, {
      type: 'ENTRADA', counterpart_club: WORK_LABEL, counterpart_country: '', start_date: '2024-01-01', end_date: '',
      transfer_fee_gross: null, transfer_currency: 'BRL', base_salary: null, salary_currency: 'BRL', image_value: null, other_value: null,
      description: 'Vínculo sintético (importação de luvas/prêmios)', status: 'ATIVO',
    })
    workByAthlete.set(a.id, c); return c
  }

  const bump = (k: string, f: 'created' | 'skipped' | 'orphan') => {
    report.obligations[k] ??= { created: 0, skipped: 0, orphan: 0 }; report.obligations[k][f]++
  }

  // ── ATIVOS → club_liabilities (A_RECEBER) ──
  for (const r of sheets['Ativos'] ?? []) {
    const a = await resolveAthlete(normAthleteRef(r['ID do Atleta']), r['Atleta'], r['Posição'], r['Status'])
    if (!a) { bump('Ativos (a receber)', 'orphan'); continue }
    const parc = parseParcela(r['Parcela(s)']); const venc = parseVenc(r['Vencimento'])
    const key = sourceKey('AT', a.external_ref ?? a.id, r['Despesa'], r['Devedor'], parc.label, venc.date ?? venc.text, num(r['Valor do Contrato']))
    if (seenKeys.has(key)) { bump('Ativos (a receber)', 'skipped'); continue }
    await resolveClub(r['Devedor'])
    await createClubLiability(a.id, {
      source_key: key, club_name: clean(r['Devedor']) ?? '—', description: `${clean(r['Despesa']) ?? 'Obrigação'} · ${parc.label}`,
      direction: DIR_RECEBER, amount: num(r['Valor do Contrato']) ?? 0, currency: canonCurrency(r['Moeda do Contrato']),
      due_date: venc.date, conditional: conditional(r['Pgto Certo ou Condicional?']), condition_description: [clean(r['Detalhes da Condição']), venc.text].filter(Boolean).join(' · '),
      solidarity: false, status: canonLiabStatus(r['Status2']), notes: `Origem: Ativos · status: ${rawStatusLabel(r['Status2'])}`,
    })
    seenKeys.add(key); bump('Ativos (a receber)', 'created')
  }

  // ── FEDERATIVOS → club_liabilities (A_PAGAR) ──
  for (const r of sheets['Federativos e Econômicos'] ?? []) {
    const a = await resolveAthlete(normAthleteRef(r['ID Atleta']), r['Atleta'], r['Posição'], r['Status'])
    if (!a) { bump('Federativos (a pagar)', 'orphan'); continue }
    const parc = parseParcela(r['Parcela']); const venc = parseVenc(r['Vencimento'])
    const key = sourceKey('FED', a.external_ref ?? a.id, r['Despesa'], r['Credor'], parc.label, venc.date ?? venc.text, num(r['Valor de contrato']))
    if (seenKeys.has(key)) { bump('Federativos (a pagar)', 'skipped'); continue }
    await resolveClub(r['Credor'])
    await createClubLiability(a.id, {
      source_key: key, club_name: clean(r['Credor']) ?? '—', description: `${clean(r['Despesa']) ?? 'Obrigação'} · ${parc.label}`,
      direction: DIR_PAGAR, amount: num(r['Valor de contrato']) ?? 0, currency: canonCurrency(r['Moeda do Contrato']),
      due_date: venc.date, conditional: conditional(r['Pgto Certo ou Condicional?']), condition_description: [clean(r['Detalhes da Condição']), venc.text].filter(Boolean).join(' · '),
      solidarity: false, status: canonLiabStatus(r['Status2']), notes: `Origem: Federativos · status: ${rawStatusLabel(r['Status2'])}`,
    })
    seenKeys.add(key); bump('Federativos (a pagar)', 'created')
  }

  // ── INTERMEDIÁRIOS → intermediary_liabilities ──
  for (const r of sheets['Intermediários'] ?? []) {
    const a = await resolveAthlete(normAthleteRef(r['ID Atleta']), r['Atleta'], r['Posição'], r['Status'])
    if (!a) { bump('Agentes (comissões)', 'orphan'); continue }
    const parc = parseParcela(r['Parcela']); const venc = parseVenc(r['Vencimento'])
    const key = sourceKey('INT', a.external_ref ?? a.id, r['Intermediário'], r['Despesa'], parc.label, venc.date ?? venc.text, num(r['Valor de Contrato']))
    if (seenKeys.has(key)) { bump('Agentes (comissões)', 'skipped'); continue }
    await resolveAgent(r['Intermediário'], r['ID Intermediário'])
    await createIntermediaryLiability(a.id, {
      source_key: key, intermediary_name: clean(r['Intermediário']) ?? '—', description: `${clean(r['Despesa']) ?? 'Comissão'} · ${parc.label}`,
      direction: DIR_PAGAR, amount: num(r['Valor de Contrato']) ?? 0, currency: canonCurrency(r['Moeda do Contrato']),
      due_date: venc.date, conditional: false, condition_description: '', penalty_terms: clean(r['Teor da Multa']) ?? '',
      status: canonLiabStatus(r['Status']), notes: `Origem: Intermediários · status: ${rawStatusLabel(r['Status'])}`,
    })
    seenKeys.add(key); bump('Agentes (comissões)', 'created')
  }

  // ── LUVAS E PRÊMIOS → clauses (sob vínculo de trabalho sintético) ──
  for (const r of sheets['Luvas e Prêmios'] ?? []) {
    const a = await resolveAthlete(normAthleteRef(r['ID Atleta']), r['Atleta'], r['Posição'], r['Status'])
    if (!a) { bump('Luvas e Prêmios', 'orphan'); continue }
    const parc = parseParcela(r['Parcela(s)']); const venc = parseVenc(r['Vencimento'])
    const despesa = clean(r['Despesa']) ?? 'Luvas'
    const key = sourceKey('LUV', a.external_ref ?? a.id, despesa, r['Credor'], parc.label, venc.date ?? venc.text, num(r['Valor de Contrato']))
    if (seenKeys.has(key)) { bump('Luvas e Prêmios', 'skipped'); continue }
    const wc = await workContract(a)
    const isPremio = /pr[êe]mio/i.test(despesa)
    const created = await createClause(wc.id, a.id, {
      clause_type: isPremio ? 'BONUS_PERFORMANCE_ATLETA' : 'LUVAS',
      description: `${despesa} · ${parc.label}`,
      creditor_party: clean(r['Credor']) ?? a.full_name, debtor_party: 'Botafogo SAF',
      currency: canonCurrency(r['Moeda do Contrato']), original_value: num(r['Valor de Contrato']),
      percentage_value: null, condition_description: [clean(r['Detalhes da Condição']), venc.text].filter(Boolean).join(' · '),
      due_date: venc.date ?? '', installments_total: parc.total, notes: `Origem: Luvas e Prêmios · status: ${rawStatusLabel(r['Status2'])}`,
      source_key: key,
    } as Parameters<typeof createClause>[2])
    const ps = LIAB_TO_PAYMENT[canonLiabStatus(r['Status2'])]
    if (ps !== 'PENDENTE') await updateClause(created.id, { payment_status: ps })
    seenKeys.add(key); bump('Luvas e Prêmios', 'created')
  }

  // ── CONTROLE DE IMAGEM (2025/2026) → image_rights (por competência) ──
  for (const sheetName of ['Controle de Imagem 2025', 'Controle de Imagem 2026']) {
    const fallbackYear = Number((sheetName.match(/\d{4}/) ?? [])[0]) || null
    for (const r of sheets[sheetName] ?? []) {
      const name = clean(pick(r, 'ATLETA', 'Atleta'))
      const a = await resolveAthlete(null, name, pick(r, 'Posição') ?? null, pick(r, 'Status') ?? null)
      if (!a) { bump('Direito de imagem (mensal)', 'orphan'); continue }
      const month = competenceToYearMonth(pick(r, 'Mês', 'Competência', 'Mes'), fallbackYear)
      if (!month) { bump('Direito de imagem (mensal)', 'orphan'); continue }
      const amount = num(pick(r, 'Valor Líquido', 'Valor do Pagamento', 'Valor do Contrato', 'Valor Bruto')) ?? 0
      const key = sourceKey('IMG', a.external_ref ?? a.id, month, amount, sheetName)
      if (seenKeys.has(key)) { bump('Direito de imagem (mensal)', 'skipped'); continue }
      const pagoRaw = UP(clean(pick(r, 'Pago?', 'Pago', 'Status 2')))
      const status = pagoRaw.startsWith('SIM') || pagoRaw.includes('PAGO') ? 'PAGA' : pagoRaw.includes('ATRAS') ? 'EM_ATRASO' : 'PENDENTE'
      await createImageRight(a.id, {
        source_key: key, month, amount, currency: 'BRL', status,
        notes: `Origem: ${sheetName}${clean(pick(r, 'RAZÃO SOCIAL')) ? ' · ' + clean(pick(r, 'RAZÃO SOCIAL')) : ''}`,
      })
      seenKeys.add(key); bump('Direito de imagem (mensal)', 'created')
    }
  }

  // ── Pendentes (reconhecidos, mapeamento em etapa futura) ──
  if (sheets['Direito de Imagem']) report.pending['Direito de Imagem (contratual)'] = sheets['Direito de Imagem'].length
  if (sheets['Solidariedade e Compensação']) report.pending['Solidariedade e Compensação'] = sheets['Solidariedade e Compensação'].length

  report.athletes.existing = byRef.size + byName.size - report.athletes.created // aproximado
  report.clubs.existing = clubByName.size - report.clubs.created
  report.agents.existing = interByName.size - report.agents.created
  return report
}

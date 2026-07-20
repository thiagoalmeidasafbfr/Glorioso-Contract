// src/lib/athleteConsolidado.ts
// Formato "consolidado": TODAS as entidades de um atleta (atleta, vínculos,
// cláusulas, metas de salário, passivos de clube/agente, detentores, PJs e
// direito de imagem) em UMA ÚNICA aba .xlsx — uma linha por registro, com uma
// coluna "Seção" identificando o tipo. A mesma aba pode ser reimportada para
// criar NOVOS atletas com todos os seus vínculos (as referências internas do
// arquivo são remapeadas para os novos IDs gerados).

import type { ColDef } from './xlsx-utils'
import type {
  Athlete, Contract, Clause, ClauseInstallment, SalaryTrigger, ClubLiability,
  IntermediaryLiability, EconomicRight, AthletePJ, ImageRight,
} from '../types/athlete-system'
import {
  createAthlete, createContract, createClause, createClauseInstallments,
  updateInstallment, createSalaryTrigger, createClubLiability,
  createIntermediaryLiability, createEconomicRight, createPJ, createImageRight,
  updateClause, fetchAthletes,
} from './athleteQueries'
import { S, orNull, N, Nn, cur, bool, norm, dupKey } from './importHelpers'
import { todayISO } from './format'

type Row = Record<string, unknown>

// ── Seções ────────────────────────────────────────────────────────────────
export const SECAO = {
  ATLETA: 'ATLETA',
  VINCULO: 'VINCULO',
  CLAUSULA: 'CLAUSULA',
  PARCELA: 'PARCELA',
  META: 'META_SALARIO',
  PASSIVO_CLUBE: 'PASSIVO_CLUBE',
  PASSIVO_AGENTE: 'PASSIVO_AGENTE',
  DETENTOR: 'DETENTOR',
  PJ: 'PJ',
  IMAGEM: 'DIREITO_IMAGEM',
} as const

// Normaliza o rótulo da seção, tolerando acentos/espaços/sinônimos.
function secaoOf(v: unknown): string {
  const s = S(v).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s-]+/g, '_')
  if (s.startsWith('ATLETA')) return SECAO.ATLETA
  if (s.startsWith('VINCULO') || s.startsWith('CONTRATO')) return SECAO.VINCULO
  if (s.startsWith('PARCELA')) return SECAO.PARCELA
  if (s.startsWith('CLAUSULA')) return SECAO.CLAUSULA
  if (s.startsWith('META')) return SECAO.META
  if (s.startsWith('PASSIVO_CLUBE') || s.startsWith('PASSIVOS_CLUBE')) return SECAO.PASSIVO_CLUBE
  if (s.startsWith('PASSIVO_AGENTE') || s.startsWith('PASSIVOS_AGENTE')) return SECAO.PASSIVO_AGENTE
  if (s.startsWith('DETENTOR') || s.startsWith('TITULARIDADE')) return SECAO.DETENTOR
  if (s === 'PJ' || s.startsWith('PJS') || s.startsWith('PESSOA_JURIDICA')) return SECAO.PJ
  if (s.startsWith('IMAGEM') || s.startsWith('DIREITO_IMAGEM')) return SECAO.IMAGEM
  return ''
}

// ── Esquema da aba única ────────────────────────────────────────────────────
// Cada linha preenche só as colunas relevantes à sua seção; as demais ficam
// em branco. As chaves aqui são as MESMAS usadas nos objetos de linha.
export const COLS_ATLETA_CONSOLIDADO: ColDef[] = [
  { key: 'secao',          header: 'Seção' },
  { key: 'atleta',         header: 'Atleta' },
  { key: 'id',             header: 'ID' },
  { key: 'atleta_id',      header: 'Atleta ID' },
  { key: 'vinculo_id',     header: 'Vínculo ID' },
  { key: 'clausula_id',    header: 'Cláusula ID' },
  { key: 'parcela_num',    header: 'Parcela nº' },
  { key: 'tipo',           header: 'Tipo' },
  { key: 'descricao',      header: 'Descrição' },
  { key: 'contraparte',    header: 'Contraparte' },
  { key: 'pais',           header: 'País' },
  { key: 'credor',         header: 'Credor' },
  { key: 'devedor',        header: 'Devedor' },
  { key: 'direcao',        header: 'Direção' },
  { key: 'moeda',          header: 'Moeda' },
  { key: 'valor',          header: 'Valor' },
  { key: 'percentual',     header: 'Percentual (%)' },
  { key: 'inicio',         header: 'Início' },
  { key: 'fim',            header: 'Término' },
  { key: 'vencimento',     header: 'Vencimento' },
  { key: 'status',         header: 'Status' },
  { key: 'atingimento',    header: 'Atingimento' },
  { key: 'data_pagamento', header: 'Data Pagamento/Liquidação' },
  { key: 'condicao',       header: 'Condição' },
  { key: 'condicional',    header: 'Condicional' },
  { key: 'solidariedade',  header: 'Solidariedade' },
  { key: 'teor_multa',     header: 'Teor Multa' },
  { key: 'salario_base',   header: 'Salário Base' },
  { key: 'imagem_valor',   header: 'Imagem' },
  { key: 'outros_valor',   header: 'Outros' },
  { key: 'moeda_salario',  header: 'Moeda Salário' },
  { key: 'metrica',        header: 'Métrica' },
  { key: 'meta_num',       header: 'Meta (nº)' },
  { key: 'novo_salario',   header: 'Novo Salário' },
  { key: 'tipo_detentor',  header: 'Tipo Detentor' },
  { key: 'detentor',       header: 'Detentor' },
  { key: 'nome_completo',  header: 'Nome Completo' },
  { key: 'posicao',        header: 'Posição' },
  { key: 'categoria',      header: 'Categoria' },
  { key: 'nascimento',     header: 'Data Nascimento' },
  { key: 'nacionalidade',  header: 'Nacionalidade' },
  { key: 'cpf',            header: 'CPF' },
  { key: 'passaporte',     header: 'Passaporte' },
  { key: 'agente_atleta',  header: 'Agente (Atleta)' },
  { key: 'contato_agente', header: 'Contato Agente' },
  { key: 'razao_social',   header: 'Razão Social' },
  { key: 'cnpj',           header: 'CNPJ' },
  { key: 'pj_razao',       header: 'PJ (Razão Social)' },
  { key: 'mes',            header: 'Mês (AAAA-MM)' },
  { key: 'observacoes',    header: 'Observações' },
]

export interface AthleteBundle {
  athlete: Athlete
  contracts: Contract[]
  clauses: Clause[]
  installments: ClauseInstallment[]
  triggers: SalaryTrigger[]
  clubLiabs: ClubLiability[]
  intermLiabs: IntermediaryLiability[]
  rights: EconomicRight[]
  pjs: AthletePJ[]
  imageRights: ImageRight[]
}

const simNao = (b: boolean) => (b ? 'Sim' : 'Não')

// ── Export: um atleta → linhas da aba consolidada ───────────────────────────
export function buildConsolidatedRows(b: AthleteBundle): Row[] {
  const a = b.athlete
  const nome = a.short_name || a.full_name
  const base = { atleta: nome, atleta_id: a.id }
  const rows: Row[] = []
  const pjNameById = new Map(b.pjs.map(p => [p.id, p.legal_name]))

  rows.push({
    ...base, secao: SECAO.ATLETA, id: a.id,
    nome_completo: a.full_name, tipo: '', descricao: '',
    posicao: a.position ?? '', categoria: a.category ?? '', status: a.current_status ?? '',
    nascimento: a.birth_date ?? '', nacionalidade: a.nationality ?? '',
    cpf: a.cpf ?? '', passaporte: a.passport_number ?? '',
    agente_atleta: a.agent_name ?? '', contato_agente: a.agent_contact ?? '',
    observacoes: a.notes ?? '',
  })

  for (const c of b.contracts) rows.push({
    ...base, secao: SECAO.VINCULO, id: c.id, vinculo_id: c.id,
    tipo: c.type, contraparte: c.counterpart_club, pais: c.counterpart_country ?? '',
    inicio: c.start_date ?? '', fim: c.end_date ?? '', status: c.status,
    valor: c.transfer_fee_gross ?? '', moeda: c.transfer_currency,
    salario_base: c.base_salary ?? '', imagem_valor: c.image_value ?? '',
    outros_valor: c.other_value ?? '', moeda_salario: c.salary_currency,
    descricao: c.description ?? '',
  })

  for (const p of b.pjs) rows.push({
    ...base, secao: SECAO.PJ, id: p.id,
    razao_social: p.legal_name, cnpj: p.cnpj ?? '', observacoes: p.notes ?? '',
  })

  for (const c of b.clauses) rows.push({
    ...base, secao: SECAO.CLAUSULA, id: c.id, vinculo_id: c.contract_id ?? '',
    tipo: c.clause_type, descricao: c.description ?? '',
    credor: c.creditor_party, devedor: c.debtor_party,
    moeda: c.currency, valor: c.original_value ?? '', percentual: c.percentage_value ?? '',
    condicao: c.condition_description ?? '', vencimento: c.due_date ?? '',
    atingimento: c.achievement_status, status: c.payment_status,
    data_pagamento: c.payment_date ?? '', observacoes: c.notes ?? '',
  })

  // Parcelas — uma linha por parcela, ligada à cláusula-mãe por "Cláusula ID".
  // Cobre fluxos regulares (salário/imagem mensal) E irregulares (transfer fee
  // com valores/datas variáveis): cada vencimento é registrado individualmente.
  for (const it of b.installments) rows.push({
    ...base, secao: SECAO.PARCELA, id: it.id, clausula_id: it.clause_id,
    parcela_num: it.installment_number, descricao: `Parcela ${it.installment_number}`,
    moeda: it.currency, valor: it.original_value, vencimento: it.due_date,
    status: it.payment_status, data_pagamento: it.payment_date ?? '',
    observacoes: it.notes ?? '',
  })

  for (const t of b.triggers) rows.push({
    ...base, secao: SECAO.META, id: t.id, vinculo_id: t.contract_id ?? '',
    descricao: t.description, metrica: t.metric, meta_num: t.threshold ?? '',
    novo_salario: t.new_salary, moeda: t.currency, status: t.status,
    data_pagamento: t.achieved_date ?? '', observacoes: t.notes ?? '',
  })

  for (const l of b.clubLiabs) rows.push({
    ...base, secao: SECAO.PASSIVO_CLUBE, id: l.id,
    contraparte: l.club_name, descricao: l.description ?? '', direcao: l.direction,
    valor: l.amount, moeda: l.currency, vencimento: l.due_date ?? '',
    condicional: simNao(l.conditional), condicao: l.condition_description ?? '',
    solidariedade: simNao(l.solidarity), status: l.status,
    data_pagamento: l.settled_date ?? '', observacoes: l.notes ?? '',
  })

  for (const l of b.intermLiabs) rows.push({
    ...base, secao: SECAO.PASSIVO_AGENTE, id: l.id,
    contraparte: l.intermediary_name, descricao: l.description ?? '', direcao: l.direction,
    valor: l.amount, moeda: l.currency, vencimento: l.due_date ?? '',
    condicional: simNao(l.conditional), condicao: l.condition_description ?? '',
    teor_multa: l.penalty_terms ?? '', status: l.status,
    data_pagamento: l.settled_date ?? '', observacoes: l.notes ?? '',
  })

  for (const r of b.rights) rows.push({
    ...base, secao: SECAO.DETENTOR, id: r.id,
    tipo_detentor: r.holder_type, detentor: r.holder_name ?? '',
    percentual: r.percentage, observacoes: r.notes ?? '',
  })

  for (const ir of b.imageRights) rows.push({
    ...base, secao: SECAO.IMAGEM, id: ir.id,
    pj_razao: ir.pj_id ? (pjNameById.get(ir.pj_id) ?? '') : '',
    mes: ir.month, valor: ir.amount, moeda: ir.currency, status: ir.status,
    data_pagamento: ir.paid_date ?? '', observacoes: ir.notes ?? '',
  })

  return rows
}

// ── Import: aba consolidada → novos atletas ─────────────────────────────────
export interface ConsolidatedImportResult {
  athletes: number      // atletas criados
  records: number       // registros-filhos criados (vínculos, cláusulas, etc.)
  dupSkipped: number    // atletas já existentes, ignorados
  invalid: number       // grupos sem linha ATLETA / sem nome
  warnings: string[]
}

// Detecta se a planilha está no formato consolidado (tem coluna "Seção").
export function isConsolidatedSheet(rows: Record<string, string>[]): boolean {
  if (!rows.length) return false
  return Object.keys(rows[0]).some(k => /se[çc][aã]o/i.test(k))
}

function groupKey(r: Record<string, string>): string {
  return S(r['Atleta ID']) || norm(r['Atleta'])
}

export async function importConsolidatedAthletes(
  rows: Record<string, string>[],
): Promise<ConsolidatedImportResult> {
  const res: ConsolidatedImportResult = { athletes: 0, records: 0, dupSkipped: 0, invalid: 0, warnings: [] }

  // Agrupa por atleta preservando a ordem de aparição.
  const groups = new Map<string, Record<string, string>[]>()
  for (const r of rows) {
    const k = groupKey(r)
    if (!k) continue
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(r)
  }

  // Dedup contra a base atual (por nome completo ou documento).
  const existing = await fetchAthletes()
  const byName = new Set(existing.map(a => dupKey(a.full_name)))
  const byDoc = new Set(existing.map(a => a.cpf || a.passport_number).filter(Boolean).map(d => dupKey(d)))

  const rowsOf = (grp: Record<string, string>[], secao: string) => grp.filter(r => secaoOf(r['Seção'] ?? r['Secao']) === secao)

  for (const grp of groups.values()) {
    const atletaRow = rowsOf(grp, SECAO.ATLETA)[0]
    if (!atletaRow) { res.invalid++; continue }
    const full = S(atletaRow['Nome Completo']) || S(atletaRow['Atleta'])
    if (!full) { res.invalid++; continue }

    const doc = S(atletaRow['CPF']) || S(atletaRow['Passaporte'])
    if (byName.has(dupKey(full)) || (doc && byDoc.has(dupKey(doc)))) { res.dupSkipped++; continue }

    // 1) Atleta
    const athlete = await createAthlete({
      full_name: full,
      short_name: S(atletaRow['Atleta']) || full.split(' ')[0],
      position: orNull(atletaRow['Posição']),
      current_status: (S(atletaRow['Status']) || 'ATIVO') as never,
      category: (S(atletaRow['Categoria']) || 'PROFISSIONAL') as never,
      birth_date: orNull(atletaRow['Data Nascimento']),
      nationality: orNull(atletaRow['Nacionalidade']),
      cpf: orNull(atletaRow['CPF']),
      passport_number: orNull(atletaRow['Passaporte']),
      agent_name: orNull(atletaRow['Agente (Atleta)']) ?? orNull(atletaRow['Agente']),
      agent_contact: orNull(atletaRow['Contato Agente']),
      profile_photo_url: null,
      notes: orNull(atletaRow['Observações']),
    })
    const aid = athlete.id
    res.athletes++
    byName.add(dupKey(full)); if (doc) byDoc.add(dupKey(doc))

    // 2) Vínculos (contratos) — mapeia ID do arquivo → novo ID
    const contractMap = new Map<string, string>()
    for (const r of rowsOf(grp, SECAO.VINCULO)) {
      const c = await createContract(aid, {
        type: (S(r['Tipo']) || 'ENTRADA') as never,
        counterpart_club: S(r['Contraparte']),
        counterpart_country: S(r['País']),
        start_date: S(r['Início']) || todayISO(),
        end_date: S(r['Término']),
        status: (S(r['Status']) || 'ATIVO') as never,
        transfer_fee_gross: Nn(r['Valor']), transfer_currency: cur(r['Moeda']),
        base_salary: Nn(r['Salário Base']), salary_currency: cur(r['Moeda Salário']),
        image_value: Nn(r['Imagem']), other_value: Nn(r['Outros']),
        description: S(r['Descrição']),
      })
      const fileId = S(r['Vínculo ID']) || S(r['ID'])
      if (fileId) contractMap.set(fileId, c.id)
      res.records++
    }

    // 3) PJs — mapeia razão social → novo ID
    const pjMap = new Map<string, string>()
    for (const r of rowsOf(grp, SECAO.PJ)) {
      const legal = S(r['Razão Social']); if (!legal) continue
      const p = await createPJ(aid, { legal_name: legal, cnpj: S(r['CNPJ']), notes: S(r['Observações']) })
      pjMap.set(norm(legal), p.id)
      res.records++
    }

    // 4) Cláusulas (ligadas ao vínculo remapeado) — mapeia ID do arquivo → novo ID
    // para que as parcelas (seção PARCELA) possam se religar à cláusula-mãe.
    const clauseMap = new Map<string, string>()
    const parcelaRows = rowsOf(grp, SECAO.PARCELA)
    const parcelaCountByClause = new Map<string, number>()
    for (const pr of parcelaRows) {
      const cid = S(pr['Cláusula ID'])
      if (cid) parcelaCountByClause.set(cid, (parcelaCountByClause.get(cid) ?? 0) + 1)
    }
    for (const r of rowsOf(grp, SECAO.CLAUSULA)) {
      const contractId = contractMap.get(S(r['Vínculo ID'])) ?? null
      const fileClauseId = S(r['ID'])
      const nParc = parcelaCountByClause.get(fileClauseId) ?? 0
      const clause = await createClause(contractId, aid, {
        clause_type: (S(r['Tipo']) || 'TRANSFER_FEE_FIXO') as never,
        description: S(r['Descrição']),
        creditor_party: S(r['Credor']), debtor_party: S(r['Devedor']),
        currency: cur(r['Moeda']), original_value: Nn(r['Valor']),
        percentage_value: Nn(r['Percentual (%)']),
        condition_description: S(r['Condição']), due_date: S(r['Vencimento']),
        installments_total: nParc > 0 ? nParc : 1, notes: S(r['Observações']),
      })
      if (fileClauseId) clauseMap.set(fileClauseId, clause.id)
      // Preserva status de atingimento/pagamento quando não for o padrão.
      const patch: Record<string, unknown> = {}
      const ach = S(r['Atingimento']).toUpperCase()
      if (ach && ach !== 'PENDENTE') { patch.achievement_status = ach }
      const pay = S(r['Status']).toUpperCase()
      if (pay && pay !== 'PENDENTE') {
        patch.payment_status = pay
        if (S(r['Data Pagamento/Liquidação'])) patch.payment_date = S(r['Data Pagamento/Liquidação'])
      }
      if (Object.keys(patch).length) await updateClause(clause.id, patch as never)
      res.records++
    }

    // 4b) Parcelas — recria o fluxo parcela a parcela de cada cláusula, com
    // vencimentos e valores explícitos (preserva fluxos irregulares).
    const parcByClause = new Map<string, Record<string, string>[]>()
    for (const pr of parcelaRows) {
      const cid = S(pr['Cláusula ID']); if (!cid) continue
      if (!parcByClause.has(cid)) parcByClause.set(cid, [])
      parcByClause.get(cid)!.push(pr)
    }
    for (const [fileClauseId, prs] of parcByClause) {
      const clauseId = clauseMap.get(fileClauseId)
      if (!clauseId) continue
      const ordered = [...prs].sort((a, b) => N(a['Parcela nº']) - N(b['Parcela nº']))
      const created = await createClauseInstallments(clauseId, aid, ordered.map((pr, i) => ({
        installment_number: Nn(pr['Parcela nº']) ?? (i + 1),
        due_date: S(pr['Vencimento']),
        original_value: N(pr['Valor']),
        currency: cur(pr['Moeda']),
      })))
      // Reaplica pagamentos já registrados nas parcelas.
      for (let i = 0; i < created.length; i++) {
        const pr = ordered[i]
        const st = S(pr['Status']).toUpperCase()
        if (st && st !== 'PENDENTE') {
          await updateInstallment(created[i].id, {
            payment_status: st as never,
            payment_date: orNull(pr['Data Pagamento/Liquidação']),
          })
        }
      }
      res.records += created.length
    }

    // 5) Metas de salário
    for (const r of rowsOf(grp, SECAO.META)) {
      await createSalaryTrigger(aid, {
        contract_id: contractMap.get(S(r['Vínculo ID'])) ?? null,
        description: S(r['Descrição']),
        metric: (S(r['Métrica']) || 'JOGOS') as never,
        threshold: Nn(r['Meta (nº)']), new_salary: N(r['Novo Salário']),
        currency: cur(r['Moeda']), notes: S(r['Observações']),
      })
      res.records++
    }

    // 6) Passivos de clube
    for (const r of rowsOf(grp, SECAO.PASSIVO_CLUBE)) {
      await createClubLiability(aid, {
        club_name: S(r['Contraparte']), description: S(r['Descrição']),
        direction: (S(r['Direção']) || 'A_PAGAR') as never, amount: N(r['Valor']), currency: cur(r['Moeda']),
        due_date: orNull(r['Vencimento']), conditional: bool(r['Condicional']),
        condition_description: S(r['Condição']), solidarity: bool(r['Solidariedade']),
        status: (S(r['Status']) || 'PENDENTE') as never, notes: S(r['Observações']),
      })
      res.records++
    }

    // 7) Passivos de agente
    for (const r of rowsOf(grp, SECAO.PASSIVO_AGENTE)) {
      await createIntermediaryLiability(aid, {
        intermediary_name: S(r['Contraparte']), description: S(r['Descrição']),
        direction: (S(r['Direção']) || 'A_PAGAR') as never, amount: N(r['Valor']), currency: cur(r['Moeda']),
        due_date: orNull(r['Vencimento']), conditional: bool(r['Condicional']),
        condition_description: S(r['Condição']), penalty_terms: S(r['Teor Multa']),
        status: (S(r['Status']) || 'PENDENTE') as never, notes: S(r['Observações']),
      })
      res.records++
    }

    // 8) Detentores (titularidade)
    for (const r of rowsOf(grp, SECAO.DETENTOR)) {
      await createEconomicRight(aid, {
        holder_type: (S(r['Tipo Detentor']) || 'TERCEIRO') as never,
        holder_name: S(r['Detentor']), percentage: N(r['Percentual (%)']),
        notes: S(r['Observações']),
      })
      res.records++
    }

    // 9) Direito de imagem (resolve/cria a PJ pela razão social)
    for (const r of rowsOf(grp, SECAO.IMAGEM)) {
      const pjName = S(r['PJ (Razão Social)'])
      let pjId: string | null = null
      if (pjName) {
        pjId = pjMap.get(norm(pjName)) ?? null
        if (!pjId) { const np = await createPJ(aid, { legal_name: pjName, cnpj: '', notes: '' }); pjId = np.id; pjMap.set(norm(pjName), pjId) }
      }
      await createImageRight(aid, {
        pj_id: pjId, month: S(r['Mês (AAAA-MM)']), amount: N(r['Valor']),
        currency: cur(r['Moeda']), status: (S(r['Status']) || 'PENDENTE') as never,
        notes: S(r['Observações']),
      })
      res.records++
    }
  }

  return res
}

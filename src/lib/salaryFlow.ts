// src/lib/salaryFlow.ts
// Geração AUTOMÁTICA do fluxo mensal de remuneração (Salário CLT + Direito de
// Imagem) de um vínculo. Substitui o antigo botão manual "Gerar fluxo mensal".
//
// Regras:
//   • Salário CLT → pago ao ATLETA (pessoa física), vencimento dia 5.
//   • Direito de imagem → pago à PJ do atleta, vencimento dia 20 (só gera se há PJ).
//   • Cada competência usa a remuneração EFETIVA daquele mês — isto é, aplica os
//     degraus dos gatilhos atingidos (novo CLT e nova imagem a partir da data
//     atingida). Ver `effectiveRemuneration` (salary.ts).
//   • Pró-rata nos meses quebrados (início/fim) via `buildRemunerationFlow`.
//   • PARCELAS JÁ PAGAS SÃO PRESERVADAS: só as pendentes são recriadas.
//
// É idempotente: pode ser chamada sempre que salário/imagem/datas mudarem ou um
// gatilho for atingido/revertido.

import type {
  Contract, Clause, ClauseInstallment, SalaryTrigger, AthletePJ, Currency,
} from '../types/athlete-system'
import { buildRemunerationFlow } from './remflow'
import { effectiveRemuneration } from './salary'
import {
  createClause, createClauseInstallments, updateClause, deleteInstallment, deleteClause,
} from './athleteQueries'

const SALARY_DUE_DAY = 5
const IMAGE_DUE_DAY = 20

// Uma parcela é "paga" (a preservar) quando quitada ou com data de pagamento.
function isPaid(i: ClauseInstallment): boolean {
  return i.payment_status === 'PAGA' || !!i.payment_date
}

// asOf = último dia da competência 'YYYY-MM'. Assim um gatilho atingido em
// qualquer dia daquele mês já vale para o mês inteiro.
function endOfCompetency(competencia: string): string {
  const [y, m] = competencia.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${competencia}-${String(lastDay).padStart(2, '0')}`
}

interface RegenArgs {
  contract: Contract
  triggers: SalaryTrigger[]
  pjs: AthletePJ[]
  athleteName: string
  clauses: Clause[]
  installments: ClauseInstallment[]
}

// Regenera um tipo de fluxo (salário OU imagem) preservando as parcelas pagas.
async function regenType(
  args: RegenArgs,
  type: 'SALARIO_CETD' | 'DIREITO_IMAGEM',
  label: string,
  dueDay: number,
  creditor: string,
  field: 'salary' | 'image',
): Promise<void> {
  const { contract, triggers, clauses, installments } = args
  if (!contract.start_date || !contract.end_date) return
  // Imagem sem PJ credora não é gerada (não há a quem vincular).
  if (field === 'image' && !creditor) return

  const currency: Currency = contract.salary_currency ?? 'BRL'
  // Grid de meses + frações de pró-rata (usa um valor nominal grande p/ extrair
  // a fração com precisão: frac = value / NOMINAL).
  const NOMINAL = 1_000_000
  const grid = buildRemunerationFlow(contract.start_date, contract.end_date, NOMINAL, dueDay)
  if (grid.length === 0) return

  const existing = clauses.filter(c => c.contract_id === contract.id && c.clause_type === type)
  const existingInsts = installments.filter(i => existing.some(c => c.id === i.clause_id))
  const paidDueDates = new Set(existingInsts.filter(isPaid).map(i => i.due_date))

  // Linhas-alvo: valor efetivo por competência, exceto as competências já pagas.
  const target = grid
    .map(line => {
      const frac = line.full ? 1 : line.value / NOMINAL
      const eff = effectiveRemuneration(contract, triggers, endOfCompetency(line.competencia))
      const monthly = field === 'salary' ? eff.salary : eff.image
      return { due_date: line.due_date, value: Math.round(monthly * frac * 100) / 100 }
    })
    .filter(l => l.value > 0 && !paidDueDates.has(l.due_date))

  // Cláusula canônica = a primeira existente; extras sem parcelas pagas são removidas.
  const canonical = existing[0] ?? null
  for (const extra of existing.slice(1)) {
    const extraInsts = installments.filter(i => i.clause_id === extra.id)
    if (!extraInsts.some(isPaid)) await deleteClause(extra.id)
  }

  if (!canonical) {
    if (target.length === 0) return
    const total = target.reduce((s, l) => s + l.value, 0)
    const clause = await createClause(contract.id, contract.athlete_id, {
      clause_type: type,
      description: `${label} — ${target.length}x mensais (venc. dia ${dueDay}, pró-rata)`,
      creditor_party: creditor, debtor_party: 'Botafogo SAF',
      currency, original_value: total, percentage_value: null,
      condition_description: '', due_date: target[0].due_date,
      installments_total: target.length, notes: '',
    })
    await createClauseInstallments(clause.id, contract.athlete_id,
      target.map((l, i) => ({ installment_number: i + 1, due_date: l.due_date, original_value: l.value, currency })))
    return
  }

  // Canônica existe: apaga só as parcelas NÃO pagas e reinsere as pendentes.
  const canonInsts = installments.filter(i => i.clause_id === canonical.id)
  const kept = canonInsts.filter(isPaid).sort((a, b) => a.due_date.localeCompare(b.due_date))
  for (const i of canonInsts) if (!isPaid(i)) await deleteInstallment(i.id)

  // Renumera: parcelas pagas primeiro (por data), depois as novas pendentes.
  const merged = [
    ...kept.map(i => ({ id: i.id, due_date: i.due_date, value: i.original_value })),
    ...target.map(l => ({ id: null as string | null, due_date: l.due_date, value: l.value })),
  ].sort((a, b) => a.due_date.localeCompare(b.due_date))

  const toInsert = merged
    .filter(m => m.id === null)
    .map((m, idx) => ({
      // numeração começa após as pagas mantidas
      installment_number: kept.length + idx + 1,
      due_date: m.due_date, original_value: m.value, currency,
    }))
  if (toInsert.length > 0) await createClauseInstallments(canonical.id, contract.athlete_id, toInsert)

  const total = merged.reduce((s, m) => s + m.value, 0)
  await updateClause(canonical.id, {
    currency, original_value: total, installments_total: merged.length,
    creditor_party: creditor,
  })
}

/**
 * Regenera o fluxo mensal de Salário CLT e Direito de Imagem do vínculo,
 * aplicando os degraus de gatilho e preservando as parcelas já pagas.
 */
export async function regenerateSalaryFlow(args: RegenArgs): Promise<void> {
  await regenType(args, 'SALARIO_CETD', 'Salário CLT', SALARY_DUE_DAY, args.athleteName, 'salary')
  const pjName = args.pjs[0]?.legal_name ?? ''
  await regenType(args, 'DIREITO_IMAGEM', 'Direito de imagem', IMAGE_DUE_DAY, pjName, 'image')
}

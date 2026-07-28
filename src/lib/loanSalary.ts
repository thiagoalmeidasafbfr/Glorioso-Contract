// src/lib/loanSalary.ts
// RATEIO DE SALÁRIO EM EMPRÉSTIMO.
//
// Caso prático: o atleta ganha 500k (CLT + imagem) e é emprestado a outro clube,
// que assume 40% do CLT. A partir da data do empréstimo o Botafogo passa a pagar
// só a sua parte, e o fluxo mensal precisa refletir isso — sem mexer nas parcelas
// já pagas. Ao fim do empréstimo, a remuneração volta ao valor integral.
//
// Modelo: o rateio é gravado como GATILHO SALARIAL (ac_gatilhos_salario) com
// status ATINGIDA e `achieved_date` = início do empréstimo. Assim ele entra no
// mesmo mecanismo de degraus já usado pelos gatilhos de meta
// (`effectiveRemuneration` + `regenerateSalaryFlow`): cada competência passa a
// usar o valor vigente naquele mês, com pró-rata e preservando o que foi pago.
// Um segundo gatilho no fim do empréstimo devolve os valores integrais.
//
// Nada de coluna nova: o marcador `__EMPRESTIMO__` em `notes` identifica os
// gatilhos criados por aqui, permitindo editar e remover o rateio depois.

import type {
  Contract, Clause, ClauseInstallment, SalaryTrigger, AthletePJ, Currency,
} from '../types/athlete-system'
import {
  createSalaryTrigger, updateSalaryTrigger, deleteSalaryTrigger, fetchAllSalaryTriggers,
} from './athleteQueries'
import { regenerateSalaryFlow } from './salaryFlow'
import { addDays } from './format'

const MARK = '__EMPRESTIMO__'

/** O que o clube que recebe o atleta assume. */
export interface LoanShareMeta {
  __emprestimo: 1
  /** contrato de empréstimo que originou o rateio. */
  loanContractId: string
  /** contrato de trabalho cujo salário é rateado. */
  workContractId: string
  club: string
  /** % do CLT e da imagem assumidos pelo CLUBE que recebe (0–100). */
  clubSalaryPct: number
  clubImagePct: number
  startDate: string
  endDate: string | null
  /** papel do gatilho: aplica o rateio ou devolve o valor integral. */
  role: 'RATEIO' | 'RETORNO'
  /** valores integrais no momento em que o rateio foi criado (para o retorno). */
  fullSalary: number
  fullImage: number
}

export function encodeLoanShare(meta: LoanShareMeta): string {
  return MARK + JSON.stringify(meta)
}
export function decodeLoanShare(notes: string | null | undefined): LoanShareMeta | null {
  if (!notes || !notes.startsWith(MARK)) return null
  try {
    const m = JSON.parse(notes.slice(MARK.length))
    return m && m.__emprestimo ? (m as LoanShareMeta) : null
  } catch { return null }
}
export const isLoanShareTrigger = (t: SalaryTrigger) => !!decodeLoanShare(t.notes)

/** Gatilhos de rateio de um empréstimo específico (rateio + retorno). */
export function loanShareTriggers(triggers: SalaryTrigger[], loanContractId: string): SalaryTrigger[] {
  return triggers.filter(t => decodeLoanShare(t.notes)?.loanContractId === loanContractId)
}

export interface LoanShareResult {
  /** quanto sobra para o Botafogo por mês, por componente. */
  botafogoSalary: number
  botafogoImage: number
  clubSalary: number
  clubImage: number
}

/** Cálculo puro do rateio — usado no formulário para mostrar a prévia. */
export function splitLoanSalary(
  fullSalary: number, fullImage: number, clubSalaryPct: number, clubImagePct: number,
): LoanShareResult {
  const clamp = (p: number) => Math.min(100, Math.max(0, p))
  const sPct = clamp(clubSalaryPct), iPct = clamp(clubImagePct)
  const round = (v: number) => Math.round(v * 100) / 100
  const clubSalary = round(fullSalary * sPct / 100)
  const clubImage = round(fullImage * iPct / 100)
  return {
    clubSalary, clubImage,
    botafogoSalary: round(fullSalary - clubSalary),
    botafogoImage: round(fullImage - clubImage),
  }
}

export interface ApplyLoanShareArgs {
  /** vínculo de trabalho (onde estão salário e imagem). */
  workContract: Contract
  /** contrato de empréstimo (saída) que motiva o rateio. */
  loanContract: Contract
  clubSalaryPct: number
  clubImagePct: number
  /** devolver os valores integrais ao fim do empréstimo (default: sim). */
  restoreAtEnd?: boolean
  /** contexto para regerar o fluxo mensal em seguida. */
  triggers: SalaryTrigger[]
  clauses: Clause[]
  installments: ClauseInstallment[]
  pjs: AthletePJ[]
  athleteName: string
}

/**
 * Aplica (ou reaplica) o rateio: cria/atualiza os gatilhos de rateio e retorno e
 * regenera o fluxo mensal de salário e imagem a partir da data do empréstimo.
 */
export async function applyLoanSalaryShare(args: ApplyLoanShareArgs): Promise<void> {
  const {
    workContract, loanContract, clubSalaryPct, clubImagePct,
    restoreAtEnd = true, triggers, clauses, installments, pjs, athleteName,
  } = args

  const fullSalary = workContract.base_salary ?? 0
  const fullImage = workContract.image_value ?? 0
  const split = splitLoanSalary(fullSalary, fullImage, clubSalaryPct, clubImagePct)
  const currency: Currency = workContract.salary_currency ?? 'BRL'
  const club = loanContract.counterpart_club || 'clube'
  const startDate = loanContract.start_date
  const endDate = loanContract.end_date ?? null

  const base = {
    loanContractId: loanContract.id,
    workContractId: workContract.id,
    club, clubSalaryPct, clubImagePct,
    startDate, endDate,
    fullSalary, fullImage,
  }

  const pctLabel = clubSalaryPct === clubImagePct
    ? `${clubSalaryPct}%`
    : `${clubSalaryPct}% do CLT e ${clubImagePct}% da imagem`
  const rateioDesc = `Empréstimo a ${club} — ${club} arca com ${pctLabel}`
  const retornoDesc = `Fim do empréstimo a ${club} — remuneração integral`

  const existing = loanShareTriggers(triggers, loanContract.id)
  const prevRateio = existing.find(t => decodeLoanShare(t.notes)?.role === 'RATEIO') ?? null
  const prevRetorno = existing.find(t => decodeLoanShare(t.notes)?.role === 'RETORNO') ?? null

  // 1) Gatilho do rateio (vale a partir do início do empréstimo).
  const rateioPatch = {
    description: rateioDesc,
    new_salary: split.botafogoSalary,
    new_image_value: split.botafogoImage,
    currency,
    status: 'ATINGIDA' as const,
    achieved_date: startDate,
    notes: encodeLoanShare({ __emprestimo: 1, ...base, role: 'RATEIO' }),
  }
  if (prevRateio) await updateSalaryTrigger(prevRateio.id, rateioPatch)
  else {
    const created = await createSalaryTrigger(workContract.athlete_id, {
      contract_id: workContract.id,
      description: rateioDesc,
      metric: 'OUTRO',
      threshold: null,
      new_salary: split.botafogoSalary,
      new_image_value: split.botafogoImage,
      currency,
      notes: rateioPatch.notes,
    })
    // createSalaryTrigger nasce PENDENTE; o rateio vigora desde o empréstimo.
    await updateSalaryTrigger(created.id, { status: 'ATINGIDA', achieved_date: startDate })
  }

  // 2) Gatilho de retorno (dia seguinte ao fim do empréstimo).
  if (restoreAtEnd && endDate) {
    const retornoPatch = {
      description: retornoDesc,
      new_salary: fullSalary,
      new_image_value: fullImage,
      currency,
      status: 'ATINGIDA' as const,
      achieved_date: addDays(endDate, 1),
      notes: encodeLoanShare({ __emprestimo: 1, ...base, role: 'RETORNO' }),
    }
    if (prevRetorno) await updateSalaryTrigger(prevRetorno.id, retornoPatch)
    else {
      const created = await createSalaryTrigger(workContract.athlete_id, {
        contract_id: workContract.id,
        description: retornoDesc,
        metric: 'OUTRO',
        threshold: null,
        new_salary: fullSalary,
        new_image_value: fullImage,
        currency,
        notes: retornoPatch.notes,
      })
      await updateSalaryTrigger(created.id, { status: 'ATINGIDA', achieved_date: addDays(endDate, 1) })
    }
  } else if (prevRetorno) {
    await deleteSalaryTrigger(prevRetorno.id)
  }

  // 3) Regenera o fluxo com os degraus atualizados (parcelas pagas preservadas).
  const nextTriggers = await rebuildTriggerList(triggers, workContract.id)
  await regenerateSalaryFlow({
    contract: workContract,
    triggers: nextTriggers,
    pjs, athleteName, clauses, installments,
  })
}

/** Remove o rateio do empréstimo e devolve o fluxo aos valores do contrato. */
export async function removeLoanSalaryShare(args: {
  workContract: Contract
  loanContractId: string
  triggers: SalaryTrigger[]
  clauses: Clause[]
  installments: ClauseInstallment[]
  pjs: AthletePJ[]
  athleteName: string
}): Promise<void> {
  const { workContract, loanContractId, triggers, clauses, installments, pjs, athleteName } = args
  const toRemove = loanShareTriggers(triggers, loanContractId)
  for (const t of toRemove) await deleteSalaryTrigger(t.id)
  const remaining = triggers.filter(t => !toRemove.some(r => r.id === t.id))
  await regenerateSalaryFlow({
    contract: workContract, triggers: remaining, pjs, athleteName, clauses, installments,
  })
}

// Após criar/atualizar os gatilhos, a lista em memória está defasada. Recarregar
// tudo aqui exigiria o athleteId; a tela chama `loadData()` depois, então basta
// devolver a lista com os gatilhos deste contrato marcados como atingidos.
async function rebuildTriggerList(triggers: SalaryTrigger[], workContractId: string): Promise<SalaryTrigger[]> {
  try {
    const all = await fetchAllSalaryTriggers()
    return all.filter(t => t.contract_id === workContractId || t.contract_id === null)
  } catch {
    return triggers
  }
}

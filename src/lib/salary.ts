// src/lib/salary.ts
// Mecanismo de mudança salarial por metas.
//
// Regra (conforme exemplo do usuário):
//   Contrato: 01/01/26 → 31/12/27, salário base 200k.
//   Gatilho: "ao atingir 10 jogos, salário passa a 300k".
//   Ao marcar o gatilho como ATINGIDA numa data específica, a partir daquela
//   data o salário efetivo passa a ser 300k.
//
// Salário efetivo numa data D = new_salary do gatilho ATINGIDA com a MAIOR
// achieved_date <= D; se nenhum, o salário base do contrato.

import type { Contract, SalaryTrigger, Currency } from '../types/athlete-system'
import { todayISO } from './format'

export interface EffectiveSalary {
  amount: number | null
  currency: Currency
  /** gatilho que definiu o salário vigente (null = salário base). */
  source: SalaryTrigger | null
  /** data em que este valor passou a vigorar (start do contrato ou achieved_date). */
  since: string | null
}

export interface EffectiveRemuneration {
  /** salário CLT vigente na data. */
  salary: number
  /** valor de imagem vigente na data. */
  image: number
  currency: Currency
  /** gatilho que definiu os valores vigentes (null = valores base do contrato). */
  source: SalaryTrigger | null
  /** data em que estes valores passaram a vigorar. */
  since: string | null
}

/** Gatilhos ATINGIDOS com data, ordenados por achieved_date crescente. */
export function achievedTriggers(triggers: SalaryTrigger[]): SalaryTrigger[] {
  return triggers
    .filter(t => t.status === 'ATINGIDA' && t.achieved_date)
    .sort((a, b) => (a.achieved_date ?? '').localeCompare(b.achieved_date ?? ''))
}

/**
 * Salário efetivo do contrato numa data (ISO YYYY-MM-DD). Sem `asOf`, usa hoje.
 * Considera apenas gatilhos do próprio contrato (contract_id) ou gatilhos sem
 * contrato vinculado (contract_id === null) — estes valem para o atleta.
 */
export function effectiveSalary(
  contract: Pick<Contract, 'id' | 'base_salary' | 'salary_currency' | 'start_date'>,
  triggers: SalaryTrigger[],
  asOf: string = todayISO(),
): EffectiveSalary {
  const relevant = achievedTriggers(triggers).filter(
    t => (t.contract_id === contract.id || t.contract_id === null) &&
         (t.achieved_date as string) <= asOf,
  )

  if (relevant.length > 0) {
    const winner = relevant[relevant.length - 1]
    return {
      amount: winner.new_salary,
      currency: winner.currency,
      source: winner,
      since: winner.achieved_date,
    }
  }

  return {
    amount: contract.base_salary,
    currency: contract.salary_currency,
    source: null,
    since: contract.start_date,
  }
}

/**
 * Remuneração efetiva (salário CLT + imagem) do contrato numa data. O gatilho
 * ATINGIDA com a maior `achieved_date <= asOf` define os novos valores; a partir
 * dele o salário passa a `new_salary` e — quando informado — a imagem passa a
 * `new_image_value` (se null, mantém o valor de imagem do gatilho anterior ou do
 * contrato). Sem gatilho aplicável, usa os valores base do contrato.
 */
export function effectiveRemuneration(
  contract: Pick<Contract, 'id' | 'base_salary' | 'image_value' | 'salary_currency' | 'start_date'>,
  triggers: SalaryTrigger[],
  asOf: string = todayISO(),
): EffectiveRemuneration {
  const relevant = achievedTriggers(triggers).filter(
    t => (t.contract_id === contract.id || t.contract_id === null) &&
         (t.achieved_date as string) <= asOf,
  )

  let salary = contract.base_salary ?? 0
  let image = contract.image_value ?? 0
  let source: SalaryTrigger | null = null
  let since: string | null = contract.start_date
  const currency = contract.salary_currency

  for (const t of relevant) {
    salary = t.new_salary
    // Imagem só muda quando o gatilho traz um novo valor; senão preserva o atual.
    if (t.new_image_value != null) image = t.new_image_value
    source = t
    since = t.achieved_date
  }

  return { salary, image, currency, source, since }
}

/**
 * Linha do tempo dos degraus salariais do contrato: começa no salário base e
 * adiciona um degrau por gatilho atingido (na ordem das datas).
 */
export interface SalaryStep {
  from: string           // data em que passou a vigorar
  amount: number | null
  currency: Currency
  label: string          // "Salário base" ou descrição do gatilho
  trigger: SalaryTrigger | null
}

export function salarySteps(
  contract: Pick<Contract, 'id' | 'base_salary' | 'salary_currency' | 'start_date'>,
  triggers: SalaryTrigger[],
): SalaryStep[] {
  const steps: SalaryStep[] = [{
    from: contract.start_date,
    amount: contract.base_salary,
    currency: contract.salary_currency,
    label: 'Salário base',
    trigger: null,
  }]

  for (const t of achievedTriggers(triggers)) {
    if (t.contract_id !== contract.id && t.contract_id !== null) continue
    steps.push({
      from: t.achieved_date as string,
      amount: t.new_salary,
      currency: t.currency,
      label: t.description,
      trigger: t,
    })
  }

  return steps
}

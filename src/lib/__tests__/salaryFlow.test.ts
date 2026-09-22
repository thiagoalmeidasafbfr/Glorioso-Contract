import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Clause, NewClauseInput } from '../../types/athlete-system'

vi.mock('../athleteQueries', () => ({
  createClause: vi.fn(),
  createClauseInstallments: vi.fn(),
  updateClause: vi.fn(),
  deleteInstallment: vi.fn(),
  deleteClause: vi.fn(),
}))

import * as q from '../athleteQueries'
import { regenerateSalaryFlow } from '../salaryFlow'
import { makeClause, makeContract, makeInstallment, makePJ, makeTrigger } from './fixtures'

const createClause = vi.mocked(q.createClause)
const createInsts = vi.mocked(q.createClauseInstallments)
const updateClause = vi.mocked(q.updateClause)
const deleteInstallment = vi.mocked(q.deleteInstallment)
const deleteClause = vi.mocked(q.deleteClause)

beforeEach(() => {
  vi.clearAllMocks()
  let n = 0
  createClause.mockImplementation(async (contractId, athleteId, input: NewClauseInput) =>
    makeClause({ ...input, id: `new-${++n}`, contract_id: contractId ?? '', athlete_id: athleteId } as Partial<Clause>))
  createInsts.mockResolvedValue([])
})

// Parcelas passadas a createClauseInstallments para uma cláusula.
function instsFor(clauseId: string) {
  return createInsts.mock.calls.filter(c => c[0] === clauseId).flatMap(c => c[2])
}

const contract = makeContract({
  start_date: '2026-01-15', end_date: '2026-03-31', base_salary: 310_000, image_value: 62_000,
})

describe('regenerateSalaryFlow — sem cláusulas prévias', () => {
  it('cria Salário CLT (dia 5, atleta) e Imagem (dia 20, PJ) com pró-rata', async () => {
    await regenerateSalaryFlow({
      contract, triggers: [], pjs: [makePJ()], athleteName: 'Fulano', clauses: [], installments: [],
    })
    expect(createClause).toHaveBeenCalledTimes(2)
    const [salCall, imgCall] = createClause.mock.calls
    expect(salCall[2]).toMatchObject({
      clause_type: 'SALARIO_CETD', creditor_party: 'Fulano', debtor_party: 'Botafogo SAF',
      installments_total: 3, due_date: '2026-02-05',
      original_value: 170_000 + 310_000 + 310_000, // jan: 17/31 de 310k
    })
    expect(imgCall[2]).toMatchObject({
      clause_type: 'DIREITO_IMAGEM', creditor_party: 'Atleta Imagem LTDA', installments_total: 3,
    })
    expect(instsFor('new-1')).toEqual([
      { installment_number: 1, due_date: '2026-02-05', original_value: 170_000, currency: 'BRL' },
      { installment_number: 2, due_date: '2026-03-05', original_value: 310_000, currency: 'BRL' },
      { installment_number: 3, due_date: '2026-04-05', original_value: 310_000, currency: 'BRL' },
    ])
    expect(instsFor('new-2').map(i => [i.due_date, i.original_value])).toEqual([
      ['2026-02-20', 34_000], ['2026-03-20', 62_000], ['2026-04-20', 62_000],
    ])
  })

  it('sem PJ não gera imagem; sem datas não gera nada', async () => {
    await regenerateSalaryFlow({ contract, triggers: [], pjs: [], athleteName: 'F', clauses: [], installments: [] })
    expect(createClause).toHaveBeenCalledTimes(1)
    expect(createClause.mock.calls[0][2].clause_type).toBe('SALARIO_CETD')

    vi.clearAllMocks()
    await regenerateSalaryFlow({
      contract: makeContract({ end_date: null }), triggers: [], pjs: [makePJ()], athleteName: 'F',
      clauses: [], installments: [],
    })
    expect(createClause).not.toHaveBeenCalled()
  })

  it('salário zero não cria cláusula vazia', async () => {
    await regenerateSalaryFlow({
      contract: makeContract({ base_salary: 0, image_value: null }), triggers: [], pjs: [makePJ()],
      athleteName: 'F', clauses: [], installments: [],
    })
    expect(createClause).not.toHaveBeenCalled()
  })

  it('gatilho atingido no meio do mês vale para a competência inteira', async () => {
    const t = makeTrigger({ new_salary: 400_000, new_image_value: 100_000, achieved_date: '2026-02-27' })
    await regenerateSalaryFlow({
      contract, triggers: [t], pjs: [makePJ()], athleteName: 'F', clauses: [], installments: [],
    })
    expect(instsFor('new-1').map(i => i.original_value)).toEqual([170_000, 400_000, 400_000])
    expect(instsFor('new-2').map(i => i.original_value)).toEqual([34_000, 100_000, 100_000])
  })

  it('usa a moeda do salário do contrato', async () => {
    await regenerateSalaryFlow({
      contract: makeContract({ salary_currency: 'EUR' }), triggers: [], pjs: [], athleteName: 'F',
      clauses: [], installments: [],
    })
    expect(createClause.mock.calls[0][2].currency).toBe('EUR')
    expect(instsFor('new-1').every(i => i.currency === 'EUR')).toBe(true)
  })
})

describe('regenerateSalaryFlow — com cláusula existente', () => {
  const canon = makeClause({ id: 'sal', clause_type: 'SALARIO_CETD' })
  const paidFeb = makeInstallment({
    id: 'p1', clause_id: 'sal', installment_number: 1, due_date: '2026-02-05',
    original_value: 170_000, payment_status: 'PAGA',
  })
  const pendMar = makeInstallment({ id: 'x2', clause_id: 'sal', installment_number: 2, due_date: '2026-03-05' })
  const pendApr = makeInstallment({ id: 'x3', clause_id: 'sal', installment_number: 3, due_date: '2026-04-05' })

  it('preserva parcelas pagas, recria só as pendentes e renumera após as pagas', async () => {
    const t = makeTrigger({ new_salary: 500_000, achieved_date: '2026-03-01' })
    await regenerateSalaryFlow({
      contract, triggers: [t], pjs: [], athleteName: 'F',
      clauses: [canon], installments: [paidFeb, pendMar, pendApr],
    })
    expect(createClause).not.toHaveBeenCalled()
    expect(deleteInstallment.mock.calls.map(c => c[0]).sort()).toEqual(['x2', 'x3'])
    expect(instsFor('sal')).toEqual([
      // competência fev (vence 05/03) é anterior ao gatilho de 01/03
      { installment_number: 2, due_date: '2026-03-05', original_value: 310_000, currency: 'BRL' },
      { installment_number: 3, due_date: '2026-04-05', original_value: 500_000, currency: 'BRL' },
    ])
    expect(updateClause).toHaveBeenCalledWith('sal', expect.objectContaining({
      original_value: 170_000 + 310_000 + 500_000, installments_total: 3, creditor_party: 'F',
    }))
  })

  it('parcela com payment_date conta como paga mesmo sem status PAGA', async () => {
    const withDate = { ...pendMar, payment_date: '2026-03-04' }
    await regenerateSalaryFlow({
      contract, triggers: [], pjs: [], athleteName: 'F',
      clauses: [canon], installments: [paidFeb, withDate, pendApr],
    })
    expect(deleteInstallment.mock.calls.map(c => c[0])).toEqual(['x3'])
    expect(instsFor('sal').map(i => i.due_date)).toEqual(['2026-04-05'])
  })

  it('remove cláusulas duplicadas sem parcelas pagas e mantém as que têm pagamento', async () => {
    const dupEmpty = makeClause({ id: 'dup1', clause_type: 'SALARIO_CETD' })
    const dupPaid = makeClause({ id: 'dup2', clause_type: 'SALARIO_CETD' })
    const paidOnDup = makeInstallment({ id: 'pd', clause_id: 'dup2', due_date: '2026-03-05', payment_status: 'PAGA' })
    await regenerateSalaryFlow({
      contract, triggers: [], pjs: [], athleteName: 'F',
      clauses: [canon, dupEmpty, dupPaid, makeClause({ id: 'other', contract_id: 'outro' })],
      installments: [paidOnDup],
    })
    expect(deleteClause.mock.calls.map(c => c[0])).toEqual(['dup1'])
    // a competência paga na duplicata não é recriada na canônica
    expect(instsFor('sal').map(i => i.due_date)).toEqual(['2026-02-05', '2026-04-05'])
  })
})

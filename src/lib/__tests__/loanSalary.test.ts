import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NewSalaryTriggerInput, SalaryTrigger } from '../../types/athlete-system'

vi.mock('../athleteQueries', () => ({
  createSalaryTrigger: vi.fn(),
  updateSalaryTrigger: vi.fn(),
  deleteSalaryTrigger: vi.fn(),
  fetchAllSalaryTriggers: vi.fn(),
}))
vi.mock('../salaryFlow', () => ({ regenerateSalaryFlow: vi.fn() }))

import * as q from '../athleteQueries'
import { regenerateSalaryFlow } from '../salaryFlow'
import {
  encodeLoanShare, decodeLoanShare, isLoanShareTrigger, loanShareTriggers, splitLoanSalary,
  applyLoanSalaryShare, removeLoanSalaryShare, type LoanShareMeta,
} from '../loanSalary'
import { makeContract, makeTrigger } from './fixtures'

const m = {
  create: vi.mocked(q.createSalaryTrigger),
  update: vi.mocked(q.updateSalaryTrigger),
  del: vi.mocked(q.deleteSalaryTrigger),
  fetchAll: vi.mocked(q.fetchAllSalaryTriggers),
  regen: vi.mocked(regenerateSalaryFlow),
}

const meta: LoanShareMeta = {
  __emprestimo: 1, loanContractId: 'loan-1', workContractId: 'ct-1', club: 'Vasco',
  clubSalaryPct: 40, clubImagePct: 40, startDate: '2026-07-01', endDate: '2026-12-31',
  role: 'RATEIO', fullSalary: 500_000, fullImage: 100_000,
}

describe('marcador __EMPRESTIMO__ em notes', () => {
  it('encode/decode ida e volta', () => {
    const notes = encodeLoanShare(meta)
    expect(notes.startsWith('__EMPRESTIMO__{')).toBe(true)
    expect(decodeLoanShare(notes)).toEqual(meta)
  })

  it('decode exige o prefixo e o flag __emprestimo', () => {
    expect(decodeLoanShare(JSON.stringify(meta))).toBeNull() // sem prefixo
    expect(decodeLoanShare('__EMPRESTIMO__{"x":1}')).toBeNull()
    expect(decodeLoanShare('__EMPRESTIMO__{quebrado')).toBeNull()
    expect(decodeLoanShare('__EMPRESTIMO__null')).toBeNull()
    expect(decodeLoanShare('nota comum')).toBeNull()
    expect(decodeLoanShare(null)).toBeNull()
    expect(decodeLoanShare(undefined)).toBeNull()
  })

  it('isLoanShareTrigger e loanShareTriggers filtram por empréstimo', () => {
    const a = makeTrigger({ id: 'a', notes: encodeLoanShare(meta) })
    const b = makeTrigger({ id: 'b', notes: encodeLoanShare({ ...meta, role: 'RETORNO' }) })
    const other = makeTrigger({ id: 'c', notes: encodeLoanShare({ ...meta, loanContractId: 'loan-2' }) })
    const plain = makeTrigger({ id: 'd', notes: 'meta de jogos' })
    expect(isLoanShareTrigger(a)).toBe(true)
    expect(isLoanShareTrigger(plain)).toBe(false)
    expect(loanShareTriggers([a, b, other, plain], 'loan-1').map(t => t.id)).toEqual(['a', 'b'])
    expect(loanShareTriggers([], 'loan-1')).toEqual([])
  })
})

describe('splitLoanSalary', () => {
  it('caso do módulo: clube assume 40%', () => {
    expect(splitLoanSalary(500_000, 100_000, 40, 40)).toEqual({
      clubSalary: 200_000, clubImage: 40_000, botafogoSalary: 300_000, botafogoImage: 60_000,
    })
  })
  it('percentuais diferentes por componente e arredondamento em centavos', () => {
    expect(splitLoanSalary(333_333.33, 10_000, 33.333, 0)).toEqual({
      clubSalary: 111_110, clubImage: 0, botafogoSalary: 222_223.33, botafogoImage: 10_000,
    })
  })
  it('limita percentuais a 0–100', () => {
    expect(splitLoanSalary(1000, 500, 150, -20)).toEqual({
      clubSalary: 1000, clubImage: 0, botafogoSalary: 0, botafogoImage: 500,
    })
  })
})

describe('applyLoanSalaryShare / removeLoanSalaryShare', () => {
  const work = makeContract({ id: 'ct-1', base_salary: 500_000, image_value: 100_000, salary_currency: 'EUR' })
  const loan = makeContract({
    id: 'loan-1', type: 'EMPRESTIMO_SAIDA', counterpart_club: 'Vasco',
    start_date: '2026-07-01', end_date: '2026-12-31',
  })
  const ctx = { clauses: [], installments: [], pjs: [], athleteName: 'Fulano' }

  beforeEach(() => {
    vi.clearAllMocks()
    let n = 0
    m.create.mockImplementation(async (athleteId: string, input: NewSalaryTriggerInput) =>
      makeTrigger({ ...input, id: `new-${++n}`, athlete_id: athleteId, status: 'PENDENTE', achieved_date: null } as Partial<SalaryTrigger>))
    m.fetchAll.mockResolvedValue([])
  })

  it('cria gatilho de rateio (início) e de retorno (dia seguinte ao fim) e regenera o fluxo', async () => {
    const fetched = [makeTrigger({ id: 'from-db' }), makeTrigger({ id: 'outro-ct', contract_id: 'x' })]
    m.fetchAll.mockResolvedValue(fetched)
    await applyLoanSalaryShare({ workContract: work, loanContract: loan, clubSalaryPct: 40, clubImagePct: 40, triggers: [], ...ctx })

    expect(m.create).toHaveBeenCalledTimes(2)
    const [rateio, retorno] = m.create.mock.calls.map(c => c[1])
    expect(rateio).toMatchObject({
      contract_id: 'ct-1', metric: 'OUTRO', new_salary: 300_000, new_image_value: 60_000, currency: 'EUR',
      description: 'Empréstimo a Vasco — Vasco arca com 40%',
    })
    expect(decodeLoanShare(rateio.notes)).toMatchObject({ role: 'RATEIO', fullSalary: 500_000, loanContractId: 'loan-1' })
    expect(retorno).toMatchObject({ new_salary: 500_000, new_image_value: 100_000 })
    expect(decodeLoanShare(retorno.notes)?.role).toBe('RETORNO')

    // criados PENDENTE → marcados ATINGIDA nas datas do empréstimo
    expect(m.update).toHaveBeenCalledWith('new-1', { status: 'ATINGIDA', achieved_date: '2026-07-01' })
    expect(m.update).toHaveBeenCalledWith('new-2', { status: 'ATINGIDA', achieved_date: '2027-01-01' })

    // regenera com a lista recarregada, só do contrato de trabalho
    expect(m.regen).toHaveBeenCalledTimes(1)
    expect(m.regen.mock.calls[0][0].triggers.map(t => t.id)).toEqual(['from-db'])
    expect(m.regen.mock.calls[0][0].contract).toBe(work)
  })

  it('descrição detalha percentuais diferentes', async () => {
    await applyLoanSalaryShare({ workContract: work, loanContract: loan, clubSalaryPct: 40, clubImagePct: 100, triggers: [], ...ctx })
    expect(m.create.mock.calls[0][1].description).toBe('Empréstimo a Vasco — Vasco arca com 40% do CLT e 100% da imagem')
  })

  it('reaplicar atualiza os gatilhos existentes; sem retorno apaga o de retorno', async () => {
    const existing = [
      makeTrigger({ id: 'r1', notes: encodeLoanShare(meta) }),
      makeTrigger({ id: 'r2', notes: encodeLoanShare({ ...meta, role: 'RETORNO' }) }),
    ]
    await applyLoanSalaryShare({
      workContract: work, loanContract: loan, clubSalaryPct: 50, clubImagePct: 50,
      restoreAtEnd: false, triggers: existing, ...ctx,
    })
    expect(m.create).not.toHaveBeenCalled()
    expect(m.update).toHaveBeenCalledWith('r1', expect.objectContaining({
      new_salary: 250_000, new_image_value: 50_000, status: 'ATINGIDA', achieved_date: '2026-07-01',
    }))
    expect(m.del).toHaveBeenCalledWith('r2')
  })

  it('empréstimo sem data de término não cria retorno', async () => {
    await applyLoanSalaryShare({
      workContract: work, loanContract: { ...loan, end_date: null }, clubSalaryPct: 40, clubImagePct: 40, triggers: [], ...ctx,
    })
    expect(m.create).toHaveBeenCalledTimes(1)
    expect(m.del).not.toHaveBeenCalled()
  })

  it('se recarregar os gatilhos falhar, regenera com a lista em memória', async () => {
    m.fetchAll.mockRejectedValue(new Error('offline'))
    const mem = [makeTrigger({ id: 'mem' })]
    await applyLoanSalaryShare({ workContract: work, loanContract: loan, clubSalaryPct: 10, clubImagePct: 10, triggers: mem, ...ctx })
    expect(m.regen.mock.calls[0][0].triggers).toBe(mem)
  })

  it('limitação conhecida: o valor integral é o base_salary do contrato (ignora degraus anteriores)', async () => {
    // Um gatilho de meta já elevou o salário a 600k antes do empréstimo, mas o
    // rateio é calculado sobre o base_salary (500k) — igual à prévia da tela
    // (LoanShareModal). Ver relatório/PLANO_CORRECAO.
    const meta600 = makeTrigger({ id: 'meta', new_salary: 600_000, achieved_date: '2026-03-01' })
    await applyLoanSalaryShare({ workContract: work, loanContract: loan, clubSalaryPct: 50, clubImagePct: 0, triggers: [meta600], ...ctx })
    expect(m.create.mock.calls[0][1].new_salary).toBe(250_000)
  })

  it('removeLoanSalaryShare apaga os gatilhos do empréstimo e regenera sem eles', async () => {
    const t1 = makeTrigger({ id: 'r1', notes: encodeLoanShare(meta) })
    const t2 = makeTrigger({ id: 'r2', notes: encodeLoanShare({ ...meta, role: 'RETORNO' }) })
    const keep = makeTrigger({ id: 'meta' })
    const otherLoan = makeTrigger({ id: 'r3', notes: encodeLoanShare({ ...meta, loanContractId: 'loan-2' }) })
    await removeLoanSalaryShare({ workContract: work, loanContractId: 'loan-1', triggers: [t1, keep, t2, otherLoan], ...ctx })
    expect(m.del.mock.calls.map(c => c[0])).toEqual(['r1', 'r2'])
    expect(m.regen.mock.calls[0][0].triggers.map(t => t.id)).toEqual(['meta', 'r3'])
  })
})

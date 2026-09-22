import { afterEach, describe, expect, it, vi } from 'vitest'
import { achievedTriggers, effectiveSalary, effectiveRemuneration, salarySteps } from '../salary'
import { makeContract, makeTrigger } from './fixtures'

const contract = makeContract({ base_salary: 200_000, image_value: 80_000, start_date: '2026-01-01' })

describe('achievedTriggers', () => {
  it('só ATINGIDA com data, ordenados por achieved_date', () => {
    const list = [
      makeTrigger({ id: 'c', achieved_date: '2026-09-01' }),
      makeTrigger({ id: 'pend', status: 'PENDENTE', achieved_date: '2026-01-01' }),
      makeTrigger({ id: 'nao', status: 'NAO_ATINGIDA', achieved_date: '2026-01-01' }),
      makeTrigger({ id: 'semdata', achieved_date: null }),
      makeTrigger({ id: 'a', achieved_date: '2026-02-01' }),
    ]
    expect(achievedTriggers(list).map(t => t.id)).toEqual(['a', 'c'])
    expect(achievedTriggers([])).toEqual([])
  })
})

describe('effectiveSalary', () => {
  const t1 = makeTrigger({ id: 't1', new_salary: 300_000, achieved_date: '2026-06-15' })
  const t2 = makeTrigger({ id: 't2', new_salary: 400_000, currency: 'EUR', achieved_date: '2027-01-10' })

  it('sem gatilho → salário base desde o início do contrato', () => {
    expect(effectiveSalary(contract, [], '2026-03-01')).toEqual({
      amount: 200_000, currency: 'BRL', source: null, since: '2026-01-01',
    })
  })

  it('gatilho vale a partir (inclusive) da achieved_date', () => {
    expect(effectiveSalary(contract, [t1, t2], '2026-06-14').amount).toBe(200_000)
    expect(effectiveSalary(contract, [t1, t2], '2026-06-15').amount).toBe(300_000)
    const later = effectiveSalary(contract, [t2, t1], '2027-02-01')
    expect(later).toMatchObject({ amount: 400_000, currency: 'EUR', since: '2027-01-10' })
    expect(later.source?.id).toBe('t2')
  })

  it('ignora gatilhos de outro contrato, aceita os do atleta (contract_id null)', () => {
    const other = makeTrigger({ contract_id: 'outro', new_salary: 999, achieved_date: '2026-02-01' })
    const athleteWide = makeTrigger({ contract_id: null, new_salary: 250_000, achieved_date: '2026-03-01' })
    expect(effectiveSalary(contract, [other], '2026-12-01').amount).toBe(200_000)
    expect(effectiveSalary(contract, [other, athleteWide], '2026-12-01').amount).toBe(250_000)
  })

  describe('sem asOf usa hoje', () => {
    afterEach(() => { vi.useRealTimers() })
    it('considera a data corrente', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-07-01T12:00:00Z'))
      expect(effectiveSalary(contract, [t1, t2]).amount).toBe(300_000)
      expect(effectiveRemuneration(contract, [t1, t2]).salary).toBe(300_000)
    })
  })
})

describe('effectiveRemuneration', () => {
  it('valores base quando nada foi atingido (null → 0)', () => {
    expect(effectiveRemuneration(makeContract({ base_salary: null, image_value: null }), [], '2026-05-01'))
      .toMatchObject({ salary: 0, image: 0, source: null })
  })

  it('imagem só muda quando o gatilho traz new_image_value', () => {
    const tSal = makeTrigger({ id: 's', new_salary: 300_000, new_image_value: null, achieved_date: '2026-03-01' })
    const tImg = makeTrigger({ id: 'i', new_salary: 350_000, new_image_value: 120_000, achieved_date: '2026-06-01' })
    const tSal2 = makeTrigger({ id: 's2', new_salary: 360_000, new_image_value: null, achieved_date: '2026-09-01' })
    const all = [tSal2, tImg, tSal]
    expect(effectiveRemuneration(contract, all, '2026-04-01')).toMatchObject({ salary: 300_000, image: 80_000 })
    expect(effectiveRemuneration(contract, all, '2026-07-01')).toMatchObject({ salary: 350_000, image: 120_000 })
    // degrau posterior sem imagem preserva a imagem do degrau anterior
    const r = effectiveRemuneration(contract, all, '2026-10-01')
    expect(r).toMatchObject({ salary: 360_000, image: 120_000, since: '2026-09-01' })
    expect(r.source?.id).toBe('s2')
  })

  it('new_image_value = 0 zera a imagem (0 não é "sem valor")', () => {
    const t = makeTrigger({ new_salary: 1, new_image_value: 0, achieved_date: '2026-02-01' })
    expect(effectiveRemuneration(contract, [t], '2026-03-01').image).toBe(0)
  })
})

describe('salarySteps', () => {
  it('começa no salário base e adiciona um degrau por gatilho do contrato', () => {
    const steps = salarySteps(contract, [
      makeTrigger({ id: 'b', description: 'Meta 20 jogos', new_salary: 400_000, achieved_date: '2026-10-01' }),
      makeTrigger({ id: 'x', contract_id: 'outro', achieved_date: '2026-05-01' }),
      makeTrigger({ id: 'a', description: 'Meta 10 jogos', new_salary: 300_000, achieved_date: '2026-05-01' }),
      makeTrigger({ id: 'p', status: 'PENDENTE' }),
    ])
    expect(steps.map(s => [s.from, s.amount, s.label])).toEqual([
      ['2026-01-01', 200_000, 'Salário base'],
      ['2026-05-01', 300_000, 'Meta 10 jogos'],
      ['2026-10-01', 400_000, 'Meta 20 jogos'],
    ])
    expect(steps[0].trigger).toBeNull()
  })
})

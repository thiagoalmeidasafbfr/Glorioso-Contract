import { describe, expect, it } from 'vitest'
import { approxRateBRL, approxToBRL } from '../fx'
import { toBRL, ptaxRateFor } from '../ptax'
import { CURRENCY_TO_BRL } from '../../context/AppContext'
import { sumOwnership, isOwnershipValid, bfrShare, sortRights } from '../ownership'
import type { HolderType } from '../../types/athlete-system'

describe('fx (câmbio de referência)', () => {
  it('usa a tabela única CURRENCY_TO_BRL', () => {
    expect(approxRateBRL('BRL')).toBe(1)
    expect(approxRateBRL('EUR')).toBe(CURRENCY_TO_BRL.EUR)
    expect(approxRateBRL('USD')).toBe(CURRENCY_TO_BRL.USD)
  })
  it('moeda desconhecida → taxa 1', () => {
    expect(approxRateBRL('XYZ')).toBe(1)
    expect(approxToBRL(100, 'XYZ')).toBe(100)
  })
  it('approxToBRL multiplica pela taxa', () => {
    expect(approxToBRL(1_000, 'GBP')).toBeCloseTo(1_000 * CURRENCY_TO_BRL.GBP)
    expect(approxToBRL(0, 'EUR')).toBe(0)
  })
})

describe('ptax (conversão com fallback)', () => {
  const ptax = { USD: 5.0, EUR: 5.5 }
  it('BRL não converte', () => {
    expect(toBRL(123, 'BRL', ptax)).toBe(123)
    expect(ptaxRateFor('BRL', ptax)).toBe(1)
  })
  it('prefere a PTAX do dia', () => {
    expect(toBRL(10, 'USD', ptax)).toBe(50)
    expect(ptaxRateFor('EUR', ptax)).toBe(5.5)
  })
  it('cai na tabela de referência e, por fim, em 1', () => {
    expect(ptaxRateFor('GBP', ptax)).toBe(CURRENCY_TO_BRL.GBP)
    expect(toBRL(2, 'GBP', {})).toBeCloseTo(2 * CURRENCY_TO_BRL.GBP)
    expect(ptaxRateFor('XYZ', {})).toBe(1)
  })
})

describe('ownership', () => {
  const r = (holder_type: HolderType, percentage: number) => ({ holder_type, percentage })

  it('sumOwnership tolera valores não numéricos', () => {
    expect(sumOwnership([r('BFR', 60), r('CLUBE', 40)])).toBe(100)
    expect(sumOwnership([{ percentage: NaN }, { percentage: '25' as unknown as number }])).toBe(25)
    expect(sumOwnership([])).toBe(0)
  })

  it('isOwnershipValid: 100% com tolerância de 0,1', () => {
    expect(isOwnershipValid([r('BFR', 33.33), r('CLUBE', 33.33), r('AGENTE', 33.33)])).toBe(true) // 99,99
    expect(isOwnershipValid([r('BFR', 100.1)])).toBe(true)
    expect(isOwnershipValid([r('BFR', 99.8)])).toBe(false)
    expect(isOwnershipValid([r('BFR', 60), r('CLUBE', 50)])).toBe(false)
    expect(isOwnershipValid([])).toBe(false)
  })

  it('bfrShare soma apenas linhas BFR', () => {
    expect(bfrShare([r('BFR', 50), r('CLUBE', 30), r('BFR', 10), r('ATLETA', 10)])).toBe(60)
    expect(bfrShare([r('CLUBE', 100)])).toBe(0)
  })

  it('sortRights ordena BFR → CLUBE → AGENTE → ATLETA → TERCEIRO sem mutar', () => {
    const input = [r('TERCEIRO', 1), r('ATLETA', 1), r('BFR', 1), r('AGENTE', 1), r('CLUBE', 1)]
    const sorted = sortRights(input)
    expect(sorted.map(x => x.holder_type)).toEqual(['BFR', 'CLUBE', 'AGENTE', 'ATLETA', 'TERCEIRO'])
    expect(input[0].holder_type).toBe('TERCEIRO')
  })
})

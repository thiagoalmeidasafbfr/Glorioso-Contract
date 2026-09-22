import { describe, expect, it } from 'vitest'
import { buildAthleteCalcs, calcSale, monthsInclusive, parseISO, type SaleInputs } from '../amortization'
import { makeClause, makeClubLiab, makeContract, makeIntermLiab } from './fixtures'
import type { Athlete } from '../../types/athlete-system'

const TS = '2026-01-01T00:00:00Z'
const athlete: Athlete = {
  id: 'at-1', full_name: 'Atleta Teste', short_name: 'Teste', birth_date: null, nationality: null,
  cpf: null, passport_number: null, agent_name: null, agent_contact: null,
  current_status: 'ATIVO', category: 'PROFISSIONAL', position: null, profile_photo_url: null,
  notes: null, created_at: TS, updated_at: TS,
} as Athlete

// Contrato de ENTRADA de 24 meses (jan/2026 → dez/2027).
const entry = makeContract({ id: 'ct-e', type: 'ENTRADA', start_date: '2026-01-01', end_date: '2027-12-31', base_salary: 100_000, image_value: 50_000 })
const fee = makeClause({ id: 'cl-fee', contract_id: 'ct-e', clause_type: 'TRANSFER_FEE_FIXO', currency: 'EUR', original_value: 1_000_000, fixed_exchange_rate: 6 } as never)
const luvas = makeClause({ id: 'cl-luvas', contract_id: 'ct-e', clause_type: 'LUVAS', currency: 'BRL', original_value: 1_200_000 })
const asOf = new Date(2026, 5, 15) // 15/06/2026

describe('helpers de data', () => {
  it('parseISO aceita AAAA-MM-DD e rejeita vazio/inválido', () => {
    expect(parseISO('2026-02-28')?.getMonth()).toBe(1)
    expect(parseISO(null)).toBeNull()
    expect(parseISO('2026-02')).toBeNull()
  })
  it('monthsInclusive conta os dois meses das pontas', () => {
    expect(monthsInclusive(new Date(2026, 0, 1), new Date(2026, 0, 31))).toBe(1)
    expect(monthsInclusive(new Date(2026, 0, 1), new Date(2027, 11, 31))).toBe(24)
    expect(monthsInclusive(new Date(2025, 11, 31), new Date(2026, 0, 1))).toBe(2)
  })
})

describe('buildAthleteCalcs', () => {
  it('soma o intangível (PTAX fixada + BRL) e amortiza linear pelo prazo', () => {
    const [c] = buildAthleteCalcs([athlete], [entry], [fee, luvas], [], [], {}, {}, asOf)
    expect(c.contractMonths).toBe(24)
    expect(c.intangibleBRL).toBe(7_200_000)                  // 1M EUR × 6 + 1,2M BRL
    expect(c.intangibleItems.find(i => i.clauseType === 'TRANSFER_FEE_FIXO')?.rateSource).toBe('FIXADA')
    expect(c.ptaxAquisicao).toBe(6)
    expect(c.monthlyAmortBRL).toBe(300_000)
    expect(c.monthsElapsed).toBe(6)                           // jan → jun
    expect(c.monthsRemaining).toBe(18)
    expect(c.accumAmortBRL).toBe(1_800_000)
    expect(c.residualBRL).toBe(5_400_000)
    expect(c.monthlyPayrollBRL).toBe(150_000)
  })

  it('usa a PTAX da aquisição quando não há taxa fixada, e a corrente como último recurso', () => {
    const usd = makeClause({ id: 'cl-usd', contract_id: 'ct-e', clause_type: 'INTERMEDIACAO', currency: 'USD', original_value: 100_000 })
    const [withAcq] = buildAthleteCalcs([athlete], [entry], [usd], [], [], { USD: 5.9 }, { 'at-1': { USD: 5 } }, asOf)
    expect(withAcq.intangibleBRL).toBe(500_000)
    expect(withAcq.intangibleItems[0].rateSource).toBe('AQUISICAO')
    const [current] = buildAthleteCalcs([athlete], [entry], [usd], [], [], { USD: 5.9 }, {}, asOf)
    expect(current.intangibleBRL).toBeCloseTo(590_000)
    expect(current.intangibleItems[0].rateSource).toBe('ATUAL')
  })

  it('não amortiza além do fim do contrato', () => {
    const [c] = buildAthleteCalcs([athlete], [entry], [luvas], [], [], {}, {}, new Date(2030, 0, 1))
    expect(c.monthsElapsed).toBe(24)
    expect(c.monthsRemaining).toBe(0)
    expect(c.accumAmortBRL).toBe(1_200_000)
    expect(c.residualBRL).toBe(0)
  })

  it('ignora cláusulas fora do contrato de entrada e tipos que não compõem o intangível', () => {
    const other = makeClause({ id: 'cl-x', contract_id: 'ct-outro', clause_type: 'LUVAS', original_value: 999 })
    const salary = makeClause({ id: 'cl-s', contract_id: 'ct-e', clause_type: 'SALARIO_CETD', original_value: 999 })
    const [c] = buildAthleteCalcs([athlete], [entry], [luvas, other, salary], [], [], {}, {}, asOf)
    expect(c.intangibleBRL).toBe(1_200_000)
  })

  it('sem contrato de entrada: tudo zerado', () => {
    const loan = makeContract({ id: 'ct-l', type: 'EMPRESTIMO_ENTRADA' as never })
    const [c] = buildAthleteCalcs([athlete], [loan], [luvas], [], [], {}, {}, asOf)
    expect(c.entryContract).toBeNull()
    expect(c.contractMonths).toBe(0)
    expect(c.intangibleBRL).toBe(0)
    expect(c.monthlyAmortBRL).toBe(0)
  })

  it('agrega sell-on, solidariedade e passivos em aberto do atleta', () => {
    const sellOn = makeClause({ id: 'so', clause_type: 'SELL_ON_FEE', percentage_value: 10, creditor_party: 'Clube X' })
    const solid = makeClause({ id: 'sf', clause_type: 'SOLIDARIEDADE_FIFA', percentage_value: 5 })
    const open = makeClubLiab({ id: 'l1', status: 'PENDENTE' } as never)
    const paid = makeClubLiab({ id: 'l2', status: 'PAGA' } as never)
    const agent = makeIntermLiab({ id: 'l3', status: 'CANCELADA' } as never)
    const [c] = buildAthleteCalcs([athlete], [entry], [sellOn, solid], [open, paid], [agent], {}, {}, asOf)
    expect(c.sellOnPct).toBe(10)
    expect(c.sellOnPayees[0].party).toBe('Clube X')
    expect(c.solidariedadePct).toBe(5)
    expect(c.clubLiabilities.map(l => l.id)).toEqual(['l1'])
    expect(c.intermLiabilities).toEqual([])
  })
})

describe('calcSale', () => {
  const inputs: SaleInputs = {
    saleValue: 10_000_000, saleCurrency: 'BRL', saleDate: '2026-06-30',
    commissionValue: 200_000, commissionCurrency: 'BRL', taxesPct: 0,
    extraSellOnPct: 0, extraSolidariedadePct: 0,
  }

  it('calcula baixa do residual, solidariedade, sell-on sobre a mais-valia e ganho', () => {
    const sellOn = makeClause({ id: 'so', clause_type: 'SELL_ON_FEE', percentage_value: 10 })
    const solid = makeClause({ id: 'sf', clause_type: 'SOLIDARIEDADE_FIFA', percentage_value: 5 })
    const [c] = buildAthleteCalcs([athlete], [entry], [fee, luvas, sellOn, solid], [], [], {}, {}, asOf)
    const r = calcSale(inputs, c, {})
    expect(r.saleBRL).toBe(10_000_000)
    expect(r.intangibleWriteoffBRL).toBe(5_400_000)
    expect(r.solidariedadeBRL).toBe(500_000)
    // mais-valia = 10M − 0,5M − 5,4M = 4,1M → 10% = 410k
    expect(r.sellOnFeeBRL).toBeCloseTo(410_000)
    expect(r.gainBRL).toBeCloseTo(10_000_000 - 5_400_000 - 500_000 - 410_000 - 200_000)
    expect(r.netToClubBRL).toBe(r.gainBRL)
  })

  it('sell-on nunca é negativo quando a venda não cobre o residual', () => {
    const sellOn = makeClause({ id: 'so', clause_type: 'SELL_ON_FEE', percentage_value: 20 })
    const [c] = buildAthleteCalcs([athlete], [entry], [fee, luvas, sellOn], [], [], {}, {}, asOf)
    const r = calcSale({ ...inputs, saleValue: 1_000_000, commissionValue: 0 }, c, {})
    expect(r.sellOnFeeBRL).toBe(0)
    expect(r.gainBRL).toBe(1_000_000 - 5_400_000)
  })

  it('converte venda/comissão em moeda estrangeira e aplica impostos e extras', () => {
    const [c] = buildAthleteCalcs([athlete], [entry], [luvas], [], [], {}, {}, new Date(2030, 0, 1))
    const r = calcSale({ ...inputs, saleValue: 1_000_000, saleCurrency: 'EUR', commissionValue: 10_000, commissionCurrency: 'EUR', taxesPct: 2, extraSolidariedadePct: 5 }, c, { EUR: 6 })
    expect(r.saleBRL).toBe(6_000_000)
    expect(r.intermedNewBRL).toBe(60_000)
    expect(r.taxesBRL).toBe(120_000)
    expect(r.solidariedadeBRL).toBe(300_000)
    expect(r.intangibleWriteoffBRL).toBe(0)
  })
})

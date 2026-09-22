import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CURRENCY_SYMBOLS, fmtCurrencyShort, fmtCurrencyParts, fmtCurrencyFull, fmtPercent,
  fmtDate, fmtMonthYear, daysFromToday, fmtRelative, isOverdue, isDueSoon,
  isoToYearMonth, todayISO, addDays, addMonths, monthsBetween,
} from '../format'

// toLocaleString('pt-BR') usa espaço normal entre símbolo e número (montado à mão).
describe('formatação de moeda', () => {
  it('símbolos conhecidos', () => {
    expect(CURRENCY_SYMBOLS).toMatchObject({ BRL: 'R$', EUR: '€', USD: '$', GBP: '£' })
  })

  it('fmtCurrencyShort abrevia em K/M/Bi', () => {
    expect(fmtCurrencyShort(21_750_000, 'EUR')).toBe('€ 21,75M')
    expect(fmtCurrencyShort(1_500)).toBe('R$ 1,5K')
    expect(fmtCurrencyShort(2_000_000_000, 'USD')).toBe('$ 2,00Bi')
    expect(fmtCurrencyShort(999)).toBe('R$ 999')
    expect(fmtCurrencyShort(-2_500_000)).toBe('R$ -2,50M')
  })

  it('fmtCurrencyShort: nulo → travessão; moeda desconhecida usa o código', () => {
    expect(fmtCurrencyShort(null)).toBe('—')
    expect(fmtCurrencyShort(undefined)).toBe('—')
    expect(fmtCurrencyShort(10, 'QAR')).toBe('QAR 10')
  })

  it('fmtCurrencyParts separa símbolo, número e sufixo', () => {
    expect(fmtCurrencyParts(222_620_000)).toEqual({ sym: 'R$', num: '222,62', suffix: 'M' })
    expect(fmtCurrencyParts(1_200_000_000, 'GBP')).toEqual({ sym: '£', num: '1,20', suffix: 'Bi' })
    expect(fmtCurrencyParts(4_300)).toEqual({ sym: 'R$', num: '4,3', suffix: 'K' })
    expect(fmtCurrencyParts(12)).toEqual({ sym: 'R$', num: '12', suffix: '' })
    expect(fmtCurrencyParts(null)).toEqual({ sym: '', num: '—', suffix: '' })
  })

  it('fmtCurrencyFull usa separadores brasileiros', () => {
    expect(fmtCurrencyFull(7_500_000)).toBe('R$ 7.500.000,00')
    expect(fmtCurrencyFull(0.5, 'EUR')).toBe('€ 0,50')
    expect(fmtCurrencyFull(null)).toBe('—')
  })

  it('fmtPercent', () => {
    expect(fmtPercent(50)).toBe('50,00%')
    expect(fmtPercent(33.333)).toBe('33,33%')
    expect(fmtPercent(undefined)).toBe('—')
  })
})

describe('formatação de datas', () => {
  it('fmtDate converte ISO (com ou sem hora) para dd/mm/aaaa', () => {
    expect(fmtDate('2026-02-28')).toBe('28/02/2026')
    expect(fmtDate('2026-02-28T23:59:00Z')).toBe('28/02/2026')
    expect(fmtDate(null)).toBe('—')
    expect(fmtDate('')).toBe('—')
  })

  it('fmtMonthYear mostra mês abreviado e ano', () => {
    const s = fmtMonthYear('2026-01-01')
    expect(s).toMatch(/jan/i)
    expect(s).toContain('2026')
    // dia 1 não pode "voltar" para dezembro por fuso horário
    expect(fmtMonthYear('2026-03-01')).toMatch(/mar/i)
    expect(fmtMonthYear(null)).toBe('—')
  })

  it('isoToYearMonth', () => {
    expect(isoToYearMonth('2026-07-15')).toBe('2026-07')
    expect(isoToYearMonth('2026-07-15T10:00:00Z')).toBe('2026-07')
  })

  it('addDays atravessa mês, ano e 29/fev', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('addMonths soma meses e atravessa o ano', () => {
    expect(addMonths('2026-01-15', 1)).toBe('2026-02-15')
    expect(addMonths('2026-11-05', 3)).toBe('2027-02-05')
    expect(addMonths('2026-03-10', -3)).toBe('2025-12-10')
    expect(addMonths('2026-05-20', 0)).toBe('2026-05-20')
  })

  it('addMonths limita ao último dia do mês (não "pula" fevereiro)', () => {
    // Bug corrigido: antes, 31/01 + 1 mês virava 03/03 (overflow do Date).
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonths('2026-03-31', 1)).toBe('2026-04-30')
    expect(addMonths('2026-08-31', 6)).toBe('2027-02-28')
    expect(addMonths('2026-01-31', 2)).toBe('2026-03-31')
  })

  it('monthsBetween conta a vigência em meses', () => {
    expect(monthsBetween('2026-01-01', '2029-01-01')).toBe(36)
    expect(monthsBetween('2026-01-01', '2028-12-31')).toBe(36)
    expect(monthsBetween('2026-01-15', '2026-01-15')).toBe(0)
    expect(monthsBetween('2026-01-15', '2026-02-14')).toBe(1)
    expect(monthsBetween('2026-01-31', '2026-02-28')).toBe(1)
    expect(monthsBetween('2026-05-01', '2026-01-01')).toBe(0) // término antes do início
    expect(monthsBetween('lixo', '2026-01-01')).toBe(0)
  })
})

describe('datas relativas a hoje', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-22T15:00:00-03:00'))
  })
  afterEach(() => { vi.useRealTimers() })

  it('todayISO', () => {
    expect(todayISO()).toBe('2026-09-22')
  })

  it('daysFromToday', () => {
    expect(daysFromToday('2026-09-22')).toBe(0)
    expect(daysFromToday('2026-09-23')).toBe(1)
    expect(daysFromToday('2026-09-21')).toBe(-1)
    expect(daysFromToday('2026-10-22')).toBe(30)
    expect(daysFromToday(null)).toBeNull()
  })

  it('fmtRelative', () => {
    expect(fmtRelative('2026-09-22')).toBe('Hoje')
    expect(fmtRelative('2026-09-23')).toBe('Amanhã')
    expect(fmtRelative('2026-09-21')).toBe('Ontem')
    expect(fmtRelative('2026-09-12')).toBe('10 dias atraso')
    expect(fmtRelative('2026-10-02')).toBe('Em 10 dias')
    expect(fmtRelative(undefined)).toBe('—')
  })

  it('isOverdue: vencida só depois do fim do dia; paga/cancelada nunca', () => {
    expect(isOverdue('2026-09-22', 'PENDENTE')).toBe(false)
    expect(isOverdue('2026-09-21', 'PENDENTE')).toBe(true)
    expect(isOverdue('2026-09-21', 'PAGA')).toBe(false)
    expect(isOverdue('2026-09-21', 'CANCELADA')).toBe(false)
    expect(isOverdue(null, 'PENDENTE')).toBe(false)
  })

  it('isDueSoon: janela [hoje, hoje+N]', () => {
    expect(isDueSoon('2026-09-22', 'PENDENTE')).toBe(true)
    expect(isDueSoon('2026-10-22', 'PENDENTE')).toBe(true)
    expect(isDueSoon('2026-10-23', 'PENDENTE')).toBe(false)
    expect(isDueSoon('2026-09-21', 'PENDENTE')).toBe(false)
    expect(isDueSoon('2026-09-25', 'PENDENTE', 2)).toBe(false)
    expect(isDueSoon('2026-09-25', 'PAGA')).toBe(false)
    expect(isDueSoon(undefined, 'PENDENTE')).toBe(false)
  })
})

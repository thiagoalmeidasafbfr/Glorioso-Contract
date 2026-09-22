import { describe, expect, it } from 'vitest'
import {
  clean, normAthleteRef, normDoc, num, canonCurrency, canonLiabStatus, rawStatusLabel,
  parseParcela, parseVenc, toIsoDate, conditional, toYearMonth as canonYearMonth,
  competenceToYearMonth, pick, sourceKey, DIR_PAGAR, DIR_RECEBER, canonAthleteStatus,
} from '../importCanon'
import {
  S, orNull, N, Nn, cur, bool, norm, toYearMonth, buildAthleteIndex, buildNameIndex,
  dupKey, emptyResult, resultMessage,
} from '../importHelpers'
import type { Athlete } from '../../types/athlete-system'

describe('importCanon', () => {
  it('clean remove sentinelas e espaços', () => {
    for (const s of ['', '  ', 'N/A', 'n/i', '#N/A', '-', 'na', 'NULL', null, undefined]) {
      expect(clean(s)).toBeNull()
    }
    expect(clean('  Flamengo ')).toBe('Flamengo')
    expect(clean(0)).toBe('0')
  })

  it('normAthleteRef: CPF numérico recupera o zero à esquerda', () => {
    expect(normAthleteRef(1234567890)).toBe('01234567890')
    expect(normAthleteRef('01234567890')).toBe('01234567890')
    expect(normAthleteRef(' ab 12345 ')).toBe('AB12345')
    expect(normAthleteRef('#N/A')).toBeNull()
  })

  it('normAthleteRef: CPF formatado vira a mesma chave do CPF numérico', () => {
    expect(normAthleteRef('012.345.678-90')).toBe('01234567890')
    expect(normAthleteRef('12.345.678-90')).toBe('01234567890')
  })

  it('normDoc: CNPJ/CPF só dígitos; id estrangeiro em maiúsculas', () => {
    expect(normDoc('12.345.678/0001-90')).toBe('12345678000190')
    expect(normDoc('123.456.789-01')).toBe('12345678901')
    expect(normDoc('fifa 123')).toBe('FIFA123')
    expect(normDoc('N/I')).toBeNull()
  })

  it('num aceita formato brasileiro e simples', () => {
    expect(num('1.234,56')).toBe(1234.56)
    expect(num('R$ 1.234.567,89')).toBe(1234567.89)
    expect(num('1234.56')).toBe(1234.56)
    expect(num('12,5')).toBe(12.5)
    expect(num(-3)).toBe(-3)
    expect(num('N/A')).toBeNull()
    expect(num(null)).toBeNull()
  })

  it('num: texto sem dígitos vira 0 (comportamento atual, preservado)', () => {
    // Não é sentinela, então cai em Number('') === 0. Mantido de propósito:
    // o valor entra no source_key das importações e mudar para null alteraria
    // as chaves de linhas já importadas (quebrando a idempotência).
    expect(num('a definir')).toBe(0)
    expect(num('€')).toBe(0)
  })

  it('canonCurrency', () => {
    expect(canonCurrency('Dólar')).toBe('USD')
    expect(canonCurrency('dolar americano')).toBe('USD')
    expect(canonCurrency('US$')).toBe('USD')
    expect(canonCurrency('Euro')).toBe('EUR')
    expect(canonCurrency('€')).toBe('EUR')
    expect(canonCurrency('Libra')).toBe('GBP')
    expect(canonCurrency('£')).toBe('GBP')
    expect(canonCurrency('Real')).toBe('BRL')
    expect(canonCurrency('A definir')).toBe('BRL')
    expect(canonCurrency(null)).toBe('BRL')
  })

  it('canonLiabStatus e rawStatusLabel', () => {
    expect(canonLiabStatus('PAgo')).toBe('PAGA')
    expect(canonLiabStatus('Atrasado')).toBe('EM_ATRASO')
    expect(canonLiabStatus('Revogado')).toBe('CANCELADA')
    expect(canonLiabStatus('Baixado')).toBe('CANCELADA')
    expect(canonLiabStatus('cancelada')).toBe('CANCELADA')
    expect(canonLiabStatus('A pagar')).toBe('PENDENTE')
    expect(canonLiabStatus(undefined)).toBe('PENDENTE')
    expect(rawStatusLabel(' Aguardando condição ')).toBe('Aguardando condição')
    expect(rawStatusLabel('N/A')).toBe('—')
  })

  it('parseParcela', () => {
    expect(parseParcela('3/10')).toEqual({ number: 3, total: 10, label: '3/10' })
    expect(parseParcela('2 / 4')).toEqual({ number: 2, total: 4, label: '2 / 4' })
    expect(parseParcela('5')).toEqual({ number: 5, total: 5, label: '5' })
    expect(parseParcela('única')).toEqual({ number: 1, total: 1, label: 'única' })
    expect(parseParcela(null)).toEqual({ number: 1, total: 1, label: '1/1' })
  })

  it('parseVenc distingue data de texto condicional', () => {
    expect(parseVenc('2026-05-10T00:00:00')).toEqual({ date: '2026-05-10', text: null })
    expect(parseVenc('5 dias após a meta')).toEqual({ date: null, text: '5 dias após a meta' })
    expect(parseVenc('')).toEqual({ date: null, text: null })
  })

  it('toIsoDate aceita ISO e dd/mm/aaaa', () => {
    expect(toIsoDate('2026-02-29')).toBe('2026-02-29') // não valida calendário
    expect(toIsoDate('31/12/2026')).toBe('2026-12-31')
    expect(toIsoDate('12/2026')).toBeNull()
    expect(toIsoDate('#N/A')).toBeNull()
  })

  it('conditional e toYearMonth', () => {
    expect(conditional('Condicional')).toBe(true)
    expect(conditional('Fixo')).toBe(false)
    expect(conditional(null)).toBe(false)
    expect(canonYearMonth('15/03/2026')).toBe('2026-03')
    expect(canonYearMonth('lixo')).toBeNull()
  })

  it('competenceToYearMonth', () => {
    expect(competenceToYearMonth('2026-03-01', null)).toBe('2026-03')
    expect(competenceToYearMonth('Jan-26', null)).toBe('2026-01')
    expect(competenceToYearMonth('jan/2026', null)).toBe('2026-01')
    expect(competenceToYearMonth('Março 2027', null)).toBe('2027-03')
    expect(competenceToYearMonth('December', 2025)).toBe('2025-12')
    expect(competenceToYearMonth('set', 2026)).toBe('2026-09')
    expect(competenceToYearMonth('January', null)).toBeNull()
    expect(competenceToYearMonth('Foo-26', null)).toBeNull()
    expect(competenceToYearMonth('', 2026)).toBeNull()
  })

  it('pick devolve a primeira coluna existente', () => {
    const row = { Nome: 'A', 'Nome ': 'B', Valor: '' }
    expect(pick(row, 'Name', 'Nome')).toBe('A')
    expect(pick(row, 'Valor')).toBe('')
    expect(pick(row, 'X')).toBeUndefined()
  })

  it('sourceKey é determinístico e sensível às partes', () => {
    const a = sourceKey('atleta', 1, null, 'x')
    expect(a).toBe(sourceKey('atleta', 1, undefined, 'x'))
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]+$/)
    expect(a).not.toBe(sourceKey('atleta', 2, null, 'x'))
    expect(sourceKey('ab', 'c')).not.toBe(sourceKey('a', 'bc'))
    expect(sourceKey()).toBe('811c9dc5-0')
  })

  it('direções e status de atleta', () => {
    expect(DIR_PAGAR).toBe('A_PAGAR')
    expect(DIR_RECEBER).toBe('A_RECEBER')
    expect(canonAthleteStatus('Emprestado')).toBe('EMPRESTADO')
    expect(canonAthleteStatus('Rescindido')).toBe('DESLIGADO')
    expect(canonAthleteStatus('Encerrado')).toBe('DESLIGADO')
    expect(canonAthleteStatus('Vendido')).toBe('VENDIDO')
    expect(canonAthleteStatus('Elenco')).toBe('ATIVO')
    expect(canonAthleteStatus(null)).toBe('ATIVO')
  })
})

describe('importHelpers', () => {
  it('S e orNull', () => {
    expect(S('  x ')).toBe('x')
    expect(S(null)).toBe('')
    expect(S(12)).toBe('12')
    expect(orNull('  ')).toBeNull()
    expect(orNull(' a ')).toBe('a')
  })

  it('N: vírgula = decimal brasileiro; vazio/inválido = 0', () => {
    expect(N('1.234,56')).toBe(1234.56)
    expect(N('R$ 10,5')).toBe(10.5)
    expect(N('1234.56')).toBe(1234.56)
    expect(N(42)).toBe(42)
    expect(N('-7,25')).toBe(-7.25)
    expect(N('')).toBe(0)
    expect(N('abc')).toBe(0)
    expect(N(undefined)).toBe(0)
  })

  it('Nn distingue vazio (null) de zero', () => {
    expect(Nn('')).toBeNull()
    expect(Nn(null)).toBeNull()
    expect(Nn('0')).toBe(0)
    expect(Nn('3,5')).toBe(3.5)
  })

  it('cur aceita só moedas suportadas', () => {
    expect(cur(' eur ')).toBe('EUR')
    expect(cur('GBP')).toBe('GBP')
    expect(cur('JPY')).toBe('BRL')
    expect(cur(null)).toBe('BRL')
  })

  it('bool', () => {
    for (const v of ['true', '1', 'Sim', 's', 'VERDADEIRO', 'x', 1, true]) expect(bool(v)).toBe(true)
    for (const v of ['false', '0', 'não', '', null, 0]) expect(bool(v)).toBe(false)
  })

  it('norm e toYearMonth', () => {
    expect(norm('  João   da  Silva ')).toBe('joão da silva')
    expect(toYearMonth('2026-03-15')).toBe('2026-03')
    expect(toYearMonth('competência 2026-11')).toBe('2026-11')
    expect(toYearMonth('mar/26')).toBe('')
  })

  it('buildAthleteIndex indexa nome curto e completo normalizados', () => {
    const athletes = [
      { id: '1', short_name: 'Jeffinho', full_name: 'Jefferson  Silva' },
      { id: '2', short_name: '', full_name: 'Carlos Alberto' },
    ] as Athlete[]
    const idx = buildAthleteIndex(athletes)
    expect(idx.get('jeffinho')).toBe('1')
    expect(idx.get('jefferson silva')).toBe('1')
    expect(idx.get('carlos alberto')).toBe('2')
    expect(idx.size).toBe(3)
  })

  it('buildNameIndex ignora nomes vazios', () => {
    const idx = buildNameIndex([{ id: 'a', name: 'Flamengo ' }, { id: 'b', name: '' }])
    expect(idx.get('flamengo')).toBe('a')
    expect(idx.size).toBe(1)
  })

  it('dupKey normaliza cada parte', () => {
    expect(dupKey(' Flamengo', 1000, null, 'EUR')).toBe('flamengo|1000||eur')
    expect(dupKey('A  B')).toBe(dupKey('a b'))
  })

  it('emptyResult e resultMessage', () => {
    const r = emptyResult()
    expect(r).toEqual({ created: 0, dupSkipped: 0, noAthlete: 0, invalid: 0 })
    expect(resultMessage(r)).toBe('0 criado(s)')
    expect(resultMessage({ created: 3, dupSkipped: 2, noAthlete: 1, invalid: 4 }))
      .toBe('3 criado(s) · 2 duplicado(s) ignorado(s) · 1 sem atleta correspondente · 4 inválido(s)')
    expect(emptyResult()).not.toBe(r) // objeto novo a cada chamada
  })
})

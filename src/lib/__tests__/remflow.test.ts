import { describe, expect, it } from 'vitest'
import { buildRemunerationFlow } from '../remflow'

describe('buildRemunerationFlow', () => {
  it('exemplo do módulo: entrada em 15/01, 500k, vencimento dia 5', () => {
    const flow = buildRemunerationFlow('2026-01-15', '2026-03-31', 500_000, 5)
    expect(flow).toEqual([
      // 17 de 31 dias ativos
      { competencia: '2026-01', due_date: '2026-02-05', value: 274_193.55, full: false },
      { competencia: '2026-02', due_date: '2026-03-05', value: 500_000, full: true },
      { competencia: '2026-03', due_date: '2026-04-05', value: 500_000, full: true },
    ])
  })

  it('mês final quebrado é proporcional e dezembro vence em janeiro do ano seguinte', () => {
    const flow = buildRemunerationFlow('2026-11-01', '2026-12-10', 310_000, 20)
    expect(flow).toHaveLength(2)
    expect(flow[0]).toEqual({ competencia: '2026-11', due_date: '2026-12-20', value: 310_000, full: true })
    expect(flow[1]).toEqual({ competencia: '2026-12', due_date: '2027-01-20', value: 100_000, full: false })
  })

  it('fevereiro de ano bissexto tem 29 dias no pró-rata', () => {
    const [leap] = buildRemunerationFlow('2028-02-15', '2028-02-29', 290_000, 5)
    expect(leap).toEqual({ competencia: '2028-02', due_date: '2028-03-05', value: 150_000, full: false })
    const [common] = buildRemunerationFlow('2027-02-15', '2027-02-28', 280_000, 5)
    expect(common.value).toBe(140_000)
    // 01→28/02 de ano comum é mês cheio
    expect(buildRemunerationFlow('2027-02-01', '2027-02-28', 1, 5)[0].full).toBe(true)
    expect(buildRemunerationFlow('2028-02-01', '2028-02-28', 1, 5)[0].full).toBe(false)
  })

  it('início e fim no mesmo dia = 1 dia de pró-rata', () => {
    const flow = buildRemunerationFlow('2026-04-10', '2026-04-10', 300_000, 5)
    expect(flow).toEqual([{ competencia: '2026-04', due_date: '2026-05-05', value: 10_000, full: false }])
  })

  it('vigência plurianual gera uma linha por competência', () => {
    const flow = buildRemunerationFlow('2026-01-01', '2028-12-31', 1000, 5)
    expect(flow).toHaveLength(36)
    expect(flow.every(l => l.full && l.value === 1000)).toBe(true)
    expect(flow[35].due_date).toBe('2029-01-05')
  })

  it('entradas inválidas retornam fluxo vazio', () => {
    expect(buildRemunerationFlow('', '2026-12-31', 100, 5)).toEqual([])
    expect(buildRemunerationFlow('2026-01-01', '', 100, 5)).toEqual([])
    expect(buildRemunerationFlow('2026-01-01', '2026-12-31', 0, 5)).toEqual([])
    expect(buildRemunerationFlow('2026-01-01', '2026-12-31', -1, 5)).toEqual([])
    expect(buildRemunerationFlow('2026-01-01', '2026-12-31', NaN, 5)).toEqual([])
    expect(buildRemunerationFlow('2026-12-31', '2026-01-01', 100, 5)).toEqual([])
    expect(buildRemunerationFlow('xx', '2026-01-01', 100, 5)).toEqual([])
  })
})

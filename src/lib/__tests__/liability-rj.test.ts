import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Clause, NewClauseInput } from '../../types/athlete-system'

vi.mock('../athleteQueries', () => ({
  createClause: vi.fn(),
  deleteClubLiability: vi.fn(),
  deleteIntermediaryLiability: vi.fn(),
  updateInstallment: vi.fn(),
  updateClause: vi.fn(),
  updateClubLiability: vi.fn(),
  updateIntermediaryLiability: vi.fn(),
}))

import * as q from '../athleteQueries'
import { promoteLiabilityToClause, PROMOTE_HINT } from '../liabilityFlow'
import {
  parseRJ, isUnderRJ, addRJTag, stripRJTag, markItemRJ, unmarkItemRJ, toggleItemRJ, markManyRJ,
} from '../judicialRecovery'
import { makeClause, makeClubLiab, makeIntermLiab } from './fixtures'

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-22T12:00:00-03:00'))
  vi.mocked(q.createClause).mockImplementation(async (contractId, athleteId, input: NewClauseInput) =>
    makeClause({ ...input, id: 'promoted', contract_id: contractId ?? '', athlete_id: athleteId } as Partial<Clause>))
})
afterEach(() => { vi.useRealTimers() })

describe('promoteLiabilityToClause', () => {
  it('passivo de clube a pagar → TRANSFER_FEE_FIXO com Botafogo devedor; apaga o passivo', async () => {
    const liab = makeClubLiab({ description: 'Parcela da compra', condition_description: 'após BID', notes: 'obs' })
    const c = await promoteLiabilityToClause('club', liab)
    expect(c.id).toBe('promoted')
    const [contractId, athleteId, input] = vi.mocked(q.createClause).mock.calls[0]
    expect(contractId).toBeNull()
    expect(athleteId).toBe('at-1')
    expect(input).toMatchObject({
      clause_type: 'TRANSFER_FEE_FIXO', description: 'Parcela da compra',
      creditor_party: 'Clube X', debtor_party: 'Botafogo SAF', currency: 'EUR', original_value: 1000,
      condition_description: 'após BID', due_date: '2026-03-10', installments_total: 1, notes: 'obs',
    })
    expect(q.deleteClubLiability).toHaveBeenCalledWith('cb-1')
    expect(q.deleteIntermediaryLiability).not.toHaveBeenCalled()
  })

  it('solidariedade vira SOLIDARIEDADE_FIFA', async () => {
    await promoteLiabilityToClause('club', makeClubLiab({ solidarity: true }))
    expect(vi.mocked(q.createClause).mock.calls[0][2].clause_type).toBe('SOLIDARIEDADE_FIFA')
  })

  it('agente a receber → INTERMEDIACAO, mantém o contrato, Botafogo credor, vencimento padrão hoje', async () => {
    await promoteLiabilityToClause('agent', makeIntermLiab())
    const [contractId, , input] = vi.mocked(q.createClause).mock.calls[0]
    expect(contractId).toBe('ct-9')
    expect(input).toMatchObject({
      clause_type: 'INTERMEDIACAO', description: 'Comissão de agente — Agente Y',
      creditor_party: 'Botafogo SAF', debtor_party: 'Agente Y', due_date: '2026-09-22',
      condition_description: '', notes: '',
    })
    expect(q.deleteIntermediaryLiability).toHaveBeenCalledWith('ag-1')
  })

  it('descrição padrão para clube sem descrição', async () => {
    await promoteLiabilityToClause('club', makeClubLiab({ description: '' }))
    expect(vi.mocked(q.createClause).mock.calls[0][2].description).toBe('Obrigação — Clube X')
    expect(PROMOTE_HINT).toMatch(/parcelas/)
  })
})

describe('marcador de Recuperação Judicial', () => {
  it('parseRJ / isUnderRJ', () => {
    expect(parseRJ('[RJ:2026-05-10] texto')).toEqual({ filedAt: '2026-05-10' })
    expect(parseRJ('antes [RJ:2026-05-10]')).toEqual({ filedAt: '2026-05-10' })
    expect(parseRJ('[RJ:2026-5-10]')).toBeNull()
    expect(parseRJ(null)).toBeNull()
    expect(isUnderRJ('[RJ:2026-01-01]')).toBe(true)
    expect(isUnderRJ('')).toBe(false)
  })

  it('addRJTag é idempotente e troca a data', () => {
    expect(addRJTag('nota', '2026-01-01')).toBe('[RJ:2026-01-01] nota')
    expect(addRJTag(null, '2026-01-01')).toBe('[RJ:2026-01-01]')
    expect(addRJTag('[RJ:2025-12-01] nota', '2026-01-01')).toBe('[RJ:2026-01-01] nota')
    expect(addRJTag(addRJTag('x', '2026-01-01'), '2026-01-01')).toBe('[RJ:2026-01-01] x')
  })

  it('stripRJTag remove o marcador e devolve null se vazio', () => {
    expect(stripRJTag('[RJ:2026-01-01] nota')).toBe('nota')
    expect(stripRJTag('a [RJ:2026-01-01] b')).toBe('a b')
    expect(stripRJTag('[RJ:2026-01-01]')).toBeNull()
    expect(stripRJTag('sem marcador')).toBe('sem marcador')
    expect(stripRJTag(undefined)).toBeNull()
  })

  it('markItemRJ / unmarkItemRJ roteiam para a atualização certa', async () => {
    await markItemRJ({ kind: 'inst', id: 'i' }, 'n', '2026-02-02')
    await markItemRJ({ kind: 'clause', id: 'c' }, null)
    await markItemRJ({ kind: 'club', id: 'k' }, null, '2026-02-02')
    await markItemRJ({ kind: 'agent', id: 'a' }, null, '2026-02-02')
    expect(q.updateInstallment).toHaveBeenCalledWith('i', { notes: '[RJ:2026-02-02] n' })
    expect(q.updateClause).toHaveBeenCalledWith('c', { notes: '[RJ:2026-09-22]' }) // default = hoje
    expect(q.updateClubLiability).toHaveBeenCalledWith('k', { notes: '[RJ:2026-02-02]' })
    expect(q.updateIntermediaryLiability).toHaveBeenCalledWith('a', { notes: '[RJ:2026-02-02]' })

    vi.clearAllMocks()
    await unmarkItemRJ({ kind: 'inst', id: 'i' }, '[RJ:2026-02-02] n')
    await unmarkItemRJ({ kind: 'clause', id: 'c' }, '[RJ:2026-02-02]')
    await unmarkItemRJ({ kind: 'club', id: 'k' }, '[RJ:2026-02-02]')
    await unmarkItemRJ({ kind: 'agent', id: 'a' }, 'x')
    expect(q.updateInstallment).toHaveBeenCalledWith('i', { notes: 'n' })
    expect(q.updateClause).toHaveBeenCalledWith('c', { notes: null })
    expect(q.updateClubLiability).toHaveBeenCalledWith('k', { notes: null })
    expect(q.updateIntermediaryLiability).toHaveBeenCalledWith('a', { notes: 'x' })
  })

  it('toggleItemRJ alterna conforme as notas atuais', async () => {
    expect(await toggleItemRJ({ kind: 'inst', id: 'i' }, 'n', '2026-03-03')).toBe('marked')
    expect(q.updateInstallment).toHaveBeenLastCalledWith('i', { notes: '[RJ:2026-03-03] n' })
    expect(await toggleItemRJ({ kind: 'inst', id: 'i' }, '[RJ:2026-03-03] n')).toBe('unmarked')
    expect(q.updateInstallment).toHaveBeenLastCalledWith('i', { notes: 'n' })
  })

  it('markManyRJ marca todos com a mesma data', async () => {
    await markManyRJ([
      { kind: 'inst', id: 'i1', notes: null },
      { kind: 'inst', id: 'i2', notes: 'obs' },
    ], '2026-04-04')
    expect(vi.mocked(q.updateInstallment).mock.calls).toEqual([
      ['i1', { notes: '[RJ:2026-04-04]' }],
      ['i2', { notes: '[RJ:2026-04-04] obs' }],
    ])
    await markManyRJ([])
  })
})

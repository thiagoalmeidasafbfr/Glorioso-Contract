import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Clause, ClauseInstallment, NewClauseInput } from '../../types/athlete-system'

vi.mock('../athleteQueries', () => ({
  createClause: vi.fn(),
  createClauseInstallments: vi.fn(),
  updateClause: vi.fn(),
  updateInstallment: vi.fn(),
  updateClubLiability: vi.fn(),
  updateIntermediaryLiability: vi.fn(),
  deleteClause: vi.fn(),
  fetchClauseInstallments: vi.fn(),
  fetchAllInstallments: vi.fn(),
}))

import * as q from '../athleteQueries'
import {
  ACORDO_TYPE, encodeAcordo, decodeAcordo, isAcordo, renegotiatedAcordoId, stripAcordoNote,
  createRenegotiation, restoreSource, checkRenegotiation, revertRenegotiation,
  removeAcordoSource, updateRenegotiation, type AcordoMeta, type RenegotiationInput,
} from '../renegotiation'
import { makeClause, makeInstallment } from './fixtures'

const m = {
  createClause: vi.mocked(q.createClause),
  createInsts: vi.mocked(q.createClauseInstallments),
  updateClause: vi.mocked(q.updateClause),
  updateInstallment: vi.mocked(q.updateInstallment),
  updateClubLiability: vi.mocked(q.updateClubLiability),
  updateIntermediaryLiability: vi.mocked(q.updateIntermediaryLiability),
  deleteClause: vi.mocked(q.deleteClause),
  fetchClauseInstallments: vi.mocked(q.fetchClauseInstallments),
  fetchAllInstallments: vi.mocked(q.fetchAllInstallments),
}

const meta: AcordoMeta = {
  __acordo: 1, createdAt: '2026-09-22', originalTotal: 1_000_000, newTotal: 900_000, discount: 100_000,
  currency: 'BRL', creditor: 'Agente Y', debtor: 'Botafogo SAF', startDate: '2026-10-01',
  installmentsCount: 10, periodicityMonths: 1, userNote: 'nota',
  sources: [
    { installmentId: 'i1', label: 'Parcela 1/5', value: 200_000, dueDate: '2026-05-01' },
    { clauseId: 'c1', label: 'Luvas', value: 300_000 },
    { clubLiabId: 'cb1', label: 'Clube', value: 250_000 },
    { intermLiabId: 'ag1', label: 'Agente', value: 250_000 },
  ],
}

describe('codificação dos metadados em notes', () => {
  it('encode/decode ida e volta com prefixo __ACORDO__', () => {
    const notes = encodeAcordo(meta)
    expect(notes.startsWith('__ACORDO__{')).toBe(true)
    expect(decodeAcordo(notes)).toEqual(meta)
  })

  it('decode aceita JSON legado sem prefixo e rejeita o resto', () => {
    expect(decodeAcordo(JSON.stringify(meta))).toEqual(meta)
    expect(decodeAcordo('__ACORDO__{quebrado')).toBeNull()
    expect(decodeAcordo('{"outro":1}')).toBeNull()
    expect(decodeAcordo('texto livre')).toBeNull()
    expect(decodeAcordo('null')).toBeNull()
    expect(decodeAcordo(null)).toBeNull()
    expect(decodeAcordo('')).toBeNull()
  })

  it('isAcordo pelo tipo da cláusula', () => {
    expect(isAcordo(makeClause({ clause_type: ACORDO_TYPE }))).toBe(true)
    expect(isAcordo(makeClause({ clause_type: 'LUVAS' }))).toBe(false)
  })
})

describe('notas de rastreio "Renegociado no acordo"', () => {
  const note = 'Parcela 2/5 · Renegociado no acordo abc-123 em 2026-09-22'

  it('renegotiatedAcordoId extrai o id', () => {
    expect(renegotiatedAcordoId(note)).toBe('abc-123')
    expect(renegotiatedAcordoId('Renegociado no acordo x9 em 2026-01-01')).toBe('x9')
    expect(renegotiatedAcordoId('nada')).toBeNull()
    expect(renegotiatedAcordoId(undefined)).toBeNull()
  })

  it('stripAcordoNote remove a marca (de um acordo específico ou qualquer)', () => {
    expect(stripAcordoNote(note)).toBe('Parcela 2/5')
    expect(stripAcordoNote(note, 'abc-123')).toBe('Parcela 2/5')
    expect(stripAcordoNote(note, 'outro')).toBe(note)
    expect(stripAcordoNote('Renegociado no acordo z em 2026-01-01')).toBeNull()
    expect(stripAcordoNote(null)).toBeNull()
  })
})

describe('createRenegotiation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-22T12:00:00-03:00'))
    m.createClause.mockImplementation(async (contractId, athleteId, input: NewClauseInput) =>
      makeClause({ ...input, id: 'acordo-1', contract_id: contractId ?? '', athlete_id: athleteId } as Partial<Clause>))
    m.createInsts.mockImplementation(async (clauseId, athleteId, rows) =>
      rows.map((r, i) => makeInstallment({ ...r, id: `n${i}`, clause_id: clauseId, athlete_id: athleteId })))
  })
  afterEach(() => { vi.useRealTimers() })

  const base: RenegotiationInput = {
    athleteId: 'at-1', creditor: 'Agente Y', debtor: 'Botafogo SAF', currency: 'BRL',
    sources: [
      { installmentId: 'i1', label: 'Parcela 1/2', value: 500_000.004 },
      { installmentId: 'i2', label: '', value: 500_000 },
    ],
    newTotal: 1_000_000, startDate: '2026-10-15', installmentsCount: 3, periodicityMonths: 1, userNote: 'obs',
  }

  const rowsCreated = () => m.createInsts.mock.calls[0][2] as Pick<ClauseInstallment, 'due_date' | 'original_value'>[]

  it('divide igualmente, a última parcela absorve o arredondamento', async () => {
    const r = await createRenegotiation(base)
    expect(rowsCreated().map(x => [x.due_date, x.original_value])).toEqual([
      ['2026-10-15', 333_333.33], ['2026-11-15', 333_333.33], ['2026-12-15', 333_333.34],
    ])
    expect(r.installments).toHaveLength(3)
    const clauseInput = m.createClause.mock.calls[0][2]
    expect(clauseInput).toMatchObject({
      clause_type: ACORDO_TYPE, original_value: 1_000_000, installments_total: 3, due_date: '2026-10-15',
    })
    expect(m.createClause.mock.calls[0][0]).toBeNull() // sem contrato
    const saved = decodeAcordo(clauseInput.notes)!
    expect(saved).toMatchObject({ originalTotal: 1_000_000, newTotal: 1_000_000, discount: 0, createdAt: '2026-09-22' })
  })

  it('divisão em centavos: 1.009,80 em 10x são 10 parcelas iguais', async () => {
    // Bug corrigido: o floor em ponto flutuante gerava 9 × 100,97 + 101,07.
    await createRenegotiation({ ...base, newTotal: 1009.8, installmentsCount: 10 })
    const values = rowsCreated().map(x => x.original_value)
    expect(values).toEqual(Array(10).fill(100.98))
    await createRenegotiation({ ...base, newTotal: 0.21, installmentsCount: 3 })
    expect((m.createInsts.mock.calls[1][2]).map(x => x.original_value)).toEqual([0.07, 0.07, 0.07])
  })

  it('desconto, periodicidade e fim de mês (31 → 28/fev)', async () => {
    await createRenegotiation({
      ...base, newTotal: 900_000, installmentsCount: 4, periodicityMonths: 1, startDate: '2026-01-31',
    })
    expect(rowsCreated().map(x => x.due_date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
    const input = m.createClause.mock.calls[0][2]
    expect(input.description).toContain('desconto')
    expect(decodeAcordo(input.notes)!.discount).toBe(100_000)
  })

  it('periodicidade trimestral e contagem inválida vira 1', async () => {
    await createRenegotiation({ ...base, installmentsCount: 3, periodicityMonths: 3 })
    expect(rowsCreated().map(x => x.due_date)).toEqual(['2026-10-15', '2027-01-15', '2027-04-15'])
    await createRenegotiation({ ...base, installmentsCount: 0, periodicityMonths: 0 })
    expect(m.createInsts.mock.calls[1][2]).toHaveLength(1)
  })

  it('acréscimo aparece na descrição', async () => {
    await createRenegotiation({ ...base, newTotal: 1_200_000 })
    expect(m.createClause.mock.calls[0][2].description).toContain('acréscimo')
  })

  it('fluxo personalizado tem prioridade e define total/datas', async () => {
    await createRenegotiation({
      ...base,
      schedule: [{ due_date: '2026-11-01', value: 100.005 }, { due_date: '2027-03-10', value: 399.995 }],
    })
    const input = m.createClause.mock.calls[0][2]
    const saved = decodeAcordo(input.notes)!
    expect(saved).toMatchObject({ periodicityMonths: 0, installmentsCount: 2, startDate: '2026-11-01' })
    expect(input.due_date).toBe('2026-11-01')
    expect(input.description).toContain('fluxo personalizado')
    expect(rowsCreated().map(x => x.due_date)).toEqual(['2026-11-01', '2027-03-10'])
  })

  it('cancela cada item de origem com nota de rastreio', async () => {
    await createRenegotiation({
      ...base,
      sources: [
        { installmentId: 'i1', label: 'Parc 1', value: 1 },
        { clauseId: 'c1', label: '', value: 1 },
        { clubLiabId: 'cb1', label: 'Clube', value: 1 },
        { intermLiabId: 'ag1', label: 'Agente', value: 1 },
        { label: 'sem vínculo', value: 1 },
      ],
    })
    const ref = 'Renegociado no acordo acordo-1 em 2026-09-22'
    expect(m.updateInstallment).toHaveBeenCalledWith('i1', { payment_status: 'CANCELADA', notes: `Parc 1 · ${ref}` })
    expect(m.updateClause).toHaveBeenCalledWith('c1', { payment_status: 'CANCELADA', notes: ref })
    expect(m.updateClubLiability).toHaveBeenCalledWith('cb1', { status: 'CANCELADA', notes: `Clube · ${ref}` })
    expect(m.updateIntermediaryLiability).toHaveBeenCalledWith('ag1', { status: 'CANCELADA', notes: `Agente · ${ref}` })
    expect(renegotiatedAcordoId(`Parc 1 · ${ref}`)).toBe('acordo-1')
  })
})

describe('desfazer / editar acordo', () => {
  beforeEach(() => { vi.clearAllMocks() })
  const acordo = makeClause({ id: 'ac-9', clause_type: ACORDO_TYPE, notes: encodeAcordo(meta), creditor_party: 'Agente Y' })

  it('restoreSource devolve parcela a PENDENTE limpando só a nota do acordo', async () => {
    m.fetchAllInstallments.mockResolvedValue([
      makeInstallment({ id: 'i1', notes: 'Parcela 1/5 · Renegociado no acordo ac-9 em 2026-09-22' }),
    ])
    await restoreSource(meta.sources[0], 'ac-9')
    expect(m.updateInstallment).toHaveBeenCalledWith('i1', { payment_status: 'PENDENTE', payment_date: null, notes: 'Parcela 1/5' })
  })

  it('restoreSource tolera parcela inexistente/erro de leitura', async () => {
    m.fetchAllInstallments.mockRejectedValue(new Error('offline'))
    await restoreSource(meta.sources[0], 'ac-9')
    expect(m.updateInstallment).toHaveBeenCalledWith('i1', { payment_status: 'PENDENTE', payment_date: null, notes: null })
  })

  it('restoreSource para cláusula e passivos', async () => {
    await restoreSource(meta.sources[1])
    await restoreSource(meta.sources[2])
    await restoreSource(meta.sources[3])
    expect(m.updateClause).toHaveBeenCalledWith('c1', { payment_status: 'PENDENTE', payment_date: null })
    expect(m.updateClubLiability).toHaveBeenCalledWith('cb1', { status: 'PENDENTE', settled_date: null })
    expect(m.updateIntermediaryLiability).toHaveBeenCalledWith('ag1', { status: 'PENDENTE', settled_date: null })
  })

  it('checkRenegotiation conta parcelas pagas do novo fluxo', async () => {
    m.fetchClauseInstallments.mockResolvedValue([
      makeInstallment({ payment_status: 'PAGA' }),
      makeInstallment({ payment_date: '2026-10-01' }),
      makeInstallment(),
    ])
    expect(await checkRenegotiation(acordo)).toEqual({ paidInNewFlow: 2, totalInNewFlow: 3 })
  })

  it('revertRenegotiation restaura todas as origens e apaga o acordo', async () => {
    m.fetchAllInstallments.mockResolvedValue([])
    await revertRenegotiation(acordo)
    expect(m.updateInstallment).toHaveBeenCalledTimes(1)
    expect(m.updateClause).toHaveBeenCalledTimes(1)
    expect(m.updateClubLiability).toHaveBeenCalledTimes(1)
    expect(m.updateIntermediaryLiability).toHaveBeenCalledTimes(1)
    expect(m.deleteClause).toHaveBeenCalledWith('ac-9')
  })

  it('revertRenegotiation sem metadados só apaga o acordo', async () => {
    await revertRenegotiation(makeClause({ id: 'ac-x', notes: 'lixo' }))
    expect(m.updateInstallment).not.toHaveBeenCalled()
    expect(m.deleteClause).toHaveBeenCalledWith('ac-x')
  })

  it('removeAcordoSource recalcula total original e desconto', async () => {
    await removeAcordoSource(acordo, 1) // remove "Luvas" (300k)
    expect(m.updateClause).toHaveBeenCalledWith('c1', { payment_status: 'PENDENTE', payment_date: null })
    const [id, patch] = m.updateClause.mock.calls.at(-1)!
    expect(id).toBe('ac-9')
    const next = decodeAcordo(patch.notes)!
    expect(next.sources.map(s => s.label)).toEqual(['Parcela 1/5', 'Clube', 'Agente'])
    expect(next).toMatchObject({ originalTotal: 700_000, newTotal: 900_000, discount: -200_000 })
  })

  it('removeAcordoSource com índice inválido não faz nada', async () => {
    await removeAcordoSource(acordo, 99)
    await removeAcordoSource(makeClause({ notes: null }), 0)
    expect(m.updateClause).not.toHaveBeenCalled()
  })

  it('updateRenegotiation atualiza cláusula e metadados', async () => {
    await updateRenegotiation(acordo, { creditor: 'Novo Credor', userNote: 'ajuste' })
    const [id, patch] = m.updateClause.mock.calls[0]
    expect(id).toBe('ac-9')
    expect(patch).toMatchObject({ creditor_party: 'Novo Credor', debtor_party: 'Botafogo SAF', condition_description: 'ajuste' })
    expect(decodeAcordo(patch.notes)).toMatchObject({ creditor: 'Novo Credor', debtor: 'Botafogo SAF', userNote: 'ajuste', currency: 'BRL' })
  })

  it('updateRenegotiation sem metadados não grava notes', async () => {
    await updateRenegotiation(makeClause({ id: 'z', notes: null }), { currency: 'EUR' })
    const patch = m.updateClause.mock.calls[0][1]
    expect(patch.currency).toBe('EUR')
    expect('notes' in patch).toBe(false)
  })
})

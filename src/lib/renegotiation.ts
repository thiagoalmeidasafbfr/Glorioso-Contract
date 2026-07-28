// src/lib/renegotiation.ts
// Mecanismo de Acordos e Renegociações.
//
// Caso prático: o clube deve 5 parcelas a um intermediário (total R$ 1mi) e quer
// "reabrir" essa dívida em 10x a partir de uma data específica, eventualmente com
// desconto no total — SEM perder o rastreio das parcelas originais.
//
// Modelo (sem nova tabela — funciona igual no Supabase e no localStore):
//   • O acordo é uma CLÁUSULA de tipo ACORDO_RENEGOCIACAO, cujas PARCELAS são o
//     novo fluxo (N x a partir da data-base, com a periodicidade escolhida).
//   • Os itens originais selecionados (parcelas e/ou cláusulas de valor único)
//     são marcados como CANCELADA e ganham uma nota apontando para o acordo —
//     ou seja, o histórico é preservado (nada é apagado).
//   • Os metadados do acordo (itens de origem, total original, novo total,
//     desconto, credor/devedor, datas) ficam em JSON no campo `notes` da cláusula
//     do acordo, permitindo reconstruir e auditar a renegociação e reimportá-la.

import type { Clause, ClauseInstallment, Currency } from '../types/athlete-system'
import {
  createClause, createClauseInstallments, updateClause, updateInstallment,
  updateClubLiability, updateIntermediaryLiability,
  deleteClause, fetchClauseInstallments, fetchAllInstallments,
} from './athleteQueries'
import { addMonths, todayISO } from './format'

export const ACORDO_TYPE = 'ACORDO_RENEGOCIACAO' as const

// Item de origem que entrou na renegociação (parcela ou cláusula de valor único).
export interface AcordoSource {
  clauseId?: string
  installmentId?: string
  clubLiabId?: string
  intermLiabId?: string
  label: string
  value: number
  dueDate?: string | null
}

export interface AcordoMeta {
  __acordo: 1
  createdAt: string
  originalTotal: number
  newTotal: number
  discount: number
  currency: Currency
  creditor: string
  debtor: string
  startDate: string
  installmentsCount: number
  periodicityMonths: number
  sources: AcordoSource[]
  userNote: string
}

const PREFIX = '__ACORDO__'

export function encodeAcordo(meta: AcordoMeta): string {
  return PREFIX + JSON.stringify(meta)
}

export function decodeAcordo(notes: string | null | undefined): AcordoMeta | null {
  if (!notes) return null
  const raw = notes.startsWith(PREFIX) ? notes.slice(PREFIX.length) : notes
  try {
    const m = JSON.parse(raw)
    return m && m.__acordo ? (m as AcordoMeta) : null
  } catch {
    return null
  }
}

export function isAcordo(c: Clause): boolean {
  return c.clause_type === ACORDO_TYPE
}

// Extrai o ID do acordo a partir da nota deixada em uma parcela/cláusula
// renegociada ("… Renegociado no acordo <id> em <data>"). Retorna null se a
// parcela não foi renegociada.
export function renegotiatedAcordoId(notes: string | null | undefined): string | null {
  if (!notes) return null
  const m = notes.match(/Renegociado no acordo (\S+) em /)
  return m ? m[1] : null
}

// Divide um total em N parcelas iguais (centavos), com a última absorvendo a
// diferença de arredondamento.
function splitEqual(total: number, n: number): number[] {
  if (n <= 0) return []
  const base = Math.floor((total / n) * 100) / 100
  const arr = Array(n).fill(base)
  arr[n - 1] = Math.round((total - base * (n - 1)) * 100) / 100
  return arr
}

export interface RenegotiationInput {
  athleteId: string
  contractId?: string | null
  creditor: string
  debtor: string
  currency: Currency
  sources: AcordoSource[]
  newTotal: number
  startDate: string
  installmentsCount: number
  periodicityMonths: number
  userNote: string
  // Fluxo personalizado (irregular): vencimentos/valores explícitos por parcela.
  // Quando informado, tem prioridade sobre startDate/installmentsCount/periodicity.
  schedule?: { due_date: string; value: number }[]
}

export interface RenegotiationResult {
  acordo: Clause
  installments: ClauseInstallment[]
}

// Executa a renegociação: cria o acordo + novo fluxo e cancela os itens de
// origem, preservando o rastreio.
export async function createRenegotiation(input: RenegotiationInput): Promise<RenegotiationResult> {
  const custom = !!(input.schedule && input.schedule.length)
  const originalTotal = Math.round(input.sources.reduce((s, x) => s + x.value, 0) * 100) / 100
  // Fluxo personalizado: o novo total é a soma das parcelas informadas.
  const newTotal = custom
    ? Math.round(input.schedule!.reduce((s, r) => s + (r.value || 0), 0) * 100) / 100
    : Math.round(input.newTotal * 100) / 100
  const discount = Math.round((originalTotal - newTotal) * 100) / 100
  const n = custom ? input.schedule!.length : Math.max(1, Math.floor(input.installmentsCount))
  const period = Math.max(1, Math.floor(input.periodicityMonths))

  const meta: AcordoMeta = {
    __acordo: 1,
    createdAt: todayISO(),
    originalTotal,
    newTotal,
    discount,
    currency: input.currency,
    creditor: input.creditor,
    debtor: input.debtor,
    startDate: custom ? (input.schedule![0]?.due_date ?? input.startDate) : input.startDate,
    installmentsCount: n,
    periodicityMonths: custom ? 0 : period,
    sources: input.sources,
    userNote: input.userNote,
  }

  const discountLabel = discount > 0 ? ` (desconto ${input.currency} ${discount.toLocaleString('pt-BR')})` : discount < 0 ? ` (acréscimo ${input.currency} ${Math.abs(discount).toLocaleString('pt-BR')})` : ''
  const startLabel = custom ? input.schedule![0]?.due_date ?? input.startDate : input.startDate
  const description = `Renegociação — ${input.creditor}: ${input.sources.length} item(ns) → ${n}x${custom ? ' (fluxo personalizado)' : ''} a partir de ${startLabel}${discountLabel}`

  const firstDue = custom ? (input.schedule![0]?.due_date ?? input.startDate) : input.startDate

  // 1) Cláusula do acordo (o novo compromisso).
  const acordo = await createClause(input.contractId ?? null, input.athleteId, {
    clause_type: ACORDO_TYPE,
    description,
    creditor_party: input.creditor,
    debtor_party: input.debtor,
    currency: input.currency,
    original_value: newTotal,
    percentage_value: null,
    condition_description: input.userNote,
    due_date: firstDue,
    installments_total: n,
    notes: encodeAcordo(meta),
  })

  // 2) Novo fluxo de parcelas — personalizado (vencimentos/valores explícitos)
  //    ou igual (N parcelas a partir da data-base, com a periodicidade).
  const flow = custom
    ? input.schedule!.map(r => ({ due_date: r.due_date, value: Math.round((r.value || 0) * 100) / 100 }))
    : splitEqual(newTotal, n).map((v, i) => ({ due_date: addMonths(input.startDate, i * period), value: v }))
  const installments = await createClauseInstallments(acordo.id, input.athleteId, flow.map((r, i) => ({
    installment_number: i + 1,
    due_date: r.due_date,
    original_value: r.value,
    currency: input.currency,
  })))

  // 3) Cancela os itens de origem, preservando o rastreio (nota → acordo).
  const ref = `Renegociado no acordo ${acordo.id} em ${meta.createdAt}`
  const noteFor = (label: string) => (label ? `${label} · ${ref}` : ref)
  for (const src of input.sources) {
    if (src.installmentId) {
      await updateInstallment(src.installmentId, { payment_status: 'CANCELADA', notes: noteFor(src.label) })
    } else if (src.clauseId) {
      await updateClause(src.clauseId, { payment_status: 'CANCELADA', notes: noteFor(src.label) })
    } else if (src.clubLiabId) {
      await updateClubLiability(src.clubLiabId, { status: 'CANCELADA', notes: noteFor(src.label) })
    } else if (src.intermLiabId) {
      await updateIntermediaryLiability(src.intermLiabId, { status: 'CANCELADA', notes: noteFor(src.label) })
    }
  }

  return { acordo, installments }
}

// ── Desfazer / excluir uma renegociação ─────────────────────────────────────
// Renegociar não apaga nada: os itens de origem ficam CANCELADA com uma nota
// apontando para o acordo. Desfazer é, portanto, reversível de verdade:
//   1) cada item de origem volta a PENDENTE e perde a nota de rastreio;
//   2) o acordo (e o novo fluxo dele) é apagado.

/** Remove do texto a marca "· Renegociado no acordo <id> em <data>". */
export function stripAcordoNote(notes: string | null | undefined, acordoId?: string): string | null {
  if (!notes) return null
  const re = acordoId
    ? new RegExp(`\\s*·?\\s*Renegociado no acordo ${acordoId} em \\S+`, 'g')
    : /\s*·?\s*Renegociado no acordo \S+ em \S+/g
  const cleaned = notes.replace(re, '').trim()
  return cleaned === '' ? null : cleaned
}

/** Devolve UM item de origem ao estado em aberto (usado ao desfazer/editar). */
export async function restoreSource(src: AcordoSource, acordoId?: string): Promise<void> {
  if (src.installmentId) {
    const inst = await fetchInstallmentSafe(src.installmentId)
    await updateInstallment(src.installmentId, {
      payment_status: 'PENDENTE', payment_date: null,
      notes: stripAcordoNote(inst?.notes, acordoId),
    })
  } else if (src.clauseId) {
    await updateClause(src.clauseId, { payment_status: 'PENDENTE', payment_date: null })
  } else if (src.clubLiabId) {
    await updateClubLiability(src.clubLiabId, { status: 'PENDENTE', settled_date: null })
  } else if (src.intermLiabId) {
    await updateIntermediaryLiability(src.intermLiabId, { status: 'PENDENTE', settled_date: null })
  }
}

// A parcela pode não existir mais (fluxo regerado); nesse caso o restore é no-op
// quanto à nota, mas o status ainda é normalizado.
async function fetchInstallmentSafe(id: string): Promise<ClauseInstallment | null> {
  try {
    const all = await fetchAllInstallments()
    return all.find(i => i.id === id) ?? null
  } catch {
    return null
  }
}

export interface RevertCheck {
  paidInNewFlow: number
  totalInNewFlow: number
}

/** Quantas parcelas do NOVO fluxo já foram pagas (avisar antes de desfazer). */
export async function checkRenegotiation(acordo: Clause): Promise<RevertCheck> {
  const insts = await fetchClauseInstallments(acordo.id)
  return {
    paidInNewFlow: insts.filter(i => i.payment_status === 'PAGA' || !!i.payment_date).length,
    totalInNewFlow: insts.length,
  }
}

/**
 * Desfaz a renegociação: devolve as parcelas/obrigações de origem ao estado em
 * aberto e apaga o acordo com o novo fluxo.
 */
export async function revertRenegotiation(acordo: Clause): Promise<void> {
  const meta = decodeAcordo(acordo.notes)
  for (const src of meta?.sources ?? []) await restoreSource(src, acordo.id)
  await deleteClause(acordo.id)
}

/**
 * Remove UM item de origem do acordo: a parcela volta ao normal e o acordo passa
 * a valer apenas pelos itens restantes (metadados atualizados). O novo fluxo NÃO
 * é recalculado — quem edita decide se ajusta as parcelas do acordo depois.
 */
export async function removeAcordoSource(acordo: Clause, index: number): Promise<void> {
  const meta = decodeAcordo(acordo.notes)
  if (!meta || !meta.sources[index]) return
  const src = meta.sources[index]
  await restoreSource(src, acordo.id)
  const sources = meta.sources.filter((_, i) => i !== index)
  const originalTotal = Math.round(sources.reduce((s, x) => s + x.value, 0) * 100) / 100
  const next: AcordoMeta = {
    ...meta, sources, originalTotal,
    discount: Math.round((originalTotal - meta.newTotal) * 100) / 100,
  }
  await updateClause(acordo.id, { notes: encodeAcordo(next) })
}

/** Atualiza os dados editáveis do acordo (credor/devedor, observação, moeda). */
export async function updateRenegotiation(acordo: Clause, patch: {
  creditor?: string
  debtor?: string
  currency?: Currency
  userNote?: string
}): Promise<void> {
  const meta = decodeAcordo(acordo.notes)
  const next: AcordoMeta | null = meta ? {
    ...meta,
    creditor: patch.creditor ?? meta.creditor,
    debtor: patch.debtor ?? meta.debtor,
    currency: patch.currency ?? meta.currency,
    userNote: patch.userNote ?? meta.userNote,
  } : null
  await updateClause(acordo.id, {
    creditor_party: patch.creditor ?? acordo.creditor_party,
    debtor_party: patch.debtor ?? acordo.debtor_party,
    currency: patch.currency ?? acordo.currency,
    condition_description: patch.userNote ?? acordo.condition_description,
    ...(next ? { notes: encodeAcordo(next) } : {}),
  })
}

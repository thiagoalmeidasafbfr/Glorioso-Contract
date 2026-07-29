// src/lib/judicialRecovery.ts
// Recuperação Judicial (RJ): marcar lançamentos como incluídos no processo de RJ.
//
// Os passivos que entram em RJ continuam DEVIDOS mas não podem ser executados
// individualmente — serão pagos conforme o plano aprovado (parcelamento, deságio,
// carência etc.). Aqui apenas MARCAMOS os lançamentos: nenhum status financeiro é
// alterado, o rastreio permanece. A marcação é reversível.
//
// Modelo (sem nova tabela — funciona igual no Supabase e no localStore):
//   • um marcador `[RJ:YYYY-MM-DD]` é inserido no campo `notes` do lançamento;
//   • a data é a data de inclusão no processo (padrão: hoje);
//   • detecção via regex; leitura via `parseRJ()`.
//
// Aplicável a: parcelas de cláusula, cláusulas de valor único, passivos de clube
// e obrigações com intermediário.

import {
  updateInstallment, updateClause,
  updateClubLiability, updateIntermediaryLiability,
} from './athleteQueries'
import { todayISO } from './format'

const RJ_RE = /\[RJ:(\d{4}-\d{2}-\d{2})\]/

export interface RJInfo {
  filedAt: string
}

/** Item que pode ser marcado como RJ. */
export type RJKind = 'inst' | 'clause' | 'club' | 'agent'

export interface RJTarget {
  kind: RJKind
  id: string
}

/** Extrai a marcação de RJ do texto de notas (se houver). */
export function parseRJ(notes: string | null | undefined): RJInfo | null {
  if (!notes) return null
  const m = notes.match(RJ_RE)
  return m ? { filedAt: m[1] } : null
}

export function isUnderRJ(notes: string | null | undefined): boolean {
  return parseRJ(notes) !== null
}

/** Devolve as notas com o marcador de RJ (idempotente). */
export function addRJTag(notes: string | null | undefined, filedAt: string): string {
  const clean = stripRJTag(notes) ?? ''
  const tag = `[RJ:${filedAt}]`
  return clean ? `${tag} ${clean}` : tag
}

/** Remove o marcador de RJ das notas (se houver). Retorna null se sobrar vazio. */
export function stripRJTag(notes: string | null | undefined): string | null {
  if (!notes) return null
  const cleaned = notes.replace(RJ_RE, '').replace(/\s{2,}/g, ' ').trim()
  return cleaned === '' ? null : cleaned
}

/** Marca UM item como incluído em RJ, preservando o resto das notas. */
export async function markItemRJ(target: RJTarget, currentNotes: string | null | undefined, filedAt = todayISO()): Promise<void> {
  const notes = addRJTag(currentNotes, filedAt)
  switch (target.kind) {
    case 'inst':   await updateInstallment(target.id, { notes }); break
    case 'clause': await updateClause(target.id, { notes }); break
    case 'club':   await updateClubLiability(target.id, { notes }); break
    case 'agent':  await updateIntermediaryLiability(target.id, { notes }); break
  }
}

/** Retira a marcação de RJ do item (volta ao regime normal). */
export async function unmarkItemRJ(target: RJTarget, currentNotes: string | null | undefined): Promise<void> {
  const notes = stripRJTag(currentNotes)
  switch (target.kind) {
    case 'inst':   await updateInstallment(target.id, { notes }); break
    case 'clause': await updateClause(target.id, { notes }); break
    case 'club':   await updateClubLiability(target.id, { notes }); break
    case 'agent':  await updateIntermediaryLiability(target.id, { notes }); break
  }
}

/** Marca vários itens de uma vez. */
export async function markManyRJ(
  items: (RJTarget & { notes: string | null | undefined })[],
  filedAt = todayISO(),
): Promise<void> {
  for (const it of items) await markItemRJ({ kind: it.kind, id: it.id }, it.notes, filedAt)
}

// src/lib/premissasSync.ts
// "Puxar dos contratos" (Fase 5.5): calcula, para uma linha de premissas
// vinculada a um atleta, os valores que vêm do cadastro — em vez de redigitar:
//   • nome, nascimento e posição  ← ficha do atleta;
//   • contrato início/fim         ← vínculo de trabalho vigente (ENTRADA /
//                                   EMPRESTIMO_ENTRADA ativo mais recente);
//   • salário / imagem (BRL)      ← remuneração EFETIVA hoje do vínculo
//                                   (salário base + gatilhos atingidos, incluindo
//                                   o rateio de empréstimo — ver salary.ts),
//                                   convertida para BRL pela PTAX corrente
//                                   (fallback: câmbio aproximado de fx.ts).
// Nada é gravado aqui: a tela mostra o diff e o usuário confirma.

import {
  fetchAthletes, fetchAllContracts, fetchAllSalaryTriggers,
} from './athleteQueries'
import { effectiveRemuneration } from './salary'
import { fetchPtaxRates, ptaxRateFor } from './ptax'
import type { Athlete, Contract, SalaryTrigger } from '../types/athlete-system'
import type { PremissaAtleta } from '../types/premissas'

export type SyncField = 'nome' | 'data_nascimento' | 'posicao' | 'contrato_inicio' | 'contrato_fim' | 'salario_brl' | 'imagem_brl'

export const SYNC_FIELD_LABELS: Record<SyncField, string> = {
  nome: 'Nome', data_nascimento: 'Nascimento', posicao: 'Posição',
  contrato_inicio: 'Contrato início', contrato_fim: 'Contrato fim',
  salario_brl: 'Salário (BRL)', imagem_brl: 'Imagem (BRL)',
}

export interface SyncChange { field: SyncField; before: string | number | null; after: string | number | null }
export interface SyncDiff { premissaId: string; atletaId: string; atleta: string; changes: SyncChange[]; note?: string }

export interface SyncContext {
  athletes: Map<string, Athlete>
  contracts: Contract[]
  triggers: SalaryTrigger[]
  ptax: Record<string, number>
}

export async function loadSyncContext(): Promise<SyncContext> {
  const [athletes, contracts, triggers, ptax] = await Promise.all([
    fetchAthletes(), fetchAllContracts(), fetchAllSalaryTriggers(),
    fetchPtaxRates().catch(() => ({} as Record<string, number>)),
  ])
  return { athletes: new Map(athletes.map(a => [a.id, a])), contracts, triggers, ptax }
}

function laborContract(contracts: Contract[], athleteId: string): Contract | null {
  const mine = contracts.filter(c => c.athlete_id === athleteId && (c.type === 'ENTRADA' || c.type === 'EMPRESTIMO_ENTRADA'))
  const active = mine.filter(c => c.status === 'ATIVO')
  const pool = active.length ? active : mine
  return [...pool].sort((a, b) => b.start_date.localeCompare(a.start_date))[0] ?? null
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function computeSyncDiff(p: PremissaAtleta, ctx: SyncContext): SyncDiff | null {
  if (!p.atleta_id) return null
  const a = ctx.athletes.get(p.atleta_id)
  if (!a) return { premissaId: p.id, atletaId: p.atleta_id, atleta: p.nome ?? '—', changes: [], note: 'Atleta vinculado não encontrado.' }
  const target: Partial<Record<SyncField, string | number | null>> = {
    nome: a.full_name, data_nascimento: a.birth_date, posicao: a.position,
  }
  let note: string | undefined
  const c = laborContract(ctx.contracts, a.id)
  if (c) {
    target.contrato_inicio = c.start_date
    target.contrato_fim = c.end_date
    const rem = effectiveRemuneration(c, ctx.triggers.filter(t => t.athlete_id === a.id))
    const rate = ptaxRateFor(rem.currency, ctx.ptax)
    target.salario_brl = round2(rem.salary * rate)
    target.imagem_brl = round2(rem.image * rate)
    if (rem.currency !== 'BRL') note = `Remuneração em ${rem.currency} convertida a ${rate.toFixed(4)}.`
    if (c.status !== 'ATIVO') note = [note, 'Sem vínculo ativo — usado o último vínculo de trabalho.'].filter(Boolean).join(' ')
  } else {
    note = 'Sem vínculo de trabalho cadastrado — só dados da ficha.'
  }
  const changes: SyncChange[] = []
  for (const [k, after] of Object.entries(target) as [SyncField, string | number | null | undefined][]) {
    const before = (p as unknown as Record<string, string | number | null>)[k] ?? null
    const aft = after ?? null
    const same = typeof aft === 'number' || typeof before === 'number'
      ? Math.abs(Number(before ?? 0) - Number(aft ?? 0)) < 0.005
      : String(before ?? '') === String(aft ?? '')
    if (!same) changes.push({ field: k, before, after: aft })
  }
  return { premissaId: p.id, atletaId: a.id, atleta: a.full_name, changes, note }
}

/** Patch a gravar a partir dos campos escolhidos do diff. */
export function patchFromDiff(d: SyncDiff, fields?: Set<SyncField>): Partial<PremissaAtleta> {
  const out: Record<string, unknown> = {}
  for (const ch of d.changes) {
    if (fields && !fields.has(ch.field)) continue
    out[ch.field] = (ch.field === 'salario_brl' || ch.field === 'imagem_brl') ? Number(ch.after ?? 0) : ch.after
  }
  return out as Partial<PremissaAtleta>
}

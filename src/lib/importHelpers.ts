// src/lib/importHelpers.ts
// Primitivas de parsing e utilitários de deduplicação compartilhados por todos
// os importadores (PageDados, relatórios, consolidado). Centralizar aqui evita
// divergência entre telas e garante validação de duplicidade consistente.

import type { Athlete, Currency } from '../types/athlete-system'
import { trf, trn } from '../i18n'

// ── Parsing ─────────────────────────────────────────────────────────────────

export const S = (v: unknown) => String(v ?? '').trim()
export const orNull = (v: unknown) => { const s = S(v); return s === '' ? null : s }

// Número tolerante a formatos brasileiros ("1.234,56") e simples ("1234.56").
export const N = (v: unknown): number => {
  const raw = S(v)
  if (raw === '') return 0
  // Se tem vírgula, tratamos como decimal brasileiro (ponto = milhar).
  const cleaned = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '')
    : raw.replace(/[^\d.-]/g, '')
  const n = Number(cleaned)
  return isNaN(n) ? 0 : n
}
export const Nn = (v: unknown): number | null => { const s = S(v); if (s === '') return null; return N(v) }

export const cur = (v: unknown): Currency => {
  const s = S(v).toUpperCase()
  return (['BRL', 'EUR', 'USD', 'GBP'].includes(s) ? s : 'BRL') as Currency
}

export const bool = (v: unknown) =>
  ['TRUE', '1', 'SIM', 'S', 'VERDADEIRO', 'X'].includes(S(v).toUpperCase())

/** Normaliza texto para comparação de nomes (trim + minúsculas + espaços). */
export const norm = (v: unknown) => S(v).toLowerCase().replace(/\s+/g, ' ')

/** Extrai 'AAAA-MM' de uma data ISO, competência ou texto que contenha o padrão. */
export function toYearMonth(v: unknown): string {
  const s = S(v)
  const m = s.match(/(\d{4})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}` : ''
}

// ── Índices de resolução de nomes → id ───────────────────────────────────────

/** Mapa nome (curto e completo, normalizado) → athlete_id. */
export function buildAthleteIndex(athletes: Athlete[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const a of athletes) {
    if (a.short_name) m.set(norm(a.short_name), a.id)
    if (a.full_name) m.set(norm(a.full_name), a.id)
  }
  return m
}

/** Mapa nome (normalizado) → id para clubes/intermediários. */
export function buildNameIndex(list: { id: string; name: string }[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const e of list) if (e.name) m.set(norm(e.name), e.id)
  return m
}

// ── Deduplicação ──────────────────────────────────────────────────────────

/** Chave natural composta, normalizada, para detectar duplicatas. */
export function dupKey(...parts: (string | number | null | undefined)[]): string {
  return parts.map(p => norm(p ?? '')).join('|')
}

export interface ImportResult {
  created: number
  dupSkipped: number    // linhas ignoradas por já existirem
  noAthlete: number     // linhas ignoradas por atleta não encontrado
  invalid: number       // linhas ignoradas por dados insuficientes
}

export const emptyResult = (): ImportResult => ({ created: 0, dupSkipped: 0, noAthlete: 0, invalid: 0 })

/** Mensagem amigável a partir de um ImportResult. */
export function resultMessage(r: ImportResult): string {
  const parts = [trn(r.created, '{0} criado', '{0} criados')]
  if (r.dupSkipped) parts.push(trn(r.dupSkipped, '{0} duplicado ignorado', '{0} duplicados ignorados'))
  if (r.noAthlete) parts.push(trf('{0} sem atleta correspondente', r.noAthlete))
  if (r.invalid) parts.push(trn(r.invalid, '{0} inválido', '{0} inválidos'))
  return parts.join(' · ')
}

// src/lib/importHelpers.ts
// Primitivas de parsing e utilitários de deduplicação compartilhados por todos
// os importadores (PageDados, relatórios, consolidado). Centralizar aqui evita
// divergência entre telas e garante validação de duplicidade consistente.

import type { Athlete, Currency } from '../types/athlete-system'

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

// ── Casamento tolerante de nomes (contraparte) ─────────────────────────────
// A contraparte gravada na cláusula pode divergir da forma cadastrada em
// Clubes/Agentes: acentos, LTDA/S.A./EIRELI, espaço extra, hífens, "&" vs "e".
// Aqui removemos esse ruído para casar por prefixo/substring sem falso-match.

const SUFFIX_RE = new RegExp(
  '\\b(ltda|s\\.?a\\.?|sa|s/a|eireli|me|epp|inc|llc|lda|s\\.?l\\.?|gmbh|ag|bv|nv|srl|ltd|corp|co|s\\.?p\\.?a\\.?|cia|corporation)\\b\\.?',
  'g',
)

/** Normalização agressiva: sem acentos, sem sufixos societários, sem pontuação. */
export function entityKey(v: unknown): string {
  const raw = norm(v).normalize('NFD').replace(/[̀-ͯ]/g, '')
  return raw
    .replace(SUFFIX_RE, ' ')
    .replace(/[.,/&+()"'\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Casa uma contraparte (nome livre gravado numa cláusula) contra o índice de
 * clubes/agentes. Tenta em ordem:
 *   1. Igualdade estrita (norm) — preserva o comportamento atual;
 *   2. Igualdade sob entityKey (sem acento/sufixo/pontuação);
 *   3. Substring: um lado contido no outro após entityKey.
 * Devolve o id ou `null` quando ninguém bate.
 */
export function matchEntity(
  name: string | null | undefined,
  index: Map<string, string>,
  entries?: { id: string; name: string }[],
): string | null {
  if (!name) return null
  const n1 = norm(name)
  const hit1 = index.get(n1); if (hit1) return hit1
  const k = entityKey(name)
  if (!k) return null
  if (!entries) return null
  let bestId: string | null = null
  let bestLen = 0
  for (const e of entries) {
    const ek = entityKey(e.name)
    if (!ek) continue
    if (ek === k) return e.id
    // Substring nos dois sentidos, exigindo pelo menos 4 chars pra evitar
    // pegar "SA" ou "LTDA" quando os sufixos sobreviveram por acidente.
    if (k.length >= 4 && ek.length >= 4 && (k.includes(ek) || ek.includes(k))) {
      const len = Math.min(k.length, ek.length)
      if (len > bestLen) { bestLen = len; bestId = e.id }
    }
  }
  return bestId
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
  const parts = [`${r.created} criado(s)`]
  if (r.dupSkipped) parts.push(`${r.dupSkipped} duplicado(s) ignorado(s)`)
  if (r.noAthlete) parts.push(`${r.noAthlete} sem atleta correspondente`)
  if (r.invalid) parts.push(`${r.invalid} inválido(s)`)
  return parts.join(' · ')
}

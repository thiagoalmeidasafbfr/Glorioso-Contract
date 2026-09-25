// src/lib/format.ts
// Utilitários de formatação de moeda, datas e valores

import { locale, tr, trf } from '../i18n'

export const CURRENCY_SYMBOLS: Record<string, string> = {
  BRL: 'R$', EUR: '€', USD: '$', GBP: '£',
}

// Formata valor monetário abreviado (ex: € 21,75M)
export function fmtCurrencyShort(value: number | null | undefined, currency = 'BRL'): string {
  if (value === null || value === undefined) return '—'
  const sym = CURRENCY_SYMBOLS[currency] ?? currency
  const abs = Math.abs(value)
  if (abs >= 1_000_000_000) return `${sym} ${(value / 1_000_000_000).toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${tr('Bi')}`
  if (abs >= 1_000_000)     return `${sym} ${(value / 1_000_000).toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}M`
  if (abs >= 1_000)         return `${sym} ${(value / 1_000).toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K`
  return `${sym} ${value.toLocaleString(locale(), { maximumFractionDigits: 0 })}`
}

// Divide um valor compacto em partes para renderização tipográfica editorial.
// Ex.: 222_620_000 → { sym: 'R$', num: '222,62', suffix: 'M' }
export function fmtCurrencyParts(
  value: number | null | undefined,
  currency = 'BRL',
): { sym: string; num: string; suffix: string } {
  const sym = CURRENCY_SYMBOLS[currency] ?? currency
  if (value === null || value === undefined) return { sym: '', num: '—', suffix: '' }
  const abs = Math.abs(value)
  if (abs >= 1_000_000_000)
    return { sym, num: (value / 1_000_000_000).toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }), suffix: tr('Bi') }
  if (abs >= 1_000_000)
    return { sym, num: (value / 1_000_000).toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }), suffix: 'M' }
  if (abs >= 1_000)
    return { sym, num: (value / 1_000).toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }), suffix: 'K' }
  return { sym, num: value.toLocaleString(locale(), { maximumFractionDigits: 0 }), suffix: '' }
}

// Formata valor completo com casas decimais (ex: R$ 7.500.000,00)
export function fmtCurrencyFull(value: number | null | undefined, currency = 'BRL'): string {
  if (value === null || value === undefined) return '—'
  const sym = CURRENCY_SYMBOLS[currency] ?? currency
  return `${sym} ${value.toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Número com casas decimais no padrão do idioma (ex.: 12,5 · 12.5)
export function fmtDec(value: number, digits = 1): string {
  return value.toLocaleString(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

// Formata percentual (ex: 50,00%)
export function fmtPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return `${value.toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
}

// Formata data ISO → dd/mm/yyyy
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const s = iso.split('T')[0]
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

// Formata data ISO → mês/ano por extenso (ex: "jan/2026")
export function fmtMonthYear(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso + 'T12:00:00Z')
  return date.toLocaleDateString(locale(), { month: 'short', year: 'numeric' })
}

// Mês abreviado no idioma atual (1–12 → "jan" · "Jan" · "ene"), sem ponto final.
export function monthShort(month: number): string {
  return new Date(Date.UTC(2000, month - 1, 15)).toLocaleDateString(locale(), { month: 'short', timeZone: 'UTC' })
    .replace('.', '').replace('Sept', 'Sep')
}

// Retorna quantos dias faltam/passaram desde hoje
export function daysFromToday(iso: string | null | undefined): number | null {
  if (!iso) return null
  const date = new Date(iso + 'T12:00:00Z')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.floor((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

// Texto relativo (ex: "3 dias", "ontem", "vence em 10 dias")
export function fmtRelative(iso: string | null | undefined): string {
  const days = daysFromToday(iso)
  if (days === null) return '—'
  if (days === 0)  return tr('Hoje')
  if (days === 1)  return tr('Amanhã')
  if (days === -1) return tr('Ontem')
  if (days < 0)   return trf('{0} dias atraso', Math.abs(days))
  return trf('Em {0} dias', days)
}

export function isOverdue(dueDate: string | null | undefined, status: string): boolean {
  if (!dueDate) return false
  if (status === 'PAGA' || status === 'CANCELADA') return false
  return new Date(dueDate + 'T23:59:59') < new Date()
}

export function isDueSoon(dueDate: string | null | undefined, status: string, days = 30): boolean {
  if (!dueDate) return false
  if (status === 'PAGA' || status === 'CANCELADA') return false
  const d = daysFromToday(dueDate)
  if (d === null) return false
  return d >= 0 && d <= days
}

// Texto "dobrado" para comparação: minúsculas, sem acento, só letras e dígitos
// separados por um espaço (ex.: "São Paulo-FC" → "sao paulo fc").
export function foldText(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

// Idade em anos completos a partir da data de nascimento ISO (null se ausente
// ou inválida).
export function calcAge(birthDate: string | null | undefined): number | null {
  if (!birthDate) return null
  const b = new Date(birthDate + 'T12:00:00Z')
  if (Number.isNaN(b.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - b.getFullYear()
  const m = now.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--
  return age >= 0 && age < 120 ? age : null
}

// Retorna YYYY-MM de uma data ISO
export function isoToYearMonth(iso: string): string {
  return iso.split('T')[0].substring(0, 7)
}

// Retorna data ISO de hoje
export function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

// Adiciona N dias a uma data ISO
export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().split('T')[0]
}

// Adiciona N meses a uma data ISO
export function addMonths(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00Z')
  d.setMonth(d.getMonth() + n)
  return d.toISOString().split('T')[0]
}

// Quantidade de meses de vigência entre início e término (ex.: contrato de 36
// meses → 36). Funciona tanto quando o término é a data-limite exata
// (início + 36 meses, ex.: 01/01/2026 → 01/01/2029) quanto quando é o último
// dia do período (ex.: 01/01/2026 → 31/12/2028): ambos resultam em 36.
export function monthsBetween(startISO: string, endISO: string): number {
  const s = new Date(startISO + 'T12:00:00Z')
  const e = new Date(endISO + 'T12:00:00Z')
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0
  let months = (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + (e.getUTCMonth() - s.getUTCMonth())
  // Dia do término após o dia do início ⇒ mês parcial final conta como cheio.
  if (e.getUTCDate() > s.getUTCDate()) months += 1
  return Math.max(0, months)
}

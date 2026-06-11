// src/lib/format.ts
// Utilitários de formatação de moeda, datas e valores

export const CURRENCY_SYMBOLS: Record<string, string> = {
  BRL: 'R$', EUR: '€', USD: '$', GBP: '£',
}

// Formata valor monetário abreviado (ex: € 21,75M)
export function fmtCurrencyShort(value: number | null | undefined, currency = 'BRL'): string {
  if (value === null || value === undefined) return '—'
  const sym = CURRENCY_SYMBOLS[currency] ?? currency
  const abs = Math.abs(value)
  if (abs >= 1_000_000_000) return `${sym} ${(value / 1_000_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}Bi`
  if (abs >= 1_000_000)     return `${sym} ${(value / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}M`
  if (abs >= 1_000)         return `${sym} ${(value / 1_000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K`
  return `${sym} ${value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
}

// Formata valor completo com casas decimais (ex: R$ 7.500.000,00)
export function fmtCurrencyFull(value: number | null | undefined, currency = 'BRL'): string {
  if (value === null || value === undefined) return '—'
  const sym = CURRENCY_SYMBOLS[currency] ?? currency
  return `${sym} ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Formata percentual (ex: 50,00%)
export function fmtPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
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
  return date.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
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
  if (days === 0)  return 'Hoje'
  if (days === 1)  return 'Amanhã'
  if (days === -1) return 'Ontem'
  if (days < 0)   return `${Math.abs(days)} dias atraso`
  return `Em ${days} dias`
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

// Retorna YYYY-MM de uma data ISO
export function isoToYearMonth(iso: string): string {
  return iso.split('T')[0].substring(0, 7)
}

// Retorna data ISO de hoje
export function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

// Adiciona N meses a uma data ISO
export function addMonths(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00Z')
  d.setMonth(d.getMonth() + n)
  return d.toISOString().split('T')[0]
}

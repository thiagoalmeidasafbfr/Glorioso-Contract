// src/lib/importCanon.ts
// Canonicalização/limpeza para importar as planilhas brutas (Ativos/Passivos)
// no modelo do Glorioso. Trata as anomalias detectadas: sentinelas (#N/A, N/I),
// CPF com zero perdido, moedas/status por extenso, parcela "N/M", vencimento
// data×texto, e gera source_key determinístico para importação idempotente.

import type { Currency, LiabilityStatus, LiabilityDirection } from '../types/athlete-system'

const SENTINELS = new Set(['', 'N/A', 'N/I', '#N/A', '-', 'NA', 'NULL'])

export function clean(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return SENTINELS.has(s.toUpperCase()) ? null : s
}

/** Chave natural do atleta: CPF (11 díg., zero-padded) ou passaporte/ID FIFA. */
export function normAthleteRef(v: unknown): string | null {
  const s = clean(v)
  if (!s) return null
  if (/^\d+$/.test(s)) return s.padStart(11, '0')
  return s.toUpperCase().replace(/\s+/g, '')
}

/** Documento de clube/agente: CNPJ/CPF só dígitos, ou id estrangeiro em maiúsculas. */
export function normDoc(v: unknown): string | null {
  const s = clean(v)
  if (!s) return null
  const digits = s.replace(/\D/g, '')
  if (digits.length === 14 || digits.length === 11) return digits
  return s.toUpperCase().replace(/\s+/g, '')
}

export function num(v: unknown): number | null {
  const s = clean(v)
  if (s === null) return null
  // aceita "1.234,56" e "1234.56"
  let t = s.replace(/[^\d.,-]/g, '')
  if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '').replace(',', '.')
  else if (t.includes(',')) t = t.replace(',', '.')
  const n = Number(t)
  return isNaN(n) ? null : n
}

export function canonCurrency(v: unknown): Currency {
  const s = (clean(v) ?? '').toUpperCase()
  if (s.startsWith('DÓL') || s.startsWith('DOL') || s === 'USD' || s === 'US$') return 'USD'
  if (s.startsWith('EUR') || s === '€') return 'EUR'
  if (s.startsWith('LIB') || s === 'GBP' || s === '£') return 'GBP'
  return 'BRL' // Real / A definir / N/A
}

/** Status de parcela (planilhas) → enum de passivo do Glorioso. */
export function canonLiabStatus(v: unknown): LiabilityStatus {
  const s = (clean(v) ?? '').toUpperCase()
  if (s.startsWith('PAG')) return 'PAGA'            // Pago / PAgo
  if (s.startsWith('ATRAS')) return 'EM_ATRASO'
  if (s.startsWith('REVOG') || s.startsWith('BAIX') || s.startsWith('CANCEL')) return 'CANCELADA'
  return 'PENDENTE'  // A pagar / A receber / Aguardando condição / Acordo / Parcial / N/A
}

/** Rótulo humano do status de origem (preservado nas observações). */
export function rawStatusLabel(v: unknown): string { return clean(v) ?? '—' }

export interface Parcela { number: number; total: number; label: string }
export function parseParcela(v: unknown): Parcela {
  const s = clean(v) ?? ''
  const m = s.match(/^(\d+)\s*\/\s*(\d+)$/)
  if (m) return { number: Number(m[1]), total: Number(m[2]), label: s }
  const single = s.match(/^\d+$/)
  if (single) return { number: Number(s), total: Number(s), label: s }
  return { number: 1, total: 1, label: s || '1/1' }
}

const ISO = /^\d{4}-\d{2}-\d{2}/
/** Vencimento pode ser data (ISO) ou texto condicional ("5 dias após a meta"). */
export function parseVenc(v: unknown): { date: string | null; text: string | null } {
  const s = clean(v)
  if (!s) return { date: null, text: null }
  if (ISO.test(s)) return { date: s.slice(0, 10), text: null }
  return { date: null, text: s }
}

export function toIsoDate(v: unknown): string | null {
  const s = clean(v)
  if (!s) return null
  if (ISO.test(s)) return s.slice(0, 10)
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (br) return `${br[3]}-${br[2]}-${br[1]}`
  return null
}

export function conditional(v: unknown): boolean {
  return (clean(v) ?? '').toUpperCase().startsWith('COND')
}

/** Mês 'YYYY-MM' a partir de uma data/competência. */
export function toYearMonth(v: unknown): string | null {
  const d = toIsoDate(v)
  return d ? d.slice(0, 7) : null
}

// Nome de mês (pt/en, abreviado/completo) → 1..12
const MONTHS: Record<string, number> = {
  jan: 1, janeiro: 1, january: 1, fev: 2, feb: 2, fevereiro: 2, february: 2,
  mar: 3, março: 3, marco: 3, march: 3, abr: 4, apr: 4, abril: 4, april: 4,
  mai: 5, may: 5, maio: 5, jun: 6, junho: 6, june: 6, jul: 7, julho: 7, july: 7,
  ago: 8, aug: 8, agosto: 8, august: 8, set: 9, sep: 9, setembro: 9, september: 9,
  out: 10, oct: 10, outubro: 10, october: 10, nov: 11, novembro: 11, november: 11,
  dez: 12, dec: 12, dezembro: 12, december: 12,
}

/** Competência → 'YYYY-MM'. Aceita ISO, "Jan-26", "January", "jan/2026". */
export function competenceToYearMonth(v: unknown, fallbackYear: number | null): string | null {
  const s = clean(v)
  if (!s) return null
  if (/^\d{4}-\d{2}/.test(s)) return s.slice(0, 7)
  const m = s.match(/^([A-Za-zçÇ]+)[\s\-/]*(\d{2,4})?$/)
  if (m) {
    const mon = MONTHS[m[1].toLowerCase()]
    if (mon) {
      let yr = m[2] ? Number(m[2]) : fallbackYear
      if (yr === null) return null
      if (yr < 100) yr += 2000
      return `${yr}-${String(mon).padStart(2, '0')}`
    }
  }
  return null
}

/** Acesso a coluna tolerante a espaços/caixa. */
export function pick(row: Record<string, string>, ...names: string[]): string | undefined {
  for (const n of names) { if (row[n] !== undefined) return row[n] }
  return undefined
}

/** Hash determinístico (FNV-1a, hex) para source_key idempotente. */
export function sourceKey(...parts: (string | number | null | undefined)[]): string {
  const str = parts.map(p => (p === null || p === undefined ? '' : String(p))).join('|')
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0') + '-' + str.length.toString(16)
}

/** Direção padrão por origem. */
export const DIR_RECEBER: LiabilityDirection = 'A_RECEBER'
export const DIR_PAGAR: LiabilityDirection = 'A_PAGAR'

/** Status de atleta (planilha) → enum. */
export function canonAthleteStatus(v: unknown): 'ATIVO' | 'EMPRESTADO' | 'VENDIDO' | 'DESLIGADO' {
  const s = (clean(v) ?? '').toUpperCase()
  if (s.startsWith('EMPREST')) return 'EMPRESTADO'
  if (s.startsWith('RESCIND') || s.startsWith('DESLIG') || s.startsWith('ENCERR')) return 'DESLIGADO'
  if (s.startsWith('VEND')) return 'VENDIDO'
  return 'ATIVO' // Elenco / Vigente / Titular / Reserva
}

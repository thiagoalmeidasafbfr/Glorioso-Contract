// Fetches current PTAX rates from Banco Central do Brasil (Olinda / PTAX API).
// Returns a map of ISO currency code → BRL rate (1 unit of that currency in BRL).
// Cached in module scope and in localStorage per YYYY-MM-DD; falls back to
// a hardcoded table when the API is unreachable or the currency is unsupported.
//
// O serviço do BC é lento e às vezes não responde: cada consulta tem prazo
// (PTAX_TIMEOUT_MS) e, se falhar, não tenta os dias anteriores. Resultado
// vazio NÃO é gravado para o dia todo — só fica em memória por alguns minutos
// para as telas não esperarem o BC a cada navegação.

import { CURRENCY_TO_BRL, type AppCurrency } from '../context/AppContext'

const BACEN_SUPPORTED = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'ARS', 'DKK', 'NOK', 'SEK', 'CNY']
const CACHE_KEY = 'ptax-rates-v1'

interface PtaxCache { date: string; rates: Record<string, number> }

const PTAX_TIMEOUT_MS = 8_000
const FAILURE_RETRY_MS = 10 * 60_000

let inflight: Promise<Record<string, number>> | null = null
let memory: PtaxCache | null = null
let failedAt = 0

const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const usDate = (offsetDays: number) => {
  const d = new Date()
  d.setDate(d.getDate() - offsetDays)
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${d.getFullYear()}`
}

async function fetchOne(currency: string): Promise<number | null> {
  // Try up to 7 days back to skip weekends/holidays.
  for (let i = 0; i < 7; i++) {
    const url = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaDia(moeda=@moeda,dataCotacao=@dataCotacao)?@moeda='${currency}'&@dataCotacao='${usDate(i)}'&$top=1&$format=json&$select=cotacaoVenda`
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(PTAX_TIMEOUT_MS) })
      if (!r.ok) return null
      const j = await r.json() as { value?: Array<{ cotacaoVenda: number }> }
      const v = j.value?.[0]?.cotacaoVenda
      if (typeof v === 'number' && v > 0) return v
      // Sem cotação nesse dia (fim de semana/feriado): tenta o dia anterior.
    } catch {
      return null // BC fora do ar ou lento: usa a tabela fixa.
    }
  }
  return null
}

function loadFromStorage(): PtaxCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PtaxCache
    if (parsed?.date && parsed.rates) return parsed
  } catch { /* ignore */ }
  return null
}

export async function fetchPtaxRates(): Promise<Record<string, number>> {
  const today = todayISO()
  if (memory && memory.date === today) return memory.rates
  const stored = loadFromStorage()
  if (stored && stored.date === today) { memory = stored; return stored.rates }
  if (Date.now() - failedAt < FAILURE_RETRY_MS) return {}
  if (inflight) return inflight

  inflight = (async () => {
    const rates: Record<string, number> = {}
    const results = await Promise.all(BACEN_SUPPORTED.map(async c => [c, await fetchOne(c)] as const))
    for (const [c, v] of results) if (v != null) rates[c] = v
    if (Object.keys(rates).length === 0) { failedAt = Date.now(); return rates }
    memory = { date: today, rates }
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(memory)) } catch { /* ignore */ }
    return rates
  })()
  try { return await inflight } finally { inflight = null }
}

// Convert a value in `currency` to BRL using current PTAX. Falls back to the
// static CURRENCY_TO_BRL table if PTAX doesn't cover the currency.
export function toBRL(value: number, currency: string, ptax: Record<string, number>): number {
  if (currency === 'BRL') return value
  const rate = ptax[currency] ?? CURRENCY_TO_BRL[currency as AppCurrency] ?? 1
  return value * rate
}

export function ptaxRateFor(currency: string, ptax: Record<string, number>): number {
  if (currency === 'BRL') return 1
  return ptax[currency] ?? CURRENCY_TO_BRL[currency as AppCurrency] ?? 1
}

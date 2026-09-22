// Fetches current PTAX rates from Banco Central do Brasil (Olinda / PTAX API).
// Returns a map of ISO currency code → BRL rate (1 unit of that currency in BRL).
// Cached in module scope and in localStorage per YYYY-MM-DD; falls back to
// a hardcoded table when the API is unreachable or the currency is unsupported.

import { CURRENCY_TO_BRL, type AppCurrency } from '../context/AppContext'
import { supabase, USE_SUPABASE } from './supabase'

const BACEN_SUPPORTED = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'ARS', 'DKK', 'NOK', 'SEK', 'CNY']
const CACHE_KEY = 'ptax-rates-v1'

interface PtaxCache { date: string; rates: Record<string, number> }

let inflight: Promise<Record<string, number>> | null = null
let memory: PtaxCache | null = null

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
      const r = await fetch(url)
      if (!r.ok) continue
      const j = await r.json() as { value?: Array<{ cotacaoVenda: number }> }
      const v = j.value?.[0]?.cotacaoVenda
      if (typeof v === 'number' && v > 0) return v
    } catch { /* try older date */ }
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
  if (inflight) return inflight

  inflight = (async () => {
    const rates: Record<string, number> = {}
    const results = await Promise.all(BACEN_SUPPORTED.map(async c => [c, await fetchOne(c)] as const))
    for (const [c, v] of results) if (v != null) rates[c] = v
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

// ── PTAX histórica (por data) — item 1.11 do plano ─────────────────────────
// fetchPtaxOn(moeda, data) devolve a PTAX de VENDA (boletim de fechamento) do
// dia `data`; se não houver cotação (fim de semana/feriado) recua até 7 dias.
// Ordem de busca:
//   1. cache em memória / localStorage (chave por moeda+data);
//   2. Supabase: tabela ac_taxas_cambio (última cotação com data <= pedida, até
//      7 dias antes) e, se a leitura falhar, a RPC ptax_em (migration 028);
//   3. BCB Olinda CotacaoMoedaDia para a data (e dias anteriores); no modo
//      Supabase a cotação obtida é gravada em ac_taxas_cambio (upsert).
// Retorna null quando nada foi encontrado — quem chama decide o fallback
// (normalmente a tabela aproximada de ./fx, SOMENTE como último recurso).

export interface PtaxOnResult {
  rate: number          // 1 unidade da moeda em BRL (ptax_venda)
  buy: number | null    // ptax_compra (quando disponível)
  date: string          // data efetiva da cotação (YYYY-MM-DD) — pode ser anterior à pedida
  source: 'BCB' | 'SUPABASE' | 'CACHE'
}

const HIST_KEY = 'ptax-hist-v1'
const histMemory = new Map<string, PtaxOnResult | null>()
const histInflight = new Map<string, Promise<PtaxOnResult | null>>()
// Moedas aceitas pela FK ac_taxas_cambio.moeda_codigo → ac_moedas (migration 028).
const PERSISTABLE = new Set(['EUR', 'USD', 'GBP'])

function loadHist(): Record<string, PtaxOnResult> {
  try {
    const raw = localStorage.getItem(HIST_KEY)
    if (raw) return JSON.parse(raw) as Record<string, PtaxOnResult>
  } catch { /* ignore */ }
  return {}
}
function saveHist(key: string, v: PtaxOnResult): void {
  try {
    const all = loadHist()
    all[key] = v
    localStorage.setItem(HIST_KEY, JSON.stringify(all))
  } catch { /* quota */ }
}

function isoMinusDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d - n)).toISOString().slice(0, 10)
}
function isoToUS(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${m}-${d}-${y}`
}

async function fetchWithTimeout(url: string, ms = 6000): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try { return await fetch(url, { signal: ctrl.signal }) } finally { clearTimeout(t) }
}

/** Cotação do BCB para UM dia exato (boletim de fechamento; senão o último do dia). */
async function bcbDay(currency: string, iso: string): Promise<{ sell: number; buy: number | null } | null> {
  const url = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaDia(moeda=@moeda,dataCotacao=@dataCotacao)?@moeda='${currency}'&@dataCotacao='${isoToUS(iso)}'&$format=json&$select=cotacaoCompra,cotacaoVenda,tipoBoletim`
  const r = await fetchWithTimeout(url)
  if (!r.ok) return null
  const j = await r.json() as { value?: Array<{ cotacaoCompra: number; cotacaoVenda: number; tipoBoletim: string }> }
  const vals = j.value ?? []
  if (!vals.length) return null
  const fech = vals.find(v => /fechamento/i.test(v.tipoBoletim)) ?? vals[vals.length - 1]
  if (!(fech.cotacaoVenda > 0)) return null
  return { sell: fech.cotacaoVenda, buy: fech.cotacaoCompra ?? null }
}

async function persistRate(currency: string, iso: string, sell: number, buy: number | null): Promise<void> {
  if (!USE_SUPABASE || !PERSISTABLE.has(currency)) return
  try {
    await supabase.from('ac_taxas_cambio').upsert(
      { moeda_codigo: currency, data: iso, ptax_compra: buy, ptax_venda: sell, fonte: 'PTAX-BCB' },
      { onConflict: 'moeda_codigo,data' },
    )
  } catch { /* cache best-effort: falha de RLS/rede não impede o uso da taxa */ }
}

/** PTAX (venda) de `currency` na data `iso` (YYYY-MM-DD), recuando até 7 dias. */
export async function fetchPtaxOn(currency: string, iso: string): Promise<PtaxOnResult | null> {
  if (!iso) return null
  const date = iso.slice(0, 10)
  if (currency === 'BRL') return { rate: 1, buy: 1, date, source: 'CACHE' }
  const key = `${currency}|${date}`
  if (histMemory.has(key)) return histMemory.get(key) ?? null
  const stored = loadHist()[key]
  if (stored) { const v = { ...stored, source: 'CACHE' as const }; histMemory.set(key, v); return v }
  const running = histInflight.get(key)
  if (running) return running

  const job = (async (): Promise<PtaxOnResult | null> => {
    if (USE_SUPABASE) {
      try {
        const { data, error } = await supabase.from('ac_taxas_cambio')
          .select('data, ptax_venda, ptax_compra').eq('moeda_codigo', currency)
          .lte('data', date).gte('data', isoMinusDays(date, 7))
          .order('data', { ascending: false }).limit(1)
        if (!error && data && data.length && Number(data[0].ptax_venda) > 0) {
          return { rate: Number(data[0].ptax_venda), buy: data[0].ptax_compra != null ? Number(data[0].ptax_compra) : null, date: data[0].data, source: 'SUPABASE' }
        }
        if (error) {
          const rpc = await supabase.rpc('ptax_em', { p_moeda: currency, p_data: date })
          if (!rpc.error && Number(rpc.data) > 0) return { rate: Number(rpc.data), buy: null, date, source: 'SUPABASE' }
        }
      } catch { /* segue para o BCB */ }
    }
    for (let i = 0; i <= 7; i++) {
      const d = isoMinusDays(date, i)
      try {
        const v = await bcbDay(currency, d)
        if (v) {
          await persistRate(currency, d, v.sell, v.buy)
          return { rate: v.sell, buy: v.buy, date: d, source: 'BCB' }
        }
      } catch {
        // Erro de rede (offline/bloqueado): não adianta insistir nos dias anteriores.
        return null
      }
    }
    return null
  })()
  histInflight.set(key, job)
  try {
    const res = await job
    // Só memoriza falhas na sessão (memória); o localStorage guarda apenas acertos.
    histMemory.set(key, res)
    if (res) saveHist(key, res)
    return res
  } finally { histInflight.delete(key) }
}

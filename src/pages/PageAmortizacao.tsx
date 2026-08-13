// src/pages/PageAmortizacao.tsx
// CALCULADORA DE AMORTIZAÇÃO / BAIXA DE INTANGÍVEL POR ATLETA.
//
// Adaptado da "Calculadora TEF" (repo calculadoratef), plugado nos dados dos
// atletas cadastrados (contratos + cláusulas + passivos). Nada da ferramenta
// original é alterado: esta é apenas uma nova aba que consome o cadastro.
//
// Por atleta cadastrado, calcula automaticamente:
//   • valor do intangível (custo de aquisição em BRL): soma de Transfer Fee +
//     Intermediação + Luvas do contrato de ENTRADA, convertidos por PTAX;
//   • cronograma de amortização mensal (linear pelo prazo do contrato);
//   • amortização acumulada até hoje e valor residual (o "saldo" a baixar);
//   • folha mensal (salário + imagem) do contrato ativo;
//   • simulação de venda: informar valor de venda, moeda, data, comissões e
//     ver o lucro contábil (mais-valia) e a baixa de intangível resultante;
//   • quem recebe se vender: sell-on (a pagar), intermediação da venda futura,
//     solidariedade FIFA, passivos com clubes/agentes — tudo lido do cadastro.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchAthletes, fetchAllContracts, fetchAllClauses,
  fetchAllClubLiabilities, fetchAllIntermediaryLiabilities,
} from '../lib/athleteQueries'
import { fetchPtaxRates, toBRL, ptaxRateFor } from '../lib/ptax'
import { fmtCurrencyShort, fmtCurrencyFull, fmtPercent, fmtDate } from '../lib/format'
import type {
  Athlete, Contract, Clause, ClubLiability, IntermediaryLiability, Currency,
} from '../types/athlete-system'
import PageHero from '../components/PageHero'
import KpiPill from '../components/KpiPill'

const font = 'var(--font-body)'
const mono = 'var(--font-label)'

// ── Helpers de data / meses ────────────────────────────────────────────────
function parseISO(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}
function monthsInclusive(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1
}
function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Modelo por atleta ──────────────────────────────────────────────────────
// Um contrato de ENTRADA compõe o intangível (transfer fee + intermediação +
// luvas). Outros contratos (empréstimo, agentes, etc.) não são considerados
// para o intangível — mas ainda aparecem em "quem recebe" via passivos/cláusulas.
const INTANGIBLE_CLAUSE_TYPES = new Set<Clause['clause_type']>([
  'TRANSFER_FEE_FIXO', 'INTERMEDIACAO', 'LUVAS',
])

interface AthleteCalc {
  athlete: Athlete
  entryContract: Contract | null
  entryContractStart: string | null
  entryContractEnd: string | null
  contractMonths: number
  monthsElapsed: number
  monthsRemaining: number
  intangibleBRL: number             // custo de aquisição em BRL na data do contrato
  intangibleItems: {
    clauseType: Clause['clause_type']; description: string;
    currency: Currency; originalValue: number; brl: number;
  }[]
  monthlyAmortBRL: number           // BRL / mês
  accumAmortBRL: number             // baixado até hoje
  residualBRL: number               // saldo do intangível
  monthlySalaryBRL: number
  monthlyImageBRL: number
  monthlyPayrollBRL: number
  // Cláusulas e passivos que serão devidos se houver venda
  sellOnPct: number                 // % agregado a pagar (sobre mais-valia)
  sellOnPayees: { party: string; pct: number; basis: string }[]
  intermedFutureBRL: number         // valor fixo já cadastrado (intermediação da venda futura)
  intermedFuturePayees: { party: string; brl: number; currency: Currency; original: number }[]
  solidariedadePct: number          // FIFA (5% típico, pro-rata clubes formadores)
  solidariedadePayees: { party: string; pct: number }[]
  clubLiabilities: ClubLiability[]
  intermLiabilities: IntermediaryLiability[]
}

function buildAthleteCalcs(
  athletes: Athlete[],
  contracts: Contract[],
  clauses: Clause[],
  clubLiabs: ClubLiability[],
  intermLiabs: IntermediaryLiability[],
  ptax: Record<string, number>,
): AthleteCalc[] {
  const today = new Date()

  return athletes.map(a => {
    // Contratos do atleta — pegamos o contrato de ENTRADA vigente ou mais recente
    const aContracts = contracts
      .filter(c => c.athlete_id === a.id)
      .sort((x, y) => (y.start_date ?? '').localeCompare(x.start_date ?? ''))
    const entry = aContracts.find(c => c.type === 'ENTRADA') ?? null

    const startD = parseISO(entry?.start_date ?? null)
    const endD = parseISO(entry?.end_date ?? null)
    const contractMonths = startD && endD ? Math.max(0, monthsInclusive(startD, endD)) : 0

    let monthsElapsed = 0
    if (startD) {
      const cap = endD && today > endD ? endD : today
      monthsElapsed = Math.max(0, Math.min(contractMonths, monthsInclusive(startD, cap)))
    }
    const monthsRemaining = Math.max(0, contractMonths - monthsElapsed)

    // Intangível — cláusulas ligadas ao contrato de entrada
    const intangibleItems = clauses
      .filter(cl => cl.athlete_id === a.id
        && (entry ? cl.contract_id === entry.id : false)
        && INTANGIBLE_CLAUSE_TYPES.has(cl.clause_type)
        && (cl.original_value ?? 0) > 0)
      .map(cl => ({
        clauseType: cl.clause_type,
        description: cl.description || cl.clause_type,
        currency: cl.currency,
        originalValue: cl.original_value ?? 0,
        brl: cl.fixed_exchange_rate
          ? (cl.original_value ?? 0) * cl.fixed_exchange_rate
          : toBRL(cl.original_value ?? 0, cl.currency, ptax),
      }))
    const intangibleBRL = intangibleItems.reduce((s, it) => s + it.brl, 0)

    const monthlyAmortBRL = contractMonths > 0 ? intangibleBRL / contractMonths : 0
    const accumAmortBRL = Math.min(intangibleBRL, monthlyAmortBRL * monthsElapsed)
    const residualBRL = Math.max(0, intangibleBRL - accumAmortBRL)

    // Folha mensal — pega do contrato de entrada (salário e imagem já são mensais)
    const salCur = (entry?.salary_currency ?? 'BRL') as Currency
    const salVal = entry?.base_salary ?? 0
    const imgVal = entry?.image_value ?? 0
    const monthlySalaryBRL = toBRL(salVal, salCur, ptax)
    const monthlyImageBRL = toBRL(imgVal, salCur, ptax)
    const monthlyPayrollBRL = monthlySalaryBRL + monthlyImageBRL

    // Sell-on a pagar (agregado por %)
    const sellOnClauses = clauses.filter(cl => cl.athlete_id === a.id && cl.clause_type === 'SELL_ON_FEE')
    const sellOnPct = sellOnClauses.reduce((s, cl) => s + (cl.percentage_value ?? 0), 0)
    const sellOnPayees = sellOnClauses.map(cl => ({
      party: cl.creditor_party || '—',
      pct: cl.percentage_value ?? 0,
      basis: cl.condition_description || 'mais-valia',
    }))

    // Intermediação da venda futura — valor cadastrado (ou %; aqui só somamos valor)
    const intermedFutureClauses = clauses.filter(cl => cl.athlete_id === a.id && cl.clause_type === 'INTERMEDIACAO_VENDA_FUTURA')
    const intermedFuturePayees = intermedFutureClauses.map(cl => ({
      party: cl.creditor_party || '—',
      currency: cl.currency,
      original: cl.original_value ?? 0,
      brl: cl.fixed_exchange_rate
        ? (cl.original_value ?? 0) * cl.fixed_exchange_rate
        : toBRL(cl.original_value ?? 0, cl.currency, ptax),
    }))
    const intermedFutureBRL = intermedFuturePayees.reduce((s, p) => s + p.brl, 0)

    // Solidariedade FIFA — cláusulas do tipo SOLIDARIEDADE_FIFA (soma dos %)
    const solidClauses = clauses.filter(cl => cl.athlete_id === a.id && cl.clause_type === 'SOLIDARIEDADE_FIFA')
    const solidariedadePct = solidClauses.reduce((s, cl) => s + (cl.percentage_value ?? 0), 0)
    const solidariedadePayees = solidClauses.map(cl => ({
      party: cl.creditor_party || 'Clubes formadores (FIFA)',
      pct: cl.percentage_value ?? 0,
    }))

    // Passivos pendentes vinculados ao atleta
    const aClubLiabs = clubLiabs.filter(l => l.athlete_id === a.id && l.status !== 'PAGA' && l.status !== 'CANCELADA')
    const aIntermLiabs = intermLiabs.filter(l => l.athlete_id === a.id && l.status !== 'PAGA' && l.status !== 'CANCELADA')

    return {
      athlete: a,
      entryContract: entry,
      entryContractStart: entry?.start_date ?? null,
      entryContractEnd: entry?.end_date ?? null,
      contractMonths, monthsElapsed, monthsRemaining,
      intangibleBRL, intangibleItems,
      monthlyAmortBRL, accumAmortBRL, residualBRL,
      monthlySalaryBRL, monthlyImageBRL, monthlyPayrollBRL,
      sellOnPct, sellOnPayees,
      intermedFutureBRL, intermedFuturePayees,
      solidariedadePct, solidariedadePayees,
      clubLiabilities: aClubLiabs,
      intermLiabilities: aIntermLiabs,
    }
  })
}

// ── Simulação de venda ────────────────────────────────────────────────────
interface SaleInputs {
  saleValue: number
  saleCurrency: Currency
  saleDate: string
  commissionValue: number         // intermediação nova (não cadastrada)
  commissionCurrency: Currency
  taxesPct: number
  extraSellOnPct: number
  extraSolidariedadePct: number
}
interface SaleResult {
  saleBRL: number
  intangibleWriteoffBRL: number    // resíduo baixado
  sellOnFeeBRL: number
  solidariedadeBRL: number
  intermedNewBRL: number
  intermedCadastradaBRL: number
  taxesBRL: number
  gainBRL: number
  netToClubBRL: number             // saleBRL - todas obrigações
}
function calcSale(inputs: SaleInputs, c: AthleteCalc, ptax: Record<string, number>): SaleResult {
  const saleBRL = toBRL(inputs.saleValue || 0, inputs.saleCurrency, ptax)
  const intangibleWriteoffBRL = c.residualBRL
  const solidariedadePct = c.solidariedadePct + (inputs.extraSolidariedadePct || 0)
  const solidariedadeBRL = saleBRL * (solidariedadePct / 100)
  const baseAfterSolid = Math.max(0, saleBRL - solidariedadeBRL)
  const sellOnPct = c.sellOnPct + (inputs.extraSellOnPct || 0)
  // Base padrão do sell-on: mais-valia (venda − solidariedade − residual do intangível)
  const maisValia = Math.max(0, baseAfterSolid - intangibleWriteoffBRL)
  const sellOnFeeBRL = maisValia * (sellOnPct / 100)
  const intermedNewBRL = toBRL(inputs.commissionValue || 0, inputs.commissionCurrency, ptax)
  const intermedCadastradaBRL = c.intermedFutureBRL
  const taxesBRL = saleBRL * ((inputs.taxesPct || 0) / 100)
  const gainBRL = saleBRL - intangibleWriteoffBRL - solidariedadeBRL - sellOnFeeBRL - intermedNewBRL - intermedCadastradaBRL - taxesBRL
  const netToClubBRL = gainBRL
  return {
    saleBRL, intangibleWriteoffBRL, sellOnFeeBRL, solidariedadeBRL,
    intermedNewBRL, intermedCadastradaBRL, taxesBRL, gainBRL, netToClubBRL,
  }
}

// ── UI ─────────────────────────────────────────────────────────────────────
export default function PageAmortizacao() {
  const [rows, setRows] = useState<AthleteCalc[]>([])
  const [loading, setLoading] = useState(true)
  const [ptax, setPtax] = useState<Record<string, number>>({})
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const rates = await fetchPtaxRates().catch(() => ({} as Record<string, number>))
    setPtax(rates)
    const [athletes, contracts, clauses, clubLiabs, intermLiabs] = await Promise.all([
      fetchAthletes(), fetchAllContracts(), fetchAllClauses(),
      fetchAllClubLiabilities(), fetchAllIntermediaryLiabilities(),
    ])
    setRows(buildAthleteCalcs(athletes, contracts, clauses, clubLiabs, intermLiabs, rates))
    setLoading(false)
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial no mount
  useEffect(() => { load() }, [load])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows
      .filter(r => !q || [r.athlete.full_name, r.athlete.short_name].some(v => (v ?? '').toLowerCase().includes(q)))
      .sort((a, b) => b.intangibleBRL - a.intangibleBRL || a.athlete.full_name.localeCompare(b.athlete.full_name))
  }, [rows, search])

  const totals = useMemo(() => ({
    intangible: visible.reduce((s, r) => s + r.intangibleBRL, 0),
    residual: visible.reduce((s, r) => s + r.residualBRL, 0),
    accum: visible.reduce((s, r) => s + r.accumAmortBRL, 0),
    monthly: visible.reduce((s, r) => s + r.monthlyAmortBRL, 0),
  }), [visible])

  const th: React.CSSProperties = { padding: '9px 12px', fontSize: 9, fontWeight: 600, textTransform: 'uppercase', background: 'var(--tbl-head)', color: 'var(--ink-secondary)', borderBottom: '1px solid var(--divider-strong)', fontFamily: mono, letterSpacing: '0.14em', whiteSpace: 'nowrap', textAlign: 'left' }
  const td: React.CSSProperties = { padding: '10px 12px', fontSize: 12, color: 'var(--ink-primary)', fontFamily: font, borderBottom: '1px solid var(--divider-soft)', verticalAlign: 'middle' }

  return (
    <div style={{ padding: '24px 28px 32px', width: '100%', boxSizing: 'border-box' }}>
      <PageHero title="Calculadora — Amortização & Baixa de Intangível" subtitle="Por atleta cadastrado · Botafogo SAF" />

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 9, fontFamily: mono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Busca</div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nome do atleta..."
            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--cream-card)', fontSize: 13, fontFamily: font, color: 'var(--ink-primary)' }} />
        </div>
        <KpiPill label="Intangível (BRL)" value={fmtCurrencyShort(totals.intangible, 'BRL')} tone="neutral" />
        <KpiPill label="Amortizado (BRL)" value={fmtCurrencyShort(totals.accum, 'BRL')} tone="neutral" />
        <KpiPill label="Residual (BRL)" value={fmtCurrencyShort(totals.residual, 'BRL')} tone="warn" />
        <KpiPill label="Amortiz. / mês" value={fmtCurrencyShort(totals.monthly, 'BRL')} tone="neutral" />
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 36 }} aria-label="Expandir" />
                <th style={{ ...th, minWidth: 180 }}>Atleta</th>
                <th style={{ ...th, minWidth: 140 }}>Contrato</th>
                <th style={{ ...th, textAlign: 'right', minWidth: 120 }}>Intangível (BRL)</th>
                <th style={{ ...th, textAlign: 'right', minWidth: 120 }}>Amortiz./mês</th>
                <th style={{ ...th, textAlign: 'right', minWidth: 120 }}>Amortizado</th>
                <th style={{ ...th, textAlign: 'right', minWidth: 120 }}>Residual</th>
                <th style={{ ...th, textAlign: 'right', minWidth: 80 }}>% baixado</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Carregando PTAX e cadastros…</td></tr>
              )}
              {!loading && visible.length === 0 && (
                <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Nenhum atleta cadastrado.</td></tr>
              )}
              {!loading && visible.map(r => {
                const isOpen = expandedId === r.athlete.id
                const pct = r.intangibleBRL > 0 ? (r.accumAmortBRL / r.intangibleBRL) * 100 : 0
                return (
                  <>
                    <tr key={r.athlete.id} style={{ background: 'var(--cream-card)', cursor: 'pointer' }}
                      onClick={() => setExpandedId(isOpen ? null : r.athlete.id)}>
                      <td style={{ ...td, textAlign: 'center', fontFamily: mono, color: 'var(--text-muted)' }}>{isOpen ? '▾' : '▸'}</td>
                      <td style={{ ...td, fontWeight: 700 }}>
                        {r.athlete.short_name || r.athlete.full_name}
                        <div style={{ fontSize: 10.5, fontFamily: mono, color: 'var(--text-muted)', fontWeight: 400 }}>
                          {r.athlete.position ?? '—'} · {r.athlete.current_status}
                        </div>
                      </td>
                      <td style={{ ...td, fontFamily: mono, fontSize: 11 }}>
                        {r.entryContractStart ? fmtDate(r.entryContractStart) : '—'}
                        {' → '}
                        {r.entryContractEnd ? fmtDate(r.entryContractEnd) : '—'}
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                          {r.contractMonths ? `${r.contractMonths} m · restam ${r.monthsRemaining}` : 'sem contrato de entrada'}
                        </div>
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: mono, fontWeight: 700 }}>
                        {r.intangibleBRL > 0 ? fmtCurrencyShort(r.intangibleBRL, 'BRL') : '—'}
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: mono }}>
                        {r.monthlyAmortBRL > 0 ? fmtCurrencyShort(r.monthlyAmortBRL, 'BRL') : '—'}
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: mono }}>
                        {r.accumAmortBRL > 0 ? fmtCurrencyShort(r.accumAmortBRL, 'BRL') : '—'}
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: mono, fontWeight: 700, color: r.residualBRL > 0 ? 'var(--warn)' : 'var(--text-muted)' }}>
                        {r.residualBRL > 0 ? fmtCurrencyShort(r.residualBRL, 'BRL') : '—'}
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: mono, fontSize: 11 }}>{fmtPercent(pct)}</td>
                    </tr>
                    {isOpen && (
                      <tr key={r.athlete.id + '-detail'}>
                        <td colSpan={8} style={{ padding: 0, background: 'var(--bg-subtle)', borderBottom: '1px solid var(--divider-soft)' }}>
                          <AthleteDetail c={r} ptax={ptax} />
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)', fontFamily: mono }}>
        Amortização linear pelo prazo do contrato de entrada; PTAX corrente do BACEN quando disponível.
      </div>
    </div>
  )
}

// ── Detalhe do atleta expandido (amortização, quem recebe, simulador) ──────
function AthleteDetail({ c, ptax }: { c: AthleteCalc; ptax: Record<string, number> }) {
  const [sale, setSale] = useState<SaleInputs>({
    saleValue: 0, saleCurrency: 'EUR', saleDate: todayISO(),
    commissionValue: 0, commissionCurrency: 'EUR',
    taxesPct: 0, extraSellOnPct: 0, extraSolidariedadePct: 0,
  })
  const result = useMemo(() => calcSale(sale, c, ptax), [sale, c, ptax])

  const sec: React.CSSProperties = { padding: '14px 18px', borderTop: '1px solid var(--divider-soft)' }
  const secTitle: React.CSSProperties = { fontFamily: mono, fontSize: 9, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--gold, #be8c4a)', marginBottom: 10 }
  const kvRow: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }
  const label: React.CSSProperties = { fontFamily: mono, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 3 }
  const val: React.CSSProperties = { fontFamily: mono, fontSize: 14, fontWeight: 600, color: 'var(--ink-primary)' }
  const inp: React.CSSProperties = { width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid var(--input-border)', background: 'var(--cream-card)', fontSize: 13, fontFamily: mono, color: 'var(--ink-primary)' }

  return (
    <div>
      {/* Composição do intangível */}
      <div style={sec}>
        <div style={secTitle}>1. Composição do intangível</div>
        {c.intangibleItems.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Sem cláusulas de Transfer Fee / Intermediação / Luvas cadastradas para o contrato de entrada.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...detTh }}>Item</th>
                <th style={{ ...detTh, textAlign: 'right' }}>Valor original</th>
                <th style={{ ...detTh, textAlign: 'right' }}>BRL (aprox.)</th>
              </tr>
            </thead>
            <tbody>
              {c.intangibleItems.map((it, i) => (
                <tr key={i}>
                  <td style={detTd}>{it.description}</td>
                  <td style={{ ...detTd, textAlign: 'right', fontFamily: mono }}>{fmtCurrencyFull(it.originalValue, it.currency)}</td>
                  <td style={{ ...detTd, textAlign: 'right', fontFamily: mono }}>{fmtCurrencyShort(it.brl, 'BRL')}</td>
                </tr>
              ))}
              <tr>
                <td style={{ ...detTd, fontWeight: 700 }}>Total do intangível</td>
                <td style={detTd} />
                <td style={{ ...detTd, textAlign: 'right', fontFamily: mono, fontWeight: 700 }}>{fmtCurrencyShort(c.intangibleBRL, 'BRL')}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {/* Amortização e folha */}
      <div style={sec}>
        <div style={secTitle}>2. Amortização & folha mensal</div>
        <div style={kvRow}>
          <div><div style={label}>Prazo (meses)</div><div style={val}>{c.contractMonths || '—'}</div></div>
          <div><div style={label}>Decorridos / restantes</div><div style={val}>{c.monthsElapsed} / {c.monthsRemaining}</div></div>
          <div><div style={label}>Amortização mensal</div><div style={val}>{fmtCurrencyShort(c.monthlyAmortBRL, 'BRL')}</div></div>
          <div><div style={label}>Amortizado até hoje</div><div style={val}>{fmtCurrencyShort(c.accumAmortBRL, 'BRL')}</div></div>
          <div><div style={label}>Residual (a baixar)</div><div style={{ ...val, color: 'var(--warn)' }}>{fmtCurrencyShort(c.residualBRL, 'BRL')}</div></div>
          <div><div style={label}>Salário mensal</div><div style={val}>{fmtCurrencyShort(c.monthlySalaryBRL, 'BRL')}</div></div>
          <div><div style={label}>Imagem mensal</div><div style={val}>{fmtCurrencyShort(c.monthlyImageBRL, 'BRL')}</div></div>
          <div><div style={label}>Folha total / mês</div><div style={val}>{fmtCurrencyShort(c.monthlyPayrollBRL, 'BRL')}</div></div>
        </div>
      </div>

      {/* Quem recebe em caso de venda */}
      <div style={sec}>
        <div style={secTitle}>3. Quem recebe se vender (cadastro)</div>
        <div style={{ ...kvRow, marginBottom: 12 }}>
          <div><div style={label}>Sell-on total (%)</div><div style={val}>{fmtPercent(c.sellOnPct)}</div></div>
          <div><div style={label}>Solidariedade FIFA (%)</div><div style={val}>{fmtPercent(c.solidariedadePct)}</div></div>
          <div><div style={label}>Intermed. venda futura (BRL)</div><div style={val}>{fmtCurrencyShort(c.intermedFutureBRL, 'BRL')}</div></div>
        </div>
        {(c.sellOnPayees.length + c.solidariedadePayees.length + c.intermedFuturePayees.length + c.clubLiabilities.length + c.intermLiabilities.length) === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Nenhuma obrigação cadastrada para este atleta.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={detTh}>Beneficiário</th>
                <th style={detTh}>Tipo</th>
                <th style={{ ...detTh, textAlign: 'right' }}>Base / valor</th>
              </tr>
            </thead>
            <tbody>
              {c.sellOnPayees.map((p, i) => (
                <tr key={'so' + i}>
                  <td style={detTd}>{p.party}</td>
                  <td style={detTd}>Sell-on ({p.basis})</td>
                  <td style={{ ...detTd, textAlign: 'right', fontFamily: mono }}>{fmtPercent(p.pct)}</td>
                </tr>
              ))}
              {c.solidariedadePayees.map((p, i) => (
                <tr key={'sd' + i}>
                  <td style={detTd}>{p.party}</td>
                  <td style={detTd}>Solidariedade FIFA</td>
                  <td style={{ ...detTd, textAlign: 'right', fontFamily: mono }}>{fmtPercent(p.pct)}</td>
                </tr>
              ))}
              {c.intermedFuturePayees.map((p, i) => (
                <tr key={'if' + i}>
                  <td style={detTd}>{p.party}</td>
                  <td style={detTd}>Intermediação (venda futura)</td>
                  <td style={{ ...detTd, textAlign: 'right', fontFamily: mono }}>
                    {fmtCurrencyFull(p.original, p.currency)} · {fmtCurrencyShort(p.brl, 'BRL')}
                  </td>
                </tr>
              ))}
              {c.clubLiabilities.map(l => (
                <tr key={'cl' + l.id}>
                  <td style={detTd}>{l.club_name}</td>
                  <td style={detTd}>Passivo com clube {l.solidarity ? '(solidariedade)' : ''}</td>
                  <td style={{ ...detTd, textAlign: 'right', fontFamily: mono }}>
                    {fmtCurrencyFull(l.amount, l.currency)}
                  </td>
                </tr>
              ))}
              {c.intermLiabilities.map(l => (
                <tr key={'il' + l.id}>
                  <td style={detTd}>{l.intermediary_name}</td>
                  <td style={detTd}>Passivo com agente</td>
                  <td style={{ ...detTd, textAlign: 'right', fontFamily: mono }}>
                    {fmtCurrencyFull(l.amount, l.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Simulador de venda */}
      <div style={sec}>
        <div style={secTitle}>4. Simulação de venda</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 14 }}>
          <div>
            <div style={label}>Valor de venda</div>
            <input type="number" style={inp} value={sale.saleValue || ''}
              onChange={e => setSale(s => ({ ...s, saleValue: parseFloat(e.target.value) || 0 }))} />
          </div>
          <div>
            <div style={label}>Moeda</div>
            <select style={inp} value={sale.saleCurrency}
              onChange={e => setSale(s => ({ ...s, saleCurrency: e.target.value as Currency }))}>
              <option value="BRL">BRL</option><option value="EUR">EUR</option>
              <option value="USD">USD</option><option value="GBP">GBP</option>
            </select>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3, fontFamily: mono }}>
              PTAX: {ptaxRateFor(sale.saleCurrency, ptax).toLocaleString('pt-BR', { minimumFractionDigits: 4 })}
            </div>
          </div>
          <div>
            <div style={label}>Data da venda</div>
            <input type="date" style={inp} value={sale.saleDate}
              onChange={e => setSale(s => ({ ...s, saleDate: e.target.value }))} />
          </div>
          <div>
            <div style={label}>Intermediação NOVA</div>
            <input type="number" style={inp} value={sale.commissionValue || ''}
              onChange={e => setSale(s => ({ ...s, commissionValue: parseFloat(e.target.value) || 0 }))} />
          </div>
          <div>
            <div style={label}>Moeda comissão</div>
            <select style={inp} value={sale.commissionCurrency}
              onChange={e => setSale(s => ({ ...s, commissionCurrency: e.target.value as Currency }))}>
              <option value="BRL">BRL</option><option value="EUR">EUR</option>
              <option value="USD">USD</option><option value="GBP">GBP</option>
            </select>
          </div>
          <div>
            <div style={label}>Impostos (%)</div>
            <input type="number" style={inp} value={sale.taxesPct || ''}
              onChange={e => setSale(s => ({ ...s, taxesPct: parseFloat(e.target.value) || 0 }))} />
          </div>
          <div>
            <div style={label}>Sell-on extra (%)</div>
            <input type="number" style={inp} value={sale.extraSellOnPct || ''}
              onChange={e => setSale(s => ({ ...s, extraSellOnPct: parseFloat(e.target.value) || 0 }))} />
          </div>
          <div>
            <div style={label}>Solidariedade extra (%)</div>
            <input type="number" style={inp} value={sale.extraSolidariedadePct || ''}
              onChange={e => setSale(s => ({ ...s, extraSolidariedadePct: parseFloat(e.target.value) || 0 }))} />
          </div>
        </div>

        <div style={{ background: 'var(--cream-card)', border: '1px solid var(--divider-soft)', borderRadius: 10, padding: 14 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <SaleLine label="(+) Valor de venda (BRL)" v={result.saleBRL} />
              <SaleLine label="(−) Solidariedade FIFA" v={-result.solidariedadeBRL} />
              <SaleLine label="(−) Baixa de intangível (residual)" v={-result.intangibleWriteoffBRL} />
              <SaleLine label="(−) Sell-on a pagar" v={-result.sellOnFeeBRL} />
              <SaleLine label="(−) Intermediação (cadastrada — venda futura)" v={-result.intermedCadastradaBRL} />
              <SaleLine label="(−) Intermediação (nova)" v={-result.intermedNewBRL} />
              <SaleLine label="(−) Impostos" v={-result.taxesBRL} />
              <SaleLine bold label="(=) Lucro contábil (mais-valia líquida)" v={result.gainBRL} highlight />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

const detTh: React.CSSProperties = {
  padding: '7px 10px', fontSize: 9, fontFamily: mono, letterSpacing: '0.12em',
  textTransform: 'uppercase', color: 'var(--text-muted)', textAlign: 'left',
  borderBottom: '1px solid var(--divider-soft)', fontWeight: 600,
}
const detTd: React.CSSProperties = {
  padding: '7px 10px', fontSize: 12, fontFamily: font, color: 'var(--ink-primary)',
  borderBottom: '1px solid var(--divider-soft)',
}

function SaleLine({ label, v, bold, highlight }: { label: string; v: number; bold?: boolean; highlight?: boolean }) {
  const neg = v < 0
  return (
    <tr>
      <td style={{ padding: '6px 4px', fontFamily: font, fontSize: 12, fontWeight: bold ? 700 : 400, color: 'var(--ink-primary)' }}>{label}</td>
      <td style={{
        padding: '6px 4px', textAlign: 'right', fontFamily: mono,
        fontSize: highlight ? 15 : 13, fontWeight: bold ? 700 : 500,
        color: highlight ? (v >= 0 ? 'var(--pos)' : 'var(--neg)') : (neg ? 'var(--neg)' : 'var(--ink-primary)'),
      }}>
        {fmtCurrencyFull(v, 'BRL')}
      </td>
    </tr>
  )
}

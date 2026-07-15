import { useState, useMemo, useEffect, useCallback } from 'react'
import PageHero from '../components/PageHero'
import SheetIO from '../components/SheetIO'
import { COLS_INTERMEDIARY_LIABILITIES } from '../lib/xlsx-utils'
import {
  fetchAllIntermediaryLiabilities,
  fetchAthletes,
  createIntermediaryLiability,
} from '../lib/athleteQueries'
import type {
  IntermediaryLiability,
  NewIntermediaryLiabilityInput,
  Athlete,
  LiabilityDirection,
  LiabilityStatus,
  Currency,
} from '../types/athlete-system'
import {
  LIABILITY_STATUS_LABELS,
  LIABILITY_DIRECTION_LABELS,
} from '../types/athlete-system'
import { fmtCurrencyShort, fmtDate, isOverdue } from '../lib/format'

const font = "'Inter', system-ui, sans-serif"
const fontLabel = "'IBM Plex Mono', 'JetBrains Mono', monospace"
const fontData = "'JetBrains Mono', ui-monospace, monospace"

// Conversão aproximada p/ BRL (somente exibição — use PTAX p/ pagamentos reais).
const APPROX_BRL: Record<Currency, number> = { BRL: 1, EUR: 6.10, USD: 5.55, GBP: 7.10 }
function approxBRL(amount: number, currency: Currency): number {
  return amount * (APPROX_BRL[currency] ?? 1)
}

const CURRENCIES: Currency[] = ['BRL', 'EUR', 'USD', 'GBP']
const DIRECTIONS: LiabilityDirection[] = ['A_PAGAR', 'A_RECEBER']
const STATUSES: LiabilityStatus[] = ['PENDENTE', 'PAGA', 'EM_ATRASO', 'CANCELADA']

const STATUS_BG: Record<LiabilityStatus, string> = {
  PENDENTE:  'rgba(184,138,42,0.15)',
  PAGA:      'rgba(22,101,52,0.15)',
  EM_ATRASO: 'rgba(185,28,28,0.15)',
  CANCELADA: '#f0f0f0',
}
const STATUS_COLOR: Record<LiabilityStatus, string> = {
  PENDENTE:  'var(--warn, #8a6a1a)',
  PAGA:      'var(--pos, #166534)',
  EM_ATRASO: 'var(--neg, #b91c1c)',
  CANCELADA: '#7a7266',
}

function StatusBadge({ status }: { status: LiabilityStatus }) {
  return (
    <span style={{
      background: STATUS_BG[status],
      color: STATUS_COLOR[status],
      padding: '2px 8px', borderRadius: 4,
      fontSize: 9, fontWeight: 500, fontFamily: fontLabel,
      textTransform: 'uppercase', letterSpacing: '0.10em',
    }}>{LIABILITY_STATUS_LABELS[status]}</span>
  )
}

function KpiCard({ label, value, sub, bg, border, labelColor, valueColor, footnote }: {
  label: string; value: string; sub?: string
  bg: string; border: string; labelColor: string; valueColor: string
  footnote?: string
}) {
  return (
    <div>
      <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: '16px 20px' }}>
        <div style={{ fontSize: 9, fontWeight: 500, color: labelColor, textTransform: 'uppercase', letterSpacing: '0.14em', fontFamily: fontLabel }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 500, color: valueColor, marginTop: 8, fontFamily: fontData, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
        {sub && <div style={{ fontSize: 10, color: labelColor, fontFamily: font, marginTop: 4, opacity: 0.8 }}>{sub}</div>}
      </div>
      {footnote && (
        <div style={{ fontSize: 9, color: 'var(--text-faint)', fontStyle: 'italic', fontFamily: fontLabel, marginTop: 4, paddingLeft: 2, letterSpacing: '0.06em' }}>
          {footnote}
        </div>
      )}
    </div>
  )
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <span style={{ opacity: 0.25, fontSize: 9, marginLeft: 2 }}>↕</span>
  return <span style={{ fontSize: 9, marginLeft: 2 }}>{dir === 'asc' ? '↑' : '↓'}</span>
}

function athleteName(a: Athlete): string {
  return a.short_name || a.full_name
}

const EMPTY_FORM: NewIntermediaryLiabilityInput = {
  intermediary_name: '',
  description: '',
  direction: 'A_PAGAR',
  amount: 0,
  currency: 'BRL',
  due_date: null,
  conditional: false,
  condition_description: '',
  penalty_terms: '',
  status: 'PENDENTE',
  notes: '',
}

export default function PageIntermediarios() {
  const [liabilities, setLiabilities] = useState<IntermediaryLiability[]>([])
  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const [libs, atls] = await Promise.all([
      fetchAllIntermediaryLiabilities(),
      fetchAthletes(),
    ])
    setLiabilities(libs)
    setAthletes(atls)
  }, [])

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([fetchAllIntermediaryLiabilities(), fetchAthletes()])
      .then(([libs, atls]) => {
        if (!alive) return
        setLiabilities(libs)
        setAthletes(atls)
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const athleteById = useMemo(() => {
    const m = new Map<string, string>()
    athletes.forEach(a => m.set(a.id, athleteName(a)))
    return m
  }, [athletes])

  const [sortField, setSortField] = useState<string>('')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const handleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const [interFiltro, setInterFiltro] = useState('Todos')
  const [atletaFiltro, setAtletaFiltro] = useState('Todos')
  const [condFiltro, setCondFiltro] = useState<'Todos' | 'Certo' | 'Condicional'>('Todos')

  const intermediarios = useMemo(() =>
    ['Todos', ...Array.from(new Set(liabilities.map(p => p.intermediary_name))).sort()], [liabilities])
  const atletasOpts = useMemo(() =>
    ['Todos', ...athletes.map(athleteName)], [athletes])

  const filtrados = useMemo(() => liabilities.filter(p => {
    const okInter = interFiltro === 'Todos' || p.intermediary_name === interFiltro
    const okAtl = atletaFiltro === 'Todos' || athleteById.get(p.athlete_id) === atletaFiltro
    const okCond = condFiltro === 'Todos' || (condFiltro === 'Certo' ? !p.conditional : p.conditional)
    return okInter && okAtl && okCond
  }), [liabilities, interFiltro, atletaFiltro, condFiltro, athleteById])

  const sorted = useMemo(() => {
    return [...filtrados].sort((a, b) => {
      let va: string | number = 0, vb: string | number = 0
      if (sortField === 'intermediary_name') { va = a.intermediary_name; vb = b.intermediary_name }
      else if (sortField === 'atleta') { va = athleteById.get(a.athlete_id) ?? ''; vb = athleteById.get(b.athlete_id) ?? '' }
      else if (sortField === 'direction') { va = a.direction; vb = b.direction }
      else if (sortField === 'amount') { va = a.amount; vb = b.amount }
      else if (sortField === 'currency') { va = a.currency; vb = b.currency }
      else if (sortField === 'due_date') { va = a.due_date ?? ''; vb = b.due_date ?? '' }
      else if (sortField === 'status') { va = a.status; vb = b.status }
      else if (sortField === 'settled_date') { va = a.settled_date ?? ''; vb = b.settled_date ?? '' }
      else return 0
      const cmp = va < vb ? -1 : va > vb ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [filtrados, sortField, sortDir, athleteById])

  const totalBRL = filtrados.reduce((s, p) => s + approxBRL(p.amount, p.currency), 0)
  const countAPagar = filtrados.filter(p => p.direction === 'A_PAGAR').length
  const countAReceber = filtrados.filter(p => p.direction === 'A_RECEBER').length
  const countAtraso = filtrados.filter(p => p.status === 'EM_ATRASO' || isOverdue(p.due_date, p.status)).length

  const interNome = interFiltro !== 'Todos' ? interFiltro : null

  // ── Modal de novo passivo ──────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formAthlete, setFormAthlete] = useState('')
  const [form, setForm] = useState<NewIntermediaryLiabilityInput>({ ...EMPTY_FORM })

  function openModal() {
    setForm({ ...EMPTY_FORM })
    setFormAthlete('')
    setModalOpen(true)
  }

  async function handleCreate() {
    if (!formAthlete || !form.intermediary_name.trim()) return
    setSaving(true)
    try {
      await createIntermediaryLiability(formAthlete, {
        ...form,
        amount: Number(form.amount) || 0,
        due_date: form.due_date || null,
      })
      await refresh()
      setModalOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const th: React.CSSProperties = {
    padding: '9px 10px', fontSize: 9, fontWeight: 500, textTransform: 'uppercase',
    color: 'var(--table-header-color)', background: 'var(--table-header-bg)', borderBottom: '1px solid var(--divider-strong)',
    fontFamily: fontLabel, letterSpacing: '0.14em', whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1,
    overflow: 'hidden', textOverflow: 'ellipsis',
    cursor: 'pointer', userSelect: 'none',
  }
  const td: React.CSSProperties = {
    padding: '14px 10px', fontSize: 12, color: 'var(--text-primary)', fontFamily: fontData,
    whiteSpace: 'normal', verticalAlign: 'top', fontVariantNumeric: 'tabular-nums',
  }
  const tdr: React.CSSProperties = { ...td, textAlign: 'right' }

  const exportRows = liabilities as unknown as Record<string, unknown>[]

  return (
    <div style={{ padding: '12px 16px', maxWidth: 1600, margin: '0 auto', fontFamily: font }}>

      <PageHero title="Intermediários" subtitle="PASSIVO — INTERMEDIÁRIOS">
        <button
          onClick={openModal}
          style={{
            background: 'rgba(190,140,74,0.15)', color: '#be8c4a',
            border: '1px solid rgba(190,140,74,0.40)', borderRadius: 999,
            padding: '8px 18px', fontFamily: fontLabel, fontSize: 10, fontWeight: 500,
            letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer',
          }}
        >
          + Novo Passivo
        </button>
        <SheetIO
          exportFilename="passivos-intermediarios.xlsx"
          exportSheets={[{ name: 'Passivos_Intermediarios', cols: COLS_INTERMEDIARY_LIABILITIES, rows: exportRows }]}
          onImport={async sheets => {
            const rows = sheets['Passivos_Intermediarios'] ?? sheets[Object.keys(sheets)[0]] ?? []
            const toBool = (v: unknown) => v === 'true' || v === 'TRUE' || v === '1' || v === true
            for (const r of rows) {
              const athleteId = String(r['Atleta ID'] ?? '').trim()
              if (!athleteId) continue
              const input: NewIntermediaryLiabilityInput = {
                intermediary_name: String(r['Intermediário'] ?? ''),
                description: String(r['Descrição'] ?? ''),
                direction: (r['Direção'] as LiabilityDirection) || 'A_PAGAR',
                amount: Number(r['Valor']) || 0,
                currency: (r['Moeda'] as Currency) || 'BRL',
                due_date: r['Vencimento'] ? String(r['Vencimento']) : null,
                conditional: toBool(r['Condicional']),
                condition_description: String(r['Condição'] ?? ''),
                penalty_terms: String(r['Teor Multa'] ?? ''),
                status: (r['Status'] as LiabilityStatus) || 'PENDENTE',
                notes: String(r['Observações'] ?? ''),
              }
              await createIntermediaryLiability(athleteId, input)
            }
            await refresh()
          }}
        />
      </PageHero>

      {/* ── Topo: Filtros + Display Intermediário + Total ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 200px', gap: 12, marginBottom: 12, alignItems: 'stretch' }}>

        {/* Filtros */}
        <div className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, fontFamily: font }}>Intermediário</div>
            <select value={interFiltro} onChange={e => setInterFiltro(e.target.value)}
              style={{ width: '100%', fontSize: 12, padding: '5px 8px' }}>
              {intermediarios.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, fontFamily: font }}>Atleta</div>
            <select value={atletaFiltro} onChange={e => setAtletaFiltro(e.target.value)}
              style={{ width: '100%', fontSize: 12, padding: '5px 8px' }}>
              {atletasOpts.map(a => <option key={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, fontFamily: font }}>Certo/Condicional</div>
            <select value={condFiltro} onChange={e => setCondFiltro(e.target.value as typeof condFiltro)}
              style={{ width: '100%', fontSize: 12, padding: '5px 8px' }}>
              {(['Todos', 'Certo', 'Condicional'] as const).map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ marginTop: 'auto', color: 'var(--text-faint)', fontSize: 11, fontFamily: font }}>
            {filtrados.length} {filtrados.length !== 1 ? 'passivos' : 'passivo'}
          </div>
        </div>

        {/* Display do Intermediário */}
        <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 32px', gap: 20 }}>
          {interNome ? (
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: font, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>Intermediário</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', fontFamily: font, lineHeight: 1.1 }}>{interNome}</div>
            </div>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: font, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Intermediário</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-faint)', fontFamily: font }}>—</div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: font, marginTop: 4 }}>Selecione um intermediário para exibir</div>
            </div>
          )}
        </div>

        {/* Total aproximado BRL */}
        <div className="card" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'center', borderTop: '4px solid #111' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: font }}>Total (R$)</div>
          <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--text-primary)', marginTop: 10, fontFamily: font, lineHeight: 1 }}>{fmtCurrencyShort(totalBRL, 'BRL')}</div>
          <div style={{ fontSize: 10, color: 'var(--text-faint)', fontStyle: 'italic', fontFamily: font, marginTop: 6 }}>*Valor aproximado</div>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 14 }}>
        <KpiCard
          label="Total (aprox. BRL)" value={fmtCurrencyShort(totalBRL, 'BRL')} sub="Todas as moedas convertidas"
          bg="var(--cream-canvas)" border="var(--divider-strong)" labelColor="var(--ink-secondary)" valueColor="var(--ink-primary)"
          footnote="*Conversão aproximada — use PTAX no pagamento"
        />
        <KpiCard
          label="A Pagar" value={String(countAPagar)} sub="passivos"
          bg="var(--warn-tint)" border="rgba(184,138,42,0.25)" labelColor="var(--warn)" valueColor="var(--gold-deep)"
        />
        <KpiCard
          label="A Receber" value={String(countAReceber)} sub="passivos"
          bg="var(--pos-tint)" border="rgba(22,101,52,0.20)" labelColor="var(--pos)" valueColor="var(--pos)"
        />
        <KpiCard
          label="Em Atraso" value={String(countAtraso)} sub="passivos"
          bg="var(--neg-tint)" border="rgba(185,28,28,0.20)" labelColor="var(--neg)" valueColor="var(--neg)"
        />
      </div>

      {/* ── Tabela ── */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--divider-soft)', fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', fontFamily: font }}>
          Passivo Intermediários
        </div>
        <div style={{ overflowY: 'auto', overflowX: 'auto', maxHeight: 'calc(100vh - 420px)' }}>
          <table style={{ tableLayout: 'auto', width: '100%' }}>
            <thead>
              <tr>
                <th style={th} onClick={() => handleSort('intermediary_name')}>Intermediário<SortIcon active={sortField==='intermediary_name'} dir={sortDir} /></th>
                <th style={th} onClick={() => handleSort('atleta')}>Atleta<SortIcon active={sortField==='atleta'} dir={sortDir} /></th>
                <th style={th}>Descrição</th>
                <th style={th} onClick={() => handleSort('direction')}>Direção<SortIcon active={sortField==='direction'} dir={sortDir} /></th>
                <th style={{ ...th, textAlign: 'right' }} onClick={() => handleSort('amount')}>Valor<SortIcon active={sortField==='amount'} dir={sortDir} /></th>
                <th style={th} onClick={() => handleSort('currency')}>Moeda<SortIcon active={sortField==='currency'} dir={sortDir} /></th>
                <th style={th} onClick={() => handleSort('due_date')}>Vencimento<SortIcon active={sortField==='due_date'} dir={sortDir} /></th>
                <th style={{ ...th, textAlign: 'center' }}>Cond.</th>
                <th style={th}>Condição</th>
                <th style={th}>Teor da Multa</th>
                <th style={th} onClick={() => handleSort('settled_date')}>Data Liquidação<SortIcon active={sortField==='settled_date'} dir={sortDir} /></th>
                <th style={th} onClick={() => handleSort('status')}>Status<SortIcon active={sortField==='status'} dir={sortDir} /></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={12} style={{ ...td, textAlign: 'center', color: '#bbb', padding: 32 }}>Carregando…</td></tr>
              )}
              {!loading && liabilities.length === 0 && (
                <tr><td colSpan={12} style={{ ...td, textAlign: 'center', color: '#bbb', padding: 32 }}>Nenhum passivo de intermediário cadastrado.</td></tr>
              )}
              {!loading && liabilities.length > 0 && filtrados.length === 0 && (
                <tr><td colSpan={12} style={{ ...td, textAlign: 'center', color: '#bbb', padding: 32 }}>Nenhum registro encontrado.</td></tr>
              )}
              {sorted.map(p => {
                const atrasado = p.status === 'EM_ATRASO' || isOverdue(p.due_date, p.status)
                return (
                  <tr key={p.id} style={{ background: atrasado ? 'var(--row-late-bg)' : undefined }}>
                    <td style={td}>{p.intermediary_name}</td>
                    <td style={td}>{athleteById.get(p.athlete_id) ?? '—'}</td>
                    <td style={td}>{p.description || '—'}</td>
                    <td style={td}>{LIABILITY_DIRECTION_LABELS[p.direction]}</td>
                    <td style={{ ...tdr, fontWeight: 600 }}>{fmtCurrencyShort(p.amount, p.currency)}</td>
                    <td style={td}>{p.currency}</td>
                    <td style={td}>{fmtDate(p.due_date)}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{p.conditional ? 'Sim' : 'Não'}</td>
                    <td style={td}>{p.condition_description || '—'}</td>
                    <td style={td}>{p.penalty_terms || '—'}</td>
                    <td style={td}>{p.settled_date ? fmtDate(p.settled_date) : '—'}</td>
                    <td style={td}><StatusBadge status={p.status} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modal Novo Passivo ── */}
      {modalOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(26,20,16,0.80)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24,
        }}>
          <div style={{
            background: 'var(--cream-page, #f9f7f2)', borderRadius: 14,
            width: '100%', maxWidth: 640, maxHeight: '90vh',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            boxShadow: '0 24px 64px rgba(0,0,0,0.40)',
          }}>
            <div style={{ background: '#1a1410', padding: '18px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: '1.3rem', fontWeight: 700, color: '#f5f2ec' }}>Novo Passivo — Intermediário</div>
              <button onClick={() => setModalOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(243,238,226,0.45)', cursor: 'pointer', fontSize: 22, lineHeight: 1 }}>✕</button>
            </div>

            <div style={{ flex: 1, overflow: 'auto', padding: '20px 28px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="Atleta *" full>
                <select value={formAthlete} onChange={e => setFormAthlete(e.target.value)} style={inputStyle}>
                  <option value="">— Selecione —</option>
                  {athletes.map(a => <option key={a.id} value={a.id}>{athleteName(a)}</option>)}
                </select>
              </Field>

              <Field label="Intermediário *" full>
                <input value={form.intermediary_name} onChange={e => setForm(f => ({ ...f, intermediary_name: e.target.value }))} style={inputStyle} />
              </Field>

              <Field label="Direção">
                <select value={form.direction} onChange={e => setForm(f => ({ ...f, direction: e.target.value as LiabilityDirection }))} style={inputStyle}>
                  {DIRECTIONS.map(d => <option key={d} value={d}>{LIABILITY_DIRECTION_LABELS[d]}</option>)}
                </select>
              </Field>

              <Field label="Status">
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as LiabilityStatus }))} style={inputStyle}>
                  {STATUSES.map(s => <option key={s} value={s}>{LIABILITY_STATUS_LABELS[s]}</option>)}
                </select>
              </Field>

              <Field label="Valor">
                <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: Number(e.target.value) }))} style={inputStyle} />
              </Field>

              <Field label="Moeda">
                <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value as Currency }))} style={inputStyle}>
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>

              <Field label="Vencimento">
                <input type="date" value={form.due_date ?? ''} onChange={e => setForm(f => ({ ...f, due_date: e.target.value || null }))} style={inputStyle} />
              </Field>

              <Field label="Condicional">
                <select value={form.conditional ? '1' : '0'} onChange={e => setForm(f => ({ ...f, conditional: e.target.value === '1' }))} style={inputStyle}>
                  <option value="0">Não</option>
                  <option value="1">Sim</option>
                </select>
              </Field>

              <Field label="Descrição da Condição" full>
                <input value={form.condition_description} onChange={e => setForm(f => ({ ...f, condition_description: e.target.value }))} style={inputStyle} disabled={!form.conditional} />
              </Field>

              <Field label="Teor da Multa" full>
                <input value={form.penalty_terms} onChange={e => setForm(f => ({ ...f, penalty_terms: e.target.value }))} style={inputStyle} />
              </Field>

              <Field label="Descrição" full>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={inputStyle} />
              </Field>

              <Field label="Observações" full>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ ...inputStyle, minHeight: 56, resize: 'vertical' }} />
              </Field>
            </div>

            <div style={{ padding: '16px 28px', borderTop: '1px solid #e0dbd0', display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0, background: '#f0ede6' }}>
              <button onClick={() => setModalOpen(false)} style={modalBtn('transparent', '#888', '#ccc8c0')}>Cancelar</button>
              <button
                onClick={handleCreate}
                disabled={saving || !formAthlete || !form.intermediary_name.trim()}
                style={{ ...modalBtn('#1a1410', '#dcc89a'), opacity: (saving || !formAthlete || !form.intermediary_name.trim()) ? 0.5 : 1 }}
              >
                {saving ? 'Salvando…' : 'Criar Passivo'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', fontSize: 12, padding: '6px 8px', fontFamily: font,
  border: '1px solid #d8d2c6', borderRadius: 6, background: '#fff',
}

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted, #6b6258)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, fontFamily: font }}>{label}</div>
      {children}
    </div>
  )
}

function modalBtn(bg: string, color: string, border?: string): React.CSSProperties {
  return {
    background: bg, color, border: border ? `1px solid ${border}` : 'none',
    borderRadius: 999, padding: '8px 18px', fontFamily: fontLabel,
    fontSize: 10, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer',
  }
}

import { useState, useMemo, useEffect } from 'react'
import PageHero from '../components/PageHero'
import { default as SheetIO } from '../components/SheetIO'
import { COLS_CLUB_LIABILITIES } from '../lib/xlsx-utils'
import {
  fetchAllClubLiabilities, fetchAthletes,
  createClubLiability,
} from '../lib/athleteQueries'
import type {
  ClubLiability, Athlete, NewClubLiabilityInput,
  LiabilityDirection, LiabilityStatus, Currency,
} from '../types/athlete-system'
import { LIABILITY_STATUS_LABELS, LIABILITY_DIRECTION_LABELS } from '../types/athlete-system'
import { fmtCurrencyShort, fmtDate, isOverdue } from '../lib/format'

const font = "'Inter', system-ui, sans-serif"
const fontLabel = "'IBM Plex Mono', 'JetBrains Mono', monospace"
const fontData = "'JetBrains Mono', ui-monospace, monospace"

// Conversão aproximada p/ BRL — SOMENTE para o KPI de valor total (moedas mistas).
const APPROX_BRL: Record<string, number> = { BRL: 1, EUR: 6.10, USD: 5.55, GBP: 7.10 }
function approxBRL(value: number, currency: string): number {
  return value * (APPROX_BRL[currency] ?? 1)
}

const CURRENCIES: Currency[] = ['BRL', 'EUR', 'USD', 'GBP']

function StatusBadge({ status }: { status: LiabilityStatus }) {
  const palette: Record<LiabilityStatus, { bg: string; color: string }> = {
    PENDENTE:  { bg: 'var(--warn-tint)', color: 'var(--warn)' },
    PAGA:      { bg: 'var(--pos-tint)', color: 'var(--pos)' },
    EM_ATRASO: { bg: 'var(--neg-tint)', color: 'var(--neg)' },
    CANCELADA: { bg: '#f0f0f0', color: '#8a8a8a' },
  }
  const p = palette[status]
  return (
    <span style={{
      background: p.bg, color: p.color,
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

const TODOS = 'Todos'

const emptyForm: NewClubLiabilityInput = {
  club_name: '',
  description: '',
  direction: 'A_PAGAR',
  amount: 0,
  currency: 'BRL',
  due_date: null,
  conditional: false,
  condition_description: '',
  solidarity: false,
  status: 'PENDENTE',
  notes: '',
}

function coerceBool(v: string | undefined): boolean {
  return v === 'true' || v === 'TRUE' || v === '1'
}

export default function PageClubes() {
  const [liabilities, setLiabilities] = useState<ClubLiability[]>([])
  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [loading, setLoading] = useState(true)

  const athleteMap = useMemo(() => {
    const m = new Map<string, Athlete>()
    athletes.forEach(a => m.set(a.id, a))
    return m
  }, [athletes])

  async function loadAll() {
    setLoading(true)
    try {
      const [libs, atls] = await Promise.all([fetchAllClubLiabilities(), fetchAthletes()])
      setLiabilities(libs)
      setAthletes(atls)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [])

  // ── Sorting ──
  const [sortField, setSortField] = useState<string>('')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const handleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  // ── Filters ──
  const [clubeFiltro, setClubeFiltro] = useState(TODOS)
  const [atletaFiltro, setAtletaFiltro] = useState(TODOS)
  const [condFiltro, setCondFiltro] = useState<'Todos' | 'Certo' | 'Condicional'>('Todos')

  const clubes = useMemo(() =>
    [TODOS, ...Array.from(new Set(liabilities.map(l => l.club_name))).sort()], [liabilities])
  const atletasOpts = useMemo(() =>
    [TODOS, ...athletes.map(a => a.short_name || a.full_name)], [athletes])

  const athleteLabel = (id: string) => {
    const a = athleteMap.get(id)
    return a ? (a.short_name || a.full_name) : '—'
  }

  const filtrados = useMemo(() => liabilities.filter(l => {
    const okClube = clubeFiltro === TODOS || l.club_name === clubeFiltro
    const okAtl = atletaFiltro === TODOS || athleteLabel(l.athlete_id) === atletaFiltro
    const okCond = condFiltro === 'Todos' || (condFiltro === 'Certo' ? !l.conditional : l.conditional)
    return okClube && okAtl && okCond
  }), [liabilities, clubeFiltro, atletaFiltro, condFiltro, athleteMap])

  const sorted = useMemo(() => {
    return [...filtrados].sort((a, b) => {
      let va: string | number = 0, vb: string | number = 0
      if (sortField === 'club_name') { va = a.club_name; vb = b.club_name }
      else if (sortField === 'atleta') { va = athleteLabel(a.athlete_id); vb = athleteLabel(b.athlete_id) }
      else if (sortField === 'direction') { va = a.direction; vb = b.direction }
      else if (sortField === 'amount') { va = a.amount; vb = b.amount }
      else if (sortField === 'due_date') { va = a.due_date ?? ''; vb = b.due_date ?? '' }
      else if (sortField === 'status') { va = a.status; vb = b.status }
      else if (sortField === 'settled_date') { va = a.settled_date ?? ''; vb = b.settled_date ?? '' }
      else return 0
      const cmp = va < vb ? -1 : va > vb ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [filtrados, sortField, sortDir, athleteMap])

  // ── KPIs ──
  const totalBRLApprox = filtrados.reduce((s, l) => s + approxBRL(l.amount, l.currency), 0)
  const countAPagar = filtrados.filter(l => l.direction === 'A_PAGAR').length
  const countAReceber = filtrados.filter(l => l.direction === 'A_RECEBER').length
  const countAtraso = filtrados.filter(l => l.status === 'EM_ATRASO' || isOverdue(l.due_date, l.status)).length

  const clubeSelecionado = clubeFiltro !== TODOS ? clubeFiltro : null

  // ── Modal ──
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selAtleta, setSelAtleta] = useState('')
  const [form, setForm] = useState<NewClubLiabilityInput>(emptyForm)

  function openModal() {
    setForm(emptyForm)
    setSelAtleta('')
    setModalOpen(true)
  }

  async function handleSave() {
    if (!selAtleta || !form.club_name.trim()) return
    setSaving(true)
    try {
      await createClubLiability(selAtleta, form)
      setModalOpen(false)
      await loadAll()
    } finally {
      setSaving(false)
    }
  }

  async function handleImport(sheets: Record<string, Record<string, string>[]>) {
    const rows = sheets[Object.keys(sheets)[0]] ?? []
    for (const r of rows) {
      const atletaId = r['Atleta ID']
      if (!atletaId) continue
      const input: NewClubLiabilityInput = {
        club_name: r['Clube'] ?? '',
        description: r['Descrição'] ?? '',
        direction: (r['Direção'] as LiabilityDirection) || 'A_PAGAR',
        amount: Number(r['Valor']) || 0,
        currency: (r['Moeda'] as Currency) || 'BRL',
        due_date: r['Vencimento'] ? r['Vencimento'] : null,
        conditional: coerceBool(r['Condicional']),
        condition_description: r['Condição'] ?? '',
        solidarity: coerceBool(r['Solidariedade']),
        status: (r['Status'] as LiabilityStatus) || 'PENDENTE',
        notes: r['Observações'] ?? '',
      }
      await createClubLiability(atletaId, input)
    }
    await loadAll()
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

  return (
    <div style={{ padding: '12px 16px', maxWidth: 1600, margin: '0 auto', fontFamily: font }}>

      <PageHero title="Clubes Credores" subtitle="PASSIVO — CLUBES">
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
          exportFilename="passivos-clubes.xlsx"
          exportSheets={[{ name: 'Passivos_Clubes', cols: COLS_CLUB_LIABILITIES, rows: liabilities as unknown as Record<string, unknown>[] }]}
          onImport={handleImport}
        />
      </PageHero>

      {/* ── Topo: Filtros + Display Clube + Valor Total ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 200px', gap: 12, marginBottom: 12, alignItems: 'stretch' }}>

        {/* Filtros */}
        <div className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, fontFamily: font }}>Clube</div>
            <select value={clubeFiltro} onChange={e => setClubeFiltro(e.target.value)}
              style={{ width: '100%', fontSize: 12, padding: '5px 8px' }}>
              {clubes.map(c => <option key={c}>{c}</option>)}
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

        {/* Display do Clube */}
        <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 32px', gap: 20 }}>
          {clubeSelecionado ? (
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: font, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>Clube Credor</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', fontFamily: font, lineHeight: 1.1 }}>{clubeSelecionado}</div>
            </div>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: font, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Clube Credor</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-faint)', fontFamily: font }}>—</div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: font, marginTop: 4 }}>Selecione um clube para exibir</div>
            </div>
          )}
        </div>

        {/* Valor Total */}
        <div className="card" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'center', borderTop: '4px solid #111' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: font }}>Valor Total (R$)</div>
          <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--text-primary)', marginTop: 10, fontFamily: font, lineHeight: 1 }}>{fmtCurrencyShort(totalBRLApprox, 'BRL')}</div>
          <div style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: font, marginTop: 6 }}>Aproximado (moedas convertidas)</div>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 14 }}>
        <KpiCard
          label="Valor Total (aprox.)" value={fmtCurrencyShort(totalBRLApprox, 'BRL')}
          bg="var(--cream-canvas)" border="var(--divider-strong)" labelColor="var(--ink-secondary)" valueColor="var(--ink-primary)"
          footnote="*Conversão aproximada p/ BRL"
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
          Passivo Clubes
        </div>
        <div style={{ overflowY: 'auto', overflowX: 'hidden', maxHeight: 'calc(100vh - 420px)' }}>
          <table style={{ tableLayout: 'auto', width: '100%' }}>
            <thead>
              <tr>
                <th style={th} onClick={() => handleSort('club_name')}>Clube<SortIcon active={sortField==='club_name'} dir={sortDir} /></th>
                <th style={th} onClick={() => handleSort('atleta')}>Atleta<SortIcon active={sortField==='atleta'} dir={sortDir} /></th>
                <th style={th}>Descrição</th>
                <th style={th} onClick={() => handleSort('direction')}>Direção<SortIcon active={sortField==='direction'} dir={sortDir} /></th>
                <th style={{ ...th, textAlign: 'right' }} onClick={() => handleSort('amount')}>Valor<SortIcon active={sortField==='amount'} dir={sortDir} /></th>
                <th style={{ ...th, textAlign: 'center' }}>Cond.</th>
                <th style={th}>Condição</th>
                <th style={{ ...th, textAlign: 'center' }}>Solid.</th>
                <th style={th} onClick={() => handleSort('due_date')}>Vencimento<SortIcon active={sortField==='due_date'} dir={sortDir} /></th>
                <th style={th} onClick={() => handleSort('settled_date')}>Data Liquidação<SortIcon active={sortField==='settled_date'} dir={sortDir} /></th>
                <th style={th} onClick={() => handleSort('status')}>Status<SortIcon active={sortField==='status'} dir={sortDir} /></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={11} style={{ ...td, textAlign: 'center', color: '#bbb', padding: 32 }}>Carregando…</td></tr>
              )}
              {!loading && filtrados.length === 0 && (
                <tr><td colSpan={11} style={{ ...td, textAlign: 'center', color: '#bbb', padding: 32 }}>Nenhum passivo cadastrado.</td></tr>
              )}
              {!loading && sorted.map(l => {
                const late = l.status === 'EM_ATRASO' || isOverdue(l.due_date, l.status)
                return (
                  <tr key={l.id} style={{ background: late ? 'var(--row-late-bg)' : undefined }}>
                    <td style={td}>{l.club_name}</td>
                    <td style={td}>{athleteLabel(l.athlete_id)}</td>
                    <td style={td}>{l.description || '—'}</td>
                    <td style={td}>{LIABILITY_DIRECTION_LABELS[l.direction]}</td>
                    <td style={{ ...tdr, fontWeight: 600 }}>{fmtCurrencyShort(l.amount, l.currency)}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{l.conditional ? 'Sim' : 'Não'}</td>
                    <td style={td}>{l.condition_description || '—'}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{l.solidarity ? 'Sim' : 'Não'}</td>
                    <td style={td}>{fmtDate(l.due_date)}</td>
                    <td style={td}>{fmtDate(l.settled_date)}</td>
                    <td style={td}><StatusBadge status={l.status} /></td>
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
          <div className="card" style={{
            background: 'var(--cream-page, #f9f7f2)', borderRadius: 14,
            width: '100%', maxWidth: 640, maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
            boxShadow: '0 24px 64px rgba(0,0,0,0.40)',
          }}>
            <div style={{ background: '#1a1410', padding: '18px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontFamily: fontLabel, fontSize: 9, color: 'rgba(243,238,226,0.45)', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 6 }}>Novo Passivo</div>
                <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: '1.3rem', fontWeight: 700, color: '#f5f2ec', lineHeight: 1.1 }}>Passivo com Clube</div>
              </div>
              <button onClick={() => setModalOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(243,238,226,0.45)', cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: 4 }}>✕</button>
            </div>

            <div style={{ flex: 1, overflow: 'auto', padding: '20px 28px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, fontFamily: font }}>
              <Field label="Atleta *" full>
                <select value={selAtleta} onChange={e => setSelAtleta(e.target.value)} style={inputStyle}>
                  <option value="">Selecione o atleta…</option>
                  {athletes.map(a => <option key={a.id} value={a.id}>{a.short_name || a.full_name}</option>)}
                </select>
              </Field>

              <Field label="Clube *" full>
                <input value={form.club_name} onChange={e => setForm(f => ({ ...f, club_name: e.target.value }))} style={inputStyle} />
              </Field>

              <Field label="Direção">
                <select value={form.direction} onChange={e => setForm(f => ({ ...f, direction: e.target.value as LiabilityDirection }))} style={inputStyle}>
                  {(['A_PAGAR', 'A_RECEBER'] as LiabilityDirection[]).map(d => <option key={d} value={d}>{LIABILITY_DIRECTION_LABELS[d]}</option>)}
                </select>
              </Field>

              <Field label="Status">
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as LiabilityStatus }))} style={inputStyle}>
                  {(['PENDENTE', 'PAGA', 'EM_ATRASO', 'CANCELADA'] as LiabilityStatus[]).map(s => <option key={s} value={s}>{LIABILITY_STATUS_LABELS[s]}</option>)}
                </select>
              </Field>

              <Field label="Valor">
                <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: Number(e.target.value) || 0 }))} style={inputStyle} />
              </Field>

              <Field label="Moeda">
                <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value as Currency }))} style={inputStyle}>
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>

              <Field label="Vencimento">
                <input type="date" value={form.due_date ?? ''} onChange={e => setForm(f => ({ ...f, due_date: e.target.value || null }))} style={inputStyle} />
              </Field>

              <Field label="Solidariedade">
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontFamily: font }}>
                  <input type="checkbox" checked={form.solidarity} onChange={e => setForm(f => ({ ...f, solidarity: e.target.checked }))} />
                  Solidária
                </label>
              </Field>

              <Field label="Condicional" full>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontFamily: font }}>
                  <input type="checkbox" checked={form.conditional} onChange={e => setForm(f => ({ ...f, conditional: e.target.checked }))} />
                  Passivo condicional
                </label>
              </Field>

              {form.conditional && (
                <Field label="Descrição da Condição" full>
                  <input value={form.condition_description} onChange={e => setForm(f => ({ ...f, condition_description: e.target.value }))} style={inputStyle} />
                </Field>
              )}

              <Field label="Descrição" full>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={inputStyle} />
              </Field>

              <Field label="Observações" full>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} />
              </Field>
            </div>

            <div style={{ padding: '16px 28px', borderTop: '1px solid #e0dbd0', display: 'flex', gap: 10, justifyContent: 'flex-end', background: '#f0ede6' }}>
              <button onClick={() => setModalOpen(false)} style={btn('transparent', '#888', '#ccc8c0')}>Cancelar</button>
              <button
                onClick={handleSave}
                disabled={saving || !selAtleta || !form.club_name.trim()}
                style={{ ...btn('#1a1410', '#dcc89a'), opacity: (saving || !selAtleta || !form.club_name.trim()) ? 0.5 : 1 }}
              >
                {saving ? 'Salvando…' : 'Salvar'}
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
  border: '1px solid var(--divider-strong, #d8d2c6)', borderRadius: 6, boxSizing: 'border-box',
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, fontFamily: font }}>{label}</div>
      {children}
    </div>
  )
}

function btn(bg: string, color: string, border?: string): React.CSSProperties {
  return {
    background: bg, color, border: border ? `1px solid ${border}` : 'none',
    borderRadius: 999, padding: '8px 18px', fontFamily: fontLabel, fontSize: 10, fontWeight: 500,
    letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer',
  }
}

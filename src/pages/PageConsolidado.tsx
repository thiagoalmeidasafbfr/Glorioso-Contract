import { useState, useMemo, useEffect, useCallback } from 'react'
import PageHero from '../components/PageHero'
import SheetIO from '../components/SheetIO'
import RefLink from '../components/RefLink'
import { fetchAthletes, fetchAllContracts, fetchAllSalaryTriggers, fetchClubs } from '../lib/athleteQueries'
import { effectiveSalary } from '../lib/salary'
import { fmtCurrencyShort, fmtDate } from '../lib/format'
import { buildNameIndex, norm, resultMessage } from '../lib/importHelpers'
import { importConsolidado } from '../lib/reportPorters'
import type { Contract, AthleteStatus, Currency } from '../types/athlete-system'

const font = "'Inter', system-ui, sans-serif"
const fontLabel = "'IBM Plex Mono', 'JetBrains Mono', monospace"
const fontData = "'JetBrains Mono', ui-monospace, monospace"

// Conversão aproximada p/ BRL (somente exibição do total consolidado).
const APPROX_BRL: Record<Currency, number> = { BRL: 1, EUR: 6.10, USD: 5.55, GBP: 7.10 }

const STATUS_LABELS: Record<AthleteStatus, string> = {
  ATIVO: 'Ativo',
  EMPRESTADO: 'Emprestado',
  VENDIDO: 'Vendido',
  DESLIGADO: 'Desligado',
}

const STATUS_OPTS: (AthleteStatus | 'Todos')[] = ['Todos', 'ATIVO', 'EMPRESTADO', 'VENDIDO', 'DESLIGADO']

// Linha consolidada por atleta (também usada como base do export).
interface Row {
  id: string
  short_name: string
  full_name: string
  position: string | null
  current_status: AthleteStatus
  counterpart_club: string
  start_date: string | null
  end_date: string | null
  base_salary: number | null
  salary_currency: Currency
  effective_salary: number | null
  goal_kicked: boolean
}

type SortField =
  | 'short_name' | 'position' | 'current_status' | 'counterpart_club'
  | 'start_date' | 'end_date' | 'base_salary' | 'effective_salary'

function StripKpi({ label, value, first }: { label: string; value: string; first?: boolean }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      padding: '0 20px',
      borderLeft: first ? 'none' : '1px solid rgba(255,255,255,0.12)',
      minWidth: 0, flexShrink: 0,
    }}>
      <div style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 0.6, fontFamily: font, whiteSpace: 'nowrap' }}>
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginTop: 2, fontFamily: font, whiteSpace: 'nowrap' }}>
        {value}
      </div>
    </div>
  )
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <span style={{ opacity: 0.25, fontSize: 9, marginLeft: 2 }}>↕</span>
  return <span style={{ fontSize: 9, marginLeft: 2 }}>{dir === 'asc' ? '↑' : '↓'}</span>
}

// Contrato mais relevante do atleta: o ATIVO com start_date mais recente;
// senão, o de start_date mais recente independentemente do status.
function pickContract(contracts: Contract[]): Contract | null {
  if (contracts.length === 0) return null
  const byStart = (a: Contract, b: Contract) => (b.start_date ?? '').localeCompare(a.start_date ?? '')
  const ativos = contracts.filter(c => c.status === 'ATIVO').sort(byStart)
  if (ativos.length > 0) return ativos[0]
  return [...contracts].sort(byStart)[0]
}

export default function PageConsolidado() {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<Row[]>([])

  const [sortField, setSortField] = useState<SortField>('short_name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const [statusFiltro, setStatusFiltro] = useState<AthleteStatus | 'Todos'>('Todos')
  const [posicaoFiltro, setPosicaoFiltro] = useState('Todos')
  const [clubIdx, setClubIdx] = useState<Map<string, string>>(new Map())
  const [importMsg, setImportMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [athletes, contracts, triggers, clubs] = await Promise.all([
      fetchAthletes(), fetchAllContracts(), fetchAllSalaryTriggers(), fetchClubs(),
    ])
    setClubIdx(buildNameIndex(clubs))
    const built = athletes.map<Row>(a => {
          const own = contracts.filter(c => c.athlete_id === a.id)
          const contract = pickContract(own)
          if (!contract) {
            return {
              id: a.id, short_name: a.short_name, full_name: a.full_name,
              position: a.position, current_status: a.current_status,
              counterpart_club: '—', start_date: null, end_date: null,
              base_salary: null, salary_currency: 'BRL',
              effective_salary: null, goal_kicked: false,
            }
          }
          const relevant = triggers.filter(
            t => t.athlete_id === a.id && (t.contract_id === contract.id || t.contract_id === null),
          )
          const eff = effectiveSalary(contract, relevant)
          return {
            id: a.id,
            short_name: a.short_name,
            full_name: a.full_name,
            position: a.position,
            current_status: a.current_status,
            counterpart_club: contract.counterpart_club,
            start_date: contract.start_date,
            end_date: contract.end_date,
            base_salary: contract.base_salary,
            salary_currency: eff.currency,
            effective_salary: eff.amount,
            goal_kicked: eff.source !== null && eff.amount !== contract.base_salary,
          }
        })
        setRows(built)
        setLoading(false)
  }, [])

  useEffect(() => { let alive = true; load().catch(() => { if (alive) setLoading(false) }); return () => { alive = false } }, [load])

  async function handleImport(sheets: Record<string, Record<string, string>[]>) {
    const rowsIn = sheets[Object.keys(sheets)[0]] ?? []
    setImportMsg('Importando...')
    try {
      const res = await importConsolidado(rowsIn)
      setImportMsg(resultMessage(res))
      await load()
    } catch (err) {
      setImportMsg(`Erro: ${(err as Error).message}`)
    }
  }

  const posicoes = useMemo(() => {
    const set = new Set<string>()
    rows.forEach(r => { if (r.position) set.add(r.position) })
    return ['Todos', ...Array.from(set).sort()]
  }, [rows])

  const filtrados = useMemo(() => rows.filter(r => {
    const okStatus = statusFiltro === 'Todos' || r.current_status === statusFiltro
    const okPos = posicaoFiltro === 'Todos' || r.position === posicaoFiltro
    return okStatus && okPos
  }), [rows, statusFiltro, posicaoFiltro])

  const sorted = useMemo(() => {
    return [...filtrados].sort((a, b) => {
      const va = a[sortField]
      const vb = b[sortField]
      const na = va === null || va === undefined ? (typeof vb === 'number' ? -Infinity : '') : va
      const nb = vb === null || vb === undefined ? (typeof va === 'number' ? -Infinity : '') : vb
      const cmp = na < nb ? -1 : na > nb ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [filtrados, sortField, sortDir])

  // Strip: contagens + soma aproximada em BRL dos salários efetivos.
  const nTotal = filtrados.length
  const nAtivos = filtrados.filter(r => r.current_status === 'ATIVO').length
  const nEmprestados = filtrados.filter(r => r.current_status === 'EMPRESTADO').length
  const nVendidos = filtrados.filter(r => r.current_status === 'VENDIDO').length
  const somaBRL = filtrados.reduce(
    (s, r) => s + (r.effective_salary ?? 0) * (APPROX_BRL[r.salary_currency] ?? 1), 0,
  )

  const th: React.CSSProperties = {
    padding: '9px 10px', fontSize: 9, fontWeight: 500, textTransform: 'uppercase',
    color: 'var(--table-header-color)', background: 'var(--table-header-bg)', borderBottom: '1px solid var(--divider-strong)',
    fontFamily: fontLabel, letterSpacing: '0.14em', whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1,
    cursor: 'pointer', userSelect: 'none',
  }
  const td: React.CSSProperties = {
    padding: '8px 10px', fontSize: 12, color: 'var(--text-primary)', fontFamily: fontData,
    whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
  }
  const tdr: React.CSSProperties = { ...td, textAlign: 'right' }

  return (
    <div style={{ padding: '12px 16px', maxWidth: 1600, margin: '0 auto', fontFamily: font }}>

      <PageHero title="Consolidado" subtitle="VISÃO GERAL DO ELENCO">
        <SheetIO
          exportFilename="consolidado-elenco.xlsx"
          exportSheets={[{
            name: 'Consolidado',
            cols: [
              { key: 'id', header: 'ID' },
              { key: 'short_name', header: 'Nome' },
              { key: 'position', header: 'Posição' },
              { key: 'current_status', header: 'Status' },
              { key: 'counterpart_club', header: 'Clube' },
              { key: 'start_date', header: 'Início' },
              { key: 'end_date', header: 'Fim' },
              { key: 'base_salary', header: 'Salário Base' },
              { key: 'salary_currency', header: 'Moeda' },
              { key: 'effective_salary', header: 'Salário Efetivo' },
            ],
            rows: rows.map(r => ({
              id: r.id,
              short_name: r.short_name,
              position: r.position ?? '',
              current_status: r.current_status,
              counterpart_club: r.counterpart_club,
              start_date: r.start_date ?? '',
              end_date: r.end_date ?? '',
              base_salary: r.base_salary,
              salary_currency: r.salary_currency,
              effective_salary: r.effective_salary,
            })),
          }]}
          onImport={handleImport}
        />
      </PageHero>
      {importMsg && (
        <div style={{ fontSize: 11, fontFamily: fontLabel, color: importMsg.startsWith('Erro') ? 'var(--neg)' : 'var(--gold-deep)', marginBottom: 10 }}>{importMsg}</div>
      )}

      {/* ── Filtros + Strip KPIs ── */}
      <div style={{
        background: 'var(--ink-primary)', borderRadius: 10, marginBottom: 14,
        display: 'flex', alignItems: 'center', padding: '12px 16px', gap: 0, flexWrap: 'wrap',
      }}>
        {/* Filtros */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingRight: 20, borderRight: '1px solid rgba(255,255,255,0.12)', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', marginBottom: 3, fontFamily: font }}>Status</div>
            <select value={statusFiltro} onChange={e => setStatusFiltro(e.target.value as typeof statusFiltro)}
              style={{ background: '#222', color: '#fff', border: '1px solid #444', borderRadius: 5, padding: '4px 8px', fontSize: 12, fontFamily: font, width: 130 }}>
              {STATUS_OPTS.map(s => (
                <option key={s} value={s} style={{ background: '#222' }}>
                  {s === 'Todos' ? 'Todos' : STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', marginBottom: 3, fontFamily: font }}>Posição</div>
            <select value={posicaoFiltro} onChange={e => setPosicaoFiltro(e.target.value)}
              style={{ background: '#222', color: '#fff', border: '1px solid #444', borderRadius: 5, padding: '4px 8px', fontSize: 12, fontFamily: font, width: 150 }}>
              {posicoes.map(p => <option key={p} value={p} style={{ background: '#222' }}>{p}</option>)}
            </select>
          </div>
        </div>

        {/* KPIs */}
        <StripKpi label="Total Atletas" value={String(nTotal)} />
        <StripKpi label="Ativos" value={String(nAtivos)} />
        <StripKpi label="Emprestados" value={String(nEmprestados)} />
        <StripKpi label="Vendidos" value={String(nVendidos)} />
        <StripKpi label="Salários Efetivos (~BRL)" value={fmtCurrencyShort(somaBRL, 'BRL')} />

        <div style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.6)', fontSize: 11, paddingLeft: 16, fontFamily: font, flexShrink: 0 }}>
          Total aproximado em BRL (câmbio de referência)
        </div>
      </div>

      {/* ── Tabela ── */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--divider)', fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', fontFamily: font, letterSpacing: 0.1 }}>
          Consolidado Atletas
        </div>
        <div style={{ overflowY: 'auto', overflowX: 'auto', maxHeight: 'calc(100vh - 260px)' }}>
          <table style={{ tableLayout: 'auto', width: '100%' }}>
            <thead>
              <tr>
                <th style={th} onClick={() => handleSort('short_name')}>Nome<SortIcon active={sortField === 'short_name'} dir={sortDir} /></th>
                <th style={th} onClick={() => handleSort('position')}>Posição<SortIcon active={sortField === 'position'} dir={sortDir} /></th>
                <th style={th} onClick={() => handleSort('current_status')}>Status<SortIcon active={sortField === 'current_status'} dir={sortDir} /></th>
                <th style={th} onClick={() => handleSort('counterpart_club')}>Clube Atual<SortIcon active={sortField === 'counterpart_club'} dir={sortDir} /></th>
                <th style={th} onClick={() => handleSort('start_date')}>Início<SortIcon active={sortField === 'start_date'} dir={sortDir} /></th>
                <th style={th} onClick={() => handleSort('end_date')}>Fim<SortIcon active={sortField === 'end_date'} dir={sortDir} /></th>
                <th style={{ ...th, textAlign: 'right' }} onClick={() => handleSort('base_salary')}>Salário Base<SortIcon active={sortField === 'base_salary'} dir={sortDir} /></th>
                <th style={{ ...th, textAlign: 'right', background: 'rgba(190,140,74,0.12)', color: 'var(--gold-deep)' }} onClick={() => handleSort('effective_salary')}>Salário Efetivo<SortIcon active={sortField === 'effective_salary'} dir={sortDir} /></th>
                <th style={th}>Moeda</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: '#bbb', padding: 32 }}>Carregando…</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: '#bbb', padding: 32 }}>Nenhum atleta cadastrado.</td></tr>
              )}
              {!loading && rows.length > 0 && filtrados.length === 0 && (
                <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: '#bbb', padding: 32 }}>Nenhum atleta encontrado com os filtros atuais.</td></tr>
              )}
              {!loading && sorted.map(r => (
                <tr key={r.id}>
                  <td style={{ ...td, fontWeight: 500 }}>
                    <RefLink to={`/atletas/${r.id}`} title={`Abrir ${r.short_name}`}>{r.short_name}</RefLink>
                  </td>
                  <td style={{ ...td, color: 'var(--text-secondary)' }}>{r.position ?? '—'}</td>
                  <td style={td}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 500, fontFamily: fontLabel,
                      textTransform: 'uppercase', letterSpacing: '0.10em',
                      background: r.current_status === 'ATIVO' ? 'var(--pos-tint)' : r.current_status === 'EMPRESTADO' ? 'var(--gold-tint)' : 'var(--neg-tint)',
                      color: r.current_status === 'ATIVO' ? 'var(--pos)' : r.current_status === 'EMPRESTADO' ? 'var(--gold-deep)' : 'var(--neg)',
                    }}>{STATUS_LABELS[r.current_status]}</span>
                  </td>
                  <td style={{ ...td, color: 'var(--text-secondary)' }}>
                    {(() => { const cid = clubIdx.get(norm(r.counterpart_club)); return cid ? <RefLink to={`/clubes/${cid}`} title={`Abrir ${r.counterpart_club}`}>{r.counterpart_club}</RefLink> : r.counterpart_club })()}
                  </td>
                  <td style={{ ...td, color: '#666' }}>{fmtDate(r.start_date)}</td>
                  <td style={{ ...td, color: '#666' }}>{fmtDate(r.end_date)}</td>
                  <td style={tdr}>{fmtCurrencyShort(r.base_salary, r.salary_currency)}</td>
                  <td style={{
                    ...tdr, fontWeight: 600,
                    background: r.goal_kicked ? 'rgba(190,140,74,0.14)' : 'transparent',
                    color: r.goal_kicked ? 'var(--gold-deep)' : 'var(--text-primary)',
                  }}>
                    {fmtCurrencyShort(r.effective_salary, r.salary_currency)}
                    {r.goal_kicked && <span title="Salário elevado por meta atingida" style={{ marginLeft: 4, fontSize: 9 }}>▲</span>}
                  </td>
                  <td style={{ ...td, color: 'var(--text-secondary)' }}>{r.salary_currency}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}

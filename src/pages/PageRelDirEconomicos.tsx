// src/pages/PageRelDirEconomicos.tsx
// Relatório consolidado de titularidade econômica: uma linha por atleta que
// expande em uma linha por detentor (Botafogo, clube parceiro, agente, atleta,
// terceiro). Sinaliza quando o total não fecha 100% (>100% erro de cadastro,
// <100% titularidade parcialmente vaga, o resto implicitamente Botafogo).

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchAthletes, fetchAllEconomicRights } from '../lib/athleteQueries'
import type { Athlete, EconomicRight, HolderType } from '../types/athlete-system'
import { HOLDER_TYPE_LABELS } from '../types/athlete-system'
import { exportWorkbook, type ColDef } from '../lib/xlsx-utils'
import PageHero from '../components/PageHero'
import RefLink from '../components/RefLink'
import { Icon, IconButton } from '../components/Icon'
import RowActions from '../components/RowActions'

interface HolderRow { holderType: HolderType; holderName: string; percentage: number }
interface AthleteRow {
  athlete: Athlete
  holders: HolderRow[]
  total: number
  status: 'FECHADO' | 'PARCIAL' | 'EXCEDIDO' | 'SEM_LANCAMENTO'
  bfrPct: number
}

const STATUS_STYLE: Record<AthleteRow['status'], { bg: string; fg: string; label: string }> = {
  FECHADO:        { bg: 'var(--pos-tint)',    fg: 'var(--pos)',            label: '100% fechado' },
  PARCIAL:        { bg: 'var(--warn-tint)',   fg: 'var(--warn)',           label: 'Parcial'      },
  EXCEDIDO:       { bg: 'var(--neg-tint)',    fg: 'var(--neg)',            label: 'Excede 100%'  },
  SEM_LANCAMENTO: { bg: 'var(--cream-inset)', fg: 'var(--text-muted)',     label: 'Sem lançamento' },
}

const HOLDER_COLOR: Record<HolderType, string> = {
  BFR:      'var(--pos)',
  CLUBE:    'var(--info)',
  AGENTE:   '#7a6244',
  ATLETA:   'var(--warn)',
  TERCEIRO: 'var(--text-muted)',
}

export default function PageRelDirEconomicos() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<AthleteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'Todos' | AthleteRow['status']>('Todos')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    const [athletes, rights] = await Promise.all([fetchAthletes(), fetchAllEconomicRights()])
    const byAth = new Map<string, EconomicRight[]>()
    for (const r of rights) {
      const arr = byAth.get(r.athlete_id); if (arr) arr.push(r); else byAth.set(r.athlete_id, [r])
    }
    const built: AthleteRow[] = athletes.map(a => {
      const list = (byAth.get(a.id) ?? []).slice()
        .sort((x, y) => y.percentage - x.percentage)
      const holders: HolderRow[] = list.map(r => ({
        holderType: r.holder_type,
        holderName: r.holder_name || HOLDER_TYPE_LABELS[r.holder_type],
        percentage: r.percentage,
      }))
      const total = holders.reduce((s, h) => s + h.percentage, 0)
      const bfrPct = holders.filter(h => h.holderType === 'BFR').reduce((s, h) => s + h.percentage, 0)
      const status: AthleteRow['status'] = holders.length === 0 ? 'SEM_LANCAMENTO'
        : total > 100.01 ? 'EXCEDIDO'
        : total < 99.99 ? 'PARCIAL'
        : 'FECHADO'
      return { athlete: a, holders, total, status, bfrPct }
    })
    // Botafogo primeiro (%), depois quem tem parceria (BFR<100), depois quem
    // ainda não tem lançamento.
    built.sort((a, b) => b.bfrPct - a.bfrPct || a.athlete.full_name.localeCompare(b.athlete.full_name))
    setRows(built)
    setLoading(false)
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial no mount
  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => rows.filter(r => {
    if (statusFilter !== 'Todos' && r.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      const inHolders = r.holders.some(h => h.holderName.toLowerCase().includes(q))
      if (![r.athlete.full_name, r.athlete.short_name ?? ''].some(v => v.toLowerCase().includes(q)) && !inHolders) return false
    }
    return true
  }), [rows, statusFilter, search])

  const stats = useMemo(() => ({
    atletas: filtered.length,
    fechado: filtered.filter(r => r.status === 'FECHADO').length,
    parcial: filtered.filter(r => r.status === 'PARCIAL').length,
    excedido: filtered.filter(r => r.status === 'EXCEDIDO').length,
    bfr100: filtered.filter(r => r.bfrPct >= 99.99).length,
  }), [filtered])

  function exportXlsx() {
    const cols: ColDef[] = [
      { key: 'atleta', header: 'Atleta' }, { key: 'detentor', header: 'Detentor' },
      { key: 'tipo', header: 'Tipo' }, { key: 'percentage', header: '%' },
    ]
    const flat: Record<string, unknown>[] = []
    for (const r of filtered) {
      if (r.holders.length === 0) {
        flat.push({ atleta: r.athlete.full_name, detentor: '(sem lançamento)', tipo: '—', percentage: 0 })
      } else {
        for (const h of r.holders) flat.push({
          atleta: r.athlete.full_name, detentor: h.holderName,
          tipo: HOLDER_TYPE_LABELS[h.holderType], percentage: h.percentage,
        })
      }
    }
    exportWorkbook([{ name: 'Direitos econômicos', cols, rows: flat }], 'relatorio-direitos-economicos.xlsx')
  }

  const toggle = (id: string) => setExpanded(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const expandAll   = () => setExpanded(new Set(filtered.filter(r => r.holders.length > 0).map(r => r.athlete.id)))
  const collapseAll = () => setExpanded(new Set())

  const th: React.CSSProperties = { padding: '9px 12px', fontSize: 9, fontWeight: 500, textTransform: 'uppercase', background: 'var(--tbl-head)', color: 'var(--ink-secondary)', borderBottom: '1px solid var(--divider-strong)', fontFamily: 'var(--font-label)', letterSpacing: '0.16em', whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1, textAlign: 'left' }
  const td: React.CSSProperties = { padding: '10px 12px', fontSize: 12, color: 'var(--ink-primary)', fontFamily: 'var(--font-body)', borderBottom: '1px solid var(--divider-soft)', verticalAlign: 'middle' }
  const tdNum: React.CSSProperties = { ...td, fontFamily: 'var(--font-data)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
  const kpi = (label: string, value: string, tone?: 'pos' | 'neg' | 'warn') => (
    <div className="card" style={{ padding: '10px 18px' }}>
      <div style={{ fontSize: 9, fontFamily: 'var(--font-label)', letterSpacing: '0.14em', textTransform: 'uppercase', color: tone ? `var(--${tone})` : 'var(--text-muted)', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'var(--font-data)', color: tone ? `var(--${tone})` : 'var(--ink-primary)' }}>{value}</div>
    </div>
  )

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1500, margin: '0 auto' }}>
      <PageHero title="Direitos Econômicos" subtitle="Consolidado de titularidade por atleta · Botafogo, parceiros, agentes e terceiros">
        <button onClick={exportXlsx} className="btn btn-outline"><Icon name="download" size={14} /> Exportar</button>
      </PageHero>

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 9, fontFamily: 'var(--font-label)', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Busca</div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Atleta ou detentor..."
            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--cream-card)', fontSize: 13, fontFamily: 'var(--font-body)', color: 'var(--ink-primary)' }} />
        </div>
        <div>
          <div style={{ fontSize: 9, fontFamily: 'var(--font-label)', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Status</div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--cream-card)', fontSize: 13, fontFamily: 'var(--font-body)', color: 'var(--ink-primary)' }}>
            <option value="Todos">Todos</option>
            {(['FECHADO', 'PARCIAL', 'EXCEDIDO', 'SEM_LANCAMENTO'] as const).map(s => (
              <option key={s} value={s}>{STATUS_STYLE[s].label}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
          <button onClick={expandAll} className="btn btn-outline btn-sm">Expandir tudo</button>
          <button onClick={collapseAll} className="btn btn-outline btn-sm">Recolher</button>
        </div>
        <div style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>
          {kpi('Atletas', String(stats.atletas))}
          {kpi('BFR 100%', String(stats.bfr100), 'pos')}
          {kpi('Excede 100%', String(stats.excedido), stats.excedido > 0 ? 'neg' : undefined)}
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 240px)', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 36 }} aria-label="Expandir" />
                <th style={th}>Atleta</th>
                <th style={th}>Status</th>
                <th style={{ ...th, textAlign: 'right' }}>Botafogo</th>
                <th style={{ ...th, textAlign: 'right' }}>Total</th>
                <th style={{ ...th }}>Detentores</th>
                <th style={{ ...th, textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Carregando...</td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Nenhum atleta.</td></tr>}
              {filtered.map(r => {
                const st = STATUS_STYLE[r.status]
                const isOpen = expanded.has(r.athlete.id)
                const canExpand = r.holders.length > 0
                return (
                  <Fragment key={r.athlete.id}>
                    <tr style={{ background: canExpand && isOpen ? 'var(--cream-inset)' : 'transparent' }}>
                      <td style={{ ...td, textAlign: 'center' }}>
                        {canExpand && (
                          <IconButton icon={isOpen ? 'chevronDown' : 'chevronRight'} tone="muted" small
                            label={isOpen ? 'Recolher' : 'Expandir'} onClick={() => toggle(r.athlete.id)} />
                        )}
                      </td>
                      <td style={{ ...td, fontWeight: 600 }}>
                        <RefLink to={`/atletas/${r.athlete.id}`} title={`Abrir ${r.athlete.full_name}`}>{r.athlete.full_name}</RefLink>
                      </td>
                      <td style={td}>
                        <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 5, fontSize: 9, fontWeight: 600, fontFamily: 'var(--font-label)', letterSpacing: '0.08em', textTransform: 'uppercase', background: st.bg, color: st.fg }}>{st.label}</span>
                      </td>
                      <td style={{ ...tdNum, color: r.bfrPct >= 99.99 ? 'var(--pos)' : 'var(--ink-primary)' }}>{r.bfrPct.toFixed(0)}%</td>
                      <td style={{ ...tdNum, color: r.status === 'EXCEDIDO' ? 'var(--neg)' : r.status === 'PARCIAL' ? 'var(--warn)' : 'var(--ink-primary)' }}>{r.total.toFixed(0)}%</td>
                      <td style={{ ...td, color: 'var(--text-secondary)' }}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {r.holders.slice(0, 3).map((h, i) => (
                            <span key={i} style={{ fontSize: 11, fontFamily: 'var(--font-label)', padding: '2px 8px', borderRadius: 5, background: 'var(--cream-inset)', color: HOLDER_COLOR[h.holderType], border: '1px solid var(--divider-soft)' }}>
                              {h.holderName} · {h.percentage.toFixed(0)}%
                            </span>
                          ))}
                          {r.holders.length > 3 && <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-label)' }}>+{r.holders.length - 3}</span>}
                          {r.holders.length === 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>—</span>}
                        </div>
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <RowActions
                          open={{ onClick: () => navigate(`/atletas/${r.athlete.id}`), label: 'Abrir a ficha do atleta' }}
                        />
                      </td>
                    </tr>
                    {isOpen && r.holders.map((h, i) => (
                      <tr key={`${r.athlete.id}-${i}`} style={{ background: 'var(--cream-page)' }}>
                        <td style={td} />
                        <td colSpan={2} style={{ ...td, paddingLeft: 40, color: 'var(--text-secondary)' }}>
                          <span style={{ fontSize: 11, fontFamily: 'var(--font-label)', color: HOLDER_COLOR[h.holderType], letterSpacing: '0.10em', textTransform: 'uppercase', marginRight: 8 }}>{HOLDER_TYPE_LABELS[h.holderType]}</span>
                          {h.holderName}
                        </td>
                        <td style={tdNum} />
                        <td style={{ ...tdNum, fontWeight: 600, color: HOLDER_COLOR[h.holderType] }}>{h.percentage.toFixed(2)}%</td>
                        <td colSpan={2} style={td} />
                      </tr>
                    ))}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-label)' }}>
        {filtered.length} atleta(s) · {stats.fechado} com 100% fechado · {stats.parcial} parcial · {stats.excedido} excedendo
      </div>
    </div>
  )
}

// src/pages/PageRelDirEconomicos.tsx
// Relatório consolidado de titularidade econômica: uma linha por atleta que
// expande em uma linha por detentor (Botafogo, clube parceiro, agente, atleta,
// terceiro). Sinaliza quando o total não fecha 100% (>100% erro de cadastro,
// <100% titularidade parcialmente vaga, o resto implicitamente Botafogo).

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchAthletes, fetchAllEconomicRights } from '../lib/athleteQueries'
import type { Athlete, EconomicRight, HolderType } from '../types/athlete-system'
import { HOLDER_TYPE_LABELS, HOLDER_TYPE_COLORS } from '../types/athlete-system'
import { exportWorkbook, type ColDef } from '../lib/xlsx-utils'
import PageHero from '../components/PageHero'
import RefLink from '../components/RefLink'
import { Icon, IconButton } from '../components/Icon'
import RowActions from '../components/RowActions'
import { badgeStyle } from '../lib/tones'

interface HolderRow { holderType: HolderType; holderName: string; percentage: number }
interface AthleteRow {
  athlete: Athlete
  holders: HolderRow[]
  total: number
  status: 'OK' | 'PARCIAL' | 'SEM_LANCAMENTO'
  bfrPct: number
}

const STATUS_STYLE: Record<AthleteRow['status'], { label: string }> = {
  OK:             { label: '—' },
  PARCIAL:        { label: 'Parcial' },
  SEM_LANCAMENTO: { label: 'Sem lançamento' },
}

// Detentor = série de dados do DS (ponto colorido); o texto fica neutro.
function HolderDot({ type }: { type: HolderType }) {
  return <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 'var(--radius-circle)', background: HOLDER_TYPE_COLORS[type], flex: 'none', display: 'inline-block' }} />
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
        : total < 99.99 ? 'PARCIAL'
        : 'OK'
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
    parcial: filtered.filter(r => r.status === 'PARCIAL').length,
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

  const th: React.CSSProperties = { padding: '8px 12px', fontSize: 10, fontWeight: 400, textTransform: 'uppercase', background: 'var(--tbl-head)', color: 'var(--text-muted)', borderBottom: '1px solid var(--divider-strong)', fontFamily: 'var(--font-label)', letterSpacing: 'var(--text-overline-tracking)', whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1, textAlign: 'left' }
  const td: React.CSSProperties = { padding: '8px 12px', fontSize: 12, color: 'var(--ink-primary)', fontFamily: 'var(--font-body)', borderBottom: '1px solid var(--divider-soft)', verticalAlign: 'middle' }
  const tdNum: React.CSSProperties = { ...td, fontFamily: 'var(--font-data)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
  return (
    <div style={{ padding: '24px 28px 32px', width: '100%', boxSizing: 'border-box' }}>
      <PageHero title="Direitos Econômicos" section="Relatórios" subtitle="Consolidado de titularidade por atleta · Botafogo, parceiros, agentes e terceiros">
        <button onClick={exportXlsx} className="btn btn-outline"><Icon name="download" size={16} /> Exportar</button>
      </PageHero>

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-label)', letterSpacing: 'var(--text-overline-tracking)', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Busca</div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Atleta ou detentor..."
            style={{ width: '100%', padding: '4px 10px', borderRadius: 'var(--ui-control-radius)', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--cream-card)', fontSize: 'var(--ui-text-size)', fontFamily: 'var(--font-body)', color: 'var(--ink-primary)' }} />
        </div>
        <div>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-label)', letterSpacing: 'var(--text-overline-tracking)', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Status</div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
            style={{ padding: '4px 10px', borderRadius: 'var(--ui-control-radius)', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--cream-card)', fontSize: 'var(--ui-text-size)', fontFamily: 'var(--font-body)', color: 'var(--ink-primary)' }}>
            <option value="Todos">Todos</option>
            {(['PARCIAL', 'SEM_LANCAMENTO'] as const).map(s => (
              <option key={s} value={s}>{STATUS_STYLE[s].label}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          <button onClick={expandAll} className="btn btn-outline btn-sm">Expandir tudo</button>
          <button onClick={collapseAll} className="btn btn-outline btn-sm">Recolher</button>
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 240px)', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 36 }} aria-label="Expandir" />
                <th style={th}>Atleta</th>
                <th style={{ ...th, textAlign: 'right' }}>Total</th>
                <th style={{ ...th }}>Detentores</th>
                <th style={{ ...th, textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: 'var(--text-secondary)', padding: 40 }}>Carregando…</td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: 'var(--text-secondary)', padding: 40 }}>Nenhum atleta.</td></tr>}
              {filtered.map(r => {
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
                      <td style={{ ...td, fontWeight: 500 }}>
                        <RefLink to={`/atletas/${r.athlete.id}`} title={`Abrir ${r.athlete.full_name}`}>{r.athlete.full_name}</RefLink>
                      </td>
                      <td style={{ ...tdNum, color: r.status === 'PARCIAL' ? 'var(--warn)' : 'var(--ink-primary)' }}>{r.total.toFixed(0)}%</td>
                      <td style={{ ...td, color: 'var(--text-secondary)' }}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {r.holders.slice(0, 3).map((h, i) => (
                            <span key={i} style={{ ...badgeStyle('outline'), height: 22, fontSize: 11 }}>
                              <HolderDot type={h.holderType} /> {h.holderName} · {h.percentage.toFixed(0)}%
                            </span>
                          ))}
                          {r.holders.length > 3 && <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-label)' }}>+{r.holders.length - 3}</span>}
                          {r.holders.length === 0 && <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>—</span>}
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
                        <td style={{ ...td, paddingLeft: 40, color: 'var(--text-secondary)' }}>
                          <span className="eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginRight: 8 }}><HolderDot type={h.holderType} />{HOLDER_TYPE_LABELS[h.holderType]}</span>
                          {h.holderName}
                        </td>
                        <td style={{ ...tdNum, fontWeight: 500 }}>{h.percentage.toFixed(2)}%</td>
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
      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-label)' }}>
        {filtered.length} atleta(s){stats.parcial > 0 ? ` · ${stats.parcial} parcial(is)` : ''}
      </div>
    </div>
  )
}

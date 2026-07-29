// src/pages/PageVisaoAtletas.tsx
// VISÃO CONSOLIDADA POR ATLETA (tabela expansível) — complementa (não substitui)
// os relatórios por natureza.
//
//   • uma linha por atleta: situação geral, em aberto, em atraso e maior atraso;
//   • ao expandir, uma linha por NATUREZA (imagem, luvas, gatilhos, salário,
//     agentes, transferências, acordos, obrigações de clube) dizendo se está em
//     dia; se não, quanto e há quanto tempo está em atraso;
//   • clicar na linha abre a obrigação correspondente (a mais atrasada), para ver
//     o detalhe e dar baixa.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchAthletes, fetchAllClauses, fetchAllInstallments,
  fetchAllClubLiabilities, fetchAllIntermediaryLiabilities,
} from '../lib/athleteQueries'
import type { Currency } from '../types/athlete-system'
import {
  buildAthleteOverview, lateLabel, type AthleteOverview, type NatureStatus, type NatureSummary,
} from '../lib/athleteOverview'
import { fmtCurrencyShort, fmtDate } from '../lib/format'
import { exportWorkbook, type ColDef } from '../lib/xlsx-utils'
import PageHero from '../components/PageHero'
import RefLink from '../components/RefLink'
import { Icon, IconButton } from '../components/Icon'
import KpiPill from '../components/KpiPill'
import RowActions from '../components/RowActions'

const font = "var(--font-body)"
const mono = "var(--font-label)"

const STATUS_STYLE: Record<NatureStatus, { label: string; bg: string; fg: string }> = {
  EM_DIA:         { label: 'Em dia',        bg: 'var(--pos-tint)',    fg: 'var(--pos)' },
  EM_ATRASO:      { label: 'Em atraso',     bg: 'var(--neg-tint)',    fg: 'var(--neg)' },
  QUITADO:        { label: 'Quitado',       bg: 'var(--cream-inset)', fg: 'var(--ink-secondary)' },
  RENEGOCIADO:    { label: 'Renegociado',   bg: 'var(--info-tint)',   fg: 'var(--info)' },
  SEM_LANCAMENTO: { label: 'Sem lançamento', bg: 'transparent',       fg: 'var(--text-muted)' },
}

function StatusPill({ status }: { status: NatureStatus }) {
  const s = STATUS_STYLE[status]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 9px', borderRadius: 5,
      fontSize: 9, fontWeight: 600, fontFamily: mono, letterSpacing: '0.08em', textTransform: 'uppercase',
      background: s.bg, color: s.fg,
      border: status === 'SEM_LANCAMENTO' ? '1px solid var(--divider)' : '1px solid transparent',
    }}>
      {status === 'EM_ATRASO' && <Icon name="alert" size={11} />}
      {status === 'EM_DIA' && <Icon name="check" size={11} />}
      {s.label}
    </span>
  )
}

/** Subtotais por moeda ("€ 300,0K · $ 1,00M") — não esconde EUR/USD na conversão. */
function ByCurrency({ totals }: { totals: Partial<Record<Currency, number>> }) {
  const entries = (Object.entries(totals) as [Currency, number][]).filter(([, v]) => v)
  if (entries.length === 0) return <span style={{ color: 'var(--text-muted)' }}>—</span>
  return <>{entries.map(([c, v]) => fmtCurrencyShort(v, c)).join(' · ')}</>
}

type Filter = 'todos' | 'atraso' | 'aberto'

export default function PageVisaoAtletas() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<AthleteOverview[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('todos')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    const [athletes, clauses, installments, clubLiabs, intermLiabs] = await Promise.all([
      fetchAthletes(), fetchAllClauses(), fetchAllInstallments(),
      fetchAllClubLiabilities(), fetchAllIntermediaryLiabilities(),
    ])
    setRows(buildAthleteOverview({ athletes, clauses, installments, clubLiabs, intermLiabs }))
    setLoading(false)
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial no mount
  useEffect(() => { load() }, [load])

  const toggle = (id: string) => setExpanded(prev => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })
  const collapseAll = () => setExpanded(new Set())

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows
      .filter(r => {
        if (filter === 'atraso' && r.overdueCount === 0) return false
        if (filter === 'aberto' && r.openBRL <= 0) return false
        if (!q) return true
        return [r.athlete.full_name, r.athlete.short_name].some(v => (v ?? '').toLowerCase().includes(q))
      })
      .sort((a, b) => b.overdueBRL - a.overdueBRL || b.openBRL - a.openBRL
        || a.athlete.full_name.localeCompare(b.athlete.full_name))
  }, [rows, search, filter])

  const expandAll = () => setExpanded(new Set(visible.map(r => r.athlete.id)))

  const totals = useMemo(() => ({
    open: visible.reduce((s, r) => s + r.openBRL, 0),
    overdue: visible.reduce((s, r) => s + r.overdueBRL, 0),
    rj: visible.reduce((s, r) => s + r.rjBRL, 0),
    late: visible.filter(r => r.overdueCount > 0).length,
  }), [visible])

  function exportAll() {
    const cols: ColDef[] = [
      { key: 'atleta', header: 'Atleta' }, { key: 'natureza', header: 'Natureza' },
      { key: 'situacao', header: 'Situação' }, { key: 'emAberto', header: 'Em aberto (aprox. BRL)' },
      { key: 'emAtraso', header: 'Em atraso (aprox. BRL)' }, { key: 'emRJ', header: 'Em Rec. Judicial (aprox. BRL)' },
      { key: 'parcelasAtraso', header: 'Parcelas em atraso' },
      { key: 'atrasoDesde', header: 'Atraso desde' }, { key: 'diasAtraso', header: 'Dias de atraso' },
      { key: 'proximo', header: 'Próximo vencimento' },
    ]
    const out: Record<string, unknown>[] = []
    for (const r of visible) {
      out.push({
        atleta: r.athlete.full_name, natureza: 'TOTAL DO ATLETA',
        situacao: STATUS_STYLE[r.status].label,
        emAberto: Math.round(r.openBRL), emAtraso: Math.round(r.overdueBRL), emRJ: Math.round(r.rjBRL),
        parcelasAtraso: r.overdueCount, atrasoDesde: '', diasAtraso: r.daysLate,
        proximo: r.nextDue ?? '',
      })
      for (const n of r.natures) {
        if (n.totalCount === 0) continue
        out.push({
          atleta: r.athlete.full_name, natureza: n.label,
          situacao: STATUS_STYLE[n.status].label,
          emAberto: Math.round(n.openBRL), emAtraso: Math.round(n.overdueBRL), emRJ: Math.round(n.rjBRL),
          parcelasAtraso: n.overdueCount, atrasoDesde: n.oldestOverdue ?? '',
          diasAtraso: n.daysLate, proximo: n.nextDue ?? '',
        })
      }
    }
    exportWorkbook([{ name: 'Visão por atleta', cols, rows: out }], 'visao-consolidada-atletas.xlsx')
  }

  const th: React.CSSProperties = { padding: '9px 12px', fontSize: 9, fontWeight: 600, textTransform: 'uppercase', background: 'var(--tbl-head)', color: 'var(--ink-secondary)', borderBottom: '1px solid var(--divider-strong)', fontFamily: mono, letterSpacing: '0.14em', whiteSpace: 'nowrap', textAlign: 'left' }
  const td: React.CSSProperties = { padding: '10px 12px', fontSize: 12, color: 'var(--ink-primary)', fontFamily: font, borderBottom: '1px solid var(--divider-soft)', verticalAlign: 'middle' }

  return (
    <div style={{ padding: '24px 28px 32px', width: '100%', boxSizing: 'border-box' }}>
      <PageHero title="Visão por Atleta" subtitle="Consolidado por natureza · Botafogo SAF">
        <button onClick={exportAll} className="btn btn-outline"><Icon name="download" size={13} /> Exportar</button>
      </PageHero>

      {/* Filtros + totais */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 9, fontFamily: mono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Busca</div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nome do atleta..."
            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--cream-card)', fontSize: 13, fontFamily: font, color: 'var(--ink-primary)' }} />
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {([['todos', 'Todos'], ['atraso', 'Com atraso'], ['aberto', 'Com saldo em aberto']] as [Filter, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} className={`btn btn-sm ${filter === k ? 'btn-primary' : 'btn-outline'}`}>{l}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={expandAll} className="btn btn-sm btn-ghost">Expandir tudo</button>
          <button onClick={collapseAll} className="btn btn-sm btn-ghost">Recolher</button>
        </div>
        <KpiPill label="Em atraso (aprox. BRL)" value={fmtCurrencyShort(totals.overdue, 'BRL')} tone="neg" />
        <KpiPill label="Em aberto (aprox. BRL)" value={fmtCurrencyShort(totals.open, 'BRL')} tone="neutral" />
        <KpiPill label="Em Rec. Judicial (aprox. BRL)" value={fmtCurrencyShort(totals.rj, 'BRL')} tone="warn" />
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={{ ...th, width: 36 }} aria-label="Expandir" />
              <th style={{ ...th, minWidth: 180 }}>Atleta / natureza</th>
              <th style={{ ...th, minWidth: 110 }}>Situação</th>
              <th style={{ ...th, textAlign: 'right', minWidth: 120 }}>Em aberto</th>
              <th style={{ ...th, textAlign: 'right', minWidth: 120 }}>Em atraso (aprox. BRL)</th>
              <th style={{ ...th, textAlign: 'right', minWidth: 140 }} title="Obrigações incluídas no processo de Recuperação Judicial — devidas mas fora do em atraso.">Em Rec. Judicial</th>
              <th style={{ ...th, minWidth: 130 }}>Atraso desde</th>
              <th style={{ ...th, minWidth: 110 }}>Próx. venc.</th>
              <th style={{ ...th, textAlign: 'right', minWidth: 90 }}>Ações</th>
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Carregando...</td></tr>}
              {!loading && visible.length === 0 && <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Nenhum atleta para os filtros escolhidos.</td></tr>}
              {visible.map(r => {
                const open = expanded.has(r.athlete.id)
                const shown = r.natures.filter(n => n.totalCount > 0)
                return [
                  // ── linha do atleta (pai) ──
                  <tr key={r.athlete.id} style={{ background: r.overdueCount > 0 ? 'var(--row-late-bg)' : 'var(--cream-card)' }}>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <IconButton icon={open ? 'chevronDown' : 'chevronRight'} small
                        label={open ? `Recolher ${r.athlete.short_name}` : `Ver naturezas de ${r.athlete.short_name}`}
                        onClick={() => toggle(r.athlete.id)} />
                    </td>
                    <td style={{ ...td, fontWeight: 700 }}>
                      <RefLink to={`/atletas/${r.athlete.id}`} title="Abrir a ficha do atleta">{r.athlete.short_name || r.athlete.full_name}</RefLink>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: font, fontWeight: 400 }}>
                        {' '}· {shown.length} natureza{shown.length === 1 ? '' : 's'}
                      </span>
                    </td>
                    <td style={td}><StatusPill status={r.status} /></td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: mono, fontWeight: 700 }}>{r.openBRL > 0 ? fmtCurrencyShort(r.openBRL, 'BRL') : '—'}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: mono, fontWeight: 700, color: r.overdueBRL > 0 ? 'var(--neg)' : 'var(--text-muted)' }}>
                      {r.overdueBRL > 0 ? fmtCurrencyShort(r.overdueBRL, 'BRL') : '—'}
                      {r.overdueCount > 0 && <div style={{ fontSize: 10, fontWeight: 400 }}>{r.overdueCount} parcela(s)</div>}
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: mono, fontWeight: 700, color: r.rjBRL > 0 ? 'var(--warn)' : 'var(--text-muted)' }}>
                      {r.rjBRL > 0 ? fmtCurrencyShort(r.rjBRL, 'BRL') : '—'}
                      {r.rjCount > 0 && <div style={{ fontSize: 10, fontWeight: 400 }}>{r.rjCount} lançamento(s)</div>}
                    </td>
                    <td style={{ ...td, fontFamily: mono, fontSize: 11, color: r.daysLate > 0 ? 'var(--neg)' : 'var(--text-muted)' }}>
                      {r.daysLate > 0 ? lateLabel(r.daysLate) : '—'}
                    </td>
                    <td style={{ ...td, fontFamily: mono, fontSize: 11 }}>{r.nextDue ? fmtDate(r.nextDue) : '—'}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <RowActions open={{ to: `/atletas/${r.athlete.id}`, label: 'Abrir a ficha do atleta' }} />
                    </td>
                  </tr>,
                  // ── linhas por natureza (filhas) ──
                  ...(open ? shown.map(n => (
                    <NatureRow key={`${r.athlete.id}:${n.key}`} n={n} td={td}
                      onOpen={() => {
                        if (n.focusClauseId) navigate(`/obrigacoes/${n.focusClauseId}`)
                        else navigate(`/atletas/${r.athlete.id}`)
                      }} />
                  )) : []),
                ]
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)', fontFamily: mono }}>
        {visible.length} atleta(s) · {totals.late} com atraso
      </div>
    </div>
  )
}

function NatureRow({ n, td, onOpen }: {
  n: NatureSummary; td: React.CSSProperties; onOpen: () => void
}) {
  const late = n.status === 'EM_ATRASO'
  return (
    <tr style={{ background: 'var(--bg-subtle)' }}>
      <td style={td} />
      <td style={{ ...td, paddingLeft: 6 }}>
        <button onClick={onOpen}
          style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', fontFamily: font, fontSize: 12, color: 'var(--ink-primary)', textDecoration: 'underline', textDecorationColor: 'var(--accent-line)', textUnderlineOffset: 2 }}>
          {n.label}
        </button>
        <div style={{ fontSize: 10.5, color: 'var(--text-muted)', fontFamily: mono, marginTop: 2 }}>
          {n.openCount} em aberto · {n.paidCount} paga(s) de {n.totalCount}
        </div>
      </td>
      <td style={td}><StatusPill status={n.status} /></td>
      <td style={{ ...td, textAlign: 'right', fontFamily: mono }}>
        <ByCurrency totals={n.openByCurrency} />
      </td>
      <td style={{ ...td, textAlign: 'right', fontFamily: mono, fontWeight: late ? 700 : 400, color: late ? 'var(--neg)' : 'var(--text-muted)' }}>
        {n.overdueBRL > 0 ? fmtCurrencyShort(n.overdueBRL, 'BRL') : '—'}
        {n.overdueCount > 0 && <div style={{ fontSize: 10, fontWeight: 400 }}>{n.overdueCount} parcela(s)</div>}
      </td>
      <td style={{ ...td, textAlign: 'right', fontFamily: mono, fontWeight: n.rjBRL > 0 ? 700 : 400, color: n.rjBRL > 0 ? 'var(--warn)' : 'var(--text-muted)' }}>
        {n.rjBRL > 0 ? fmtCurrencyShort(n.rjBRL, 'BRL') : '—'}
        {n.rjCount > 0 && <div style={{ fontSize: 10, fontWeight: 400 }}>{n.rjCount} lançamento(s)</div>}
      </td>
      <td style={{ ...td, fontFamily: mono, fontSize: 11, color: late ? 'var(--neg)' : 'var(--text-muted)' }}>
        {n.oldestOverdue ? <>{fmtDate(n.oldestOverdue)}<div style={{ fontSize: 10 }}>{lateLabel(n.daysLate)}</div></> : '—'}
      </td>
      <td style={{ ...td, fontFamily: mono, fontSize: 11 }}>{n.nextDue ? fmtDate(n.nextDue) : '—'}</td>
      <td style={{ ...td, textAlign: 'right' }}>
        <RowActions open={{
          onClick: onOpen,
          label: n.focusClauseId ? 'Abrir a obrigação (a mais atrasada)' : 'Abrir a ficha do atleta',
        }} />
      </td>
    </tr>
  )
}

// src/pages/PageRelGatilhos.tsx
// Relatório consolidado de gatilhos e metas. Une:
//   • gatilhos de remuneração (SalaryTrigger) — metas que alteram o salário e/ou
//     imagem quando atingidas (ex.: 20 jogos, 10 gols);
//   • bônus de performance únicos (Clause.clause_type = 'BONUS_PERFORMANCE_ATLETA')
//     — pagamento pontual em cima de uma meta esportiva;
//   • cláusulas rescisórias (Clause.clause_type = 'CLAUSULA_RESCISORIA') —
//     multas condicionadas a evento de rescisão.
// Para cada um: métrica, alvo, status (atingido / pendente / não atingido),
// data em que foi atingido e o impacto financeiro (novo salário, novo valor de
// imagem, valor do bônus).

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchAthletes, fetchAllSalaryTriggers, fetchAllClauses,
} from '../lib/athleteQueries'
import type {
  Athlete, Clause, SalaryTrigger, TriggerStatus, TriggerMetric, Currency,
} from '../types/athlete-system'
import { CLAUSE_TYPE_LABELS } from '../types/athlete-system'
import { isLoanShareTrigger } from '../lib/loanSalary'
import { fmtCurrencyShort, fmtDate } from '../lib/format'
import { exportWorkbook, type ColDef } from '../lib/xlsx-utils'
import PageHero from '../components/PageHero'
import RefLink from '../components/RefLink'
import { Icon } from '../components/Icon'
import KpiPill from '../components/KpiPill'
import RowActions from '../components/RowActions'

const METRIC_LABEL: Record<TriggerMetric, string> = {
  JOGOS: 'Jogos', GOLS: 'Gols', ASSISTENCIAS: 'Assistências',
  MINUTOS: 'Minutos', TITULO: 'Título', OUTRO: 'Outro',
}

const STATUS_STYLE: Record<TriggerStatus, { bg: string; fg: string; label: string }> = {
  PENDENTE:     { bg: 'var(--cream-inset)', fg: 'var(--ink-secondary)', label: 'Pendente' },
  ATINGIDA:     { bg: 'var(--pos-tint)',    fg: 'var(--pos)',            label: 'Atingida' },
  NAO_ATINGIDA: { bg: 'var(--neg-tint)',    fg: 'var(--neg)',            label: 'Não atingida' },
}

type Origin = 'REMUNERACAO' | 'BONUS' | 'RESCISORIA'
const ORIGIN_LABEL: Record<Origin, string> = {
  REMUNERACAO: 'Remuneração',
  BONUS:       'Bônus de performance',
  RESCISORIA:  'Cláusula rescisória',
}

interface Row {
  id: string
  clauseId: string | null
  athleteId: string
  atleta: string
  origin: Origin
  description: string
  metric: string
  threshold: string
  status: TriggerStatus
  achievedDate: string | null
  impact: string
  currency: Currency | null
}

export default function PageRelGatilhos() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'Todos' | TriggerStatus>('Todos')
  const [originFilter, setOriginFilter] = useState<'Todos' | Origin>('Todos')

  const load = useCallback(async () => {
    setLoading(true)
    const [athletes, triggers, clauses] = await Promise.all([
      fetchAthletes(), fetchAllSalaryTriggers(), fetchAllClauses(),
    ])
    const nameOf = new Map<string, string>(athletes.map((a: Athlete) => [a.id, a.short_name || a.full_name]))
    const built: Row[] = []

    // Gatilhos de remuneração (SalaryTrigger). Gatilhos internos criados pelo
    // rateio de empréstimo NÃO aparecem aqui — são um mecanismo, não uma meta.
    for (const t of triggers.filter((t: SalaryTrigger) => !isLoanShareTrigger(t))) {
      const impact = t.new_image_value != null
        ? `Salário → ${fmtCurrencyShort(t.new_salary, t.currency)} · Imagem → ${fmtCurrencyShort(t.new_image_value, t.currency)}`
        : `Salário → ${fmtCurrencyShort(t.new_salary, t.currency)}`
      built.push({
        id: `t-${t.id}`, clauseId: null, athleteId: t.athlete_id,
        atleta: nameOf.get(t.athlete_id) ?? '—',
        origin: 'REMUNERACAO', description: t.description,
        metric: METRIC_LABEL[t.metric] ?? String(t.metric),
        threshold: t.threshold != null ? String(t.threshold) : '—',
        status: t.status, achievedDate: t.achieved_date,
        impact, currency: t.currency,
      })
    }

    // Cláusulas condicionadas (bônus e rescisórias).
    for (const c of clauses as Clause[]) {
      const origin: Origin | null =
        c.clause_type === 'BONUS_PERFORMANCE_ATLETA' ? 'BONUS' :
        c.clause_type === 'CLAUSULA_RESCISORIA'      ? 'RESCISORIA' : null
      if (!origin) continue
      const value = c.original_value != null
        ? fmtCurrencyShort(c.original_value, c.currency)
        : c.percentage_value != null ? `${c.percentage_value}%` : '—'
      built.push({
        id: `c-${c.id}`, clauseId: c.id, athleteId: c.athlete_id,
        atleta: nameOf.get(c.athlete_id) ?? '—',
        origin, description: c.description, metric: CLAUSE_TYPE_LABELS[c.clause_type],
        threshold: c.condition_description || '—',
        status: c.achievement_status === 'ATINGIDA' ? 'ATINGIDA'
          : c.achievement_status === 'NAO_ATINGIDA' ? 'NAO_ATINGIDA'
          : 'PENDENTE',
        achievedDate: c.achievement_date,
        impact: value, currency: c.currency,
      })
    }

    // Pendentes primeiro (ação necessária), depois atingidas por data (recentes
    // primeiro), depois não atingidas.
    const statusOrder: Record<TriggerStatus, number> = { PENDENTE: 0, ATINGIDA: 1, NAO_ATINGIDA: 2 }
    built.sort((a, b) =>
      statusOrder[a.status] - statusOrder[b.status]
      || (b.achievedDate ?? '').localeCompare(a.achievedDate ?? '')
      || a.atleta.localeCompare(b.atleta))

    setRows(built)
    setLoading(false)
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial no mount
  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => rows.filter(r => {
    if (statusFilter !== 'Todos' && r.status !== statusFilter) return false
    if (originFilter !== 'Todos' && r.origin !== originFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (![r.atleta, r.description, r.metric, r.threshold, r.impact].some(v => (v ?? '').toLowerCase().includes(q))) return false
    }
    return true
  }), [rows, search, statusFilter, originFilter])

  const stats = useMemo(() => ({
    total: filtered.length,
    pendente: filtered.filter(r => r.status === 'PENDENTE').length,
    atingida: filtered.filter(r => r.status === 'ATINGIDA').length,
    naoAtingida: filtered.filter(r => r.status === 'NAO_ATINGIDA').length,
  }), [filtered])

  function exportXlsx() {
    const cols: ColDef[] = [
      { key: 'atleta', header: 'Atleta' }, { key: 'origin', header: 'Origem' },
      { key: 'description', header: 'Descrição' }, { key: 'metric', header: 'Métrica' },
      { key: 'threshold', header: 'Alvo' }, { key: 'status', header: 'Status' },
      { key: 'achievedDate', header: 'Atingido em' }, { key: 'impact', header: 'Impacto' },
    ]
    exportWorkbook([{
      name: 'Gatilhos', cols,
      rows: filtered.map(r => ({
        ...r, origin: ORIGIN_LABEL[r.origin],
        status: STATUS_STYLE[r.status].label,
        achievedDate: r.achievedDate ?? '',
      })) as unknown as Record<string, unknown>[],
    }], 'relatorio-gatilhos.xlsx')
  }

  const th: React.CSSProperties = { padding: '9px 12px', fontSize: 9, fontWeight: 500, textTransform: 'uppercase', background: 'var(--tbl-head)', color: 'var(--ink-secondary)', borderBottom: '1px solid var(--divider-strong)', fontFamily: 'var(--font-label)', letterSpacing: '0.16em', whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1, textAlign: 'left' }
  const td: React.CSSProperties = { padding: '10px 12px', fontSize: 12, color: 'var(--ink-primary)', fontFamily: 'var(--font-body)', borderBottom: '1px solid var(--divider-soft)', verticalAlign: 'middle' }
  const tdMono: React.CSSProperties = { ...td, fontFamily: 'var(--font-data)' }
  return (
    <div style={{ padding: '24px 28px 32px', width: '100%', boxSizing: 'border-box' }}>
      <PageHero title="Gatilhos e Metas" subtitle="Consolidado de metas esportivas, bônus de performance e cláusulas rescisórias">
        <button onClick={exportXlsx} className="btn btn-outline"><Icon name="download" size={14} /> Exportar</button>
      </PageHero>

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 9, fontFamily: 'var(--font-label)', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Busca</div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Atleta, descrição, métrica..."
            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--cream-card)', fontSize: 13, fontFamily: 'var(--font-body)', color: 'var(--ink-primary)' }} />
        </div>
        <div>
          <div style={{ fontSize: 9, fontFamily: 'var(--font-label)', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Origem</div>
          <select value={originFilter} onChange={e => setOriginFilter(e.target.value as typeof originFilter)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--cream-card)', fontSize: 13, fontFamily: 'var(--font-body)', color: 'var(--ink-primary)' }}>
            <option value="Todos">Todas</option>
            {(['REMUNERACAO', 'BONUS', 'RESCISORIA'] as const).map(o => <option key={o} value={o}>{ORIGIN_LABEL[o]}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 9, fontFamily: 'var(--font-label)', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Status</div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--cream-card)', fontSize: 13, fontFamily: 'var(--font-body)', color: 'var(--ink-primary)' }}>
            <option value="Todos">Todos</option>
            {(['PENDENTE', 'ATINGIDA', 'NAO_ATINGIDA'] as const).map(s => (
              <option key={s} value={s}>{STATUS_STYLE[s].label}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', alignItems: 'flex-end' }}>
          <KpiPill label="Pendentes" value={String(stats.pendente)} tone={stats.pendente > 0 ? 'warn' : 'neutral'} />
          <KpiPill label="Atingidas" value={String(stats.atingida)} tone="pos" />
          <KpiPill label="Não atingidas" value={String(stats.naoAtingida)} tone={stats.naoAtingida > 0 ? 'neg' : 'neutral'} />
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 240px)', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Atleta</th>
                <th style={th}>Origem</th>
                <th style={th}>Descrição</th>
                <th style={th}>Métrica</th>
                <th style={th}>Alvo</th>
                <th style={th}>Status</th>
                <th style={th}>Atingido em</th>
                <th style={th}>Impacto</th>
                <th style={{ ...th, textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Carregando...</td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Nenhum gatilho registrado.</td></tr>}
              {filtered.map(r => {
                const st = STATUS_STYLE[r.status]
                return (
                  <tr key={r.id}>
                    <td style={{ ...td, fontWeight: 600 }}><RefLink to={`/atletas/${r.athleteId}`} title={`Abrir ${r.atleta}`}>{r.atleta}</RefLink></td>
                    <td style={{ ...td, fontSize: 10, fontFamily: 'var(--font-label)', color: r.origin === 'BONUS' ? 'var(--warn)' : r.origin === 'RESCISORIA' ? 'var(--neg)' : 'var(--info)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{ORIGIN_LABEL[r.origin]}</td>
                    <td style={{ ...td, maxWidth: 320, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.description}>{r.description}</td>
                    <td style={{ ...td, color: 'var(--text-secondary)' }}>{r.metric}</td>
                    <td style={{ ...tdMono, color: 'var(--text-secondary)', maxWidth: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.threshold}>{r.threshold}</td>
                    <td style={td}>
                      <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 5, fontSize: 9, fontWeight: 600, fontFamily: 'var(--font-label)', letterSpacing: '0.08em', textTransform: 'uppercase', background: st.bg, color: st.fg }}>{st.label}</span>
                    </td>
                    <td style={{ ...tdMono, color: 'var(--text-secondary)' }}>{r.achievedDate ? fmtDate(r.achievedDate) : '—'}</td>
                    <td style={{ ...tdMono, fontWeight: 600, maxWidth: 260, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.impact}>{r.impact}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <RowActions open={r.clauseId ? { to: `/obrigacoes/${r.clauseId}`, label: 'Abrir a cláusula' } : { to: `/atletas/${r.athleteId}?tab=gatilhos`, label: 'Abrir a aba de gatilhos do atleta' }} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-label)' }}>{filtered.length} gatilho(s)</div>
    </div>
  )
}

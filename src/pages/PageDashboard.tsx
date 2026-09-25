import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { fetchAllAlerts, fetchAthletes, fetchAthleteClauses, markAlertRead, fetchAllEconomicRights } from '../lib/athleteQueries'
import type { Alert, Athlete, Clause, EconomicRight } from '../types/athlete-system'
import { fmtDate, isDueSoon, isOverdue, addMonths, todayISO, fmtDec, monthShort } from '../lib/format'
import { isOwnershipValid } from '../lib/ownership'
import { useApp } from '../context/AppContext'
import PageHero from '../components/PageHero'
import Badge from '../components/Badge'
import { Icon } from '../components/Icon'
import { tr, locale } from '../i18n'

// ── Helpers ───────────────────────────────────────────────────────────────

const RATES: Record<string, number> = { BRL: 1, EUR: 6.10, USD: 5.55, GBP: 7.10 }
const toBRL = (v: number, cur: string) => v * (RATES[cur] ?? 1)

function monthKey(iso: string) {
  return iso.slice(0, 7) // 'YYYY-MM'
}

function fmtMonth(key: string) {
  const [y, m] = key.split('-')
  const mon = monthShort(parseInt(m))
  return `${mon.charAt(0).toUpperCase()}${mon.slice(1)}/${y.slice(2)}`
}

// ── Types ─────────────────────────────────────────────────────────────────

interface MonthBucket {
  label: string
  receivable: number
  payable: number
}

// ── Component ─────────────────────────────────────────────────────────────

export default function PageDashboard() {
  const { fmtMiC } = useApp()

  const [alerts, setAlerts] = useState<Alert[]>([])
  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [allClauses, setAllClauses] = useState<Clause[]>([])
  const [economicRights, setEconomicRights] = useState<EconomicRight[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetchAllAlerts(),
      fetchAthletes(),
      fetchAllEconomicRights(),
    ]).then(async ([alts, aths, rights]) => {
      setAlerts(alts)
      setAthletes(aths)
      setEconomicRights(rights)
      const clauseArrays = await Promise.all(aths.map(a => fetchAthleteClauses(a.id)))
      setAllClauses(clauseArrays.flat())
    }).finally(() => setLoading(false))
  }, [])

  // Atletas com titularidade cadastrada mas soma ≠ 100%
  const inconsistentOwnership = (() => {
    const byAthlete: Record<string, EconomicRight[]> = {}
    for (const r of economicRights) (byAthlete[r.athlete_id] ??= []).push(r)
    return Object.values(byAthlete).filter(rs => !isOwnershipValid(rs)).length
  })()

  // ── Derived data ───────────────────────────────────────────────────────

  const unreadAlerts = alerts.filter(a => !a.is_read)
  const redAlerts = unreadAlerts.filter(a => a.severity === 'RED')
  const yellowAlerts = unreadAlerts.filter(a => a.severity === 'YELLOW')

  // 60-day due clauses
  const today = todayISO()
  const in60 = addMonths(today, 2)
  const dueClauses = allClauses
    .filter(c =>
      c.due_date &&
      c.due_date >= today &&
      c.due_date <= in60 &&
      !['PAGA', 'CANCELADA'].includes(c.payment_status),
    )
    .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))

  const overdueClauses = allClauses.filter(c =>
    isOverdue(c.due_date, c.payment_status),
  )

  // Monthly buckets for next 6 months
  const monthBuckets: Record<string, { receivable: number; payable: number }> = {}
  for (let i = 0; i < 6; i++) {
    monthBuckets[addMonths(today, i).slice(0, 7)] = { receivable: 0, payable: 0 }
  }
  allClauses.forEach(c => {
    if (!c.due_date || !c.original_value) return
    if (['PAGA', 'CANCELADA'].includes(c.payment_status)) return
    const key = monthKey(c.due_date)
    if (!monthBuckets[key]) return
    const brl = toBRL(c.original_value, c.currency)
    const isReceivable = c.creditor_party.toLowerCase().includes('botafogo')
    if (isReceivable) monthBuckets[key].receivable += brl
    else monthBuckets[key].payable += brl
  })
  const chartData: MonthBucket[] = Object.entries(monthBuckets).map(([k, v]) => ({
    label: fmtMonth(k),
    receivable: Math.round(v.receivable),
    payable: Math.round(v.payable),
  }))

  // Currency exposure
  const exposures: Record<string, { receivable: number; payable: number }> = {}
  allClauses.forEach(c => {
    if (!c.original_value || ['PAGA', 'CANCELADA'].includes(c.payment_status)) return
    if (!exposures[c.currency]) exposures[c.currency] = { receivable: 0, payable: 0 }
    const isReceivable = c.creditor_party.toLowerCase().includes('botafogo')
    if (isReceivable) exposures[c.currency].receivable += c.original_value
    else exposures[c.currency].payable += c.original_value
  })

  // KPI totals
  const totalReceivable = Object.entries(exposures).reduce((s, [cur, v]) => s + toBRL(v.receivable, cur), 0)
  const totalPayable = Object.entries(exposures).reduce((s, [cur, v]) => s + toBRL(v.payable, cur), 0)
  const totalNet = totalReceivable - totalPayable

  // ── Mark alert read ───────────────────────────────────────────────────

  async function handleMarkRead(id: string) {
    await markAlertRead(id)
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, is_read: true } : a))
  }

  // ── Athlete lookup ────────────────────────────────────────────────────

  function athleteName(athleteId: string) {
    return athletes.find(a => a.id === athleteId)?.short_name ?? athleteId.slice(0, 8)
  }

  function athleteIdForClause(clause: Clause) {
    return clause.athlete_id
  }

  // ── Styles (MetricCard do Glorioso Finance DS) ───────────────────────

  const cardStyle: React.CSSProperties = { padding: 'var(--gutter-card)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }
  const eyebrowRow: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)' }

  if (loading) {
    return (
      <div className="eyebrow" style={{ padding: 'var(--space-8) var(--gutter-screen)' }}>
        {tr('Carregando…')}
      </div>
    )
  }

  const kpis: { label: string; value: string; caption: string; color?: string; inverse?: boolean }[] = [
    { label: 'A receber', value: fmtMiC(totalReceivable), caption: 'Botafogo como credor', color: 'var(--text-positive)' },
    { label: 'A pagar', value: fmtMiC(totalPayable), caption: 'Botafogo como devedor' },
    { label: 'Saldo líquido', value: fmtMiC(totalNet), caption: totalNet >= 0 ? 'A receber acima do a pagar' : 'A pagar acima do a receber', inverse: true },
    { label: 'Alertas ativos', value: `${redAlerts.length} · ${yellowAlerts.length}`, caption: 'críticos · atenção', color: redAlerts.length > 0 ? 'var(--text-negative)' : undefined },
    { label: 'Titularidade ≠ 100%', value: `${inconsistentOwnership}`, caption: inconsistentOwnership > 0 ? 'atletas com soma inconsistente' : 'todas as somas conferem', color: inconsistentOwnership > 0 ? 'var(--text-negative)' : 'var(--text-positive)' },
  ]

  return (
    <div style={{ padding: '24px 28px 32px', width: '100%', boxSizing: 'border-box' }}>
      <PageHero title={tr('Visão Geral')} subtitle={tr('Dashboard · Botafogo SAF')} />

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: 'var(--space-5)', marginBottom: 'var(--space-6)' }}>
        {kpis.map(kpi => (
          <div key={kpi.label} className={kpi.inverse ? 'card card-inverse' : 'card'} style={{ ...cardStyle, gap: 'var(--space-3)' }}>
            <div className="eyebrow" style={kpi.inverse ? { color: 'var(--gray-500)' } : undefined}>{tr(kpi.label)}</div>
            <div>
              <div style={{
                fontSize: 'var(--text-h2-size)', lineHeight: 'var(--text-h2-line)', fontWeight: 500,
                letterSpacing: 'var(--text-h2-tracking)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                color: kpi.inverse ? 'var(--text-inverse)' : (kpi.color ?? 'var(--text-primary)'),
              }}>
                {tr(kpi.value)}
              </div>
              <div style={{ marginTop: 2, fontSize: 'var(--text-body-sm-size)', color: kpi.inverse ? 'var(--gray-500)' : 'var(--text-secondary)' }}>{tr(kpi.caption)}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: 'var(--space-5)', alignItems: 'start' }}>

        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>

          {/* Monthly chart */}
          <section className="card" style={cardStyle}>
            <div style={eyebrowRow}>
              <span className="eyebrow">{tr('Fluxo por mês · próximos 6 meses (R$)')}</span>
              <Legend items={[{ label: 'A receber', color: 'var(--chart-1)' }, { label: 'A pagar', color: 'var(--chart-2)' }]} />
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barGap={4}>
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                <XAxis dataKey="label" tick={{ fontFamily: 'var(--font-core)', fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontFamily: 'var(--font-core)', fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={44}
                  tickFormatter={v => v >= 1_000_000 ? `${fmtDec(v / 1_000_000)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`} />
                <Tooltip
                  cursor={{ fill: 'var(--surface-sunken)' }}
                  contentStyle={CHART_TOOLTIP}
                  labelStyle={{ color: 'var(--text-secondary)', fontSize: 11, marginBottom: 4 }}
                  formatter={(v: unknown, name: unknown) => [`R$ ${(v as number).toLocaleString(locale())}`, name === 'receivable' ? 'A receber' : 'A pagar']}
                />
                <Bar dataKey="receivable" fill="var(--chart-1)" radius={[6, 6, 0, 0]} maxBarSize={28} />
                <Bar dataKey="payable" fill="var(--chart-2)" radius={[6, 6, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </section>

          {/* Due in 60 days */}
          <section className="card" style={cardStyle}>
            <div style={eyebrowRow}>
              <span className="eyebrow">{tr('Vencimentos · próximos 60 dias')}</span>
              <Badge tone="neutral">{dueClauses.length}</Badge>
            </div>
            {overdueClauses.length > 0 && (
              <div>
                <div className="eyebrow" style={{ color: 'var(--text-negative)', marginBottom: 6 }}>
                  {tr('Em atraso (')}{overdueClauses.length})
                </div>
                {overdueClauses.map(c => (
                  <DueRow key={c.id} clause={c} athleteName={athleteName(athleteIdForClause(c))} overdue />
                ))}
              </div>
            )}
            {dueClauses.length === 0 && overdueClauses.length === 0 && (
              <div style={{ fontSize: 'var(--text-body-sm-size)', color: 'var(--text-secondary)', textAlign: 'center', padding: '16px 0' }}>
                {tr('Nenhum vencimento nos próximos 60 dias')}
              </div>
            )}
            {dueClauses.length > 0 && (
              <div>
                {dueClauses.slice(0, 10).map(c => (
                  <DueRow key={c.id} clause={c} athleteName={athleteName(athleteIdForClause(c))} />
                ))}
              </div>
            )}
            {dueClauses.length > 10 && (
              <div style={{ fontSize: 'var(--text-body-sm-size)', color: 'var(--text-secondary)', textAlign: 'center' }}>
                +{dueClauses.length - 10} {tr('mais')}
              </div>
            )}
          </section>

          {/* Currency exposure */}
          <section className="card" style={cardStyle}>
            <span className="eyebrow">{tr('Exposição cambial')}</span>
            <table>
              <thead>
                <tr>
                  {['Moeda', 'A receber', 'A pagar', 'Líquido', 'Em R$'].map(h => (
                    <th key={h} style={{ position: 'static', padding: '0 8px 10px', textAlign: h === 'Moeda' ? 'left' : 'right' }}>{tr(h)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(exposures).map(([cur, v]) => {
                  const net = v.receivable - v.payable
                  const netBRL = toBRL(Math.abs(net), cur)
                  return (
                    <tr key={cur}>
                      <td style={{ padding: '10px 8px', fontWeight: 500 }}>{tr(cur)}</td>
                      <td style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--text-positive)' }}>{v.receivable.toLocaleString(locale(), { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: '10px 8px', textAlign: 'right' }}>{v.payable.toLocaleString(locale(), { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: '10px 8px', textAlign: 'right', color: net >= 0 ? 'var(--text-positive)' : 'var(--text-negative)', fontWeight: 500 }}>
                        {net >= 0 ? '+' : ''}{net.toLocaleString(locale(), { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                        {tr('R$')} {netBRL.toLocaleString(locale(), { maximumFractionDigits: 0 })}
                      </td>
                    </tr>
                  )
                })}
                {Object.keys(exposures).length === 0 && (
                  <tr><td colSpan={5} style={{ padding: '12px 8px', color: 'var(--text-secondary)', textAlign: 'center' }}>{tr('Sem dados')}</td></tr>
                )}
              </tbody>
            </table>
          </section>
        </div>

        {/* Right column — alerts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <section className="card" style={cardStyle}>
            <div style={eyebrowRow}>
              <span className="eyebrow">{tr('Alertas não lidos')}</span>
              <Badge tone={unreadAlerts.length > 0 ? 'negative' : 'neutral'}>{unreadAlerts.length}</Badge>
            </div>

            {unreadAlerts.length === 0 && (
              <div style={{ fontSize: 'var(--text-body-sm-size)', color: 'var(--text-secondary)', textAlign: 'center', padding: '8px 0' }}>
                {tr('Nenhum alerta ativo')}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {unreadAlerts.map(alert => (
                <div key={alert.id} style={{ background: 'var(--surface-sunken)', borderRadius: 'var(--radius-md)', padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minWidth: 0 }}>
                      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 'var(--radius-circle)', background: alert.severity === 'RED' ? 'var(--red-500)' : 'var(--amber-500)', flexShrink: 0, marginTop: 5 }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 'var(--text-body-sm-size)', color: 'var(--text-primary)', marginBottom: 4 }}>
                          {tr(alert.message)}
                        </div>
                        <Link to={`/atletas/${alert.athlete_id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 'var(--text-caption-size)', color: 'var(--text-secondary)' }}>
                          {tr(athleteName(alert.athlete_id))} <Icon name="chevronRight" size={16} />
                        </Link>
                      </div>
                    </div>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleMarkRead(alert.id)} style={{ flexShrink: 0 }}>
                      {tr('Marcar lido')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Quick links */}
          <section className="card" style={cardStyle}>
            <span className="eyebrow">{tr('Acesso rápido')}</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              {[
                { to: '/atletas', label: 'Lista de atletas' },
                { to: '/album', label: 'Portfolio de atletas' },
                { to: '/relatorios/consolidado', label: 'Relatório consolidado' },
                { to: '/clubes', label: 'Obrigações — clubes' },
                { to: '/intermediarios', label: 'Obrigações — agentes' },
              ].map(link => (
                <Link key={link.to} to={link.to} className="list-link">
                  {tr(link.label)}
                  <Icon name="chevronRight" size={16} />
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

// ── Peças do DS usadas aqui ───────────────────────────────────────────────

// Tooltip do Recharts no formato do InsightCallout do DS.
const CHART_TOOLTIP: React.CSSProperties = {
  fontFamily: 'var(--font-core)', fontSize: 12, background: 'var(--surface-card)', border: 'none',
  borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-pop)', color: 'var(--text-primary)', padding: '8px 12px',
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
      {items.map(it => (
        <span key={it.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-body-sm-size)', color: 'var(--text-secondary)' }}>
          <span style={{ width: 9, height: 9, borderRadius: 'var(--radius-circle)', background: it.color, flex: 'none' }} />
          {tr(it.label)}
        </span>
      ))}
    </div>
  )
}

// ── DueRow sub-component ──────────────────────────────────────────────────

function DueRow({ clause, athleteName, overdue = false }: { clause: Clause; athleteName: string; overdue?: boolean }) {
  const sym: Record<string, string> = { BRL: 'R$', EUR: '€', USD: '$', GBP: '£' }
  const s = sym[clause.currency] ?? clause.currency
  const soon = !overdue && isDueSoon(clause.due_date, clause.payment_status)
  return (
    <Link to={`/atletas/${clause.athlete_id}`} className="due-row">
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 'var(--text-body-sm-size)', color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {tr(athleteName)} — {tr(clause.description)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-caption-size)', color: 'var(--text-secondary)', marginTop: 3 }}>
          {clause.due_date ? fmtDate(clause.due_date) : '—'}
          {overdue && <Badge tone="negative">{tr('Em atraso')}</Badge>}
          {soon && <Badge tone="warning">{tr('Em breve')}</Badge>}
        </div>
      </div>
      <div style={{ fontSize: 'var(--text-body-sm-size)', color: overdue ? 'var(--text-negative)' : 'var(--text-primary)', fontWeight: 500, whiteSpace: 'nowrap', marginLeft: 8, fontVariantNumeric: 'tabular-nums' }}>
        {clause.original_value != null ? `${s} ${clause.original_value.toLocaleString(locale(), { maximumFractionDigits: 0 })}` : '—'}
      </div>
    </Link>
  )
}

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { fetchAllAlerts, fetchAthletes, fetchAthleteClauses, markAlertRead } from '../lib/athleteQueries'
import type { Alert, Athlete, Clause } from '../types/athlete-system'
import { fmtDate, isDueSoon, isOverdue, addMonths, todayISO } from '../lib/format'
import { useApp } from '../context/AppContext'

// ── Helpers ───────────────────────────────────────────────────────────────

const RATES: Record<string, number> = { BRL: 1, EUR: 6.10, USD: 5.55, GBP: 7.10 }
const toBRL = (v: number, cur: string) => v * (RATES[cur] ?? 1)

function monthKey(iso: string) {
  return iso.slice(0, 7) // 'YYYY-MM'
}

function fmtMonth(key: string) {
  const [y, m] = key.split('-')
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${months[parseInt(m) - 1]}/${y.slice(2)}`
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
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetchAllAlerts(),
      fetchAthletes(),
    ]).then(async ([alts, aths]) => {
      setAlerts(alts)
      setAthletes(aths)
      const clauseArrays = await Promise.all(aths.map(a => fetchAthleteClauses(a.id)))
      setAllClauses(clauseArrays.flat())
    }).finally(() => setLoading(false))
  }, [])

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

  // ── Styles ────────────────────────────────────────────────────────────

  const cardStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(190,140,74,0.15)',
    borderRadius: 10, padding: 20,
  }

  const sectionTitle: React.CSSProperties = {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 600,
    letterSpacing: '0.16em', textTransform: 'uppercase', color: '#be8c4a', marginBottom: 14,
  }

  if (loading) {
    return (
      <div style={{ padding: '40px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(26,20,16,0.40)', letterSpacing: '0.14em' }}>
        CARREGANDO...
      </div>
    )
  }

  return (
    <div style={{ padding: '32px 40px' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(190,140,74,0.80)', marginBottom: 6 }}>
          Dashboard
        </div>
        <h1 style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 26, fontWeight: 700, color: '#1a1410', margin: 0 }}>
          Visão Geral
        </h1>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        {[
          { label: 'A Receber', value: fmtMiC(totalReceivable), color: '#059669', bg: 'rgba(5,150,105,0.07)', border: 'rgba(5,150,105,0.20)' },
          { label: 'A Pagar', value: fmtMiC(totalPayable), color: '#dc2626', bg: 'rgba(220,38,38,0.07)', border: 'rgba(220,38,38,0.20)' },
          { label: 'Saldo Líquido', value: fmtMiC(totalNet), color: totalNet >= 0 ? '#059669' : '#dc2626', bg: 'rgba(190,140,74,0.08)', border: 'rgba(190,140,74,0.20)' },
          { label: 'Alertas Ativos', value: `${redAlerts.length} 🔴  ${yellowAlerts.length} 🟡`, color: '#1a1410', bg: 'rgba(255,255,255,0.55)', border: 'rgba(190,140,74,0.15)' },
        ].map(kpi => (
          <div key={kpi.label} style={{ background: kpi.bg, border: `1px solid ${kpi.border}`, borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(26,20,16,0.45)', marginBottom: 6 }}>
              {kpi.label}
            </div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 18, fontWeight: 700, color: kpi.color }}>
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20, alignItems: 'start' }}>

        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Monthly chart */}
          <div style={cardStyle}>
            <div style={sectionTitle}>Fluxo por Mês (próximos 6 meses) — R$</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(26,20,16,0.08)" />
                <XAxis dataKey="label" tick={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fill: 'rgba(26,20,16,0.45)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fill: 'rgba(26,20,16,0.45)' }} axisLine={false} tickLine={false}
                  tickFormatter={v => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`} />
                <Tooltip
                  contentStyle={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, background: '#1a1410', border: 'none', borderRadius: 7, color: '#f3ede2' }}
                  formatter={(v: unknown, name: unknown) => [`R$ ${(v as number).toLocaleString('pt-BR')}`, name === 'receivable' ? 'A Receber' : 'A Pagar']}
                />
                <Bar dataKey="receivable" fill="#059669" opacity={0.8} radius={[3, 3, 0, 0]} maxBarSize={40} />
                <Bar dataKey="payable" fill="#dc2626" opacity={0.8} radius={[3, 3, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Due in 60 days */}
          <div style={cardStyle}>
            <div style={sectionTitle}>Vencimentos — próximos 60 dias ({dueClauses.length})</div>
            {overdueClauses.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(220,38,38,0.70)', marginBottom: 6 }}>
                  EM ATRASO ({overdueClauses.length})
                </div>
                {overdueClauses.map(c => (
                  <DueRow key={c.id} clause={c} athleteName={athleteName(athleteIdForClause(c))} overdue />
                ))}
              </div>
            )}
            {dueClauses.length === 0 && overdueClauses.length === 0 && (
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(26,20,16,0.35)', textAlign: 'center', padding: '16px 0' }}>
                Nenhum vencimento nos próximos 60 dias
              </div>
            )}
            {dueClauses.slice(0, 10).map(c => (
              <DueRow key={c.id} clause={c} athleteName={athleteName(athleteIdForClause(c))} />
            ))}
            {dueClauses.length > 10 && (
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(26,20,16,0.35)', marginTop: 8, textAlign: 'center' }}>
                +{dueClauses.length - 10} mais
              </div>
            )}
          </div>

          {/* Currency exposure */}
          <div style={cardStyle}>
            <div style={sectionTitle}>Exposição Cambial</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>
              <thead>
                <tr>
                  {['Moeda', 'A Receber', 'A Pagar', 'Líquido', 'Em R$'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '4px 8px', color: 'rgba(26,20,16,0.40)', fontSize: 10, fontWeight: 500, letterSpacing: '0.1em', borderBottom: '1px solid rgba(26,20,16,0.08)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(exposures).map(([cur, v]) => {
                  const net = v.receivable - v.payable
                  const netBRL = toBRL(Math.abs(net), cur)
                  return (
                    <tr key={cur}>
                      <td style={{ padding: '6px 8px', fontWeight: 700, color: '#be8c4a' }}>{cur}</td>
                      <td style={{ padding: '6px 8px', color: '#059669' }}>{v.receivable.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: '6px 8px', color: '#dc2626' }}>{v.payable.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: '6px 8px', color: net >= 0 ? '#059669' : '#dc2626', fontWeight: 600 }}>
                        {net >= 0 ? '+' : ''}{net.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '6px 8px', color: 'rgba(26,20,16,0.55)' }}>
                        R$ {netBRL.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                      </td>
                    </tr>
                  )
                })}
                {Object.keys(exposures).length === 0 && (
                  <tr><td colSpan={5} style={{ padding: '12px 8px', color: 'rgba(26,20,16,0.35)', textAlign: 'center' }}>Sem dados</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right column — alerts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={sectionTitle}>Alertas ({unreadAlerts.length} não lidos)</div>
            </div>

            {unreadAlerts.length === 0 && (
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(26,20,16,0.35)', textAlign: 'center', padding: '16px 0' }}>
                Nenhum alerta ativo
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {unreadAlerts.map(alert => {
                const bg = alert.severity === 'RED' ? 'rgba(220,38,38,0.08)' : 'rgba(245,158,11,0.08)'
                const border = alert.severity === 'RED' ? 'rgba(220,38,38,0.25)' : 'rgba(245,158,11,0.25)'
                const dot = alert.severity === 'RED' ? '#dc2626' : '#f59e0b'
                return (
                  <div key={alert.id} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: dot, flexShrink: 0, marginTop: 4 }} />
                        <div>
                          <div style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 12, color: '#1a1410', marginBottom: 2 }}>
                            {alert.message}
                          </div>
                          <Link to={`/atletas/${alert.athlete_id}`} style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: '#be8c4a', textDecoration: 'none' }}>
                            {athleteName(alert.athlete_id)} →
                          </Link>
                        </div>
                      </div>
                      <button
                        onClick={() => handleMarkRead(alert.id)}
                        style={{ background: 'none', border: 'none', color: 'rgba(26,20,16,0.35)', fontSize: 10, cursor: 'pointer', fontFamily: "'IBM Plex Mono', monospace", whiteSpace: 'nowrap', flexShrink: 0 }}
                      >
                        lido
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Quick links */}
          <div style={cardStyle}>
            <div style={sectionTitle}>Acesso Rápido</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { to: '/atletas', label: 'Lista de Atletas' },
                { to: '/clausulas-venda', label: 'Cláusulas de Venda' },
                { to: '/consolidado', label: 'Relatório Consolidado' },
                { to: '/clubes', label: 'Passivos — Clubes' },
                { to: '/intermediarios', label: 'Passivos — Intermediários' },
              ].map(link => (
                <Link
                  key={link.to}
                  to={link.to}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 10px', borderRadius: 7, textDecoration: 'none',
                    fontFamily: "'Inter', system-ui, sans-serif", fontSize: 13, color: '#1a1410',
                    background: 'rgba(190,140,74,0.06)', border: '1px solid rgba(190,140,74,0.10)',
                  }}
                >
                  {link.label}
                  <span style={{ color: '#be8c4a', fontSize: 14 }}>→</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── DueRow sub-component ──────────────────────────────────────────────────

function DueRow({ clause, athleteName, overdue = false }: { clause: Clause; athleteName: string; overdue?: boolean }) {
  const sym: Record<string, string> = { BRL: 'R$', EUR: '€', USD: '$', GBP: '£' }
  const s = sym[clause.currency] ?? clause.currency
  return (
    <Link
      to={`/atletas/${clause.athlete_id}`}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '7px 10px', borderRadius: 7, textDecoration: 'none',
        background: overdue ? 'rgba(220,38,38,0.06)' : isDueSoon(clause.due_date, clause.payment_status) ? 'rgba(245,158,11,0.06)' : 'transparent',
        marginBottom: 2,
      }}
    >
      <div>
        <div style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 12, color: '#1a1410', fontWeight: 500 }}>
          {athleteName} — {clause.description}
        </div>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(26,20,16,0.45)', marginTop: 1 }}>
          {clause.due_date ? fmtDate(clause.due_date) : '—'}
        </div>
      </div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: overdue ? '#dc2626' : '#1a1410', fontWeight: 600, whiteSpace: 'nowrap', marginLeft: 8 }}>
        {clause.original_value != null ? `${s} ${clause.original_value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}` : '—'}
      </div>
    </Link>
  )
}

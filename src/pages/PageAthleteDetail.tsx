import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  fetchAthlete, fetchAthleteContracts, fetchAthleteClauses,
  fetchAthleteInstallments, fetchAthleteAlerts, markAlertRead,
  updateClause, registerInstallmentPayment,
} from '../lib/athleteQueries'
import { fmtDate, fmtCurrencyShort, fmtCurrencyFull, fmtRelative, isOverdue, isDueSoon, CURRENCY_SYMBOLS } from '../lib/format'
import type {
  Athlete, Contract, Clause, ClauseInstallment, Alert,
  AthleteStatus, AchievementStatus, Currency,
} from '../types/athlete-system'
import { CLAUSE_TYPE_LABELS, CONTRACT_TYPE_LABELS } from '../types/athlete-system'
import PaymentModal from '../components/athletes/PaymentModal'

const font     = "'Inter', system-ui, sans-serif"
const fontMono = "'IBM Plex Mono', 'JetBrains Mono', monospace"

// ── Status styling ─────────────────────────────────────────────────────────

const ATHLETE_STATUS_STYLE: Record<AthleteStatus, { bg: string; fg: string; label: string }> = {
  ATIVO:      { bg: '#dcf0e4', fg: '#166534', label: 'Ativo' },
  EMPRESTADO: { bg: 'rgba(190,140,74,0.18)', fg: '#7a6244', label: 'Emprestado' },
  VENDIDO:    { bg: 'rgba(59,130,246,0.12)', fg: '#1d4ed8', label: 'Vendido' },
  DESLIGADO:  { bg: 'rgba(156,163,175,0.18)', fg: '#6b7280', label: 'Desligado' },
}

const PAYMENT_STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  PENDENTE:          { bg: 'rgba(59,130,246,0.12)', fg: '#1d4ed8' },
  PAGA:              { bg: '#dcf0e4', fg: '#166534' },
  PARCIALMENTE_PAGA: { bg: 'rgba(190,140,74,0.15)', fg: '#7a6244' },
  EM_ATRASO:         { bg: 'var(--neg-tint)', fg: 'var(--neg)' },
  CANCELADA:         { bg: 'rgba(156,163,175,0.12)', fg: '#6b7280' },
}

const ACHIEVEMENT_STATUS_STYLE: Record<AchievementStatus, { bg: string; fg: string }> = {
  PENDENTE:      { bg: 'rgba(59,130,246,0.12)', fg: '#1d4ed8' },
  ATINGIDA:      { bg: '#dcf0e4', fg: '#166534' },
  NAO_ATINGIDA:  { bg: 'var(--neg-tint)', fg: 'var(--neg)' },
  NAO_APLICAVEL: { bg: 'rgba(156,163,175,0.12)', fg: '#6b7280' },
}

function StatusBadge({ status, map }: { status: string; map: Record<string, { bg: string; fg: string }> }) {
  const s = map[status] ?? { bg: '#eee', fg: '#333' }
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 5, fontSize: 9, fontWeight: 600,
      fontFamily: fontMono, letterSpacing: '0.10em', textTransform: 'uppercase',
      background: s.bg, color: s.fg, whiteSpace: 'nowrap',
    }}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

function Avatar({ athlete }: { athlete: Athlete }) {
  const [err, setErr] = useState(false)
  const initials = athlete.short_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  if (athlete.profile_photo_url && !err) {
    return <img src={athlete.profile_photo_url} alt={athlete.short_name} onError={() => setErr(true)}
      style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', border: '3px solid rgba(190,140,74,0.35)', flexShrink: 0 }} />
  }
  return (
    <div style={{
      width: 72, height: 72, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg, #1a1410 0%, #3a2e1c 100%)',
      border: '3px solid rgba(190,140,74,0.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: fontMono, fontSize: 24, fontWeight: 700, color: '#be8c4a',
    }}>{initials}</div>
  )
}

// ── Financial summary cards ────────────────────────────────────────────────

function FinancialCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="card" style={{ padding: '14px 18px', minWidth: 160 }}>
      <div style={{ fontSize: 9, fontFamily: fontMono, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, fontFamily: fontMono, color: color ?? 'var(--ink-primary)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

// ── Tabs ──────────────────────────────────────────────────────────────────

type Tab = 'clausulas' | 'vinculos' | 'parcelas' | 'alertas'

const TABS: { id: Tab; label: string }[] = [
  { id: 'clausulas', label: 'Cláusulas Ativas' },
  { id: 'vinculos',  label: 'Vínculos / Histórico' },
  { id: 'parcelas',  label: 'Parcelas' },
  { id: 'alertas',   label: 'Alertas' },
]

// ── Clause Actions Menu ───────────────────────────────────────────────────

function ClauseActions({ clause, onMarkAchieved, onPay, onCancel }: {
  clause: Clause
  onMarkAchieved: () => void
  onPay: () => void
  onCancel: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ padding: '4px 8px', borderRadius: 5, border: '1px solid var(--divider-strong)', background: 'transparent', fontSize: 11, fontFamily: font, cursor: 'pointer', color: 'var(--text-secondary)' }}>
        ⋯
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', right: 0, top: '110%', background: 'var(--cream-card)',
            border: '1px solid var(--divider)', borderRadius: 8, padding: '4px 0',
            boxShadow: 'var(--shadow-panel)', zIndex: 50, minWidth: 180,
          }}>
            {clause.achievement_status === 'PENDENTE' && (
              <button onClick={() => { onMarkAchieved(); setOpen(false) }}
                style={{ width: '100%', padding: '8px 14px', textAlign: 'left', background: 'none', border: 'none', fontSize: 12, fontFamily: font, cursor: 'pointer', color: 'var(--ink-primary)' }}>
                ✓ Marcar como Atingida
              </button>
            )}
            {clause.payment_status !== 'PAGA' && clause.payment_status !== 'CANCELADA' && clause.original_value && (
              <button onClick={() => { onPay(); setOpen(false) }}
                style={{ width: '100%', padding: '8px 14px', textAlign: 'left', background: 'none', border: 'none', fontSize: 12, fontFamily: font, cursor: 'pointer', color: 'var(--ink-primary)' }}>
                💰 Registrar Pagamento
              </button>
            )}
            {clause.payment_status !== 'CANCELADA' && (
              <button onClick={() => { onCancel(); setOpen(false) }}
                style={{ width: '100%', padding: '8px 14px', textAlign: 'left', background: 'none', border: 'none', fontSize: 12, fontFamily: font, cursor: 'pointer', color: 'var(--neg)' }}>
                ✕ Cancelar Cláusula
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────

export default function PageAthleteDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [athlete, setAthlete] = useState<Athlete | null>(null)
  const [contracts, setContracts] = useState<Contract[]>([])
  const [clauses, setClauses] = useState<Clause[]>([])
  const [installments, setInstallments] = useState<ClauseInstallment[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('clausulas')
  const [payClauseId, setPayClauseId] = useState<string | null>(null)
  const [payInstallId, setPayInstallId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    if (!id) return
    setLoading(true)
    const [ath, contr, cls, inst, alrt] = await Promise.all([
      fetchAthlete(id),
      fetchAthleteContracts(id),
      fetchAthleteClauses(id),
      fetchAthleteInstallments(id),
      fetchAthleteAlerts(id),
    ])
    setAthlete(ath)
    setContracts(contr)
    setClauses(cls)
    setInstallments(inst)
    setAlerts(alrt)
    setLoading(false)
  }, [id])

  useEffect(() => { loadData() }, [loadData])

  // ── Financial summary ──────────────────────────────────────────────────
  const openStatuses = ['PENDENTE', 'PARCIALMENTE_PAGA', 'EM_ATRASO']
  const RATE: Record<Currency, number> = { BRL: 1, EUR: 6.10, USD: 5.55, GBP: 7.10 }

  const receivable = clauses
    .filter(c => c.creditor_party.toLowerCase().includes('botafogo') && openStatuses.includes(c.payment_status) && c.original_value)
    .reduce((s, c) => s + (c.original_value ?? 0) * RATE[c.currency], 0)

  const payable = clauses
    .filter(c => c.debtor_party.toLowerCase().includes('botafogo') && openStatuses.includes(c.payment_status) && c.original_value)
    .reduce((s, c) => s + (c.original_value ?? 0) * RATE[c.currency], 0)

  const paid = clauses.reduce((s, c) => s + (c.amount_paid_brl ?? 0), 0)

  // Currency exposure (non-BRL open)
  const exposure: Partial<Record<Currency, number>> = {}
  clauses.filter(c => c.currency !== 'BRL' && openStatuses.includes(c.payment_status) && c.original_value)
    .forEach(c => {
      exposure[c.currency] = (exposure[c.currency] ?? 0) + (c.original_value ?? 0)
    })

  // Alert counts
  const warnCount = alerts.filter(a => a.alert_type === 'VENCIMENTO_PROXIMO' && !a.is_read).length
  const unreadCrit = alerts.filter(a => a.severity === 'RED' && !a.is_read).length

  // ── Clause actions ─────────────────────────────────────────────────────
  async function handleMarkAchieved(clauseId: string) {
    const updated = await updateClause(clauseId, { achievement_status: 'ATINGIDA', achievement_date: new Date().toISOString().split('T')[0] })
    setClauses(prev => prev.map(c => c.id === clauseId ? updated : c))
  }

  async function handleCancelClause(clauseId: string) {
    const updated = await updateClause(clauseId, { payment_status: 'CANCELADA' })
    setClauses(prev => prev.map(c => c.id === clauseId ? updated : c))
  }

  async function handleInstallmentPayment(installId: string, payment: { date: string; valueCurrency: number; valueBRL: number; rate: number; notes: string }) {
    await registerInstallmentPayment(installId, {
      payment_date: payment.date,
      amount_paid_currency: payment.valueCurrency,
      amount_paid_brl: payment.valueBRL,
      exchange_rate: payment.rate,
      notes: payment.notes,
    })
    setInstallments(prev => prev.map(i => i.id === installId ? { ...i, payment_status: 'PAGA', payment_date: payment.date, amount_paid_brl: payment.valueBRL } : i))
    setPayInstallId(null)
  }

  async function handleClausePayment(clauseId: string, payment: { date: string; valueCurrency: number; valueBRL: number; rate: number; notes: string }) {
    const clause = clauses.find(c => c.id === clauseId)
    if (!clause) return
    const updated = await updateClause(clauseId, {
      payment_status: 'PAGA', payment_date: payment.date,
      amount_paid_currency: payment.valueCurrency, amount_paid_brl: payment.valueBRL,
      exchange_rate: payment.rate, notes: payment.notes,
    })
    setClauses(prev => prev.map(c => c.id === clauseId ? updated : c))
    setPayClauseId(null)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', fontFamily: fontMono, color: 'var(--text-muted)', fontSize: 12, letterSpacing: '0.14em' }}>
      CARREGANDO...
    </div>
  )

  if (!athlete) return (
    <div style={{ padding: 40, textAlign: 'center', fontFamily: font }}>
      <div style={{ fontSize: 16, color: 'var(--text-muted)' }}>Atleta não encontrado.</div>
      <button onClick={() => navigate('/atletas')} style={{ marginTop: 16, padding: '8px 20px', borderRadius: 7, border: '1px solid var(--divider-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, fontFamily: font, cursor: 'pointer' }}>← Voltar</button>
    </div>
  )

  const st = ATHLETE_STATUS_STYLE[athlete.current_status]
  const th: React.CSSProperties = {
    padding: '8px 12px', fontSize: 9, fontWeight: 500, textTransform: 'uppercase',
    background: 'var(--tbl-head)', color: 'var(--ink-secondary)', borderBottom: '1px solid var(--divider-strong)',
    fontFamily: fontMono, letterSpacing: '0.14em', whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1,
  }
  const td: React.CSSProperties = {
    padding: '10px 12px', fontSize: 12, color: 'var(--ink-primary)', fontFamily: font,
    borderBottom: '1px solid var(--divider-soft)', verticalAlign: 'middle',
  }

  const payClause = payClauseId ? clauses.find(c => c.id === payClauseId) ?? null : null
  const payInstall = payInstallId ? installments.find(i => i.id === payInstallId) ?? null : null

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1400, margin: '0 auto' }}>

      {/* Breadcrumb */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', fontFamily: font }}>
        <Link to="/atletas" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Atletas</Link>
        <span>/</span>
        <span style={{ color: 'var(--ink-primary)' }}>{athlete.short_name}</span>
      </div>

      {/* ── Athlete Header ── */}
      <div className="card" style={{ padding: '20px 24px', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <Avatar athlete={athlete} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink-primary)', fontFamily: font, margin: 0 }}>{athlete.full_name}</h1>
              <span style={{ padding: '3px 10px', borderRadius: 6, background: st.bg, color: st.fg, fontSize: 10, fontWeight: 700, fontFamily: fontMono, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                {st.label}
              </span>
              {unreadCrit > 0 && (
                <span title={`${unreadCrit} alerta(s) crítico(s)`} style={{ padding: '3px 8px', borderRadius: 5, background: 'var(--neg-tint)', color: 'var(--neg)', fontSize: 10, fontWeight: 600, fontFamily: fontMono, cursor: 'pointer' }} onClick={() => setTab('alertas')}>
                  🔴 {unreadCrit}
                </span>
              )}
              {warnCount > 0 && (
                <span title={`${warnCount} alerta(s) de atenção`} style={{ padding: '3px 8px', borderRadius: 5, background: 'var(--warn-tint)', color: 'var(--warn)', fontSize: 10, fontWeight: 600, fontFamily: fontMono, cursor: 'pointer' }} onClick={() => setTab('alertas')}>
                  🟡 {warnCount}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-secondary)', fontFamily: font }}>
              {athlete.nationality && <span>🌍 {athlete.nationality}</span>}
              {athlete.birth_date && <span>📅 {fmtDate(athlete.birth_date)}</span>}
              {athlete.agent_name && <span>🤝 Agente: {athlete.agent_name}{athlete.agent_contact ? ` — ${athlete.agent_contact}` : ''}</span>}
            </div>
            {athlete.notes && (
              <div style={{ marginTop: 8, fontSize: 12, color: athlete.notes.includes('⚠️') ? 'var(--warn)' : 'var(--text-muted)', background: athlete.notes.includes('⚠️') ? 'var(--warn-tint)' : 'var(--bg-subtle)', borderRadius: 6, padding: '6px 10px', fontFamily: font }}>
                {athlete.notes}
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <Link to={`/atletas/${athlete.id}/contratos/novo`}
              style={{ padding: '8px 16px', background: '#be8c4a', border: 'none', borderRadius: 8, color: '#fff', fontFamily: font, fontSize: 12, fontWeight: 600, textDecoration: 'none', display: 'inline-block' }}>
              + Novo Vínculo
            </Link>
          </div>
        </div>
      </div>

      {/* ── Financial Summary Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        <FinancialCard label="A Receber" value={fmtCurrencyShort(receivable, 'BRL')} sub="Botafogo como credor" color="var(--pos)" />
        <FinancialCard label="A Pagar" value={fmtCurrencyShort(payable, 'BRL')} sub="Botafogo como devedor" color="var(--neg)" />
        <FinancialCard label="Já Recebido / Pago" value={fmtCurrencyShort(paid, 'BRL')} />
        <div className="card" style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: 9, fontFamily: fontMono, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>Exposição Cambial</div>
          {Object.entries(exposure).length === 0
            ? <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>—</div>
            : Object.entries(exposure).map(([cur, val]) => (
              <div key={cur} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                <span style={{ fontFamily: fontMono, fontSize: 11, color: 'var(--text-muted)' }}>{cur}</span>
                <span style={{ fontFamily: fontMono, fontSize: 13, fontWeight: 600, color: 'var(--ink-primary)' }}>
                  {fmtCurrencyShort(val, cur as Currency)}
                </span>
              </div>
            ))
          }
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--divider)', marginBottom: 16 }}>
        {TABS.map(t => {
          const count = t.id === 'alertas' ? alerts.filter(a => !a.is_read).length : 0
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                padding: '10px 18px', border: 'none', background: 'none', fontFamily: font,
                fontSize: 13, fontWeight: tab === t.id ? 600 : 400, cursor: 'pointer',
                color: tab === t.id ? '#be8c4a' : 'var(--text-secondary)',
                borderBottom: tab === t.id ? '2px solid #be8c4a' : '2px solid transparent',
                marginBottom: -2, display: 'flex', alignItems: 'center', gap: 6,
              }}>
              {t.label}
              {count > 0 && (
                <span style={{ padding: '1px 6px', borderRadius: 10, background: 'var(--neg-tint)', color: 'var(--neg)', fontSize: 9, fontFamily: fontMono }}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Tab: Cláusulas Ativas ── */}
      {tab === 'clausulas' && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: 'left', minWidth: 150 }}>Tipo</th>
                  <th style={{ ...th, textAlign: 'left', minWidth: 220 }}>Descrição</th>
                  <th style={{ ...th, minWidth: 120 }}>Credor</th>
                  <th style={{ ...th, minWidth: 120 }}>Devedor</th>
                  <th style={{ ...th, textAlign: 'right', minWidth: 110 }}>Valor</th>
                  <th style={{ ...th, minWidth: 70 }}>Moeda</th>
                  <th style={{ ...th, minWidth: 90 }}>Atingimento</th>
                  <th style={{ ...th, minWidth: 90 }}>Pagamento</th>
                  <th style={{ ...th, minWidth: 90 }}>Vencimento</th>
                  <th style={{ ...th, minWidth: 60 }}></th>
                </tr>
              </thead>
              <tbody>
                {clauses.length === 0 && (
                  <tr><td colSpan={10} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Nenhuma cláusula cadastrada.</td></tr>
                )}
                {clauses.map(c => {
                  const overdue = isOverdue(c.due_date, c.payment_status)
                  const soon = isDueSoon(c.due_date, c.payment_status)
                  const rowBg = overdue ? 'var(--row-late-bg)' : soon ? 'var(--warn-tint)' : 'transparent'
                  return (
                    <tr key={c.id} style={{ background: rowBg }}>
                      <td style={td}>
                        <span style={{ fontSize: 10, fontFamily: fontMono, fontWeight: 600, color: 'var(--text-muted)' }}>
                          {CLAUSE_TYPE_LABELS[c.clause_type]}
                        </span>
                      </td>
                      <td style={{ ...td, maxWidth: 280 }}>
                        <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.description}</div>
                        {c.condition_description && (
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.condition_description}</div>
                        )}
                        {c.notes?.includes('⚠️') && <span style={{ fontSize: 10, color: 'var(--warn)' }}>⚠️</span>}
                      </td>
                      <td style={{ ...td, fontSize: 11, color: 'var(--text-secondary)', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.creditor_party}</td>
                      <td style={{ ...td, fontSize: 11, color: 'var(--text-secondary)', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.debtor_party}</td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: fontMono, fontWeight: 500 }}>
                        {c.original_value ? fmtCurrencyShort(c.original_value, c.currency) : c.percentage_value ? `${c.percentage_value}%` : '—'}
                      </td>
                      <td style={{ ...td, fontFamily: fontMono, fontSize: 11, color: 'var(--text-muted)' }}>{c.currency}</td>
                      <td style={td}><StatusBadge status={c.achievement_status} map={ACHIEVEMENT_STATUS_STYLE} /></td>
                      <td style={td}><StatusBadge status={c.payment_status} map={PAYMENT_STATUS_STYLE} /></td>
                      <td style={{ ...td, fontFamily: fontMono, fontSize: 11, color: overdue ? 'var(--neg)' : soon ? 'var(--warn)' : 'var(--ink-secondary)', fontWeight: overdue ? 700 : 400 }}>
                        {c.due_date ? fmtDate(c.due_date) : '—'}
                        {(overdue || soon) && <div style={{ fontSize: 9 }}>{fmtRelative(c.due_date)}</div>}
                      </td>
                      <td style={td}>
                        <ClauseActions clause={c}
                          onMarkAchieved={() => handleMarkAchieved(c.id)}
                          onPay={() => setPayClauseId(c.id)}
                          onCancel={() => handleCancelClause(c.id)}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tab: Vínculos / Histórico ── */}
      {tab === 'vinculos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {contracts.length === 0 && (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontFamily: font }}>Nenhum vínculo cadastrado.</div>
          )}
          {contracts.map(ct => {
            const ctClauses = clauses.filter(c => c.contract_id === ct.id)
            const typeStyle: Record<string, { bg: string; fg: string }> = {
              ENTRADA:           { bg: '#dcf0e4', fg: '#166534' },
              SAIDA:             { bg: 'rgba(59,130,246,0.12)', fg: '#1d4ed8' },
              EMPRESTIMO_SAIDA:  { bg: 'rgba(190,140,74,0.15)', fg: '#7a6244' },
              EMPRESTIMO_ENTRADA:{ bg: 'rgba(168,85,247,0.12)', fg: '#7c3aed' },
            }
            const ts = typeStyle[ct.type] ?? { bg: '#eee', fg: '#333' }
            return (
              <div key={ct.id} className="card" style={{ padding: '18px 22px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ padding: '3px 8px', borderRadius: 5, background: ts.bg, color: ts.fg, fontSize: 9, fontWeight: 700, fontFamily: fontMono, letterSpacing: '0.10em', textTransform: 'uppercase' }}>
                        {CONTRACT_TYPE_LABELS[ct.type]}
                      </span>
                      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-primary)', fontFamily: font }}>{ct.counterpart_club}</span>
                      {ct.counterpart_country && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{ct.counterpart_country}</span>}
                      <StatusBadge status={ct.status} map={{ ATIVO: { bg: '#dcf0e4', fg: '#166534' }, ENCERRADO: { bg: 'rgba(156,163,175,0.18)', fg: '#6b7280' }, RESCINDIDO: { bg: 'var(--neg-tint)', fg: 'var(--neg)' } }} />
                    </div>
                    <div style={{ display: 'flex', gap: 20, fontSize: 12, color: 'var(--text-secondary)', fontFamily: font, flexWrap: 'wrap' }}>
                      <span>Início: {fmtDate(ct.start_date)}</span>
                      {ct.end_date && <span>Fim: {fmtDate(ct.end_date)}</span>}
                      {ct.transfer_fee_gross && <span style={{ fontWeight: 600, color: 'var(--ink-primary)' }}>
                        {CURRENCY_SYMBOLS[ct.transfer_currency]} {ct.transfer_fee_gross.toLocaleString('pt-BR')}
                      </span>}
                      <span style={{ color: 'var(--text-muted)' }}>{ctClauses.length} cláusula{ctClauses.length !== 1 ? 's' : ''}</span>
                    </div>
                    {ct.description && <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)', fontFamily: font }}>{ct.description}</div>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Tab: Parcelas ── */}
      {tab === 'parcelas' && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 380px)', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
              <thead>
                <tr>
                  <th style={{ ...th, minWidth: 90, textAlign: 'left' }}>Vencimento</th>
                  <th style={{ ...th, textAlign: 'left', minWidth: 200 }}>Cláusula</th>
                  <th style={{ ...th, textAlign: 'right', minWidth: 110 }}>Valor</th>
                  <th style={{ ...th, minWidth: 60 }}>Moeda</th>
                  <th style={{ ...th, minWidth: 90 }}>Status</th>
                  <th style={{ ...th, minWidth: 90 }}>Pagamento</th>
                  <th style={{ ...th, textAlign: 'right', minWidth: 110 }}>Pago (BRL)</th>
                  <th style={{ ...th, minWidth: 60 }}></th>
                </tr>
              </thead>
              <tbody>
                {installments.length === 0 && (
                  <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Nenhuma parcela cadastrada.</td></tr>
                )}
                {installments.map(inst => {
                  const cls = clauses.find(c => c.id === inst.clause_id)
                  const overdue = isOverdue(inst.due_date, inst.payment_status)
                  const soon = isDueSoon(inst.due_date, inst.payment_status)
                  const rowBg = overdue ? 'var(--row-late-bg)' : soon ? 'var(--warn-tint)' : 'transparent'
                  return (
                    <tr key={inst.id} style={{ background: rowBg }}>
                      <td style={{ ...td, fontFamily: fontMono, fontSize: 12, color: overdue ? 'var(--neg)' : soon ? 'var(--warn)' : 'var(--ink-secondary)', fontWeight: overdue ? 700 : 400 }}>
                        {fmtDate(inst.due_date)}
                        {(overdue || soon) && <div style={{ fontSize: 9 }}>{fmtRelative(inst.due_date)}</div>}
                      </td>
                      <td style={{ ...td, maxWidth: 240 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: fontMono, marginBottom: 2 }}>Parcela {inst.installment_number}</div>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cls?.description ?? '—'}</div>
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: fontMono, fontWeight: 500 }}>
                        {fmtCurrencyFull(inst.original_value, inst.currency)}
                      </td>
                      <td style={{ ...td, fontFamily: fontMono, fontSize: 11, color: 'var(--text-muted)' }}>{inst.currency}</td>
                      <td style={td}><StatusBadge status={inst.payment_status} map={PAYMENT_STATUS_STYLE} /></td>
                      <td style={{ ...td, fontFamily: fontMono, fontSize: 12, color: 'var(--text-muted)' }}>
                        {inst.payment_date ? fmtDate(inst.payment_date) : '—'}
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: fontMono, fontSize: 12, color: inst.amount_paid_brl ? 'var(--pos)' : 'var(--text-muted)', fontWeight: inst.amount_paid_brl ? 600 : 400 }}>
                        {inst.amount_paid_brl ? fmtCurrencyShort(inst.amount_paid_brl, 'BRL') : '—'}
                      </td>
                      <td style={td}>
                        {inst.payment_status !== 'PAGA' && inst.payment_status !== 'CANCELADA' && (
                          <button onClick={() => setPayInstallId(inst.id)}
                            style={{ padding: '4px 10px', borderRadius: 5, border: '1px solid var(--divider-strong)', background: 'transparent', fontSize: 10, fontFamily: font, cursor: 'pointer', color: 'var(--pos)', fontWeight: 600 }}>
                            Pagar
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tab: Alertas ── */}
      {tab === 'alertas' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {alerts.length === 0 && (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontFamily: font }}>Nenhum alerta.</div>
          )}
          {alerts.map(al => {
            const sevStyle: Record<string, { bg: string; fg: string; border: string }> = {
              RED:    { bg: 'var(--neg-tint)', fg: 'var(--neg)', border: 'rgba(185,28,28,0.20)' },
              YELLOW: { bg: 'var(--warn-tint)', fg: 'var(--warn)', border: 'rgba(184,138,42,0.25)' },
              GREEN:  { bg: '#dcf0e4', fg: '#166534', border: 'rgba(22,101,52,0.20)' },
            }
            const ss = sevStyle[al.severity]
            return (
              <div key={al.id} style={{ background: ss.bg, border: `1px solid ${ss.border}`, borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 12, opacity: al.is_read ? 0.55 : 1 }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>{al.severity === 'RED' ? '🔴' : al.severity === 'YELLOW' ? '🟡' : '🟢'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: al.is_read ? 400 : 600, color: ss.fg, fontFamily: font }}>{al.message}</div>
                  <div style={{ fontSize: 10, color: ss.fg, opacity: 0.65, marginTop: 3, fontFamily: fontMono }}>{fmtDate(al.created_at)}</div>
                </div>
                {!al.is_read && (
                  <button onClick={() => { markAlertRead(al.id); setAlerts(prev => prev.map(a => a.id === al.id ? { ...a, is_read: true } : a)) }}
                    style={{ padding: '3px 8px', borderRadius: 5, border: `1px solid ${ss.border}`, background: 'transparent', fontSize: 10, fontFamily: font, cursor: 'pointer', color: ss.fg, flexShrink: 0 }}>
                    Marcar lido
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Payment Modals ── */}
      {payClause && (
        <PaymentModal
          label={payClause.description}
          currency={payClause.currency}
          value={payClause.original_value ?? 0}
          onClose={() => setPayClauseId(null)}
          onSave={p => handleClausePayment(payClause.id, p)}
        />
      )}
      {payInstall && (
        <PaymentModal
          label={`Parcela ${payInstall.installment_number} — ${clauses.find(c => c.id === payInstall.clause_id)?.description ?? ''}`}
          currency={payInstall.currency}
          value={payInstall.original_value}
          onClose={() => setPayInstallId(null)}
          onSave={p => handleInstallmentPayment(payInstall.id, p)}
        />
      )}
    </div>
  )
}

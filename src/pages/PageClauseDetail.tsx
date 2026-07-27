// src/pages/PageClauseDetail.tsx
// Página ÚNICA de uma obrigação/transação (cláusula). Reúne TODAS as informações
// num só lugar, acessível por uma URL própria (/obrigacoes/:clauseId) a partir de
// qualquer tela: qual jogador, qual transação (contrato) vinculada, contraparte,
// valores, e o FLUXO DE PAGAMENTO (parcelas) — com edição de tudo e registro de
// pagamentos parcela a parcela.

import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  fetchClause, fetchAthlete, fetchAthleteContracts, fetchClauseInstallments,
  updateClause, deleteClause, deleteClauseInstallments, createClauseInstallments,
  markInstallmentPaid, revertInstallment, registerInstallmentPayment,
  fetchClubs, fetchIntermediaries,
} from '../lib/athleteQueries'
import { buildNameIndex, norm } from '../lib/importHelpers'
import type { Athlete, Clause, Contract, ClauseInstallment, Currency, ClauseType } from '../types/athlete-system'
import { CLAUSE_TYPE_LABELS, CONTRACT_TYPE_LABELS } from '../types/athlete-system'
import { fmtDate, fmtCurrencyShort, isOverdue, todayISO } from '../lib/format'
import PageHero from '../components/PageHero'
import NumberInput from '../components/NumberInput'
import RefLink from '../components/RefLink'
import FlowBuilder, { type FlowLine } from '../components/FlowBuilder'
import PaymentModal from '../components/athletes/PaymentModal'
import { Icon, IconButton, IconRow } from '../components/Icon'
import { InstallmentEditModal } from '../components/modals/EditModals'
import { useAuth } from '../context/AuthContext'

const font = "'Inter', system-ui, sans-serif"
const fontMono = "'IBM Plex Mono', monospace"
const CUR: Currency[] = ['BRL', 'EUR', 'USD', 'GBP']
const CLAUSE_TYPES = Object.keys(CLAUSE_TYPE_LABELS) as ClauseType[]

const PAYMENT_STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  PENDENTE: { bg: 'rgba(91,107,122,0.12)', fg: '#5b6b7a' },
  PAGA: { bg: '#e5ece1', fg: '#3a6f3a' },
  PARCIALMENTE_PAGA: { bg: 'var(--accent-tint2)', fg: '#7a6244' },
  EM_ATRASO: { bg: 'var(--neg-tint)', fg: 'var(--neg)' },
  CANCELADA: { bg: 'rgba(156,163,175,0.12)', fg: '#6b7280' },
}

function Badge({ status }: { status: string }) {
  const s = PAYMENT_STATUS_STYLE[status] ?? { bg: 'var(--cream-inset)', fg: 'var(--ink-secondary)' }
  return <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 5, fontSize: 9, fontWeight: 600, fontFamily: fontMono, letterSpacing: '0.08em', textTransform: 'uppercase', background: s.bg, color: s.fg }}>{status.replace(/_/g, ' ')}</span>
}

const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 7, fontSize: 13, background: 'var(--cream-canvas)', border: '1px solid var(--input-border)', color: 'var(--ink-primary)', fontFamily: font, boxSizing: 'border-box' }
const lbl: React.CSSProperties = { fontSize: 9, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 3, display: 'block' }
const btnSolid: React.CSSProperties = { padding: '8px 20px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'var(--accent-on)', fontSize: 12, fontWeight: 600, fontFamily: font, cursor: 'pointer' }
const btnOutline: React.CSSProperties = { padding: '8px 16px', borderRadius: 8, border: '1px solid var(--divider-strong)', background: 'transparent', color: 'var(--ink-primary)', fontSize: 12, fontWeight: 600, fontFamily: font, cursor: 'pointer' }

export default function PageClauseDetail() {
  const { clauseId } = useParams<{ clauseId: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const canEdit = !profile || profile.role === 'master' || profile.role === 'juridico'

  const [clause, setClause] = useState<Clause | null>(null)
  const [athlete, setAthlete] = useState<Athlete | null>(null)
  const [contract, setContract] = useState<Contract | null>(null)
  const [parent, setParent] = useState<Contract | null>(null)
  const [installments, setInstallments] = useState<ClauseInstallment[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [editing, setEditing] = useState(false)
  const [showFlow, setShowFlow] = useState(false)
  const [payInstId, setPayInstId] = useState<string | null>(null)
  const [editInstId, setEditInstId] = useState<string | null>(null)
  const [clubIdx, setClubIdx] = useState<Map<string, string>>(new Map())
  const [agentIdx, setAgentIdx] = useState<Map<string, string>>(new Map())

  const load = useCallback(async () => {
    if (!clauseId) return
    setLoading(true)
    const cl = await fetchClause(clauseId)
    if (!cl) { setNotFound(true); setLoading(false); return }
    setClause(cl)
    const [ath, insts, contracts, clubs, agents] = await Promise.all([
      fetchAthlete(cl.athlete_id),
      fetchClauseInstallments(cl.id),
      fetchAthleteContracts(cl.athlete_id),
      fetchClubs(), fetchIntermediaries(),
    ])
    setAthlete(ath)
    setInstallments(insts)
    setClubIdx(buildNameIndex(clubs)); setAgentIdx(buildNameIndex(agents))
    const ct = cl.contract_id ? contracts.find(c => c.id === cl.contract_id) ?? null : null
    setContract(ct)
    setParent(ct?.related_contract_id ? contracts.find(c => c.id === ct.related_contract_id) ?? null : null)
    setLoading(false)
  }, [clauseId])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)', fontFamily: fontMono, fontSize: 12 }}>CARREGANDO...</div>
  if (notFound || !clause) return (
    <div style={{ padding: 40, textAlign: 'center', fontFamily: font }}>
      <div style={{ color: 'var(--text-muted)' }}>Obrigação não encontrada.</div>
      <button onClick={() => navigate('/atletas')} className="btn btn-outline" style={{ marginTop: 16 }}>← Voltar</button>
    </div>
  )

  const totalParc = installments.reduce((s, p) => s + p.original_value, 0)
  const paidParc = installments.filter(p => p.payment_status === 'PAGA').reduce((s, p) => s + p.original_value, 0)
  const total = installments.length ? totalParc : (clause.original_value ?? 0)
  const payInst = payInstId ? installments.find(i => i.id === payInstId) ?? null : null
  const editInst = editInstId ? installments.find(i => i.id === editInstId) ?? null : null

  // Credor/devedor viram link quando existe cadastro de clube ou agente com o nome.
  function partyNode(name: string) {
    const k = norm(name)
    const club = clubIdx.get(k)
    const agent = agentIdx.get(k)
    const to = club ? `/clubes/${club}` : agent ? `/intermediarios/${agent}` : null
    return to ? <RefLink to={to} title="Abrir cadastro da contraparte">{name}</RefLink> : <>{name}</>
  }

  async function handleQuickPay(id: string) { await markInstallmentPaid(id, todayISO()); load() }
  async function handleRevert(id: string) { await revertInstallment(id); load() }
  async function handlePay(id: string, p: { date: string; valueCurrency: number; valueBRL: number; rate: number; notes: string }) {
    await registerInstallmentPayment(id, { payment_date: p.date, amount_paid_currency: p.valueCurrency, amount_paid_brl: p.valueBRL, exchange_rate: p.rate, notes: p.notes })
    setPayInstId(null); load()
  }
  async function handleDelete() {
    if (!clause || !window.confirm('Excluir esta obrigação e suas parcelas? Esta ação não pode ser desfeita.')) return
    await deleteClause(clause.id)
    navigate(athlete ? `/atletas/${athlete.id}` : '/atletas')
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 920, margin: '0 auto' }}>
      <PageHero title={clause.description || CLAUSE_TYPE_LABELS[clause.clause_type]} subtitle={`${CLAUSE_TYPE_LABELS[clause.clause_type]} · ${athlete?.short_name ?? athlete?.full_name ?? 'Atleta'}`} />

      <div style={{ fontFamily: fontMono, fontSize: 11, color: 'var(--text-muted)', marginBottom: 18, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <Link to="/atletas" style={{ color: 'inherit', textDecoration: 'none' }}>Atletas</Link>
        <span>/</span>
        {athlete && <><Link to={`/atletas/${athlete.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{athlete.short_name ?? athlete.full_name}</Link><span>/</span></>}
        <span style={{ color: 'var(--ink-primary)' }}>Obrigação</span>
      </div>

      {/* Dados da obrigação */}
      <div className="card" style={{ padding: '20px 24px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 10, fontFamily: fontMono, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-secondary)', fontWeight: 700 }}>Dados da obrigação</div>
          {canEdit && (
            <IconRow>
              <IconButton icon={editing ? 'x' : 'edit'} label={editing ? 'Fechar edição' : 'Editar dados da obrigação'} onClick={() => setEditing(e => !e)} />
              <IconButton icon="trash" label="Excluir obrigação" tone="danger" onClick={handleDelete} />
            </IconRow>
          )}
        </div>

        {editing ? (
          <ClauseFields clause={clause} onSaved={() => { setEditing(false); load() }} onCancel={() => setEditing(false)} />
        ) : (
          <dl style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '8px 18px', fontFamily: font, fontSize: 13, margin: 0 }}>
            <dt style={dt}>Jogador</dt>
            <dd style={dd}>{athlete ? <RefLink to={`/atletas/${athlete.id}`} title="Abrir atleta">{athlete.full_name}</RefLink> : '—'}</dd>
            <dt style={dt}>Transação vinculada</dt>
            <dd style={dd}>
              {contract
                ? <RefLink to={`/atletas/${contract.athlete_id}?tab=historico`} title="Abrir vínculo">{CONTRACT_TYPE_LABELS[contract.type]} · {contract.counterpart_club || '—'}{contract.start_date ? ` · ${fmtDate(contract.start_date)}` : ''}</RefLink>
                : <span style={{ color: 'var(--text-muted)' }}>Nenhuma</span>}
              {parent && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>↳ vínculo pai: {CONTRACT_TYPE_LABELS[parent.type]} · {parent.counterpart_club}</div>}
            </dd>
            <dt style={dt}>Natureza</dt><dd style={dd}>{CLAUSE_TYPE_LABELS[clause.clause_type]}</dd>
            <dt style={dt}>Credor</dt><dd style={dd}>{partyNode(clause.creditor_party)}</dd>
            <dt style={dt}>Devedor</dt><dd style={dd}>{partyNode(clause.debtor_party)}</dd>
            <dt style={dt}>Valor</dt><dd style={dd}>{clause.original_value != null ? fmtCurrencyShort(clause.original_value, clause.currency) : (clause.percentage_value != null ? `${clause.percentage_value}%` : '—')}</dd>
            {clause.condition_description && <><dt style={dt}>Condição</dt><dd style={dd}>{clause.condition_description}</dd></>}
            <dt style={dt}>Status</dt><dd style={dd}><Badge status={clause.payment_status} /></dd>
          </dl>
        )}
      </div>

      {/* Fluxo de pagamento */}
      <div className="card" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 10, fontFamily: fontMono, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-secondary)', fontWeight: 700 }}>Fluxo de pagamento</div>
            <div style={{ fontSize: 12, fontFamily: fontMono, color: 'var(--text-secondary)', marginTop: 4 }}>
              {installments.length > 0 ? `${installments.length} parcela${installments.length !== 1 ? 's' : ''} · ${fmtCurrencyShort(paidParc, clause.currency)} pago de ${fmtCurrencyShort(total, clause.currency)}` : `Sem parcelas · total ${fmtCurrencyShort(total, clause.currency)}`}
            </div>
          </div>
          {canEdit && (
            <button onClick={() => setShowFlow(s => !s)} className="btn btn-outline">
              <Icon name={showFlow ? 'x' : 'flow'} size={14} />
              {showFlow ? 'Fechar' : (installments.length ? 'Editar fluxo' : 'Gerar fluxo')}
            </button>
          )}
        </div>

        {showFlow && clause && (
          <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--divider-soft)' }}>
            <FlowEditor clause={clause} installments={installments} onSaved={() => { setShowFlow(false); load() }} />
          </div>
        )}

        {installments.length === 0 ? (
          <div style={{ fontFamily: font, fontSize: 13, color: 'var(--text-muted)', padding: '10px 0' }}>
            Nenhuma parcela cadastrada. Use "{installments.length ? 'Editar' : 'Gerar'} fluxo" para lançar as parcelas (ex.: dividir {fmtCurrencyShort(total, clause.currency)} em vencimentos).
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {installments.slice().sort((a, b) => a.installment_number - b.installment_number).map(p => {
              const late = isOverdue(p.due_date, p.payment_status)
              const paid = p.payment_status === 'PAGA'
              return (
                <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '36px 120px 1fr 100px auto', gap: 10, alignItems: 'center', padding: '8px 12px', borderRadius: 8, background: 'var(--bg-subtle)', border: '1px solid var(--divider-soft)' }}>
                  <span style={{ fontFamily: fontMono, fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>{p.installment_number}</span>
                  <span style={{ fontFamily: fontMono, fontSize: 12, color: late ? 'var(--neg)' : 'var(--ink-secondary)', fontWeight: late ? 700 : 400 }}>{fmtDate(p.due_date)}</span>
                  <span style={{ fontFamily: fontMono, fontSize: 13, fontWeight: 600 }}>{fmtCurrencyShort(p.original_value, p.currency)}</span>
                  <Badge status={p.payment_status} />
                  {canEdit && (
                    <IconRow>
                      <IconButton icon="edit" label={`Editar parcela ${p.installment_number}`} onClick={() => setEditInstId(p.id)} />
                      {!paid && p.payment_status !== 'CANCELADA' && <>
                        <IconButton icon="check" label="Marcar como paga" onClick={() => handleQuickPay(p.id)} />
                        <IconButton icon="money" label="Registrar pagamento com câmbio" onClick={() => setPayInstId(p.id)} />
                      </>}
                      {paid && <IconButton icon="undo" label="Reverter pagamento" tone="muted" onClick={() => handleRevert(p.id)} />}
                    </IconRow>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {payInst && <PaymentModal label={`Parcela ${payInst.installment_number}`} currency={payInst.currency} value={payInst.original_value} onClose={() => setPayInstId(null)} onSave={p => handlePay(payInst.id, p)} />}
      {editInst && <InstallmentEditModal inst={editInst} onClose={() => setEditInstId(null)} onSaved={() => { setEditInstId(null); load() }} />}
    </div>
  )
}

const dt: React.CSSProperties = { color: 'var(--text-muted)', fontWeight: 500 }
const dd: React.CSSProperties = { margin: 0, color: 'var(--ink-primary)' }

// ── Formulário de edição dos dados da cláusula ───────────────────────────────
function ClauseFields({ clause, onSaved, onCancel }: { clause: Clause; onSaved: () => void; onCancel: () => void }) {
  const [f, setF] = useState({
    clause_type: clause.clause_type,
    description: clause.description ?? '',
    creditor_party: clause.creditor_party ?? '',
    debtor_party: clause.debtor_party ?? '',
    currency: clause.currency,
    original_value: clause.original_value != null ? String(clause.original_value) : '',
    percentage_value: clause.percentage_value != null ? String(clause.percentage_value) : '',
    condition_description: clause.condition_description ?? '',
    due_date: clause.due_date ?? '',
    payment_status: clause.payment_status,
  })
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }))
  async function save() {
    setSaving(true)
    try {
      await updateClause(clause.id, {
        clause_type: f.clause_type, description: f.description,
        creditor_party: f.creditor_party, debtor_party: f.debtor_party,
        currency: f.currency, original_value: f.original_value ? parseFloat(f.original_value) : null,
        percentage_value: f.percentage_value ? parseFloat(f.percentage_value) : null,
        condition_description: f.condition_description || null, due_date: f.due_date || null,
        payment_status: f.payment_status,
      })
      onSaved()
    } finally { setSaving(false) }
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div><label style={lbl}>Natureza</label>
        <select style={inp} value={f.clause_type} onChange={e => set('clause_type', e.target.value)}>
          {CLAUSE_TYPES.map(t => <option key={t} value={t}>{CLAUSE_TYPE_LABELS[t]}</option>)}
        </select>
      </div>
      <div><label style={lbl}>Descrição</label><input style={inp} value={f.description} onChange={e => set('description', e.target.value)} /></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div><label style={lbl}>Credor</label><input style={inp} value={f.creditor_party} onChange={e => set('creditor_party', e.target.value)} /></div>
        <div><label style={lbl}>Devedor</label><input style={inp} value={f.debtor_party} onChange={e => set('debtor_party', e.target.value)} /></div>
        <div><label style={lbl}>Valor</label><NumberInput style={inp} value={f.original_value} onChange={v => set('original_value', v)} /></div>
        <div><label style={lbl}>Moeda</label><select style={inp} value={f.currency} onChange={e => set('currency', e.target.value)}>{CUR.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
        <div><label style={lbl}>Percentual (%)</label><NumberInput style={inp} decimals={2} grouping={false} value={f.percentage_value} onChange={v => set('percentage_value', v)} /></div>
        <div><label style={lbl}>Vencimento</label><input style={inp} type="date" value={f.due_date} onChange={e => set('due_date', e.target.value)} /></div>
      </div>
      <div><label style={lbl}>Condição / gatilho</label><input style={inp} value={f.condition_description} onChange={e => set('condition_description', e.target.value)} /></div>
      <div><label style={lbl}>Status</label>
        <select style={inp} value={f.payment_status} onChange={e => set('payment_status', e.target.value)}>
          {['PENDENTE', 'PAGA', 'PARCIALMENTE_PAGA', 'EM_ATRASO', 'CANCELADA'].map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={btnOutline}>Cancelar</button>
        <button onClick={save} disabled={saving} style={btnSolid}>{saving ? 'Salvando…' : 'Salvar'}</button>
      </div>
    </div>
  )
}

// ── Editor de fluxo (FlowBuilder) ────────────────────────────────────────────
function FlowEditor({ clause, installments, onSaved }: { clause: Clause; installments: ClauseInstallment[]; onSaved: () => void }) {
  const [lines, setLines] = useState<FlowLine[]>(installments.slice().sort((a, b) => a.installment_number - b.installment_number).map(i => ({ due_date: i.due_date, value: i.original_value })))
  const [currency, setCurrency] = useState<Currency>(clause.currency)
  const [saving, setSaving] = useState(false)
  const total = lines.reduce((s, l) => s + (l.value || 0), 0)
  async function save() {
    setSaving(true)
    try {
      await deleteClauseInstallments(clause.id)
      const valid = lines.filter(l => l.due_date)
      if (valid.length > 0) {
        await createClauseInstallments(clause.id, clause.athlete_id, valid.map((l, i) => ({ installment_number: i + 1, due_date: l.due_date, original_value: l.value || 0, currency })))
        await updateClause(clause.id, { installments_total: valid.length, original_value: total, currency })
      } else {
        await updateClause(clause.id, { installments_total: 1, currency })
      }
      onSaved()
    } finally { setSaving(false) }
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <FlowBuilder currency={currency} onCurrencyChange={setCurrency} lines={lines} onChange={setLines} defaultFirst={clause.due_date ?? ''} seedRows={4} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: font }}>Salvar substitui as parcelas atuais. Total: <strong>{fmtCurrencyShort(total, currency)}</strong>.</span>
        <button onClick={save} disabled={saving} style={btnSolid}>{saving ? 'Salvando…' : 'Salvar fluxo'}</button>
      </div>
    </div>
  )
}

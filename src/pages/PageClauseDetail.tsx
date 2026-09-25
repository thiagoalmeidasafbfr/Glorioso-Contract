// src/pages/PageClauseDetail.tsx
// Página ÚNICA de uma obrigação/transação (cláusula). Reúne TODAS as informações
// num só lugar, acessível por uma URL própria (/obrigacoes/:clauseId) a partir de
// qualquer tela: qual jogador, qual transação (contrato) vinculada, contraparte,
// valores, e o FLUXO DE PAGAMENTO (parcelas) — com edição de tudo e registro de
// pagamentos parcela a parcela.

import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
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
import RowActions, { ActionLegend } from '../components/RowActions'
import { InstallmentEditModal } from '../components/modals/EditModals'
import { parseRJ, toggleItemRJ, markManyRJ, unmarkItemRJ } from '../lib/judicialRecovery'
import { useAuth } from '../context/AuthContext'
import { modalInput, modalLabel } from '../components/modals/styles'
import { PAYMENT_STATUS_TONE, PAYMENT_STATUS_LABEL, badgeStyle, humanizeEnum } from '../lib/tones'

const font = "var(--font-body)"
const fontMono = "var(--font-label)"
const CUR: Currency[] = ['BRL', 'EUR', 'USD', 'GBP']
const CLAUSE_TYPES = Object.keys(CLAUSE_TYPE_LABELS) as ClauseType[]



function Badge({ status }: { status: string }) {
  const tone = PAYMENT_STATUS_TONE[status as keyof typeof PAYMENT_STATUS_TONE] ?? 'neutral'
  return <span style={badgeStyle(tone)}>{PAYMENT_STATUS_LABEL[status] ?? humanizeEnum(status)}</span>
}

const inp = modalInput
const lbl = modalLabel

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
  const [selectedRJ, setSelectedRJ] = useState<Set<string>>(new Set())
  const [rjDate, setRjDate] = useState<string>(todayISO())

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

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-secondary)', fontFamily: fontMono, fontSize: 12 }}>CARREGANDO...</div>
  if (notFound || !clause) return (
    <div style={{ padding: 40, textAlign: 'center', fontFamily: font }}>
      <div style={{ color: 'var(--text-secondary)' }}>Obrigação não encontrada.</div>
      <button onClick={() => navigate('/atletas')} className="btn btn-outline" style={{ marginTop: 16 }}><Icon name="chevronLeft" size={16} /> Voltar</button>
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
  const parcRJ = installments.filter(p => parseRJ(p.notes))
  const selectableParcIds = installments.filter(p => !parseRJ(p.notes) && p.payment_status !== 'PAGA' && p.payment_status !== 'CANCELADA').map(p => p.id)
  const allParcSelected = selectableParcIds.length > 0 && selectableParcIds.every(pid => selectedRJ.has(pid))
  function toggleParcSel(pid: string) {
    setSelectedRJ(prev => {
      const next = new Set(prev)
      if (next.has(pid)) next.delete(pid); else next.add(pid)
      return next
    })
  }
  function toggleAllParcSel() {
    setSelectedRJ(prev => {
      if (allParcSelected) {
        const next = new Set(prev)
        for (const pid of selectableParcIds) next.delete(pid)
        return next
      }
      const next = new Set(prev)
      for (const pid of selectableParcIds) next.add(pid)
      return next
    })
  }
  async function bulkMarkParcRJ() {
    const chosen = installments.filter(p => selectedRJ.has(p.id) && !parseRJ(p.notes))
    if (chosen.length === 0) return
    if (!window.confirm(`Incluir ${chosen.length} parcela(s) na Recuperação Judicial em ${fmtDate(rjDate)}?`)) return
    await markManyRJ(chosen.map(p => ({ kind: 'inst' as const, id: p.id, notes: p.notes })), rjDate)
    setSelectedRJ(new Set())
    await load()
  }
  async function unmarkParcRJ(pid: string) {
    const p = installments.find(i => i.id === pid); if (!p) return
    if (!window.confirm('Retirar esta parcela da Recuperação Judicial?')) return
    await unmarkItemRJ({ kind: 'inst', id: pid }, p.notes)
    await load()
  }
  async function toggleClauseRJ() {
    if (!clause) return
    const marked = !!parseRJ(clause.notes)
    if (marked) {
      if (!window.confirm('Retirar a obrigação inteira da Recuperação Judicial?')) return
    } else {
      if (!window.confirm(`Incluir a obrigação inteira na Recuperação Judicial em ${fmtDate(rjDate)}?`)) return
    }
    await toggleItemRJ({ kind: 'clause', id: clause.id }, clause.notes, rjDate)
    await load()
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 920, margin: '0 auto' }}>
      <PageHero title={clause.description || CLAUSE_TYPE_LABELS[clause.clause_type]}
        crumbs={[
          { label: 'Atletas', to: '/atletas', icon: 'athletes' },
          ...(athlete ? [{ label: athlete.short_name ?? athlete.full_name, to: `/atletas/${athlete.id}` }] : []),
          { label: CLAUSE_TYPE_LABELS[clause.clause_type] },
        ]} />

      {/* Dados da obrigação */}
      <div className="card" style={{ padding: 'var(--gutter-card)', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 10, fontFamily: fontMono, letterSpacing: 'var(--text-overline-tracking)', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 400 }}>Dados da obrigação</div>
          {canEdit && (
            <IconRow>
              <IconButton
                icon="gavel"
                label={parseRJ(clause.notes) ? 'Retirar obrigação da Recuperação Judicial' : 'Incluir obrigação inteira na Recuperação Judicial'}
                tone={parseRJ(clause.notes) ? 'warn' : 'muted'}
                onClick={toggleClauseRJ}
              />
              <IconButton icon={editing ? 'x' : 'edit'} label={editing ? 'Fechar edição' : 'Editar dados da obrigação'} onClick={() => setEditing(e => !e)} />
              <IconButton icon="trash" label="Excluir obrigação" tone="danger" onClick={handleDelete} />
            </IconRow>
          )}
        </div>

        {parseRJ(clause.notes) && (
          <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'var(--surface-warning-soft)', fontSize: 12, color: 'var(--text-primary)' }}>
            <strong style={{ fontWeight: 500, color: 'var(--text-warning)' }}>Recuperação judicial</strong>
            {' — '}obrigação inteira incluída no processo em {fmtDate(parseRJ(clause.notes)!.filedAt)}.
          </div>
        )}

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
                : <span style={{ color: 'var(--text-secondary)' }}>Nenhuma</span>}
              {parent && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3 }}>Vínculo pai: {CONTRACT_TYPE_LABELS[parent.type]} · {parent.counterpart_club}</div>}
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
      <div className="card" style={{ padding: 'var(--gutter-card)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 10, fontFamily: fontMono, letterSpacing: 'var(--text-overline-tracking)', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 400 }}>Fluxo de pagamento</div>
            <div style={{ fontSize: 12, fontFamily: fontMono, color: 'var(--text-secondary)', marginTop: 4 }}>
              {installments.length > 0 ? `${installments.length} parcela${installments.length !== 1 ? 's' : ''} · ${fmtCurrencyShort(paidParc, clause.currency)} pago de ${fmtCurrencyShort(total, clause.currency)}` : `Sem parcelas · total ${fmtCurrencyShort(total, clause.currency)}`}
            </div>
          </div>
          {canEdit && (
            <button onClick={() => setShowFlow(s => !s)} className="btn btn-outline">
              <Icon name={showFlow ? 'x' : 'flow'} size={16} />
              {showFlow ? 'Fechar' : (installments.length ? 'Editar fluxo' : 'Gerar fluxo')}
            </button>
          )}
        </div>

        {showFlow && clause && (
          <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--divider-soft)' }}>
            <FlowEditor clause={clause} installments={installments} onSaved={() => { setShowFlow(false); load() }} />
          </div>
        )}

        {canEdit && installments.length > 0 && (
          <>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
              <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontFamily: fontMono, fontSize: 11, color: 'var(--ink-secondary)', cursor: selectableParcIds.length ? 'pointer' : 'default' }}>
                <input type="checkbox" checked={allParcSelected} disabled={selectableParcIds.length === 0} onChange={toggleAllParcSel} />
                Selecionar todas
              </label>
              {selectedRJ.size > 0 && (
                <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', padding: '4px 10px', borderRadius: 'var(--radius-md)', background: 'var(--surface-warning-soft)' }}>
                  <span style={{ fontFamily: fontMono, fontSize: 11, fontWeight: 500 }}>{selectedRJ.size} parcela(s)</span>
                  <span style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: 'var(--text-overline-tracking)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Protocolo:</span>
                  <input type="date" value={rjDate} onChange={e => setRjDate(e.target.value)} style={{ minHeight: 'var(--control-h-sm)', padding: '0 8px', fontSize: 12 }} />
                  <button onClick={bulkMarkParcRJ} className="btn btn-outline btn-sm" style={{ color: 'var(--text-warning)' }}>
                    Incluir na RJ
                  </button>
                  <button onClick={() => setSelectedRJ(new Set())} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontFamily: fontMono, fontSize: 10 }}>limpar</button>
                </span>
              )}
              {parcRJ.length > 0 && (
                <span style={{ fontFamily: fontMono, fontSize: 11, color: 'var(--warn)' }}>
                  {parcRJ.length} parcela(s) em RJ
                </span>
              )}
            </div>
            <ActionLegend items={['edit', 'markPaid', 'pay', 'revert', 'rj']} />
          </>
        )}

        {installments.length === 0 ? (
          <div style={{ fontFamily: font, fontSize: 13, color: 'var(--text-secondary)', padding: '10px 0' }}>
            Nenhuma parcela cadastrada. Use "{installments.length ? 'Editar' : 'Gerar'} fluxo" para lançar as parcelas (ex.: dividir {fmtCurrencyShort(total, clause.currency)} em vencimentos).
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {installments.slice().sort((a, b) => a.installment_number - b.installment_number).map(p => {
              const late = isOverdue(p.due_date, p.payment_status)
              const paid = p.payment_status === 'PAGA'
              const cancelled = p.payment_status === 'CANCELADA'
              const rj = parseRJ(p.notes)
              return (
                <div key={p.id} style={{
                  display: 'grid',
                  gridTemplateColumns: canEdit ? '28px 36px 120px 1fr 100px auto' : '36px 120px 1fr 100px auto',
                  gap: 10, alignItems: 'center', padding: '8px 12px', borderRadius: 'var(--radius-md)',
                  background: rj ? 'var(--surface-warning-soft)' : 'var(--surface-sunken)',
                }}>
                  {canEdit && (
                    <span style={{ textAlign: 'center' }}>
                      {!rj && !paid && !cancelled
                        ? <input type="checkbox" checked={selectedRJ.has(p.id)} onChange={() => toggleParcSel(p.id)} />
                        : <span style={{ color: 'var(--text-secondary)', fontFamily: fontMono, fontSize: 10 }}>—</span>}
                    </span>
                  )}
                  <span style={{ fontFamily: fontMono, fontSize: 11, color: 'var(--text-secondary)', textAlign: 'right' }}>{p.installment_number}</span>
                  <span style={{ fontFamily: fontMono, fontSize: 12, color: late ? 'var(--neg)' : 'var(--ink-secondary)', fontWeight: late ? 500 : 400 }}>{fmtDate(p.due_date)}</span>
                  <span style={{ fontFamily: fontMono, fontSize: 13, fontWeight: 500 }}>
                    {fmtCurrencyShort(p.original_value, p.currency)}
                    {rj && <span style={{ ...badgeStyle('warning'), marginLeft: 8 }} title={`Em RJ desde ${fmtDate(rj.filedAt)}`}>RJ</span>}
                  </span>
                  <Badge status={p.payment_status} />
                  {canEdit && (
                    <RowActions small={false}
                      edit={{ onClick: () => setEditInstId(p.id), label: `Editar parcela ${p.installment_number}` }}
                      markPaid={{
                        onClick: !paid && !cancelled ? () => handleQuickPay(p.id) : undefined,
                        reason: paid ? 'parcela já paga' : 'parcela cancelada',
                      }}
                      pay={{
                        onClick: !paid && !cancelled ? () => setPayInstId(p.id) : undefined,
                        reason: paid ? 'parcela já paga' : 'parcela cancelada',
                      }}
                      revert={{ onClick: paid ? () => handleRevert(p.id) : undefined, reason: 'a parcela não está paga' }}
                      rj={rj
                        ? { onClick: () => unmarkParcRJ(p.id), marked: true }
                        : (!paid && !cancelled ? { onClick: async () => { await toggleItemRJ({ kind: 'inst', id: p.id }, p.notes, rjDate); await load() } } : undefined)}
                    />
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

const dt: React.CSSProperties = { color: 'var(--text-secondary)', fontWeight: 500 }
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
          {['PENDENTE', 'PAGA', 'PARCIALMENTE_PAGA', 'EM_ATRASO', 'CANCELADA'].map(s => <option key={s} value={s}>{humanizeEnum(s)}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} className="btn btn-outline">Cancelar</button>
        <button onClick={save} disabled={saving} className="btn btn-primary">{saving ? 'Salvando…' : 'Salvar'}</button>
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
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: font }}>Salvar substitui as parcelas atuais. Total: <strong>{fmtCurrencyShort(total, currency)}</strong>.</span>
        <button onClick={save} disabled={saving} className="btn btn-primary">{saving ? 'Salvando…' : 'Salvar fluxo'}</button>
      </div>
    </div>
  )
}

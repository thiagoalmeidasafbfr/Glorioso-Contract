// src/components/modals/EditModals.tsx
// Modais de EDIÇÃO compartilhados por todas as telas (ficha do atleta, página da
// obrigação, cadastro de clube/agente, consolidado, acordos). Cada modal grava
// direto na camada de dados e avisa via `onSaved()` — assim qualquer tela que
// liste uma parcela, cláusula ou passivo consegue oferecer o botão de editar sem
// duplicar formulário.

import { useEffect, useState } from 'react'
import type {
  Clause, ClauseInstallment, ClubLiability, IntermediaryLiability, ClauseType, Currency,
} from '../../types/athlete-system'
import { CLAUSE_TYPE_LABELS } from '../../types/athlete-system'
import {
  updateInstallment, deleteInstallment, updateClause, deleteClause,
  updateClubLiability, updateIntermediaryLiability,
  deleteClubLiability, deleteIntermediaryLiability,
  fetchClauseInstallments, deleteClauseInstallments, createClauseInstallments,
} from '../../lib/athleteQueries'
import { promoteLiabilityToClause, PROMOTE_HINT, type LiabKind } from '../../lib/liabilityFlow'
import { fmtCurrencyShort } from '../../lib/format'
import { Icon } from '../Icon'
import NumberInput from '../NumberInput'
import FlowBuilder, { type FlowLine } from '../FlowBuilder'
import { modalInput, modalLabel } from './styles'
import { humanizeEnum } from '../../lib/tones'
import { tr, trf } from '../../i18n'

const font = "var(--font-body)"
const mono = "var(--font-label)"
const CUR: Currency[] = ['BRL', 'EUR', 'USD', 'GBP']

/** Casca do modal: overlay, painel, título/subtítulo e rodapé de ações. */
export function ModalShell({ title, subtitle, width = 560, onClose, children, footer }: {
  title: string; subtitle?: string; width?: number; onClose: () => void
  children: React.ReactNode; footer: React.ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div role="dialog" aria-modal="true" aria-label={tr(title)} className="modal-backdrop"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel" style={{ padding: 'var(--space-6)', width, display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div>
          <div style={{ fontSize: 'var(--text-subtitle-size)', fontWeight: 400, letterSpacing: '-.01em', color: 'var(--text-primary)', fontFamily: font }}>{tr(title)}</div>
          {subtitle && <div style={{ fontSize: 'var(--text-body-sm-size)', color: 'var(--text-secondary)', fontFamily: mono, marginTop: 4 }}>{tr(subtitle)}</div>}
        </div>
        {children}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>{footer}</div>
      </div>
    </div>
  )
}

// ── Parcela ──────────────────────────────────────────────────────────────────

export function InstallmentEditModal({ inst, onClose, onSaved }: {
  inst: ClauseInstallment; onClose: () => void; onSaved: () => void
}) {
  const [f, setF] = useState({
    due_date: inst.due_date ?? '',
    original_value: String(inst.original_value ?? ''),
    currency: inst.currency,
    payment_status: inst.payment_status,
    payment_date: inst.payment_date ?? '',
    notes: inst.notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }))

  async function save() {
    setSaving(true)
    try {
      await updateInstallment(inst.id, {
        due_date: f.due_date,
        original_value: f.original_value ? parseFloat(f.original_value) : 0,
        currency: f.currency as Currency,
        payment_status: f.payment_status,
        payment_date: f.payment_date || null,
        notes: f.notes || null,
      })
      onSaved()
    } finally { setSaving(false) }
  }
  async function remove() {
    if (!window.confirm(trf('Excluir a parcela {0}? Esta ação não pode ser desfeita.', inst.installment_number))) return
    setSaving(true)
    try { await deleteInstallment(inst.id); onSaved() } finally { setSaving(false) }
  }

  return (
    <ModalShell title={trf('Editar parcela {0}', inst.installment_number)} width={500} onClose={onClose}
      footer={<>
        <button onClick={remove} className="btn btn-danger" style={{ marginRight: 'auto' }} disabled={saving}>{tr('Excluir parcela')}</button>
        <button onClick={onClose} className="btn btn-outline">{tr('Cancelar')}</button>
        <button onClick={save} className="btn btn-primary" disabled={saving}>{saving ? tr('Salvando…') : tr('Salvar')}</button>
      </>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div><label style={modalLabel}>{tr('Vencimento')}</label><input style={modalInput} type="date" value={f.due_date} onChange={e => set('due_date', e.target.value)} /></div>
        <div><label style={modalLabel}>{tr('Valor')}</label><NumberInput style={modalInput} value={f.original_value} onChange={v => set('original_value', v)} /></div>
        <div><label style={modalLabel}>{tr('Moeda')}</label><select style={modalInput} value={f.currency} onChange={e => set('currency', e.target.value)}>{CUR.map(c => <option key={c} value={c}>{tr(c)}</option>)}</select></div>
        <div><label style={modalLabel}>{tr('Status')}</label>
          <select style={modalInput} value={f.payment_status} onChange={e => set('payment_status', e.target.value)}>
            {['PENDENTE', 'PAGA', 'EM_ATRASO', 'CANCELADA'].map(s => <option key={s} value={s}>{tr(humanizeEnum(s))}</option>)}
          </select>
        </div>
        <div><label style={modalLabel}>{tr('Data pagamento')}</label><input style={modalInput} type="date" value={f.payment_date} onChange={e => set('payment_date', e.target.value)} /></div>
      </div>
      <div><label style={modalLabel}>{tr('Observações')}</label><textarea style={{ ...modalInput, minHeight: 48, resize: 'vertical' }} value={f.notes} onChange={e => set('notes', e.target.value)} /></div>
    </ModalShell>
  )
}

// ── Cláusula / obrigação ─────────────────────────────────────────────────────

export function ClauseEditModal({ clause, onClose, onSaved, allowDelete = true }: {
  clause: Clause; onClose: () => void; onSaved: () => void; allowDelete?: boolean
}) {
  const [f, setF] = useState({
    clause_type: clause.clause_type as string,
    description: clause.description ?? '',
    creditor_party: clause.creditor_party ?? '',
    debtor_party: clause.debtor_party ?? '',
    currency: clause.currency as string,
    original_value: clause.original_value != null ? String(clause.original_value) : '',
    percentage_value: clause.percentage_value != null ? String(clause.percentage_value) : '',
    condition_description: clause.condition_description ?? '',
    due_date: clause.due_date ?? '',
    payment_status: clause.payment_status as string,
    achievement_status: clause.achievement_status as string,
    notes: clause.notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }))
  const parcelada = clause.installments_total > 1

  async function save() {
    setSaving(true)
    try {
      await updateClause(clause.id, {
        clause_type: f.clause_type as ClauseType,
        description: f.description,
        creditor_party: f.creditor_party,
        debtor_party: f.debtor_party,
        currency: f.currency as Currency,
        original_value: f.original_value ? parseFloat(f.original_value) : null,
        percentage_value: f.percentage_value ? parseFloat(f.percentage_value) : null,
        condition_description: f.condition_description || null,
        due_date: f.due_date || null,
        payment_status: f.payment_status as Clause['payment_status'],
        achievement_status: f.achievement_status as Clause['achievement_status'],
        notes: f.notes || null,
      })
      onSaved()
    } finally { setSaving(false) }
  }
  async function remove() {
    if (!window.confirm(tr('Excluir esta obrigação e todas as suas parcelas? Esta ação não pode ser desfeita.'))) return
    setSaving(true)
    try { await deleteClause(clause.id); onSaved() } finally { setSaving(false) }
  }

  return (
    <ModalShell title={tr('Editar obrigação')} width={640} onClose={onClose}
      subtitle={`${tr(CLAUSE_TYPE_LABELS[clause.clause_type] ?? clause.clause_type)}${parcelada ? trf(' · {0}x (valores por parcela no fluxo)', clause.installments_total) : ''}`}
      footer={<>
        {allowDelete && <button onClick={remove} className="btn btn-danger" style={{ marginRight: 'auto' }} disabled={saving}>{tr('Excluir')}</button>}
        <button onClick={onClose} className="btn btn-outline">{tr('Cancelar')}</button>
        <button onClick={save} className="btn btn-primary" disabled={saving}>{saving ? tr('Salvando…') : tr('Salvar')}</button>
      </>}>
      <div><label style={modalLabel}>{tr('Natureza')}</label>
        <select style={modalInput} value={f.clause_type} onChange={e => set('clause_type', e.target.value)}>
          {(Object.keys(CLAUSE_TYPE_LABELS) as ClauseType[]).map(t => <option key={t} value={t}>{tr(CLAUSE_TYPE_LABELS[t])}</option>)}
        </select>
      </div>
      <div><label style={modalLabel}>{tr('Descrição')}</label><input style={modalInput} value={f.description} onChange={e => set('description', e.target.value)} /></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div><label style={modalLabel}>{tr('Credor')}</label><input style={modalInput} value={f.creditor_party} onChange={e => set('creditor_party', e.target.value)} /></div>
        <div><label style={modalLabel}>{tr('Devedor')}</label><input style={modalInput} value={f.debtor_party} onChange={e => set('debtor_party', e.target.value)} /></div>
        <div><label style={modalLabel}>{tr('Valor')}{parcelada ? tr(' total') : ''}</label><NumberInput style={modalInput} value={f.original_value} onChange={v => set('original_value', v)} /></div>
        <div><label style={modalLabel}>{tr('Moeda')}</label><select style={modalInput} value={f.currency} onChange={e => set('currency', e.target.value)}>{CUR.map(c => <option key={c} value={c}>{tr(c)}</option>)}</select></div>
        <div><label style={modalLabel}>{tr('Percentual (%)')}</label><NumberInput style={modalInput} decimals={2} grouping={false} value={f.percentage_value} onChange={v => set('percentage_value', v)} /></div>
        <div><label style={modalLabel}>{tr('Vencimento')}</label><input style={modalInput} type="date" value={f.due_date} onChange={e => set('due_date', e.target.value)} /></div>
        <div><label style={modalLabel}>{tr('Status pagamento')}</label>
          <select style={modalInput} value={f.payment_status} onChange={e => set('payment_status', e.target.value)}>
            {['PENDENTE', 'PAGA', 'PARCIALMENTE_PAGA', 'EM_ATRASO', 'CANCELADA'].map(s => <option key={s} value={s}>{tr(humanizeEnum(s))}</option>)}
          </select>
        </div>
        <div><label style={modalLabel}>{tr('Atingimento')}</label>
          <select style={modalInput} value={f.achievement_status} onChange={e => set('achievement_status', e.target.value)}>
            {['PENDENTE', 'ATINGIDA', 'NAO_ATINGIDA', 'NAO_APLICAVEL'].map(s => <option key={s} value={s}>{tr(humanizeEnum(s))}</option>)}
          </select>
        </div>
      </div>
      <div><label style={modalLabel}>{tr('Condição / gatilho')}</label><input style={modalInput} value={f.condition_description} onChange={e => set('condition_description', e.target.value)} /></div>
      <div><label style={modalLabel}>{tr('Observações')}</label><textarea style={{ ...modalInput, minHeight: 52, resize: 'vertical' }} value={f.notes} onChange={e => set('notes', e.target.value)} /></div>
    </ModalShell>
  )
}

// ── Fluxo de parcelas da cláusula ────────────────────────────────────────────

export function ClauseFlowModal({ clause, onClose, onSaved }: {
  clause: Clause; onClose: () => void; onSaved: () => void
}) {
  const [lines, setLines] = useState<FlowLine[]>([])
  const [currency, setCurrency] = useState<Currency>(clause.currency)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    fetchClauseInstallments(clause.id).then(insts => {
      if (!alive) return
      setLines(insts
        .slice().sort((a, b) => a.installment_number - b.installment_number)
        .map(i => ({ due_date: i.due_date, value: i.original_value })))
      setLoading(false)
    })
    return () => { alive = false }
  }, [clause.id])

  const total = lines.reduce((s, l) => s + (l.value || 0), 0)

  async function save() {
    setSaving(true)
    try {
      await deleteClauseInstallments(clause.id)
      const valid = lines.filter(l => l.due_date)
      if (valid.length > 0) {
        await createClauseInstallments(clause.id, clause.athlete_id, valid.map((l, i) => ({
          installment_number: i + 1, due_date: l.due_date, original_value: l.value || 0, currency,
        })))
        await updateClause(clause.id, { installments_total: valid.length, original_value: total, currency })
      } else {
        await updateClause(clause.id, { installments_total: 1, currency })
      }
      onSaved()
    } finally { setSaving(false) }
  }

  return (
    <ModalShell title={tr('Fluxo de parcelas')} width={700} onClose={onClose}
      subtitle={`${CLAUSE_TYPE_LABELS[clause.clause_type]} · ${clause.description}`}
      footer={<>
        <span style={{ marginRight: 'auto', fontSize: 11, color: 'var(--text-secondary)', fontFamily: font }}>
          {tr('Salvar substitui as parcelas atuais. Total:')} <strong>{fmtCurrencyShort(total, currency)}</strong>.
        </span>
        <button onClick={onClose} className="btn btn-outline">{tr('Cancelar')}</button>
        <button onClick={save} className="btn btn-primary" disabled={saving || loading}>{saving ? tr('Salvando…') : tr('Salvar fluxo')}</button>
      </>}>
      {loading
        ? <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)', fontFamily: mono, fontSize: 12 }}>{tr('Carregando parcelas…')}</div>
        : <FlowBuilder currency={currency} onCurrencyChange={setCurrency} lines={lines} onChange={setLines}
            defaultFirst={clause.due_date ?? ''} seedRows={4} />}
    </ModalShell>
  )
}

// ── Passivo "flat" de clube / agente ─────────────────────────────────────────

export function LiabilityEditModal({ kind, liab, onClose, onSaved, onPromoted }: {
  kind: LiabKind; liab: ClubLiability | IntermediaryLiability; onClose: () => void; onSaved: () => void
  /** Chamado após virar obrigação — a tela abre o editor de fluxo da nova cláusula. */
  onPromoted?: (clauseId: string) => void
}) {
  const isClub = kind === 'club'
  const initialName = isClub ? (liab as ClubLiability).club_name : (liab as IntermediaryLiability).intermediary_name
  const [f, setF] = useState({
    name: initialName,
    description: liab.description ?? '',
    direction: liab.direction as string,
    amount: liab.amount != null ? String(liab.amount) : '',
    currency: liab.currency as string,
    due_date: liab.due_date ?? '',
    status: liab.status as string,
    condition_description: liab.condition_description ?? '',
    notes: liab.notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }))

  async function save() {
    setSaving(true)
    try {
      const patch = {
        description: f.description || null,
        direction: f.direction as ClubLiability['direction'],
        amount: f.amount ? parseFloat(f.amount) : 0,
        currency: f.currency as Currency,
        due_date: f.due_date || null,
        status: f.status as ClubLiability['status'],
        condition_description: f.condition_description || null,
        notes: f.notes || null,
      }
      if (isClub) await updateClubLiability(liab.id, { ...patch, club_name: f.name })
      else await updateIntermediaryLiability(liab.id, { ...patch, intermediary_name: f.name })
      onSaved()
    } finally { setSaving(false) }
  }
  async function remove() {
    if (!window.confirm(tr('Excluir esta obrigação?'))) return
    setSaving(true)
    try {
      if (isClub) await deleteClubLiability(liab.id)
      else await deleteIntermediaryLiability(liab.id)
      onSaved()
    } finally { setSaving(false) }
  }

  // Gera as parcelas aqui mesmo: salva o que foi editado, promove a obrigação e
  // devolve o id para a tela abrir o editor de fluxo.
  async function generateFlow() {
    setSaving(true)
    try {
      const patch = {
        description: f.description || null,
        direction: f.direction as ClubLiability['direction'],
        amount: f.amount ? parseFloat(f.amount) : 0,
        currency: f.currency as Currency,
        due_date: f.due_date || null,
        status: f.status as ClubLiability['status'],
        condition_description: f.condition_description || null,
        notes: f.notes || null,
      }
      if (isClub) await updateClubLiability(liab.id, { ...patch, club_name: f.name })
      else await updateIntermediaryLiability(liab.id, { ...patch, intermediary_name: f.name })
      const clause = await promoteLiabilityToClause(kind, {
        ...liab, ...patch,
        ...(isClub ? { club_name: f.name } : { intermediary_name: f.name }),
      } as ClubLiability | IntermediaryLiability)
      if (onPromoted) onPromoted(clause.id)
      else onSaved()
    } finally { setSaving(false) }
  }

  return (
    <ModalShell title={trf('Editar obrigação — {0}', isClub ? tr('clube') : tr('agente'))} width={560} onClose={onClose}
      footer={<>
        <button onClick={remove} className="btn btn-danger" style={{ marginRight: 'auto' }} disabled={saving}>{tr('Excluir')}</button>
        <button onClick={onClose} className="btn btn-outline">{tr('Cancelar')}</button>
        <button onClick={save} className="btn btn-primary" disabled={saving}>{saving ? tr('Salvando…') : tr('Salvar')}</button>
      </>}>
      <div><label style={modalLabel}>{isClub ? tr('Clube') : tr('Agente')}</label><input style={modalInput} value={f.name} onChange={e => set('name', e.target.value)} /></div>
      <div><label style={modalLabel}>{tr('Descrição')}</label><input style={modalInput} value={f.description} onChange={e => set('description', e.target.value)} placeholder={tr('Descrição da obrigação')} /></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div><label style={modalLabel}>{tr('Valor')}</label><NumberInput style={modalInput} value={f.amount} onChange={v => set('amount', v)} /></div>
        <div><label style={modalLabel}>{tr('Moeda')}</label><select style={modalInput} value={f.currency} onChange={e => set('currency', e.target.value)}>{CUR.map(c => <option key={c} value={c}>{tr(c)}</option>)}</select></div>
        <div><label style={modalLabel}>{tr('Direção')}</label>
          <select style={modalInput} value={f.direction} onChange={e => set('direction', e.target.value)}>
            <option value="A_PAGAR">{tr('A pagar')}</option><option value="A_RECEBER">{tr('A receber')}</option>
          </select>
        </div>
        <div><label style={modalLabel}>{tr('Vencimento')}</label><input style={modalInput} type="date" value={f.due_date} onChange={e => set('due_date', e.target.value)} /></div>
        <div><label style={modalLabel}>{tr('Status')}</label>
          <select style={modalInput} value={f.status} onChange={e => set('status', e.target.value)}>
            {['PENDENTE', 'PAGA', 'EM_ATRASO', 'CANCELADA'].map(s => <option key={s} value={s}>{tr(humanizeEnum(s))}</option>)}
          </select>
        </div>
      </div>
      <div><label style={modalLabel}>{tr('Condição')}</label><input style={modalInput} value={f.condition_description} onChange={e => set('condition_description', e.target.value)} /></div>
      <div><label style={modalLabel}>{tr('Observações')}</label><textarea style={{ ...modalInput, minHeight: 48, resize: 'vertical' }} value={f.notes} onChange={e => set('notes', e.target.value)} /></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--surface-info-soft)' }}>
        <span style={{ fontSize: 12, color: 'var(--ink-secondary)', fontFamily: font, flex: 1, minWidth: 220 }}>
          {tr('Precisa de parcelas?')} {tr(PROMOTE_HINT)}
        </span>
        <button onClick={generateFlow} className="btn btn-outline" disabled={saving}
          style={{ color: 'var(--text-info)', whiteSpace: 'nowrap' }}>
          <Icon name="split" size={16} /> {tr('Gerar parcelas')}
        </button>
      </div>
    </ModalShell>
  )
}

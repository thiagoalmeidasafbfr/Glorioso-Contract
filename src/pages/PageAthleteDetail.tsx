import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import ImageUpload from '../components/ImageUpload'
import RemunerationChart from '../components/RemunerationChart'
import OwnershipBar from '../components/OwnershipBar'
import PaymentModal from '../components/athletes/PaymentModal'
import {
  fetchAthlete, updateAthlete, deleteAthlete, updateContract, updateContractFlowsCurrency, deleteContract, fetchAthleteContracts, fetchAthleteClauses,
  fetchAthleteInstallments, createClause, createClauseInstallments, deleteClause,
  updateInstallment, markInstallmentPaid, revertInstallment,
  deleteClubLiability, deleteIntermediaryLiability,
  fetchAthleteAlerts, updateClause,
  fetchAthleteEconomicRights, createEconomicRight, deleteEconomicRight,
  fetchAthleteSalaryTriggers, createSalaryTrigger, markTriggerAchieved, resetTrigger, deleteSalaryTrigger,
  fetchAthleteClubLiabilities, fetchAthleteIntermediaryLiabilities,
  fetchClubs, fetchIntermediaries,
  fetchAthletePJs, createPJ, updatePJ, deletePJ,
  fetchAthleteImageRights,
} from '../lib/athleteQueries'
import { buildNameIndex, norm } from '../lib/importHelpers'
import RefLink from '../components/RefLink'
import NumberInput from '../components/NumberInput'
import FlowBuilder, { type FlowLine } from '../components/FlowBuilder'
import EntityPicker from '../components/EntityPicker'
import PageHero from '../components/PageHero'
import { Icon, IconButton, IconRow } from '../components/Icon'
import RowActions, { ActionLegend } from '../components/RowActions'
import { promoteLiabilityToClause } from '../lib/liabilityFlow'
import {
  InstallmentEditModal, ClauseEditModal, ClauseFlowModal, LiabilityEditModal,
} from '../components/modals/EditModals'
import { fmtDate, fmtCurrencyShort, isOverdue, todayISO, CURRENCY_SYMBOLS, addMonths } from '../lib/format'
import type {
  Athlete, Contract, Clause, ClauseType, ClauseInstallment, Alert, EconomicRight,
  SalaryTrigger, ClubLiability, IntermediaryLiability, ImageRight, AthletePJ,
  AthleteStatus, AthleteCategory, Currency, HolderType,
  TriggerMetric, NewSalaryTriggerInput, NewEconomicRightInput, NewAthletePJInput,
  NewClauseInput, SellOnBasis,
} from '../types/athlete-system'
import {
  CLAUSE_TYPE_LABELS, CONTRACT_TYPE_LABELS, HOLDER_TYPE_LABELS, HOLDER_TYPE_COLORS,
  ATHLETE_CATEGORY_LABELS, TRANSFER_CONTRACT_TYPES, ACCESSORY_CONTRACT_TYPES,
  SELL_ON_CLAUSE_TYPES, SELLON_BASIS_LABELS, sellOnConditionText,
  TRIGGER_METRIC_LABELS, TRIGGER_STATUS_LABELS,
} from '../types/athlete-system'
import { regenerateSalaryFlow } from '../lib/salaryFlow'
import { createRenegotiation, decodeAcordo, isAcordo, type AcordoSource, type RenegotiationInput } from '../lib/renegotiation'
import RenegotiationEditModal from '../components/modals/RenegotiationEditModal'
import LoanShareModal from '../components/modals/LoanShareModal'
import { loanShareTriggers, decodeLoanShare, splitLoanSalary } from '../lib/loanSalary'
import { sumOwnership, isOwnershipValid, sortRights } from '../lib/ownership'
import { effectiveSalary } from '../lib/salary'
import { useAuth } from '../context/AuthContext'
import { exportWorkbook } from '../lib/xlsx-utils'
import { COLS_ATLETA_CONSOLIDADO, buildConsolidatedRows } from '../lib/athleteConsolidado'

const font     = "var(--font-body)"
const fontMono = "var(--font-label)"
const isBFRparty = (s: string) => s.toLowerCase().includes('botafogo') || s.toLowerCase() === 'bfr'

const ATHLETE_STATUS_STYLE: Record<AthleteStatus, { bg: string; fg: string; label: string }> = {
  ATIVO:      { bg: '#e6ece2', fg: '#3a6f3a', label: 'Ativo' },
  EMPRESTADO: { bg: 'var(--accent-tint2)', fg: '#7a6244', label: 'Emprestado' },
  VENDIDO:    { bg: 'rgba(91,107,122,0.12)', fg: '#5b6b7a', label: 'Vendido' },
  DESLIGADO:  { bg: 'rgba(156,163,175,0.18)', fg: '#6b7280', label: 'Desligado' },
}
const PAYMENT_STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  PENDENTE:          { bg: 'rgba(91,107,122,0.12)', fg: '#5b6b7a' },
  PAGA:              { bg: '#e6ece2', fg: '#3a6f3a' },
  PARCIALMENTE_PAGA: { bg: 'var(--accent-tint2)', fg: '#7a6244' },
  EM_ATRASO:         { bg: 'var(--neg-tint)', fg: 'var(--neg)' },
  CANCELADA:         { bg: 'rgba(156,163,175,0.12)', fg: '#6b7280' },
}
const TRIGGER_STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  PENDENTE:     { bg: 'rgba(91,107,122,0.12)', fg: '#5b6b7a' },
  ATINGIDA:     { bg: '#e6ece2', fg: '#3a6f3a' },
  NAO_ATINGIDA: { bg: 'rgba(156,163,175,0.18)', fg: '#6b7280' },
}
const ATHLETE_POSITIONS = ['', 'Goleiro', 'Zagueiro', 'Lateral Direito', 'Lateral Esquerdo', 'Volante', 'Meia', 'Meia-atacante', 'Atacante']

function StatusBadge({ status, map }: { status: string; map: Record<string, { bg: string; fg: string }> }) {
  const s = map[status] ?? { bg: '#eee', fg: '#333' }
  return (
    <span style={{ padding: '2px 8px', borderRadius: 5, fontSize: 9, fontWeight: 600, fontFamily: fontMono, letterSpacing: '0.10em', textTransform: 'uppercase', background: s.bg, color: s.fg, whiteSpace: 'nowrap' }}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

function LabelSpan({ children }: { children: React.ReactNode }) {
  return <span style={{ fontFamily: fontMono, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginRight: 2 }}>{children}</span>
}

function FinancialCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="card" style={{ padding: '14px 18px', minWidth: 160 }}>
      <div style={{ fontSize: 9, fontFamily: fontMono, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, fontFamily: fontMono, color: color ?? 'var(--ink-primary)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

// Big number multi-moeda: mostra a moeda dominante em destaque e as demais em
// linha secundária. Usado nos KPIs de custo consolidado do atleta.
const RATE_BRL: Record<string, number> = { BRL: 1, EUR: 6.10, USD: 5.55, GBP: 7.10 }
function BigNumberCard({ label, totals, sub, color }: {
  label: string; totals: Partial<Record<Currency, number>>; sub?: string; color?: string
}) {
  const entries = (Object.entries(totals) as [Currency, number][])
    .filter(([, v]) => v)
    .sort((a, b) => b[1] * (RATE_BRL[b[0]] ?? 1) - a[1] * (RATE_BRL[a[0]] ?? 1))
  const primary = entries[0]
  const rest = entries.slice(1)
  return (
    <div className="card" style={{ padding: '14px 18px', minWidth: 160 }}>
      <div style={{ fontSize: 9, fontFamily: fontMono, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, fontFamily: fontMono, color: color ?? 'var(--ink-primary)', fontVariantNumeric: 'tabular-nums' }}>
        {primary ? fmtCurrencyShort(primary[1], primary[0]) : '—'}
      </div>
      {rest.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: fontMono, marginTop: 3 }}>
          {rest.map(([c, v]) => `+ ${fmtCurrencyShort(v, c)}`).join(' · ')}
        </div>
      )}
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

// ── Ações da cláusula — ícones minimalistas, sem menu escondido ─────────────
function ClauseActions({ clause, onOpen, onEdit, onFlow, onMarkAchieved, onPay, onCancel }: {
  clause: Clause; onOpen: () => void; onEdit: () => void; onFlow: () => void; onMarkAchieved: () => void; onPay: () => void; onCancel: () => void
}) {
  const canPay = clause.payment_status !== 'PAGA' && clause.payment_status !== 'CANCELADA' && !!clause.original_value
  const canAchieve = clause.achievement_status === 'PENDENTE'
  const canCancel = clause.payment_status !== 'CANCELADA'
  return (
    <RowActions align="center" small={false}
      open={{ onClick: onOpen }}
      edit={{ onClick: onEdit }}
      schedule={{ onClick: onFlow }}
      markPaid={{
        onClick: canAchieve ? onMarkAchieved : undefined,
        label: 'Marcar meta como atingida',
        reason: 'a meta já foi avaliada',
      }}
      pay={{
        onClick: canPay ? onPay : undefined,
        reason: clause.payment_status === 'PAGA' ? 'obrigação já paga'
          : clause.payment_status === 'CANCELADA' ? 'obrigação cancelada'
          : 'sem valor definido (cláusula de valor futuro)',
      }}
      remove={{
        onClick: canCancel ? onCancel : undefined,
        label: 'Cancelar obrigação',
        reason: 'obrigação já cancelada',
      }}
    />
  )
}

function NewTriggerForm({ contract, onAdd }: { contract: Contract; onAdd: (input: NewSalaryTriggerInput) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState<NewSalaryTriggerInput>({ contract_id: contract.id, description: '', metric: 'JOGOS', threshold: null, new_salary: 0, new_image_value: null, currency: contract.salary_currency, notes: '' })
  const set = <K extends keyof NewSalaryTriggerInput>(k: K, v: NewSalaryTriggerInput[K]) => setF(prev => ({ ...prev, [k]: v }))
  const inp: React.CSSProperties = { padding: '7px 9px', borderRadius: 6, fontSize: 12, width: '100%', boxSizing: 'border-box', background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--input-color)', fontFamily: font }
  const lbl: React.CSSProperties = { fontSize: 9, fontFamily: fontMono, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 3, display: 'block' }
  if (!open) return <button onClick={() => setOpen(true)} className="btn btn-outline" style={{ borderStyle: 'dashed' }}><Icon name="plus" size={14} /> Nova meta de salário</button>
  async function submit() {
    if (!f.description.trim() || !f.new_salary) return
    await onAdd({ ...f, contract_id: contract.id })
    setF({ contract_id: contract.id, description: '', metric: 'JOGOS', threshold: null, new_salary: 0, new_image_value: null, currency: contract.salary_currency, notes: '' })
    setOpen(false)
  }
  return (
    <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, border: '1px solid var(--divider-strong)' }}>
      <div style={{ fontSize: 10, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-secondary)', fontWeight: 700 }}>Nova Meta de Aumento Salarial</div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
        <div><label style={lbl}>Descrição *</label><input style={inp} value={f.description} onChange={e => set('description', e.target.value)} placeholder="Ex: Ao atingir 10 jogos, salário sobe" /></div>
        <div><label style={lbl}>Métrica</label><select style={inp} value={f.metric} onChange={e => set('metric', e.target.value as TriggerMetric)}>{(Object.keys(TRIGGER_METRIC_LABELS) as TriggerMetric[]).map(m => <option key={m} value={m}>{TRIGGER_METRIC_LABELS[m]}</option>)}</select></div>
        <div><label style={lbl}>Meta (nº)</label><input style={inp} type="number" value={f.threshold ?? ''} onChange={e => set('threshold', e.target.value ? Number(e.target.value) : null)} placeholder="Ex: 10" /></div>
        <div><label style={lbl}>Novo salário CLT *</label><NumberInput style={inp} value={f.new_salary || ''} onChange={v => set('new_salary', v ? Number(v) : 0)} placeholder="Ex: 600.000" /></div>
        <div><label style={lbl}>Novo direito de imagem</label><NumberInput style={inp} value={f.new_image_value ?? ''} onChange={v => set('new_image_value', v ? Number(v) : null)} placeholder="Ex: 600.000 (opcional)" /></div>
        <div><label style={lbl}>Moeda</label><select style={inp} value={f.currency} onChange={e => set('currency', e.target.value as Currency)}>{(['BRL','EUR','USD','GBP'] as Currency[]).map(c => <option key={c} value={c}>{c}</option>)}</select></div>
        <div><label style={lbl}>Observações</label><input style={inp} value={f.notes} onChange={e => set('notes', e.target.value)} /></div>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={() => setOpen(false)} className="btn btn-outline">Cancelar</button>
        <button onClick={submit} disabled={!f.description.trim() || !f.new_salary} style={{ padding: '7px 18px', borderRadius: 7, border: 'none', background: (f.description.trim() && f.new_salary) ? 'var(--accent)' : '#ccc', color: '#fff', fontSize: 12, fontFamily: font, fontWeight: 600, cursor: (f.description.trim() && f.new_salary) ? 'pointer' : 'not-allowed' }}>Adicionar Meta</button>
      </div>
    </div>
  )
}

function TriggerRow({ t, canEdit, onMark, onReset, onDelete }: { t: SalaryTrigger; canEdit: boolean; onMark: (date: string) => void; onReset: () => void; onDelete: () => void }) {
  const [date, setDate] = useState(todayISO())
  const achieved = t.status === 'ATINGIDA'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 14px', borderRadius: 8, background: achieved ? '#e6ece2' : 'var(--bg-subtle)', border: `1px solid ${achieved ? 'rgba(58,111,58,0.25)' : 'var(--divider-soft)'}` }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-primary)', fontFamily: font }}>{t.description}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: fontMono, marginTop: 2 }}>{TRIGGER_METRIC_LABELS[t.metric]}{t.threshold != null ? ` ≥ ${t.threshold}` : ''} → CLT {fmtCurrencyShort(t.new_salary, t.currency)}{t.new_image_value != null ? ` + Imagem ${fmtCurrencyShort(t.new_image_value, t.currency)}` : ''}{t.notes ? ` · ${t.notes}` : ''}</div>
      </div>
      <span style={{ padding: '2px 8px', borderRadius: 5, fontSize: 9, fontWeight: 600, fontFamily: fontMono, letterSpacing: '0.10em', textTransform: 'uppercase', background: TRIGGER_STATUS_STYLE[t.status].bg, color: TRIGGER_STATUS_STYLE[t.status].fg }}>{TRIGGER_STATUS_LABELS[t.status]}</span>
      {achieved ? (
        <>
          <span style={{ fontSize: 11, fontFamily: fontMono, color: '#3a6f3a' }}>desde {fmtDate(t.achieved_date)}</span>
          {canEdit && <button onClick={onReset} className="btn btn-outline">Reverter</button>}
        </>
      ) : canEdit ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ padding: '5px 8px', borderRadius: 6, fontSize: 12, background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--input-color)', fontFamily: fontMono }} />
          <button onClick={() => onMark(date)} style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: 'var(--pos)', color: '#fff', fontSize: 11, fontFamily: font, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>✓ Meta atingida</button>
        </div>
      ) : null}
      {canEdit && <button onClick={onDelete} title="Remover meta" style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--divider-strong)', background: 'transparent', color: 'var(--neg)', fontSize: 12, cursor: 'pointer', lineHeight: 1 }}>✕</button>}
    </div>
  )
}

// ── Modal de edição do atleta (dados + titularidade econômica) ──────────────
interface RightRow { id?: string; holder_type: HolderType; holder_name: string; percentage: string; notes: string }

function EditAthleteModal({ athlete, rights, pjs, canEdit, onAddPJ, onUpdatePJ, onDeletePJ, imageCountByPj, onClose, onSaved }: {
  athlete: Athlete; rights: EconomicRight[]
  pjs: AthletePJ[]; canEdit: boolean
  onAddPJ: (i: NewAthletePJInput) => void
  onUpdatePJ: (id: string, patch: Partial<AthletePJ>) => void
  onDeletePJ: (id: string) => void
  imageCountByPj: Record<string, number>
  onClose: () => void; onSaved: () => void
}) {
  const [f, setF] = useState({
    full_name: athlete.full_name, short_name: athlete.short_name, position: athlete.position ?? '',
    current_status: athlete.current_status, category: (athlete.category ?? 'PROFISSIONAL') as AthleteCategory,
    nationality: athlete.nationality ?? '', birth_date: athlete.birth_date ?? '',
    cpf: athlete.cpf ?? '', passport_number: athlete.passport_number ?? '', notes: athlete.notes ?? '',
  })
  const [rows, setRows] = useState<RightRow[]>(rights.map(r => ({ id: r.id, holder_type: r.holder_type, holder_name: r.holder_name ?? '', percentage: String(r.percentage), notes: r.notes ?? '' })))
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }))
  const setRow = (i: number, patch: Partial<RightRow>) => setRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  const addRow = () => setRows(prev => [...prev, { holder_type: 'TERCEIRO', holder_name: '', percentage: '', notes: '' }])
  const removeRow = (i: number) => setRows(prev => prev.filter((_, idx) => idx !== i))
  const sum = rows.reduce((s, r) => s + (parseFloat(r.percentage) || 0), 0)

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 6, fontSize: 13, background: 'var(--cream-canvas)', border: '1px solid var(--input-border)', color: 'var(--ink-primary)', fontFamily: font, boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontSize: 9, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 3, display: 'block' }

  async function save() {
    if (!f.full_name.trim()) return
    setSaving(true)
    try {
      await updateAthlete(athlete.id, {
        full_name: f.full_name.trim(), short_name: f.short_name.trim() || f.full_name.trim().split(' ')[0],
        position: f.position || null, current_status: f.current_status, category: f.category,
        nationality: f.nationality || null, birth_date: f.birth_date || null,
        cpf: f.cpf || null, passport_number: f.passport_number || null, notes: f.notes || null,
      })
      // Titularidade: recria (apaga as antigas, insere as atuais).
      for (const r of rights) await deleteEconomicRight(r.id)
      for (const r of rows) {
        if (!r.holder_name.trim() && r.holder_type !== 'BFR' && r.holder_type !== 'ATLETA') continue
        const input: NewEconomicRightInput = { holder_type: r.holder_type, holder_name: r.holder_name.trim(), percentage: parseFloat(r.percentage) || 0, notes: r.notes }
        await createEconomicRight(athlete.id, input)
      }
      onSaved()
    } finally { setSaving(false) }
  }

  const field = (label: string, key: keyof typeof f, type = 'text', opts?: string[]) => (
    <div><label style={lbl}>{label}</label>{opts ? <select style={inp} value={f[key]} onChange={e => set(key, e.target.value)}>{opts.map(o => <option key={o} value={o}>{o || '—'}</option>)}</select> : <input type={type} style={inp} value={f[key]} onChange={e => set(key, e.target.value)} />}</div>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,20,16,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--cream-card)', borderRadius: 12, padding: 26, width: 660, maxWidth: '96vw', maxHeight: '92vh', overflowY: 'auto', border: '1px solid var(--divider)', boxShadow: 'var(--shadow-panel)', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-primary)', fontFamily: font }}>Editar atleta</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {field('Nome completo *', 'full_name')}
          {field('Nome curto', 'short_name')}
          {field('Posição', 'position', 'text', ATHLETE_POSITIONS)}
          {field('Status', 'current_status', 'text', ['ATIVO', 'EMPRESTADO', 'VENDIDO', 'DESLIGADO'])}
          <div>
            <label style={lbl}>Categoria</label>
            <select style={inp} value={f.category} onChange={e => set('category', e.target.value)}>
              {(Object.keys(ATHLETE_CATEGORY_LABELS) as AthleteCategory[]).map(c => (
                <option key={c} value={c}>{ATHLETE_CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </div>
          {field('Nacionalidade', 'nationality')}
          {field('Nascimento', 'birth_date', 'date')}
          {field('CPF', 'cpf')}
          {field('Passaporte', 'passport_number')}
        </div>
        <div><label style={lbl}>Observações</label><textarea style={{ ...inp, minHeight: 52, resize: 'vertical' }} value={f.notes} onChange={e => set('notes', e.target.value)} /></div>

        {/* Titularidade econômica */}
        <div style={{ borderTop: '1px solid var(--divider)', paddingTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold-deep)' }}>Detentores</div>
            <span style={{ fontSize: 11, fontFamily: fontMono, color: Math.abs(sum - 100) < 0.1 ? 'var(--pos)' : 'var(--neg)' }}>Soma: {sum.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rows.map((r, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 76px 1fr 30px', gap: 8, alignItems: 'center' }}>
                <select value={r.holder_type} onChange={e => setRow(i, { holder_type: e.target.value as HolderType })} style={{ ...inp, padding: '6px 8px', fontSize: 12 }}>
                  {(Object.keys(HOLDER_TYPE_LABELS) as HolderType[]).map(k => <option key={k} value={k}>{HOLDER_TYPE_LABELS[k]}</option>)}
                </select>
                <input placeholder="Nome do detentor" value={r.holder_name} onChange={e => setRow(i, { holder_name: e.target.value })} style={{ ...inp, padding: '6px 8px', fontSize: 12 }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <input inputMode="decimal" value={r.percentage} onChange={e => setRow(i, { percentage: e.target.value.replace(',', '.').replace(/[^\d.]/g, '') })} placeholder="0" style={{ ...inp, padding: '6px 8px', fontSize: 12, textAlign: 'right', fontFamily: fontMono }} />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: fontMono }}>%</span>
                </div>
                <input placeholder="Obs." value={r.notes} onChange={e => setRow(i, { notes: e.target.value })} style={{ ...inp, padding: '6px 8px', fontSize: 12 }} />
                <button onClick={() => removeRow(i)} title="Remover" style={{ padding: '6px', borderRadius: 6, border: '1px solid var(--divider-strong)', background: 'transparent', color: 'var(--neg)', fontSize: 12, cursor: 'pointer', lineHeight: 1 }}>✕</button>
              </div>
            ))}
          </div>
          <button onClick={addRow} className="btn btn-outline" style={{ marginTop: 10, borderStyle: 'dashed', padding: '6px 14px' }}><Icon name="plus" size={13} /> Detentor</button>
        </div>

        {/* PJ do atleta — parte do cadastro */}
        <div style={{ borderTop: '1px solid var(--divider)', paddingTop: 14 }}>
          <PjSection pjs={pjs} canEdit={canEdit} onAdd={onAddPJ} onUpdate={onUpdatePJ} onDelete={onDeletePJ} imageCountByPj={imageCountByPj} />
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="btn btn-outline">Cancelar</button>
          <button onClick={save} disabled={saving || !f.full_name.trim()} className="btn btn-primary">{saving ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Escolhe o vínculo de trabalho (remuneração paga pelo Botafogo) ──────────
function employmentContract(contracts: Contract[]): Contract | null {
  const emp = contracts.filter(c => c.type === 'ENTRADA' || c.type === 'EMPRESTIMO_ENTRADA')
  const pool = emp.length ? emp : contracts.filter(c => c.base_salary != null)
  if (!pool.length) return null
  const active = pool.filter(c => c.status === 'ATIVO')
  const arr = active.length ? active : pool
  return [...arr].sort((a, b) => b.start_date.localeCompare(a.start_date))[0]
}

// Rótulo curto de um vínculo (usado nos seletores/labels de contrato relacionado).
function contractLabel(c: Contract): string {
  const parts = [CONTRACT_TYPE_LABELS[c.type], c.counterpart_club || '—']
  if (c.start_date) parts.push(fmtDate(c.start_date))
  return parts.join(' · ')
}

type Tab = 'salario' | 'luvas' | 'agentes' | 'gatilhos' | 'acordos' | 'transferencias' | 'consolidado'
const TABS: { id: Tab; label: string }[] = [
  { id: 'salario',        label: 'Salário' },
  { id: 'luvas',          label: 'Luvas' },
  { id: 'agentes',        label: 'Agentes' },
  { id: 'gatilhos',       label: 'Gatilhos e Cláusulas Diversas' },
  { id: 'acordos',        label: 'Acordos e Renegociações' },
  { id: 'transferencias', label: 'Histórico de Transferências' },
  { id: 'consolidado',    label: 'Consolidado' },
]

// Agrupamento de tipos de cláusula por natureza (usado pelas abas).
const SALARY_IMAGE_TYPES: ClauseType[] = ['SALARIO_CETD', 'DIREITO_IMAGEM']
const LUVAS_TYPES: ClauseType[] = ['LUVAS']
const AGENT_TYPES: ClauseType[] = ['INTERMEDIACAO', 'INTERMEDIACAO_VENDA_FUTURA']
const TRANSFER_FEE_TYPES: ClauseType[] = [
  'TRANSFER_FEE_FIXO', 'TRANSFER_FEE_VARIAVEL', 'SELL_ON_FEE', 'SELL_ON_FEE_RECEBER',
  'EMPRESTIMO_TAXA', 'CLAUSULA_RESCISORIA', 'PERCENTUAL_VENDA_ATLETA', 'SOLIDARIEDADE_FIFA',
]
// "Cláusulas diversas / gatilhos de performance" = tudo que não é salário/imagem,
// luvas, agente, transfer fee ou acordo de renegociação.
function isDiverseClause(t: ClauseType): boolean {
  return !SALARY_IMAGE_TYPES.includes(t) && !LUVAS_TYPES.includes(t) &&
    !AGENT_TYPES.includes(t) && !TRANSFER_FEE_TYPES.includes(t) && t !== 'ACORDO_RENEGOCIACAO'
}

// Contrato guarda-chuva do atleta = a transferência de ENTRADA (compra) mais
// recente; luvas, agentes e gatilhos ficam atrelados a ele.
function umbrellaContract(contracts: Contract[]): Contract | null {
  const buys = contracts.filter(c => c.type === 'ENTRADA' || c.type === 'EMPRESTIMO_ENTRADA')
  const pool = buys.length ? buys : contracts.filter(c => TRANSFER_CONTRACT_TYPES.includes(c.type))
  if (!pool.length) return null
  return [...pool].sort((a, b) => b.start_date.localeCompare(a.start_date))[0]
}

export default function PageAthleteDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const canEdit = !profile || profile.role === 'master' || profile.role === 'juridico'

  const [athlete, setAthlete] = useState<Athlete | null>(null)
  const [contracts, setContracts] = useState<Contract[]>([])
  const [clauses, setClauses] = useState<Clause[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [rights, setRights] = useState<EconomicRight[]>([])
  const [triggers, setTriggers] = useState<SalaryTrigger[]>([])
  const [clubLiabs, setClubLiabs] = useState<ClubLiability[]>([])
  const [intermLiabs, setIntermLiabs] = useState<IntermediaryLiability[]>([])
  const [pjs, setPjs] = useState<AthletePJ[]>([])
  const [imageRights, setImageRights] = useState<ImageRight[]>([])
  const [installments, setInstallments] = useState<ClauseInstallment[]>([])
  const [loading, setLoading] = useState(true)
  const [clubIdx, setClubIdx] = useState<Map<string, string>>(new Map())
  const [agentIdx, setAgentIdx] = useState<Map<string, string>>(new Map())
  const [tab, setTab] = useState<Tab>('consolidado')
  const [payClauseId, setPayClauseId] = useState<string | null>(null)
  const [payInstId, setPayInstId] = useState<string | null>(null)
  const [editInstId, setEditInstId] = useState<string | null>(null)
  const [editClauseId, setEditClauseId] = useState<string | null>(null)
  const [showReneg, setShowReneg] = useState(false)
  const [editAcordoId, setEditAcordoId] = useState<string | null>(null)
  const [loanShareContractId, setLoanShareContractId] = useState<string | null>(null)
  const [highlightAcordo, setHighlightAcordo] = useState<string | null>(null)
  const [showEdit, setShowEdit] = useState(false)
  const [editContractId, setEditContractId] = useState<string | null>(null)
  const [newClauseContractId, setNewClauseContractId] = useState<string | null>(null)
  const [flowClauseId, setFlowClauseId] = useState<string | null>(null)
  const [editLiab, setEditLiab] = useState<{ kind: 'club' | 'agent'; liab: ClubLiability | IntermediaryLiability } | null>(null)
  const [expandedContracts, setExpandedContracts] = useState<Set<string>>(new Set())
  const toggleExpand = (cid: string) => setExpandedContracts(prev => { const n = new Set(prev); if (n.has(cid)) n.delete(cid); else n.add(cid); return n })

  const loadData = useCallback(async () => {
    if (!id) return
    setLoading(true)
    const [ath, contr, cls, alrt, rght, trg, clb, itm, clubs, agents, pjList, imgs, inst] = await Promise.all([
      fetchAthlete(id), fetchAthleteContracts(id), fetchAthleteClauses(id), fetchAthleteAlerts(id),
      fetchAthleteEconomicRights(id), fetchAthleteSalaryTriggers(id),
      fetchAthleteClubLiabilities(id), fetchAthleteIntermediaryLiabilities(id),
      fetchClubs(), fetchIntermediaries(),
      fetchAthletePJs(id), fetchAthleteImageRights(id), fetchAthleteInstallments(id),
    ])
    setAthlete(ath); setContracts(contr); setClauses(cls); setAlerts(alrt)
    setRights(rght); setTriggers(trg); setClubLiabs(clb); setIntermLiabs(itm)
    setClubIdx(buildNameIndex(clubs)); setAgentIdx(buildNameIndex(agents))
    setPjs(pjList); setImageRights(imgs); setInstallments(inst)
    setLoading(false)
  }, [id])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de dados no mount
  useEffect(() => { loadData() }, [loadData])

  const openStatuses = ['PENDENTE', 'PARCIALMENTE_PAGA', 'EM_ATRASO']
  const RATE: Record<Currency, number> = { BRL: 1, EUR: 6.10, USD: 5.55, GBP: 7.10 }
  const receivable = clauses.filter(c => c.creditor_party.toLowerCase().includes('botafogo') && openStatuses.includes(c.payment_status) && c.original_value).reduce((s, c) => s + (c.original_value ?? 0) * RATE[c.currency], 0)
  const payable = clauses.filter(c => c.debtor_party.toLowerCase().includes('botafogo') && openStatuses.includes(c.payment_status) && c.original_value).reduce((s, c) => s + (c.original_value ?? 0) * RATE[c.currency], 0)
  const paid = clauses.reduce((s, c) => s + (c.amount_paid_brl ?? 0), 0)
  const exposure: Partial<Record<Currency, number>> = {}
  clauses.filter(c => c.currency !== 'BRL' && openStatuses.includes(c.payment_status) && c.original_value).forEach(c => { exposure[c.currency] = (exposure[c.currency] ?? 0) + (c.original_value ?? 0) })

  const warnCount = alerts.filter(a => a.alert_type === 'VENCIMENTO_PROXIMO' && !a.is_read).length
  const unreadCrit = alerts.filter(a => a.severity === 'RED' && !a.is_read).length

  async function handleDeleteContract(cid: string) {
    if (!window.confirm('Excluir este vínculo e todo o seu fluxo (cláusulas e parcelas)? Esta ação não pode ser desfeita.')) return
    await deleteContract(cid); loadData()
  }
  async function handleDeleteClause(clauseId: string) {
    if (!window.confirm('Excluir esta cláusula e suas parcelas? Esta ação não pode ser desfeita.')) return
    await deleteClause(clauseId); loadData()
  }
  async function handleDeleteClubLiab(lid: string) {
    if (!window.confirm('Excluir esta obrigação com clube?')) return
    await deleteClubLiability(lid); setClubLiabs(prev => prev.filter(l => l.id !== lid))
  }
  // Passivo "flat" (agente/clube) → obrigação com página própria e parcelas.
  // Depois de promover, abre direto o editor de fluxo (o objetivo do usuário).
  async function handleConvertLiab(kind: 'club' | 'agent', lid: string) {
    if (!id) return
    const liab = kind === 'club' ? clubLiabs.find(l => l.id === lid) : intermLiabs.find(l => l.id === lid)
    if (!liab) return
    const clause = await promoteLiabilityToClause(kind, liab)
    await loadData()
    setFlowClauseId(clause.id)
  }
  async function handleDeleteIntermLiab(lid: string) {
    if (!window.confirm('Excluir esta obrigação com agente?')) return
    await deleteIntermediaryLiability(lid); setIntermLiabs(prev => prev.filter(l => l.id !== lid))
  }
  async function handleMarkAchieved(clauseId: string) { const u = await updateClause(clauseId, { achievement_status: 'ATINGIDA', achievement_date: todayISO() }); setClauses(prev => prev.map(c => c.id === clauseId ? u : c)) }
  async function handleCancelClause(clauseId: string) { const u = await updateClause(clauseId, { payment_status: 'CANCELADA' }); setClauses(prev => prev.map(c => c.id === clauseId ? u : c)) }
  async function handleClausePayment(clauseId: string, p: { date: string; valueCurrency: number; valueBRL: number; rate: number; notes: string }) {
    const u = await updateClause(clauseId, { payment_status: 'PAGA', payment_date: p.date, amount_paid_currency: p.valueCurrency, amount_paid_brl: p.valueBRL, exchange_rate: p.rate, notes: p.notes })
    setClauses(prev => prev.map(c => c.id === clauseId ? u : c)); setPayClauseId(null)
  }
  async function handleInstallmentPayment(instId: string, p: { date: string; valueCurrency: number; valueBRL: number; rate: number; notes: string }) {
    const u = await updateInstallment(instId, { payment_status: 'PAGA', payment_date: p.date, amount_paid_brl: p.valueBRL, exchange_rate: p.rate, notes: p.notes || null })
    setInstallments(prev => prev.map(i => i.id === instId ? u : i)); setPayInstId(null)
  }
  async function handleRevertInstallment(instId: string) {
    const u = await revertInstallment(instId)
    setInstallments(prev => prev.map(i => i.id === instId ? u : i))
  }
  async function handleMarkInstallmentPaidQuick(instId: string) {
    const u = await markInstallmentPaid(instId, todayISO())
    setInstallments(prev => prev.map(i => i.id === instId ? u : i))
  }
  async function handleRenegotiate(input: RenegotiationInput) {
    await createRenegotiation(input)
    setShowReneg(false)
    await loadData()
  }
  // Regenera o fluxo mensal de salário/imagem do vínculo de trabalho usando um
  // conjunto de gatilhos (aplica os degraus atingidos, preserva parcelas pagas).
  async function regenEmpFlow(nextTriggers: SalaryTrigger[]) {
    const empC = employmentContract(contracts)
    if (!empC || !athlete) return
    await regenerateSalaryFlow({
      contract: empC,
      triggers: nextTriggers.filter(t => t.contract_id === empC.id || t.contract_id === null),
      pjs, athleteName: athlete.full_name, clauses, installments,
    })
  }
  async function handleAddTrigger(input: NewSalaryTriggerInput) { if (!id) return; const c = await createSalaryTrigger(id, input); setTriggers(prev => [...prev, c]) }
  async function handleMarkTrigger(tid: string, date: string) {
    const u = await markTriggerAchieved(tid, date)
    const next = triggers.map(t => t.id === tid ? u : t)
    setTriggers(next)
    await regenEmpFlow(next)   // aplica o novo salário/imagem no fluxo a partir da data
    await loadData()
  }
  async function handleResetTrigger(tid: string) {
    const u = await resetTrigger(tid)
    const next = triggers.map(t => t.id === tid ? u : t)
    setTriggers(next)
    await regenEmpFlow(next)
    await loadData()
  }
  async function handleDeleteTrigger(tid: string) {
    await deleteSalaryTrigger(tid)
    const next = triggers.filter(t => t.id !== tid)
    setTriggers(next)
    await regenEmpFlow(next)
    await loadData()
  }
  async function handlePhoto(url: string | null) { if (!id) return; const u = await updateAthlete(id, { profile_photo_url: url }); setAthlete(u) }
  async function handleDeleteAthlete() {
    if (!id || !athlete) return
    if (!window.confirm(`Excluir o atleta "${athlete.full_name}" e TODOS os seus vínculos (contratos, salário, luvas, agentes, gatilhos, transferências, parcelas, PJs)? Esta ação é irreversível.`)) return
    try {
      await deleteAthlete(id)
      navigate('/atletas')
    } catch (e) {
      // Antes o erro caía silenciosamente e o atleta parecia "não ter sido excluído".
      // Agora mostramos o motivo — quase sempre uma FK/policy que a UI não pode resolver sozinha.
      const msg = e instanceof Error ? e.message : String(e)
      window.alert(`Não foi possível excluir o atleta.\n\n${msg}`)
    }
  }

  // ── PJs ──
  async function handleAddPJ(input: NewAthletePJInput) { if (!id) return; const p = await createPJ(id, input); setPjs(prev => [...prev, p]) }
  async function handleUpdatePJ(pjId: string, patch: Partial<AthletePJ>) { const u = await updatePJ(pjId, patch); setPjs(prev => prev.map(p => p.id === pjId ? u : p)) }
  async function handleDeletePJ(pjId: string) { await deletePJ(pjId); setPjs(prev => prev.filter(p => p.id !== pjId)); setImageRights(prev => prev.map(ir => ir.pj_id === pjId ? { ...ir, pj_id: null } : ir)) }


  function exportAthlete() {
    if (!athlete) return
    // Aba única consolidada: atleta + vínculos + cláusulas + metas + passivos +
    // detentores + PJs + imagem, uma linha por registro (coluna "Seção").
    const rows = buildConsolidatedRows({
      athlete, contracts, clauses, installments, triggers,
      clubLiabs, intermLiabs, rights, pjs, imageRights,
    })
    exportWorkbook(
      [{ name: 'Atleta Consolidado', cols: COLS_ATLETA_CONSOLIDADO, rows }],
      `atleta-${athlete.short_name.toLowerCase().replace(/\s+/g, '-')}.xlsx`,
    )
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', fontFamily: fontMono, color: 'var(--text-muted)', fontSize: 12, letterSpacing: '0.14em' }}>CARREGANDO...</div>
  if (!athlete) return (
    <div style={{ padding: 40, textAlign: 'center', fontFamily: font }}>
      <div style={{ fontSize: 16, color: 'var(--text-muted)' }}>Atleta não encontrado.</div>
      <button onClick={() => navigate('/atletas')} className="btn btn-outline">← Voltar</button>
    </div>
  )

  const st = ATHLETE_STATUS_STYLE[athlete.current_status]
  const payClause = payClauseId ? clauses.find(c => c.id === payClauseId) ?? null : null
  const payInst = payInstId ? installments.find(i => i.id === payInstId) ?? null : null
  const editInst = editInstId ? installments.find(i => i.id === editInstId) ?? null : null
  const editClause = editClauseId ? clauses.find(c => c.id === editClauseId) ?? null : null

  const emp = employmentContract(contracts)
  const empTriggers = emp ? triggers.filter(t => t.contract_id === emp.id || t.contract_id === null) : []
  const sortedRights = sortRights(rights)

  // ── Big numbers (custos consolidados por natureza) ──────────────────────────
  // "Custo" = o que o Botafogo PAGA (é o devedor). Vendas/recebimentos NÃO entram
  // no custo — venda de transfer é receita, não custo. Fluxos parcelados usam o
  // total das parcelas (não canceladas); os demais, o valor da cláusula.
  const alive = (c: Clause) => c.payment_status !== 'CANCELADA'
  const instByClause = (cid: string) => installments.filter(i => i.clause_id === cid && i.payment_status !== 'CANCELADA')
  function totalsFor(types: ClauseType[]): Partial<Record<Currency, number>> {
    const out: Partial<Record<Currency, number>> = {}
    for (const c of clauses) {
      if (!types.includes(c.clause_type) || !alive(c)) continue
      if (!isBFRparty(c.debtor_party)) continue   // só custo (Botafogo devedor)
      const parc = instByClause(c.id)
      const val = parc.length ? parc.reduce((s, p) => s + p.original_value, 0) : (c.original_value ?? 0)
      if (!val) continue
      out[c.currency] = (out[c.currency] ?? 0) + val
    }
    return out
  }
  const transferTotals = totalsFor(['TRANSFER_FEE_FIXO', 'TRANSFER_FEE_VARIAVEL'])
  const luvasTotals = totalsFor(['LUVAS'])
  const intermTotals = totalsFor(['INTERMEDIACAO', 'INTERMEDIACAO_VENDA_FUTURA'])
  // Passivos de agente a pagar também entram na intermediação (custo).
  for (const l of intermLiabs) {
    if (l.status === 'CANCELADA' || l.direction !== 'A_PAGAR') continue
    intermTotals[l.currency] = (intermTotals[l.currency] ?? 0) + l.amount
  }
  const empSalNow = emp ? (effectiveSalary(emp, empTriggers).amount ?? emp.base_salary ?? 0) : 0
  const empImg = emp?.image_value ?? 0
  const empOther = emp?.other_value ?? 0
  const salImgMonthly = empSalNow + empImg + empOther
  const salImgCurrency: Currency = emp?.salary_currency ?? 'BRL'

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1400, margin: '0 auto' }}>
      <PageHero title={athlete.short_name || athlete.full_name} subtitle="Ficha do atleta · Botafogo SAF" />
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', fontFamily: font }}>
        <Link to="/atletas" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Atletas</Link>
        <span>/</span><span style={{ color: 'var(--ink-primary)' }}>{athlete.short_name}</span>
      </div>

      {/* Header com foto, dados e titularidade compacta */}
      <div className="card" style={{ padding: '20px 24px', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 22, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <ImageUpload value={athlete.profile_photo_url} onChange={handlePhoto} fallbackText={athlete.short_name} size={80} editable={canEdit} />
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink-primary)', fontFamily: font, margin: 0 }}>{athlete.full_name}</h1>
              <span style={{ padding: '3px 10px', borderRadius: 6, background: st.bg, color: st.fg, fontSize: 10, fontWeight: 700, fontFamily: fontMono, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{st.label}</span>
              {unreadCrit > 0 && <span title={`${unreadCrit} alerta(s) crítico(s)`} style={{ padding: '3px 9px', borderRadius: 5, background: 'var(--neg-tint)', color: 'var(--neg)', fontSize: 10, fontWeight: 600, fontFamily: fontMono }}>{unreadCrit} {unreadCrit === 1 ? 'crítico' : 'críticos'}</span>}
              {warnCount > 0 && <span title={`${warnCount} vencimento(s) próximo(s)`} style={{ padding: '3px 9px', borderRadius: 5, background: 'var(--warn-tint)', color: 'var(--warn)', fontSize: 10, fontWeight: 600, fontFamily: fontMono }}>{warnCount} atenção</span>}
            </div>
            <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-secondary)', fontFamily: font }}>
              <span><LabelSpan>Categoria</LabelSpan> {ATHLETE_CATEGORY_LABELS[athlete.category ?? 'PROFISSIONAL']}</span>
              {athlete.position && <span><LabelSpan>Posição</LabelSpan> {athlete.position}</span>}
              {athlete.nationality && <span><LabelSpan>Nacionalidade</LabelSpan> {athlete.nationality}</span>}
              {athlete.birth_date && <span><LabelSpan>Nasc.</LabelSpan> {fmtDate(athlete.birth_date)}</span>}
            </div>
            {athlete.notes && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-subtle)', borderLeft: '2px solid var(--gold-ring)', borderRadius: 4, padding: '7px 12px', fontFamily: font }}>{athlete.notes}</div>}

            {/* Detentores — compacto, largura ajustada ao conteúdo */}
            <div style={{ marginTop: 14, width: 'fit-content', maxWidth: '100%', minWidth: 260 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 6 }}>
                <span style={{ fontFamily: fontMono, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Detentores</span>
                {rights.length > 0 && (
                  <span style={{ fontFamily: fontMono, fontSize: 10, color: isOwnershipValid(rights) ? 'var(--pos)' : 'var(--neg)' }}>
                    {isOwnershipValid(rights) ? 'Total 100%' : `⚠ ${sumOwnership(rights).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`}
                  </span>
                )}
              </div>
              {rights.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: font }}>Não cadastrado{canEdit ? ' — use “Editar”.' : '.'}</div>
              ) : (
                <>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginBottom: 6 }}>
                    {sortedRights.map(r => (
                      <span key={r.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontFamily: font, color: 'var(--text-secondary)' }}>
                        <span style={{ width: 9, height: 9, borderRadius: 2, background: HOLDER_TYPE_COLORS[r.holder_type], flexShrink: 0 }} />
                        <strong style={{ color: 'var(--ink-primary)' }}>{r.holder_name || HOLDER_TYPE_LABELS[r.holder_type]}</strong> {r.percentage}%
                      </span>
                    ))}
                  </div>
                  <OwnershipBar rights={rights} compact showLegend={false} />
                </>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <IconButton icon="download" label="Exportar dados deste atleta (XLSX)" onClick={exportAthlete} />
            {canEdit && <IconButton icon="edit" label="Editar atleta" onClick={() => setShowEdit(true)} />}
            <Link to={`/atletas/${athlete.id}/contratos/novo`} className="btn btn-primary">
              <Icon name="plus" size={14} /> Novo contrato
            </Link>
            {canEdit && <IconButton icon="trash" label="Excluir atleta e todos os vínculos" tone="danger" onClick={handleDeleteAthlete} />}
          </div>
        </div>
      </div>

      {/* Resumo financeiro */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        <FinancialCard label="A Receber" value={fmtCurrencyShort(receivable, 'BRL')} sub="Botafogo como credor" color="var(--pos)" />
        <FinancialCard label="A Pagar" value={fmtCurrencyShort(payable, 'BRL')} sub="Botafogo como devedor" color="var(--neg)" />
        <FinancialCard label="Já Recebido / Pago" value={fmtCurrencyShort(paid, 'BRL')} />
        <div className="card" style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: 9, fontFamily: fontMono, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>Exposição Cambial</div>
          {Object.entries(exposure).length === 0 ? <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>—</div> : Object.entries(exposure).map(([c, v]) => (
            <div key={c} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ fontFamily: fontMono, fontSize: 11, color: 'var(--text-muted)' }}>{c}</span>
              <span style={{ fontFamily: fontMono, fontSize: 13, fontWeight: 600, color: 'var(--ink-primary)' }}>{fmtCurrencyShort(v, c as Currency)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Big numbers — custos consolidados por natureza */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        <BigNumberCard label="Custo total de transfer" totals={transferTotals} sub="Transfer fee (fixo + variável)" />
        <BigNumberCard label="Salário + imagem (atual)" totals={{ [salImgCurrency]: salImgMonthly }} sub="Remuneração mensal vigente" color="var(--gold-deep)" />
        <BigNumberCard label="Custo total de intermediação" totals={intermTotals} sub="Agentes (cláusulas + passivos)" />
        <BigNumberCard label="Custo total de luvas" totals={luvasTotals} sub="Luvas contratadas" />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--divider)', marginBottom: 16 }}>
        {TABS.map(t => {
          const count = 0
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '10px 18px', border: 'none', background: 'none', fontFamily: font, fontSize: 13, fontWeight: tab === t.id ? 600 : 400, cursor: 'pointer', color: tab === t.id ? 'var(--ink-primary)' : 'var(--text-muted)', borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent', marginBottom: -2, display: 'flex', alignItems: 'center', gap: 6 }}>
              {t.label}
              {count > 0 && <span style={{ padding: '1px 6px', borderRadius: 10, background: 'var(--neg-tint)', color: 'var(--neg)', fontSize: 9, fontFamily: fontMono }}>{count}</span>}
            </button>
          )
        })}
      </div>

      {/* Consolidado — todo o fluxo financeiro do atleta */}
      {tab === 'consolidado' && (
        <ConsolidadoTab
          clauses={clauses} installments={installments} clubLiabs={clubLiabs} intermLiabs={intermLiabs}
          canEdit={canEdit}
          clubIdx={clubIdx} agentIdx={agentIdx}
          onOpenClause={cid => navigate(`/obrigacoes/${cid}`)}
          onEditInst={id => setEditInstId(id)}
          onEditClause={cid => setEditClauseId(cid)}
          onFlowClause={cid => setFlowClauseId(cid)}
          onPayInst={id => setPayInstId(id)}
          onQuickPayInst={handleMarkInstallmentPaidQuick}
          onRevertInst={handleRevertInstallment}
          onDeleteClause={handleDeleteClause}
          onEditLiab={(kind, lid) => {
            const liab = kind === 'club' ? clubLiabs.find(l => l.id === lid) : intermLiabs.find(l => l.id === lid)
            if (liab) setEditLiab({ kind, liab })
          }}
          onDeleteLiab={(kind, lid) => kind === 'club' ? handleDeleteClubLiab(lid) : handleDeleteIntermLiab(lid)}
          onConvertLiab={handleConvertLiab}
        />
      )}

      {/* Salário — remuneração (salário CLT + imagem), fluxo automático e gráfico */}
      {tab === 'salario' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!emp ? (
            <div className="card" style={{ padding: 32, textAlign: 'center', fontFamily: 'var(--font-body)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 14, color: 'var(--ink-secondary)', maxWidth: 460, lineHeight: 1.5 }}>
                Nenhum vínculo de trabalho com remuneração cadastrado. Cadastre um contrato de entrada com salário base — o fluxo mensal é gerado automaticamente.
              </div>
              {canEdit && athlete && (
                <button className="btn btn-primary" onClick={() => navigate(`/atletas/${athlete.id}/contratos/novo`)}>
                  <Icon name="plus" size={13} /> Cadastrar vínculo de trabalho
                </button>
              )}
            </div>
          ) : (
            <SalaryImageEditor contract={emp} triggers={empTriggers} clauses={clauses} installments={installments} pjs={pjs} athleteName={athlete?.full_name ?? 'Atleta'} canEdit={canEdit} onSaved={loadData} />
          )}
          {emp && (
            <LoanShareSection
              workContract={emp} contracts={contracts} triggers={triggers} canEdit={canEdit}
              onConfigure={cid => setLoanShareContractId(cid)}
            />
          )}
          <FlowList title="Fluxo mensal — Salário CLT + Imagem" installments={installments} clauses={clauses}
            types={['SALARIO_CETD', 'DIREITO_IMAGEM']} canEdit={canEdit}
            onEditInst={id => setEditInstId(id)} onPayInst={id => setPayInstId(id)}
            onQuickPayInst={handleMarkInstallmentPaidQuick} onRevertInst={handleRevertInstallment}
            onFlowClause={cid => setFlowClauseId(cid)} />
        </div>
      )}

      {/* Luvas */}
      {tab === 'luvas' && (
        <AccessoryFlowTab
          kind="luvas" athleteId={athlete.id} clauses={clauses} installments={installments}
          intermLiabs={[]} contracts={contracts} canEdit={canEdit}
          clubIdx={clubIdx} agentIdx={agentIdx}
          onOpenClause={cid => navigate(`/obrigacoes/${cid}`)} onSaved={loadData}
          onEditClause={cid => setEditClauseId(cid)} onFlowClause={cid => setFlowClauseId(cid)}
          onEditInst={id => setEditInstId(id)} onPayInst={id => setPayInstId(id)}
          onQuickPayInst={handleMarkInstallmentPaidQuick} onRevertInst={handleRevertInstallment}
          onEditLiab={lid => { const liab = intermLiabs.find(l => l.id === lid); if (liab) setEditLiab({ kind: 'agent', liab }) }}
          onGenerateLiabFlow={lid => handleConvertLiab('agent', lid)}
        />
      )}

      {/* Agentes */}
      {tab === 'agentes' && (
        <AccessoryFlowTab
          kind="agentes" athleteId={athlete.id} clauses={clauses} installments={installments}
          intermLiabs={intermLiabs} contracts={contracts} canEdit={canEdit}
          clubIdx={clubIdx} agentIdx={agentIdx}
          onOpenClause={cid => navigate(`/obrigacoes/${cid}`)} onSaved={loadData}
          onEditClause={cid => setEditClauseId(cid)} onFlowClause={cid => setFlowClauseId(cid)}
          onEditInst={id => setEditInstId(id)} onPayInst={id => setPayInstId(id)}
          onQuickPayInst={handleMarkInstallmentPaidQuick} onRevertInst={handleRevertInstallment}
          onEditLiab={lid => { const liab = intermLiabs.find(l => l.id === lid); if (liab) setEditLiab({ kind: 'agent', liab }) }}
          onGenerateLiabFlow={lid => handleConvertLiab('agent', lid)}
        />
      )}

      {/* Gatilhos e Cláusulas Diversas */}
      {tab === 'gatilhos' && (
        <GatilhosTab
          emp={emp} empTriggers={empTriggers} clauses={clauses} installments={installments}
          umbrella={umbrellaContract(contracts)} canEdit={canEdit}
          onAddTrigger={handleAddTrigger}
          onMarkTrigger={handleMarkTrigger} onResetTrigger={handleResetTrigger} onDeleteTrigger={handleDeleteTrigger}
          onOpenClause={cid => navigate(`/obrigacoes/${cid}`)}
          onEditClause={cid => setEditClauseId(cid)} onFlowClause={cid => setFlowClauseId(cid)}
          onMarkAchieved={handleMarkAchieved} onPayClause={cid => setPayClauseId(cid)} onCancelClause={handleCancelClause}
          onNewClause={cid => setNewClauseContractId(cid)}
        />
      )}

      {/* Acordos e Renegociações */}
      {tab === 'acordos' && (
        <AcordosTab
          clauses={clauses} installments={installments} canEdit={canEdit}
          highlight={highlightAcordo} onHighlighted={() => setHighlightAcordo(null)}
          onNew={() => setShowReneg(true)}
          onEditAcordo={cid => setEditAcordoId(cid)}
          onFlowAcordo={cid => setFlowClauseId(cid)}
          onEditInst={id => setEditInstId(id)}
          onPayInst={id => setPayInstId(id)}
          onQuickPayInst={id => handleMarkInstallmentPaidQuick(id)}
          onRevertInst={id => handleRevertInstallment(id)}
        />
      )}

      {/* Histórico de Transferências — só contratos de transferência + transfer fees */}
      {tab === 'transferencias' && (() => {
        const transferContracts = contracts.filter(ct => TRANSFER_CONTRACT_TYPES.includes(ct.type))
        return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {transferContracts.length === 0 && <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontFamily: font }}>Nenhuma transferência cadastrada. Use “+ Novo Contrato” para registrar uma compra, venda ou empréstimo.</div>}
          {transferContracts.map(ct => {
            // Só as cláusulas de transferência (transfer fee, sell-on, taxas, etc.).
            const ctClauses = clauses.filter(c => c.contract_id === ct.id && TRANSFER_FEE_TYPES.includes(c.clause_type))
            const typeStyle: Record<string, { bg: string; fg: string }> = { ENTRADA: { bg: '#e6ece2', fg: '#3a6f3a' }, SAIDA: { bg: 'rgba(91,107,122,0.12)', fg: '#5b6b7a' }, EMPRESTIMO_SAIDA: { bg: 'var(--accent-tint2)', fg: '#7a6244' }, EMPRESTIMO_ENTRADA: { bg: 'rgba(111,96,118,0.12)', fg: '#6f6076' }, INTERMEDIACAO: { bg: 'var(--accent-tint2)', fg: 'var(--ink-secondary)' }, LUVAS: { bg: 'var(--accent-tint2)', fg: 'var(--ink-secondary)' }, SELL_ON: { bg: 'var(--accent-tint2)', fg: 'var(--ink-secondary)' }, OUTRO: { bg: 'rgba(156,163,175,0.15)', fg: '#6b7280' } }
            const ts = typeStyle[ct.type] ?? { bg: '#eee', fg: '#333' }
            // Vínculo entre contratos: pai (do qual este deriva) e filhos (que derivam deste).
            const parent = ct.related_contract_id ? contracts.find(c => c.id === ct.related_contract_id) ?? null : null
            const children = contracts.filter(c => c.related_contract_id === ct.id)
            return (
              <div key={ct.id} className="card" style={{ padding: '18px 22px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ padding: '3px 8px', borderRadius: 5, background: ts.bg, color: ts.fg, fontSize: 9, fontWeight: 700, fontFamily: fontMono, letterSpacing: '0.10em', textTransform: 'uppercase' }}>{CONTRACT_TYPE_LABELS[ct.type]}</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-primary)', fontFamily: font }}>
                    {(() => { const cid = clubIdx.get(norm(ct.counterpart_club)); return cid ? <RefLink to={`/clubes/${cid}`} title={`Abrir ${ct.counterpart_club}`}>{ct.counterpart_club}</RefLink> : ct.counterpart_club })()}
                  </span>
                  {ct.counterpart_country && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{ct.counterpart_country}</span>}
                  <StatusBadge status={ct.status} map={{ ATIVO: { bg: '#e6ece2', fg: '#3a6f3a' }, ENCERRADO: { bg: 'rgba(156,163,175,0.18)', fg: '#6b7280' }, RESCINDIDO: { bg: 'var(--neg-tint)', fg: 'var(--neg)' } }} />
                  {parent && (
                    <span title={`Contrato vinculado a ${contractLabel(parent)}`} style={{ padding: '3px 9px', borderRadius: 5, background: 'var(--accent-tint2)', border: '1px solid var(--divider-strong)', color: 'var(--ink-secondary)', fontSize: 10, fontWeight: 600, fontFamily: fontMono, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      ↳ vinculado a {CONTRACT_TYPE_LABELS[parent.type]} · {parent.counterpart_club}
                    </span>
                  )}
                  {canEdit && (
                    <div style={{ marginLeft: 'auto' }}>
                      <IconRow>
                        {ct.type === 'EMPRESTIMO_SAIDA' && (
                          <IconButton icon="split"
                            label={emp
                              ? (loanShareTriggers(triggers, ct.id).length > 0
                                ? 'Editar o rateio de salário deste empréstimo'
                                : 'Ratear o salário deste empréstimo (quanto o clube assume)')
                              : 'Cadastre o vínculo de trabalho para ratear o salário'}
                            tone={loanShareTriggers(triggers, ct.id).length > 0 ? 'default' : 'info'}
                            onClick={emp ? () => setLoanShareContractId(ct.id) : undefined}
                            disabled={!emp} disabledReason="sem vínculo de trabalho ativo" />
                        )}
                        <IconButton icon="plus" label="Adicionar cláusula a este vínculo (ex.: Sell-on Fee, intermediação)" tone="info" onClick={() => setNewClauseContractId(ct.id)} />
                        <IconButton icon="link" label="Criar um contrato atrelado a este vínculo (ex.: intermediação)" tone="info" onClick={() => navigate(`/atletas/${ct.athlete_id}/contratos/novo?rel=${ct.id}`)} />
                        <IconButton icon="edit" label="Editar vínculo" onClick={() => setEditContractId(ct.id)} />
                        <IconButton icon="trash" label="Excluir vínculo" tone="danger" onClick={() => handleDeleteContract(ct.id)} />
                      </IconRow>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 20, fontSize: 12, color: 'var(--text-secondary)', fontFamily: font, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span>Início: {fmtDate(ct.start_date)}</span>
                  {ct.end_date && <span>Fim: {fmtDate(ct.end_date)}</span>}
                  {ct.transfer_fee_gross && <span style={{ fontWeight: 600, color: 'var(--ink-primary)' }}>{CURRENCY_SYMBOLS[ct.transfer_currency]} {ct.transfer_fee_gross.toLocaleString('pt-BR')}</span>}
                  {ctClauses.length > 0 && (
                    <button onClick={() => toggleExpand(ct.id)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent)', fontFamily: font, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      {expandedContracts.has(ct.id) ? '▾' : '▸'} {ctClauses.length} cláusula{ctClauses.length !== 1 ? 's' : ''} — ver vencimentos
                    </button>
                  )}
                  {ctClauses.length === 0 && <span style={{ color: 'var(--text-muted)' }}>0 cláusulas</span>}
                  {children.length > 0 && <span style={{ color: 'var(--ink-secondary)', fontWeight: 600 }}>· {children.length} contrato{children.length !== 1 ? 's' : ''} vinculado{children.length !== 1 ? 's' : ''}</span>}
                </div>
                {ct.description && <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)', fontFamily: font }}>{ct.description}</div>}

                {expandedContracts.has(ct.id) && (
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {ctClauses.map(cl => {
                      const parc = installments.filter(i => i.clause_id === cl.id).sort((a, b) => a.due_date.localeCompare(b.due_date))
                      const totalCl = parc.length ? parc.reduce((s, p) => s + p.original_value, 0) : (cl.original_value ?? 0)
                      return (
                        <div key={cl.id} style={{ border: '1px solid var(--divider-soft)', borderRadius: 8, overflow: 'hidden' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-subtle)' }}>
                            <span style={{ fontFamily: font, fontSize: 12, fontWeight: 600, color: 'var(--ink-primary)' }}>
                              {CLAUSE_TYPE_LABELS[cl.clause_type]} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· {cl.description}</span>
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontFamily: fontMono, fontSize: 12, fontWeight: 600 }}>{fmtCurrencyShort(totalCl, cl.currency)}{parc.length ? ` · ${parc.length}x` : ''}</span>
                              <RowActions
                                open={{ to: `/obrigacoes/${cl.id}` }}
                                edit={{ onClick: canEdit ? () => setEditClauseId(cl.id) : undefined, reason: 'sem permissão de edição' }}
                                schedule={{ onClick: canEdit ? () => setFlowClauseId(cl.id) : undefined, reason: 'sem permissão de edição' }}
                              />
                            </span>
                          </div>
                          {parc.length > 0 && (
                            <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                              {parc.map(p => {
                                const late = isOverdue(p.due_date, p.payment_status)
                                return (
                                  <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '40px 110px 1fr 90px 110px', gap: 8, alignItems: 'center', padding: '5px 12px', borderTop: '1px solid var(--divider-soft)' }}>
                                    <span style={{ fontFamily: fontMono, fontSize: 10, color: 'var(--text-muted)', textAlign: 'right' }}>{p.installment_number}</span>
                                    <span style={{ fontFamily: fontMono, fontSize: 11, color: late ? 'var(--neg)' : 'var(--ink-secondary)', fontWeight: late ? 700 : 400 }}>{fmtDate(p.due_date)}</span>
                                    <span style={{ fontFamily: fontMono, fontSize: 12, fontWeight: 600 }}>{fmtCurrencyShort(p.original_value, p.currency)}</span>
                                    <span style={{ textAlign: 'right' }}><StatusBadge status={p.payment_status} map={PAYMENT_STATUS_STYLE} /></span>
                                    <span style={{ textAlign: 'right' }}>
                                      <InstallmentActions inst={p} canEdit={canEdit} onEdit={() => setEditInstId(p.id)}
                                        onPay={() => setPayInstId(p.id)} onQuickPay={() => handleMarkInstallmentPaidQuick(p.id)}
                                        onRevert={() => handleRevertInstallment(p.id)} />
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        )
      })()}

      {payClause && <PaymentModal label={payClause.description} currency={payClause.currency} value={payClause.original_value ?? 0} onClose={() => setPayClauseId(null)} onSave={p => handleClausePayment(payClause.id, p)} />}
      {payInst && <PaymentModal label={`Parcela ${payInst.installment_number}`} currency={payInst.currency} value={payInst.original_value} onClose={() => setPayInstId(null)} onSave={p => handleInstallmentPayment(payInst.id, p)} />}
      {editInst && <InstallmentEditModal inst={editInst} onClose={() => setEditInstId(null)} onSaved={() => { setEditInstId(null); loadData() }} />}
      {editClause && <ClauseEditModal clause={editClause} onClose={() => setEditClauseId(null)} onSaved={() => { setEditClauseId(null); loadData() }} />}
      {editAcordoId && (() => {
        const ac = clauses.find(c => c.id === editAcordoId)
        return ac ? (
          <RenegotiationEditModal acordo={ac}
            onClose={() => setEditAcordoId(null)}
            onSaved={() => { setEditAcordoId(null); loadData() }}
            onDeleted={() => { setEditAcordoId(null); loadData() }} />
        ) : null
      })()}
      {loanShareContractId && athlete && emp && (() => {
        const loan = contracts.find(c => c.id === loanShareContractId)
        return loan ? (
          <LoanShareModal workContract={emp} loanContract={loan}
            triggers={triggers} clauses={clauses} installments={installments} pjs={pjs}
            athleteName={athlete.full_name}
            onClose={() => setLoanShareContractId(null)}
            onSaved={() => { setLoanShareContractId(null); loadData() }} />
        ) : null
      })()}
      {showReneg && athlete && <RenegotiationModal athleteId={athlete.id} clauses={clauses} installments={installments} clubLiabs={clubLiabs} intermLiabs={intermLiabs} onClose={() => setShowReneg(false)} onSave={handleRenegotiate} />}
      {showEdit && athlete && <EditAthleteModal athlete={athlete} rights={rights} pjs={pjs} canEdit={canEdit} onAddPJ={handleAddPJ} onUpdatePJ={handleUpdatePJ} onDeletePJ={handleDeletePJ} imageCountByPj={imageRights.reduce((m, ir) => { if (ir.pj_id) m[ir.pj_id] = (m[ir.pj_id] ?? 0) + 1; return m }, {} as Record<string, number>)} onClose={() => setShowEdit(false)} onSaved={() => { setShowEdit(false); loadData() }} />}
      {editContractId && (() => {
        const ct = contracts.find(c => c.id === editContractId)
        return ct ? <ContractEditModal contract={ct} siblings={contracts} onClose={() => setEditContractId(null)} onSaved={() => { setEditContractId(null); loadData() }} /> : null
      })()}
      {newClauseContractId && athlete && (() => {
        const ct = contracts.find(c => c.id === newClauseContractId)
        return ct ? <NewClauseModal contract={ct} athleteId={athlete.id} onClose={() => setNewClauseContractId(null)} onSaved={() => { setNewClauseContractId(null); loadData() }} /> : null
      })()}
      {flowClauseId && athlete && (() => {
        const cl = clauses.find(c => c.id === flowClauseId)
        return cl ? <ClauseFlowModal clause={cl} onClose={() => setFlowClauseId(null)} onSaved={() => { setFlowClauseId(null); loadData() }} /> : null
      })()}
      {editLiab && <LiabilityEditModal kind={editLiab.kind} liab={editLiab.liab} onClose={() => setEditLiab(null)} onSaved={() => { setEditLiab(null); loadData() }} />}
    </div>
  )
}

// ── PJs do atleta ───────────────────────────────────────────────────────────

const pjInp: React.CSSProperties = { padding: '7px 9px', borderRadius: 6, fontSize: 13, background: 'var(--cream-canvas)', border: '1px solid var(--input-border)', color: 'var(--ink-primary)', fontFamily: font, boxSizing: 'border-box' }
const pjLbl: React.CSSProperties = { fontSize: 9, fontFamily: fontMono, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 3, display: 'block' }

function PjSection({ pjs, canEdit, onAdd, onUpdate, onDelete, imageCountByPj }: {
  pjs: AthletePJ[]; canEdit: boolean
  onAdd: (i: NewAthletePJInput) => void
  onUpdate: (id: string, patch: Partial<AthletePJ>) => void
  onDelete: (id: string) => void
  imageCountByPj: Record<string, number>
}) {
  const [adding, setAdding] = useState(false)
  const [f, setF] = useState({ legal_name: '', cnpj: '', notes: '' })
  const [editId, setEditId] = useState<string | null>(null)
  const [ef, setEf] = useState({ legal_name: '', cnpj: '', notes: '' })

  function submitNew() {
    if (!f.legal_name.trim()) return
    onAdd({ legal_name: f.legal_name.trim(), cnpj: f.cnpj.trim(), notes: f.notes.trim() })
    setF({ legal_name: '', cnpj: '', notes: '' }); setAdding(false)
  }
  function startEdit(p: AthletePJ) { setEditId(p.id); setEf({ legal_name: p.legal_name, cnpj: p.cnpj ?? '', notes: p.notes ?? '' }) }
  function submitEdit() {
    if (!editId || !ef.legal_name.trim()) return
    onUpdate(editId, { legal_name: ef.legal_name.trim(), cnpj: ef.cnpj.trim() || null, notes: ef.notes.trim() || null })
    setEditId(null)
  }

  return (
    <div className="card" style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-primary)', fontFamily: font }}>PJs do atleta</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: font, marginTop: 2 }}>Pessoas jurídicas que recebem o direito de imagem. O atleta pode ter mais de uma.</div>
        </div>
        {canEdit && !adding && <button onClick={() => setAdding(true)} className="btn btn-outline" style={{ borderStyle: 'dashed' }}><Icon name="plus" size={14} /> Nova PJ</button>}
      </div>

      {adding && (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr auto', gap: 8, alignItems: 'end', marginBottom: 12, padding: 12, borderRadius: 8, background: 'var(--bg-subtle)', border: '1px solid var(--divider-soft)' }}>
          <div><label style={pjLbl}>Razão social *</label><input style={{ ...pjInp, width: '100%' }} value={f.legal_name} onChange={e => setF(p => ({ ...p, legal_name: e.target.value }))} placeholder="Ex: Fulano Sports LTDA" /></div>
          <div><label style={pjLbl}>CNPJ</label><input style={{ ...pjInp, width: '100%' }} value={f.cnpj} onChange={e => setF(p => ({ ...p, cnpj: e.target.value }))} /></div>
          <div><label style={pjLbl}>Observações</label><input style={{ ...pjInp, width: '100%' }} value={f.notes} onChange={e => setF(p => ({ ...p, notes: e.target.value }))} /></div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={submitNew} disabled={!f.legal_name.trim()} className="btn btn-primary">Salvar</button>
            <button onClick={() => setAdding(false)} className="btn btn-outline">✕</button>
          </div>
        </div>
      )}

      {pjs.length === 0 && !adding ? (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: font }}>Nenhuma PJ cadastrada.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pjs.map(p => editId === p.id ? (
            <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr auto', gap: 8, alignItems: 'end', padding: 12, borderRadius: 8, background: 'var(--bg-subtle)', border: '1px solid var(--divider-soft)' }}>
              <div><label style={pjLbl}>Razão social *</label><input style={{ ...pjInp, width: '100%' }} value={ef.legal_name} onChange={e => setEf(s => ({ ...s, legal_name: e.target.value }))} /></div>
              <div><label style={pjLbl}>CNPJ</label><input style={{ ...pjInp, width: '100%' }} value={ef.cnpj} onChange={e => setEf(s => ({ ...s, cnpj: e.target.value }))} /></div>
              <div><label style={pjLbl}>Observações</label><input style={{ ...pjInp, width: '100%' }} value={ef.notes} onChange={e => setEf(s => ({ ...s, notes: e.target.value }))} /></div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={submitEdit} className="btn btn-primary">Salvar</button>
                <button onClick={() => setEditId(null)} className="btn btn-outline">✕</button>
              </div>
            </div>
          ) : (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 14px', borderRadius: 8, background: 'var(--bg-subtle)', border: '1px solid var(--divider-soft)' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 600, fontFamily: font, fontSize: 14, color: 'var(--ink-primary)' }}>{p.legal_name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: fontMono, marginTop: 2 }}>
                  {p.cnpj ? `CNPJ ${p.cnpj}` : 'CNPJ não informado'}{p.notes ? ` · ${p.notes}` : ''}
                </div>
              </div>
              <span style={{ fontSize: 11, fontFamily: fontMono, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                {imageCountByPj[p.id] ?? 0} lanç. de imagem
              </span>
              {canEdit && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => startEdit(p)} className="btn btn-outline">Editar</button>
                  <button onClick={() => { if (window.confirm(`Excluir a PJ "${p.legal_name}"? Os lançamentos de imagem ficarão sem PJ.`)) onDelete(p.id) }} title="Excluir" style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--divider-strong)', background: 'transparent', color: 'var(--neg)', fontSize: 11, fontFamily: font, cursor: 'pointer' }}>Excluir</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


// ── SalaryImageEditor — salário + imagem editáveis, com o gráfico ────────────
function SalaryImageEditor({ contract, triggers, clauses, installments, pjs, athleteName, canEdit, onSaved }: {
  contract: Contract; triggers: SalaryTrigger[]; clauses: Clause[]; installments: ClauseInstallment[]; pjs: AthletePJ[]; athleteName: string; canEdit: boolean; onSaved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  const [f, setF] = useState({
    base_salary: contract.base_salary != null ? String(contract.base_salary) : '',
    image_value: contract.image_value != null ? String(contract.image_value) : '',
    other_value: contract.other_value != null ? String(contract.other_value) : '',
    salary_currency: contract.salary_currency,
  })
  const eff = effectiveSalary(contract, triggers)
  const salaryNow = eff.amount ?? 0
  const image = contract.image_value ?? 0
  const other = contract.other_value ?? 0
  const total = salaryNow + image + other

  async function save() {
    setSaving(true)
    try {
      const patch = {
        base_salary: f.base_salary ? parseFloat(f.base_salary) : null,
        image_value: f.image_value ? parseFloat(f.image_value) : null,
        other_value: f.other_value ? parseFloat(f.other_value) : null,
        salary_currency: f.salary_currency as Currency,
      }
      await updateContract(contract.id, patch)
      // Propaga a moeda para as parcelas de salário/imagem já geradas.
      await updateContractFlowsCurrency(contract.id, f.salary_currency as Currency, contract.transfer_currency)
      // Fluxo mensal automático: regenera salário/imagem preservando parcelas pagas.
      await regenerateSalaryFlow({
        contract: { ...contract, ...patch }, triggers, pjs, athleteName, clauses, installments,
      })
      setEditing(false)
      onSaved()
    } finally { setSaving(false) }
  }

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 6, fontSize: 13, background: 'var(--cream-canvas)', border: '1px solid var(--input-border)', color: 'var(--ink-primary)', fontFamily: fontMono, boxSizing: 'border-box' }
  const lbl2: React.CSSProperties = { fontSize: 9, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4, display: 'block' }
  const kcard = (label: string, val: string, hi?: boolean) => (
    <div style={{ padding: '12px 16px', borderRadius: 8, background: hi ? '#e6ece2' : 'var(--bg-subtle)', border: `1px solid ${hi ? 'rgba(58,111,58,0.25)' : 'var(--divider-soft)'}` }}>
      <div style={{ fontSize: 9, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: hi ? '#3a6f3a' : 'var(--text-muted)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 700, fontFamily: fontMono, color: hi ? '#3a6f3a' : 'var(--ink-primary)' }}>{val}</div>
    </div>
  )

  return (
    <div className="card" style={{ padding: '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-primary)', fontFamily: font }}>Remuneração — paga pelo Botafogo</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: fontMono }}>
            Vínculo {fmtDate(contract.start_date)}{contract.end_date ? ` → ${fmtDate(contract.end_date)}` : ''} · origem: {contract.counterpart_club}
          </div>
          {canEdit && !editing && (
            <IconButton icon="edit" label="Editar salário e imagem — o fluxo mensal é regerado automaticamente" onClick={() => setEditing(true)} />
          )}
        </div>
      </div>

      {editing ? (
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            <div><label style={lbl2}>Salário CLT</label><NumberInput style={inp} value={f.base_salary} onChange={v => setF(p => ({ ...p, base_salary: v }))} /></div>
            <div><label style={lbl2}>Direito de imagem</label><NumberInput style={inp} value={f.image_value} onChange={v => setF(p => ({ ...p, image_value: v }))} /></div>
            <div><label style={lbl2}>Outros (moradia/aux.)</label><NumberInput style={inp} value={f.other_value} onChange={v => setF(p => ({ ...p, other_value: v }))} /></div>
            <div><label style={lbl2}>Moeda</label>
              <select style={inp} value={f.salary_currency} onChange={e => setF(p => ({ ...p, salary_currency: e.target.value as Currency }))}>
                {(['BRL', 'EUR', 'USD', 'GBP'] as Currency[]).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={save} disabled={saving} className="btn btn-primary">{saving ? 'Salvando...' : 'Salvar'}</button>
            <button onClick={() => setEditing(false)} className="btn btn-outline">Cancelar</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 }}>
          {kcard('Salário CLT (hoje)', fmtCurrencyShort(salaryNow, contract.salary_currency), eff.source !== null)}
          {kcard('Direito de imagem', fmtCurrencyShort(image, contract.salary_currency))}
          {kcard('Outros (moradia/aux.)', fmtCurrencyShort(other, contract.salary_currency))}
          {kcard('Remuneração total/mês', fmtCurrencyShort(total, contract.salary_currency), true)}
        </div>
      )}

      <div style={{ marginBottom: 8, fontSize: 10, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Evolução da remuneração</div>
      <RemunerationChart contract={contract} triggers={triggers} />
    </div>
  )
}

// ── LoanShareSection — rateio de salário nos empréstimos de saída ─────────────
// Quando o atleta é emprestado, o clube que o recebe pode assumir parte (ou tudo)
// do CLT e/ou da imagem. Aqui se vê e se configura esse rateio; o fluxo mensal é
// regerado a partir da data do empréstimo.
function LoanShareSection({ workContract, contracts, triggers, canEdit, onConfigure }: {
  workContract: Contract
  contracts: Contract[]
  triggers: SalaryTrigger[]
  canEdit: boolean
  onConfigure: (loanContractId: string) => void
}) {
  const loans = contracts
    .filter(c => c.type === 'EMPRESTIMO_SAIDA')
    .sort((a, b) => (b.start_date ?? '').localeCompare(a.start_date ?? ''))
  const fullSalary = workContract.base_salary ?? 0
  const fullImage = workContract.image_value ?? 0
  const currency = workContract.salary_currency ?? 'BRL'

  return (
    <div className="card" style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 10, fontFamily: fontMono, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-secondary)' }}>
            Empréstimos — rateio de salário
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontFamily: font, marginTop: 3 }}>
            O clube que recebe o atleta pode arcar com parte do CLT e/ou da imagem. O fluxo mensal passa a
            considerar só a parte do Botafogo a partir da data do empréstimo.
          </div>
        </div>
      </div>

      {loans.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: font }}>
          Nenhum empréstimo de saída cadastrado. Registre o empréstimo em “+ Novo contrato” para configurar o rateio.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loans.map(loan => {
            const share = loanShareTriggers(triggers, loan.id)
              .map(t => decodeLoanShare(t.notes))
              .find(m => m?.role === 'RATEIO') ?? null
            const split = splitLoanSalary(fullSalary, fullImage, share?.clubSalaryPct ?? 0, share?.clubImagePct ?? 0)
            const botafogo = split.botafogoSalary + split.botafogoImage
            return (
              <div key={loan.id} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 14px', borderRadius: 8, background: 'var(--bg-subtle)', border: '1px solid var(--divider-soft)' }}>
                <div style={{ minWidth: 200, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-primary)', fontFamily: font }}>{loan.counterpart_club || '—'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: fontMono, marginTop: 2 }}>
                    {fmtDate(loan.start_date)}{loan.end_date ? ` → ${fmtDate(loan.end_date)}` : ''}
                  </div>
                </div>
                {share ? (
                  <>
                    <span style={{ padding: '2px 9px', borderRadius: 5, fontSize: 9, fontWeight: 600, fontFamily: fontMono, letterSpacing: '0.08em', textTransform: 'uppercase', background: 'var(--info-tint)', color: 'var(--info)' }}>
                      rateio ativo
                    </span>
                    <span style={{ fontSize: 11.5, fontFamily: fontMono, color: 'var(--text-secondary)' }}>
                      clube arca {share.clubSalaryPct}% CLT · {share.clubImagePct}% imagem
                    </span>
                    <span style={{ fontSize: 12.5, fontFamily: fontMono, fontWeight: 700, color: 'var(--ink-primary)' }}>
                      Botafogo {fmtCurrencyShort(botafogo, currency)}/mês
                    </span>
                  </>
                ) : (
                  <span style={{ fontSize: 11.5, fontFamily: font, color: 'var(--text-muted)' }}>
                    sem rateio — Botafogo paga integral ({fmtCurrencyShort(fullSalary + fullImage, currency)}/mês)
                  </span>
                )}
                {canEdit && (
                  <IconButton icon={share ? 'edit' : 'split'} tone={share ? 'default' : 'info'}
                    label={share ? 'Editar o rateio deste empréstimo' : 'Configurar o rateio deste empréstimo'}
                    onClick={() => onConfigure(loan.id)} />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── FlowList — parcelas de cláusulas de tipos específicos (fluxo mensal) ──────
// Cada parcela é editável aqui mesmo (ícones): editar, marcar paga, registrar
// pagamento, reverter — além de abrir a obrigação e editar o fluxo inteiro.
function FlowList({ title, installments, clauses, types, canEdit, onEditInst, onPayInst, onQuickPayInst, onRevertInst, onFlowClause }: {
  title: string; installments: ClauseInstallment[]; clauses: Clause[]; types: string[]
  canEdit: boolean
  onEditInst: (id: string) => void
  onPayInst: (id: string) => void
  onQuickPayInst: (id: string) => void
  onRevertInst: (id: string) => void
  onFlowClause: (clauseId: string) => void
}) {
  const typeById = new Map(clauses.map(c => [c.id, c.clause_type as string]))
  const rows = installments
    .filter(i => { const t = typeById.get(i.clause_id); return !!t && types.includes(t) })
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
  const total = rows.reduce((s, r) => s + (r.original_value || 0), 0)
  const cur = rows[0]?.currency ?? 'BRL'
  // Cláusulas que geram este fluxo — permitem editar o cronograma inteiro.
  const flowClauses = clauses.filter(c => types.includes(c.clause_type))
  return (
    <div className="card" style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 10, fontFamily: fontMono, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-secondary)' }}>{title}</div>
        <div style={{ fontSize: 12, fontFamily: fontMono, color: 'var(--ink-primary)' }}>{rows.length} parcela(s) · {fmtCurrencyShort(total, cur)}</div>
      </div>

      {/* Uma "pastilha" por fluxo, com o nome escrito — evita ícones repetidos e
          anônimos quando o atleta tem salário E imagem. */}
      {canEdit && flowClauses.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {flowClauses.map(c => (
            <span key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 6px 4px 12px', borderRadius: 20, background: 'var(--bg-subtle)', border: '1px solid var(--divider)' }}>
              <span style={{ fontFamily: font, fontSize: 12, fontWeight: 600, color: 'var(--ink-primary)' }}>
                {c.clause_type === 'SALARIO_CETD' ? 'Salário CLT' : c.clause_type === 'DIREITO_IMAGEM' ? 'Direito de imagem' : CLAUSE_TYPE_LABELS[c.clause_type]}
              </span>
              <RowActions align="left"
                open={{ to: `/obrigacoes/${c.id}`, label: `Abrir ${CLAUSE_TYPE_LABELS[c.clause_type]}` }}
                schedule={{ onClick: () => onFlowClause(c.id), label: `Ver / editar as parcelas de ${CLAUSE_TYPE_LABELS[c.clause_type]}` }}
              />
            </span>
          ))}
        </div>
      )}
      {canEdit && rows.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <ActionLegend items={['edit', 'schedule', 'markPaid', 'pay', 'revert']} />
        </div>
      )}
      {rows.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: font }}>Nenhuma parcela gerada. Use o assistente (+ Criar) ou o novo vínculo para gerar o fluxo.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 340, overflowY: 'auto' }}>
          {rows.map(r => {
            const late = isOverdue(r.due_date, r.payment_status)
            const tipo = typeById.get(r.clause_id)
            return (
              <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 120px 90px 120px', gap: 10, alignItems: 'center', padding: '6px 10px', borderRadius: 6, background: 'var(--bg-subtle)', border: '1px solid var(--divider-soft)' }}>
                <span style={{ fontFamily: fontMono, fontSize: 11, color: late ? 'var(--neg)' : 'var(--ink-secondary)', fontWeight: late ? 700 : 400 }}>{fmtDate(r.due_date)}</span>
                <span style={{ fontSize: 11, fontFamily: fontMono, color: 'var(--text-secondary)' }}>{tipo === 'SALARIO_CETD' ? 'Salário CLT' : tipo === 'DIREITO_IMAGEM' ? 'Imagem' : (tipo ? CLAUSE_TYPE_LABELS[tipo as keyof typeof CLAUSE_TYPE_LABELS] : '')}</span>
                <span style={{ fontFamily: fontMono, fontWeight: 600, fontSize: 13, textAlign: 'right' }}>{fmtCurrencyShort(r.original_value, r.currency)}</span>
                <span style={{ textAlign: 'right' }}><StatusBadge status={r.payment_status} map={PAYMENT_STATUS_STYLE} /></span>
                <span style={{ textAlign: 'right' }}>
                  <InstallmentActions inst={r} canEdit={canEdit} onEdit={() => onEditInst(r.id)} onPay={() => onPayInst(r.id)}
                    onQuickPay={() => onQuickPayInst(r.id)} onRevert={() => onRevertInst(r.id)}
                    onSchedule={() => onFlowClause(r.clause_id)} />
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── ConsolidadoTab — todo o fluxo financeiro do atleta ───────────────────────
function ConsolidadoTab({
  clauses, installments, clubLiabs, intermLiabs, canEdit, clubIdx, agentIdx,
  onOpenClause, onEditInst, onEditClause, onFlowClause, onPayInst, onQuickPayInst, onRevertInst,
  onDeleteClause, onEditLiab, onDeleteLiab, onConvertLiab,
}: {
  clauses: Clause[]; installments: ClauseInstallment[]; clubLiabs: ClubLiability[]; intermLiabs: IntermediaryLiability[]
  canEdit: boolean
  clubIdx: Map<string, string>
  agentIdx: Map<string, string>
  onOpenClause: (clauseId: string) => void
  onEditInst: (id: string) => void
  onEditClause: (id: string) => void
  onFlowClause: (id: string) => void
  onPayInst: (id: string) => void
  onQuickPayInst: (id: string) => void
  onRevertInst: (id: string) => void
  onDeleteClause: (id: string) => void
  onEditLiab: (kind: 'club' | 'agent', id: string) => void
  onDeleteLiab: (kind: 'club' | 'agent', id: string) => void
  onConvertLiab: (kind: 'club' | 'agent', id: string) => void
}) {
  // Link da contraparte para a página do clube/agente (amarração cruzada).
  const entityLink = (parte: string): string | null => {
    const k = norm(parte)
    const club = clubIdx.get(k)
    if (club) return `/clubes/${club}`
    const agent = agentIdx.get(k)
    if (agent) return `/intermediarios/${agent}`
    return null
  }
  const th: React.CSSProperties = { padding: '8px 12px', fontSize: 9, fontWeight: 500, textTransform: 'uppercase', background: 'var(--tbl-head)', color: 'var(--ink-secondary)', borderBottom: '1px solid var(--divider-strong)', fontFamily: fontMono, letterSpacing: '0.14em', whiteSpace: 'nowrap', textAlign: 'left' }
  const td: React.CSSProperties = { padding: '8px 12px', fontSize: 12, color: 'var(--ink-primary)', fontFamily: font, borderBottom: '1px solid var(--divider-soft)', verticalAlign: 'middle' }
  const clauseById = new Map(clauses.map(c => [c.id, c]))
  type Item = { date: string | null; nat: string; parte: string; dir: 'A_PAGAR' | 'A_RECEBER'; valor: number; moeda: Currency; status: string; kind: 'inst' | 'clause' | 'club' | 'agent'; ref: string; clauseRef?: string }
  const items: Item[] = []
  const isBFR = (s: string) => s.toLowerCase().includes('botafogo') || s.toLowerCase() === 'bfr'

  for (const it of installments) {
    const c = clauseById.get(it.clause_id)
    const dir: Item['dir'] = c && isBFR(c.debtor_party) ? 'A_PAGAR' : c ? 'A_RECEBER' : 'A_PAGAR'
    items.push({ date: it.due_date, nat: c ? CLAUSE_TYPE_LABELS[c.clause_type] : 'Parcela', parte: c ? (dir === 'A_PAGAR' ? c.creditor_party : c.debtor_party) : '—', dir, valor: it.original_value, moeda: it.currency, status: it.payment_status, kind: 'inst', ref: it.id, clauseRef: it.clause_id })
  }
  for (const c of clauses) {
    if ((c.installments_total ?? 1) > 1) continue
    if (c.original_value == null) continue
    const dir: Item['dir'] = isBFR(c.debtor_party) ? 'A_PAGAR' : 'A_RECEBER'
    items.push({ date: c.due_date, nat: CLAUSE_TYPE_LABELS[c.clause_type], parte: dir === 'A_PAGAR' ? c.creditor_party : c.debtor_party, dir, valor: c.original_value, moeda: c.currency, status: c.payment_status, kind: 'clause', ref: c.id, clauseRef: c.id })
  }
  for (const l of clubLiabs) items.push({ date: l.due_date, nat: 'Obrigação clube', parte: l.club_name, dir: l.direction, valor: l.amount, moeda: l.currency, status: l.status, kind: 'club', ref: l.id })
  for (const l of intermLiabs) items.push({ date: l.due_date, nat: 'Obrigação agente', parte: l.intermediary_name, dir: l.direction, valor: l.amount, moeda: l.currency, status: l.status, kind: 'agent', ref: l.id })

  items.sort((a, b) => (a.date ?? '9999-99-99').localeCompare(b.date ?? '9999-99-99'))

  const open = ['PENDENTE', 'PARCIALMENTE_PAGA', 'EM_ATRASO']
  const tot: Record<string, number> = {}
  for (const it of items) if (open.includes(it.status)) { const k = `${it.dir}|${it.moeda}`; tot[k] = (tot[k] ?? 0) + it.valor }
  const totEntries = Object.entries(tot)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {totEntries.length > 0 && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {totEntries.sort().map(([k, v]) => {
            const [dir, moeda] = k.split('|')
            const pay = dir === 'A_PAGAR'
            return (
              <div key={k} style={{ padding: '10px 14px', borderRadius: 8, background: pay ? 'var(--neg-tint)' : '#e6ece2', border: `1px solid ${pay ? 'rgba(122,63,44,0.25)' : 'rgba(58,111,58,0.25)'}` }}>
                <div style={{ fontSize: 9, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: pay ? 'var(--neg)' : '#3a6f3a', marginBottom: 4 }}>{pay ? 'A pagar' : 'A receber'} · {moeda} (em aberto)</div>
                <div style={{ fontSize: 17, fontWeight: 700, fontFamily: fontMono, color: pay ? 'var(--neg)' : '#3a6f3a' }}>{fmtCurrencyShort(v, moeda as Currency)}</div>
              </div>
            )
          })}
        </div>
      )}
      {canEdit && <ActionLegend items={['open', 'edit', 'schedule', 'generate', 'markPaid', 'pay', 'revert', 'remove']} />}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={{ ...th, textAlign: 'left', minWidth: 90 }}>Vencimento</th>
              <th style={{ ...th, textAlign: 'left', minWidth: 150 }}>Natureza</th>
              <th style={{ ...th, textAlign: 'left', minWidth: 150 }}>Contraparte</th>
              <th style={{ ...th, minWidth: 80 }}>Direção</th>
              <th style={{ ...th, textAlign: 'right', minWidth: 110 }}>Valor</th>
              <th style={{ ...th, minWidth: 90 }}>Status</th>
              {canEdit && <th style={{ ...th, minWidth: 120, textAlign: 'right' }}>Ações</th>}
            </tr></thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={canEdit ? 7 : 6} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Nenhum fluxo financeiro para este atleta.</td></tr>}
              {items.map((it, i) => {
                const late = isOverdue(it.date, it.status)
                const inst = it.kind === 'inst' ? installments.find(p => p.id === it.ref) : null
                const link = entityLink(it.parte)
                return (
                  <tr key={i} style={{ background: late ? 'var(--row-late-bg)' : 'transparent' }}>
                    <td style={{ ...td, fontFamily: fontMono, fontSize: 11, color: late ? 'var(--neg)' : 'var(--ink-secondary)', fontWeight: late ? 700 : 400 }}>{it.date ? fmtDate(it.date) : '—'}</td>
                    <td style={{ ...td, fontSize: 12 }}>
                      {it.clauseRef
                        ? <button style={{ background: 'none', border: 'none', padding: 0, color: 'var(--ink-primary)', fontFamily: font, fontSize: 12, fontWeight: 500, cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'var(--accent-line)', textUnderlineOffset: 2 }} onClick={() => onOpenClause(it.clauseRef!)} title="Abrir a obrigação">{it.nat}</button>
                        : it.nat}
                    </td>
                    <td style={{ ...td, fontSize: 12, color: 'var(--text-secondary)' }}>
                      {link ? <RefLink to={link} title="Abrir cadastro da contraparte">{it.parte}</RefLink> : it.parte}
                    </td>
                    <td style={{ ...td, textAlign: 'center', fontSize: 10, fontFamily: fontMono, color: it.dir === 'A_PAGAR' ? 'var(--neg)' : 'var(--pos)' }}>{it.dir === 'A_PAGAR' ? 'a pagar' : 'a receber'}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: fontMono, fontWeight: 600 }}>{fmtCurrencyShort(it.valor, it.moeda)}</td>
                    <td style={td}><StatusBadge status={it.status} map={PAYMENT_STATUS_STYLE} /></td>
                    {canEdit && (
                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <RowActions
                          open={{ to: it.clauseRef ? `/obrigacoes/${it.clauseRef}` : null, reason: 'passivo importado — gere as parcelas para criar a obrigação' }}
                          edit={{
                            onClick: it.kind === 'inst' ? () => onEditInst(it.ref)
                              : it.kind === 'clause' ? () => onEditClause(it.ref)
                              : () => onEditLiab(it.kind as 'club' | 'agent', it.ref),
                          }}
                          schedule={it.clauseRef ? { onClick: () => onFlowClause(it.clauseRef!) } : undefined}
                          generate={!it.clauseRef ? { onClick: () => onConvertLiab(it.kind as 'club' | 'agent', it.ref) } : undefined}
                          markPaid={{
                            onClick: inst && inst.payment_status !== 'PAGA' && inst.payment_status !== 'CANCELADA' ? () => onQuickPayInst(it.ref) : undefined,
                            reason: !inst ? 'gere as parcelas para dar baixa' : inst.payment_status === 'PAGA' ? 'parcela já paga' : 'parcela cancelada',
                          }}
                          pay={{
                            onClick: inst && inst.payment_status !== 'PAGA' && inst.payment_status !== 'CANCELADA' ? () => onPayInst(it.ref) : undefined,
                            reason: !inst ? 'disponível por parcela' : inst.payment_status === 'PAGA' ? 'parcela já paga' : 'parcela cancelada',
                          }}
                          revert={{
                            onClick: inst && inst.payment_status === 'PAGA' ? () => onRevertInst(it.ref) : undefined,
                            reason: 'a parcela não está paga',
                          }}
                          remove={{
                            onClick: it.kind === 'clause' ? () => onDeleteClause(it.ref)
                              : (it.kind === 'club' || it.kind === 'agent') ? () => onDeleteLiab(it.kind as 'club' | 'agent', it.ref)
                              : undefined,
                            reason: 'exclua a parcela pela tela de edição',
                          }}
                        />
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── AccessoryFlowTab — Luvas / Agentes (estilo relatório) + novo fluxo ────────
function AccessoryFlowTab({
  kind, athleteId, clauses, installments, intermLiabs, contracts, canEdit, clubIdx, agentIdx,
  onOpenClause, onSaved, onEditClause, onFlowClause, onEditInst, onPayInst, onQuickPayInst, onRevertInst,
  onEditLiab, onGenerateLiabFlow,
}: {
  kind: 'luvas' | 'agentes'
  athleteId: string
  clauses: Clause[]
  installments: ClauseInstallment[]
  intermLiabs: IntermediaryLiability[]
  contracts: Contract[]
  canEdit: boolean
  clubIdx: Map<string, string>
  agentIdx: Map<string, string>
  onOpenClause: (clauseId: string) => void
  onSaved: () => void
  onEditClause: (clauseId: string) => void
  onFlowClause: (clauseId: string) => void
  onEditInst: (id: string) => void
  onPayInst: (id: string) => void
  onQuickPayInst: (id: string) => void
  onRevertInst: (id: string) => void
  onEditLiab: (id: string) => void
  onGenerateLiabFlow: (id: string) => void
}) {
  const [showNew, setShowNew] = useState(false)
  const types = kind === 'luvas' ? LUVAS_TYPES : AGENT_TYPES
  const clauseType: ClauseType = kind === 'luvas' ? 'LUVAS' : 'INTERMEDIACAO'
  const title = kind === 'luvas' ? 'Luvas' : 'Agentes'
  const entityLink = (parte: string): string | null => {
    const k = norm(parte)
    const agent = agentIdx.get(k)
    if (agent) return `/intermediarios/${agent}`
    const club = clubIdx.get(k)
    if (club) return `/clubes/${club}`
    return null
  }

  type R = { id: string; kind: 'inst' | 'clause' | 'liab'; parte: string; natureza: string; descricao: string; valor: number | null; moeda: Currency; venc: string | null; pag: string | null; status: string; clauseRef?: string }
  const rows: R[] = []
  for (const c of clauses.filter(c => types.includes(c.clause_type))) {
    const contraparte = isBFRparty(c.debtor_party) ? c.creditor_party : c.debtor_party
    const parc = installments.filter(i => i.clause_id === c.id).sort((a, b) => a.due_date.localeCompare(b.due_date))
    if (parc.length) {
      for (const p of parc) rows.push({ id: p.id, kind: 'inst', parte: contraparte, natureza: CLAUSE_TYPE_LABELS[c.clause_type], descricao: `${c.description} — parcela ${p.installment_number}`, valor: p.original_value, moeda: p.currency, venc: p.due_date, pag: p.payment_date, status: p.payment_status, clauseRef: c.id })
    } else {
      rows.push({ id: c.id, kind: 'clause', parte: contraparte, natureza: CLAUSE_TYPE_LABELS[c.clause_type], descricao: c.description, valor: c.original_value, moeda: c.currency, venc: c.due_date, pag: c.payment_date, status: c.payment_status, clauseRef: c.id })
    }
  }
  if (kind === 'agentes') {
    for (const l of intermLiabs) rows.push({ id: l.id, kind: 'liab', parte: l.intermediary_name, natureza: 'Intermediação (passivo)', descricao: l.description ?? '', valor: l.amount, moeda: l.currency, venc: l.due_date, pag: l.settled_date, status: l.status })
  }
  rows.sort((a, b) => (a.venc ?? '9999-99-99').localeCompare(b.venc ?? '9999-99-99'))
  const total = rows.reduce((s, r) => s + (r.valor ?? 0) * (RATE_BRL[r.moeda] ?? 1), 0)

  const th: React.CSSProperties = { padding: '8px 12px', fontSize: 9, fontWeight: 500, textTransform: 'uppercase', background: 'var(--tbl-head)', color: 'var(--ink-secondary)', borderBottom: '1px solid var(--divider-strong)', fontFamily: fontMono, letterSpacing: '0.14em', whiteSpace: 'nowrap', textAlign: 'left' }
  const td: React.CSSProperties = { padding: '9px 12px', fontSize: 12, color: 'var(--ink-primary)', fontFamily: font, borderBottom: '1px solid var(--divider-soft)', verticalAlign: 'middle' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: fontMono }}>
          {rows.length} lançamento(s) · Total aprox. {fmtCurrencyShort(total, 'BRL')}
        </div>
        {canEdit && (
          <button onClick={() => setShowNew(true)} className="btn btn-primary">
            <Icon name="plus" size={14} /> Novo fluxo de {kind === 'luvas' ? 'luvas' : 'agente'}
          </button>
        )}
      </div>
      {canEdit && <ActionLegend items={['open', 'edit', 'schedule', 'generate', 'markPaid', 'pay', 'revert']} />}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={th}>Parte</th>
              <th style={th}>Natureza</th>
              <th style={th}>Descrição</th>
              <th style={{ ...th, textAlign: 'right' }}>Valor</th>
              <th style={th}>Vencimento</th>
              <th style={th}>Pagamento</th>
              <th style={th}>Status</th>
              <th style={{ ...th, textAlign: 'right' }}>Ações</th>
            </tr></thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                  <div style={{ marginBottom: 10 }}>Nenhum fluxo de {title.toLowerCase()} cadastrado.</div>
                  {canEdit && (
                    <button className="btn btn-primary" onClick={() => setShowNew(true)}>
                      <Icon name="plus" size={13} /> Criar fluxo de {kind === 'luvas' ? 'luvas' : 'agente'}
                    </button>
                  )}
                </td></tr>
              )}
              {rows.map(r => {
                const late = r.venc && isOverdue(r.venc, r.status)
                const inst = r.kind === 'inst' ? installments.find(i => i.id === r.id) : null
                const link = entityLink(r.parte)
                return (
                  <tr key={`${r.kind}:${r.id}`} style={{ background: late ? 'var(--row-late-bg)' : undefined }}>
                    <td style={{ ...td, fontWeight: 600 }}>
                      {link ? <RefLink to={link} title="Abrir cadastro da contraparte">{r.parte}</RefLink> : r.parte}
                    </td>
                    <td style={{ ...td, color: 'var(--text-secondary)' }}>
                      {r.clauseRef
                        ? <button onClick={() => onOpenClause(r.clauseRef!)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--ink-primary)', fontFamily: font, fontSize: 12, fontWeight: 500, cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'var(--accent-line)', textUnderlineOffset: 2 }}>{r.natureza}</button>
                        : r.natureza}
                    </td>
                    <td style={{ ...td, color: 'var(--text-secondary)', maxWidth: 320 }}>{r.descricao || '—'}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: fontMono, fontWeight: 600 }}>{r.valor != null ? fmtCurrencyShort(r.valor, r.moeda) : '—'}</td>
                    <td style={{ ...td, fontFamily: fontMono, fontSize: 11, color: late ? 'var(--neg)' : 'var(--text-secondary)' }}>{r.venc ? fmtDate(r.venc) : '—'}</td>
                    <td style={{ ...td, fontFamily: fontMono, fontSize: 11, color: r.pag ? 'var(--pos)' : 'var(--text-muted)' }}>{r.pag ? fmtDate(r.pag) : '—'}</td>
                    <td style={td}><StatusBadge status={r.status} map={PAYMENT_STATUS_STYLE} /></td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <RowActions
                        open={{ to: r.clauseRef ? `/obrigacoes/${r.clauseRef}` : null, reason: 'passivo importado — gere as parcelas para criar a obrigação' }}
                        edit={{
                          onClick: !canEdit ? undefined
                            : r.kind === 'inst' ? () => onEditInst(r.id)
                            : r.kind === 'clause' ? () => onEditClause(r.id)
                            : () => onEditLiab(r.id),
                          reason: 'sem permissão de edição',
                        }}
                        schedule={r.clauseRef ? { onClick: canEdit ? () => onFlowClause(r.clauseRef!) : undefined, reason: 'sem permissão de edição' } : undefined}
                        generate={r.kind === 'liab' ? { onClick: canEdit ? () => onGenerateLiabFlow(r.id) : undefined, reason: 'sem permissão de edição' } : undefined}
                        markPaid={{
                          onClick: canEdit && inst && inst.payment_status !== 'PAGA' && inst.payment_status !== 'CANCELADA' ? () => onQuickPayInst(r.id) : undefined,
                          reason: !inst ? 'gere as parcelas para dar baixa' : inst.payment_status === 'PAGA' ? 'parcela já paga' : 'parcela cancelada',
                        }}
                        pay={{
                          onClick: canEdit && inst && inst.payment_status !== 'PAGA' && inst.payment_status !== 'CANCELADA' ? () => onPayInst(r.id) : undefined,
                          reason: !inst ? 'disponível por parcela' : inst.payment_status === 'PAGA' ? 'parcela já paga' : 'parcela cancelada',
                        }}
                        revert={{
                          onClick: canEdit && inst && inst.payment_status === 'PAGA' ? () => onRevertInst(r.id) : undefined,
                          reason: 'a parcela não está paga',
                        }}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      {showNew && (
        <NewAccessoryFlowModal
          clauseType={clauseType} title={title} athleteId={athleteId} contracts={contracts}
          onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); onSaved() }}
        />
      )}
    </div>
  )
}

// Modal de novo fluxo (luvas / agente): cria a cláusula + parcelas, atrelada ao
// contrato guarda-chuva (transferência de compra).
function NewAccessoryFlowModal({ clauseType, title, athleteId, contracts, onClose, onSaved }: {
  clauseType: ClauseType; title: string; athleteId: string; contracts: Contract[]
  onClose: () => void; onSaved: () => void
}) {
  const umbrella = umbrellaContract(contracts)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [currency, setCurrency] = useState<Currency>('BRL')
  const [contractId, setContractId] = useState<string>(umbrella?.id ?? '')
  const [lines, setLines] = useState<FlowLine[]>([])
  const [saving, setSaving] = useState(false)

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 6, fontSize: 13, background: 'var(--cream-canvas)', border: '1px solid var(--input-border)', color: 'var(--ink-primary)', fontFamily: font, boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontSize: 9, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 3, display: 'block' }
  const valid = lines.filter(l => l.due_date && l.value > 0)
  const canSave = !!name.trim() && valid.length > 0 && !saving

  async function save() {
    if (!canSave) return
    setSaving(true)
    try {
      const total = valid.reduce((s, l) => s + l.value, 0)
      const clause = await createClause(contractId || null, athleteId, {
        clause_type: clauseType,
        description: desc.trim() || `${title} — ${name.trim()}`,
        creditor_party: name.trim(), debtor_party: 'Botafogo SAF',
        currency, original_value: total, percentage_value: null,
        condition_description: '', due_date: valid[0].due_date,
        installments_total: valid.length, notes: '',
      })
      await createClauseInstallments(clause.id, athleteId,
        valid.map((l, i) => ({ installment_number: i + 1, due_date: l.due_date, original_value: l.value, currency })))
      onSaved()
    } finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,20,16,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--cream-card)', borderRadius: 12, padding: 26, width: 680, maxWidth: '96vw', maxHeight: '92vh', overflowY: 'auto', border: '1px solid var(--divider)', boxShadow: 'var(--shadow-panel)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-primary)', fontFamily: font }}>Novo fluxo — {title}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            {clauseType === 'INTERMEDIACAO'
              ? <EntityPicker kind="intermediario" label="Agente / Intermediário *" value={name} onChange={n => setName(n)} />
              : <><label style={lbl}>Credor (atleta/agente/clube) *</label><input style={inp} value={name} onChange={e => setName(e.target.value)} placeholder="Nome do credor" /></>}
          </div>
          <div><label style={lbl}>Moeda</label><select style={inp} value={currency} onChange={e => setCurrency(e.target.value as Currency)}>{(['BRL', 'EUR', 'USD', 'GBP'] as Currency[]).map(c => <option key={c} value={c}>{c}</option>)}</select></div>
        </div>
        <div><label style={lbl}>Descrição</label><input style={inp} value={desc} onChange={e => setDesc(e.target.value)} placeholder={`Ex.: Contrato de ${title.toLowerCase()} 2M em 10x`} /></div>
        <div>
          <label style={lbl}>Contrato guarda-chuva</label>
          <select style={inp} value={contractId} onChange={e => setContractId(e.target.value)}>
            <option value="">— nenhum (independente) —</option>
            {contracts.filter(c => TRANSFER_CONTRACT_TYPES.includes(c.type)).map(c => <option key={c.id} value={c.id}>{contractLabel(c)}</option>)}
          </select>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: font, marginTop: 4 }}>Atrela este fluxo à transferência de compra do atleta.</div>
        </div>
        <div>
          <label style={lbl}>Fluxo de pagamento</label>
          <FlowBuilder currency={currency} onCurrencyChange={setCurrency} lines={lines} onChange={setLines} seedRows={4} />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="btn btn-outline">Cancelar</button>
          <button onClick={save} disabled={!canSave} style={{ padding: '8px 22px', borderRadius: 7, border: 'none', background: canSave ? 'var(--accent)' : '#ccc', color: '#fff', fontSize: 12, fontFamily: font, fontWeight: 600, cursor: canSave ? 'pointer' : 'not-allowed' }}>{saving ? 'Salvando...' : 'Salvar fluxo'}</button>
        </div>
      </div>
    </div>
  )
}

// ── GatilhosTab — metas salariais (CLT + imagem) + cláusulas de performance ───
function GatilhosTab({ emp, empTriggers, clauses, installments, umbrella, canEdit, onAddTrigger, onMarkTrigger, onResetTrigger, onDeleteTrigger, onOpenClause, onEditClause, onFlowClause, onMarkAchieved, onPayClause, onCancelClause, onNewClause }: {
  emp: Contract | null
  empTriggers: SalaryTrigger[]
  clauses: Clause[]
  installments: ClauseInstallment[]
  umbrella: Contract | null
  canEdit: boolean
  onAddTrigger: (input: NewSalaryTriggerInput) => Promise<void>
  onMarkTrigger: (tid: string, date: string) => void
  onResetTrigger: (tid: string) => void
  onDeleteTrigger: (tid: string) => void
  onOpenClause: (cid: string) => void
  onEditClause: (cid: string) => void
  onFlowClause: (cid: string) => void
  onMarkAchieved: (cid: string) => void
  onPayClause: (cid: string) => void
  onCancelClause: (cid: string) => void
  onNewClause: (contractId: string) => void
}) {
  const diverse = clauses.filter(c => isDiverseClause(c.clause_type))
  const th: React.CSSProperties = { padding: '8px 12px', fontSize: 9, fontWeight: 500, textTransform: 'uppercase', background: 'var(--tbl-head)', color: 'var(--ink-secondary)', borderBottom: '1px solid var(--divider-strong)', fontFamily: fontMono, letterSpacing: '0.14em', whiteSpace: 'nowrap', textAlign: 'left' }
  const td: React.CSSProperties = { padding: '9px 12px', fontSize: 12, color: 'var(--ink-primary)', fontFamily: font, borderBottom: '1px solid var(--divider-soft)', verticalAlign: 'middle' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Metas salariais (gatilhos que mudam salário/imagem) */}
      <div className="card" style={{ padding: '18px 20px' }}>
        <div style={{ marginBottom: 10, fontSize: 10, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Gatilhos de salário / imagem</div>
        {!emp ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
            Cadastre um vínculo de trabalho com salário na aba <strong>Salário</strong> para criar gatilhos de aumento.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {empTriggers.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: font }}>Nenhum gatilho cadastrado.</div>
                : empTriggers.map(t => <TriggerRow key={t.id} t={t} canEdit={canEdit} onMark={d => onMarkTrigger(t.id, d)} onReset={() => onResetTrigger(t.id)} onDelete={() => onDeleteTrigger(t.id)} />)}
            </div>
            {canEdit && <NewTriggerForm contract={emp} onAdd={onAddTrigger} />}
          </>
        )}
      </div>

      {/* Cláusulas diversas / de performance */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--divider-soft)' }}>
          <div style={{ fontSize: 10, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Cláusulas diversas e de performance</div>
          {canEdit && umbrella && <button onClick={() => onNewClause(umbrella.id)} className="btn btn-outline" style={{ padding: '6px 12px' }}><Icon name="plus" size={13} /> Nova cláusula</button>}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={th}>Tipo</th>
              <th style={th}>Descrição</th>
              <th style={{ ...th, textAlign: 'right' }}>Valor</th>
              <th style={th}>Atingimento</th>
              <th style={th}>Pagamento</th>
              <th style={{ ...th, textAlign: 'center' }}>Ações</th>
            </tr></thead>
            <tbody>
              {diverse.length === 0 && (
                <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                  <div style={{ marginBottom: 10 }}>Nenhuma cláusula de performance. Ex.: 10k por gol, 10k por clean sheet, bônus de convocação.</div>
                  {canEdit && umbrella && (
                    <button className="btn btn-primary" onClick={() => onNewClause(umbrella.id)}>
                      <Icon name="plus" size={13} /> Criar cláusula de performance
                    </button>
                  )}
                </td></tr>
              )}
              {diverse.map(c => {
                const parc = installments.filter(i => i.clause_id === c.id)
                const tot = parc.length ? parc.reduce((s, p) => s + p.original_value, 0) : (c.original_value ?? 0)
                return (
                  <tr key={c.id}>
                    <td style={{ ...td, fontFamily: fontMono, fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>{CLAUSE_TYPE_LABELS[c.clause_type]}</td>
                    <td style={td}>
                      <div style={{ fontWeight: 500 }}>{c.description}</div>
                      {c.condition_description && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{c.condition_description}</div>}
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: fontMono, fontWeight: 600 }}>{tot ? fmtCurrencyShort(tot, c.currency) : c.percentage_value ? `${c.percentage_value}%` : '—'}</td>
                    <td style={td}><StatusBadge status={c.achievement_status} map={{ PENDENTE: TRIGGER_STATUS_STYLE.PENDENTE, ATINGIDA: TRIGGER_STATUS_STYLE.ATINGIDA, NAO_ATINGIDA: TRIGGER_STATUS_STYLE.NAO_ATINGIDA, NAO_APLICAVEL: TRIGGER_STATUS_STYLE.NAO_ATINGIDA }} /></td>
                    <td style={td}><StatusBadge status={c.payment_status} map={PAYMENT_STATUS_STYLE} /></td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      {canEdit && <ClauseActions clause={c} onOpen={() => onOpenClause(c.id)} onEdit={() => onEditClause(c.id)} onFlow={() => onFlowClause(c.id)} onMarkAchieved={() => onMarkAchieved(c.id)} onPay={() => onPayClause(c.id)} onCancel={() => onCancelClause(c.id)} />}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── ContractEditModal — editar vínculo (histórico) ───────────────────────────
function ContractEditModal({ contract, siblings, onClose, onSaved }: {
  contract: Contract; siblings: Contract[]; onClose: () => void; onSaved: () => void
}) {
  // Contratos aos quais este pode ser atrelado (todos do atleta, menos ele mesmo).
  const relatable = siblings.filter(c => c.id !== contract.id)
  const [f, setF] = useState({
    type: contract.type,
    status: contract.status,
    related_contract_id: contract.related_contract_id ?? '',
    counterpart_club: contract.counterpart_club ?? '',
    counterpart_country: contract.counterpart_country ?? '',
    start_date: contract.start_date ?? '',
    end_date: contract.end_date ?? '',
    transfer_fee_gross: contract.transfer_fee_gross != null ? String(contract.transfer_fee_gross) : '',
    transfer_currency: contract.transfer_currency,
    base_salary: contract.base_salary != null ? String(contract.base_salary) : '',
    image_value: contract.image_value != null ? String(contract.image_value) : '',
    other_value: contract.other_value != null ? String(contract.other_value) : '',
    salary_currency: contract.salary_currency,
    description: contract.description ?? '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }))
  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 6, fontSize: 13, background: 'var(--cream-canvas)', border: '1px solid var(--input-border)', color: 'var(--ink-primary)', fontFamily: font, boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontSize: 9, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 3, display: 'block' }
  const cur: Currency[] = ['BRL', 'EUR', 'USD', 'GBP']

  async function save() {
    setSaving(true)
    try {
      const patch: Partial<Contract> = {
        type: f.type, status: f.status,
        counterpart_club: f.counterpart_club, counterpart_country: f.counterpart_country || null,
        start_date: f.start_date, end_date: f.end_date || null,
        transfer_fee_gross: f.transfer_fee_gross ? parseFloat(f.transfer_fee_gross) : null,
        transfer_currency: f.transfer_currency as Currency,
        base_salary: f.base_salary ? parseFloat(f.base_salary) : null,
        image_value: f.image_value ? parseFloat(f.image_value) : null,
        other_value: f.other_value ? parseFloat(f.other_value) : null,
        salary_currency: f.salary_currency as Currency,
        description: f.description || null,
      }
      // Só envia o vínculo quando de fato mudou (não toca a coluna em contratos
      // sem alteração — seguro mesmo antes de aplicar a migração 015).
      if (f.related_contract_id !== (contract.related_contract_id ?? '')) {
        patch.related_contract_id = f.related_contract_id || null
      }
      await updateContract(contract.id, patch)
      // Propaga a moeda do vínculo para as parcelas do fluxo (salário/imagem/transf.).
      await updateContractFlowsCurrency(contract.id, f.salary_currency as Currency, f.transfer_currency as Currency)
      onSaved()
    } finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,20,16,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--cream-card)', borderRadius: 12, padding: 26, width: 660, maxWidth: '96vw', maxHeight: '92vh', overflowY: 'auto', border: '1px solid var(--divider)', boxShadow: 'var(--shadow-panel)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-primary)', fontFamily: font }}>Editar vínculo</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label style={lbl}>Tipo</label>
            <select style={inp} value={f.type} onChange={e => set('type', e.target.value)}>
              <optgroup label="Transferência">
                {TRANSFER_CONTRACT_TYPES.map(t => <option key={t} value={t}>{CONTRACT_TYPE_LABELS[t]}</option>)}
              </optgroup>
              <optgroup label="Contratos acessórios / vinculados">
                {ACCESSORY_CONTRACT_TYPES.map(t => <option key={t} value={t}>{CONTRACT_TYPE_LABELS[t]}</option>)}
              </optgroup>
            </select>
          </div>
          <div><label style={lbl}>Status</label>
            <select style={inp} value={f.status} onChange={e => set('status', e.target.value)}>
              <option value="ATIVO">Ativo</option><option value="ENCERRADO">Encerrado</option><option value="RESCINDIDO">Rescindido</option>
            </select>
          </div>
          <div><label style={lbl}>Clube / Contraparte</label><input style={inp} value={f.counterpart_club} onChange={e => set('counterpart_club', e.target.value)} /></div>
          <div><label style={lbl}>País</label><input style={inp} value={f.counterpart_country} onChange={e => set('counterpart_country', e.target.value)} /></div>
          <div><label style={lbl}>Início</label><input style={inp} type="date" value={f.start_date} onChange={e => set('start_date', e.target.value)} /></div>
          <div><label style={lbl}>Término</label><input style={inp} type="date" value={f.end_date} onChange={e => set('end_date', e.target.value)} /></div>
          <div><label style={lbl}>Valor transferência</label><NumberInput style={inp} value={f.transfer_fee_gross} onChange={v => set('transfer_fee_gross', v)} /></div>
          <div><label style={lbl}>Moeda transf.</label><select style={inp} value={f.transfer_currency} onChange={e => set('transfer_currency', e.target.value)}>{cur.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          <div><label style={lbl}>Salário CLT/mês</label><NumberInput style={inp} value={f.base_salary} onChange={v => set('base_salary', v)} /></div>
          <div><label style={lbl}>Imagem/mês</label><NumberInput style={inp} value={f.image_value} onChange={v => set('image_value', v)} /></div>
          <div><label style={lbl}>Outros/mês</label><NumberInput style={inp} value={f.other_value} onChange={v => set('other_value', v)} /></div>
          <div><label style={lbl}>Moeda salário</label><select style={inp} value={f.salary_currency} onChange={e => set('salary_currency', e.target.value)}>{cur.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
        </div>
        <div><label style={lbl}>Descrição</label><textarea style={{ ...inp, minHeight: 52, resize: 'vertical' }} value={f.description} onChange={e => set('description', e.target.value)} /></div>
        {relatable.length > 0 && (
          <div>
            <label style={lbl}>Contrato relacionado</label>
            <select style={inp} value={f.related_contract_id} onChange={e => set('related_contract_id', e.target.value)}>
              <option value="">— nenhum (contrato independente) —</option>
              {relatable.map(c => <option key={c.id} value={c.id}>{contractLabel(c)}</option>)}
            </select>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: font, marginTop: 4 }}>
              Atrele este contrato a outro vínculo do atleta (ex.: intermediação/sell-on de uma compra ou venda).
            </div>
          </div>
        )}
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: font }}>
          Alterar salário/imagem aqui muda os valores do vínculo. Para regerar as parcelas mensais, use "Atualizar fluxo mensal" na aba CLT + Imagem.
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="btn btn-outline">Cancelar</button>
          <button onClick={save} disabled={saving} className="btn btn-primary">{saving ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}

// ── NewClauseModal — adicionar cláusula a um vínculo existente ────────────────
// Usado pelo botão "+ Cláusula" no histórico. Cobre desde uma cláusula com
// cronograma de vencimentos (ex.: intermediação parcelada) até cláusulas de
// valor FUTURO/indeterminado — em especial o Sell-on Fee, que tem só um % de
// uma venda futura, sem valor definido ainda.

// Cláusulas "a pagar" pelo Botafogo (define credor/devedor padrão).
const PAYABLE_CLAUSE_TYPES: ClauseType[] = [
  'SELL_ON_FEE', 'INTERMEDIACAO', 'INTERMEDIACAO_VENDA_FUTURA',
  'SALARIO_CETD', 'DIREITO_IMAGEM', 'LUVAS', 'BONUS_PERFORMANCE_ATLETA',
  'SOLIDARIEDADE_FIFA', 'EMPRESTIMO_TAXA', 'CLAUSULA_RESCISORIA',
]
// Cláusulas de valor futuro/indeterminado — o % é o dado principal; o valor
// (e o cronograma) só existirão quando a venda futura se concretizar.
const FUTURE_VALUE_CLAUSE_TYPES: ClauseType[] = [
  'SELL_ON_FEE', 'SELL_ON_FEE_RECEBER', 'INTERMEDIACAO_VENDA_FUTURA', 'PERCENTUAL_VENDA_ATLETA',
]
const NEW_CLAUSE_PERIOD_STEP = { MENSAL: 1, SEMESTRAL: 6, ANUAL: 12 } as const
type NewClausePeriod = keyof typeof NEW_CLAUSE_PERIOD_STEP
const NEW_CLAUSE_PERIOD_LABEL: Record<NewClausePeriod, string> = { MENSAL: 'Mensal', SEMESTRAL: 'Semestral', ANUAL: 'Anual' }

function NewClauseModal({ contract, athleteId, onClose, onSaved }: {
  contract: Contract; athleteId: string; onClose: () => void; onSaved: () => void
}) {
  const partiesFor = (t: ClauseType) => PAYABLE_CLAUSE_TYPES.includes(t)
    ? { creditor: contract.counterpart_club || 'Contraparte', debtor: 'Botafogo SAF' }
    : { creditor: 'Botafogo SAF', debtor: contract.counterpart_club || 'Contraparte' }

  const initialType: ClauseType = 'SELL_ON_FEE_RECEBER'
  const initialParties = partiesFor(initialType)
  const [f, setF] = useState<{
    clause_type: ClauseType; description: string; creditor_party: string; debtor_party: string
    currency: Currency; original_value: string; percentage_value: string; condition_description: string
    due_date: string; installments_total: string; period: NewClausePeriod; notes: string; basis: SellOnBasis
  }>({
    clause_type: initialType,
    description: '',
    creditor_party: initialParties.creditor,
    debtor_party: initialParties.debtor,
    currency: contract.transfer_currency,
    original_value: '',
    percentage_value: '',
    condition_description: 'Sobre venda futura do atleta',
    due_date: '',
    installments_total: '1',
    period: 'ANUAL',
    notes: '',
    basis: 'MAIS_VALIA',
  })
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }))

  const isFuture = FUTURE_VALUE_CLAUSE_TYPES.includes(f.clause_type)
  const isSellOn = SELL_ON_CLAUSE_TYPES.includes(f.clause_type)
  const installments = Math.max(1, parseInt(f.installments_total) || 1)
  // Cronograma de parcelas só se aplica com valor definido, >1 parcela e tipo não-futuro.
  const showSchedule = !isFuture && !!f.original_value && installments > 1

  function changeType(t: ClauseType) {
    const parties = partiesFor(t)
    const futureNow = FUTURE_VALUE_CLAUSE_TYPES.includes(t)
    setF(p => ({
      ...p,
      clause_type: t,
      creditor_party: parties.creditor,
      debtor_party: parties.debtor,
      original_value: futureNow ? '' : p.original_value,
      condition_description: futureNow && !p.condition_description.trim() ? 'Sobre venda futura do atleta' : p.condition_description,
    }))
  }

  const canSave = f.description.trim().length > 0 && (!isFuture || !!f.percentage_value || !!f.original_value)

  async function save() {
    if (!canSave) return
    setSaving(true)
    try {
      const value = f.original_value ? parseFloat(f.original_value) : null
      const input: NewClauseInput = {
        clause_type: f.clause_type,
        description: f.description.trim(),
        creditor_party: f.creditor_party || 'Botafogo SAF',
        debtor_party: f.debtor_party || 'Contraparte',
        currency: f.currency,
        original_value: value,
        percentage_value: f.percentage_value ? parseFloat(f.percentage_value) : null,
        condition_description: isSellOn ? sellOnConditionText(f.basis) : (f.condition_description || ''),
        due_date: f.due_date || '',
        installments_total: showSchedule ? installments : 1,
        notes: f.notes || '',
      }
      const clause = await createClause(contract.id, athleteId, input)
      if (showSchedule && value && f.due_date) {
        const step = NEW_CLAUSE_PERIOD_STEP[f.period]
        const per = value / installments
        await createClauseInstallments(clause.id, athleteId, Array.from({ length: installments }, (_, i) => ({
          installment_number: i + 1,
          due_date: addMonths(f.due_date, i * step),
          original_value: per,
          currency: f.currency,
        })))
      }
      onSaved()
    } finally { setSaving(false) }
  }

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 6, fontSize: 13, background: 'var(--cream-canvas)', border: '1px solid var(--input-border)', color: 'var(--ink-primary)', fontFamily: font, boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontSize: 9, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 3, display: 'block' }
  const cur: Currency[] = ['BRL', 'EUR', 'USD', 'GBP']
  const clauseTypes = Object.keys(CLAUSE_TYPE_LABELS) as ClauseType[]

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,20,16,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--cream-card)', borderRadius: 12, padding: 26, width: 660, maxWidth: '96vw', maxHeight: '92vh', overflowY: 'auto', border: '1px solid var(--divider)', boxShadow: 'var(--shadow-panel)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-primary)', fontFamily: font }}>Nova cláusula</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: fontMono, marginTop: 3 }}>atrelada a {CONTRACT_TYPE_LABELS[contract.type]} · {contract.counterpart_club || '—'}</div>
        </div>

        <div><label style={lbl}>Tipo</label>
          <select style={inp} value={f.clause_type} onChange={e => changeType(e.target.value as ClauseType)}>
            {clauseTypes.map(t => <option key={t} value={t}>{CLAUSE_TYPE_LABELS[t]}</option>)}
          </select>
        </div>

        {isFuture && (
          <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--accent-tint2)', border: '1px solid var(--divider-strong)', fontFamily: font, fontSize: 12, color: 'var(--ink-secondary)' }}>
            Cláusula de <strong>valor futuro</strong>: informe apenas o <strong>percentual (%)</strong>. O valor será apurado quando a venda futura acontecer — deixe o valor em branco.
          </div>
        )}

        <div><label style={lbl}>Descrição *</label><input style={inp} value={f.description} onChange={e => set('description', e.target.value)} placeholder={isFuture ? 'Ex: Sell-on de 15% sobre venda futura ao exterior' : 'Descreva a cláusula...'} /></div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label style={lbl}>Credor</label><input style={inp} value={f.creditor_party} onChange={e => set('creditor_party', e.target.value)} /></div>
          <div><label style={lbl}>Devedor</label><input style={inp} value={f.debtor_party} onChange={e => set('debtor_party', e.target.value)} /></div>
          <div><label style={lbl}>Percentual (%){isFuture ? ' *' : ''}</label><NumberInput style={inp} decimals={2} grouping={false} value={f.percentage_value} onChange={v => set('percentage_value', v)} placeholder="Ex: 15" /></div>
          <div><label style={lbl}>Valor{isFuture ? ' (indefinido)' : ''}</label><NumberInput style={{ ...inp, opacity: isFuture ? 0.55 : 1 }} value={f.original_value} onChange={v => set('original_value', v)} placeholder={isFuture ? 'a definir na venda' : '0,00'} /></div>
          <div><label style={lbl}>Moeda</label><select style={inp} value={f.currency} onChange={e => set('currency', e.target.value)}>{cur.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          <div><label style={lbl}>{isFuture ? 'Vencimento (opcional)' : 'Vencimento / 1ª parcela'}</label><input style={inp} type="date" value={f.due_date} onChange={e => set('due_date', e.target.value)} /></div>
        </div>

        {isSellOn && (
          <div><label style={lbl}>Base de cálculo do Sell-on</label>
            <select style={inp} value={f.basis} onChange={e => set('basis', e.target.value)}>
              {(Object.keys(SELLON_BASIS_LABELS) as SellOnBasis[]).map(b => <option key={b} value={b}>{SELLON_BASIS_LABELS[b]}</option>)}
            </select>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: font, marginTop: 4 }}>
              O sell-on incide sobre {f.basis === 'MAIS_VALIA' ? 'a mais-valia (lucro na revenda)' : 'o valor total da venda'} futura.
            </div>
          </div>
        )}

        {!isFuture && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={lbl}>Nº parcelas</label><input style={inp} type="number" min={1} max={120} value={f.installments_total} onChange={e => set('installments_total', e.target.value)} /></div>
            {installments > 1 && (
              <div><label style={lbl}>Periodicidade</label>
                <select style={inp} value={f.period} onChange={e => set('period', e.target.value)}>
                  {(Object.keys(NEW_CLAUSE_PERIOD_LABEL) as NewClausePeriod[]).map(p => <option key={p} value={p}>{NEW_CLAUSE_PERIOD_LABEL[p]}</option>)}
                </select>
              </div>
            )}
          </div>
        )}

        {showSchedule && f.due_date && (
          <div style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--bg-subtle)', border: '1px solid var(--divider-soft)', fontFamily: fontMono, fontSize: 11, color: 'var(--text-secondary)' }}>
            {installments}× {f.currency} {(parseFloat(f.original_value) / installments).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} · {NEW_CLAUSE_PERIOD_LABEL[f.period].toLowerCase()} · 1º venc. {fmtDate(f.due_date)}
          </div>
        )}

        {!isSellOn && <div><label style={lbl}>Condição / gatilho</label><input style={inp} value={f.condition_description} onChange={e => set('condition_description', e.target.value)} placeholder="Ex: sobre o valor de uma venda futura" /></div>}
        <div><label style={lbl}>Notas</label><textarea style={{ ...inp, minHeight: 48, resize: 'vertical' }} value={f.notes} onChange={e => set('notes', e.target.value)} /></div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="btn btn-outline">Cancelar</button>
          <button onClick={save} disabled={saving || !canSave} style={{ padding: '8px 22px', borderRadius: 7, border: 'none', background: canSave ? 'var(--ink-primary)' : 'var(--divider-strong)', color: 'var(--accent-on)', fontSize: 12, fontFamily: font, fontWeight: 600, cursor: canSave ? 'pointer' : 'not-allowed', opacity: saving ? 0.6 : 1 }}>{saving ? 'Salvando...' : 'Adicionar cláusula'}</button>
        </div>
      </div>
    </div>
  )
}


// ── InstallmentActions — ações por parcela em ícones ─────────────────────────
function InstallmentActions({ inst, canEdit, onEdit, onPay, onQuickPay, onRevert, clauseId, onSchedule }: {
  inst: ClauseInstallment; canEdit: boolean
  onEdit: () => void; onPay: () => void; onQuickPay: () => void; onRevert: () => void
  /** Opcional: quando informado, mostra também o acesso ao cronograma da obrigação. */
  clauseId?: string
  onSchedule?: () => void
}) {
  if (!canEdit) return <StatusBadge status={inst.payment_status} map={PAYMENT_STATUS_STYLE} />
  const paid = inst.payment_status === 'PAGA'
  const cancelled = inst.payment_status === 'CANCELADA'
  return (
    <RowActions align="center"
      open={clauseId ? { to: `/obrigacoes/${clauseId}` } : undefined}
      edit={{ onClick: onEdit, label: 'Editar parcela' }}
      schedule={onSchedule ? { onClick: onSchedule } : undefined}
      markPaid={{ onClick: !paid && !cancelled ? onQuickPay : undefined, reason: paid ? 'parcela já paga' : 'parcela cancelada' }}
      pay={{ onClick: !paid && !cancelled ? onPay : undefined, reason: paid ? 'parcela já paga' : 'parcela cancelada' }}
      revert={{ onClick: paid ? onRevert : undefined, reason: 'a parcela não está paga' }}
    />
  )
}

// ── AcordosTab — acordos e renegociações do atleta ──────────────────────────
function AcordosTab({ clauses, installments, canEdit, highlight, onHighlighted, onNew, onEditAcordo, onFlowAcordo, onEditInst, onPayInst, onQuickPayInst, onRevertInst }: {
  clauses: Clause[]; installments: ClauseInstallment[]; canEdit: boolean
  highlight?: string | null; onHighlighted?: () => void
  onNew: () => void
  onEditAcordo: (clauseId: string) => void
  onFlowAcordo: (clauseId: string) => void
  onEditInst: (id: string) => void; onPayInst: (id: string) => void; onQuickPayInst: (id: string) => void; onRevertInst: (id: string) => void
}) {
  const acordos = clauses.filter(isAcordo).sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
  // Ao chegar de "→ acordo" (parcela renegociada), rola até o acordo e o destaca.
  useEffect(() => {
    if (!highlight) return
    const el = document.getElementById(`acordo-${highlight}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const t = setTimeout(() => onHighlighted?.(), 2000)
    return () => clearTimeout(t)
  }, [highlight, onHighlighted])
  const th: React.CSSProperties = { padding: '7px 10px', fontSize: 9, fontWeight: 500, textTransform: 'uppercase', color: 'var(--ink-secondary)', borderBottom: '1px solid var(--divider-soft)', fontFamily: fontMono, letterSpacing: '0.12em', textAlign: 'left' }
  const td: React.CSSProperties = { padding: '7px 10px', fontSize: 12, color: 'var(--ink-primary)', fontFamily: font, borderBottom: '1px solid var(--divider-soft)' }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-primary)', fontFamily: font }}>Acordos e Renegociações</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: font, marginTop: 3, maxWidth: 620 }}>
            Selecione parcelas/cláusulas em aberto e reabra o saldo em um novo fluxo (com desconto, se houver). As parcelas originais são preservadas como canceladas, mantendo o rastreio.
          </div>
        </div>
        {canEdit && <button onClick={onNew} className="btn btn-primary" style={{ whiteSpace: 'nowrap' }}><Icon name="plus" size={14} /> Nova renegociação</button>}
      </div>

      {acordos.length === 0 && (
        <div className="card" style={{ padding: 32, textAlign: 'center', fontFamily: 'var(--font-body)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 14, color: 'var(--ink-secondary)', maxWidth: 460, lineHeight: 1.5 }}>
            Nenhuma renegociação registrada para este atleta. Uma renegociação reabre parcelas ou obrigações vencidas em um novo fluxo, mantendo o rastreio das originais.
          </div>
          {canEdit && (
            <button className="btn btn-primary" onClick={onNew}>
              <Icon name="plus" size={13} /> Registrar renegociação
            </button>
          )}
        </div>
      )}

      {acordos.map(ac => {
        const meta = decodeAcordo(ac.notes)
        const parc = installments.filter(i => i.clause_id === ac.id).sort((a, b) => a.installment_number - b.installment_number)
        const paidCount = parc.filter(p => p.payment_status === 'PAGA').length
        const isHi = highlight === ac.id
        return (
          <div key={ac.id} id={`acordo-${ac.id}`} className="card" style={{ padding: '18px 20px', border: isHi ? '1px solid var(--gold-ring)' : undefined, boxShadow: isHi ? '0 0 0 3px var(--divider-strong)' : undefined, transition: 'box-shadow 0.4s, border-color 0.4s' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-primary)', fontFamily: font }}>{meta?.creditor ?? ac.creditor_party}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: fontMono }}>{meta ? `acordado em ${fmtDate(meta.createdAt)}` : ''}</span>
                <RowActions small={false}
                  open={{ to: `/obrigacoes/${ac.id}` }}
                  edit={{ onClick: canEdit ? () => onEditAcordo(ac.id) : undefined, label: 'Editar / desfazer a renegociação', reason: 'sem permissão de edição' }}
                  schedule={{ onClick: canEdit ? () => onFlowAcordo(ac.id) : undefined, label: 'Ver / editar as parcelas do acordo', reason: 'sem permissão de edição' }}
                />
              </div>
            </div>

            {meta && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 14 }}>
                {[
                  ['Dívida original', fmtCurrencyShort(meta.originalTotal, meta.currency)],
                  ['Novo total', fmtCurrencyShort(meta.newTotal, meta.currency)],
                  ['Desconto', meta.discount ? fmtCurrencyShort(meta.discount, meta.currency) : '—'],
                  ['Novo fluxo', `${meta.installmentsCount}x${meta.periodicityMonths === 0 ? ' (personalizado)' : meta.periodicityMonths > 1 ? ` / ${meta.periodicityMonths}m` : ' mensal'}`],
                  ['Pagas', `${paidCount}/${parc.length}`],
                ].map(([l, v], i) => (
                  <div key={i} style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--bg-subtle)', border: '1px solid var(--divider-soft)' }}>
                    <div style={{ fontSize: 9, fontFamily: fontMono, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>{l}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, fontFamily: fontMono, color: l === 'Desconto' && meta.discount > 0 ? 'var(--pos)' : 'var(--ink-primary)' }}>{v}</div>
                  </div>
                ))}
              </div>
            )}
            {meta?.userNote && <div style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-subtle)', borderLeft: '2px solid var(--gold-ring)', borderRadius: 4, padding: '7px 12px', fontFamily: font, marginBottom: 14 }}>{meta.userNote}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* Novo fluxo */}
              <div>
                <div style={{ fontSize: 9, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold-deep)', marginBottom: 8 }}>Novo fluxo</div>
                <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr><th style={th}>#</th><th style={th}>Vencimento</th><th style={{ ...th, textAlign: 'right' }}>Valor</th><th style={{ ...th, textAlign: 'center' }}>Ação</th></tr></thead>
                    <tbody>
                      {parc.map(p => {
                        const late = isOverdue(p.due_date, p.payment_status)
                        return (
                          <tr key={p.id}>
                            <td style={{ ...td, fontFamily: fontMono, fontSize: 10, color: 'var(--text-muted)' }}>{p.installment_number}</td>
                            <td style={{ ...td, fontFamily: fontMono, fontSize: 11, color: late ? 'var(--neg)' : 'var(--ink-secondary)', fontWeight: late ? 700 : 400 }}>{fmtDate(p.due_date)}</td>
                            <td style={{ ...td, textAlign: 'right', fontFamily: fontMono, fontWeight: 600 }}>{fmtCurrencyShort(p.original_value, p.currency)}</td>
                            <td style={{ ...td, textAlign: 'center' }}><InstallmentActions inst={p} canEdit={canEdit} onEdit={() => onEditInst(p.id)} onPay={() => onPayInst(p.id)} onQuickPay={() => onQuickPayInst(p.id)} onRevert={() => onRevertInst(p.id)} /></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              {/* Itens de origem (rastreio) */}
              <div>
                <div style={{ fontSize: 9, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>Itens de origem (renegociados)</div>
                <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {(meta?.sources ?? []).map((s, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 10px', borderRadius: 6, background: 'var(--bg-subtle)', border: '1px solid var(--divider-soft)' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: font, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
                      <span style={{ fontSize: 11, fontFamily: fontMono, fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtCurrencyShort(s.value, meta?.currency ?? 'BRL')}</span>
                    </div>
                  ))}
                  {(!meta || meta.sources.length === 0) && <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: font }}>—</div>}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── RenegotiationModal — seleção de itens e abertura de novo fluxo ───────────
interface RenegItem {
  key: string; source: AcordoSource; parte: string
  creditor: string; debtor: string; currency: Currency
  natureza: string; dueDate: string | null
}

function RenegotiationModal({ athleteId, clauses, installments, clubLiabs, intermLiabs, onClose, onSave }: {
  athleteId: string; clauses: Clause[]; installments: ClauseInstallment[]
  clubLiabs: ClubLiability[]; intermLiabs: IntermediaryLiability[]
  onClose: () => void; onSave: (input: RenegotiationInput) => Promise<void>
}) {
  const OPEN = ['PENDENTE', 'PARCIALMENTE_PAGA', 'EM_ATRASO']
  const clauseById = new Map(clauses.map(c => [c.id, c]))
  const items: RenegItem[] = []
  // Parcelas em aberto (exceto salário/imagem, que são folha mensal, não dívida).
  for (const it of installments) {
    if (!OPEN.includes(it.payment_status)) continue
    const c = clauseById.get(it.clause_id)
    if (!c || c.clause_type === 'SALARIO_CETD' || c.clause_type === 'DIREITO_IMAGEM') continue
    const nat = CLAUSE_TYPE_LABELS[c.clause_type] ?? c.clause_type
    // "parte" = contraparte (o lado que não é o Botafogo) — usada para agrupar.
    const parte = isBFRparty(c.debtor_party) ? c.creditor_party : c.debtor_party
    items.push({
      key: `i:${it.id}`, source: { installmentId: it.id, label: `${nat} — parcela ${it.installment_number}`, value: it.original_value, dueDate: it.due_date },
      parte, creditor: c.creditor_party, debtor: c.debtor_party, currency: it.currency, natureza: nat, dueDate: it.due_date,
    })
  }
  // Cláusulas de valor único em aberto (sem parcelas).
  const clauseHasInst = new Set(installments.map(i => i.clause_id))
  for (const c of clauses) {
    if (c.clause_type === 'SALARIO_CETD' || c.clause_type === 'DIREITO_IMAGEM' || isAcordo(c)) continue
    if (clauseHasInst.has(c.id)) continue
    if (!OPEN.includes(c.payment_status) || c.original_value == null) continue
    const nat = CLAUSE_TYPE_LABELS[c.clause_type] ?? c.clause_type
    const parte = isBFRparty(c.debtor_party) ? c.creditor_party : c.debtor_party
    items.push({
      key: `c:${c.id}`, source: { clauseId: c.id, label: nat, value: c.original_value, dueDate: c.due_date },
      parte, creditor: c.creditor_party, debtor: c.debtor_party, currency: c.currency, natureza: nat, dueDate: c.due_date,
    })
  }
  // Passivos de clube/agente em aberto.
  for (const l of clubLiabs) {
    if (!OPEN.includes(l.status)) continue
    const isPay = l.direction === 'A_PAGAR'
    items.push({
      key: `cl:${l.id}`, source: { clubLiabId: l.id, label: `Obrigação clube — ${l.club_name}`, value: l.amount, dueDate: l.due_date },
      parte: l.club_name, creditor: isPay ? l.club_name : 'Botafogo SAF', debtor: isPay ? 'Botafogo SAF' : l.club_name, currency: l.currency, natureza: 'Obrigação clube', dueDate: l.due_date,
    })
  }
  for (const l of intermLiabs) {
    if (!OPEN.includes(l.status)) continue
    const isPay = l.direction === 'A_PAGAR'
    items.push({
      key: `il:${l.id}`, source: { intermLiabId: l.id, label: `Intermediação — ${l.intermediary_name}`, value: l.amount, dueDate: l.due_date },
      parte: l.intermediary_name, creditor: isPay ? l.intermediary_name : 'Botafogo SAF', debtor: isPay ? 'Botafogo SAF' : l.intermediary_name, currency: l.currency, natureza: 'Intermediação', dueDate: l.due_date,
    })
  }

  // Agrupa por parte.
  const groups = new Map<string, RenegItem[]>()
  for (const it of items) { if (!groups.has(it.parte)) groups.set(it.parte, []); groups.get(it.parte)!.push(it) }
  for (const arr of groups.values()) arr.sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<'igual' | 'custom'>('igual')
  const [newTotal, setNewTotal] = useState('')
  const [startDate, setStartDate] = useState(todayISO())
  const [count, setCount] = useState('10')
  const [period, setPeriod] = useState('1')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [touchedTotal, setTouchedTotal] = useState(false)
  // Fluxo personalizado (irregular): linhas editáveis {due_date, value}.
  const [schedule, setSchedule] = useState<{ due_date: string; value: string }[]>([])

  const selItems = items.filter(i => selected.has(i.key))
  const sum = Math.round(selItems.reduce((s, i) => s + i.source.value, 0) * 100) / 100
  const currencies = Array.from(new Set(selItems.map(i => i.currency)))
  const parties = Array.from(new Set(selItems.map(i => i.parte)))
  const mixedCurrency = currencies.length > 1
  const mixedParty = parties.length > 1
  const currency = (currencies[0] ?? 'BRL') as Currency

  function toggle(key: string) {
    setSelected(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n })
  }
  function toggleGroup(parte: string, on: boolean) {
    const keys = (groups.get(parte) ?? []).map(i => i.key)
    setSelected(prev => { const n = new Set(prev); for (const k of keys) { if (on) n.add(k); else n.delete(k) } return n })
  }

  const scheduleSum = Math.round(schedule.reduce((s, r) => s + (parseFloat(r.value) || 0), 0) * 100) / 100
  const effectiveTotal = mode === 'custom'
    ? scheduleSum
    : (touchedTotal && newTotal !== '' ? parseFloat(newTotal) : sum)
  const discount = Math.round((sum - effectiveTotal) * 100) / 100
  const customValid = mode !== 'custom' || (schedule.length >= 1 && schedule.every(r => r.due_date && parseFloat(r.value) > 0))
  const nParcelas = mode === 'custom' ? schedule.length : (Math.floor(Number(count)) || 1)
  const canSave = selItems.length > 0 && !mixedCurrency && !mixedParty && nParcelas >= 1 && !!startDate && customValid

  // Gera as linhas do fluxo personalizado a partir de nº parcelas + data-base +
  // periodicidade (valores divididos igualmente). O usuário edita cada linha.
  function generateSchedule() {
    const n = Math.max(1, Math.floor(Number(count)) || 1)
    const p = Math.max(1, Math.floor(Number(period)) || 1)
    const total = touchedTotal && newTotal !== '' ? parseFloat(newTotal) : sum
    const base = Math.floor((total / n) * 100) / 100
    setSchedule(Array.from({ length: n }, (_, i) => ({
      due_date: addMonths(startDate, i * p),
      value: String(i === n - 1 ? Math.round((total - base * (n - 1)) * 100) / 100 : base),
    })))
  }
  const setSchedRow = (i: number, patch: Partial<{ due_date: string; value: string }>) =>
    setSchedule(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  const addSchedRow = () => setSchedule(prev => [...prev, { due_date: prev.length ? addMonths(prev[prev.length - 1].due_date, 1) : startDate, value: '' }])
  const removeSchedRow = (i: number) => setSchedule(prev => prev.filter((_, idx) => idx !== i))

  async function submit() {
    if (!canSave) return
    setSaving(true)
    try {
      const ref = selItems[0]
      await onSave({
        athleteId,
        creditor: ref.creditor,
        debtor: ref.debtor,
        currency,
        sources: selItems.map(i => i.source),
        newTotal: effectiveTotal,
        startDate,
        installmentsCount: Math.floor(Number(count)) || 1,
        periodicityMonths: Math.floor(Number(period)) || 1,
        userNote: note,
        schedule: mode === 'custom' ? schedule.map(r => ({ due_date: r.due_date, value: parseFloat(r.value) || 0 })) : undefined,
      })
    } finally { setSaving(false) }
  }

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 6, fontSize: 13, background: 'var(--cream-canvas)', border: '1px solid var(--input-border)', color: 'var(--ink-primary)', fontFamily: font, boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontSize: 9, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 3, display: 'block' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,20,16,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--cream-card)', borderRadius: 12, padding: 26, width: 760, maxWidth: '96vw', maxHeight: '92vh', overflowY: 'auto', border: '1px solid var(--divider)', boxShadow: 'var(--shadow-panel)', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-primary)', fontFamily: font }}>Nova renegociação</div>

        {/* Seleção de itens */}
        <div>
          <div style={{ fontSize: 9, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold-deep)', marginBottom: 8 }}>1 · Selecione os itens em aberto</div>
          {items.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: font }}>Nenhum item em aberto para renegociar.</div>
          ) : (
            <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Array.from(groups.entries()).map(([parte, arr]) => {
                const allOn = arr.every(i => selected.has(i.key))
                return (
                  <div key={parte} style={{ border: '1px solid var(--divider-soft)', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--bg-subtle)' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: font, color: 'var(--ink-primary)' }}>
                        <input type="checkbox" checked={allOn} onChange={e => toggleGroup(parte, e.target.checked)} />
                        {parte}
                      </label>
                      <span style={{ fontSize: 10, fontFamily: fontMono, color: 'var(--text-muted)' }}>{arr.length} item(ns)</span>
                    </div>
                    {arr.map(it => (
                      <label key={it.key} style={{ display: 'grid', gridTemplateColumns: '24px 1fr 110px 90px', gap: 8, alignItems: 'center', padding: '6px 10px', borderTop: '1px solid var(--divider-soft)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={selected.has(it.key)} onChange={() => toggle(it.key)} />
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: font, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.source.label}</span>
                        <span style={{ fontSize: 11, fontFamily: fontMono, color: 'var(--text-muted)' }}>{it.dueDate ? fmtDate(it.dueDate) : '—'}</span>
                        <span style={{ fontSize: 11, fontFamily: fontMono, fontWeight: 600, textAlign: 'right' }}>{fmtCurrencyShort(it.source.value, it.currency)}</span>
                      </label>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
          {mixedCurrency && <div style={{ fontSize: 11, color: 'var(--neg)', fontFamily: font, marginTop: 6 }}>⚠ Selecione itens de uma única moeda.</div>}
          {mixedParty && <div style={{ fontSize: 11, color: 'var(--neg)', fontFamily: font, marginTop: 6 }}>⚠ Selecione itens de uma única contraparte.</div>}
        </div>

        {/* Parâmetros do novo fluxo */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 9, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold-deep)' }}>2 · Defina o novo fluxo</div>
            <div style={{ display: 'flex', border: '1px solid var(--divider-strong)', borderRadius: 7, overflow: 'hidden' }}>
              {(['igual', 'custom'] as const).map(m => (
                <button key={m} onClick={() => setMode(m)} style={{ padding: '5px 12px', border: 'none', background: mode === m ? 'var(--ink-primary)' : 'transparent', color: mode === m ? 'var(--gold-soft)' : 'var(--text-secondary)', fontSize: 11, fontFamily: font, fontWeight: 600, cursor: 'pointer' }}>{m === 'igual' ? 'Parcelas iguais' : 'Fluxo personalizado'}</button>
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            <div><label style={lbl}>Dívida selecionada</label><input style={{ ...inp, fontFamily: fontMono }} value={`${currency} ${sum.toLocaleString('pt-BR')}`} disabled /></div>
            <div><label style={lbl}>Novo total ({currency})</label><NumberInput style={{ ...inp, fontFamily: fontMono }} value={mode === 'custom' ? (scheduleSum || '') : (touchedTotal ? newTotal : (sum || ''))} onChange={v => { setTouchedTotal(true); setNewTotal(v) }} disabled={mode === 'custom'} placeholder="Igual à dívida" /></div>
            <div><label style={lbl}>Desconto</label><input style={{ ...inp, fontFamily: fontMono, color: discount > 0 ? 'var(--pos)' : discount < 0 ? 'var(--neg)' : undefined }} value={`${currency} ${discount.toLocaleString('pt-BR')}`} disabled /></div>
            <div><label style={lbl}>{mode === 'custom' ? 'Data 1ª parcela' : 'Data-base'}</label><input style={inp} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
            <div><label style={lbl}>Nº de parcelas</label><input style={inp} type="number" min={1} step={1} value={count} onChange={e => setCount(e.target.value)} /></div>
            <div><label style={lbl}>Periodicidade (meses)</label><input style={inp} type="number" min={1} step={1} value={period} onChange={e => setPeriod(e.target.value)} disabled={mode === 'custom'} /></div>
          </div>

          {mode === 'custom' && (
            <div style={{ marginTop: 12, border: '1px solid var(--divider-soft)', borderRadius: 8, padding: 12, background: 'var(--bg-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: font }}>Gere as parcelas pelo nº/data acima e edite cada vencimento e valor.</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={generateSchedule} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--divider-strong)', background: 'var(--accent-tint)', color: 'var(--accent)', fontSize: 11, fontFamily: font, fontWeight: 600, cursor: 'pointer' }}>Gerar fluxo</button>
                  <button onClick={addSchedRow} className="btn btn-outline">+ Linha</button>
                </div>
              </div>
              {schedule.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: font }}>Nenhuma parcela — clique em “Gerar fluxo”.</div>
              ) : (
                <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {schedule.map((r, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 1fr 30px', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontFamily: fontMono, color: 'var(--text-muted)', textAlign: 'right' }}>{i + 1}</span>
                      <input style={{ ...inp, padding: '6px 8px', fontSize: 12 }} type="date" value={r.due_date} onChange={e => setSchedRow(i, { due_date: e.target.value })} />
                      <NumberInput style={{ ...inp, padding: '6px 8px', fontSize: 12, fontFamily: fontMono }} value={r.value} onChange={v => setSchedRow(i, { value: v })} placeholder="Valor" />
                      <button onClick={() => removeSchedRow(i)} title="Remover" style={{ padding: '5px', borderRadius: 6, border: '1px solid var(--divider-strong)', background: 'transparent', color: 'var(--neg)', fontSize: 12, cursor: 'pointer', lineHeight: 1 }}>✕</button>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: 11, fontFamily: fontMono, color: 'var(--text-secondary)', paddingTop: 4 }}>Soma: {fmtCurrencyShort(scheduleSum, currency)}</div>
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: 12 }}><label style={lbl}>Observações do acordo</label><textarea style={{ ...inp, minHeight: 48, resize: 'vertical' }} value={note} onChange={e => setNote(e.target.value)} placeholder="Termos, motivo do desconto, referência do aditivo..." /></div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: fontMono, marginRight: 'auto' }}>{selItems.length} item(ns) → {mode === 'custom' ? `${schedule.length}x personalizado` : `${nParcelas}x de ${fmtCurrencyShort(effectiveTotal / nParcelas, currency)}`}</span>
          <button onClick={onClose} className="btn btn-outline">Cancelar</button>
          <button onClick={submit} disabled={!canSave || saving} style={{ padding: '8px 22px', borderRadius: 7, border: 'none', background: canSave ? 'var(--ink-primary)' : '#ccc', color: 'var(--accent-on)', fontSize: 12, fontFamily: font, fontWeight: 600, cursor: canSave ? 'pointer' : 'not-allowed' }}>{saving ? 'Renegociando...' : 'Renegociar'}</button>
        </div>
      </div>
    </div>
  )
}

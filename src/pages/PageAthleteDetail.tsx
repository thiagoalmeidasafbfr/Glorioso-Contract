import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import ImageUpload from '../components/ImageUpload'
import RemunerationChart from '../components/RemunerationChart'
import OwnershipBar from '../components/OwnershipBar'
import PaymentModal from '../components/athletes/PaymentModal'
import {
  fetchAthlete, updateAthlete, deleteAthlete, updateContract, updateContractFlowsCurrency, deleteContract, fetchAthleteContracts, fetchAthleteClauses,
  fetchAthleteInstallments, createClause, createClauseInstallments, deleteClause, deleteClauseInstallments, fetchClauseInstallments,
  regenerateSalaryImageFlow,
  updateInstallment, markInstallmentPaid, revertInstallment,
  deleteClubLiability, deleteIntermediaryLiability, updateClubLiability, updateIntermediaryLiability,
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
import PageHero from '../components/PageHero'
import { fmtDate, fmtCurrencyShort, fmtRelative, isOverdue, isDueSoon, todayISO, CURRENCY_SYMBOLS, addMonths } from '../lib/format'
import type {
  Athlete, Contract, Clause, ClauseType, ClauseInstallment, Alert, EconomicRight,
  SalaryTrigger, ClubLiability, IntermediaryLiability, ImageRight, AthletePJ,
  AthleteStatus, AthleteCategory, Currency, HolderType,
  TriggerMetric, NewSalaryTriggerInput, NewEconomicRightInput, NewAthletePJInput,
  NewClauseInput, SellOnBasis,
} from '../types/athlete-system'
import {
  CLAUSE_TYPE_LABELS, CONTRACT_TYPE_LABELS, HOLDER_TYPE_LABELS, HOLDER_TYPE_COLORS,
  ATHLETE_CATEGORY_LABELS, TRANSFER_CONTRACT_TYPES, ACCESSORY_CONTRACT_TYPES, isTransferContractType,
  SELL_ON_CLAUSE_TYPES, SELLON_BASIS_LABELS, sellOnConditionText,
  TRIGGER_METRIC_LABELS, TRIGGER_STATUS_LABELS,
} from '../types/athlete-system'
import { createRenegotiation, decodeAcordo, isAcordo, renegotiatedAcordoId, type AcordoSource, type RenegotiationInput } from '../lib/renegotiation'
import { sumOwnership, isOwnershipValid, sortRights } from '../lib/ownership'
import { effectiveSalary, effectiveImage } from '../lib/salary'
import { useAuth } from '../context/AuthContext'
import { exportWorkbook } from '../lib/xlsx-utils'
import { COLS_ATLETA_CONSOLIDADO, buildConsolidatedRows } from '../lib/athleteConsolidado'

const font     = "'Inter', system-ui, sans-serif"
const fontMono = "'IBM Plex Mono', 'JetBrains Mono', monospace"
const isBFRparty = (s: string) => s.toLowerCase().includes('botafogo') || s.toLowerCase() === 'bfr'

const ATHLETE_STATUS_STYLE: Record<AthleteStatus, { bg: string; fg: string; label: string }> = {
  ATIVO:      { bg: '#e6ece2', fg: '#3a6f3a', label: 'Ativo' },
  EMPRESTADO: { bg: 'rgba(190,140,74,0.18)', fg: '#7a6244', label: 'Emprestado' },
  VENDIDO:    { bg: 'rgba(91,107,122,0.12)', fg: '#5b6b7a', label: 'Vendido' },
  DESLIGADO:  { bg: 'rgba(156,163,175,0.18)', fg: '#6b7280', label: 'Desligado' },
}
const PAYMENT_STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  PENDENTE:          { bg: 'rgba(91,107,122,0.12)', fg: '#5b6b7a' },
  PAGA:              { bg: '#e6ece2', fg: '#3a6f3a' },
  PARCIALMENTE_PAGA: { bg: 'rgba(190,140,74,0.15)', fg: '#7a6244' },
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

// % financeiro já pago (barra + rótulo) — usado na coluna Atingimento.
function PctBadge({ pct }: { pct: number }) {
  const done = pct >= 100
  const col = done ? '#3a6f3a' : pct > 0 ? '#be8c4a' : 'var(--text-muted)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 64 }}>
      <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'rgba(26,20,16,0.10)', overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: col, borderRadius: 3 }} />
      </div>
      <span style={{ fontFamily: fontMono, fontSize: 10, fontWeight: 600, color: col }}>{pct}%</span>
    </div>
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

// ── Menu de ações da cláusula (posição fixa p/ não ser cortado) ─────────────
function ClauseActions({ clause, onOpen, onEdit, onFlow, onMarkAchieved, onPay, onCancel }: {
  clause: Clause; onOpen: () => void; onEdit: () => void; onFlow: () => void; onMarkAchieved: () => void; onPay: () => void; onCancel: () => void
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  function toggle() {
    const el = btnRef.current
    if (el && !open) { const r = el.getBoundingClientRect(); setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) }) }
    setOpen(o => !o)
  }
  const item: React.CSSProperties = { width: '100%', padding: '9px 16px', textAlign: 'left', background: 'none', border: 'none', fontSize: 12.5, fontFamily: font, cursor: 'pointer', whiteSpace: 'nowrap' }
  const canPay = clause.payment_status !== 'PAGA' && clause.payment_status !== 'CANCELADA' && !!clause.original_value
  const canAchieve = clause.achievement_status === 'PENDENTE'
  const canCancel = clause.payment_status !== 'CANCELADA'
  return (
    <>
      <button ref={btnRef} onClick={toggle} aria-label="Ações"
        style={{ width: 28, height: 26, borderRadius: 6, border: '1px solid var(--divider-strong)', background: open ? 'var(--cream-inset)' : 'transparent', fontSize: 15, lineHeight: 1, fontFamily: font, cursor: 'pointer', color: 'var(--text-secondary)' }}>⋯</button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'fixed', top: pos.top, right: pos.right, background: 'var(--cream-card)', border: '1px solid var(--divider-strong)', borderRadius: 8, padding: '4px 0', boxShadow: 'var(--shadow-panel)', zIndex: 1000, minWidth: 210 }}>
            <button onClick={() => { onOpen(); setOpen(false) }} style={{ ...item, color: '#be8c4a', fontWeight: 600 }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--cream-inset)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>Abrir página da obrigação</button>
            <button onClick={() => { onEdit(); setOpen(false) }} style={{ ...item, color: 'var(--ink-primary)' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--cream-inset)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>Editar cláusula</button>
            <button onClick={() => { onFlow(); setOpen(false) }} style={{ ...item, color: 'var(--ink-primary)' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--cream-inset)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>Gerar / editar fluxo de pagamento</button>
            {canAchieve && <button onClick={() => { onMarkAchieved(); setOpen(false) }} style={{ ...item, color: 'var(--ink-primary)' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--cream-inset)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>Marcar como atingida</button>}
            {canPay && <button onClick={() => { onPay(); setOpen(false) }} style={{ ...item, color: 'var(--ink-primary)' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--cream-inset)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>Registrar pagamento</button>}
            {canCancel && <button onClick={() => { onCancel(); setOpen(false) }} style={{ ...item, color: 'var(--neg)' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--neg-tint)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>Cancelar cláusula</button>}
          </div>
        </>
      )}
    </>
  )
}

function NewTriggerForm({ contract, onAdd }: { contract: Contract; onAdd: (input: NewSalaryTriggerInput) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState<NewSalaryTriggerInput>({ contract_id: contract.id, description: '', metric: 'JOGOS', threshold: null, new_salary: 0, new_image: null, currency: contract.salary_currency, notes: '' })
  const set = <K extends keyof NewSalaryTriggerInput>(k: K, v: NewSalaryTriggerInput[K]) => setF(prev => ({ ...prev, [k]: v }))
  const inp: React.CSSProperties = { padding: '7px 9px', borderRadius: 6, fontSize: 12, width: '100%', boxSizing: 'border-box', background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--input-color)', fontFamily: font }
  const lbl: React.CSSProperties = { fontSize: 9, fontFamily: fontMono, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 3, display: 'block' }
  if (!open) return <button onClick={() => setOpen(true)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px dashed rgba(190,140,74,0.45)', background: 'rgba(190,140,74,0.08)', color: '#be8c4a', fontSize: 12, fontFamily: font, fontWeight: 600, cursor: 'pointer' }}>+ Nova Meta de Salário</button>
  async function submit() {
    if (!f.description.trim() || !f.new_salary) return
    await onAdd({ ...f, contract_id: contract.id })
    setF({ contract_id: contract.id, description: '', metric: 'JOGOS', threshold: null, new_salary: 0, new_image: null, currency: contract.salary_currency, notes: '' })
    setOpen(false)
  }
  return (
    <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, border: '1px solid rgba(190,140,74,0.30)' }}>
      <div style={{ fontSize: 10, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#be8c4a', fontWeight: 600 }}>Nova Meta de Aumento Salarial</div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
        <div><label style={lbl}>Descrição *</label><input style={inp} value={f.description} onChange={e => set('description', e.target.value)} placeholder="Ex: Ao atingir 10 jogos, salário sobe" /></div>
        <div><label style={lbl}>Métrica</label><select style={inp} value={f.metric} onChange={e => set('metric', e.target.value as TriggerMetric)}>{(Object.keys(TRIGGER_METRIC_LABELS) as TriggerMetric[]).map(m => <option key={m} value={m}>{TRIGGER_METRIC_LABELS[m]}</option>)}</select></div>
        <div><label style={lbl}>Meta (nº)</label><input style={inp} type="number" value={f.threshold ?? ''} onChange={e => set('threshold', e.target.value ? Number(e.target.value) : null)} placeholder="Ex: 10" /></div>
        <div><label style={lbl}>Novo salário CLT *</label><NumberInput style={inp} value={f.new_salary || ''} onChange={v => set('new_salary', v ? Number(v) : 0)} placeholder="Ex: 600.000" /></div>
        <div><label style={lbl}>Novo direito de imagem</label><NumberInput style={inp} value={f.new_image ?? ''} onChange={v => set('new_image', v ? Number(v) : null)} placeholder="opcional" /></div>
        <div><label style={lbl}>Moeda</label><select style={inp} value={f.currency} onChange={e => set('currency', e.target.value as Currency)}>{(['BRL','EUR','USD','GBP'] as Currency[]).map(c => <option key={c} value={c}>{c}</option>)}</select></div>
        <div><label style={lbl}>Observações</label><input style={inp} value={f.notes} onChange={e => set('notes', e.target.value)} /></div>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={() => setOpen(false)} style={{ padding: '7px 16px', borderRadius: 7, border: '1px solid var(--divider-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontFamily: font, cursor: 'pointer' }}>Cancelar</button>
        <button onClick={submit} disabled={!f.description.trim() || !f.new_salary} style={{ padding: '7px 18px', borderRadius: 7, border: 'none', background: (f.description.trim() && f.new_salary) ? '#be8c4a' : '#ccc', color: '#fff', fontSize: 12, fontFamily: font, fontWeight: 600, cursor: (f.description.trim() && f.new_salary) ? 'pointer' : 'not-allowed' }}>Adicionar Meta</button>
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
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: fontMono, marginTop: 2 }}>{TRIGGER_METRIC_LABELS[t.metric]}{t.threshold != null ? ` ≥ ${t.threshold}` : ''} → {fmtCurrencyShort(t.new_salary, t.currency)}{t.notes ? ` · ${t.notes}` : ''}</div>
      </div>
      <span style={{ padding: '2px 8px', borderRadius: 5, fontSize: 9, fontWeight: 600, fontFamily: fontMono, letterSpacing: '0.10em', textTransform: 'uppercase', background: TRIGGER_STATUS_STYLE[t.status].bg, color: TRIGGER_STATUS_STYLE[t.status].fg }}>{TRIGGER_STATUS_LABELS[t.status]}</span>
      {achieved ? (
        <>
          <span style={{ fontSize: 11, fontFamily: fontMono, color: '#3a6f3a' }}>desde {fmtDate(t.achieved_date)}</span>
          {canEdit && <button onClick={onReset} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--divider-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 11, fontFamily: font, cursor: 'pointer' }}>Reverter</button>}
        </>
      ) : canEdit ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ padding: '5px 8px', borderRadius: 6, fontSize: 12, background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--input-color)', fontFamily: fontMono }} />
          <button onClick={() => onMark(date)} style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: '#3a6f3a', color: '#fff', fontSize: 11, fontFamily: font, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>✓ Meta atingida</button>
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
          <button onClick={addRow} style={{ marginTop: 10, padding: '6px 14px', borderRadius: 6, border: '1px dashed rgba(190,140,74,0.45)', background: 'rgba(190,140,74,0.08)', color: '#be8c4a', fontSize: 12, fontFamily: font, fontWeight: 600, cursor: 'pointer' }}>+ Detentor</button>
        </div>

        {/* PJ do atleta — parte do cadastro */}
        <div style={{ borderTop: '1px solid var(--divider)', paddingTop: 14 }}>
          <PjSection pjs={pjs} canEdit={canEdit} onAdd={onAddPJ} onUpdate={onUpdatePJ} onDelete={onDeletePJ} imageCountByPj={imageCountByPj} />
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid var(--divider-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontFamily: font, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={save} disabled={saving || !f.full_name.trim()} style={{ padding: '8px 22px', borderRadius: 7, border: 'none', background: 'var(--ink-primary)', color: 'var(--gold-soft)', fontSize: 12, fontFamily: font, fontWeight: 600, cursor: 'pointer' }}>{saving ? 'Salvando...' : 'Salvar'}</button>
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

// ── ClauseTable — tabela de cláusulas (reutilizada em Luvas/Agentes/Gatilhos) ──
function ClauseTable({ clauses, installments, canEdit, emptyLabel, onOpen, onEdit, onFlow, onMarkAchieved, onPay, onCancel, onEditInst, onPayInst, onQuickPayInst, onRevertInst, goToAcordo }: {
  clauses: Clause[]; installments: ClauseInstallment[]; canEdit: boolean; emptyLabel: string
  onOpen: (id: string) => void; onEdit: (id: string) => void; onFlow: (id: string) => void
  onMarkAchieved: (id: string) => void; onPay: (id: string) => void; onCancel: (id: string) => void
  onEditInst: (id: string) => void; onPayInst: (id: string) => void; onQuickPayInst: (id: string) => void; onRevertInst: (id: string) => void
  goToAcordo: (id: string) => void
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (id: string) => setExpanded(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const th: React.CSSProperties = { padding: '8px 12px', fontSize: 9, fontWeight: 500, textTransform: 'uppercase', background: 'var(--tbl-head)', color: 'var(--ink-secondary)', borderBottom: '1px solid var(--divider-strong)', fontFamily: fontMono, letterSpacing: '0.14em', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '10px 12px', fontSize: 12, color: 'var(--ink-primary)', fontFamily: font, borderBottom: '1px solid var(--divider-soft)', verticalAlign: 'middle' }
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
          <thead><tr>
            <th style={{ ...th, textAlign: 'left', minWidth: 150 }}>Tipo</th>
            <th style={{ ...th, textAlign: 'left', minWidth: 220 }}>Descrição</th>
            <th style={{ ...th, minWidth: 120 }}>Credor</th>
            <th style={{ ...th, minWidth: 120 }}>Devedor</th>
            <th style={{ ...th, textAlign: 'right', minWidth: 110 }}>Valor</th>
            <th style={{ ...th, minWidth: 90 }}>Atingimento</th>
            <th style={{ ...th, minWidth: 90 }}>Pagamento</th>
            <th style={{ ...th, minWidth: 90 }}>Vencimento</th>
            <th style={{ ...th, minWidth: 60 }}></th>
          </tr></thead>
          <tbody>
            {clauses.length === 0 && <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 36 }}>{emptyLabel}</td></tr>}
            {clauses.map(c => {
              const overdue = isOverdue(c.due_date, c.payment_status); const soon = isDueSoon(c.due_date, c.payment_status)
              const parc = installments.filter(i => i.clause_id === c.id).sort((a, b) => a.due_date.localeCompare(b.due_date))
              const open = expanded.has(c.id)
              const totCl = parc.length ? parc.reduce((s, p) => s + p.original_value, 0) : (c.original_value ?? 0)
              const paidCl = parc.length
                ? parc.filter(p => p.payment_status === 'PAGA').reduce((s, p) => s + p.original_value, 0)
                : (c.payment_status === 'PAGA' ? (c.original_value ?? 0) : (c.amount_paid_brl ?? 0))
              const pctCl = totCl > 0 ? Math.round((paidCl / totCl) * 100) : 0
              return (
                <Fragment key={c.id}>
                  <tr style={{ background: overdue ? 'var(--row-late-bg)' : soon ? 'var(--warn-tint)' : 'transparent' }}>
                    <td style={td}>
                      {parc.length > 0
                        ? <button onClick={() => toggle(c.id)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 10, fontFamily: fontMono, fontWeight: 600, color: '#be8c4a' }}>{open ? '▾' : '▸'} {CLAUSE_TYPE_LABELS[c.clause_type]}</button>
                        : <span style={{ fontSize: 10, fontFamily: fontMono, fontWeight: 600, color: 'var(--text-muted)' }}>{CLAUSE_TYPE_LABELS[c.clause_type]}</span>}
                    </td>
                    <td style={{ ...td, maxWidth: 280 }}>
                      <button onClick={() => onOpen(c.id)} title="Abrir a obrigação" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: font, fontSize: 12, fontWeight: 500, color: 'var(--ink-primary)', textAlign: 'left', textDecoration: 'underline', textDecorationColor: 'rgba(190,140,74,0.5)', textUnderlineOffset: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{c.description}</button>
                      {c.condition_description && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.condition_description}</div>}
                    </td>
                    <td style={{ ...td, fontSize: 11, color: 'var(--text-secondary)', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.creditor_party}</td>
                    <td style={{ ...td, fontSize: 11, color: 'var(--text-secondary)', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.debtor_party}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: fontMono, fontWeight: 500 }}>{c.original_value ? fmtCurrencyShort(c.original_value, c.currency) : c.percentage_value ? `${c.percentage_value}%` : '—'}{parc.length > 0 && <span style={{ fontSize: 9, color: 'var(--text-muted)' }}> · {parc.length}x</span>}</td>
                    <td style={td}><PctBadge pct={pctCl} /></td>
                    <td style={td}><StatusBadge status={c.payment_status} map={PAYMENT_STATUS_STYLE} /></td>
                    <td style={{ ...td, fontFamily: fontMono, fontSize: 11, color: overdue ? 'var(--neg)' : soon ? 'var(--warn)' : 'var(--ink-secondary)', fontWeight: overdue ? 700 : 400 }}>{c.due_date ? fmtDate(c.due_date) : '—'}{(overdue || soon) && <div style={{ fontSize: 9 }}>{fmtRelative(c.due_date)}</div>}</td>
                    <td style={{ ...td, textAlign: 'center' }}><ClauseActions clause={c} onOpen={() => onOpen(c.id)} onEdit={() => onEdit(c.id)} onFlow={() => onFlow(c.id)} onMarkAchieved={() => onMarkAchieved(c.id)} onPay={() => onPay(c.id)} onCancel={() => onCancel(c.id)} /></td>
                  </tr>
                  {open && parc.map(p => {
                    const late = isOverdue(p.due_date, p.payment_status)
                    const renegId = p.payment_status === 'CANCELADA' ? renegotiatedAcordoId(p.notes) : null
                    const rc = renegId ? 'var(--neg)' : null
                    return (
                      <tr key={p.id} style={{ background: 'var(--bg-subtle)' }}>
                        <td style={{ ...td, fontFamily: fontMono, fontSize: 10, color: rc ?? 'var(--text-muted)', textAlign: 'left', paddingLeft: 20 }}>#{p.installment_number}</td>
                        <td style={{ ...td, fontSize: 11, color: rc ?? 'var(--text-muted)' }}>Parcela {p.installment_number}{renegId ? ' · renegociada' : ''}</td>
                        <td style={{ ...td, fontSize: 11, color: rc ?? 'var(--text-muted)', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.creditor_party}</td>
                        <td style={{ ...td, fontSize: 11, color: rc ?? 'var(--text-muted)', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.debtor_party}</td>
                        <td style={{ ...td, textAlign: 'right', fontFamily: fontMono, fontWeight: 600, color: rc ?? undefined }}>{fmtCurrencyShort(p.original_value, p.currency)}</td>
                        <td style={{ ...td, fontFamily: fontMono, fontSize: 10, color: rc ?? 'var(--text-muted)' }}>{p.payment_status === 'PAGA' ? '100%' : '0%'}</td>
                        <td style={td}><StatusBadge status={p.payment_status} map={PAYMENT_STATUS_STYLE} /></td>
                        <td style={{ ...td, fontFamily: fontMono, fontSize: 11, color: rc ?? (late ? 'var(--neg)' : 'var(--ink-secondary)'), fontWeight: late ? 700 : 400 }}>{fmtDate(p.due_date)}</td>
                        <td style={{ ...td, textAlign: 'center' }}>
                          {renegId ? (
                            <button onClick={() => goToAcordo(renegId)} title="Ver renegociação" style={{ padding: '3px 9px', borderRadius: 6, border: '1px solid rgba(122,63,44,0.35)', background: 'transparent', color: 'var(--neg)', fontSize: 11, fontFamily: font, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>→ acordo</button>
                          ) : (
                            <InstallmentActions inst={p} canEdit={canEdit} onEdit={() => onEditInst(p.id)} onPay={() => onPayInst(p.id)} onQuickPay={() => onQuickPayInst(p.id)} onRevert={() => onRevertInst(p.id)} />
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

type Tab = 'consolidado' | 'salario' | 'luvas' | 'agentes' | 'gatilhos' | 'acordos' | 'transferencias'
const TABS: { id: Tab; label: string }[] = [
  { id: 'consolidado',    label: 'Consolidado' },
  { id: 'salario',        label: 'Salário' },
  { id: 'luvas',          label: 'Luvas' },
  { id: 'agentes',        label: 'Agentes' },
  { id: 'gatilhos',       label: 'Gatilhos e Cláusulas Diversas' },
  { id: 'acordos',        label: 'Acordos e Renegociações' },
  { id: 'transferencias', label: 'Histórico de Transferências' },
]

// Agrupamento de tipos de cláusula por aba.
const SALARY_CLAUSE_TYPES: ClauseType[] = ['SALARIO_CETD', 'DIREITO_IMAGEM']
const LUVAS_CLAUSE_TYPES: ClauseType[] = ['LUVAS']
const AGENT_CLAUSE_TYPES: ClauseType[] = ['INTERMEDIACAO', 'INTERMEDIACAO_VENDA_FUTURA']
const TRANSFER_CLAUSE_TYPES: ClauseType[] = ['TRANSFER_FEE_FIXO', 'TRANSFER_FEE_VARIAVEL', 'EMPRESTIMO_TAXA']
const NON_DIVERSE_TYPES: ClauseType[] = [...SALARY_CLAUSE_TYPES, ...LUVAS_CLAUSE_TYPES, ...AGENT_CLAUSE_TYPES, ...TRANSFER_CLAUSE_TYPES]

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
  const [interIdx, setInterIdx] = useState<Map<string, string>>(new Map())
  const [tab, setTab] = useState<Tab>('consolidado')
  const [payClauseId, setPayClauseId] = useState<string | null>(null)
  const [payInstId, setPayInstId] = useState<string | null>(null)
  const [editInstId, setEditInstId] = useState<string | null>(null)
  const [editClauseId, setEditClauseId] = useState<string | null>(null)
  const [showReneg, setShowReneg] = useState(false)
  const [highlightAcordo, setHighlightAcordo] = useState<string | null>(null)
  const goToAcordo = (acordoId: string) => { setTab('acordos'); setHighlightAcordo(acordoId) }
  const [showEdit, setShowEdit] = useState(false)
  const [editContractId, setEditContractId] = useState<string | null>(null)
  const [newClauseContractId, setNewClauseContractId] = useState<string | null>(null)
  const [newClauseType, setNewClauseType] = useState<ClauseType | null>(null)
  const [flowClauseId, setFlowClauseId] = useState<string | null>(null)
  const [editLiab, setEditLiab] = useState<{ kind: 'club' | 'agent'; liab: ClubLiability | IntermediaryLiability } | null>(null)
  const [expandedContracts, setExpandedContracts] = useState<Set<string>>(new Set())
  const toggleExpand = (cid: string) => setExpandedContracts(prev => { const n = new Set(prev); if (n.has(cid)) n.delete(cid); else n.add(cid); return n })

  const loadData = useCallback(async () => {
    if (!id) return
    setLoading(true)
    const [ath, contr, cls, alrt, rght, trg, clb, itm, clubs, inters, pjList, imgs, inst] = await Promise.all([
      fetchAthlete(id), fetchAthleteContracts(id), fetchAthleteClauses(id), fetchAthleteAlerts(id),
      fetchAthleteEconomicRights(id), fetchAthleteSalaryTriggers(id),
      fetchAthleteClubLiabilities(id), fetchAthleteIntermediaryLiabilities(id),
      fetchClubs(), fetchIntermediaries(),
      fetchAthletePJs(id), fetchAthleteImageRights(id), fetchAthleteInstallments(id),
    ])
    setAthlete(ath); setContracts(contr); setClauses(cls); setAlerts(alrt)
    setRights(rght); setTriggers(trg); setClubLiabs(clb); setIntermLiabs(itm)
    setClubIdx(buildNameIndex(clubs)); setInterIdx(buildNameIndex(inters))
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
  async function handleDeleteAthlete() {
    if (!athlete) return
    if (!window.confirm(`Excluir o atleta "${athlete.full_name}" e TODOS os seus vínculos, cláusulas, parcelas e obrigações? Esta ação não pode ser desfeita.`)) return
    await deleteAthlete(athlete.id)
    navigate('/atletas')
  }
  async function handleDeleteClause(clauseId: string) {
    if (!window.confirm('Excluir esta cláusula e suas parcelas? Esta ação não pode ser desfeita.')) return
    await deleteClause(clauseId); loadData()
  }
  async function handleDeleteClubLiab(lid: string) {
    if (!window.confirm('Excluir esta obrigação com clube?')) return
    await deleteClubLiability(lid); setClubLiabs(prev => prev.filter(l => l.id !== lid))
  }
  // Converte um passivo "flat" (agente/clube) em cláusula — assim vira uma
  // obrigação única com página própria e permite fluxo de parcelas.
  async function handleConvertLiab(kind: 'club' | 'agent', lid: string) {
    if (!id) return
    const liab = kind === 'club' ? clubLiabs.find(l => l.id === lid) : intermLiabs.find(l => l.id === lid)
    if (!liab) return
    const name = kind === 'club' ? (liab as ClubLiability).club_name : (liab as IntermediaryLiability).intermediary_name
    const contractId = kind === 'agent' ? ((liab as IntermediaryLiability).contract_id ?? null) : null
    const payable = liab.direction === 'A_PAGAR'
    const clauseType: ClauseType = kind === 'agent' ? 'INTERMEDIACAO' : 'SOLIDARIEDADE_FIFA'
    if (!window.confirm('Converter em cláusula? Passa a aparecer em Contratos Ativos, ganha página própria e permite fluxo de parcelas.')) return
    const clause = await createClause(contractId, id, {
      clause_type: clauseType,
      description: liab.description || `${kind === 'agent' ? 'Comissão de agente' : 'Obrigação'} — ${name}`,
      creditor_party: payable ? name : 'Botafogo SAF',
      debtor_party: payable ? 'Botafogo SAF' : name,
      currency: liab.currency,
      original_value: liab.amount,
      percentage_value: null,
      condition_description: liab.condition_description || '',
      due_date: liab.due_date || todayISO(),
      installments_total: 1,
      notes: liab.notes || '',
    })
    if (kind === 'agent') await deleteIntermediaryLiability(lid)
    else await deleteClubLiability(lid)
    navigate(`/obrigacoes/${clause.id}`)
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
  async function handleUpdateClause(clauseId: string, patch: Partial<Clause>) {
    const u = await updateClause(clauseId, patch)
    setClauses(prev => prev.map(c => c.id === clauseId ? u : c)); setEditClauseId(null)
  }
  async function handleUpdateInstallment(instId: string, patch: Partial<ClauseInstallment>) {
    const u = await updateInstallment(instId, patch)
    setInstallments(prev => prev.map(i => i.id === instId ? u : i)); setEditInstId(null)
  }
  async function handleRenegotiate(input: RenegotiationInput) {
    await createRenegotiation(input)
    setShowReneg(false)
    await loadData()
  }
  // Regenera o fluxo mensal de salário/imagem refletindo os gatilhos atingidos.
  async function regenSalaryFlow(nextTriggers: SalaryTrigger[]) {
    const empC = employmentContract(contracts)
    if (!empC || !empC.end_date || !athlete) return
    const relevant = nextTriggers.filter(t => t.contract_id === empC.id || t.contract_id === null)
    await regenerateSalaryImageFlow({ contract: empC, triggers: relevant, existingClauses: clauses, athleteName: athlete.full_name, pjName: pjs[0]?.legal_name ?? '' })
  }
  async function handleAddTrigger(input: NewSalaryTriggerInput) { if (!id) return; const c = await createSalaryTrigger(id, input); setTriggers(prev => [...prev, c]) }
  async function handleMarkTrigger(tid: string, date: string) { const u = await markTriggerAchieved(tid, date); const next = triggers.map(t => t.id === tid ? u : t); setTriggers(next); await regenSalaryFlow(next); loadData() }
  async function handleResetTrigger(tid: string) { const u = await resetTrigger(tid); const next = triggers.map(t => t.id === tid ? u : t); setTriggers(next); await regenSalaryFlow(next); loadData() }
  async function handleDeleteTrigger(tid: string) { await deleteSalaryTrigger(tid); const next = triggers.filter(t => t.id !== tid); setTriggers(next); await regenSalaryFlow(next); loadData() }
  async function handlePhoto(url: string | null) { if (!id) return; const u = await updateAthlete(id, { profile_photo_url: url }); setAthlete(u) }

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
      <button onClick={() => navigate('/atletas')} style={{ marginTop: 16, padding: '8px 20px', borderRadius: 7, border: '1px solid var(--divider-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, fontFamily: font, cursor: 'pointer' }}>← Voltar</button>
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

  // Contrato "guarda-chuva": agentes, luvas, gatilhos e cláusulas diversas ficam
  // atrelados à transferência de compra (entrada). Fallback: qualquer transferência.
  const umbrella = contracts.find(c => c.type === 'ENTRADA' || c.type === 'EMPRESTIMO_ENTRADA')
    ?? contracts.find(c => isTransferContractType(c.type)) ?? contracts[0] ?? null
  // Listas de cláusulas por aba.
  const luvasClauses = clauses.filter(c => LUVAS_CLAUSE_TYPES.includes(c.clause_type))
  const agentClauses = clauses.filter(c => AGENT_CLAUSE_TYPES.includes(c.clause_type))
  const diverseClauses = clauses.filter(c => !NON_DIVERSE_TYPES.includes(c.clause_type))

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
              {unreadCrit > 0 && <span title={`${unreadCrit} em atraso`} style={{ padding: '3px 9px', borderRadius: 5, background: 'var(--neg-tint)', color: 'var(--neg)', fontSize: 10, fontWeight: 600, fontFamily: fontMono }}>{unreadCrit} {unreadCrit === 1 ? 'crítico' : 'críticos'}</span>}
              {warnCount > 0 && <span title={`${warnCount} vencendo em breve`} style={{ padding: '3px 9px', borderRadius: 5, background: 'var(--warn-tint)', color: 'var(--warn)', fontSize: 10, fontWeight: 600, fontFamily: fontMono }}>{warnCount} atenção</span>}
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
            <button onClick={exportAthlete} title="Exportar dados deste atleta (XLSX)" style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--divider-strong)', borderRadius: 8, color: 'var(--text-secondary)', fontFamily: font, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>↓ Exportar</button>
            {canEdit && <button onClick={() => setShowEdit(true)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--divider-strong)', borderRadius: 8, color: 'var(--text-secondary)', fontFamily: font, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Editar</button>}
            {canEdit && <button onClick={handleDeleteAthlete} title="Excluir o atleta e TODOS os seus vínculos" style={{ padding: '8px 16px', background: 'transparent', border: '1px solid rgba(122,63,44,0.4)', borderRadius: 8, color: 'var(--neg)', fontFamily: font, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Excluir atleta</button>}
            <Link to={`/atletas/${athlete.id}/contratos/novo`} style={{ padding: '8px 16px', background: 'var(--ink-primary)', border: 'none', borderRadius: 8, color: 'var(--gold-soft)', fontFamily: font, fontSize: 12, fontWeight: 600, textDecoration: 'none', display: 'inline-block' }}>+ Novo Contrato</Link>
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
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--divider)', marginBottom: 16, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '10px 16px', border: 'none', background: 'none', fontFamily: font, fontSize: 13, fontWeight: tab === t.id ? 600 : 400, cursor: 'pointer', color: tab === t.id ? '#be8c4a' : 'var(--text-secondary)', borderBottom: tab === t.id ? '2px solid #be8c4a' : '2px solid transparent', marginBottom: -2, whiteSpace: 'nowrap' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Consolidado — todo o fluxo financeiro do atleta */}
      {tab === 'consolidado' && (
        <ConsolidadoTab
          clauses={clauses} installments={installments} clubLiabs={clubLiabs} intermLiabs={intermLiabs}
          canEdit={canEdit}
          onOpenClause={cid => navigate(`/obrigacoes/${cid}`)}
          onEditInst={id => setEditInstId(id)}
          onDeleteClause={handleDeleteClause}
          onEditLiab={(kind, lid) => {
            const liab = kind === 'club' ? clubLiabs.find(l => l.id === lid) : intermLiabs.find(l => l.id === lid)
            if (liab) setEditLiab({ kind, liab })
          }}
          onDeleteLiab={(kind, lid) => kind === 'club' ? handleDeleteClubLiab(lid) : handleDeleteIntermLiab(lid)}
          onConvertLiab={handleConvertLiab}
        />
      )}

      {/* Salário — remuneração (salário + imagem), fluxo automático e gráfico */}
      {tab === 'salario' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!emp ? (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontFamily: font }}>
              Nenhum contrato de trabalho com remuneração. Registre a transferência (aba Histórico de Transferências) e o salário; ou use o assistente (+ Criar).
            </div>
          ) : (
            <SalaryImageEditor contract={emp} triggers={empTriggers} clauses={clauses} pjs={pjs} athleteName={athlete?.full_name ?? 'Atleta'} canEdit={canEdit} onSaved={loadData} />
          )}
          <FlowList title="Fluxo mensal — Salário + Imagem" installments={installments} clauses={clauses} types={['SALARIO_CETD', 'DIREITO_IMAGEM']} />
        </div>
      )}

      {/* Luvas */}
      {tab === 'luvas' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {canEdit && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => { if (!umbrella) { window.alert('Cadastre primeiro uma transferência (aba Histórico de Transferências) para servir de contrato guarda-chuva.'); return } setNewClauseType('LUVAS'); setNewClauseContractId(umbrella.id) }}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(190,140,74,0.4)', background: 'rgba(190,140,74,0.08)', color: '#be8c4a', fontSize: 12, fontWeight: 600, fontFamily: font, cursor: 'pointer' }}>+ Adicionar Luvas</button>
            </div>
          )}
          <ClauseTable clauses={luvasClauses} installments={installments} canEdit={canEdit}
            emptyLabel="Nenhuma cláusula de luvas. Use '+ Adicionar Luvas' e cadastre o fluxo de pagamento."
            onOpen={cid => navigate(`/obrigacoes/${cid}`)} onEdit={setEditClauseId} onFlow={setFlowClauseId}
            onMarkAchieved={handleMarkAchieved} onPay={setPayClauseId} onCancel={handleCancelClause}
            onEditInst={setEditInstId} onPayInst={setPayInstId} onQuickPayInst={handleMarkInstallmentPaidQuick} onRevertInst={handleRevertInstallment} goToAcordo={goToAcordo} />
        </div>
      )}

      {/* Agentes */}
      {tab === 'agentes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {canEdit && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => { if (!umbrella) { window.alert('Cadastre primeiro uma transferência (aba Histórico de Transferências) para servir de contrato guarda-chuva.'); return } setNewClauseType('INTERMEDIACAO'); setNewClauseContractId(umbrella.id) }}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(190,140,74,0.4)', background: 'rgba(190,140,74,0.08)', color: '#be8c4a', fontSize: 12, fontWeight: 600, fontFamily: font, cursor: 'pointer' }}>+ Adicionar Agente / Intermediação</button>
            </div>
          )}
          <ClauseTable clauses={agentClauses} installments={installments} canEdit={canEdit}
            emptyLabel="Nenhuma intermediação. Use '+ Adicionar Agente / Intermediação' e cadastre o fluxo de pagamento."
            onOpen={cid => navigate(`/obrigacoes/${cid}`)} onEdit={setEditClauseId} onFlow={setFlowClauseId}
            onMarkAchieved={handleMarkAchieved} onPay={setPayClauseId} onCancel={handleCancelClause}
            onEditInst={setEditInstId} onPayInst={setPayInstId} onQuickPayInst={handleMarkInstallmentPaidQuick} onRevertInst={handleRevertInstallment} goToAcordo={goToAcordo} />
          {intermLiabs.length > 0 && (
            <div className="card" style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: 9, fontFamily: fontMono, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>Obrigações de agente (legado — sem fluxo)</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {intermLiabs.map(l => (
                  <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 12px', borderRadius: 7, background: 'var(--bg-subtle)', border: '1px solid var(--divider-soft)' }}>
                    <span style={{ fontWeight: 600, fontFamily: font, fontSize: 13 }}>{(() => { const iid = interIdx.get(norm(l.intermediary_name)); return iid ? <RefLink to={`/intermediarios/${iid}`} title={`Abrir ${l.intermediary_name}`}>{l.intermediary_name}</RefLink> : l.intermediary_name })()}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: font, flex: 1 }}>{l.description ?? ''}</span>
                    <span style={{ fontFamily: fontMono, fontWeight: 600, fontSize: 13 }}>{fmtCurrencyShort(l.amount, l.currency)}</span>
                    <StatusBadge status={l.status} map={PAYMENT_STATUS_STYLE} />
                    {canEdit && <button onClick={() => handleConvertLiab('agent', l.id)} title="Converter em intermediação com fluxo" style={{ padding: '3px 9px', borderRadius: 6, border: '1px solid rgba(190,140,74,0.4)', background: 'transparent', color: '#be8c4a', fontSize: 11, fontFamily: font, fontWeight: 600, cursor: 'pointer' }}>Converter</button>}
                    {canEdit && <button onClick={() => handleDeleteIntermLiab(l.id)} title="Excluir" style={{ background: 'none', border: 'none', color: 'var(--neg)', cursor: 'pointer', fontSize: 15, lineHeight: 1 }}>×</button>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Gatilhos e Cláusulas Diversas */}
      {tab === 'gatilhos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ padding: '18px 20px' }}>
            <div style={{ marginBottom: 10, fontSize: 10, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Gatilhos de mudança salarial (metas)</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: font, marginBottom: 12 }}>
              Ex.: "ao atingir 30 gols, salário passa a 600k". Ao marcar como atingida numa data, o salário efetivo muda a partir dela — clique em "Atualizar fluxo mensal" na aba Salário para refletir nas parcelas.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {empTriggers.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: font }}>Nenhum gatilho de salário cadastrado.</div>
                : empTriggers.map(t => <TriggerRow key={t.id} t={t} canEdit={canEdit} onMark={d => handleMarkTrigger(t.id, d)} onReset={() => handleResetTrigger(t.id)} onDelete={() => handleDeleteTrigger(t.id)} />)}
            </div>
            {canEdit && (emp ? <NewTriggerForm contract={emp} onAdd={handleAddTrigger} /> : <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: font }}>Cadastre o contrato de trabalho (Salário) para criar gatilhos.</div>)}
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Cláusulas diversas (bônus por performance, multa, solidariedade, sell-on…)</div>
              {canEdit && <button onClick={() => { if (!umbrella) { window.alert('Cadastre primeiro uma transferência (aba Histórico de Transferências).'); return } setNewClauseType('BONUS_PERFORMANCE_ATLETA'); setNewClauseContractId(umbrella.id) }}
                style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid rgba(190,140,74,0.4)', background: 'rgba(190,140,74,0.08)', color: '#be8c4a', fontSize: 12, fontWeight: 600, fontFamily: font, cursor: 'pointer' }}>+ Cláusula diversa</button>}
            </div>
            <ClauseTable clauses={diverseClauses} installments={installments} canEdit={canEdit}
              emptyLabel="Nenhuma cláusula diversa. Ex.: 10k por gol, bônus por títulos, multa rescisória, solidariedade, sell-on."
              onOpen={cid => navigate(`/obrigacoes/${cid}`)} onEdit={setEditClauseId} onFlow={setFlowClauseId}
              onMarkAchieved={handleMarkAchieved} onPay={setPayClauseId} onCancel={handleCancelClause}
              onEditInst={setEditInstId} onPayInst={setPayInstId} onQuickPayInst={handleMarkInstallmentPaidQuick} onRevertInst={handleRevertInstallment} goToAcordo={goToAcordo} />
          </div>
        </div>
      )}

      {/* Acordos e Renegociações */}
      {tab === 'acordos' && (
        <AcordosTab
          clauses={clauses} installments={installments} canEdit={canEdit}
          highlight={highlightAcordo} onHighlighted={() => setHighlightAcordo(null)}
          onNew={() => setShowReneg(true)}
          onEditInst={id => setEditInstId(id)}
          onPayInst={id => setPayInstId(id)}
          onQuickPayInst={id => handleMarkInstallmentPaidQuick(id)}
          onRevertInst={id => handleRevertInstallment(id)}
        />
      )}

      {/* Histórico de Transferências */}
      {tab === 'transferencias' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {canEdit && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Link to={`/atletas/${athlete.id}/contratos/novo`} style={{ padding: '8px 16px', background: 'var(--ink-primary)', border: 'none', borderRadius: 8, color: 'var(--gold-soft)', fontFamily: font, fontSize: 12, fontWeight: 600, textDecoration: 'none', display: 'inline-block' }}>+ Nova Transferência</Link>
            </div>
          )}
          {contracts.filter(c => isTransferContractType(c.type)).length === 0 && <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontFamily: font }}>Nenhuma transferência cadastrada.</div>}
          {contracts.filter(c => isTransferContractType(c.type)).map(ct => {
            // O vínculo (clube) só mostra transfer fee, cláusulas e gatilhos.
            // Salário (Botafogo×atleta PF) e imagem (Botafogo×PJ) NÃO entram aqui —
            // vivem na aba CLT + Imagem.
            const ctClauses = clauses.filter(c => c.contract_id === ct.id && c.clause_type !== 'SALARIO_CETD' && c.clause_type !== 'DIREITO_IMAGEM')
            const typeStyle: Record<string, { bg: string; fg: string }> = { ENTRADA: { bg: '#e6ece2', fg: '#3a6f3a' }, SAIDA: { bg: 'rgba(91,107,122,0.12)', fg: '#5b6b7a' }, EMPRESTIMO_SAIDA: { bg: 'rgba(190,140,74,0.15)', fg: '#7a6244' }, EMPRESTIMO_ENTRADA: { bg: 'rgba(111,96,118,0.12)', fg: '#6f6076' }, INTERMEDIACAO: { bg: 'rgba(190,140,74,0.14)', fg: '#8a6a34' }, LUVAS: { bg: 'rgba(190,140,74,0.14)', fg: '#8a6a34' }, SELL_ON: { bg: 'rgba(190,140,74,0.14)', fg: '#8a6a34' }, OUTRO: { bg: 'rgba(156,163,175,0.15)', fg: '#6b7280' } }
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
                    <span title={`Contrato vinculado a ${contractLabel(parent)}`} style={{ padding: '3px 9px', borderRadius: 5, background: 'rgba(190,140,74,0.10)', border: '1px solid rgba(190,140,74,0.28)', color: '#8a6a34', fontSize: 10, fontWeight: 600, fontFamily: fontMono, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      ↳ vinculado a {CONTRACT_TYPE_LABELS[parent.type]} · {parent.counterpart_club}
                    </span>
                  )}
                  {canEdit && (
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button onClick={() => setNewClauseContractId(ct.id)} title="Adicionar cláusula a este vínculo (ex.: Sell-on Fee, intermediação)" style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(190,140,74,0.4)', background: 'rgba(190,140,74,0.08)', color: '#be8c4a', fontSize: 11, fontWeight: 600, fontFamily: font, cursor: 'pointer' }}>+ Cláusula</button>
                      <button onClick={() => navigate(`/atletas/${ct.athlete_id}/contratos/novo?rel=${ct.id}`)} title="Criar um novo contrato atrelado a este vínculo (ex.: contrato de intermediação)" style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(190,140,74,0.4)', background: 'rgba(190,140,74,0.08)', color: '#be8c4a', fontSize: 11, fontWeight: 600, fontFamily: font, cursor: 'pointer' }}>+ Contrato vinculado</button>
                      <button onClick={() => setEditContractId(ct.id)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(190,140,74,0.4)', background: 'rgba(190,140,74,0.08)', color: '#be8c4a', fontSize: 11, fontWeight: 600, fontFamily: font, cursor: 'pointer' }}>Editar</button>
                      <button onClick={() => handleDeleteContract(ct.id)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(122,63,44,0.4)', background: 'transparent', color: 'var(--neg)', fontSize: 11, fontWeight: 600, fontFamily: font, cursor: 'pointer' }}>Excluir</button>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 20, fontSize: 12, color: 'var(--text-secondary)', fontFamily: font, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span>Início: {fmtDate(ct.start_date)}</span>
                  {ct.end_date && <span>Fim: {fmtDate(ct.end_date)}</span>}
                  {ct.transfer_fee_gross && <span style={{ fontWeight: 600, color: 'var(--ink-primary)' }}>{CURRENCY_SYMBOLS[ct.transfer_currency]} {ct.transfer_fee_gross.toLocaleString('pt-BR')}</span>}
                  {ctClauses.length > 0 && (
                    <button onClick={() => toggleExpand(ct.id)} style={{ background: 'none', border: 'none', padding: 0, color: '#be8c4a', fontFamily: font, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      {expandedContracts.has(ct.id) ? '▾' : '▸'} {ctClauses.length} cláusula{ctClauses.length !== 1 ? 's' : ''} — ver vencimentos
                    </button>
                  )}
                  {ctClauses.length === 0 && <span style={{ color: 'var(--text-muted)' }}>0 cláusulas</span>}
                  {children.length > 0 && <span style={{ color: '#8a6a34', fontWeight: 600 }}>· {children.length} contrato{children.length !== 1 ? 's' : ''} vinculado{children.length !== 1 ? 's' : ''}</span>}
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
                            <span style={{ fontFamily: fontMono, fontSize: 12, fontWeight: 600 }}>{fmtCurrencyShort(totalCl, cl.currency)}{parc.length ? ` · ${parc.length}x` : ''}</span>
                          </div>
                          {parc.length > 0 && (
                            <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                              {parc.map(p => {
                                const late = isOverdue(p.due_date, p.payment_status)
                                return (
                                  <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '40px 110px 1fr 90px', gap: 8, alignItems: 'center', padding: '5px 12px', borderTop: '1px solid var(--divider-soft)' }}>
                                    <span style={{ fontFamily: fontMono, fontSize: 10, color: 'var(--text-muted)', textAlign: 'right' }}>{p.installment_number}</span>
                                    <span style={{ fontFamily: fontMono, fontSize: 11, color: late ? 'var(--neg)' : 'var(--ink-secondary)', fontWeight: late ? 700 : 400 }}>{fmtDate(p.due_date)}</span>
                                    <span style={{ fontFamily: fontMono, fontSize: 12, fontWeight: 600 }}>{fmtCurrencyShort(p.original_value, p.currency)}</span>
                                    <span style={{ textAlign: 'right' }}><StatusBadge status={p.payment_status} map={PAYMENT_STATUS_STYLE} /></span>
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
      )}

      {payClause && <PaymentModal label={payClause.description} currency={payClause.currency} value={payClause.original_value ?? 0} onClose={() => setPayClauseId(null)} onSave={p => handleClausePayment(payClause.id, p)} />}
      {payInst && <PaymentModal label={`Parcela ${payInst.installment_number}`} currency={payInst.currency} value={payInst.original_value} onClose={() => setPayInstId(null)} onSave={p => handleInstallmentPayment(payInst.id, p)} />}
      {editInst && <InstallmentEditModal inst={editInst} onClose={() => setEditInstId(null)} onSave={patch => handleUpdateInstallment(editInst.id, patch)} />}
      {editClause && <ClauseEditModal clause={editClause} onClose={() => setEditClauseId(null)} onSave={patch => handleUpdateClause(editClause.id, patch)} />}
      {showReneg && athlete && <RenegotiationModal athleteId={athlete.id} clauses={clauses} installments={installments} clubLiabs={clubLiabs} intermLiabs={intermLiabs} onClose={() => setShowReneg(false)} onSave={handleRenegotiate} />}
      {showEdit && athlete && <EditAthleteModal athlete={athlete} rights={rights} pjs={pjs} canEdit={canEdit} onAddPJ={handleAddPJ} onUpdatePJ={handleUpdatePJ} onDeletePJ={handleDeletePJ} imageCountByPj={imageRights.reduce((m, ir) => { if (ir.pj_id) m[ir.pj_id] = (m[ir.pj_id] ?? 0) + 1; return m }, {} as Record<string, number>)} onClose={() => setShowEdit(false)} onSaved={() => { setShowEdit(false); loadData() }} />}
      {editContractId && (() => {
        const ct = contracts.find(c => c.id === editContractId)
        return ct ? <ContractEditModal contract={ct} siblings={contracts} onClose={() => setEditContractId(null)} onSaved={() => { setEditContractId(null); loadData() }} /> : null
      })()}
      {newClauseContractId && athlete && (() => {
        const ct = contracts.find(c => c.id === newClauseContractId)
        return ct ? <NewClauseModal contract={ct} athleteId={athlete.id} initialType={newClauseType ?? undefined} onClose={() => { setNewClauseContractId(null); setNewClauseType(null) }} onSaved={() => { setNewClauseContractId(null); setNewClauseType(null); loadData() }} /> : null
      })()}
      {flowClauseId && athlete && (() => {
        const cl = clauses.find(c => c.id === flowClauseId)
        return cl ? <ClauseFlowModal clause={cl} athleteId={athlete.id} onClose={() => setFlowClauseId(null)} onSaved={() => { setFlowClauseId(null); loadData() }} /> : null
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
        {canEdit && !adding && <button onClick={() => setAdding(true)} style={{ padding: '7px 14px', borderRadius: 7, border: '1px dashed rgba(190,140,74,0.45)', background: 'rgba(190,140,74,0.08)', color: '#be8c4a', fontSize: 12, fontFamily: font, fontWeight: 600, cursor: 'pointer' }}>+ Nova PJ</button>}
      </div>

      {adding && (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr auto', gap: 8, alignItems: 'end', marginBottom: 12, padding: 12, borderRadius: 8, background: 'var(--bg-subtle)', border: '1px solid var(--divider-soft)' }}>
          <div><label style={pjLbl}>Razão social *</label><input style={{ ...pjInp, width: '100%' }} value={f.legal_name} onChange={e => setF(p => ({ ...p, legal_name: e.target.value }))} placeholder="Ex: Fulano Sports LTDA" /></div>
          <div><label style={pjLbl}>CNPJ</label><input style={{ ...pjInp, width: '100%' }} value={f.cnpj} onChange={e => setF(p => ({ ...p, cnpj: e.target.value }))} /></div>
          <div><label style={pjLbl}>Observações</label><input style={{ ...pjInp, width: '100%' }} value={f.notes} onChange={e => setF(p => ({ ...p, notes: e.target.value }))} /></div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={submitNew} disabled={!f.legal_name.trim()} style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: 'var(--ink-primary)', color: 'var(--gold-soft)', fontSize: 12, fontFamily: font, fontWeight: 600, cursor: 'pointer' }}>Salvar</button>
            <button onClick={() => setAdding(false)} style={{ padding: '7px 12px', borderRadius: 7, border: '1px solid var(--divider-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontFamily: font, cursor: 'pointer' }}>✕</button>
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
                <button onClick={submitEdit} style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: 'var(--ink-primary)', color: 'var(--gold-soft)', fontSize: 12, fontFamily: font, fontWeight: 600, cursor: 'pointer' }}>Salvar</button>
                <button onClick={() => setEditId(null)} style={{ padding: '7px 12px', borderRadius: 7, border: '1px solid var(--divider-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontFamily: font, cursor: 'pointer' }}>✕</button>
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
                  <button onClick={() => startEdit(p)} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--divider-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 11, fontFamily: font, cursor: 'pointer' }}>Editar</button>
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
function SalaryImageEditor({ contract, triggers, clauses, pjs, athleteName, canEdit, onSaved }: {
  contract: Contract; triggers: SalaryTrigger[]; clauses: Clause[]; pjs: AthletePJ[]; athleteName: string; canEdit: boolean; onSaved: () => void
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
  const image = effectiveImage(contract, triggers)
  const other = contract.other_value ?? 0
  const total = salaryNow + image + other
  const pjName = pjs[0]?.legal_name ?? ''
  const imgNoPj = (contract.image_value ?? 0) > 0 && !pjName

  // Ao salvar a remuneração, o fluxo mensal (salário dia 5 + imagem dia 20) é
  // gerado AUTOMATICAMENTE pela vigência — com os degraus dos gatilhos atingidos.
  async function save() {
    setSaving(true)
    try {
      const updated: Contract = {
        ...contract,
        base_salary: f.base_salary ? parseFloat(f.base_salary) : null,
        image_value: f.image_value ? parseFloat(f.image_value) : null,
        other_value: f.other_value ? parseFloat(f.other_value) : null,
        salary_currency: f.salary_currency as Currency,
      }
      await updateContract(contract.id, {
        base_salary: updated.base_salary, image_value: updated.image_value,
        other_value: updated.other_value, salary_currency: updated.salary_currency,
      })
      if (contract.end_date) {
        await regenerateSalaryImageFlow({ contract: updated, triggers, existingClauses: clauses, athleteName, pjName })
      } else {
        await updateContractFlowsCurrency(contract.id, updated.salary_currency, contract.transfer_currency)
      }
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
            <button onClick={() => setEditing(true)} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(190,140,74,0.4)', background: 'rgba(190,140,74,0.08)', color: '#be8c4a', fontSize: 11, fontWeight: 600, fontFamily: font, cursor: 'pointer' }}>Atribuir / editar salário</button>
          )}
        </div>
      </div>

      {(!contract.end_date || imgNoPj) && (
        <div style={{ marginBottom: 14, padding: '8px 12px', borderRadius: 8, background: 'var(--warn-tint)', border: '1px solid rgba(176,128,31,0.28)', fontFamily: font, fontSize: 11.5, color: 'var(--warn)' }}>
          {!contract.end_date && <div>Defina a <strong>data de término</strong> do contrato para o fluxo mensal ser gerado automaticamente.</div>}
          {imgNoPj && <div>Cadastre a <strong>PJ do atleta</strong> (Editar → PJs) para gerar o fluxo do Direito de Imagem.</div>}
        </div>
      )}

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
            <button onClick={save} disabled={saving} style={{ padding: '7px 18px', borderRadius: 7, border: 'none', background: '#be8c4a', color: '#fff', fontSize: 12, fontWeight: 600, fontFamily: font, cursor: 'pointer' }}>{saving ? 'Salvando...' : 'Salvar'}</button>
            <button onClick={() => setEditing(false)} style={{ padding: '7px 18px', borderRadius: 7, border: '1px solid var(--divider-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontFamily: font, cursor: 'pointer' }}>Cancelar</button>
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

// ── FlowList — parcelas de cláusulas de tipos específicos (fluxo mensal) ──────
function FlowList({ title, installments, clauses, types }: {
  title: string; installments: ClauseInstallment[]; clauses: Clause[]; types: string[]
}) {
  const typeById = new Map(clauses.map(c => [c.id, c.clause_type as string]))
  const rows = installments
    .filter(i => { const t = typeById.get(i.clause_id); return !!t && types.includes(t) })
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
  const total = rows.reduce((s, r) => s + (r.original_value || 0), 0)
  const cur = rows[0]?.currency ?? 'BRL'
  return (
    <div className="card" style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <div style={{ fontSize: 10, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{title}</div>
        <div style={{ fontSize: 12, fontFamily: fontMono, color: 'var(--ink-primary)' }}>{rows.length} parcela(s) · {fmtCurrencyShort(total, cur)}</div>
      </div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: font }}>Nenhuma parcela gerada. Use o assistente (+ Criar) ou o novo vínculo para gerar o fluxo.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 340, overflowY: 'auto' }}>
          {rows.map(r => {
            const late = isOverdue(r.due_date, r.payment_status)
            const tipo = typeById.get(r.clause_id)
            return (
              <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 120px 90px', gap: 10, alignItems: 'center', padding: '6px 10px', borderRadius: 6, background: 'var(--bg-subtle)', border: '1px solid var(--divider-soft)' }}>
                <span style={{ fontFamily: fontMono, fontSize: 11, color: late ? 'var(--neg)' : 'var(--ink-secondary)', fontWeight: late ? 700 : 400 }}>{fmtDate(r.due_date)}</span>
                <span style={{ fontSize: 11, fontFamily: fontMono, color: 'var(--text-muted)' }}>{tipo === 'SALARIO_CETD' ? 'Salário CLT' : tipo === 'DIREITO_IMAGEM' ? 'Imagem' : (tipo ? CLAUSE_TYPE_LABELS[tipo as keyof typeof CLAUSE_TYPE_LABELS] : '')}</span>
                <span style={{ fontFamily: fontMono, fontWeight: 600, fontSize: 13, textAlign: 'right' }}>{fmtCurrencyShort(r.original_value, r.currency)}</span>
                <span style={{ textAlign: 'right' }}><StatusBadge status={r.payment_status} map={PAYMENT_STATUS_STYLE} /></span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── ConsolidadoTab — todo o fluxo financeiro do atleta ───────────────────────
function ConsolidadoTab({ clauses, installments, clubLiabs, intermLiabs, canEdit, onOpenClause, onEditInst, onDeleteClause, onEditLiab, onDeleteLiab, onConvertLiab }: {
  clauses: Clause[]; installments: ClauseInstallment[]; clubLiabs: ClubLiability[]; intermLiabs: IntermediaryLiability[]
  canEdit: boolean
  onOpenClause: (clauseId: string) => void
  onEditInst: (id: string) => void
  onDeleteClause: (id: string) => void
  onEditLiab: (kind: 'club' | 'agent', id: string) => void
  onDeleteLiab: (kind: 'club' | 'agent', id: string) => void
  onConvertLiab: (kind: 'club' | 'agent', id: string) => void
}) {
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
                const act: React.CSSProperties = { background: 'none', border: 'none', padding: '2px 6px', fontFamily: font, fontSize: 11, fontWeight: 600, cursor: 'pointer' }
                return (
                  <tr key={i} style={{ background: late ? 'var(--row-late-bg)' : 'transparent' }}>
                    <td style={{ ...td, fontFamily: fontMono, fontSize: 11, color: late ? 'var(--neg)' : 'var(--ink-secondary)', fontWeight: late ? 700 : 400 }}>{it.date ? fmtDate(it.date) : '—'}</td>
                    <td style={{ ...td, fontSize: 12 }}>
                      {it.clauseRef
                        ? <button style={{ background: 'none', border: 'none', padding: 0, color: 'var(--ink-primary)', fontFamily: font, fontSize: 12, cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'rgba(190,140,74,0.5)', textUnderlineOffset: 2 }} onClick={() => onOpenClause(it.clauseRef!)} title="Abrir a obrigação">{it.nat}</button>
                        : it.nat}
                    </td>
                    <td style={{ ...td, fontSize: 12, color: 'var(--text-secondary)' }}>{it.parte}</td>
                    <td style={{ ...td, textAlign: 'center', fontSize: 10, fontFamily: fontMono, color: it.dir === 'A_PAGAR' ? 'var(--neg)' : '#3a6f3a' }}>{it.dir === 'A_PAGAR' ? 'a pagar' : 'a receber'}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: fontMono, fontWeight: 600 }}>{fmtCurrencyShort(it.valor, it.moeda)}</td>
                    <td style={td}><StatusBadge status={it.status} map={PAYMENT_STATUS_STYLE} /></td>
                    {canEdit && (
                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {it.clauseRef && <button style={{ ...act, color: '#be8c4a' }} onClick={() => onOpenClause(it.clauseRef!)} title="Abrir página da obrigação">Abrir</button>}
                        {it.kind === 'inst' && <button style={{ ...act, color: '#be8c4a' }} onClick={() => onEditInst(it.ref)} title="Editar esta parcela">Parcela</button>}
                        {it.kind === 'clause' && <button style={{ ...act, color: 'var(--neg)' }} onClick={() => onDeleteClause(it.ref)}>Excluir</button>}
                        {(it.kind === 'club' || it.kind === 'agent') && <>
                          <button style={{ ...act, color: '#be8c4a' }} onClick={() => onConvertLiab(it.kind as 'club' | 'agent', it.ref)} title="Converter em cláusula com fluxo de parcelas">Converter</button>
                          <button style={{ ...act, color: '#be8c4a' }} onClick={() => onEditLiab(it.kind as 'club' | 'agent', it.ref)}>Editar</button>
                          <button style={{ ...act, color: 'var(--neg)' }} onClick={() => onDeleteLiab(it.kind as 'club' | 'agent', it.ref)}>Excluir</button>
                        </>}
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
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid var(--divider-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontFamily: font, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={save} disabled={saving} style={{ padding: '8px 22px', borderRadius: 7, border: 'none', background: 'var(--ink-primary)', color: 'var(--gold-soft)', fontSize: 12, fontFamily: font, fontWeight: 600, cursor: 'pointer' }}>{saving ? 'Salvando...' : 'Salvar'}</button>
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

function NewClauseModal({ contract, athleteId, initialType, onClose, onSaved }: {
  contract: Contract; athleteId: string; initialType?: ClauseType; onClose: () => void; onSaved: () => void
}) {
  const partiesFor = (t: ClauseType) => PAYABLE_CLAUSE_TYPES.includes(t)
    ? { creditor: contract.counterpart_club || 'Contraparte', debtor: 'Botafogo SAF' }
    : { creditor: 'Botafogo SAF', debtor: contract.counterpart_club || 'Contraparte' }

  const startType: ClauseType = initialType ?? 'SELL_ON_FEE_RECEBER'
  const initialParties = partiesFor(startType)
  const [f, setF] = useState<{
    clause_type: ClauseType; description: string; creditor_party: string; debtor_party: string
    currency: Currency; original_value: string; percentage_value: string; condition_description: string
    due_date: string; installments_total: string; period: NewClausePeriod; notes: string; basis: SellOnBasis
  }>({
    clause_type: startType,
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
          <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(190,140,74,0.10)', border: '1px solid rgba(190,140,74,0.28)', fontFamily: font, fontSize: 12, color: '#8a6a34' }}>
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
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid var(--divider-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontFamily: font, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={save} disabled={saving || !canSave} style={{ padding: '8px 22px', borderRadius: 7, border: 'none', background: canSave ? 'var(--ink-primary)' : 'var(--divider-strong)', color: 'var(--gold-soft)', fontSize: 12, fontFamily: font, fontWeight: 600, cursor: canSave ? 'pointer' : 'not-allowed', opacity: saving ? 0.6 : 1 }}>{saving ? 'Salvando...' : 'Adicionar cláusula'}</button>
        </div>
      </div>
    </div>
  )
}

// ── ClauseFlowModal — gerar/editar o fluxo de pagamento (parcelas) da cláusula ─
// Usa o FlowBuilder para (re)gerar um cronograma regular ou editar parcela a
// parcela. Ao salvar, substitui as parcelas da cláusula e ajusta o total.
function ClauseFlowModal({ clause, athleteId, onClose, onSaved }: {
  clause: Clause; athleteId: string; onClose: () => void; onSaved: () => void
}) {
  const [lines, setLines] = useState<FlowLine[]>([])
  const [currency, setCurrency] = useState<Currency>(clause.currency)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    fetchClauseInstallments(clause.id).then(insts => {
      if (!alive) return
      setLines(insts.map(i => ({ due_date: i.due_date, value: i.original_value })))
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
        await createClauseInstallments(clause.id, athleteId, valid.map((l, i) => ({
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,20,16,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--cream-card)', borderRadius: 12, padding: 26, width: 720, maxWidth: '96vw', maxHeight: '92vh', overflowY: 'auto', border: '1px solid var(--divider)', boxShadow: 'var(--shadow-panel)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-primary)', fontFamily: font }}>Fluxo de pagamento</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: fontMono, marginTop: 3 }}>{CLAUSE_TYPE_LABELS[clause.clause_type]} · {clause.description}</div>
        </div>
        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontFamily: fontMono, fontSize: 12 }}>Carregando parcelas…</div>
        ) : (
          <>
            <FlowBuilder currency={currency} onCurrencyChange={setCurrency} lines={lines} onChange={setLines} defaultFirst={clause.due_date ?? ''} />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: font }}>
              Salvar substitui as parcelas atuais desta cláusula pelo fluxo acima. O total da cláusula passa a ser {fmtCurrencyShort(total, currency)}.
            </div>
          </>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid var(--divider-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontFamily: font, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={save} disabled={saving || loading} style={{ padding: '8px 22px', borderRadius: 7, border: 'none', background: 'var(--ink-primary)', color: 'var(--gold-soft)', fontSize: 12, fontFamily: font, fontWeight: 600, cursor: 'pointer', opacity: (saving || loading) ? 0.6 : 1 }}>{saving ? 'Salvando…' : 'Salvar fluxo'}</button>
        </div>
      </div>
    </div>
  )
}

// ── LiabilityEditModal — editar obrigação com clube/agente (passivo flat) ─────
function LiabilityEditModal({ kind, liab, onClose, onSaved }: {
  kind: 'club' | 'agent'; liab: ClubLiability | IntermediaryLiability; onClose: () => void; onSaved: () => void
}) {
  const isClub = kind === 'club'
  const initialName = isClub ? (liab as ClubLiability).club_name : (liab as IntermediaryLiability).intermediary_name
  const [f, setF] = useState({
    name: initialName,
    description: liab.description ?? '',
    direction: liab.direction,
    amount: liab.amount != null ? String(liab.amount) : '',
    currency: liab.currency,
    due_date: liab.due_date ?? '',
    status: liab.status,
  })
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }))
  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 6, fontSize: 13, background: 'var(--cream-canvas)', border: '1px solid var(--input-border)', color: 'var(--ink-primary)', fontFamily: font, boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontSize: 9, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 3, display: 'block' }
  const cur: Currency[] = ['BRL', 'EUR', 'USD', 'GBP']

  async function save() {
    setSaving(true)
    try {
      const patch = {
        description: f.description || null,
        direction: f.direction,
        amount: f.amount ? parseFloat(f.amount) : 0,
        currency: f.currency,
        due_date: f.due_date || null,
        status: f.status,
      }
      if (isClub) await updateClubLiability(liab.id, { ...patch, club_name: f.name })
      else await updateIntermediaryLiability(liab.id, { ...patch, intermediary_name: f.name })
      onSaved()
    } finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,20,16,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--cream-card)', borderRadius: 12, padding: 26, width: 560, maxWidth: '96vw', maxHeight: '92vh', overflowY: 'auto', border: '1px solid var(--divider)', boxShadow: 'var(--shadow-panel)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-primary)', fontFamily: font }}>Editar obrigação — {isClub ? 'clube' : 'agente'}</div>
        <div><label style={lbl}>{isClub ? 'Clube' : 'Agente'}</label><input style={inp} value={f.name} onChange={e => set('name', e.target.value)} /></div>
        <div><label style={lbl}>Descrição</label><input style={inp} value={f.description} onChange={e => set('description', e.target.value)} placeholder="Descrição da obrigação" /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label style={lbl}>Valor</label><NumberInput style={inp} value={f.amount} onChange={v => set('amount', v)} /></div>
          <div><label style={lbl}>Moeda</label><select style={inp} value={f.currency} onChange={e => set('currency', e.target.value)}>{cur.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          <div><label style={lbl}>Direção</label>
            <select style={inp} value={f.direction} onChange={e => set('direction', e.target.value)}>
              <option value="A_PAGAR">A pagar</option><option value="A_RECEBER">A receber</option>
            </select>
          </div>
          <div><label style={lbl}>Vencimento</label><input style={inp} type="date" value={f.due_date} onChange={e => set('due_date', e.target.value)} /></div>
          <div><label style={lbl}>Status</label>
            <select style={inp} value={f.status} onChange={e => set('status', e.target.value)}>
              {['PENDENTE', 'PAGA', 'EM_ATRASO', 'CANCELADA'].map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: font }}>
          Dica: obrigações de agente com cronograma de parcelas ficam melhores como <strong>contrato de intermediação</strong> (aparecem em Contratos Ativos e permitem fluxo de pagamento). Use "+ Novo Contrato" e escolha "Agentes / Intermediação".
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid var(--divider-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontFamily: font, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={save} disabled={saving} style={{ padding: '8px 22px', borderRadius: 7, border: 'none', background: 'var(--ink-primary)', color: 'var(--gold-soft)', fontSize: 12, fontFamily: font, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}

// ── InstallmentActions — menu ⋯ por parcela (mesmo padrão da cláusula) ────────
function InstallmentActions({ inst, canEdit, onEdit, onPay, onQuickPay, onRevert }: {
  inst: ClauseInstallment; canEdit: boolean; onEdit: () => void; onPay: () => void; onQuickPay: () => void; onRevert: () => void
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  if (!canEdit) return <StatusBadge status={inst.payment_status} map={PAYMENT_STATUS_STYLE} />
  function toggle() {
    const el = btnRef.current
    if (el && !open) { const r = el.getBoundingClientRect(); setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) }) }
    setOpen(o => !o)
  }
  const item: React.CSSProperties = { width: '100%', padding: '8px 16px', textAlign: 'left', background: 'none', border: 'none', fontSize: 12.5, fontFamily: font, cursor: 'pointer', whiteSpace: 'nowrap' }
  const paid = inst.payment_status === 'PAGA'
  const cancelled = inst.payment_status === 'CANCELADA'
  return (
    <>
      <button ref={btnRef} onClick={toggle} aria-label="Ações da parcela"
        style={{ width: 26, height: 24, borderRadius: 5, border: '1px solid var(--divider-strong)', background: open ? 'var(--cream-inset)' : 'transparent', fontSize: 14, lineHeight: 1, fontFamily: font, cursor: 'pointer', color: 'var(--text-secondary)' }}>⋯</button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'fixed', top: pos.top, right: pos.right, background: 'var(--cream-card)', border: '1px solid var(--divider-strong)', borderRadius: 8, padding: '4px 0', boxShadow: 'var(--shadow-panel)', zIndex: 1000, minWidth: 200 }}>
            <button onClick={() => { onEdit(); setOpen(false) }} style={{ ...item, color: 'var(--ink-primary)' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--cream-inset)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>Editar parcela</button>
            {!paid && !cancelled && <button onClick={() => { onQuickPay(); setOpen(false) }} style={{ ...item, color: 'var(--ink-primary)' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--cream-inset)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>Marcar como paga</button>}
            {!paid && !cancelled && <button onClick={() => { onPay(); setOpen(false) }} style={{ ...item, color: 'var(--ink-primary)' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--cream-inset)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>Registrar pagamento…</button>}
            {paid && <button onClick={() => { onRevert(); setOpen(false) }} style={{ ...item, color: 'var(--text-secondary)' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--cream-inset)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>Reverter pagamento</button>}
          </div>
        </>
      )}
    </>
  )
}

// ── InstallmentEditModal — editar uma parcela (venc./valor/moeda/status) ──────
function InstallmentEditModal({ inst, onClose, onSave }: {
  inst: ClauseInstallment; onClose: () => void; onSave: (patch: Partial<ClauseInstallment>) => Promise<void>
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
  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 6, fontSize: 13, background: 'var(--cream-canvas)', border: '1px solid var(--input-border)', color: 'var(--ink-primary)', fontFamily: font, boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontSize: 9, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 3, display: 'block' }
  const cur: Currency[] = ['BRL', 'EUR', 'USD', 'GBP']
  async function save() {
    setSaving(true)
    try {
      await onSave({
        due_date: f.due_date,
        original_value: f.original_value ? parseFloat(f.original_value) : 0,
        currency: f.currency,
        payment_status: f.payment_status,
        payment_date: f.payment_date || null,
        notes: f.notes || null,
      })
    } finally { setSaving(false) }
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,20,16,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--cream-card)', borderRadius: 12, padding: 26, width: 480, maxWidth: '96vw', border: '1px solid var(--divider)', boxShadow: 'var(--shadow-panel)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-primary)', fontFamily: font }}>Editar parcela {inst.installment_number}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label style={lbl}>Vencimento</label><input style={inp} type="date" value={f.due_date} onChange={e => set('due_date', e.target.value)} /></div>
          <div><label style={lbl}>Valor</label><NumberInput style={inp} value={f.original_value} onChange={v => set('original_value', v)} /></div>
          <div><label style={lbl}>Moeda</label><select style={inp} value={f.currency} onChange={e => set('currency', e.target.value)}>{cur.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          <div><label style={lbl}>Status</label>
            <select style={inp} value={f.payment_status} onChange={e => set('payment_status', e.target.value)}>
              {['PENDENTE', 'PAGA', 'EM_ATRASO', 'CANCELADA'].map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div><label style={lbl}>Data pagamento</label><input style={inp} type="date" value={f.payment_date} onChange={e => set('payment_date', e.target.value)} /></div>
        </div>
        <div><label style={lbl}>Observações</label><textarea style={{ ...inp, minHeight: 48, resize: 'vertical' }} value={f.notes} onChange={e => set('notes', e.target.value)} /></div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid var(--divider-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontFamily: font, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={save} disabled={saving} style={{ padding: '8px 22px', borderRadius: 7, border: 'none', background: 'var(--ink-primary)', color: 'var(--gold-soft)', fontSize: 12, fontFamily: font, fontWeight: 600, cursor: 'pointer' }}>{saving ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}

// ── ClauseEditModal — editar uma cláusula ativa ──────────────────────────────
function ClauseEditModal({ clause, onClose, onSave }: {
  clause: Clause; onClose: () => void; onSave: (patch: Partial<Clause>) => Promise<void>
}) {
  const [f, setF] = useState({
    description: clause.description ?? '',
    creditor_party: clause.creditor_party ?? '',
    debtor_party: clause.debtor_party ?? '',
    currency: clause.currency,
    original_value: clause.original_value != null ? String(clause.original_value) : '',
    percentage_value: clause.percentage_value != null ? String(clause.percentage_value) : '',
    condition_description: clause.condition_description ?? '',
    due_date: clause.due_date ?? '',
    payment_status: clause.payment_status,
    achievement_status: clause.achievement_status,
    notes: clause.notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }))
  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 6, fontSize: 13, background: 'var(--cream-canvas)', border: '1px solid var(--input-border)', color: 'var(--ink-primary)', fontFamily: font, boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontSize: 9, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 3, display: 'block' }
  const cur: Currency[] = ['BRL', 'EUR', 'USD', 'GBP']

  async function save() {
    setSaving(true)
    try {
      await onSave({
        description: f.description,
        creditor_party: f.creditor_party,
        debtor_party: f.debtor_party,
        currency: f.currency,
        original_value: f.original_value ? parseFloat(f.original_value) : null,
        percentage_value: f.percentage_value ? parseFloat(f.percentage_value) : null,
        condition_description: f.condition_description || null,
        due_date: f.due_date || null,
        payment_status: f.payment_status,
        achievement_status: f.achievement_status,
        notes: f.notes || null,
      })
    } finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,20,16,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--cream-card)', borderRadius: 12, padding: 26, width: 640, maxWidth: '96vw', maxHeight: '92vh', overflowY: 'auto', border: '1px solid var(--divider)', boxShadow: 'var(--shadow-panel)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-primary)', fontFamily: font }}>Editar cláusula</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: fontMono, marginTop: 3 }}>{CLAUSE_TYPE_LABELS[clause.clause_type] ?? clause.clause_type}{clause.installments_total > 1 ? ` · ${clause.installments_total}x (edite o valor por parcela na tabela)` : ''}</div>
        </div>
        <div><label style={lbl}>Descrição</label><input style={inp} value={f.description} onChange={e => set('description', e.target.value)} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label style={lbl}>Credor</label><input style={inp} value={f.creditor_party} onChange={e => set('creditor_party', e.target.value)} /></div>
          <div><label style={lbl}>Devedor</label><input style={inp} value={f.debtor_party} onChange={e => set('debtor_party', e.target.value)} /></div>
          <div><label style={lbl}>Valor{clause.installments_total > 1 ? ' total' : ''}</label><NumberInput style={inp} value={f.original_value} onChange={v => set('original_value', v)} /></div>
          <div><label style={lbl}>Moeda</label><select style={inp} value={f.currency} onChange={e => set('currency', e.target.value)}>{cur.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          <div><label style={lbl}>Percentual (%)</label><NumberInput style={inp} decimals={2} grouping={false} value={f.percentage_value} onChange={v => set('percentage_value', v)} /></div>
          <div><label style={lbl}>Vencimento</label><input style={inp} type="date" value={f.due_date} onChange={e => set('due_date', e.target.value)} /></div>
          <div><label style={lbl}>Status pagamento</label>
            <select style={inp} value={f.payment_status} onChange={e => set('payment_status', e.target.value)}>
              {['PENDENTE', 'PAGA', 'PARCIALMENTE_PAGA', 'EM_ATRASO', 'CANCELADA'].map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div><label style={lbl}>Atingimento</label>
            <select style={inp} value={f.achievement_status} onChange={e => set('achievement_status', e.target.value)}>
              {['PENDENTE', 'ATINGIDA', 'NAO_ATINGIDA', 'NAO_APLICAVEL'].map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
        </div>
        <div><label style={lbl}>Condição</label><input style={inp} value={f.condition_description} onChange={e => set('condition_description', e.target.value)} /></div>
        <div><label style={lbl}>Observações</label><textarea style={{ ...inp, minHeight: 52, resize: 'vertical' }} value={f.notes} onChange={e => set('notes', e.target.value)} /></div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid var(--divider-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontFamily: font, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={save} disabled={saving} style={{ padding: '8px 22px', borderRadius: 7, border: 'none', background: 'var(--ink-primary)', color: 'var(--gold-soft)', fontSize: 12, fontFamily: font, fontWeight: 600, cursor: 'pointer' }}>{saving ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}

// ── AcordosTab — acordos e renegociações do atleta ──────────────────────────
function AcordosTab({ clauses, installments, canEdit, highlight, onHighlighted, onNew, onEditInst, onPayInst, onQuickPayInst, onRevertInst }: {
  clauses: Clause[]; installments: ClauseInstallment[]; canEdit: boolean
  highlight?: string | null; onHighlighted?: () => void
  onNew: () => void
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
        {canEdit && <button onClick={onNew} style={{ padding: '8px 16px', background: 'var(--ink-primary)', border: 'none', borderRadius: 8, color: 'var(--gold-soft)', fontFamily: font, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>+ Nova renegociação</button>}
      </div>

      {acordos.length === 0 && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontFamily: font }}>Nenhum acordo registrado.</div>
      )}

      {acordos.map(ac => {
        const meta = decodeAcordo(ac.notes)
        const parc = installments.filter(i => i.clause_id === ac.id).sort((a, b) => a.installment_number - b.installment_number)
        const paidCount = parc.filter(p => p.payment_status === 'PAGA').length
        const isHi = highlight === ac.id
        return (
          <div key={ac.id} id={`acordo-${ac.id}`} className="card" style={{ padding: '18px 20px', border: isHi ? '1px solid var(--gold-ring)' : undefined, boxShadow: isHi ? '0 0 0 3px rgba(190,140,74,0.20)' : undefined, transition: 'box-shadow 0.4s, border-color 0.4s' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-primary)', fontFamily: font }}>{meta?.creditor ?? ac.creditor_party}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: fontMono }}>{meta ? `acordado em ${fmtDate(meta.createdAt)}` : ''}</div>
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
                  <button onClick={generateSchedule} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(190,140,74,0.4)', background: 'rgba(190,140,74,0.08)', color: '#be8c4a', fontSize: 11, fontFamily: font, fontWeight: 600, cursor: 'pointer' }}>Gerar fluxo</button>
                  <button onClick={addSchedRow} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--divider-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 11, fontFamily: font, cursor: 'pointer' }}>+ Linha</button>
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
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid var(--divider-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontFamily: font, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={submit} disabled={!canSave || saving} style={{ padding: '8px 22px', borderRadius: 7, border: 'none', background: canSave ? 'var(--ink-primary)' : '#ccc', color: 'var(--gold-soft)', fontSize: 12, fontFamily: font, fontWeight: 600, cursor: canSave ? 'pointer' : 'not-allowed' }}>{saving ? 'Renegociando...' : 'Renegociar'}</button>
        </div>
      </div>
    </div>
  )
}

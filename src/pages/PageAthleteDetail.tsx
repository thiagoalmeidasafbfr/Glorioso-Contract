import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import ImageUpload from '../components/ImageUpload'
import RemunerationChart from '../components/RemunerationChart'
import OwnershipBar from '../components/OwnershipBar'
import PaymentModal from '../components/athletes/PaymentModal'
import {
  fetchAthlete, updateAthlete, fetchAthleteContracts, fetchAthleteClauses,
  fetchAthleteAlerts, markAlertRead, updateClause,
  fetchAthleteEconomicRights, createEconomicRight, deleteEconomicRight,
  fetchAthleteSalaryTriggers, createSalaryTrigger, markTriggerAchieved, resetTrigger, deleteSalaryTrigger,
  fetchAthleteClubLiabilities, fetchAthleteIntermediaryLiabilities,
} from '../lib/athleteQueries'
import { fmtDate, fmtCurrencyShort, fmtRelative, isOverdue, isDueSoon, todayISO, CURRENCY_SYMBOLS } from '../lib/format'
import type {
  Athlete, Contract, Clause, Alert, EconomicRight,
  SalaryTrigger, ClubLiability, IntermediaryLiability,
  AthleteStatus, AchievementStatus, Currency, HolderType,
  TriggerMetric, NewSalaryTriggerInput, NewEconomicRightInput,
} from '../types/athlete-system'
import {
  CLAUSE_TYPE_LABELS, CONTRACT_TYPE_LABELS, HOLDER_TYPE_LABELS,
  TRIGGER_METRIC_LABELS, TRIGGER_STATUS_LABELS, LIABILITY_DIRECTION_LABELS,
} from '../types/athlete-system'
import { sumOwnership, isOwnershipValid, sortRights } from '../lib/ownership'
import { effectiveSalary } from '../lib/salary'
import { useAuth } from '../context/AuthContext'

const font     = "'Inter', system-ui, sans-serif"
const fontMono = "'IBM Plex Mono', 'JetBrains Mono', monospace"

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
const TRIGGER_STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  PENDENTE:     { bg: 'rgba(59,130,246,0.12)', fg: '#1d4ed8' },
  ATINGIDA:     { bg: '#dcf0e4', fg: '#166534' },
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

// ── Menu de ações da cláusula (posição fixa p/ não ser cortado) ─────────────
function ClauseActions({ clause, onMarkAchieved, onPay, onCancel }: {
  clause: Clause; onMarkAchieved: () => void; onPay: () => void; onCancel: () => void
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
            {canAchieve && <button onClick={() => { onMarkAchieved(); setOpen(false) }} style={{ ...item, color: 'var(--ink-primary)' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--cream-inset)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>Marcar como atingida</button>}
            {canPay && <button onClick={() => { onPay(); setOpen(false) }} style={{ ...item, color: 'var(--ink-primary)' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--cream-inset)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>Registrar pagamento</button>}
            {canCancel && <button onClick={() => { onCancel(); setOpen(false) }} style={{ ...item, color: 'var(--neg)' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--neg-tint)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>Cancelar cláusula</button>}
            {!canAchieve && !canPay && !canCancel && <div style={{ ...item, color: 'var(--text-muted)', cursor: 'default' }}>Sem ações disponíveis</div>}
          </div>
        </>
      )}
    </>
  )
}

function NewTriggerForm({ contract, onAdd }: { contract: Contract; onAdd: (input: NewSalaryTriggerInput) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState<NewSalaryTriggerInput>({ contract_id: contract.id, description: '', metric: 'JOGOS', threshold: null, new_salary: 0, currency: contract.salary_currency, notes: '' })
  const set = <K extends keyof NewSalaryTriggerInput>(k: K, v: NewSalaryTriggerInput[K]) => setF(prev => ({ ...prev, [k]: v }))
  const inp: React.CSSProperties = { padding: '7px 9px', borderRadius: 6, fontSize: 12, width: '100%', boxSizing: 'border-box', background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--input-color)', fontFamily: font }
  const lbl: React.CSSProperties = { fontSize: 9, fontFamily: fontMono, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 3, display: 'block' }
  if (!open) return <button onClick={() => setOpen(true)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px dashed rgba(190,140,74,0.45)', background: 'rgba(190,140,74,0.08)', color: '#be8c4a', fontSize: 12, fontFamily: font, fontWeight: 600, cursor: 'pointer' }}>+ Nova Meta de Salário</button>
  async function submit() {
    if (!f.description.trim() || !f.new_salary) return
    await onAdd({ ...f, contract_id: contract.id })
    setF({ contract_id: contract.id, description: '', metric: 'JOGOS', threshold: null, new_salary: 0, currency: contract.salary_currency, notes: '' })
    setOpen(false)
  }
  return (
    <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, border: '1px solid rgba(190,140,74,0.30)' }}>
      <div style={{ fontSize: 10, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#be8c4a', fontWeight: 600 }}>Nova Meta de Aumento Salarial</div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
        <div><label style={lbl}>Descrição *</label><input style={inp} value={f.description} onChange={e => set('description', e.target.value)} placeholder="Ex: Ao atingir 10 jogos, salário sobe" /></div>
        <div><label style={lbl}>Métrica</label><select style={inp} value={f.metric} onChange={e => set('metric', e.target.value as TriggerMetric)}>{(Object.keys(TRIGGER_METRIC_LABELS) as TriggerMetric[]).map(m => <option key={m} value={m}>{TRIGGER_METRIC_LABELS[m]}</option>)}</select></div>
        <div><label style={lbl}>Meta (nº)</label><input style={inp} type="number" value={f.threshold ?? ''} onChange={e => set('threshold', e.target.value ? Number(e.target.value) : null)} placeholder="Ex: 10" /></div>
        <div><label style={lbl}>Novo salário CLT *</label><input style={inp} type="number" value={f.new_salary || ''} onChange={e => set('new_salary', Number(e.target.value) || 0)} placeholder="Ex: 300000" /></div>
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 14px', borderRadius: 8, background: achieved ? '#dcf0e4' : 'var(--bg-subtle)', border: `1px solid ${achieved ? 'rgba(22,101,52,0.25)' : 'var(--divider-soft)'}` }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-primary)', fontFamily: font }}>{t.description}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: fontMono, marginTop: 2 }}>{TRIGGER_METRIC_LABELS[t.metric]}{t.threshold != null ? ` ≥ ${t.threshold}` : ''} → {fmtCurrencyShort(t.new_salary, t.currency)}{t.notes ? ` · ${t.notes}` : ''}</div>
      </div>
      <span style={{ padding: '2px 8px', borderRadius: 5, fontSize: 9, fontWeight: 600, fontFamily: fontMono, letterSpacing: '0.10em', textTransform: 'uppercase', background: TRIGGER_STATUS_STYLE[t.status].bg, color: TRIGGER_STATUS_STYLE[t.status].fg }}>{TRIGGER_STATUS_LABELS[t.status]}</span>
      {achieved ? (
        <>
          <span style={{ fontSize: 11, fontFamily: fontMono, color: '#166534' }}>desde {fmtDate(t.achieved_date)}</span>
          {canEdit && <button onClick={onReset} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--divider-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 11, fontFamily: font, cursor: 'pointer' }}>Reverter</button>}
        </>
      ) : canEdit ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ padding: '5px 8px', borderRadius: 6, fontSize: 12, background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--input-color)', fontFamily: fontMono }} />
          <button onClick={() => onMark(date)} style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: '#166534', color: '#fff', fontSize: 11, fontFamily: font, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>✓ Meta atingida</button>
        </div>
      ) : null}
      {canEdit && <button onClick={onDelete} title="Remover meta" style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--divider-strong)', background: 'transparent', color: 'var(--neg)', fontSize: 12, cursor: 'pointer', lineHeight: 1 }}>✕</button>}
    </div>
  )
}

// ── Modal de edição do atleta (dados + titularidade econômica) ──────────────
interface RightRow { id?: string; holder_type: HolderType; holder_name: string; percentage: string; notes: string }

function EditAthleteModal({ athlete, rights, onClose, onSaved }: { athlete: Athlete; rights: EconomicRight[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    full_name: athlete.full_name, short_name: athlete.short_name, position: athlete.position ?? '',
    current_status: athlete.current_status, nationality: athlete.nationality ?? '', birth_date: athlete.birth_date ?? '',
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
        position: f.position || null, current_status: f.current_status,
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
          {field('Nacionalidade', 'nationality')}
          {field('Nascimento', 'birth_date', 'date')}
          {field('CPF', 'cpf')}
          {field('Passaporte', 'passport_number')}
        </div>
        <div><label style={lbl}>Observações</label><textarea style={{ ...inp, minHeight: 52, resize: 'vertical' }} value={f.notes} onChange={e => set('notes', e.target.value)} /></div>

        {/* Titularidade econômica */}
        <div style={{ borderTop: '1px solid var(--divider)', paddingTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold-deep)' }}>Titularidade econômica</div>
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

type Tab = 'salario' | 'clausulas' | 'historico' | 'passivos' | 'alertas'
const TABS: { id: Tab; label: string }[] = [
  { id: 'salario',   label: 'Salários & Imagem' },
  { id: 'clausulas', label: 'Cláusulas Ativas' },
  { id: 'historico', label: 'Histórico' },
  { id: 'passivos',  label: 'Passivos' },
  { id: 'alertas',   label: 'Alertas' },
]

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
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('salario')
  const [payClauseId, setPayClauseId] = useState<string | null>(null)
  const [showEdit, setShowEdit] = useState(false)

  const loadData = useCallback(async () => {
    if (!id) return
    setLoading(true)
    const [ath, contr, cls, alrt, rght, trg, clb, itm] = await Promise.all([
      fetchAthlete(id), fetchAthleteContracts(id), fetchAthleteClauses(id), fetchAthleteAlerts(id),
      fetchAthleteEconomicRights(id), fetchAthleteSalaryTriggers(id),
      fetchAthleteClubLiabilities(id), fetchAthleteIntermediaryLiabilities(id),
    ])
    setAthlete(ath); setContracts(contr); setClauses(cls); setAlerts(alrt)
    setRights(rght); setTriggers(trg); setClubLiabs(clb); setIntermLiabs(itm)
    setLoading(false)
  }, [id])
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

  async function handleMarkAchieved(clauseId: string) { const u = await updateClause(clauseId, { achievement_status: 'ATINGIDA', achievement_date: todayISO() }); setClauses(prev => prev.map(c => c.id === clauseId ? u : c)) }
  async function handleCancelClause(clauseId: string) { const u = await updateClause(clauseId, { payment_status: 'CANCELADA' }); setClauses(prev => prev.map(c => c.id === clauseId ? u : c)) }
  async function handleClausePayment(clauseId: string, p: { date: string; valueCurrency: number; valueBRL: number; rate: number; notes: string }) {
    const u = await updateClause(clauseId, { payment_status: 'PAGA', payment_date: p.date, amount_paid_currency: p.valueCurrency, amount_paid_brl: p.valueBRL, exchange_rate: p.rate, notes: p.notes })
    setClauses(prev => prev.map(c => c.id === clauseId ? u : c)); setPayClauseId(null)
  }
  async function handleAddTrigger(input: NewSalaryTriggerInput) { if (!id) return; const c = await createSalaryTrigger(id, input); setTriggers(prev => [...prev, c]) }
  async function handleMarkTrigger(tid: string, date: string) { const u = await markTriggerAchieved(tid, date); setTriggers(prev => prev.map(t => t.id === tid ? u : t)) }
  async function handleResetTrigger(tid: string) { const u = await resetTrigger(tid); setTriggers(prev => prev.map(t => t.id === tid ? u : t)) }
  async function handleDeleteTrigger(tid: string) { await deleteSalaryTrigger(tid); setTriggers(prev => prev.filter(t => t.id !== tid)) }
  async function handlePhoto(url: string | null) { if (!id) return; const u = await updateAthlete(id, { profile_photo_url: url }); setAthlete(u) }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', fontFamily: fontMono, color: 'var(--text-muted)', fontSize: 12, letterSpacing: '0.14em' }}>CARREGANDO...</div>
  if (!athlete) return (
    <div style={{ padding: 40, textAlign: 'center', fontFamily: font }}>
      <div style={{ fontSize: 16, color: 'var(--text-muted)' }}>Atleta não encontrado.</div>
      <button onClick={() => navigate('/atletas')} style={{ marginTop: 16, padding: '8px 20px', borderRadius: 7, border: '1px solid var(--divider-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, fontFamily: font, cursor: 'pointer' }}>← Voltar</button>
    </div>
  )

  const st = ATHLETE_STATUS_STYLE[athlete.current_status]
  const th: React.CSSProperties = { padding: '8px 12px', fontSize: 9, fontWeight: 500, textTransform: 'uppercase', background: 'var(--tbl-head)', color: 'var(--ink-secondary)', borderBottom: '1px solid var(--divider-strong)', fontFamily: fontMono, letterSpacing: '0.14em', whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1 }
  const td: React.CSSProperties = { padding: '10px 12px', fontSize: 12, color: 'var(--ink-primary)', fontFamily: font, borderBottom: '1px solid var(--divider-soft)', verticalAlign: 'middle' }
  const payClause = payClauseId ? clauses.find(c => c.id === payClauseId) ?? null : null

  const emp = employmentContract(contracts)
  const empTriggers = emp ? triggers.filter(t => t.contract_id === emp.id || t.contract_id === null) : []
  const sortedRights = sortRights(rights)

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1400, margin: '0 auto' }}>
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
              {unreadCrit > 0 && <span onClick={() => setTab('alertas')} style={{ padding: '3px 9px', borderRadius: 5, background: 'var(--neg-tint)', color: 'var(--neg)', fontSize: 10, fontWeight: 600, fontFamily: fontMono, cursor: 'pointer' }}>{unreadCrit} {unreadCrit === 1 ? 'crítico' : 'críticos'}</span>}
              {warnCount > 0 && <span onClick={() => setTab('alertas')} style={{ padding: '3px 9px', borderRadius: 5, background: 'var(--warn-tint)', color: 'var(--warn)', fontSize: 10, fontWeight: 600, fontFamily: fontMono, cursor: 'pointer' }}>{warnCount} atenção</span>}
            </div>
            <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-secondary)', fontFamily: font }}>
              {athlete.position && <span><LabelSpan>Posição</LabelSpan> {athlete.position}</span>}
              {athlete.nationality && <span><LabelSpan>Nacionalidade</LabelSpan> {athlete.nationality}</span>}
              {athlete.birth_date && <span><LabelSpan>Nasc.</LabelSpan> {fmtDate(athlete.birth_date)}</span>}
            </div>
            {athlete.notes && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-subtle)', borderLeft: '2px solid var(--gold-ring)', borderRadius: 4, padding: '7px 12px', fontFamily: font }}>{athlete.notes}</div>}

            {/* Titularidade compacta */}
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontFamily: fontMono, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Titularidade econômica</span>
                {rights.length > 0 && (
                  <span style={{ fontFamily: fontMono, fontSize: 10, color: isOwnershipValid(rights) ? 'var(--pos)' : 'var(--neg)' }}>
                    {isOwnershipValid(rights) ? 'Total 100%' : `⚠ ${sumOwnership(rights).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`}
                  </span>
                )}
              </div>
              {rights.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: font }}>Não cadastrada{canEdit ? ' — use “Editar”.' : '.'}</div>
              ) : (
                <>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 5 }}>
                    {sortedRights.map(r => (
                      <span key={r.id} style={{ fontSize: 11, fontFamily: font, color: 'var(--text-secondary)' }}>
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
            {canEdit && <button onClick={() => setShowEdit(true)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--divider-strong)', borderRadius: 8, color: 'var(--text-secondary)', fontFamily: font, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Editar</button>}
            <Link to={`/atletas/${athlete.id}/contratos/novo`} style={{ padding: '8px 16px', background: 'var(--ink-primary)', border: 'none', borderRadius: 8, color: 'var(--gold-soft)', fontFamily: font, fontSize: 12, fontWeight: 600, textDecoration: 'none', display: 'inline-block' }}>+ Novo Vínculo</Link>
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

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--divider)', marginBottom: 16 }}>
        {TABS.map(t => {
          const count = t.id === 'alertas' ? alerts.filter(a => !a.is_read).length : 0
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '10px 18px', border: 'none', background: 'none', fontFamily: font, fontSize: 13, fontWeight: tab === t.id ? 600 : 400, cursor: 'pointer', color: tab === t.id ? '#be8c4a' : 'var(--text-secondary)', borderBottom: tab === t.id ? '2px solid #be8c4a' : '2px solid transparent', marginBottom: -2, display: 'flex', alignItems: 'center', gap: 6 }}>
              {t.label}
              {count > 0 && <span style={{ padding: '1px 6px', borderRadius: 10, background: 'var(--neg-tint)', color: 'var(--neg)', fontSize: 9, fontFamily: fontMono }}>{count}</span>}
            </button>
          )
        })}
      </div>

      {/* Salários & Imagem */}
      {tab === 'salario' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!emp ? (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontFamily: font }}>
              Nenhum vínculo de trabalho com remuneração cadastrado. Crie um vínculo (ENTRADA) com salário base para gerenciar a remuneração.
            </div>
          ) : (() => {
            const eff = effectiveSalary(emp, empTriggers)
            const salaryNow = eff.amount ?? 0
            const image = emp.image_value ?? 0
            const other = emp.other_value ?? 0
            const total = salaryNow + image + other
            const card = (label: string, val: string, hi?: boolean) => (
              <div style={{ padding: '12px 16px', borderRadius: 8, background: hi ? '#dcf0e4' : 'var(--bg-subtle)', border: `1px solid ${hi ? 'rgba(22,101,52,0.25)' : 'var(--divider-soft)'}` }}>
                <div style={{ fontSize: 9, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: hi ? '#166534' : 'var(--text-muted)', marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: 19, fontWeight: 700, fontFamily: fontMono, color: hi ? '#166534' : 'var(--ink-primary)' }}>{val}</div>
              </div>
            )
            return (
              <div className="card" style={{ padding: '18px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-primary)', fontFamily: font }}>Remuneração — paga pelo Botafogo</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: fontMono }}>
                    Vínculo {fmtDate(emp.start_date)}{emp.end_date ? ` → ${fmtDate(emp.end_date)}` : ''} · origem: {emp.counterpart_club}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 }}>
                  {card('Salário CLT (hoje)', fmtCurrencyShort(salaryNow, emp.salary_currency), eff.source !== null)}
                  {card('Direito de imagem', fmtCurrencyShort(image, emp.salary_currency))}
                  {card('Outros (moradia/aux.)', fmtCurrencyShort(other, emp.salary_currency))}
                  {card('Remuneração total/mês', fmtCurrencyShort(total, emp.salary_currency), true)}
                </div>

                <div style={{ marginBottom: 8, fontSize: 10, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Evolução da remuneração</div>
                <RemunerationChart contract={emp} triggers={empTriggers} />

                <div style={{ margin: '20px 0 10px', fontSize: 10, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Metas de aumento salarial</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                  {empTriggers.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: font }}>Nenhuma meta cadastrada.</div>
                    : empTriggers.map(t => <TriggerRow key={t.id} t={t} canEdit={canEdit} onMark={d => handleMarkTrigger(t.id, d)} onReset={() => handleResetTrigger(t.id)} onDelete={() => handleDeleteTrigger(t.id)} />)}
                </div>
                {canEdit && <NewTriggerForm contract={emp} onAdd={handleAddTrigger} />}
              </div>
            )
          })()}
        </div>
      )}

      {/* Cláusulas Ativas */}
      {tab === 'clausulas' && (
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
                {clauses.length === 0 && <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Nenhuma cláusula cadastrada.</td></tr>}
                {clauses.map(c => {
                  const overdue = isOverdue(c.due_date, c.payment_status); const soon = isDueSoon(c.due_date, c.payment_status)
                  return (
                    <tr key={c.id} style={{ background: overdue ? 'var(--row-late-bg)' : soon ? 'var(--warn-tint)' : 'transparent' }}>
                      <td style={td}><span style={{ fontSize: 10, fontFamily: fontMono, fontWeight: 600, color: 'var(--text-muted)' }}>{CLAUSE_TYPE_LABELS[c.clause_type]}</span></td>
                      <td style={{ ...td, maxWidth: 280 }}>
                        <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.description}</div>
                        {c.condition_description && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.condition_description}</div>}
                      </td>
                      <td style={{ ...td, fontSize: 11, color: 'var(--text-secondary)', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.creditor_party}</td>
                      <td style={{ ...td, fontSize: 11, color: 'var(--text-secondary)', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.debtor_party}</td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: fontMono, fontWeight: 500 }}>{c.original_value ? fmtCurrencyShort(c.original_value, c.currency) : c.percentage_value ? `${c.percentage_value}%` : '—'}</td>
                      <td style={td}><StatusBadge status={c.achievement_status} map={ACHIEVEMENT_STATUS_STYLE} /></td>
                      <td style={td}><StatusBadge status={c.payment_status} map={PAYMENT_STATUS_STYLE} /></td>
                      <td style={{ ...td, fontFamily: fontMono, fontSize: 11, color: overdue ? 'var(--neg)' : soon ? 'var(--warn)' : 'var(--ink-secondary)', fontWeight: overdue ? 700 : 400 }}>{c.due_date ? fmtDate(c.due_date) : '—'}{(overdue || soon) && <div style={{ fontSize: 9 }}>{fmtRelative(c.due_date)}</div>}</td>
                      <td style={td}><ClauseActions clause={c} onMarkAchieved={() => handleMarkAchieved(c.id)} onPay={() => setPayClauseId(c.id)} onCancel={() => handleCancelClause(c.id)} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Histórico */}
      {tab === 'historico' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {contracts.length === 0 && <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontFamily: font }}>Nenhum vínculo cadastrado.</div>}
          {contracts.map(ct => {
            const ctClauses = clauses.filter(c => c.contract_id === ct.id)
            const typeStyle: Record<string, { bg: string; fg: string }> = { ENTRADA: { bg: '#dcf0e4', fg: '#166534' }, SAIDA: { bg: 'rgba(59,130,246,0.12)', fg: '#1d4ed8' }, EMPRESTIMO_SAIDA: { bg: 'rgba(190,140,74,0.15)', fg: '#7a6244' }, EMPRESTIMO_ENTRADA: { bg: 'rgba(168,85,247,0.12)', fg: '#7c3aed' } }
            const ts = typeStyle[ct.type] ?? { bg: '#eee', fg: '#333' }
            return (
              <div key={ct.id} className="card" style={{ padding: '18px 22px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ padding: '3px 8px', borderRadius: 5, background: ts.bg, color: ts.fg, fontSize: 9, fontWeight: 700, fontFamily: fontMono, letterSpacing: '0.10em', textTransform: 'uppercase' }}>{CONTRACT_TYPE_LABELS[ct.type]}</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-primary)', fontFamily: font }}>{ct.counterpart_club}</span>
                  {ct.counterpart_country && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{ct.counterpart_country}</span>}
                  <StatusBadge status={ct.status} map={{ ATIVO: { bg: '#dcf0e4', fg: '#166534' }, ENCERRADO: { bg: 'rgba(156,163,175,0.18)', fg: '#6b7280' }, RESCINDIDO: { bg: 'var(--neg-tint)', fg: 'var(--neg)' } }} />
                </div>
                <div style={{ display: 'flex', gap: 20, fontSize: 12, color: 'var(--text-secondary)', fontFamily: font, flexWrap: 'wrap' }}>
                  <span>Início: {fmtDate(ct.start_date)}</span>
                  {ct.end_date && <span>Fim: {fmtDate(ct.end_date)}</span>}
                  {ct.transfer_fee_gross && <span style={{ fontWeight: 600, color: 'var(--ink-primary)' }}>{CURRENCY_SYMBOLS[ct.transfer_currency]} {ct.transfer_fee_gross.toLocaleString('pt-BR')}</span>}
                  <span style={{ color: 'var(--text-muted)' }}>{ctClauses.length} cláusula{ctClauses.length !== 1 ? 's' : ''}</span>
                </div>
                {ct.description && <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)', fontFamily: font }}>{ct.description}</div>}
              </div>
            )
          })}
        </div>
      )}

      {/* Passivos */}
      {tab === 'passivos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 9, fontFamily: fontMono, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Passivos com Clubes</div>
              <Link to="/clubes" style={{ fontSize: 11, color: '#be8c4a', fontFamily: font, textDecoration: 'none' }}>Gerenciar →</Link>
            </div>
            {clubLiabs.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: font }}>Nenhum passivo com clube.</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {clubLiabs.map(l => (
                  <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 12px', borderRadius: 7, background: 'var(--bg-subtle)', border: '1px solid var(--divider-soft)' }}>
                    <span style={{ fontWeight: 600, fontFamily: font, fontSize: 13 }}>{l.club_name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: font, flex: 1 }}>{l.description ?? ''}</span>
                    <span style={{ fontSize: 10, fontFamily: fontMono, color: 'var(--text-secondary)' }}>{LIABILITY_DIRECTION_LABELS[l.direction]}</span>
                    <span style={{ fontFamily: fontMono, fontWeight: 600, fontSize: 13 }}>{fmtCurrencyShort(l.amount, l.currency)}</span>
                    {l.due_date && <span style={{ fontSize: 11, fontFamily: fontMono, color: isOverdue(l.due_date, l.status) ? 'var(--neg)' : 'var(--text-muted)' }}>{fmtDate(l.due_date)}</span>}
                    <StatusBadge status={l.status} map={PAYMENT_STATUS_STYLE} />
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="card" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 9, fontFamily: fontMono, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Agentes</div>
              <Link to="/intermediarios" style={{ fontSize: 11, color: '#be8c4a', fontFamily: font, textDecoration: 'none' }}>Gerenciar →</Link>
            </div>
            {intermLiabs.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: font }}>Nenhum passivo com agente.</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {intermLiabs.map(l => (
                  <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 12px', borderRadius: 7, background: 'var(--bg-subtle)', border: '1px solid var(--divider-soft)' }}>
                    <span style={{ fontWeight: 600, fontFamily: font, fontSize: 13 }}>{l.intermediary_name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: font, flex: 1 }}>{l.description ?? ''}</span>
                    <span style={{ fontSize: 10, fontFamily: fontMono, color: 'var(--text-secondary)' }}>{LIABILITY_DIRECTION_LABELS[l.direction]}</span>
                    <span style={{ fontFamily: fontMono, fontWeight: 600, fontSize: 13 }}>{fmtCurrencyShort(l.amount, l.currency)}</span>
                    {l.due_date && <span style={{ fontSize: 11, fontFamily: fontMono, color: isOverdue(l.due_date, l.status) ? 'var(--neg)' : 'var(--text-muted)' }}>{fmtDate(l.due_date)}</span>}
                    <StatusBadge status={l.status} map={PAYMENT_STATUS_STYLE} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Alertas */}
      {tab === 'alertas' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {alerts.length === 0 && <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontFamily: font }}>Nenhum alerta.</div>}
          {alerts.map(al => {
            const sevStyle: Record<string, { bg: string; fg: string; border: string }> = { RED: { bg: 'var(--neg-tint)', fg: 'var(--neg)', border: 'rgba(185,28,28,0.20)' }, YELLOW: { bg: 'var(--warn-tint)', fg: 'var(--warn)', border: 'rgba(184,138,42,0.25)' }, GREEN: { bg: '#dcf0e4', fg: '#166534', border: 'rgba(22,101,52,0.20)' } }
            const ss = sevStyle[al.severity]
            return (
              <div key={al.id} style={{ background: ss.bg, border: `1px solid ${ss.border}`, borderLeft: `3px solid ${ss.fg}`, borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 12, opacity: al.is_read ? 0.55 : 1 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: al.is_read ? 400 : 600, color: ss.fg, fontFamily: font }}>{al.message}</div>
                  <div style={{ fontSize: 10, color: ss.fg, opacity: 0.65, marginTop: 3, fontFamily: fontMono }}>{fmtDate(al.created_at)}</div>
                </div>
                {!al.is_read && <button onClick={() => { markAlertRead(al.id); setAlerts(prev => prev.map(a => a.id === al.id ? { ...a, is_read: true } : a)) }} style={{ padding: '3px 8px', borderRadius: 5, border: `1px solid ${ss.border}`, background: 'transparent', fontSize: 10, fontFamily: font, cursor: 'pointer', color: ss.fg, flexShrink: 0 }}>Marcar lido</button>}
              </div>
            )
          })}
        </div>
      )}

      {payClause && <PaymentModal label={payClause.description} currency={payClause.currency} value={payClause.original_value ?? 0} onClose={() => setPayClauseId(null)} onSave={p => handleClausePayment(payClause.id, p)} />}
      {showEdit && athlete && <EditAthleteModal athlete={athlete} rights={rights} onClose={() => setShowEdit(false)} onSaved={() => { setShowEdit(false); loadData() }} />}
    </div>
  )
}

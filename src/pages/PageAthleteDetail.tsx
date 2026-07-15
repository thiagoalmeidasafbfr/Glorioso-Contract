import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import ImageUpload from '../components/ImageUpload'
import {
  fetchAthlete, updateAthlete, fetchAthleteContracts, fetchAthleteClauses,
  fetchAthleteInstallments, fetchAthleteAlerts, markAlertRead,
  updateClause, registerInstallmentPayment,
  fetchAthleteEconomicRights, createEconomicRight, updateEconomicRight, deleteEconomicRight,
  fetchAthleteSalaryTriggers, createSalaryTrigger, markTriggerAchieved, resetTrigger, deleteSalaryTrigger,
  fetchAthleteClubLiabilities, fetchAthleteIntermediaryLiabilities, fetchAthleteImageRights,
} from '../lib/athleteQueries'
import { fmtDate, fmtCurrencyShort, fmtCurrencyFull, fmtRelative, isOverdue, isDueSoon, todayISO, CURRENCY_SYMBOLS } from '../lib/format'
import type {
  Athlete, Contract, Clause, ClauseInstallment, Alert, EconomicRight,
  SalaryTrigger, ClubLiability, IntermediaryLiability, ImageRight,
  AthleteStatus, AchievementStatus, Currency, HolderType,
  TriggerMetric, NewSalaryTriggerInput,
} from '../types/athlete-system'
import {
  CLAUSE_TYPE_LABELS, CONTRACT_TYPE_LABELS, HOLDER_TYPE_LABELS,
  TRIGGER_METRIC_LABELS, TRIGGER_STATUS_LABELS, LIABILITY_DIRECTION_LABELS,
} from '../types/athlete-system'
import { sumOwnership, isOwnershipValid } from '../lib/ownership'
import { effectiveSalary } from '../lib/salary'
import { useAuth } from '../context/AuthContext'
import OwnershipBar from '../components/OwnershipBar'
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

// Rótulo em caixa-alta discreto para pares label/valor no cabeçalho.
function LabelSpan({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontFamily: fontMono, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginRight: 2 }}>
      {children}
    </span>
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

type Tab = 'salario' | 'clausulas' | 'vinculos' | 'parcelas' | 'passivos' | 'alertas'

const TABS: { id: Tab; label: string }[] = [
  { id: 'salario',   label: 'Salário & Metas' },
  { id: 'clausulas', label: 'Cláusulas Ativas' },
  { id: 'vinculos',  label: 'Vínculos / Histórico' },
  { id: 'parcelas',  label: 'Parcelas' },
  { id: 'passivos',  label: 'Passivos & Imagem' },
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
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)

  function toggle() {
    const el = btnRef.current
    if (el && !open) {
      const r = el.getBoundingClientRect()
      // Menu ancorado ABAIXO do botão, alinhado à direita — posição fixed para
      // não ser cortado por overflow do card/tabela (bug relatado).
      setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) })
    }
    setOpen(o => !o)
  }

  const item: React.CSSProperties = {
    width: '100%', padding: '9px 16px', textAlign: 'left', background: 'none',
    border: 'none', fontSize: 12.5, fontFamily: font, cursor: 'pointer', whiteSpace: 'nowrap',
  }
  const canPay = clause.payment_status !== 'PAGA' && clause.payment_status !== 'CANCELADA' && !!clause.original_value
  const canAchieve = clause.achievement_status === 'PENDENTE'
  const canCancel = clause.payment_status !== 'CANCELADA'

  return (
    <>
      <button ref={btnRef} onClick={toggle} aria-label="Ações"
        style={{ width: 28, height: 26, borderRadius: 6, border: '1px solid var(--divider-strong)', background: open ? 'var(--cream-inset)' : 'transparent', fontSize: 15, lineHeight: 1, fontFamily: font, cursor: 'pointer', color: 'var(--text-secondary)' }}>
        ⋯
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'fixed', top: pos.top, right: pos.right,
            background: 'var(--cream-card)', border: '1px solid var(--divider-strong)',
            borderRadius: 8, padding: '4px 0', boxShadow: 'var(--shadow-panel)', zIndex: 1000, minWidth: 210,
          }}>
            {canAchieve && (
              <button onClick={() => { onMarkAchieved(); setOpen(false) }} style={{ ...item, color: 'var(--ink-primary)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--cream-inset)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                Marcar como atingida
              </button>
            )}
            {canPay && (
              <button onClick={() => { onPay(); setOpen(false) }} style={{ ...item, color: 'var(--ink-primary)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--cream-inset)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                Registrar pagamento
              </button>
            )}
            {canCancel && (
              <button onClick={() => { onCancel(); setOpen(false) }} style={{ ...item, color: 'var(--neg)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--neg-tint)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                Cancelar cláusula
              </button>
            )}
            {!canAchieve && !canPay && !canCancel && (
              <div style={{ ...item, color: 'var(--text-muted)', cursor: 'default' }}>Sem ações disponíveis</div>
            )}
          </div>
        </>
      )}
    </>
  )
}

// ── New Salary Trigger form ─────────────────────────────────────────────────

function NewTriggerForm({ contracts, onAdd }: {
  contracts: Contract[]
  onAdd: (input: NewSalaryTriggerInput) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState<NewSalaryTriggerInput>({
    contract_id: contracts[0]?.id ?? null,
    description: '', metric: 'JOGOS', threshold: null,
    new_salary: 0, currency: 'BRL', notes: '',
  })
  const set = <K extends keyof NewSalaryTriggerInput>(k: K, v: NewSalaryTriggerInput[K]) =>
    setF(prev => ({ ...prev, [k]: v }))

  const inp: React.CSSProperties = {
    padding: '7px 9px', borderRadius: 6, fontSize: 12, width: '100%', boxSizing: 'border-box',
    background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--input-color)', fontFamily: font,
  }
  const lbl: React.CSSProperties = {
    fontSize: 9, fontFamily: fontMono, letterSpacing: '0.12em', textTransform: 'uppercase',
    color: 'var(--text-muted)', marginBottom: 3, display: 'block',
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        style={{ padding: '8px 16px', borderRadius: 8, border: '1px dashed rgba(190,140,74,0.45)', background: 'rgba(190,140,74,0.08)', color: '#be8c4a', fontSize: 12, fontFamily: font, fontWeight: 600, cursor: 'pointer' }}>
        + Nova Meta de Salário
      </button>
    )
  }

  async function submit() {
    if (!f.description.trim() || !f.new_salary) return
    await onAdd(f)
    setF({ contract_id: contracts[0]?.id ?? null, description: '', metric: 'JOGOS', threshold: null, new_salary: 0, currency: 'BRL', notes: '' })
    setOpen(false)
  }

  return (
    <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, border: '1px solid rgba(190,140,74,0.30)' }}>
      <div style={{ fontSize: 10, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#be8c4a', fontWeight: 600 }}>Nova Meta de Mudança Salarial</div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
        <div>
          <label style={lbl}>Descrição *</label>
          <input style={inp} value={f.description} onChange={e => set('description', e.target.value)} placeholder="Ex: Ao atingir 10 jogos, salário sobe" />
        </div>
        <div>
          <label style={lbl}>Métrica</label>
          <select style={inp} value={f.metric} onChange={e => set('metric', e.target.value as TriggerMetric)}>
            {(Object.keys(TRIGGER_METRIC_LABELS) as TriggerMetric[]).map(m => <option key={m} value={m}>{TRIGGER_METRIC_LABELS[m]}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Meta (nº)</label>
          <input style={inp} type="number" value={f.threshold ?? ''} onChange={e => set('threshold', e.target.value ? Number(e.target.value) : null)} placeholder="Ex: 10" />
        </div>
        <div>
          <label style={lbl}>Novo salário *</label>
          <input style={inp} type="number" value={f.new_salary || ''} onChange={e => set('new_salary', Number(e.target.value) || 0)} placeholder="Ex: 300000" />
        </div>
        <div>
          <label style={lbl}>Moeda</label>
          <select style={inp} value={f.currency} onChange={e => set('currency', e.target.value as Currency)}>
            {(['BRL','EUR','USD','GBP'] as Currency[]).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Vínculo (contrato)</label>
          <select style={inp} value={f.contract_id ?? ''} onChange={e => set('contract_id', e.target.value || null)}>
            <option value="">Todos / atleta</option>
            {contracts.map(c => <option key={c.id} value={c.id}>{c.counterpart_club} ({fmtDate(c.start_date)})</option>)}
          </select>
        </div>
      </div>
      <div>
        <label style={lbl}>Observações</label>
        <input style={inp} value={f.notes} onChange={e => set('notes', e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={() => setOpen(false)} style={{ padding: '7px 16px', borderRadius: 7, border: '1px solid var(--divider-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontFamily: font, cursor: 'pointer' }}>Cancelar</button>
        <button onClick={submit} disabled={!f.description.trim() || !f.new_salary}
          style={{ padding: '7px 18px', borderRadius: 7, border: 'none', background: (f.description.trim() && f.new_salary) ? '#be8c4a' : '#ccc', color: '#fff', fontSize: 12, fontFamily: font, fontWeight: 600, cursor: (f.description.trim() && f.new_salary) ? 'pointer' : 'not-allowed' }}>
          Adicionar Meta
        </button>
      </div>
    </div>
  )
}

const TRIGGER_STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  PENDENTE:     { bg: 'rgba(59,130,246,0.12)', fg: '#1d4ed8' },
  ATINGIDA:     { bg: '#dcf0e4', fg: '#166534' },
  NAO_ATINGIDA: { bg: 'rgba(156,163,175,0.18)', fg: '#6b7280' },
}

function TriggerRow({ t, canEdit, onMark, onReset, onDelete }: {
  t: SalaryTrigger
  canEdit: boolean
  onMark: (date: string) => void
  onReset: () => void
  onDelete: () => void
}) {
  const [date, setDate] = useState(todayISO())
  const achieved = t.status === 'ATINGIDA'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      padding: '12px 14px', borderRadius: 8,
      background: achieved ? '#dcf0e4' : 'var(--bg-subtle)',
      border: `1px solid ${achieved ? 'rgba(22,101,52,0.25)' : 'var(--divider-soft)'}`,
    }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-primary)', fontFamily: font }}>{t.description}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: fontMono, marginTop: 2 }}>
          {TRIGGER_METRIC_LABELS[t.metric]}{t.threshold != null ? ` ≥ ${t.threshold}` : ''} → {fmtCurrencyShort(t.new_salary, t.currency)}
          {t.notes ? ` · ${t.notes}` : ''}
        </div>
      </div>
      <span style={{ padding: '2px 8px', borderRadius: 5, fontSize: 9, fontWeight: 600, fontFamily: fontMono, letterSpacing: '0.10em', textTransform: 'uppercase', background: TRIGGER_STATUS_STYLE[t.status].bg, color: TRIGGER_STATUS_STYLE[t.status].fg }}>
        {TRIGGER_STATUS_LABELS[t.status]}
      </span>
      {achieved ? (
        <>
          <span style={{ fontSize: 11, fontFamily: fontMono, color: '#166534' }}>desde {fmtDate(t.achieved_date)}</span>
          {canEdit && (
            <button onClick={onReset} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--divider-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 11, fontFamily: font, cursor: 'pointer' }}>Reverter</button>
          )}
        </>
      ) : canEdit ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ padding: '5px 8px', borderRadius: 6, fontSize: 12, background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--input-color)', fontFamily: fontMono }} />
          <button onClick={() => onMark(date)}
            style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: '#166534', color: '#fff', fontSize: 11, fontFamily: font, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            ✓ Meta atingida
          </button>
        </div>
      ) : null}
      {canEdit && (
        <button onClick={onDelete} title="Remover meta"
          style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--divider-strong)', background: 'transparent', color: 'var(--neg)', fontSize: 12, cursor: 'pointer', lineHeight: 1 }}>✕</button>
      )}
    </div>
  )
}

// ── Editar atleta ────────────────────────────────────────────────────────

const ATHLETE_POSITIONS = ['', 'Goleiro', 'Zagueiro', 'Lateral Direito', 'Lateral Esquerdo', 'Volante', 'Meia', 'Meia-atacante', 'Atacante']

function EditAthleteModal({ athlete, onClose, onSaved }: { athlete: Athlete; onClose: () => void; onSaved: (a: Athlete) => void }) {
  const [f, setF] = useState({
    full_name: athlete.full_name, short_name: athlete.short_name,
    position: athlete.position ?? '', current_status: athlete.current_status,
    nationality: athlete.nationality ?? '', birth_date: athlete.birth_date ?? '',
    cpf: athlete.cpf ?? '', passport_number: athlete.passport_number ?? '',
    agent_name: athlete.agent_name ?? '', agent_contact: athlete.agent_contact ?? '',
    notes: athlete.notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }))

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 6, fontSize: 13, background: 'var(--cream-canvas)', border: '1px solid var(--input-border)', color: 'var(--ink-primary)', fontFamily: font, boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontSize: 9, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 3, display: 'block' }

  async function save() {
    if (!f.full_name.trim()) return
    setSaving(true)
    try {
      const updated = await updateAthlete(athlete.id, {
        full_name: f.full_name.trim(), short_name: f.short_name.trim() || f.full_name.trim().split(' ')[0],
        position: f.position || null, current_status: f.current_status,
        nationality: f.nationality || null, birth_date: f.birth_date || null,
        cpf: f.cpf || null, passport_number: f.passport_number || null,
        agent_name: f.agent_name || null, agent_contact: f.agent_contact || null,
        notes: f.notes || null,
      })
      onSaved(updated)
    } finally { setSaving(false) }
  }

  const field = (label: string, key: keyof typeof f, type = 'text', opts?: string[]) => (
    <div>
      <label style={lbl}>{label}</label>
      {opts
        ? <select style={inp} value={f[key]} onChange={e => set(key, e.target.value)}>{opts.map(o => <option key={o} value={o}>{o || '—'}</option>)}</select>
        : <input type={type} style={inp} value={f[key]} onChange={e => set(key, e.target.value)} />}
    </div>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,20,16,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--cream-card)', borderRadius: 12, padding: 26, width: 620, maxWidth: '96vw', maxHeight: '92vh', overflowY: 'auto', border: '1px solid var(--divider)', boxShadow: 'var(--shadow-panel)', display: 'flex', flexDirection: 'column', gap: 14 }}>
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
          {field('Agente', 'agent_name')}
          {field('Contato do agente', 'agent_contact')}
        </div>
        <div><label style={lbl}>Observações</label><textarea style={{ ...inp, minHeight: 56, resize: 'vertical' }} value={f.notes} onChange={e => set('notes', e.target.value)} /></div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid var(--divider-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontFamily: font, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={save} disabled={saving || !f.full_name.trim()} style={{ padding: '8px 22px', borderRadius: 7, border: 'none', background: 'var(--ink-primary)', color: 'var(--gold-soft)', fontSize: 12, fontWeight: 600, fontFamily: font, cursor: 'pointer' }}>{saving ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────

export default function PageAthleteDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const canEdit = !profile || profile.role === 'master' || profile.role === 'juridico'

  const [athlete, setAthlete] = useState<Athlete | null>(null)
  const [contracts, setContracts] = useState<Contract[]>([])
  const [clauses, setClauses] = useState<Clause[]>([])
  const [installments, setInstallments] = useState<ClauseInstallment[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [rights, setRights] = useState<EconomicRight[]>([])
  const [triggers, setTriggers] = useState<SalaryTrigger[]>([])
  const [clubLiabs, setClubLiabs] = useState<ClubLiability[]>([])
  const [intermLiabs, setIntermLiabs] = useState<IntermediaryLiability[]>([])
  const [imageRights, setImageRights] = useState<ImageRight[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('salario')
  const [payClauseId, setPayClauseId] = useState<string | null>(null)
  const [payInstallId, setPayInstallId] = useState<string | null>(null)
  const [showEdit, setShowEdit] = useState(false)

  const loadData = useCallback(async () => {
    if (!id) return
    setLoading(true)
    const [ath, contr, cls, inst, alrt, rght, trg, clb, itm, img] = await Promise.all([
      fetchAthlete(id),
      fetchAthleteContracts(id),
      fetchAthleteClauses(id),
      fetchAthleteInstallments(id),
      fetchAthleteAlerts(id),
      fetchAthleteEconomicRights(id),
      fetchAthleteSalaryTriggers(id),
      fetchAthleteClubLiabilities(id),
      fetchAthleteIntermediaryLiabilities(id),
      fetchAthleteImageRights(id),
    ])
    setAthlete(ath)
    setContracts(contr)
    setClauses(cls)
    setInstallments(inst)
    setAlerts(alrt)
    setRights(rght)
    setTriggers(trg)
    setClubLiabs(clb)
    setIntermLiabs(itm)
    setImageRights(img)
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

  // ── Economic rights actions ────────────────────────────────────────────
  async function handleAddRight() {
    if (!id) return
    const created = await createEconomicRight(id, { holder_type: 'TERCEIRO', holder_name: '', percentage: 0, notes: '' })
    setRights(prev => [...prev, created])
  }
  async function handleUpdateRight(rightId: string, patch: Partial<EconomicRight>) {
    const updated = await updateEconomicRight(rightId, patch)
    setRights(prev => prev.map(r => r.id === rightId ? updated : r))
  }
  async function handleDeleteRight(rightId: string) {
    await deleteEconomicRight(rightId)
    setRights(prev => prev.filter(r => r.id !== rightId))
  }

  // ── Salary-trigger actions (mudança salarial por meta) ───────────────────
  async function handleAddTrigger(input: NewSalaryTriggerInput) {
    if (!id) return
    const created = await createSalaryTrigger(id, input)
    setTriggers(prev => [...prev, created])
  }
  async function handleMarkTrigger(triggerId: string, date: string) {
    const updated = await markTriggerAchieved(triggerId, date)
    setTriggers(prev => prev.map(t => t.id === triggerId ? updated : t))
  }
  async function handleResetTrigger(triggerId: string) {
    const updated = await resetTrigger(triggerId)
    setTriggers(prev => prev.map(t => t.id === triggerId ? updated : t))
  }
  async function handleDeleteTrigger(triggerId: string) {
    await deleteSalaryTrigger(triggerId)
    setTriggers(prev => prev.filter(t => t.id !== triggerId))
  }

  async function handlePhoto(url: string | null) {
    if (!id) return
    const updated = await updateAthlete(id, { profile_photo_url: url })
    setAthlete(updated)
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
        <div style={{ display: 'flex', gap: 22, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <ImageUpload value={athlete.profile_photo_url} onChange={handlePhoto} fallbackText={athlete.short_name} size={80} editable={canEdit} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink-primary)', fontFamily: font, margin: 0 }}>{athlete.full_name}</h1>
              <span style={{ padding: '3px 10px', borderRadius: 6, background: st.bg, color: st.fg, fontSize: 10, fontWeight: 700, fontFamily: fontMono, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                {st.label}
              </span>
              {unreadCrit > 0 && (
                <span title={`${unreadCrit} alerta(s) crítico(s)`} onClick={() => setTab('alertas')}
                  style={{ padding: '3px 9px', borderRadius: 5, background: 'var(--neg-tint)', color: 'var(--neg)', fontSize: 10, fontWeight: 600, fontFamily: fontMono, letterSpacing: '0.06em', cursor: 'pointer' }}>
                  {unreadCrit} {unreadCrit === 1 ? 'crítico' : 'críticos'}
                </span>
              )}
              {warnCount > 0 && (
                <span title={`${warnCount} alerta(s) de atenção`} onClick={() => setTab('alertas')}
                  style={{ padding: '3px 9px', borderRadius: 5, background: 'var(--warn-tint)', color: 'var(--warn)', fontSize: 10, fontWeight: 600, fontFamily: fontMono, letterSpacing: '0.06em', cursor: 'pointer' }}>
                  {warnCount} atenção
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-secondary)', fontFamily: font }}>
              {athlete.position && <span><LabelSpan>Posição</LabelSpan> {athlete.position}</span>}
              {athlete.nationality && <span><LabelSpan>Nacionalidade</LabelSpan> {athlete.nationality}</span>}
              {athlete.birth_date && <span><LabelSpan>Nasc.</LabelSpan> {fmtDate(athlete.birth_date)}</span>}
              {athlete.agent_name && <span><LabelSpan>Agente</LabelSpan> {athlete.agent_name}{athlete.agent_contact ? ` — ${athlete.agent_contact}` : ''}</span>}
            </div>
            {athlete.notes && (
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-subtle)', borderLeft: '2px solid var(--gold-ring)', borderRadius: 4, padding: '7px 12px', fontFamily: font }}>
                {athlete.notes}
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {canEdit && (
              <button onClick={() => setShowEdit(true)}
                style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--divider-strong)', borderRadius: 8, color: 'var(--text-secondary)', fontFamily: font, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                Editar
              </button>
            )}
            <Link to={`/atletas/${athlete.id}/contratos/novo`}
              style={{ padding: '8px 16px', background: 'var(--ink-primary)', border: 'none', borderRadius: 8, color: 'var(--gold-soft)', fontFamily: font, fontSize: 12, fontWeight: 600, textDecoration: 'none', display: 'inline-block' }}>
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

      {/* ── Direitos Econômicos (titularidade) ── */}
      <div className="card" style={{ padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 9, fontFamily: fontMono, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            Direitos Econômicos
          </div>
          {canEdit && (
            <button onClick={handleAddRight}
              style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--divider-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 11, fontFamily: font, fontWeight: 600, cursor: 'pointer' }}>
              + Detentor
            </button>
          )}
        </div>

        {rights.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: font, padding: '4px 0' }}>
            Titularidade não cadastrada.{canEdit ? ' Clique em “+ Detentor” para começar.' : ''}
          </div>
        ) : (
          <OwnershipBar rights={rights} />
        )}

        {!isOwnershipValid(rights) && rights.length > 0 && (
          <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 6, background: 'var(--neg-tint)', color: 'var(--neg)', fontSize: 12, fontFamily: font }}>
            A soma dos direitos econômicos é {sumOwnership(rights).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% e deveria totalizar 100%. Verifique o cadastro.
          </div>
        )}

        {canEdit && rights.length > 0 && (
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rights.map(r => (
              <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 90px 1fr 32px', gap: 8, alignItems: 'center' }}>
                <select value={r.holder_type} onChange={e => handleUpdateRight(r.id, { holder_type: e.target.value as HolderType })}
                  style={{ padding: '6px 8px', borderRadius: 6, fontSize: 12, background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--input-color)', fontFamily: font }}>
                  {(Object.keys(HOLDER_TYPE_LABELS) as HolderType[]).map(k => <option key={k} value={k}>{HOLDER_TYPE_LABELS[k]}</option>)}
                </select>
                <input placeholder="Nome do detentor" value={r.holder_name ?? ''} onChange={e => handleUpdateRight(r.id, { holder_name: e.target.value })}
                  style={{ padding: '6px 8px', borderRadius: 6, fontSize: 12, background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--input-color)', fontFamily: font }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input type="number" min={0} max={100} step={0.01} value={r.percentage}
                    onChange={e => handleUpdateRight(r.id, { percentage: parseFloat(e.target.value) || 0 })}
                    style={{ width: 64, padding: '6px 8px', borderRadius: 6, fontSize: 12, background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--input-color)', fontFamily: fontMono, textAlign: 'right' }} />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: fontMono }}>%</span>
                </div>
                <input placeholder="Observação" value={r.notes ?? ''} onChange={e => handleUpdateRight(r.id, { notes: e.target.value })}
                  style={{ padding: '6px 8px', borderRadius: 6, fontSize: 12, background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--input-color)', fontFamily: font }} />
                <button onClick={() => handleDeleteRight(r.id)} title="Remover"
                  style={{ padding: '6px', borderRadius: 6, border: '1px solid var(--divider-strong)', background: 'transparent', color: 'var(--neg)', fontSize: 12, cursor: 'pointer', lineHeight: 1 }}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
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

      {/* ── Tab: Salário & Metas ── */}
      {tab === 'salario' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {contracts.length === 0 ? (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontFamily: font }}>
              Nenhum vínculo cadastrado. Crie um vínculo (com salário base) para gerenciar metas salariais.
            </div>
          ) : (
            contracts.map(ct => {
              const ctTriggers = triggers.filter(t => t.contract_id === ct.id || t.contract_id === null)
              const eff = effectiveSalary(ct, ctTriggers)
              const changed = eff.source !== null
              return (
                <div key={ct.id} className="card" style={{ padding: '18px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-primary)', fontFamily: font }}>
                      {ct.counterpart_club}
                      <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8, fontFamily: fontMono }}>
                        {fmtDate(ct.start_date)}{ct.end_date ? ` → ${fmtDate(ct.end_date)}` : ''}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
                    <div style={{ padding: '12px 16px', borderRadius: 8, background: 'var(--bg-subtle)', border: '1px solid var(--divider-soft)' }}>
                      <div style={{ fontSize: 9, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>Salário base</div>
                      <div style={{ fontSize: 20, fontWeight: 600, fontFamily: fontMono, color: 'var(--ink-primary)' }}>
                        {ct.base_salary != null ? fmtCurrencyShort(ct.base_salary, ct.salary_currency) : '—'}
                      </div>
                    </div>
                    <div style={{ padding: '12px 16px', borderRadius: 8, background: changed ? '#dcf0e4' : 'var(--bg-subtle)', border: `1px solid ${changed ? 'rgba(22,101,52,0.25)' : 'var(--divider-soft)'}` }}>
                      <div style={{ fontSize: 9, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: changed ? '#166534' : 'var(--text-muted)', marginBottom: 6 }}>Salário efetivo (hoje)</div>
                      <div style={{ fontSize: 20, fontWeight: 700, fontFamily: fontMono, color: changed ? '#166534' : 'var(--ink-primary)' }}>
                        {eff.amount != null ? fmtCurrencyShort(eff.amount, eff.currency) : '—'}
                      </div>
                      {changed && eff.source && (
                        <div style={{ fontSize: 10, color: '#166534', marginTop: 4, fontFamily: font }}>
                          via meta “{eff.source.description}” desde {fmtDate(eff.since)}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                    {ctTriggers.length === 0 ? (
                      <div style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: font }}>Nenhuma meta salarial cadastrada para este vínculo.</div>
                    ) : (
                      ctTriggers.map(t => (
                        <TriggerRow key={t.id} t={t} canEdit={canEdit}
                          onMark={date => handleMarkTrigger(t.id, date)}
                          onReset={() => handleResetTrigger(t.id)}
                          onDelete={() => handleDeleteTrigger(t.id)} />
                      ))
                    )}
                  </div>
                </div>
              )
            })
          )}

          {canEdit && contracts.length > 0 && (
            <NewTriggerForm contracts={contracts} onAdd={handleAddTrigger} />
          )}
        </div>
      )}

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
                        {c.notes?.includes('⚠️') && <span title="Observação de atenção" style={{ display: 'inline-block', fontSize: 8, fontWeight: 700, color: 'var(--warn)', border: '1px solid var(--warn)', borderRadius: 3, padding: '0 4px', fontFamily: fontMono, letterSpacing: '0.06em' }}>ATENÇÃO</span>}
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

      {/* ── Tab: Passivos & Imagem ── */}
      {tab === 'passivos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Passivos com clubes */}
          <div className="card" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 9, fontFamily: fontMono, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Passivos com Clubes</div>
              <Link to="/clubes" style={{ fontSize: 11, color: '#be8c4a', fontFamily: font, textDecoration: 'none' }}>Gerenciar →</Link>
            </div>
            {clubLiabs.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: font }}>Nenhum passivo com clube vinculado a este atleta.</div>
            ) : (
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

          {/* Passivos com intermediários */}
          <div className="card" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 9, fontFamily: fontMono, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Passivos com Intermediários</div>
              <Link to="/intermediarios" style={{ fontSize: 11, color: '#be8c4a', fontFamily: font, textDecoration: 'none' }}>Gerenciar →</Link>
            </div>
            {intermLiabs.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: font }}>Nenhum passivo com intermediário vinculado a este atleta.</div>
            ) : (
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

          {/* Direito de imagem */}
          <div className="card" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 9, fontFamily: fontMono, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Direito de Imagem</div>
              <Link to="/imagem" style={{ fontSize: 11, color: '#be8c4a', fontFamily: font, textDecoration: 'none' }}>Gerenciar →</Link>
            </div>
            {imageRights.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: font }}>Nenhuma parcela de direito de imagem cadastrada para este atleta.</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {imageRights.map(ir => (
                  <div key={ir.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 7, background: 'var(--bg-subtle)', border: '1px solid var(--divider-soft)' }}>
                    <span style={{ fontSize: 12, fontFamily: fontMono, color: 'var(--text-secondary)' }}>{ir.month}</span>
                    <span style={{ fontFamily: fontMono, fontWeight: 600, fontSize: 13 }}>{fmtCurrencyShort(ir.amount, ir.currency)}</span>
                    <StatusBadge status={ir.status} map={PAYMENT_STATUS_STYLE} />
                  </div>
                ))}
              </div>
            )}
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
              <div key={al.id} style={{ background: ss.bg, border: `1px solid ${ss.border}`, borderLeft: `3px solid ${ss.fg}`, borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 12, opacity: al.is_read ? 0.55 : 1 }}>
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
      {showEdit && athlete && (
        <EditAthleteModal athlete={athlete} onClose={() => setShowEdit(false)} onSaved={a => { setAthlete(a); setShowEdit(false) }} />
      )}
    </div>
  )
}

import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchAthletes, createAthlete,
} from '../lib/athleteQueries'
import { ALERTS_MOCK } from '../data/athletesMock'
import { fmtDate, isOverdue, isDueSoon } from '../lib/format'
import { INSTALLMENTS_MOCK, CLAUSES_MOCK } from '../data/athletesMock'
import type { Athlete, AthleteStatus } from '../types/athlete-system'

const font     = "'Inter', system-ui, sans-serif"
const fontMono = "'IBM Plex Mono', 'JetBrains Mono', monospace"

const STATUS_LABELS: Record<AthleteStatus, string> = {
  ATIVO:      'Ativo',
  EMPRESTADO: 'Emprestado',
  VENDIDO:    'Vendido',
  DESLIGADO:  'Desligado',
}

const STATUS_STYLE: Record<AthleteStatus, { bg: string; fg: string }> = {
  ATIVO:      { bg: '#dcf0e4', fg: '#166534' },
  EMPRESTADO: { bg: 'rgba(190,140,74,0.18)', fg: '#7a6244' },
  VENDIDO:    { bg: 'rgba(59,130,246,0.12)', fg: '#1d4ed8' },
  DESLIGADO:  { bg: 'rgba(156,163,175,0.18)', fg: '#6b7280' },
}

function getInitials(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0].toUpperCase()).slice(0, 2).join('')
}

function AthleteAvatar({ athlete, size = 38 }: { athlete: Athlete; size?: number }) {
  const [err, setErr] = useState(false)
  if (athlete.profile_photo_url && !err) {
    return (
      <img src={athlete.profile_photo_url} alt={athlete.short_name}
        onError={() => setErr(true)}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(190,140,74,0.30)', flexShrink: 0 }} />
    )
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg, #1a1410 0%, #3a2e1c 100%)',
      border: '2px solid rgba(190,140,74,0.30)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: fontMono, fontSize: size * 0.36, fontWeight: 700, color: '#be8c4a',
    }}>
      {getInitials(athlete.short_name)}
    </div>
  )
}

interface NewAthleteModalProps {
  onSave: (a: Athlete) => void
  onClose: () => void
}

function NewAthleteModal({ onSave, onClose }: NewAthleteModalProps) {
  const [f, setF] = useState({
    full_name: '', short_name: '', birth_date: '', nationality: 'Brasil',
    cpf: '', passport_number: '', agent_name: '', agent_contact: '',
    current_status: 'ATIVO' as AthleteStatus, notes: '',
  })
  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }))

  const inp: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: 6, fontSize: 13,
    background: 'var(--cream-canvas)', border: '1px solid var(--input-border)',
    color: 'var(--ink-primary)', fontFamily: font, boxSizing: 'border-box',
  }
  const lbl: React.CSSProperties = {
    fontSize: 9, fontWeight: 600, fontFamily: fontMono, letterSpacing: '0.14em',
    textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 3, display: 'block',
  }
  const field = (label: string, key: string, type = 'text', opts?: string[]) => (
    <div>
      <label style={lbl}>{label}</label>
      {opts ? (
        <select style={inp} value={(f as Record<string, string>)[key]} onChange={e => set(key, e.target.value)}>
          {opts.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type={type} style={inp} value={(f as Record<string, string>)[key]} onChange={e => set(key, e.target.value)} />
      )}
    </div>
  )

  async function handleSave() {
    if (!f.full_name.trim()) return
    const a = await createAthlete({
      full_name: f.full_name.trim(),
      short_name: f.short_name.trim() || f.full_name.trim().split(' ')[0],
      birth_date: f.birth_date || null,
      nationality: f.nationality || null,
      cpf: f.cpf || null,
      passport_number: f.passport_number || null,
      agent_name: f.agent_name || null,
      agent_contact: f.agent_contact || null,
      current_status: f.current_status,
      profile_photo_url: null,
      notes: f.notes || null,
    })
    onSave(a)
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--cream-card)', borderRadius: 12, padding: 28, width: 600, maxWidth: '96vw', border: '1px solid var(--divider)', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-primary)', fontFamily: font, marginBottom: 4 }}>Novo Atleta</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {field('Nome Completo *', 'full_name')}
          {field('Nome Curto / Alcunha', 'short_name')}
          {field('Data de Nascimento', 'birth_date', 'date')}
          {field('Nacionalidade', 'nationality')}
          {field('CPF', 'cpf')}
          {field('Passaporte', 'passport_number')}
          {field('Nome do Agente', 'agent_name')}
          {field('Contato do Agente', 'agent_contact')}
          {field('Status Atual', 'current_status', 'text', ['ATIVO', 'EMPRESTADO', 'VENDIDO', 'DESLIGADO'])}
        </div>

        <div>
          <label style={lbl}>Observações</label>
          <textarea style={{ ...inp, minHeight: 60, resize: 'vertical' }} value={f.notes} onChange={e => set('notes', e.target.value)} />
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid var(--divider-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontFamily: font, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={handleSave} disabled={!f.full_name.trim()}
            style={{ padding: '8px 22px', borderRadius: 7, border: 'none', background: f.full_name.trim() ? '#be8c4a' : '#ccc', color: '#fff', fontSize: 12, fontFamily: font, fontWeight: 600, cursor: f.full_name.trim() ? 'pointer' : 'not-allowed' }}>
            Criar Atleta
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PageAthletesList() {
  const navigate = useNavigate()
  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<AthleteStatus | 'Todos'>('Todos')
  const [showNew, setShowNew] = useState(false)

  useEffect(() => {
    fetchAthletes().then(data => { setAthletes(data); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => athletes.filter(a => {
    if (filterStatus !== 'Todos' && a.current_status !== filterStatus) return false
    if (search) {
      const q = search.toLowerCase()
      if (!a.full_name.toLowerCase().includes(q) && !a.short_name.toLowerCase().includes(q)) return false
    }
    return true
  }), [athletes, filterStatus, search])

  // Calcular stats por atleta (a partir dos mocks)
  const getAthleteStats = (id: string) => {
    const clauses = CLAUSES_MOCK.filter(c => c.athlete_id === id)
    const installments = INSTALLMENTS_MOCK.filter(i => i.athlete_id === id)
    const overdue = [
      ...clauses.filter(c => isOverdue(c.due_date, c.payment_status)),
      ...installments.filter(i => isOverdue(i.due_date, i.payment_status)),
    ].length
    const soon = [
      ...clauses.filter(c => isDueSoon(c.due_date, c.payment_status)),
      ...installments.filter(i => isDueSoon(i.due_date, i.payment_status)),
    ].length
    const openDates = [
      ...clauses.filter(c => c.payment_status === 'PENDENTE' && c.due_date).map(c => c.due_date!),
      ...installments.filter(i => i.payment_status === 'PENDENTE').map(i => i.due_date),
    ].sort()
    const unread = ALERTS_MOCK.filter(al => al.athlete_id === id && !al.is_read && al.severity === 'RED').length
    return { overdue, soon, nextDue: openDates[0] ?? null, unread }
  }

  const th: React.CSSProperties = {
    padding: '8px 12px', fontSize: 9, fontWeight: 500, textTransform: 'uppercase',
    background: 'var(--tbl-head)', color: 'var(--ink-secondary)',
    borderBottom: '1px solid var(--divider-strong)', fontFamily: fontMono,
    letterSpacing: '0.16em', whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1,
  }
  const td: React.CSSProperties = {
    padding: '11px 12px', fontSize: 13, color: 'var(--ink-primary)', fontFamily: font,
    borderBottom: '1px solid var(--divider-soft)', verticalAlign: 'middle',
  }

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
          <h1 style={{ fontFamily: font, fontSize: 22, fontWeight: 700, color: 'var(--ink-primary)' }}>Atletas</h1>
          <span style={{ fontFamily: fontMono, fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.18em', textTransform: 'uppercase' }}>GESTÃO DE PLANTEL</span>
        </div>
        <div style={{ height: 2, width: 40, background: '#be8c4a', borderRadius: 2 }} />
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 9, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Busca</div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nome do atleta..."
            style={{ width: '100%', padding: '8px 12px', borderRadius: 7, border: '1px solid var(--input-border)', background: 'var(--cream-card)', fontSize: 13, fontFamily: font, color: 'var(--ink-primary)' }} />
        </div>
        <div>
          <div style={{ fontSize: 9, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Status</div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as typeof filterStatus)}
            style={{ padding: '8px 12px', borderRadius: 7, border: '1px solid var(--input-border)', background: 'var(--cream-card)', fontSize: 13, fontFamily: font, color: 'var(--ink-primary)' }}>
            <option value="Todos">Todos</option>
            {(['ATIVO','EMPRESTADO','VENDIDO','DESLIGADO'] as AthleteStatus[]).map(s => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
        <button onClick={() => setShowNew(true)}
          style={{ padding: '8px 20px', background: '#be8c4a', border: 'none', borderRadius: 8, color: '#fff', fontFamily: font, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          + Novo Atleta
        </button>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 240px)', overflowY: 'auto' }}>
          <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 52 }}></th>
                <th style={{ ...th, width: 200, textAlign: 'left' }}>Nome</th>
                <th style={{ ...th, width: 110 }}>Status</th>
                <th style={{ ...th, width: 80 }}>País</th>
                <th style={{ ...th, width: 80, textAlign: 'right' }}>Cláusulas</th>
                <th style={{ ...th, width: 120, textAlign: 'right' }}>Próx. Venc.</th>
                <th style={{ ...th, width: 100 }}>Alertas</th>
                <th style={{ ...th, width: 140 }}>Agente</th>
                <th style={{ ...th, width: 90, textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Carregando...</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Nenhum atleta encontrado.</td></tr>
              )}
              {filtered.map(a => {
                const stats = getAthleteStats(a.id)
                const st = STATUS_STYLE[a.current_status]
                const clauses = CLAUSES_MOCK.filter(c => c.athlete_id === a.id)
                const active = clauses.filter(c => !['PAGA','CANCELADA'].includes(c.payment_status)).length
                return (
                  <tr key={a.id} style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/atletas/${a.id}`)}
                    onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'var(--table-row-hover)'}
                    onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}>
                    <td style={{ ...td, width: 52 }}>
                      <AthleteAvatar athlete={a} size={36} />
                    </td>
                    <td style={{ ...td, width: 200 }}>
                      <div style={{ fontWeight: 600, color: 'var(--ink-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.short_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.full_name !== a.short_name ? a.full_name : ''}</div>
                    </td>
                    <td style={{ ...td, width: 110 }}>
                      <span style={{ padding: '3px 8px', borderRadius: 5, background: st.bg, color: st.fg, fontSize: 10, fontWeight: 600, fontFamily: fontMono, letterSpacing: '0.10em', textTransform: 'uppercase' }}>
                        {STATUS_LABELS[a.current_status]}
                      </span>
                    </td>
                    <td style={{ ...td, width: 80, color: 'var(--text-secondary)', fontSize: 12 }}>{a.nationality ?? '—'}</td>
                    <td style={{ ...td, width: 80, textAlign: 'right', fontFamily: fontMono, fontSize: 13 }}>
                      <span style={{ fontWeight: active > 0 ? 600 : 400, color: active > 0 ? 'var(--ink-primary)' : 'var(--text-muted)' }}>{active}</span>
                      {active > 0 && <span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 2 }}>ativas</span>}
                    </td>
                    <td style={{ ...td, width: 120, textAlign: 'right', fontFamily: fontMono, fontSize: 12, color: stats.nextDue ? (isOverdue(stats.nextDue, 'PENDENTE') ? 'var(--neg)' : 'var(--ink-secondary)') : 'var(--text-muted)' }}>
                      {stats.nextDue ? fmtDate(stats.nextDue) : '—'}
                    </td>
                    <td style={{ ...td, width: 100 }}>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        {stats.overdue > 0 && (
                          <span title={`${stats.overdue} em atraso`} style={{ padding: '2px 6px', borderRadius: 4, background: 'var(--neg-tint)', color: 'var(--neg)', fontSize: 9, fontFamily: fontMono, fontWeight: 600 }}>
                            🔴 {stats.overdue}
                          </span>
                        )}
                        {stats.soon > 0 && (
                          <span title={`${stats.soon} vencendo em breve`} style={{ padding: '2px 6px', borderRadius: 4, background: 'var(--warn-tint)', color: 'var(--warn)', fontSize: 9, fontFamily: fontMono, fontWeight: 600 }}>
                            🟡 {stats.soon}
                          </span>
                        )}
                        {stats.overdue === 0 && stats.soon === 0 && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>}
                      </div>
                    </td>
                    <td style={{ ...td, width: 140, fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.agent_name ?? '—'}</td>
                    <td style={{ ...td, width: 90, textAlign: 'right' }}>
                      <button onClick={e => { e.stopPropagation(); navigate(`/atletas/${a.id}`) }}
                        style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--divider-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 11, fontFamily: font, cursor: 'pointer' }}>
                        Ver
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)', fontFamily: fontMono }}>
        {filtered.length} {filtered.length !== 1 ? 'atletas' : 'atleta'}
      </div>

      {showNew && (
        <NewAthleteModal onSave={a => setAthletes(prev => [...prev, a])} onClose={() => setShowNew(false)} />
      )}
    </div>
  )
}

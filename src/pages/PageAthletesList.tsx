import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchAthletes, createAthlete, fetchAllEconomicRights,
  fetchAllClauses, fetchAllInstallments, fetchAllAlerts,
} from '../lib/athleteQueries'
import { fmtDate, isOverdue, isDueSoon } from '../lib/format'
import type {
  Athlete, AthleteStatus, AthleteCategory, EconomicRight, Clause, ClauseInstallment, Alert,
} from '../types/athlete-system'
import { ATHLETE_CATEGORY_LABELS } from '../types/athlete-system'
import OwnershipBar, { OwnershipBadge } from '../components/OwnershipBar'
import PageHero from '../components/PageHero'
import { Icon, IconButton } from '../components/Icon'
import SheetIO from '../components/SheetIO'
import { importConsolidatedAthletes, isConsolidatedSheet } from '../lib/athleteConsolidado'
import { COLS_ATHLETES } from '../lib/xlsx-utils'

const font     = "'Inter', system-ui, sans-serif"
const fontMono = "'IBM Plex Mono', 'JetBrains Mono', monospace"

// Categoria a partir de rótulo ("Profissional") ou enum ("PROFISSIONAL").
function parseImportCategory(v: unknown): AthleteCategory {
  const s = String(v ?? '').trim().toLowerCase()
  for (const [key, label] of Object.entries(ATHLETE_CATEGORY_LABELS)) {
    if (s === key.toLowerCase() || s === label.toLowerCase()) return key as AthleteCategory
  }
  return 'PROFISSIONAL'
}

const STATUS_LABELS: Record<AthleteStatus, string> = {
  ATIVO:      'Ativo',
  EMPRESTADO: 'Emprestado',
  VENDIDO:    'Vendido',
  DESLIGADO:  'Desligado',
}

const STATUS_STYLE: Record<AthleteStatus, { bg: string; fg: string }> = {
  ATIVO:      { bg: '#e6ece2', fg: '#3a6f3a' },
  EMPRESTADO: { bg: 'var(--accent-tint2)', fg: '#7a6244' },
  VENDIDO:    { bg: 'rgba(91,107,122,0.12)', fg: '#5b6b7a' },
  DESLIGADO:  { bg: 'rgba(156,163,175,0.18)', fg: '#6b7280' },
}

// Ordem de exibição por posição (de cima pra baixo):
// Goleiro → Lateral → Zagueiro → Volante → Meio Campo → Atacante.
function positionOrder(pos: string | null): number {
  const p = (pos ?? '').toLowerCase()
  if (!p) return 99
  if (p.includes('goleiro')) return 0
  if (p.includes('lateral')) return 1
  if (p.includes('zagueiro') || p.includes('zaga')) return 2
  if (p.includes('volante')) return 3
  if (p.includes('meia') || p.includes('meio')) return 4
  if (p.includes('atacante') || p.includes('ponta') || p.includes('centroavante')) return 5
  return 98
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
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--divider-strong)', flexShrink: 0 }} />
    )
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'var(--cream-inset)',
      border: '1px solid var(--divider-strong)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: fontMono, fontSize: size * 0.32, fontWeight: 600, color: 'var(--gold-deep)',
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
    cpf: '', passport_number: '',
    current_status: 'ATIVO' as AthleteStatus, category: 'PROFISSIONAL' as AthleteCategory,
    position: '', notes: '',
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
      agent_name: null,
      agent_contact: null,
      current_status: f.current_status,
      category: f.category,
      position: f.position || null,
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
          {field('Posição', 'position', 'text', ['', 'Goleiro', 'Zagueiro', 'Lateral Direito', 'Lateral Esquerdo', 'Volante', 'Meia', 'Meia-atacante', 'Atacante'])}
          {field('Status Atual', 'current_status', 'text', ['ATIVO', 'EMPRESTADO', 'VENDIDO', 'DESLIGADO'])}
          <div>
            <label style={lbl}>Categoria</label>
            <select style={inp} value={f.category} onChange={e => set('category', e.target.value)}>
              {(Object.keys(ATHLETE_CATEGORY_LABELS) as AthleteCategory[]).map(c => (
                <option key={c} value={c}>{ATHLETE_CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: font }}>
          Agentes são vinculados a cada transferência/vínculo, não ao atleta. Cadastre-os ao criar um vínculo.
        </div>

        <div>
          <label style={lbl}>Observações</label>
          <textarea style={{ ...inp, minHeight: 60, resize: 'vertical' }} value={f.notes} onChange={e => set('notes', e.target.value)} />
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="btn btn-outline">Cancelar</button>
          <button onClick={handleSave} disabled={!f.full_name.trim()}
            style={{ padding: '8px 22px', borderRadius: 7, border: 'none', background: f.full_name.trim() ? 'var(--accent)' : '#ccc', color: '#fff', fontSize: 12, fontFamily: font, fontWeight: 600, cursor: f.full_name.trim() ? 'pointer' : 'not-allowed' }}>
            Criar Atleta
          </button>
        </div>
      </div>
    </div>
  )
}

// Alertas de vencimento como ÍCONE + contagem: triângulo vermelho para o que já
// venceu, relógio amarelo para o que vence em breve.
function AlertCount({ kind, count }: { kind: 'atraso' | 'breve'; count: number }) {
  const atraso = kind === 'atraso'
  return (
    <span title={atraso ? `${count} parcela(s) em atraso` : `${count} parcela(s) vencendo em breve`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: atraso ? 'var(--neg)' : 'var(--warn)' }}>
      <Icon name={atraso ? 'alert' : 'clock'} size={14} />
      <span style={{ fontFamily: fontMono, fontSize: 11, fontWeight: 700 }}>{count}</span>
    </span>
  )
}

export default function PageAthletesList() {
  const navigate = useNavigate()
  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<AthleteStatus | 'Todos'>('Todos')
  const [showNew, setShowNew] = useState(false)
  const [rightsByAthlete, setRightsByAthlete] = useState<Record<string, EconomicRight[]>>({})
  const [clauses, setClauses] = useState<Clause[]>([])
  const [installments, setInstallments] = useState<ClauseInstallment[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [importMsg, setImportMsg] = useState<string | null>(null)

  function loadAll() {
    fetchAthletes().then(data => { setAthletes(data); setLoading(false) }).catch(() => setLoading(false))
    fetchAllEconomicRights().then(rows => {
      const map: Record<string, EconomicRight[]> = {}
      for (const r of rows) (map[r.athlete_id] ??= []).push(r)
      setRightsByAthlete(map)
    }).catch(() => {})
    fetchAllClauses().then(setClauses).catch(() => {})
    fetchAllInstallments().then(setInstallments).catch(() => {})
    fetchAllAlerts().then(setAlerts).catch(() => {})
  }

  useEffect(() => { loadAll() }, [])

  const filtered = useMemo(() => athletes.filter(a => {
    if (filterStatus !== 'Todos' && a.current_status !== filterStatus) return false
    if (search) {
      const q = search.toLowerCase()
      if (!a.full_name.toLowerCase().includes(q) && !a.short_name.toLowerCase().includes(q)) return false
    }
    return true
  }).sort((a, b) => {
    // Ordena por posição (Goleiro → ... → Atacante); desempate por nome.
    const d = positionOrder(a.position) - positionOrder(b.position)
    return d !== 0 ? d : a.short_name.localeCompare(b.short_name)
  }), [athletes, filterStatus, search])

  // Stats por atleta calculados a partir dos dados reais (query layer).
  const getAthleteStats = (id: string) => {
    const cl = clauses.filter(c => c.athlete_id === id)
    const inst = installments.filter(i => i.athlete_id === id)
    const overdue = [
      ...cl.filter(c => isOverdue(c.due_date, c.payment_status)),
      ...inst.filter(i => isOverdue(i.due_date, i.payment_status)),
    ].length
    const soon = [
      ...cl.filter(c => isDueSoon(c.due_date, c.payment_status)),
      ...inst.filter(i => isDueSoon(i.due_date, i.payment_status)),
    ].length
    const openDates = [
      ...cl.filter(c => c.payment_status === 'PENDENTE' && c.due_date).map(c => c.due_date!),
      ...inst.filter(i => i.payment_status === 'PENDENTE').map(i => i.due_date),
    ].sort()
    const unread = alerts.filter(al => al.athlete_id === id && !al.is_read && al.severity === 'RED').length
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
      <PageHero title="Atletas" subtitle="Gestão de plantel · Botafogo SAF" />

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
        <button onClick={() => setShowNew(true)} className="btn btn-primary">
          <Icon name="plus" size={13} /> Novo atleta
        </button>
        <SheetIO
          exportFilename="atletas.xlsx"
          exportSheets={[{ name: 'Atletas', cols: COLS_ATHLETES, rows: athletes as unknown as Record<string, unknown>[] }]}
          onImport={async sheets => {
            setImportMsg(null)
            // Aba consolidada (exportada de dentro de um atleta): cria novos
            // atletas com TODOS os vínculos. Caso contrário, planilha simples.
            const consolidated = Object.values(sheets).find(rows => isConsolidatedSheet(rows))
            if (consolidated) {
              const r = await importConsolidatedAthletes(consolidated)
              const parts = [`${r.athletes} atleta(s)`, `${r.records} registro(s)`]
              if (r.dupSkipped) parts.push(`${r.dupSkipped} já existente(s)`)
              if (r.invalid) parts.push(`${r.invalid} grupo(s) inválido(s)`)
              setImportMsg('Importado: ' + parts.join(' · '))
            } else {
              const rows = sheets['Atletas'] ?? sheets[Object.keys(sheets)[0]] ?? []
              let n = 0
              for (const r of rows) {
                const fullName = (r['Nome Completo'] ?? '').trim()
                if (!fullName) continue
                await createAthlete({
                  full_name: fullName,
                  short_name: (r['Nome Curto'] ?? '').trim() || fullName.split(' ')[0],
                  position: r['Posição'] || null,
                  current_status: (r['Status'] as AthleteStatus) || 'ATIVO',
                  category: parseImportCategory(r['Categoria']),
                  birth_date: r['Data Nascimento'] || null,
                  nationality: r['Nacionalidade'] || null,
                  cpf: r['CPF'] || null,
                  passport_number: r['Passaporte'] || null,
                  agent_name: r['Agente'] || null,
                  agent_contact: r['Contato Agente'] || null,
                  profile_photo_url: null,
                  notes: r['Observações'] || null,
                })
                n++
              }
              setImportMsg(`Importado: ${n} atleta(s)`)
            }
            loadAll()
          }}
        />
      </div>

      {importMsg && (
        <div style={{ fontFamily: fontMono, fontSize: 11, color: 'var(--gold-deep)', letterSpacing: '0.04em', marginBottom: 14 }}>
          {importMsg}
        </div>
      )}

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
                <th style={{ ...th, width: 180, textAlign: 'left' }}>Detentores</th>
                <th style={{ ...th, width: 130, textAlign: 'left' }}>Posição</th>
                <th style={{ ...th, width: 120, textAlign: 'right' }}>Próx. Venc.</th>
                <th style={{ ...th, width: 100 }}>Alertas</th>
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
                    <td style={{ ...td, width: 180 }}>
                      {(rightsByAthlete[a.id]?.length ?? 0) > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <OwnershipBar rights={rightsByAthlete[a.id]} compact showLegend={false} />
                          <OwnershipBadge rights={rightsByAthlete[a.id]} />
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>
                      )}
                    </td>
                    <td style={{ ...td, width: 130, color: a.position ? 'var(--ink-primary)' : 'var(--text-muted)', fontSize: 12 }}>
                      {a.position || '—'}
                    </td>
                    <td style={{ ...td, width: 120, textAlign: 'right', fontFamily: fontMono, fontSize: 12, color: stats.nextDue ? (isOverdue(stats.nextDue, 'PENDENTE') ? 'var(--neg)' : 'var(--ink-secondary)') : 'var(--text-muted)' }}>
                      {stats.nextDue ? fmtDate(stats.nextDue) : '—'}
                    </td>
                    <td style={{ ...td, width: 100 }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        {stats.overdue > 0 && <AlertCount kind="atraso" count={stats.overdue} />}
                        {stats.soon > 0 && <AlertCount kind="breve" count={stats.soon} />}
                        {stats.overdue === 0 && stats.soon === 0 && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>}
                      </div>
                    </td>
                    <td style={{ ...td, width: 70, textAlign: 'right' }}>
                      <IconButton icon="open" label={`Abrir a ficha de ${a.short_name || a.full_name}`} to={`/atletas/${a.id}`} />
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

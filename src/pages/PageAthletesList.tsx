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
import { OwnershipBadge } from '../components/OwnershipBar'
import { sortRights, sumOwnership } from '../lib/ownership'
import { HOLDER_TYPE_LABELS } from '../types/athlete-system'
import PageHero from '../components/PageHero'
import AthleteAvatar from '../components/AthleteAvatar'
import { Icon, IconButton } from '../components/Icon'
import { modalInput, modalLabel } from '../components/modals/styles'
import { ATHLETE_STATUS_TONE, badgeStyle } from '../lib/tones'
import SheetIO from '../components/SheetIO'
import { importConsolidatedAthletes, isConsolidatedSheet } from '../lib/athleteConsolidado'
import { COLS_ATHLETES } from '../lib/xlsx-utils'

const font     = "var(--font-body)"
const fontMono = "var(--font-label)"

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

const STATUS_TONE = ATHLETE_STATUS_TONE

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

  const inp = modalInput
  const lbl = modalLabel
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
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Novo atleta"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel" style={{ padding: 'var(--space-6)', width: 600, display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div style={{ fontSize: 'var(--text-subtitle-size)', fontWeight: 500, letterSpacing: '-.01em', color: 'var(--text-primary)', fontFamily: font }}>Novo atleta</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {field('Nome completo *', 'full_name')}
          {field('Nome curto / alcunha', 'short_name')}
          {field('Data de nascimento', 'birth_date', 'date')}
          {field('Nacionalidade', 'nationality')}
          {field('CPF', 'cpf')}
          {field('Passaporte', 'passport_number')}
          {field('Posição', 'position', 'text', ['', 'Goleiro', 'Zagueiro', 'Lateral Direito', 'Lateral Esquerdo', 'Volante', 'Meia', 'Meia-atacante', 'Atacante'])}
          {field('Status atual', 'current_status', 'text', ['ATIVO', 'EMPRESTADO', 'VENDIDO', 'DESLIGADO'])}
          <div>
            <label style={lbl}>Categoria</label>
            <select style={inp} value={f.category} onChange={e => set('category', e.target.value)}>
              {(Object.keys(ATHLETE_CATEGORY_LABELS) as AthleteCategory[]).map(c => (
                <option key={c} value={c}>{ATHLETE_CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: font }}>
          Agentes são vinculados a cada transferência/vínculo, não ao atleta. Cadastre-os ao criar um vínculo.
        </div>

        <div>
          <label style={lbl}>Observações</label>
          <textarea style={{ ...inp, minHeight: 60, resize: 'vertical' }} value={f.notes} onChange={e => set('notes', e.target.value)} />
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="btn btn-outline">Cancelar</button>
          <button onClick={handleSave} disabled={!f.full_name.trim()} className="btn btn-primary">
            Criar atleta
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
      <Icon name={atraso ? 'alert' : 'clock'} size={16} />
      <span style={{ fontSize: 12, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
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
    padding: '8px 12px', fontSize: 10, fontWeight: 400, textTransform: 'uppercase',
    background: 'var(--tbl-head)', color: 'var(--text-muted)',
    borderBottom: '1px solid var(--divider-strong)', fontFamily: fontMono,
    letterSpacing: 'var(--text-overline-tracking)', whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1,
    textAlign: 'center',
  }
  const td: React.CSSProperties = {
    padding: '11px 12px', fontSize: 13, color: 'var(--ink-primary)', fontFamily: font,
    borderBottom: '1px solid var(--divider-soft)', verticalAlign: 'middle',
    textAlign: 'center',
  }

  // Texto de titularidade — ex.: "100% BFR" ou "80% BFR · 20% Clube X".
  function ownershipText(rights: EconomicRight[]): string {
    if (!rights || rights.length === 0) return '—'
    const parts = sortRights(rights)
      .filter(r => r.percentage > 0)
      .map(r => {
        const label = r.holder_type === 'BFR' ? 'BFR' : (r.holder_name || HOLDER_TYPE_LABELS[r.holder_type])
        const pct = Number.isInteger(r.percentage) ? r.percentage : r.percentage.toFixed(1).replace('.', ',')
        return `${pct}% ${label}`
      })
    const total = sumOwnership(rights)
    if (total < 99.9) parts.push(`${(100 - total).toFixed(1).replace('.', ',')}% n/atrib.`)
    return parts.join(' · ')
  }

  return (
    <div style={{ padding: '24px 28px 32px', width: '100%', boxSizing: 'border-box' }}>
      <PageHero title="Atletas" subtitle="Gestão de plantel · Botafogo SAF" />

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 10, fontFamily: fontMono, letterSpacing: 'var(--text-overline-tracking)', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Busca</div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nome do atleta..."
            style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--input-border)', background: 'var(--cream-card)', fontSize: 13, fontFamily: font, color: 'var(--ink-primary)' }} />
        </div>
        <div>
          <div style={{ fontSize: 10, fontFamily: fontMono, letterSpacing: 'var(--text-overline-tracking)', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Status</div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as typeof filterStatus)}
            style={{ padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--input-border)', background: 'var(--cream-card)', fontSize: 13, fontFamily: font, color: 'var(--ink-primary)' }}>
            <option value="Todos">Todos</option>
            {(['ATIVO','EMPRESTADO','VENDIDO','DESLIGADO'] as AthleteStatus[]).map(s => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
        <button onClick={() => setShowNew(true)} className="btn btn-primary">
          <Icon name="plus" size={16} /> Novo atleta
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
        <div style={{ fontFamily: fontMono, fontSize: 11, color: 'var(--text-secondary)', marginBottom: 14 }}>
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
                <th style={{ ...th, width: 90 }}>País</th>
                <th style={{ ...th, width: 220 }}>Detentores</th>
                <th style={{ ...th, width: 140 }}>Posição</th>
                <th style={{ ...th, width: 120 }}>Próx. Venc.</th>
                <th style={{ ...th, width: 110 }}>Alertas</th>
                <th style={{ ...th, width: 70 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: 'var(--text-secondary)', padding: 40 }}>Carregando…</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: 'var(--text-secondary)', padding: 40 }}>
                  <div style={{ marginBottom: 12 }}>
                    {athletes.length === 0
                      ? 'Nenhum atleta cadastrado ainda.'
                      : 'Nenhum atleta corresponde aos filtros.'}
                  </div>
                  {athletes.length === 0 && (
                    <button className="btn btn-primary" onClick={() => setShowNew(true)}>
                      <Icon name="plus" size={16} /> Cadastrar o primeiro atleta
                    </button>
                  )}
                </td></tr>
              )}
              {filtered.map(a => {
                const stats = getAthleteStats(a.id)
                const tone = STATUS_TONE[a.current_status]
                return (
                  <tr key={a.id} style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/atletas/${a.id}`)}
                    onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'var(--table-row-hover)'}
                    onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}>
                    <td style={{ ...td, width: 52 }}>
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <AthleteAvatar athlete={a} size={36} />
                      </div>
                    </td>
                    <td style={{ ...td, width: 200, textAlign: 'left' }}>
                      <div style={{ fontWeight: 600, color: 'var(--ink-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.short_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.full_name !== a.short_name ? a.full_name : ''}</div>
                    </td>
                    <td style={{ ...td, width: 110 }}>
                      <span style={badgeStyle(tone)}>
                        {STATUS_LABELS[a.current_status]}
                      </span>
                    </td>
                    <td style={{ ...td, width: 90, color: 'var(--text-secondary)', fontSize: 12 }}>{a.nationality ?? '—'}</td>
                    <td style={{ ...td, width: 220, fontSize: 12 }}>
                      {(rightsByAthlete[a.id]?.length ?? 0) > 0 ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
                          <span style={{ fontFamily: fontMono, color: 'var(--ink-primary)' }}>
                            {ownershipText(rightsByAthlete[a.id])}
                          </span>
                          <OwnershipBadge rights={rightsByAthlete[a.id]} />
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>—</span>
                      )}
                    </td>
                    <td style={{ ...td, width: 140, color: a.position ? 'var(--ink-primary)' : 'var(--text-muted)', fontSize: 12 }}>
                      {a.position || '—'}
                    </td>
                    <td style={{ ...td, width: 120, fontFamily: fontMono, fontSize: 12, color: stats.nextDue ? (isOverdue(stats.nextDue, 'PENDENTE') ? 'var(--neg)' : 'var(--ink-secondary)') : 'var(--text-muted)' }}>
                      {stats.nextDue ? fmtDate(stats.nextDue) : '—'}
                    </td>
                    <td style={{ ...td, width: 110 }}>
                      <div style={{ display: 'inline-flex', gap: 10, alignItems: 'center', justifyContent: 'center' }}>
                        {stats.overdue > 0 && <AlertCount kind="atraso" count={stats.overdue} />}
                        {stats.soon > 0 && <AlertCount kind="breve" count={stats.soon} />}
                        {stats.overdue === 0 && stats.soon === 0 && <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>—</span>}
                      </div>
                    </td>
                    <td style={{ ...td, width: 70 }}>
                      <IconButton icon="open" label={`Abrir a ficha de ${a.short_name || a.full_name}`} to={`/atletas/${a.id}`} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-secondary)', fontFamily: fontMono }}>
        {filtered.length} {filtered.length !== 1 ? 'atletas' : 'atleta'}
      </div>

      {showNew && (
        <NewAthleteModal onSave={a => setAthletes(prev => [...prev, a])} onClose={() => setShowNew(false)} />
      )}
    </div>
  )
}

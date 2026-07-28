import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchAthletes, fetchAllEconomicRights, fetchAllClauses,
} from '../lib/athleteQueries'
import { bfrShare } from '../lib/ownership'
import OwnershipBar from '../components/OwnershipBar'
import PageHero from '../components/PageHero'
import type { Athlete, AthleteStatus, AthleteCategory, EconomicRight, Clause } from '../types/athlete-system'
import { ATHLETE_CATEGORY_LABELS } from '../types/athlete-system'

const font     = "var(--font-body)"
const fontMono = "var(--font-label)"

const STATUS_LABELS: Record<AthleteStatus, string> = {
  ATIVO:      'Ativo',
  EMPRESTADO: 'Emprestado',
  VENDIDO:    'Vendido',
  DESLIGADO:  'Desligado',
}

const STATUS_STYLE: Record<AthleteStatus, { bg: string; fg: string }> = {
  ATIVO:      { bg: '#e6ece2', fg: '#3a6f3a' },
  EMPRESTADO: { bg: 'var(--divider-strong)', fg: '#7a6244' },
  VENDIDO:    { bg: 'rgba(91,107,122,0.14)', fg: '#5b6b7a' },
  DESLIGADO:  { bg: 'rgba(156,163,175,0.20)', fg: '#6b7280' },
}

function getInitials(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0].toUpperCase()).slice(0, 2).join('')
}

function calcAge(birthDate: string | null): number | null {
  if (!birthDate) return null
  const b = new Date(birthDate + 'T12:00:00Z')
  if (Number.isNaN(b.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - b.getFullYear()
  const m = now.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--
  return age >= 0 && age < 120 ? age : null
}

// Foto grande da figurinha, com fallback para iniciais.
function StickerPhoto({ athlete }: { athlete: Athlete }) {
  const [err, setErr] = useState(false)
  const hasPhoto = athlete.profile_photo_url && !err
  return (
    <div style={{
      position: 'relative', width: '100%', aspectRatio: '3 / 4',
      background: 'linear-gradient(160deg, #2a2018 0%, #1a1410 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    }}>
      {hasPhoto ? (
        <img
          src={athlete.profile_photo_url!}
          alt={athlete.short_name}
          onError={() => setErr(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <span style={{
          fontFamily: fontMono, fontSize: 52, fontWeight: 700,
          color: 'var(--accent-line)', letterSpacing: '0.04em',
        }}>
          {getInitials(athlete.short_name)}
        </span>
      )}
      {/* Faixa de brilho dourada no topo, remete a card colecionável */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 4,
        background: 'linear-gradient(90deg, transparent, var(--accent), transparent)',
      }} />
    </div>
  )
}

interface CardProps {
  athlete: Athlete
  rights: EconomicRight[]
  activeClauses: number
  onOpen: () => void
}

function AthleteSticker({ athlete, rights, activeClauses, onOpen }: CardProps) {
  const [hover, setHover] = useState(false)
  const st = STATUS_STYLE[athlete.current_status]
  const age = calcAge(athlete.birth_date)
  const bfr = rights.length > 0 ? bfrShare(rights) : null

  return (
    <button
      onClick={onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', flexDirection: 'column', textAlign: 'left',
        background: 'var(--cream-card)', borderRadius: 14, overflow: 'hidden',
        border: `1px solid ${hover ? 'var(--gold)' : 'var(--divider-strong)'}`,
        boxShadow: hover
          ? '0 14px 34px rgba(0,0,0,0.20), 0 0 0 1px var(--divider-strong)'
          : '0 2px 10px rgba(0,0,0,0.07)',
        transform: hover ? 'translateY(-5px)' : 'translateY(0)',
        transition: 'transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease',
        cursor: 'pointer', padding: 0, font: 'inherit', width: '100%',
      }}
    >
      {/* Foto */}
      <div style={{ position: 'relative' }}>
        <StickerPhoto athlete={athlete} />
        {/* Badge de status sobreposto */}
        <span style={{
          position: 'absolute', top: 8, right: 8,
          padding: '3px 9px', borderRadius: 6, background: st.bg, color: st.fg,
          fontSize: 9, fontWeight: 700, fontFamily: fontMono, letterSpacing: '0.10em',
          textTransform: 'uppercase', boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
        }}>
          {STATUS_LABELS[athlete.current_status]}
        </span>
        {/* Posição sobreposta */}
        {athlete.position && (
          <span style={{
            position: 'absolute', bottom: 8, left: 8,
            padding: '3px 9px', borderRadius: 6,
            background: 'rgba(26,20,16,0.82)', color: 'var(--gold-soft, #d9b678)',
            fontSize: 9, fontWeight: 600, fontFamily: fontMono, letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            {athlete.position}
          </span>
        )}
      </div>

      {/* Informações */}
      <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div>
          <div style={{
            fontFamily: font, fontSize: 15, fontWeight: 700, color: 'var(--ink-primary)',
            lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {athlete.short_name}
          </div>
          <div style={{
            fontFamily: font, fontSize: 11, color: 'var(--text-muted)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minHeight: 14,
          }}>
            {athlete.full_name !== athlete.short_name ? athlete.full_name : ' '}
          </div>
        </div>

        {/* Info curta em pílulas */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {athlete.nationality && (
            <span style={pill}>{athlete.nationality}</span>
          )}
          {age !== null && (
            <span style={pill}>{age} anos</span>
          )}
          <span style={pill}>
            {activeClauses} {activeClauses === 1 ? 'cláusula' : 'cláusulas'}
          </span>
        </div>

        {/* Barra de titularidade + % Botafogo */}
        {rights.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <OwnershipBar rights={rights} compact showLegend={false} />
            {bfr !== null && (
              <div style={{ fontSize: 10, fontFamily: fontMono, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                Botafogo detém <span style={{ color: 'var(--gold-deep, #8a6a2f)', fontWeight: 700 }}>
                  {Number.isInteger(bfr) ? bfr : bfr.toFixed(1).replace('.', ',')}%
                </span>
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 10, fontFamily: fontMono, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
            Titularidade não cadastrada
          </div>
        )}
      </div>
    </button>
  )
}

const pill: React.CSSProperties = {
  padding: '2px 8px', borderRadius: 20, fontSize: 10, fontFamily: fontMono,
  background: 'var(--cream-inset)', border: '1px solid var(--divider-soft)',
  color: 'var(--text-secondary)', letterSpacing: '0.03em', whiteSpace: 'nowrap',
}

// Ordem de exibição das posições (agrupamento do álbum).
const POSITION_ORDER = [
  'Goleiro', 'Zagueiro', 'Lateral Direito', 'Lateral Esquerdo',
  'Volante', 'Meia', 'Meia-atacante', 'Atacante',
]
const NO_POSITION = 'Sem posição'

type OwnershipFilter = 'Todos' | 'COM_BFR' | 'SEM_BFR'

export default function PageAlbum() {
  const navigate = useNavigate()
  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  // Por padrão, o álbum mostra apenas atletas ATIVOS (dropdown permite alternar).
  const [filterStatus, setFilterStatus] = useState<AthleteStatus | 'Todos'>('ATIVO')
  const [filterCategory, setFilterCategory] = useState<AthleteCategory | 'Todos'>('Todos')
  const [filterPosition, setFilterPosition] = useState('Todos')
  const [filterNationality, setFilterNationality] = useState('Todos')
  const [filterOwnership, setFilterOwnership] = useState<OwnershipFilter>('Todos')
  const [rightsByAthlete, setRightsByAthlete] = useState<Record<string, EconomicRight[]>>({})
  const [clauses, setClauses] = useState<Clause[]>([])

  useEffect(() => {
    fetchAthletes().then(data => { setAthletes(data); setLoading(false) }).catch(() => setLoading(false))
    fetchAllEconomicRights().then(rows => {
      const map: Record<string, EconomicRight[]> = {}
      for (const r of rows) (map[r.athlete_id] ??= []).push(r)
      setRightsByAthlete(map)
    }).catch(() => {})
    fetchAllClauses().then(setClauses).catch(() => {})
  }, [])

  // Opções dinâmicas de posição e nacionalidade a partir dos dados.
  const positionOptions = useMemo(() => {
    const set = new Set<string>()
    athletes.forEach(a => { if (a.position) set.add(a.position) })
    const known = POSITION_ORDER.filter(p => set.has(p))
    const extra = Array.from(set).filter(p => !POSITION_ORDER.includes(p)).sort()
    return ['Todos', ...known, ...extra]
  }, [athletes])

  const nationalityOptions = useMemo(() => {
    const set = new Set<string>()
    athletes.forEach(a => { if (a.nationality) set.add(a.nationality) })
    return ['Todos', ...Array.from(set).sort()]
  }, [athletes])

  const filtered = useMemo(() => athletes.filter(a => {
    if (filterStatus !== 'Todos' && a.current_status !== filterStatus) return false
    if (filterCategory !== 'Todos' && (a.category ?? 'PROFISSIONAL') !== filterCategory) return false
    if (filterPosition !== 'Todos' && (a.position ?? NO_POSITION) !== filterPosition) return false
    if (filterNationality !== 'Todos' && a.nationality !== filterNationality) return false
    if (filterOwnership !== 'Todos') {
      const share = bfrShare(rightsByAthlete[a.id] ?? [])
      if (filterOwnership === 'COM_BFR' && share <= 0) return false
      if (filterOwnership === 'SEM_BFR' && share > 0) return false
    }
    if (search) {
      const q = search.toLowerCase()
      if (!a.full_name.toLowerCase().includes(q) && !a.short_name.toLowerCase().includes(q)) return false
    }
    return true
  }), [athletes, filterStatus, filterCategory, filterPosition, filterNationality, filterOwnership, rightsByAthlete, search])

  const activeClausesByAthlete = useMemo(() => {
    const map: Record<string, number> = {}
    for (const c of clauses) {
      if (['PAGA', 'CANCELADA'].includes(c.payment_status)) continue
      map[c.athlete_id] = (map[c.athlete_id] ?? 0) + 1
    }
    return map
  }, [clauses])

  // Agrupa os atletas filtrados por posição, na ordem tática.
  const groups = useMemo(() => {
    const byPos = new Map<string, Athlete[]>()
    for (const a of filtered) {
      const pos = a.position || NO_POSITION
      const arr = byPos.get(pos) ?? []
      arr.push(a); byPos.set(pos, arr)
    }
    const order = [...POSITION_ORDER, ...Array.from(byPos.keys()).filter(p => !POSITION_ORDER.includes(p) && p !== NO_POSITION).sort(), NO_POSITION]
    return order
      .filter(p => byPos.has(p))
      .map(pos => ({ pos, athletes: byPos.get(pos)!.sort((a, b) => a.short_name.localeCompare(b.short_name)) }))
  }, [filtered])

  const selWrap: React.CSSProperties = { display: 'flex', flexDirection: 'column' }
  const selLabel: React.CSSProperties = { fontSize: 9, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }
  const selStyle: React.CSSProperties = { padding: '8px 12px', borderRadius: 7, border: '1px solid var(--input-border)', background: 'var(--cream-card)', fontSize: 13, fontFamily: font, color: 'var(--ink-primary)' }

  return (
    <div style={{ padding: '24px 28px 32px', width: '100%', boxSizing: 'border-box' }}>
      <PageHero title="Álbum de Figurinhas" subtitle="Plantel · Botafogo SAF" />
      <div style={{ marginTop: -4, marginBottom: 24, fontSize: 12, color: 'var(--text-secondary)', fontFamily: font, maxWidth: 620 }}>
        Cada figurinha traz a foto do atleta e um resumo. Clique para abrir a ficha completa com contratos, cláusulas e titularidade.
      </div>

      {/* Toolbar de filtros */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={selLabel}>Busca</div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nome do atleta..."
            style={{ width: '100%', padding: '8px 12px', borderRadius: 7, border: '1px solid var(--input-border)', background: 'var(--cream-card)', fontSize: 13, fontFamily: font, color: 'var(--ink-primary)', boxSizing: 'border-box' }} />
        </div>
        <div style={selWrap}>
          <div style={selLabel}>Posição</div>
          <select value={filterPosition} onChange={e => setFilterPosition(e.target.value)} style={selStyle}>
            {positionOptions.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div style={selWrap}>
          <div style={selLabel}>Nacionalidade</div>
          <select value={filterNationality} onChange={e => setFilterNationality(e.target.value)} style={selStyle}>
            {nationalityOptions.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div style={selWrap}>
          <div style={selLabel}>Categoria</div>
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value as typeof filterCategory)} style={selStyle}>
            <option value="Todos">Todas</option>
            {(Object.keys(ATHLETE_CATEGORY_LABELS) as AthleteCategory[]).map(c => (
              <option key={c} value={c}>{ATHLETE_CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </div>
        <div style={selWrap}>
          <div style={selLabel}>Status</div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as typeof filterStatus)} style={selStyle}>
            <option value="Todos">Todos</option>
            {(['ATIVO','EMPRESTADO','VENDIDO','DESLIGADO'] as AthleteStatus[]).map(s => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
        <div style={selWrap}>
          <div style={selLabel}>Titularidade</div>
          <select value={filterOwnership} onChange={e => setFilterOwnership(e.target.value as OwnershipFilter)} style={selStyle}>
            <option value="Todos">Todas</option>
            <option value="COM_BFR">Com participação do Botafogo</option>
            <option value="SEM_BFR">Sem participação do Botafogo</option>
          </select>
        </div>
      </div>

      {/* Figurinhas agrupadas por posição */}
      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontFamily: fontMono, fontSize: 12, padding: 60 }}>
          Carregando...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontFamily: font, fontSize: 13, padding: 60 }}>
          Nenhum atleta encontrado com os filtros atuais.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {groups.map(g => (
            <section key={g.pos}>
              {/* Cabeçalho da posição */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--accent)', flexShrink: 0 }} />
                <h2 style={{ fontFamily: font, fontSize: 15, fontWeight: 700, color: 'var(--ink-primary)', margin: 0 }}>{g.pos}</h2>
                <span style={{ fontFamily: fontMono, fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.10em' }}>
                  {g.athletes.length} {g.athletes.length === 1 ? 'atleta' : 'atletas'}
                </span>
                <div style={{ flex: 1, height: 1, background: 'var(--divider-soft)' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 18 }}>
                {g.athletes.map(a => (
                  <AthleteSticker
                    key={a.id}
                    athlete={a}
                    rights={rightsByAthlete[a.id] ?? []}
                    activeClauses={activeClausesByAthlete[a.id] ?? 0}
                    onOpen={() => navigate(`/atletas/${a.id}`)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <div style={{ marginTop: 20, fontSize: 11, color: 'var(--text-muted)', fontFamily: fontMono }}>
        {filtered.length} {filtered.length !== 1 ? 'figurinhas' : 'figurinha'} · {groups.length} {groups.length === 1 ? 'posição' : 'posições'}
      </div>
    </div>
  )
}

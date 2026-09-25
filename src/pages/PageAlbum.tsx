import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchAthletes, fetchAllEconomicRights, fetchAllClauses,
} from '../lib/athleteQueries'
import { calcAge } from '../lib/format'
import { bfrShare } from '../lib/ownership'
import OwnershipBar from '../components/OwnershipBar'
import PageHero from '../components/PageHero'
import type { Athlete, AthleteStatus, AthleteCategory, EconomicRight, Clause } from '../types/athlete-system'
import { ATHLETE_CATEGORY_LABELS } from '../types/athlete-system'
import { ATHLETE_STATUS_TONE, badgeStyle } from '../lib/tones'

const font     = "var(--font-body)"
const fontMono = "var(--font-label)"

const STATUS_LABELS: Record<AthleteStatus, string> = {
  ATIVO:      'Ativo',
  EMPRESTADO: 'Emprestado',
  VENDIDO:    'Vendido',
  DESLIGADO:  'Desligado',
}



function getInitials(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0].toUpperCase()).slice(0, 2).join('')
}

// Foto grande da figurinha, com fallback para iniciais. Retrato do DS: sobre
// a placa creme com filete — o dispositivo mais reconhecível do sistema.
function StickerPhoto({ athlete }: { athlete: Athlete }) {
  const [err, setErr] = useState(false)
  const hasPhoto = athlete.profile_photo_url && !err
  return (
    <div style={{
      position: 'relative', width: '100%', aspectRatio: '3 / 4',
      background: 'var(--surface-accent)', borderRadius: 'var(--radius-md)',
      boxShadow: 'inset 0 0 0 1px var(--accent-line-soft)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    }}>
      {hasPhoto ? (
        <img
          src={athlete.profile_photo_url!}
          alt={athlete.short_name}
          onError={() => setErr(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }}
        />
      ) : (
        <span style={{
          fontSize: 'var(--text-metric-size)', fontWeight: 300, letterSpacing: '-.03em',
          color: 'var(--ink-900)',
        }}>
          {getInitials(athlete.short_name)}
        </span>
      )}
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
  const tone = ATHLETE_STATUS_TONE[athlete.current_status]
  const age = calcAge(athlete.birth_date)
  const bfr = rights.length > 0 ? bfrShare(rights) : null

  return (
    <button
      onClick={onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', flexDirection: 'column', textAlign: 'left',
        background: 'var(--surface-card)', borderRadius: 'var(--radius-card)', overflow: 'hidden',
        border: 'none',
        // DS: no hover a sombra sobe de --shadow-card para --shadow-raised, sem movimento
        boxShadow: hover ? 'var(--shadow-raised)' : 'var(--shadow-card)',
        transition: 'box-shadow var(--duration-base) var(--ease-out)',
        cursor: 'pointer', padding: 8, font: 'inherit', width: '100%',
      }}
    >
      {/* Foto */}
      <div style={{ position: 'relative' }}>
        <StickerPhoto athlete={athlete} />
        {/* Badge de status sobreposto */}
        <span style={{ ...badgeStyle(tone), position: 'absolute', top: 8, right: 8 }}>
          {STATUS_LABELS[athlete.current_status]}
        </span>
        {/* Posição sobreposta */}
        {athlete.position && (
          <span style={{ ...badgeStyle('inverse'), position: 'absolute', bottom: 8, left: 8 }}>
            {athlete.position}
          </span>
        )}
      </div>

      {/* Informações */}
      <div style={{ padding: '12px 6px 6px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <div style={{
            fontFamily: font, fontSize: 'var(--text-subtitle-size)', fontWeight: 400, letterSpacing: '-.01em', color: 'var(--ink-primary)',
            lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {athlete.short_name}
          </div>
          <div style={{
            fontFamily: font, fontSize: 'var(--text-body-sm-size)', color: 'var(--text-secondary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minHeight: 18, marginTop: 2,
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
              <div style={{ fontSize: 'var(--text-caption-size)', color: 'var(--text-secondary)' }}>
                Botafogo detém <span style={{ color: 'var(--text-positive)', fontWeight: 500 }}>
                  {Number.isInteger(bfr) ? bfr : bfr.toFixed(1).replace('.', ',')}%
                </span>
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 'var(--text-caption-size)', color: 'var(--text-secondary)' }}>
            Titularidade não cadastrada
          </div>
        )}
      </div>
    </button>
  )
}

const pill: React.CSSProperties = badgeStyle('neutral')

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
  const selLabel: React.CSSProperties = { fontSize: 10, fontFamily: fontMono, letterSpacing: 'var(--text-overline-tracking)', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }
  const selStyle: React.CSSProperties = { padding: '4px 10px', borderRadius: 'var(--ui-control-radius)', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--cream-card)', fontSize: 'var(--ui-text-size)', fontFamily: font, color: 'var(--ink-primary)' }

  return (
    <div style={{ padding: '24px 28px 32px', width: '100%', boxSizing: 'border-box' }}>
      <PageHero title="Portfolio de Atletas" subtitle="Plantel · Botafogo SAF"
        caption="Cada atleta traz foto e um resumo. Clique para abrir a ficha completa com contratos, cláusulas e titularidade." />

      {/* Toolbar de filtros */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={selLabel}>Busca</div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nome do atleta..."
            style={{ width: '100%', padding: '4px 10px', borderRadius: 'var(--ui-control-radius)', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--cream-card)', fontSize: 'var(--ui-text-size)', fontFamily: font, color: 'var(--ink-primary)', boxSizing: 'border-box' }} />
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
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontFamily: fontMono, fontSize: 12, padding: 60 }}>
          Carregando…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontFamily: font, fontSize: 13, padding: 60 }}>
          Nenhum atleta encontrado com os filtros atuais.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {groups.map(g => (
            <section key={g.pos}>
              {/* Cabeçalho da posição */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <h2 style={{ fontFamily: font, fontSize: 'var(--text-subtitle-size)', fontWeight: 400, letterSpacing: '-.01em', color: 'var(--ink-primary)', margin: 0 }}>{g.pos}</h2>
                <span style={badgeStyle('neutral')}>
                  {g.athletes.length} {g.athletes.length === 1 ? 'atleta' : 'atletas'}
                </span>
                <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 'var(--space-5)' }}>
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

      <div style={{ marginTop: 20, fontSize: 11, color: 'var(--text-secondary)', fontFamily: fontMono }}>
        {filtered.length} {filtered.length !== 1 ? 'figurinhas' : 'figurinha'} · {groups.length} {groups.length === 1 ? 'posição' : 'posições'}
      </div>
    </div>
  )
}

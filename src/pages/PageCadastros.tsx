// src/pages/PageCadastros.tsx
// Cadastro de Clubes ou Intermediários (lista). Cada registro tem escudo/logo
// (upload embutido) e sua própria página de detalhe. `kind` vem da rota.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchClubs, createClub, fetchAllClubLiabilities,
  fetchIntermediaries, createIntermediary, fetchAllIntermediaryLiabilities,
} from '../lib/athleteQueries'
import type { Club, Intermediary, NewClubInput, NewIntermediaryInput } from '../types/athlete-system'
import ImageUpload from '../components/ImageUpload'
import { fmtCurrencyShort } from '../lib/format'

const fontBody = "'Inter', system-ui, sans-serif"
const fontMono = "'IBM Plex Mono', monospace"

type Kind = 'clube' | 'intermediario'

interface Entry { id: string; name: string; sub: string | null; logo: string | null; count: number; totalBRL: number }

const APPROX_BRL: Record<string, number> = { BRL: 1, EUR: 6.10, USD: 5.55, GBP: 7.10 }

export default function PageCadastros({ kind }: { kind: Kind }) {
  const navigate = useNavigate()
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)

  const isClube = kind === 'clube'
  const title = isClube ? 'Clubes' : 'Intermediários'
  const basePath = isClube ? '/clubes' : '/intermediarios'

  async function load() {
    setLoading(true)
    if (isClube) {
      const [clubs, liabs] = await Promise.all([fetchClubs(), fetchAllClubLiabilities()])
      setEntries(clubs.map((c: Club) => {
        const rel = liabs.filter(l => l.club_name === c.name)
        return { id: c.id, name: c.name, sub: c.country, logo: c.logo_url, count: rel.length, totalBRL: rel.reduce((s, l) => s + l.amount * (APPROX_BRL[l.currency] ?? 1), 0) }
      }))
    } else {
      const [inters, liabs] = await Promise.all([fetchIntermediaries(), fetchAllIntermediaryLiabilities()])
      setEntries(inters.map((it: Intermediary) => {
        const rel = liabs.filter(l => l.intermediary_name === it.name)
        return { id: it.id, name: it.name, sub: it.contact, logo: it.logo_url, count: rel.length, totalBRL: rel.reduce((s, l) => s + l.amount * (APPROX_BRL[l.currency] ?? 1), 0) }
      }))
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [kind]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => entries.filter(e => e.name.toLowerCase().includes(search.toLowerCase())), [entries, search])

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1300, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 22 }}>
        <div>
          <div style={{ fontFamily: fontMono, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--gold-deep)', marginBottom: 6 }}>Cadastro</div>
          <h1 style={{ fontFamily: fontBody, fontSize: 24, fontWeight: 700, color: 'var(--ink-primary)', margin: 0 }}>{title}</h1>
          <div style={{ height: 2, width: 38, background: 'var(--gold)', borderRadius: 2, marginTop: 8 }} />
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..."
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--cream-card)', fontSize: 13, fontFamily: fontBody, color: 'var(--ink-primary)' }} />
          <button onClick={() => setShowNew(true)}
            style={{ padding: '9px 18px', background: 'var(--ink-primary)', border: 'none', borderRadius: 8, color: 'var(--gold-soft)', fontFamily: fontBody, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Adicionar {isClube ? 'clube' : 'intermediário'}
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)', fontFamily: fontMono, fontSize: 12 }}>Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)', fontFamily: fontBody }}>
          Nenhum {isClube ? 'clube' : 'intermediário'} cadastrado.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
          {filtered.map(e => (
            <div key={e.id} className="card" style={{ padding: 18, cursor: 'pointer', display: 'flex', gap: 14, alignItems: 'center' }}
              onClick={() => navigate(`${basePath}/${e.id}`)}>
              <div style={{ width: 52, height: 52, borderRadius: isClube ? 10 : '50%', overflow: 'hidden', background: 'var(--cream-inset)', border: '1px solid var(--divider-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {e.logo
                  ? <img src={e.logo} alt="" style={{ width: '100%', height: '100%', objectFit: isClube ? 'contain' : 'cover' }} />
                  : <span style={{ fontFamily: fontMono, fontSize: 16, fontWeight: 600, color: 'var(--gold-deep)' }}>{e.name.slice(0, 2).toUpperCase()}</span>}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontFamily: fontBody, fontSize: 15, fontWeight: 600, color: 'var(--ink-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</div>
                {e.sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: fontBody, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.sub}</div>}
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: fontMono, marginTop: 4 }}>
                  {e.count} passivo{e.count !== 1 ? 's' : ''} · {fmtCurrencyShort(e.totalBRL, 'BRL')}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showNew && <NewModal kind={kind} onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); load() }} />}
    </div>
  )
}

function NewModal({ kind, onClose, onSaved }: { kind: Kind; onClose: () => void; onSaved: () => void }) {
  const isClube = kind === 'clube'
  const [name, setName] = useState('')
  const [sub, setSub] = useState('')
  const [logo, setLogo] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 6, fontSize: 13, background: 'var(--cream-canvas)', border: '1px solid var(--input-border)', color: 'var(--ink-primary)', fontFamily: fontBody, boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontSize: 9, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 3, display: 'block' }

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    try {
      if (isClube) await createClub({ name: name.trim(), country: sub, logo_url: logo, notes } as NewClubInput)
      else await createIntermediary({ name: name.trim(), contact: sub, logo_url: logo, notes } as NewIntermediaryInput)
      onSaved()
    } finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,20,16,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--cream-card)', borderRadius: 12, padding: 26, width: 460, maxWidth: '96vw', border: '1px solid var(--divider)', boxShadow: 'var(--shadow-panel)', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-primary)', fontFamily: fontBody }}>Novo {isClube ? 'clube' : 'intermediário'}</div>
        <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
          <ImageUpload value={logo} onChange={setLogo} fallbackText={name} size={88} rounded={!isClube} maxSize={512} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div><label style={lbl}>Nome *</label><input style={inp} value={name} onChange={e => setName(e.target.value)} placeholder={isClube ? 'Ex: Benfica' : 'Ex: Agência XYZ'} /></div>
            <div><label style={lbl}>{isClube ? 'País' : 'Contato'}</label><input style={inp} value={sub} onChange={e => setSub(e.target.value)} /></div>
          </div>
        </div>
        <div><label style={lbl}>Observações</label><textarea style={{ ...inp, minHeight: 54, resize: 'vertical' }} value={notes} onChange={e => setNotes(e.target.value)} /></div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid var(--divider-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontFamily: fontBody, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={save} disabled={!name.trim() || saving} style={{ padding: '8px 22px', borderRadius: 7, border: 'none', background: name.trim() ? 'var(--ink-primary)' : '#ccc', color: 'var(--gold-soft)', fontSize: 12, fontFamily: fontBody, fontWeight: 600, cursor: name.trim() ? 'pointer' : 'not-allowed' }}>{saving ? 'Salvando...' : 'Criar'}</button>
        </div>
      </div>
    </div>
  )
}

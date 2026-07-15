// src/pages/PageCadastroDetail.tsx
// Página de um clube ou intermediário: escudo/logo (upload), dados e a lista de
// passivos vinculados (por nome) — todos derivados de atletas.

import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  fetchClub, updateClub, fetchIntermediary, updateIntermediary,
  fetchAllClubLiabilities, fetchAllIntermediaryLiabilities, fetchAthletes,
} from '../lib/athleteQueries'
import type { ClubLiability, IntermediaryLiability, Athlete } from '../types/athlete-system'
import { LIABILITY_STATUS_LABELS, LIABILITY_DIRECTION_LABELS } from '../types/athlete-system'
import ImageUpload from '../components/ImageUpload'
import { fmtCurrencyShort, fmtDate, isOverdue } from '../lib/format'
import { useAuth } from '../context/AuthContext'

const fontBody = "'Inter', system-ui, sans-serif"
const fontMono = "'IBM Plex Mono', monospace"

type Kind = 'clube' | 'intermediario'
type Liab = ClubLiability | IntermediaryLiability

export default function PageCadastroDetail({ kind }: { kind: Kind }) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const canEdit = !profile || profile.role === 'master' || profile.role === 'juridico'
  const isClube = kind === 'clube'
  const basePath = isClube ? '/clubes' : '/intermediarios'

  const [name, setName] = useState('')
  const [sub, setSub] = useState<string | null>(null)
  const [logo, setLogo] = useState<string | null>(null)
  const [notes, setNotes] = useState<string | null>(null)
  const [liabs, setLiabs] = useState<Liab[]>([])
  const [nameOf, setNameOf] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    const athletes = await fetchAthletes()
    setNameOf(new Map(athletes.map((a: Athlete) => [a.id, a.short_name || a.full_name])))
    if (isClube) {
      const c = await fetchClub(id)
      if (!c) { setNotFound(true); setLoading(false); return }
      setName(c.name); setSub(c.country); setLogo(c.logo_url); setNotes(c.notes)
      const all = await fetchAllClubLiabilities()
      setLiabs(all.filter(l => l.club_name === c.name))
    } else {
      const it = await fetchIntermediary(id)
      if (!it) { setNotFound(true); setLoading(false); return }
      setName(it.name); setSub(it.contact); setLogo(it.logo_url); setNotes(it.notes)
      const all = await fetchAllIntermediaryLiabilities()
      setLiabs(all.filter(l => l.intermediary_name === it.name))
    }
    setLoading(false)
  }, [id, isClube])

  useEffect(() => { load() }, [load])

  async function saveLogo(url: string | null) {
    setLogo(url)
    if (!id) return
    if (isClube) await updateClub(id, { logo_url: url })
    else await updateIntermediary(id, { logo_url: url })
  }

  async function saveMeta() {
    if (!id || !name.trim()) return
    setSaving(true)
    try {
      if (isClube) await updateClub(id, { name: name.trim(), country: sub, notes })
      else await updateIntermediary(id, { name: name.trim(), contact: sub, notes })
      setEditing(false)
      await load()
    } finally { setSaving(false) }
  }

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)', fontFamily: fontMono, fontSize: 12 }}>CARREGANDO...</div>
  if (notFound) return (
    <div style={{ padding: 40, textAlign: 'center', fontFamily: fontBody }}>
      <div style={{ color: 'var(--text-muted)' }}>Registro não encontrado.</div>
      <button onClick={() => navigate(basePath)} style={{ marginTop: 16, padding: '8px 20px', borderRadius: 7, border: '1px solid var(--divider-strong)', background: 'transparent', cursor: 'pointer', fontFamily: fontBody }}>← Voltar</button>
    </div>
  )

  const th: React.CSSProperties = { padding: '9px 12px', fontSize: 9, fontWeight: 500, textTransform: 'uppercase', background: 'var(--tbl-head)', color: 'var(--ink-secondary)', borderBottom: '1px solid var(--divider-strong)', fontFamily: fontMono, letterSpacing: '0.16em', textAlign: 'left', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '10px 12px', fontSize: 12, color: 'var(--ink-primary)', fontFamily: fontBody, borderBottom: '1px solid var(--divider-soft)', verticalAlign: 'middle' }

  const total = liabs.reduce((s, l) => s + l.amount, 0)

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 16, fontSize: 12, color: 'var(--text-muted)', fontFamily: fontBody }}>
        <Link to={basePath} style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>{isClube ? 'Clubes' : 'Agentes'}</Link>
        <span style={{ margin: '0 6px' }}>/</span>
        <span style={{ color: 'var(--ink-primary)' }}>{name}</span>
      </div>

      {/* Cabeçalho com logo */}
      <div className="card" style={{ padding: '22px 26px', marginBottom: 18, display: 'flex', gap: 22, alignItems: 'center', flexWrap: 'wrap' }}>
        <ImageUpload value={logo} onChange={saveLogo} fallbackText={name} size={96} rounded={!isClube} editable={canEdit} />
        <div style={{ flex: 1, minWidth: 220 }}>
          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 460 }}>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome"
                style={{ padding: '8px 10px', borderRadius: 6, fontSize: 16, fontWeight: 600, background: 'var(--cream-canvas)', border: '1px solid var(--input-border)', color: 'var(--ink-primary)', fontFamily: fontBody }} />
              <input value={sub ?? ''} onChange={e => setSub(e.target.value)} placeholder={isClube ? 'País' : 'Contato'}
                style={{ padding: '7px 10px', borderRadius: 6, fontSize: 13, background: 'var(--cream-canvas)', border: '1px solid var(--input-border)', color: 'var(--ink-primary)', fontFamily: fontBody }} />
              <textarea value={notes ?? ''} onChange={e => setNotes(e.target.value)} placeholder="Observações"
                style={{ padding: '7px 10px', borderRadius: 6, fontSize: 12, minHeight: 48, resize: 'vertical', background: 'var(--cream-canvas)', border: '1px solid var(--input-border)', color: 'var(--ink-primary)', fontFamily: fontBody }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={saveMeta} disabled={saving || !name.trim()} style={{ padding: '7px 18px', borderRadius: 7, border: 'none', background: 'var(--ink-primary)', color: 'var(--gold-soft)', fontSize: 12, fontWeight: 600, fontFamily: fontBody, cursor: 'pointer' }}>{saving ? 'Salvando...' : 'Salvar'}</button>
                <button onClick={() => { setEditing(false); load() }} style={{ padding: '7px 16px', borderRadius: 7, border: '1px solid var(--divider-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontFamily: fontBody, cursor: 'pointer' }}>Cancelar</button>
              </div>
            </div>
          ) : (
            <>
              <h1 style={{ fontFamily: fontBody, fontSize: 24, fontWeight: 700, color: 'var(--ink-primary)', margin: '0 0 4px' }}>{name}</h1>
              {sub && <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: fontBody }}>{isClube ? sub : `Contato: ${sub}`}</div>}
              {notes && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)', fontFamily: fontBody, background: 'var(--bg-subtle)', borderRadius: 6, padding: '6px 10px' }}>{notes}</div>}
              {canEdit && <button onClick={() => setEditing(true)} style={{ marginTop: 10, padding: '5px 14px', borderRadius: 6, border: '1px solid var(--divider-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 11, fontFamily: fontBody, cursor: 'pointer' }}>Editar</button>}
            </>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 9, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Passivos vinculados</div>
          <div style={{ fontSize: 22, fontWeight: 600, fontFamily: fontMono, color: 'var(--ink-primary)' }}>{liabs.length}</div>
        </div>
      </div>

      {/* Passivos vinculados */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--divider-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink-primary)', fontFamily: fontBody }}>Passivos vinculados</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: fontMono }}>Total: {fmtCurrencyShort(total)}</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
            <thead>
              <tr>
                <th style={th}>Atleta</th>
                <th style={th}>Descrição</th>
                <th style={th}>Direção</th>
                <th style={{ ...th, textAlign: 'right' }}>Valor</th>
                <th style={th}>Vencimento</th>
                <th style={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {liabs.length === 0 && <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Nenhum passivo vinculado a este {isClube ? 'clube' : 'agente'}.</td></tr>}
              {liabs.map(l => (
                <tr key={l.id}>
                  <td style={{ ...td, fontWeight: 600 }}>{nameOf.get(l.athlete_id) ?? '—'}</td>
                  <td style={{ ...td, color: 'var(--text-secondary)', maxWidth: 320 }}>{l.description ?? '—'}</td>
                  <td style={{ ...td, fontFamily: fontMono, fontSize: 11 }}>{LIABILITY_DIRECTION_LABELS[l.direction]}</td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: fontMono }}>{fmtCurrencyShort(l.amount, l.currency)}</td>
                  <td style={{ ...td, fontFamily: fontMono, fontSize: 12, color: l.due_date && isOverdue(l.due_date, l.status) ? 'var(--neg)' : 'var(--text-secondary)' }}>{l.due_date ? fmtDate(l.due_date) : '—'}</td>
                  <td style={td}>
                    <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 5, fontSize: 9, fontWeight: 600, fontFamily: fontMono, letterSpacing: '0.08em', textTransform: 'uppercase', background: l.status === 'PAGA' ? 'var(--pos-tint)' : l.status === 'EM_ATRASO' ? 'var(--neg-tint)' : 'var(--cream-inset)', color: l.status === 'PAGA' ? 'var(--pos)' : l.status === 'EM_ATRASO' ? 'var(--neg)' : 'var(--ink-secondary)' }}>
                      {LIABILITY_STATUS_LABELS[l.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

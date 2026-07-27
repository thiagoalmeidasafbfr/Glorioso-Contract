// src/pages/PageCadastros.tsx
// Cadastro de Clubes ou Intermediários (lista). Cada registro tem escudo/logo
// (upload embutido) e sua própria página de detalhe. `kind` vem da rota.
//
// Os contadores do card usam O MESMO cálculo da página de detalhe
// (lib/entityObligations): obrigações vêm das cláusulas financeiras cuja
// contraparte é a entidade (expandidas em parcelas) e dos passivos flat. Contar
// só os passivos flat — como antes — zerava clubes que têm obrigações reais.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchClubs, createClub, fetchAllClubLiabilities,
  fetchIntermediaries, createIntermediary, fetchAllIntermediaryLiabilities,
  fetchAllClauses, fetchAllInstallments,
} from '../lib/athleteQueries'
import type { Club, Intermediary, NewClubInput, NewIntermediaryInput, Currency } from '../types/athlete-system'
import { CLAUSE_TYPE_LABELS } from '../types/athlete-system'
import { buildEntityObligations, isOpenStatus } from '../lib/entityObligations'
import ImageUpload from '../components/ImageUpload'
import PageHero from '../components/PageHero'
import { Icon } from '../components/Icon'
import { fmtCurrencyShort } from '../lib/format'
import { ModalShell } from '../components/modals/EditModals'
import { modalInput, modalLabel } from '../components/modals/styles'

const fontBody = "'Inter', system-ui, sans-serif"
const fontMono = "'IBM Plex Mono', monospace"

type Kind = 'clube' | 'intermediario'

interface Entry {
  id: string; name: string; sub: string | null; logo: string | null
  count: number; openCount: number
  totalBRL: number; openBRL: number
  athletes: number
}

const APPROX_BRL: Record<string, number> = { BRL: 1, EUR: 6.10, USD: 5.55, GBP: 7.10 }
const toBRL = (v: number, c: Currency) => v * (APPROX_BRL[c] ?? 1)

export default function PageCadastros({ kind }: { kind: Kind }) {
  const navigate = useNavigate()
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [sort, setSort] = useState<'nome' | 'valor'>('nome')

  const isClube = kind === 'clube'
  const title = isClube ? 'Clubes' : 'Agentes'
  const basePath = isClube ? '/clubes' : '/intermediarios'

  async function load() {
    setLoading(true)
    const [clauses, installments] = await Promise.all([fetchAllClauses(), fetchAllInstallments()])
    if (isClube) {
      const [clubs, liabs] = await Promise.all([fetchClubs(), fetchAllClubLiabilities()])
      setEntries(clubs.map((c: Club) => {
        const rows = buildEntityObligations({
          entityName: c.name, kind, clauses, installments, clubLiabs: liabs, labels: CLAUSE_TYPE_LABELS,
        })
        return { id: c.id, name: c.name, sub: c.country, logo: c.logo_url, ...summarize(rows) }
      }))
    } else {
      const [inters, liabs] = await Promise.all([fetchIntermediaries(), fetchAllIntermediaryLiabilities()])
      setEntries(inters.map((it: Intermediary) => {
        const rows = buildEntityObligations({
          entityName: it.name, kind, clauses, installments, intermLiabs: liabs, labels: CLAUSE_TYPE_LABELS,
        })
        return { id: it.id, name: it.name, sub: it.contact, logo: it.logo_url, ...summarize(rows) }
      }))
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [kind]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const list = entries.filter(e => e.name.toLowerCase().includes(search.toLowerCase()))
    return sort === 'valor'
      ? [...list].sort((a, b) => b.openBRL - a.openBRL || b.totalBRL - a.totalBRL)
      : [...list].sort((a, b) => a.name.localeCompare(b.name))
  }, [entries, search, sort])

  const totalOpen = filtered.reduce((s, e) => s + e.openBRL, 0)

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1300, margin: '0 auto' }}>
      <PageHero title={title} subtitle="Cadastro · Botafogo SAF">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." aria-label="Buscar"
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.08)', fontSize: 13, fontFamily: fontBody, color: 'var(--on-dark)' }} />
        <button onClick={() => setShowNew(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: 'var(--on-dark)', border: 'none', borderRadius: 8, color: 'var(--ink-primary)', fontFamily: fontBody, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <Icon name="plus" size={14} /> {isClube ? 'Clube' : 'Agente'}
        </button>
      </PageHero>

      {/* Resumo + ordenação */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: fontMono, fontSize: 11.5, color: 'var(--text-muted)' }}>
          {filtered.length} {isClube ? 'clube(s)' : 'agente(s)'} · em aberto (aprox.) <strong style={{ color: 'var(--ink-primary)' }}>{fmtCurrencyShort(totalOpen, 'BRL')}</strong>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontFamily: fontMono, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Ordenar</span>
          {(['nome', 'valor'] as const).map(s => (
            <button key={s} onClick={() => setSort(s)}
              style={{
                padding: '5px 12px', borderRadius: 7, fontSize: 11.5, fontFamily: fontBody, fontWeight: 600, cursor: 'pointer',
                border: '1px solid var(--divider-strong)',
                background: sort === s ? 'var(--accent)' : 'transparent',
                color: sort === s ? 'var(--accent-on)' : 'var(--ink-primary)',
              }}>{s === 'nome' ? 'Nome' : 'Valor em aberto'}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)', fontFamily: fontMono, fontSize: 12 }}>Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)', fontFamily: fontBody }}>
          Nenhum {isClube ? 'clube' : 'agente'} cadastrado.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {filtered.map(e => (
            <div key={e.id} className="card" role="button" tabIndex={0}
              style={{ padding: 16, cursor: 'pointer', display: 'flex', gap: 14, alignItems: 'center' }}
              onClick={() => navigate(`${basePath}/${e.id}`)}
              onKeyDown={ev => { if (ev.key === 'Enter') navigate(`${basePath}/${e.id}`) }}>
              <div style={{ width: 52, height: 52, borderRadius: isClube ? 10 : '50%', overflow: 'hidden', background: 'var(--cream-inset)', border: '1px solid var(--divider)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {e.logo
                  ? <img src={e.logo} alt="" style={{ width: '100%', height: '100%', objectFit: isClube ? 'contain' : 'cover' }} />
                  : <span style={{ fontFamily: fontMono, fontSize: 15, fontWeight: 700, color: 'var(--ink-secondary)' }}>{e.name.slice(0, 2).toUpperCase()}</span>}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontFamily: fontBody, fontSize: 15, fontWeight: 600, color: 'var(--ink-primary)', lineHeight: 1.25, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{e.name}</div>
                {e.sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: fontBody, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.sub}</div>}
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: fontMono, marginTop: 5 }}>
                  {e.count} obrigaç{e.count === 1 ? 'ão' : 'ões'}
                  {e.athletes > 0 && <> · {e.athletes} atleta{e.athletes === 1 ? '' : 's'}</>}
                </div>
                <div style={{ fontSize: 12, fontFamily: fontMono, fontWeight: 700, color: e.openBRL > 0 ? 'var(--ink-primary)' : 'var(--text-muted)', marginTop: 2 }}>
                  {fmtCurrencyShort(e.openBRL, 'BRL')}
                  <span style={{ fontWeight: 400, fontSize: 10, color: 'var(--text-muted)' }}> em aberto</span>
                </div>
              </div>
              <Icon name="chevronRight" size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            </div>
          ))}
        </div>
      )}

      {showNew && <NewModal kind={kind} onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); load() }} />}
    </div>
  )
}

function summarize(rows: ReturnType<typeof buildEntityObligations>) {
  let totalBRL = 0, openBRL = 0, openCount = 0
  const athletes = new Set<string>()
  for (const r of rows) {
    totalBRL += toBRL(r.amount, r.currency)
    if (isOpenStatus(r.status)) { openBRL += toBRL(r.amount, r.currency); openCount++ }
    athletes.add(r.athlete_id)
  }
  return { count: rows.length, openCount, totalBRL, openBRL, athletes: athletes.size }
}

function NewModal({ kind, onClose, onSaved }: { kind: Kind; onClose: () => void; onSaved: () => void }) {
  const isClube = kind === 'clube'
  const [name, setName] = useState('')
  const [sub, setSub] = useState('')
  const [logo, setLogo] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

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
    <ModalShell title={`Novo ${isClube ? 'clube' : 'agente'}`} width={470} onClose={onClose}
      footer={<>
        <button onClick={onClose} className="btn btn-outline">Cancelar</button>
        <button onClick={save} className="btn btn-primary" disabled={!name.trim() || saving}>{saving ? 'Salvando...' : 'Criar'}</button>
      </>}>
      <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
        <ImageUpload value={logo} onChange={setLogo} fallbackText={name} size={88} rounded={!isClube} maxSize={512} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><label style={modalLabel}>Nome *</label><input style={modalInput} value={name} onChange={e => setName(e.target.value)} placeholder={isClube ? 'Ex: Benfica' : 'Ex: Agência XYZ'} /></div>
          <div><label style={modalLabel}>{isClube ? 'País' : 'Contato'}</label><input style={modalInput} value={sub} onChange={e => setSub(e.target.value)} /></div>
        </div>
      </div>
      <div><label style={modalLabel}>Observações</label><textarea style={{ ...modalInput, minHeight: 54, resize: 'vertical' }} value={notes} onChange={e => setNotes(e.target.value)} /></div>
    </ModalShell>
  )
}

// src/components/EntityPicker.tsx
// Seletor de clube ou intermediário com opção de CRIAR um novo na hora — o novo
// registro já entra no cadastro de Clubes/Intermediários (interligado). Devolve
// o NOME selecionado (que é a chave usada pelos passivos) e, opcionalmente, a
// entidade completa criada/selecionada.

import { useEffect, useState } from 'react'
import {
  fetchClubs, createClub, fetchIntermediaries, createIntermediary,
} from '../lib/athleteQueries'
import type { Club, Intermediary } from '../types/athlete-system'

const fontBody = "'Inter', system-ui, sans-serif"
const fontMono = "'IBM Plex Mono', monospace"

type Kind = 'clube' | 'intermediario'
interface Entity { id: string; name: string; sub: string }

interface Props {
  kind: Kind
  value: string
  onChange: (name: string, sub?: string) => void
  label?: string
  placeholder?: string
}

export default function EntityPicker({ kind, value, onChange, label, placeholder }: Props) {
  const isClube = kind === 'clube'
  const [list, setList] = useState<Entity[]>([])
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newSub, setNewSub] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    if (isClube) {
      const cs = await fetchClubs()
      setList(cs.map((c: Club) => ({ id: c.id, name: c.name, sub: c.country ?? '' })))
    } else {
      const is = await fetchIntermediaries()
      setList(is.map((i: Intermediary) => ({ id: i.id, name: i.name, sub: i.contact ?? '' })))
    }
  }
  useEffect(() => { load() }, [kind]) // eslint-disable-line react-hooks/exhaustive-deps

  async function createNow() {
    const name = newName.trim()
    if (!name) return
    setBusy(true)
    try {
      if (isClube) await createClub({ name, country: newSub, logo_url: null, notes: '' })
      else await createIntermediary({ name, contact: newSub, logo_url: null, notes: '' })
      await load()
      onChange(name, newSub)
      setCreating(false); setNewName(''); setNewSub('')
    } finally { setBusy(false) }
  }

  const inp: React.CSSProperties = {
    width: '100%', background: 'rgba(255,255,255,0.60)', border: '1px solid rgba(26,20,16,0.15)',
    borderRadius: 7, padding: '8px 10px', fontSize: 13, color: '#1a1410', fontFamily: fontBody, boxSizing: 'border-box',
  }
  const lblStyle: React.CSSProperties = {
    fontFamily: fontMono, fontSize: 10, fontWeight: 500, letterSpacing: '0.12em',
    textTransform: 'uppercase', color: 'rgba(26,20,16,0.50)', display: 'block', marginBottom: 4,
  }

  return (
    <div>
      {label && <label style={lblStyle}>{label}</label>}
      {!creating ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={value} onChange={e => {
            const name = e.target.value
            const found = list.find(x => x.name === name)
            onChange(name, found?.sub)
          }} style={{ ...inp, flex: 1 }}>
            <option value="">{placeholder ?? (isClube ? '— selecione o clube —' : '— selecione o intermediário —')}</option>
            {list.map(x => <option key={x.id} value={x.name}>{x.name}{x.sub ? ` (${x.sub})` : ''}</option>)}
          </select>
          <button type="button" onClick={() => { setCreating(true); setNewName('') }}
            style={{ flexShrink: 0, padding: '0 14px', borderRadius: 7, border: '1px solid rgba(190,140,74,0.40)', background: 'rgba(190,140,74,0.10)', color: '#be8c4a', fontFamily: fontBody, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            + Novo
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 8, border: '1px solid rgba(190,140,74,0.30)', background: 'rgba(190,140,74,0.06)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input autoFocus style={inp} value={newName} onChange={e => setNewName(e.target.value)} placeholder={isClube ? 'Nome do clube' : 'Nome do intermediário'} />
            <input style={inp} value={newSub} onChange={e => setNewSub(e.target.value)} placeholder={isClube ? 'País (opcional)' : 'Contato (opcional)'} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => setCreating(false)} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid rgba(26,20,16,0.15)', background: 'transparent', color: 'rgba(26,20,16,0.55)', fontSize: 12, fontFamily: fontBody, cursor: 'pointer' }}>Cancelar</button>
            <button type="button" onClick={createNow} disabled={!newName.trim() || busy} style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: newName.trim() ? '#be8c4a' : '#ccc', color: '#fff', fontSize: 12, fontWeight: 600, fontFamily: fontBody, cursor: newName.trim() ? 'pointer' : 'not-allowed' }}>{busy ? 'Criando...' : 'Criar e selecionar'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

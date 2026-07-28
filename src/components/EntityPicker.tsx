// src/components/EntityPicker.tsx
// Seletor de clube ou intermediário com busca ao digitar. Se ao digitar o nome
// não aparecer nenhum registro na lista, oferece criar o cadastro na hora — o
// novo registro já entra em Clubes/Agentes. Devolve o NOME selecionado (chave
// usada pelos passivos) e, opcionalmente, o sub (país ou contato) associado.

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchClubs, createClub, fetchIntermediaries, createIntermediary,
} from '../lib/athleteQueries'
import type { Club, Intermediary } from '../types/athlete-system'

const fontBody = "var(--font-body)"
const fontMono = "var(--font-label)"

type Kind = 'clube' | 'intermediario'
interface Entity { id: string; name: string; sub: string }

interface Props {
  kind: Kind
  value: string
  onChange: (name: string, sub?: string) => void
  label?: string
  placeholder?: string
}

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export default function EntityPicker({ kind, value, onChange, label, placeholder }: Props) {
  const isClube = kind === 'clube'
  const [list, setList] = useState<Entity[]>([])
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newSub, setNewSub] = useState('')
  const [busy, setBusy] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

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

  // Sincroniza o campo com o value externo (edição de item já salvo).
  useEffect(() => { setQuery(value) }, [value])

  // Fecha o dropdown ao clicar fora do componente.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current) return
      if (!wrapRef.current.contains(e.target as Node)) { setOpen(false); setCreating(false) }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const filtered = useMemo(() => {
    const q = norm(query)
    if (!q) return list.slice(0, 30)
    return list.filter(x => norm(x.name).includes(q) || norm(x.sub).includes(q)).slice(0, 30)
  }, [list, query])

  const exact = useMemo(() => {
    const q = norm(query)
    if (!q) return null
    return list.find(x => norm(x.name) === q) ?? null
  }, [list, query])

  async function createNow() {
    const name = query.trim()
    if (!name) return
    setBusy(true)
    try {
      if (isClube) await createClub({ name, country: newSub, logo_url: null, notes: '' })
      else await createIntermediary({ name, contact: newSub, logo_url: null, notes: '' })
      await load()
      onChange(name, newSub)
      setCreating(false); setNewSub(''); setOpen(false)
    } finally { setBusy(false) }
  }

  function selectItem(x: Entity) {
    setQuery(x.name)
    onChange(x.name, x.sub)
    setOpen(false)
    setCreating(false)
  }

  const inp: React.CSSProperties = {
    width: '100%', background: 'rgba(255,255,255,0.60)', border: '1px solid rgba(26,20,16,0.15)',
    borderRadius: 7, padding: '8px 10px', fontSize: 13, color: '#1a1410', fontFamily: fontBody, boxSizing: 'border-box',
  }
  const lblStyle: React.CSSProperties = {
    fontFamily: fontMono, fontSize: 10, fontWeight: 500, letterSpacing: '0.12em',
    textTransform: 'uppercase', color: 'rgba(26,20,16,0.50)', display: 'block', marginBottom: 4,
  }

  const placeholderText = placeholder ?? (isClube ? 'Buscar clube...' : 'Buscar agente...')

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {label && <label style={lblStyle}>{label}</label>}
      <input
        type="text"
        style={inp}
        value={query}
        placeholder={placeholderText}
        onFocus={() => setOpen(true)}
        onChange={e => {
          setQuery(e.target.value)
          setOpen(true)
          setCreating(false)
          // Enquanto digita, propaga o nome (para validação do form) — o sub só
          // é resolvido ao clicar num item ou criar um novo.
          onChange(e.target.value)
        }}
      />

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 20,
          background: 'var(--cream-card)', border: '1px solid var(--divider-strong)',
          borderRadius: 8, boxShadow: '0 8px 24px -8px rgba(0,0,0,0.20)',
          maxHeight: 280, overflowY: 'auto',
        }}>
          {filtered.length > 0 && (
            <div>
              {filtered.map(x => (
                <button
                  key={x.id}
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => selectItem(x)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', border: 'none',
                    background: x.name === value ? 'var(--accent-tint2)' : 'transparent',
                    padding: '8px 12px', cursor: 'pointer', fontFamily: fontBody, fontSize: 13,
                    color: 'var(--ink-primary)', borderBottom: '1px solid var(--divider-soft)',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-tint)')}
                  onMouseLeave={e => (e.currentTarget.style.background = x.name === value ? 'var(--accent-tint2)' : 'transparent')}
                >
                  <div style={{ fontWeight: 500 }}>{x.name}</div>
                  {x.sub && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{x.sub}</div>}
                </button>
              ))}
            </div>
          )}

          {/* Nada encontrado — oferece criar. */}
          {query.trim() && !exact && !creating && (
            <button
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => setCreating(true)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', border: 'none',
                background: 'var(--accent-tint)', padding: '10px 12px', cursor: 'pointer',
                fontFamily: fontBody, fontSize: 13, color: 'var(--accent)', fontWeight: 600,
              }}>
              + Cadastrar {isClube ? 'novo clube' : 'novo agente'} "{query.trim()}"
            </button>
          )}

          {filtered.length === 0 && !query.trim() && (
            <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)', fontFamily: fontBody }}>
              Nenhum {isClube ? 'clube' : 'agente'} cadastrado ainda.
            </div>
          )}

          {creating && (
            <div style={{ padding: 12, borderTop: '1px solid var(--divider-soft)', background: 'var(--accent-tint)' }}>
              <div style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 8 }}>
                Novo {isClube ? 'clube' : 'agente'}
              </div>
              <div style={{ fontFamily: fontBody, fontSize: 13, color: 'var(--ink-primary)', marginBottom: 8 }}>
                Nome: <strong>{query.trim()}</strong>
              </div>
              <input
                style={{ ...inp, marginBottom: 8 }}
                value={newSub}
                onChange={e => setNewSub(e.target.value)}
                placeholder={isClube ? 'País (opcional)' : 'Contato (opcional)'}
                onMouseDown={e => e.stopPropagation()}
              />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" onMouseDown={e => e.preventDefault()}
                  onClick={() => { setCreating(false); setNewSub('') }}
                  style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid rgba(26,20,16,0.15)', background: 'transparent', color: 'rgba(26,20,16,0.55)', fontSize: 12, fontFamily: fontBody, cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button type="button" onMouseDown={e => e.preventDefault()}
                  onClick={createNow} disabled={!query.trim() || busy}
                  style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: query.trim() ? 'var(--accent)' : '#ccc', color: '#fff', fontSize: 12, fontWeight: 600, fontFamily: fontBody, cursor: query.trim() ? 'pointer' : 'not-allowed' }}>
                  {busy ? 'Criando...' : 'Criar e selecionar'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// src/components/athletes/ClubeAtual.tsx
// "Clube atual" do atleta (ac_atletas.entidade_clube_atual_id → ac_entidades).
// Seletor para o modal de edição e rótulo para o cabeçalho da ficha.

import { useEffect, useState } from 'react'
import { fetchClubs } from '../../lib/athleteQueries'
import type { Club } from '../../types/athlete-system'

let cache: Promise<Club[]> | null = null
function clubs(): Promise<Club[]> {
  if (!cache) cache = fetchClubs().catch(() => { cache = null; return [] })
  return cache
}

export function ClubeAtualSelect({ value, onChange, style, id }: {
  value: string; onChange: (id: string) => void; style?: React.CSSProperties; id?: string
}) {
  const [list, setList] = useState<Club[]>([])
  useEffect(() => { let alive = true; void clubs().then(l => { if (alive) setList(l) }); return () => { alive = false } }, [])
  return (
    <select id={id} style={style} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">—</option>
      {list.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  )
}

export function ClubeAtualLabel({ clubId }: { clubId: string | null | undefined }) {
  const [name, setName] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    if (clubId) void clubs().then(l => { if (alive) setName(l.find(c => c.id === clubId)?.name ?? null) })
    return () => { alive = false }
  }, [clubId])
  if (!clubId) return null
  return <>{name ?? '…'}</>
}

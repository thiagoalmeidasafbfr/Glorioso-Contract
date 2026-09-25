// src/components/AthleteAvatar.tsx
// Retrato do atleta no padrão do DS: quadrado, raio 8, sobre a placa creme com
// filete; sem foto (ou com a foto quebrada), as iniciais do nome curto.
// `maxWidth: none` anula o `max-width: 100%` do preflight: com ele a imagem não
// entra na largura mínima da célula e o nome ao lado invade a coluna vizinha.

import { useState } from 'react'
import type { Athlete } from '../types/athlete-system'

function getInitials(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0].toUpperCase()).slice(0, 2).join('')
}

export default function AthleteAvatar({ athlete, size = 38 }: {
  athlete: Pick<Athlete, 'short_name' | 'profile_photo_url'>; size?: number
}) {
  const [err, setErr] = useState(false)
  if (athlete.profile_photo_url && !err) {
    return (
      <img src={athlete.profile_photo_url} alt={athlete.short_name}
        onError={() => setErr(true)}
        style={{
          width: size, height: size, maxWidth: 'none', borderRadius: 'var(--radius-sm)', objectFit: 'cover', objectPosition: 'center top', flexShrink: 0,
          background: 'var(--surface-accent)', boxShadow: 'inset 0 0 0 1px var(--accent-line)',
        }} />
    )
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: 'var(--radius-sm)', flexShrink: 0,
      background: 'var(--surface-accent)', boxShadow: 'inset 0 0 0 1px var(--accent-line)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.34, fontWeight: 500, color: 'var(--ink-900)',
    }}>
      {getInitials(athlete.short_name)}
    </div>
  )
}

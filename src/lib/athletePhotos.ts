// src/lib/athletePhotos.ts
// Foto do atleta para avatares e figurinhas. A lista de atletas vem SEM as
// fotos (ver fetchAthletes); aqui elas são baixadas uma vez, juntas, e
// compartilhadas por todos os avatares da tela (cache em lib/queryCache).
// Se o objeto já traz a foto (fetchAthlete, modo local), usa essa.

import { useEffect, useState } from 'react'
import { USE_SUPABASE } from './supabase'
import { fetchAthletePhotos } from './athleteQueries'
import type { Athlete } from '../types/athlete-system'

export function useAthletePhoto(athlete: Pick<Athlete, 'id' | 'profile_photo_url'>): string | null {
  const direct = athlete.profile_photo_url
  const [loaded, setLoaded] = useState<{ id: string; url: string | null } | null>(null)

  useEffect(() => {
    if (direct || !USE_SUPABASE) return
    let alive = true
    fetchAthletePhotos()
      .then(photos => { if (alive) setLoaded({ id: athlete.id, url: photos.get(athlete.id) ?? null }) })
      .catch(() => { /* sem foto: o avatar mostra as iniciais */ })
    return () => { alive = false }
  }, [athlete.id, direct])

  return direct ?? (loaded?.id === athlete.id ? loaded.url : null)
}

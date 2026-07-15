// src/components/ImageUpload.tsx
// Upload de imagem (foto de atleta / escudo de clube / logo de intermediário).
// Redimensiona no cliente e entrega uma data URL via onChange. Sem dependências
// externas nem bucket. Estilo sóbrio (monograma quando vazio).

import { useRef, useState } from 'react'
import { fileToResizedDataUrl } from '../lib/image'

const fontMono = "'IBM Plex Mono', monospace"

interface Props {
  value: string | null
  onChange: (dataUrl: string | null) => void
  /** iniciais exibidas quando não há imagem */
  fallbackText?: string
  size?: number
  rounded?: boolean          // true = círculo (atleta), false = quadrado (escudo)
  editable?: boolean
  maxSize?: number
}

export default function ImageUpload({
  value, onChange, fallbackText = '', size = 96, rounded = true, editable = true, maxSize = 512,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (e.target) e.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      const url = await fileToResizedDataUrl(file, { maxSize })
      onChange(url)
    } finally {
      setBusy(false)
    }
  }

  const radius = rounded ? '50%' : Math.round(size * 0.14)
  const initials = fallbackText.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <div style={{
        width: size, height: size, borderRadius: radius, overflow: 'hidden',
        background: value ? '#fff' : 'var(--cream-inset)',
        border: '1px solid var(--divider-strong)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {value ? (
          <img src={value} alt="" style={{ width: '100%', height: '100%', objectFit: rounded ? 'cover' : 'contain', objectPosition: 'center' }} />
        ) : (
          <span style={{ fontFamily: fontMono, fontSize: size * 0.30, fontWeight: 600, color: 'var(--gold-deep)', letterSpacing: '0.04em' }}>
            {initials || '—'}
          </span>
        )}
      </div>

      {editable && (
        <>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            title={value ? 'Trocar imagem' : 'Enviar imagem'}
            style={{
              position: 'absolute', right: -6, bottom: -6,
              width: 28, height: 28, borderRadius: '50%',
              background: 'var(--ink-primary)', color: 'var(--gold-soft)',
              border: '2px solid var(--cream-card)', cursor: busy ? 'wait' : 'pointer',
              fontSize: 12, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {busy ? '·' : '↑'}
          </button>
          {value && (
            <button
              onClick={() => onChange(null)}
              title="Remover imagem"
              style={{
                position: 'absolute', left: -6, bottom: -6,
                width: 24, height: 24, borderRadius: '50%',
                background: 'var(--cream-card)', color: 'var(--neg)',
                border: '1px solid var(--divider-strong)', cursor: 'pointer',
                fontSize: 11, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              ×
            </button>
          )}
          <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
        </>
      )}
    </div>
  )
}

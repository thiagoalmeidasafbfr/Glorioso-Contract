// src/components/ImageUpload.tsx
// Upload de imagem (foto de atleta / escudo de clube / logo de intermediário).
// Redimensiona no cliente e entrega uma data URL via onChange. Sem dependências
// externas nem bucket. Estilo sóbrio (monograma quando vazio).

import { useRef, useState } from 'react'
import { fileToResizedDataUrl } from '../lib/image'
import { Icon } from './Icon'
import { tr } from '../i18n'

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

  // Retrato do DS: quadrado, raio 8, sobre a placa creme com filete.
  // Logos (rounded=false) ficam contidos sobre branco.
  const radius = rounded ? 'var(--radius-sm)' : 'var(--radius-md)'
  const initials = fallbackText.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <div style={{
        width: size, height: size, borderRadius: radius, overflow: 'hidden',
        background: rounded ? 'var(--surface-accent)' : 'var(--surface-card)',
        boxShadow: rounded ? 'inset 0 0 0 1px var(--accent-line-soft)' : 'inset 0 0 0 1px var(--border-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {value ? (
          <img src={value} alt="" style={{ width: '100%', height: '100%', objectFit: rounded ? 'cover' : 'contain', objectPosition: rounded ? 'center top' : 'center' }} />
        ) : (
          <span style={{ fontSize: size * 0.30, fontWeight: 500, color: 'var(--ink-900)' }}>
            {tr(initials) || '—'}
          </span>
        )}
      </div>

      {editable && (
        <>
          <button
            type="button"
            className="icon-btn solid"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            title={value ? tr('Trocar imagem') : tr('Enviar imagem')}
            aria-label={value ? tr('Trocar imagem') : tr('Enviar imagem')}
            style={{ position: 'absolute', right: -8, bottom: -8, boxShadow: '0 0 0 2px var(--surface-card)', cursor: busy ? 'wait' : undefined }}
          >
            <Icon name="upload" size={16} />
          </button>
          {value && (
            <button
              type="button"
              className="icon-btn outline danger"
              onClick={() => onChange(null)}
              title={tr('Remover imagem')}
              aria-label={tr('Remover imagem')}
              style={{ position: 'absolute', left: -8, bottom: -8 }}
            >
              <Icon name="x" size={16} />
            </button>
          )}
          <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
        </>
      )}
    </div>
  )
}

// src/components/Flag.tsx
// Bandeira da nacionalidade (SVG do country-flag-icons). É conteúdo, não ícone:
// o DS proíbe emoji, então a bandeira é sempre a imagem — nunca 🇧🇷. Nada é
// renderizado quando a nacionalidade não é reconhecida.

import { countryOf } from '../lib/nationality'
import { tr } from '../i18n'

interface Props {
  nationality: string | null | undefined
  /** altura em px; a largura segue a proporção 3:2 (ou = altura quando `round`). */
  size?: number
  /** recorte circular — selo sobre o retrato. */
  round?: boolean
  style?: React.CSSProperties
}

export default function Flag({ nationality, size = 12, round = false, style }: Props) {
  const c = countryOf(nationality)
  if (!c) return null
  return (
    <img src={c.flagSrc} alt={tr(c.name)} title={tr(c.name)}
      width={round ? size : Math.round(size * 1.5)} height={size}
      style={{
        display: 'block', flex: 'none', objectFit: 'cover',
        borderRadius: round ? 'var(--radius-circle)' : 2,
        ...style,
      }} />
  )
}

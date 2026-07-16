// src/components/RefLink.tsx
// Link de referência cruzada: torna clicável o nome de um atleta, clube ou
// agente, levando à página consolidada da entidade. Quando não há destino
// (ex.: clube sem cadastro), renderiza texto simples — nunca um link morto.

import { useState } from 'react'
import { Link } from 'react-router-dom'

interface Props {
  to?: string | null
  children: React.ReactNode
  title?: string
  style?: React.CSSProperties
  /** Impede o clique de propagar para uma linha/card clicável ao redor. */
  stopPropagation?: boolean
}

export default function RefLink({ to, children, title, style, stopPropagation = true }: Props) {
  const [hover, setHover] = useState(false)
  if (!to) return <span style={style}>{children}</span>
  return (
    <Link
      to={to}
      title={title ?? 'Abrir página'}
      onClick={e => { if (stopPropagation) e.stopPropagation() }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        color: hover ? 'var(--gold-deep)' : 'inherit',
        textDecoration: 'none',
        borderBottom: `1px dashed ${hover ? 'var(--gold)' : 'rgba(190,140,74,0.45)'}`,
        cursor: 'pointer',
        transition: 'color 0.12s, border-color 0.12s',
        ...style,
      }}
    >
      {children}
    </Link>
  )
}

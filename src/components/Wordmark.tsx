// Wordmark do Glorioso Finance DS. Não há logotipo nas fontes do design system:
// onde entraria uma marca, o nome é composto em Urbanist — nunca desenhe,
// gere ou aproxime um símbolo. A variante `plate` (placa creme com a inicial)
// é a forma compacta, usada com a navegação recolhida.

interface Props {
  size?: number
  tone?: 'ink' | 'inverse'
  plate?: boolean
  /** Mostra só a placa com a inicial (sem o nome). */
  compact?: boolean
  name?: string
  style?: React.CSSProperties
}

export default function Wordmark({ size = 16, tone = 'ink', plate = false, compact = false, name = 'Glorioso Finance', style }: Props) {
  const color = tone === 'inverse' ? 'var(--text-inverse)' : 'var(--text-primary)'
  const label = (
    <span style={{
      fontFamily: 'var(--font-core)', fontSize: size, lineHeight: 1,
      fontWeight: 600,
      letterSpacing: '-.02em', color, whiteSpace: 'nowrap',
    }}>{name}</span>
  )
  const mark = (
    <span aria-hidden={!compact} style={{
      width: size * 1.7, height: size * 1.7, flex: 'none',
      display: 'grid', placeItems: 'center',
      borderRadius: 'var(--radius-md)',
      background: 'var(--surface-accent)',
      // o creme some sobre superfícies claras: carrega o filete preto do DS
      boxShadow: 'inset 0 0 0 1px var(--accent-line)',
      fontSize: size * 0.9, lineHeight: 1,
      fontWeight: 600,
      color: 'var(--ink-900)', letterSpacing: '-.03em',
    }}>{name.trim().charAt(0)}</span>
  )
  if (compact) {
    return <span role="img" aria-label={name} title={name} style={{ display: 'inline-flex', ...style }}>{mark}</span>
  }
  if (!plate) return <span style={{ display: 'inline-flex', alignItems: 'center', ...style }}>{label}</span>
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.5, ...style }}>
      {mark}
      {label}
    </span>
  )
}

interface Props {
  title: string
  subtitle: string
  children?: React.ReactNode
}

export default function PageHero({ title, subtitle, children }: Props) {
  return (
    <div style={{
      background: 'radial-gradient(130% 150% at 100% 0%, rgba(190,140,74,0.18), transparent 55%), linear-gradient(135deg, #201913 0%, #100d09 100%)',
      border: '1px solid rgba(190,140,74,0.20)',
      borderRadius: 16,
      padding: 'clamp(20px, 3vw, 30px) clamp(22px, 3vw, 34px)',
      marginBottom: 18,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      boxShadow: '0 14px 34px -20px rgba(0,0,0,0.7)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: 'rgba(224,199,152,0.72)',
          marginBottom: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <span style={{ display: 'inline-block', width: 16, height: 1.5, background: '#be8c4a', borderRadius: 1 }} />
          {subtitle}
        </div>
        <h1 style={{
          fontFamily: "'Fraunces', 'Cormorant Garamond', Georgia, serif",
          fontSize: 'clamp(1.6rem, 3.2vw, 2.35rem)',
          fontWeight: 700,
          lineHeight: 1.06,
          letterSpacing: '-0.028em',
          color: '#f7f3ea',
        }}>
          {title}
        </h1>
      </div>
      {children && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {children}
        </div>
      )}
    </div>
  )
}

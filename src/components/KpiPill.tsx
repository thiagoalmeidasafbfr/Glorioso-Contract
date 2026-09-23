// KPI compacto para viver ao lado dos filtros (mesma altura dos controles do
// DS, 36–44px). Variante "outlined" do card do DS: branco, filete, sem sombra.
// O tom vai num indicador de 6px ao lado do eyebrow e na cor do valor — o
// fundo continua neutro (no DS a cor só aparece onde significa algo).

type Tone = 'pos' | 'neg' | 'warn' | 'neutral'

interface Props {
  label: string
  value: string
  tone?: Tone
}

const TONE_FG: Record<Tone, string> = {
  pos: 'var(--text-positive)',
  neg: 'var(--text-negative)',
  warn: 'var(--text-warning)',
  neutral: 'var(--text-primary)',
}

const TONE_DOT: Record<Tone, string> = {
  pos: 'var(--accent-ink-strong)',
  neg: 'var(--red-500)',
  warn: 'var(--amber-500)',
  neutral: 'var(--gray-400)',
}

export default function KpiPill({ label, value, tone = 'neutral' }: Props) {
  return (
    <div style={{
      padding: '5px 12px',
      borderRadius: 'var(--radius-control)',
      background: 'var(--surface-card)',
      border: '1px solid var(--border-subtle)',
      display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3,
      minHeight: 'var(--control-h-lg)', minWidth: 0,
    }}>
      <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
        <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 'var(--radius-circle)', background: TONE_DOT[tone], flex: 'none' }} />
        {label}
      </div>
      <div style={{
        fontSize: 'var(--text-body-size)', fontWeight: 500,
        color: TONE_FG[tone], lineHeight: 1.1,
        whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
      }}>{value}</div>
    </div>
  )
}

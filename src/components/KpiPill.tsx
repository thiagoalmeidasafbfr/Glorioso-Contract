// Card KPI compacto para viver ao lado dos filtros (mesma altura ~36px).
// Substitui os cards "grandes" (kpi() inline) que ficavam desproporcionais
// em relação aos inputs / selects da toolbar.

type Tone = 'pos' | 'neg' | 'warn' | 'neutral'

interface Props {
  label: string
  value: string
  tone?: Tone
}

const TONE_FG: Record<Tone, string> = {
  pos: 'var(--pos)',
  neg: 'var(--neg)',
  warn: 'var(--warn)',
  neutral: 'var(--ink-primary)',
}

const TONE_BG: Record<Tone, string> = {
  pos: 'var(--pos-tint)',
  neg: 'var(--neg-tint)',
  warn: 'var(--warn-tint)',
  neutral: 'var(--cream-card)',
}

const TONE_BORDER: Record<Tone, string> = {
  pos: 'rgba(58,111,58,0.22)',
  neg: 'rgba(138,53,36,0.22)',
  warn: 'rgba(138,101,22,0.22)',
  neutral: 'var(--divider)',
}

export default function KpiPill({ label, value, tone = 'neutral' }: Props) {
  const fg = TONE_FG[tone]
  return (
    <div style={{
      padding: '4px 12px',
      borderRadius: 8,
      background: TONE_BG[tone],
      border: `1px solid ${TONE_BORDER[tone]}`,
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      minHeight: 36, minWidth: 0,
    }}>
      <div style={{
        fontFamily: 'var(--font-label)', fontSize: 8.5, fontWeight: 500,
        letterSpacing: '0.14em', textTransform: 'uppercase',
        color: tone === 'neutral' ? 'var(--text-muted)' : fg,
        lineHeight: 1.1,
      }}>{label}</div>
      <div style={{
        fontFamily: 'var(--font-data)', fontSize: 14, fontWeight: 700,
        color: fg, marginTop: 2, lineHeight: 1.1,
        whiteSpace: 'nowrap',
      }}>{value}</div>
    </div>
  )
}

// KPI compacto para viver ao lado dos filtros. Tem a mesma anatomia de um
// campo da barra de filtros — eyebrow em cima e o valor numa linha da altura
// do controle (30px) —, então alinha com eles em cima e embaixo. Sem caixa:
// um filete fino à esquerda separa um KPI do outro (densidade "controladoria").
// O tom vai num indicador de 5px ao lado do eyebrow e na cor do valor — o
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
      display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', minWidth: 0,
      paddingLeft: 'var(--space-3)', borderLeft: '1px solid var(--border-subtle)',
    }}>
      <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
        <span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: 'var(--radius-circle)', background: TONE_DOT[tone], flex: 'none' }} />
        {label}
      </div>
      <div style={{
        height: 'var(--ui-control-h)', display: 'flex', alignItems: 'center',
        fontSize: 'var(--ui-text-size)', fontWeight: 500, color: TONE_FG[tone],
        whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
      }}>{value}</div>
    </div>
  )
}

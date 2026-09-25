// MetricCard do Glorioso Finance DS em versão compacta: eyebrow de 10px em
// caixa-alta, valor em 500 e legenda cinza. `accent` usa a variante "inverse"
// (preta) — a forma do DS de fazer um card de um conjunto carregar peso.

import { tr } from '../i18n'

interface Props {
  label: string
  value: string
  sub?: string
  accent?: boolean
}

export default function KpiCard({ label, value, sub, accent }: Props) {
  return (
    <div className={accent ? 'card card-inverse' : 'card'} style={{ padding: 'var(--gutter-card)', minWidth: 0 }}>
      <div className="kpi-label" style={accent ? { color: 'var(--gray-500)' } : undefined}>{tr(label)}</div>
      <div className="kpi-value" style={{ marginTop: 'var(--space-3)', color: accent ? 'var(--text-inverse)' : undefined }}>{tr(value)}</div>
      {sub && <div className="kpi-sub" style={accent ? { color: 'var(--gray-500)' } : undefined}>{tr(sub)}</div>}
    </div>
  )
}

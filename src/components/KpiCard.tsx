interface Props {
  label: string
  value: string
  sub?: string
  accent?: boolean
}

export default function KpiCard({ label, value, sub, accent }: Props) {
  return (
    <div className="card" style={{
      padding: '14px 16px',
      borderLeft: accent ? '4px solid #000' : '4px solid #e0e0e0',
      minWidth: 0,
    }}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ fontSize: 18, marginTop: 4 }}>{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  )
}

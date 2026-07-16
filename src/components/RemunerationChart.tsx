// src/components/RemunerationChart.tsx
// Gráfico de linha (SVG, sem dependências) da evolução da remuneração mensal do
// atleta — salário CLT + imagem + outros — ao longo do vínculo. Trecho realizado
// (até hoje) é linha cheia; a projeção (do próximo mês até o fim) é pontilhada.
// Os degraus vêm das metas salariais atingidas.

import type { Contract, SalaryTrigger } from '../types/athlete-system'
import { salarySteps } from '../lib/salary'
import { fmtCurrencyShort, fmtDate, todayISO } from '../lib/format'

const fontMono = "'IBM Plex Mono', monospace"
const fontBody = "'Inter', system-ui, sans-serif"

function monthsBetween(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00'), db = new Date(b + 'T00:00:00')
  return (db.getFullYear() - da.getFullYear()) * 12 + (db.getMonth() - da.getMonth()) + (db.getDate() - da.getDate()) / 30
}

export default function RemunerationChart({ contract, triggers }: { contract: Contract; triggers: SalaryTrigger[] }) {
  const start = contract.start_date
  const end = contract.end_date ?? // se sem término, projeta 24 meses
    new Date(new Date(start + 'T00:00:00').setMonth(new Date(start + 'T00:00:00').getMonth() + 24)).toISOString().slice(0, 10)
  const today = todayISO()
  const image = contract.image_value ?? 0
  const other = contract.other_value ?? 0
  const extra = image + other

  const totalMonths = Math.max(1, monthsBetween(start, end))
  const clampT = (d: string) => Math.min(1, Math.max(0, monthsBetween(start, d) / totalMonths))

  // Degraus de salário (base + metas atingidas), limitados ao contrato.
  const steps = salarySteps(contract, triggers).filter(s => (s.amount ?? 0) >= 0)
  // ponto de remuneração total em cada degrau
  const points = steps.map(s => ({ t: clampT(s.from < start ? start : s.from), total: (s.amount ?? 0) + extra, from: s.from }))
  if (points.length === 0) points.push({ t: 0, total: (contract.base_salary ?? 0) + extra, from: start })

  const todayT = clampT(today < start ? start : today)
  const maxTotal = Math.max(...points.map(p => p.total), 1) * 1.2

  // Geometria
  const W = 720, H = 220, padL = 8, padR = 8, padT = 16, padB = 28
  const iw = W - padL - padR, ih = H - padT - padB
  const X = (t: number) => padL + t * iw
  const Y = (v: number) => padT + ih - (v / maxTotal) * ih

  // Segmentos realizados (linha cheia) até hoje; projeção (pontilhada) até o fim.
  type Seg = { x1: number; y1: number; x2: number; y2: number; dashed: boolean }
  const segs: Seg[] = []
  // valor vigente em t (step): último ponto com t <= tq
  const totalAt = (tq: number) => {
    let v = points[0].total
    for (const p of points) if (p.t <= tq + 1e-9) v = p.total
    return v
  }
  // Construir caminho em degraus de 0..1
  const stops = Array.from(new Set([0, ...points.map(p => p.t), todayT, 1])).sort((a, b) => a - b)
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1]
    const yA = Y(totalAt(a))
    // degrau vertical quando muda de valor exatamente em 'a'
    const prevV = i > 0 ? totalAt(stops[i - 1]) : totalAt(a)
    const curV = totalAt(a)
    if (curV !== prevV) segs.push({ x1: X(a), y1: Y(prevV), x2: X(a), y2: yA, dashed: a > todayT + 1e-9 })
    // segmento horizontal a→b
    segs.push({ x1: X(a), y1: yA, x2: X(b), y2: yA, dashed: b > todayT + 1e-9 })
  }

  const currentTotal = totalAt(todayT)

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
        {/* grade horizontal */}
        {[0, 0.5, 1].map(g => (
          <line key={g} x1={padL} x2={W - padR} y1={padT + ih - g * ih} y2={padT + ih - g * ih} stroke="var(--divider)" strokeWidth="1" />
        ))}
        {/* marcador HOJE */}
        <line x1={X(todayT)} x2={X(todayT)} y1={padT} y2={padT + ih} stroke="var(--divider-strong)" strokeWidth="1" strokeDasharray="2 3" />
        <text x={X(todayT)} y={H - 10} textAnchor="middle" fontFamily={fontMono} fontSize="9" fill="var(--text-muted)">hoje</text>
        {/* início / fim */}
        <text x={padL} y={H - 10} textAnchor="start" fontFamily={fontMono} fontSize="9" fill="var(--text-muted)">{fmtDate(start)}</text>
        <text x={W - padR} y={H - 10} textAnchor="end" fontFamily={fontMono} fontSize="9" fill="var(--text-muted)">{fmtDate(end)}</text>
        {/* linha */}
        {segs.map((s, i) => (
          <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
            stroke="var(--gold)" strokeWidth="2.5" strokeLinecap="round"
            strokeDasharray={s.dashed ? '4 4' : undefined} opacity={s.dashed ? 0.6 : 1} />
        ))}
        {/* ponto atual */}
        <circle cx={X(todayT)} cy={Y(currentTotal)} r="4" fill="var(--gold)" />
      </svg>
      <div style={{ display: 'flex', gap: 18, marginTop: 8, flexWrap: 'wrap', fontFamily: fontBody, fontSize: 11, color: 'var(--text-muted)' }}>
        <span><span style={{ display: 'inline-block', width: 16, height: 2, background: 'var(--gold)', verticalAlign: 'middle', marginRight: 6 }} />Remuneração total (salário + imagem + outros)</span>
        <span><span style={{ display: 'inline-block', width: 16, height: 0, borderTop: '2px dashed var(--gold)', verticalAlign: 'middle', marginRight: 6, opacity: 0.6 }} />Projeção</span>
        <span style={{ marginLeft: 'auto', fontFamily: fontMono, color: 'var(--ink-primary)' }}>Hoje: {fmtCurrencyShort(currentTotal, contract.salary_currency)}/mês</span>
      </div>
    </div>
  )
}

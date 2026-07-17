// src/components/RemunerationChart.tsx
// Gráfico de degraus (SVG, sem dependências) da remuneração mensal do atleta —
// salário CLT + imagem + outros — ao longo do vínculo. Trecho realizado (até
// hoje) é linha cheia; a projeção (do próximo mês até o fim) é pontilhada.
// Os degraus vêm das metas salariais atingidas. Mostra também o total acumulado
// até o fim do contrato.

import type { Contract, SalaryTrigger } from '../types/athlete-system'
import { salarySteps } from '../lib/salary'
import { fmtCurrencyShort, fmtDate, todayISO } from '../lib/format'

const fontMono = "'IBM Plex Mono', monospace"
const fontBody = "'Inter', system-ui, sans-serif"

function monthsBetween(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00'), db = new Date(b + 'T00:00:00')
  return (db.getFullYear() - da.getFullYear()) * 12 + (db.getMonth() - da.getMonth()) + (db.getDate() - da.getDate()) / 30
}
function addMonthsISO(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setMonth(d.getMonth() + n)
  return d.toISOString().slice(0, 10)
}

export default function RemunerationChart({ contract, triggers }: { contract: Contract; triggers: SalaryTrigger[] }) {
  const start = contract.start_date
  const end = contract.end_date ??
    addMonthsISO(start, 24) // sem término: projeta 24 meses
  const today = todayISO()
  const extra = (contract.image_value ?? 0) + (contract.other_value ?? 0)

  const totalMonths = Math.max(1, monthsBetween(start, end))
  const clampT = (d: string) => Math.min(1, Math.max(0, monthsBetween(start, d) / totalMonths))

  // Degraus de salário (base + metas atingidas), ordenados por data.
  const steps = salarySteps(contract, triggers).filter(s => (s.amount ?? 0) >= 0)
    .slice().sort((a, b) => a.from.localeCompare(b.from))
  const points = steps.map(s => ({ t: clampT(s.from < start ? start : s.from), total: (s.amount ?? 0) + extra }))
  if (points.length === 0) points.push({ t: 0, total: (contract.base_salary ?? 0) + extra })

  const todayT = clampT(today < start ? start : today)
  const maxTotal = Math.max(...points.map(p => p.total), 1) * 1.15

  // Geometria — com margem para não sobrepor rótulos.
  const W = 560, H = 168, padL = 10, padR = 10, padT = 22, padB = 34
  const iw = W - padL - padR, ih = H - padT - padB
  const X = (t: number) => padL + t * iw
  const Y = (v: number) => padT + ih - (v / maxTotal) * ih

  const totalAt = (tq: number) => {
    let v = points[0].total
    for (const p of points) if (p.t <= tq + 1e-9) v = p.total
    return v
  }

  // Segmentos em degrau de 0..1, cheios até hoje e pontilhados na projeção.
  type Seg = { x1: number; y1: number; x2: number; y2: number; dashed: boolean }
  const segs: Seg[] = []
  const stops = Array.from(new Set([0, ...points.map(p => p.t), todayT, 1])).sort((a, b) => a - b)
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1]
    const yA = Y(totalAt(a))
    const prevV = i > 0 ? totalAt(stops[i - 1]) : totalAt(a)
    const curV = totalAt(a)
    if (curV !== prevV) segs.push({ x1: X(a), y1: Y(prevV), x2: X(a), y2: yA, dashed: a > todayT + 1e-9 })
    segs.push({ x1: X(a), y1: yA, x2: X(b), y2: yA, dashed: b > todayT + 1e-9 })
  }

  const currentTotal = totalAt(todayT)

  // Total acumulado até o fim do contrato (soma da remuneração mês a mês).
  const nMonths = Math.max(1, Math.round(monthsBetween(start, end)))
  let totalAteFim = 0
  for (let i = 0; i < nMonths; i++) totalAteFim += totalAt(clampT(addMonthsISO(start, i)))

  // Rótulo "hoje" só quando não está colado nas bordas (evita sobrepor as datas).
  const showTodayLabel = todayT > 0.06 && todayT < 0.94

  return (
    <div style={{ maxWidth: 620 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
        {/* grade + rótulos do eixo Y (0 e máximo) */}
        {[0, 0.5, 1].map(g => (
          <line key={g} x1={padL} x2={W - padR} y1={padT + ih - g * ih} y2={padT + ih - g * ih} stroke="var(--divider)" strokeWidth="1" />
        ))}
        <text x={padL} y={padT - 8} textAnchor="start" fontFamily={fontMono} fontSize="9" fill="var(--text-muted)">
          {fmtCurrencyShort(maxTotal, contract.salary_currency)}
        </text>

        {/* marcador HOJE (rótulo no topo, para não colidir com as datas embaixo) */}
        <line x1={X(todayT)} x2={X(todayT)} y1={padT} y2={padT + ih} stroke="var(--divider-strong)" strokeWidth="1" strokeDasharray="2 3" />
        {showTodayLabel && (
          <text x={X(todayT)} y={padT - 8} textAnchor="middle" fontFamily={fontMono} fontSize="9" fill="var(--text-muted)">hoje</text>
        )}

        {/* datas de início/fim */}
        <text x={padL} y={H - 8} textAnchor="start" fontFamily={fontMono} fontSize="9" fill="var(--text-muted)">{fmtDate(start)}</text>
        <text x={W - padR} y={H - 8} textAnchor="end" fontFamily={fontMono} fontSize="9" fill="var(--text-muted)">{fmtDate(end)}</text>

        {/* linha em degraus */}
        {segs.map((s, i) => (
          <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
            stroke="var(--gold)" strokeWidth="2.5" strokeLinecap="round"
            strokeDasharray={s.dashed ? '4 4' : undefined} opacity={s.dashed ? 0.6 : 1} />
        ))}
        {/* ponto atual */}
        <circle cx={X(todayT)} cy={Y(currentTotal)} r="4" fill="var(--gold)" />
      </svg>

      <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap', alignItems: 'center', fontFamily: fontBody, fontSize: 11, color: 'var(--text-muted)' }}>
        <span><span style={{ display: 'inline-block', width: 16, height: 2, background: 'var(--gold)', verticalAlign: 'middle', marginRight: 6 }} />Remuneração total/mês</span>
        <span><span style={{ display: 'inline-block', width: 16, height: 0, borderTop: '2px dashed var(--gold)', verticalAlign: 'middle', marginRight: 6, opacity: 0.6 }} />Projeção</span>
        <span style={{ fontFamily: fontMono, color: 'var(--ink-primary)' }}>Hoje: {fmtCurrencyShort(currentTotal, contract.salary_currency)}/mês</span>
      </div>
      <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 8, background: 'var(--gold-tint, rgba(190,140,74,0.10))', border: '1px solid rgba(190,140,74,0.25)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gold-deep, #8a6a34)' }}>
          Total até o fim do contrato ({nMonths} {nMonths === 1 ? 'mês' : 'meses'})
        </span>
        <span style={{ fontFamily: fontMono, fontSize: 18, fontWeight: 700, color: 'var(--ink-primary)' }}>
          {fmtCurrencyShort(totalAteFim, contract.salary_currency)}
        </span>
      </div>
    </div>
  )
}

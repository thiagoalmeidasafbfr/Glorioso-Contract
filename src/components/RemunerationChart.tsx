// src/components/RemunerationChart.tsx
// Gráfico de degraus (SVG, sem dependências) da remuneração mensal do atleta —
// salário CLT + imagem + outros — ao longo do vínculo. Interativo: ao passar o
// mouse, mostra um tooltip com o mês e o valor daquele mês. Trecho realizado
// (até hoje) é linha cheia; a projeção é pontilhada. Mostra o total até o fim.

import { useRef, useState } from 'react'
import type { Contract, SalaryTrigger } from '../types/athlete-system'
import { salarySteps } from '../lib/salary'
import { fmtCurrencyShort, fmtDate, todayISO } from '../lib/format'

const fontMono = "var(--font-label)"
const fontBody = "var(--font-body)"

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
  const wrapRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)

  const start = contract.start_date
  const end = contract.end_date ?? addMonthsISO(start, 24)
  const today = todayISO()
  const extra = (contract.image_value ?? 0) + (contract.other_value ?? 0)

  const totalMonths = Math.max(1, monthsBetween(start, end))
  const clampT = (d: string) => Math.min(1, Math.max(0, monthsBetween(start, d) / totalMonths))

  const steps = salarySteps(contract, triggers).filter(s => (s.amount ?? 0) >= 0)
    .slice().sort((a, b) => a.from.localeCompare(b.from))
  const points = steps.map(s => ({ t: clampT(s.from < start ? start : s.from), total: (s.amount ?? 0) + extra }))
  if (points.length === 0) points.push({ t: 0, total: (contract.base_salary ?? 0) + extra })

  const todayT = clampT(today < start ? start : today)
  const maxTotal = Math.max(...points.map(p => p.total), 1) * 1.15

  const W = 560, H = 168, padL = 10, padR = 10, padT = 22, padB = 34
  const iw = W - padL - padR, ih = H - padT - padB
  const X = (t: number) => padL + t * iw
  const Y = (v: number) => padT + ih - (v / maxTotal) * ih

  const totalAt = (tq: number) => {
    let v = points[0].total
    for (const p of points) if (p.t <= tq + 1e-9) v = p.total
    return v
  }

  // Pontos mensais (para tooltip / total acumulado).
  const nMonths = Math.max(1, Math.round(monthsBetween(start, end)))
  const months = Array.from({ length: nMonths }, (_, i) => {
    const iso = addMonthsISO(start, i)
    const t = clampT(iso)
    return { i, iso, t, total: totalAt(t) }
  })
  const totalAteFim = months.reduce((s, m) => s + m.total, 0)

  // Segmentos em degrau.
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
  const showTodayLabel = todayT > 0.06 && todayT < 0.94

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const relX = (e.clientX - rect.left) / rect.width           // 0..1 do SVG
    const plotFrac = Math.min(1, Math.max(0, (relX * W - padL) / iw))
    const idx = Math.min(nMonths - 1, Math.max(0, Math.round(plotFrac * (nMonths - 1))))
    setHover(idx)
  }

  const hv = hover != null ? months[hover] : null

  return (
    <div ref={wrapRef} style={{ maxWidth: 620, margin: '0 auto', position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}
        onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {[0, 0.5, 1].map(g => (
          <line key={g} x1={padL} x2={W - padR} y1={padT + ih - g * ih} y2={padT + ih - g * ih} stroke="var(--divider)" strokeWidth="1" />
        ))}
        <text x={padL} y={padT - 8} textAnchor="start" fontFamily={fontMono} fontSize="9" fill="var(--text-muted)">
          {fmtCurrencyShort(maxTotal, contract.salary_currency)}
        </text>

        <line x1={X(todayT)} x2={X(todayT)} y1={padT} y2={padT + ih} stroke="var(--divider-strong)" strokeWidth="1" strokeDasharray="2 3" />
        {showTodayLabel && <text x={X(todayT)} y={padT - 8} textAnchor="middle" fontFamily={fontMono} fontSize="9" fill="var(--text-muted)">hoje</text>}

        <text x={padL} y={H - 8} textAnchor="start" fontFamily={fontMono} fontSize="9" fill="var(--text-muted)">{fmtDate(start)}</text>
        <text x={W - padR} y={H - 8} textAnchor="end" fontFamily={fontMono} fontSize="9" fill="var(--text-muted)">{fmtDate(end)}</text>

        {segs.map((s, i) => (
          <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
            stroke="var(--ink-primary)" strokeWidth="2.5" strokeLinecap="round"
            strokeDasharray={s.dashed ? '4 4' : undefined} opacity={s.dashed ? 0.6 : 1} />
        ))}

        {/* guia + ponto do hover */}
        {hv && (
          <>
            <line x1={X(hv.t)} x2={X(hv.t)} y1={padT} y2={padT + ih} stroke="var(--ink-primary)" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
            <circle cx={X(hv.t)} cy={Y(hv.total)} r="4.5" fill="var(--ink-primary)" stroke="#fff" strokeWidth="1.5" />
          </>
        )}
        <circle cx={X(todayT)} cy={Y(currentTotal)} r="4" fill="var(--ink-primary)" opacity={hv ? 0.4 : 1} />
      </svg>

      {/* tooltip */}
      {hv && (
        <div style={{
          position: 'absolute', top: 2, left: `${(X(hv.t) / W) * 100}%`, transform: 'translateX(-50%)',
          background: 'var(--ink-primary, #1a1410)', color: '#fff', padding: '5px 9px', borderRadius: 6,
          fontFamily: fontMono, fontSize: 10, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 2, boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
        }}>
          <div style={{ opacity: 0.7 }}>{fmtDate(hv.iso)}{hv.t > todayT ? ' · projeção' : ''}</div>
          <div style={{ fontWeight: 700 }}>{fmtCurrencyShort(hv.total, contract.salary_currency)}/mês</div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap', alignItems: 'center', fontFamily: fontBody, fontSize: 11, color: 'var(--text-muted)' }}>
        <span><span style={{ display: 'inline-block', width: 16, height: 2, background: 'var(--gold)', verticalAlign: 'middle', marginRight: 6 }} />Remuneração total/mês</span>
        <span><span style={{ display: 'inline-block', width: 16, height: 0, borderTop: '2px dashed var(--gold)', verticalAlign: 'middle', marginRight: 6, opacity: 0.6 }} />Projeção</span>
        <span style={{ fontFamily: fontMono, color: 'var(--ink-primary)' }}>Hoje: {fmtCurrencyShort(currentTotal, contract.salary_currency)}/mês</span>
      </div>
      <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 8, background: 'var(--bg-subtle)', border: '1px solid var(--divider-strong)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gold-deep, var(--ink-secondary))' }}>
          Total até o fim do contrato ({nMonths} {nMonths === 1 ? 'mês' : 'meses'})
        </span>
        <span style={{ fontFamily: fontMono, fontSize: 18, fontWeight: 700, color: 'var(--ink-primary)' }}>
          {fmtCurrencyShort(totalAteFim, contract.salary_currency)}
        </span>
      </div>
    </div>
  )
}

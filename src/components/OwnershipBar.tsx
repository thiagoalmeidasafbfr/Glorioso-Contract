// src/components/OwnershipBar.tsx
// Barra visual da titularidade econômica do atleta (% por detentor).
// Modo compacto (lista) e completo (detalhe, com legenda + badge de total).

import type { EconomicRight } from '../types/athlete-system'
import { HOLDER_TYPE_LABELS, HOLDER_TYPE_COLORS, HOLDER_TYPE_INK } from '../types/athlete-system'
import { sumOwnership, isOwnershipValid, sortRights } from '../lib/ownership'
import { badgeStyle } from '../lib/tones'

function fmtPct(v: number): string {
  return `${Number.isInteger(v) ? v : v.toFixed(1).replace('.', ',')}%`
}

interface Props {
  rights: EconomicRight[]
  compact?: boolean
  showLegend?: boolean
}

export default function OwnershipBar({ rights, compact = false, showLegend = true }: Props) {
  const sorted = sortRights(rights)
  const total = sumOwnership(rights)
  const valid = isOwnershipValid(rights)
  const height = compact ? 8 : 14

  // Segmentos preenchidos + eventual lacuna (quando total < 100).
  const gap = total < 100 - 0.1 ? 100 - total : 0

  return (
    <div style={{ width: '100%' }}>
      <div style={{
        display: 'flex', gap: 2, height, borderRadius: 'var(--radius-pill)', overflow: 'hidden',
        background: 'var(--chart-track)',
      }}>
        {sorted.map(r => r.percentage > 0 && (
          <div key={r.id}
            title={`${HOLDER_TYPE_LABELS[r.holder_type]}${r.holder_name ? ` — ${r.holder_name}` : ''}: ${fmtPct(r.percentage)}`}
            style={{
              width: `${r.percentage}%`, background: HOLDER_TYPE_COLORS[r.holder_type],
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            {!compact && r.percentage >= 12 && (
              <span style={{ fontSize: 10, fontWeight: 500, color: HOLDER_TYPE_INK[r.holder_type] }}>
                {fmtPct(r.percentage)}
              </span>
            )}
          </div>
        ))}
        {gap > 0 && (
          <div title={`Não atribuído: ${fmtPct(gap)}`}
            style={{
              width: `${gap}%`,
              background: 'repeating-linear-gradient(45deg, var(--neg-tint), var(--neg-tint) 4px, transparent 4px, transparent 8px)',
            }} />
        )}
      </div>

      {showLegend && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: compact ? 8 : 14, marginTop: compact ? 5 : 8, alignItems: 'center' }}>
          {sorted.map(r => r.percentage > 0 && (
            <span key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: compact ? 10 : 11, color: 'var(--text-secondary)' }}>
              <span style={{ width: 9, height: 9, borderRadius: 'var(--radius-circle)', background: HOLDER_TYPE_COLORS[r.holder_type], display: 'inline-block', flexShrink: 0 }} />
              {HOLDER_TYPE_LABELS[r.holder_type]}{r.holder_name && r.holder_type !== 'BFR' ? ` (${r.holder_name})` : ''} {fmtPct(r.percentage)}
            </span>
          ))}
          <span style={{ ...badgeStyle(valid ? 'accent' : 'negative'), marginLeft: 'auto' }}>
            {valid ? `Total ${fmtPct(total)}` : `${fmtPct(total)} ≠ 100%`}
          </span>
        </div>
      )}
    </div>
  )
}

// Badge isolado de inconsistência (para linhas de tabela / cards).
export function OwnershipBadge({ rights }: { rights: EconomicRight[] }) {
  if (rights.length === 0) return null
  if (isOwnershipValid(rights)) return null
  return (
    <span title={`Soma dos direitos = ${fmtPct(sumOwnership(rights))} (deveria ser 100%)`}
      style={badgeStyle('negative')}>
      {fmtPct(sumOwnership(rights))} ≠ 100%
    </span>
  )
}

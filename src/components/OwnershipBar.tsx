// src/components/OwnershipBar.tsx
// Barra visual da titularidade econômica do atleta (% por detentor).
// Modo compacto (lista) e completo (detalhe, com legenda + badge de total).

import type { EconomicRight } from '../types/athlete-system'
import { HOLDER_TYPE_LABELS, HOLDER_TYPE_COLORS } from '../types/athlete-system'
import { sumOwnership, isOwnershipValid, sortRights } from '../lib/ownership'

const fontMono = "var(--font-label)"

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
        display: 'flex', height, borderRadius: height / 2, overflow: 'hidden',
        background: 'var(--cream-inset)', border: '1px solid var(--input-border)',
      }}>
        {sorted.map(r => r.percentage > 0 && (
          <div key={r.id}
            title={`${HOLDER_TYPE_LABELS[r.holder_type]}${r.holder_name ? ` — ${r.holder_name}` : ''}: ${fmtPct(r.percentage)}`}
            style={{
              width: `${r.percentage}%`, background: HOLDER_TYPE_COLORS[r.holder_type],
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            {!compact && r.percentage >= 12 && (
              <span style={{ fontSize: 9, fontFamily: fontMono, fontWeight: 700, color: '#fff' }}>
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
            <span key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: compact ? 10 : 11, color: 'var(--text-muted)' }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: HOLDER_TYPE_COLORS[r.holder_type], display: 'inline-block', flexShrink: 0 }} />
              {HOLDER_TYPE_LABELS[r.holder_type]}{r.holder_name && r.holder_type !== 'BFR' ? ` (${r.holder_name})` : ''} {fmtPct(r.percentage)}
            </span>
          ))}
          <span style={{
            marginLeft: 'auto', fontSize: compact ? 10 : 11, fontFamily: fontMono, fontWeight: 700,
            color: valid ? 'var(--pos)' : 'var(--neg)',
            background: valid ? 'var(--pos-tint)' : 'var(--neg-tint)',
            padding: '1px 8px', borderRadius: 5, whiteSpace: 'nowrap',
          }}>
            {valid ? `Total ${fmtPct(total)}` : `⚠ ${fmtPct(total)} ≠ 100%`}
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
      style={{
        fontSize: 9, fontFamily: fontMono, fontWeight: 700, color: 'var(--neg)',
        background: 'var(--neg-tint)', padding: '1px 6px', borderRadius: 4, whiteSpace: 'nowrap',
      }}>
      ⚠ {fmtPct(sumOwnership(rights))}
    </span>
  )
}

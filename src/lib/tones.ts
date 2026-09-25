// Tons de status do Glorioso Finance DS, num só lugar. As páginas mapeiam os
// seus status de domínio para um destes tons (e nunca para cores soltas).

export type BadgeTone = 'accent' | 'neutral' | 'inverse' | 'negative' | 'outline' | 'warning' | 'info'

export interface ToneStyle { bg: string; fg: string; bd: string }

export const BADGE_TONES: Record<BadgeTone, ToneStyle> = {
  accent:   { bg: 'var(--surface-accent)',  fg: 'var(--ink-900)',        bd: 'var(--accent-line-soft)' },
  neutral:  { bg: 'var(--gray-150)',        fg: 'var(--text-secondary)', bd: 'transparent' },
  inverse:  { bg: 'var(--surface-inverse)', fg: 'var(--text-inverse)',   bd: 'transparent' },
  negative: { bg: 'var(--red-500)',         fg: 'var(--white)',          bd: 'transparent' },
  outline:  { bg: 'var(--surface-card)',    fg: 'var(--text-primary)',   bd: 'var(--border-default)' },
  warning:  { bg: 'var(--amber-400)',       fg: 'var(--ink-900)',        bd: 'transparent' },
  info:     { bg: 'var(--lilac-200)',       fg: 'var(--ink-900)',        bd: 'transparent' },
}

/** Estilo inline de uma pílula de status (para células de tabela densas). */
export function badgeStyle(tone: BadgeTone | ToneStyle): React.CSSProperties {
  const t = typeof tone === 'string' ? BADGE_TONES[tone] : tone
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
    height: 18, padding: '0 7px',
    fontFamily: 'var(--font-core)', fontSize: 'var(--text-overline-size)', fontWeight: 500, lineHeight: 1,
    color: t.fg, background: t.bg, border: `1px solid ${t.bd}`,
    borderRadius: 'var(--radius-pill)', whiteSpace: 'nowrap',
  }
}

/** Cor de TEXTO para valores com significado (montantes, contagens). */
export const TEXT_TONE = {
  positive: 'var(--text-positive)',
  negative: 'var(--text-negative)',
  warning:  'var(--text-warning)',
  info:     'var(--text-info)',
  neutral:  'var(--text-primary)',
  muted:    'var(--text-secondary)',
} as const

/** Tons dos status mais comuns do domínio. */
export const ATHLETE_STATUS_TONE = {
  ATIVO: 'accent', EMPRESTADO: 'info', VENDIDO: 'neutral', DESLIGADO: 'outline',
} as const satisfies Record<string, BadgeTone>

export const PAYMENT_STATUS_TONE = {
  PAGA: 'accent', PENDENTE: 'neutral', PARCIALMENTE_PAGA: 'warning', EM_ATRASO: 'negative', CANCELADA: 'outline',
} as const satisfies Record<string, BadgeTone>

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  PAGA: 'Paga', PENDENTE: 'Pendente', PARCIALMENTE_PAGA: 'Parcialmente paga', EM_ATRASO: 'Em atraso', CANCELADA: 'Cancelada',
}

export const TRIGGER_STATUS_TONE = {
  ATINGIDA: 'accent', PENDENTE: 'neutral', NAO_ATINGIDA: 'outline', NAO_APLICAVEL: 'outline',
} as const satisfies Record<string, BadgeTone>

export const CONTRACT_STATUS_TONE = {
  ATIVO: 'accent', ENCERRADO: 'neutral', RESCINDIDO: 'outline',
} as const satisfies Record<string, BadgeTone>

/** "EM_ATRASO" → "Em atraso" (fallback quando não há rótulo cadastrado). */
export function humanizeEnum(s: string): string {
  const t = s.replace(/_/g, ' ').toLowerCase()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

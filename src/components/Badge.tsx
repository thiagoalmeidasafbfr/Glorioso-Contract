// Badge do Glorioso Finance DS — pílula de 18px (sm) ou 24px (md), 500.
// O status nunca vai só no ícone: vai no preenchimento + rótulo.
//   accent   → creme com filete preto (positivo, pago, ativo, atingido)
//   neutral  → cinza (pendente, sem movimento)
//   inverse  → preto (destaque/seleção)
//   negative → o único vermelho (em atraso, erro)
//   outline  → branco com filete (encerrado, cancelado, informativo)
//   warning / info → extensões da plataforma nos swatches âmbar e lilás do DS

import { BADGE_TONES, type BadgeTone } from '../lib/tones'
import { tr } from '../i18n'

interface Props {
  tone?: BadgeTone
  size?: 'sm' | 'md'
  title?: string
  style?: React.CSSProperties
  children: React.ReactNode
}

export default function Badge({ tone = 'neutral', size = 'sm', title, style, children }: Props) {
  const t = BADGE_TONES[tone]
  return (
    <span title={tr(title)} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
      height: size === 'sm' ? 18 : 24, padding: size === 'sm' ? '0 7px' : '0 10px',
      fontFamily: 'var(--font-core)',
      fontSize: size === 'sm' ? 'var(--text-overline-size)' : 'var(--text-body-sm-size)',
      fontWeight: 500, lineHeight: 1,
      color: t.fg, background: t.bg, border: `1px solid ${t.bd}`,
      borderRadius: 'var(--radius-pill)', whiteSpace: 'nowrap',
      ...style,
    }}>
      {children}
    </span>
  )
}

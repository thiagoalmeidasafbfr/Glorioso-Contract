// src/components/Icon.tsx
// Ícones minimalistas (traço preto, 1.6px) e botões de ação em ícone.
// Substituem os antigos botões de texto ("Abrir", "Parcela", "Editar", ...):
// a mesma ação em um alvo pequeno, discreto e consistente em todas as telas.

import { Link } from 'react-router-dom'

export type IconName =
  | 'open'        // abrir página (link externo/quadrado com seta)
  | 'edit'        // editar (lápis)
  | 'trash'       // excluir
  | 'plus'        // adicionar
  | 'check'       // marcar como paga / atingida
  | 'undo'        // reverter
  | 'money'       // registrar pagamento
  | 'flow'        // fluxo de parcelas (cronograma)
  | 'x'           // fechar / remover linha
  | 'chevronDown'
  | 'chevronRight'
  | 'link'        // vínculo
  | 'download'
  | 'search'
  | 'dots'        // mais ações

const PATHS: Record<IconName, React.ReactNode> = {
  // Quadrado com seta saindo — "abrir página" (padrão external-link).
  open: (
    <>
      <path d="M13.5 3.5H16.5V6.5" />
      <path d="M16.5 3.5 L10.5 9.5" />
      <path d="M15.5 12v3.5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1H8" />
    </>
  ),
  edit: (
    <>
      <path d="M4 16h3.2l8.1-8.1a1.6 1.6 0 0 0 0-2.3l-.9-.9a1.6 1.6 0 0 0-2.3 0L4 12.8V16Z" />
      <path d="M11.4 6.2l2.4 2.4" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 6.5h11" />
      <path d="M8 6.5V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5" />
      <path d="M6 6.5l.6 9a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9l.6-9" />
    </>
  ),
  plus: (
    <>
      <path d="M10 4.5v11" />
      <path d="M4.5 10h11" />
    </>
  ),
  check: <path d="M4.5 10.5l3.6 3.5 7.4-8" />,
  undo: (
    <>
      <path d="M4.5 9.5V5.5" />
      <path d="M4.5 9.5h4" />
      <path d="M5.4 9.2a6 6 0 1 1 1.2 5.6" />
    </>
  ),
  money: (
    <>
      <rect x="3.5" y="6" width="13" height="8.5" rx="1.4" />
      <circle cx="10" cy="10.25" r="1.9" />
    </>
  ),
  flow: (
    <>
      <path d="M4.5 6h11" />
      <path d="M4.5 10h11" />
      <path d="M4.5 14h7" />
    </>
  ),
  x: (
    <>
      <path d="M5.5 5.5l9 9" />
      <path d="M14.5 5.5l-9 9" />
    </>
  ),
  chevronDown: <path d="M5.5 8l4.5 4.5L14.5 8" />,
  chevronRight: <path d="M8 5.5L12.5 10 8 14.5" />,
  link: (
    <>
      <path d="M8.5 11.5a3 3 0 0 1 0-4.2l1.4-1.4a3 3 0 0 1 4.2 4.2l-.7.7" />
      <path d="M11.5 8.5a3 3 0 0 1 0 4.2l-1.4 1.4a3 3 0 0 1-4.2-4.2l.7-.7" />
    </>
  ),
  download: (
    <>
      <path d="M10 4v8" />
      <path d="M6.5 8.5L10 12l3.5-3.5" />
      <path d="M4.5 15.5h11" />
    </>
  ),
  search: (
    <>
      <circle cx="9" cy="9" r="4.5" />
      <path d="M12.4 12.4l3.1 3.1" />
    </>
  ),
  dots: (
    <>
      <circle cx="5" cy="10" r="1.1" />
      <circle cx="10" cy="10" r="1.1" />
      <circle cx="15" cy="10" r="1.1" />
    </>
  ),
}

export function Icon({ name, size = 15, strokeWidth = 1.6, style }: {
  name: IconName; size?: number; strokeWidth?: number; style?: React.CSSProperties
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false"
      stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style}>
      {PATHS[name]}
    </svg>
  )
}

type Tone = 'default' | 'danger' | 'muted'

interface IconButtonProps {
  icon: IconName
  /** Rótulo acessível — também vira o tooltip quando `title` não é passado. */
  label: string
  title?: string
  onClick?: () => void
  /** Quando presente, renderiza um link de navegação em vez de um botão. */
  to?: string
  tone?: Tone
  small?: boolean
  disabled?: boolean
  style?: React.CSSProperties
}

/** Botão de ação em ícone: preto, discreto, com tooltip e rótulo acessível. */
export function IconButton({
  icon, label, title, onClick, to, tone = 'default', small = false, disabled, style,
}: IconButtonProps) {
  const cls = `icon-btn${tone === 'danger' ? ' danger' : tone === 'muted' ? ' muted' : ''}${small ? ' sm' : ''}`
  const size = small ? 13 : 15
  if (to && !disabled) {
    return (
      <Link to={to} className={cls} title={title ?? label} aria-label={label} style={style}
        onClick={e => e.stopPropagation()}>
        <Icon name={icon} size={size} />
      </Link>
    )
  }
  return (
    <button type="button" className={cls} title={title ?? label} aria-label={label} disabled={disabled} style={style}
      onClick={e => { e.stopPropagation(); onClick?.() }}>
      <Icon name={icon} size={size} />
    </button>
  )
}

/** Linha de ações — mantém os ícones alinhados e com o mesmo espaçamento. */
export function IconRow({ children, align = 'right' }: { children: React.ReactNode; align?: 'left' | 'right' | 'center' }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 2,
      justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
    }}>
      {children}
    </div>
  )
}

export default Icon

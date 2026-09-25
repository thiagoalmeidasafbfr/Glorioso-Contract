// src/components/Icon.tsx
// Ícones monolinha do Glorioso Finance DS — conjunto Lucide, traço 1.75,
// currentColor, nunca preenchidos. TODO ícone da plataforma passa por aqui:
// para trocar o conjunto (ex.: ícones próprios da marca) basta remapear ICONS.
// Tamanhos do DS: 16px (inline, chips, botões) e 20px (controles e navegação).

import { Link } from 'react-router-dom'
import {
  ArrowLeftRight, Banknote, Briefcase, Calculator, CalendarDays, ChartLine,
  ChartPie, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CirclePlus, Clock,
  Download, Ellipsis, ExternalLink, FileSpreadsheet, Folder, Handshake, Images, Info, Layers,
  LayoutDashboard, LayoutGrid, Link2, List, LogOut, PanelLeftClose, PanelLeftOpen, Pencil,
  Plus, Scale, Search, Shield, Split, TableProperties, Target, Trash2, TrendingUp, TriangleAlert, Undo2,
  Upload, UserRound, Users, X, type LucideIcon,
} from 'lucide-react'

const ICONS = {
  // Ações
  open: ExternalLink,         // abrir página
  edit: Pencil,               // editar
  trash: Trash2,              // excluir
  plus: Plus,                 // adicionar
  check: Check,               // marcar como paga / atingida
  undo: Undo2,                // reverter
  money: Banknote,            // registrar pagamento
  flow: List,                 // lista genérica / fluxo
  schedule: CalendarDays,     // cronograma de parcelas já existente
  split: Split,               // gerar parcelas a partir de um valor único
  x: X,                       // fechar / remover linha
  chevronDown: ChevronDown,
  chevronUp: ChevronUp,
  chevronRight: ChevronRight,
  chevronLeft: ChevronLeft,
  link: Link2,                // vínculo
  download: Download,
  upload: Upload,
  search: Search,
  dots: Ellipsis,             // mais ações
  alert: TriangleAlert,       // vencimento em atraso
  clock: Clock,               // vencimento próximo
  info: Info,                 // como o valor é calculado (tooltip)
  gavel: Scale,               // recuperação judicial
  // Navegação / estrutura
  create: CirclePlus,
  dashboard: LayoutDashboard,
  athletes: Users,
  athlete: UserRound,
  portfolio: Images,
  clubs: Shield,
  agents: Briefcase,
  model: Calculator,
  consolidated: Layers,
  deals: Handshake,
  sellOn: TrendingUp,
  ownership: ChartPie,
  target: Target,
  amortization: ChartLine,
  playerTable: TableProperties,
  transfer: ArrowLeftRight,
  spreadsheet: FileSpreadsheet,
  folder: Folder,
  grid: LayoutGrid,
  logout: LogOut,
  panelClose: PanelLeftClose,
  panelOpen: PanelLeftOpen,
} satisfies Record<string, LucideIcon>

export type IconName = keyof typeof ICONS

export function Icon({ name, size = 16, strokeWidth = 1.75, style }: {
  name: IconName; size?: number; strokeWidth?: number; style?: React.CSSProperties
}) {
  const Glyph = ICONS[name]
  return (
    <Glyph size={size} strokeWidth={strokeWidth} aria-hidden="true" focusable="false"
      style={{ display: 'block', flex: 'none', ...style }} />
  )
}

/** Tom = significado da ação (a cor é parte do vocabulário, não decoração),
 *  nos tons de status do DS:
 *   default → navegação/edição (preto)   info    → parcelas / cronograma (lilás)
 *   success → pagamento (areia)          warn    → desfazer (âmbar)
 *   danger  → exclusão (vermelho)        muted   → auxiliar (cinza)          */
export type Tone = 'default' | 'info' | 'success' | 'warn' | 'danger' | 'muted'

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
  /** Por que a ação está indisponível — entra no tooltip do ícone cinza. */
  disabledReason?: string
  style?: React.CSSProperties
}

/** Botão de ação em ícone (IconButton do DS, variante ghost): tom = significado,
 *  cinza quando indisponível. 28px (24px no modo `small` das tabelas densas). */
export function IconButton({
  icon, label, title, onClick, to, tone = 'default', small = false, disabled, disabledReason, style,
}: IconButtonProps) {
  const cls = `icon-btn ${tone}${small ? ' sm' : ''}`
  const size = 16
  const tip = disabled ? `${label}${disabledReason ? ` — ${disabledReason}` : ' (indisponível)'}` : (title ?? label)
  if (to && !disabled) {
    return (
      <Link to={to} className={cls} title={tip} aria-label={label} style={style}
        onClick={e => e.stopPropagation()}>
        <Icon name={icon} size={size} />
      </Link>
    )
  }
  return (
    <button type="button" className={cls} title={tip} aria-label={label} aria-disabled={disabled} disabled={disabled} style={style}
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

// Cabeçalho de página — PageHeader do Glorioso Finance DS: breadcrumb (12px,
// cinza, separador "/"), título em 24px regular e as ações alinhadas à direita.
// Mantém a API antiga (title/subtitle/children):
//   • subtitle no padrão "Seção · Botafogo SAF" vira o breadcrumb
//     "Botafogo SAF / Seção";
//   • qualquer outro subtitle é uma descrição e vai como legenda sob o título.

import { Link } from 'react-router-dom'
import { Icon, type IconName } from './Icon'

export interface Crumb { label: string; to?: string; icon?: IconName }

interface Props {
  title: string
  subtitle?: string
  /** Breadcrumb explícito (sobrepõe o derivado do subtitle). */
  crumbs?: Crumb[]
  children?: React.ReactNode
}

const ORG = 'Botafogo SAF'

export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="breadcrumb">
      {items.map((it, i) => {
        const body = (
          <>
            {it.icon && <Icon name={it.icon} size={13} style={{ opacity: 0.45 }} />}
            {it.label}
          </>
        )
        return (
          <span key={i} style={{ display: 'contents' }}>
            {i > 0 && <span aria-hidden="true" className="breadcrumb__sep">/</span>}
            {it.to
              ? <Link to={it.to} className="breadcrumb__item">{body}</Link>
              : <span className="breadcrumb__item">{body}</span>}
          </span>
        )
      })}
    </nav>
  )
}

export default function PageHero({ title, subtitle, crumbs, children }: Props) {
  const m = subtitle?.match(/^(.+?) · Botafogo SAF$/)
  const trail: Crumb[] | null = crumbs ?? (m
    ? [{ label: ORG, icon: 'folder' }, { label: m[1], icon: 'grid' }]
    : null)
  const caption = !crumbs && !m ? subtitle : undefined

  return (
    <div className="page-header">
      <div className="page-header__text">
        {trail && <Breadcrumb items={trail} />}
        <h1 className="page-title">{title}</h1>
        {caption && <p className="page-caption">{caption}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  )
}

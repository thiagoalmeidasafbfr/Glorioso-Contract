// Cabeçalho de página — PageHeader do Glorioso Finance DS: breadcrumb (12px,
// cinza, separador "/"), título em 24px regular e as ações alinhadas à direita.
// Mantém a API antiga (title/subtitle/children):
//   • subtitle no padrão "Seção · Botafogo SAF" vira o breadcrumb
//     "Botafogo SAF / Seção";
//   • qualquer outro subtitle é uma descrição e vai como legenda sob o título.

import { Link } from 'react-router-dom'
import { Icon, type IconName } from './Icon'
import { tr } from '../i18n'

export interface Crumb { label: string; to?: string; icon?: IconName }

interface Props {
  title: string
  subtitle?: string
  /** Breadcrumb explícito (sobrepõe o derivado do subtitle). */
  crumbs?: Crumb[]
  /** Legenda explícita sob o título (além do breadcrumb). */
  caption?: string
  /** Seção da navegação — gera o breadcrumb "Botafogo SAF / <seção>". */
  section?: string
  children?: React.ReactNode
}

const ORG = 'Botafogo SAF'

export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label={tr('Breadcrumb')} className="breadcrumb">
      {items.map((it, i) => {
        const body = (
          <>
            {it.icon && <Icon name={it.icon} size={12} style={{ opacity: 0.45 }} />}
            {tr(it.label)}
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

export default function PageHero({ title, subtitle, crumbs, caption: captionProp, section, children }: Props) {
  const m = subtitle?.match(/^(.+?) · Botafogo SAF$/)
  const label = section ?? m?.[1]
  const trail: Crumb[] | null = crumbs ?? (label
    ? [{ label: ORG, icon: 'folder' }, { label, icon: 'grid' }]
    : null)
  const caption = captionProp ?? (section ? subtitle : (!crumbs && !m ? subtitle : undefined))

  return (
    <div className="page-header">
      <div className="page-header__text">
        {trail && <Breadcrumb items={trail} />}
        <h1 className="page-title">{tr(title)}</h1>
        {caption && <p className="page-caption">{tr(caption)}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  )
}

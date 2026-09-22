// src/components/SortableTable.tsx
// Cabeçalho de coluna ordenável: <th aria-sort> com um <button> (teclado e
// leitores de tela) e indicador ▲▼. O estado vem de useSortable (useSortable.ts).
//
//   const { sorted, sort } = useSortable(rows, 'name')
//   <SortHeader k="name" sort={sort}>Nome</SortHeader>

import type { SortState } from './useSortable'

export function SortHeader({ k, sort, children, style, align, title }: {
  k: string
  sort: SortState
  children: React.ReactNode
  style?: React.CSSProperties
  align?: 'left' | 'right' | 'center'
  title?: string
}) {
  const active = sort.sortKey === k
  const ariaSort = active ? (sort.sortDir === 'asc' ? 'ascending' : 'descending') : 'none'
  const textAlign = align ?? (style?.textAlign as 'left' | 'right' | 'center' | undefined) ?? 'left'
  return (
    <th aria-sort={ariaSort} style={{ ...style, textAlign }} title={title}>
      <button type="button" className="sort-btn" onClick={() => sort.toggle(k)}
        style={{ justifyContent: textAlign === 'right' ? 'flex-end' : textAlign === 'center' ? 'center' : 'flex-start' }}>
        <span>{children}</span>
        <span aria-hidden="true" className="sort-ind" data-active={active || undefined}>
          {active ? (sort.sortDir === 'asc' ? '▲' : '▼') : '▲▼'}
        </span>
      </button>
    </th>
  )
}

export default SortHeader

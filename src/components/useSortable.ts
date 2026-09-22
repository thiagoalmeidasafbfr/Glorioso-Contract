// src/components/useSortable.ts
// Ordenação de tabelas de relatório (clique no cabeçalho). Números comparam
// numericamente, datas ISO (AAAA-MM-DD…) cronologicamente e textos com
// localeCompare('pt-BR'). Vazios vão sempre para o fim. O cabeçalho clicável
// fica em SortableTable.tsx (<SortHeader>).

import { useCallback, useMemo, useState } from 'react'

export type SortDir = 'asc' | 'desc'
export type SortValue = string | number | boolean | Date | null | undefined
export type SortAccessors<T> = Partial<Record<string, (row: T) => SortValue>>

export interface SortState {
  sortKey: string | null
  sortDir: SortDir
  toggle: (key: string) => void
}

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true })

function isEmpty(v: SortValue): boolean {
  return v === null || v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v))
}

export function compareValues(a: SortValue, b: SortValue): number {
  if (a instanceof Date) a = a.getTime()
  if (b instanceof Date) b = b.getTime()
  if (typeof a === 'boolean') a = a ? 1 : 0
  if (typeof b === 'boolean') b = b ? 1 : 0
  if (typeof a === 'number' && typeof b === 'number') return a - b
  // Datas ISO ordenam corretamente como texto (AAAA-MM-DD).
  const sa = String(a), sb = String(b)
  if (/^\d{4}-\d{2}-\d{2}/.test(sa) && /^\d{4}-\d{2}-\d{2}/.test(sb)) return sa < sb ? -1 : sa > sb ? 1 : 0
  return collator.compare(sa, sb)
}

export function useSortable<T>(
  rows: readonly T[],
  initialKey: string | null = null,
  opts: { initialDir?: SortDir; accessors?: SortAccessors<T> } = {},
) {
  const [{ sortKey, sortDir }, setSort] = useState<{ sortKey: string | null; sortDir: SortDir }>(
    { sortKey: initialKey, sortDir: opts.initialDir ?? 'asc' },
  )
  const accessors = opts.accessors

  const toggle = useCallback((key: string) => {
    setSort(prev => prev.sortKey === key
      ? { sortKey: key, sortDir: prev.sortDir === 'asc' ? 'desc' : 'asc' }
      : { sortKey: key, sortDir: 'asc' })
  }, [])

  const sorted = useMemo(() => {
    if (!sortKey) return rows as T[]
    const get = accessors?.[sortKey] ?? ((r: T) => (r as Record<string, unknown>)[sortKey] as SortValue)
    const mul = sortDir === 'asc' ? 1 : -1
    return rows
      .map((r, i) => ({ r, i, v: get(r) }))
      .sort((x, y) => {
        const ex = isEmpty(x.v), ey = isEmpty(y.v)
        if (ex || ey) return ex === ey ? x.i - y.i : ex ? 1 : -1
        return compareValues(x.v, y.v) * mul || x.i - y.i
      })
      .map(x => x.r)
  }, [rows, sortKey, sortDir, accessors])

  const state: SortState = { sortKey, sortDir, toggle }
  return { sorted, ...state, sort: state }
}

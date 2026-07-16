// src/lib/localStore.ts
// Armazenamento local (localStorage) usado quando o Supabase NÃO está
// configurado. Começa VAZIO (sem dados fabricados).
//
// Implementação com CACHE em memória + escrita coalescida:
//   • cada tabela é carregada do localStorage uma vez e mantida em memória;
//   • gravações vão para o cache e são persistidas (JSON.stringify) na hora,
//     EXCETO dentro de um bloco defer()/flush() — usado por importações em massa
//     para evitar custo O(n²) de reserializar a coleção a cada linha.

const PREFIX = 'glorioso.v1.'

type WithId = { id: string }

function hasStorage(): boolean {
  try { return typeof localStorage !== 'undefined' } catch { return false }
}

const cache = new Map<string, WithId[]>()
let deferred = false
const dirty = new Set<string>()

function load<T extends WithId>(table: string): T[] {
  let arr = cache.get(table) as T[] | undefined
  if (arr) return arr
  arr = []
  if (hasStorage()) {
    try {
      const raw = localStorage.getItem(PREFIX + table)
      if (raw) { const p = JSON.parse(raw); if (Array.isArray(p)) arr = p as T[] }
    } catch { /* ignore */ }
  }
  cache.set(table, arr)
  return arr
}

function persist(table: string): void {
  if (deferred) { dirty.add(table); return }
  if (!hasStorage()) return
  try { localStorage.setItem(PREFIX + table, JSON.stringify(cache.get(table) ?? [])) } catch { /* quota */ }
}

function nowISO(): string { return new Date().toISOString() }
function stamp(row: Record<string, unknown>): Record<string, unknown> {
  return { created_at: nowISO(), updated_at: nowISO(), ...row, id: (row.id as string | undefined) ?? crypto.randomUUID() }
}

export const local = {
  all<T extends WithId>(table: string): T[] { return [...load<T>(table)] },
  where<T extends WithId>(table: string, field: string, value: unknown): T[] {
    return load<T>(table).filter(r => (r as Record<string, unknown>)[field] === value)
  },
  find<T extends WithId>(table: string, id: string): T | null { return load<T>(table).find(r => r.id === id) ?? null },
  insert<T extends WithId>(table: string, row: Record<string, unknown>): T {
    const arr = load<T>(table); const full = stamp(row) as unknown as T; arr.push(full); persist(table); return full
  },
  insertMany<T extends WithId>(table: string, rows: Record<string, unknown>[]): T[] {
    const arr = load<T>(table); const created = rows.map(r => stamp(r) as unknown as T); arr.push(...created); persist(table); return created
  },
  update<T extends WithId>(table: string, id: string, patch: Partial<T>): T {
    const arr = load<T>(table); const i = arr.findIndex(r => r.id === id)
    if (i === -1) throw new Error(`Registro não encontrado em ${table}: ${id}`)
    arr[i] = { ...arr[i], ...patch, updated_at: nowISO() }; persist(table); return arr[i]
  },
  remove(table: string, id: string): void {
    const arr = load<WithId>(table); const i = arr.findIndex(r => r.id === id)
    if (i !== -1) { arr.splice(i, 1); persist(table) }
  },
  replaceAll<T extends WithId>(table: string, rows: T[]): void { cache.set(table, rows); persist(table) },

  /** Coalesce writes: use around bulk imports. */
  defer(): void { deferred = true },
  flush(): void {
    deferred = false
    if (!hasStorage()) { dirty.clear(); return }
    for (const t of dirty) { try { localStorage.setItem(PREFIX + t, JSON.stringify(cache.get(t) ?? [])) } catch { /* quota */ } }
    dirty.clear()
  },
}

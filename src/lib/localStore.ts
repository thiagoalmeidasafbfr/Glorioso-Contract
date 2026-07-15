// src/lib/localStore.ts
// Armazenamento local (localStorage) usado quando o Supabase NÃO está
// configurado (VITE_USE_SUPABASE !== 'true').
//
// Diferente do antigo modo "mock", NÃO existe nenhum dado fabricado aqui: as
// coleções começam VAZIAS e só passam a existir dados que o usuário cadastrar
// (na UI) ou importar (XLSX). Isso encerra de vez os "mock datas" mantendo o
// app 100% funcional e verificável antes de plugar o banco.
//
// Cada "tabela" é uma coleção de linhas com id string. A API espelha o subset
// do Supabase que usamos (select/insert/update/delete), para que a camada de
// queries troque de backend sem mudar as chamadas.

const PREFIX = 'glorioso.v1.'

type WithId = { id: string }

function hasStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined'
  } catch {
    return false
  }
}

function read<T extends WithId>(table: string): T[] {
  if (!hasStorage()) return []
  try {
    const raw = localStorage.getItem(PREFIX + table)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

function write<T extends WithId>(table: string, rows: T[]): void {
  if (!hasStorage()) return
  try {
    localStorage.setItem(PREFIX + table, JSON.stringify(rows))
  } catch {
    // Silencioso: quota cheia / modo privado. Não deve derrubar a UI.
  }
}

function nowISO(): string {
  return new Date().toISOString()
}

function stamp(row: Record<string, unknown>): Record<string, unknown> {
  return {
    created_at: nowISO(),
    updated_at: nowISO(),
    ...row,
    id: (row.id as string | undefined) ?? crypto.randomUUID(),
  }
}

export const local = {
  /** Todas as linhas de uma tabela. */
  all<T extends WithId>(table: string): T[] {
    return read<T>(table)
  },

  /** Linhas cujo campo === valor. */
  where<T extends WithId>(table: string, field: string, value: unknown): T[] {
    return read<T>(table).filter(r => (r as Record<string, unknown>)[field] === value)
  },

  /** Uma linha por id (ou null). */
  find<T extends WithId>(table: string, id: string): T | null {
    return read<T>(table).find(r => r.id === id) ?? null
  },

  /** Insere uma linha, preenchendo id/created_at/updated_at se ausentes. */
  insert<T extends WithId>(table: string, row: Record<string, unknown>): T {
    const rows = read<T>(table)
    const full = stamp(row) as unknown as T
    rows.push(full)
    write(table, rows)
    return full
  },

  /** Insere várias linhas de uma vez. */
  insertMany<T extends WithId>(table: string, newRows: Record<string, unknown>[]): T[] {
    const rows = read<T>(table)
    const created = newRows.map(r => stamp(r) as unknown as T)
    rows.push(...created)
    write(table, rows)
    return created
  },

  /** Atualiza uma linha por id; lança se não encontrada. */
  update<T extends WithId>(table: string, id: string, patch: Partial<T>): T {
    const rows = read<T>(table)
    const idx = rows.findIndex(r => r.id === id)
    if (idx === -1) throw new Error(`Registro não encontrado em ${table}: ${id}`)
    rows[idx] = { ...rows[idx], ...patch, updated_at: nowISO() }
    write(table, rows)
    return rows[idx]
  },

  /** Remove uma linha por id. */
  remove(table: string, id: string): void {
    const rows = read<WithId>(table)
    const next = rows.filter(r => r.id !== id)
    if (next.length !== rows.length) write(table, next)
  },

  /** Substitui TODAS as linhas de uma tabela (usado por importação XLSX). */
  replaceAll<T extends WithId>(table: string, rows: T[]): void {
    write(table, rows)
  },
}

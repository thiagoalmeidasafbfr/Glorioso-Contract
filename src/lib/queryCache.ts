// src/lib/queryCache.ts
// Cache em memória das LISTAS que quase toda tela baixa (atletas, cláusulas,
// parcelas, passivos…). Sem ele, cada navegação baixava de novo as tabelas
// inteiras — com várias telas pedindo as mesmas 5–7 tabelas.
//
//   • Requisições iguais em andamento são compartilhadas (uma só ida ao banco).
//   • Validade curta (TTL): edições de OUTROS usuários aparecem em até 1 min.
//   • Qualquer escrita feita por este navegador limpa o cache na hora
//     (onDataWrite em lib/supabase) — nunca se lê o próprio dado desatualizado.
//     Os gatilhos do banco mexem em outras tabelas (ex.: parcela → status da
//     cláusula), por isso a limpeza é geral, exceto as fotos, que só caem
//     quando a tabela de atletas é alterada.
//   • Falha não fica no cache: a próxima chamada tenta de novo.
//   • Cada chamada recebe uma CÓPIA rasa das linhas — uma tela que ordena ou
//     altera a lista não contamina as outras.

import { onDataWrite } from './supabase'

const TTL_MS = 60_000

type Tag = 'data' | 'photos'
interface Entry { at: number; promise: Promise<unknown>; tag: Tag }

const cache = new Map<string, Entry>()

function copy<T>(value: T): T {
  if (Array.isArray(value)) return value.map(v => (v && typeof v === 'object' ? { ...v } : v)) as T
  if (value instanceof Map) return new Map(value) as T
  return value
}

/** Resultado de `load` guardado sob `key` por até `ttl` ms. */
export function cached<T>(key: string, load: () => Promise<T>, opts: { ttl?: number; tag?: Tag } = {}): Promise<T> {
  const ttl = opts.ttl ?? TTL_MS
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < ttl) return (hit.promise as Promise<T>).then(copy)

  const entry: Entry = { at: Date.now(), promise: load(), tag: opts.tag ?? 'data' }
  cache.set(key, entry)
  entry.promise.catch(() => { if (cache.get(key) === entry) cache.delete(key) })
  return (entry.promise as Promise<T>).then(copy)
}

/** Limpa o cache (todo ou só uma marca). Usado também pelo "Tentar novamente". */
export function invalidateCache(tag?: Tag): void {
  if (!tag) { cache.clear(); return }
  for (const [k, e] of cache) if (e.tag === tag) cache.delete(k)
}

onDataWrite(table => {
  invalidateCache('data')
  if (table === 'ac_atletas') invalidateCache('photos')
})

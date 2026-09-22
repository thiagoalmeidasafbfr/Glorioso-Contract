// src/lib/metadados.ts
// Leitura dos metadados estruturados da migration 025 (colunas que substituem
// os marcadores em `notes`). Ver docs/CONTRATOS_BACKEND.md §025.
//
// Estratégia (item 3.6 do plano):
//   • GRAVAÇÃO continua em `notes` — o trigger da 025 sincroniza as colunas.
//   • LEITURA prefere as colunas. Para não mexer nas dezenas de pontos que hoje
//     usam os parsers de `notes` (parseRJ, decodeAcordo, renegotiatedAcordoId,
//     decodeLoanShare), a linha lida do Supabase tem o `notes` RECONCILIADO com
//     as colunas: coluna presente → o marcador correspondente é garantido em
//     `notes`; coluna explicitamente vazia/false → o marcador é removido.
//     Se a coluna não existe na linha (migration não aplicada / modo local),
//     nada muda — fallback natural para o parser de `notes`.
//
// Os formatos abaixo DEVEM bater com judicialRecovery.ts, renegotiation.ts e
// loanSalary.ts (duplicados aqui para evitar import circular com athleteQueries).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>

const RJ_RE = /\[RJ:(\d{4}-\d{2}-\d{2})\]/
const ACORDO_PREFIX = '__ACORDO__'
const LOAN_MARK = '__EMPRESTIMO__'
const RENEG_RE = /Renegociado no acordo (\S+) em /

function stripRJ(notes: string): string | null {
  const cleaned = notes.replace(RJ_RE, '').replace(/\s{2,}/g, ' ').trim()
  return cleaned === '' ? null : cleaned
}

function reconcileRJ(o: Row): void {
  if (!('recuperacao_judicial' in o) && !('rj_data' in o)) return
  const notes: string | null = o.notes ?? null
  const tag = notes ? notes.match(RJ_RE) : null
  const flag = o.recuperacao_judicial === true || !!o.rj_data
  if (flag) {
    const date = (o.rj_data as string | null) ?? tag?.[1] ?? null
    if (!date) return
    if (tag && tag[1] === date) return
    const clean = notes ? stripRJ(notes) : null
    o.notes = clean ? `[RJ:${date}] ${clean}` : `[RJ:${date}]`
  } else if (o.recuperacao_judicial === false && tag && notes) {
    o.notes = stripRJ(notes)
  }
}

function reconcileAcordo(o: Row): void {
  if (!('renegociacao' in o)) return
  const meta = o.renegociacao
  if (!meta || typeof meta !== 'object') return
  const notes: string | null = o.notes ?? null
  if (notes && notes.startsWith(ACORDO_PREFIX)) return
  o.notes = ACORDO_PREFIX + JSON.stringify(meta)
}

function reconcileRenegociado(o: Row): void {
  if (!('renegociado_acordo_id' in o)) return
  const id = o.renegociado_acordo_id as string | null
  if (!id) return
  const notes: string | null = o.notes ?? null
  const m = notes ? notes.match(RENEG_RE) : null
  if (m && m[1] === id) return
  if (m) return // nota aponta para outro acordo: mantém (legado), coluna fica exposta
  const ref = `Renegociado no acordo ${id} em -`
  o.notes = notes ? `${notes} · ${ref}` : ref
}

function reconcileLoan(o: Row): void {
  if (!('emprestimo_rateio' in o)) return
  const meta = o.emprestimo_rateio
  if (!meta || typeof meta !== 'object') return
  const notes: string | null = o.notes ?? null
  if (notes && notes.startsWith(LOAN_MARK)) return
  o.notes = LOAN_MARK + JSON.stringify(meta)
}

/** Reconcilia `notes` com as colunas estruturadas (in place). Idempotente. */
export function withStructuredMeta<T extends Row>(o: T): T {
  if (!('notes' in o)) return o
  reconcileRJ(o)
  reconcileAcordo(o)
  reconcileRenegociado(o)
  reconcileLoan(o)
  return o
}

/** Data de RJ preferindo a coluna; fallback para o marcador em `notes`. */
export function rjDateOf(item: { rj_data?: string | null; recuperacao_judicial?: boolean | null; notes?: string | null }): string | null {
  if (item.recuperacao_judicial === false) return null
  if (item.rj_data) return item.rj_data
  const m = item.notes?.match(RJ_RE)
  return m ? m[1] : null
}

/** Acordo que renegociou o item, preferindo a coluna. */
export function renegociadoAcordoIdOf(item: { renegociado_acordo_id?: string | null; notes?: string | null }): string | null {
  if (item.renegociado_acordo_id) return item.renegociado_acordo_id
  const m = item.notes?.match(RENEG_RE)
  return m ? m[1] : null
}

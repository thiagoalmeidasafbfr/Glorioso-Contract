// src/pages/PageRelatorio.tsx
// Relatórios de movimentações — visão parcela a parcela / linha a linha de cada
// natureza (Direito de Imagem, Luvas, Intermediários, Clubes, Salários), com
// status, vencimento, data de pagamento, valor e a parte (credor).
// Todas as movimentações são derivadas do atleta (figura central).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  fetchAthletes, fetchAllImageRights, fetchAllIntermediaryLiabilities,
  fetchAllClubLiabilities, fetchAllClauses, fetchAllInstallments,
  fetchClubs, fetchIntermediaries,
} from '../lib/athleteQueries'
import type { Athlete, Currency } from '../types/athlete-system'
import { fmtCurrencyShort, fmtDate, isOverdue } from '../lib/format'
import SheetIO from '../components/SheetIO'
import RefLink from '../components/RefLink'
import { buildNameIndex, norm, resultMessage } from '../lib/importHelpers'
import { importReport } from '../lib/reportPorters'
import type { ColDef } from '../lib/xlsx-utils'

const fontBody = "'Inter', system-ui, sans-serif"
const fontMono = "'IBM Plex Mono', monospace"

type Kind = 'imagem' | 'luvas' | 'intermediarios' | 'clubes' | 'salarios'

const KIND_TITLE: Record<Kind, { title: string; subtitle: string }> = {
  imagem:         { title: 'Direito de Imagem', subtitle: 'Relatório de movimentações' },
  luvas:          { title: 'Luvas',             subtitle: 'Relatório de movimentações' },
  intermediarios: { title: 'Agentes',           subtitle: 'Relatório de passivos' },
  clubes:         { title: 'Clubes',            subtitle: 'Relatório de passivos' },
  salarios:       { title: 'Salários',          subtitle: 'Relatório de vigências salariais' },
}

// Estado normalizado para o "tom" do status.
type Tone = 'pos' | 'neg' | 'warn' | 'neutral'

// Natureza da "parte" — define para onde o nome aponta ao ser clicado.
type ParteKind = 'atleta' | 'clube' | 'intermediario' | 'clube_ou_agente' | null

interface Row {
  id: string
  atleta: string
  athleteId: string
  natureza: string
  parte: string       // credor / clube / intermediário / contraparte
  parteKind: ParteKind
  descricao: string
  valor: number | null
  moeda: Currency
  vencimento: string | null
  pagamento: string | null
  status: string      // rótulo já pronto
  tone: Tone
}

const STATUS_TONE: Record<string, Tone> = {
  PENDENTE: 'warn', PAGA: 'pos', ATINGIDA: 'pos', EM_ATRASO: 'neg',
  CANCELADA: 'neutral', NAO_ATINGIDA: 'neutral',
}
const STATUS_LABEL: Record<string, string> = {
  PENDENTE: 'Pendente', PAGA: 'Paga', ATINGIDA: 'Atingida', EM_ATRASO: 'Em atraso',
  CANCELADA: 'Cancelada', NAO_ATINGIDA: 'Não atingida',
}

const TONE_STYLE: Record<Tone, { bg: string; fg: string }> = {
  pos:     { bg: 'var(--pos-tint)', fg: 'var(--pos)' },
  neg:     { bg: 'var(--neg-tint)', fg: 'var(--neg)' },
  warn:    { bg: 'var(--warn-tint)', fg: 'var(--warn)' },
  neutral: { bg: 'var(--cream-inset)', fg: 'var(--ink-secondary)' },
}

const APPROX_BRL: Record<string, number> = { BRL: 1, EUR: 6.10, USD: 5.55, GBP: 7.10 }

export default function PageRelatorio() {
  const { kind } = useParams<{ kind: string }>()
  const k = (['imagem', 'luvas', 'intermediarios', 'clubes', 'salarios'].includes(kind ?? '') ? kind : 'imagem') as Kind

  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('Todos')
  const [atletaFilter, setAtletaFilter] = useState('Todos')
  const [naturezaFilter, setNaturezaFilter] = useState('Todos')
  const [posFilter, setPosFilter] = useState('Todos')
  const [posByAth, setPosByAth] = useState<Map<string, string>>(new Map())
  const [clubIdx, setClubIdx] = useState<Map<string, string>>(new Map())
  const [interIdx, setInterIdx] = useState<Map<string, string>>(new Map())
  const [importMsg, setImportMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [athletes, clubs, inters] = await Promise.all([
      fetchAthletes(), fetchClubs(), fetchIntermediaries(),
    ])
    setClubIdx(buildNameIndex(clubs))
    setInterIdx(buildNameIndex(inters))
    setPosByAth(new Map(athletes.map((a: Athlete) => [a.id, a.position ?? '—'])))
    const nameOf = new Map<string, string>(athletes.map((a: Athlete) => [a.id, a.short_name || a.full_name]))
    const built = await buildRows(k, nameOf)
    setRows(built)
    setLoading(false)
  }, [k])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de dados no mount
  useEffect(() => { let alive = true; load().catch(() => { if (alive) setLoading(false) }); return () => { alive = false } }, [load])

  // Resolve o destino do link da coluna "Parte".
  function parteTarget(r: Row): string | null {
    if (r.parteKind === 'atleta') return `/atletas/${r.athleteId}`
    const n = norm(r.parte)
    if (r.parteKind === 'clube') { const id = clubIdx.get(n); return id ? `/clubes/${id}` : null }
    if (r.parteKind === 'intermediario') { const id = interIdx.get(n); return id ? `/intermediarios/${id}` : null }
    if (r.parteKind === 'clube_ou_agente') {
      const c = clubIdx.get(n); if (c) return `/clubes/${c}`
      const i = interIdx.get(n); if (i) return `/intermediarios/${i}`
    }
    return null
  }

  async function handleImport(sheets: Record<string, Record<string, string>[]>) {
    const rowsIn = sheets[Object.keys(sheets)[0]] ?? []
    setImportMsg('Importando...')
    try {
      const res = await importReport(k, rowsIn)
      setImportMsg(resultMessage(res))
      await load()
    } catch (err) {
      setImportMsg(`Erro: ${(err as Error).message}`)
    }
  }

  const statuses = useMemo(() => ['Todos', ...Array.from(new Set(rows.map(r => r.status)))], [rows])
  const atletas = useMemo(() => ['Todos', ...Array.from(new Set(rows.map(r => r.atleta))).sort()], [rows])
  const naturezas = useMemo(() => ['Todos', ...Array.from(new Set(rows.map(r => r.natureza))).sort()], [rows])
  const posicoes = useMemo(() => ['Todos', ...Array.from(new Set(rows.map(r => posByAth.get(r.athleteId) ?? '—'))).sort()], [rows, posByAth])

  const filtered = useMemo(() => rows.filter(r => {
    if (statusFilter !== 'Todos' && r.status !== statusFilter) return false
    if (atletaFilter !== 'Todos' && r.atleta !== atletaFilter) return false
    if (naturezaFilter !== 'Todos' && r.natureza !== naturezaFilter) return false
    if (posFilter !== 'Todos' && (posByAth.get(r.athleteId) ?? '—') !== posFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (![r.atleta, r.parte, r.descricao, r.natureza].some(v => v.toLowerCase().includes(q))) return false
    }
    return true
  }), [rows, statusFilter, atletaFilter, naturezaFilter, posFilter, posByAth, search])

  const totalBRL = filtered.reduce((s, r) => s + (r.valor ?? 0) * (APPROX_BRL[r.moeda] ?? 1), 0)

  const meta = KIND_TITLE[k]

  const exportCols: ColDef[] = [
    { key: 'atleta', header: 'Atleta' }, { key: 'natureza', header: 'Natureza' },
    { key: 'parte', header: 'Parte' }, { key: 'descricao', header: 'Descrição' },
    { key: 'valor', header: 'Valor' }, { key: 'moeda', header: 'Moeda' },
    { key: 'vencimento', header: 'Vencimento' }, { key: 'pagamento', header: 'Pagamento' },
    { key: 'status', header: 'Status' },
  ]

  const th: React.CSSProperties = {
    padding: '9px 12px', fontSize: 9, fontWeight: 500, textTransform: 'uppercase',
    background: 'var(--tbl-head)', color: 'var(--ink-secondary)', borderBottom: '1px solid var(--divider-strong)',
    fontFamily: fontMono, letterSpacing: '0.16em', whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1, textAlign: 'left',
  }
  const td: React.CSSProperties = {
    padding: '10px 12px', fontSize: 12, color: 'var(--ink-primary)', fontFamily: fontBody,
    borderBottom: '1px solid var(--divider-soft)', verticalAlign: 'middle',
  }
  const tdNum: React.CSSProperties = { ...td, fontFamily: fontMono, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1500, margin: '0 auto' }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: fontMono, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--gold-deep)', marginBottom: 6 }}>{meta.subtitle}</div>
          <h1 style={{ fontFamily: fontBody, fontSize: 24, fontWeight: 700, color: 'var(--ink-primary)', margin: 0 }}>{meta.title}</h1>
          <div style={{ height: 2, width: 38, background: 'var(--gold)', borderRadius: 2, marginTop: 8 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <SheetIO
            exportFilename={`relatorio-${k}.xlsx`}
            exportSheets={[{ name: meta.title.slice(0, 28), cols: exportCols, rows: filtered as unknown as Record<string, unknown>[] }]}
            onImport={handleImport}
          />
          {importMsg && (
            <div style={{ fontSize: 11, fontFamily: fontMono, color: importMsg.startsWith('Erro') ? 'var(--neg)' : 'var(--gold-deep)' }}>{importMsg}</div>
          )}
        </div>
      </div>

      {/* Filtros + total */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 9, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Busca</div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Atleta, parte, descrição..."
            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--cream-card)', fontSize: 13, fontFamily: fontBody, color: 'var(--ink-primary)' }} />
        </div>
        <div>
          <div style={{ fontSize: 9, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Atleta</div>
          <select value={atletaFilter} onChange={e => setAtletaFilter(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--cream-card)', fontSize: 13, fontFamily: fontBody, color: 'var(--ink-primary)', maxWidth: 180 }}>
            {atletas.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 9, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Posição</div>
          <select value={posFilter} onChange={e => setPosFilter(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--cream-card)', fontSize: 13, fontFamily: fontBody, color: 'var(--ink-primary)' }}>
            {posicoes.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 9, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Natureza</div>
          <select value={naturezaFilter} onChange={e => setNaturezaFilter(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--cream-card)', fontSize: 13, fontFamily: fontBody, color: 'var(--ink-primary)', maxWidth: 180 }}>
            {naturezas.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 9, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Status</div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--cream-card)', fontSize: 13, fontFamily: fontBody, color: 'var(--ink-primary)' }}>
            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="card" style={{ padding: '10px 18px', marginLeft: 'auto' }}>
          <div style={{ fontSize: 9, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 3 }}>Total aprox. (BRL)</div>
          <div style={{ fontSize: 18, fontWeight: 600, fontFamily: fontMono, color: 'var(--ink-primary)' }}>{fmtCurrencyShort(totalBRL, 'BRL')}</div>
        </div>
      </div>

      {/* Tabela */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 240px)', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
            <thead>
              <tr>
                <th style={th}>Atleta</th>
                <th style={th}>Natureza</th>
                <th style={th}>Parte</th>
                <th style={th}>Descrição</th>
                <th style={{ ...th, textAlign: 'right' }}>Valor</th>
                <th style={th}>Vencimento</th>
                <th style={th}>Pagamento</th>
                <th style={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Carregando...</td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Nenhuma movimentação cadastrada.</td></tr>}
              {filtered.map(r => {
                const overdue = r.vencimento && isOverdue(r.vencimento, r.status === 'Paga' || r.status === 'Cancelada' ? 'PAGA' : 'PENDENTE')
                const tone = TONE_STYLE[r.tone]
                return (
                  <tr key={r.id}>
                    <td style={{ ...td, fontWeight: 600 }}>
                      {r.athleteId ? <RefLink to={`/atletas/${r.athleteId}`} title={`Abrir ${r.atleta}`}>{r.atleta}</RefLink> : r.atleta}
                    </td>
                    <td style={{ ...td, color: 'var(--text-secondary)' }}>{r.natureza}</td>
                    <td style={td}>{r.parte ? <RefLink to={parteTarget(r)} title={`Abrir ${r.parte}`}>{r.parte}</RefLink> : '—'}</td>
                    <td style={{ ...td, maxWidth: 320, color: 'var(--text-secondary)' }}>{r.descricao || '—'}</td>
                    <td style={tdNum}>{r.valor != null ? fmtCurrencyShort(r.valor, r.moeda) : '—'}</td>
                    <td style={{ ...td, fontFamily: fontMono, fontSize: 12, color: overdue ? 'var(--neg)' : 'var(--text-secondary)' }}>{r.vencimento ? fmtDate(r.vencimento) : '—'}</td>
                    <td style={{ ...td, fontFamily: fontMono, fontSize: 12, color: r.pagamento ? 'var(--pos)' : 'var(--text-muted)' }}>{r.pagamento ? fmtDate(r.pagamento) : '—'}</td>
                    <td style={td}>
                      <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 5, fontSize: 9, fontWeight: 600, fontFamily: fontMono, letterSpacing: '0.08em', textTransform: 'uppercase', background: tone.bg, color: tone.fg }}>{r.status}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)', fontFamily: fontMono }}>
        {filtered.length} {filtered.length === 1 ? 'movimentação' : 'movimentações'}
      </div>
    </div>
  )
}

// ── Construção das linhas por tipo de relatório ─────────────────────────────

async function buildRows(kind: Kind, nameOf: Map<string, string>): Promise<Row[]> {
  const name = (id: string) => nameOf.get(id) ?? '—'

  if (kind === 'imagem') {
    // Imagem agora é fluxo de parcelas (cláusula DIREITO_IMAGEM) — parcela por parcela.
    const [clauses, installments, legacy] = await Promise.all([fetchAllClauses(), fetchAllInstallments(), fetchAllImageRights()])
    const img = clauses.filter(c => c.clause_type === 'DIREITO_IMAGEM')
    const rows: Row[] = []
    for (const c of img) {
      const parcelas = installments.filter(i => i.clause_id === c.id)
      if (parcelas.length > 0) {
        for (const p of parcelas) {
          rows.push({
            id: p.id, atleta: name(c.athlete_id), athleteId: c.athlete_id, natureza: 'Direito de Imagem',
            parte: c.creditor_party, parteKind: 'atleta', descricao: `${c.description} — parcela ${p.installment_number}`,
            valor: p.original_value, moeda: p.currency, vencimento: p.due_date,
            pagamento: p.payment_date, status: STATUS_LABEL[p.payment_status] ?? p.payment_status, tone: STATUS_TONE[p.payment_status] ?? 'neutral',
          })
        }
      } else {
        rows.push({
          id: c.id, atleta: name(c.athlete_id), athleteId: c.athlete_id, natureza: 'Direito de Imagem',
          parte: c.creditor_party, parteKind: 'atleta', descricao: c.description,
          valor: c.original_value, moeda: c.currency, vencimento: c.due_date,
          pagamento: c.payment_date, status: STATUS_LABEL[c.payment_status] ?? c.payment_status, tone: STATUS_TONE[c.payment_status] ?? 'neutral',
        })
      }
    }
    // Compatibilidade: lançamentos antigos da tabela image_rights (se houver).
    for (const ir of legacy) {
      rows.push({
        id: ir.id, atleta: name(ir.athlete_id), athleteId: ir.athlete_id, natureza: 'Direito de Imagem',
        parte: name(ir.athlete_id), parteKind: 'atleta' as ParteKind, descricao: `Competência ${ir.month} (legado)`,
        valor: ir.amount, moeda: ir.currency, vencimento: `${ir.month}-01`,
        pagamento: ir.paid_date, status: STATUS_LABEL[ir.status] ?? ir.status, tone: STATUS_TONE[ir.status] ?? 'neutral',
      })
    }
    return rows
  }

  if (kind === 'intermediarios') {
    const list = await fetchAllIntermediaryLiabilities()
    return list.map(l => ({
      id: l.id, atleta: name(l.athlete_id), athleteId: l.athlete_id, natureza: 'Intermediação',
      parte: l.intermediary_name, parteKind: 'intermediario' as ParteKind, descricao: l.description ?? '',
      valor: l.amount, moeda: l.currency, vencimento: l.due_date,
      pagamento: l.settled_date, status: STATUS_LABEL[l.status] ?? l.status, tone: STATUS_TONE[l.status] ?? 'neutral',
    }))
  }

  if (kind === 'clubes') {
    const list = await fetchAllClubLiabilities()
    return list.map(l => ({
      id: l.id, atleta: name(l.athlete_id), athleteId: l.athlete_id, natureza: 'Obrigação clube',
      parte: l.club_name, parteKind: 'clube' as ParteKind, descricao: l.description ?? '',
      valor: l.amount, moeda: l.currency, vencimento: l.due_date,
      pagamento: l.settled_date, status: STATUS_LABEL[l.status] ?? l.status, tone: STATUS_TONE[l.status] ?? 'neutral',
    }))
  }

  if (kind === 'luvas') {
    const [clauses, installments] = await Promise.all([fetchAllClauses(), fetchAllInstallments()])
    const luvas = clauses.filter(c => c.clause_type === 'LUVAS')
    const luvasIds = new Set(luvas.map(c => c.id))
    const rows: Row[] = []
    for (const c of luvas) {
      const parcelas = installments.filter(i => i.clause_id === c.id)
      if (parcelas.length > 0) {
        for (const p of parcelas) {
          rows.push({
            id: p.id, atleta: name(c.athlete_id), athleteId: c.athlete_id, natureza: 'Luvas',
            parte: c.creditor_party, parteKind: 'clube_ou_agente', descricao: `${c.description} — parcela ${p.installment_number}`,
            valor: p.original_value, moeda: p.currency, vencimento: p.due_date,
            pagamento: p.payment_date, status: STATUS_LABEL[p.payment_status] ?? p.payment_status, tone: STATUS_TONE[p.payment_status] ?? 'neutral',
          })
        }
      } else {
        rows.push({
          id: c.id, atleta: name(c.athlete_id), athleteId: c.athlete_id, natureza: 'Luvas',
          parte: c.creditor_party, parteKind: 'clube_ou_agente', descricao: c.description,
          valor: c.original_value, moeda: c.currency, vencimento: c.due_date,
          pagamento: c.payment_date, status: STATUS_LABEL[c.payment_status] ?? c.payment_status, tone: STATUS_TONE[c.payment_status] ?? 'neutral',
        })
      }
    }
    void luvasIds
    return rows
  }

  // salarios — parcela por parcela (cláusula SALARIO_CETD + parcelas, com pro-rata).
  // Salário CLT é pago ao ATLETA (pessoa física) — a parte é o credor da cláusula
  // (o próprio atleta), nunca o clube da transferência.
  const [clauses, installments] = await Promise.all([fetchAllClauses(), fetchAllInstallments()])
  const sal = clauses.filter(c => c.clause_type === 'SALARIO_CETD')
  const rows: Row[] = []
  for (const c of sal) {
    const parte = c.creditor_party
    const parcelas = installments.filter(i => i.clause_id === c.id)
    if (parcelas.length > 0) {
      for (const p of parcelas) {
        rows.push({
          id: p.id, atleta: name(c.athlete_id), athleteId: c.athlete_id, natureza: 'Salário CLT',
          parte, parteKind: 'atleta', descricao: `${c.description} — parcela ${p.installment_number}`,
          valor: p.original_value, moeda: p.currency, vencimento: p.due_date,
          pagamento: p.payment_date, status: STATUS_LABEL[p.payment_status] ?? p.payment_status, tone: STATUS_TONE[p.payment_status] ?? 'neutral',
        })
      }
    } else {
      rows.push({
        id: c.id, atleta: name(c.athlete_id), athleteId: c.athlete_id, natureza: 'Salário CLT',
        parte, parteKind: 'atleta', descricao: c.description,
        valor: c.original_value, moeda: c.currency, vencimento: c.due_date,
        pagamento: c.payment_date, status: STATUS_LABEL[c.payment_status] ?? c.payment_status, tone: STATUS_TONE[c.payment_status] ?? 'neutral',
      })
    }
  }
  return rows
}

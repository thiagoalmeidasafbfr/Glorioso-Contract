// src/pages/PageRecuperacaoJudicial.tsx
// Analytics de Recuperação Judicial (RJ).
//
// Consolida TODOS os lançamentos a pagar marcados como RJ (parcelas de cláusula,
// cláusulas de valor único, obrigações com clubes e com intermediários) e mostra:
//   • KPIs: total devido, nº de credores, nº de lançamentos, atraso médio ponderado;
//   • agrupamento por CREDOR: quanto se deve, há quanto tempo em atraso, próximo
//     vencimento, quantidade de lançamentos, natureza predominante;
//   • tabela detalhada por lançamento, com data de inclusão na RJ e ação de
//     remover a marcação.
//
// Base: mesmo pipeline do Consolidado. Sem tabela nova — a marcação é lida do
// campo `notes` pelo helper `parseRJ`.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchAthletes, fetchAllClauses, fetchAllInstallments,
  fetchAllClubLiabilities, fetchAllIntermediaryLiabilities,
} from '../lib/athleteQueries'
import { fetchPtaxRates, toBRL, ptaxRateFor } from '../lib/ptax'
import { parseRJ, unmarkItemRJ } from '../lib/judicialRecovery'
import { fmtCurrencyShort, fmtDate, daysFromToday, todayISO } from '../lib/format'
import { CLAUSE_TYPE_LABELS } from '../types/athlete-system'
import type { Currency } from '../types/athlete-system'
import { exportWorkbook, type ColDef } from '../lib/xlsx-utils'
import PageHero from '../components/PageHero'
import KpiPill from '../components/KpiPill'
import RefLink from '../components/RefLink'
import { useSortable, type SortAccessors } from '../components/useSortable'
import { SortHeader } from '../components/SortableTable'
import { Icon } from '../components/Icon'
import { useAuth } from '../context/AuthContext'
import { useToast, errorMessage } from '../components/toast-context'
import { useConfirm } from '../components/confirm-context'

const font = 'var(--font-body)'
const mono = 'var(--font-label)'

interface RJRow {
  id: string
  kind: 'inst' | 'clause' | 'club' | 'agent'
  athleteId: string
  atleta: string
  natureza: string
  credor: string
  descricao: string
  dueDate: string | null
  valor: number
  moeda: Currency
  status: string
  filedAt: string
  notes: string | null
  fixedRate: number | null
}

const isBFR = (s: string | null | undefined) => !!s && (s.toLowerCase().includes('botafogo') || s.toLowerCase() === 'bfr')

export default function PageRecuperacaoJudicial() {
  const { canEdit } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const [rows, setRows] = useState<RJRow[]>([])
  const [ptax, setPtax] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [credorF, setCredorF] = useState('Todos')
  const [statusF, setStatusF] = useState('Todos')

  useEffect(() => { fetchPtaxRates().then(setPtax).catch(() => setPtax({})) }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const [athletes, clauses, insts, clubLiabs, interLiabs] = await Promise.all([
      fetchAthletes(), fetchAllClauses(), fetchAllInstallments(),
      fetchAllClubLiabilities(), fetchAllIntermediaryLiabilities(),
    ])
    const nameOf = new Map(athletes.map(a => [a.id, a.full_name]))
    const clauseById = new Map(clauses.map(c => [c.id, c]))
    const withInst = new Set(insts.map(i => i.clause_id))
    const built: RJRow[] = []

    for (const it of insts) {
      const rj = parseRJ(it.notes)
      if (!rj) continue
      const c = clauseById.get(it.clause_id)
      // RJ é sobre passivos: só considera dívida do clube.
      if (c && !isBFR(c.debtor_party)) continue
      built.push({
        id: it.id, kind: 'inst', athleteId: it.athlete_id,
        atleta: nameOf.get(it.athlete_id) ?? '—',
        natureza: c ? CLAUSE_TYPE_LABELS[c.clause_type] : 'Parcela',
        credor: c?.creditor_party ?? '—',
        descricao: c ? `${c.description} — parc. ${it.installment_number}` : `Parcela ${it.installment_number}`,
        dueDate: it.due_date, valor: it.original_value, moeda: it.currency,
        status: it.payment_status, filedAt: rj.filedAt, notes: it.notes ?? null,
        fixedRate: it.fixed_exchange_rate ?? c?.fixed_exchange_rate ?? null,
      })
    }
    for (const c of clauses) {
      if (withInst.has(c.id)) continue
      const rj = parseRJ(c.notes)
      if (!rj) continue
      if (!isBFR(c.debtor_party)) continue
      if (c.original_value == null) continue
      built.push({
        id: c.id, kind: 'clause', athleteId: c.athlete_id,
        atleta: nameOf.get(c.athlete_id) ?? '—',
        natureza: CLAUSE_TYPE_LABELS[c.clause_type],
        credor: c.creditor_party, descricao: c.description,
        dueDate: c.due_date, valor: c.original_value, moeda: c.currency,
        status: c.payment_status, filedAt: rj.filedAt, notes: c.notes ?? null,
        fixedRate: c.fixed_exchange_rate ?? null,
      })
    }
    for (const l of clubLiabs) {
      const rj = parseRJ(l.notes)
      if (!rj) continue
      if (l.direction !== 'A_PAGAR') continue
      built.push({
        id: l.id, kind: 'club', athleteId: l.athlete_id,
        atleta: nameOf.get(l.athlete_id) ?? '—',
        natureza: 'Obrigação clube', credor: l.club_name,
        descricao: l.description ?? '',
        dueDate: l.due_date, valor: l.amount, moeda: l.currency,
        status: l.status, filedAt: rj.filedAt, notes: l.notes ?? null,
        fixedRate: null,
      })
    }
    for (const l of interLiabs) {
      const rj = parseRJ(l.notes)
      if (!rj) continue
      if (l.direction !== 'A_PAGAR') continue
      built.push({
        id: l.id, kind: 'agent', athleteId: l.athlete_id,
        atleta: nameOf.get(l.athlete_id) ?? '—',
        natureza: 'Intermediação', credor: l.intermediary_name,
        descricao: l.description ?? '',
        dueDate: l.due_date, valor: l.amount, moeda: l.currency,
        status: l.status, filedAt: rj.filedAt, notes: l.notes ?? null,
        fixedRate: null,
      })
    }

    built.sort((a, b) => (a.dueDate ?? '9999-99-99').localeCompare(b.dueDate ?? '9999-99-99'))
    setRows(built)
    setLoading(false)
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial
  useEffect(() => { load() }, [load])

  function brlOf(r: RJRow): number {
    if (r.moeda === 'BRL') return r.valor
    if (r.fixedRate != null && r.fixedRate > 0) return r.valor * r.fixedRate
    return toBRL(r.valor, r.moeda, ptax)
  }
  function rateOf(r: RJRow): number {
    if (r.moeda === 'BRL') return 1
    if (r.fixedRate != null && r.fixedRate > 0) return r.fixedRate
    return ptaxRateFor(r.moeda, ptax)
  }

  const credores = useMemo(() => ['Todos', ...Array.from(new Set(rows.map(r => r.credor))).sort()], [rows])
  const statuses = useMemo(() => ['Todos', ...Array.from(new Set(rows.map(r => r.status))).sort()], [rows])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter(r => {
      if (credorF !== 'Todos' && r.credor !== credorF) return false
      if (statusF !== 'Todos' && r.status !== statusF) return false
      if (!needle) return true
      return [r.atleta, r.credor, r.natureza, r.descricao].some(v => v.toLowerCase().includes(needle))
    })
  }, [rows, q, credorF, statusF])

  const OPEN = new Set(['PENDENTE', 'PARCIALMENTE_PAGA', 'EM_ATRASO', 'VENCIDA'])
  const today = todayISO()

  // Agrega por credor: total devido em BRL (PTAX), lançamentos, próximo vencimento,
  // atraso máximo e natureza predominante.
  const byCreditor = useMemo(() => {
    const map = new Map<string, {
      credor: string; total: number; count: number; overdueCount: number;
      maxDelayDays: number; nextDue: string | null;
      naturezas: Map<string, number>; earliestFiledAt: string;
    }>()
    for (const r of filtered) {
      const g = map.get(r.credor) ?? {
        credor: r.credor, total: 0, count: 0, overdueCount: 0,
        maxDelayDays: 0, nextDue: null, naturezas: new Map<string, number>(),
        earliestFiledAt: r.filedAt,
      }
      const isOpen = OPEN.has(r.status)
      if (isOpen) g.total += brlOf(r)
      g.count += 1
      if (r.dueDate) {
        const d = daysFromToday(r.dueDate)
        if (d !== null && d < 0 && isOpen) {
          g.overdueCount += 1
          if (-d > g.maxDelayDays) g.maxDelayDays = -d
        }
        if (isOpen && (!g.nextDue || r.dueDate < g.nextDue)) g.nextDue = r.dueDate
      }
      g.naturezas.set(r.natureza, (g.naturezas.get(r.natureza) ?? 0) + 1)
      if (r.filedAt < g.earliestFiledAt) g.earliestFiledAt = r.filedAt
      map.set(r.credor, g)
    }
    const arr = Array.from(map.values()).map(g => ({
      ...g,
      topNatureza: Array.from(g.naturezas.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—',
    }))
    arr.sort((a, b) => b.total - a.total)
    return arr
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, ptax, today])

  const totals = useMemo(() => {
    let total = 0, overdueTotal = 0, weightedDays = 0
    const creditorSet = new Set<string>()
    let earliest: string | null = null
    for (const r of filtered) {
      creditorSet.add(r.credor)
      if (!earliest || r.filedAt < earliest) earliest = r.filedAt
      if (!OPEN.has(r.status)) continue
      const brl = brlOf(r)
      total += brl
      const d = r.dueDate ? daysFromToday(r.dueDate) : null
      if (d !== null && d < 0) {
        overdueTotal += brl
        weightedDays += (-d) * brl
      }
    }
    return {
      total, overdueTotal, count: filtered.length,
      creditors: creditorSet.size,
      avgDelay: overdueTotal > 0 ? Math.round(weightedDays / overdueTotal) : 0,
      earliestFiled: earliest,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, ptax])

  async function unmark(r: RJRow) {
    if (!canEdit) return
    if (!await confirm({ title: `Retirar "${r.descricao || r.natureza}" da Recuperação Judicial?`, message: 'O item volta a contar como a pagar corrente.', confirmLabel: 'Retirar da RJ' })) return
    try {
      await unmarkItemRJ({ kind: r.kind, id: r.id }, r.notes)
      toast.success('Item retirado da Recuperação Judicial.')
    } catch (e) { toast.error('Não foi possível retirar o item da RJ.', { detail: errorMessage(e) }) }
    await load()
  }

  function exportXlsx() {
    const cols: ColDef[] = [
      { key: 'atleta', header: 'Atleta' }, { key: 'credor', header: 'Credor' },
      { key: 'natureza', header: 'Natureza' }, { key: 'descricao', header: 'Descrição' },
      { key: 'dueDate', header: 'Vencimento' }, { key: 'valor', header: 'Valor' },
      { key: 'moeda', header: 'Moeda' }, { key: 'valorBRL', header: 'Valor (BRL PTAX)' },
      { key: 'ptaxRate', header: 'PTAX' }, { key: 'status', header: 'Status' },
      { key: 'filedAt', header: 'Inclusão RJ' }, { key: 'atrasoDias', header: 'Atraso (dias)' },
    ]
    const data = filtered.map(r => {
      const d = r.dueDate ? daysFromToday(r.dueDate) : null
      return {
        ...r,
        valorBRL: brlOf(r), ptaxRate: rateOf(r),
        atrasoDias: d !== null && d < 0 && OPEN.has(r.status) ? -d : 0,
      }
    })
    exportWorkbook([{ name: 'Recuperação Judicial', cols, rows: data }], 'recuperacao-judicial.xlsx')
  }

  // Ordenação das duas tabelas (clique no cabeçalho).
  type Group = (typeof byCreditor)[number]
  const { sorted: sortedGroups, sort: sortG } = useSortable<Group>(byCreditor, 'total', { initialDir: 'desc' })
  const detailAccessors = useMemo<SortAccessors<RJRow>>(() => ({
    dueDate: r => r.dueDate,
    atleta: r => r.atleta,
    credor: r => r.credor,
    natureza: r => r.natureza,
    descricao: r => r.descricao,
    valor: r => r.valor,
    valorBRL: r => brlOf(r),
    atraso: r => { const d = r.dueDate ? daysFromToday(r.dueDate) : null; return d !== null && d < 0 && OPEN.has(r.status) ? -d : 0 },
    filedAt: r => r.filedAt,
    status: r => r.status,
  // eslint-disable-next-line react-hooks/exhaustive-deps -- brlOf depende só de ptax
  }), [ptax, today])
  const { sorted: sortedRows, sort } = useSortable(filtered, null, { accessors: detailAccessors })

  const th: React.CSSProperties = { padding: '9px 12px', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', background: 'var(--tbl-head)', color: 'var(--ink-secondary)', borderBottom: '1px solid var(--divider-strong)', fontFamily: mono, letterSpacing: '0.14em', whiteSpace: 'nowrap', textAlign: 'left' }
  const td: React.CSSProperties = { padding: '9px 12px', fontSize: 12, color: 'var(--ink-primary)', fontFamily: font, borderBottom: '1px solid var(--divider-soft)', verticalAlign: 'middle' }

  return (
    <div style={{ padding: '24px 28px 32px', width: '100%', boxSizing: 'border-box' }}>
      <PageHero title="Recuperação Judicial" subtitle="Passivos incluídos no processo — credores, valores e atraso">
        <button onClick={exportXlsx} className="btn btn-outline"><Icon name="download" size={13} /> Exportar</button>
      </PageHero>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <KpiPill label="Devido em RJ (BRL PTAX)" value={fmtCurrencyShort(totals.total, 'BRL')} tone="warn" />
        <KpiPill label="Vencido em RJ (BRL PTAX)" value={fmtCurrencyShort(totals.overdueTotal, 'BRL')} tone="neg" />
        <KpiPill label="Credores" value={String(totals.creditors)} tone="neutral" />
        <KpiPill label="Lançamentos" value={String(totals.count)} tone="neutral" />
        <KpiPill label="Atraso médio ponderado" value={totals.avgDelay > 0 ? `${totals.avgDelay} dias` : '—'} tone={totals.avgDelay > 0 ? 'neg' : 'neutral'} />
        <KpiPill label="Protocolo mais antigo" value={totals.earliestFiled ? fmtDate(totals.earliestFiled) : '—'} tone="neutral" />
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <label htmlFor="recjud-busca" style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Busca</label>
          <input id="recjud-busca" value={q} onChange={e => setQ(e.target.value)} placeholder="Atleta, credor, descrição..."
            style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--divider-strong)', fontFamily: font, fontSize: 13, background: 'var(--surface, #fff)', color: 'var(--ink-primary)', boxSizing: 'border-box' }} />
        </div>
        <div>
          <label htmlFor="recjud-credor" style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Credor</label>
          <select id="recjud-credor" value={credorF} onChange={e => setCredorF(e.target.value)} style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid var(--divider-strong)', fontFamily: font, fontSize: 13, background: 'var(--surface, #fff)', color: 'var(--ink-primary)', maxWidth: 240 }}>
            {credores.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="recjud-status" style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Status</label>
          <select id="recjud-status" value={statusF} onChange={e => setStatusF(e.target.value)} style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid var(--divider-strong)', fontFamily: font, fontSize: 13, background: 'var(--surface, #fff)', color: 'var(--ink-primary)' }}>
            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* ── Agrupamento por credor ─────────────────────────────────────── */}
      <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-secondary)', margin: '6px 0 10px' }}>
        Detalhamento por credor
      </div>
      <div className="card" style={{ overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ overflow: 'auto', maxHeight: '60vh' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <SortHeader k="credor" sort={sortG} style={{ ...th, minWidth: 180 }}>Credor</SortHeader>
              <SortHeader k="topNatureza" sort={sortG} style={{ ...th, minWidth: 130 }}>Natureza predominante</SortHeader>
              <SortHeader k="count" sort={sortG} style={{ ...th, textAlign: 'right', minWidth: 100 }}>Lançamentos</SortHeader>
              <SortHeader k="overdueCount" sort={sortG} style={{ ...th, textAlign: 'right', minWidth: 100 }}>Vencidos</SortHeader>
              <SortHeader k="maxDelayDays" sort={sortG} style={{ ...th, textAlign: 'right', minWidth: 130 }}>Atraso máx.</SortHeader>
              <SortHeader k="nextDue" sort={sortG} style={{ ...th, minWidth: 120 }}>Próx. vencimento</SortHeader>
              <SortHeader k="earliestFiledAt" sort={sortG} style={{ ...th, minWidth: 120 }}>Protocolo RJ</SortHeader>
              <SortHeader k="total" sort={sortG} style={{ ...th, textAlign: 'right', minWidth: 130 }}>Total (BRL PTAX)</SortHeader>
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Carregando...</td></tr>}
              {!loading && byCreditor.length === 0 && <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Nenhum lançamento marcado como Recuperação Judicial.</td></tr>}
              {sortedGroups.map(g => (
                <tr key={g.credor}>
                  <td style={{ ...td, fontWeight: 600 }}>{g.credor}</td>
                  <td style={{ ...td, color: 'var(--text-secondary)' }}>{g.topNatureza}</td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: mono }}>{g.count}</td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: mono, color: g.overdueCount > 0 ? 'var(--neg)' : 'var(--text-muted)', fontWeight: g.overdueCount > 0 ? 600 : 400 }}>{g.overdueCount}</td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: mono, color: g.maxDelayDays > 0 ? 'var(--neg)' : 'var(--text-muted)' }}>{g.maxDelayDays > 0 ? `${g.maxDelayDays} dias` : '—'}</td>
                  <td style={{ ...td, fontFamily: mono, fontSize: 12 }}>{g.nextDue ? fmtDate(g.nextDue) : '—'}</td>
                  <td style={{ ...td, fontFamily: mono, fontSize: 12, color: 'var(--text-secondary)' }}>{fmtDate(g.earliestFiledAt)}</td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: mono, fontWeight: 700 }}>{fmtCurrencyShort(g.total, 'BRL')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Detalhe por lançamento ─────────────────────────────────────── */}
      <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-secondary)', margin: '6px 0 10px' }}>
        Lançamentos incluídos
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 200px)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <SortHeader k="dueDate" sort={sort} style={{ ...th, minWidth: 100 }}>Vencimento</SortHeader>
              <SortHeader k="atleta" sort={sort} style={{ ...th, minWidth: 140 }}>Atleta</SortHeader>
              <SortHeader k="credor" sort={sort} style={{ ...th, minWidth: 150 }}>Credor</SortHeader>
              <SortHeader k="natureza" sort={sort} style={{ ...th, minWidth: 130 }}>Natureza</SortHeader>
              <SortHeader k="descricao" sort={sort} style={{ ...th, minWidth: 200 }}>Descrição</SortHeader>
              <SortHeader k="valor" sort={sort} style={{ ...th, textAlign: 'right', minWidth: 110 }}>Valor</SortHeader>
              <SortHeader k="valorBRL" sort={sort} style={{ ...th, textAlign: 'right', minWidth: 120 }}>Valor (BRL PTAX)</SortHeader>
              <SortHeader k="atraso" sort={sort} style={{ ...th, textAlign: 'right', minWidth: 100 }}>Atraso</SortHeader>
              <SortHeader k="filedAt" sort={sort} style={{ ...th, minWidth: 110 }}>Protocolo</SortHeader>
              <SortHeader k="status" sort={sort} style={{ ...th, minWidth: 90 }}>Status</SortHeader>
              {canEdit && <th style={{ ...th, textAlign: 'right', minWidth: 90 }}>Ações</th>}
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={canEdit ? 11 : 10} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Carregando...</td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={canEdit ? 11 : 10} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Nenhum lançamento em RJ.</td></tr>}
              {sortedRows.map(r => {
                const d = r.dueDate ? daysFromToday(r.dueDate) : null
                const isLate = d !== null && d < 0 && OPEN.has(r.status)
                return (
                  <tr key={`${r.kind}-${r.id}`}>
                    <td style={{ ...td, fontFamily: mono, fontSize: 12, color: isLate ? 'var(--neg)' : 'var(--ink-secondary)', fontWeight: isLate ? 700 : 400 }}>{r.dueDate ? fmtDate(r.dueDate) : '—'}</td>
                    <td style={{ ...td, fontWeight: 600 }}><RefLink to={`/atletas/${r.athleteId}`} title="Abrir atleta">{r.atleta}</RefLink></td>
                    <td style={{ ...td, color: 'var(--text-secondary)' }}>{r.credor}</td>
                    <td style={td}>{r.natureza}</td>
                    <td style={{ ...td, color: 'var(--text-secondary)', fontSize: 12 }}>{r.descricao}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: mono, fontWeight: 600 }}>{fmtCurrencyShort(r.valor, r.moeda)}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: mono, color: 'var(--ink-secondary)' }}>{fmtCurrencyShort(brlOf(r), 'BRL')}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: mono, color: isLate ? 'var(--neg)' : 'var(--text-muted)', fontWeight: isLate ? 600 : 400 }}>{isLate ? `${-d!} dias` : '—'}</td>
                    <td style={{ ...td, fontFamily: mono, fontSize: 12, color: 'var(--text-secondary)' }}>{fmtDate(r.filedAt)}</td>
                    <td style={td}>
                      <span style={{
                        display: 'inline-block', padding: '2px 9px', borderRadius: 5, fontSize: 11, fontWeight: 600,
                        fontFamily: mono, letterSpacing: '0.08em', textTransform: 'uppercase',
                        background: r.status === 'PAGA' ? 'var(--pos-tint)' : r.status === 'EM_ATRASO' ? 'var(--neg-tint)' : 'var(--cream-inset)',
                        color: r.status === 'PAGA' ? 'var(--pos)' : r.status === 'EM_ATRASO' ? 'var(--neg)' : 'var(--ink-secondary)',
                      }}>{r.status.replace(/_/g, ' ')}</span>
                    </td>
                    {canEdit && (
                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button onClick={() => unmark(r)}
                          style={{ background: 'transparent', border: '1px solid var(--divider-strong)', borderRadius: 6, padding: '3px 8px', fontFamily: mono, fontSize: 11, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text-secondary)', cursor: 'pointer' }}
                          title="Retirar este lançamento da Recuperação Judicial">
                          Retirar da RJ
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)', fontFamily: mono }}>
        {filtered.length} lançamento(s) · {byCreditor.length} credor(es)
      </div>
    </div>
  )
}

// src/pages/PageAcordos.tsx
// Relatório de Acordos e Renegociações — visão consolidada de todas as
// renegociações (dívidas reabertas em novos fluxos), com dívida original, novo
// total, desconto, andamento do pagamento e link para o atleta.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchAthletes, fetchAllClauses, fetchAllInstallments,
} from '../lib/athleteQueries'
import type { Athlete, Clause, ClauseInstallment, Currency } from '../types/athlete-system'
import { decodeAcordo, isAcordo } from '../lib/renegotiation'
import { fmtCurrencyShort, fmtDate, isOverdue } from '../lib/format'
import { exportWorkbook, type ColDef } from '../lib/xlsx-utils'
import PageHero from '../components/PageHero'
import RefLink from '../components/RefLink'
import { Icon } from '../components/Icon'
import RowActions from '../components/RowActions'
import { ClauseFlowModal } from '../components/modals/EditModals'
import RenegotiationEditModal from '../components/modals/RenegotiationEditModal'
import { useAuth } from '../context/AuthContext'

const fontBody = "var(--font-body)"
const fontMono = "var(--font-label)"
const APPROX_BRL: Record<string, number> = { BRL: 1, EUR: 6.10, USD: 5.55, GBP: 7.10 }

type Andamento = 'QUITADO' | 'EM_ANDAMENTO' | 'PENDENTE' | 'EM_ATRASO'
const AND_STYLE: Record<Andamento, { bg: string; fg: string; label: string }> = {
  QUITADO:      { bg: 'var(--pos-tint)', fg: 'var(--pos)', label: 'Quitado' },
  EM_ANDAMENTO: { bg: 'var(--warn-tint)', fg: 'var(--warn)', label: 'Em andamento' },
  PENDENTE:     { bg: 'var(--cream-inset)', fg: 'var(--ink-secondary)', label: 'Pendente' },
  EM_ATRASO:    { bg: 'var(--neg-tint)', fg: 'var(--neg)', label: 'Em atraso' },
}

interface Row {
  id: string
  athleteId: string
  atleta: string
  credor: string
  devedor: string
  data: string
  originalTotal: number
  newTotal: number
  discount: number
  currency: Currency
  count: number
  paid: number
  andamento: Andamento
  note: string
}

export default function PageAcordos() {
  const { profile } = useAuth()
  const canEdit = !profile || profile.role === 'master' || profile.role === 'juridico'
  const [rows, setRows] = useState<Row[]>([])
  const [acordoClauses, setAcordoClauses] = useState<Clause[]>([])
  const [editId, setEditId] = useState<string | null>(null)
  const [flowId, setFlowId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [atletaFilter, setAtletaFilter] = useState('Todos')
  const [statusFilter, setStatusFilter] = useState('Todos')

  const load = useCallback(async () => {
    setLoading(true)
    const [athletes, clauses, installments] = await Promise.all([
      fetchAthletes(), fetchAllClauses(), fetchAllInstallments(),
    ])
    const nameOf = new Map<string, string>(athletes.map((a: Athlete) => [a.id, a.short_name || a.full_name]))
    const built: Row[] = []
    const acordos = clauses.filter(isAcordo)
    setAcordoClauses(acordos)
    for (const c of acordos) {
      const meta = decodeAcordo(c.notes)
      const parc = installments.filter((i: ClauseInstallment) => i.clause_id === c.id)
      const paid = parc.filter(p => p.payment_status === 'PAGA').length
      const late = parc.some(p => isOverdue(p.due_date, p.payment_status))
      const andamento: Andamento = paid >= parc.length && parc.length > 0 ? 'QUITADO'
        : late ? 'EM_ATRASO' : paid > 0 ? 'EM_ANDAMENTO' : 'PENDENTE'
      built.push({
        id: c.id, athleteId: c.athlete_id, atleta: nameOf.get(c.athlete_id) ?? '—',
        credor: meta?.creditor ?? c.creditor_party, devedor: meta?.debtor ?? c.debtor_party,
        data: meta?.createdAt ?? c.created_at?.slice(0, 10) ?? '',
        originalTotal: meta?.originalTotal ?? (c.original_value ?? 0),
        newTotal: meta?.newTotal ?? (c.original_value ?? 0),
        discount: meta?.discount ?? 0,
        currency: (meta?.currency ?? c.currency) as Currency,
        count: parc.length || c.installments_total, paid, andamento,
        note: meta?.userNote ?? '',
      })
    }
    built.sort((a, b) => b.data.localeCompare(a.data))
    setRows(built)
    setLoading(false)
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial no mount
  useEffect(() => { let alive = true; load().catch(() => { if (alive) setLoading(false) }); return () => { alive = false } }, [load])

  const atletas = useMemo(() => ['Todos', ...Array.from(new Set(rows.map(r => r.atleta))).sort()], [rows])
  const statuses = useMemo(() => ['Todos', ...Array.from(new Set(rows.map(r => AND_STYLE[r.andamento].label)))], [rows])

  const filtered = useMemo(() => rows.filter(r => {
    if (atletaFilter !== 'Todos' && r.atleta !== atletaFilter) return false
    if (statusFilter !== 'Todos' && AND_STYLE[r.andamento].label !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (![r.atleta, r.credor, r.devedor, r.note].some(v => v.toLowerCase().includes(q))) return false
    }
    return true
  }), [rows, atletaFilter, statusFilter, search])

  const totalDiscountBRL = filtered.reduce((s, r) => s + r.discount * (APPROX_BRL[r.currency] ?? 1), 0)

  const exportCols: ColDef[] = [
    { key: 'atleta', header: 'Atleta' }, { key: 'credor', header: 'Credor' },
    { key: 'devedor', header: 'Devedor' }, { key: 'data', header: 'Data' },
    { key: 'originalTotal', header: 'Dívida Original' }, { key: 'newTotal', header: 'Novo Total' },
    { key: 'discount', header: 'Desconto' }, { key: 'currency', header: 'Moeda' },
    { key: 'count', header: 'Nº Parcelas' }, { key: 'paid', header: 'Parcelas Pagas' },
    { key: 'andamento', header: 'Andamento' }, { key: 'note', header: 'Observações' },
  ]
  function exportXlsx() {
    exportWorkbook([{ name: 'Acordos', cols: exportCols, rows: filtered.map(r => ({ ...r, andamento: AND_STYLE[r.andamento].label })) as unknown as Record<string, unknown>[] }], 'acordos-renegociacoes.xlsx')
  }

  const th: React.CSSProperties = { padding: '9px 12px', fontSize: 9, fontWeight: 500, textTransform: 'uppercase', background: 'var(--tbl-head)', color: 'var(--ink-secondary)', borderBottom: '1px solid var(--divider-strong)', fontFamily: fontMono, letterSpacing: '0.16em', whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1, textAlign: 'left' }
  const td: React.CSSProperties = { padding: '10px 12px', fontSize: 12, color: 'var(--ink-primary)', fontFamily: fontBody, borderBottom: '1px solid var(--divider-soft)', verticalAlign: 'middle' }
  const tdNum: React.CSSProperties = { ...td, fontFamily: fontMono, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

  return (
    <div style={{ padding: '24px 28px 32px', width: '100%', boxSizing: 'border-box' }}>
      <PageHero title="Acordos e Renegociações" subtitle="Relatório de dívidas reabertas em novos fluxos" />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button onClick={exportXlsx} className="btn btn-outline"><Icon name="download" size={14} /> Exportar</button>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 9, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Busca</div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Atleta, credor, observações..."
            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--cream-card)', fontSize: 13, fontFamily: fontBody, color: 'var(--ink-primary)' }} />
        </div>
        <div>
          <div style={{ fontSize: 9, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Atleta</div>
          <select value={atletaFilter} onChange={e => setAtletaFilter(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--cream-card)', fontSize: 13, fontFamily: fontBody, color: 'var(--ink-primary)', maxWidth: 200 }}>
            {atletas.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 9, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Andamento</div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--cream-card)', fontSize: 13, fontFamily: fontBody, color: 'var(--ink-primary)' }}>
            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="card" style={{ padding: '10px 18px', marginLeft: 'auto' }}>
          <div style={{ fontSize: 9, fontFamily: fontMono, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 3 }}>
            {totalDiscountBRL < 0 ? 'Acréscimo total (aprox. BRL)' : 'Desconto total (aprox. BRL)'}
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, fontFamily: fontMono, color: totalDiscountBRL < 0 ? 'var(--neg)' : 'var(--pos)' }}>
            {fmtCurrencyShort(Math.abs(totalDiscountBRL), 'BRL')}
          </div>
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 240px)', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
            <thead>
              <tr>
                <th style={th}>Atleta</th>
                <th style={th}>Credor</th>
                <th style={th}>Data</th>
                <th style={{ ...th, textAlign: 'right' }}>Dívida Original</th>
                <th style={{ ...th, textAlign: 'right' }}>Novo Total</th>
                <th style={{ ...th, textAlign: 'right' }}>Desconto</th>
                <th style={{ ...th, textAlign: 'center' }}>Parcelas</th>
                <th style={th}>Andamento</th>
                <th style={{ ...th, textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Carregando...</td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Nenhum acordo registrado.</td></tr>}
              {filtered.map(r => {
                const st = AND_STYLE[r.andamento]
                return (
                  <tr key={r.id}>
                    <td style={{ ...td, fontWeight: 600 }}><RefLink to={`/atletas/${r.athleteId}`} title={`Abrir ${r.atleta}`}>{r.atleta}</RefLink></td>
                    <td style={{ ...td, color: 'var(--text-secondary)' }}>{r.credor}</td>
                    <td style={{ ...td, fontFamily: fontMono, fontSize: 12, color: 'var(--text-secondary)' }}>{r.data ? fmtDate(r.data) : '—'}</td>
                    <td style={tdNum}>{fmtCurrencyShort(r.originalTotal, r.currency)}</td>
                    <td style={tdNum}>{fmtCurrencyShort(r.newTotal, r.currency)}</td>
                    <td style={{ ...tdNum, color: r.discount > 0 ? 'var(--pos)' : r.discount < 0 ? 'var(--neg)' : 'var(--text-muted)' }}
                      title={r.discount < 0 ? 'Acréscimo: o novo fluxo é maior que a dívida de origem' : undefined}>
                      {r.discount
                        ? (r.discount < 0
                          ? `+ ${fmtCurrencyShort(-r.discount, r.currency)}`
                          : fmtCurrencyShort(r.discount, r.currency))
                        : '—'}
                    </td>
                    <td style={{ ...td, textAlign: 'center', fontFamily: fontMono }}>{r.paid}/{r.count}</td>
                    <td style={td}><span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 5, fontSize: 9, fontWeight: 600, fontFamily: fontMono, letterSpacing: '0.08em', textTransform: 'uppercase', background: st.bg, color: st.fg }}>{st.label}</span></td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <RowActions
                        open={{ to: `/obrigacoes/${r.id}`, label: 'Abrir o acordo' }}
                        edit={{ onClick: canEdit ? () => setEditId(r.id) : undefined, label: 'Editar / desfazer a renegociação', reason: 'sem permissão de edição' }}
                        schedule={{ onClick: canEdit ? () => setFlowId(r.id) : undefined, label: 'Ver / editar as parcelas do acordo', reason: 'sem permissão de edição' }}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)', fontFamily: fontMono }}>
        {filtered.length} {filtered.length === 1 ? 'acordo' : 'acordos'}
      </div>

      {editId && (() => {
        const cl = acordoClauses.find(c => c.id === editId)
        return cl ? (
          <RenegotiationEditModal acordo={cl}
            onClose={() => setEditId(null)}
            onSaved={() => { setEditId(null); load() }}
            onDeleted={() => { setEditId(null); load() }} />
        ) : null
      })()}
      {flowId && (() => {
        const cl = acordoClauses.find(c => c.id === flowId)
        return cl ? <ClauseFlowModal clause={cl} onClose={() => setFlowId(null)} onSaved={() => { setFlowId(null); load() }} /> : null
      })()}
    </div>
  )
}

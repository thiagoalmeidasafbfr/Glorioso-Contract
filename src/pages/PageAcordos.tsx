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
import KpiPill from '../components/KpiPill'
import { ClauseFlowModal } from '../components/modals/EditModals'
import RenegotiationEditModal from '../components/modals/RenegotiationEditModal'
import { useAuth } from '../context/AuthContext'
import { BADGE_TONES, badgeStyle, type ToneStyle } from '../lib/tones'
import { tr, trf, trCols } from '../i18n'

const fontBody = "var(--font-body)"
const fontMono = "var(--font-label)"
const APPROX_BRL: Record<string, number> = { BRL: 1, EUR: 6.10, USD: 5.55, GBP: 7.10 }

type Andamento = 'QUITADO' | 'EM_ANDAMENTO' | 'PENDENTE' | 'EM_ATRASO'
const AND_STYLE: Record<Andamento, ToneStyle & { label: string }> = {
  QUITADO:      { ...BADGE_TONES.accent, label: 'Quitado' },
  EM_ANDAMENTO: { ...BADGE_TONES.warning, label: 'Em andamento' },
  PENDENTE:     { ...BADGE_TONES.neutral, label: 'Pendente' },
  EM_ATRASO:    { ...BADGE_TONES.negative, label: 'Em atraso' },
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
    exportWorkbook([{ name: tr('Acordos'), cols: trCols(exportCols), rows: filtered.map(r => ({ ...r, andamento: tr(AND_STYLE[r.andamento].label) })) as unknown as Record<string, unknown>[] }], 'acordos-renegociacoes.xlsx')
  }

  const th: React.CSSProperties = { padding: '8px 12px', fontSize: 10, fontWeight: 400, textTransform: 'uppercase', background: 'var(--tbl-head)', color: 'var(--text-muted)', borderBottom: '1px solid var(--divider-strong)', fontFamily: fontMono, letterSpacing: 'var(--text-overline-tracking)', whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1, textAlign: 'left' }
  const td: React.CSSProperties = { padding: '8px 12px', fontSize: 12, color: 'var(--ink-primary)', fontFamily: fontBody, borderBottom: '1px solid var(--divider-soft)', verticalAlign: 'middle' }
  const tdNum: React.CSSProperties = { ...td, fontFamily: fontMono, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

  return (
    <div style={{ padding: '24px 28px 32px', width: '100%', boxSizing: 'border-box' }}>
      <PageHero title={tr('Acordos e Renegociações')} section={tr('Relatórios')} subtitle={tr('Relatório de dívidas reabertas em novos fluxos')} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button onClick={exportXlsx} className="btn btn-outline"><Icon name="download" size={16} /> {tr('Exportar')}</button>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 10, fontFamily: fontMono, letterSpacing: 'var(--text-overline-tracking)', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>{tr('Busca')}</div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={tr('Atleta, credor, observações...')}
            style={{ width: '100%', padding: '4px 10px', borderRadius: 'var(--ui-control-radius)', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--cream-card)', fontSize: 'var(--ui-text-size)', fontFamily: fontBody, color: 'var(--ink-primary)' }} />
        </div>
        <div>
          <div style={{ fontSize: 10, fontFamily: fontMono, letterSpacing: 'var(--text-overline-tracking)', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>{tr('Atleta')}</div>
          <select value={atletaFilter} onChange={e => setAtletaFilter(e.target.value)}
            style={{ padding: '4px 10px', borderRadius: 'var(--ui-control-radius)', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--cream-card)', fontSize: 'var(--ui-text-size)', fontFamily: fontBody, color: 'var(--ink-primary)', maxWidth: 200 }}>
            {atletas.map(s => <option key={s} value={s}>{tr(s)}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 10, fontFamily: fontMono, letterSpacing: 'var(--text-overline-tracking)', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>{tr('Andamento')}</div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            style={{ padding: '4px 10px', borderRadius: 'var(--ui-control-radius)', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--cream-card)', fontSize: 'var(--ui-text-size)', fontFamily: fontBody, color: 'var(--ink-primary)' }}>
            {statuses.map(s => <option key={s} value={s}>{tr(s)}</option>)}
          </select>
        </div>
        <div className="kpi-group">
          <KpiPill
            label={totalDiscountBRL < 0 ? tr('Acréscimo total (aprox. BRL)') : tr('Desconto total (aprox. BRL)')}
            value={fmtCurrencyShort(Math.abs(totalDiscountBRL), 'BRL')}
            tone={totalDiscountBRL < 0 ? 'neg' : 'pos'}
          />
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 240px)', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
            <thead>
              <tr>
                <th style={th}>{tr('Atleta')}</th>
                <th style={th}>{tr('Credor')}</th>
                <th style={th}>{tr('Data')}</th>
                <th style={{ ...th, textAlign: 'right' }}>{tr('Dívida Original')}</th>
                <th style={{ ...th, textAlign: 'right' }}>{tr('Novo Total')}</th>
                <th style={{ ...th, textAlign: 'right' }}>{tr('Desconto')}</th>
                <th style={{ ...th, textAlign: 'center' }}>{tr('Parcelas')}</th>
                <th style={th}>{tr('Andamento')}</th>
                <th style={{ ...th, textAlign: 'right' }}>{tr('Ações')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: 'var(--text-secondary)', padding: 40 }}>{tr('Carregando…')}</td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: 'var(--text-secondary)', padding: 40 }}>{tr('Nenhum acordo registrado.')}</td></tr>}
              {filtered.map(r => {
                const st = AND_STYLE[r.andamento]
                return (
                  <tr key={r.id}>
                    <td style={{ ...td, fontWeight: 500 }}><RefLink to={`/atletas/${r.athleteId}`} title={trf('Abrir {0}', r.atleta)}>{tr(r.atleta)}</RefLink></td>
                    <td style={{ ...td, color: 'var(--text-secondary)' }}>{tr(r.credor)}</td>
                    <td style={{ ...td, fontFamily: fontMono, fontSize: 12, color: 'var(--text-secondary)' }}>{r.data ? fmtDate(r.data) : '—'}</td>
                    <td style={tdNum}>{fmtCurrencyShort(r.originalTotal, r.currency)}</td>
                    <td style={tdNum}>{fmtCurrencyShort(r.newTotal, r.currency)}</td>
                    <td style={{ ...tdNum, color: r.discount > 0 ? 'var(--pos)' : r.discount < 0 ? 'var(--neg)' : 'var(--text-muted)' }}
                      title={r.discount < 0 ? tr('Acréscimo: o novo fluxo é maior que a dívida de origem') : undefined}>
                      {r.discount
                        ? (r.discount < 0
                          ? `+ ${fmtCurrencyShort(-r.discount, r.currency)}`
                          : fmtCurrencyShort(r.discount, r.currency))
                        : '—'}
                    </td>
                    <td style={{ ...td, textAlign: 'center', fontFamily: fontMono }}>{r.paid}/{r.count}</td>
                    <td style={td}><span style={badgeStyle(st)}>{tr(st.label)}</span></td>
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
      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-secondary)', fontFamily: fontMono }}>
        {filtered.length} {filtered.length === 1 ? tr('acordo') : tr('acordos')}
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

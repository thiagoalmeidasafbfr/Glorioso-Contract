// src/pages/PageConsolidado.tsx
// Consolidado GLOBAL — todas as movimentações financeiras de todos os atletas,
// parcela por parcela: salários (CLT), imagem, luvas, bônus, transferências,
// intermediação, solidariedade, cláusulas em geral e obrigações com clube/agente.
// Cada linha é um vencimento (parcela) ou um item de pagamento único.

import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchAthletes, fetchAllClauses, fetchAllInstallments,
  fetchAllClubLiabilities, fetchAllIntermediaryLiabilities,
} from '../lib/athleteQueries'
import { fmtCurrencyShort, fmtDate, isOverdue } from '../lib/format'
import { CLAUSE_TYPE_LABELS } from '../types/athlete-system'
import type { Currency } from '../types/athlete-system'
import { exportWorkbook, type ColDef } from '../lib/xlsx-utils'

const font = "'Inter', system-ui, sans-serif"
const mono = "'IBM Plex Mono', monospace"

const APPROX_BRL: Record<string, number> = { BRL: 1, EUR: 6.10, USD: 5.55, GBP: 7.10 }
const OPEN = ['PENDENTE', 'PARCIALMENTE_PAGA', 'EM_ATRASO', 'VENCIDA']
const STATUS_OPTS = ['Todos', 'PENDENTE', 'PAGA', 'EM_ATRASO', 'CANCELADA']

interface Mov {
  id: string
  date: string | null
  athleteId: string
  atleta: string
  natureza: string
  contraparte: string
  descricao: string
  dir: 'A_PAGAR' | 'A_RECEBER'
  valor: number
  moeda: Currency
  status: string
}

const isBFR = (s: string | null | undefined) => !!s && (s.toLowerCase().includes('botafogo') || s.toLowerCase() === 'bfr')

export default function PageConsolidado() {
  const navigate = useNavigate()
  const [movs, setMovs] = useState<Mov[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('Todos')

  useEffect(() => {
    (async () => {
      setLoading(true)
      const [athletes, clauses, installments, clubLiabs, interLiabs] = await Promise.all([
        fetchAthletes(), fetchAllClauses(), fetchAllInstallments(),
        fetchAllClubLiabilities(), fetchAllIntermediaryLiabilities(),
      ])
      const nameOf = new Map(athletes.map(a => [a.id, a.full_name]))
      const clauseById = new Map(clauses.map(c => [c.id, c]))
      const withInst = new Set(installments.map(i => i.clause_id))
      const list: Mov[] = []

      // Parcelas de cláusulas
      for (const it of installments) {
        const c = clauseById.get(it.clause_id)
        const dir: Mov['dir'] = c && isBFR(c.debtor_party) ? 'A_PAGAR' : c ? 'A_RECEBER' : 'A_PAGAR'
        list.push({
          id: it.id, date: it.due_date, athleteId: it.athlete_id, atleta: nameOf.get(it.athlete_id) ?? '—',
          natureza: c ? CLAUSE_TYPE_LABELS[c.clause_type] : 'Parcela',
          contraparte: c ? (dir === 'A_PAGAR' ? c.creditor_party : c.debtor_party) : '—',
          descricao: c ? `${c.description} — parc. ${it.installment_number}` : `Parcela ${it.installment_number}`,
          dir, valor: it.original_value, moeda: it.currency, status: it.payment_status,
        })
      }
      // Cláusulas de pagamento único (sem parcelas geradas)
      for (const c of clauses) {
        if (withInst.has(c.id)) continue
        if (c.original_value == null) continue
        const dir: Mov['dir'] = isBFR(c.debtor_party) ? 'A_PAGAR' : 'A_RECEBER'
        list.push({
          id: c.id, date: c.due_date, athleteId: c.athlete_id, atleta: nameOf.get(c.athlete_id) ?? '—',
          natureza: CLAUSE_TYPE_LABELS[c.clause_type], contraparte: dir === 'A_PAGAR' ? c.creditor_party : c.debtor_party,
          descricao: c.description, dir, valor: c.original_value, moeda: c.currency, status: c.payment_status,
        })
      }
      // Obrigações com clube / agente
      for (const l of clubLiabs) list.push({
        id: l.id, date: l.due_date, athleteId: l.athlete_id, atleta: nameOf.get(l.athlete_id) ?? '—',
        natureza: 'Obrigação clube', contraparte: l.club_name, descricao: l.description ?? '',
        dir: l.direction, valor: l.amount, moeda: l.currency, status: l.status,
      })
      for (const l of interLiabs) list.push({
        id: l.id, date: l.due_date, athleteId: l.athlete_id, atleta: nameOf.get(l.athlete_id) ?? '—',
        natureza: 'Intermediação', contraparte: l.intermediary_name, descricao: l.description ?? '',
        dir: l.direction, valor: l.amount, moeda: l.currency, status: l.status,
      })

      list.sort((a, b) => (a.date ?? '9999-99-99').localeCompare(b.date ?? '9999-99-99'))
      setMovs(list)
      setLoading(false)
    })()
  }, [])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return movs.filter(m => {
      if (status !== 'Todos' && m.status !== status) return false
      if (!needle) return true
      return [m.atleta, m.natureza, m.contraparte, m.descricao].some(v => v.toLowerCase().includes(needle))
    })
  }, [movs, q, status])

  // Totais por direção (em aberto), aproximados em BRL.
  const totals = useMemo(() => {
    let pay = 0, rec = 0
    for (const m of filtered) if (OPEN.includes(m.status)) {
      const brl = m.valor * (APPROX_BRL[m.moeda] ?? 1)
      if (m.dir === 'A_PAGAR') pay += brl; else rec += brl
    }
    return { pay, rec }
  }, [filtered])

  function exportAll() {
    const cols: ColDef[] = [
      { key: 'atleta', header: 'Atleta' }, { key: 'natureza', header: 'Natureza' },
      { key: 'contraparte', header: 'Contraparte' }, { key: 'descricao', header: 'Descrição' },
      { key: 'dir', header: 'Direção' }, { key: 'valor', header: 'Valor' }, { key: 'moeda', header: 'Moeda' },
      { key: 'vencimento', header: 'Vencimento' }, { key: 'status', header: 'Status' },
    ]
    const rows = filtered.map(m => ({ ...m, dir: m.dir === 'A_PAGAR' ? 'A pagar' : 'A receber', vencimento: m.date ?? '' }))
    exportWorkbook([{ name: 'Consolidado', cols, rows }], 'consolidado-movimentacoes.xlsx')
  }

  const th: React.CSSProperties = { padding: '9px 12px', fontSize: 9, fontWeight: 500, textTransform: 'uppercase', background: 'var(--tbl-head)', color: 'var(--ink-secondary)', borderBottom: '1px solid var(--divider-strong)', fontFamily: mono, letterSpacing: '0.14em', whiteSpace: 'nowrap', textAlign: 'left' }
  const td: React.CSSProperties = { padding: '9px 12px', fontSize: 12, color: 'var(--ink-primary)', fontFamily: font, borderBottom: '1px solid var(--divider-soft)', verticalAlign: 'middle' }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1280, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div>
          <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--gold-deep)', marginBottom: 6 }}>Todas as movimentações financeiras</div>
          <h1 style={{ fontFamily: font, fontSize: 24, fontWeight: 700, color: 'var(--ink-primary)', margin: 0 }}>Consolidado</h1>
          <div style={{ height: 2, width: 38, background: 'var(--gold)', borderRadius: 2, marginTop: 8 }} />
        </div>
        <button onClick={exportAll} style={{ padding: '9px 18px', background: 'var(--ink-primary)', border: 'none', borderRadius: 8, color: 'var(--gold-soft)', fontFamily: font, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>↓ Exportar</button>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <label style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Busca</label>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Atleta, natureza, contraparte, descrição..." style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--divider-strong)', fontFamily: font, fontSize: 13, background: 'var(--surface, #fff)', color: 'var(--ink-primary)', boxSizing: 'border-box' }} />
        </div>
        <div>
          <label style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Status</label>
          <select value={status} onChange={e => setStatus(e.target.value)} style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid var(--divider-strong)', fontFamily: font, fontSize: 13, background: 'var(--surface, #fff)', color: 'var(--ink-primary)' }}>
            {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--neg-tint)', border: '1px solid rgba(220,38,38,0.25)' }}>
          <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--neg)' }}>A pagar (aprox. BRL)</div>
          <div style={{ fontFamily: mono, fontSize: 16, fontWeight: 700, color: 'var(--neg)' }}>{fmtCurrencyShort(totals.pay, 'BRL')}</div>
        </div>
        <div style={{ padding: '8px 14px', borderRadius: 8, background: '#dcf0e4', border: '1px solid rgba(22,101,52,0.25)' }}>
          <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#166534' }}>A receber (aprox. BRL)</div>
          <div style={{ fontFamily: mono, fontSize: 16, fontWeight: 700, color: '#166534' }}>{fmtCurrencyShort(totals.rec, 'BRL')}</div>
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={{ ...th, minWidth: 90 }}>Vencimento</th>
              <th style={{ ...th, minWidth: 140 }}>Atleta</th>
              <th style={{ ...th, minWidth: 150 }}>Natureza</th>
              <th style={{ ...th, minWidth: 150 }}>Contraparte</th>
              <th style={{ ...th, minWidth: 80 }}>Direção</th>
              <th style={{ ...th, textAlign: 'right', minWidth: 110 }}>Valor</th>
              <th style={{ ...th, minWidth: 90 }}>Status</th>
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Carregando...</td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Nenhuma movimentação.</td></tr>}
              {filtered.map(m => {
                const late = isOverdue(m.date, m.status)
                return (
                  <tr key={m.id} style={{ background: late ? 'var(--row-late-bg)' : 'transparent' }}>
                    <td style={{ ...td, fontFamily: mono, fontSize: 11, color: late ? 'var(--neg)' : 'var(--ink-secondary)', fontWeight: late ? 700 : 400 }}>{m.date ? fmtDate(m.date) : '—'}</td>
                    <td style={td}><button onClick={() => navigate(`/atletas/${m.athleteId}`)} style={{ background: 'none', border: 'none', padding: 0, color: '#be8c4a', fontFamily: font, fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>{m.atleta}</button></td>
                    <td style={{ ...td, fontSize: 12 }}>{m.natureza}</td>
                    <td style={{ ...td, fontSize: 12, color: 'var(--text-secondary)' }}>{m.contraparte}</td>
                    <td style={{ ...td, textAlign: 'center', fontSize: 10, fontFamily: mono, color: m.dir === 'A_PAGAR' ? 'var(--neg)' : '#166534' }}>{m.dir === 'A_PAGAR' ? 'a pagar' : 'a receber'}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: mono, fontWeight: 600 }}>{fmtCurrencyShort(m.valor, m.moeda)}</td>
                    <td style={{ ...td, fontFamily: mono, fontSize: 11 }}>{m.status}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ marginTop: 10, fontFamily: mono, fontSize: 11, color: 'var(--text-muted)' }}>{filtered.length} movimentação(ões)</div>
    </div>
  )
}

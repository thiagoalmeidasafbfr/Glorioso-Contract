// src/pages/PageRelSellOn.tsx
// Relatório de vendas futuras (sell-on) — consolida TODAS as cláusulas de
// sell-on da carteira: a pagar (SELL_ON_FEE) e a receber (SELL_ON_FEE_RECEBER).
// Para cada linha mostra o atleta, contraparte, base de cálculo (mais-valia ou
// valor total), o percentual e a condição descrita. Não há vencimento — o
// sell-on só materializa quando o atleta é vendido; a coluna "status" mostra o
// achievement_status (pendente / atingido / não aplicável).

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchAthletes, fetchAllClauses,
} from '../lib/athleteQueries'
import type { Athlete, Clause } from '../types/athlete-system'
import { SELL_ON_CLAUSE_TYPES, CLAUSE_TYPE_LABELS } from '../types/athlete-system'
import { fmtCurrencyShort, fmtDate } from '../lib/format'
import { exportWorkbook, type ColDef } from '../lib/xlsx-utils'
import PageHero from '../components/PageHero'
import RefLink from '../components/RefLink'
import { Icon } from '../components/Icon'
import RowActions from '../components/RowActions'
import { BADGE_TONES, badgeStyle, type ToneStyle } from '../lib/tones'
import { tr, trf, trn, trCols } from '../i18n'

// Direção "a pagar" / "a receber" a partir do tipo (SELL_ON_FEE = Botafogo paga
// a antigo dono; SELL_ON_FEE_RECEBER = Botafogo recebe em revenda futura).
type Dir = 'A_PAGAR' | 'A_RECEBER'
const dirOf = (t: Clause['clause_type']): Dir => t === 'SELL_ON_FEE_RECEBER' ? 'A_RECEBER' : 'A_PAGAR'

interface Row {
  id: string
  athleteId: string
  atleta: string
  dir: Dir
  contraparte: string
  clauseType: Clause['clause_type']
  percentage: number | null
  fixedValue: number | null
  currency: Clause['currency']
  basis: string
  condition: string
  status: Clause['achievement_status']
  achievedDate: string | null
}

const STATUS_STYLE: Record<Clause['achievement_status'], ToneStyle & { label: string }> = {
  PENDENTE:      { ...BADGE_TONES.neutral, label: 'Pendente'      },
  ATINGIDA:      { ...BADGE_TONES.accent,  label: 'Atingido'     },
  NAO_ATINGIDA:  { ...BADGE_TONES.outline, label: 'Não atingido' },
  NAO_APLICAVEL: { ...BADGE_TONES.outline, label: 'N/A'          },
}

export default function PageRelSellOn() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dirFilter, setDirFilter] = useState<'Todos' | Dir>('Todos')
  const [statusFilter, setStatusFilter] = useState<'Todos' | Clause['achievement_status']>('Todos')

  const load = useCallback(async () => {
    setLoading(true)
    const [athletes, clauses] = await Promise.all([fetchAthletes(), fetchAllClauses()])
    const nameOf = new Map<string, string>(athletes.map((a: Athlete) => [a.id, a.short_name || a.full_name]))
    const built: Row[] = clauses
      .filter(c => SELL_ON_CLAUSE_TYPES.includes(c.clause_type))
      .map(c => {
        const dir = dirOf(c.clause_type)
        const contraparte = dir === 'A_PAGAR' ? c.creditor_party : c.debtor_party
        // Base do cálculo é uma convenção textual armazenada em condition_description
        // (ver sellOnConditionText em types/athlete-system.ts). Extraímos o rótulo
        // "sobre mais-valia" ou "sobre valor total" quando presente.
        const cond = (c.condition_description || '').toLowerCase()
        const basis = cond.includes('mais-valia') ? 'sobre a mais-valia'
          : cond.includes('valor total') ? 'sobre o valor total da revenda'
          : '—'
        return {
          id: c.id, athleteId: c.athlete_id, atleta: nameOf.get(c.athlete_id) ?? '—',
          dir, contraparte, clauseType: c.clause_type,
          percentage: c.percentage_value ?? null,
          fixedValue: c.original_value ?? null,
          currency: c.currency, basis,
          condition: c.condition_description ?? '',
          status: c.achievement_status,
          achievedDate: c.achievement_date,
        }
      })
    built.sort((a, b) => (a.dir === b.dir ? a.atleta.localeCompare(b.atleta) : a.dir === 'A_PAGAR' ? -1 : 1))
    setRows(built)
    setLoading(false)
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial no mount
  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => rows.filter(r => {
    if (dirFilter !== 'Todos' && r.dir !== dirFilter) return false
    if (statusFilter !== 'Todos' && r.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (![r.atleta, r.contraparte, r.condition].some(v => (v ?? '').toLowerCase().includes(q))) return false
    }
    return true
  }), [rows, search, dirFilter, statusFilter])

  const stats = useMemo(() => ({
    aPagar:   filtered.filter(r => r.dir === 'A_PAGAR').length,
    aReceber: filtered.filter(r => r.dir === 'A_RECEBER').length,
    atletas:  new Set(filtered.map(r => r.athleteId)).size,
    pctSum:   filtered.filter(r => r.dir === 'A_RECEBER').reduce((s, r) => s + (r.percentage ?? 0), 0),
  }), [filtered])

  function exportXlsx() {
    const cols: ColDef[] = [
      { key: 'atleta', header: 'Atleta' }, { key: 'dir', header: 'Direção' },
      { key: 'contraparte', header: 'Contraparte' }, { key: 'tipo', header: 'Tipo' },
      { key: 'percentage', header: '%' }, { key: 'fixedValue', header: 'Valor Fixo' },
      { key: 'currency', header: 'Moeda' }, { key: 'basis', header: 'Base de cálculo' },
      { key: 'condition', header: 'Condição' },
      { key: 'status', header: 'Status' }, { key: 'achievedDate', header: 'Atingido em' },
    ]
    exportWorkbook([{
      name: 'Sell-on', cols: trCols(cols),
      rows: filtered.map(r => ({
        ...r, dir: r.dir === 'A_PAGAR' ? tr('A pagar') : tr('A receber'),
        tipo: CLAUSE_TYPE_LABELS[r.clauseType],
        status: STATUS_STYLE[r.status].label,
        achievedDate: r.achievedDate ?? '',
      })) as unknown as Record<string, unknown>[],
    }], 'relatorio-sell-on.xlsx')
  }

  const th: React.CSSProperties = { padding: '8px 12px', fontSize: 10, fontWeight: 400, textTransform: 'uppercase', background: 'var(--tbl-head)', color: 'var(--text-muted)', borderBottom: '1px solid var(--divider-strong)', fontFamily: 'var(--font-label)', letterSpacing: 'var(--text-overline-tracking)', whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1, textAlign: 'left' }
  const td: React.CSSProperties = { padding: '8px 12px', fontSize: 12, color: 'var(--ink-primary)', fontFamily: 'var(--font-body)', borderBottom: '1px solid var(--divider-soft)', verticalAlign: 'middle' }
  const tdNum: React.CSSProperties = { ...td, fontFamily: 'var(--font-data)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
  return (
    <div style={{ padding: '24px 28px 32px', width: '100%', boxSizing: 'border-box' }}>
      <PageHero title={tr('Vendas Futuras (Sell-on)')} section={tr('Relatórios')} subtitle={tr('Consolidado de % de vendas futuras · a pagar e a receber')} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button onClick={exportXlsx} className="btn btn-outline"><Icon name="download" size={16} /> {tr('Exportar')}</button>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-label)', letterSpacing: 'var(--text-overline-tracking)', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>{tr('Busca')}</div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={tr('Atleta, contraparte, condição...')}
            style={{ width: '100%', padding: '4px 10px', borderRadius: 'var(--ui-control-radius)', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--cream-card)', fontSize: 'var(--ui-text-size)', fontFamily: 'var(--font-body)', color: 'var(--ink-primary)' }} />
        </div>
        <div>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-label)', letterSpacing: 'var(--text-overline-tracking)', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>{tr('Direção')}</div>
          <select value={dirFilter} onChange={e => setDirFilter(e.target.value as 'Todos' | Dir)}
            style={{ padding: '4px 10px', borderRadius: 'var(--ui-control-radius)', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--cream-card)', fontSize: 'var(--ui-text-size)', fontFamily: 'var(--font-body)', color: 'var(--ink-primary)' }}>
            <option value="Todos">{tr('Todos')}</option>
            <option value="A_PAGAR">{tr('A pagar')}</option>
            <option value="A_RECEBER">{tr('A receber')}</option>
          </select>
        </div>
        <div>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-label)', letterSpacing: 'var(--text-overline-tracking)', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>{tr('Status')}</div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
            style={{ padding: '4px 10px', borderRadius: 'var(--ui-control-radius)', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--cream-card)', fontSize: 'var(--ui-text-size)', fontFamily: 'var(--font-body)', color: 'var(--ink-primary)' }}>
            <option value="Todos">{tr('Todos')}</option>
            {(['PENDENTE', 'ATINGIDA', 'NAO_ATINGIDA', 'NAO_APLICAVEL'] as const).map(s => (
              <option key={s} value={s}>{tr(STATUS_STYLE[s].label)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 240px)', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>{tr('Atleta')}</th>
                <th style={th}>{tr('Direção')}</th>
                <th style={th}>{tr('Contraparte')}</th>
                <th style={{ ...th, textAlign: 'right' }}>%</th>
                <th style={{ ...th, textAlign: 'right' }}>{tr('Valor fixo')}</th>
                <th style={th}>{tr('Base de cálculo')}</th>
                <th style={th}>{tr('Condição')}</th>
                <th style={th}>{tr('Status')}</th>
                <th style={{ ...th, textAlign: 'right' }}>{tr('Ações')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: 'var(--text-secondary)', padding: 40 }}>{tr('Carregando…')}</td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: 'var(--text-secondary)', padding: 40 }}>{tr('Nenhum sell-on registrado.')}</td></tr>}
              {filtered.map(r => {
                const st = STATUS_STYLE[r.status]
                return (
                  <tr key={r.id}>
                    <td style={{ ...td, fontWeight: 500 }}><RefLink to={`/atletas/${r.athleteId}`} title={trf('Abrir {0}', r.atleta)}>{tr(r.atleta)}</RefLink></td>
                    <td style={{ ...td, fontSize: 10, fontFamily: 'var(--font-label)', color: r.dir === 'A_PAGAR' ? 'var(--neg)' : 'var(--pos)' }}>{r.dir === 'A_PAGAR' ? tr('a pagar') : tr('a receber')}</td>
                    <td style={{ ...td, color: 'var(--text-secondary)' }}>{tr(r.contraparte)}</td>
                    <td style={tdNum}>{r.percentage != null ? `${r.percentage}%` : '—'}</td>
                    <td style={tdNum}>{r.fixedValue != null ? fmtCurrencyShort(r.fixedValue, r.currency) : '—'}</td>
                    <td style={{ ...td, color: 'var(--text-secondary)', fontSize: 11 }}>{tr(r.basis)}</td>
                    <td style={{ ...td, color: 'var(--text-secondary)', fontSize: 11, maxWidth: 320, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={tr(r.condition)}>{tr(r.condition) || '—'}</td>
                    <td style={td}>
                      <span style={badgeStyle(st)}>{tr(st.label)}</span>
                      {r.achievedDate && <span style={{ marginLeft: 8, fontSize: 10, fontFamily: 'var(--font-data)', color: 'var(--text-secondary)' }}>{tr('em')} {fmtDate(r.achievedDate)}</span>}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <RowActions open={{ to: `/obrigacoes/${r.id}`, label: 'Abrir a cláusula' }} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-label)' }}>
        {trn(filtered.length, '{0} cláusula ·', '{0} cláusulas ·')} {trn(stats.atletas, '{0} atleta', '{0} atletas')}
      </div>
    </div>
  )
}

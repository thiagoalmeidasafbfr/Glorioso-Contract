// src/pages/PageConsolidado.tsx
// Consolidado GLOBAL — todas as movimentações financeiras de todos os atletas,
// parcela por parcela: salários (CLT), imagem, luvas, bônus, transferências,
// intermediação, solidariedade, cláusulas em geral e obrigações com clube/agente.
// Cada linha é um vencimento (parcela) ou um item de pagamento único.

import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  fetchAthletes, fetchAllClauses, fetchAllInstallments,
  fetchAllClubLiabilities, fetchAllIntermediaryLiabilities,
  fetchClubs, fetchIntermediaries,
  markInstallmentPaid, revertInstallment, registerInstallmentPayment,
} from '../lib/athleteQueries'
import { fmtCurrencyShort, fmtDate, isOverdue, todayISO } from '../lib/format'
import { CLAUSE_TYPE_LABELS } from '../types/athlete-system'
import type {
  Currency, Clause, ClauseInstallment, ClubLiability, IntermediaryLiability,
} from '../types/athlete-system'
import { buildNameIndex, norm } from '../lib/importHelpers'
import { exportWorkbook, type ColDef } from '../lib/xlsx-utils'
import { fetchPtaxRates, toBRL, ptaxRateFor } from '../lib/ptax'
import PageHero from '../components/PageHero'
import RefLink from '../components/RefLink'
import { Icon } from '../components/Icon'
import RowActions, { ActionLegend } from '../components/RowActions'
import PaymentModal from '../components/athletes/PaymentModal'
import {
  InstallmentEditModal, ClauseEditModal, ClauseFlowModal, LiabilityEditModal,
} from '../components/modals/EditModals'
import { promoteLiabilityToClause } from '../lib/liabilityFlow'
import { useAuth } from '../context/AuthContext'

const font = "var(--font-body)"
const mono = "var(--font-label)"

const OPEN = ['PENDENTE', 'PARCIALMENTE_PAGA', 'EM_ATRASO', 'VENCIDA']
const STATUS_OPTS = ['Todos', 'PENDENTE', 'PAGA', 'EM_ATRASO', 'CANCELADA']

interface Mov {
  id: string
  kind: 'inst' | 'clause' | 'club' | 'agent'
  clauseId: string | null
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
  // PTAX fixada na cláusula ou parcela (quando o contrato prevê); NULL usa PTAX do dia.
  fixedRate: number | null
}

const isBFR = (s: string | null | undefined) => !!s && (s.toLowerCase().includes('botafogo') || s.toLowerCase() === 'bfr')

export default function PageConsolidado() {
  const { profile } = useAuth()
  const canEdit = !profile || profile.role === 'master' || profile.role === 'juridico'
  const [movs, setMovs] = useState<Mov[]>([])
  // Registros brutos — necessários para abrir os modais de edição de qualquer linha.
  const [clauses, setClauses] = useState<Clause[]>([])
  const [insts, setInsts] = useState<ClauseInstallment[]>([])
  const [cLiabs, setCLiabs] = useState<ClubLiability[]>([])
  const [iLiabs, setILiabs] = useState<IntermediaryLiability[]>([])
  const [clubIdx, setClubIdx] = useState<Map<string, string>>(new Map())
  const [agentIdx, setAgentIdx] = useState<Map<string, string>>(new Map())
  const [editInstId, setEditInstId] = useState<string | null>(null)
  const [payInstId, setPayInstId] = useState<string | null>(null)
  const [editClauseId, setEditClauseId] = useState<string | null>(null)
  const [flowClauseId, setFlowClauseId] = useState<string | null>(null)
  const [editLiab, setEditLiab] = useState<{ kind: 'club' | 'agent'; id: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('Todos')
  const [atletaF, setAtletaF] = useState('Todos')
  const [naturezaF, setNaturezaF] = useState('Todos')
  const [posF, setPosF] = useState('Todos')
  const [posByAth, setPosByAth] = useState<Map<string, string>>(new Map())
  const [ptax, setPtax] = useState<Record<string, number>>({})

  useEffect(() => { fetchPtaxRates().then(setPtax).catch(() => setPtax({})) }, [])

  const load = useCallback(async () => {
    {
      setLoading(true)
      const [athletes, clauses, installments, clubLiabs, interLiabs, clubs, agents] = await Promise.all([
        fetchAthletes(), fetchAllClauses(), fetchAllInstallments(),
        fetchAllClubLiabilities(), fetchAllIntermediaryLiabilities(),
        fetchClubs(), fetchIntermediaries(),
      ])
      setClauses(clauses); setInsts(installments); setCLiabs(clubLiabs); setILiabs(interLiabs)
      setClubIdx(buildNameIndex(clubs)); setAgentIdx(buildNameIndex(agents))
      const nameOf = new Map(athletes.map(a => [a.id, a.full_name]))
      setPosByAth(new Map(athletes.map(a => [a.id, a.position ?? '—'])))
      const clauseById = new Map(clauses.map(c => [c.id, c]))
      const withInst = new Set(installments.map(i => i.clause_id))
      const list: Mov[] = []

      // Parcelas de cláusulas
      for (const it of installments) {
        const c = clauseById.get(it.clause_id)
        const dir: Mov['dir'] = c && isBFR(c.debtor_party) ? 'A_PAGAR' : c ? 'A_RECEBER' : 'A_PAGAR'
        list.push({
          id: it.id, kind: 'inst', clauseId: it.clause_id,
          date: it.due_date, athleteId: it.athlete_id, atleta: nameOf.get(it.athlete_id) ?? '—',
          natureza: c ? CLAUSE_TYPE_LABELS[c.clause_type] : 'Parcela',
          contraparte: c ? (dir === 'A_PAGAR' ? c.creditor_party : c.debtor_party) : '—',
          descricao: c ? `${c.description} — parc. ${it.installment_number}` : `Parcela ${it.installment_number}`,
          dir, valor: it.original_value, moeda: it.currency, status: it.payment_status,
          fixedRate: it.fixed_exchange_rate ?? c?.fixed_exchange_rate ?? null,
        })
      }
      // Cláusulas de pagamento único (sem parcelas geradas)
      for (const c of clauses) {
        if (withInst.has(c.id)) continue
        if (c.original_value == null) continue
        const dir: Mov['dir'] = isBFR(c.debtor_party) ? 'A_PAGAR' : 'A_RECEBER'
        list.push({
          id: c.id, kind: 'clause', clauseId: c.id,
          date: c.due_date, athleteId: c.athlete_id, atleta: nameOf.get(c.athlete_id) ?? '—',
          natureza: CLAUSE_TYPE_LABELS[c.clause_type], contraparte: dir === 'A_PAGAR' ? c.creditor_party : c.debtor_party,
          descricao: c.description, dir, valor: c.original_value, moeda: c.currency, status: c.payment_status,
          fixedRate: c.fixed_exchange_rate ?? null,
        })
      }
      // Obrigações com clube / agente
      for (const l of clubLiabs) list.push({
        id: l.id, kind: 'club', clauseId: null,
        date: l.due_date, athleteId: l.athlete_id, atleta: nameOf.get(l.athlete_id) ?? '—',
        natureza: 'Obrigação clube', contraparte: l.club_name, descricao: l.description ?? '',
        dir: l.direction, valor: l.amount, moeda: l.currency, status: l.status,
        fixedRate: null,
      })
      for (const l of interLiabs) list.push({
        id: l.id, kind: 'agent', clauseId: l.contract_id ? null : null,
        date: l.due_date, athleteId: l.athlete_id, atleta: nameOf.get(l.athlete_id) ?? '—',
        natureza: 'Intermediação', contraparte: l.intermediary_name, descricao: l.description ?? '',
        dir: l.direction, valor: l.amount, moeda: l.currency, status: l.status,
        fixedRate: null,
      })

      list.sort((a, b) => (a.date ?? '9999-99-99').localeCompare(b.date ?? '9999-99-99'))
      setMovs(list)
      setLoading(false)
    }
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial no mount
  useEffect(() => { load() }, [load])

  const entityLink = (parte: string): string | null => {
    const k = norm(parte)
    const club = clubIdx.get(k)
    if (club) return `/clubes/${club}`
    const agent = agentIdx.get(k)
    if (agent) return `/intermediarios/${agent}`
    return null
  }
  async function quickPay(id: string) { await markInstallmentPaid(id, todayISO()); await load() }
  async function quickRevert(id: string) { await revertInstallment(id); await load() }
  async function registerPayment(id: string, pmt: { date: string; valueCurrency: number; valueBRL: number; rate: number; notes: string }) {
    await registerInstallmentPayment(id, {
      payment_date: pmt.date, amount_paid_currency: pmt.valueCurrency,
      amount_paid_brl: pmt.valueBRL, exchange_rate: pmt.rate, notes: pmt.notes,
    })
    setPayInstId(null); await load()
  }
  async function generateFlowFor(kind: 'club' | 'agent', id: string) {
    const liab = kind === 'club' ? cLiabs.find(l => l.id === id) : iLiabs.find(l => l.id === id)
    if (!liab) return
    const clause = await promoteLiabilityToClause(kind, liab)
    await load()
    setFlowClauseId(clause.id)
  }

  const atletas = useMemo(() => ['Todos', ...Array.from(new Set(movs.map(m => m.atleta))).sort()], [movs])
  const naturezas = useMemo(() => ['Todos', ...Array.from(new Set(movs.map(m => m.natureza))).sort()], [movs])
  const posicoes = useMemo(() => ['Todos', ...Array.from(new Set(movs.map(m => posByAth.get(m.athleteId) ?? '—'))).sort()], [movs, posByAth])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return movs.filter(m => {
      if (status !== 'Todos' && m.status !== status) return false
      if (atletaF !== 'Todos' && m.atleta !== atletaF) return false
      if (naturezaF !== 'Todos' && m.natureza !== naturezaF) return false
      if (posF !== 'Todos' && (posByAth.get(m.athleteId) ?? '—') !== posF) return false
      if (!needle) return true
      return [m.atleta, m.natureza, m.contraparte, m.descricao].some(v => v.toLowerCase().includes(needle))
    })
  }, [movs, q, status, atletaF, naturezaF, posF, posByAth])

  // Rate efetivo: PTAX fixada no contrato, quando houver; senão, PTAX do dia.
  function effectiveBRL(m: Mov): number {
    if (m.moeda === 'BRL') return m.valor
    if (m.fixedRate != null && m.fixedRate > 0) return m.valor * m.fixedRate
    return toBRL(m.valor, m.moeda, ptax)
  }
  function effectiveRate(m: Mov): number {
    if (m.moeda === 'BRL') return 1
    if (m.fixedRate != null && m.fixedRate > 0) return m.fixedRate
    return ptaxRateFor(m.moeda, ptax)
  }

  // Totais por direção (em aberto), convertidos para BRL via PTAX efetiva.
  const totals = useMemo(() => {
    let pay = 0, rec = 0
    for (const m of filtered) if (OPEN.includes(m.status)) {
      const brl = effectiveBRL(m)
      if (m.dir === 'A_PAGAR') pay += brl; else rec += brl
    }
    return { pay, rec }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, ptax])

  function exportAll() {
    const cols: ColDef[] = [
      { key: 'atleta', header: 'Atleta' }, { key: 'natureza', header: 'Natureza' },
      { key: 'contraparte', header: 'Contraparte' }, { key: 'descricao', header: 'Descrição' },
      { key: 'dir', header: 'Direção' }, { key: 'valor', header: 'Valor' }, { key: 'moeda', header: 'Moeda' },
      { key: 'valorBRL', header: 'Valor (BRL PTAX)' }, { key: 'ptaxRate', header: 'PTAX' },
      { key: 'vencimento', header: 'Vencimento' }, { key: 'status', header: 'Status' },
    ]
    const rows = filtered.map(m => ({
      ...m,
      dir: m.dir === 'A_PAGAR' ? 'A pagar' : 'A receber',
      valorBRL: effectiveBRL(m),
      ptaxRate: effectiveRate(m),
      vencimento: m.date ?? '',
    }))
    exportWorkbook([{ name: 'Consolidado', cols, rows }], 'consolidado-movimentacoes.xlsx')
  }

  const th: React.CSSProperties = { padding: '9px 12px', fontSize: 9, fontWeight: 500, textTransform: 'uppercase', background: 'var(--tbl-head)', color: 'var(--ink-secondary)', borderBottom: '1px solid var(--divider-strong)', fontFamily: mono, letterSpacing: '0.14em', whiteSpace: 'nowrap', textAlign: 'left' }
  const td: React.CSSProperties = { padding: '9px 12px', fontSize: 12, color: 'var(--ink-primary)', fontFamily: font, borderBottom: '1px solid var(--divider-soft)', verticalAlign: 'middle' }

  return (
    <div style={{ padding: '24px 28px 32px', width: '100%', boxSizing: 'border-box' }}>
      <PageHero title="Consolidado" subtitle="Todas as movimentações financeiras · Botafogo SAF">
        <button onClick={exportAll} className="btn btn-outline"><Icon name="download" size={13} /> Exportar</button>
      </PageHero>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <label style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Busca</label>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Atleta, natureza, contraparte, descrição..." style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--divider-strong)', fontFamily: font, fontSize: 13, background: 'var(--surface, #fff)', color: 'var(--ink-primary)', boxSizing: 'border-box' }} />
        </div>
        <div>
          <label style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Atleta</label>
          <select value={atletaF} onChange={e => setAtletaF(e.target.value)} style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid var(--divider-strong)', fontFamily: font, fontSize: 13, background: 'var(--surface, #fff)', color: 'var(--ink-primary)', maxWidth: 180 }}>
            {atletas.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Posição</label>
          <select value={posF} onChange={e => setPosF(e.target.value)} style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid var(--divider-strong)', fontFamily: font, fontSize: 13, background: 'var(--surface, #fff)', color: 'var(--ink-primary)' }}>
            {posicoes.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Natureza</label>
          <select value={naturezaF} onChange={e => setNaturezaF(e.target.value)} style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid var(--divider-strong)', fontFamily: font, fontSize: 13, background: 'var(--surface, #fff)', color: 'var(--ink-primary)', maxWidth: 180 }}>
            {naturezas.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Status</label>
          <select value={status} onChange={e => setStatus(e.target.value)} style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid var(--divider-strong)', fontFamily: font, fontSize: 13, background: 'var(--surface, #fff)', color: 'var(--ink-primary)' }}>
            {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--neg-tint)', border: '1px solid rgba(122,63,44,0.25)' }}>
          <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--neg)' }}>A pagar (BRL PTAX)</div>
          <div style={{ fontFamily: mono, fontSize: 16, fontWeight: 700, color: 'var(--neg)' }}>{fmtCurrencyShort(totals.pay, 'BRL')}</div>
        </div>
        <div style={{ padding: '8px 14px', borderRadius: 8, background: '#e6ece2', border: '1px solid rgba(58,111,58,0.25)' }}>
          <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#3a6f3a' }}>A receber (BRL PTAX)</div>
          <div style={{ fontFamily: mono, fontSize: 16, fontWeight: 700, color: '#3a6f3a' }}>{fmtCurrencyShort(totals.rec, 'BRL')}</div>
        </div>
      </div>

      <div style={{ marginBottom: 8 }}>
        <ActionLegend items={['open', 'edit', 'schedule', 'generate', 'markPaid', 'pay', 'revert']} />
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
              <th style={{ ...th, textAlign: 'right', minWidth: 120 }} title="Convertido pela PTAX atual do Banco Central">Valor (BRL PTAX)</th>
              <th style={{ ...th, minWidth: 90 }}>Status</th>
              <th style={{ ...th, minWidth: 110, textAlign: 'right' }}>Ações</th>
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Carregando...</td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Nenhuma movimentação.</td></tr>}
              {filtered.map(m => {
                const late = isOverdue(m.date, m.status)
                return (
                  <tr key={m.id} style={{ background: late ? 'var(--row-late-bg)' : 'transparent' }}>
                    <td style={{ ...td, fontFamily: mono, fontSize: 11, color: late ? 'var(--neg)' : 'var(--ink-secondary)', fontWeight: late ? 700 : 400 }}>{m.date ? fmtDate(m.date) : '—'}</td>
                    <td style={{ ...td, fontWeight: 600 }}><RefLink to={`/atletas/${m.athleteId}`} title="Abrir atleta">{m.atleta}</RefLink></td>
                    <td style={{ ...td, fontSize: 12 }}>
                      {m.clauseId ? <RefLink to={`/obrigacoes/${m.clauseId}`} title="Abrir a obrigação">{m.natureza}</RefLink> : m.natureza}
                    </td>
                    <td style={{ ...td, fontSize: 12, color: 'var(--text-secondary)' }}>
                      {(() => { const to = entityLink(m.contraparte); return to ? <RefLink to={to} title="Abrir cadastro da contraparte">{m.contraparte}</RefLink> : m.contraparte })()}
                    </td>
                    <td style={{ ...td, textAlign: 'center', fontSize: 10, fontFamily: mono, color: m.dir === 'A_PAGAR' ? 'var(--neg)' : '#3a6f3a' }}>{m.dir === 'A_PAGAR' ? 'a pagar' : 'a receber'}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: mono, fontWeight: 600 }}>{fmtCurrencyShort(m.valor, m.moeda)}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: mono, color: 'var(--ink-secondary)' }}
                      title={m.moeda === 'BRL' ? 'BRL'
                        : m.fixedRate != null
                          ? `PTAX FIXADA ${m.moeda}/BRL: ${m.fixedRate.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}`
                          : `PTAX ${m.moeda}/BRL: ${ptaxRateFor(m.moeda, ptax).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}`}>
                      {fmtCurrencyShort(effectiveBRL(m), 'BRL')}
                      {m.fixedRate != null && <span style={{ marginLeft: 4, fontSize: 9, color: 'var(--warn)', fontWeight: 600 }}>fx</span>}
                    </td>
                    <td style={td}>
                      <span style={{
                        display: 'inline-block', padding: '2px 9px', borderRadius: 5, fontSize: 9, fontWeight: 600,
                        fontFamily: mono, letterSpacing: '0.08em', textTransform: 'uppercase',
                        background: m.status === 'PAGA' ? 'var(--pos-tint)' : m.status === 'EM_ATRASO' ? 'var(--neg-tint)' : 'var(--cream-inset)',
                        color: m.status === 'PAGA' ? 'var(--pos)' : m.status === 'EM_ATRASO' ? 'var(--neg)' : 'var(--ink-secondary)',
                      }}>{m.status.replace(/_/g, ' ')}</span>
                    </td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <RowActions
                        open={{ to: m.clauseId ? `/obrigacoes/${m.clauseId}` : null, reason: 'passivo importado — gere as parcelas para criar a obrigação' }}
                        edit={{
                          onClick: !canEdit ? undefined
                            : m.kind === 'inst' ? () => setEditInstId(m.id)
                            : m.kind === 'clause' ? () => setEditClauseId(m.id)
                            : () => setEditLiab({ kind: m.kind as 'club' | 'agent', id: m.id }),
                          reason: 'sem permissão de edição',
                        }}
                        schedule={m.clauseId ? { onClick: canEdit ? () => setFlowClauseId(m.clauseId!) : undefined, reason: 'sem permissão de edição' } : undefined}
                        generate={!m.clauseId ? { onClick: canEdit ? () => generateFlowFor(m.kind as 'club' | 'agent', m.id) : undefined, reason: 'sem permissão de edição' } : undefined}
                        markPaid={{
                          onClick: canEdit && m.kind === 'inst' && m.status !== 'PAGA' && m.status !== 'CANCELADA' ? () => quickPay(m.id) : undefined,
                          reason: m.kind !== 'inst' ? 'gere as parcelas para dar baixa' : m.status === 'PAGA' ? 'parcela já paga' : 'parcela cancelada',
                        }}
                        pay={{
                          onClick: canEdit && m.kind === 'inst' && m.status !== 'PAGA' && m.status !== 'CANCELADA' ? () => setPayInstId(m.id) : undefined,
                          reason: m.kind !== 'inst' ? 'gere as parcelas para registrar o pagamento' : m.status === 'PAGA' ? 'parcela já paga' : 'parcela cancelada',
                        }}
                        revert={{
                          onClick: canEdit && m.kind === 'inst' && m.status === 'PAGA' ? () => quickRevert(m.id) : undefined,
                          reason: 'a parcela não está paga',
                        }}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ marginTop: 10, fontFamily: mono, fontSize: 11, color: 'var(--text-muted)' }}>{filtered.length} movimentação(ões)</div>

      {payInstId && (() => {
        const inst = insts.find(i => i.id === payInstId)
        return inst ? (
          <PaymentModal label={`Parcela ${inst.installment_number}`} currency={inst.currency} value={inst.original_value}
            onClose={() => setPayInstId(null)} onSave={pmt => registerPayment(inst.id, pmt)} />
        ) : null
      })()}
      {editInstId && (() => {
        const inst = insts.find(i => i.id === editInstId)
        return inst ? <InstallmentEditModal inst={inst} onClose={() => setEditInstId(null)} onSaved={() => { setEditInstId(null); load() }} /> : null
      })()}
      {editClauseId && (() => {
        const cl = clauses.find(c => c.id === editClauseId)
        return cl ? <ClauseEditModal clause={cl} onClose={() => setEditClauseId(null)} onSaved={() => { setEditClauseId(null); load() }} /> : null
      })()}
      {flowClauseId && (() => {
        const cl = clauses.find(c => c.id === flowClauseId)
        return cl ? <ClauseFlowModal clause={cl} onClose={() => setFlowClauseId(null)} onSaved={() => { setFlowClauseId(null); load() }} /> : null
      })()}
      {editLiab && (() => {
        const liab = editLiab.kind === 'club' ? cLiabs.find(l => l.id === editLiab.id) : iLiabs.find(l => l.id === editLiab.id)
        return liab ? (
          <LiabilityEditModal kind={editLiab.kind} liab={liab}
            onClose={() => setEditLiab(null)}
            onSaved={() => { setEditLiab(null); load() }}
            onPromoted={async clauseId => { setEditLiab(null); await load(); setFlowClauseId(clauseId) }} />
        ) : null
      })()}
    </div>
  )
}

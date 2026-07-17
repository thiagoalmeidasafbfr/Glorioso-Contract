// src/pages/PageDashboards.tsx
// Painel de controle financeiro (todos os atletas). Gráficos:
//  • Fluxo mensal de salários + imagem
//  • Fluxo mensal de clubes: a pagar vs a receber
//  • Fluxo mensal de pagamentos a agentes
//  • Principais clubes/agentes em atraso (overdue) e já pagos
// Com big numbers e destaques. Valores agregados aproximados em BRL.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import {
  fetchAllClauses, fetchAllInstallments,
  fetchAllClubLiabilities, fetchAllIntermediaryLiabilities,
} from '../lib/athleteQueries'
import { fmtCurrencyShort, isOverdue } from '../lib/format'
import type { Currency } from '../types/athlete-system'

const font = "'Inter', system-ui, sans-serif"
const mono = "'IBM Plex Mono', monospace"
const GOLD = '#be8c4a', POS = '#166534', NEG = '#dc2626', BLUE = '#1d4ed8'

const APPROX_BRL: Record<string, number> = { BRL: 1, EUR: 6.10, USD: 5.55, GBP: 7.10 }
const brlOf = (v: number, c: Currency) => v * (APPROX_BRL[c] ?? 1)
const OPEN = ['PENDENTE', 'PARCIALMENTE_PAGA', 'EM_ATRASO', 'VENCIDA']
const CLUB_TYPES = ['TRANSFER_FEE_FIXO', 'TRANSFER_FEE_VARIAVEL', 'SELL_ON_FEE', 'SELL_ON_FEE_RECEBER', 'SOLIDARIEDADE_FIFA', 'EMPRESTIMO_TAXA', 'CLAUSULA_RESCISORIA', 'PERCENTUAL_VENDA_ATLETA']
const AGENT_TYPES = ['INTERMEDIACAO', 'INTERMEDIACAO_VENDA_FUTURA']
const isBFR = (s: string) => s.toLowerCase().includes('botafogo') || s.toLowerCase() === 'bfr'
const monthLabel = (ym: string) => { const [y, m] = ym.split('-'); return `${m}/${y.slice(2)}` }

type Group = 'salario' | 'imagem' | 'clube' | 'agente' | 'outro'
interface Item { ym: string; group: Group; dir: 'A_PAGAR' | 'A_RECEBER'; brl: number; status: string; parte: string; late: boolean }

function groupOf(t: string): Group {
  if (t === 'SALARIO_CETD') return 'salario'
  if (t === 'DIREITO_IMAGEM') return 'imagem'
  if (CLUB_TYPES.includes(t)) return 'clube'
  if (AGENT_TYPES.includes(t)) return 'agente'
  return 'outro'
}

export default function PageDashboards() {
  const navigate = useNavigate()
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      setLoading(true)
      const [clauses, installments, clubLiabs, interLiabs] = await Promise.all([
        fetchAllClauses(), fetchAllInstallments(), fetchAllClubLiabilities(), fetchAllIntermediaryLiabilities(),
      ])
      const clauseById = new Map(clauses.map(c => [c.id, c]))
      const withInst = new Set(installments.map(i => i.clause_id))
      const list: Item[] = []

      for (const it of installments) {
        const c = clauseById.get(it.clause_id); if (!c) continue
        const pagar = isBFR(c.debtor_party)
        list.push({
          ym: (it.due_date ?? '').slice(0, 7), group: groupOf(c.clause_type),
          dir: pagar ? 'A_PAGAR' : 'A_RECEBER', brl: brlOf(it.original_value, it.currency),
          status: it.payment_status, parte: pagar ? c.creditor_party : c.debtor_party,
          late: isOverdue(it.due_date, it.payment_status),
        })
      }
      for (const c of clauses) {
        if (withInst.has(c.id) || c.original_value == null) continue
        const pagar = isBFR(c.debtor_party)
        list.push({
          ym: (c.due_date ?? '').slice(0, 7), group: groupOf(c.clause_type),
          dir: pagar ? 'A_PAGAR' : 'A_RECEBER', brl: brlOf(c.original_value, c.currency),
          status: c.payment_status, parte: pagar ? c.creditor_party : c.debtor_party,
          late: isOverdue(c.due_date, c.payment_status),
        })
      }
      for (const l of clubLiabs) list.push({ ym: (l.due_date ?? '').slice(0, 7), group: 'clube', dir: l.direction, brl: brlOf(l.amount, l.currency), status: l.status, parte: l.club_name, late: isOverdue(l.due_date, l.status) })
      for (const l of interLiabs) list.push({ ym: (l.due_date ?? '').slice(0, 7), group: 'agente', dir: l.direction, brl: brlOf(l.amount, l.currency), status: l.status, parte: l.intermediary_name, late: isOverdue(l.due_date, l.status) })

      setItems(list)
      setLoading(false)
    })()
  }, [])

  const big = useMemo(() => {
    let aPagar = 0, aReceber = 0, overdue = 0, pago = 0
    for (const i of items) {
      if (OPEN.includes(i.status)) { if (i.dir === 'A_PAGAR') aPagar += i.brl; else aReceber += i.brl }
      if (i.late) overdue += i.brl
      if (i.status === 'PAGA') pago += i.brl
    }
    return [
      { label: 'A pagar (aberto)', value: aPagar, color: NEG },
      { label: 'A receber (aberto)', value: aReceber, color: POS },
      { label: 'Em atraso', value: overdue, color: NEG },
      { label: 'Já pago', value: pago, color: GOLD },
    ]
  }, [items])

  const salImgSeries = useMemo(() => {
    const m = new Map<string, { salario: number; imagem: number }>()
    for (const i of items) {
      if ((i.group !== 'salario' && i.group !== 'imagem') || !i.ym) continue
      if (!m.has(i.ym)) m.set(i.ym, { salario: 0, imagem: 0 })
      m.get(i.ym)![i.group] += i.brl
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([ym, v]) => ({ mes: monthLabel(ym), ...v }))
  }, [items])

  const clubeSeries = useMemo(() => monthlyByDir(items, 'clube'), [items])
  const agenteSeries = useMemo(() => monthlyByDir(items, 'agente'), [items])
  const overdueRank = useMemo(() => rankByParte(items.filter(i => i.late && (i.group === 'clube' || i.group === 'agente'))), [items])
  const paidRank = useMemo(() => rankByParte(items.filter(i => i.status === 'PAGA' && (i.group === 'clube' || i.group === 'agente'))), [items])

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1320, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--gold-deep)', marginBottom: 6 }}>Controle financeiro</div>
        <h1 style={{ fontFamily: font, fontSize: 24, fontWeight: 700, color: 'var(--ink-primary)', margin: 0 }}>Dashboards</h1>
        <div style={{ height: 2, width: 38, background: 'var(--gold)', borderRadius: 2, marginTop: 8 }} />
      </div>

      {loading ? <div style={{ fontFamily: mono, fontSize: 12, color: 'var(--text-muted)' }}>Carregando...</div> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
            {big.map(b => (
              <div key={b.label} className="card" style={{ padding: '14px 18px' }}>
                <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>{b.label} <span style={{ opacity: 0.6 }}>(aprox. BRL)</span></div>
                <div style={{ fontFamily: mono, fontSize: 22, fontWeight: 700, color: b.color }}>{fmtCurrencyShort(b.value, 'BRL')}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: 16 }}>
            <ChartCard title="Fluxo mensal — Salário + Imagem">
              {salImgSeries.length === 0 ? <Empty /> : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={salImgSeries} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                    <XAxis dataKey="mes" tick={{ fontSize: 10, fontFamily: mono }} />
                    <YAxis tickFormatter={(v) => fmtCurrencyShort(v, 'BRL')} tick={{ fontSize: 10, fontFamily: mono }} width={64} />
                    <Tooltip formatter={(v: unknown) => fmtCurrencyShort(Number(v), 'BRL')} />
                    <Legend wrapperStyle={{ fontSize: 11, fontFamily: font }} />
                    <Bar dataKey="salario" name="Salário CLT" stackId="a" fill={GOLD} />
                    <Bar dataKey="imagem" name="Imagem (PJ)" stackId="a" fill={BLUE} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Fluxo mensal — Clubes: a pagar vs a receber">
              {clubeSeries.length === 0 ? <Empty /> : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={clubeSeries} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                    <XAxis dataKey="mes" tick={{ fontSize: 10, fontFamily: mono }} />
                    <YAxis tickFormatter={(v) => fmtCurrencyShort(v, 'BRL')} tick={{ fontSize: 10, fontFamily: mono }} width={64} />
                    <Tooltip formatter={(v: unknown) => fmtCurrencyShort(Number(v), 'BRL')} />
                    <Legend wrapperStyle={{ fontSize: 11, fontFamily: font }} />
                    <Bar dataKey="pagar" name="A pagar" fill={NEG} />
                    <Bar dataKey="receber" name="A receber" fill={POS} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Fluxo mensal — Pagamentos a agentes">
              {agenteSeries.length === 0 ? <Empty /> : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={agenteSeries} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                    <XAxis dataKey="mes" tick={{ fontSize: 10, fontFamily: mono }} />
                    <YAxis tickFormatter={(v) => fmtCurrencyShort(v, 'BRL')} tick={{ fontSize: 10, fontFamily: mono }} width={64} />
                    <Tooltip formatter={(v: unknown) => fmtCurrencyShort(Number(v), 'BRL')} />
                    <Bar dataKey="pagar" name="A pagar" fill={GOLD} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Top clubes/agentes em atraso (overdue)">
              {overdueRank.length === 0 ? <Empty /> : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart layout="vertical" data={overdueRank} margin={{ top: 8, right: 12, bottom: 0, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                    <XAxis type="number" tickFormatter={(v) => fmtCurrencyShort(v, 'BRL')} tick={{ fontSize: 10, fontFamily: mono }} />
                    <YAxis type="category" dataKey="parte" width={120} tick={{ fontSize: 10, fontFamily: font }} />
                    <Tooltip formatter={(v: unknown) => fmtCurrencyShort(Number(v), 'BRL')} />
                    <Bar dataKey="valor" name="Em atraso" fill={NEG} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Top clubes/agentes já pagos">
              {paidRank.length === 0 ? <Empty /> : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart layout="vertical" data={paidRank} margin={{ top: 8, right: 12, bottom: 0, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                    <XAxis type="number" tickFormatter={(v) => fmtCurrencyShort(v, 'BRL')} tick={{ fontSize: 10, fontFamily: mono }} />
                    <YAxis type="category" dataKey="parte" width={120} tick={{ fontSize: 10, fontFamily: font }} />
                    <Tooltip formatter={(v: unknown) => fmtCurrencyShort(Number(v), 'BRL')} />
                    <Bar dataKey="valor" name="Pago" fill={POS} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Atalhos">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 4 }}>
                {[
                  { l: 'Consolidado (todas as movimentações)', to: '/relatorios/consolidado' },
                  { l: 'Relatório de Salários', to: '/relatorios/salarios' },
                  { l: 'Relatório de Imagem', to: '/relatorios/imagem' },
                  { l: 'Relatório de Clubes', to: '/relatorios/clubes' },
                  { l: 'Relatório de Agentes', to: '/relatorios/intermediarios' },
                ].map(x => (
                  <button key={x.to} onClick={() => navigate(x.to)} style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--divider-strong)', background: 'transparent', color: '#be8c4a', fontFamily: font, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{x.l} →</button>
                ))}
              </div>
            </ChartCard>
          </div>
        </>
      )}
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: '16px 18px' }}>
      <div style={{ fontFamily: mono, fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gold-deep, #8a6a34)', marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  )
}
function Empty() {
  return <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: mono, fontSize: 12, color: 'var(--text-muted)' }}>Sem dados.</div>
}

function monthlyByDir(items: Item[], group: Group) {
  const m = new Map<string, { pagar: number; receber: number }>()
  for (const i of items) {
    if (i.group !== group || !i.ym) continue
    if (!m.has(i.ym)) m.set(i.ym, { pagar: 0, receber: 0 })
    const b = m.get(i.ym)!
    if (i.dir === 'A_PAGAR') b.pagar += i.brl; else b.receber += i.brl
  }
  return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([ym, v]) => ({ mes: monthLabel(ym), ...v }))
}
function rankByParte(items: Item[]) {
  const m = new Map<string, number>()
  for (const i of items) m.set(i.parte, (m.get(i.parte) ?? 0) + i.brl)
  return Array.from(m.entries()).map(([parte, valor]) => ({ parte, valor })).sort((a, b) => b.valor - a.valor).slice(0, 8)
}

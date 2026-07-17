// src/pages/PageDashboards.tsx
// Painel de controle financeiro (todos os atletas), nível executivo.
//  • Fluxo consolidado de Salário + Imagem ao longo dos meses (área + linha) —
//    mostra o comportamento do custo mensal e a queda quando contratos encerram.
//  • Clubes: a pagar vs a receber por mês.
//  • Pagamentos a agentes por mês.
//  • Rankings: clubes/agentes em atraso e já pagos.
// Valores agregados aproximados em BRL (câmbio de referência).

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ComposedChart, Area, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, LabelList,
} from 'recharts'
import {
  fetchAllClauses, fetchAllInstallments,
  fetchAllClubLiabilities, fetchAllIntermediaryLiabilities,
} from '../lib/athleteQueries'
import { fmtCurrencyShort, isOverdue, todayISO } from '../lib/format'
import type { Currency } from '../types/athlete-system'

const font = "'Inter', system-ui, sans-serif"
const mono = "'IBM Plex Mono', monospace"

// Paleta (validada — CVD/visão normal ok; ouro usa rótulos/legenda p/ contraste).
const C = {
  salarioFill: '#be8c4a', salarioLine: '#9a6f2e',
  imagemFill: '#1d4ed8', imagemLine: '#1d4ed8',
  total: '#3a2e1c',
  pagar: '#dc2626', receber: '#166534', agente: '#a9752f',
  gridStroke: 'rgba(26,20,16,0.06)', axis: 'rgba(26,20,16,0.45)',
}

const APPROX_BRL: Record<string, number> = { BRL: 1, EUR: 6.10, USD: 5.55, GBP: 7.10 }
const brlOf = (v: number, c: Currency) => v * (APPROX_BRL[c] ?? 1)
const OPEN = ['PENDENTE', 'PARCIALMENTE_PAGA', 'EM_ATRASO', 'VENCIDA']
const CLUB_TYPES = ['TRANSFER_FEE_FIXO', 'TRANSFER_FEE_VARIAVEL', 'SELL_ON_FEE', 'SELL_ON_FEE_RECEBER', 'SOLIDARIEDADE_FIFA', 'EMPRESTIMO_TAXA', 'CLAUSULA_RESCISORIA', 'PERCENTUAL_VENDA_ATLETA']
const AGENT_TYPES = ['INTERMEDIACAO', 'INTERMEDIACAO_VENDA_FUTURA']
const isBFR = (s: string) => s.toLowerCase().includes('botafogo') || s.toLowerCase() === 'bfr'
const MES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const monthLabel = (ym: string) => { const [y, m] = ym.split('-'); return `${MES_ABREV[(+m) - 1] ?? m}/${y.slice(2)}` }

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
        list.push({ ym: (it.due_date ?? '').slice(0, 7), group: groupOf(c.clause_type), dir: pagar ? 'A_PAGAR' : 'A_RECEBER', brl: brlOf(it.original_value, it.currency), status: it.payment_status, parte: pagar ? c.creditor_party : c.debtor_party, late: isOverdue(it.due_date, it.payment_status) })
      }
      for (const c of clauses) {
        if (withInst.has(c.id) || c.original_value == null) continue
        const pagar = isBFR(c.debtor_party)
        list.push({ ym: (c.due_date ?? '').slice(0, 7), group: groupOf(c.clause_type), dir: pagar ? 'A_PAGAR' : 'A_RECEBER', brl: brlOf(c.original_value, c.currency), status: c.payment_status, parte: pagar ? c.creditor_party : c.debtor_party, late: isOverdue(c.due_date, c.payment_status) })
      }
      for (const l of clubLiabs) list.push({ ym: (l.due_date ?? '').slice(0, 7), group: 'clube', dir: l.direction, brl: brlOf(l.amount, l.currency), status: l.status, parte: l.club_name, late: isOverdue(l.due_date, l.status) })
      for (const l of interLiabs) list.push({ ym: (l.due_date ?? '').slice(0, 7), group: 'agente', dir: l.direction, brl: brlOf(l.amount, l.currency), status: l.status, parte: l.intermediary_name, late: isOverdue(l.due_date, l.status) })
      setItems(list)
      setLoading(false)
    })()
  }, [])

  const big = useMemo(() => {
    let aPagar = 0, aReceber = 0, overdue = 0, pago = 0
    const nowYM = todayISO().slice(0, 7)
    let mesAtual = 0
    for (const i of items) {
      if (OPEN.includes(i.status)) { if (i.dir === 'A_PAGAR') aPagar += i.brl; else aReceber += i.brl }
      if (i.late) overdue += i.brl
      if (i.status === 'PAGA') pago += i.brl
      if (i.ym === nowYM && (i.group === 'salario' || i.group === 'imagem')) mesAtual += i.brl
    }
    return { aPagar, aReceber, overdue, pago, mesAtual }
  }, [items])

  const salImg = useMemo(() => {
    const m = new Map<string, { salario: number; imagem: number }>()
    for (const i of items) {
      if ((i.group !== 'salario' && i.group !== 'imagem') || !i.ym) continue
      if (!m.has(i.ym)) m.set(i.ym, { salario: 0, imagem: 0 })
      m.get(i.ym)![i.group] += i.brl
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([ym, v]) => ({ mes: monthLabel(ym), salario: v.salario, imagem: v.imagem, total: v.salario + v.imagem }))
  }, [items])

  const clube = useMemo(() => monthlyByDir(items, 'clube'), [items])
  const agente = useMemo(() => monthlyByDir(items, 'agente'), [items])
  const overdueRank = useMemo(() => rankByParte(items.filter(i => i.late && (i.group === 'clube' || i.group === 'agente'))), [items])
  const paidRank = useMemo(() => rankByParte(items.filter(i => i.status === 'PAGA' && (i.group === 'clube' || i.group === 'agente'))), [items])

  const tiles = [
    { label: 'A pagar (aberto)', value: big.aPagar, accent: C.pagar },
    { label: 'A receber (aberto)', value: big.aReceber, accent: C.receber },
    { label: 'Em atraso', value: big.overdue, accent: C.pagar },
    { label: 'Salário + imagem (mês atual)', value: big.mesAtual, accent: C.salarioFill },
    { label: 'Já pago (acumulado)', value: big.pago, accent: C.total },
  ]

  return (
    <div style={{ padding: '26px 30px', maxWidth: 1360, margin: '0 auto' }}>
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.24em', textTransform: 'uppercase', color: 'var(--gold-deep)', marginBottom: 6 }}>Controle financeiro · Botafogo SAF</div>
        <h1 style={{ fontFamily: font, fontSize: 26, fontWeight: 700, color: 'var(--ink-primary)', margin: 0, letterSpacing: '-0.01em' }}>Painel executivo</h1>
        <div style={{ height: 3, width: 44, background: 'var(--gold)', borderRadius: 2, marginTop: 8 }} />
      </div>

      {loading ? <div style={{ fontFamily: mono, fontSize: 12, color: 'var(--text-muted)' }}>Carregando...</div> : (
        <>
          {/* Stat tiles */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 22 }}>
            {tiles.map(t => (
              <div key={t.label} style={{ position: 'relative', background: 'var(--surface, #fff)', border: '1px solid var(--divider, rgba(190,140,74,0.16))', borderRadius: 14, padding: '16px 18px 16px 20px', overflow: 'hidden' }}>
                <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: t.accent }} />
                <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>{t.label}</div>
                <div style={{ fontFamily: mono, fontSize: 23, fontWeight: 700, color: 'var(--ink-primary)', letterSpacing: '-0.02em' }}>{fmtCurrencyShort(t.value, 'BRL')}</div>
                <div style={{ fontFamily: mono, fontSize: 8.5, color: 'var(--text-muted)', marginTop: 4, letterSpacing: '0.08em' }}>APROX. BRL</div>
              </div>
            ))}
          </div>

          {/* Fluxo consolidado — destaque, largura total */}
          <Panel title="Fluxo consolidado — Salário CLT + Imagem" subtitle="Custo mensal ao longo da vigência dos contratos (aprox. BRL)" tall>
            {salImg.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={salImg} margin={{ top: 14, right: 18, bottom: 4, left: 6 }}>
                  <defs>
                    <linearGradient id="gSal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.salarioFill} stopOpacity={0.45} />
                      <stop offset="100%" stopColor={C.salarioFill} stopOpacity={0.03} />
                    </linearGradient>
                    <linearGradient id="gImg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.imagemFill} stopOpacity={0.38} />
                      <stop offset="100%" stopColor={C.imagemFill} stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke={C.gridStroke} />
                  <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fontSize: 10, fontFamily: mono, fill: C.axis }} minTickGap={16} />
                  <YAxis tickLine={false} axisLine={false} width={62} tick={{ fontSize: 10, fontFamily: mono, fill: C.axis }} tickFormatter={(v) => fmtCurrencyShort(v, 'BRL')} />
                  <Tooltip content={<MoneyTip withTotal />} cursor={{ stroke: C.salarioLine, strokeDasharray: '3 3', strokeOpacity: 0.5 }} />
                  <Legend verticalAlign="top" align="right" height={28} iconType="circle" wrapperStyle={{ fontSize: 11, fontFamily: font }} />
                  <Area type="monotone" dataKey="salario" name="Salário CLT" stackId="1" stroke={C.salarioLine} strokeWidth={1.5} fill="url(#gSal)" />
                  <Area type="monotone" dataKey="imagem" name="Imagem (PJ)" stackId="1" stroke={C.imagemLine} strokeWidth={1.5} fill="url(#gImg)" />
                  <Line type="monotone" dataKey="total" name="Total consolidado" stroke={C.total} strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </Panel>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: 18, marginTop: 18 }}>
            <Panel title="Clubes — a pagar vs a receber" subtitle="Transfer fee, sell-on, solidariedade (por mês)">
              {clube.length === 0 ? <Empty /> : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={clube} margin={{ top: 12, right: 12, bottom: 4, left: 6 }} barGap={2}>
                    <CartesianGrid vertical={false} stroke={C.gridStroke} />
                    <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fontSize: 10, fontFamily: mono, fill: C.axis }} minTickGap={12} />
                    <YAxis tickLine={false} axisLine={false} width={62} tick={{ fontSize: 10, fontFamily: mono, fill: C.axis }} tickFormatter={(v) => fmtCurrencyShort(v, 'BRL')} />
                    <Tooltip content={<MoneyTip />} cursor={{ fill: 'rgba(26,20,16,0.04)' }} />
                    <Legend verticalAlign="top" align="right" height={26} iconType="circle" wrapperStyle={{ fontSize: 11, fontFamily: font }} />
                    <Bar dataKey="pagar" name="A pagar" fill={C.pagar} radius={[4, 4, 0, 0]} maxBarSize={26} />
                    <Bar dataKey="receber" name="A receber" fill={C.receber} radius={[4, 4, 0, 0]} maxBarSize={26} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Panel>

            <Panel title="Agentes — pagamentos por mês" subtitle="Comissões de intermediação (aprox. BRL)">
              {agente.length === 0 ? <Empty /> : (
                <ResponsiveContainer width="100%" height={260}>
                  <ComposedChart data={agente} margin={{ top: 12, right: 12, bottom: 4, left: 6 }}>
                    <defs>
                      <linearGradient id="gAg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={C.agente} stopOpacity={0.4} />
                        <stop offset="100%" stopColor={C.agente} stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke={C.gridStroke} />
                    <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fontSize: 10, fontFamily: mono, fill: C.axis }} minTickGap={12} />
                    <YAxis tickLine={false} axisLine={false} width={62} tick={{ fontSize: 10, fontFamily: mono, fill: C.axis }} tickFormatter={(v) => fmtCurrencyShort(v, 'BRL')} />
                    <Tooltip content={<MoneyTip />} cursor={{ stroke: C.agente, strokeDasharray: '3 3', strokeOpacity: 0.5 }} />
                    <Area type="monotone" dataKey="pagar" name="A pagar" stroke={C.agente} strokeWidth={2} fill="url(#gAg)" activeDot={{ r: 4 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </Panel>

            <Panel title="Top clubes/agentes em atraso" subtitle="Maior exposição vencida (overdue)">
              {overdueRank.length === 0 ? <Empty msg="Nada em atraso 🎉" /> : (
                <ResponsiveContainer width="100%" height={Math.max(160, overdueRank.length * 34 + 24)}>
                  <BarChart layout="vertical" data={overdueRank} margin={{ top: 6, right: 64, bottom: 4, left: 8 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="parte" width={132} tickLine={false} axisLine={false} tick={{ fontSize: 11, fontFamily: font, fill: 'var(--ink-secondary)' }} />
                    <Tooltip content={<MoneyTip />} cursor={{ fill: 'rgba(26,20,16,0.04)' }} />
                    <Bar dataKey="valor" name="Em atraso" fill={C.pagar} radius={[0, 4, 4, 0]} maxBarSize={22}>
                      <LabelList dataKey="valor" position="right" formatter={(v: unknown) => fmtCurrencyShort(Number(v), 'BRL')} style={{ fontFamily: mono, fontSize: 10, fill: 'var(--ink-secondary)' }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Panel>

            <Panel title="Top clubes/agentes já pagos" subtitle="Maior volume liquidado">
              {paidRank.length === 0 ? <Empty /> : (
                <ResponsiveContainer width="100%" height={Math.max(160, paidRank.length * 34 + 24)}>
                  <BarChart layout="vertical" data={paidRank} margin={{ top: 6, right: 64, bottom: 4, left: 8 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="parte" width={132} tickLine={false} axisLine={false} tick={{ fontSize: 11, fontFamily: font, fill: 'var(--ink-secondary)' }} />
                    <Tooltip content={<MoneyTip />} cursor={{ fill: 'rgba(26,20,16,0.04)' }} />
                    <Bar dataKey="valor" name="Pago" fill={C.receber} radius={[0, 4, 4, 0]} maxBarSize={22}>
                      <LabelList dataKey="valor" position="right" formatter={(v: unknown) => fmtCurrencyShort(Number(v), 'BRL')} style={{ fontFamily: mono, fontSize: 10, fill: 'var(--ink-secondary)' }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Panel>
          </div>

          <div style={{ marginTop: 18, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[
              { l: 'Consolidado', to: '/relatorios/consolidado' },
              { l: 'Salários', to: '/relatorios/salarios' },
              { l: 'Imagem', to: '/relatorios/imagem' },
              { l: 'Clubes', to: '/relatorios/clubes' },
              { l: 'Agentes', to: '/relatorios/intermediarios' },
            ].map(x => (
              <button key={x.to} onClick={() => navigate(x.to)} style={{ padding: '8px 16px', borderRadius: 20, border: '1px solid var(--divider-strong)', background: 'transparent', color: '#be8c4a', fontFamily: font, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{x.l} →</button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Componentes ──────────────────────────────────────────────────────────────
function Panel({ title, subtitle, tall, children }: { title: string; subtitle?: string; tall?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface, #fff)', border: '1px solid var(--divider, rgba(190,140,74,0.16))', borderRadius: 16, padding: tall ? '20px 22px' : '18px 20px' }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: font, fontSize: 15, fontWeight: 700, color: 'var(--ink-primary)' }}>{title}</div>
        {subtitle && <div style={{ fontFamily: mono, fontSize: 10, color: 'var(--text-muted)', marginTop: 3, letterSpacing: '0.04em' }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  )
}
function Empty({ msg = 'Sem dados.' }: { msg?: string }) {
  return <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: mono, fontSize: 12, color: 'var(--text-muted)' }}>{msg}</div>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function MoneyTip({ active, payload, label, withTotal }: any) {
  if (!active || !payload?.length) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = payload.filter((p: any) => !withTotal || p.dataKey !== 'total')
  return (
    <div style={{ background: '#1a1410', color: '#fff', borderRadius: 10, padding: '9px 12px', fontFamily: mono, fontSize: 11, boxShadow: '0 8px 24px rgba(0,0,0,0.32)', border: '1px solid rgba(255,255,255,0.08)', minWidth: 150 }}>
      <div style={{ opacity: 0.65, marginBottom: 6, letterSpacing: '0.06em' }}>{label}</div>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {rows.map((p: any) => (
        <div key={p.dataKey} style={{ display: 'flex', gap: 14, justifyContent: 'space-between', alignItems: 'center', padding: '2px 0' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 0.85 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />{p.name}</span>
          <strong>{fmtCurrencyShort(Number(p.value), 'BRL')}</strong>
        </div>
      ))}
      {withTotal && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.14)' }}>
          <span style={{ opacity: 0.85 }}>Total</span>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <strong style={{ color: '#e8c98f' }}>{fmtCurrencyShort(payload.reduce((s: number, p: any) => s + (p.dataKey !== 'total' ? Number(p.value) : 0), 0), 'BRL')}</strong>
        </div>
      )}
    </div>
  )
}

function monthlyByDir(items: Item[], group: Group) {
  const m = new Map<string, { pagar: number; receber: number }>()
  for (const i of items) {
    if (i.group !== group || !i.ym) continue
    if (!m.has(i.ym)) m.set(i.ym, { pagar: 0, receber: 0 })
    const b = m.get(i.ym)!
    if (i.dir === 'A_PAGAR') b.pagar += i.brl; else b.receber += i.brl
  }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([ym, v]) => ({ mes: monthLabel(ym), ...v }))
}
function rankByParte(items: Item[]) {
  const m = new Map<string, number>()
  for (const i of items) m.set(i.parte, (m.get(i.parte) ?? 0) + i.brl)
  return [...m.entries()].map(([parte, valor]) => ({ parte, valor })).sort((a, b) => b.valor - a.valor).slice(0, 6)
}

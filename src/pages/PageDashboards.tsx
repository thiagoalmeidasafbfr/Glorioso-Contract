// src/pages/PageDashboards.tsx
// Painel de controle financeiro (todos os atletas), nível executivo.
//  • Big numbers editoriais (Fraunces) no estilo "Counting House".
//  • Fluxo consolidado Salário CLT + Imagem: UMA linha (total), tooltip no hover.
//  • Clubes: a pagar vs a receber — DUAS linhas (fluxo, valores absolutos).
//  • Agentes: pagamentos por mês (área, série única).
//  • Rankings (top): barras horizontais — em atraso / já pago.
// Valores agregados aproximados em BRL (câmbio de referência).

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, LabelList,
} from 'recharts'
import {
  fetchAllClauses, fetchAllInstallments,
  fetchAllClubLiabilities, fetchAllIntermediaryLiabilities,
} from '../lib/athleteQueries'
import { fmtCurrencyShort, fmtCurrencyParts, isOverdue, todayISO } from '../lib/format'
import type { Currency } from '../types/athlete-system'
import PageHero from '../components/PageHero'

const font = "'Inter', system-ui, sans-serif"
const mono = "'IBM Plex Mono', monospace"
const display = "'Fraunces', 'Cormorant Garamond', Georgia, serif"

// Paleta dos gráficos — preto/grafite para as séries de estrutura e gasto;
// vermelho/verde só para o veredicto direcional (saída x entrada). Valores
// literais porque atributos SVG não resolvem variáveis CSS.
const C = {
  goldLine: '#14110d', goldFill: '#14110d',
  ink: '#2a2521',
  pay: '#8a3524', recv: '#2f6b3a',
  gold: '#14110d',
  surface: '#ffffff',
  grid: 'rgba(20,17,13,0.07)', axis: 'rgba(20,17,13,0.45)',
  crosshair: 'rgba(20,17,13,0.35)',
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
    { label: 'A pagar · aberto', value: big.aPagar, dot: C.pay, sub: 'Obrigações em aberto' },
    { label: 'A receber · aberto', value: big.aReceber, dot: C.recv, sub: 'Direitos em aberto' },
    { label: 'Em atraso', value: big.overdue, dot: C.pay, sub: 'Exposição vencida', alarm: true },
    { label: 'Salário + imagem · mês atual', value: big.mesAtual, dot: C.gold, sub: 'Custo do mês corrente' },
    { label: 'Já pago · acumulado', value: big.pago, dot: C.ink, sub: 'Total liquidado' },
  ]

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1360, margin: '0 auto' }}>
      <PageHero title="Painel executivo" subtitle="Controle financeiro · Botafogo SAF" />

      {loading ? (
        <div style={{ fontFamily: mono, fontSize: 12, color: 'var(--text-muted)', letterSpacing: '0.1em', padding: '40px 4px' }}>CARREGANDO…</div>
      ) : (
        <>
          {/* ── Big numbers editoriais ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 26 }}>
            {tiles.map(t => {
              const p = fmtCurrencyParts(t.value, 'BRL')
              const alarm = t.alarm && t.value > 0
              return (
                <div key={t.label} className="stat-tile" style={{ padding: '18px 20px 16px', display: 'flex', flexDirection: 'column', gap: 0, minHeight: 132 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: t.dot, flexShrink: 0, boxShadow: `0 0 0 3px ${hexA(t.dot, 0.12)}` }} />
                    <span style={{ fontFamily: mono, fontSize: 9.5, fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold-deep)' }}>{t.label}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, lineHeight: 1 }}>
                    <span style={{ fontFamily: display, fontSize: 15, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.01em' }}>{p.sym}</span>
                    <span style={{ fontFamily: display, fontSize: 'clamp(1.7rem, 2.4vw, 2.3rem)', fontWeight: 700, letterSpacing: '-0.02em', color: alarm ? C.pay : 'var(--ink-primary)' }}>{p.num}</span>
                    {p.suffix && <span style={{ fontFamily: display, fontSize: 'clamp(1rem, 1.4vw, 1.3rem)', fontWeight: 700, color: 'var(--text-faint)' }}>{p.suffix}</span>}
                  </div>
                  <div style={{ marginTop: 'auto', paddingTop: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ height: 1, width: 16, background: 'var(--divider-strong)' }} />
                    <span style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>{t.sub}</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── Fluxo consolidado — UMA linha (total CLT + imagem) ── */}
          <Panel eyebrow="Remuneração" title="Fluxo consolidado — Salário CLT + Imagem" subtitle="Custo mensal consolidado ao longo da vigência dos contratos (aprox. BRL)" tall>
            {salImg.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={296}>
                <AreaChart data={salImg} margin={{ top: 16, right: 22, bottom: 4, left: 8 }}>
                  <defs>
                    <linearGradient id="gTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.goldFill} stopOpacity={0.20} />
                      <stop offset="100%" stopColor={C.goldFill} stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke={C.grid} />
                  <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fontSize: 10, fontFamily: mono, fill: C.axis }} minTickGap={18} tickMargin={10} />
                  <YAxis tickLine={false} axisLine={false} width={64} tick={{ fontSize: 10, fontFamily: mono, fill: C.axis }} tickFormatter={(v) => fmtCurrencyShort(v, 'BRL')} />
                  <Tooltip content={<MoneyTip leadKey="total" />} cursor={{ stroke: C.crosshair, strokeWidth: 1 }} />
                  <Area
                    type="monotone" dataKey="total" name="Total consolidado"
                    stroke={C.goldLine} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                    fill="url(#gTotal)" dot={false} isAnimationActive={false}
                    activeDot={{ r: 4.5, fill: C.goldLine, stroke: C.surface, strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Panel>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: 18, marginTop: 18 }}>

            {/* ── Clubes — DUAS linhas (fluxo pagar vs receber) ── */}
            <Panel eyebrow="Clubes" title="A pagar vs a receber" subtitle="Transfer fee, sell-on, solidariedade — fluxo mensal (aprox. BRL)">
              {clube.length === 0 ? <Empty /> : (
                <>
                  <ChartLegend items={[{ name: 'A pagar', color: C.pay, dash: false }, { name: 'A receber', color: C.recv, dash: true }]} />
                  <ResponsiveContainer width="100%" height={244}>
                    <LineChart data={clube} margin={{ top: 8, right: 56, bottom: 4, left: 8 }}>
                      <CartesianGrid vertical={false} stroke={C.grid} />
                      <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fontSize: 10, fontFamily: mono, fill: C.axis }} minTickGap={14} tickMargin={10} />
                      <YAxis tickLine={false} axisLine={false} width={64} tick={{ fontSize: 10, fontFamily: mono, fill: C.axis }} tickFormatter={(v) => fmtCurrencyShort(v, 'BRL')} />
                      <Tooltip content={<MoneyTip />} cursor={{ stroke: C.crosshair, strokeWidth: 1 }} />
                      <Line type="monotone" dataKey="pagar" name="A pagar" stroke={C.pay} strokeWidth={2} strokeLinecap="round" dot={false} isAnimationActive={false} activeDot={{ r: 4.5, fill: C.pay, stroke: C.surface, strokeWidth: 2 }}>
                        <LabelList dataKey="pagar" content={<EndValueTag color={C.pay} total={clube.length} />} />
                      </Line>
                      <Line type="monotone" dataKey="receber" name="A receber" stroke={C.recv} strokeWidth={2} strokeDasharray="6 4" strokeLinecap="round" dot={false} isAnimationActive={false} activeDot={{ r: 4.5, fill: C.recv, stroke: C.surface, strokeWidth: 2 }}>
                        <LabelList dataKey="receber" content={<EndValueTag color={C.recv} total={clube.length} />} />
                      </Line>
                    </LineChart>
                  </ResponsiveContainer>
                </>
              )}
            </Panel>

            {/* ── Agentes — série única (área) ── */}
            <Panel eyebrow="Agentes" title="Pagamentos por mês" subtitle="Comissões de intermediação (aprox. BRL)">
              {agente.length === 0 ? <Empty /> : (
                <ResponsiveContainer width="100%" height={244}>
                  <AreaChart data={agente} margin={{ top: 16, right: 22, bottom: 4, left: 8 }}>
                    <defs>
                      <linearGradient id="gAg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={C.goldFill} stopOpacity={0.18} />
                        <stop offset="100%" stopColor={C.goldFill} stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke={C.grid} />
                    <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fontSize: 10, fontFamily: mono, fill: C.axis }} minTickGap={14} tickMargin={10} />
                    <YAxis tickLine={false} axisLine={false} width={64} tick={{ fontSize: 10, fontFamily: mono, fill: C.axis }} tickFormatter={(v) => fmtCurrencyShort(v, 'BRL')} />
                    <Tooltip content={<MoneyTip leadKey="pagar" />} cursor={{ stroke: C.crosshair, strokeWidth: 1 }} />
                    <Area type="monotone" dataKey="pagar" name="A pagar" stroke={C.goldLine} strokeWidth={2} strokeLinecap="round" fill="url(#gAg)" dot={false} isAnimationActive={false} activeDot={{ r: 4.5, fill: C.goldLine, stroke: C.surface, strokeWidth: 2 }} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </Panel>

            {/* ── Top em atraso — barras horizontais ── */}
            <Panel eyebrow="Ranking" title="Top clubes/agentes em atraso" subtitle="Maior exposição vencida (overdue)">
              {overdueRank.length === 0 ? <Empty msg="Nada em atraso 🎉" /> : (
                <ResponsiveContainer width="100%" height={Math.max(160, overdueRank.length * 36 + 20)}>
                  <BarChart layout="vertical" data={overdueRank} margin={{ top: 6, right: 96, bottom: 4, left: 8 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="parte" width={132} tickLine={false} axisLine={false} tick={{ fontSize: 11, fontFamily: font, fill: 'var(--ink-secondary)' }} />
                    <Tooltip content={<MoneyTip />} cursor={{ fill: 'rgba(26,20,16,0.04)' }} />
                    <Bar dataKey="valor" name="Em atraso" fill={C.pay} radius={[0, 4, 4, 0]} maxBarSize={22} barSize={20} isAnimationActive={false}>
                      <LabelList dataKey="valor" position="right" formatter={(v: unknown) => fmtCurrencyShort(Number(v), 'BRL')} style={{ fontFamily: mono, fontSize: 10, fill: 'var(--ink-secondary)' }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Panel>

            {/* ── Top já pago — barras horizontais ── */}
            <Panel eyebrow="Ranking" title="Top clubes/agentes já pagos" subtitle="Maior volume liquidado">
              {paidRank.length === 0 ? <Empty /> : (
                <ResponsiveContainer width="100%" height={Math.max(160, paidRank.length * 36 + 20)}>
                  <BarChart layout="vertical" data={paidRank} margin={{ top: 6, right: 96, bottom: 4, left: 8 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="parte" width={132} tickLine={false} axisLine={false} tick={{ fontSize: 11, fontFamily: font, fill: 'var(--ink-secondary)' }} />
                    <Tooltip content={<MoneyTip />} cursor={{ fill: 'rgba(26,20,16,0.04)' }} />
                    <Bar dataKey="valor" name="Pago" fill={C.recv} radius={[0, 4, 4, 0]} maxBarSize={22} barSize={20} isAnimationActive={false}>
                      <LabelList dataKey="valor" position="right" formatter={(v: unknown) => fmtCurrencyShort(Number(v), 'BRL')} style={{ fontFamily: mono, fontSize: 10, fill: 'var(--ink-secondary)' }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Panel>
          </div>

          <div style={{ marginTop: 20, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[
              { l: 'Consolidado', to: '/relatorios/consolidado' },
              { l: 'Salários', to: '/relatorios/salarios' },
              { l: 'Imagem', to: '/relatorios/imagem' },
              { l: 'Clubes', to: '/relatorios/clubes' },
              { l: 'Agentes', to: '/relatorios/intermediarios' },
            ].map(x => (
              <button key={x.to} onClick={() => navigate(x.to)} style={{ padding: '8px 16px', borderRadius: 20, border: '1px solid var(--divider-strong)', background: 'transparent', color: 'var(--accent)', fontFamily: font, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{x.l} →</button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Componentes ──────────────────────────────────────────────────────────────
function Panel({ eyebrow, title, subtitle, tall, children }: { eyebrow?: string; title: string; subtitle?: string; tall?: boolean; children: React.ReactNode }) {
  return (
    <div className="panel-card" style={{ padding: tall ? '20px 22px' : '18px 20px' }}>
      <div style={{ marginBottom: 14 }}>
        {eyebrow && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
            <span style={{ height: 1, width: 16, background: 'var(--gold)', opacity: 0.65 }} />
            <span style={{ fontFamily: mono, fontSize: 9, fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--gold)' }}>{eyebrow}</span>
          </div>
        )}
        <div style={{ fontFamily: font, fontSize: 15, fontWeight: 700, color: 'var(--ink-primary)', letterSpacing: '-0.01em' }}>{title}</div>
        {subtitle && <div style={{ fontFamily: mono, fontSize: 10, color: 'var(--text-muted)', marginTop: 3, letterSpacing: '0.03em' }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  )
}

function ChartLegend({ items }: { items: { name: string; color: string; dash?: boolean }[] }) {
  return (
    <div style={{ display: 'flex', gap: 16, justifyContent: 'flex-end', marginTop: -4, marginBottom: 6 }}>
      {items.map(it => (
        <span key={it.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: font, fontSize: 11, color: 'var(--ink-secondary)' }}>
          <svg width="20" height="8" aria-hidden>
            <line x1="1" y1="4" x2="19" y2="4" stroke={it.color} strokeWidth="2" strokeLinecap="round" strokeDasharray={it.dash ? '5 3' : undefined} />
          </svg>
          {it.name}
        </span>
      ))}
    </div>
  )
}

function Empty({ msg = 'Sem dados.' }: { msg?: string }) {
  return <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: mono, fontSize: 12, color: 'var(--text-muted)' }}>{msg}</div>
}

// Rótulo apenas no último ponto da linha: bolinha (cor da série) + valor (tinta).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function EndValueTag({ x, y, value, index, color, total }: any) {
  if (index == null || index !== total - 1 || value == null) return null
  return (
    <g>
      <circle cx={x} cy={y} r={3.5} fill={color} stroke={C.surface} strokeWidth={2} />
      <text x={x} y={y} dx={9} dy={3.6} fontFamily={mono} fontSize={9.5} fontWeight={600} fill={C.ink} textAnchor="start">
        {fmtCurrencyShort(Number(value), 'BRL')}
      </text>
    </g>
  )
}

// Tooltip: valor em destaque, nome secundário, chave em traço (não caixa).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function MoneyTip({ active, payload, label, leadKey }: any) {
  if (!active || !payload?.length) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lead = leadKey ? payload.find((p: any) => p.dataKey === leadKey) : null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = payload.filter((p: any) => !leadKey || p.dataKey !== leadKey)
  return (
    <div style={{ background: '#1a1410', color: '#f3eee2', borderRadius: 10, padding: '10px 13px', fontFamily: mono, fontSize: 11, boxShadow: '0 8px 24px rgba(0,0,0,0.32)', border: '1px solid rgba(255,255,255,0.08)', minWidth: 158 }}>
      <div style={{ opacity: 0.55, marginBottom: 7, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 9 }}>{label}</div>
      {lead && (
        <div style={{ marginBottom: rows.length ? 8 : 0, paddingBottom: rows.length ? 8 : 0, borderBottom: rows.length ? '1px solid rgba(255,255,255,0.12)' : 'none' }}>
          <div style={{ opacity: 0.6, fontSize: 8.5, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 3 }}>{lead.name}</div>
          <div style={{ fontFamily: display, fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em', color: '#f3eee2' }}>{fmtCurrencyShort(Number(lead.value), 'BRL')}</div>
        </div>
      )}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {rows.map((p: any) => (
        <div key={p.dataKey} style={{ display: 'flex', gap: 16, justifyContent: 'space-between', alignItems: 'center', padding: '2px 0' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7, opacity: 0.78 }}>
            <svg width="14" height="6" aria-hidden><line x1="0" y1="3" x2="14" y2="3" stroke={p.color} strokeWidth="2" strokeLinecap="round" /></svg>
            {p.name}
          </span>
          <strong style={{ fontWeight: 600 }}>{fmtCurrencyShort(Number(p.value), 'BRL')}</strong>
        </div>
      ))}
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

// rgba a partir de hex (#rrggbb) para halos suaves das bolinhas de status.
function hexA(hex: string, a: number) {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${a})`
}

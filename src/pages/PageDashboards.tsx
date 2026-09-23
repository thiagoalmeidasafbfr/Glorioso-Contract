// src/pages/PageDashboards.tsx
// Painel executivo financeiro — visão consolidada.
//
// Layout: um gráfico principal (todas as obrigações a pagar × a receber por mês),
// depois uma grade com os secundários:
//   • Clubes — a pagar vs a receber (mensal)
//   • Fluxo salarial (Salário CLT + Imagem, área)
//   • Top overdue por natureza (barras)
//   • Top overdue por clubes / por agentes
//   • Top clubes / agentes mais pagos nos últimos 90 dias
//   • Aging list — pizza dos vencidos por faixa (0-30, 31-60, 61-90, 91-180, 180+)
//
// Todos os valores em BRL aproximado (câmbio de referência fixo — não usa PTAX
// do dia para não gerar oscilações visuais no dashboard).

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, LabelList, PieChart, Pie, Cell,
} from 'recharts'
import {
  fetchAllClauses, fetchAllInstallments,
  fetchAllClubLiabilities, fetchAllIntermediaryLiabilities,
} from '../lib/athleteQueries'
import {
  fmtCurrencyShort, fmtCurrencyParts, isOverdue, todayISO, daysFromToday,
} from '../lib/format'
import { parseRJ } from '../lib/judicialRecovery'
import { CLAUSE_TYPE_LABELS } from '../types/athlete-system'
import type { Currency, ClauseType } from '../types/athlete-system'
import PageHero from '../components/PageHero'
import { Icon } from '../components/Icon'

const font = 'var(--font-body)'
const display = 'var(--font-display)'

// Paleta — séries de dados do Glorioso Finance DS, na ordem fixa:
// a pagar = --chart-2 (preto), a receber = --chart-1 (tinta de dados do
// acento). Vencido é problema: usa o único vermelho do sistema.
const C = {
  ink: 'var(--ink-900)',
  pay: 'var(--chart-2)', recv: 'var(--chart-1)', warn: 'var(--amber-500)', late: 'var(--red-500)',
  gold: 'var(--chart-1)', goldLine: 'var(--chart-1)', goldFill: 'var(--chart-1)',
  surface: 'var(--white)',
  grid: 'var(--chart-grid)', axis: 'var(--text-muted)',
  crosshair: 'var(--border-strong)',
}

// Aging dos vencidos — da atenção (âmbar) ao problema grave (vermelho).
const AGING_COLORS = ['var(--amber-400)', 'var(--amber-500)', 'var(--red-400)', 'var(--red-500)', 'var(--red-600)']

// Eixos e tooltip dos gráficos (Recharts) nas métricas do DS.
const AXIS_TICK = { fontSize: 11, fontFamily: 'var(--font-core)', fill: 'var(--text-muted)' }
const TIP: React.CSSProperties = {
  background: 'var(--surface-card)', color: 'var(--text-primary)', borderRadius: 'var(--radius-md)',
  padding: '10px 14px', fontFamily: 'var(--font-core)', fontSize: 12, boxShadow: 'var(--shadow-pop)',
}

const APPROX_BRL: Record<string, number> = { BRL: 1, EUR: 6.10, USD: 5.55, GBP: 7.10 }
const brlOf = (v: number, c: Currency) => v * (APPROX_BRL[c] ?? 1)
const OPEN = ['PENDENTE', 'PARCIALMENTE_PAGA', 'EM_ATRASO', 'VENCIDA']
const CLUB_TYPES: ClauseType[] = ['TRANSFER_FEE_FIXO', 'TRANSFER_FEE_VARIAVEL', 'SELL_ON_FEE', 'SELL_ON_FEE_RECEBER', 'SOLIDARIEDADE_FIFA', 'EMPRESTIMO_TAXA', 'CLAUSULA_RESCISORIA', 'PERCENTUAL_VENDA_ATLETA']
const AGENT_TYPES: ClauseType[] = ['INTERMEDIACAO', 'INTERMEDIACAO_VENDA_FUTURA']
const isBFR = (s: string) => s.toLowerCase().includes('botafogo') || s.toLowerCase() === 'bfr'
const MES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const monthLabel = (ym: string) => { const [y, m] = ym.split('-'); return `${MES_ABREV[(+m) - 1] ?? m}/${y.slice(2)}` }

type Group = 'salario' | 'imagem' | 'clube' | 'agente' | 'outro'
interface Item {
  ym: string
  group: Group
  natureza: string
  dir: 'A_PAGAR' | 'A_RECEBER'
  brl: number
  status: string
  parte: string
  late: boolean
  dueDate: string | null
  paidDate: string | null
  /** true quando o próprio item ou sua cláusula-mãe está em Recuperação Judicial. */
  rj: boolean
}

function groupOf(t: string): Group {
  if (t === 'SALARIO_CETD') return 'salario'
  if (t === 'DIREITO_IMAGEM') return 'imagem'
  if (CLUB_TYPES.includes(t as ClauseType)) return 'clube'
  if (AGENT_TYPES.includes(t as ClauseType)) return 'agente'
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
      // RJ é regra-mestra: um item em RJ nunca é "late" e não entra nas
      // agregações de A pagar/A receber (viraria dupla contagem).
      for (const it of installments) {
        const c = clauseById.get(it.clause_id); if (!c) continue
        const pagar = isBFR(c.debtor_party)
        const rj = !!parseRJ(it.notes) || !!parseRJ(c.notes)
        list.push({
          ym: (it.due_date ?? '').slice(0, 7),
          group: groupOf(c.clause_type), natureza: CLAUSE_TYPE_LABELS[c.clause_type],
          dir: pagar ? 'A_PAGAR' : 'A_RECEBER',
          brl: brlOf(it.original_value, it.currency), status: it.payment_status,
          parte: pagar ? c.creditor_party : c.debtor_party,
          late: !rj && isOverdue(it.due_date, it.payment_status),
          dueDate: it.due_date, paidDate: it.payment_date, rj,
        })
      }
      for (const c of clauses) {
        if (withInst.has(c.id) || c.original_value == null) continue
        const pagar = isBFR(c.debtor_party)
        const rj = !!parseRJ(c.notes)
        list.push({
          ym: (c.due_date ?? '').slice(0, 7),
          group: groupOf(c.clause_type), natureza: CLAUSE_TYPE_LABELS[c.clause_type],
          dir: pagar ? 'A_PAGAR' : 'A_RECEBER',
          brl: brlOf(c.original_value, c.currency), status: c.payment_status,
          parte: pagar ? c.creditor_party : c.debtor_party,
          late: !rj && isOverdue(c.due_date, c.payment_status),
          dueDate: c.due_date, paidDate: c.payment_date, rj,
        })
      }
      for (const l of clubLiabs) {
        const rj = !!parseRJ(l.notes)
        list.push({
          ym: (l.due_date ?? '').slice(0, 7),
          group: 'clube', natureza: 'Obrigação clube',
          dir: l.direction, brl: brlOf(l.amount, l.currency), status: l.status,
          parte: l.club_name, late: !rj && isOverdue(l.due_date, l.status),
          dueDate: l.due_date, paidDate: l.settled_date, rj,
        })
      }
      for (const l of interLiabs) {
        const rj = !!parseRJ(l.notes)
        list.push({
          ym: (l.due_date ?? '').slice(0, 7),
          group: 'agente', natureza: 'Intermediação',
          dir: l.direction, brl: brlOf(l.amount, l.currency), status: l.status,
          parte: l.intermediary_name, late: !rj && isOverdue(l.due_date, l.status),
          dueDate: l.due_date, paidDate: l.settled_date, rj,
        })
      }
      setItems(list)
      setLoading(false)
    })()
  }, [])

  const big = useMemo(() => {
    let aPagar = 0, aReceber = 0, overdue = 0, pago = 0, rjExpo = 0
    const nowYM = todayISO().slice(0, 7)
    let mesAtual = 0
    for (const i of items) {
      if (OPEN.includes(i.status)) {
        // Regra-mestra: em RJ nunca soma como A pagar/A receber corrente.
        if (i.rj) { if (i.dir === 'A_PAGAR') rjExpo += i.brl }
        else if (i.dir === 'A_PAGAR') aPagar += i.brl
        else aReceber += i.brl
      }
      if (i.late) overdue += i.brl                 // late já ignora RJ
      if (i.status === 'PAGA') pago += i.brl
      if (i.ym === nowYM && (i.group === 'salario' || i.group === 'imagem')) mesAtual += i.brl
    }
    return { aPagar, aReceber, overdue, pago, mesAtual, rjExpo }
  }, [items])

  // ── 1) Gráfico principal — todas as obrigações mensal (pagar vs receber),
  //       exceto salário CLT/imagem (painel próprio) e itens em RJ (bucket separado). ──
  const allDir = useMemo(() => monthlyDirDetailed(items.filter(i => !i.rj && i.group !== 'salario' && i.group !== 'imagem')), [items])

  // ── 2) Clubes — a pagar vs a receber (mensal), exclui RJ ──
  const clube = useMemo(() => monthlyDirDetailed(items.filter(i => !i.rj && i.group === 'clube')), [items])

  // ── 3) Fluxo salarial (Salário CLT + Imagem, área única, custo mensal) ──
  const salImg = useMemo(() => {
    const m = new Map<string, number>()
    for (const i of items) {
      if ((i.group !== 'salario' && i.group !== 'imagem') || !i.ym) continue
      m.set(i.ym, (m.get(i.ym) ?? 0) + i.brl)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([ym, v]) => ({ mes: monthLabel(ym), total: v }))
  }, [items])

  // ── 4) Top overdue por natureza ──
  const overdueByNat = useMemo(() => rankMap(items.filter(i => i.late).map(i => [i.natureza, i.brl] as const)), [items])
  // ── 5) Top overdue por clubes ──
  const overdueByClube = useMemo(() => rankMap(items.filter(i => i.late && i.group === 'clube').map(i => [i.parte, i.brl] as const)), [items])
  // ── 6) Top overdue por agentes ──
  const overdueByAgente = useMemo(() => rankMap(items.filter(i => i.late && i.group === 'agente').map(i => [i.parte, i.brl] as const)), [items])

  // ── 7-8) Top pagos nos últimos 90 dias — clubes / agentes ──
  const topPayClube90 = useMemo(() => rankMap(paidLast(items, 90).filter(i => i.group === 'clube').map(i => [i.parte, i.brl] as const)), [items])
  const topPayAgente90 = useMemo(() => rankMap(paidLast(items, 90).filter(i => i.group === 'agente').map(i => [i.parte, i.brl] as const)), [items])

  // ── 9) Aging da lista de vencidos — total por faixa + decomposição por natureza ──
  const aging = useMemo(() => {
    // A cor acompanha a FAIXA (severidade), não a posição na lista filtrada.
    const buckets: { name: string; min: number; max: number; total: number; byNat: Record<string, number>; color: string }[] = [
      { name: '0-30 dias',    min: 1,   max: 30,    total: 0, byNat: {}, color: AGING_COLORS[0] },
      { name: '31-60 dias',   min: 31,  max: 60,    total: 0, byNat: {}, color: AGING_COLORS[1] },
      { name: '61-90 dias',   min: 61,  max: 90,    total: 0, byNat: {}, color: AGING_COLORS[2] },
      { name: '91-180 dias',  min: 91,  max: 180,   total: 0, byNat: {}, color: AGING_COLORS[3] },
      { name: 'Acima de 180', min: 181, max: 99999, total: 0, byNat: {}, color: AGING_COLORS[4] },
    ]
    for (const i of items) {
      if (!i.late || !i.dueDate) continue
      const d = daysFromToday(i.dueDate)
      if (d === null || d >= 0) continue
      const abs = -d
      const b = buckets.find(x => abs >= x.min && abs <= x.max)
      if (b) {
        b.total += i.brl
        b.byNat[i.natureza] = (b.byNat[i.natureza] ?? 0) + i.brl
      }
    }
    return buckets.filter(b => b.total > 0)
  }, [items])

  const tiles = [
    { label: 'A pagar · aberto', value: big.aPagar, dot: C.pay, sub: 'Fora da RJ · em aberto' },
    { label: 'A receber · aberto', value: big.aReceber, dot: C.recv, sub: 'Direitos em aberto' },
    { label: 'Em atraso', value: big.overdue, dot: C.late, sub: 'Vencido fora da RJ', alarm: true },
    { label: 'Em Rec. Judicial', value: big.rjExpo, dot: C.warn, sub: 'Devido dentro do processo' },
    { label: 'Salário + imagem · mês atual', value: big.mesAtual, dot: C.gold, sub: 'Custo do mês corrente' },
    { label: 'Já pago · acumulado', value: big.pago, dot: C.ink, sub: 'Total liquidado' },
  ]

  return (
    <div style={{ padding: '24px 28px 32px', width: '100%', boxSizing: 'border-box' }}>
      <PageHero title="Painel executivo" subtitle="Controle financeiro · Botafogo SAF" />

      {loading ? (
        <div className="eyebrow" style={{ padding: '40px 4px' }}>Carregando…</div>
      ) : (
        <>
          {/* ── Big numbers editoriais ── */}
          {/* MetricCard do DS: eyebrow · métrica de 44px · legenda — em grade 3-up */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 'var(--space-5)', marginBottom: 'var(--space-5)' }}>
            {tiles.map(t => {
              const p = fmtCurrencyParts(t.value, 'BRL')
              const alarm = t.alarm && t.value > 0
              return (
                <div key={t.label} className="stat-tile" style={{ padding: 'var(--gutter-card)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 'var(--radius-circle)', background: t.dot, flexShrink: 0 }} />
                    <span className="eyebrow">{t.label}</span>
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, lineHeight: 'var(--text-metric-line)', whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: 'var(--text-subtitle-size)', fontWeight: 400, color: 'var(--text-muted)' }}>{p.sym}</span>
                      <span style={{ fontSize: 'var(--text-metric-size)', fontWeight: 500, letterSpacing: 'var(--text-metric-tracking)', fontVariantNumeric: 'tabular-nums', color: alarm ? 'var(--text-negative)' : 'var(--text-primary)' }}>{p.num}</span>
                      {p.suffix && <span style={{ fontSize: 'var(--text-title-size)', fontWeight: 400, color: 'var(--text-muted)' }}>{p.suffix}</span>}
                    </div>
                    <div style={{ marginTop: 2, fontSize: 'var(--text-body-size)', color: 'var(--text-secondary)' }}>{t.sub}</div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── PRINCIPAL — todas as obrigações a pagar vs a receber ── */}
          <Panel eyebrow="Panorama" title="Obrigações — a pagar vs a receber" subtitle="Fluxo mensal consolidado exceto salário CLT e imagem (aprox. BRL)" tall>
            {allDir.length === 0 ? <Empty /> : (
              <>
                <ChartLegend items={[{ name: 'A pagar', color: C.pay }, { name: 'A receber', color: C.recv }]} />
                <ResponsiveContainer width="100%" height={340}>
                  <LineChart data={allDir} margin={{ top: 16, right: 56, bottom: 4, left: 8 }}>
                    <CartesianGrid vertical={false} stroke={C.grid} />
                    <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={AXIS_TICK} minTickGap={18} tickMargin={10} />
                    <YAxis tickLine={false} axisLine={false} width={72} tick={AXIS_TICK} tickFormatter={(v) => fmtCurrencyShort(v, 'BRL')} />
                    <Tooltip content={<BreakdownTip />} cursor={{ stroke: C.crosshair, strokeWidth: 1 }} />
                    <Line type="monotone" dataKey="pagar" name="A pagar" stroke={C.pay} strokeWidth={2} strokeLinecap="round" dot={false} isAnimationActive={false} activeDot={{ r: 5, fill: C.pay, stroke: C.surface, strokeWidth: 2 }}>
                      <LabelList dataKey="pagar" content={<EndValueTag color={C.pay} total={allDir.length} />} />
                    </Line>
                    <Line type="monotone" dataKey="receber" name="A receber" stroke={C.recv} strokeWidth={2} strokeLinecap="round" dot={false} isAnimationActive={false} activeDot={{ r: 5, fill: C.recv, stroke: C.surface, strokeWidth: 2 }}>
                      <LabelList dataKey="receber" content={<EndValueTag color={C.recv} total={allDir.length} />} />
                    </Line>
                  </LineChart>
                </ResponsiveContainer>
              </>
            )}
          </Panel>

          {/* ── Grade de gráficos secundários ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(460px, 100%), 1fr))', gap: 'var(--space-5)', marginTop: 'var(--space-5)' }}>

            {/* Clubes — pagar vs receber */}
            <Panel eyebrow="Clubes" title="A pagar vs a receber" subtitle="Transfer fee, sell-on, solidariedade — fluxo mensal (aprox. BRL)">
              {clube.length === 0 ? <Empty /> : (
                <>
                  <ChartLegend items={[{ name: 'A pagar', color: C.pay }, { name: 'A receber', color: C.recv }]} />
                  <ResponsiveContainer width="100%" height={244}>
                    <LineChart data={clube} margin={{ top: 8, right: 56, bottom: 4, left: 8 }}>
                      <CartesianGrid vertical={false} stroke={C.grid} />
                      <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={AXIS_TICK} minTickGap={14} tickMargin={10} />
                      <YAxis tickLine={false} axisLine={false} width={72} tick={AXIS_TICK} tickFormatter={(v) => fmtCurrencyShort(v, 'BRL')} />
                      <Tooltip content={<BreakdownTip />} cursor={{ stroke: C.crosshair, strokeWidth: 1 }} />
                      <Line type="monotone" dataKey="pagar" name="A pagar" stroke={C.pay} strokeWidth={2} strokeLinecap="round" dot={false} isAnimationActive={false} activeDot={{ r: 4.5, fill: C.pay, stroke: C.surface, strokeWidth: 2 }}>
                        <LabelList dataKey="pagar" content={<EndValueTag color={C.pay} total={clube.length} />} />
                      </Line>
                      <Line type="monotone" dataKey="receber" name="A receber" stroke={C.recv} strokeWidth={2} strokeLinecap="round" dot={false} isAnimationActive={false} activeDot={{ r: 4.5, fill: C.recv, stroke: C.surface, strokeWidth: 2 }}>
                        <LabelList dataKey="receber" content={<EndValueTag color={C.recv} total={clube.length} />} />
                      </Line>
                    </LineChart>
                  </ResponsiveContainer>
                </>
              )}
            </Panel>

            {/* Fluxo salarial (área única) */}
            <Panel eyebrow="Remuneração" title="Fluxo salarial (CLT + Imagem)" subtitle="Custo mensal consolidado dos elencos (aprox. BRL)">
              {salImg.length === 0 ? <Empty /> : (
                <ResponsiveContainer width="100%" height={244}>
                  <AreaChart data={salImg} margin={{ top: 16, right: 22, bottom: 4, left: 8 }}>
                    <defs>
                      <linearGradient id="gSal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={C.goldFill} stopOpacity={0.28} />
                        <stop offset="100%" stopColor={C.goldFill} stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke={C.grid} />
                    <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={AXIS_TICK} minTickGap={14} tickMargin={10} />
                    <YAxis tickLine={false} axisLine={false} width={72} tick={AXIS_TICK} tickFormatter={(v) => fmtCurrencyShort(v, 'BRL')} />
                    <Tooltip content={<MoneyTip leadKey="total" />} cursor={{ stroke: C.crosshair, strokeWidth: 1 }} />
                    <Area type="monotone" dataKey="total" name="Custo mensal" stroke={C.goldLine} strokeWidth={2} strokeLinecap="round" fill="url(#gSal)" dot={false} isAnimationActive={false} activeDot={{ r: 4.5, fill: C.goldLine, stroke: C.surface, strokeWidth: 2 }} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </Panel>

            {/* Top overdue por natureza */}
            <Panel eyebrow="Ranking" title="Top overdue por natureza" subtitle="Exposição vencida agrupada por tipo de obrigação">
              <HRank data={overdueByNat} color={C.late} empty="Nada em atraso" />
            </Panel>

            {/* Aging pie */}
            <Panel eyebrow="Ranking" title="Aging da lista de vencidos" subtitle="Distribuição da exposição por faixa de atraso">
              {aging.length === 0 ? <Empty msg="Nada em atraso" /> : (
                <ResponsiveContainer width="100%" height={Math.max(240, aging.length * 20 + 200)}>
                  <PieChart>
                    <Pie data={aging} dataKey="total" nameKey="name" cx="50%" cy="50%" innerRadius={54} outerRadius={92} paddingAngle={2} isAnimationActive={false} stroke={C.surface} strokeWidth={2}>
                      {aging.map((b, i) => <Cell key={i} fill={b.color} />)}
                    </Pie>
                    <Tooltip content={<PieTip />} />
                  </PieChart>
                </ResponsiveContainer>
              )}
              {aging.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 6, marginTop: 8 }}>
                  {aging.map(b => (
                    <span key={b.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                      <span style={{ width: 9, height: 9, borderRadius: 'var(--radius-circle)', background: b.color, flex: 'none' }} />
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.name}</span>
                      <strong style={{ marginLeft: 'auto', fontWeight: 500, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmtCurrencyShort(b.total, 'BRL')}</strong>
                    </span>
                  ))}
                </div>
              )}
            </Panel>

            {/* Top overdue por clubes */}
            <Panel eyebrow="Ranking" title="Top overdue por clubes" subtitle="Clubes com maior exposição vencida">
              <HRank data={overdueByClube} color={C.late} empty="Nada em atraso com clubes" />
            </Panel>

            {/* Top overdue por agentes */}
            <Panel eyebrow="Ranking" title="Top overdue por agentes" subtitle="Intermediários com maior exposição vencida">
              <HRank data={overdueByAgente} color={C.late} empty="Nada em atraso com agentes" />
            </Panel>

            {/* Top clubes mais pagos últimos 90 dias */}
            <Panel eyebrow="Ranking" title="Top clubes mais pagos · 90 dias" subtitle="Volume liquidado nos últimos 90 dias">
              <HRank data={topPayClube90} color={C.recv} empty="Sem pagamentos a clubes nos últimos 90 dias" />
            </Panel>

            {/* Top agentes mais pagos últimos 90 dias */}
            <Panel eyebrow="Ranking" title="Top agentes mais pagos · 90 dias" subtitle="Volume liquidado nos últimos 90 dias">
              <HRank data={topPayAgente90} color={C.recv} empty="Sem pagamentos a agentes nos últimos 90 dias" />
            </Panel>
          </div>

          <div style={{ marginTop: 'var(--space-6)', display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            {[
              { l: 'Consolidado', to: '/relatorios/consolidado' },
              { l: 'Recuperação Judicial', to: '/relatorios/recuperacao-judicial' },
              { l: 'Visão por Atleta', to: '/relatorios/visao-atletas' },
              { l: 'Vendas Futuras', to: '/relatorios/sell-on' },
              { l: 'Direitos Econômicos', to: '/relatorios/direitos-economicos' },
              { l: 'Gatilhos e Metas', to: '/relatorios/gatilhos' },
            ].map(x => (
              <button key={x.to} onClick={() => navigate(x.to)} className="btn btn-outline">{x.l} <Icon name="chevronRight" size={16} /></button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Utilidades de agregação ──────────────────────────────────────────────────

// Agrega valores por parte (rótulo) e devolve os 6 maiores.
function rankMap(pairs: ReadonlyArray<readonly [string, number]>) {
  const m = new Map<string, number>()
  for (const [k, v] of pairs) m.set(k, (m.get(k) ?? 0) + v)
  return [...m.entries()]
    .map(([parte, valor]) => ({ parte, valor }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 6)
}

// Agrega direção A_PAGAR × A_RECEBER por mês, mantendo a decomposição por
// natureza — o tooltip usa `pagarBy`/`receberBy` para listar "X de <natureza>".
interface MonthRow {
  mes: string
  pagar: number
  receber: number
  pagarBy: Record<string, number>
  receberBy: Record<string, number>
}
function monthlyDirDetailed(items: Item[]): MonthRow[] {
  const m = new Map<string, { pagar: number; receber: number; pagarBy: Record<string, number>; receberBy: Record<string, number> }>()
  for (const i of items) {
    if (!i.ym) continue
    if (!m.has(i.ym)) m.set(i.ym, { pagar: 0, receber: 0, pagarBy: {}, receberBy: {} })
    const b = m.get(i.ym)!
    const bucket = i.dir === 'A_PAGAR' ? b.pagarBy : b.receberBy
    bucket[i.natureza] = (bucket[i.natureza] ?? 0) + i.brl
    if (i.dir === 'A_PAGAR') b.pagar += i.brl; else b.receber += i.brl
  }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([ym, v]) => ({ mes: monthLabel(ym), ...v }))
}

// Itens PAGA cuja data de pagamento cai nos últimos N dias.
function paidLast(items: Item[], days: number) {
  const now = new Date()
  const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - days)
  return items.filter(i => {
    if (i.status !== 'PAGA' || !i.paidDate) return false
    const d = new Date(i.paidDate + 'T12:00:00Z')
    return d >= cutoff && d <= now
  })
}

// ── Componentes visuais ─────────────────────────────────────────────────────

function Panel({ eyebrow, title, subtitle, tall, children }: { eyebrow?: string; title: string; subtitle?: string; tall?: boolean; children: React.ReactNode }) {
  return (
    <div className="panel-card" style={{ padding: tall ? 'var(--space-6)' : 'var(--gutter-card)' }}>
      <div style={{ marginBottom: 'var(--space-4)' }}>
        {eyebrow && <div className="eyebrow" style={{ marginBottom: 'var(--space-3)' }}>{eyebrow}</div>}
        <div style={{ fontFamily: font, fontSize: 'var(--text-subtitle-size)', fontWeight: 500, color: 'var(--ink-primary)', letterSpacing: '-0.01em' }}>{title}</div>
        {subtitle && <div style={{ fontFamily: font, fontSize: 'var(--text-body-sm-size)', color: 'var(--text-secondary)', marginTop: 4 }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  )
}

// Legend do DS: ponto de 9px + rótulo de 12px em cinza.
function ChartLegend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <div style={{ display: 'flex', gap: 'var(--space-4)', justifyContent: 'flex-end', marginTop: -4, marginBottom: 6 }}>
      {items.map(it => (
        <span key={it.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: font, fontSize: 12, color: 'var(--text-secondary)' }}>
          <span style={{ width: 9, height: 9, borderRadius: 'var(--radius-circle)', background: it.color, flex: 'none' }} />
          {it.name}
        </span>
      ))}
    </div>
  )
}

function Empty({ msg = 'Sem dados.' }: { msg?: string }) {
  return <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: font, fontSize: 'var(--text-body-sm-size)', color: 'var(--text-secondary)' }}>{msg}</div>
}

// Ranking horizontal reutilizável.
function HRank({ data, color, empty }: { data: { parte: string; valor: number }[]; color: string; empty: string }) {
  if (data.length === 0) return <Empty msg={empty} />
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 36 + 20)}>
      <BarChart layout="vertical" data={data} margin={{ top: 6, right: 96, bottom: 4, left: 8 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="parte" width={132} tickLine={false} axisLine={false} tick={{ fontSize: 12, fontFamily: font, fill: 'var(--text-secondary)' }} />
        <Tooltip content={<MoneyTip />} cursor={{ fill: 'var(--surface-sunken)' }} />
        <Bar dataKey="valor" name="Valor" fill={color} background={{ fill: 'var(--chart-track)', radius: 6 }} radius={[0, 6, 6, 0]} maxBarSize={20} barSize={16} isAnimationActive={false}>
          <LabelList dataKey="valor" position="right" formatter={(v: unknown) => fmtCurrencyShort(Number(v), 'BRL')} style={{ fontFamily: font, fontSize: 11, fill: 'var(--text-primary)' }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// Rótulo apenas no último ponto da linha: bolinha (cor da série) + valor (tinta).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function EndValueTag({ x, y, value, index, color, total }: any) {
  if (index == null || index !== total - 1 || value == null) return null
  return (
    <g>
      <circle cx={x} cy={y} r={3.5} fill={color} stroke={C.surface} strokeWidth={2} />
      <text x={x} y={y} dx={9} dy={3.6} fontFamily={font} fontSize={11} fontWeight={500} fill={C.ink} textAnchor="start">
        {fmtCurrencyShort(Number(value), 'BRL')}
      </text>
    </g>
  )
}

// Tooltip com decomposição por natureza — lista, por direção, "X de <natureza>".
// Usa `pagarBy`/`receberBy` que vêm anexados a cada ponto por monthlyDirDetailed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BreakdownTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  // Dois pontos por mês (pagar/receber) — os dois compartilham o mesmo payload
  // subjacente, então pegamos o primeiro só para os breakdowns.
  const raw = payload[0]?.payload as MonthRow | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seriesColor = (dk: string) => payload.find((p: any) => p.dataKey === dk)?.color ?? C.ink
  const section = (title: string, total: number, by: Record<string, number> | undefined, color: string) => {
    const rows = Object.entries(by ?? {}).sort((a, b) => b[1] - a[1]).filter(([, v]) => v > 0)
    return (
      <div style={{ marginTop: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
          <span className="eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 'var(--radius-circle)', background: color, flex: 'none' }} />
            {title}
          </span>
          <strong style={{ fontFamily: display, fontSize: 'var(--text-body-size)', fontWeight: 500, color: 'var(--text-primary)' }}>{fmtCurrencyShort(total, 'BRL')}</strong>
        </div>
        {rows.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {rows.map(([nat, v]) => (
              <div key={nat} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nat}</span>
                <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{fmtCurrencyShort(v, 'BRL')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }
  return (
    <div style={{ ...TIP, minWidth: 240, maxWidth: 320 }}>
      <div style={{ color: 'var(--text-secondary)', marginBottom: 4, fontSize: 12 }}>{label}</div>
      {raw && section('A pagar', raw.pagar, raw.pagarBy, seriesColor('pagar'))}
      {raw && <div style={{ height: 1, background: 'var(--border-subtle)', margin: '8px 0 0' }} />}
      {raw && section('A receber', raw.receber, raw.receberBy, seriesColor('receber'))}
    </div>
  )
}

// Tooltip em BRL para line/bar charts (InsightCallout do DS).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function MoneyTip({ active, payload, label, leadKey }: any) {
  if (!active || !payload?.length) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lead = leadKey ? payload.find((p: any) => p.dataKey === leadKey) : null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = payload.filter((p: any) => !leadKey || p.dataKey !== leadKey)
  return (
    <div style={{ ...TIP, minWidth: 158 }}>
      <div style={{ color: 'var(--text-secondary)', marginBottom: 6, fontSize: 12 }}>{label}</div>
      {lead && (
        <div style={{ marginBottom: rows.length ? 8 : 0, paddingBottom: rows.length ? 8 : 0, borderBottom: rows.length ? '1px solid var(--border-subtle)' : 'none' }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>{lead.name}</div>
          <div style={{ fontFamily: display, fontSize: 'var(--text-subtitle-size)', fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>{fmtCurrencyShort(Number(lead.value), 'BRL')}</div>
        </div>
      )}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {rows.map((p: any) => (
        <div key={p.dataKey} style={{ display: 'flex', gap: 16, justifyContent: 'space-between', alignItems: 'center', padding: '2px 0' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
            <span style={{ width: 8, height: 8, borderRadius: 'var(--radius-circle)', background: p.color, flex: 'none' }} />
            {p.name}
          </span>
          <strong style={{ fontWeight: 500 }}>{fmtCurrencyShort(Number(p.value), 'BRL')}</strong>
        </div>
      ))}
    </div>
  )
}

// Tooltip da pizza — mostra faixa + valor + %.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PieTip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  const pct = typeof p.percent === 'number' ? p.percent * 100 : 0
  const byNat: Record<string, number> | undefined = p.payload?.byNat
  const rows = byNat ? Object.entries(byNat).sort((a, b) => b[1] - a[1]).filter(([, v]) => v > 0) : []
  return (
    <div style={{ ...TIP, minWidth: 220, maxWidth: 300 }}>
      <div className="eyebrow" style={{ marginBottom: 4 }}>{p.name}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <div style={{ fontFamily: display, fontSize: 'var(--text-subtitle-size)', fontWeight: 500 }}>{fmtCurrencyShort(Number(p.value), 'BRL')}</div>
        {pct > 0 && <div style={{ color: 'var(--text-secondary)' }}>{pct.toFixed(1)}%</div>}
      </div>
      {rows.length > 0 && (
        <>
          <div style={{ height: 1, background: 'var(--border-subtle)', margin: '8px 0' }} />
          <div className="eyebrow" style={{ marginBottom: 4 }}>Por natureza</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {rows.map(([nat, v]) => (
              <div key={nat} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nat}</span>
                <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{fmtCurrencyShort(v, 'BRL')}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

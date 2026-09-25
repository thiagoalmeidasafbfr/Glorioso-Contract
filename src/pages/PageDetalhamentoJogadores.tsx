// src/pages/PageDetalhamentoJogadores.tsx
// DETALHAMENTO DE JOGADORES — o elenco jogador a jogador: remuneração, custo
// anual que cada um representa para o clube e o valor que ainda está no
// balanço. Por padrão, ordenado pelo salário mensal.
//
// Uma linha por jogador (a comissão técnica fica de fora):
//   • Salário mensal / anual: remuneração vigente do vínculo de trabalho
//     (CLT + imagem, com gatilhos e rateio de empréstimo já aplicados) e
//     mensal × 12;
//   • Custo anual do clube: CLT × 12 × (1 + encargos) + (imagem + outros) × 12
//     + amortização dos próximos 12 meses. Encargos das premissas do atleta ou,
//     sem premissa, o padrão (INSS, FGTS, 13º e férias);
//   • Amortização e valor contábil: lib/intangible — a mesma conta da
//     calculadora de amortização;
//   • Fim do contrato: término do vínculo de trabalho e anos restantes.
// Os valores são calculados em BRL (PTAX do dia) e exibidos na moeda do topo.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchAthletes, fetchAllContracts, fetchAllClauses, fetchAllSalaryTriggers, fetchClubs,
} from '../lib/athleteQueries'
import { fetchPremissas } from '../lib/premissasQueries'
import { fetchPtaxRates, ptaxRateFor } from '../lib/ptax'
import { computeIntangible } from '../lib/intangible'
import { effectiveRemuneration, employmentContract } from '../lib/salary'
import { calcAge, foldText, todayISO } from '../lib/format'
import { isForeign } from '../lib/nationality'
import { isBFRparty } from '../lib/entityObligations'
import { badgeStyle } from '../lib/tones'
import { exportWorkbook, type ColDef } from '../lib/xlsx-utils'
import { ENCARGOS_DEFAULT, type PremissaAtleta } from '../types/premissas'
import { HOLDER_TYPE_LABELS } from '../types/athlete-system'
import type { Athlete, Clause, Club, Contract, SalaryTrigger } from '../types/athlete-system'
import { useApp } from '../context/AppContext'
import PageHero from '../components/PageHero'
import KpiPill from '../components/KpiPill'
import AthleteAvatar from '../components/AthleteAvatar'
import Flag from '../components/Flag'
import { Icon } from '../components/Icon'
import { tr, trf, locale, trn, trCols } from '../i18n'

const HOME_CLUB = HOLDER_TYPE_LABELS.BFR

// ── Posição: agrupada como na referência (4 linhas do campo) ───────────────
type PosGroup = 'GOL' | 'DEF' | 'MEI' | 'ATA'
const POS_GROUPS: PosGroup[] = ['GOL', 'DEF', 'MEI', 'ATA']
const POS_LABEL: Record<PosGroup, string> = {
  GOL: 'Goleiro', DEF: 'Defensor', MEI: 'Meio-campista', ATA: 'Atacante',
}
// Testados palavra a palavra, nesta ordem: "Meia-atacante" é meio-campista.
const POS_WORDS: Record<PosGroup, RegExp> = {
  GOL: /^(goleir|gol$|goalkeeper|gk$)/,
  DEF: /^(zag|lateral|defens|defender|ala$|libero|back$)/,
  MEI: /^(volante|meia|meio|medio|midfielder|armador)/,
  ATA: /^(atacante|ponta|centroavante|avante|extremo|forward|striker|winger)/,
}
function positionGroup(position: string | null): PosGroup | null {
  const words = foldText(position ?? '').split(' ').filter(Boolean)
  return POS_GROUPS.find(g => words.some(w => POS_WORDS[g].test(w))) ?? null
}

// ── Encargos sobre o CLT (fração: 0,4744 = 47,44%) ─────────────────────────
function encargosOf(p: PremissaAtleta | undefined): number {
  const e = p ?? ENCARGOS_DEFAULT
  return (e.inss_patronal_pct ?? 0) + (e.fgts_pct ?? 0) + (e.decimo_terceiro_pct ?? 0)
    + (e.ferias_pct ?? 0) + (e.outros_encargos_pct ?? 0)
}
const DEFAULT_ENCARGOS = encargosOf(undefined)

// ── Modelo da linha ────────────────────────────────────────────────────────
interface ClubRef { name: string; logo: string | null; id: string | null }

interface Row {
  athlete: Athlete
  name: string
  foreign: boolean | null
  club: ClubRef | null
  /** OUT = emprestado pelo Botafogo · IN = emprestado ao Botafogo. */
  loan: { dir: 'OUT' | 'IN'; other: string | null } | null
  pos: PosGroup | null
  age: number | null
  monthlyBRL: number | null
  annualBRL: number | null
  clubCostBRL: number | null
  amortBRL: number
  bookBRL: number
  contractEnd: string | null
}

const byStartDesc = (x: Contract, y: Contract) => (y.start_date ?? '').localeCompare(x.start_date ?? '')

function groupByAthlete<T extends { athlete_id: string }>(items: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const it of items) {
    const arr = m.get(it.athlete_id)
    if (arr) arr.push(it)
    else m.set(it.athlete_id, [it])
  }
  return m
}

function buildRows(
  athletes: Athlete[], contracts: Contract[], clauses: Clause[], triggers: SalaryTrigger[],
  clubs: Club[], premissas: PremissaAtleta[], ptax: Record<string, number>,
): Row[] {
  const today = new Date()
  const asOf = todayISO()
  const contractsOf = groupByAthlete(contracts)
  const triggersOf = groupByAthlete(triggers)
  const premissaOf = new Map(premissas.filter(p => p.atleta_id).map(p => [p.atleta_id as string, p]))

  const clubByName = new Map(clubs.map(c => [foldText(c.name), c]))
  const homeClub = clubs.find(c => isBFRparty(c.name)) ?? null
  const clubRef = (name: string | null | undefined): ClubRef | null => {
    if (!name?.trim()) return null
    const c = isBFRparty(name) ? homeClub : clubByName.get(foldText(name)) ?? null
    return { name: c?.name ?? name.trim(), logo: c?.logo_url ?? null, id: c?.id ?? null }
  }

  return athletes
    .filter(a => a.category !== 'COMISSAO_TECNICA')
    .map(a => {
      const cs = contractsOf.get(a.id) ?? []
      const emp = employmentContract(cs)

      // Onde joga hoje
      let club: ClubRef | null = null
      let loan: Row['loan'] = null
      if (a.current_status === 'EMPRESTADO') {
        const loans = cs.filter(c => c.type === 'EMPRESTIMO_SAIDA').sort(byStartDesc)
        const l = loans.find(c => c.status === 'ATIVO') ?? loans[0]
        club = clubRef(l?.counterpart_club)
        loan = { dir: 'OUT', other: HOME_CLUB }
      } else if (a.current_status === 'VENDIDO') {
        club = clubRef(cs.filter(c => c.type === 'SAIDA').sort(byStartDesc)[0]?.counterpart_club)
      } else if (a.current_status === 'ATIVO') {
        club = clubRef(HOME_CLUB)
        if (emp?.type === 'EMPRESTIMO_ENTRADA') loan = { dir: 'IN', other: emp.counterpart_club || null }
      }

      // Remuneração vigente (só com vínculo de trabalho ativo)
      let monthlyBRL: number | null = null
      let annualBRL: number | null = null
      let clubCostBRL: number | null = null
      const intangible = computeIntangible(a.id, cs, clauses, ptax, today)
      const amortBRL = intangible.monthlyAmortBRL * Math.min(12, intangible.monthsRemaining)
      if (emp && emp.status === 'ATIVO') {
        const rem = effectiveRemuneration(emp, triggersOf.get(a.id) ?? [], asOf)
        const rate = ptaxRateFor(rem.currency, ptax)
        const cltBRL = rem.salary * rate
        const imageBRL = rem.image * rate
        const otherBRL = (emp.other_value ?? 0) * ptaxRateFor(emp.salary_currency, ptax)
        const monthly = cltBRL + imageBRL
        if (monthly > 0) {
          monthlyBRL = monthly
          annualBRL = monthly * 12
          const encargos = encargosOf(premissaOf.get(a.id))
          clubCostBRL = cltBRL * 12 * (1 + encargos) + (imageBRL + otherBRL) * 12 + amortBRL
        }
      }

      return {
        athlete: a,
        name: (a.short_name || a.full_name).trim(),
        foreign: isForeign(a.nationality),
        club, loan,
        pos: positionGroup(a.position),
        age: calcAge(a.birth_date),
        monthlyBRL, annualBRL, clubCostBRL,
        amortBRL, bookBRL: intangible.residualBRL,
        contractEnd: emp?.end_date ?? null,
      }
    })
}

// ── Ordenação ──────────────────────────────────────────────────────────────
type SortKey = 'name' | 'club' | 'pos' | 'age' | 'status' | 'monthly' | 'annual' | 'cost' | 'amort' | 'book' | 'end'
type SortDir = 'asc' | 'desc'
interface Sort { key: SortKey; dir: SortDir }

const SORT_VALUE: Record<SortKey, (r: Row) => number | string | null> = {
  name: r => r.name,
  club: r => r.club?.name ?? null,
  pos: r => r.pos ? POS_GROUPS.indexOf(r.pos) : null,
  age: r => r.age,
  status: r => r.foreign == null ? null : Number(r.foreign),
  monthly: r => r.monthlyBRL,
  annual: r => r.annualBRL,
  cost: r => r.clubCostBRL,
  amort: r => r.amortBRL,
  book: r => r.bookBRL,
  end: r => r.contractEnd,
}
// Primeiro clique: texto, idade e fim do contrato em ordem crescente; valores do maior para o menor.
const FIRST_DIR: Record<SortKey, SortDir> = {
  name: 'asc', club: 'asc', pos: 'asc', age: 'asc', status: 'asc', end: 'asc',
  monthly: 'desc', annual: 'desc', cost: 'desc', amort: 'desc', book: 'desc',
}

function compareRows(a: Row, b: Row, { key, dir }: Sort): number {
  const va = SORT_VALUE[key](a), vb = SORT_VALUE[key](b)
  // Sem valor vai sempre para o fim, nos dois sentidos.
  if (va == null || vb == null) {
    if (va != null) return -1
    if (vb != null) return 1
  } else {
    const c = typeof va === 'string' ? va.localeCompare(vb as string, 'pt-BR') : va - (vb as number)
    if (c !== 0) return dir === 'asc' ? c : -c
  }
  // Desempate: salário mensal (maior primeiro), depois o nome.
  return (b.monthlyBRL ?? -1) - (a.monthlyBRL ?? -1) || a.name.localeCompare(b.name, 'pt-BR')
}

// ── Filtros ────────────────────────────────────────────────────────────────
type Situacao = 'ELENCO' | 'ATIVO' | 'EMPRESTADO' | 'TODOS'
const SITUACAO_LABEL: Record<Situacao, string> = {
  ELENCO: 'Elenco (no clube + emprestados)', ATIVO: 'No clube', EMPRESTADO: 'Emprestados', TODOS: 'Todos',
}
function matchesSituacao(a: Athlete, s: Situacao): boolean {
  if (s === 'TODOS') return true
  if (s === 'ELENCO') return a.current_status === 'ATIVO' || a.current_status === 'EMPRESTADO'
  return a.current_status === s
}

// ── Formatação ─────────────────────────────────────────────────────────────
/** Valor compacto na moeda do topo: "R$ 515k", "R$ 26,8M", "R$ 0". */
function compactMoney(v: number, sym: string): string {
  const abs = Math.abs(v)
  if (abs >= 999_500) return `${sym} ${(v / 1e6).toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`
  if (abs >= 999.5) return `${sym} ${Math.round(v / 1e3).toLocaleString(locale())}k`
  return `${sym} ${Math.round(v).toLocaleString(locale())}`
}

function splitName(name: string): [string, string] {
  const [first = '', ...rest] = name.split(/\s+/)
  return [first, rest.join(' ')]
}

/** "7 anos restantes" · "1 ano restante" (atenção) · "expirando" / "vencido" (vermelho). */
function contractLeft(endISO: string): { label: string; color: string } {
  const diff = Number(endISO.slice(0, 4)) - new Date().getFullYear()
  if (endISO < todayISO()) return { label: tr('vencido'), color: 'var(--text-negative)' }
  if (diff <= 0) return { label: tr('expirando'), color: 'var(--text-negative)' }
  return { label: trn(diff, '{0} ano restante', '{0} anos restantes'), color: diff === 1 ? 'var(--text-warning)' : 'var(--text-secondary)' }
}

// ── Células ────────────────────────────────────────────────────────────────
function ClubCrest({ club }: { club: ClubRef }) {
  return (
    <span aria-hidden="true" style={{
      width: 20, height: 20, flex: 'none', borderRadius: 'var(--radius-xs)', overflow: 'hidden',
      background: 'var(--surface-sunken)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 9, fontWeight: 500, color: 'var(--gray-700)',
    }}>
      {club.logo
        ? <img src={club.logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        : club.name.slice(0, 2).toUpperCase()}
    </span>
  )
}

function SortTh({ k, label, sort, onSort, align = 'left', info, title, minWidth }: {
  k: SortKey; label: string; sort: Sort; onSort: (k: SortKey) => void
  align?: 'left' | 'center' | 'right'; info?: boolean; title?: string; minWidth?: number
}) {
  const active = sort.key === k
  return (
    <th aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
      style={{ textAlign: align, whiteSpace: 'normal', verticalAlign: 'middle', minWidth }}>
      <button type="button" className="th-sort" onClick={() => onSort(k)} title={tr(title)}>
        <span>{tr(label)}</span>
        {info && <Icon name="info" size={12} />}
        {active && <Icon name={sort.dir === 'asc' ? 'chevronUp' : 'chevronDown'} size={12} />}
      </button>
    </th>
  )
}

const fieldLabel: React.CSSProperties = { display: 'block', marginBottom: 'var(--space-1)' }

// ── Página ─────────────────────────────────────────────────────────────────
export default function PageDetalhamentoJogadores() {
  const { fromBRL, symbol } = useApp()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [pos, setPos] = useState<PosGroup | ''>('')
  const [situacao, setSituacao] = useState<Situacao>('ELENCO')
  const [sort, setSort] = useState<Sort>({ key: 'monthly', dir: 'desc' })

  const load = useCallback(async () => {
    setLoading(true)
    const rates = await fetchPtaxRates().catch(() => ({} as Record<string, number>))
    const [athletes, contracts, clauses, triggers, clubs, premissas] = await Promise.all([
      fetchAthletes(), fetchAllContracts(), fetchAllClauses(), fetchAllSalaryTriggers(),
      fetchClubs().catch(() => [] as Club[]),
      fetchPremissas().catch(() => [] as PremissaAtleta[]),
    ])
    setRows(buildRows(athletes, contracts, clauses, triggers, clubs, premissas, rates))
    setLoading(false)
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial no mount
  useEffect(() => { load() }, [load])

  const visible = useMemo(() => {
    const q = foldText(search)
    return rows
      .filter(r => matchesSituacao(r.athlete, situacao))
      .filter(r => !pos || r.pos === pos)
      .filter(r => !q || foldText(`${r.name} ${r.athlete.full_name} ${r.club?.name ?? ''}`).includes(q))
      .sort((a, b) => compareRows(a, b, sort))
  }, [rows, situacao, pos, search, sort])

  const totals = useMemo(() => visible.reduce((t, r) => ({
    monthly: t.monthly + (r.monthlyBRL ?? 0),
    cost: t.cost + (r.clubCostBRL ?? 0),
    book: t.book + r.bookBRL,
  }), { monthly: 0, cost: 0, book: 0 }), [visible])
  const maxMonthly = useMemo(() => Math.max(0, ...visible.map(r => r.monthlyBRL ?? 0)), [visible])

  const money = (brl: number | null) => brl == null ? '—' : compactMoney(fromBRL(brl), symbol)
  const onSort = (k: SortKey) => setSort(s => s.key === k
    ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' }
    : { key: k, dir: FIRST_DIR[k] })

  function exportXlsx() {
    const cols: ColDef[] = [
      { key: 'rank', header: '#' }, { key: 'jogador', header: 'Jogador' }, { key: 'nome', header: 'Nome completo' },
      { key: 'nacionalidade', header: 'Nacionalidade' }, { key: 'clube', header: 'Clube' },
      { key: 'posicao', header: 'Posição' }, { key: 'idade', header: 'Idade' }, { key: 'status', header: 'Status CBF' },
      { key: 'mensal', header: 'Salário mensal (BRL)' }, { key: 'anual', header: 'Salário anual (BRL)' },
      { key: 'custo', header: 'Custo anual do clube (BRL)' }, { key: 'amort', header: 'Amortização 12 meses (BRL)' },
      { key: 'contabil', header: 'Valor contábil (BRL)' }, { key: 'fim', header: 'Fim do contrato' },
    ]
    const r2 = (v: number | null) => v == null ? '' : Math.round(v * 100) / 100
    exportWorkbook([{
      name: tr('Detalhamento de jogadores'), cols: trCols(cols),
      rows: visible.map((r, i) => ({
        rank: i + 1, jogador: r.name, nome: r.athlete.full_name, nacionalidade: r.athlete.nationality ?? '',
        clube: r.club?.name ?? '', posicao: r.athlete.position ?? '', idade: r.age ?? '',
        status: r.foreign == null ? '' : r.foreign ? 'Estrangeiro' : 'Nacional',
        mensal: r2(r.monthlyBRL), anual: r2(r.annualBRL), custo: r2(r.clubCostBRL),
        amort: r2(r.amortBRL), contabil: r2(r.bookBRL), fim: r.contractEnd ?? '',
      })),
    }], 'detalhamento-jogadores.xlsx')
  }

  const pct = (v: number) => `${(v * 100).toLocaleString(locale(), { maximumFractionDigits: 1 })}%`
  const COLS = 12

  return (
    <div style={{ padding: '24px 28px 32px', width: '100%', boxSizing: 'border-box' }}>
      <PageHero title={tr('Detalhamento de jogadores')} section={tr('Relatórios')}
        caption={tr('Remuneração do elenco, custo anual para o clube e valor contábil de cada jogador')}>
        <button type="button" onClick={exportXlsx} className="btn btn-outline" disabled={loading || !visible.length}>
          <Icon name="download" size={16} /> {tr('Exportar')}
        </button>
      </PageHero>

      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-end', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
        <label style={{ flex: 1, minWidth: 220 }}>
          <span className="eyebrow" style={fieldLabel}>{tr('Busca')}</span>
          <input type="search" value={search} onChange={e => setSearch(e.target.value)}
            placeholder={tr('Jogador ou clube…')} style={{ width: '100%' }} />
        </label>
        <label>
          <span className="eyebrow" style={fieldLabel}>{tr('Posição')}</span>
          <select value={pos} onChange={e => setPos(e.target.value as PosGroup | '')}>
            <option value="">{tr('Todas')}</option>
            {POS_GROUPS.map(g => <option key={g} value={g}>{tr(POS_LABEL[g])}</option>)}
          </select>
        </label>
        <label>
          <span className="eyebrow" style={fieldLabel}>{tr('Situação')}</span>
          <select value={situacao} onChange={e => setSituacao(e.target.value as Situacao)}>
            {(Object.keys(SITUACAO_LABEL) as Situacao[]).map(s => <option key={s} value={s}>{tr(SITUACAO_LABEL[s])}</option>)}
          </select>
        </label>
        <div className="kpi-group">
          <KpiPill label={tr('Folha mensal')} value={money(totals.monthly)} />
          <KpiPill label={tr('Custo anual do clube')} value={money(totals.cost)} />
          <KpiPill label={tr('Valor contábil')} value={money(totals.book)} />
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 250px)' }}>
          <table className="table-dense">
            <thead>
              <tr>
                <th style={{ width: 28, verticalAlign: 'middle' }}>#</th>
                <SortTh k="name" label={tr('Jogador')} sort={sort} onSort={onSort} />
                <SortTh k="club" label={tr('Clube')} sort={sort} onSort={onSort} />
                <SortTh k="pos" label={tr('Posição')} sort={sort} onSort={onSort} />
                <SortTh k="age" label={tr('Idade')} sort={sort} onSort={onSort} align="center" />
                <SortTh k="status" label={tr('Status CBF')} sort={sort} onSort={onSort}
                  title={tr('Estrangeiros ocupam vaga no limite de estrangeiros da CBF')} />
                <SortTh k="monthly" label={tr('Salário mensal')} sort={sort} onSort={onSort} align="center" info
                  title={tr('Remuneração mensal vigente (CLT + imagem)')} />
                <SortTh k="annual" label={tr('Salário anual')} sort={sort} onSort={onSort} align="right" info
                  title={tr('Remuneração mensal vigente (CLT + imagem) × 12')} />
                <SortTh k="cost" label={tr('Custo anual do clube')} sort={sort} onSort={onSort} align="right"
                  title={tr('CLT × 12 × (1 + encargos) + (imagem + outros) × 12 + amortização dos próximos 12 meses')} />
                <SortTh k="amort" label={tr('Amortização')} sort={sort} onSort={onSort} align="right"
                  title={tr('Amortização do intangível nos próximos 12 meses')} />
                <SortTh k="book" label={tr('Valor contábil')} sort={sort} onSort={onSort} align="right"
                  title={tr('Intangível ainda não amortizado (saldo no balanço)')} />
                <SortTh k="end" label={tr('Fim do contrato')} sort={sort} onSort={onSort} align="right"
                  title={tr('Término do vínculo de trabalho')} />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={COLS} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 40 }}>{tr('Carregando PTAX e cadastros…')}</td></tr>
              )}
              {!loading && visible.length === 0 && (
                <tr><td colSpan={COLS} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 40 }}>{tr('Nenhum jogador encontrado.')}</td></tr>
              )}
              {!loading && visible.map((r, i) => {
                const [first, rest] = splitName(r.name)
                const left = r.contractEnd ? contractLeft(r.contractEnd) : null
                const loanTitle = r.loan?.dir === 'OUT'
                  ? (r.club ? trf('Emprestado pelo {0} ao {1}', HOME_CLUB, r.club.name) : trf('Emprestado pelo {0}', HOME_CLUB))
                  : r.loan?.dir === 'IN' ? (r.loan.other ? trf('Emprestado ao {0} pelo {1}', HOME_CLUB, r.loan.other) : trf('Emprestado ao {0}', HOME_CLUB)) : undefined
                return (
                  <tr key={r.athlete.id}>
                    <td style={{ color: 'var(--text-secondary)' }}>{i + 1}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                        <span style={{ position: 'relative', flex: 'none', display: 'block' }}>
                          <AthleteAvatar athlete={r.athlete} size={32} />
                          <Flag nationality={r.athlete.nationality} size={12} round
                            style={{ position: 'absolute', right: -4, bottom: -4, boxShadow: '0 0 0 2px var(--surface-card)' }} />
                        </span>
                        <Link to={`/atletas/${r.athlete.id}`} title={trf('Abrir {0}', r.athlete.full_name)}
                          style={{ fontSize: 'var(--ui-text-size)', fontWeight: 500, lineHeight: 1.25 }}>
                          {tr(first)}{rest && <><br />{tr(rest)}</>}
                        </Link>
                      </div>
                    </td>
                    <td title={tr(loanTitle)}>
                      {r.club ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          <ClubCrest club={r.club} />
                          <div style={{ minWidth: 0, lineHeight: 1.25 }}>
                            {r.club.id
                              ? <Link to={`/clubes/${r.club.id}`}>{r.club.name}</Link>
                              : <span>{r.club.name}</span>}
                            {r.loan && <div style={{ fontSize: 'var(--text-caption-size)', color: 'var(--text-secondary)' }}>{tr('empréstimo')}</div>}
                          </div>
                        </div>
                      ) : <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                    </td>
                    <td>
                      {r.pos
                        ? <span style={badgeStyle('neutral')} title={tr(r.athlete.position) ?? undefined}>{tr(POS_LABEL[r.pos])}</span>
                        : <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                    </td>
                    <td style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>{r.age ?? '—'}</td>
                    <td>
                      {r.foreign == null
                        ? <span style={{ color: 'var(--text-secondary)' }}>—</span>
                        : <span style={badgeStyle(r.foreign ? 'outline' : 'accent')}>{r.foreign ? tr('Estrangeiro') : tr('Nacional')}</span>}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {r.monthlyBRL == null ? <span style={{ color: 'var(--text-secondary)' }}>—</span> : (
                        <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                          <span style={{ fontSize: 'var(--ui-text-size)', fontWeight: 500, whiteSpace: 'nowrap' }}>{money(r.monthlyBRL)}</span>
                          <span aria-hidden="true" style={{
                            width: maxMonthly > 0 ? Math.max(4, Math.round(56 * r.monthlyBRL / maxMonthly)) : 4, height: 3,
                            borderRadius: 'var(--radius-pill)', background: 'var(--chart-1)',
                          }} />
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{money(r.annualBRL)}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{money(r.clubCostBRL)}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{money(r.amortBRL)}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{money(r.bookBRL)}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {r.contractEnd && left ? (
                        <>
                          <div>{r.contractEnd.slice(0, 4)}</div>
                          <div style={{ fontSize: 'var(--text-caption-size)', color: left.color }}>{tr(left.label)}</div>
                        </>
                      ) : <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p style={{ margin: 'var(--space-3) 0 0', fontSize: 'var(--text-caption-size)', lineHeight: 1.6, color: 'var(--text-secondary)', maxWidth: 980 }}>
        {trn(visible.length, '{0} jogador', '{0} jogadores')} {tr('· Salário = remuneração mensal vigente do vínculo de trabalho (CLT + imagem, com gatilhos e rateio de empréstimo aplicados); anual = mensal × 12. Custo anual do clube = CLT × 12 × (1 + encargos) + (imagem + outros) × 12 + amortização dos próximos 12 meses; encargos das premissas do atleta ou, sem premissa,')} {pct(DEFAULT_ENCARGOS)} {tr('(INSS, FGTS, 13º e férias). Amortização linear do intangível (transfer fee, intermediação e luvas do contrato de entrada) pelo prazo do contrato; valor contábil = intangível − amortização acumulada. Moedas estrangeiras pela PTAX do dia.')}
      </p>
    </div>
  )
}

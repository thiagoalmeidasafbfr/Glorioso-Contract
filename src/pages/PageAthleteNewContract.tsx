// src/pages/PageAthleteNewContract.tsx
// Cadastro de um VÍNCULO (contrato) do atleta em 3 passos. Tudo o que gera
// dinheiro pode ter o FLUXO DE PARCELAS definido AQUI — transferência, comissão
// de agente e cada cláusula — sem precisar salvar e voltar depois para lançar os
// vencimentos um a um.
//
//   1 · Vínculo    → tipo, contraparte, datas, transferência (com parcelas),
//                    remuneração mensal (fluxo automático) e agentes (com parcelas)
//   2 · Cláusulas  → cláusulas extras, cada uma com fluxo de parcelas opcional
//   3 · Revisão    → o que será criado, incluindo cada fluxo

import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { fetchAthlete, fetchAthleteContracts, createContract, createClause, createClauseInstallments } from '../lib/athleteQueries'
import type { Athlete, Contract, NewContractInput, NewClauseInput, ContractType, ContractStatus, ClauseType, Currency, LiabilityDirection, SellOnBasis } from '../types/athlete-system'
import { CLAUSE_TYPE_LABELS, CONTRACT_TYPE_LABELS, TRANSFER_CONTRACT_TYPES, ACCESSORY_CONTRACT_TYPES, isTransferContractType, SELL_ON_CLAUSE_TYPES, SELLON_BASIS_LABELS, sellOnConditionText } from '../types/athlete-system'
import { todayISO, monthsBetween, addMonths, fmtCurrencyShort } from '../lib/format'
import EntityPicker from '../components/EntityPicker'
import NumberInput from '../components/NumberInput'
import PageHero from '../components/PageHero'
import FlowBuilder, { type FlowLine } from '../components/FlowBuilder'
import { Icon, IconButton } from '../components/Icon'

// ── Step types ────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3

// ── Helpers ───────────────────────────────────────────────────────────────

const CURRENCIES: Currency[] = ['BRL', 'EUR', 'USD', 'GBP']
const CLAUSE_TYPES = Object.keys(CLAUSE_TYPE_LABELS) as ClauseType[]

// Vencimentos do fluxo mensal de remuneração (mês subsequente à competência).
const SALARY_DUE_DAY = 5   // Salário CLT vence dia 5
const IMAGE_DUE_DAY = 20   // Direito de imagem vence dia 20

type TransferPeriod = 'MENSAL' | 'SEMESTRAL' | 'ANUAL'
const PERIOD_STEP: Record<TransferPeriod, number> = { MENSAL: 1, SEMESTRAL: 6, ANUAL: 12 }
const PERIOD_LABEL: Record<TransferPeriod, string> = { MENSAL: 'Mensal', SEMESTRAL: 'Semestral', ANUAL: 'Anual' }

// Vencimento da competência (start + i meses): dia `day` do MÊS SUBSEQUENTE.
function dueDayOf(startISO: string, i: number, day: number): string {
  const d = new Date(startISO + 'T12:00:00Z')
  d.setUTCMonth(d.getUTCMonth() + i + 1)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}-${String(day).padStart(2, '0')}`
}

function fmtNum(v: number): string { return v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) }
function fmtDateBR(iso: string): string { if (!iso) return '—'; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}` }

// Rótulo curto de um contrato para o seletor de "contrato relacionado".
function contractLabel(c: Contract): string {
  const parts = [CONTRACT_TYPE_LABELS[c.type], c.counterpart_club || '—']
  if (c.start_date) parts.push(fmtDateBR(c.start_date))
  return parts.join(' · ')
}

const PAYABLE_CLAUSES: ClauseType[] = [
  'SELL_ON_FEE', 'INTERMEDIACAO', 'INTERMEDIACAO_VENDA_FUTURA',
  'SALARIO_CETD', 'DIREITO_IMAGEM', 'LUVAS', 'BONUS_PERFORMANCE_ATLETA',
  'SOLIDARIEDADE_FIFA', 'EMPRESTIMO_TAXA', 'CLAUSULA_RESCISORIA',
]

interface ClauseRow extends Partial<NewClauseInput> {
  lines: FlowLine[]
  flowOpen: boolean
}
interface AgentRow {
  name: string; amount: string; currency: Currency; direction: LiabilityDirection
  lines: FlowLine[]; flowOpen: boolean
  // Comissão sobre a próxima venda deste atleta (ex.: 10% do valor da venda
  // futura para o agente que intermediou a compra). Análogo ao Sell-On do clube.
  futureSale: boolean
  futurePct: string
  futureBasis: SellOnBasis
}

function isSellOnConflict(clauses: ClauseRow[]): boolean {
  const hasSellOnPay = clauses.some(c => c.clause_type === 'SELL_ON_FEE')
  const hasSellOnReceive = clauses.some(c => c.clause_type === 'SELL_ON_FEE_RECEBER')
  return hasSellOnPay && hasSellOnReceive
}

const validLines = (lines: FlowLine[]) => lines
  .filter(l => l.due_date && l.value > 0)
  .sort((a, b) => a.due_date.localeCompare(b.due_date))

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--cream-card)',
  border: '1px solid var(--input-border)', borderRadius: 7,
  padding: '8px 10px', fontSize: 13, color: 'var(--ink-primary)',
  fontFamily: "var(--font-body)", boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  fontFamily: "var(--font-label)", fontSize: 9,
  fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' as const,
  color: 'var(--text-muted)', display: 'block', marginBottom: 4,
}

const cardStyle: React.CSSProperties = {
  background: 'var(--cream-card)', border: '1px solid var(--divider)',
  borderRadius: 12, padding: 20, boxShadow: 'var(--shadow-hair)',
}

const sectionTitle: React.CSSProperties = {
  fontFamily: "var(--font-label)", fontSize: 11, fontWeight: 800,
  letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-primary)',
}

const hintStyle: React.CSSProperties = {
  fontFamily: "var(--font-body)", fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5,
}

const noteBox: React.CSSProperties = {
  padding: '9px 13px', borderRadius: 8, background: 'var(--bg-subtle)',
  border: '1px solid var(--divider)', fontFamily: "var(--font-label)",
  fontSize: 11, color: 'var(--ink-secondary)',
}

// ── Main component ────────────────────────────────────────────────────────

export default function PageAthleteNewContract() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [athlete, setAthlete] = useState<Athlete | null>(null)
  const [step, setStep] = useState<Step>(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Contratos existentes do atleta + o contrato relacionado escolhido (opcional).
  // ?rel=<id> pré-seleciona o vínculo; ?tipo= define o tipo; ?agente=/?clube=
  // pré-carregam a contraparte (atalhos das páginas de agente e de clube).
  const initialRel = searchParams.get('rel') ?? ''
  const initialTipoParam = searchParams.get('tipo')
  const initialTipo: ContractType | null = initialTipoParam && initialTipoParam in CONTRACT_TYPE_LABELS ? initialTipoParam as ContractType : null
  const initialAgente = searchParams.get('agente') ?? ''
  const initialClube = searchParams.get('clube') ?? ''
  const [existingContracts, setExistingContracts] = useState<Contract[]>([])
  const [relatedId, setRelatedId] = useState<string>(initialRel)
  const relatedContract = existingContracts.find(c => c.id === relatedId) ?? null

  // Step 1 — Contract
  const [contract, setContract] = useState<NewContractInput>({
    type: initialTipo ?? (initialRel ? 'INTERMEDIACAO' : 'SAIDA'),
    counterpart_club: initialClube,
    counterpart_country: '',
    start_date: todayISO(),
    end_date: '',
    transfer_fee_gross: null,
    transfer_currency: 'EUR',
    base_salary: null,
    salary_currency: 'BRL',
    image_value: null,
    other_value: null,
    description: '',
    status: 'ATIVO',
    trigger_cap_amount: null,
    trigger_cap_currency: null,
    trigger_cap_notes: null,
  })
  // Toggle do teto de gatilhos — o valor real fica em contract.trigger_cap_*.
  const [capOpen, setCapOpen] = useState(false)

  // Agentes desta transação (um vínculo pode ter vários, com valores distintos).
  const emptyAgent: AgentRow = { name: '', amount: '', currency: 'EUR', direction: 'A_PAGAR', lines: [], flowOpen: false, futureSale: false, futurePct: '', futureBasis: 'MAIS_VALIA' }
  const [agents, setAgents] = useState<AgentRow[]>(initialAgente ? [{ ...emptyAgent, name: initialAgente }] : [])
  const addAgent = () => setAgents(prev => [...prev, { ...emptyAgent }])
  const removeAgent = (i: number) => setAgents(prev => prev.filter((_, idx) => idx !== i))
  const setAgent = (i: number, patch: Partial<AgentRow>) => setAgents(prev => prev.map((a, idx) => idx === i ? { ...a, ...patch } : a))

  // Step 2 — Clauses
  const [clauses, setClauses] = useState<ClauseRow[]>([])

  // Compra / transferência em parcelas — cronograma editável linha por linha.
  const [transferInst, setTransferInst] = useState(1)          // nº de parcelas (gerador)
  const [transferPeriod, setTransferPeriod] = useState<TransferPeriod>('ANUAL')
  const [transferFirst, setTransferFirst] = useState('')       // 1ª parcela (default = início)
  const [transferLines, setTransferLines] = useState<FlowLine[]>([])

  // Gerar fluxo mensal de remuneração (salário + imagem) pela vigência.
  const [autoRemFlow, setAutoRemFlow] = useState(true)

  // PTAX fixada — quando o contrato é em moeda estrangeira, permite travar a
  // taxa BRL para toda a vida do contrato (transferência, salário, imagem,
  // agentes e cláusulas geradas por este vínculo).
  const [fixPtax, setFixPtax] = useState(false)
  const [fixPtaxRate, setFixPtaxRate] = useState('')
  const fixedRate = fixPtax && fixPtaxRate ? parseFloat(fixPtaxRate) : null
  const hasFxCurrency =
    contract.transfer_currency !== 'BRL' ||
    contract.salary_currency !== 'BRL' ||
    agents.some(a => a.currency !== 'BRL') ||
    clauses.some(c => (c.currency ?? 'EUR') !== 'BRL')

  useEffect(() => {
    if (!id) return
    fetchAthlete(id).then(setAthlete)
    fetchAthleteContracts(id).then(setExistingContracts)
  }, [id])

  // Contrato acessório atrelado a um vínculo: a contraparte vem do vínculo pai —
  // não faz sentido pedir o clube de novo. Herda a contraparte e esconde o campo.
  const hideClub = !!relatedContract && !isTransferContractType(contract.type)
  useEffect(() => {
    if (relatedContract && !isTransferContractType(contract.type)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setContract(prev => ({
        ...prev,
        counterpart_club: relatedContract.counterpart_club,
        counterpart_country: relatedContract.counterpart_country ?? '',
      }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relatedContract?.id, contract.type])

  // Vigência em meses (base do fluxo mensal de salário/imagem).
  const vigMonths = (contract.start_date && contract.end_date)
    ? monthsBetween(contract.start_date, contract.end_date)
    : 0
  const salaryMonthly = contract.base_salary ?? 0
  const imageMonthly = contract.image_value ?? 0
  const willGenSalary = autoRemFlow && salaryMonthly > 0 && vigMonths > 0
  const willGenImage = autoRemFlow && imageMonthly > 0 && vigMonths > 0

  // Transferência: as parcelas são as linhas do cronograma (editáveis). Sem
  // linhas, o valor total vira uma única parcela na data de início.
  const transferTotalField = contract.transfer_fee_gross ?? 0
  const transferFirstDate = transferFirst || contract.start_date
  const transferValid = validLines(transferLines)
  const transferTotal = transferValid.length ? transferValid.reduce((s, l) => s + l.value, 0) : transferTotalField
  const willGenTransfer = transferTotal > 0

  function generateTransferLines() {
    if (!transferTotalField || transferInst < 1 || !transferFirstDate) return
    const per = Math.round((transferTotalField / transferInst) * 100) / 100
    const last = Math.round((transferTotalField - per * (transferInst - 1)) * 100) / 100
    setTransferLines(Array.from({ length: transferInst }, (_, i) => ({
      due_date: addMonths(transferFirstDate, i * PERIOD_STEP[transferPeriod]),
      value: i === transferInst - 1 ? last : per,
    })))
  }

  // ── Step 1 handlers ──────────────────────────────────────────────────────

  const setContractField = <K extends keyof NewContractInput>(k: K, v: NewContractInput[K]) =>
    setContract(prev => ({ ...prev, [k]: v }))

  // Transferência exige contraparte; contratos acessórios não (a parte pode ser
  // o agente, informado na seção de agentes, ou nem se aplicar).
  const step1Valid = contract.start_date && (isTransferContractType(contract.type) ? !!contract.counterpart_club.trim() : true)

  // ── Step 2 handlers ──────────────────────────────────────────────────────

  function addClause() {
    setClauses(prev => [
      ...prev,
      {
        clause_type: 'TRANSFER_FEE_FIXO',
        description: '',
        creditor_party: 'Botafogo SAF',
        debtor_party: contract.counterpart_club || '',
        currency: contract.transfer_currency,
        original_value: null,
        percentage_value: null,
        condition_description: '',
        due_date: contract.start_date,
        installments_total: 1,
        notes: '',
        lines: [],
        flowOpen: false,
      },
    ])
  }

  function removeClause(idx: number) {
    setClauses(prev => prev.filter((_, i) => i !== idx))
  }

  function setClauseRow(idx: number, patch: Partial<ClauseRow>) {
    setClauses(prev => prev.map((c, i) => i === idx ? { ...c, ...patch } : c))
  }

  function setClauseField<K extends keyof NewClauseInput>(idx: number, k: K, v: NewClauseInput[K]) {
    setClauses(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], [k]: v }
      // Auto-swap creditor/debtor when type changes
      if (k === 'clause_type') {
        const t = v as ClauseType
        if (PAYABLE_CLAUSES.includes(t)) {
          next[idx].creditor_party = contract.counterpart_club || 'Contraparte'
          next[idx].debtor_party = 'Botafogo SAF'
        } else {
          next[idx].creditor_party = 'Botafogo SAF'
          next[idx].debtor_party = contract.counterpart_club || 'Contraparte'
        }
        // Sell-on: semeia a base de cálculo (mais-valia por padrão).
        if (SELL_ON_CLAUSE_TYPES.includes(t)) next[idx].condition_description = sellOnConditionText('MAIS_VALIA')
      }
      return next
    })
  }

  // ── Step 3 — save ────────────────────────────────────────────────────────

  async function handleSave() {
    if (!id) return
    setSaving(true)
    setError(null)
    try {
      const savedContract = await createContract(id, {
        ...contract,
        transfer_fee_gross: willGenTransfer ? transferTotal : contract.transfer_fee_gross,
        related_contract_id: relatedId || undefined,
      })
      const buying = contract.type === 'ENTRADA' || contract.type === 'EMPRESTIMO_ENTRADA'

      // Rate para gravar em cada cláusula/parcela criada abaixo (só quando a
      // moeda é estrangeira e o usuário marcou "PTAX fixada").
      const fxRateFor = (cur: Currency): number | null => (fixedRate != null && cur !== 'BRL' ? fixedRate : null)

      // ── Compra / transferência (com o cronograma definido nesta tela) ────
      if (willGenTransfer) {
        const sched = transferValid.length
          ? transferValid
          : [{ due_date: transferFirstDate || contract.start_date, value: transferTotal }]
        const clause = await createClause(savedContract.id, id, {
          clause_type: 'TRANSFER_FEE_FIXO',
          description: `Transferência ${buying ? '(compra)' : '(venda)'} — ${sched.length}x`,
          creditor_party: buying ? (contract.counterpart_club || 'Contraparte') : 'Botafogo SAF',
          debtor_party: buying ? 'Botafogo SAF' : (contract.counterpart_club || 'Contraparte'),
          currency: contract.transfer_currency,
          original_value: transferTotal, percentage_value: null,
          condition_description: '', due_date: sched[0].due_date,
          installments_total: sched.length, notes: '',
          fixed_exchange_rate: fxRateFor(contract.transfer_currency),
        })
        if (sched.length > 1) {
          await createClauseInstallments(clause.id, id, sched.map((l, i) => ({
            installment_number: i + 1, due_date: l.due_date,
            original_value: l.value, currency: contract.transfer_currency,
            fixed_exchange_rate: fxRateFor(contract.transfer_currency),
          })))
        }
      }

      // ── Fluxo mensal de remuneração (salário venc. dia 5; imagem dia 20) ──
      // Uma parcela por mês de vigência, sem precisar lançar mês a mês.
      async function genRemFlow(clauseType: ClauseType, label: string, monthly: number, day: number) {
        const clause = await createClause(savedContract.id, id!, {
          clause_type: clauseType,
          description: `${label} — ${vigMonths}x mensais (venc. dia ${day})`,
          creditor_party: athlete?.full_name || 'Atleta',
          debtor_party: 'Botafogo SAF',
          currency: contract.salary_currency,
          original_value: monthly * vigMonths, percentage_value: null,
          condition_description: '', due_date: dueDayOf(contract.start_date, 0, day),
          installments_total: vigMonths, notes: '',
          fixed_exchange_rate: fxRateFor(contract.salary_currency),
        })
        await createClauseInstallments(clause.id, id!, Array.from({ length: vigMonths }, (_, i) => ({
          installment_number: i + 1,
          due_date: dueDayOf(contract.start_date, i, day),
          original_value: monthly,
          currency: contract.salary_currency,
          fixed_exchange_rate: fxRateFor(contract.salary_currency),
        })))
      }
      if (willGenSalary) await genRemFlow('SALARIO_CETD', 'Salário CLT', salaryMonthly, SALARY_DUE_DAY)
      if (willGenImage) await genRemFlow('DIREITO_IMAGEM', 'Direito de imagem', imageMonthly, IMAGE_DUE_DAY)

      // Agentes → uma cláusula por agente. Se marcado "comissão sobre venda
      // futura", cria uma INTERMEDIACAO_VENDA_FUTURA com % (análogo ao Sell-On
      // do clube). Senão, cria uma INTERMEDIACAO com valor + fluxo de parcelas.
      for (const ag of agents) {
        if (!ag.name.trim()) continue
        const payable = ag.direction === 'A_PAGAR'
        if (ag.futureSale) {
          const pct = ag.futurePct ? parseFloat(ag.futurePct) : null
          await createClause(savedContract.id, id, {
            clause_type: 'INTERMEDIACAO_VENDA_FUTURA',
            description: `Comissão de intermediação sobre venda futura — ${ag.name.trim()}${pct != null ? ` (${pct}%)` : ''}`,
            creditor_party: payable ? ag.name.trim() : 'Botafogo SAF',
            debtor_party: payable ? 'Botafogo SAF' : ag.name.trim(),
            currency: ag.currency,
            original_value: null,
            percentage_value: pct,
            condition_description: sellOnConditionText(ag.futureBasis),
            due_date: contract.start_date,
            installments_total: 1,
            notes: 'Gerada automaticamente quando ocorrer a venda do atleta.',
            fixed_exchange_rate: fxRateFor(ag.currency),
          })
          continue
        }
        const sched = validLines(ag.lines)
        const total = sched.length ? sched.reduce((s, l) => s + l.value, 0) : (ag.amount ? parseFloat(ag.amount) : null)
        const clause = await createClause(savedContract.id, id, {
          clause_type: 'INTERMEDIACAO',
          description: `Comissão de agente — ${ag.name.trim()}`,
          creditor_party: payable ? ag.name.trim() : 'Botafogo SAF',
          debtor_party: payable ? 'Botafogo SAF' : ag.name.trim(),
          currency: ag.currency,
          original_value: total,
          percentage_value: null,
          condition_description: '',
          due_date: sched[0]?.due_date ?? contract.start_date,
          installments_total: sched.length || 1,
          notes: '',
          fixed_exchange_rate: fxRateFor(ag.currency),
        })
        if (sched.length > 1) {
          await createClauseInstallments(clause.id, id, sched.map((l, i) => ({
            installment_number: i + 1, due_date: l.due_date, original_value: l.value, currency: ag.currency,
            fixed_exchange_rate: fxRateFor(ag.currency),
          })))
        }
      }

      for (const cl of clauses) {
        if (!cl.clause_type || !cl.description?.trim()) continue
        const sched = validLines(cl.lines)
        const total = sched.length ? sched.reduce((s, l) => s + l.value, 0) : (cl.original_value ?? null)
        const full: NewClauseInput = {
          clause_type: cl.clause_type,
          description: cl.description || '',
          creditor_party: cl.creditor_party || 'Botafogo SAF',
          debtor_party: cl.debtor_party || '',
          currency: cl.currency || 'EUR',
          original_value: total,
          percentage_value: cl.percentage_value ?? null,
          condition_description: cl.condition_description || '',
          due_date: sched[0]?.due_date ?? cl.due_date ?? todayISO(),
          installments_total: sched.length || 1,
          notes: cl.notes || '',
          fixed_exchange_rate: fxRateFor((cl.currency ?? 'EUR') as Currency),
        }
        const savedClause = await createClause(savedContract.id, id, full)
        if (sched.length > 1) {
          await createClauseInstallments(savedClause.id, id, sched.map((l, i) => ({
            installment_number: i + 1, due_date: l.due_date, original_value: l.value, currency: full.currency,
            fixed_exchange_rate: fxRateFor(full.currency),
          })))
        }
      }
      navigate(`/atletas/${id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const conflict = isSellOnConflict(clauses)

  return (
    <div style={{ padding: '28px 32px', maxWidth: 900, margin: '0 auto' }}>
      <PageHero title="Novo Contrato" subtitle={athlete?.full_name ?? 'Novo contrato · Botafogo SAF'} />
      {/* Breadcrumb */}
      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: 'var(--text-muted)', marginBottom: 20, display: 'flex', gap: 6, alignItems: 'center' }}>
        <Link to="/atletas" style={{ color: 'inherit', textDecoration: 'none' }}>Atletas</Link>
        <span>/</span>
        <Link to={`/atletas/${id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{athlete?.short_name ?? '...'}</Link>
        <span>/</span>
        <span style={{ color: 'var(--ink-primary)' }}>Novo Contrato</span>
      </div>

      {/* Step indicator */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 26, flexWrap: 'wrap' }}>
        {([1, 2, 3] as Step[]).map((s, i) => {
          const labels = ['Vínculo', 'Cláusulas', 'Revisão']
          const active = step === s
          const done = step > s
          return (
            <div key={s} style={{ display: 'flex', alignItems: 'center' }}>
              {i > 0 && <div style={{ width: 34, height: 1, background: done ? 'var(--accent)' : 'var(--divider-strong)' }} />}
              <button onClick={() => done && setStep(s)} disabled={!done && !active}
                style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', padding: '0 4px', cursor: done ? 'pointer' : 'default' }}>
                <span style={{
                  width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: active ? 'var(--accent)' : done ? 'var(--accent-tint2)' : 'var(--cream-inset)',
                  fontSize: 11.5, fontWeight: 700, fontFamily: "var(--font-label)",
                  color: active ? 'var(--accent-on)' : done ? 'var(--ink-primary)' : 'var(--text-muted)',
                }}>
                  {done ? <Icon name="check" size={13} /> : s}
                </span>
                <span style={{ fontFamily: "var(--font-body)", fontSize: 12.5, fontWeight: active ? 700 : 500, color: active ? 'var(--ink-primary)' : 'var(--text-muted)' }}>
                  {labels[i]}
                </span>
              </button>
            </div>
          )
        })}
      </div>

      {/* ── Step 1: Contract ── */}
      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {existingContracts.length > 0 && (
            <div style={cardStyle}>
              <div style={{ ...sectionTitle, marginBottom: 12 }}>Contrato relacionado (opcional)</div>
              <label style={labelStyle}>Atrelar este contrato a um vínculo existente</label>
              <select value={relatedId} onChange={e => setRelatedId(e.target.value)} style={inputStyle}>
                <option value="">— nenhum (contrato independente) —</option>
                {existingContracts.map(c => <option key={c.id} value={c.id}>{contractLabel(c)}</option>)}
              </select>
              <div style={{ ...hintStyle, marginTop: 10 }}>
                Use quando este contrato deriva de outro — ex.: o <strong>contrato de intermediação</strong> de
                uma compra/venda, ou uma cláusula de <strong>Sell-on Fee</strong> ligada à transferência. O novo
                contrato fica agrupado sob o vínculo escolhido no histórico do atleta.
              </div>
              {relatedContract && (
                <div style={{ ...noteBox, marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="link" size={13} /> vinculado a: {contractLabel(relatedContract)}
                </div>
              )}
            </div>
          )}

          <div style={cardStyle}>
            <div style={{ ...sectionTitle, marginBottom: 16 }}>Dados do vínculo</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={labelStyle}>Tipo de vínculo</label>
                <select value={contract.type} onChange={e => setContractField('type', e.target.value as ContractType)} style={inputStyle}>
                  <optgroup label="Transferência">
                    {TRANSFER_CONTRACT_TYPES.map(t => <option key={t} value={t}>{CONTRACT_TYPE_LABELS[t]}</option>)}
                  </optgroup>
                  <optgroup label="Contratos acessórios / vinculados">
                    {ACCESSORY_CONTRACT_TYPES.map(t => <option key={t} value={t}>{CONTRACT_TYPE_LABELS[t]}</option>)}
                  </optgroup>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Status</label>
                <select value={contract.status} onChange={e => setContractField('status', e.target.value as ContractStatus)} style={inputStyle}>
                  <option value="ATIVO">Ativo</option>
                  <option value="ENCERRADO">Encerrado</option>
                  <option value="RESCINDIDO">Rescindido</option>
                </select>
              </div>
              {hideClub ? (
                <div style={{ gridColumn: '1 / -1', ...noteBox, fontFamily: "var(--font-body)", fontSize: 12 }}>
                  Contraparte herdada do vínculo: <strong>{relatedContract?.counterpart_club || '—'}</strong>. O agente/intermediário é informado na seção abaixo.
                </div>
              ) : (
                <>
                  <div>
                    <EntityPicker
                      kind="clube"
                      label={isTransferContractType(contract.type) ? 'Clube / Contraparte *' : 'Clube / Contraparte'}
                      value={contract.counterpart_club}
                      onChange={(name, sub) => {
                        setContractField('counterpart_club', name)
                        if (sub) setContractField('counterpart_country', sub)
                      }}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>País da contraparte</label>
                    <input value={contract.counterpart_country} onChange={e => setContractField('counterpart_country', e.target.value)} placeholder="Ex: Espanha" style={inputStyle} />
                  </div>
                </>
              )}
              <div>
                <label style={labelStyle}>Data de início *</label>
                <input type="date" value={contract.start_date} onChange={e => setContractField('start_date', e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Data de término</label>
                <input type="date" value={contract.end_date} onChange={e => setContractField('end_date', e.target.value)} style={inputStyle} />
              </div>
            </div>
          </div>

          {isTransferContractType(contract.type) && (<>
          <div style={cardStyle}>
            <div style={{ ...sectionTitle, marginBottom: 6 }}>Transferência e parcelas</div>
            <div style={{ ...hintStyle, marginBottom: 14 }}>
              Informe o valor total e gere as parcelas — cada vencimento e valor fica editável abaixo.
              Deixe em branco se não houver taxa de transferência.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, alignItems: 'end' }}>
              <div>
                <label style={labelStyle}>Valor total</label>
                <NumberInput
                  value={contract.transfer_fee_gross ?? ''}
                  onChange={v => setContractField('transfer_fee_gross', v ? parseFloat(v) : null)}
                  placeholder="Ex: 30.000.000"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Moeda</label>
                <select value={contract.transfer_currency} onChange={e => setContractField('transfer_currency', e.target.value as Currency)} style={inputStyle}>
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Nº parcelas</label>
                <input type="number" min={1} max={120} value={transferInst}
                  onChange={e => setTransferInst(Math.max(1, parseInt(e.target.value) || 1))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Periodicidade</label>
                <select value={transferPeriod} onChange={e => setTransferPeriod(e.target.value as TransferPeriod)} style={inputStyle}>
                  {(Object.keys(PERIOD_LABEL) as TransferPeriod[]).map(p => <option key={p} value={p}>{PERIOD_LABEL[p]}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>1ª parcela</label>
                <input type="date" value={transferFirstDate} onChange={e => setTransferFirst(e.target.value)} style={inputStyle} />
              </div>
              <button type="button" onClick={generateTransferLines} className="btn btn-outline"
                disabled={!transferTotalField} style={{ justifyContent: 'center', whiteSpace: 'nowrap' }}>
                <Icon name="flow" size={14} /> Gerar parcelas
              </button>
            </div>

            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--divider)' }}>
              <FlowBuilder
                currency={contract.transfer_currency}
                onCurrencyChange={c => setContractField('transfer_currency', c)}
                lines={transferLines} onChange={setTransferLines}
                defaultFirst={transferFirstDate}
                periodicity={transferPeriod}
                title="Parcelas da transferência"
                showGenerator={false}
              />
            </div>
            {willGenTransfer && (
              <div style={{ ...noteBox, marginTop: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <span><strong>{transferValid.length || 1}×</strong></span>
                <span>Total {contract.transfer_currency} {fmtNum(transferTotal)}</span>
                <span>1º venc. {fmtDateBR(transferValid[0]?.due_date ?? transferFirstDate)}</span>
                {transferValid.length > 1 && <span>último {fmtDateBR(transferValid[transferValid.length - 1].due_date)}</span>}
              </div>
            )}
          </div>

          <div style={cardStyle}>
            <div style={{ ...sectionTitle, marginBottom: 16 }}>Remuneração mensal (paga pelo Botafogo)</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
              <div>
                <label style={labelStyle}>Salário CLT</label>
                <NumberInput value={contract.base_salary ?? ''}
                  onChange={v => setContractField('base_salary', v ? parseFloat(v) : null)} placeholder="Ex: 200.000" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Direito de imagem</label>
                <NumberInput value={contract.image_value ?? ''}
                  onChange={v => setContractField('image_value', v ? parseFloat(v) : null)} placeholder="Ex: 200.000" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Outros (moradia/aux.)</label>
                <NumberInput value={contract.other_value ?? ''}
                  onChange={v => setContractField('other_value', v ? parseFloat(v) : null)} placeholder="0,00" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Moeda</label>
                <select value={contract.salary_currency} onChange={e => setContractField('salary_currency', e.target.value as Currency)} style={inputStyle}>
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button"
                onClick={() => {
                  const total = (contract.base_salary ?? 0) + (contract.image_value ?? 0)
                  const base = total || (contract.base_salary ?? 0)
                  if (base > 0) { setContractField('base_salary', base / 2); setContractField('image_value', base / 2) }
                }}
                className="btn btn-outline" style={{ padding: '5px 12px', fontSize: 11.5 }}>
                Dividir 50% CLT / 50% imagem
              </button>
              <span style={{ fontFamily: "var(--font-label)", fontSize: 11.5, color: 'var(--ink-secondary)' }}>
                Total: {(((contract.base_salary ?? 0) + (contract.image_value ?? 0) + (contract.other_value ?? 0))).toLocaleString('pt-BR')} {contract.salary_currency}/mês
              </span>
            </div>
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--divider)' }}>
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                <input type="checkbox" checked={autoRemFlow} onChange={e => setAutoRemFlow(e.target.checked)} style={{ marginTop: 2, accentColor: 'var(--accent)', width: 16, height: 16 }} />
                <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: 'var(--text-secondary)' }}>
                  <strong>Gerar o fluxo mensal automaticamente</strong> pela vigência do contrato — uma parcela por mês, sem lançar mês a mês.
                  Salário CLT vence <strong>dia {SALARY_DUE_DAY}</strong> e imagem vence <strong>dia {IMAGE_DUE_DAY}</strong> do mês subsequente.
                </span>
              </label>

              {autoRemFlow && vigMonths > 0 && (salaryMonthly > 0 || imageMonthly > 0) ? (
                <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {willGenSalary && (
                    <div style={noteBox}>
                      Salário: {vigMonths}× {contract.salary_currency} {fmtNum(salaryMonthly)} · venc. dia {SALARY_DUE_DAY} · 1º {fmtDateBR(dueDayOf(contract.start_date, 0, SALARY_DUE_DAY))}
                    </div>
                  )}
                  {willGenImage && (
                    <div style={noteBox}>
                      Imagem: {vigMonths}× {contract.salary_currency} {fmtNum(imageMonthly)} · venc. dia {IMAGE_DUE_DAY} · 1º {fmtDateBR(dueDayOf(contract.start_date, 0, IMAGE_DUE_DAY))}
                    </div>
                  )}
                </div>
              ) : autoRemFlow ? (
                <div style={{ ...hintStyle, marginTop: 8 }}>
                  Preencha salário e/ou imagem e as <strong>datas de início e término</strong> para gerar o fluxo.
                </div>
              ) : null}
            </div>
          </div>
          </>)}

          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10, flexWrap: 'wrap' }}>
              <div style={sectionTitle}>Limitador de bônus / gatilhos (opcional)</div>
              {!capOpen && (
                <button type="button" onClick={() => { setCapOpen(true); setContractField('trigger_cap_currency', 'BRL') }} className="btn btn-outline">
                  <Icon name="plus" size={14} /> Adicionar teto
                </button>
              )}
            </div>
            {!capOpen ? (
              <div style={hintStyle}>
                Use quando o contrato tem várias cláusulas de bônus/gatilho mas com um <strong>teto agregado</strong>.
                Ex.: 10 gatilhos de R$1M cada, mas o pagamento total não pode ultrapassar R$5M.
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Teto (valor)</label>
                    <NumberInput
                      value={contract.trigger_cap_amount ?? ''}
                      onChange={v => setContractField('trigger_cap_amount', v ? parseFloat(v) : null)}
                      placeholder="Ex: 5.000.000" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Moeda</label>
                    <select value={contract.trigger_cap_currency ?? 'BRL'}
                      onChange={e => setContractField('trigger_cap_currency', e.target.value as Currency)} style={inputStyle}>
                      {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelStyle}>Notas sobre o teto</label>
                    <input value={contract.trigger_cap_notes ?? ''} onChange={e => setContractField('trigger_cap_notes', e.target.value)}
                      placeholder="Ex: cláusula 8.2 — aplicável apenas à temporada 26/27" style={inputStyle} />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                  <button type="button" className="btn btn-ghost"
                    onClick={() => { setCapOpen(false); setContractField('trigger_cap_amount', null); setContractField('trigger_cap_currency', null); setContractField('trigger_cap_notes', null) }}>
                    Remover teto
                  </button>
                </div>
                <div style={{ ...noteBox, marginTop: 10, fontFamily: "var(--font-body)", fontSize: 12 }}>
                  As cláusulas continuam existindo individualmente. O teto aparece no relatório de <strong>Gatilhos</strong> com o quanto já foi atingido vs. o limite.
                </div>
              </>
            )}
          </div>

          {hasFxCurrency && (
            <div style={cardStyle}>
              <div style={{ ...sectionTitle, marginBottom: 10 }}>PTAX do contrato</div>
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                <input type="checkbox" checked={fixPtax} onChange={e => setFixPtax(e.target.checked)}
                  style={{ marginTop: 2, accentColor: 'var(--accent)', width: 16, height: 16 }} />
                <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: 'var(--text-secondary)' }}>
                  <strong>PTAX fixada</strong> — trava a taxa de câmbio deste contrato para evitar distorções cambiais.
                  Quando marcada, todos os valores em moeda estrangeira geradas por este vínculo (transferência,
                  salário, imagem, agentes e cláusulas) usam a taxa informada abaixo na conversão para BRL nos
                  relatórios. Se desmarcada, o sistema usa a PTAX corrente do Banco Central (dia atual).
                </span>
              </label>
              {fixPtax && (
                <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>PTAX (moeda/BRL)</label>
                    <NumberInput decimals={4} grouping={false} value={fixPtaxRate}
                      onChange={v => setFixPtaxRate(v)} placeholder="Ex: 5,5000" style={inputStyle} />
                  </div>
                  <div style={{ ...noteBox, fontFamily: "var(--font-body)", fontSize: 12 }}>
                    Exemplo: contrato em EUR com PTAX fixada em <strong>6,10</strong> — 1 EUR sempre valerá R$ 6,10 nos relatórios.
                  </div>
                </div>
              )}
            </div>
          )}

          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
              <div style={sectionTitle}>
                {isTransferContractType(contract.type) ? 'Agentes desta transação' : 'Agentes / intermediários'}
              </div>
              <button type="button" onClick={addAgent} className="btn btn-outline">
                <Icon name="plus" size={14} /> Adicionar agente
              </button>
            </div>

            {agents.length === 0 && (
              <div style={hintStyle}>
                Nenhum agente nesta transação. Um vínculo pode ter vários agentes, com valores e fluxos diferentes.
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {agents.map((ag, i) => {
                const agValid = validLines(ag.lines)
                const agTotal = agValid.length ? agValid.reduce((s, l) => s + l.value, 0) : (ag.amount ? parseFloat(ag.amount) : 0)
                return (
                  <div key={i} style={{ padding: 14, borderRadius: 10, border: '1px solid var(--divider)', background: 'var(--bg-subtle)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ fontFamily: "var(--font-label)", fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Agente {i + 1}</span>
                      <IconButton icon="trash" label={`Remover agente ${i + 1}`} tone="danger" onClick={() => removeAgent(i)} />
                    </div>
                    <EntityPicker kind="intermediario" label="Agente" value={ag.name} onChange={name => setAgent(i, { name })} />
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginTop: 12 }}>
                      {!ag.futureSale && (
                        <div>
                          <label style={labelStyle}>Comissão / valor</label>
                          <NumberInput value={ag.amount} onChange={v => setAgent(i, { amount: v })} placeholder="0,00" style={inputStyle}
                            disabled={agValid.length > 0} />
                        </div>
                      )}
                      {ag.futureSale && (
                        <div>
                          <label style={labelStyle}>% da venda futura</label>
                          <NumberInput decimals={2} grouping={false} value={ag.futurePct} onChange={v => setAgent(i, { futurePct: v })} placeholder="Ex: 10" style={inputStyle} />
                        </div>
                      )}
                      <div>
                        <label style={labelStyle}>Moeda</label>
                        <select value={ag.currency} onChange={e => setAgent(i, { currency: e.target.value as Currency })} style={inputStyle}>
                          {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Direção</label>
                        <select value={ag.direction} onChange={e => setAgent(i, { direction: e.target.value as LiabilityDirection })} style={inputStyle}>
                          <option value="A_PAGAR">A pagar</option>
                          <option value="A_RECEBER">A receber</option>
                        </select>
                      </div>
                      {ag.futureSale && (
                        <div>
                          <label style={labelStyle}>Base de cálculo</label>
                          <select value={ag.futureBasis} onChange={e => setAgent(i, { futureBasis: e.target.value as SellOnBasis })} style={inputStyle}>
                            {(Object.keys(SELLON_BASIS_LABELS) as SellOnBasis[]).map(b => <option key={b} value={b}>{SELLON_BASIS_LABELS[b]}</option>)}
                          </select>
                        </div>
                      )}
                    </div>

                    <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: 'var(--accent-tint)', border: '1px solid var(--divider)' }}>
                      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                        <input type="checkbox" checked={ag.futureSale}
                          onChange={e => setAgent(i, { futureSale: e.target.checked, amount: e.target.checked ? '' : ag.amount, lines: e.target.checked ? [] : ag.lines, flowOpen: e.target.checked ? false : ag.flowOpen })}
                          style={{ marginTop: 2, accentColor: 'var(--accent)', width: 16, height: 16 }} />
                        <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: 'var(--text-secondary)' }}>
                          <strong>Comissão sobre a venda futura deste atleta.</strong> Igual ao mecanismo de Sell-On do clube:
                          se este atleta for vendido, o agente recebe a % informada sobre o valor (ou mais-valia) da transferência.
                          Nada é gerado agora — a cláusula fica registrada e é acionada quando ocorrer a venda.
                        </span>
                      </label>
                    </div>

                    {/* Fluxo de parcelas do agente — só para comissão à vista/parcelada */}
                    {!ag.futureSale && <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--divider)' }}>
                      {!ag.flowOpen ? (
                        <button type="button" onClick={() => setAgent(i, { flowOpen: true })} className="btn btn-outline">
                          <Icon name="flow" size={14} /> Parcelar esta comissão
                        </button>
                      ) : (
                        <>
                          <FlowBuilder
                            currency={ag.currency}
                            onCurrencyChange={c => setAgent(i, { currency: c })}
                            lines={ag.lines} onChange={lines => setAgent(i, { lines })}
                            defaultFirst={contract.start_date} seedRows={4}
                            title={`Parcelas do agente ${i + 1}`}
                          />
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, gap: 10, flexWrap: 'wrap' }}>
                            <span style={hintStyle}>
                              Com parcelas, o valor da comissão passa a ser a soma delas: <strong>{fmtCurrencyShort(agTotal, ag.currency)}</strong>.
                            </span>
                            <button type="button" onClick={() => setAgent(i, { flowOpen: false, lines: [] })} className="btn btn-ghost">
                              Remover parcelamento
                            </button>
                          </div>
                        </>
                      )}
                    </div>}
                  </div>
                )
              })}
            </div>
            <div style={{ ...hintStyle, marginTop: 12 }}>
              Cada agente fica vinculado a este atleta, aparece no cadastro de Agentes e no relatório — e cada parcela entra no consolidado.
            </div>
          </div>

          <div style={cardStyle}>
            <label style={labelStyle}>Descrição / observações</label>
            <textarea value={contract.description} onChange={e => setContractField('description', e.target.value)} rows={3} placeholder="Notas gerais sobre o vínculo..." style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
        </div>
      )}

      {/* ── Step 2: Clauses ── */}
      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {conflict && (
            <div style={{ background: 'var(--warn-tint)', border: '1px solid rgba(138,101,22,0.32)', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: 'var(--warn)' }}>
                <strong>Atenção — conflito Sell-On:</strong> você adicionou tanto "Sell-On Fee (a pagar)" quanto "Sell-On Fee (a receber)". Verifique se isso reflete cláusulas de contratos distintos e não um erro de cadastro.
              </div>
            </div>
          )}

          {clauses.length === 0 && (
            <div style={{ ...cardStyle, textAlign: 'center', padding: '32px 20px', color: 'var(--text-muted)', fontFamily: "var(--font-body)", fontSize: 13 }}>
              Nenhuma cláusula extra. Salário, imagem, transferência e agentes já foram tratados no passo anterior —
              use este passo para sell-on, bônus, solidariedade, rescisória e afins.
            </div>
          )}

          {clauses.map((cl, idx) => {
            const clValid = validLines(cl.lines)
            const clTotal = clValid.length ? clValid.reduce((s, l) => s + l.value, 0) : (cl.original_value ?? 0)
            return (
              <div key={idx} style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div style={sectionTitle}>Cláusula {idx + 1}</div>
                  <IconButton icon="trash" label={`Remover cláusula ${idx + 1}`} tone="danger" onClick={() => removeClause(idx)} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelStyle}>Tipo</label>
                    <select value={cl.clause_type} onChange={e => setClauseField(idx, 'clause_type', e.target.value as ClauseType)} style={inputStyle}>
                      {CLAUSE_TYPES.map(t => <option key={t} value={t}>{CLAUSE_TYPE_LABELS[t]}</option>)}
                    </select>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelStyle}>Descrição *</label>
                    <input value={cl.description ?? ''} onChange={e => setClauseField(idx, 'description', e.target.value)} placeholder="Descreva a cláusula..." style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Credor</label>
                    <input value={cl.creditor_party ?? ''} onChange={e => setClauseField(idx, 'creditor_party', e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Devedor</label>
                    <input value={cl.debtor_party ?? ''} onChange={e => setClauseField(idx, 'debtor_party', e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Valor</label>
                    <NumberInput value={cl.original_value ?? ''} onChange={v => setClauseField(idx, 'original_value', v ? parseFloat(v) : null)} placeholder="0,00" style={inputStyle} disabled={clValid.length > 0} />
                  </div>
                  <div>
                    <label style={labelStyle}>Moeda</label>
                    <select value={cl.currency ?? 'EUR'} onChange={e => setClauseField(idx, 'currency', e.target.value as Currency)} style={inputStyle}>
                      {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>% (se aplicável)</label>
                    <NumberInput decimals={2} grouping={false} value={cl.percentage_value ?? ''} onChange={v => setClauseField(idx, 'percentage_value', v ? parseFloat(v) : null)} placeholder="Ex: 15" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Vencimento (parcela única)</label>
                    <input type="date" value={cl.due_date ?? ''} onChange={e => setClauseField(idx, 'due_date', e.target.value)} style={inputStyle} disabled={clValid.length > 0} />
                  </div>
                  {SELL_ON_CLAUSE_TYPES.includes(cl.clause_type as ClauseType) ? (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={labelStyle}>Base de cálculo do Sell-on</label>
                      <select value={cl.condition_description === sellOnConditionText('VALOR_TOTAL') ? 'VALOR_TOTAL' : 'MAIS_VALIA'} onChange={e => setClauseField(idx, 'condition_description', sellOnConditionText(e.target.value as SellOnBasis))} style={inputStyle}>
                        {(Object.keys(SELLON_BASIS_LABELS) as SellOnBasis[]).map(b => <option key={b} value={b}>{SELLON_BASIS_LABELS[b]}</option>)}
                      </select>
                    </div>
                  ) : (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={labelStyle}>Condição / gatilho</label>
                      <input value={cl.condition_description ?? ''} onChange={e => setClauseField(idx, 'condition_description', e.target.value)} placeholder="Ex: Aprovação em 25 jogos na liga" style={inputStyle} />
                    </div>
                  )}
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelStyle}>Notas</label>
                    <input value={cl.notes ?? ''} onChange={e => setClauseField(idx, 'notes', e.target.value)} style={inputStyle} />
                  </div>
                </div>

                {/* Fluxo de parcelas da cláusula — direto aqui */}
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--divider)' }}>
                  {!cl.flowOpen ? (
                    <button type="button" onClick={() => setClauseRow(idx, { flowOpen: true })} className="btn btn-outline">
                      <Icon name="flow" size={14} /> Parcelar esta cláusula
                    </button>
                  ) : (
                    <>
                      <FlowBuilder
                        currency={(cl.currency ?? 'EUR') as Currency}
                        onCurrencyChange={c => setClauseField(idx, 'currency', c)}
                        lines={cl.lines} onChange={lines => setClauseRow(idx, { lines })}
                        defaultFirst={cl.due_date || contract.start_date} seedRows={4}
                        title={`Parcelas da cláusula ${idx + 1}`}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, gap: 10, flexWrap: 'wrap' }}>
                        <span style={hintStyle}>Valor da cláusula = soma das parcelas: <strong>{fmtCurrencyShort(clTotal, (cl.currency ?? 'EUR') as Currency)}</strong>.</span>
                        <button type="button" onClick={() => setClauseRow(idx, { flowOpen: false, lines: [] })} className="btn btn-ghost">Remover parcelamento</button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )
          })}

          <button onClick={addClause}
            style={{
              background: 'transparent', border: '1px dashed var(--divider-strong)',
              borderRadius: 10, padding: '12px 0', width: '100%',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600,
              color: 'var(--ink-primary)', cursor: 'pointer',
            }}
          >
            <Icon name="plus" size={15} /> Adicionar cláusula
          </button>
        </div>
      )}

      {/* ── Step 3: Review ── */}
      {step === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {conflict && (
            <div style={{ background: 'var(--warn-tint)', border: '1px solid rgba(138,101,22,0.32)', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: 'var(--warn)' }}>
                <strong>Conflito Sell-On detectado.</strong> Revise antes de salvar.
              </div>
            </div>
          )}

          <div style={cardStyle}>
            <div style={{ ...sectionTitle, marginBottom: 14 }}>Vínculo</div>
            <dl style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '6px 16px', fontFamily: "var(--font-body)", fontSize: 13, margin: 0 }}>
              {relatedContract && (<>
                <dt style={dtStyle}>Vinculado a</dt><dd style={ddStyle}>{contractLabel(relatedContract)}</dd>
              </>)}
              <dt style={dtStyle}>Tipo</dt><dd style={ddStyle}>{CONTRACT_TYPE_LABELS[contract.type]}</dd>
              <dt style={dtStyle}>Clube</dt><dd style={ddStyle}>{contract.counterpart_club || '—'}</dd>
              <dt style={dtStyle}>País</dt><dd style={ddStyle}>{contract.counterpart_country || '—'}</dd>
              <dt style={dtStyle}>Início</dt><dd style={ddStyle}>{fmtDateBR(contract.start_date)}</dd>
              <dt style={dtStyle}>Término</dt><dd style={ddStyle}>{contract.end_date ? fmtDateBR(contract.end_date) : '—'}</dd>
            </dl>
          </div>

          {(willGenTransfer || willGenSalary || willGenImage || agents.some(a => a.name.trim()) || clauses.length > 0) && (
            <div style={cardStyle}>
              <div style={{ ...sectionTitle, marginBottom: 10 }}>Fluxos que serão gerados</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontFamily: "var(--font-body)", fontSize: 13, color: 'var(--ink-primary)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {willGenTransfer && (
                  <li>Transferência: <strong>{transferValid.length || 1}× </strong>
                    total {contract.transfer_currency} {fmtNum(transferTotal)}, 1º venc. {fmtDateBR(transferValid[0]?.due_date ?? transferFirstDate)}.</li>
                )}
                {willGenSalary && (
                  <li>Salário CLT: <strong>{vigMonths}× {contract.salary_currency} {fmtNum(salaryMonthly)}/mês</strong>, vencimento dia {SALARY_DUE_DAY} (total {contract.salary_currency} {fmtNum(salaryMonthly * vigMonths)}).</li>
                )}
                {willGenImage && (
                  <li>Direito de imagem: <strong>{vigMonths}× {contract.salary_currency} {fmtNum(imageMonthly)}/mês</strong>, vencimento dia {IMAGE_DUE_DAY} (total {contract.salary_currency} {fmtNum(imageMonthly * vigMonths)}).</li>
                )}
                {agents.filter(a => a.name.trim()).map((a, i) => {
                  if (a.futureSale) {
                    return (
                      <li key={i}>Agente <strong>{a.name}</strong>: <strong>{a.futurePct || '—'}%</strong> sobre a <em>venda futura</em> deste atleta
                        {' '}({SELLON_BASIS_LABELS[a.futureBasis]}, {a.direction === 'A_PAGAR' ? 'a pagar' : 'a receber'}).</li>
                    )
                  }
                  const v = validLines(a.lines)
                  const total = v.length ? v.reduce((s, l) => s + l.value, 0) : (a.amount ? parseFloat(a.amount) : 0)
                  return (
                    <li key={i}>Agente <strong>{a.name}</strong>: {v.length ? `${v.length}× ` : 'parcela única · '}
                      {fmtCurrencyShort(total, a.currency)} ({a.direction === 'A_PAGAR' ? 'a pagar' : 'a receber'}).</li>
                  )
                })}
                {clauses.filter(c => c.description?.trim()).map((c, i) => {
                  const v = validLines(c.lines)
                  const total = v.length ? v.reduce((s, l) => s + l.value, 0) : (c.original_value ?? 0)
                  return (
                    <li key={`c${i}`}>{CLAUSE_TYPE_LABELS[c.clause_type!]}: {c.description}
                      {total ? ` — ${v.length ? `${v.length}× ` : ''}${fmtCurrencyShort(total, (c.currency ?? 'EUR') as Currency)}` : ''}
                      {c.percentage_value != null ? ` · ${c.percentage_value}%` : ''}</li>
                  )
                })}
              </ul>
            </div>
          )}

          {error && (
            <div style={{ background: 'var(--neg-tint)', border: '1px solid rgba(138,53,36,0.30)', borderRadius: 8, padding: '10px 14px', fontFamily: "var(--font-body)", fontSize: 13, color: 'var(--neg)' }}>
              {error}
            </div>
          )}
        </div>
      )}

      {/* ── Navigation buttons ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 26, gap: 10, flexWrap: 'wrap' }}>
        <div>
          {step > 1 && (
            <button onClick={() => setStep(s => (s - 1) as Step)} className="btn btn-outline">← Voltar</button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link to={`/atletas/${id}`} className="btn btn-ghost">Cancelar</Link>
          {step < 3 ? (
            <button onClick={() => setStep(s => (s + 1) as Step)} disabled={step === 1 && !step1Valid} className="btn btn-primary">
              Próximo →
            </button>
          ) : (
            <button onClick={handleSave} disabled={saving} className="btn btn-primary">
              {saving ? 'Salvando...' : 'Salvar vínculo'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const dtStyle: React.CSSProperties = { color: 'var(--text-muted)', fontWeight: 500 }
const ddStyle: React.CSSProperties = { margin: 0, color: 'var(--ink-primary)' }

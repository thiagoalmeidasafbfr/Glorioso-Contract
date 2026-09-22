// src/lib/amortization.ts
// Matemática da calculadora de amortização / baixa de intangível por atleta
// (extraída de PageAmortizacao.tsx para poder ser testada). Funções puras:
// recebem os cadastros e a tabela de PTAX e devolvem os números.

import { toBRL, ptaxRateFor } from './ptax'
import type {
  Athlete, Contract, Clause, ClubLiability, IntermediaryLiability, Currency,
} from '../types/athlete-system'

// ── Helpers de data / meses ────────────────────────────────────────────────
export function parseISO(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}
export function monthsInclusive(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1
}
export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Modelo por atleta ──────────────────────────────────────────────────────
// Um contrato de ENTRADA compõe o intangível (transfer fee + intermediação +
// luvas). Outros contratos (empréstimo, agentes, etc.) não são considerados
// para o intangível — mas ainda aparecem em "quem recebe" via passivos/cláusulas.
export const INTANGIBLE_CLAUSE_TYPES = new Set<Clause['clause_type']>([
  'TRANSFER_FEE_FIXO', 'INTERMEDIACAO', 'LUVAS',
])

export interface AthleteCalc {
  athlete: Athlete
  entryContract: Contract | null
  entryContractStart: string | null
  entryContractEnd: string | null
  contractMonths: number
  monthsElapsed: number
  monthsRemaining: number
  intangibleBRL: number             // custo de aquisição em BRL na data do contrato
  intangibleItems: {
    clauseType: Clause['clause_type']; description: string;
    currency: Currency; originalValue: number; brl: number;
    rate: number; rateSource: 'FIXADA' | 'AQUISICAO' | 'ATUAL';
  }[]
  ptaxAquisicao: number | null      // taxa usada na conversão (1º item em moeda estrangeira)
  monthlyAmortBRL: number           // BRL / mês
  accumAmortBRL: number             // baixado até hoje
  residualBRL: number               // saldo do intangível
  monthlySalaryBRL: number
  monthlyImageBRL: number
  monthlyPayrollBRL: number
  // Cláusulas e passivos que serão devidos se houver venda
  sellOnPct: number                 // % agregado a pagar (sobre mais-valia)
  sellOnPayees: { party: string; pct: number; basis: string }[]
  intermedFutureBRL: number         // valor fixo já cadastrado (intermediação da venda futura)
  intermedFuturePayees: { party: string; brl: number; currency: Currency; original: number }[]
  solidariedadePct: number          // FIFA (5% típico, pro-rata clubes formadores)
  solidariedadePayees: { party: string; pct: number }[]
  clubLiabilities: ClubLiability[]
  intermLiabilities: IntermediaryLiability[]
}

export function buildAthleteCalcs(
  athletes: Athlete[],
  contracts: Contract[],
  clauses: Clause[],
  clubLiabs: ClubLiability[],
  intermLiabs: IntermediaryLiability[],
  ptax: Record<string, number>,
  // PTAX da data de aquisição (início do contrato de ENTRADA), por atleta → moeda.
  // Quando ausente, cai na PTAX corrente (comportamento anterior).
  acqRates: Record<string, Partial<Record<string, number>>> = {},
  asOf: Date = new Date(),
): AthleteCalc[] {
  const today = asOf

  return athletes.map(a => {
    // Contratos do atleta — pegamos o contrato de ENTRADA vigente ou mais recente
    const aContracts = contracts
      .filter(c => c.athlete_id === a.id)
      .sort((x, y) => (y.start_date ?? '').localeCompare(x.start_date ?? ''))
    const entry = aContracts.find(c => c.type === 'ENTRADA') ?? null

    const startD = parseISO(entry?.start_date ?? null)
    const endD = parseISO(entry?.end_date ?? null)
    const contractMonths = startD && endD ? Math.max(0, monthsInclusive(startD, endD)) : 0

    let monthsElapsed = 0
    if (startD) {
      const cap = endD && today > endD ? endD : today
      monthsElapsed = Math.max(0, Math.min(contractMonths, monthsInclusive(startD, cap)))
    }
    const monthsRemaining = Math.max(0, contractMonths - monthsElapsed)

    // Intangível — cláusulas ligadas ao contrato de entrada
    const intangibleItems = clauses
      .filter(cl => cl.athlete_id === a.id
        && (entry ? cl.contract_id === entry.id : false)
        && INTANGIBLE_CLAUSE_TYPES.has(cl.clause_type)
        && (cl.original_value ?? 0) > 0)
      .map(cl => {
        const acq = acqRates[a.id]?.[cl.currency]
        const rate = cl.fixed_exchange_rate || (cl.currency === 'BRL' ? 1 : acq ?? ptaxRateFor(cl.currency, ptax))
        const rateSource: 'FIXADA' | 'AQUISICAO' | 'ATUAL' = cl.fixed_exchange_rate ? 'FIXADA' : (cl.currency === 'BRL' || acq != null) ? 'AQUISICAO' : 'ATUAL'
        return {
          clauseType: cl.clause_type,
          description: cl.description || cl.clause_type,
          currency: cl.currency,
          originalValue: cl.original_value ?? 0,
          brl: (cl.original_value ?? 0) * rate,
          rate, rateSource,
        }
      })
    const ptaxAquisicao = intangibleItems.find(it => it.currency !== 'BRL')?.rate ?? null
    const intangibleBRL = intangibleItems.reduce((s, it) => s + it.brl, 0)

    const monthlyAmortBRL = contractMonths > 0 ? intangibleBRL / contractMonths : 0
    const accumAmortBRL = Math.min(intangibleBRL, monthlyAmortBRL * monthsElapsed)
    const residualBRL = Math.max(0, intangibleBRL - accumAmortBRL)

    // Folha mensal — pega do contrato de entrada (salário e imagem já são mensais)
    const salCur = (entry?.salary_currency ?? 'BRL') as Currency
    const salVal = entry?.base_salary ?? 0
    const imgVal = entry?.image_value ?? 0
    const monthlySalaryBRL = toBRL(salVal, salCur, ptax)
    const monthlyImageBRL = toBRL(imgVal, salCur, ptax)
    const monthlyPayrollBRL = monthlySalaryBRL + monthlyImageBRL

    // Sell-on a pagar (agregado por %)
    const sellOnClauses = clauses.filter(cl => cl.athlete_id === a.id && cl.clause_type === 'SELL_ON_FEE')
    const sellOnPct = sellOnClauses.reduce((s, cl) => s + (cl.percentage_value ?? 0), 0)
    const sellOnPayees = sellOnClauses.map(cl => ({
      party: cl.creditor_party || '—',
      pct: cl.percentage_value ?? 0,
      basis: cl.condition_description || 'mais-valia',
    }))

    // Intermediação da venda futura — valor cadastrado (ou %; aqui só somamos valor)
    const intermedFutureClauses = clauses.filter(cl => cl.athlete_id === a.id && cl.clause_type === 'INTERMEDIACAO_VENDA_FUTURA')
    const intermedFuturePayees = intermedFutureClauses.map(cl => ({
      party: cl.creditor_party || '—',
      currency: cl.currency,
      original: cl.original_value ?? 0,
      brl: cl.fixed_exchange_rate
        ? (cl.original_value ?? 0) * cl.fixed_exchange_rate
        : toBRL(cl.original_value ?? 0, cl.currency, ptax),
    }))
    const intermedFutureBRL = intermedFuturePayees.reduce((s, p) => s + p.brl, 0)

    // Solidariedade FIFA — cláusulas do tipo SOLIDARIEDADE_FIFA (soma dos %)
    const solidClauses = clauses.filter(cl => cl.athlete_id === a.id && cl.clause_type === 'SOLIDARIEDADE_FIFA')
    const solidariedadePct = solidClauses.reduce((s, cl) => s + (cl.percentage_value ?? 0), 0)
    const solidariedadePayees = solidClauses.map(cl => ({
      party: cl.creditor_party || 'Clubes formadores (FIFA)',
      pct: cl.percentage_value ?? 0,
    }))

    // Passivos pendentes vinculados ao atleta
    const aClubLiabs = clubLiabs.filter(l => l.athlete_id === a.id && l.status !== 'PAGA' && l.status !== 'CANCELADA')
    const aIntermLiabs = intermLiabs.filter(l => l.athlete_id === a.id && l.status !== 'PAGA' && l.status !== 'CANCELADA')

    return {
      athlete: a,
      entryContract: entry,
      entryContractStart: entry?.start_date ?? null,
      entryContractEnd: entry?.end_date ?? null,
      contractMonths, monthsElapsed, monthsRemaining,
      intangibleBRL, intangibleItems, ptaxAquisicao,
      monthlyAmortBRL, accumAmortBRL, residualBRL,
      monthlySalaryBRL, monthlyImageBRL, monthlyPayrollBRL,
      sellOnPct, sellOnPayees,
      intermedFutureBRL, intermedFuturePayees,
      solidariedadePct, solidariedadePayees,
      clubLiabilities: aClubLiabs,
      intermLiabilities: aIntermLiabs,
    }
  })
}

// ── Simulação de venda ────────────────────────────────────────────────────
export interface SaleInputs {
  saleValue: number
  saleCurrency: Currency
  saleDate: string
  commissionValue: number         // intermediação nova (não cadastrada)
  commissionCurrency: Currency
  taxesPct: number
  extraSellOnPct: number
  extraSolidariedadePct: number
}
export interface SaleResult {
  saleBRL: number
  intangibleWriteoffBRL: number    // resíduo baixado
  sellOnFeeBRL: number
  solidariedadeBRL: number
  intermedNewBRL: number
  intermedCadastradaBRL: number
  taxesBRL: number
  gainBRL: number
  netToClubBRL: number             // saleBRL - todas obrigações
}
export function calcSale(inputs: SaleInputs, c: AthleteCalc, ptax: Record<string, number>): SaleResult {
  const saleBRL = toBRL(inputs.saleValue || 0, inputs.saleCurrency, ptax)
  const intangibleWriteoffBRL = c.residualBRL
  const solidariedadePct = c.solidariedadePct + (inputs.extraSolidariedadePct || 0)
  const solidariedadeBRL = saleBRL * (solidariedadePct / 100)
  const baseAfterSolid = Math.max(0, saleBRL - solidariedadeBRL)
  const sellOnPct = c.sellOnPct + (inputs.extraSellOnPct || 0)
  // Base padrão do sell-on: mais-valia (venda − solidariedade − residual do intangível)
  const maisValia = Math.max(0, baseAfterSolid - intangibleWriteoffBRL)
  const sellOnFeeBRL = maisValia * (sellOnPct / 100)
  const intermedNewBRL = toBRL(inputs.commissionValue || 0, inputs.commissionCurrency, ptax)
  const intermedCadastradaBRL = c.intermedFutureBRL
  const taxesBRL = saleBRL * ((inputs.taxesPct || 0) / 100)
  const gainBRL = saleBRL - intangibleWriteoffBRL - solidariedadeBRL - sellOnFeeBRL - intermedNewBRL - intermedCadastradaBRL - taxesBRL
  const netToClubBRL = gainBRL
  return {
    saleBRL, intangibleWriteoffBRL, sellOnFeeBRL, solidariedadeBRL,
    intermedNewBRL, intermedCadastradaBRL, taxesBRL, gainBRL, netToClubBRL,
  }
}


// src/lib/premissaSimulacao.ts
// ════════════════════════════════════════════════════════════════════════════
// MOTOR DE SIMULAÇÃO CONTÁBIL DA PREMISSA DE VENDA (Fase 2 do modelo do CFO).
//
// Responde, para um atleta, as perguntas do management:
//   • Qual o impacto financeiro do atleta hoje (folha + encargos + amortização)?
//   • Se vendido: qual o RESULTADO CONTÁBIL (competência) no momento?
//   • Qual o EFEITO CAIXA (cronograma de recebimento, com antecipação opcional)?
//   • A quem repasso os valores (solidariedade, sell-on, comissões, coproprietários)?
//   • Qual o impacto FUTURO evitado (folha e amortização que deixam de ocorrer)?
//
// Princípios contábeis (conforme premissa do CFO):
//   • A RECEITA de venda é reconhecida integralmente NA COMPETÊNCIA (na cabeça),
//     na data da venda — independentemente do cronograma de recebimento.
//   • Solidariedade, sell-on e intermediação também são reconhecidos na
//     competência da venda (na cabeça), cada um com o seu próprio efeito caixa.
//   • A baixa do valor residual do intangível é lançada de uma vez na venda;
//     em contrapartida, deixa de haver amortização e folha futuras.
//
// O waterfall de resultado espelha o de PageAmortizacao.calcSale (já validado),
// dirigido pelos inputs armazenados na premissa + dados do cadastro do atleta.
// ════════════════════════════════════════════════════════════════════════════

import type { PremissaAtleta, CronogramaItem } from '../types/premissas'
import type { Contract, Clause, EconomicRight } from '../types/athlete-system'
import { toBRL } from './ptax'

// ── Dados vindos do CADASTRO do atleta (custo de aquisição, amortização, folha,
//    repasses cadastrados). Montados por `deriveCadastro` a partir de contratos
//    e cláusulas — mesma lógica da aba Amortização. Tudo em BRL. ──────────────
export interface CadastroInputs {
  intangibleBRL: number          // custo de aquisição (transfer + interm. + luvas)
  monthlyAmortBRL: number         // amortização linear/mês
  accumAmortBRL: number           // amortizado até a data de referência
  residualBRL: number             // saldo do intangível a baixar na venda
  contratoFim: string | null      // fim do contrato de ENTRADA (fim da vigência)
  // % agregado a pagar a clubes/agentes sobre a mais-valia (em PONTOS: 10 = 10%)
  sellOnPct: number
  sellOnPayees: { party: string; pct: number; basis: string }[]
  // Intermediação de venda futura já cadastrada (valor fixo, BRL)
  intermedFutureBRL: number
  intermedFuturePayees: { party: string; brl: number }[]
  // Solidariedade FIFA cadastrada (em PONTOS). Só usada se a premissa não fixar a sua.
  solidariedadeCadastroPct: number
  solidariedadePayees: { party: string; pct: number }[]
  // Titularidade econômica (coproprietários). % em PONTOS (100 = 100%).
  detentores: { holder_type: string; holder_name: string; pct: number }[]
}

// ── Uma linha de fluxo de caixa datada. ─────────────────────────────────────
export interface FluxoLinha {
  data: string
  rotulo: string
  valor: number          // BRL (positivo = entrada; negativo = saída)
  vpBRL?: number         // valor presente (quando antecipado)
}

export interface SimulacaoResultado {
  // ── Impacto ANUAL/MENSAL do atleta hoje (mantendo) ────────────────────────
  folhaMensalBRL: number          // salário + imagem + encargos, por mês
  encargosMensalBRL: number
  amortizacaoMensalBRL: number
  custoMensalTotalBRL: number      // folha + amortização
  mesesRestantes: number

  // ── COMPETÊNCIA — resultado contábil da venda (reconhecido na data) ───────
  vendaBRL: number
  solidariedadeBRL: number
  baixaResidualBRL: number
  maisValiaBRL: number
  sellOnBRL: number
  comissaoBRL: number
  intermedCadastradaBRL: number
  resultadoContabilBRL: number     // ganho (+) ou perda (−) contábil na venda

  // ── EFEITO CAIXA ──────────────────────────────────────────────────────────
  recebimentos: FluxoLinha[]       // cronograma de recebimento (nominal)
  totalRecebimentoNominalBRL: number
  antecipar: boolean
  despesaFinanceiraBRL: number     // custo da antecipação (nominal − VP)
  caixaEntradaLiquidaBRL: number   // recebido líquido de despesa financeira
  saidas: FluxoLinha[]             // repasses a pagar (solidariedade, sell-on, ...)
  totalSaidasBRL: number
  caixaLiquidoBRL: number          // entrada líquida − saídas

  // ── IMPACTO FUTURO EVITADO (da venda até o fim do contrato) ───────────────
  folhaFuturaEvitadaBRL: number
  amortizacaoFuturaEvitadaBRL: number

  // ── A QUEM REPASSAR ────────────────────────────────────────────────────────
  repasses: { party: string; motivo: string; valorBRL: number }[]
}

// Total de meses (inteiros) entre duas datas ISO — piso 0.
function mesesEntre(aISO: string | null, bISO: string | null): number {
  if (!aISO || !bISO) return 0
  const a = new Date(aISO + 'T12:00:00Z')
  const b = new Date(bISO + 'T12:00:00Z')
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0
  let m = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth())
  if (b.getUTCDate() > a.getUTCDate()) m += 1
  return Math.max(0, m)
}

// Taxa mensal equivalente a partir de duas taxas anuais (CDI + spread), compostas.
function taxaMensal(cdiAA: number, spreadAA: number): number {
  const aa = (cdiAA || 0) + (spreadAA || 0)
  if (aa <= 0) return 0
  return Math.pow(1 + aa, 1 / 12) - 1
}

export function somaEncargosPct(p: PremissaAtleta): number {
  return (p.inss_patronal_pct ?? 0) + (p.fgts_pct ?? 0) +
    (p.decimo_terceiro_pct ?? 0) + (p.ferias_pct ?? 0) + (p.outros_encargos_pct ?? 0)
}

// ── Cláusulas que compõem o intangível (custo de aquisição) ─────────────────
const INTANGIBLE_CLAUSE_TYPES = new Set<Clause['clause_type']>([
  'TRANSFER_FEE_FIXO', 'INTERMEDIACAO', 'LUVAS',
])

function clauseBRL(cl: Clause, ptax: Record<string, number>): number {
  return cl.fixed_exchange_rate
    ? (cl.original_value ?? 0) * cl.fixed_exchange_rate
    : toBRL(cl.original_value ?? 0, cl.currency, ptax)
}

// ════════════════════════════════════════════════════════════════════════════
// Deriva os dados de CADASTRO do atleta para a simulação (custo de aquisição,
// amortização linear, valor residual, repasses cadastrados e titularidade).
// Mesma lógica de PageAmortizacao.buildAthleteCalcs, para um único atleta.
// ════════════════════════════════════════════════════════════════════════════
export function deriveCadastro(
  athleteId: string,
  contracts: Contract[],
  clauses: Clause[],
  rights: EconomicRight[],
  ptax: Record<string, number>,
  hojeISO: string,
): CadastroInputs {
  const hoje = new Date(hojeISO + 'T12:00:00Z')

  const aContracts = contracts
    .filter(c => c.athlete_id === athleteId)
    .sort((x, y) => (y.start_date ?? '').localeCompare(x.start_date ?? ''))
  const entry = aContracts.find(c => c.type === 'ENTRADA') ?? null

  const contratoFim = entry?.end_date ?? null
  const contractMonths = entry?.start_date && entry?.end_date
    ? mesesEntre(entry.start_date, entry.end_date) : 0
  const monthsElapsed = entry?.start_date
    ? Math.max(0, Math.min(contractMonths, mesesEntre(
      entry.start_date,
      (entry.end_date && hoje > new Date(entry.end_date + 'T12:00:00Z')) ? entry.end_date : hojeISO,
    )))
    : 0

  const intangibleItems = clauses.filter(cl =>
    cl.athlete_id === athleteId
    && (entry ? cl.contract_id === entry.id : false)
    && INTANGIBLE_CLAUSE_TYPES.has(cl.clause_type)
    && (cl.original_value ?? 0) > 0)
  const intangibleBRL = intangibleItems.reduce((s, cl) => s + clauseBRL(cl, ptax), 0)
  const monthlyAmortBRL = contractMonths > 0 ? intangibleBRL / contractMonths : 0
  const accumAmortBRL = Math.min(intangibleBRL, monthlyAmortBRL * monthsElapsed)
  const residualBRL = Math.max(0, intangibleBRL - accumAmortBRL)

  const sellOnClauses = clauses.filter(cl => cl.athlete_id === athleteId && cl.clause_type === 'SELL_ON_FEE')
  const sellOnPct = sellOnClauses.reduce((s, cl) => s + (cl.percentage_value ?? 0), 0)
  const sellOnPayees = sellOnClauses.map(cl => ({
    party: cl.creditor_party || '—',
    pct: cl.percentage_value ?? 0,
    basis: cl.condition_description || 'mais-valia',
  }))

  const intermedFutureClauses = clauses.filter(cl => cl.athlete_id === athleteId && cl.clause_type === 'INTERMEDIACAO_VENDA_FUTURA')
  const intermedFuturePayees = intermedFutureClauses.map(cl => ({
    party: cl.creditor_party || '—',
    brl: clauseBRL(cl, ptax),
  }))
  const intermedFutureBRL = intermedFuturePayees.reduce((s, p) => s + p.brl, 0)

  const solidClauses = clauses.filter(cl => cl.athlete_id === athleteId && cl.clause_type === 'SOLIDARIEDADE_FIFA')
  const solidariedadeCadastroPct = solidClauses.reduce((s, cl) => s + (cl.percentage_value ?? 0), 0)
  const solidariedadePayees = solidClauses.map(cl => ({
    party: cl.creditor_party || 'Clubes formadores (FIFA)',
    pct: cl.percentage_value ?? 0,
  }))

  const detentores = rights
    .filter(r => r.athlete_id === athleteId)
    .map(r => ({ holder_type: r.holder_type, holder_name: r.holder_name ?? '', pct: r.percentage }))

  return {
    intangibleBRL, monthlyAmortBRL, accumAmortBRL, residualBRL, contratoFim,
    sellOnPct, sellOnPayees, intermedFutureBRL, intermedFuturePayees,
    solidariedadeCadastroPct, solidariedadePayees, detentores,
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Núcleo da simulação. Puro: recebe premissa + dados de cadastro + PTAX + a data
// de referência (hoje) e devolve o resultado estruturado.
// ════════════════════════════════════════════════════════════════════════════
export function simularPremissa(
  p: PremissaAtleta,
  cad: CadastroInputs,
  ptax: Record<string, number>,
  hojeISO: string,
): SimulacaoResultado {
  // ── Data de referência da venda (competência) ─────────────────────────────
  const dataVenda = p.decisao_data || hojeISO

  // ── Impacto mensal do atleta (mantendo) ───────────────────────────────────
  const encargosPct = somaEncargosPct(p)
  // Encargos incidem sobre o salário CLT; imagem (via PJ) não sofre encargos.
  const encargosMensalBRL = (p.salario_brl ?? 0) * encargosPct
  const folhaMensalBRL = (p.salario_brl ?? 0) + (p.imagem_brl ?? 0) + encargosMensalBRL
  const amortizacaoMensalBRL = cad.monthlyAmortBRL
  const custoMensalTotalBRL = folhaMensalBRL + amortizacaoMensalBRL

  // Meses restantes da venda até o fim do contrato.
  const fim = p.contrato_fim || cad.contratoFim
  const mesesRestantes = mesesEntre(dataVenda, fim)

  // ── COMPETÊNCIA — waterfall (espelha calcSale) ────────────────────────────
  const vendaBRL = toBRL(p.venda_valor_eur ?? 0, p.venda_moeda || 'EUR', ptax)
  // Solidariedade: usa a % da premissa (fração 0..1) se informada; senão cadastro.
  const solidPctFrac = p.venda_solidariedade_pct != null
    ? p.venda_solidariedade_pct
    : (cad.solidariedadeCadastroPct || 0) / 100
  const solidariedadeBRL = vendaBRL * solidPctFrac
  const baixaResidualBRL = cad.residualBRL
  const maisValiaBRL = Math.max(0, vendaBRL - solidariedadeBRL - baixaResidualBRL)
  // Sell-on cadastrado (pontos) incide sobre a mais-valia (base padrão).
  const sellOnBRL = maisValiaBRL * ((cad.sellOnPct || 0) / 100)
  // Comissão da venda: % da premissa (fração) sobre o valor da venda.
  const comissaoBRL = vendaBRL * (p.venda_comissao_pct ?? 0)
  const intermedCadastradaBRL = cad.intermedFutureBRL
  const resultadoContabilBRL =
    vendaBRL - baixaResidualBRL - solidariedadeBRL - sellOnBRL - comissaoBRL - intermedCadastradaBRL

  // ── EFEITO CAIXA — recebimento ────────────────────────────────────────────
  // Cronograma: cada item tem `pct` (0..1) do valor da venda numa data. Sem
  // cronograma → 100% recebido à vista, na data da venda.
  const cron: CronogramaItem[] = (p.venda_recebimento_cronograma && p.venda_recebimento_cronograma.length)
    ? p.venda_recebimento_cronograma
    : [{ data: dataVenda, pct: 1 }]

  const m = taxaMensal(p.antecipacao_cdi_pct_aa ?? 0, p.antecipacao_spread_pct_aa ?? 0)

  // Fração antecipada de cada parcela.
  const totalNominal = cron.reduce((s, it) => s + (it.pct ?? 0) * vendaBRL, 0)
  let fracAntecip = 0
  if (p.antecipar) {
    if (p.antecipacao_modo === 'VALOR') {
      fracAntecip = totalNominal > 0 ? Math.min(1, (p.antecipacao_valor ?? 0) / totalNominal) : 0
    } else {
      fracAntecip = Math.min(1, Math.max(0, p.antecipacao_pct ?? 0))
    }
  }

  let despesaFinanceiraBRL = 0
  const recebimentos: FluxoLinha[] = cron.map(it => {
    const nominal = (it.pct ?? 0) * vendaBRL
    const t = mesesEntre(dataVenda, it.data)
    const desconto = m > 0 ? 1 / Math.pow(1 + m, t) : 1
    // A parte antecipada é trazida a valor presente (custo = nominal − VP).
    const antecip = nominal * fracAntecip
    const vpAntecip = antecip * desconto
    despesaFinanceiraBRL += antecip - vpAntecip
    // Valor presente exibido: parte antecipada a VP + parte no vencimento (nominal).
    const vpBRL = vpAntecip + nominal * (1 - fracAntecip)
    return { data: it.data, rotulo: `Recebimento (${((it.pct ?? 0) * 100).toFixed(0)}%)`, valor: nominal, vpBRL }
  })
  const totalRecebimentoNominalBRL = recebimentos.reduce((s, r) => s + r.valor, 0)
  const caixaEntradaLiquidaBRL = totalRecebimentoNominalBRL - despesaFinanceiraBRL

  // ── EFEITO CAIXA — saídas (repasses a pagar) ──────────────────────────────
  // v1: reconhecidas na data da venda (cada uma poderá ganhar cronograma próprio).
  const saidas: FluxoLinha[] = []
  if (solidariedadeBRL > 0) saidas.push({ data: dataVenda, rotulo: 'Solidariedade FIFA', valor: -solidariedadeBRL })
  if (sellOnBRL > 0) saidas.push({ data: dataVenda, rotulo: 'Sell-on fee', valor: -sellOnBRL })
  if (comissaoBRL > 0) saidas.push({ data: dataVenda, rotulo: 'Comissão da venda', valor: -comissaoBRL })
  if (intermedCadastradaBRL > 0) saidas.push({ data: dataVenda, rotulo: 'Intermediação (cadastrada)', valor: -intermedCadastradaBRL })
  const totalSaidasBRL = saidas.reduce((s, x) => s + Math.abs(x.valor), 0)
  const caixaLiquidoBRL = caixaEntradaLiquidaBRL - totalSaidasBRL

  // ── IMPACTO FUTURO EVITADO ─────────────────────────────────────────────────
  const folhaFuturaEvitadaBRL = folhaMensalBRL * mesesRestantes
  const amortizacaoFuturaEvitadaBRL = amortizacaoMensalBRL * mesesRestantes

  // ── A QUEM REPASSAR ─────────────────────────────────────────────────────────
  const repasses: { party: string; motivo: string; valorBRL: number }[] = []
  if (solidariedadeBRL > 0) {
    const totPct = cad.solidariedadePayees.reduce((s, x) => s + x.pct, 0)
    if (cad.solidariedadePayees.length && totPct > 0) {
      // Rateia o valor da solidariedade proporcionalmente entre os clubes formadores.
      for (const s of cad.solidariedadePayees) {
        repasses.push({ party: s.party, motivo: `Solidariedade FIFA (${s.pct}%)`, valorBRL: solidariedadeBRL * (s.pct / totPct) })
      }
    } else {
      repasses.push({ party: 'Clubes formadores (FIFA)', motivo: 'Solidariedade FIFA', valorBRL: solidariedadeBRL })
    }
  }
  for (const s of cad.sellOnPayees) {
    if (cad.sellOnPct > 0) {
      repasses.push({ party: s.party, motivo: `Sell-on ${s.pct}% (${s.basis})`, valorBRL: maisValiaBRL * (s.pct / 100) })
    }
  }
  if (comissaoBRL > 0) repasses.push({ party: 'Agente / intermediário', motivo: 'Comissão da venda', valorBRL: comissaoBRL })
  for (const pr of cad.intermedFuturePayees) {
    if (pr.brl > 0) repasses.push({ party: pr.party, motivo: 'Intermediação de venda futura', valorBRL: pr.brl })
  }
  // Coproprietários (titularidade não-BFR): recebem sua fração da receita líquida.
  const naoBFR = cad.detentores.filter(d => d.holder_type !== 'BFR' && d.pct > 0)
  for (const d of naoBFR) {
    repasses.push({
      party: d.holder_name || d.holder_type,
      motivo: `Coproprietário ${d.pct}% da titularidade`,
      valorBRL: vendaBRL * (d.pct / 100),
    })
  }

  return {
    folhaMensalBRL, encargosMensalBRL, amortizacaoMensalBRL, custoMensalTotalBRL, mesesRestantes,
    vendaBRL, solidariedadeBRL, baixaResidualBRL, maisValiaBRL, sellOnBRL, comissaoBRL,
    intermedCadastradaBRL, resultadoContabilBRL,
    recebimentos, totalRecebimentoNominalBRL, antecipar: !!p.antecipar,
    despesaFinanceiraBRL, caixaEntradaLiquidaBRL, saidas, totalSaidasBRL, caixaLiquidoBRL,
    folhaFuturaEvitadaBRL, amortizacaoFuturaEvitadaBRL,
    repasses,
  }
}

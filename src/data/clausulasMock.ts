// Dados de cláusulas extraídos dos contratos de venda de atletas.
// Fonte: análise de contratos reais (gerada por IA).
// Atualizar à medida que novos contratos forem assinados.

export type TipoClausula =
  | 'Fixed'       // Parcelas fixas garantidas
  | 'Variable'    // Bônus por performance (gols, minutos, títulos)
  | 'Contingent'  // Condicional com gatilho externo (campeonato, taça)
  | 'Sell-On'     // % sobre venda futura (net fee / lucro líquido)
  | 'Garantia'    // Piso / floor garantido (ex: piso do sell-on)
  | 'Opção'       // Put/Call option exercível por uma das partes
  | 'Proteção'    // Reembolso salarial, recompra por suspensão, etc.
  | 'Solidarity'  // Solidarity mechanism FIFA RSTP art. 21
  | 'Aceleração'  // Antecipação de parcelas por evento
  | 'Outro'

export type StatusClausula =
  | 'Ativa'                 // Cláusula em vigor, ainda não acionada
  | 'Garantida'             // Parcela fixa garantida (a receber conforme calendário)
  | 'Atingida'              // Condição cumprida / valor recebido integralmente
  | 'Parcialmente Atingida' // Condição parcialmente cumprida
  | 'Expirada'              // Prazo esgotado sem acionamento
  | 'Suspensa'              // Suspensa por cláusula contratual ou evento externo

export type TipoTransferencia =
  | 'Permanent Transfer'
  | 'Loan'
  | 'Cessão Definitiva'
  | 'Cessão Temporária'
  | 'Outro'

export type MoedaContrato = 'EUR' | 'USD' | 'BRL' | 'GBP'

export interface ClausulaVenda {
  id: number
  contratoId: number
  numeroClausula: string
  descricao: string
  tipoClausula: TipoClausula
  subtipo: string
  gatilhoCondicao: string
  valorPorEvento: number | null // null quando o valor é percentual/descritivo
  valorTexto: string            // ex: "50% do net fee", "Variável", "Proporcional"
  moeda: MoedaContrato
  teto: number | null
  tetoTexto: string             // ex: "€5M (compartilhado)", "—"
  tetoGlobalCompartilhado: boolean
  recorrente: boolean
  observacoes: string
  status: StatusClausula
  valorRealizado: number
  dataRealizacao: string
}

export interface ContratoVenda {
  id: number
  nomeAtleta: string
  nomeContrato: string
  clubeDestino: string
  dataContrato: string
  tipoTransferencia: TipoTransferencia
  moedaPrincipal: MoedaContrato
  totalFixoGarantido: number
  observacoes: string
  ativo: boolean
}

// ─── Dados dos contratos ──────────────────────────────────────────────────

export const CONTRATOS_MOCK: ContratoVenda[] = [
  {
    id: 1,
    nomeAtleta: 'Almada',
    nomeContrato: 'Almada → Atlético de Madrid',
    clubeDestino: 'Atlético de Madrid',
    dataContrato: '2025-07-15',
    tipoTransferencia: 'Permanent Transfer',
    moedaPrincipal: 'EUR',
    totalFixoGarantido: 21_750_000,
    observacoes: 'Transferência definitiva com sell-on de 50% e put option.',
    ativo: true,
  },
  {
    id: 2,
    nomeAtleta: 'Luiz Henrique',
    nomeContrato: 'Luiz Henrique → Zenit',
    clubeDestino: 'Zenit',
    dataContrato: '2025-01-19',
    tipoTransferencia: 'Permanent Transfer',
    moedaPrincipal: 'EUR',
    totalFixoGarantido: 33_000_000,
    observacoes: 'Inclui addendum com opção de pagamento acelerado (€29,7M). Cláusulas de proteção em caso de suspensão do atleta.',
    ativo: true,
  },
  {
    id: 3,
    nomeAtleta: 'Igor Jesus',
    nomeContrato: 'Igor Jesus → Nottingham Forest',
    clubeDestino: 'Nottingham Forest',
    dataContrato: '2025-06-03',
    tipoTransferencia: 'Permanent Transfer',
    moedaPrincipal: 'EUR',
    totalFixoGarantido: 19_000_000,
    observacoes: 'Parcela 1 paga antes do ITC — devolvida em 5 dias úteis se condições não cumpridas. Solidarity: Forest paga 5% total e devolve saldo não distribuído.',
    ativo: true,
  },
  {
    id: 4,
    nomeAtleta: 'Junior Santos',
    nomeContrato: 'Junior Santos → Atlético Mineiro SAF',
    clubeDestino: 'Atlético Mineiro SAF',
    dataContrato: '2025-01-20',
    tipoTransferencia: 'Cessão Definitiva',
    moedaPrincipal: 'USD',
    totalFixoGarantido: 7_500_000,
    observacoes: '⚠️ ATENÇÃO: bônus de minutos tem TRADE-OFF — ao atingir USD 500k de bônus, Botafogo PERDE automaticamente os 10% de Direitos Econômicos (Cl. 3.3.4). Conversão PTAX Compra D-10 úteis.',
    ativo: true,
  },
]

// ─── Dados das cláusulas ──────────────────────────────────────────────────

let _clausulaId = 1
const cid = () => _clausulaId++

export const CLAUSULAS_MOCK: ClausulaVenda[] = [
  // ══════════════════════════════════════════════════════════════════════
  // Contrato 1 — Almada → Atlético de Madrid
  // ══════════════════════════════════════════════════════════════════════
  {
    id: cid(), contratoId: 1,
    numeroClausula: 'Cl. 2.1(a)',
    descricao: 'Fixed Fee – Parcela 1',
    tipoClausula: 'Fixed', subtipo: '',
    gatilhoCondicao: '10 dias após exames médicos',
    valorPorEvento: 7_250_000, valorTexto: '',
    moeda: 'EUR',
    teto: null, tetoTexto: '—',
    tetoGlobalCompartilhado: false, recorrente: false,
    observacoes: 'Garantida e incondicional.',
    status: 'Garantida', valorRealizado: 0, dataRealizacao: '',
  },
  {
    id: cid(), contratoId: 1,
    numeroClausula: 'Cl. 2.1(b)',
    descricao: 'Fixed Fee – Parcela 2',
    tipoClausula: 'Fixed', subtipo: '',
    gatilhoCondicao: '25 de julho de 2026',
    valorPorEvento: 7_250_000, valorTexto: '',
    moeda: 'EUR',
    teto: null, tetoTexto: '—',
    tetoGlobalCompartilhado: false, recorrente: false,
    observacoes: 'Garantida e incondicional.',
    status: 'Garantida', valorRealizado: 0, dataRealizacao: '',
  },
  {
    id: cid(), contratoId: 1,
    numeroClausula: 'Cl. 2.1(c)',
    descricao: 'Fixed Fee – Parcela 3',
    tipoClausula: 'Fixed', subtipo: '',
    gatilhoCondicao: '25 de julho de 2027',
    valorPorEvento: 7_250_000, valorTexto: '',
    moeda: 'EUR',
    teto: null, tetoTexto: '—',
    tetoGlobalCompartilhado: false, recorrente: false,
    observacoes: 'Garantida e incondicional.',
    status: 'Garantida', valorRealizado: 0, dataRealizacao: '',
  },
  {
    id: cid(), contratoId: 1,
    numeroClausula: 'Cl. 5.1(a)',
    descricao: 'Bônus – Gols (bloco de 10)',
    tipoClausula: 'Variable', subtipo: 'Performance Individual',
    gatilhoCondicao: 'A cada 10 gols em jogos oficiais na equipe principal',
    valorPorEvento: 250_000, valorTexto: '',
    moeda: 'EUR',
    teto: 5_000_000, tetoTexto: '€5M (teto global compartilhado)',
    tetoGlobalCompartilhado: true, recorrente: true,
    observacoes: 'Recorrente por múltiplos de 10. Teto global €5M compartilhado com todos os variáveis do contrato.',
    status: 'Ativa', valorRealizado: 0, dataRealizacao: '',
  },
  {
    id: cid(), contratoId: 1,
    numeroClausula: 'Cl. 5.1(a)',
    descricao: 'Bônus – Assistências (bloco de 15)',
    tipoClausula: 'Variable', subtipo: 'Performance Individual',
    gatilhoCondicao: 'A cada 15 assistências em jogos oficiais na equipe principal',
    valorPorEvento: 250_000, valorTexto: '',
    moeda: 'EUR',
    teto: 5_000_000, tetoTexto: '€5M (teto global compartilhado)',
    tetoGlobalCompartilhado: true, recorrente: true,
    observacoes: 'Recorrente por múltiplos de 15. Teto global €5M.',
    status: 'Ativa', valorRealizado: 0, dataRealizacao: '',
  },
  {
    id: cid(), contratoId: 1,
    numeroClausula: 'Cl. 5.1(b)',
    descricao: 'Bônus – Minutos La Liga (bloco de 25 jogos)',
    tipoClausula: 'Variable', subtipo: 'Disponibilidade',
    gatilhoCondicao: 'A cada 25 jogos com ≥45 min na La Liga (25, 50, 75, 100…)',
    valorPorEvento: 250_000, valorTexto: '',
    moeda: 'EUR',
    teto: 5_000_000, tetoTexto: '€5M (teto global compartilhado)',
    tetoGlobalCompartilhado: true, recorrente: true,
    observacoes: 'Recorrente por múltiplos de 25. Teto global €5M.',
    status: 'Ativa', valorRealizado: 0, dataRealizacao: '',
  },
  {
    id: cid(), contratoId: 1,
    numeroClausula: 'Cl. 5.1(c)',
    descricao: 'Bônus – UCL Quartas-de-Final',
    tipoClausula: 'Variable', subtipo: 'Resultado Coletivo',
    gatilhoCondicao: 'Atlético chega às quartas da UCL com ≥50% participação do jogador na competição',
    valorPorEvento: 500_000, valorTexto: '',
    moeda: 'EUR',
    teto: 5_000_000, tetoTexto: '€5M (teto global compartilhado)',
    tetoGlobalCompartilhado: true, recorrente: true,
    observacoes: 'Recorrente por edição da UCL. Teto global €5M.',
    status: 'Ativa', valorRealizado: 0, dataRealizacao: '',
  },
  {
    id: cid(), contratoId: 1,
    numeroClausula: 'Cl. 5.1(d)',
    descricao: 'Bônus – Título La Liga',
    tipoClausula: 'Variable', subtipo: 'Resultado Coletivo',
    gatilhoCondicao: 'Atlético vence a La Liga com jogador sob contrato ativo',
    valorPorEvento: 500_000, valorTexto: '',
    moeda: 'EUR',
    teto: 5_000_000, tetoTexto: '€5M (teto global compartilhado)',
    tetoGlobalCompartilhado: true, recorrente: true,
    observacoes: 'Recorrente por título. Teto global €5M.',
    status: 'Ativa', valorRealizado: 0, dataRealizacao: '',
  },
  {
    id: cid(), contratoId: 1,
    numeroClausula: 'Cl. 5.1(d)',
    descricao: 'Bônus – Título UEFA (qualquer competição)',
    tipoClausula: 'Variable', subtipo: 'Resultado Coletivo',
    gatilhoCondicao: 'Atlético vence qualquer competição oficial da UEFA com jogador ativo',
    valorPorEvento: 500_000, valorTexto: '',
    moeda: 'EUR',
    teto: 5_000_000, tetoTexto: '€5M (teto global compartilhado)',
    tetoGlobalCompartilhado: true, recorrente: true,
    observacoes: 'Recorrente por título. Teto global €5M.',
    status: 'Ativa', valorRealizado: 0, dataRealizacao: '',
  },
  {
    id: cid(), contratoId: 1,
    numeroClausula: 'Cl. 5.1(d)',
    descricao: 'Bônus – Título FIFA (qualquer competição)',
    tipoClausula: 'Variable', subtipo: 'Resultado Coletivo',
    gatilhoCondicao: 'Atlético vence qualquer competição oficial da FIFA com jogador ativo',
    valorPorEvento: 500_000, valorTexto: '',
    moeda: 'EUR',
    teto: 5_000_000, tetoTexto: '€5M (teto global compartilhado)',
    tetoGlobalCompartilhado: true, recorrente: true,
    observacoes: 'Recorrente por título. Teto global €5M.',
    status: 'Ativa', valorRealizado: 0, dataRealizacao: '',
  },
  {
    id: cid(), contratoId: 1,
    numeroClausula: 'Cl. 4.1',
    descricao: 'Sell-On Fee – 50% do Net Fee',
    tipoClausula: 'Sell-On', subtipo: '',
    gatilhoCondicao: 'Qualquer futura transferência (temp. ou def.) do jogador para terceiro',
    valorPorEvento: null, valorTexto: '50% do net fee',
    moeda: 'EUR',
    teto: null, tetoTexto: '—',
    tetoGlobalCompartilhado: false, recorrente: false,
    observacoes: 'Net fee = bruto − intermediação (máx 10%) − solidarity. Aplica a empréstimos e trocas (valor de mercado para trocas per cl. 4.7).',
    status: 'Ativa', valorRealizado: 0, dataRealizacao: '',
  },
  {
    id: cid(), contratoId: 1,
    numeroClausula: 'Cl. 4.7',
    descricao: 'Piso do Sell-On – Garantia de €10M',
    tipoClausula: 'Garantia', subtipo: '',
    gatilhoCondicao: 'Se participação líquida do Botafogo em venda futura < €10M',
    valorPorEvento: 10_000_000, valorTexto: 'Mín. €10M',
    moeda: 'EUR',
    teto: null, tetoTexto: '—',
    tetoGlobalCompartilhado: false, recorrente: false,
    observacoes: 'Atlético complementa a diferença até €10M. Garante receita mínima para o Botafogo na primeira revenda.',
    status: 'Ativa', valorRealizado: 0, dataRealizacao: '',
  },
  {
    id: cid(), contratoId: 1,
    numeroClausula: 'Cl. 4.8',
    descricao: 'Put Option – Inatividade 3 anos',
    tipoClausula: 'Opção', subtipo: 'Put Option',
    gatilhoCondicao: 'Se 3 anos após assinatura o jogador não tiver sido vendido definitivamente',
    valorPorEvento: 10_000_000, valorTexto: '€10M',
    moeda: 'EUR',
    teto: null, tetoTexto: '—',
    tetoGlobalCompartilhado: false, recorrente: false,
    observacoes: 'Direito exclusivo do Botafogo. 2 parcelas: 50% em 30 dias + 50% em 12 meses. Exercível a partir de jul/2028.',
    status: 'Ativa', valorRealizado: 0, dataRealizacao: '',
  },
  {
    id: cid(), contratoId: 1,
    numeroClausula: 'Cl. 4.5',
    descricao: 'Option to Sell – Oferta Recusada ≥€43,5M',
    tipoClausula: 'Opção', subtipo: 'Option to Sell',
    gatilhoCondicao: 'Atlético recusa oferta formal verificável ≥€43,5M de terceiro',
    valorPorEvento: null, valorTexto: '50% × valor da oferta',
    moeda: 'EUR',
    teto: null, tetoTexto: '—',
    tetoGlobalCompartilhado: false, recorrente: false,
    observacoes: 'Botafogo notificado em 48h; 15 dias para exercer o direito de venda a 50% do valor da oferta recusada.',
    status: 'Ativa', valorRealizado: 0, dataRealizacao: '',
  },

  // ══════════════════════════════════════════════════════════════════════
  // Contrato 2 — Luiz Henrique → Zenit
  // ══════════════════════════════════════════════════════════════════════
  {
    id: cid(), contratoId: 2,
    numeroClausula: 'Cl. 4.1(i)',
    descricao: 'Fixed Fee – Parcela 1',
    tipoClausula: 'Fixed', subtipo: '',
    gatilhoCondicao: '30 dias após entrega do ITC pelo CBF',
    valorPorEvento: 5_000_000, valorTexto: '',
    moeda: 'EUR',
    teto: null, tetoTexto: '—',
    tetoGlobalCompartilhado: false, recorrente: false,
    observacoes: 'Garantida.',
    status: 'Garantida', valorRealizado: 0, dataRealizacao: '',
  },
  {
    id: cid(), contratoId: 2,
    numeroClausula: 'Cl. 4.1(ii)',
    descricao: 'Fixed Fee – Parcela 2',
    tipoClausula: 'Fixed', subtipo: '',
    gatilhoCondicao: 'Até 01/10/2025',
    valorPorEvento: 7_000_000, valorTexto: '',
    moeda: 'EUR',
    teto: null, tetoTexto: '—',
    tetoGlobalCompartilhado: false, recorrente: false,
    observacoes: 'Garantida.',
    status: 'Garantida', valorRealizado: 0, dataRealizacao: '',
  },
  {
    id: cid(), contratoId: 2,
    numeroClausula: 'Cl. 4.1(iii)',
    descricao: 'Fixed Fee – Parcela 3',
    tipoClausula: 'Fixed', subtipo: '',
    gatilhoCondicao: 'Até 01/04/2026',
    valorPorEvento: 7_000_000, valorTexto: '',
    moeda: 'EUR',
    teto: null, tetoTexto: '—',
    tetoGlobalCompartilhado: false, recorrente: false,
    observacoes: 'Garantida.',
    status: 'Garantida', valorRealizado: 0, dataRealizacao: '',
  },
  {
    id: cid(), contratoId: 2,
    numeroClausula: 'Cl. 4.1(iv)',
    descricao: 'Fixed Fee – Parcela 4',
    tipoClausula: 'Fixed', subtipo: '',
    gatilhoCondicao: 'Até 01/10/2026',
    valorPorEvento: 7_000_000, valorTexto: '',
    moeda: 'EUR',
    teto: null, tetoTexto: '—',
    tetoGlobalCompartilhado: false, recorrente: false,
    observacoes: 'Garantida.',
    status: 'Garantida', valorRealizado: 0, dataRealizacao: '',
  },
  {
    id: cid(), contratoId: 2,
    numeroClausula: 'Cl. 4.1(v)',
    descricao: 'Fixed Fee – Parcela 5',
    tipoClausula: 'Fixed', subtipo: '',
    gatilhoCondicao: 'Até 01/04/2027',
    valorPorEvento: 7_000_000, valorTexto: '',
    moeda: 'EUR',
    teto: null, tetoTexto: '—',
    tetoGlobalCompartilhado: false, recorrente: false,
    observacoes: 'Garantida.',
    status: 'Garantida', valorRealizado: 0, dataRealizacao: '',
  },
  {
    id: cid(), contratoId: 2,
    numeroClausula: 'Addendum',
    descricao: 'Fixed Fee Acelerado (opcional)',
    tipoClausula: 'Aceleração', subtipo: 'Antecipação com Desconto',
    gatilhoCondicao: 'Botafogo exerce opção de antecipação após entrega do ITC',
    valorPorEvento: 29_700_000, valorTexto: '',
    moeda: 'EUR',
    teto: null, tetoTexto: '—',
    tetoGlobalCompartilhado: false, recorrente: false,
    observacoes: 'Substitui as 5 parcelas normais. Desconto automático de €3,3M aplicado. Decisão do Botafogo exercer ou não.',
    status: 'Ativa', valorRealizado: 0, dataRealizacao: '',
  },
  {
    id: cid(), contratoId: 2,
    numeroClausula: 'Cl. 4.2(i)',
    descricao: 'Bônus – Russian Premier League',
    tipoClausula: 'Contingent', subtipo: 'Título Nacional',
    gatilhoCondicao: 'Zenit vence a RPL (a partir de 2025/26) com jogador titular em ≥2/3 dos jogos da temporada',
    valorPorEvento: 500_000, valorTexto: '',
    moeda: 'EUR',
    teto: 2_000_000, tetoTexto: '€2M (compartilhado com Russian Cup)',
    tetoGlobalCompartilhado: true, recorrente: true,
    observacoes: 'Teto global €2M compartilhado com bônus da Russian Cup. Caduca se jogador sair do Zenit.',
    status: 'Ativa', valorRealizado: 0, dataRealizacao: '',
  },
  {
    id: cid(), contratoId: 2,
    numeroClausula: 'Cl. 4.2(ii)',
    descricao: 'Bônus – Russian Cup',
    tipoClausula: 'Contingent', subtipo: 'Título Nacional',
    gatilhoCondicao: 'Zenit vence a Russian Cup (a partir de 2025/26) com jogador titular em ≥2/3 dos jogos da Cup',
    valorPorEvento: 250_000, valorTexto: '',
    moeda: 'EUR',
    teto: 2_000_000, tetoTexto: '€2M (compartilhado com RPL)',
    tetoGlobalCompartilhado: true, recorrente: true,
    observacoes: 'Teto global €2M compartilhado. Caduca se jogador sair do Zenit.',
    status: 'Ativa', valorRealizado: 0, dataRealizacao: '',
  },
  {
    id: cid(), contratoId: 2,
    numeroClausula: 'Cl. 4.3',
    descricao: 'Sell-On Fee – 20% do Lucro Líquido',
    tipoClausula: 'Sell-On', subtipo: '',
    gatilhoCondicao: 'Futura transferência (temp. ou def.) do jogador a terceiro clube',
    valorPorEvento: null, valorTexto: '20% do lucro líquido do Zenit',
    moeda: 'EUR',
    teto: null, tetoTexto: '—',
    tetoGlobalCompartilhado: false, recorrente: false,
    observacoes: 'Base = receita líquida − pagtos ao Botafogo − solidarity. Vigora enquanto durar vínculo (inc. renovações e novos contratos em até 3 meses após saída).',
    status: 'Ativa', valorRealizado: 0, dataRealizacao: '',
  },
  {
    id: cid(), contratoId: 2,
    numeroClausula: 'Cl. 5.2.1',
    descricao: 'Reembolso Salarial – Suspensão ≤12 meses',
    tipoClausula: 'Proteção', subtipo: 'Reembolso Salarial',
    gatilhoCondicao: 'Jogador suspenso ou impedido de jogar na Rússia por até 12 meses',
    valorPorEvento: null, valorTexto: 'Reembolso integral do salário',
    moeda: 'EUR',
    teto: null, tetoTexto: '—',
    tetoGlobalCompartilhado: false, recorrente: false,
    observacoes: 'Pago pelo Zenit ao Botafogo durante o período de suspensão. Cobre sanções FIFA/UEFA e decisões judiciais.',
    status: 'Ativa', valorRealizado: 0, dataRealizacao: '',
  },
  {
    id: cid(), contratoId: 2,
    numeroClausula: 'Cl. 5.2.1',
    descricao: 'Recompra – Suspensão >12 meses',
    tipoClausula: 'Proteção', subtipo: 'Opção de Recompra',
    gatilhoCondicao: 'Jogador suspenso ou impedido por mais de 12 meses',
    valorPorEvento: null, valorTexto: '75% do saldo a amortizar da fixed fee',
    moeda: 'EUR',
    teto: null, tetoTexto: '—',
    tetoGlobalCompartilhado: false, recorrente: false,
    observacoes: 'Pro rata do contrato restante (base até 5 anos per art. 18.2 FIFA RSTP). Opção do Botafogo de recomprar os direitos do jogador.',
    status: 'Ativa', valorRealizado: 0, dataRealizacao: '',
  },

  // ══════════════════════════════════════════════════════════════════════
  // Contrato 3 — Igor Jesus → Nottingham Forest
  // ══════════════════════════════════════════════════════════════════════
  {
    id: cid(), contratoId: 3,
    numeroClausula: 'Cl. 3.1(i)',
    descricao: 'Guaranteed Fee – Parcela 1',
    tipoClausula: 'Fixed', subtipo: '',
    gatilhoCondicao: '4 de junho de 2025',
    valorPorEvento: 5_000_000, valorTexto: '',
    moeda: 'EUR',
    teto: null, tetoTexto: '—',
    tetoGlobalCompartilhado: false, recorrente: false,
    observacoes: 'Paga antes do ITC. Devolvida em 5 dias úteis se condições não cumpridas.',
    status: 'Garantida', valorRealizado: 0, dataRealizacao: '',
  },
  {
    id: cid(), contratoId: 3,
    numeroClausula: 'Cl. 3.1(ii)',
    descricao: 'Guaranteed Fee – Parcela 2',
    tipoClausula: 'Fixed', subtipo: '',
    gatilhoCondicao: '1º de julho de 2026',
    valorPorEvento: 4_000_000, valorTexto: '',
    moeda: 'EUR',
    teto: null, tetoTexto: '—',
    tetoGlobalCompartilhado: false, recorrente: false,
    observacoes: 'Garantida.',
    status: 'Garantida', valorRealizado: 0, dataRealizacao: '',
  },
  {
    id: cid(), contratoId: 3,
    numeroClausula: 'Cl. 3.1(iii)',
    descricao: 'Guaranteed Fee – Parcela 3',
    tipoClausula: 'Fixed', subtipo: '',
    gatilhoCondicao: '1º de julho de 2027',
    valorPorEvento: 5_000_000, valorTexto: '',
    moeda: 'EUR',
    teto: null, tetoTexto: '—',
    tetoGlobalCompartilhado: false, recorrente: false,
    observacoes: 'Garantida.',
    status: 'Garantida', valorRealizado: 0, dataRealizacao: '',
  },
  {
    id: cid(), contratoId: 3,
    numeroClausula: 'Cl. 3.1(iv)',
    descricao: 'Guaranteed Fee – Parcela 4',
    tipoClausula: 'Fixed', subtipo: '',
    gatilhoCondicao: '1º de março de 2028',
    valorPorEvento: 5_000_000, valorTexto: '',
    moeda: 'EUR',
    teto: null, tetoTexto: '—',
    tetoGlobalCompartilhado: false, recorrente: false,
    observacoes: 'Garantida.',
    status: 'Garantida', valorRealizado: 0, dataRealizacao: '',
  },
  {
    id: cid(), contratoId: 3,
    numeroClausula: 'Whereas (d)',
    descricao: 'Sell-On Fee – 10% do Net Fee',
    tipoClausula: 'Sell-On', subtipo: '',
    gatilhoCondicao: 'Qualquer futura transferência (temp. ou def.) do jogador para terceiro clube',
    valorPorEvento: null, valorTexto: '10% do net fee',
    moeda: 'EUR',
    teto: null, tetoTexto: '—',
    tetoGlobalCompartilhado: false, recorrente: false,
    observacoes: 'Troca de jogadores: valor calculado a mercado (cl. 3.7). Sem piso garantido.',
    status: 'Ativa', valorRealizado: 0, dataRealizacao: '',
  },
  {
    id: cid(), contratoId: 3,
    numeroClausula: 'Cl. 3.2',
    descricao: 'Retorno de Solidarity não distribuído',
    tipoClausula: 'Solidarity', subtipo: '',
    gatilhoCondicao: 'Valores dos 5% de solidarity não distribuídos aos clubes formadores',
    valorPorEvento: null, valorTexto: 'Variável',
    moeda: 'EUR',
    teto: null, tetoTexto: '—',
    tetoGlobalCompartilhado: false, recorrente: false,
    observacoes: 'Forest paga 5% total; devolve ao Botafogo o saldo não distribuído aos clubes formadores conforme FIFA RSTP art. 21.',
    status: 'Ativa', valorRealizado: 0, dataRealizacao: '',
  },

  // ══════════════════════════════════════════════════════════════════════
  // Contrato 4 — Junior Santos → Atlético Mineiro SAF
  // ══════════════════════════════════════════════════════════════════════
  {
    id: cid(), contratoId: 4,
    numeroClausula: 'Cl. 3.1.1',
    descricao: 'Taxa Transferência – Parcela 1',
    tipoClausula: 'Fixed', subtipo: '',
    gatilhoCondicao: '20/02/2025',
    valorPorEvento: 1_000_000, valorTexto: '',
    moeda: 'USD',
    teto: null, tetoTexto: '—',
    tetoGlobalCompartilhado: false, recorrente: false,
    observacoes: 'Conversão PTAX Compra D-10 úteis. Carência 10 dias.',
    status: 'Garantida', valorRealizado: 0, dataRealizacao: '',
  },
  {
    id: cid(), contratoId: 4,
    numeroClausula: 'Cl. 3.1.2',
    descricao: 'Taxa Transferência – Parcela 2',
    tipoClausula: 'Fixed', subtipo: '',
    gatilhoCondicao: '30/04/2025',
    valorPorEvento: 1_000_000, valorTexto: '',
    moeda: 'USD',
    teto: null, tetoTexto: '—',
    tetoGlobalCompartilhado: false, recorrente: false,
    observacoes: 'Conversão PTAX Compra D-10 úteis.',
    status: 'Garantida', valorRealizado: 0, dataRealizacao: '',
  },
  {
    id: cid(), contratoId: 4,
    numeroClausula: 'Cl. 3.1.3',
    descricao: 'Taxa Transferência – Parcela 3',
    tipoClausula: 'Fixed', subtipo: '',
    gatilhoCondicao: '31/10/2025',
    valorPorEvento: 1_000_000, valorTexto: '',
    moeda: 'USD',
    teto: null, tetoTexto: '—',
    tetoGlobalCompartilhado: false, recorrente: false,
    observacoes: 'Conversão PTAX Compra D-10 úteis.',
    status: 'Garantida', valorRealizado: 0, dataRealizacao: '',
  },
  {
    id: cid(), contratoId: 4,
    numeroClausula: 'Cl. 3.1.4',
    descricao: 'Taxa Transferência – Parcela 4',
    tipoClausula: 'Fixed', subtipo: '',
    gatilhoCondicao: '31/12/2025',
    valorPorEvento: 1_000_000, valorTexto: '',
    moeda: 'USD',
    teto: null, tetoTexto: '—',
    tetoGlobalCompartilhado: false, recorrente: false,
    observacoes: 'Conversão PTAX Compra D-10 úteis.',
    status: 'Garantida', valorRealizado: 0, dataRealizacao: '',
  },
  {
    id: cid(), contratoId: 4,
    numeroClausula: 'Cl. 3.1.5',
    descricao: 'Taxa Transferência – Parcela 5',
    tipoClausula: 'Fixed', subtipo: '',
    gatilhoCondicao: '30/04/2026',
    valorPorEvento: 1_500_000, valorTexto: '',
    moeda: 'USD',
    teto: null, tetoTexto: '—',
    tetoGlobalCompartilhado: false, recorrente: false,
    observacoes: 'Conversão PTAX Compra D-10 úteis.',
    status: 'Garantida', valorRealizado: 0, dataRealizacao: '',
  },
  {
    id: cid(), contratoId: 4,
    numeroClausula: 'Cl. 3.1.6',
    descricao: 'Taxa Transferência – Parcela 6',
    tipoClausula: 'Fixed', subtipo: '',
    gatilhoCondicao: '31/10/2026',
    valorPorEvento: 1_000_000, valorTexto: '',
    moeda: 'USD',
    teto: null, tetoTexto: '—',
    tetoGlobalCompartilhado: false, recorrente: false,
    observacoes: 'Conversão PTAX Compra D-10 úteis.',
    status: 'Garantida', valorRealizado: 0, dataRealizacao: '',
  },
  {
    id: cid(), contratoId: 4,
    numeroClausula: 'Cl. 3.1.7',
    descricao: 'Taxa Transferência – Parcela 7',
    tipoClausula: 'Fixed', subtipo: '',
    gatilhoCondicao: '30/04/2027',
    valorPorEvento: 1_000_000, valorTexto: '',
    moeda: 'USD',
    teto: null, tetoTexto: '—',
    tetoGlobalCompartilhado: false, recorrente: false,
    observacoes: 'Conversão PTAX Compra D-10 úteis.',
    status: 'Garantida', valorRealizado: 0, dataRealizacao: '',
  },
  {
    id: cid(), contratoId: 4,
    numeroClausula: 'Cl. 3.3.1',
    descricao: 'Bônus – Minutos Temporada (1ª ocorrência)',
    tipoClausula: 'Variable', subtipo: 'Disponibilidade',
    gatilhoCondicao: 'Atleta atua em ≥45 jogos oficiais com ≥45 min cada (apenas 90 min regulamentares) em 1 temporada',
    valorPorEvento: 250_000, valorTexto: '',
    moeda: 'USD',
    teto: 500_000, tetoTexto: 'USD 500k (2 ocorrências totais)',
    tetoGlobalCompartilhado: false, recorrente: true,
    observacoes: '⚠️ TRADE-OFF CRÍTICO: ao atingir o teto de USD 500k (2ª ocorrência), Botafogo PERDE automaticamente os 10% de Direitos Econômicos (Cl. 3.3.4). Avaliar antes de confirmar o bônus.',
    status: 'Ativa', valorRealizado: 0, dataRealizacao: '',
  },
  {
    id: cid(), contratoId: 4,
    numeroClausula: 'Cl. 3.3.1',
    descricao: 'Bônus – Minutos Temporada (2ª ocorrência / teto)',
    tipoClausula: 'Variable', subtipo: 'Disponibilidade',
    gatilhoCondicao: 'Atleta atua em ≥45 jogos com ≥45 min em 2ª temporada elegível',
    valorPorEvento: 250_000, valorTexto: '',
    moeda: 'USD',
    teto: 500_000, tetoTexto: 'USD 500k (teto atingido — perde DE)',
    tetoGlobalCompartilhado: false, recorrente: false,
    observacoes: '⚠️ ATENÇÃO: esta ocorrência atinge o teto de USD 500k — Botafogo PERDE automaticamente os 10% de Direitos Econômicos. Não confirmar sem análise do impacto no sell-on.',
    status: 'Ativa', valorRealizado: 0, dataRealizacao: '',
  },
  {
    id: cid(), contratoId: 4,
    numeroClausula: 'Cl. 4.1',
    descricao: 'Direitos Econômicos – 10% do Valor Líquido',
    tipoClausula: 'Sell-On', subtipo: '',
    gatilhoCondicao: 'Qualquer transferência definitiva ou temporária onerosa do atleta pelo Atlético a terceiro',
    valorPorEvento: null, valorTexto: '10% do Valor Líquido',
    moeda: 'USD',
    teto: null, tetoTexto: '—',
    tetoGlobalCompartilhado: false, recorrente: false,
    observacoes: 'Valor Líquido = bruto − tributos − outros detentores − indeniz. formação − intermediários (máx 10%). ⚠️ CADUCA automaticamente se bônus de minutos atingir USD 500k (Cl. 3.3.4).',
    status: 'Ativa', valorRealizado: 0, dataRealizacao: '',
  },
  {
    id: cid(), contratoId: 4,
    numeroClausula: 'Cl. 3.2',
    descricao: 'Antecipação de Parcelas Vincendas',
    tipoClausula: 'Aceleração', subtipo: '',
    gatilhoCondicao: 'Atlético vende atleta por valor líquido > taxa de transferência E com fluxo mais benéfico que parcelas vincendas',
    valorPorEvento: null, valorTexto: 'Proporcional',
    moeda: 'USD',
    teto: null, tetoTexto: '—',
    tetoGlobalCompartilhado: false, recorrente: false,
    observacoes: 'Parcelas vincendas antecipadas em até 30 dias do recebimento pelo Atlético. Condicional ao fluxo financeiro ser mais benéfico.',
    status: 'Ativa', valorRealizado: 0, dataRealizacao: '',
  },
  {
    id: cid(), contratoId: 4,
    numeroClausula: 'Cl. 4.5',
    descricao: 'Indenização por Rescisão Culposa',
    tipoClausula: 'Proteção', subtipo: 'Indenização',
    gatilhoCondicao: 'Atlético der causa à rescisão sem contrapartida E atleta se vincular a outro clube',
    valorPorEvento: 750_000, valorTexto: '',
    moeda: 'USD',
    teto: null, tetoTexto: '—',
    tetoGlobalCompartilhado: false, recorrente: false,
    observacoes: 'Pago em 30 dias. Não se aplica se Botafogo já perdeu os 10% de DE (Cl. 4.5.1).',
    status: 'Ativa', valorRealizado: 0, dataRealizacao: '',
  },
]

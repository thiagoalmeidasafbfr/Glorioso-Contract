export type StatusContrato = 'Elenco' | 'Emprestado' | 'Rescindido'
export type Alocacao = 'Profissional' | 'Base'
export type Moeda = 'BRL' | 'USD' | 'EUR'
export type StatusParcela = 'A pagar' | 'Atrasado' | 'Pago' | 'Parcial' | 'Aguardando condição'

export interface BichoCompetição {
  competição: string
  ano: number
  valor: number
}

export interface PagamentoCerto {
  id: number
  atletaId: number
  despesa: string
  contrato: string
  parcela: string
  vencimento: string
  valor: number
  moeda: Moeda
  vencAntecipado: boolean
  parcial: number | null
  moedaParcial: Moeda | null
  status: StatusParcela
}

export interface PagamentoCondicional {
  id: number
  atletaId: number
  despesa: string
  contrato: string
  detalhesCondicao: string
  valor: number | string
  moeda: Moeda
  vencAntecipado: boolean
  vencimento: string
  parcial: number | null
  moedaParcial: Moeda | null
  status: StatusParcela
}

export interface Acordo {
  id: number
  atletaId: number
  natureza: string
  naturezaDivida: string
  parcela: string
  condicao: string
  credor: string
  vencAntecipado: string
  valor: number
  moedaContrato: Moeda
  vencimento: string
  dataLiquidacao: string | null
  status: StatusParcela
}

export interface CondicionalSalario {
  id: number
  atletaId: number
  condicao: string
  despesa: string
  detalhes: string
  valor: number | string
  moeda: Moeda
  status: StatusParcela
}

export interface PassivoClube {
  id: number
  atletaId: number
  contrato: string
  despesa: string
  credor: string
  condicional: boolean
  parcela: string
  vencimento: string
  valor: number
  moeda: Moeda
  parcial: number | null
  moedaParcial: Moeda | null
  saldoMoedaContrato: number
  saldoBRL: number
  condicao: string
  vencAntecipado: boolean
  solidariedade: boolean
  dataLiquidacao: string | null
  status: StatusParcela
}

export interface PassivoIntermediario {
  id: number
  atletaId: number
  contrato: string
  despesa: string
  intermediario: string
  condicional: boolean
  parcela: string
  vencimento: string
  valor: number
  moeda: Moeda
  parcial: number | null
  moedaParcial: Moeda | null
  saldoBRL: number
  condicao: string
  teorMulta: string
  vencAntecipado: boolean
  dataLiquidacao: string | null
  status: StatusParcela
}

export interface Atleta {
  id: number
  nome: string
  nomeCompleto: string
  posicao: string
  dataNascimento: string
  paisNascimento: string
  fotoArquivo: string
  statusContrato: StatusContrato
  alocacao: Alocacao
  clubeAnterior: string
  percSAF: number
  inicioContrato: string
  fimContrato: string
  // Salário
  salarioCLT: number
  direitoImagem: number
  auxilioMoradiaM: number
  auxilioAlimentacaoM: number
  auxilioViagemA: number
  outrosAuxiliosM: number
  // Transfer Fee
  transferFeeTotal: number
  transferFeeQuitado: number
  transferFeePendente: number
  transferFeeAcordo: number
  transferFeeMoeda: Moeda
  // Mercado e Multas
  valorMercado: number
  valorMercadoMoeda: Moeda
  multaInternacional: string
  multaNacional: string
  multaCompensatoria: string
  // Intermediários
  intermediarios: { nome: string; percVendaFutura: number }[]
  // Bicho
  bichos: BichoCompetição[]
}

export const atletas: Atleta[] = [
  {
    id: 1,
    nome: 'Igor Jesus',
    nomeCompleto: 'IGOR JESUS LIMA SANTOS',
    posicao: 'Atacante',
    dataNascimento: '2001-10-27',
    paisNascimento: 'Brasil',
    fotoArquivo: 'Igor Jesus.JPG',
    statusContrato: 'Elenco',
    alocacao: 'Profissional',
    clubeAnterior: 'Novorizontino',
    percSAF: 100,
    inicioContrato: '2024-01-01',
    fimContrato: '2026-12-31',
    salarioCLT: 80000,
    direitoImagem: 120000,
    auxilioMoradiaM: 5000,
    auxilioAlimentacaoM: 2000,
    auxilioViagemA: 12000,
    outrosAuxiliosM: 0,
    transferFeeTotal: 0,
    transferFeeQuitado: 0,
    transferFeePendente: 0,
    transferFeeAcordo: 0,
    transferFeeMoeda: 'BRL',
    valorMercado: 8000000,
    valorMercadoMoeda: 'EUR',
    multaInternacional: '30.000.000,00 Euro',
    multaNacional: '1500X valor médio do salário',
    multaCompensatoria: 'Residual de salários até o final do contrato',
    intermediarios: [{ nome: 'JORGE MACHADO', percVendaFutura: 5 }],
    bichos: [
      { competição: 'Brasileiro', ano: 2024, valor: 0 },
      { competição: 'Copa do Brasil', ano: 2024, valor: 0 },
      { competição: 'Libertadores', ano: 2024, valor: 0 },
      { competição: 'Brasileiro', ano: 2025, valor: 180000 },
      { competição: 'Copa do Brasil', ano: 2025, valor: 18000 },
      { competição: 'Libertadores', ano: 2025, valor: 1270000 },
      { competição: 'Mundial', ano: 2025, valor: 2000000 },
    ],
  },
  {
    id: 2,
    nome: 'Marlon Freitas',
    nomeCompleto: 'MARLON DE SOUZA FREITAS',
    posicao: 'Volante',
    dataNascimento: '1998-06-09',
    paisNascimento: 'Brasil',
    fotoArquivo: 'Marlon Freitas.JPG',
    statusContrato: 'Elenco',
    alocacao: 'Profissional',
    clubeAnterior: 'Athletico-PR',
    percSAF: 100,
    inicioContrato: '2023-07-01',
    fimContrato: '2026-06-30',
    salarioCLT: 70000,
    direitoImagem: 100000,
    auxilioMoradiaM: 4000,
    auxilioAlimentacaoM: 2000,
    auxilioViagemA: 10000,
    outrosAuxiliosM: 0,
    transferFeeTotal: 3500000,
    transferFeeQuitado: 3500000,
    transferFeePendente: 0,
    transferFeeAcordo: 0,
    transferFeeMoeda: 'BRL',
    valorMercado: 5000000,
    valorMercadoMoeda: 'EUR',
    multaInternacional: '20.000.000,00 Euro',
    multaNacional: '1200X valor médio do salário',
    multaCompensatoria: 'Residual de salários até o final do contrato',
    intermediarios: [{ nome: 'CARLOS PEREIRA', percVendaFutura: 8 }],
    bichos: [
      { competição: 'Brasileiro', ano: 2024, valor: 50000 },
      { competição: 'Copa do Brasil', ano: 2024, valor: 0 },
      { competição: 'Libertadores', ano: 2024, valor: 100000 },
      { competição: 'Brasileiro', ano: 2025, valor: 80000 },
      { competição: 'Copa do Brasil', ano: 2025, valor: 0 },
      { competição: 'Libertadores', ano: 2025, valor: 200000 },
      { competição: 'Mundial', ano: 2025, valor: 500000 },
    ],
  },
  {
    id: 3,
    nome: 'Gregore',
    nomeCompleto: 'GREGORE MAYNARD PINTO BONFIM',
    posicao: 'Volante',
    dataNascimento: '1996-01-24',
    paisNascimento: 'Brasil',
    fotoArquivo: 'Gregore.JPG',
    statusContrato: 'Elenco',
    alocacao: 'Profissional',
    clubeAnterior: 'Athletico-PR',
    percSAF: 80,
    inicioContrato: '2024-07-01',
    fimContrato: '2027-06-30',
    salarioCLT: 60000,
    direitoImagem: 80000,
    auxilioMoradiaM: 3500,
    auxilioAlimentacaoM: 1800,
    auxilioViagemA: 8000,
    outrosAuxiliosM: 0,
    transferFeeTotal: 2000000,
    transferFeeQuitado: 1000000,
    transferFeePendente: 1000000,
    transferFeeAcordo: 0,
    transferFeeMoeda: 'USD',
    valorMercado: 4000000,
    valorMercadoMoeda: 'EUR',
    multaInternacional: '15.000.000,00 Euro',
    multaNacional: '1000X valor médio do salário',
    multaCompensatoria: 'Residual de salários até o final do contrato',
    intermediarios: [],
    bichos: [
      { competição: 'Brasileiro', ano: 2024, valor: 30000 },
      { competição: 'Copa do Brasil', ano: 2024, valor: 0 },
      { competição: 'Libertadores', ano: 2024, valor: 80000 },
      { competição: 'Brasileiro', ano: 2025, valor: 50000 },
      { competição: 'Copa do Brasil', ano: 2025, valor: 0 },
      { competição: 'Libertadores', ano: 2025, valor: 150000 },
      { competição: 'Mundial', ano: 2025, valor: 300000 },
    ],
  },
  {
    id: 4,
    nome: 'Mateo Ponte',
    nomeCompleto: 'MATEO PONTE GONÇALVES',
    posicao: 'Lateral Direito',
    dataNascimento: '2000-03-12',
    paisNascimento: 'Uruguai',
    fotoArquivo: 'Mateo Ponte.JPG',
    statusContrato: 'Elenco',
    alocacao: 'Profissional',
    clubeAnterior: 'Nacional (URU)',
    percSAF: 100,
    inicioContrato: '2024-01-01',
    fimContrato: '2027-12-31',
    salarioCLT: 45000,
    direitoImagem: 55000,
    auxilioMoradiaM: 3000,
    auxilioAlimentacaoM: 1500,
    auxilioViagemA: 6000,
    outrosAuxiliosM: 0,
    transferFeeTotal: 1500000,
    transferFeeQuitado: 500000,
    transferFeePendente: 1000000,
    transferFeeAcordo: 0,
    transferFeeMoeda: 'USD',
    valorMercado: 6000000,
    valorMercadoMoeda: 'EUR',
    multaInternacional: '25.000.000,00 Euro',
    multaNacional: '1500X valor médio do salário',
    multaCompensatoria: 'Residual de salários até o final do contrato',
    intermediarios: [{ nome: 'JORGE MACHADO', percVendaFutura: 5 }],
    bichos: [
      { competição: 'Brasileiro', ano: 2024, valor: 20000 },
      { competição: 'Copa do Brasil', ano: 2024, valor: 0 },
      { competição: 'Libertadores', ano: 2024, valor: 50000 },
      { competição: 'Brasileiro', ano: 2025, valor: 40000 },
      { competição: 'Copa do Brasil', ano: 2025, valor: 0 },
      { competição: 'Libertadores', ano: 2025, valor: 100000 },
      { competição: 'Mundial', ano: 2025, valor: 200000 },
    ],
  },
  {
    id: 5,
    nome: 'Patrick de Paula',
    nomeCompleto: 'PATRICK DE PAULA RODRIGUES',
    posicao: 'Meia',
    dataNascimento: '2001-04-23',
    paisNascimento: 'Brasil',
    fotoArquivo: 'Patrick de Paula.JPG',
    statusContrato: 'Emprestado',
    alocacao: 'Profissional',
    clubeAnterior: 'Palmeiras',
    percSAF: 50,
    inicioContrato: '2022-01-01',
    fimContrato: '2026-12-31',
    salarioCLT: 30000,
    direitoImagem: 40000,
    auxilioMoradiaM: 0,
    auxilioAlimentacaoM: 0,
    auxilioViagemA: 0,
    outrosAuxiliosM: 0,
    transferFeeTotal: 5000000,
    transferFeeQuitado: 5000000,
    transferFeePendente: 0,
    transferFeeAcordo: 0,
    transferFeeMoeda: 'BRL',
    valorMercado: 3000000,
    valorMercadoMoeda: 'EUR',
    multaInternacional: '10.000.000,00 Euro',
    multaNacional: '800X valor médio do salário',
    multaCompensatoria: 'Residual de salários até o final do contrato',
    intermediarios: [],
    bichos: [
      { competição: 'Brasileiro', ano: 2024, valor: 0 },
      { competição: 'Copa do Brasil', ano: 2024, valor: 0 },
      { competição: 'Libertadores', ano: 2024, valor: 0 },
      { competição: 'Brasileiro', ano: 2025, valor: 0 },
      { competição: 'Copa do Brasil', ano: 2025, valor: 0 },
      { competição: 'Libertadores', ano: 2025, valor: 0 },
      { competição: 'Mundial', ano: 2025, valor: 0 },
    ],
  },
]

// ── Pagamentos Certos ─────────────────────────────────────────────
export const pagamentosCertos: PagamentoCerto[] = [
  { id: 1, atletaId: 1, despesa: 'Luvas', contrato: 'Luvas e Prêmios', parcela: '1/3', vencimento: '2024-06-30', valor: 200000, moeda: 'BRL', vencAntecipado: false, parcial: null, moedaParcial: null, status: 'Pago' },
  { id: 2, atletaId: 1, despesa: 'Luvas', contrato: 'Luvas e Prêmios', parcela: '2/3', vencimento: '2025-06-30', valor: 200000, moeda: 'BRL', vencAntecipado: false, parcial: null, moedaParcial: null, status: 'Atrasado' },
  { id: 3, atletaId: 1, despesa: 'Luvas', contrato: 'Luvas e Prêmios', parcela: '3/3', vencimento: '2026-06-30', valor: 200000, moeda: 'BRL', vencAntecipado: false, parcial: null, moedaParcial: null, status: 'A pagar' },
  { id: 4, atletaId: 2, despesa: 'Luvas', contrato: 'Luvas e Prêmios', parcela: '1/2', vencimento: '2023-12-31', valor: 150000, moeda: 'BRL', vencAntecipado: false, parcial: null, moedaParcial: null, status: 'Pago' },
  { id: 5, atletaId: 2, despesa: 'Luvas', contrato: 'Luvas e Prêmios', parcela: '2/2', vencimento: '2024-12-31', valor: 150000, moeda: 'BRL', vencAntecipado: false, parcial: null, moedaParcial: null, status: 'Pago' },
  { id: 6, atletaId: 4, despesa: 'Luvas', contrato: 'Luvas e Prêmios', parcela: '1/3', vencimento: '2024-06-30', valor: 100000, moeda: 'USD', vencAntecipado: true, parcial: 80000, moedaParcial: 'USD', status: 'Parcial' },
  { id: 7, atletaId: 4, despesa: 'Luvas', contrato: 'Luvas e Prêmios', parcela: '2/3', vencimento: '2025-06-30', valor: 100000, moeda: 'USD', vencAntecipado: false, parcial: null, moedaParcial: null, status: 'A pagar' },
  { id: 8, atletaId: 4, despesa: 'Luvas', contrato: 'Luvas e Prêmios', parcela: '3/3', vencimento: '2026-06-30', valor: 100000, moeda: 'USD', vencAntecipado: false, parcial: null, moedaParcial: null, status: 'A pagar' },
]

// ── Pagamentos Condicionais ───────────────────────────────────────
export const pagamentosCondicionais: PagamentoCondicional[] = [
  { id: 1, atletaId: 1, despesa: 'Prêmio', contrato: 'Direito de Imagem', detalhesCondicao: 'Caso o atleta seja convocado para a Seleção Brasileira e dispute a Copa do Mundo de 2026', valor: '1 salário vigente', moeda: 'BRL', vencAntecipado: false, vencimento: '30 dias do atingimento da meta', parcial: null, moedaParcial: null, status: 'Aguardando condição' },
  { id: 2, atletaId: 1, despesa: 'Prêmio', contrato: 'Direito de Imagem', detalhesCondicao: 'A cada duas convocações do atleta para a categoria principal da Seleção Brasileira em datas FIFA', valor: '1 salário vigente', moeda: 'BRL', vencAntecipado: false, vencimento: '30 dias do atingimento da meta', parcial: null, moedaParcial: null, status: 'Aguardando condição' },
  { id: 3, atletaId: 1, despesa: 'Prêmio', contrato: 'Direito de Imagem', detalhesCondicao: 'Caso o atleta atinja 30 gols na temporada 2025', valor: 100000, moeda: 'BRL', vencAntecipado: false, vencimento: '30 dias do atingimento da meta', parcial: null, moedaParcial: null, status: 'Aguardando condição' },
  { id: 4, atletaId: 2, despesa: 'Prêmio', contrato: 'Contrato Principal', detalhesCondicao: 'Caso o atleta seja eleito o melhor volante do Campeonato Brasileiro', valor: 200000, moeda: 'BRL', vencAntecipado: false, vencimento: '30 dias do atingimento da meta', parcial: null, moedaParcial: null, status: 'Aguardando condição' },
]

// ── Acordos ───────────────────────────────────────────────────────
export const acordos: Acordo[] = [
  { id: 1, atletaId: 2, natureza: 'Rescisão', naturezaDivida: 'Luvas', parcela: '1/1', condicao: 'À vista', credor: 'MARLON FREITAS', vencAntecipado: '2025-03-15', valor: 50000, moedaContrato: 'BRL', vencimento: '2025-03-15', dataLiquidacao: '2025-03-15', status: 'Pago' },
]

// ── Condicionais de Salário ───────────────────────────────────────
export const condicionaisSalario: CondicionalSalario[] = [
  { id: 1, atletaId: 1, condicao: 'Renovação', despesa: 'Salário CLT', detalhes: 'Aumento de 20% no salário caso o atleta dispute mais de 30 jogos na temporada 2025', valor: 96000, moeda: 'BRL', status: 'Aguardando condição' },
  { id: 2, atletaId: 2, condicao: 'Performance', despesa: 'Salário CLT', detalhes: 'Reajuste de 15% caso o atleta seja titular em mais de 25 jogos', valor: 80500, moeda: 'BRL', status: 'Aguardando condição' },
]

// ── Passivo Clube ─────────────────────────────────────────────────
export const passivosClube: PassivoClube[] = [
  { id: 1, atletaId: 3, contrato: 'Transfer Agreement', despesa: 'Transfer Fee', credor: 'ATHLETICO-PR', condicional: false, parcela: '1/4', vencimento: '2024-12-31', valor: 500000, moeda: 'USD', parcial: null, moedaParcial: null, saldoMoedaContrato: 500000, saldoBRL: 2750000, condicao: '', vencAntecipado: false, solidariedade: false, dataLiquidacao: '2024-12-28', status: 'Pago' },
  { id: 2, atletaId: 3, contrato: 'Transfer Agreement', despesa: 'Transfer Fee', credor: 'ATHLETICO-PR', condicional: false, parcela: '2/4', vencimento: '2025-06-30', valor: 500000, moeda: 'USD', parcial: null, moedaParcial: null, saldoMoedaContrato: 500000, saldoBRL: 2900000, condicao: '', vencAntecipado: false, solidariedade: false, dataLiquidacao: null, status: 'Atrasado' },
  { id: 3, atletaId: 3, contrato: 'Transfer Agreement', despesa: 'Transfer Fee', credor: 'ATHLETICO-PR', condicional: false, parcela: '3/4', vencimento: '2025-12-31', valor: 500000, moeda: 'USD', parcial: null, moedaParcial: null, saldoMoedaContrato: 500000, saldoBRL: 2900000, condicao: '', vencAntecipado: false, solidariedade: false, dataLiquidacao: null, status: 'A pagar' },
  { id: 4, atletaId: 3, contrato: 'Transfer Agreement', despesa: 'Transfer Fee', credor: 'ATHLETICO-PR', condicional: true, parcela: '4/4', vencimento: '2026-06-30', valor: 500000, moeda: 'USD', parcial: null, moedaParcial: null, saldoMoedaContrato: 500000, saldoBRL: 2900000, condicao: 'Atingir 50 jogos pelo clube', vencAntecipado: false, solidariedade: false, dataLiquidacao: null, status: 'Aguardando condição' },
  { id: 5, atletaId: 4, contrato: 'Transfer Agreement', despesa: 'Transfer Fee', credor: 'NACIONAL (URU)', condicional: false, parcela: '1/3', vencimento: '2024-06-30', valor: 500000, moeda: 'USD', parcial: 400000, moedaParcial: 'USD', saldoMoedaContrato: 100000, saldoBRL: 550000, condicao: '', vencAntecipado: true, solidariedade: false, dataLiquidacao: null, status: 'Parcial' },
  { id: 6, atletaId: 4, contrato: 'Transfer Agreement', despesa: 'Transfer Fee', credor: 'NACIONAL (URU)', condicional: false, parcela: '2/3', vencimento: '2025-06-30', valor: 500000, moeda: 'USD', parcial: null, moedaParcial: null, saldoMoedaContrato: 500000, saldoBRL: 2900000, condicao: '', vencAntecipado: false, solidariedade: false, dataLiquidacao: null, status: 'A pagar' },
  { id: 7, atletaId: 4, contrato: 'Transfer Agreement', despesa: 'Transfer Fee', credor: 'NACIONAL (URU)', condicional: false, parcela: '3/3', vencimento: '2026-06-30', valor: 500000, moeda: 'USD', parcial: null, moedaParcial: null, saldoMoedaContrato: 500000, saldoBRL: 2900000, condicao: '', vencAntecipado: false, solidariedade: false, dataLiquidacao: null, status: 'A pagar' },
]

// ── Passivo Intermediários ────────────────────────────────────────
export const passivosIntermediario: PassivoIntermediario[] = [
  { id: 1, atletaId: 1, contrato: 'Contrato de Representação', despesa: 'Comissão - Entrada', intermediario: 'JORGE MACHADO', condicional: false, parcela: '1/3', vencimento: '2024-06-30', valor: 50000, moeda: 'BRL', parcial: null, moedaParcial: null, saldoBRL: 0, condicao: '', teorMulta: 'Qualquer atraso: acréscimo de multa de 10%, juros de mora de 1% ao mês pro rata die e correção monetária pelo IPCA. Exigível 30 dias após notificação.', vencAntecipado: false, dataLiquidacao: '2024-06-28', status: 'Pago' },
  { id: 2, atletaId: 1, contrato: 'Contrato de Representação', despesa: 'Comissão - Entrada', intermediario: 'JORGE MACHADO', condicional: false, parcela: '2/3', vencimento: '2025-06-30', valor: 50000, moeda: 'BRL', parcial: null, moedaParcial: null, saldoBRL: 50000, condicao: '', teorMulta: 'Qualquer atraso: acréscimo de multa de 10%, juros de mora de 1% ao mês pro rata die e correção monetária pelo IPCA. Exigível 30 dias após notificação.', vencAntecipado: false, dataLiquidacao: null, status: 'A pagar' },
  { id: 3, atletaId: 1, contrato: 'Contrato de Representação', despesa: 'Comissão - Entrada', intermediario: 'JORGE MACHADO', condicional: false, parcela: '3/3', vencimento: '2026-06-30', valor: 50000, moeda: 'BRL', parcial: null, moedaParcial: null, saldoBRL: 50000, condicao: '', teorMulta: 'Qualquer atraso: acréscimo de multa de 10%, juros de mora de 1% ao mês pro rata die e correção monetária pelo IPCA. Exigível 30 dias após notificação.', vencAntecipado: false, dataLiquidacao: null, status: 'A pagar' },
  { id: 4, atletaId: 2, contrato: 'Contrato de Representação', despesa: 'Comissão - Entrada', intermediario: 'CARLOS PEREIRA', condicional: false, parcela: '1/2', vencimento: '2023-12-31', valor: 80000, moeda: 'BRL', parcial: null, moedaParcial: null, saldoBRL: 0, condicao: '', teorMulta: 'Qualquer atraso: acréscimo de multa de 10%, juros de mora de 1% ao mês pro rata die.', vencAntecipado: false, dataLiquidacao: '2023-12-29', status: 'Pago' },
  { id: 5, atletaId: 2, contrato: 'Contrato de Representação', despesa: 'Comissão - Entrada', intermediario: 'CARLOS PEREIRA', condicional: false, parcela: '2/2', vencimento: '2024-12-31', valor: 80000, moeda: 'BRL', parcial: null, moedaParcial: null, saldoBRL: 0, condicao: '', teorMulta: 'Qualquer atraso: acréscimo de multa de 10%, juros de mora de 1% ao mês pro rata die.', vencAntecipado: false, dataLiquidacao: '2024-12-30', status: 'Pago' },
  { id: 6, atletaId: 4, contrato: 'Contrato de Representação', despesa: 'Comissão - Entrada', intermediario: 'JORGE MACHADO', condicional: false, parcela: '1/4', vencimento: '2024-06-30', valor: 75000, moeda: 'USD', parcial: null, moedaParcial: null, saldoBRL: 412500, condicao: '', teorMulta: 'Qualquer atraso: acréscimo de multa de 10%, juros de mora de 1% ao mês pro rata die e correção monetária pelo IPCA. Exigível 30 dias após notificação.', vencAntecipado: true, dataLiquidacao: null, status: 'Atrasado' },
  { id: 7, atletaId: 4, contrato: 'Contrato de Representação', despesa: 'Comissão - Entrada', intermediario: 'JORGE MACHADO', condicional: false, parcela: '2/4', vencimento: '2025-06-30', valor: 75000, moeda: 'USD', parcial: null, moedaParcial: null, saldoBRL: 416250, condicao: '', teorMulta: 'Qualquer atraso: acréscimo de multa de 10%, juros de mora de 1% ao mês pro rata die e correção monetária pelo IPCA. Exigível 30 dias após notificação.', vencAntecipado: false, dataLiquidacao: null, status: 'A pagar' },
]

// ── Parcelas Direito de Imagem ────────────────────────────────────
export interface ParcelaDireitoImagem {
  id: number
  atletaId: number
  mes: string        // "2024-01"
  valor: number      // BRL mensal
  status: StatusParcela
}

function gerarParcelasDireitoImagem(): ParcelaDireitoImagem[] {
  const result: ParcelaDireitoImagem[] = []
  let id = 1
  const cutoffPago = new Date(2026, 2, 1)   // antes de Mar/2026 = Pago
  const cutoffAtrasado = new Date(2026, 2, 1) // Mar/2026 para alguns = Atrasado

  for (const a of atletas) {
    const inicio = new Date(a.inicioContrato + 'T00:00:00')
    const fim = new Date(a.fimContrato + 'T00:00:00')
    let cur = new Date(inicio.getFullYear(), inicio.getMonth(), 1)
    const fimMes = new Date(fim.getFullYear(), fim.getMonth(), 1)

    while (cur <= fimMes) {
      const mesStr = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`
      let status: StatusParcela
      if (cur < cutoffPago) {
        status = 'Pago'
      } else if (cur.getTime() === cutoffAtrasado.getTime() && (a.id === 2 || a.id === 5)) {
        status = 'Atrasado'
      } else {
        status = 'A pagar'
      }
      result.push({ id: id++, atletaId: a.id, mes: mesStr, valor: a.direitoImagem, status })
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
    }
  }
  return result
}

export const parcelasDireitoImagem: ParcelaDireitoImagem[] = gerarParcelasDireitoImagem()

// ── Helpers ───────────────────────────────────────────────────────
export const fmt = (v: number, moeda: Moeda = 'BRL') =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: moeda, maximumFractionDigits: 0 })

export const fmtMi = (v: number, moeda: Moeda = 'BRL') => {
  if (v === 0) return moeda === 'BRL' ? 'R$ 0,0' : `${moeda} 0,0`
  const prefix = moeda === 'BRL' ? 'R$' : moeda
  if (v >= 1000000) return `${prefix} ${(v / 1000000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} Mi`
  if (v >= 1000) return `${prefix} ${(v / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })} Mil`
  return fmt(v, moeda)
}

export const fmtData = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')

export const idade = (nasc: string) => {
  const hoje = new Date()
  const n = new Date(nasc + 'T00:00:00')
  let anos = hoje.getFullYear() - n.getFullYear()
  if (hoje < new Date(hoje.getFullYear(), n.getMonth(), n.getDate())) anos--
  return anos
}

export const statusColor: Record<string, string> = {
  'Pago': '#1a7a4a',
  'A pagar': '#555',
  'Atrasado': '#c0392b',
  'Parcial': '#e67e22',
  'Aguardando condição': '#1a6fa0',
}

export const statusBg: Record<string, string> = {
  'Pago': '#e6f9f0',
  'A pagar': '#f5f5f5',
  'Atrasado': '#ffeef0',
  'Parcial': '#fff3e0',
  'Aguardando condição': '#e8f4fd',
}

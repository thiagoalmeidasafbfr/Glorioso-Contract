// Tipos das cláusulas de venda (a página /clausulas-venda).
// Os dados fabricados foram removidos — as coleções começam VAZIAS e são
// preenchidas pelo usuário na própria página (cadastro em sessão) ou, no
// futuro, migradas para a tabela athlete-central `clauses` no Supabase.

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

// Sem dados fabricados.
export const CONTRATOS_MOCK: ContratoVenda[] = []
export const CLAUSULAS_MOCK: ClausulaVenda[] = []

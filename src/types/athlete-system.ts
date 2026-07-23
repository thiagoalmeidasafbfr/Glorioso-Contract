// src/types/athlete-system.ts
// Tipos TypeScript gerados a partir do schema do Supabase (004_athletes_system.sql)

export type AthleteStatus = 'ATIVO' | 'EMPRESTADO' | 'VENDIDO' | 'DESLIGADO'

// Categoria (dimensão) do atleta no clube.
export type AthleteCategory = 'BASE' | 'PROFISSIONAL' | 'COMISSAO_TECNICA'

export type ContractType =
  // Transferências (movimentam a titularidade do atleta).
  | 'ENTRADA' | 'SAIDA' | 'EMPRESTIMO_SAIDA' | 'EMPRESTIMO_ENTRADA'
  // Contratos acessórios/derivados — normalmente atrelados a uma transferência.
  // (Solidariedade NÃO é contrato: é um valor % repassado a clubes formadores,
  //  cadastrado como cláusula/obrigação — ver SOLIDARIEDADE_FIFA.)
  | 'INTERMEDIACAO' | 'LUVAS' | 'SELL_ON' | 'OUTRO'

export type ContractStatus = 'ATIVO' | 'ENCERRADO' | 'RESCINDIDO'

export type ClauseType =
  | 'TRANSFER_FEE_FIXO'
  | 'TRANSFER_FEE_VARIAVEL'
  | 'SELL_ON_FEE'
  | 'SELL_ON_FEE_RECEBER'
  | 'INTERMEDIACAO'
  | 'INTERMEDIACAO_VENDA_FUTURA'
  | 'SALARIO_CETD'
  | 'DIREITO_IMAGEM'
  | 'LUVAS'
  | 'BONUS_PERFORMANCE_ATLETA'
  | 'SOLIDARIEDADE_FIFA'
  | 'EMPRESTIMO_TAXA'
  | 'CLAUSULA_RESCISORIA'
  | 'PERCENTUAL_VENDA_ATLETA'
  | 'ACORDO_RENEGOCIACAO'

// Base de cálculo de um Sell-on Fee: sobre a mais-valia (lucro na revenda) ou
// sobre o valor total da futura venda.
export type SellOnBasis = 'MAIS_VALIA' | 'VALOR_TOTAL'
export const SELLON_BASIS_LABELS: Record<SellOnBasis, string> = {
  MAIS_VALIA:  'Mais-valia (lucro na revenda)',
  VALOR_TOTAL: 'Valor total da venda',
}
export const SELL_ON_CLAUSE_TYPES: ClauseType[] = ['SELL_ON_FEE', 'SELL_ON_FEE_RECEBER']
export function sellOnConditionText(basis: SellOnBasis): string {
  return basis === 'MAIS_VALIA'
    ? 'Sell-on sobre a mais-valia (lucro na revenda de uma venda futura)'
    : 'Sell-on sobre o valor total de uma venda futura'
}

export type AchievementStatus = 'PENDENTE' | 'ATINGIDA' | 'NAO_ATINGIDA' | 'NAO_APLICAVEL'

export type PaymentStatus =
  | 'PENDENTE' | 'PAGA' | 'PARCIALMENTE_PAGA' | 'EM_ATRASO' | 'CANCELADA'

export type InstallmentStatus = 'PENDENTE' | 'PAGA' | 'EM_ATRASO' | 'CANCELADA'

export type AlertType =
  | 'VENCIMENTO_PROXIMO' | 'EM_ATRASO' | 'SELL_ON_PENDENTE_REVISAO' | 'ATINGIMENTO_PENDENTE'

export type AlertSeverity = 'RED' | 'YELLOW' | 'GREEN'

export type Currency = 'BRL' | 'EUR' | 'USD' | 'GBP'

// Detentor de direitos econômicos do atleta.
export type HolderType = 'BFR' | 'CLUBE' | 'AGENTE' | 'ATLETA' | 'TERCEIRO'

export interface Athlete {
  id: string
  external_ref?: string | null   // CPF/passaporte (chave natural externa)
  full_name: string
  short_name: string
  birth_date: string | null
  nationality: string | null
  cpf: string | null
  passport_number: string | null
  agent_name: string | null
  agent_contact: string | null
  current_status: AthleteStatus
  category: AthleteCategory
  position: string | null
  profile_photo_url: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

// PJ (pessoa jurídica) do atleta — usada para o Direito de Imagem. Um atleta
// pode ter mais de uma (troca de PJ ao longo do tempo).
export interface AthletePJ {
  id: string
  athlete_id: string
  legal_name: string       // razão social
  cnpj: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface NewAthletePJInput {
  legal_name: string
  cnpj: string
  notes: string
}

// Uma parcela da titularidade econômica do atleta (1 linha por detentor).
export interface EconomicRight {
  id: string
  athlete_id: string
  holder_type: HolderType
  holder_name: string | null
  percentage: number
  notes: string | null
  created_at: string
  updated_at: string
}

export interface NewEconomicRightInput {
  holder_type: HolderType
  holder_name: string
  percentage: number
  notes: string
}

export interface Contract {
  id: string
  athlete_id: string
  // Contrato-pai ao qual este está atrelado (ex.: intermediação/sell-on de uma
  // compra ou venda). null quando é um contrato independente.
  related_contract_id: string | null
  type: ContractType
  counterpart_club: string
  counterpart_country: string | null
  start_date: string
  end_date: string | null
  status: ContractStatus
  transfer_fee_gross: number | null
  transfer_currency: Currency
  base_salary: number | null
  salary_currency: Currency
  image_value: number | null    // imagem mensal
  other_value: number | null    // outros mensais (moradia, auxílios)
  description: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Clause {
  id: string
  source_key?: string | null
  contract_id: string
  athlete_id: string
  clause_type: ClauseType
  description: string
  creditor_party: string
  debtor_party: string
  currency: Currency
  original_value: number | null
  percentage_value: number | null
  condition_description: string | null
  due_date: string | null
  installments_total: number
  installments_paid: number
  achievement_status: AchievementStatus
  achievement_date: string | null
  payment_status: PaymentStatus
  payment_date: string | null
  amount_paid_currency: number | null
  amount_paid_brl: number | null
  exchange_rate: number | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ClauseInstallment {
  id: string
  clause_id: string
  athlete_id: string
  installment_number: number
  due_date: string
  original_value: number
  currency: Currency
  payment_status: InstallmentStatus
  payment_date: string | null
  amount_paid_brl: number | null
  exchange_rate: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Alert {
  id: string
  athlete_id: string
  clause_id: string | null
  installment_id: string | null
  alert_type: AlertType
  severity: AlertSeverity
  message: string
  is_read: boolean
  created_at: string
}

// ── Extended types with joined data ──────────────────────────────────────

export interface AthleteWithStats extends Athlete {
  contracts?: Contract[]
  active_clauses_count: number
  overdue_count: number
  due_soon_count: number
  next_due_date: string | null
  total_receivable_brl: number
  total_payable_brl: number
}

export interface ContractWithClauses extends Contract {
  clauses: Clause[]
  athlete?: Pick<Athlete, 'id' | 'short_name' | 'current_status'>
}

export interface ClauseWithInstallments extends Clause {
  installments: ClauseInstallment[]
  contract?: Pick<Contract, 'id' | 'type' | 'counterpart_club'>
}

export interface AlertWithDetails extends Alert {
  athlete_name?: string
  clause_description?: string
}

// ── Form / input types ────────────────────────────────────────────────────

export interface NewContractInput {
  type: ContractType
  // Opcional: atrela o novo contrato a um contrato existente do atleta.
  related_contract_id?: string | null
  counterpart_club: string
  counterpart_country: string
  start_date: string
  end_date: string
  transfer_fee_gross: number | null
  transfer_currency: Currency
  base_salary: number | null
  salary_currency: Currency
  image_value: number | null
  other_value: number | null
  description: string
  status: ContractStatus
}

export interface NewClauseInput {
  clause_type: ClauseType
  description: string
  creditor_party: string
  debtor_party: string
  currency: Currency
  original_value: number | null
  percentage_value: number | null
  condition_description: string
  due_date: string
  installments_total: number
  notes: string
}

export interface PaymentInput {
  payment_date: string
  amount_paid_currency: number
  amount_paid_brl: number
  exchange_rate: number
  notes: string
}

// ── UI labels ─────────────────────────────────────────────────────────────

export const CLAUSE_TYPE_LABELS: Record<ClauseType, string> = {
  TRANSFER_FEE_FIXO:         'Transfer Fee Fixo',
  TRANSFER_FEE_VARIAVEL:     'Transfer Fee Variável',
  SELL_ON_FEE:               'Sell-On Fee (a pagar)',
  SELL_ON_FEE_RECEBER:       'Sell-On Fee (a receber)',
  INTERMEDIACAO:             'Intermediação',
  INTERMEDIACAO_VENDA_FUTURA:'Intermediação Venda Futura',
  SALARIO_CETD:              'Salário / CETD',
  DIREITO_IMAGEM:            'Direito de Imagem',
  LUVAS:                     'Luvas',
  BONUS_PERFORMANCE_ATLETA:  'Bônus de Performance',
  SOLIDARIEDADE_FIFA:        'Solidariedade FIFA',
  EMPRESTIMO_TAXA:           'Taxa de Empréstimo',
  CLAUSULA_RESCISORIA:       'Cláusula Rescisória',
  PERCENTUAL_VENDA_ATLETA:   'Percentual de Venda',
  ACORDO_RENEGOCIACAO:       'Acordo / Renegociação',
}

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  ENTRADA:           'Entrada',
  SAIDA:             'Saída',
  EMPRESTIMO_SAIDA:  'Empréstimo (saída)',
  EMPRESTIMO_ENTRADA:'Empréstimo (entrada)',
  INTERMEDIACAO:     'Agentes / Intermediação',
  LUVAS:             'Luvas',
  SELL_ON:           'Sell-on Fee',
  OUTRO:             'Outro contrato vinculado',
}

// Grupos para o seletor de tipo de contrato. Transferências movimentam a
// titularidade; acessórios são contratos derivados (intermediação, luvas,
// solidariedade, sell-on) — geralmente atrelados a uma transferência existente.
export const TRANSFER_CONTRACT_TYPES: ContractType[] = ['ENTRADA', 'SAIDA', 'EMPRESTIMO_ENTRADA', 'EMPRESTIMO_SAIDA']
export const ACCESSORY_CONTRACT_TYPES: ContractType[] = ['INTERMEDIACAO', 'LUVAS', 'SELL_ON', 'OUTRO']

// Um contrato de transferência movimenta a titularidade e exige contraparte +
// fluxos de transfer/salário; os acessórios não.
export function isTransferContractType(t: ContractType): boolean {
  return TRANSFER_CONTRACT_TYPES.includes(t)
}

export const ATHLETE_CATEGORY_LABELS: Record<AthleteCategory, string> = {
  BASE:            'Base',
  PROFISSIONAL:    'Profissional',
  COMISSAO_TECNICA:'Comissão Técnica',
}

export const HOLDER_TYPE_LABELS: Record<HolderType, string> = {
  BFR:      'Botafogo',
  CLUBE:    'Clube',
  AGENTE:   'Agente',
  ATLETA:   'Atleta',
  TERCEIRO: 'Terceiro',
}

// Cores da barra de titularidade — alinhadas ao tema (dourado = Botafogo).
export const HOLDER_TYPE_COLORS: Record<HolderType, string> = {
  BFR:      '#be8c4a',
  CLUBE:    '#7a6244',
  AGENTE:   '#a07d3c',
  ATLETA:   '#3a2e1c',
  TERCEIRO: '#b9a88a',
}

// ── Gatilhos de mudança salarial por meta ──────────────────────────────────
// Ex.: "ao atingir 10 jogos, salário passa a 300k". Quando marcado ATINGIDA
// com uma data, o salário efetivo muda a partir daquela data.

export type TriggerMetric =
  | 'JOGOS' | 'GOLS' | 'ASSISTENCIAS' | 'MINUTOS' | 'TITULO' | 'OUTRO'

export type TriggerStatus = 'PENDENTE' | 'ATINGIDA' | 'NAO_ATINGIDA'

export interface SalaryTrigger {
  id: string
  athlete_id: string
  contract_id: string | null
  description: string
  metric: TriggerMetric
  threshold: number | null
  new_salary: number
  currency: Currency
  status: TriggerStatus
  achieved_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface NewSalaryTriggerInput {
  contract_id: string | null
  description: string
  metric: TriggerMetric
  threshold: number | null
  new_salary: number
  currency: Currency
  notes: string
}

// ── Passivos e direito de imagem (entidades-filhas do atleta) ───────────────

export type LiabilityDirection = 'A_PAGAR' | 'A_RECEBER'
export type LiabilityStatus = 'PENDENTE' | 'PAGA' | 'EM_ATRASO' | 'CANCELADA'

export interface ClubLiability {
  id: string
  source_key?: string | null
  athlete_id: string
  club_name: string
  description: string | null
  direction: LiabilityDirection
  amount: number
  currency: Currency
  due_date: string | null
  conditional: boolean
  condition_description: string | null
  solidarity: boolean
  status: LiabilityStatus
  settled_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface NewClubLiabilityInput {
  source_key?: string | null
  club_name: string
  description: string
  direction: LiabilityDirection
  amount: number
  currency: Currency
  due_date: string | null
  conditional: boolean
  condition_description: string
  solidarity: boolean
  status: LiabilityStatus
  notes: string
}

export interface IntermediaryLiability {
  id: string
  source_key?: string | null
  athlete_id: string
  contract_id: string | null
  intermediary_name: string
  description: string | null
  direction: LiabilityDirection
  amount: number
  currency: Currency
  due_date: string | null
  conditional: boolean
  condition_description: string | null
  penalty_terms: string | null
  status: LiabilityStatus
  settled_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface NewIntermediaryLiabilityInput {
  source_key?: string | null
  contract_id?: string | null
  intermediary_name: string
  description: string
  direction: LiabilityDirection
  amount: number
  currency: Currency
  due_date: string | null
  conditional: boolean
  condition_description: string
  penalty_terms: string
  status: LiabilityStatus
  notes: string
}

export interface ImageRight {
  id: string
  source_key?: string | null
  athlete_id: string
  pj_id: string | null      // PJ que recebe a imagem
  month: string          // 'YYYY-MM'
  amount: number
  currency: Currency
  status: LiabilityStatus
  paid_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface NewImageRightInput {
  source_key?: string | null
  pj_id?: string | null
  month: string
  amount: number
  currency: Currency
  status: LiabilityStatus
  notes: string
}

// ── Cadastros: Clubes e Intermediários ─────────────────────────────────────

export interface Club {
  id: string
  external_ref?: string | null
  name: string
  country: string | null
  logo_url: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface NewClubInput {
  name: string
  country: string
  logo_url: string | null
  notes: string
  external_ref?: string | null
}

export interface Intermediary {
  id: string
  external_ref?: string | null
  name: string
  contact: string | null
  logo_url: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface NewIntermediaryInput {
  name: string
  contact: string
  logo_url: string | null
  notes: string
  external_ref?: string | null
}

// ── UI labels ───────────────────────────────────────────────────────────────

export const TRIGGER_METRIC_LABELS: Record<TriggerMetric, string> = {
  JOGOS:        'Jogos',
  GOLS:         'Gols',
  ASSISTENCIAS: 'Assistências',
  MINUTOS:      'Minutos',
  TITULO:       'Título',
  OUTRO:        'Outro',
}

export const TRIGGER_STATUS_LABELS: Record<TriggerStatus, string> = {
  PENDENTE:     'Pendente',
  ATINGIDA:     'Atingida',
  NAO_ATINGIDA: 'Não atingida',
}

export const LIABILITY_STATUS_LABELS: Record<LiabilityStatus, string> = {
  PENDENTE:  'Pendente',
  PAGA:      'Paga',
  EM_ATRASO: 'Em atraso',
  CANCELADA: 'Cancelada',
}

export const LIABILITY_DIRECTION_LABELS: Record<LiabilityDirection, string> = {
  A_PAGAR:   'A pagar',
  A_RECEBER: 'A receber',
}

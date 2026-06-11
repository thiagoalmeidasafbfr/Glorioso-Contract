// src/types/athlete-system.ts
// Tipos TypeScript gerados a partir do schema do Supabase (004_athletes_system.sql)

export type AthleteStatus = 'ATIVO' | 'EMPRESTADO' | 'VENDIDO' | 'DESLIGADO'

export type ContractType =
  | 'ENTRADA' | 'SAIDA' | 'EMPRESTIMO_SAIDA' | 'EMPRESTIMO_ENTRADA'

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

export type AchievementStatus = 'PENDENTE' | 'ATINGIDA' | 'NAO_ATINGIDA' | 'NAO_APLICAVEL'

export type PaymentStatus =
  | 'PENDENTE' | 'PAGA' | 'PARCIALMENTE_PAGA' | 'EM_ATRASO' | 'CANCELADA'

export type InstallmentStatus = 'PENDENTE' | 'PAGA' | 'EM_ATRASO' | 'CANCELADA'

export type AlertType =
  | 'VENCIMENTO_PROXIMO' | 'EM_ATRASO' | 'SELL_ON_PENDENTE_REVISAO' | 'ATINGIMENTO_PENDENTE'

export type AlertSeverity = 'RED' | 'YELLOW' | 'GREEN'

export type Currency = 'BRL' | 'EUR' | 'USD' | 'GBP'

export interface Athlete {
  id: string
  full_name: string
  short_name: string
  birth_date: string | null
  nationality: string | null
  cpf: string | null
  passport_number: string | null
  agent_name: string | null
  agent_contact: string | null
  current_status: AthleteStatus
  profile_photo_url: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Contract {
  id: string
  athlete_id: string
  type: ContractType
  counterpart_club: string
  counterpart_country: string | null
  start_date: string
  end_date: string | null
  status: ContractStatus
  transfer_fee_gross: number | null
  transfer_currency: Currency
  description: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Clause {
  id: string
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
  counterpart_club: string
  counterpart_country: string
  start_date: string
  end_date: string
  transfer_fee_gross: number | null
  transfer_currency: Currency
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
}

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  ENTRADA:           'Entrada',
  SAIDA:             'Saída',
  EMPRESTIMO_SAIDA:  'Empréstimo (saída)',
  EMPRESTIMO_ENTRADA:'Empréstimo (entrada)',
}

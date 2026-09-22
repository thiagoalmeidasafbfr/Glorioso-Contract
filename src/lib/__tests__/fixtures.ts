// Fábricas de objetos de domínio para os testes (valores mínimos válidos).
import type {
  Contract, Clause, ClauseInstallment, SalaryTrigger, AthletePJ,
  ClubLiability, IntermediaryLiability,
} from '../../types/athlete-system'

const TS = '2026-01-01T00:00:00Z'

export function makeContract(p: Partial<Contract> = {}): Contract {
  return {
    id: 'ct-1', athlete_id: 'at-1', related_contract_id: null,
    type: 'ENTRADA', counterpart_club: 'Botafogo', counterpart_country: null,
    start_date: '2026-01-01', end_date: '2026-12-31', status: 'ATIVO',
    transfer_fee_gross: null, transfer_currency: 'BRL',
    base_salary: 100_000, salary_currency: 'BRL', image_value: 50_000, other_value: null,
    description: null, created_by: null, created_at: TS, updated_at: TS,
    ...p,
  }
}

export function makeTrigger(p: Partial<SalaryTrigger> = {}): SalaryTrigger {
  return {
    id: 'tg-1', athlete_id: 'at-1', contract_id: 'ct-1', description: 'Meta',
    metric: 'JOGOS', threshold: 10, new_salary: 200_000, new_image_value: null,
    currency: 'BRL', status: 'ATINGIDA', achieved_date: '2026-06-15', notes: null,
    created_at: TS, updated_at: TS,
    ...p,
  }
}

export function makeClause(p: Partial<Clause> = {}): Clause {
  return {
    id: 'cl-1', contract_id: 'ct-1', athlete_id: 'at-1',
    clause_type: 'SALARIO_CETD', description: '',
    creditor_party: '', debtor_party: 'Botafogo SAF', currency: 'BRL',
    original_value: 0, percentage_value: null, condition_description: null,
    due_date: null, installments_total: 0, installments_paid: 0,
    achievement_status: 'NAO_APLICAVEL', achievement_date: null,
    payment_status: 'PENDENTE', payment_date: null,
    amount_paid_currency: null, amount_paid_brl: null, exchange_rate: null,
    notes: null, created_by: null, created_at: TS, updated_at: TS,
    ...p,
  }
}

export function makeInstallment(p: Partial<ClauseInstallment> = {}): ClauseInstallment {
  return {
    id: 'in-1', clause_id: 'cl-1', athlete_id: 'at-1', installment_number: 1,
    due_date: '2026-02-05', original_value: 100_000, currency: 'BRL',
    payment_status: 'PENDENTE', payment_date: null,
    amount_paid_brl: null, exchange_rate: null, notes: null,
    created_at: TS, updated_at: TS,
    ...p,
  }
}

export function makePJ(p: Partial<AthletePJ> = {}): AthletePJ {
  return {
    id: 'pj-1', athlete_id: 'at-1', legal_name: 'Atleta Imagem LTDA', cnpj: null,
    notes: null, created_at: TS, updated_at: TS, ...p,
  }
}

export function makeClubLiab(p: Partial<ClubLiability> = {}): ClubLiability {
  return {
    id: 'cb-1', athlete_id: 'at-1', club_name: 'Clube X', description: null,
    direction: 'A_PAGAR', amount: 1000, currency: 'EUR', due_date: '2026-03-10',
    conditional: false, condition_description: null, solidarity: false,
    status: 'PENDENTE', settled_date: null, notes: null, created_at: TS, updated_at: TS,
    ...p,
  }
}

export function makeIntermLiab(p: Partial<IntermediaryLiability> = {}): IntermediaryLiability {
  return {
    id: 'ag-1', athlete_id: 'at-1', contract_id: 'ct-9', intermediary_name: 'Agente Y',
    description: null, direction: 'A_RECEBER', amount: 500, currency: 'USD', due_date: null,
    conditional: false, condition_description: null, penalty_terms: null,
    status: 'PENDENTE', settled_date: null, notes: null, created_at: TS, updated_at: TS,
    ...p,
  }
}

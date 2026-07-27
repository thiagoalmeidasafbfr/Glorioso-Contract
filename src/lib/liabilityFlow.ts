// src/lib/liabilityFlow.ts
// Passivo "flat" (clube/agente) → OBRIGAÇÃO com página própria e fluxo de parcelas.
//
// Passivos flat vêm de importação de planilha: têm um valor único e nenhuma
// parcela. Para lançar vencimentos é preciso promovê-los a cláusula financeira —
// é o que esta função faz, preservando contraparte, direção, valor e condição.
// Usada por todas as telas que listam passivos (clube, agente, ficha do atleta,
// relatórios, consolidado), sempre pelo mesmo caminho.

import type {
  Clause, ClauseType, ClubLiability, IntermediaryLiability,
} from '../types/athlete-system'
import {
  createClause, deleteClubLiability, deleteIntermediaryLiability,
} from './athleteQueries'
import { todayISO } from './format'

export type LiabKind = 'club' | 'agent'

/**
 * Converte o passivo em cláusula (obrigação) e apaga o passivo original.
 * Retorna a cláusula criada — a tela chama o editor de fluxo em seguida.
 */
export async function promoteLiabilityToClause(
  kind: LiabKind,
  liab: ClubLiability | IntermediaryLiability,
): Promise<Clause> {
  const isAgent = kind === 'agent'
  const name = isAgent
    ? (liab as IntermediaryLiability).intermediary_name
    : (liab as ClubLiability).club_name
  const contractId = isAgent ? ((liab as IntermediaryLiability).contract_id ?? null) : null
  const payable = liab.direction === 'A_PAGAR'
  const clauseType: ClauseType = isAgent
    ? 'INTERMEDIACAO'
    : ((liab as ClubLiability).solidarity ? 'SOLIDARIEDADE_FIFA' : 'TRANSFER_FEE_FIXO')

  const clause = await createClause(contractId, liab.athlete_id, {
    clause_type: clauseType,
    description: liab.description || `${isAgent ? 'Comissão de agente' : 'Obrigação'} — ${name}`,
    creditor_party: payable ? name : 'Botafogo SAF',
    debtor_party: payable ? 'Botafogo SAF' : name,
    currency: liab.currency,
    original_value: liab.amount,
    percentage_value: null,
    condition_description: liab.condition_description || '',
    due_date: liab.due_date || todayISO(),
    installments_total: 1,
    notes: liab.notes || '',
  })
  if (isAgent) await deleteIntermediaryLiability(liab.id)
  else await deleteClubLiability(liab.id)
  return clause
}

/** Texto padrão do aviso/tooltip da ação (mesma linguagem em todas as telas). */
export const PROMOTE_HINT =
  'Gera as parcelas: o passivo passa a ser uma obrigação com página própria e cronograma de vencimentos.'

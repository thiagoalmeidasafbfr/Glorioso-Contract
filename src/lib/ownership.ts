// src/lib/ownership.ts
// Helpers puros para a titularidade econômica do atleta.

import type { EconomicRight, HolderType } from '../types/athlete-system'

// Tolerância para arredondamentos (ex.: 33,33 + 33,33 + 33,34).
const TOLERANCE = 0.1

export function sumOwnership(rights: Pick<EconomicRight, 'percentage'>[]): number {
  return rights.reduce((acc, r) => acc + (Number(r.percentage) || 0), 0)
}

// A soma deve totalizar 100% (dentro da tolerância).
export function isOwnershipValid(rights: Pick<EconomicRight, 'percentage'>[]): boolean {
  if (rights.length === 0) return false
  return Math.abs(sumOwnership(rights) - 100) <= TOLERANCE
}

// Percentual detido pelo Botafogo (soma de linhas BFR).
export function bfrShare(rights: Pick<EconomicRight, 'holder_type' | 'percentage'>[]): number {
  return sumOwnership(rights.filter(r => r.holder_type === 'BFR'))
}

// Ordem de exibição estável dos detentores na barra.
const HOLDER_ORDER: Record<HolderType, number> = { BFR: 0, CLUBE: 1, AGENTE: 2, ATLETA: 3, TERCEIRO: 4 }

export function sortRights<T extends Pick<EconomicRight, 'holder_type'>>(rights: T[]): T[] {
  return [...rights].sort((a, b) => HOLDER_ORDER[a.holder_type] - HOLDER_ORDER[b.holder_type])
}

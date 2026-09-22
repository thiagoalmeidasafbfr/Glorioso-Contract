// src/lib/direction.ts
// Direção de um lançamento (a pagar × a receber) a partir das PARTES da
// cláusula (credor/devedor). Hoje a regra é textual: a parte é o próprio clube
// quando o nome contém "botafogo" (ou é o apelido "BFR"). Antes esta regra
// estava duplicada em ~10 arquivos; centralizada aqui para poder, no futuro,
// trocar por uma flag da entidade (ex.: ac_entidades.tipo = 'CLUBE_PROPRIO')
// sem caçar strings pelo código.
//
// ATENÇÃO: há duas variantes históricas e ambas foram preservadas sem mudar a
// semântica de quem as usava:
//   • isBFRParty        → nome contém "botafogo" OU é exatamente "bfr";
//   • mentionsBotafogo  → só "contém botafogo" (usada em somatórios antigos).

export function mentionsBotafogo(party: string | null | undefined): boolean {
  return !!party && party.toLowerCase().includes('botafogo')
}

export function isBFRParty(party: string | null | undefined): boolean {
  if (!party) return false
  const s = party.toLowerCase()
  return s.includes('botafogo') || s === 'bfr'
}

export type PartyDirection = 'A_PAGAR' | 'A_RECEBER'

/** Direção pela parte devedora: Botafogo devedor → a pagar; senão a receber. */
export function directionFromDebtor(debtor: string | null | undefined, strict = false): PartyDirection {
  return (strict ? mentionsBotafogo(debtor) : isBFRParty(debtor)) ? 'A_PAGAR' : 'A_RECEBER'
}

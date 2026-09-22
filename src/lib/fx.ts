// Câmbio de REFERÊNCIA (aproximado) — fonte única para conversões de exibição
// quando a PTAX do dia não está disponível. Antes, a tabela
// { EUR: 6.10, USD: 5.55, GBP: 7.10 } estava duplicada em ~10 arquivos e cada
// tela podia divergir. Para valores oficiais use `fetchPtaxRates`/`toBRL` de
// `./ptax` (que também caem nesta tabela como fallback).

import { CURRENCY_TO_BRL, type AppCurrency } from '../context/AppContext'

/** 1 unidade de `currency` em BRL, pela tabela de referência. Desconhecida → 1. */
export function approxRateBRL(currency: string): number {
  return CURRENCY_TO_BRL[currency as AppCurrency] ?? 1
}

/** Converte `value` em `currency` para BRL pela tabela de referência. */
export function approxToBRL(value: number, currency: string): number {
  return value * approxRateBRL(currency)
}

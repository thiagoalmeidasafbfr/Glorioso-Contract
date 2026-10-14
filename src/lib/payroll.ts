// src/lib/payroll.ts
// Folha CLT do atleta: encargos trabalhistas, provisões de 13º e férias e
// salário líquido.
//
// Tudo incide SÓ sobre o salário CLT — imagem, moradia e demais auxílios ficam
// de fora. Alíquotas da SAF (padrão; a premissa do atleta pode sobrescrever):
//   • INSS 4,5% e FGTS 8% (encargos do clube);
//   • IRPF 27,5% (retido do atleta).
//
// Mês a mês:
//   provisão 13º     = CLT × 1/12
//   provisão férias  = CLT × 1/12 × 4/3          (férias + 1/3 constitucional)
//   INSS / FGTS      = % × (CLT + provisão 13º + provisão férias)
//                      — também incidem sobre 13º e férias, então as provisões
//                      carregam seus encargos (mesmo modelo da FOPAG do orçamento)
//   custo mensal CLT = CLT + provisões + encargos
//   IRPF             = 27,5% × CLT
//   salário líquido  = CLT − IRPF

import { ENCARGOS_DEFAULT, type PremissaAtleta } from '../types/premissas'

export interface PayrollRates {
  inss_patronal_pct: number
  fgts_pct: number
  decimo_terceiro_pct: number
  ferias_pct: number
  outros_encargos_pct: number
  irpf_pct: number
}

/** Alíquotas da premissa do atleta; sem premissa (ou campo vazio), o padrão da SAF. */
export function payrollRates(p?: Partial<PremissaAtleta> | null): PayrollRates {
  return {
    inss_patronal_pct:   p?.inss_patronal_pct   ?? ENCARGOS_DEFAULT.inss_patronal_pct,
    fgts_pct:            p?.fgts_pct            ?? ENCARGOS_DEFAULT.fgts_pct,
    decimo_terceiro_pct: p?.decimo_terceiro_pct ?? ENCARGOS_DEFAULT.decimo_terceiro_pct,
    ferias_pct:          p?.ferias_pct          ?? ENCARGOS_DEFAULT.ferias_pct,
    outros_encargos_pct: p?.outros_encargos_pct ?? ENCARGOS_DEFAULT.outros_encargos_pct,
    irpf_pct:            p?.irpf_pct            ?? ENCARGOS_DEFAULT.irpf_pct,
  }
}

export interface PayrollBreakdown {
  /** salário CLT bruto do mês. */
  clt: number
  prov13: number
  provFerias: number
  inss: number
  fgts: number
  outros: number
  /** INSS + FGTS + outros. */
  encargos: number
  /** CLT + provisões + encargos — o que o mês de CLT custa ao clube. */
  custoMensal: number
  irpf: number
  /** CLT − IRPF. */
  liquido: number
}

/** Folha mensal de um salário CLT (mesma moeda do valor recebido). */
export function payroll(clt: number, rates: PayrollRates = payrollRates()): PayrollBreakdown {
  const prov13 = clt * rates.decimo_terceiro_pct
  const provFerias = clt * rates.ferias_pct
  const base = clt + prov13 + provFerias
  const inss = base * rates.inss_patronal_pct
  const fgts = base * rates.fgts_pct
  const outros = base * rates.outros_encargos_pct
  const encargos = inss + fgts + outros
  const irpf = clt * rates.irpf_pct
  return {
    clt, prov13, provFerias, inss, fgts, outros, encargos,
    custoMensal: clt + prov13 + provFerias + encargos,
    irpf, liquido: clt - irpf,
  }
}

/** Encargos + provisões como fração do CLT (0,34375 = 34,4% com as alíquotas da SAF). */
export function encargosRate(rates: PayrollRates = payrollRates()): number {
  return payroll(1, rates).custoMensal - 1
}

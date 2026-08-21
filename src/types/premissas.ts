// Tipos da aba de PREMISSAS por atleta (Fase 1 do modelo do CFO).
// Espelha public.ac_premissas_atleta (migration 018).

export type PremissaDecisao =
  | 'MANTER'
  | 'RENOVAR'
  | 'VENDER'
  | 'RESCINDIR'
  | 'NOVA_CONTRATACAO'

export const DECISAO_LABELS: Record<PremissaDecisao, string> = {
  MANTER:            'Manter',
  RENOVAR:           'Renovar',
  VENDER:            'Vender',
  RESCINDIR:         'Rescindir',
  NOVA_CONTRATACAO:  'Nova contratação',
}

export type AntecipacaoModo = 'PERCENTUAL' | 'VALOR'

// Item de um cronograma financeiro genérico (luvas, intermediação, recebimento de venda).
export interface CronogramaItem {
  data: string        // YYYY-MM-DD
  valor?: number      // para luvas/intermediação (BRL)
  pct?: number        // para recebimento de venda (0..1)
}

export interface PremissaAtleta {
  id: string
  atleta_id: string | null

  nome: string | null
  data_nascimento: string | null
  posicao: string | null

  valor_mercado_eur: number | null
  valor_mercado_data: string | null

  contrato_inicio: string | null
  contrato_fim: string | null

  salario_brl: number
  imagem_brl: number

  inss_patronal_pct: number
  fgts_pct: number
  decimo_terceiro_pct: number
  ferias_pct: number
  outros_encargos_pct: number

  luvas_total_brl: number
  luvas_cronograma: CronogramaItem[] | null

  intermediacao_total_brl: number
  intermediacao_cronograma: CronogramaItem[] | null

  decisao: PremissaDecisao
  decisao_data: string | null
  decisao_nota: string | null

  venda_valor_eur: number | null
  venda_moeda: string | null
  venda_comissao_pct: number | null
  venda_solidariedade_pct: number | null
  venda_recebimento_cronograma: CronogramaItem[] | null

  antecipar: boolean
  antecipacao_modo: AntecipacaoModo
  antecipacao_pct: number | null
  antecipacao_valor: number | null
  antecipacao_cdi_pct_aa: number | null
  antecipacao_spread_pct_aa: number | null

  renov_novo_salario_brl: number | null
  renov_novo_imagem_brl: number | null
  renov_novas_luvas_brl: number | null
  renov_novo_prazo_meses: number | null

  ativo: boolean
  created_at?: string
  updated_at?: string
}

// Defaults dos encargos (INSS/FGTS/13º/férias) para uma nova premissa.
export const ENCARGOS_DEFAULT = {
  inss_patronal_pct:   0.20,
  fgts_pct:            0.08,
  decimo_terceiro_pct: 1 / 12,
  ferias_pct:          (1 / 12) * (4 / 3),   // 1/12 + 1/3 sobre férias
  outros_encargos_pct: 0,
} as const

export const ANTECIPACAO_DEFAULT = {
  cdi_pct_aa:    0.1150,   // CDI ref. editável
  spread_pct_aa: 0.0700,   // +7% a.a. (padrão CFO)
} as const

export type NewPremissaInput = Omit<PremissaAtleta, 'id' | 'created_at' | 'updated_at'>

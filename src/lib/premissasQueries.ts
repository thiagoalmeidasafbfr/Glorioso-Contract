// Camada de acesso a dados da aba de PREMISSAS por atleta.
// Segue o mesmo padrão dual (Supabase | localStore) do restante do projeto.

import { supabase, USE_SUPABASE } from './supabase'
import { local } from './localStore'
import type { PremissaAtleta, NewPremissaInput } from '../types/premissas'
import { ENCARGOS_DEFAULT, ANTECIPACAO_DEFAULT } from '../types/premissas'

const TABLE = 'ac_premissas_atleta'         // Supabase
const LOCAL = 'premissas_atleta'            // localStore

function withDefaults(p: Partial<PremissaAtleta>): NewPremissaInput {
  return {
    atleta_id:               p.atleta_id ?? null,
    nome:                    p.nome ?? null,
    data_nascimento:         p.data_nascimento ?? null,
    posicao:                 p.posicao ?? null,
    valor_mercado_eur:       p.valor_mercado_eur ?? null,
    valor_mercado_data:      p.valor_mercado_data ?? null,
    contrato_inicio:         p.contrato_inicio ?? null,
    contrato_fim:            p.contrato_fim ?? null,
    salario_brl:             p.salario_brl ?? 0,
    imagem_brl:              p.imagem_brl ?? 0,
    inss_patronal_pct:       p.inss_patronal_pct       ?? ENCARGOS_DEFAULT.inss_patronal_pct,
    fgts_pct:                p.fgts_pct                ?? ENCARGOS_DEFAULT.fgts_pct,
    decimo_terceiro_pct:     p.decimo_terceiro_pct     ?? ENCARGOS_DEFAULT.decimo_terceiro_pct,
    ferias_pct:              p.ferias_pct              ?? ENCARGOS_DEFAULT.ferias_pct,
    outros_encargos_pct:     p.outros_encargos_pct     ?? ENCARGOS_DEFAULT.outros_encargos_pct,
    luvas_total_brl:         p.luvas_total_brl ?? 0,
    luvas_cronograma:        p.luvas_cronograma ?? null,
    intermediacao_total_brl: p.intermediacao_total_brl ?? 0,
    intermediacao_cronograma:p.intermediacao_cronograma ?? null,
    decisao:                 p.decisao ?? 'MANTER',
    decisao_data:            p.decisao_data ?? null,
    decisao_nota:            p.decisao_nota ?? null,
    venda_valor_eur:         p.venda_valor_eur ?? null,
    venda_moeda:             p.venda_moeda ?? 'EUR',
    venda_comissao_pct:      p.venda_comissao_pct ?? 0,
    venda_solidariedade_pct: p.venda_solidariedade_pct ?? 0.05,
    venda_recebimento_cronograma: p.venda_recebimento_cronograma ?? null,
    antecipar:               p.antecipar ?? false,
    antecipacao_modo:        p.antecipacao_modo ?? 'PERCENTUAL',
    antecipacao_pct:         p.antecipacao_pct ?? null,
    antecipacao_valor:       p.antecipacao_valor ?? null,
    antecipacao_cdi_pct_aa:  p.antecipacao_cdi_pct_aa    ?? ANTECIPACAO_DEFAULT.cdi_pct_aa,
    antecipacao_spread_pct_aa:p.antecipacao_spread_pct_aa?? ANTECIPACAO_DEFAULT.spread_pct_aa,
    renov_novo_salario_brl:  p.renov_novo_salario_brl ?? null,
    renov_novo_imagem_brl:   p.renov_novo_imagem_brl ?? null,
    renov_novas_luvas_brl:   p.renov_novas_luvas_brl ?? null,
    renov_novo_prazo_meses:  p.renov_novo_prazo_meses ?? null,
    ativo:                   p.ativo ?? true,
  }
}

// Converte '' → null (Supabase rejeita string vazia em colunas date/numeric).
function nn<T extends Record<string, unknown>>(v: T): T {
  return Object.fromEntries(
    Object.entries(v).map(([k, val]) => [k, val === '' ? null : val]),
  ) as T
}

export async function fetchPremissas(): Promise<PremissaAtleta[]> {
  if (!USE_SUPABASE) {
    return local.all<PremissaAtleta>(LOCAL)
      .filter(r => r.ativo !== false)
      .sort((a, b) => (a.nome ?? '').localeCompare(b.nome ?? ''))
  }
  const { data, error } = await supabase.from(TABLE).select('*').eq('ativo', true).order('nome')
  if (error) throw error
  return (data ?? []) as PremissaAtleta[]
}

export async function fetchPremissaByAtleta(atletaId: string): Promise<PremissaAtleta | null> {
  if (!USE_SUPABASE) {
    return local.where<PremissaAtleta>(LOCAL, 'atleta_id', atletaId).find(r => r.ativo !== false) ?? null
  }
  const { data, error } = await supabase
    .from(TABLE).select('*').eq('atleta_id', atletaId).eq('ativo', true).maybeSingle()
  if (error) return null
  return (data ?? null) as PremissaAtleta | null
}

export async function createPremissa(input: Partial<PremissaAtleta>): Promise<PremissaAtleta> {
  const row = withDefaults(input)
  if (!USE_SUPABASE) return local.insert<PremissaAtleta>(LOCAL, row as unknown as Record<string, unknown>)
  const { data, error } = await supabase.from(TABLE).insert(nn(row as unknown as Record<string, unknown>)).select().single()
  if (error) throw error
  return data as PremissaAtleta
}

export async function updatePremissa(id: string, patch: Partial<PremissaAtleta>): Promise<PremissaAtleta> {
  if (!USE_SUPABASE) return local.update<PremissaAtleta>(LOCAL, id, patch)
  const { data, error } = await supabase.from(TABLE).update(nn(patch as Record<string, unknown>)).eq('id', id).select().single()
  if (error) throw error
  return data as PremissaAtleta
}

export async function deletePremissa(id: string): Promise<void> {
  if (!USE_SUPABASE) return local.remove(LOCAL, id)
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) throw error
}

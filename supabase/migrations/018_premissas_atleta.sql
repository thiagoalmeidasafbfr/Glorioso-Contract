-- ════════════════════════════════════════════════════════════════════════════
-- 018 — Aba de PREMISSAS por atleta (Fase 1 do modelo do CFO)
-- ════════════════════════════════════════════════════════════════════════════
-- Uma linha por atleta (ou por futura contratação ainda sem atleta cadastrado)
-- com TODOS os inputs financeiros e de decisão. O restante do modelo puxa
-- exclusivamente daqui. As colunas cobrem:
--
--   • Identificação (nascimento, posição — cacheadas p/ leitura, mas o atleta
--     em ac_atletas continua sendo a fonte da verdade quando vinculado).
--   • Valor de mercado (Transfermarkt) em EUR.
--   • Contrato vigente (início / fim).
--   • Remuneração base em BRL: salário, imagem, luvas, intermediação.
--   • Encargos DETALHADOS em % (INSS patronal, FGTS, 13º, férias, outros).
--   • Decisão: MANTER / RENOVAR / VENDER / RESCINDIR + data.
--   • Parâmetros de venda: preço, comissão, solidariedade, cronograma (JSONB).
--   • Antecipação de recebíveis: flag, % ou valor, taxa (default CDI+7% a.a.).
--   • Renovação: novo salário/imagem/luvas + prazo.
--   • Novas contratações: linha SEM atleta_id, com nome/nascimento/posição.
--
-- Executar APÓS 017. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

do $$ begin
  create type public.ac_premissa_decisao as enum
    ('MANTER','RENOVAR','VENDER','RESCINDIR','NOVA_CONTRATACAO');
exception when duplicate_object then null; end $$;

create table if not exists public.ac_premissas_atleta (
  id                        uuid primary key default gen_random_uuid(),

  -- Vínculo com atleta existente (NULL quando é uma nova contratação).
  atleta_id                 uuid references public.ac_atletas(id) on delete cascade,

  -- Cache/override de identificação (usado quando atleta_id é NULL).
  nome                      text,
  data_nascimento           date,
  posicao                   text,

  -- Valor de mercado (Transfermarkt) — sempre em EUR.
  valor_mercado_eur         numeric(18,2),
  valor_mercado_data        date,

  -- Contrato vigente (início/fim conforme premissa do CFO).
  contrato_inicio           date,
  contrato_fim              date,

  -- Remuneração mensal (BRL).
  salario_brl               numeric(18,2) default 0,
  imagem_brl                numeric(18,2) default 0,

  -- Encargos DETALHADOS (percentuais aplicados sobre a folha CLT).
  inss_patronal_pct         numeric(7,4) default 0.2000,   -- 20%
  fgts_pct                  numeric(7,4) default 0.0800,   -- 8%
  decimo_terceiro_pct       numeric(7,4) default 0.0833,   -- 1/12
  ferias_pct                numeric(7,4) default 0.1111,   -- 1/12 + 1/3
  outros_encargos_pct       numeric(7,4) default 0.0000,

  -- Luvas (valor total do contrato + cronograma opcional em JSONB).
  luvas_total_brl           numeric(18,2) default 0,
  luvas_cronograma          jsonb,   -- [{data: 'YYYY-MM-DD', valor: n}, ...]

  -- Intermediação (comissão de agente na contratação).
  intermediacao_total_brl   numeric(18,2) default 0,
  intermediacao_cronograma  jsonb,

  -- ── Decisão do management ──────────────────────────────────────────────
  decisao                   public.ac_premissa_decisao not null default 'MANTER',
  decisao_data              date,     -- quando MANTER → NULL; senão a data-alvo
  decisao_nota              text,

  -- ── Parâmetros de VENDA ────────────────────────────────────────────────
  venda_valor_eur           numeric(18,2),
  venda_moeda               text default 'EUR',
  venda_comissao_pct        numeric(7,4) default 0.0000,
  venda_solidariedade_pct   numeric(7,4) default 0.0500,   -- 5% FIFA padrão
  -- Cronograma de recebimento em caixa: parametrizável por linha, sem default.
  -- Formato: [{data: 'YYYY-MM-DD', pct: 0.30}, ...]  (soma dos pct = 1.0)
  venda_recebimento_cronograma jsonb,

  -- ── Antecipação de recebíveis (opcional na venda) ──────────────────────
  antecipar                 boolean default false,
  antecipacao_modo          text default 'PERCENTUAL',      -- 'PERCENTUAL' | 'VALOR'
  antecipacao_pct           numeric(7,4),                   -- se modo=PERCENTUAL
  antecipacao_valor         numeric(18,2),                  -- se modo=VALOR
  -- Taxa a.a. usada para calcular a despesa financeira. Default: CDI + 7% a.a.
  -- Guardamos os dois componentes p/ a UI editar CDI e spread separadamente.
  antecipacao_cdi_pct_aa    numeric(7,4) default 0.1150,    -- CDI ref. (editável)
  antecipacao_spread_pct_aa numeric(7,4) default 0.0700,    -- +7% a.a. padrão

  -- ── Parâmetros de RENOVAÇÃO ────────────────────────────────────────────
  renov_novo_salario_brl    numeric(18,2),
  renov_novo_imagem_brl     numeric(18,2),
  renov_novas_luvas_brl     numeric(18,2),
  renov_novo_prazo_meses    integer,

  ativo                     boolean not null default true,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  -- Só pode haver uma premissa ATIVA por atleta.
  constraint ac_premissas_atleta_unico_ativo
    unique (atleta_id, ativo) deferrable initially deferred
);

create index if not exists ac_premissas_atleta_atleta_idx
  on public.ac_premissas_atleta(atleta_id);
create index if not exists ac_premissas_atleta_decisao_idx
  on public.ac_premissas_atleta(decisao);

drop trigger if exists ac_premissas_atleta_updated_at on public.ac_premissas_atleta;
create trigger ac_premissas_atleta_updated_at
  before update on public.ac_premissas_atleta
  for each row execute function public.ac_set_updated_at();

-- RLS: master edita, todos leem (segue o padrão das outras ac_*).
alter table public.ac_premissas_atleta enable row level security;

drop policy if exists ac_premissas_atleta_select on public.ac_premissas_atleta;
create policy ac_premissas_atleta_select on public.ac_premissas_atleta
  for select using (true);

drop policy if exists ac_premissas_atleta_write on public.ac_premissas_atleta;
create policy ac_premissas_atleta_write on public.ac_premissas_atleta
  for all using (public.get_my_role() = 'master')
  with check (public.get_my_role() = 'master');

comment on table public.ac_premissas_atleta is
  'Aba centralizada de premissas por atleta (Fase 1 do modelo do CFO). Uma linha por atleta ativo, futuro contratado ou em decisão de venda/rescisão. Todo o motor de projeção puxa daqui.';

-- FIM 018

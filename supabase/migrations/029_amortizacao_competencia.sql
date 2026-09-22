-- ════════════════════════════════════════════════════════════════════════════
-- 029 — Amortização persistida por competência (fechamento mensal)
-- ════════════════════════════════════════════════════════════════════════════
-- Hoje a amortização do intangível (direitos econômicos) é calculada na tela
-- (PageAmortizacao) e não fica gravada. Esta tabela congela o fechamento de
-- cada competência por atleta, para relatório contábil e comparação histórica.
--
--   public.ac_amortizacao_fechamentos
--     id uuid pk
--     competencia date not null           1º dia do mês (normalizado por trigger)
--     atleta_id uuid not null → ac_atletas (cascade)
--     valor_intangivel_brl      numeric(18,2)  custo capitalizado total (BRL)
--     amortizacao_mes_brl       numeric(18,2)  amortização da competência
--     amortizacao_acumulada_brl numeric(18,2)  acumulado até a competência (inclusive)
--     saldo_liquido_brl         numeric(18,2)  intangível − acumulado
--     ptax_aquisicao            numeric(18,6)  PTAX usada na aquisição (moeda→BRL)
--     detalhes jsonb                           livre (memória de cálculo, contratos, etc.)
--     fechado_por uuid default auth.uid(), fechado_em timestamptz default now()
--     UNIQUE (competencia, atleta_id) — upsert: onConflict 'competencia,atleta_id'
--
-- RLS: leitura perfis ativos; escrita (insert/update/delete) master, controladoria.
--
-- Executar APÓS 028. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.ac_amortizacao_fechamentos (
  id                        uuid primary key default gen_random_uuid(),
  competencia               date not null,
  atleta_id                 uuid not null references public.ac_atletas(id) on delete cascade,
  valor_intangivel_brl      numeric(18,2),
  amortizacao_mes_brl       numeric(18,2),
  amortizacao_acumulada_brl numeric(18,2),
  saldo_liquido_brl         numeric(18,2),
  ptax_aquisicao            numeric(18,6),
  detalhes                  jsonb,
  fechado_por               uuid default auth.uid(),
  fechado_em                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),  -- compat c/ ac_set_updated_at (012)
  constraint ac_amortizacao_fechamentos_unico unique (competencia, atleta_id)
);

create index if not exists idx_ac_amort_fech_atleta on public.ac_amortizacao_fechamentos(atleta_id, competencia);

create or replace function public.ac_amortizacao_fechamento_touch()
returns trigger language plpgsql as $$
begin
  new.competencia := date_trunc('month', new.competencia)::date;
  if tg_op = 'UPDATE' then
    new.fechado_em := now();
    if auth.uid() is not null then new.fechado_por := auth.uid(); end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_ac_amortizacao_fechamento_touch on public.ac_amortizacao_fechamentos;
create trigger trg_ac_amortizacao_fechamento_touch
  before insert or update on public.ac_amortizacao_fechamentos
  for each row execute function public.ac_amortizacao_fechamento_touch();

alter table public.ac_amortizacao_fechamentos enable row level security;
drop policy if exists "ac read ac_amortizacao_fechamentos"    on public.ac_amortizacao_fechamentos;  -- se a 012 for reaplicada
drop policy if exists "ac write ac_amortizacao_fechamentos"   on public.ac_amortizacao_fechamentos;
drop policy if exists "ac leitura ac_amortizacao_fechamentos" on public.ac_amortizacao_fechamentos;
drop policy if exists "ac escrita ac_amortizacao_fechamentos" on public.ac_amortizacao_fechamentos;
create policy "ac leitura ac_amortizacao_fechamentos" on public.ac_amortizacao_fechamentos
  for select to authenticated using (public.get_my_role() is not null);
create policy "ac escrita ac_amortizacao_fechamentos" on public.ac_amortizacao_fechamentos
  for all to authenticated
  using (public.has_role('master','controladoria'))
  with check (public.has_role('master','controladoria'));

do $$ begin
  if to_regprocedure('public.ac_audit_attach(text)') is not null then
    perform public.ac_audit_attach('ac_amortizacao_fechamentos');
  end if;
end $$;

-- FIM 029

-- ════════════════════════════════════════════════════════════════════════════
-- 028 — Desempenho (insumo dos gatilhos) + histórico de PTAX
-- ════════════════════════════════════════════════════════════════════════════
-- (a) DESEMPENHO
--   public.ac_desempenho_atleta — agregado por atleta/temporada/competição:
--     id uuid pk, atleta_id uuid not null → ac_atletas (cascade),
--     temporada text not null ('2026', '2025/26'…),
--     competicao text not null default ''   ('' = TOTAL da temporada),
--     jogos int, gols int, assistencias int, minutos int (default 0, ≥ 0),
--     fonte text (ex.: 'MANUAL', 'SOFASCORE'), atualizado_em timestamptz,
--     created_by, updated_by.
--     UNIQUE (atleta_id, temporada, competicao) — upsert:
--       onConflict: 'atleta_id,temporada,competicao'
--   (ac_eventos_desempenho do 012 é por evento/data e sem chave de upsert, por
--    isso NÃO foi reaproveitada.)
--   Escrita: master, futebol. Leitura: perfis ativos.
--
--   ac_gatilhos_salario: a métrica e o limite JÁ existem (metric, threshold).
--   Colunas novas:
--     valor_atual            numeric   valor apurado manualmente (sobrepõe o agregado)
--     temporada_referencia   text      NULL = soma de todas as temporadas
--     competicao_referencia  text      NULL = total da temporada
--   RPC atualizar_valor_gatilho(p_id uuid, p_valor numeric) → void [master, juridico, futebol]
--     (futebol não tem escrita em ac_gatilhos_salario; a RPC só mexe em valor_atual).
--
--   View public.vw_ac_gatilhos_progresso:
--     gatilho_id, atleta_id, contrato_id, description, metric, threshold, status,
--     new_salary, new_image_value, currency, temporada_referencia, competicao_referencia,
--     valor_desempenho (agregado de ac_desempenho_atleta), valor_atual (manual),
--     valor_apurado = coalesce(valor_atual, valor_desempenho),
--     fonte_valor ('MANUAL' | 'DESEMPENHO' | null),
--     progresso = valor_apurado / threshold (null se threshold nulo/0),
--     atingido  = progresso >= 1
--   Agregação por temporada: se existe a linha competicao = '' ela é o total;
--   senão soma as competições. Métricas TITULO/OUTRO só via valor_atual.
--
-- (b) PTAX — reaproveita public.ac_taxas_cambio (012):
--     moeda_codigo text (→ ac_moedas: BRL/EUR/USD/GBP), data date,
--     ptax_compra numeric (agora opcional), ptax_venda numeric not null,
--     fonte text default 'PTAX-BCB'; UNIQUE (moeda_codigo, data).
--   Upsert pelo front: onConflict 'moeda_codigo,data'.
--   Leitura, insert e update: qualquer perfil ativo; delete: master.
--   public.ptax_em(p_moeda text, p_data date) → numeric: ptax_venda mais recente
--     com data <= p_data (BRL → 1; NULL se não houver cotação).
--
-- Executar APÓS 027. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

-- ── (a) Desempenho ──────────────────────────────────────────────────────────
create table if not exists public.ac_desempenho_atleta (
  id            uuid primary key default gen_random_uuid(),
  atleta_id     uuid not null references public.ac_atletas(id) on delete cascade,
  temporada     text not null,
  competicao    text not null default '',
  jogos         int  not null default 0,
  gols          int  not null default 0,
  assistencias  int  not null default 0,
  minutos       int  not null default 0,
  fonte         text,
  atualizado_em timestamptz not null default now(),
  updated_at    timestamptz not null default now(),  -- compat c/ ac_set_updated_at (012)
  created_by    uuid default auth.uid(),
  updated_by    uuid,
  constraint ac_desempenho_atleta_unico unique (atleta_id, temporada, competicao),
  check (jogos >= 0 and gols >= 0 and assistencias >= 0 and minutos >= 0)
);

create index if not exists idx_ac_desempenho_atleta on public.ac_desempenho_atleta(atleta_id);

create or replace function public.ac_desempenho_touch()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  if tg_op = 'UPDATE' then
    if auth.uid() is not null then new.updated_by := auth.uid(); end if;
    new.created_by := old.created_by;
  end if;
  return new;
end $$;

drop trigger if exists trg_ac_desempenho_touch on public.ac_desempenho_atleta;
create trigger trg_ac_desempenho_touch before insert or update on public.ac_desempenho_atleta
  for each row execute function public.ac_desempenho_touch();

alter table public.ac_desempenho_atleta enable row level security;
drop policy if exists "ac read ac_desempenho_atleta"    on public.ac_desempenho_atleta;  -- se a 012 for reaplicada
drop policy if exists "ac write ac_desempenho_atleta"   on public.ac_desempenho_atleta;
drop policy if exists "ac leitura ac_desempenho_atleta" on public.ac_desempenho_atleta;
drop policy if exists "ac escrita ac_desempenho_atleta" on public.ac_desempenho_atleta;
create policy "ac leitura ac_desempenho_atleta" on public.ac_desempenho_atleta
  for select to authenticated using (public.get_my_role() is not null);
create policy "ac escrita ac_desempenho_atleta" on public.ac_desempenho_atleta
  for all to authenticated
  using (public.has_role('master','futebol')) with check (public.has_role('master','futebol'));

do $$ begin
  if to_regprocedure('public.ac_audit_attach(text)') is not null then
    perform public.ac_audit_attach('ac_desempenho_atleta');
  end if;
end $$;

alter table public.ac_gatilhos_salario
  add column if not exists valor_atual           numeric(18,4),
  add column if not exists temporada_referencia  text,
  add column if not exists competicao_referencia text;

create or replace view public.vw_ac_gatilhos_progresso as
with por_temporada as (
  select d.atleta_id, d.temporada,
         -- total explícito (competicao = '') tem prioridade sobre a soma
         coalesce(max(d.jogos)        filter (where d.competicao = ''), sum(d.jogos)        filter (where d.competicao <> '')) as jogos,
         coalesce(max(d.gols)         filter (where d.competicao = ''), sum(d.gols)         filter (where d.competicao <> '')) as gols,
         coalesce(max(d.assistencias) filter (where d.competicao = ''), sum(d.assistencias) filter (where d.competicao <> '')) as assistencias,
         coalesce(max(d.minutos)      filter (where d.competicao = ''), sum(d.minutos)      filter (where d.competicao <> '')) as minutos
    from public.ac_desempenho_atleta d
   group by d.atleta_id, d.temporada
),
base as (
  select g.*,
         case
           when g.metric not in ('JOGOS','GOLS','ASSISTENCIAS','MINUTOS') then null
           when g.competicao_referencia is not null then (
             select sum(case g.metric when 'JOGOS' then d.jogos when 'GOLS' then d.gols
                                      when 'ASSISTENCIAS' then d.assistencias else d.minutos end)
               from public.ac_desempenho_atleta d
              where d.atleta_id = g.atleta_id
                and d.competicao = g.competicao_referencia
                and (g.temporada_referencia is null or d.temporada = g.temporada_referencia))
           else (
             select sum(case g.metric when 'JOGOS' then t.jogos when 'GOLS' then t.gols
                                      when 'ASSISTENCIAS' then t.assistencias else t.minutos end)
               from por_temporada t
              where t.atleta_id = g.atleta_id
                and (g.temporada_referencia is null or t.temporada = g.temporada_referencia))
         end::numeric as valor_desempenho
    from public.ac_gatilhos_salario g
)
select b.id                    as gatilho_id,
       b.atleta_id,
       b.contrato_id,
       b.description,
       b.metric,
       b.threshold,
       b.status,
       b.new_salary,
       b.new_image_value,
       b.currency,
       b.temporada_referencia,
       b.competicao_referencia,
       b.valor_desempenho,
       b.valor_atual,
       coalesce(b.valor_atual, b.valor_desempenho) as valor_apurado,
       case when b.valor_atual is not null then 'MANUAL'
            when b.valor_desempenho is not null then 'DESEMPENHO' end as fonte_valor,
       case when coalesce(b.threshold, 0) = 0 then null
            else round(coalesce(b.valor_atual, b.valor_desempenho) / b.threshold, 4) end as progresso,
       coalesce(coalesce(b.valor_atual, b.valor_desempenho) >= b.threshold, false)
         and coalesce(b.threshold, 0) > 0 as atingido
  from base b
 -- views rodam como o dono: repete o filtro de leitura (cron/service passam)
 where auth.uid() is null or public.get_my_role() is not null;

comment on view public.vw_ac_gatilhos_progresso is
  'Progresso dos gatilhos salariais: valor apurado (manual ou desempenho agregado) / threshold.';

create or replace function public.atualizar_valor_gatilho(p_id uuid, p_valor numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role('master','juridico','futebol') then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  update public.ac_gatilhos_salario set valor_atual = p_valor where id = p_id;
  if not found then
    raise exception 'Gatilho % não encontrado', p_id using errcode = 'P0002';
  end if;
end $$;

-- ── (b) PTAX ────────────────────────────────────────────────────────────────
create table if not exists public.ac_taxas_cambio (
  id           uuid primary key default gen_random_uuid(),
  moeda_codigo text not null,
  data         date not null,
  ptax_compra  numeric(18,6),
  ptax_venda   numeric(18,6) not null,
  fonte        text default 'PTAX-BCB',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (moeda_codigo, data)
);

alter table public.ac_taxas_cambio alter column ptax_compra drop not null;
create index if not exists idx_ac_cambio_moeda_data on public.ac_taxas_cambio(moeda_codigo, data);

drop trigger if exists trg_ac_taxas_cambio_updated on public.ac_taxas_cambio;
create trigger trg_ac_taxas_cambio_updated before update on public.ac_taxas_cambio
  for each row execute function public.ac_set_updated_at();

alter table public.ac_taxas_cambio enable row level security;
drop policy if exists "ac read ac_taxas_cambio"      on public.ac_taxas_cambio;
drop policy if exists "ac write ac_taxas_cambio"     on public.ac_taxas_cambio;
drop policy if exists "ac leitura ac_taxas_cambio"   on public.ac_taxas_cambio;
drop policy if exists "ac escrita ac_taxas_cambio"   on public.ac_taxas_cambio;
drop policy if exists "ac insert ac_taxas_cambio"    on public.ac_taxas_cambio;
drop policy if exists "ac update ac_taxas_cambio"    on public.ac_taxas_cambio;
drop policy if exists "ac delete ac_taxas_cambio"    on public.ac_taxas_cambio;
create policy "ac leitura ac_taxas_cambio" on public.ac_taxas_cambio
  for select to authenticated using (public.get_my_role() is not null);
create policy "ac insert ac_taxas_cambio" on public.ac_taxas_cambio
  for insert to authenticated with check (public.get_my_role() is not null);
create policy "ac update ac_taxas_cambio" on public.ac_taxas_cambio
  for update to authenticated
  using (public.get_my_role() is not null) with check (public.get_my_role() is not null);
create policy "ac delete ac_taxas_cambio" on public.ac_taxas_cambio
  for delete to authenticated using (public.has_role('master'));

create or replace function public.ptax_em(p_moeda text, p_data date)
returns numeric language sql stable security definer set search_path = public as $$
  select case
    when upper(coalesce(p_moeda, 'BRL')) = 'BRL' then 1::numeric
    else (select t.ptax_venda from public.ac_taxas_cambio t
           where t.moeda_codigo = upper(p_moeda) and t.data <= coalesce(p_data, current_date)
           order by t.data desc limit 1)
  end
$$;

comment on function public.ptax_em(text, date) is
  'PTAX de venda mais recente em ou antes da data (BRL = 1; NULL se não houver cotação).';

-- FIM 028

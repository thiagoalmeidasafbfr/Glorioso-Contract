-- ── Titularidade Econômica do Atleta (Direitos Econômicos) ────────────────
-- Executar APÓS 004_athletes_system.sql
-- Modela a composição de direitos econômicos de cada atleta como uma tabela
-- filha (1 linha por detentor), permitindo N detentores por atleta:
-- Botafogo (BFR), clube parceiro, terceiro (fundo/empresa) ou o próprio atleta.
-- A soma dos percentuais de um atleta deve totalizar 100%.

-- ── 1. Coluna de posição em athletes (para squad view futura) ─────────────
alter table public.athletes
  add column if not exists position text;

-- ── 2. athlete_economic_rights ────────────────────────────────────────────
create table if not exists public.athlete_economic_rights (
  id           uuid        primary key default gen_random_uuid(),
  athlete_id   uuid        not null references public.athletes(id) on delete cascade,
  holder_type  text        not null
    check (holder_type in ('BFR', 'CLUBE', 'TERCEIRO', 'ATLETA')),
  holder_name  text,
  percentage   numeric     not null default 0
    check (percentage >= 0 and percentage <= 100),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_econ_rights_athlete
  on public.athlete_economic_rights(athlete_id);

-- ── 3. RLS (mesmo padrão de 004) ──────────────────────────────────────────
alter table public.athlete_economic_rights enable row level security;

drop policy if exists "Auth read economic_rights"     on public.athlete_economic_rights;
drop policy if exists "Juridico write economic_rights" on public.athlete_economic_rights;

create policy "Auth read economic_rights"
  on public.athlete_economic_rights
  for select to authenticated using (true);

create policy "Juridico write economic_rights"
  on public.athlete_economic_rights
  for all using (public.get_my_role() in ('master', 'juridico'));

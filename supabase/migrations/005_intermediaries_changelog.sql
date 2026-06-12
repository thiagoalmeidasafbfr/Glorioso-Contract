-- ── Intermediaries & Change Log — Migration 005 ─────────────────────────
-- Run after 004_athletes_system.sql
-- Adds: intermediaries table, change_log table, FK on athletes.intermediary_id

-- ── 1. intermediaries ─────────────────────────────────────────────────────
create table if not exists public.intermediaries (
  id             uuid        primary key default gen_random_uuid(),
  full_name      text        not null,
  company_name   text,
  email          text,
  phone          text,
  country        text        not null default 'Brasil',
  license_number text,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ── 2. change_log ─────────────────────────────────────────────────────────
create table if not exists public.change_log (
  id          uuid        primary key default gen_random_uuid(),
  athlete_id  uuid        references public.athletes(id) on delete cascade,
  table_name  text        not null,
  record_id   text        not null,
  operation   text        not null check (operation in ('INSERT','UPDATE','DELETE')),
  old_values  jsonb,
  new_values  jsonb,
  user_id     uuid        references auth.users(id) on delete set null,
  user_email  text,
  created_at  timestamptz not null default now()
);

-- ── 3. athletes.intermediary_id FK ───────────────────────────────────────
alter table public.athletes
  add column if not exists intermediary_id uuid
    references public.intermediaries(id) on delete set null;

-- ── 4. Indexes ────────────────────────────────────────────────────────────
create index if not exists idx_change_log_athlete
  on public.change_log(athlete_id);

create index if not exists idx_change_log_created
  on public.change_log(created_at desc);

-- ── 5. RLS: intermediaries ────────────────────────────────────────────────
alter table public.intermediaries enable row level security;

create policy "Auth read intermediaries"
  on public.intermediaries for select
  to authenticated using (true);

create policy "Master insert intermediaries"
  on public.intermediaries for insert
  to authenticated
  with check (public.get_my_role() = 'master');

create policy "Master update intermediaries"
  on public.intermediaries for update
  to authenticated
  using (public.get_my_role() = 'master');

create policy "Master delete intermediaries"
  on public.intermediaries for delete
  to authenticated
  using (public.get_my_role() = 'master');

-- ── 6. RLS: change_log ────────────────────────────────────────────────────
alter table public.change_log enable row level security;

create policy "Auth read change_log"
  on public.change_log for select
  to authenticated using (true);

create policy "Auth insert change_log"
  on public.change_log for insert
  to authenticated with check (true);

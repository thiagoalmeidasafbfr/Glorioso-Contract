-- ── Cadastros de Clubes e Intermediários ──────────────────────────────────
-- Executar APÓS 006_athlete_central.sql
-- Cadastros próprios (com escudo/logo) para clubes e intermediários. Os
-- passivos (club_liabilities / intermediary_liabilities) continuam guardando o
-- nome; estes cadastros fornecem o escudo/logo e a página de detalhe. O
-- logo_url guarda uma data URL (base64) ou uma URL http — ambos servem.

create table if not exists public.clubs (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null unique,
  country     text,
  logo_url    text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.intermediaries (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null unique,
  contact     text,
  logo_url    text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── RLS (mesmo padrão das demais tabelas) ─────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['clubs','intermediaries']
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "Auth read %1$s" on public.%1$s;', t);
    execute format('drop policy if exists "Juridico write %1$s" on public.%1$s;', t);
    execute format('create policy "Auth read %1$s" on public.%1$s for select to authenticated using (true);', t);
    execute format('create policy "Juridico write %1$s" on public.%1$s for all using (public.get_my_role() in (''master'',''juridico''));', t);
  end loop;
end $$;

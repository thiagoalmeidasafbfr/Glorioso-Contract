-- ── Modelo Unificado: Atleta como Figura Central ──────────────────────────
-- Executar APÓS 005_economic_rights.sql
-- Consolida salário, gatilhos de meta, passivos (clube/intermediário) e
-- direito de imagem como entidades-filhas de athletes (uuid). Tudo referencia
-- athlete_id — não existe passivo/imagem/intermediário sem atleta.

-- ── 1. Salário base no contrato ───────────────────────────────────────────
alter table public.contracts add column if not exists base_salary     numeric;
alter table public.contracts add column if not exists salary_currency text not null default 'BRL';

-- ── 2. Gatilhos de mudança salarial por meta ──────────────────────────────
-- Ex.: "ao atingir 10 jogos, salário passa a 300k". Ao marcar ATINGIDA com
-- uma data, o salário efetivo muda a partir daquela data.
create table if not exists public.salary_triggers (
  id            uuid        primary key default gen_random_uuid(),
  athlete_id    uuid        not null references public.athletes(id) on delete cascade,
  contract_id   uuid        references public.contracts(id) on delete cascade,
  description   text        not null,
  metric        text        not null default 'JOGOS'
    check (metric in ('JOGOS','GOLS','ASSISTENCIAS','MINUTOS','TITULO','OUTRO')),
  threshold     numeric,
  new_salary    numeric     not null,
  currency      text        not null default 'BRL',
  status        text        not null default 'PENDENTE'
    check (status in ('PENDENTE','ATINGIDA','NAO_ATINGIDA')),
  achieved_date date,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── 3. Passivos com clube (ligados ao atleta) ─────────────────────────────
create table if not exists public.club_liabilities (
  id                    uuid        primary key default gen_random_uuid(),
  athlete_id            uuid        not null references public.athletes(id) on delete cascade,
  club_name             text        not null,
  description           text,
  direction             text        not null default 'A_PAGAR'
    check (direction in ('A_PAGAR','A_RECEBER')),
  amount                numeric     not null default 0,
  currency              text        not null default 'BRL',
  due_date              date,
  conditional           boolean     not null default false,
  condition_description text,
  solidarity            boolean     not null default false,
  status                text        not null default 'PENDENTE'
    check (status in ('PENDENTE','PAGA','EM_ATRASO','CANCELADA')),
  settled_date          date,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ── 4. Passivos com intermediário (ligados ao atleta) ─────────────────────
create table if not exists public.intermediary_liabilities (
  id                    uuid        primary key default gen_random_uuid(),
  athlete_id            uuid        not null references public.athletes(id) on delete cascade,
  intermediary_name     text        not null,
  description           text,
  direction             text        not null default 'A_PAGAR'
    check (direction in ('A_PAGAR','A_RECEBER')),
  amount                numeric     not null default 0,
  currency              text        not null default 'BRL',
  due_date              date,
  conditional           boolean     not null default false,
  condition_description text,
  penalty_terms         text,
  status                text        not null default 'PENDENTE'
    check (status in ('PENDENTE','PAGA','EM_ATRASO','CANCELADA')),
  settled_date          date,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ── 5. Direito de imagem (parcelas mensais, ligado ao atleta) ─────────────
create table if not exists public.image_rights (
  id          uuid        primary key default gen_random_uuid(),
  athlete_id  uuid        not null references public.athletes(id) on delete cascade,
  month       text        not null,     -- 'YYYY-MM'
  amount      numeric     not null default 0,
  currency    text        not null default 'BRL',
  status      text        not null default 'PENDENTE'
    check (status in ('PENDENTE','PAGA','EM_ATRASO','CANCELADA')),
  paid_date   date,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (athlete_id, month)
);

-- ── 6. Índices ────────────────────────────────────────────────────────────
create index if not exists idx_salary_triggers_athlete on public.salary_triggers(athlete_id);
create index if not exists idx_club_liab_athlete        on public.club_liabilities(athlete_id);
create index if not exists idx_inter_liab_athlete       on public.intermediary_liabilities(athlete_id);
create index if not exists idx_image_rights_athlete     on public.image_rights(athlete_id);

-- ── 7. RLS (mesmo padrão de 004/005) ──────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['salary_triggers','club_liabilities','intermediary_liabilities','image_rights']
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "Auth read %1$s" on public.%1$s;', t);
    execute format('drop policy if exists "Juridico write %1$s" on public.%1$s;', t);
    execute format('create policy "Auth read %1$s" on public.%1$s for select to authenticated using (true);', t);
    execute format('create policy "Juridico write %1$s" on public.%1$s for all using (public.get_my_role() in (''master'',''juridico''));', t);
  end loop;
end $$;

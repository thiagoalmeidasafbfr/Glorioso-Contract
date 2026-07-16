-- ── Categoria do atleta + PJ (pessoa jurídica) + imagem atrelada à PJ ──────
-- Executar APÓS 010.
-- 1. Categoria do atleta: Base / Profissional / Comissão Técnica.
-- 2. Tabela athlete_pjs: um atleta pode ter várias PJs (troca ao longo do tempo).
-- 3. image_rights.pj_id: o Direito de Imagem passa a ficar atrelado a uma PJ.

-- ── 1. Categoria ────────────────────────────────────────────────────────────
alter table public.athletes add column if not exists category text not null default 'PROFISSIONAL'
  check (category in ('BASE','PROFISSIONAL','COMISSAO_TECNICA'));

-- ── 2. PJs do atleta ────────────────────────────────────────────────────────
create table if not exists public.athlete_pjs (
  id          uuid        primary key default gen_random_uuid(),
  athlete_id  uuid        not null references public.athletes(id) on delete cascade,
  legal_name  text        not null,       -- razão social
  cnpj        text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_athlete_pjs_athlete on public.athlete_pjs(athlete_id);

-- ── 3. Direito de imagem atrelado à PJ ──────────────────────────────────────
alter table public.image_rights add column if not exists pj_id uuid
  references public.athlete_pjs(id) on delete set null;
create index if not exists idx_image_rights_pj on public.image_rights(pj_id);

-- ── 4. RLS (mesmo padrão de 004/005/006) ────────────────────────────────────
do $$
begin
  execute 'alter table public.athlete_pjs enable row level security;';
  execute 'drop policy if exists "Auth read athlete_pjs" on public.athlete_pjs;';
  execute 'drop policy if exists "Juridico write athlete_pjs" on public.athlete_pjs;';
  execute 'create policy "Auth read athlete_pjs" on public.athlete_pjs for select to authenticated using (true);';
  execute 'create policy "Juridico write athlete_pjs" on public.athlete_pjs for all using (public.get_my_role() in (''master'',''juridico''));';
end $$;

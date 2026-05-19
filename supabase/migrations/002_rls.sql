-- ── Glorioso Finance — Row Level Security ─────────────────────────────
-- Run after 001_schema.sql

-- ── Reusable helper ───────────────────────────────────────────────────
create or replace function public.get_my_role()
returns text language sql stable security definer as $$
  select role from public.profiles where id = auth.uid()
$$;

-- ── Profiles ──────────────────────────────────────────────────────────
alter table public.profiles enable row level security;

create policy "Own profile is always visible"
  on public.profiles for select
  using (id = auth.uid());

create policy "Master sees all profiles"
  on public.profiles for select
  using (public.get_my_role() = 'master');

create policy "Master manages profiles"
  on public.profiles for all
  using (public.get_my_role() = 'master');

-- ── Helper macro: all authenticated can read ──────────────────────────
-- Applied to every data table below.

-- ── Atletas ───────────────────────────────────────────────────────────
alter table public.atletas enable row level security;
create policy "Auth read atletas"   on public.atletas for select to authenticated using (true);
create policy "Master write atletas" on public.atletas for all using (public.get_my_role() = 'master');

-- ── Atleta Intermediários ─────────────────────────────────────────────
alter table public.atleta_intermediarios enable row level security;
create policy "Auth read atleta_intermediarios"    on public.atleta_intermediarios for select to authenticated using (true);
create policy "Master write atleta_intermediarios" on public.atleta_intermediarios for all using (public.get_my_role() = 'master');

-- ── Bichos ────────────────────────────────────────────────────────────
alter table public.atleta_bichos enable row level security;
create policy "Auth read bichos"    on public.atleta_bichos for select to authenticated using (true);
create policy "Master write bichos" on public.atleta_bichos for all using (public.get_my_role() = 'master');

-- ── Pagamentos Certos ─────────────────────────────────────────────────
alter table public.pagamentos_certos enable row level security;
create policy "Auth read pag_certos"   on public.pagamentos_certos for select to authenticated using (true);
create policy "Juridico write pag_certos" on public.pagamentos_certos for all
  using (public.get_my_role() in ('master', 'juridico'));

-- ── Pagamentos Condicionais ───────────────────────────────────────────
alter table public.pagamentos_condicionais enable row level security;
create policy "Auth read pag_cond"   on public.pagamentos_condicionais for select to authenticated using (true);
create policy "Juridico write pag_cond" on public.pagamentos_condicionais for all
  using (public.get_my_role() in ('master', 'juridico'));

-- ── Acordos ───────────────────────────────────────────────────────────
alter table public.acordos enable row level security;
create policy "Auth read acordos"    on public.acordos for select to authenticated using (true);
create policy "Juridico write acordos" on public.acordos for all
  using (public.get_my_role() in ('master', 'juridico'));

-- ── Condicionais Salário ──────────────────────────────────────────────
alter table public.condicionais_salario enable row level security;
create policy "Auth read cond_sal"   on public.condicionais_salario for select to authenticated using (true);
create policy "Juridico write cond_sal" on public.condicionais_salario for all
  using (public.get_my_role() in ('master', 'juridico'));

-- ── Passivos Clube ────────────────────────────────────────────────────
alter table public.passivos_clube enable row level security;
create policy "Auth read passivos_clube"    on public.passivos_clube for select to authenticated using (true);
create policy "Juridico write passivos_clube" on public.passivos_clube for all
  using (public.get_my_role() in ('master', 'juridico'));

-- ── Passivos Intermediário ────────────────────────────────────────────
alter table public.passivos_intermediario enable row level security;
create policy "Auth read passivos_inter"    on public.passivos_intermediario for select to authenticated using (true);
create policy "Juridico write passivos_inter" on public.passivos_intermediario for all
  using (public.get_my_role() in ('master', 'juridico'));

-- ── Parcelas Direito de Imagem ────────────────────────────────────────
alter table public.parcelas_direito_imagem enable row level security;
create policy "Auth read parcelas_imagem"    on public.parcelas_direito_imagem for select to authenticated using (true);
create policy "Juridico write parcelas_imagem" on public.parcelas_direito_imagem for all
  using (public.get_my_role() in ('master', 'juridico'));

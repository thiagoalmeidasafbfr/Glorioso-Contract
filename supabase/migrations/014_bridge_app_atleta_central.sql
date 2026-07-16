-- ════════════════════════════════════════════════════════════════════════════
-- 014 — Ponte App ↔ Schema Atleta-Central
-- ════════════════════════════════════════════════════════════════════════════
-- Objetivo: permitir que o app atual (tipos "achatados": Athlete, Contract,
-- Clause, ImageRight, ...) rode SOBRE o schema robusto `ac_*` (012), sem reescrever
-- páginas/componentes. O adaptador em src/lib/athleteQueries.ts (branch Supabase)
-- passa a ler/gravar aqui.
--
-- Backbone ROBUSTO (fonte da verdade compartilhada), com colunas de compat:
--   ac_atletas, ac_entidades (+_pj_imagem), ac_contratos.
-- Tabelas-PONTE (detalhe financeiro específico do app), 1:1 com o legado,
--   sempre atreladas a ac_atletas:
--   ac_titularidade_economica, ac_clausulas_fin, ac_parcelas_fin,
--   ac_passivos_clube, ac_passivos_agente, ac_direitos_imagem,
--   ac_gatilhos_salario, ac_alertas.
--
-- Executar APÓS 012. (013/seed do JOÃO é independente.)
-- ════════════════════════════════════════════════════════════════════════════

-- ── Colunas de compatibilidade no backbone ──────────────────────────────────
alter table public.ac_atletas
  add column if not exists categoria       text not null default 'PROFISSIONAL'
    check (categoria in ('BASE','PROFISSIONAL','COMISSAO_TECNICA')),
  add column if not exists agente_nome      text,
  add column if not exists agente_contato   text,
  add column if not exists nacionalidade    text,
  add column if not exists passaporte       text,
  add column if not exists foto_url         text,
  add column if not exists external_ref     text;

alter table public.ac_entidades
  add column if not exists logo_url     text,
  add column if not exists external_ref text,
  add column if not exists contato      text;

-- ac_contratos guarda os campos "inline" do Contract legado (salário/imagem/taxa)
-- para round-trip exato. O tipo robusto (ac_contrato_tipo) fica em `tipo`; o tipo
-- legado (ENTRADA/SAIDA/EMPRESTIMO_*) fica em `subtipo_legado`.
alter table public.ac_contratos
  add column if not exists subtipo_legado    text,
  add column if not exists contraparte_nome  text,
  add column if not exists contraparte_pais  text,
  add column if not exists transfer_fee_gross numeric(18,2),
  add column if not exists transfer_currency  text default 'EUR',
  add column if not exists base_salary        numeric(18,2),
  add column if not exists salary_currency     text default 'BRL',
  add column if not exists image_value        numeric(18,2),
  add column if not exists other_value        numeric(18,2),
  add column if not exists created_by         text;

-- ── Tabelas-ponte ────────────────────────────────────────────────────────────

-- Titularidade econômica (split de % entre detentores). Conceito ausente no 012.
create table if not exists public.ac_titularidade_economica (
  id          uuid primary key default gen_random_uuid(),
  atleta_id   uuid not null references public.ac_atletas(id) on delete cascade,
  holder_type text not null default 'TERCEIRO'
    check (holder_type in ('BFR','CLUBE','AGENTE','ATLETA','TERCEIRO')),
  holder_name text,
  percentage  numeric(7,4) not null default 0 check (percentage >= 0 and percentage <= 100),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Cláusulas do app (linha financeira com cronograma). Espelha o legado `clauses`.
create table if not exists public.ac_clausulas_fin (
  id                    uuid primary key default gen_random_uuid(),
  atleta_id             uuid not null references public.ac_atletas(id) on delete cascade,
  contrato_id           uuid references public.ac_contratos(id) on delete cascade,
  source_key            text,
  clause_type           text not null,
  description           text not null default '',
  creditor_party        text not null default '',
  debtor_party          text not null default '',
  currency              text not null default 'BRL',
  original_value        numeric(18,2),
  percentage_value      numeric(7,4),
  condition_description text,
  due_date              date,
  installments_total    int not null default 1,
  installments_paid     int not null default 0,
  achievement_status    text not null default 'PENDENTE'
    check (achievement_status in ('PENDENTE','ATINGIDA','NAO_ATINGIDA','NAO_APLICAVEL')),
  achievement_date      date,
  payment_status        text not null default 'PENDENTE'
    check (payment_status in ('PENDENTE','PAGA','PARCIALMENTE_PAGA','EM_ATRASO','CANCELADA')),
  payment_date          date,
  amount_paid_currency  numeric(18,2),
  amount_paid_brl       numeric(18,2),
  exchange_rate         numeric(18,6),
  notes                 text,
  created_by            text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Parcelas das cláusulas do app. Espelha `clause_installments`.
create table if not exists public.ac_parcelas_fin (
  id                 uuid primary key default gen_random_uuid(),
  clausula_fin_id    uuid not null references public.ac_clausulas_fin(id) on delete cascade,
  atleta_id          uuid not null references public.ac_atletas(id) on delete cascade,
  installment_number int not null,
  due_date           date not null,
  original_value     numeric(18,2) not null default 0,
  currency           text not null default 'BRL',
  payment_status     text not null default 'PENDENTE'
    check (payment_status in ('PENDENTE','PAGA','EM_ATRASO','CANCELADA')),
  payment_date       date,
  amount_paid_brl    numeric(18,2),
  exchange_rate      numeric(18,6),
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Passivos com clube (ligados ao atleta). Espelha `club_liabilities`.
create table if not exists public.ac_passivos_clube (
  id                    uuid primary key default gen_random_uuid(),
  atleta_id             uuid not null references public.ac_atletas(id) on delete cascade,
  source_key            text,
  club_name             text not null,
  description           text,
  direction             text not null default 'A_PAGAR' check (direction in ('A_PAGAR','A_RECEBER')),
  amount                numeric(18,2) not null default 0,
  currency              text not null default 'BRL',
  due_date              date,
  conditional           boolean not null default false,
  condition_description text,
  solidarity            boolean not null default false,
  status                text not null default 'PENDENTE' check (status in ('PENDENTE','PAGA','EM_ATRASO','CANCELADA')),
  settled_date          date,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Passivos com agente/intermediário. Espelha `intermediary_liabilities`.
create table if not exists public.ac_passivos_agente (
  id                    uuid primary key default gen_random_uuid(),
  atleta_id             uuid not null references public.ac_atletas(id) on delete cascade,
  contrato_id           uuid references public.ac_contratos(id) on delete set null,
  source_key            text,
  intermediary_name     text not null,
  description           text,
  direction             text not null default 'A_PAGAR' check (direction in ('A_PAGAR','A_RECEBER')),
  amount                numeric(18,2) not null default 0,
  currency              text not null default 'BRL',
  due_date              date,
  conditional           boolean not null default false,
  condition_description text,
  penalty_terms         text,
  status                text not null default 'PENDENTE' check (status in ('PENDENTE','PAGA','EM_ATRASO','CANCELADA')),
  settled_date          date,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Direito de imagem mês a mês. Espelha `image_rights` (pj → ac_entidades_pj_imagem).
create table if not exists public.ac_direitos_imagem (
  id           uuid primary key default gen_random_uuid(),
  atleta_id    uuid not null references public.ac_atletas(id) on delete cascade,
  pj_id        uuid references public.ac_entidades(id) on delete set null,
  source_key   text,
  month        text not null,           -- 'YYYY-MM'
  amount       numeric(18,2) not null default 0,
  currency     text not null default 'BRL',
  status       text not null default 'PENDENTE' check (status in ('PENDENTE','PAGA','EM_ATRASO','CANCELADA')),
  paid_date    date,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Gatilhos de mudança salarial por meta. Espelha `salary_triggers`.
create table if not exists public.ac_gatilhos_salario (
  id            uuid primary key default gen_random_uuid(),
  atleta_id     uuid not null references public.ac_atletas(id) on delete cascade,
  contrato_id   uuid references public.ac_contratos(id) on delete cascade,
  description   text not null,
  metric        text not null default 'JOGOS' check (metric in ('JOGOS','GOLS','ASSISTENCIAS','MINUTOS','TITULO','OUTRO')),
  threshold     numeric(18,4),
  new_salary    numeric(18,2) not null,
  currency      text not null default 'BRL',
  status        text not null default 'PENDENTE' check (status in ('PENDENTE','ATINGIDA','NAO_ATINGIDA')),
  achieved_date date,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Alertas. Espelha `alerts`.
create table if not exists public.ac_alertas (
  id             uuid primary key default gen_random_uuid(),
  atleta_id      uuid not null references public.ac_atletas(id) on delete cascade,
  clausula_fin_id uuid references public.ac_clausulas_fin(id) on delete cascade,
  parcela_fin_id  uuid references public.ac_parcelas_fin(id) on delete cascade,
  alert_type     text not null,
  severity       text not null check (severity in ('RED','YELLOW','GREEN')),
  message        text not null,
  is_read        boolean not null default false,
  created_at     timestamptz not null default now()
);

-- ── Índices ──────────────────────────────────────────────────────────────────
create index if not exists idx_ac_titul_atleta      on public.ac_titularidade_economica(atleta_id);
create index if not exists idx_ac_clfin_atleta       on public.ac_clausulas_fin(atleta_id);
create index if not exists idx_ac_clfin_contrato     on public.ac_clausulas_fin(contrato_id);
create index if not exists idx_ac_clfin_venc         on public.ac_clausulas_fin(due_date);
create index if not exists idx_ac_pfin_clausula      on public.ac_parcelas_fin(clausula_fin_id);
create index if not exists idx_ac_pfin_atleta        on public.ac_parcelas_fin(atleta_id);
create index if not exists idx_ac_pfin_venc          on public.ac_parcelas_fin(due_date);
create index if not exists idx_ac_pasclube_atleta    on public.ac_passivos_clube(atleta_id);
create index if not exists idx_ac_pasagente_atleta   on public.ac_passivos_agente(atleta_id);
create index if not exists idx_ac_imagem_atleta      on public.ac_direitos_imagem(atleta_id);
create index if not exists idx_ac_imagem_pj          on public.ac_direitos_imagem(pj_id);
create index if not exists idx_ac_gatilho_atleta     on public.ac_gatilhos_salario(atleta_id);
create index if not exists idx_ac_alertas_atleta     on public.ac_alertas(atleta_id);

-- ── Trigger updated_at nas novas tabelas (ac_alertas não tem updated_at) ──────
do $$
declare t text;
begin
  foreach t in array array[
    'ac_titularidade_economica','ac_clausulas_fin','ac_parcelas_fin',
    'ac_passivos_clube','ac_passivos_agente','ac_direitos_imagem','ac_gatilhos_salario'
  ] loop
    execute format('drop trigger if exists trg_%1$s_updated on public.%1$s;', t);
    execute format('create trigger trg_%1$s_updated before update on public.%1$s
                      for each row execute function public.ac_set_updated_at();', t);
  end loop;
end $$;

-- ── Sincroniza status da cláusula quando as parcelas mudam (paridade c/ legado) ─
create or replace function public.ac_sync_clausula_fin_status()
returns trigger language plpgsql as $$
declare
  v_ref uuid := coalesce(new.clausula_fin_id, old.clausula_fin_id);
  v_total int; v_paga int; v_atraso int; v_new text;
begin
  select count(*), count(*) filter (where payment_status='PAGA'),
         count(*) filter (where payment_status='EM_ATRASO')
    into v_total, v_paga, v_atraso
    from public.ac_parcelas_fin where clausula_fin_id = v_ref;
  if v_total = 0 then v_new := 'PENDENTE';
  elsif v_paga = v_total then v_new := 'PAGA';
  elsif v_paga > 0 then v_new := 'PARCIALMENTE_PAGA';
  elsif v_atraso > 0 then v_new := 'EM_ATRASO';
  else v_new := 'PENDENTE';
  end if;
  update public.ac_clausulas_fin
     set payment_status = v_new, installments_paid = v_paga, updated_at = now()
   where id = v_ref;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_ac_sync_clfin on public.ac_parcelas_fin;
create trigger trg_ac_sync_clfin
  after insert or update or delete on public.ac_parcelas_fin
  for each row execute function public.ac_sync_clausula_fin_status();

-- ── RLS (padrão do projeto) ────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'ac_titularidade_economica','ac_clausulas_fin','ac_parcelas_fin',
    'ac_passivos_clube','ac_passivos_agente','ac_direitos_imagem',
    'ac_gatilhos_salario','ac_alertas'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "ac read %1$s" on public.%1$s;', t);
    execute format('drop policy if exists "ac write %1$s" on public.%1$s;', t);
    execute format('create policy "ac read %1$s" on public.%1$s for select to authenticated using (true);', t);
    execute format('create policy "ac write %1$s" on public.%1$s for all to authenticated
                      using (public.get_my_role() in (''master'',''juridico''))
                      with check (public.get_my_role() in (''master'',''juridico''));', t);
  end loop;
end $$;

-- FIM 014

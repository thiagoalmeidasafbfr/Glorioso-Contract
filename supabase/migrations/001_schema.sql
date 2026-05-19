-- ── Glorioso Finance — Schema ─────────────────────────────────────────
-- Run this migration in the Supabase SQL Editor (once, in order).

-- ── 1. Profiles (user management, linked to auth.users) ──────────────
create table if not exists public.profiles (
  id         uuid references auth.users on delete cascade primary key,
  email      text        not null,
  nome       text,
  role       text        not null default 'juridico'
               check (role in ('master', 'juridico')),
  ativo      boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, nome, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'juridico')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── 2. Atletas ────────────────────────────────────────────────────────
create table if not exists public.atletas (
  id                    serial primary key,
  nome                  text not null,
  nome_completo         text,
  posicao               text,
  data_nascimento       date,
  pais_nascimento       text,
  foto_arquivo          text,
  status_contrato       text not null default 'Elenco'
                          check (status_contrato in ('Elenco', 'Emprestado', 'Rescindido')),
  alocacao              text not null default 'Profissional'
                          check (alocacao in ('Profissional', 'Base')),
  clube_anterior        text,
  perc_saf              numeric      not null default 100,
  inicio_contrato       date,
  fim_contrato          date,
  salario_clt           numeric      not null default 0,
  direito_imagem        numeric      not null default 0,
  auxilio_moradia_m     numeric      not null default 0,
  auxilio_alimentacao_m numeric      not null default 0,
  auxilio_viagem_a      numeric      not null default 0,
  outros_auxilios_m     numeric      not null default 0,
  transfer_fee_total    numeric      not null default 0,
  transfer_fee_quitado  numeric      not null default 0,
  transfer_fee_pendente numeric      not null default 0,
  transfer_fee_acordo   numeric      not null default 0,
  transfer_fee_moeda    text         not null default 'BRL',
  valor_mercado         numeric      not null default 0,
  valor_mercado_moeda   text         not null default 'EUR',
  multa_internacional   text,
  multa_nacional        text,
  multa_compensatoria   text,
  created_at            timestamptz  not null default now(),
  updated_at            timestamptz  not null default now()
);

-- ── 3. Atleta Intermediários (N:N via junction) ───────────────────────
create table if not exists public.atleta_intermediarios (
  id               serial  primary key,
  atleta_id        integer not null references public.atletas(id) on delete cascade,
  nome             text    not null,
  perc_venda_futura numeric not null default 0
);

-- ── 4. Bichos por Competição ──────────────────────────────────────────
create table if not exists public.atleta_bichos (
  id        serial  primary key,
  atleta_id integer not null references public.atletas(id) on delete cascade,
  competicao text   not null,
  ano       integer not null,
  valor     numeric not null default 0,
  unique (atleta_id, competicao, ano)
);

-- ── 5. Pagamentos Certos ──────────────────────────────────────────────
create table if not exists public.pagamentos_certos (
  id             serial  primary key,
  atleta_id      integer not null references public.atletas(id) on delete cascade,
  despesa        text,
  contrato       text,
  parcela        text,
  vencimento     date,
  valor          numeric not null default 0,
  moeda          text    not null default 'BRL',
  venc_antecipado boolean not null default false,
  parcial        numeric,
  moeda_parcial  text,
  status         text    not null default 'A pagar',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ── 6. Pagamentos Condicionais ────────────────────────────────────────
create table if not exists public.pagamentos_condicionais (
  id                serial  primary key,
  atleta_id         integer not null references public.atletas(id) on delete cascade,
  despesa           text,
  contrato          text,
  detalhes_condicao text,
  valor             text,   -- may be numeric string or descriptive text
  moeda             text    not null default 'BRL',
  venc_antecipado   boolean not null default false,
  vencimento        text,
  parcial           numeric,
  moeda_parcial     text,
  status            text    not null default 'Aguardando condição',
  created_at        timestamptz not null default now()
);

-- ── 7. Acordos ────────────────────────────────────────────────────────
create table if not exists public.acordos (
  id              serial  primary key,
  atleta_id       integer not null references public.atletas(id) on delete cascade,
  natureza        text,
  natureza_divida text,
  parcela         text,
  condicao        text,
  credor          text,
  venc_antecipado text,
  valor           numeric not null default 0,
  moeda_contrato  text    not null default 'BRL',
  vencimento      date,
  data_liquidacao date,
  status          text    not null default 'A pagar',
  created_at      timestamptz not null default now()
);

-- ── 8. Condicionais de Salário ────────────────────────────────────────
create table if not exists public.condicionais_salario (
  id        serial  primary key,
  atleta_id integer not null references public.atletas(id) on delete cascade,
  condicao  text,
  despesa   text,
  detalhes  text,
  valor     text,   -- may be numeric or descriptive
  moeda     text    not null default 'BRL',
  status    text    not null default 'Aguardando condição'
);

-- ── 9. Passivos Clube ─────────────────────────────────────────────────
create table if not exists public.passivos_clube (
  id                   serial  primary key,
  atleta_id            integer not null references public.atletas(id) on delete cascade,
  contrato             text,
  despesa              text,
  credor               text,
  condicional          boolean not null default false,
  parcela              text,
  vencimento           date,
  valor                numeric not null default 0,
  moeda                text    not null default 'BRL',
  parcial              numeric,
  moeda_parcial        text,
  saldo_moeda_contrato numeric not null default 0,
  saldo_brl            numeric not null default 0,
  condicao             text,
  venc_antecipado      boolean not null default false,
  solidariedade        boolean not null default false,
  data_liquidacao      date,
  status               text    not null default 'A pagar',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ── 10. Passivos Intermediário ────────────────────────────────────────
create table if not exists public.passivos_intermediario (
  id              serial  primary key,
  atleta_id       integer not null references public.atletas(id) on delete cascade,
  contrato        text,
  despesa         text,
  intermediario   text,
  condicional     boolean not null default false,
  parcela         text,
  vencimento      date,
  valor           numeric not null default 0,
  moeda           text    not null default 'BRL',
  parcial         numeric,
  moeda_parcial   text,
  saldo_brl       numeric not null default 0,
  condicao        text,
  teor_multa      text,
  venc_antecipado boolean not null default false,
  data_liquidacao date,
  status          text    not null default 'A pagar',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── 11. Parcelas Direito de Imagem ────────────────────────────────────
create table if not exists public.parcelas_direito_imagem (
  id         serial  primary key,
  atleta_id  integer not null references public.atletas(id) on delete cascade,
  mes        text    not null,   -- "YYYY-MM"
  valor      numeric not null default 0,
  status     text    not null default 'A pagar',
  updated_at timestamptz not null default now(),
  unique (atleta_id, mes)
);

-- ── Indexes ───────────────────────────────────────────────────────────
create index if not exists idx_pagamentos_certos_atleta      on public.pagamentos_certos(atleta_id);
create index if not exists idx_pagamentos_cond_atleta        on public.pagamentos_condicionais(atleta_id);
create index if not exists idx_passivos_clube_atleta         on public.passivos_clube(atleta_id);
create index if not exists idx_passivos_intermediario_atleta on public.passivos_intermediario(atleta_id);
create index if not exists idx_parcelas_imagem_atleta        on public.parcelas_direito_imagem(atleta_id);
create index if not exists idx_atleta_bichos_atleta          on public.atleta_bichos(atleta_id);

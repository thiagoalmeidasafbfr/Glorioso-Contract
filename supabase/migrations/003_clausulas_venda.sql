-- ── Cláusulas de Contratos de Venda de Atletas ────────────────────────
-- Armazena contratos de transferência e suas cláusulas (fixas, variáveis,
-- sell-on, opções, proteções, solidarity, aceleração, etc.).
-- Rodar APÓS 001_schema.sql e 002_rls.sql.

-- ── 1. Contratos de Venda ──────────────────────────────────────────────
create table if not exists public.contratos_venda (
  id                   serial      primary key,
  atleta_id            integer     references public.atletas(id) on delete set null,
  nome_atleta          text        not null,
  nome_contrato        text        not null,
  clube_destino        text,
  data_contrato        date,
  tipo_transferencia   text        not null default 'Permanent Transfer',
  moeda_principal      text        not null default 'EUR',
  total_fixo_garantido numeric     not null default 0,
  observacoes          text,
  ativo                boolean     not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ── 2. Cláusulas de Venda ──────────────────────────────────────────────
-- Cada linha = uma cláusula/componente do contrato.
-- tipo_clausula cobre todos os padrões encontrados nos contratos:
--   Fixed      → parcelas fixas garantidas
--   Variable   → bônus por performance (gols, minutos, títulos, etc.)
--   Contingent → condicional com gatilho externo (ex: vence campeonato)
--   Sell-On    → direito sobre venda futura (% do net fee)
--   Garantia   → piso / floor garantido (ex: piso do sell-on)
--   Opção      → put/call option exercível por uma das partes
--   Proteção   → reembolso salarial, recompra por suspensão, etc.
--   Solidarity → solidarity mechanism (FIFA RSTP art. 21)
--   Aceleração → antecipação de parcelas por evento (ex: revenda)
--   Outro      → qualquer cláusula que não se encaixe nas anteriores

create table if not exists public.clausulas_venda (
  id                        serial      primary key,
  contrato_id               integer     not null references public.contratos_venda(id) on delete cascade,
  atleta_id                 integer     references public.atletas(id) on delete set null,
  numero_clausula           text,
  descricao                 text        not null,
  tipo_clausula             text        not null default 'Fixed'
    check (tipo_clausula in (
      'Fixed','Variable','Contingent','Sell-On',
      'Garantia','Opção','Proteção','Solidarity','Aceleração','Outro'
    )),
  subtipo                   text,
  gatilho_condicao          text,
  valor_por_evento          numeric,
  valor_texto               text,
  moeda                     text        not null default 'EUR',
  teto                      numeric,
  teto_texto                text,
  teto_global_compartilhado boolean     not null default false,
  recorrente                boolean     not null default false,
  observacoes               text,
  status                    text        not null default 'Ativa'
    check (status in (
      'Ativa','Garantida','Atingida','Parcialmente Atingida','Expirada','Suspensa'
    )),
  valor_realizado           numeric     not null default 0,
  data_realizacao           date,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- ── Índices ────────────────────────────────────────────────────────────
create index if not exists idx_contratos_venda_atleta   on public.contratos_venda(atleta_id);
create index if not exists idx_clausulas_venda_contrato on public.clausulas_venda(contrato_id);
create index if not exists idx_clausulas_venda_atleta   on public.clausulas_venda(atleta_id);
create index if not exists idx_clausulas_venda_tipo     on public.clausulas_venda(tipo_clausula);
create index if not exists idx_clausulas_venda_status   on public.clausulas_venda(status);

-- ── Row Level Security ─────────────────────────────────────────────────
alter table public.contratos_venda enable row level security;
create policy "Auth read contratos_venda"
  on public.contratos_venda for select to authenticated using (true);
create policy "Juridico write contratos_venda"
  on public.contratos_venda for all
  using (public.get_my_role() in ('master', 'juridico'));

alter table public.clausulas_venda enable row level security;
create policy "Auth read clausulas_venda"
  on public.clausulas_venda for select to authenticated using (true);
create policy "Juridico write clausulas_venda"
  on public.clausulas_venda for all
  using (public.get_my_role() in ('master', 'juridico'));

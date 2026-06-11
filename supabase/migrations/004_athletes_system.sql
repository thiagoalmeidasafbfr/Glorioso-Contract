-- ── Sistema de Gestão Contratual — Atleta como Entidade Central ────────
-- Executar APÓS 001_schema.sql e 002_rls.sql
-- Este schema substitui/complementa o modelo legado tornando o atleta
-- a âncora de todos os vínculos, cláusulas, parcelas e alertas.

-- ── 1. athletes ──────────────────────────────────────────────────────────
create table if not exists public.athletes (
  id                uuid        primary key default gen_random_uuid(),
  full_name         text        not null,
  short_name        text        not null,
  birth_date        date,
  nationality       text,
  cpf               text        unique,
  passport_number   text,
  agent_name        text,
  agent_contact     text,
  current_status    text        not null default 'ATIVO'
    check (current_status in ('ATIVO', 'EMPRESTADO', 'VENDIDO', 'DESLIGADO')),
  profile_photo_url text,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── 2. contracts (vínculos) ──────────────────────────────────────────────
-- Cada entrada ou saída do atleta: compra, venda, empréstimo.
create table if not exists public.contracts (
  id                  uuid        primary key default gen_random_uuid(),
  athlete_id          uuid        not null references public.athletes(id) on delete cascade,
  type                text        not null
    check (type in ('ENTRADA','SAIDA','EMPRESTIMO_SAIDA','EMPRESTIMO_ENTRADA')),
  counterpart_club    text        not null,
  counterpart_country text,
  start_date          date        not null,
  end_date            date,
  status              text        not null default 'ATIVO'
    check (status in ('ATIVO','ENCERRADO','RESCINDIDO')),
  transfer_fee_gross  numeric,
  transfer_currency   text        not null default 'EUR',
  description         text,
  created_by          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ── 3. clauses (obrigações / direitos) ──────────────────────────────────
-- Cada cláusula origina uma obrigação (a pagar) ou um direito (a receber).
-- clause_type cobre os 14 padrões do futebol brasileiro/internacional.
create table if not exists public.clauses (
  id                    uuid        primary key default gen_random_uuid(),
  contract_id           uuid        not null references public.contracts(id) on delete cascade,
  athlete_id            uuid        not null references public.athletes(id),
  clause_type           text        not null
    check (clause_type in (
      'TRANSFER_FEE_FIXO',
      'TRANSFER_FEE_VARIAVEL',
      'SELL_ON_FEE',
      'SELL_ON_FEE_RECEBER',
      'INTERMEDIACAO',
      'INTERMEDIACAO_VENDA_FUTURA',
      'SALARIO_CETD',
      'DIREITO_IMAGEM',
      'LUVAS',
      'BONUS_PERFORMANCE_ATLETA',
      'SOLIDARIEDADE_FIFA',
      'EMPRESTIMO_TAXA',
      'CLAUSULA_RESCISORIA',
      'PERCENTUAL_VENDA_ATLETA'
    )),
  description           text        not null,
  creditor_party        text        not null,
  debtor_party          text        not null,
  currency              text        not null default 'BRL',
  original_value        numeric,
  percentage_value      numeric,
  condition_description text,
  due_date              date,
  installments_total    int         not null default 1,
  installments_paid     int         not null default 0,
  achievement_status    text        not null default 'PENDENTE'
    check (achievement_status in ('PENDENTE','ATINGIDA','NAO_ATINGIDA','NAO_APLICAVEL')),
  achievement_date      date,
  payment_status        text        not null default 'PENDENTE'
    check (payment_status in ('PENDENTE','PAGA','PARCIALMENTE_PAGA','EM_ATRASO','CANCELADA')),
  payment_date          date,
  amount_paid_currency  numeric,
  amount_paid_brl       numeric,
  exchange_rate         numeric,
  notes                 text,
  created_by            text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ── 4. clause_installments ───────────────────────────────────────────────
-- Parcelas individuais de uma cláusula parcelada.
-- Geradas automaticamente ao cadastrar cláusula com installments_total > 1.
create table if not exists public.clause_installments (
  id                 uuid        primary key default gen_random_uuid(),
  clause_id          uuid        not null references public.clauses(id) on delete cascade,
  athlete_id         uuid        not null references public.athletes(id),
  installment_number int         not null,
  due_date           date        not null,
  original_value     numeric     not null,
  currency           text        not null default 'BRL',
  payment_status     text        not null default 'PENDENTE'
    check (payment_status in ('PENDENTE','PAGA','EM_ATRASO','CANCELADA')),
  payment_date       date,
  amount_paid_brl    numeric,
  exchange_rate      numeric,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ── 5. alerts ────────────────────────────────────────────────────────────
-- Gerados automaticamente pelo sistema com base em datas e estados.
create table if not exists public.alerts (
  id             uuid        primary key default gen_random_uuid(),
  athlete_id     uuid        not null references public.athletes(id),
  clause_id      uuid        references public.clauses(id),
  installment_id uuid        references public.clause_installments(id),
  alert_type     text        not null
    check (alert_type in (
      'VENCIMENTO_PROXIMO',
      'EM_ATRASO',
      'SELL_ON_PENDENTE_REVISAO',
      'ATINGIMENTO_PENDENTE'
    )),
  severity       text        not null
    check (severity in ('RED','YELLOW','GREEN')),
  message        text        not null,
  is_read        boolean     not null default false,
  created_at     timestamptz not null default now()
);

-- ── Índices ───────────────────────────────────────────────────────────────
create index if not exists idx_contracts_athlete        on public.contracts(athlete_id);
create index if not exists idx_contracts_status         on public.contracts(status);
create index if not exists idx_clauses_contract         on public.clauses(contract_id);
create index if not exists idx_clauses_athlete          on public.clauses(athlete_id);
create index if not exists idx_clauses_payment_status   on public.clauses(payment_status);
create index if not exists idx_clauses_due_date         on public.clauses(due_date);
create index if not exists idx_installments_clause      on public.clause_installments(clause_id);
create index if not exists idx_installments_athlete     on public.clause_installments(athlete_id);
create index if not exists idx_installments_due_date    on public.clause_installments(due_date);
create index if not exists idx_installments_status      on public.clause_installments(payment_status);
create index if not exists idx_alerts_athlete           on public.alerts(athlete_id);
create index if not exists idx_alerts_severity          on public.alerts(severity);
create index if not exists idx_alerts_is_read           on public.alerts(is_read);

-- ── Trigger: atualizar cláusula quando parcelas mudam ────────────────────
create or replace function public.sync_clause_payment_status()
returns trigger language plpgsql as $$
declare
  v_total    int;
  v_paga     int;
  v_atraso   int;
  v_new_status text;
begin
  select
    count(*)                                                    into v_total
    from public.clause_installments where clause_id = coalesce(new.clause_id, old.clause_id);
  select
    count(*) filter (where payment_status = 'PAGA')            into v_paga
    from public.clause_installments where clause_id = coalesce(new.clause_id, old.clause_id);
  select
    count(*) filter (where payment_status = 'EM_ATRASO')       into v_atraso
    from public.clause_installments where clause_id = coalesce(new.clause_id, old.clause_id);

  if v_paga = v_total then
    v_new_status := 'PAGA';
  elsif v_paga > 0 then
    v_new_status := 'PARCIALMENTE_PAGA';
  elsif v_atraso > 0 then
    v_new_status := 'EM_ATRASO';
  else
    v_new_status := 'PENDENTE';
  end if;

  update public.clauses
  set payment_status     = v_new_status,
      installments_paid  = v_paga,
      updated_at         = now()
  where id = coalesce(new.clause_id, old.clause_id);
  return new;
end;
$$;

drop trigger if exists trg_sync_clause_status on public.clause_installments;
create trigger trg_sync_clause_status
  after insert or update on public.clause_installments
  for each row execute procedure public.sync_clause_payment_status();

-- ── Row Level Security ────────────────────────────────────────────────────
alter table public.athletes           enable row level security;
alter table public.contracts          enable row level security;
alter table public.clauses            enable row level security;
alter table public.clause_installments enable row level security;
alter table public.alerts             enable row level security;

create policy "Auth read athletes"        on public.athletes           for select to authenticated using (true);
create policy "Juridico write athletes"   on public.athletes           for all using (public.get_my_role() in ('master','juridico'));

create policy "Auth read contracts"       on public.contracts          for select to authenticated using (true);
create policy "Juridico write contracts"  on public.contracts          for all using (public.get_my_role() in ('master','juridico'));

create policy "Auth read clauses"         on public.clauses            for select to authenticated using (true);
create policy "Juridico write clauses"    on public.clauses            for all using (public.get_my_role() in ('master','juridico'));

create policy "Auth read installments"    on public.clause_installments for select to authenticated using (true);
create policy "Juridico write installments" on public.clause_installments for all using (public.get_my_role() in ('master','juridico'));

create policy "Auth read alerts"          on public.alerts             for select to authenticated using (true);
create policy "Juridico write alerts"     on public.alerts             for all using (public.get_my_role() in ('master','juridico'));

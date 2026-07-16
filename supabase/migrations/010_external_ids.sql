-- ── Arquitetura de identificação: chaves naturais + idempotência de import ──
-- Executar APÓS 009.
-- external_ref: chave natural externa (CPF/passaporte do atleta; CNPJ/estrangeiro
-- de clubes e agentes) — permite upsert por referência ao importar/exportar.
-- source_key: hash determinístico da linha de origem (planilha) para tornar a
-- importação de obrigações IDEMPOTENTE (reimportar não duplica).

alter table public.athletes        add column if not exists external_ref text;
alter table public.clubs           add column if not exists external_ref text;
alter table public.intermediaries  add column if not exists external_ref text;

create unique index if not exists uq_athletes_external_ref       on public.athletes(external_ref)       where external_ref is not null;
create unique index if not exists uq_clubs_external_ref          on public.clubs(external_ref)          where external_ref is not null;
create unique index if not exists uq_intermediaries_external_ref on public.intermediaries(external_ref) where external_ref is not null;

alter table public.club_liabilities          add column if not exists source_key text;
alter table public.intermediary_liabilities  add column if not exists source_key text;
alter table public.image_rights              add column if not exists source_key text;
alter table public.clauses                   add column if not exists source_key text;

create unique index if not exists uq_club_liab_source_key   on public.club_liabilities(source_key)          where source_key is not null;
create unique index if not exists uq_inter_liab_source_key  on public.intermediary_liabilities(source_key)  where source_key is not null;
create unique index if not exists uq_image_rights_source_key on public.image_rights(source_key)             where source_key is not null;
create unique index if not exists uq_clauses_source_key     on public.clauses(source_key)                   where source_key is not null;

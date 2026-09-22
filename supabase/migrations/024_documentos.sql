-- ════════════════════════════════════════════════════════════════════════════
-- 024 — Documentos (PDF de contratos/aditivos) no Supabase Storage
-- ════════════════════════════════════════════════════════════════════════════
-- Reaproveita public.ac_documentos (012, FK atleta_id → ac_atletas) e a cria se
-- não existir. Colunas garantidas:
--   id uuid pk, atleta_id uuid not null (→ ac_atletas, cascade),
--   contrato_id uuid null (→ ac_contratos, ON DELETE CASCADE — antes SET NULL),
--   tipo text check in ('CONTRATO','ADITIVO','OUTRO'),
--   storage_path text   caminho do objeto no bucket 'documentos'
--   nome_arquivo text, mime text, tamanho_bytes bigint,
--   descricao text, url text (agora opcional — use storage_path),
--   enviado_por uuid default auth.uid(), created_at, updated_at.
--
-- Bucket de Storage 'documentos' (PRIVADO). Convenção de caminho:
--   <atleta_id>/<contrato_id | 'geral'>/<uuid>-<nome_arquivo>
-- Leitura via supabase.storage.from('documentos').createSignedUrl(path, segundos).
--
-- RLS
--   ac_documentos ...... leitura: perfis ativos; escrita: master, juridico
--   storage.objects (bucket 'documentos'):
--                        leitura: perfis ativos; insert/update/delete: master, juridico
--
-- Executar APÓS 023. Idempotente; ignora a parte de Storage se o schema
-- `storage` não existir (Postgres puro).
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.ac_documentos (
  id           uuid primary key default gen_random_uuid(),
  atleta_id    uuid not null references public.ac_atletas(id) on delete cascade,
  contrato_id  uuid,
  tipo         text,
  url          text,
  descricao    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.ac_documentos
  add column if not exists contrato_id   uuid,
  add column if not exists storage_path  text,
  add column if not exists nome_arquivo  text,
  add column if not exists mime          text,
  add column if not exists tamanho_bytes bigint,
  add column if not exists enviado_por   uuid default auth.uid();

-- url deixa de ser obrigatória (o arquivo vive no Storage).
alter table public.ac_documentos alter column url drop not null;

-- contrato_id → ac_contratos ON DELETE CASCADE (substitui o SET NULL do 012).
do $$
declare c record;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any(con.conkey)
     where con.conrelid = 'public.ac_documentos'::regclass
       and con.contype = 'f' and att.attname = 'contrato_id'
       and con.conname <> 'ac_documentos_contrato_fk'
  loop
    execute format('alter table public.ac_documentos drop constraint %I', c.conname);
  end loop;
  if to_regclass('public.ac_contratos') is not null then
    begin
      alter table public.ac_documentos add constraint ac_documentos_contrato_fk
        foreign key (contrato_id) references public.ac_contratos(id) on delete cascade;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

do $$ begin
  alter table public.ac_documentos add constraint ac_documentos_tipo_check
    check (tipo is null or tipo in ('CONTRATO','ADITIVO','OUTRO')) not valid;
exception when duplicate_object then null; end $$;

create index if not exists idx_ac_documentos_atleta   on public.ac_documentos(atleta_id);
create index if not exists idx_ac_documentos_contrato on public.ac_documentos(contrato_id);

drop trigger if exists trg_ac_documentos_updated on public.ac_documentos;
create trigger trg_ac_documentos_updated before update on public.ac_documentos
  for each row execute function public.ac_set_updated_at();

-- RLS da tabela
alter table public.ac_documentos enable row level security;
drop policy if exists "ac read ac_documentos"     on public.ac_documentos;
drop policy if exists "ac write ac_documentos"    on public.ac_documentos;
drop policy if exists "ac leitura ac_documentos"  on public.ac_documentos;
drop policy if exists "ac escrita ac_documentos"  on public.ac_documentos;
create policy "ac leitura ac_documentos" on public.ac_documentos
  for select to authenticated using (public.get_my_role() is not null);
create policy "ac escrita ac_documentos" on public.ac_documentos
  for all to authenticated
  using (public.has_role('master','juridico'))
  with check (public.has_role('master','juridico'));

-- Auditoria (021)
do $$ begin
  if to_regprocedure('public.ac_audit_attach(text)') is not null then
    perform public.ac_audit_attach('ac_documentos');
  end if;
end $$;

-- ── Storage ─────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice '024: schema storage ausente — bucket/policies não criados';
    return;
  end if;

  insert into storage.buckets (id, name, public)
  values ('documentos', 'documentos', false)
  on conflict (id) do nothing;

  execute 'drop policy if exists "documentos leitura" on storage.objects';
  execute 'drop policy if exists "documentos insert"  on storage.objects';
  execute 'drop policy if exists "documentos update"  on storage.objects';
  execute 'drop policy if exists "documentos delete"  on storage.objects';

  execute $p$
    create policy "documentos leitura" on storage.objects for select to authenticated
      using (bucket_id = 'documentos' and public.get_my_role() is not null)
  $p$;
  execute $p$
    create policy "documentos insert" on storage.objects for insert to authenticated
      with check (bucket_id = 'documentos' and public.has_role('master','juridico'))
  $p$;
  execute $p$
    create policy "documentos update" on storage.objects for update to authenticated
      using (bucket_id = 'documentos' and public.has_role('master','juridico'))
      with check (bucket_id = 'documentos' and public.has_role('master','juridico'))
  $p$;
  execute $p$
    create policy "documentos delete" on storage.objects for delete to authenticated
      using (bucket_id = 'documentos' and public.has_role('master','juridico'))
  $p$;
end $$;

-- FIM 024

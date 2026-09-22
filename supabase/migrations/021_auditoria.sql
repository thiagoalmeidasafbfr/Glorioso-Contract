-- ════════════════════════════════════════════════════════════════════════════
-- 021 — Trilha de auditoria + autoria (created_by / updated_by)
-- ════════════════════════════════════════════════════════════════════════════
-- 1. Tabela public.ac_auditoria: uma linha por INSERT/UPDATE/DELETE nas tabelas
--    auditadas, com o "antes" e o "depois" em JSONB, a lista de campos
--    alterados, o usuário (auth.uid()) e o e-mail dele.
--      • UPDATEs em que só mudaram updated_at/updated_by NÃO são registrados.
--      • Ninguém grava diretamente: somente o trigger (SECURITY DEFINER).
--      • Leitura: master, controladoria, diretoria.
-- 2. Função genérica public.ac_audit_trigger() + helper
--    public.ac_audit_attach(tabela) para as migrations seguintes anexarem o
--    trigger às tabelas novas.
-- 3. Colunas de autoria nas tabelas-ponte:
--      created_by uuid default auth.uid()   (quem criou)
--      updated_by uuid                      (quem alterou por último; trigger)
--    EXCEÇÃO: ac_contratos e ac_clausulas_fin JÁ têm `created_by text` (o app
--    grava texto livre ali). Nelas a autoria real fica em `created_by_uid uuid`.
-- 4. View public.vw_ac_auditoria_resumo (auditoria + nome/e-mail do perfil) —
--    filtra internamente para os mesmos papéis de leitura.
--
-- Tabelas auditadas: ac_atletas, ac_entidades, ac_entidades_pj_imagem,
--   ac_contratos, ac_clausulas_fin, ac_parcelas_fin, ac_titularidade_economica,
--   ac_passivos_clube, ac_passivos_agente, ac_direitos_imagem,
--   ac_gatilhos_salario, ac_premissas_atleta
--   (+ ac_documentos, ac_movimentacoes, ac_desempenho_atleta,
--      ac_amortizacao_fechamentos nas migrations 024/026/028/029).
--   ac_alertas NÃO é auditada (é regenerada diariamente por gerar_alertas()).
--
-- Executar APÓS 020. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.ac_auditoria (
  id               bigserial primary key,
  tabela           text not null,
  registro_id      uuid,
  operacao         text not null check (operacao in ('INSERT','UPDATE','DELETE')),
  dados_antes      jsonb,
  dados_depois     jsonb,
  campos_alterados text[],
  usuario_id       uuid default auth.uid(),
  usuario_email    text,
  ocorrido_em      timestamptz not null default now()
);

create index if not exists idx_ac_auditoria_registro on public.ac_auditoria(tabela, registro_id);
create index if not exists idx_ac_auditoria_ocorrido on public.ac_auditoria(ocorrido_em desc);
create index if not exists idx_ac_auditoria_usuario  on public.ac_auditoria(usuario_id);

comment on table public.ac_auditoria is
  'Trilha de auditoria (antes/depois) das tabelas ac_*. Gravada só por trigger; leitura master/controladoria/diretoria.';

alter table public.ac_auditoria enable row level security;
-- "ac read/ac write" surgem se a 012 for reaplicada (o loop dela pega toda ac_*)
drop policy if exists "ac read ac_auditoria"    on public.ac_auditoria;
drop policy if exists "ac write ac_auditoria"   on public.ac_auditoria;
drop policy if exists "ac leitura ac_auditoria" on public.ac_auditoria;
create policy "ac leitura ac_auditoria" on public.ac_auditoria
  for select to authenticated
  using (public.has_role('master','controladoria','diretoria'));
-- sem policy de escrita: INSERT/UPDATE/DELETE negados a todos os clientes.

-- ── Função de auditoria ─────────────────────────────────────────────────────
create or replace function public.ac_audit_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_campos text[];
  v_id_txt text;
  v_id uuid;
  v_email text;
  v_uid uuid := auth.uid();
begin
  if tg_op in ('UPDATE','DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('INSERT','UPDATE') then v_new := to_jsonb(new); end if;

  if tg_op = 'UPDATE' then
    select array_agg(k order by k) into v_campos
      from (
        select key as k from jsonb_each(v_new)
        union
        select key from jsonb_each(v_old)
      ) keys
     where (v_new -> k) is distinct from (v_old -> k);
    -- nada mudou, ou só carimbos de data/autor
    if v_campos is null
       or v_campos <@ array['updated_at','updated_by']::text[] then
      return null;
    end if;
  end if;

  v_id_txt := coalesce(v_new ->> 'id', v_old ->> 'id');
  if v_id_txt ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_id := v_id_txt::uuid;
  end if;

  if v_uid is not null then
    select email into v_email from public.profiles where id = v_uid;
  end if;
  if v_email is null then
    begin
      v_email := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email';
    exception when others then v_email := null;
    end;
  end if;

  insert into public.ac_auditoria
    (tabela, registro_id, operacao, dados_antes, dados_depois, campos_alterados, usuario_id, usuario_email)
  values
    (tg_table_name, v_id, tg_op, v_old, v_new, v_campos, v_uid, v_email);
  return null;  -- AFTER trigger
end $$;

-- Anexa o trigger de auditoria a uma tabela (idempotente; ignora tabela ausente).
create or replace function public.ac_audit_attach(p_tabela text)
returns void language plpgsql as $$
begin
  if to_regclass('public.' || p_tabela) is null then
    raise notice 'ac_audit_attach: tabela % ausente', p_tabela;
    return;
  end if;
  execute format('drop trigger if exists trg_%1$s_audit on public.%1$I', p_tabela);
  execute format('create trigger trg_%1$s_audit after insert or update or delete on public.%1$I
                    for each row execute function public.ac_audit_trigger()', p_tabela);
end $$;

-- ── Autoria: updated_by via trigger; created_by imutável ─────────────────────
create or replace function public.ac_set_updated_by()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null then new.updated_by := auth.uid(); end if;
  new.created_by := old.created_by;          -- autoria original é imutável
  return new;
end $$;

-- Variante p/ ac_contratos e ac_clausulas_fin (autoria em created_by_uid).
create or replace function public.ac_set_updated_by_uid()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null then new.updated_by := auth.uid(); end if;
  new.created_by_uid := old.created_by_uid;
  return new;
end $$;

do $$
declare
  t text;
  tabelas text[] := array[
    'ac_atletas','ac_entidades','ac_entidades_pj_imagem','ac_contratos',
    'ac_clausulas_fin','ac_parcelas_fin','ac_titularidade_economica',
    'ac_passivos_clube','ac_passivos_agente','ac_direitos_imagem',
    'ac_gatilhos_salario','ac_premissas_atleta'
  ];
  v_tipo text;
  v_fn text;
begin
  foreach t in array tabelas loop
    if to_regclass('public.' || t) is null then
      raise notice '021: tabela % ausente — ignorada', t;
      continue;
    end if;

    -- created_by: se já existe como texto (ac_contratos/ac_clausulas_fin), usa created_by_uid
    select data_type into v_tipo from information_schema.columns
     where table_schema = 'public' and table_name = t and column_name = 'created_by';
    if v_tipo is null or v_tipo = 'uuid' then
      execute format('alter table public.%I add column if not exists created_by uuid default auth.uid()', t);
      v_fn := 'ac_set_updated_by';
    else
      execute format('alter table public.%I add column if not exists created_by_uid uuid default auth.uid()', t);
      v_fn := 'ac_set_updated_by_uid';
    end if;
    execute format('alter table public.%I add column if not exists updated_by uuid', t);

    execute format('drop trigger if exists trg_%1$s_updated_by on public.%1$I', t);
    execute format('create trigger trg_%1$s_updated_by before update on public.%1$I
                      for each row execute function public.%2$I()', t, v_fn);

    perform public.ac_audit_attach(t);
  end loop;
end $$;

-- ── View para exibição ──────────────────────────────────────────────────────
-- Views rodam com o dono (bypass do RLS de base), então o filtro de papel é
-- repetido aqui.
create or replace view public.vw_ac_auditoria_resumo as
select a.id,
       a.tabela,
       a.registro_id,
       a.operacao,
       a.campos_alterados,
       a.dados_antes,
       a.dados_depois,
       a.usuario_id,
       coalesce(p.email, a.usuario_email) as usuario_email,
       p.nome  as usuario_nome,
       p.role  as usuario_papel,
       a.ocorrido_em,
       coalesce(a.dados_depois ->> 'atleta_id', a.dados_antes ->> 'atleta_id',
                case when a.tabela = 'ac_atletas' then a.registro_id::text end) as atleta_id
  from public.ac_auditoria a
  left join public.profiles p on p.id = a.usuario_id
 where public.has_role('master','controladoria','diretoria');

comment on view public.vw_ac_auditoria_resumo is
  'Auditoria com nome/e-mail/papel do autor e atleta_id derivado. Visível só p/ master, controladoria, diretoria.';

-- FIM 021

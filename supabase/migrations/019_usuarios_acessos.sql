-- ════════════════════════════════════════════════════════════════════════════
-- 019 — USUÁRIOS, PERFIS DE ACESSO E RESTRIÇÃO POR MÓDULO
-- ════════════════════════════════════════════════════════════════════════════
-- Executar APÓS 018. Idempotente (pode ser rodada de novo).
--
-- O que muda:
--   1) `access_roles`: perfis de acesso com uma matriz de permissões por
--      MÓDULO da plataforma — cada módulo recebe 'none' (sem acesso),
--      'view' (consulta) ou 'edit' (consulta e edição). Perfis do sistema:
--      master, juridico, financeiro, consulta; o admin pode criar outros.
--   2) `profiles.role` passa a apontar para `access_roles` (antes era um
--      check fixo em 'master'/'juridico'). Usuários existentes continuam com
--      o mesmo papel.
--   3) Funções de permissão: is_active_user(), my_access(módulo),
--      can_view(módulo), can_edit(módulo). get_my_role() passa a devolver
--      NULL para usuário desativado.
--   4) RLS de TODAS as tabelas de dados reescrita com apply_access_policies():
--        • leitura: qualquer usuário ATIVO (relatórios cruzam todos os dados);
--        • escrita: só quem tem 'edit' no módulo dono da tabela.
--      Usuário desativado (ou sem perfil) não lê nem grava nada.
--   5) Proteções: ninguém altera o próprio perfil/status; sempre sobra ao
--      menos um administrador ativo; o perfil master não pode ser reduzido.
--   6) Cadastro pelo app: novos usuários entram INATIVOS (exceto o primeiro
--      usuário do projeto, que vira master) e o papel enviado no sign-up é
--      ignorado — fecha a escalada via `raw_user_meta_data.role`. A criação
--      pelo módulo "Usuários e acessos" passa pela Edge Function admin-users.
--
-- Módulos (mesmas chaves de src/lib/access.ts):
--   dashboards · atletas · cadastros · modelo · relatorios · dados · usuarios

-- ── 1. Perfis de acesso ─────────────────────────────────────────────────────
create or replace function public.access_permissions_valid(p jsonb)
returns boolean language sql immutable as $$
  select jsonb_typeof(p) = 'object'
     and not exists (
       select 1 from jsonb_each(p) e
       where jsonb_typeof(e.value) <> 'string'
          or (e.value #>> '{}') not in ('none', 'view', 'edit')
     )
$$;

create table if not exists public.access_roles (
  key         text        primary key check (key ~ '^[a-z][a-z0-9_]{1,39}$'),
  nome        text        not null,
  descricao   text,
  permissions jsonb       not null default '{}'::jsonb
                check (public.access_permissions_valid(permissions)),
  is_system   boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.access_roles is
  'Perfis de acesso. permissions = { módulo: none|view|edit }. Módulo ausente = none.';

insert into public.access_roles (key, nome, descricao, permissions, is_system) values
  ('master', 'Master', 'Acesso total, inclusive à administração de usuários e perfis.',
   '{"dashboards":"edit","atletas":"edit","cadastros":"edit","modelo":"edit","relatorios":"edit","dados":"edit","usuarios":"edit"}', true),
  ('juridico', 'Jurídico', 'Cadastra e edita atletas, contratos, obrigações e cadastros; consulta o modelo financeiro.',
   '{"dashboards":"view","atletas":"edit","cadastros":"edit","modelo":"view","relatorios":"view","dados":"edit","usuarios":"none"}', true),
  ('financeiro', 'Financeiro', 'Edita as premissas do modelo financeiro; consulta atletas, cadastros e relatórios.',
   '{"dashboards":"view","atletas":"view","cadastros":"view","modelo":"edit","relatorios":"view","dados":"view","usuarios":"none"}', true),
  ('consulta', 'Consulta', 'Somente leitura: vê painéis, atletas, cadastros e relatórios, sem editar.',
   '{"dashboards":"view","atletas":"view","cadastros":"view","modelo":"view","relatorios":"view","dados":"view","usuarios":"none"}', true)
on conflict (key) do nothing;

-- ── 2. profiles.role → access_roles ────────────────────────────────────────
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles drop constraint if exists profiles_role_fkey;
-- Papéis antigos fora do catálogo (não deveriam existir) viram "consulta".
update public.profiles set role = 'consulta'
  where role not in (select key from public.access_roles);
alter table public.profiles
  add constraint profiles_role_fkey foreign key (role)
  references public.access_roles(key) on update cascade on delete restrict;
alter table public.profiles alter column role set default 'consulta';

-- ── 3. Funções de permissão ────────────────────────────────────────────────
-- SECURITY DEFINER: leem profiles/access_roles sem depender das policies
-- dessas tabelas (evita recursão de RLS).

create or replace function public.get_my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and ativo
$$;

create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and ativo)
$$;

-- Nível do usuário logado no módulo: 'none' | 'view' | 'edit'.
create or replace function public.my_access(p_module text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((
    select r.permissions ->> p_module
    from public.profiles p
    join public.access_roles r on r.key = p.role
    where p.id = auth.uid() and p.ativo
  ), 'none')
$$;

create or replace function public.can_view(p_module text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.my_access(p_module) in ('view', 'edit')
$$;

create or replace function public.can_edit(p_module text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.my_access(p_module) = 'edit'
$$;

create or replace function public.can_edit_any(p_modules text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from unnest(p_modules) m where public.my_access(m) = 'edit')
$$;

-- Há ao menos um administrador (edit em "usuarios") ativo?
create or replace function public.has_active_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    join public.access_roles r on r.key = p.role
    where p.ativo and r.permissions ->> 'usuarios' = 'edit'
  )
$$;

-- ── 4. Policies padrão de uma tabela de dados ──────────────────────────────
-- Remove TODAS as policies da tabela e cria:
--   • leitura para usuário ativo;
--   • escrita para quem tem 'edit' em ao menos um dos módulos informados.
-- Tabelas novas devem chamar: select public.apply_access_policies('tabela', array['atletas']);
create or replace function public.apply_access_policies(p_table text, p_modules text[])
returns void language plpgsql as $$
declare pol record;
begin
  execute format('alter table public.%I enable row level security', p_table);
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = p_table loop
    execute format('drop policy %I on public.%I', pol.policyname, p_table);
  end loop;
  execute format(
    'create policy "acesso: leitura" on public.%I for select to authenticated
       using ((select public.is_active_user()))', p_table);
  execute format(
    'create policy "acesso: escrita" on public.%I for all to authenticated
       using ((select public.can_edit_any(%L::text[])))
       with check ((select public.can_edit_any(%L::text[])))', p_table, p_modules, p_modules);
end $$;

-- Aplica a todas as tabelas de dados existentes. Módulo dono:
--   cadastros → clubes/agentes; modelo → premissas;
--   ac_entidades (clubes, agentes e PJs de imagem) → atletas OU cadastros;
--   todo o resto → atletas.
do $$
declare t text; mods text[];
begin
  for t in
    select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname not in ('profiles', 'access_roles')
  loop
    mods := case
      when t in ('clubs', 'intermediaries', 'ac_entidades_clube', 'ac_entidades_agente', 'ac_entidades_fundo')
        then array['cadastros']
      when t in ('ac_entidades', 'ac_entidades_pj_imagem')
        then array['atletas', 'cadastros']
      when t = 'ac_premissas_atleta'
        then array['modelo']
      else array['atletas']
    end;
    perform public.apply_access_policies(t, mods);
  end loop;
end $$;

-- ── 5. RLS de profiles e access_roles ──────────────────────────────────────
alter table public.profiles enable row level security;
drop policy if exists "Own profile is always visible" on public.profiles;
drop policy if exists "Master sees all profiles"      on public.profiles;
drop policy if exists "Master manages profiles"       on public.profiles;
drop policy if exists "perfil: leitura"               on public.profiles;
drop policy if exists "perfil: edição"                on public.profiles;

-- O próprio perfil é sempre visível (inclusive desativado, para o app avisar).
create policy "perfil: leitura" on public.profiles for select to authenticated
  using (id = auth.uid() or (select public.can_view('usuarios')));
-- Inclusão e exclusão só pela Edge Function (service role) / gatilho de sign-up.
create policy "perfil: edição" on public.profiles for update to authenticated
  using ((select public.can_edit('usuarios')))
  with check ((select public.can_edit('usuarios')));

alter table public.access_roles enable row level security;
drop policy if exists "perfis de acesso: leitura" on public.access_roles;
drop policy if exists "perfis de acesso: escrita" on public.access_roles;
create policy "perfis de acesso: leitura" on public.access_roles for select to authenticated
  using ((select public.is_active_user()));
create policy "perfis de acesso: escrita" on public.access_roles for all to authenticated
  using ((select public.can_edit('usuarios')))
  with check ((select public.can_edit('usuarios')));

-- ── 6. Proteções ───────────────────────────────────────────────────────────
-- 6a. Ninguém altera o próprio papel/status (evita auto-promoção e
--     auto-bloqueio); updated_at automático.
create or replace function public.profiles_guard()
returns trigger language plpgsql as $$
begin
  if new.id is distinct from old.id then
    raise exception 'O identificador do usuário não pode ser alterado.';
  end if;
  if auth.uid() is not null and old.id = auth.uid()
     and (new.role is distinct from old.role or new.ativo is distinct from old.ativo) then
    raise exception 'Você não pode alterar o próprio perfil de acesso nem desativar o próprio usuário.';
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_profiles_guard on public.profiles;
create trigger trg_profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

-- 6b. Sempre sobra ao menos um administrador ativo.
create or replace function public.ensure_active_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.has_active_admin() then
    raise exception 'É preciso manter ao menos um administrador ativo (perfil com edição em "Usuários e acessos").';
  end if;
  return null;
end $$;

drop trigger if exists trg_profiles_admin on public.profiles;
create trigger trg_profiles_admin after update or delete on public.profiles
  for each statement execute function public.ensure_active_admin();

drop trigger if exists trg_access_roles_admin on public.access_roles;
create trigger trg_access_roles_admin after update or delete on public.access_roles
  for each statement execute function public.ensure_active_admin();

-- 6c. Perfil master é fixo (acesso total); perfis do sistema não são excluídos;
--     a chave não muda; permissões só com módulos conhecidos.
create or replace function public.access_roles_guard()
returns trigger language plpgsql as $$
declare
  modules constant text[] := array['dashboards','atletas','cadastros','modelo','relatorios','dados','usuarios'];
  extra text;
begin
  if tg_op = 'DELETE' then
    if old.is_system then
      raise exception 'O perfil "%" é do sistema e não pode ser excluído.', old.nome;
    end if;
    return old;
  end if;

  select k into extra from jsonb_object_keys(new.permissions) k where k <> all(modules) limit 1;
  if extra is not null then
    raise exception 'Módulo desconhecido nas permissões: %', extra;
  end if;

  if tg_op = 'UPDATE' then
    if new.key is distinct from old.key then
      raise exception 'A chave do perfil não pode ser alterada.';
    end if;
    new.is_system := old.is_system;
    new.updated_at := now();
  else
    new.is_system := coalesce(new.is_system, false) and auth.uid() is null;
  end if;

  if new.key = 'master' then
    new.permissions := (select jsonb_object_agg(m, 'edit') from unnest(modules) m);
  end if;
  return new;
end $$;

drop trigger if exists trg_access_roles_guard on public.access_roles;
create trigger trg_access_roles_guard before insert or update or delete on public.access_roles
  for each row execute function public.access_roles_guard();

-- ── 7. Sign-up: papel nunca vem do cliente ─────────────────────────────────
-- Antes, `raw_user_meta_data.role` definia o papel — qualquer pessoa com a
-- anon key poderia se cadastrar como master. Agora:
--   • primeiro usuário do projeto (sem nenhum admin ativo) → master ativo;
--   • demais → "consulta", INATIVO, até um admin liberar (a Edge Function
--     admin-users já grava o papel e ativa ao criar pelo app).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare bootstrap boolean := not public.has_active_admin();
begin
  insert into public.profiles (id, email, nome, role, ativo)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data->>'nome', ''), split_part(new.email, '@', 1)),
    case when bootstrap then 'master' else 'consulta' end,
    bootstrap
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- FIM 019

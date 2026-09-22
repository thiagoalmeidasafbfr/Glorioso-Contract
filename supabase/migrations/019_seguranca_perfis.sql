-- ════════════════════════════════════════════════════════════════════════════
-- 019 — Endurecimento de perfis (escalada de privilégio)
-- ════════════════════════════════════════════════════════════════════════════
-- 1. handle_new_user() deixava o PRÓPRIO usuário escolher o papel no signup:
--    `raw_user_meta_data->>'role'` é controlado pelo cliente
--    (supabase.auth.signUp({ options: { data: { role: 'master' } } })).
--    Agora todo novo perfil nasce 'juridico'; promoção só por um master.
-- 2. get_my_role() ignorava `ativo`: um perfil desativado continuava gravando.
--    Agora retorna NULL para perfis inativos — todas as policies que comparam
--    get_my_role() com 'master'/'juridico' passam a negar acesso.
-- 3. Trigger impede que alguém que não é master altere `role` ou `ativo`
--    (defesa em profundidade caso uma policy de auto-edição seja criada).
--
-- Executar APÓS 018. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, nome, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    'juridico'
  );
  return new;
end;
$$;

create or replace function public.get_my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and ativo
$$;

create or replace function public.profiles_protect_privileges()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Service role / SQL editor (auth.uid() nulo) continua podendo administrar.
  if auth.uid() is null then return new; end if;
  if (new.role is distinct from old.role or new.ativo is distinct from old.ativo)
     and coalesce(public.get_my_role(), '') <> 'master' then
    raise exception 'Somente um master pode alterar papel ou status de um perfil'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_protect_privileges on public.profiles;
create trigger trg_profiles_protect_privileges
  before update on public.profiles
  for each row execute function public.profiles_protect_privileges();

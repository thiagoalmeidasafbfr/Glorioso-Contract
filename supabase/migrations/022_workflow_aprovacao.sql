-- ════════════════════════════════════════════════════════════════════════════
-- 022 — Workflow de aprovação (RASCUNHO → EM_REVISAO → APROVADO | REJEITADO)
-- ════════════════════════════════════════════════════════════════════════════
-- Aplica-se a ac_contratos e ac_clausulas_fin. Colunas novas:
--   status_aprovacao text not null default 'APROVADO'
--                    check in ('RASCUNHO','EM_REVISAO','APROVADO','REJEITADO')
--   aprovado_por     uuid         (quem aprovou/rejeitou por último)
--   aprovado_em      timestamptz
--   motivo_rejeicao  text
--
-- O default é APROVADO para que os dados existentes e os fluxos atuais do app
-- (que não conhecem o workflow) continuem funcionando. Para usar o workflow, o
-- front-end cria o registro com status_aprovacao = 'RASCUNHO' e chama as RPCs.
--
-- RPCs (SECURITY DEFINER; p_tabela ∈ {'ac_contratos','ac_clausulas_fin'}):
--   enviar_para_revisao(p_tabela text, p_id uuid) → jsonb   [master, juridico]
--       RASCUNHO | REJEITADO | APROVADO → EM_REVISAO
--   aprovar_registro(p_tabela text, p_id uuid) → jsonb       [master, controladoria]
--       RASCUNHO | EM_REVISAO → APROVADO
--   rejeitar_registro(p_tabela text, p_id uuid, p_motivo text) → jsonb [master, controladoria]
--       EM_REVISAO | RASCUNHO → REJEITADO (motivo obrigatório)
--   Retorno: a linha atualizada (to_jsonb).
--
-- Proteção: trigger BEFORE UPDATE impede que quem não é master/controladoria
-- mude status_aprovacao PARA 'APROVADO' ou 'REJEITADO' via UPDATE direto
-- (valor inalterado é permitido — edições comuns continuam funcionando).
-- Service role / SQL editor (auth.uid() nulo) não é bloqueado.
--
-- Executar APÓS 021. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

do $$
declare t text;
begin
  foreach t in array array['ac_contratos','ac_clausulas_fin'] loop
    if to_regclass('public.' || t) is null then
      raise notice '022: tabela % ausente — ignorada', t;
      continue;
    end if;
    execute format($s$
      alter table public.%I
        add column if not exists status_aprovacao text not null default 'APROVADO',
        add column if not exists aprovado_por     uuid,
        add column if not exists aprovado_em      timestamptz,
        add column if not exists motivo_rejeicao  text
    $s$, t);
    begin
      execute format($s$
        alter table public.%I add constraint %I
          check (status_aprovacao in ('RASCUNHO','EM_REVISAO','APROVADO','REJEITADO'))
      $s$, t, t || '_status_aprovacao_check');
    exception when duplicate_object then null;
    end;
    execute format('create index if not exists %I on public.%I(status_aprovacao)',
                   'idx_' || t || '_status_aprov', t);
  end loop;
end $$;

-- ── Guarda: só aprovadores levam o status a APROVADO/REJEITADO ─────────────
create or replace function public.ac_guard_status_aprovacao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status_aprovacao is not distinct from old.status_aprovacao then
    return new;
  end if;
  if auth.uid() is null then  -- service role / manutenção
    return new;
  end if;
  if new.status_aprovacao in ('APROVADO','REJEITADO')
     and not public.has_role('master','controladoria') then
    raise exception 'Somente master ou controladoria podem aprovar/rejeitar (status %)', new.status_aprovacao
      using errcode = '42501';
  end if;
  if new.status_aprovacao in ('APROVADO','REJEITADO') then
    new.aprovado_por := auth.uid();
    new.aprovado_em  := now();
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['ac_contratos','ac_clausulas_fin'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop trigger if exists trg_%1$s_guard_aprov on public.%1$I', t);
    execute format('create trigger trg_%1$s_guard_aprov before update on public.%1$I
                      for each row execute function public.ac_guard_status_aprovacao()', t);
  end loop;
end $$;

-- ── Núcleo comum das RPCs ───────────────────────────────────────────────────
create or replace function public.ac_mudar_status_aprovacao(
  p_tabela text, p_id uuid, p_de text[], p_para text, p_motivo text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_atual text;
  v_row jsonb;
begin
  if p_tabela not in ('ac_contratos','ac_clausulas_fin') then
    raise exception 'Tabela não suportada no workflow: %', p_tabela using errcode = '22023';
  end if;

  execute format('select status_aprovacao from public.%I where id = $1 for update', p_tabela)
    into v_atual using p_id;
  if v_atual is null then
    raise exception 'Registro % não encontrado em %', p_id, p_tabela using errcode = 'P0002';
  end if;
  if not (v_atual = any(p_de)) then
    raise exception 'Transição inválida: % → % (permitido a partir de: %)', v_atual, p_para, p_de
      using errcode = '22023';
  end if;

  execute format($u$
    update public.%I
       set status_aprovacao = $2,
           motivo_rejeicao  = case when $2 = 'REJEITADO' then $3
                                   when $2 = 'APROVADO'  then null
                                   else motivo_rejeicao end,
           aprovado_por     = case when $2 in ('APROVADO','REJEITADO') then auth.uid()
                                   when $2 = 'EM_REVISAO' then null else aprovado_por end,
           aprovado_em      = case when $2 in ('APROVADO','REJEITADO') then now()
                                   when $2 = 'EM_REVISAO' then null else aprovado_em end
     where id = $1
     returning to_jsonb(%I.*)
  $u$, p_tabela, p_tabela) into v_row using p_id, p_para, p_motivo;
  return v_row;
end $$;

-- A função-núcleo não deve ser chamada diretamente pelo cliente.
do $$ begin
  revoke all on function public.ac_mudar_status_aprovacao(text, uuid, text[], text, text) from public;
exception when others then null; end $$;
do $$ begin
  revoke all on function public.ac_mudar_status_aprovacao(text, uuid, text[], text, text) from anon, authenticated;
exception when others then null; end $$;

create or replace function public.enviar_para_revisao(p_tabela text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role('master','juridico') then
    raise exception 'Sem permissão para enviar para revisão' using errcode = '42501';
  end if;
  return public.ac_mudar_status_aprovacao(p_tabela, p_id,
           array['RASCUNHO','REJEITADO','APROVADO'], 'EM_REVISAO');
end $$;

create or replace function public.aprovar_registro(p_tabela text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role('master','controladoria') then
    raise exception 'Sem permissão para aprovar' using errcode = '42501';
  end if;
  return public.ac_mudar_status_aprovacao(p_tabela, p_id,
           array['RASCUNHO','EM_REVISAO'], 'APROVADO');
end $$;

create or replace function public.rejeitar_registro(p_tabela text, p_id uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role('master','controladoria') then
    raise exception 'Sem permissão para rejeitar' using errcode = '42501';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da rejeição' using errcode = '22023';
  end if;
  return public.ac_mudar_status_aprovacao(p_tabela, p_id,
           array['RASCUNHO','EM_REVISAO'], 'REJEITADO', p_motivo);
end $$;

-- FIM 022

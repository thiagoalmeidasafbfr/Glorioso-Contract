-- ════════════════════════════════════════════════════════════════════════════
-- 027 — Geração automática de alertas (ac_alertas)
-- ════════════════════════════════════════════════════════════════════════════
-- ac_alertas (014) ganha colunas p/ alertas gerados pelo banco:
--   contrato_id uuid → ac_contratos (cascade)      alerta de contrato
--   gatilho_id  uuid → ac_gatilhos_salario (cascade) alerta de gatilho
--   chave       text UNIQUE    chave de idempotência '<REGRA>:<id>'
--   setores     text[]         papéis destinatários (tesouraria/juridico/futebol)
--   data_referencia date       vencimento / fim do contrato
--   automatico  boolean default false   true = criado por gerar_alertas()
--   resolvido_em timestamptz   preenchido quando a condição deixou de valer
--   notificado_em timestamptz  e-mail já enviado pela Edge Function notificar-alertas
--   updated_at  timestamptz    (compat. com o trigger genérico da 012)
--
-- public.gerar_alertas() → int (SECURITY DEFINER; perfis ativos ou cron/service)
--   0. Parcelas PENDENTE com due_date < hoje → payment_status = 'EM_ATRASO'.
--   1. Calcula o conjunto de alertas que DEVEM existir hoje:
--      regra (chave)            alert_type            severity  setores
--      PARCELA_VENCIDA:<id>     EM_ATRASO             RED       {tesouraria}
--      PARCELA_D7:<id>          VENCIMENTO_PROXIMO    YELLOW    {tesouraria}   (0–7 dias)
--      PARCELA_D30:<id>         VENCIMENTO_PROXIMO    GREEN     {tesouraria}   (8–30 dias)
--      CONTRATO_D30:<id>        CONTRATO_EXPIRANDO    RED       {juridico}     (0–30 dias)
--      CONTRATO_D90:<id>        CONTRATO_EXPIRANDO    YELLOW    {juridico}     (31–90)
--      CONTRATO_D180:<id>       CONTRATO_EXPIRANDO    GREEN     {juridico}     (91–180)
--      GATILHO_PROXIMO:<id>     GATILHO_PROXIMO       YELLOW    {juridico,futebol} (progresso ≥ 80%)
--      GATILHO_ATINGIDO:<id>    ATINGIMENTO_PENDENTE  RED       {juridico,futebol} (≥ 100%, status PENDENTE)
--      Parcelas consideradas: PENDENTE/EM_ATRASO, cláusula não NAO_ATINGIDA.
--      Contratos: status ATIVO, data_fim definida, vínculos de trabalho/empréstimo
--      (subtipo_legado ENTRADA/EMPRESTIMO_ENTRADA/EMPRESTIMO_SAIDA, ou tipo TRABALHO/EMPRESTIMO).
--      Gatilhos: usa a view vw_ac_gatilhos_progresso (028) se existir.
--   2. Insere os que faltam (ON CONFLICT (chave)); reabre (is_read=false,
--      resolvido_em=null) os que haviam sido resolvidos e voltaram a valer.
--   3. Resolve (resolvido_em=now(), is_read=true) os automáticos cuja condição
--      não vale mais — inclusive a mudança de estágio D30 → D7 → VENCIDA.
--   Retorna: nº de alertas inseridos + reabertos.
--   Alertas manuais (automatico=false) nunca são tocados.
--
-- public.marcar_alerta_lido(p_id uuid, p_lido boolean default true) → void
--   qualquer perfil ativo (a escrita direta em ac_alertas segue master/juridico).
--
-- AGENDAMENTO: se a extensão pg_cron estiver disponível, agenda o job
-- 'gerar-alertas-diario' às 09:00 UTC. Caso contrário, chamar manualmente
-- (SQL editor: select public.gerar_alertas();) ou via Edge Function/cron externo
-- (supabase.rpc('gerar_alertas')).
--
-- Executar APÓS 026. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.ac_alertas
  add column if not exists contrato_id     uuid,
  add column if not exists gatilho_id      uuid,
  add column if not exists chave           text,
  add column if not exists setores         text[],
  add column if not exists data_referencia date,
  add column if not exists automatico      boolean not null default false,
  add column if not exists resolvido_em    timestamptz,
  add column if not exists notificado_em   timestamptz,  -- e-mail enviado (Edge Function notificar-alertas)
  -- a 012, se reaplicada, põe trigger de updated_at em toda ac_* (inclusive
  -- ac_alertas, que não tinha a coluna) — a coluna evita que UPDATEs quebrem.
  add column if not exists updated_at      timestamptz not null default now();

do $$ begin
  alter table public.ac_alertas add constraint ac_alertas_contrato_fk
    foreign key (contrato_id) references public.ac_contratos(id) on delete cascade;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.ac_alertas add constraint ac_alertas_gatilho_fk
    foreign key (gatilho_id) references public.ac_gatilhos_salario(id) on delete cascade;
exception when duplicate_object then null; end $$;

create unique index if not exists ux_ac_alertas_chave on public.ac_alertas(chave);
create index if not exists idx_ac_alertas_abertos on public.ac_alertas(is_read, resolvido_em);

-- ── gerar_alertas ───────────────────────────────────────────────────────────
create or replace function public.gerar_alertas()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_hoje date := current_date;
  v_novos int := 0;
begin
  if auth.uid() is not null and public.get_my_role() is null then
    raise exception 'Sem permissão para gerar alertas' using errcode = '42501';
  end if;

  -- 0) parcelas vencidas
  update public.ac_parcelas_fin
     set payment_status = 'EM_ATRASO'
   where payment_status = 'PENDENTE' and due_date < v_hoje;

  create temp table if not exists _ac_alertas_desejados (
    chave text primary key, atleta_id uuid, clausula_fin_id uuid, parcela_fin_id uuid,
    contrato_id uuid, gatilho_id uuid, alert_type text, severity text, message text,
    setores text[], data_referencia date
  ) on commit drop;
  truncate _ac_alertas_desejados;

  -- 1a) parcelas
  insert into _ac_alertas_desejados
  select case when pf.due_date < v_hoje then 'PARCELA_VENCIDA:'
              when pf.due_date <= v_hoje + 7 then 'PARCELA_D7:'
              else 'PARCELA_D30:' end || pf.id,
         pf.atleta_id, pf.clausula_fin_id, pf.id, cf.contrato_id, null,
         case when pf.due_date < v_hoje then 'EM_ATRASO' else 'VENCIMENTO_PROXIMO' end,
         case when pf.due_date < v_hoje then 'RED'
              when pf.due_date <= v_hoje + 7 then 'YELLOW' else 'GREEN' end,
         format('Parcela %s de "%s" (%s %s) %s %s',
                pf.installment_number,
                coalesce(nullif(cf.description, ''), cf.clause_type),
                pf.currency, pf.original_value,
                case when pf.due_date < v_hoje then 'vencida desde' else 'vence em' end,
                to_char(pf.due_date, 'DD/MM/YYYY')),
         array['tesouraria'], pf.due_date
    from public.ac_parcelas_fin pf
    join public.ac_clausulas_fin cf on cf.id = pf.clausula_fin_id
   where pf.payment_status in ('PENDENTE','EM_ATRASO')
     and cf.achievement_status <> 'NAO_ATINGIDA'
     and pf.due_date <= v_hoje + 30;

  -- 1b) contratos terminando
  insert into _ac_alertas_desejados
  select case when c.data_fim <= v_hoje + 30 then 'CONTRATO_D30:'
              when c.data_fim <= v_hoje + 90 then 'CONTRATO_D90:'
              else 'CONTRATO_D180:' end || c.id,
         c.atleta_id, null, null, c.id, null,
         'CONTRATO_EXPIRANDO',
         case when c.data_fim <= v_hoje + 30 then 'RED'
              when c.data_fim <= v_hoje + 90 then 'YELLOW' else 'GREEN' end,
         format('Contrato %s%s termina em %s (%s dias)',
                coalesce(c.subtipo_legado, c.tipo::text),
                coalesce(' — ' || nullif(c.contraparte_nome, ''), ''),
                to_char(c.data_fim, 'DD/MM/YYYY'), c.data_fim - v_hoje),
         array['juridico'], c.data_fim
    from public.ac_contratos c
   where c.status = 'ATIVO'
     and c.data_fim is not null
     and c.data_fim between v_hoje and v_hoje + 180
     and ( c.subtipo_legado in ('ENTRADA','EMPRESTIMO_ENTRADA','EMPRESTIMO_SAIDA')
           or (c.subtipo_legado is null and c.tipo in ('TRABALHO','EMPRESTIMO')) );

  -- 1c) gatilhos (se a view da 028 existir)
  if to_regclass('public.vw_ac_gatilhos_progresso') is not null then
    execute $q$
      insert into _ac_alertas_desejados
      select case when g.progresso >= 1 then 'GATILHO_ATINGIDO:' else 'GATILHO_PROXIMO:' end || g.gatilho_id,
             g.atleta_id, null, null, g.contrato_id, g.gatilho_id,
             case when g.progresso >= 1 then 'ATINGIMENTO_PENDENTE' else 'GATILHO_PROXIMO' end,
             case when g.progresso >= 1 then 'RED' else 'YELLOW' end,
             format('Gatilho "%s": %s de %s %s (%s%%)%s',
                    g.description, g.valor_apurado, g.threshold, g.metric,
                    round(g.progresso * 100),
                    case when g.progresso >= 1 then ' — meta atingida, confirmar' else '' end),
             array['juridico','futebol'], null
        from public.vw_ac_gatilhos_progresso g
       where g.status = 'PENDENTE' and g.progresso >= 0.8
    $q$;
  end if;

  -- 2) insere / reabre
  with ins as (
    insert into public.ac_alertas as a
      (atleta_id, clausula_fin_id, parcela_fin_id, contrato_id, gatilho_id,
       alert_type, severity, message, is_read, chave, setores, data_referencia, automatico)
    select atleta_id, clausula_fin_id, parcela_fin_id, contrato_id, gatilho_id,
           alert_type, severity, message, false, chave, setores, data_referencia, true
      from _ac_alertas_desejados
    on conflict (chave) do update
       set is_read = false, resolvido_em = null, notificado_em = null,
           message = excluded.message, severity = excluded.severity
     where a.resolvido_em is not null
    returning 1
  )
  select count(*) into v_novos from ins;

  -- 3) resolve o que não vale mais
  update public.ac_alertas a
     set resolvido_em = now(), is_read = true
   where a.automatico and a.resolvido_em is null
     and not exists (select 1 from _ac_alertas_desejados d where d.chave = a.chave);

  return v_novos;
end $$;

-- ── marcar_alerta_lido ──────────────────────────────────────────────────────
create or replace function public.marcar_alerta_lido(p_id uuid, p_lido boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.get_my_role() is null then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;
  update public.ac_alertas set is_read = coalesce(p_lido, true) where id = p_id;
  if not found then
    raise exception 'Alerta % não encontrado', p_id using errcode = 'P0002';
  end if;
end $$;

-- ── Agendamento diário (pg_cron, se disponível) ─────────────────────────────
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
      perform cron.unschedule(jobid) from cron.job where jobname = 'gerar-alertas-diario';
      perform cron.schedule('gerar-alertas-diario', '0 9 * * *', 'select public.gerar_alertas();');
    exception when others then
      raise notice '027: não foi possível agendar via pg_cron (%). Agende manualmente.', sqlerrm;
    end;
  else
    raise notice '027: pg_cron indisponível — chame public.gerar_alertas() diariamente (Edge Function/cron externo).';
  end if;
end $$;

-- FIM 027

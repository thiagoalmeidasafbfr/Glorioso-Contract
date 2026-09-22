-- ════════════════════════════════════════════════════════════════════════════
-- 025 — Metadados de negócio saem do campo `notes` e viram colunas
-- ════════════════════════════════════════════════════════════════════════════
-- Hoje o app esconde metadados em `notes` (texto). Formatos (src/lib/*):
--
--   (a) Rateio de salário em empréstimo — src/lib/loanSalary.ts
--       ac_gatilhos_salario.notes = '__EMPRESTIMO__' || JSON(LoanShareMeta)
--       LoanShareMeta = { __emprestimo: 1, loanContractId, workContractId, club,
--         clubSalaryPct, clubImagePct, startDate, endDate|null,
--         role: 'RATEIO'|'RETORNO', fullSalary, fullImage }
--   (b) Acordo de renegociação — src/lib/renegotiation.ts
--       ac_clausulas_fin.notes (clause_type = 'ACORDO_RENEGOCIACAO')
--         = '__ACORDO__' || JSON(AcordoMeta)   (ou o JSON puro, legado)
--       AcordoMeta = { __acordo: 1, createdAt, originalTotal, newTotal, discount,
--         currency, creditor, debtor, startDate, installmentsCount,
--         periodicityMonths, sources: AcordoSource[], userNote }
--       Itens de ORIGEM renegociados (parcela, cláusula, passivo clube/agente)
--       recebem em notes: '… Renegociado no acordo <uuid-da-cláusula-acordo> em <data>'
--   (c) Recuperação Judicial — src/lib/judicialRecovery.ts
--       notes contém '[RJ:YYYY-MM-DD]' (data de inclusão no processo) em
--       parcelas, cláusulas, passivos de clube e de agente.
--
-- COLUNAS NOVAS (todas anuláveis; o front-end deve fazer DUAL-WRITE: continuar
-- gravando o marcador em notes E passar a gravar a coluna; a leitura deve
-- preferir a coluna):
--
--   ac_gatilhos_salario.emprestimo_rateio   jsonb  = LoanShareMeta (sem o prefixo)
--   ac_clausulas_fin.renegociacao           jsonb  = AcordoMeta (sem o prefixo)
--   renegociado_acordo_id uuid → ac_clausulas_fin(id) ON DELETE SET NULL
--       em ac_clausulas_fin, ac_parcelas_fin, ac_passivos_clube, ac_passivos_agente
--   rj_data date                 data de inclusão em RJ (NULL = fora de RJ)
--   recuperacao_judicial boolean not null default false  (espelho de rj_data)
--       ambas em ac_clausulas_fin, ac_parcelas_fin, ac_passivos_clube, ac_passivos_agente
--
-- SINCRONIZAÇÃO AUTOMÁTICA (trigger ac_sync_metadados_notes, BEFORE INSERT/UPDATE):
--   • Se `notes` muda e o marcador extraído muda, a coluna recebe o novo valor
--     (inclusive NULL quando o marcador é removido) — A MENOS que o mesmo UPDATE
--     também altere a coluna explicitamente (a coluna vence).
--   • No INSERT, coluna NULL + marcador presente → coluna preenchida.
--   • rj_data ↔ recuperacao_judicial: mudar rj_data ajusta o flag; mudar só o
--     flag para true preenche rj_data = current_date (se vazio); false → rj_data NULL.
--   Resultado: o app atual (que só grava notes) já mantém as colunas corretas.
--
-- BACKFILL best-effort a partir de notes (nunca altera notes).
--
-- Executar APÓS 024. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Parsers (imutáveis, tolerantes a lixo) ──────────────────────────────────
create or replace function public.ac_try_jsonb(p text)
returns jsonb language plpgsql immutable as $$
begin
  return p::jsonb;
exception when others then
  return null;
end $$;

create or replace function public.ac_notes_rj(p_notes text)
returns date language plpgsql immutable as $$
declare v text;
begin
  v := substring(p_notes from '\[RJ:(\d{4}-\d{2}-\d{2})\]');
  if v is null then return null; end if;
  return v::date;
exception when others then
  return null;
end $$;

create or replace function public.ac_notes_acordo_origem(p_notes text)
returns uuid language plpgsql immutable as $$
declare v text;
begin
  v := substring(p_notes from 'Renegociado no acordo ([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}) em ');
  return v::uuid;
exception when others then
  return null;
end $$;

create or replace function public.ac_notes_acordo_meta(p_notes text)
returns jsonb language plpgsql immutable as $$
declare j jsonb;
begin
  if p_notes is null then return null; end if;
  if left(p_notes, 10) = '__ACORDO__' then
    j := public.ac_try_jsonb(substr(p_notes, 11));
  elsif left(ltrim(p_notes), 1) = '{' then
    j := public.ac_try_jsonb(p_notes);
  end if;
  if j is null or jsonb_typeof(j) <> 'object'
     or coalesce(j ->> '__acordo', '') in ('', '0', 'false') then
    return null;
  end if;
  return j;
end $$;

create or replace function public.ac_notes_emprestimo(p_notes text)
returns jsonb language plpgsql immutable as $$
declare j jsonb;
begin
  if p_notes is null or left(p_notes, 14) <> '__EMPRESTIMO__' then return null; end if;
  j := public.ac_try_jsonb(substr(p_notes, 15));
  if j is null or jsonb_typeof(j) <> 'object'
     or coalesce(j ->> '__emprestimo', '') in ('', '0', 'false') then
    return null;
  end if;
  return j;
end $$;

-- ── Colunas ─────────────────────────────────────────────────────────────────
alter table if exists public.ac_gatilhos_salario
  add column if not exists emprestimo_rateio jsonb;
alter table if exists public.ac_clausulas_fin
  add column if not exists renegociacao jsonb;

do $$
declare t text;
begin
  foreach t in array array['ac_clausulas_fin','ac_parcelas_fin','ac_passivos_clube','ac_passivos_agente'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('alter table public.%I
                      add column if not exists renegociado_acordo_id uuid,
                      add column if not exists rj_data date,
                      add column if not exists recuperacao_judicial boolean not null default false', t);
    begin
      execute format('alter table public.%I add constraint %I
                        foreign key (renegociado_acordo_id) references public.ac_clausulas_fin(id)
                        on delete set null', t, t || '_reneg_acordo_fk');
    exception when duplicate_object then null;
    end;
    execute format('create index if not exists %I on public.%I(renegociado_acordo_id)',
                   'idx_' || t || '_reneg', t);
    execute format('create index if not exists %I on public.%I(recuperacao_judicial) where recuperacao_judicial',
                   'idx_' || t || '_rj', t);
  end loop;
end $$;

comment on column public.ac_gatilhos_salario.emprestimo_rateio is 'LoanShareMeta (src/lib/loanSalary.ts) — antes em notes com prefixo __EMPRESTIMO__.';
comment on column public.ac_clausulas_fin.renegociacao        is 'AcordoMeta (src/lib/renegotiation.ts) — antes em notes com prefixo __ACORDO__.';

-- ── Trigger de sincronização notes → colunas ────────────────────────────────
create or replace function public.ac_sync_metadados_notes()
returns trigger language plpgsql as $$
declare
  jn jsonb := to_jsonb(new);
  jo jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  n_notes text := jn ->> 'notes';
  o_notes text := jo ->> 'notes';
  patch jsonb := '{}'::jsonb;
  d_new jsonb; d_old jsonb;
  c text;
  v_rj_final jsonb;
  v_flag_new boolean; v_flag_old boolean;
begin
  foreach c in array array['rj_data','renegociado_acordo_id','renegociacao','emprestimo_rateio'] loop
    if not (jn ? c) then continue; end if;
    d_new := case c
      when 'rj_data'               then to_jsonb(public.ac_notes_rj(n_notes))
      when 'renegociado_acordo_id' then to_jsonb(public.ac_notes_acordo_origem(n_notes))
      when 'renegociacao'          then public.ac_notes_acordo_meta(n_notes)
      when 'emprestimo_rateio'     then public.ac_notes_emprestimo(n_notes)
    end;
    if tg_op = 'INSERT' then
      if (jn -> c) = 'null'::jsonb and d_new is not null then
        patch := patch || jsonb_build_object(c, d_new);
      end if;
    else
      d_old := case c
        when 'rj_data'               then to_jsonb(public.ac_notes_rj(o_notes))
        when 'renegociado_acordo_id' then to_jsonb(public.ac_notes_acordo_origem(o_notes))
        when 'renegociacao'          then public.ac_notes_acordo_meta(o_notes)
        when 'emprestimo_rateio'     then public.ac_notes_emprestimo(o_notes)
      end;
      if coalesce(d_new, 'null'::jsonb) is distinct from coalesce(d_old, 'null'::jsonb)
         and (jn -> c) is not distinct from (jo -> c) then
        patch := patch || jsonb_build_object(c, coalesce(d_new, 'null'::jsonb));
      end if;
    end if;
  end loop;

  -- rj_data ↔ recuperacao_judicial
  if jn ? 'recuperacao_judicial' then
    v_rj_final := coalesce(patch -> 'rj_data', jn -> 'rj_data');
    v_flag_new := (jn ->> 'recuperacao_judicial')::boolean;
    if tg_op = 'INSERT' then
      if v_rj_final is not null and v_rj_final <> 'null'::jsonb then
        patch := patch || jsonb_build_object('recuperacao_judicial', true);
      elsif v_flag_new then
        patch := patch || jsonb_build_object('rj_data', current_date);
      end if;
    else
      v_flag_old := (jo ->> 'recuperacao_judicial')::boolean;
      if v_rj_final is distinct from (jo -> 'rj_data') then
        patch := patch || jsonb_build_object('recuperacao_judicial',
                   v_rj_final is not null and v_rj_final <> 'null'::jsonb);
      elsif v_flag_new is distinct from v_flag_old then
        if v_flag_new then
          patch := patch || jsonb_build_object('rj_data',
                     coalesce(nullif(v_rj_final, 'null'::jsonb), to_jsonb(current_date)));
        else
          patch := patch || jsonb_build_object('rj_data', null);
        end if;
      end if;
    end if;
  end if;

  -- FK: só aponta para um acordo que existe (senão mantém NULL, sem erro)
  if (patch -> 'renegociado_acordo_id') is not null
     and (patch -> 'renegociado_acordo_id') <> 'null'::jsonb
     and not exists (select 1 from public.ac_clausulas_fin a
                      where a.id = (patch ->> 'renegociado_acordo_id')::uuid) then
    patch := patch - 'renegociado_acordo_id';
  end if;

  if patch <> '{}'::jsonb then
    new := jsonb_populate_record(new, patch);
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['ac_clausulas_fin','ac_parcelas_fin','ac_passivos_clube',
                           'ac_passivos_agente','ac_gatilhos_salario'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop trigger if exists trg_%1$s_meta_notes on public.%1$I', t);
    execute format('create trigger trg_%1$s_meta_notes before insert or update on public.%1$I
                      for each row execute function public.ac_sync_metadados_notes()', t);
  end loop;
end $$;

-- ── Backfill (best-effort; notes intocado) ─────────────────────────────────
update public.ac_gatilhos_salario
   set emprestimo_rateio = public.ac_notes_emprestimo(notes)
 where emprestimo_rateio is null and notes like '\_\_EMPRESTIMO\_\_%'
   and public.ac_notes_emprestimo(notes) is not null;

update public.ac_clausulas_fin
   set renegociacao = public.ac_notes_acordo_meta(notes)
 where renegociacao is null and notes is not null
   and public.ac_notes_acordo_meta(notes) is not null;

do $$
declare t text;
begin
  foreach t in array array['ac_clausulas_fin','ac_parcelas_fin','ac_passivos_clube','ac_passivos_agente'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format($u$
      update public.%1$I
         set rj_data = public.ac_notes_rj(notes)
       where rj_data is null and notes like '%%[RJ:%%'
         and public.ac_notes_rj(notes) is not null
    $u$, t);
    -- só aponta para acordos que ainda existem (FK)
    execute format($u$
      update public.%1$I x
         set renegociado_acordo_id = public.ac_notes_acordo_origem(x.notes)
       where x.renegociado_acordo_id is null and x.notes like '%%Renegociado no acordo %%'
         and exists (select 1 from public.ac_clausulas_fin a
                      where a.id = public.ac_notes_acordo_origem(x.notes))
    $u$, t);
  end loop;
end $$;

-- FIM 025

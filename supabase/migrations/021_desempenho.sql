-- ════════════════════════════════════════════════════════════════════════════
-- 021 — DESEMPENHO DO BANCO
-- ════════════════════════════════════════════════════════════════════════════
-- Executar APÓS 020. Idempotente. Não altera dados.
--
--   1) Índices nas chaves estrangeiras que não tinham: sem eles, apagar um
--      contrato/cláusula/parcela varre as tabelas filhas inteiras (ON DELETE
--      CASCADE / SET NULL), e os filtros por contrato ficam em varredura total.
--   2) ac_entidades(tipo): toda lista de clubes/agentes filtra por tipo.
--   3) Sincronização do status da cláusula em LOTE: o gatilho antigo rodava
--      UMA VEZ POR PARCELA (contagem + update da cláusula a cada linha) — gerar
--      um fluxo de 60 parcelas ou importar uma planilha disparava centenas de
--      recontagens. Agora roda uma vez por comando, só para as cláusulas
--      afetadas, e só grava quando o status realmente muda.
--   4) ANALYZE para o planejador conhecer os novos índices.

-- ── 1. Índices em chaves estrangeiras sem índice ────────────────────────────
do $$
declare
  fk record;
  idx text;
begin
  for fk in
    select c.conrelid::regclass as tbl, c.conrelid as relid, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.connamespace = 'public'::regnamespace
      and array_length(c.conkey, 1) = 1
      and not exists (
        select 1 from pg_index i
        where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1]
      )
  loop
    idx := left(format('idx_%s_%s', replace(fk.tbl::text, 'public.', ''), fk.col), 63);
    execute format('create index if not exists %I on %s (%I)', idx, fk.tbl, fk.col);
  end loop;
end $$;

-- ── 2. Filtro por tipo de entidade ──────────────────────────────────────────
create index if not exists idx_ac_entidades_tipo on public.ac_entidades (tipo);

-- ── 3. Status da cláusula em lote ───────────────────────────────────────────
create or replace function public.ac_sync_clausula_fin_status_lote()
returns trigger language plpgsql as $$
declare ids uuid[];
begin
  if tg_op = 'INSERT' then
    select array_agg(distinct clausula_fin_id) into ids from novas;
  elsif tg_op = 'DELETE' then
    select array_agg(distinct clausula_fin_id) into ids from antigas;
  else
    select array_agg(distinct x) into ids
      from (select clausula_fin_id as x from novas union select clausula_fin_id from antigas) t;
  end if;
  if ids is null then return null; end if;

  update public.ac_clausulas_fin c
     set payment_status = s.novo, installments_paid = s.pagas, updated_at = now()
    from (
      select cf.id,
             count(p.id) filter (where p.payment_status = 'PAGA')::int as pagas,
             case
               when count(p.id) = 0 then 'PENDENTE'
               when count(p.id) filter (where p.payment_status = 'PAGA') = count(p.id) then 'PAGA'
               when count(p.id) filter (where p.payment_status = 'PAGA') > 0 then 'PARCIALMENTE_PAGA'
               when count(p.id) filter (where p.payment_status = 'EM_ATRASO') > 0 then 'EM_ATRASO'
               else 'PENDENTE'
             end as novo
        from public.ac_clausulas_fin cf
        left join public.ac_parcelas_fin p on p.clausula_fin_id = cf.id
       where cf.id = any(ids)
       group by cf.id
    ) s
   where c.id = s.id
     and (c.payment_status is distinct from s.novo or c.installments_paid is distinct from s.pagas);
  return null;
end $$;

drop trigger if exists trg_ac_sync_clfin on public.ac_parcelas_fin;
drop trigger if exists trg_ac_sync_clfin_ins on public.ac_parcelas_fin;
drop trigger if exists trg_ac_sync_clfin_upd on public.ac_parcelas_fin;
drop trigger if exists trg_ac_sync_clfin_del on public.ac_parcelas_fin;

create trigger trg_ac_sync_clfin_ins after insert on public.ac_parcelas_fin
  referencing new table as novas
  for each statement execute function public.ac_sync_clausula_fin_status_lote();
create trigger trg_ac_sync_clfin_upd after update on public.ac_parcelas_fin
  referencing old table as antigas new table as novas
  for each statement execute function public.ac_sync_clausula_fin_status_lote();
create trigger trg_ac_sync_clfin_del after delete on public.ac_parcelas_fin
  referencing old table as antigas
  for each statement execute function public.ac_sync_clausula_fin_status_lote();

-- ── 4. Estatísticas ─────────────────────────────────────────────────────────
analyze;

-- FIM 021

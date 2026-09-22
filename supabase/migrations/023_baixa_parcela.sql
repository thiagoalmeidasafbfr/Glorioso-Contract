-- ════════════════════════════════════════════════════════════════════════════
-- 023 — Baixa (pagamento) de parcela com valor pago, PTAX efetiva e autor
-- ════════════════════════════════════════════════════════════════════════════
-- Colunas novas em ac_parcelas_fin (as existentes são mantidas):
--   pago_por          uuid          quem deu a baixa (auth.uid())
--   pago_em           timestamptz   quando a baixa foi registrada no sistema
--   valor_pago_moeda  numeric(18,2) valor efetivamente pago, na MOEDA da parcela
--   ptax_utilizada    numeric(18,6) taxa moeda→BRL usada (1 para BRL)
-- Mantidas: payment_date (data do pagamento), amount_paid_brl, exchange_rate
-- (= ptax_utilizada, p/ compatibilidade com o app atual).
--
-- RPCs (SECURITY DEFINER):
--   baixar_parcela(p_id uuid, p_data date, p_valor_pago numeric,
--                  p_ptax numeric default null) → jsonb   [master, tesouraria, juridico]
--     • p_valor_pago NULL → usa original_value.
--     • PTAX: p_ptax informado → fixed_exchange_rate da parcela → ptax_em(moeda,
--       p_data) (028, se existir) → erro. Moeda BRL sempre 1.
--     • amount_paid_brl = round(valor * ptax, 2); status → PAGA.
--     • Recusa parcelas CANCELADA ou já PAGA.
--   estornar_baixa(p_id uuid) → jsonb                        [master, tesouraria]
--     • PAGA → PENDENTE; limpa payment_date, amount_paid_brl, exchange_rate,
--       valor_pago_moeda, ptax_utilizada, pago_por, pago_em.
--   Retorno de ambas: a linha de ac_parcelas_fin atualizada (to_jsonb).
--
-- O status da cláusula-mãe continua sendo recalculado pelo trigger da 014
-- (ac_sync_clausula_fin_status, SECURITY DEFINER desde a 020).
--
-- Executar APÓS 022. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.ac_parcelas_fin
  add column if not exists pago_por         uuid,
  add column if not exists pago_em          timestamptz,
  add column if not exists valor_pago_moeda numeric(18,2),
  add column if not exists ptax_utilizada   numeric(18,6);

comment on column public.ac_parcelas_fin.valor_pago_moeda is 'Valor efetivamente pago, na moeda da parcela (baixar_parcela).';
comment on column public.ac_parcelas_fin.ptax_utilizada   is 'Taxa moeda→BRL usada na baixa (1 para BRL).';
comment on column public.ac_parcelas_fin.pago_por         is 'auth.uid() de quem registrou a baixa.';
comment on column public.ac_parcelas_fin.pago_em          is 'Momento em que a baixa foi registrada no sistema.';

create or replace function public.baixar_parcela(
  p_id uuid, p_data date, p_valor_pago numeric, p_ptax numeric default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_p public.ac_parcelas_fin;
  v_ptax numeric;
  v_valor numeric;
  v_row jsonb;
begin
  if not public.has_role('master','tesouraria','juridico') then
    raise exception 'Sem permissão para baixar parcela' using errcode = '42501';
  end if;
  if p_data is null then
    raise exception 'Informe a data do pagamento' using errcode = '22023';
  end if;

  select * into v_p from public.ac_parcelas_fin where id = p_id for update;
  if not found then
    raise exception 'Parcela % não encontrada', p_id using errcode = 'P0002';
  end if;
  if v_p.payment_status = 'PAGA' then
    raise exception 'Parcela já está paga (estorne antes de baixar de novo)' using errcode = '22023';
  end if;
  if v_p.payment_status = 'CANCELADA' then
    raise exception 'Parcela cancelada não pode ser baixada' using errcode = '22023';
  end if;

  v_valor := coalesce(p_valor_pago, v_p.original_value);
  if v_valor is null or v_valor < 0 then
    raise exception 'Valor pago inválido' using errcode = '22023';
  end if;

  if upper(coalesce(v_p.currency, 'BRL')) = 'BRL' then
    v_ptax := 1;
  else
    v_ptax := coalesce(p_ptax, v_p.fixed_exchange_rate);
    if v_ptax is null and to_regprocedure('public.ptax_em(text,date)') is not null then
      execute 'select public.ptax_em($1, $2)' into v_ptax using v_p.currency, p_data;
    end if;
    if v_ptax is null or v_ptax <= 0 then
      raise exception 'PTAX de % em % não informada nem encontrada', v_p.currency, p_data
        using errcode = '22023';
    end if;
  end if;

  update public.ac_parcelas_fin
     set payment_status   = 'PAGA',
         payment_date     = p_data,
         valor_pago_moeda = v_valor,
         ptax_utilizada   = v_ptax,
         exchange_rate    = v_ptax,
         amount_paid_brl  = round(v_valor * v_ptax, 2),
         pago_por         = auth.uid(),
         pago_em          = now()
   where id = p_id
   returning to_jsonb(ac_parcelas_fin.*) into v_row;
  return v_row;
end $$;

create or replace function public.estornar_baixa(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_row jsonb;
begin
  if not public.has_role('master','tesouraria') then
    raise exception 'Sem permissão para estornar baixa' using errcode = '42501';
  end if;
  select payment_status into v_status from public.ac_parcelas_fin where id = p_id for update;
  if v_status is null then
    raise exception 'Parcela % não encontrada', p_id using errcode = 'P0002';
  end if;
  if v_status <> 'PAGA' then
    raise exception 'Somente parcelas PAGA podem ser estornadas (status atual: %)', v_status
      using errcode = '22023';
  end if;

  update public.ac_parcelas_fin
     set payment_status   = 'PENDENTE',
         payment_date     = null,
         valor_pago_moeda = null,
         ptax_utilizada   = null,
         exchange_rate    = null,
         amount_paid_brl  = null,
         pago_por         = null,
         pago_em          = null
   where id = p_id
   returning to_jsonb(ac_parcelas_fin.*) into v_row;
  return v_row;
end $$;

-- FIM 023

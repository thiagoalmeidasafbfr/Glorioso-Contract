-- ════════════════════════════════════════════════════════════════════════════
-- 026 — Movimentações de atletas (venda, compra, empréstimo, retorno, rescisão)
-- ════════════════════════════════════════════════════════════════════════════
-- Tabela public.ac_movimentacoes + RPCs atômicas:
--
--   registrar_movimentacao(p jsonb) → uuid        [master, juridico, futebol]
--   desfazer_movimentacao(p_id uuid) → jsonb      [master]
--
-- Efeitos aplicados por registrar_movimentacao (tudo na MESMA transação):
--   1. ac_atletas.status (enum ac_atleta_status):
--        VENDA → VENDIDO · RESCISAO → LIBERADO (o app exibe 'DESLIGADO')
--        EMPRESTIMO_SAIDA → EMPRESTADO
--        COMPRA / EMPRESTIMO_ENTRADA / RETORNO_EMPRESTIMO → ATIVO
--   2. VENDA / RESCISAO: encerra os vínculos de trabalho ATIVOS do atleta
--        (ac_contratos com subtipo_legado ENTRADA/EMPRESTIMO_ENTRADA, ou sem
--        subtipo e tipo TRABALHO): status ENCERRADO (venda) / RESCINDIDO
--        (rescisão), data_fim = data_movimentacao (nunca antes de data_inicio).
--        EMPRESTIMO_SAIDA NÃO encerra o vínculo (o atleta volta).
--   3. VENDA / RESCISAO — e EMPRESTIMO_SAIDA somente se p.cancelar_salario = true:
--        parcelas PENDENTE/EM_ATRASO com due_date > data_movimentacao das
--        cláusulas SALARIO_CETD e DIREITO_IMAGEM → CANCELADA; e linhas de
--        ac_direitos_imagem PENDENTE/EM_ATRASO com month > 'YYYY-MM' da data → CANCELADA.
--   4. VENDA com percentual_direitos: reduz a linha holder_type='BFR' de
--        ac_titularidade_economica em percentual_direitos pontos (mínimo 0).
--      COMPRA com percentual_direitos: soma à linha BFR (máx. 100) ou cria a linha.
--   5. Tudo o que foi feito é gravado em ac_movimentacoes.efeitos (JSON abaixo),
--      o que permite desfazer_movimentacao restaurar o estado anterior.
--
-- efeitos = {
--   "status_anterior": "ATIVO", "status_novo": "VENDIDO",
--   "contratos_encerrados": [{"id": uuid, "status_anterior": "ATIVO", "data_fim_anterior": date|null}],
--   "parcelas_canceladas":  [uuid, ...],
--   "direitos_imagem_cancelados": [uuid, ...],
--   "titularidade": {"id": uuid, "percentual_anterior": n|null, "percentual_novo": n, "inserida": bool} | null
-- }
--
-- desfazer_movimentacao: só a movimentação MAIS RECENTE (não desfeita) do
-- atleta pode ser desfeita; restaura status, contratos, parcelas/imagem que
-- AINDA estiverem CANCELADA, e a titularidade; marca desfeita_em/desfeita_por.
--
-- RLS: leitura por perfis ativos; escrita direta só master (os demais usam a RPC).
--
-- Executar APÓS 025. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.ac_movimentacoes (
  id                     uuid primary key default gen_random_uuid(),
  atleta_id              uuid not null references public.ac_atletas(id) on delete cascade,
  tipo                   text not null check (tipo in
                           ('VENDA','COMPRA','EMPRESTIMO_SAIDA','EMPRESTIMO_ENTRADA',
                            'RETORNO_EMPRESTIMO','RESCISAO')),
  data_movimentacao      date not null,
  clube_contraparte_id   uuid references public.ac_entidades(id) on delete set null,
  clube_contraparte_nome text,
  valor                  numeric(18,2),
  moeda                  text default 'EUR',
  percentual_direitos    numeric(7,4) check (percentual_direitos is null
                           or (percentual_direitos >= 0 and percentual_direitos <= 100)),
  data_retorno_prevista  date,
  opcao_compra_valor     numeric(18,2),
  contrato_id            uuid references public.ac_contratos(id) on delete set null,
  observacoes            text,
  efeitos                jsonb not null default '{}'::jsonb,
  desfeita_em            timestamptz,
  desfeita_por           uuid,
  created_by             uuid default auth.uid(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

drop trigger if exists trg_ac_movimentacoes_updated on public.ac_movimentacoes;
create trigger trg_ac_movimentacoes_updated before update on public.ac_movimentacoes
  for each row execute function public.ac_set_updated_at();

create index if not exists idx_ac_mov_atleta on public.ac_movimentacoes(atleta_id, data_movimentacao desc);
create index if not exists idx_ac_mov_tipo   on public.ac_movimentacoes(tipo);

comment on table public.ac_movimentacoes is
  'Movimentações do atleta (venda/compra/empréstimo/retorno/rescisão) com os efeitos aplicados (efeitos jsonb). Gravar via RPC registrar_movimentacao.';

alter table public.ac_movimentacoes enable row level security;
drop policy if exists "ac read ac_movimentacoes"    on public.ac_movimentacoes;  -- se a 012 for reaplicada
drop policy if exists "ac write ac_movimentacoes"   on public.ac_movimentacoes;
drop policy if exists "ac leitura ac_movimentacoes" on public.ac_movimentacoes;
drop policy if exists "ac escrita ac_movimentacoes" on public.ac_movimentacoes;
create policy "ac leitura ac_movimentacoes" on public.ac_movimentacoes
  for select to authenticated using (public.get_my_role() is not null);
create policy "ac escrita ac_movimentacoes" on public.ac_movimentacoes
  for all to authenticated
  using (public.has_role('master')) with check (public.has_role('master'));

do $$ begin
  if to_regprocedure('public.ac_audit_attach(text)') is not null then
    perform public.ac_audit_attach('ac_movimentacoes');
  end if;
end $$;

-- ── registrar_movimentacao ──────────────────────────────────────────────────
create or replace function public.registrar_movimentacao(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_atleta uuid;
  v_tipo text;
  v_data date;
  v_pct numeric;
  v_status_ant text;
  v_status_novo text;
  v_cancelar boolean;
  v_contratos jsonb := '[]'::jsonb;
  v_parcelas jsonb := '[]'::jsonb;
  v_imagem jsonb := '[]'::jsonb;
  v_titul jsonb := null;
  v_bfr record;
  v_novo_pct numeric;
  v_titul_id uuid;
  v_contraparte_nome text;
begin
  if not public.has_role('master','juridico','futebol') then
    raise exception 'Sem permissão para registrar movimentação' using errcode = '42501';
  end if;

  v_atleta := nullif(p ->> 'atleta_id', '')::uuid;
  v_tipo   := upper(nullif(p ->> 'tipo', ''));
  v_data   := nullif(p ->> 'data_movimentacao', '')::date;
  v_pct    := nullif(p ->> 'percentual_direitos', '')::numeric;

  if v_atleta is null or v_tipo is null or v_data is null then
    raise exception 'atleta_id, tipo e data_movimentacao são obrigatórios' using errcode = '22023';
  end if;
  if v_tipo not in ('VENDA','COMPRA','EMPRESTIMO_SAIDA','EMPRESTIMO_ENTRADA','RETORNO_EMPRESTIMO','RESCISAO') then
    raise exception 'tipo inválido: %', v_tipo using errcode = '22023';
  end if;

  select status::text into v_status_ant from public.ac_atletas where id = v_atleta for update;
  if not found then
    raise exception 'Atleta % não encontrado', v_atleta using errcode = 'P0002';
  end if;

  v_contraparte_nome := nullif(p ->> 'clube_contraparte_nome', '');
  if v_contraparte_nome is null and nullif(p ->> 'clube_contraparte_id', '') is not null then
    select nome into v_contraparte_nome from public.ac_entidades
     where id = (p ->> 'clube_contraparte_id')::uuid;
  end if;

  -- 1) status do atleta
  v_status_novo := case v_tipo
    when 'VENDA'              then 'VENDIDO'
    when 'RESCISAO'           then 'LIBERADO'
    when 'EMPRESTIMO_SAIDA'   then 'EMPRESTADO'
    else 'ATIVO'
  end;
  update public.ac_atletas set status = v_status_novo::public.ac_atleta_status where id = v_atleta;

  -- 2) encerra vínculo de trabalho (saídas definitivas)
  if v_tipo in ('VENDA','RESCISAO') then
    with alvo as (
      select id, status::text as st, data_fim
        from public.ac_contratos
       where atleta_id = v_atleta
         and status = 'ATIVO'
         and ( subtipo_legado in ('ENTRADA','EMPRESTIMO_ENTRADA')
               or (subtipo_legado is null and tipo = 'TRABALHO') )
       for update
    ), upd as (
      update public.ac_contratos c
         set status   = (case when v_tipo = 'RESCISAO' then 'RESCINDIDO' else 'ENCERRADO' end)::public.ac_contrato_status,
             data_fim = greatest(v_data, c.data_inicio)
        from alvo
       where c.id = alvo.id
      returning c.id, alvo.st, alvo.data_fim
    )
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', id, 'status_anterior', st, 'data_fim_anterior', data_fim)), '[]'::jsonb)
      into v_contratos from upd;
  end if;

  -- 3) cancela salário/imagem futuros
  v_cancelar := v_tipo in ('VENDA','RESCISAO')
             or (v_tipo = 'EMPRESTIMO_SAIDA' and coalesce((p ->> 'cancelar_salario')::boolean, false));
  if v_cancelar then
    with upd as (
      update public.ac_parcelas_fin pf
         set payment_status = 'CANCELADA'
        from public.ac_clausulas_fin cf
       where cf.id = pf.clausula_fin_id
         and pf.atleta_id = v_atleta
         and cf.clause_type in ('SALARIO_CETD','DIREITO_IMAGEM')
         and pf.payment_status in ('PENDENTE','EM_ATRASO')
         and pf.due_date > v_data
      returning pf.id
    )
    select coalesce(jsonb_agg(id), '[]'::jsonb) into v_parcelas from upd;

    with upd as (
      update public.ac_direitos_imagem di
         set status = 'CANCELADA'
       where di.atleta_id = v_atleta
         and di.status in ('PENDENTE','EM_ATRASO')
         and di.month > to_char(v_data, 'YYYY-MM')
      returning di.id
    )
    select coalesce(jsonb_agg(id), '[]'::jsonb) into v_imagem from upd;
  end if;

  -- 4) titularidade econômica do BFR
  if v_pct is not null and v_tipo in ('VENDA','COMPRA') then
    select id, percentage into v_bfr
      from public.ac_titularidade_economica
     where atleta_id = v_atleta and holder_type = 'BFR'
     order by created_at
     limit 1
     for update;
    if found then
      v_novo_pct := case when v_tipo = 'VENDA' then greatest(0, v_bfr.percentage - v_pct)
                         else least(100, v_bfr.percentage + v_pct) end;
      update public.ac_titularidade_economica set percentage = v_novo_pct where id = v_bfr.id;
      v_titul := jsonb_build_object('id', v_bfr.id, 'percentual_anterior', v_bfr.percentage,
                                    'percentual_novo', v_novo_pct, 'inserida', false);
    elsif v_tipo = 'COMPRA' then
      insert into public.ac_titularidade_economica (atleta_id, holder_type, holder_name, percentage, notes)
      values (v_atleta, 'BFR', 'Botafogo SAF', least(100, v_pct), 'Criada por registrar_movimentacao')
      returning id into v_titul_id;
      v_titul := jsonb_build_object('id', v_titul_id, 'percentual_anterior', null,
                                    'percentual_novo', least(100, v_pct), 'inserida', true);
    end if;
  end if;

  -- 5) registro
  insert into public.ac_movimentacoes (
    atleta_id, tipo, data_movimentacao, clube_contraparte_id, clube_contraparte_nome,
    valor, moeda, percentual_direitos, data_retorno_prevista, opcao_compra_valor,
    contrato_id, observacoes, efeitos
  ) values (
    v_atleta, v_tipo, v_data,
    nullif(p ->> 'clube_contraparte_id', '')::uuid,
    v_contraparte_nome,
    nullif(p ->> 'valor', '')::numeric,
    coalesce(nullif(p ->> 'moeda', ''), 'EUR'),
    v_pct,
    nullif(p ->> 'data_retorno_prevista', '')::date,
    nullif(p ->> 'opcao_compra_valor', '')::numeric,
    nullif(p ->> 'contrato_id', '')::uuid,
    nullif(p ->> 'observacoes', ''),
    jsonb_build_object(
      'status_anterior', v_status_ant,
      'status_novo', v_status_novo,
      'contratos_encerrados', v_contratos,
      'parcelas_canceladas', v_parcelas,
      'direitos_imagem_cancelados', v_imagem,
      'titularidade', v_titul
    )
  ) returning id into v_id;

  return v_id;
end $$;

-- ── desfazer_movimentacao ───────────────────────────────────────────────────
create or replace function public.desfazer_movimentacao(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_m public.ac_movimentacoes;
  e jsonb;
  c jsonb;
  v_restauradas int := 0;
  v_img int := 0;
begin
  if not public.has_role('master') then
    raise exception 'Somente master pode desfazer movimentações' using errcode = '42501';
  end if;

  select * into v_m from public.ac_movimentacoes where id = p_id for update;
  if not found then
    raise exception 'Movimentação % não encontrada', p_id using errcode = 'P0002';
  end if;
  if v_m.desfeita_em is not null then
    raise exception 'Movimentação já desfeita em %', v_m.desfeita_em using errcode = '22023';
  end if;
  if exists (select 1 from public.ac_movimentacoes x
              where x.atleta_id = v_m.atleta_id and x.desfeita_em is null and x.id <> v_m.id
                and (x.data_movimentacao, x.created_at) > (v_m.data_movimentacao, v_m.created_at)) then
    raise exception 'Desfaça antes as movimentações posteriores deste atleta' using errcode = '22023';
  end if;

  e := v_m.efeitos;

  if e ? 'status_anterior' and e ->> 'status_anterior' is not null then
    update public.ac_atletas set status = (e ->> 'status_anterior')::public.ac_atleta_status
     where id = v_m.atleta_id;
  end if;

  for c in select * from jsonb_array_elements(coalesce(e -> 'contratos_encerrados', '[]'::jsonb)) loop
    update public.ac_contratos
       set status   = (c ->> 'status_anterior')::public.ac_contrato_status,
           data_fim = nullif(c ->> 'data_fim_anterior', '')::date
     where id = (c ->> 'id')::uuid;
  end loop;

  update public.ac_parcelas_fin
     set payment_status = case when due_date < current_date then 'EM_ATRASO' else 'PENDENTE' end
   where id in (select (x #>> '{}')::uuid from jsonb_array_elements(coalesce(e -> 'parcelas_canceladas', '[]'::jsonb)) x)
     and payment_status = 'CANCELADA';
  get diagnostics v_restauradas = row_count;

  update public.ac_direitos_imagem
     set status = 'PENDENTE'
   where id in (select (x #>> '{}')::uuid from jsonb_array_elements(coalesce(e -> 'direitos_imagem_cancelados', '[]'::jsonb)) x)
     and status = 'CANCELADA';
  get diagnostics v_img = row_count;

  if jsonb_typeof(e -> 'titularidade') = 'object' then
    if (e -> 'titularidade' ->> 'inserida')::boolean then
      delete from public.ac_titularidade_economica where id = (e -> 'titularidade' ->> 'id')::uuid;
    else
      update public.ac_titularidade_economica
         set percentage = (e -> 'titularidade' ->> 'percentual_anterior')::numeric
       where id = (e -> 'titularidade' ->> 'id')::uuid;
    end if;
  end if;

  update public.ac_movimentacoes
     set desfeita_em = now(), desfeita_por = auth.uid()
   where id = p_id;

  return jsonb_build_object('id', p_id, 'parcelas_restauradas', v_restauradas,
                            'direitos_imagem_restaurados', v_img);
end $$;

-- FIM 026

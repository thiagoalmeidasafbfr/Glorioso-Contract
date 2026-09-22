-- ════════════════════════════════════════════════════════════════════════════
-- 020 — Papéis setoriais + RLS por papel
-- ════════════════════════════════════════════════════════════════════════════
-- O sistema deixa de ser uma ferramenta só do Jurídico e passa a ser um hub
-- multissetorial. Esta migration:
--
--   1. Amplia os papéis aceitos em profiles.role:
--        master, juridico, tesouraria, controladoria, assessor, futebol, rh, diretoria
--   2. Cria o helper public.has_role(variadic text[]) → boolean, baseado em
--      get_my_role() (que, desde a 019, devolve NULL para perfil inativo).
--   3. Recria o RLS de TODAS as tabelas ac_* usadas pelo app (ponte 014) e das
--      tabelas do núcleo 012, além de ac_premissas_atleta:
--        • LEITURA : qualquer perfil ATIVO (get_my_role() is not null) — antes
--                    era qualquer `authenticated`, inclusive perfis desativados.
--        • ESCRITA : matriz por tabela (abaixo).
--
--   Matriz de escrita
--   ─────────────────────────────────────────────────────────────────────────
--   ac_atletas, ac_entidades (+ extensões), ac_contratos, ac_clausulas_fin,
--   ac_titularidade_economica, ac_passivos_clube, ac_passivos_agente,
--   ac_direitos_imagem, ac_gatilhos_salario, ac_alertas, núcleo 012 ..... master, juridico
--   ac_parcelas_fin ................................ master, juridico (tudo)
--                                                    tesouraria (somente UPDATE e
--                                                    somente colunas de pagamento —
--                                                    ver trigger ac_parcelas_fin_guard_tesouraria)
--   ac_premissas_atleta ............................ master, assessor, controladoria
--   Tabelas novas (021+) definem as próprias policies em suas migrations.
--
--   Nomes das policies: "ac leitura <tabela>" e "ac escrita <tabela>"
--   (+ "ac tesouraria <tabela>" em ac_parcelas_fin). As antigas "ac read %" /
--   "ac write %" (012/014) e ac_premissas_atleta_select/_write (018) são removidas.
--
--   ac_documentos e ac_taxas_cambio NÃO entram aqui: suas policies são
--   definidas em 024 e 028, respectivamente.
--
-- Executar APÓS 019. Idempotente e defensiva (tabelas ausentes são ignoradas).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Papéis aceitos ────────────────────────────────────────────────────────
do $$
declare c record;
begin
  if to_regclass('public.profiles') is null then
    raise notice '020: public.profiles não existe — papéis não ampliados';
    return;
  end if;
  -- remove qualquer check existente sobre a coluna role (nome gerado pelo PG)
  for c in
    select con.conname
      from pg_constraint con
      join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any(con.conkey)
     where con.conrelid = 'public.profiles'::regclass
       and con.contype = 'c'
       and att.attname = 'role'
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
  alter table public.profiles add constraint profiles_role_check
    check (role in ('master','juridico','tesouraria','controladoria',
                    'assessor','futebol','rh','diretoria'));
end $$;

-- ── 2. get_my_role (garantia) + has_role ────────────────────────────────────
-- get_my_role() é recriada com a semântica da 019 (NULL quando inativo), caso a
-- 019 ainda não tenha sido aplicada neste banco.
do $$
begin
  if to_regclass('public.profiles') is not null then
    execute $f$
      create or replace function public.get_my_role()
      returns text language sql stable security definer set search_path = public as $b$
        select role from public.profiles where id = auth.uid() and ativo
      $b$
    $f$;
  end if;
end $$;

create or replace function public.has_role(variadic roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.get_my_role() = any(roles), false)
$$;

comment on function public.has_role(text[]) is
  'true quando o perfil logado está ATIVO e seu papel está na lista. Ex.: has_role(''master'',''juridico'').';

-- ── 3. RLS por papel ────────────────────────────────────────────────────────
do $$
declare
  t text;
  w text[];
  wlist text;
  -- tabela → papéis com escrita total
  matriz jsonb := jsonb_build_object(
    -- ponte 014 (usada pelo app)
    'ac_atletas',                '["master","juridico"]',
    'ac_entidades',              '["master","juridico"]',
    'ac_entidades_pj_imagem',    '["master","juridico"]',
    'ac_contratos',              '["master","juridico"]',
    'ac_clausulas_fin',          '["master","juridico"]',
    'ac_parcelas_fin',           '["master","juridico"]',
    'ac_titularidade_economica', '["master","juridico"]',
    'ac_passivos_clube',         '["master","juridico"]',
    'ac_passivos_agente',        '["master","juridico"]',
    'ac_direitos_imagem',        '["master","juridico"]',
    'ac_gatilhos_salario',       '["master","juridico"]',
    'ac_alertas',                '["master","juridico"]',
    -- núcleo 012 (não usado pelo app hoje; mantém master/juridico)
    'ac_moedas',                 '["master","juridico"]',
    'ac_indices_correcao_valores','["master","juridico"]',
    'ac_contas_contabeis',       '["master","juridico"]',
    'ac_centros_custo',          '["master","juridico"]',
    'ac_entidades_clube',        '["master","juridico"]',
    'ac_entidades_agente',       '["master","juridico"]',
    'ac_entidades_fundo',        '["master","juridico"]',
    'ac_atleta_nacionalidades',  '["master","juridico"]',
    'ac_aditivos',               '["master","juridico"]',
    'ac_transferencias',         '["master","juridico"]',
    'ac_remuneracoes',           '["master","juridico"]',
    'ac_ativos_intangiveis',     '["master","juridico"]',
    'ac_obrigacoes_financeiras', '["master","juridico"]',
    'ac_parcelas',               '["master","juridico"]',
    'ac_clausulas',              '["master","juridico"]',
    'ac_clausula_condicoes',     '["master","juridico"]',
    'ac_clausula_efeitos',       '["master","juridico"]',
    'ac_clausula_avaliacoes',    '["master","juridico"]',
    'ac_eventos_desempenho',     '["master","juridico"]',
    'ac_amortizacoes',           '["master","juridico"]',
    -- premissas (018)
    'ac_premissas_atleta',       '["master","assessor","controladoria"]'
  );
begin
  for t in select jsonb_object_keys(matriz) loop
    if to_regclass('public.' || t) is null then
      raise notice '020: tabela % ausente — RLS ignorado', t;
      continue;
    end if;

    select array_agg(x) into w from jsonb_array_elements_text((matriz ->> t)::jsonb) x;  -- valores são texto JSON
    select string_agg(quote_literal(x), ',') into wlist from unnest(w) x;

    execute format('alter table public.%I enable row level security', t);

    -- policies antigas (012/014/018)
    execute format('drop policy if exists %I on public.%I', 'ac read ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'ac write ' || t, t);
    if t = 'ac_premissas_atleta' then
      execute 'drop policy if exists ac_premissas_atleta_select on public.ac_premissas_atleta';
      execute 'drop policy if exists ac_premissas_atleta_write on public.ac_premissas_atleta';
    end if;

    -- policies novas (idempotente)
    execute format('drop policy if exists %I on public.%I', 'ac leitura ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'ac escrita ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'ac tesouraria ' || t, t);

    execute format(
      'create policy %I on public.%I for select to authenticated using (public.get_my_role() is not null)',
      'ac leitura ' || t, t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (public.has_role(%s)) with check (public.has_role(%s))',
      'ac escrita ' || t, t, wlist, wlist);
  end loop;

  -- Tesouraria: apenas UPDATE em ac_parcelas_fin (baixa/estorno de pagamento).
  if to_regclass('public.ac_parcelas_fin') is not null then
    execute $p$
      create policy "ac tesouraria ac_parcelas_fin" on public.ac_parcelas_fin
        for update to authenticated
        using (public.has_role('tesouraria'))
        with check (public.has_role('tesouraria'))
    $p$;
  end if;
end $$;

-- ── 4. Tesouraria só altera colunas de pagamento em ac_parcelas_fin ─────────
-- Colunas liberadas: payment_status, payment_date, amount_paid_brl,
-- exchange_rate, notes, updated_at (+ colunas de baixa criadas na 023 e as de
-- auditoria da 021). Qualquer outra alteração por um perfil 'tesouraria' falha.
create or replace function public.ac_parcelas_fin_guard_tesouraria()
returns trigger language plpgsql as $$
begin
  if public.get_my_role() = 'tesouraria' and (
       new.clausula_fin_id    is distinct from old.clausula_fin_id
    or new.atleta_id          is distinct from old.atleta_id
    or new.installment_number is distinct from old.installment_number
    or new.due_date           is distinct from old.due_date
    or new.original_value     is distinct from old.original_value
    or new.currency           is distinct from old.currency
  ) then
    raise exception 'Tesouraria só pode registrar/estornar pagamentos (colunas de pagamento)'
      using errcode = '42501';
  end if;
  return new;
end $$;

do $$
begin
  if to_regclass('public.ac_parcelas_fin') is not null then
    drop trigger if exists trg_ac_parcelas_fin_guard_tesouraria on public.ac_parcelas_fin;
    create trigger trg_ac_parcelas_fin_guard_tesouraria
      before update on public.ac_parcelas_fin
      for each row execute function public.ac_parcelas_fin_guard_tesouraria();
  end if;
end $$;

-- ── 5. Sincronização de status da cláusula roda como definer ────────────────
-- O trigger da 014 (ac_sync_clausula_fin_status) atualiza ac_clausulas_fin
-- quando uma parcela muda. Sem SECURITY DEFINER, um perfil 'tesouraria' (que
-- não escreve em ac_clausulas_fin) faria o UPDATE ser filtrado silenciosamente
-- pelo RLS e o status da cláusula ficaria defasado. Mesmo corpo da 014.
do $$
begin
  if to_regclass('public.ac_clausulas_fin') is not null then
    execute $f$
      create or replace function public.ac_sync_clausula_fin_status()
      returns trigger language plpgsql security definer set search_path = public as $b$
      declare
        v_ref uuid := coalesce(new.clausula_fin_id, old.clausula_fin_id);
        v_total int; v_paga int; v_atraso int; v_new text;
      begin
        select count(*), count(*) filter (where payment_status='PAGA'),
               count(*) filter (where payment_status='EM_ATRASO')
          into v_total, v_paga, v_atraso
          from public.ac_parcelas_fin where clausula_fin_id = v_ref;
        if v_total = 0 then v_new := 'PENDENTE';
        elsif v_paga = v_total then v_new := 'PAGA';
        elsif v_paga > 0 then v_new := 'PARCIALMENTE_PAGA';
        elsif v_atraso > 0 then v_new := 'EM_ATRASO';
        else v_new := 'PENDENTE';
        end if;
        update public.ac_clausulas_fin
           set payment_status = v_new, installments_paid = v_paga, updated_at = now()
         where id = v_ref;
        return coalesce(new, old);
      end $b$
    $f$;
  end if;
end $$;

-- FIM 020

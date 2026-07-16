-- ════════════════════════════════════════════════════════════════════════════
-- 013 — SEED do caso de aceitação "JOÃO" (prova de cobertura do schema 012)
-- ════════════════════════════════════════════════════════════════════════════
-- Modela integralmente os 6 blocos do enunciado:
--   1. Compra do Barcelona por €10M em 5 parcelas anuais de €2M.
--   2. Comissão ao agente: 10 parcelas bimestrais de 100k (capitalizável).
--   3. Solidariedade a 3 clubes formadores (capitalizável).
--   4. Contrato de 3 anos: salário 600k/mês + 600k imagem (via PJ do atleta).
--   5. Gatilho relativo ao clube: 10 jogos no Botafogo → pagar 500k ao Barcelona
--      (obrigação CONTINGENTE; ainda não atingido — só 8 jogos).
--   6. Gatilho próprio: 30 gols → salário 700k CLT + 700k imagem
--      (ATINGIDO em 01/11/2026 → remuneração versionada: fecha 600k, abre 700k).
--
-- Idempotente: remove um João anterior deste seed antes de inserir.
-- Executar APÓS 012.
-- ════════════════════════════════════════════════════════════════════════════

-- Limpeza idempotente do seed anterior. A cascata a partir do atleta remove
-- contratos/obrigações/parcelas/cláusulas/remunerações/eventos/intangível. As
-- linhas de dimensão criadas por ESTE seed (entidades, contas, centro) são
-- removidas em seguida, pois não têm dono via cascata.
delete from public.ac_atletas where cpf = '111.111.111-11';
delete from public.ac_entidades where nome in
  ('Botafogo SAF','FC Barcelona','Agência Estrela Ltda.',
   'Clube Formador A','Clube Formador B','Clube Formador C',
   'João Santos Imagem Ltda.');
delete from public.ac_contas_contabeis where codigo in ('1.2.3.01','4.1.5.02');
delete from public.ac_centros_custo   where codigo in ('FUT-PRO');

do $$
declare
  -- Entidades
  v_botafogo  uuid; v_barcelona uuid; v_agente uuid;
  v_form1 uuid; v_form2 uuid; v_form3 uuid; v_pj uuid;
  -- Núcleo
  v_joao uuid;
  -- Contratos
  v_c_aquis uuid; v_c_trab uuid; v_c_imag uuid;
  -- Transferência / intangível
  v_transf uuid; v_ativo uuid;
  -- Obrigações
  v_o_transf uuid; v_o_comissao uuid; v_o_gatilho uuid;
  -- Cláusulas
  v_cl_jogos uuid; v_cl_gols uuid;
  v_ef_jogos uuid; v_ef_gols_sal uuid; v_ef_gols_img uuid;
  -- Remuneração versionada (novos registros após o gatilho de gols)
  v_rem_sal_novo uuid;
  -- Contábil
  v_conta_dir uuid; v_conta_inter uuid; v_cc uuid;
  -- Datas
  v_inicio date := date '2026-01-01';           -- início do contrato de trabalho
  v_fim    date := date '2029-01-01';           -- +36 meses
  v_data_transf date := date '2026-01-15';
  v_atingido_gols date := date '2026-11-01';    -- data do atingimento dos 30 gols
  v_ptax numeric(18,6) := 6.10;                 -- EUR→BRL na aquisição
begin
  ------------------------------------------------------------------------------
  -- Contábil (conta SAP + centro de custo)
  ------------------------------------------------------------------------------
  insert into public.ac_contas_contabeis (codigo, descricao)
    values ('1.2.3.01','Direitos econômicos - atletas') returning id into v_conta_dir;
  insert into public.ac_contas_contabeis (codigo, descricao)
    values ('4.1.5.02','Intermediação sobre aquisição') returning id into v_conta_inter;
  insert into public.ac_centros_custo (codigo, descricao)
    values ('FUT-PRO','Futebol profissional') returning id into v_cc;

  -- PTAX de referência
  insert into public.ac_taxas_cambio (moeda_codigo, data, ptax_compra, ptax_venda)
    values ('EUR', v_data_transf, v_ptax, v_ptax) on conflict do nothing;

  ------------------------------------------------------------------------------
  -- Entidades (contrapartes unificadas)
  ------------------------------------------------------------------------------
  insert into public.ac_entidades (tipo, nome, pais) values
    ('CLUBE_PROPRIO','Botafogo SAF','Brasil') returning id into v_botafogo;
  insert into public.ac_entidades_clube (entidade_id, is_proprio) values (v_botafogo, true);

  insert into public.ac_entidades (tipo, nome, pais) values
    ('CLUBE','FC Barcelona','Espanha') returning id into v_barcelona;
  insert into public.ac_entidades_clube (entidade_id, is_proprio) values (v_barcelona, false);

  insert into public.ac_entidades (tipo, nome, pais) values
    ('AGENTE','Agência Estrela Ltda.','Brasil') returning id into v_agente;
  insert into public.ac_entidades_agente (entidade_id, licenca_fifa) values (v_agente, 'FIFA-BR-0091');

  insert into public.ac_entidades (tipo, nome, pais) values
    ('CLUBE','Clube Formador A','Brasil') returning id into v_form1;
  insert into public.ac_entidades (tipo, nome, pais) values
    ('CLUBE','Clube Formador B','Brasil') returning id into v_form2;
  insert into public.ac_entidades (tipo, nome, pais) values
    ('CLUBE','Clube Formador C','Brasil') returning id into v_form3;

  ------------------------------------------------------------------------------
  -- Bloco 0 — Atleta central
  ------------------------------------------------------------------------------
  insert into public.ac_atletas
    (nome, nome_completo, apelido, data_nascimento, cpf, posicao, pe_preferido,
     registro_bid_cbf, fifa_id, status, entidade_clube_atual_id)
  values
    ('João','João da Silva Santos','João', date '2001-03-10','111.111.111-11',
     'Atacante','DIREITO','BID-2026-0001','FIFA-1000001','ATIVO', v_botafogo)
  returning id into v_joao;

  insert into public.ac_atleta_nacionalidades (atleta_id, nacionalidade, principal)
    values (v_joao, 'Brasileira', true);

  -- PJ de imagem do próprio João
  insert into public.ac_entidades (tipo, nome, pais) values
    ('PJ_IMAGEM','João Santos Imagem Ltda.','Brasil') returning id into v_pj;
  insert into public.ac_entidades_pj_imagem (entidade_id, atleta_id, cnpj, socios)
    values (v_pj, v_joao, '11.111.111/0001-11','João da Silva Santos (100%)');

  ------------------------------------------------------------------------------
  -- Bloco 1 — Compra do Barcelona por €10M em 5 parcelas anuais de €2M
  ------------------------------------------------------------------------------
  insert into public.ac_contratos (atleta_id, tipo, entidade_contraparte_id, data_inicio, data_fim, status, descricao)
    values (v_joao,'AQUISICAO', v_barcelona, v_data_transf, v_fim,'ATIVO','Aquisição definitiva junto ao FC Barcelona')
    returning id into v_c_aquis;

  insert into public.ac_transferencias
    (atleta_id, contrato_id, tipo, entidade_origem_id, entidade_destino_id, valor, moeda_codigo, data)
    values (v_joao, v_c_aquis,'ENTRADA_DEFINITIVA', v_barcelona, v_botafogo, 10000000, 'EUR', v_data_transf)
    returning id into v_transf;

  -- Ativo intangível: base €10M; vida útil = 36 meses (contrato).
  -- custo_adicional_acumulado = comissão (€1,000,000) + solidariedade (€500,000).
  insert into public.ac_ativos_intangiveis
    (atleta_id, transferencia_id, custo_base, moeda_codigo, custo_base_brl,
     custo_adicional_acumulado, data_inicio, vida_util_meses)
    values (v_joao, v_transf, 10000000, 'EUR', 10000000 * v_ptax,
            1500000, v_inicio, 36)
    returning id into v_ativo;

  -- Obrigação de transferência (a pagar, capitalizável, Direitos Econômicos).
  insert into public.ac_obrigacoes_financeiras
    (atleta_id, contrato_id, transferencia_id, contraparte_entidade_id, direcao, natureza,
     descricao, valor_total, moeda_codigo, contingente, tratamento_contabil, rubrica,
     conta_contabil_id, centro_custo_id, ativo_intangivel_id, data_competencia)
    values (v_joao, v_c_aquis, v_transf, v_barcelona,'A_PAGAR','TRANSFERENCIA',
            'Transferência João — 5 parcelas anuais', 10000000,'EUR', false,'CAPITALIZAR','DIREITOS_ECONOMICOS',
            v_conta_dir, v_cc, v_ativo, v_data_transf)
    returning id into v_o_transf;

  -- 5 parcelas anuais de €2M
  insert into public.ac_parcelas (obrigacao_id, numero, valor, moeda_codigo, data_vencimento)
    select v_o_transf, g, 2000000, 'EUR', (v_data_transf + ((g-1) * interval '1 year'))::date
    from generate_series(1,5) g;

  ------------------------------------------------------------------------------
  -- Bloco 2 — Comissão ao agente: 10 parcelas bimestrais de 100k (capitalizável)
  ------------------------------------------------------------------------------
  insert into public.ac_obrigacoes_financeiras
    (atleta_id, contrato_id, contraparte_entidade_id, direcao, natureza, descricao,
     valor_total, moeda_codigo, tratamento_contabil, rubrica, conta_contabil_id,
     centro_custo_id, ativo_intangivel_id, data_competencia)
    values (v_joao, v_c_aquis, v_agente,'A_PAGAR','INTERMEDIACAO',
            'Comissão de intermediação na aquisição', 1000000,'EUR','CAPITALIZAR','INTERMEDIACAO',
            v_conta_inter, v_cc, v_ativo, v_data_transf)
    returning id into v_o_comissao;

  insert into public.ac_parcelas (obrigacao_id, numero, valor, moeda_codigo, data_vencimento)
    select v_o_comissao, g, 100000, 'EUR', (date '2026-02-01' + ((g-1) * interval '2 months'))::date
    from generate_series(1,10) g;

  ------------------------------------------------------------------------------
  -- Bloco 3 — Solidariedade (FIFA RSTP) a 3 clubes formadores (capitalizável)
  ------------------------------------------------------------------------------
  -- Pool de 5% sobre €10M = €500k, distribuído 2% / 1,5% / 1,5%.
  insert into public.ac_obrigacoes_financeiras
    (atleta_id, contrato_id, transferencia_id, contraparte_entidade_id, direcao, natureza,
     descricao, valor_total, moeda_codigo, tratamento_contabil, rubrica, conta_contabil_id,
     centro_custo_id, ativo_intangivel_id, data_competencia)
  values
    (v_joao, v_c_aquis, v_transf, v_form1,'A_PAGAR','SOLIDARIEDADE','Solidariedade FIFA 2,0%',200000,'EUR','CAPITALIZAR','SOLIDARIEDADE', v_conta_dir, v_cc, v_ativo, v_data_transf),
    (v_joao, v_c_aquis, v_transf, v_form2,'A_PAGAR','SOLIDARIEDADE','Solidariedade FIFA 1,5%',150000,'EUR','CAPITALIZAR','SOLIDARIEDADE', v_conta_dir, v_cc, v_ativo, v_data_transf),
    (v_joao, v_c_aquis, v_transf, v_form3,'A_PAGAR','SOLIDARIEDADE','Solidariedade FIFA 1,5%',150000,'EUR','CAPITALIZAR','SOLIDARIEDADE', v_conta_dir, v_cc, v_ativo, v_data_transf);

  -- Uma parcela única por clube (vencimento na data da transferência).
  insert into public.ac_parcelas (obrigacao_id, numero, valor, moeda_codigo, data_vencimento)
    select o.id, 1, o.valor_total, 'EUR', v_data_transf
    from public.ac_obrigacoes_financeiras o
    where o.atleta_id = v_joao and o.natureza = 'SOLIDARIEDADE';

  ------------------------------------------------------------------------------
  -- Bloco 4 — Contrato de trabalho + imagem (3 anos); remuneração versionada
  ------------------------------------------------------------------------------
  insert into public.ac_contratos (atleta_id, tipo, entidade_contraparte_id, data_inicio, data_fim, status, descricao)
    values (v_joao,'TRABALHO', v_botafogo, v_inicio, v_fim,'ATIVO','Contrato de trabalho CLT/SAF — 3 anos')
    returning id into v_c_trab;
  insert into public.ac_contratos (atleta_id, tipo, entidade_contraparte_id, data_inicio, data_fim, status, descricao)
    values (v_joao,'IMAGEM', v_pj, v_inicio, v_fim,'ATIVO','Contrato de direito de imagem via PJ')
    returning id into v_c_imag;

  -- Remuneração inicial (vigência aberta até serem substituídas pelo gatilho).
  insert into public.ac_remuneracoes
    (atleta_id, contrato_id, componente, entidade_recebedora_id, valor, moeda_codigo, vigencia_inicio, vigencia_fim)
  values
    (v_joao, v_c_trab,'SALARIO_CLT', v_botafogo, 600000,'BRL', v_inicio, null),
    (v_joao, v_c_imag,'IMAGEM',      v_pj,       600000,'BRL', v_inicio, null);

  ------------------------------------------------------------------------------
  -- Bloco 5 — Gatilho relativo ao clube: 10 jogos no Botafogo → 500k ao Barcelona
  --           (CONTINGENTE; só 8 jogos até aqui → avaliação PENDENTE)
  ------------------------------------------------------------------------------
  insert into public.ac_clausulas
    (atleta_id, contrato_id, transferencia_id, tipo, descricao, contraparte_entidade_id)
    values (v_joao, v_c_aquis, v_transf,'GATILHO_ESPORTIVO',
            'Ao atingir 10 jogos pelo Botafogo, pagar €500k ao FC Barcelona', v_barcelona)
    returning id into v_cl_jogos;

  insert into public.ac_clausula_condicoes
    (clausula_id, metrica, operador, valor_limite, janela, escopo, entidade_clube_id)
    values (v_cl_jogos,'JOGOS','MAIOR_IGUAL',10,'CONTRATO','RELATIVO_AO_CLUBE', v_botafogo);

  insert into public.ac_clausula_efeitos
    (clausula_id, tipo, beneficiario_entidade_id, natureza, valor, moeda_codigo, tratamento_contabil, rubrica)
    values (v_cl_jogos,'GERAR_OBRIGACAO', v_barcelona,'GATILHO',500000,'EUR','CAPITALIZAR','DIREITOS_ECONOMICOS')
    returning id into v_ef_jogos;

  -- Obrigação contingente já cadastrada (firme só quando o gatilho disparar).
  insert into public.ac_obrigacoes_financeiras
    (atleta_id, contrato_id, transferencia_id, clausula_id, clausula_efeito_id, contraparte_entidade_id,
     direcao, natureza, descricao, valor_total, moeda_codigo, contingente, tratamento_contabil, rubrica,
     conta_contabil_id, centro_custo_id, ativo_intangivel_id)
    values (v_joao, v_c_aquis, v_transf, v_cl_jogos, v_ef_jogos, v_barcelona,
            'A_PAGAR','GATILHO','Bônus por 10 jogos (contingente)',500000,'EUR', true,'CAPITALIZAR','DIREITOS_ECONOMICOS',
            v_conta_dir, v_cc, v_ativo)
    returning id into v_o_gatilho;
  insert into public.ac_parcelas (obrigacao_id, numero, valor, moeda_codigo, data_vencimento)
    values (v_o_gatilho, 1, 500000,'EUR', v_fim);

  insert into public.ac_clausula_avaliacoes (clausula_id, atleta_id, status, valor_apurado, observacoes)
    values (v_cl_jogos, v_joao,'PENDENTE', 8,'8 de 10 jogos — aguardando atingimento');

  ------------------------------------------------------------------------------
  -- Bloco 6 — Gatilho próprio: 30 gols → salário 700k CLT + 700k imagem (ATINGIDO)
  ------------------------------------------------------------------------------
  insert into public.ac_clausulas (atleta_id, contrato_id, tipo, descricao)
    values (v_joao, v_c_trab,'GATILHO_ESPORTIVO','Ao atingir 30 gols, salário e imagem passam a 700k')
    returning id into v_cl_gols;

  insert into public.ac_clausula_condicoes (clausula_id, metrica, operador, valor_limite, janela, escopo)
    values (v_cl_gols,'GOLS','MAIOR_IGUAL',30,'CONTRATO','PROPRIO_ATLETA');

  insert into public.ac_clausula_efeitos (clausula_id, tipo, componente_remuneracao, novo_valor, moeda_codigo)
    values (v_cl_gols,'ALTERAR_REMUNERACAO','SALARIO_CLT',700000,'BRL') returning id into v_ef_gols_sal;
  insert into public.ac_clausula_efeitos (clausula_id, tipo, componente_remuneracao, novo_valor, moeda_codigo)
    values (v_cl_gols,'ALTERAR_REMUNERACAO','IMAGEM',700000,'BRL') returning id into v_ef_gols_img;

  -- Aplicação do gatilho: fecha os registros de 600k e abre 700k a partir do atingimento.
  update public.ac_remuneracoes
    set vigencia_fim = (v_atingido_gols - 1)
    where atleta_id = v_joao and componente = 'SALARIO_CLT' and vigencia_fim is null;
  update public.ac_remuneracoes
    set vigencia_fim = (v_atingido_gols - 1)
    where atleta_id = v_joao and componente = 'IMAGEM' and vigencia_fim is null;

  insert into public.ac_remuneracoes
    (atleta_id, contrato_id, componente, entidade_recebedora_id, valor, moeda_codigo, vigencia_inicio, vigencia_fim, origem_efeito_id)
    values (v_joao, v_c_trab,'SALARIO_CLT', v_botafogo, 700000,'BRL', v_atingido_gols, v_fim, v_ef_gols_sal)
    returning id into v_rem_sal_novo;
  insert into public.ac_remuneracoes
    (atleta_id, contrato_id, componente, entidade_recebedora_id, valor, moeda_codigo, vigencia_inicio, vigencia_fim, origem_efeito_id)
    values (v_joao, v_c_imag,'IMAGEM', v_pj, 700000,'BRL', v_atingido_gols, v_fim, v_ef_gols_img);

  insert into public.ac_clausula_avaliacoes
    (clausula_id, atleta_id, status, data_atingimento, valor_apurado, remuneracao_gerada_id, observacoes)
    values (v_cl_gols, v_joao,'APLICADA', v_atingido_gols, 31, v_rem_sal_novo,'30 gols atingidos → remuneração versionada');

  ------------------------------------------------------------------------------
  -- Eventos de desempenho (insumo dos gatilhos): 8 jogos, 31 gols no Botafogo/2026
  ------------------------------------------------------------------------------
  insert into public.ac_eventos_desempenho
    (atleta_id, entidade_clube_id, temporada, competicao, data_referencia, jogos, gols, assistencias, minutos, titulos)
    values (v_joao, v_botafogo,'2026','Brasileirão Série A', v_atingido_gols, 8, 31, 5, 700, 0);

  ------------------------------------------------------------------------------
  -- Amortização linear do intangível (36 meses sobre o custo base em BRL)
  ------------------------------------------------------------------------------
  insert into public.ac_amortizacoes (ativo_intangivel_id, competencia, valor, acumulado)
    select v_ativo,
           (v_inicio + ((g-1) * interval '1 month'))::date,
           round((10000000 * v_ptax) / 36.0, 2),
           round((10000000 * v_ptax) / 36.0 * g, 2)
    from generate_series(1,36) g;

  raise notice 'Seed JOÃO criado. atleta_id = %', v_joao;
end $$;

-- FIM 013

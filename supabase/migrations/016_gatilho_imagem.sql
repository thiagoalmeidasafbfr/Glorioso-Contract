-- 016_gatilho_imagem.sql
-- Gatilhos de mudança salarial passam a definir também um novo valor de
-- DIREITO DE IMAGEM (além do novo salário CLT). Ex.: "ao atingir 5 gols, salário
-- passa a 600k CLT e 600k imagem". Ao marcar o gatilho como ATINGIDA numa data,
-- o fluxo mensal de salário E de imagem é regenerado a partir daquela competência
-- com os novos valores (parcelas já pagas são preservadas).
--
-- new_image_value é opcional: NULL significa "imagem inalterada" — o gatilho só
-- muda o salário CLT.

alter table public.ac_gatilhos_salario
  add column if not exists new_image_value numeric(18,2);

-- Espelha na tabela legada (schema inicial de atletas), caso exista.
alter table if exists public.salary_triggers
  add column if not exists new_image_value numeric(18,2);

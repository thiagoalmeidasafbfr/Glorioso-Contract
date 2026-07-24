-- ════════════════════════════════════════════════════════════════════════════
-- 016 — Gatilho de salário também pode mudar o Direito de Imagem
-- ════════════════════════════════════════════════════════════════════════════
-- Ex.: "ao atingir 30 gols, salário CLT passa a 600k E imagem passa a 600k".
-- new_salary já existia (CLT); new_image guarda o novo valor de imagem (opcional).
-- Executar APÓS 014.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.ac_gatilhos_salario
  add column if not exists new_image numeric(18,2);

comment on column public.ac_gatilhos_salario.new_image is
  'Novo valor de Direito de Imagem quando o gatilho é atingido (opcional; NULL = imagem não muda).';

-- FIM 016

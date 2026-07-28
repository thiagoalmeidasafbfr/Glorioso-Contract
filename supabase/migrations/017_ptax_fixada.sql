-- ════════════════════════════════════════════════════════════════════════════
-- 017 — PTAX fixada em cláusulas e parcelas
-- ════════════════════════════════════════════════════════════════════════════
-- Contratos em moeda estrangeira podem ter a PTAX FIXADA no momento da
-- assinatura para evitar distorções cambiais na apresentação do BRL. Quando
-- preenchida, a conversão para BRL usa essa taxa; quando NULL, a ferramenta
-- usa a PTAX do dia (Bacen).
--
-- `exchange_rate` já existia, mas representa a taxa DO PAGAMENTO efetuado —
-- então adicionamos uma coluna nova, sem sobrescrever aquela semântica.
--
-- Executar APÓS 016.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.ac_clausulas_fin
  add column if not exists fixed_exchange_rate numeric(18,6);

alter table public.ac_parcelas_fin
  add column if not exists fixed_exchange_rate numeric(18,6);

comment on column public.ac_clausulas_fin.fixed_exchange_rate is
  'PTAX fixada no contrato (moeda→BRL). Quando preenchida, a conversão para BRL nos relatórios usa este valor em vez da PTAX do dia. NULL = usa PTAX do dia da ferramenta.';

comment on column public.ac_parcelas_fin.fixed_exchange_rate is
  'PTAX fixada na parcela. Herda da cláusula quando gerada em lote; pode ser sobrescrita por parcela se o contrato prever variação.';

-- FIM 017

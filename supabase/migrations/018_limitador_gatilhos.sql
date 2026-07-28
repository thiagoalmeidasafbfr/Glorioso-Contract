-- ════════════════════════════════════════════════════════════════════════════
-- 018 — Limitador de gatilhos / bônus por contrato
-- ════════════════════════════════════════════════════════════════════════════
-- Alguns contratos definem 10 cláusulas de bônus/gatilho (uma por métrica ou
-- objetivo esportivo), mas com um TETO agregado — por exemplo, "cada gatilho
-- vale R$1M, mas o pagamento total de bônus não pode ultrapassar R$5M".
--
-- Guardamos esse teto no PRÓPRIO contrato porque:
--   1. É uma restrição contratual global — não pertence a uma cláusula única.
--   2. As cláusulas seguem existindo independentes (o cadastro é por gatilho),
--      só que a exposição financeira do clube está capada.
--
-- Executar APÓS 017.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.ac_contratos
  add column if not exists trigger_cap_amount   numeric(18,2),
  add column if not exists trigger_cap_currency text
    check (trigger_cap_currency in ('BRL','EUR','USD','GBP','QAR','SAR','AED','RUB')),
  add column if not exists trigger_cap_notes    text;

comment on column public.ac_contratos.trigger_cap_amount is
  'Teto agregado de bônus/gatilhos deste contrato. Quando preenchido, os relatórios avisam quando a soma dos atingidos se aproxima ou passa desse valor.';
comment on column public.ac_contratos.trigger_cap_currency is
  'Moeda do teto (BRL, EUR, USD, ...). NULL quando trigger_cap_amount é NULL.';
comment on column public.ac_contratos.trigger_cap_notes is
  'Observações contratuais sobre o teto (ex.: cláusula 8.2, aplicável só à temporada 26/27).';

-- FIM 018

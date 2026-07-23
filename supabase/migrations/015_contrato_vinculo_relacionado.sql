-- ════════════════════════════════════════════════════════════════════════════
-- 015 — Vínculo entre contratos (contrato relacionado)
-- ════════════════════════════════════════════════════════════════════════════
-- Permite atrelar um contrato a OUTRO contrato já existente do mesmo atleta.
--
-- Caso de uso: a compra do atleta (ex.: Danilo → Nottingham Forest) é registrada
-- com todo o fluxo de pagamento. Depois chega o CONTRATO DE INTERMEDIAÇÃO dessa
-- venda: cria-se um novo contrato e aponta-se `related_contract_id` para a compra.
-- O mesmo vale para cláusulas de Sell-on Fee futuras (só % de uma venda futura),
-- que passam a viver atreladas ao contrato de origem.
--
-- Executar APÓS 014 (ponte app ↔ atleta-central).
-- ════════════════════════════════════════════════════════════════════════════

alter table public.ac_contratos
  add column if not exists related_contract_id uuid
    references public.ac_contratos(id) on delete set null;

comment on column public.ac_contratos.related_contract_id is
  'Contrato-pai ao qual este contrato está atrelado (ex.: intermediação/sell-on de uma compra ou venda). NULL quando é um contrato independente.';

create index if not exists idx_ac_contratos_related
  on public.ac_contratos(related_contract_id);

-- FIM 015

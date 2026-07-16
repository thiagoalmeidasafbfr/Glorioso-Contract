-- ── Remuneração no contrato + agente ligado ao vínculo ─────────────────────
-- Executar APÓS 008.
-- 1) A remuneração do atleta (paga pelo Botafogo) anda junta: salário base
--    (CLT) + direito de imagem + outros (moradia, auxílios). Guardamos os
--    componentes mensais no contrato de trabalho.
-- 2) O agente (empresário/intermediário) é relacionado ao VÍNCULO, não fixo no
--    atleta — um vínculo pode ter vários agentes.

alter table public.contracts add column if not exists image_value numeric;   -- imagem mensal
alter table public.contracts add column if not exists other_value numeric;   -- outros mensais (moradia, auxílios)

alter table public.intermediary_liabilities
  add column if not exists contract_id uuid references public.contracts(id) on delete cascade;

create index if not exists idx_inter_liab_contract on public.intermediary_liabilities(contract_id);

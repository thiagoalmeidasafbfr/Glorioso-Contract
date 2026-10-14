-- ════════════════════════════════════════════════════════════════════════════
-- 019 — Encargos trabalhistas da SAF + IRPF nas premissas por atleta
-- ════════════════════════════════════════════════════════════════════════════
-- Alíquotas da SAF sobre o salário CLT (sem imagem, moradia e auxílios):
--   • INSS 4,5% (antes o padrão era 20% de INSS patronal genérico);
--   • FGTS 8%;
--   • IRPF 27,5% — retido do atleta, usado para o salário líquido.
-- 13º (1/12) e férias (1/12 + 1/3) seguem como provisões mensais.
--
-- Linhas que ainda estavam com o padrão antigo de 20% passam a 4,5%; linhas
-- com outro INSS informado manualmente são preservadas.
--
-- Executar APÓS 018. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.ac_premissas_atleta
  add column if not exists irpf_pct numeric(7,4) default 0.2750;   -- 27,5%

update public.ac_premissas_atleta
   set irpf_pct = 0.2750
 where irpf_pct is null;

alter table public.ac_premissas_atleta
  alter column inss_patronal_pct set default 0.0450;               -- 4,5%

update public.ac_premissas_atleta
   set inss_patronal_pct = 0.0450
 where inss_patronal_pct = 0.2000;

comment on column public.ac_premissas_atleta.inss_patronal_pct is
  'INSS do clube sobre o CLT (+ provisões de 13º e férias). Padrão SAF: 4,5%.';
comment on column public.ac_premissas_atleta.irpf_pct is
  'IRPF retido do atleta sobre o CLT, para o salário líquido. Padrão: 27,5%.';

-- FIM 019

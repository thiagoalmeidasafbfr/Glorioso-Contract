-- ════════════════════════════════════════════════════════════════════════════
-- 020 — PERFIL "SEMIMASTER"
-- ════════════════════════════════════════════════════════════════════════════
-- Executar APÓS 019. Idempotente.
--
-- Acesso livre a tudo o que é operação (atletas, contratos, obrigações,
-- pagamentos, clubes/agentes, modelo financeiro, importação), MAS sem
-- administrar a plataforma:
--   • não cria/edita/desativa usuários nem muda perfis ("usuarios" = view:
--     só enxerga quem tem acesso);
--   • não vê "Apagar toda a base" (exige edição em "usuarios").
-- Perfil do sistema: pode ter as permissões ajustadas na tela, não excluído.

insert into public.access_roles (key, nome, descricao, permissions, is_system) values
  ('semimaster', 'Semimaster',
   'Acesso livre a atletas, contratos, cadastros, modelo financeiro e importações; não administra usuários nem apaga a base.',
   '{"dashboards":"view","atletas":"edit","cadastros":"edit","modelo":"edit","relatorios":"view","dados":"edit","usuarios":"view"}',
   true)
on conflict (key) do nothing;

-- FIM 020

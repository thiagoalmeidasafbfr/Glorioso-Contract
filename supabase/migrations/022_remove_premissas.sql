-- ════════════════════════════════════════════════════════════════════════════
-- 022 — REMOÇÃO DA TELA "PREMISSAS POR ATLETA"
-- ════════════════════════════════════════════════════════════════════════════
-- Executar APÓS 021. Idempotente.
--
-- A tela e o módulo "Modelo financeiro" saíram do app. Aqui:
--   • o módulo "modelo" sai das permissões dos perfis;
--   • as descrições dos perfis deixam de citar as premissas.
--
-- A tabela public.ac_premissas_atleta NÃO é apagada (os dados ficam guardados).
-- Para descartá-la de vez, quando tiver certeza:
--   drop table public.ac_premissas_atleta;

update public.access_roles
   set permissions = permissions - 'modelo'
 where permissions ? 'modelo' and key <> 'master';
-- (o master é refeito pelo gatilho com todos os módulos conhecidos)

update public.access_roles set descricao =
  'Cadastra e edita atletas, contratos, obrigações e cadastros.'
 where key = 'juridico';

update public.access_roles set descricao =
  'Consulta atletas, cadastros, painéis e relatórios e exporta planilhas.'
 where key = 'financeiro';

update public.access_roles set descricao =
  'Acesso livre a atletas, contratos, cadastros e importações; não administra usuários nem apaga a base.'
 where key = 'semimaster';

-- FIM 022

# Usuários, perfis e restrição de acesso

Tela: **Administração → Usuários e acessos** (`/usuarios`). Funciona com o
Supabase ligado (`VITE_USE_SUPABASE=true`); no modo local não há login e todos
têm acesso total. Instalação: `SETUP_SUPABASE.md`, passos 2 (migração `019`) e 3
(Edge Function `admin-users`).

## Modelo

- Cada **usuário** (`profiles`) tem um **perfil de acesso** (`access_roles`) e
  um status **ativo/inativo**.
- Cada perfil dá a cada **módulo** um nível:

  | Nível | Efeito |
  |-------|--------|
  | Sem acesso | A tela some da navegação e a rota mostra "Sem acesso". |
  | Consultar | Abre a tela; botões de incluir/editar/excluir somem; o topo mostra "Somente leitura". |
  | Editar | Consulta e altera. |

- Módulos (as chaves são as mesmas no app, `src/lib/access.ts`, e no banco):

  | Chave | Módulo | Telas | Tabelas que o "editar" libera |
  |-------|--------|-------|-------------------------------|
  | `dashboards` | Dashboards | `/dashboards`, `/dashboard` | — (só leitura) |
  | `atletas` | Atletas e contratos | atletas, portfólio, obrigações, assistente `/criar` | todas as demais tabelas de dados (`ac_*` e legadas) |
  | `cadastros` | Clubes e agentes | `/clubes`, `/intermediarios` | `clubs`, `intermediaries`, `ac_entidades*` |
  | `modelo` | Modelo financeiro | `/modelo/premissas` | `ac_premissas_atleta` |
  | `relatorios` | Relatórios | `/relatorios/*` | — (as ações nas linhas seguem `atletas`) |
  | `dados` | Importar / exportar | `/dados` (consultar exporta), `/dados/planilhas` (exige editar) | — (a importação grava nas tabelas acima, conferida módulo a módulo) |
  | `usuarios` | Usuários e acessos | `/usuarios` | `profiles`, `access_roles` |

  `ac_entidades` (clubes, agentes e PJs de imagem) aceita escrita de quem edita
  `atletas` **ou** `cadastros`, porque o cadastro de PJ nasce na ficha do atleta.

## O que o banco garante (migração 019)

- **Leitura**: qualquer usuário **ativo** lê os dados — os relatórios e
  painéis cruzam a base inteira. O nível "consultar" controla as telas, não as
  linhas. Usuário **inativo** (ou sem perfil) não lê nada.
- **Escrita**: só quem tem **editar** no módulo dono da tabela
  (`public.can_edit_any(...)` nas policies). Esconder um botão no app é
  conforto; a regra vale mesmo para chamadas diretas à API.
- **Ninguém altera o próprio perfil nem desativa o próprio usuário.**
- **Sempre sobra um administrador ativo** (perfil com editar em `usuarios`):
  desativar, rebaixar ou excluir o último é recusado.
- O perfil **Master** tem sempre acesso total; perfis do sistema (Master,
  Jurídico, Financeiro, Consulta) não podem ser excluídos; perfil em uso
  também não.
- **Cadastro público** não dá papel nenhum: o papel enviado no sign-up é
  ignorado e o usuário entra inativo. Exceção: o primeiro usuário de um
  projeto vazio vira Master.

Tabela nova? Aplique o mesmo padrão na migração dela:

```sql
select public.apply_access_policies('minha_tabela', array['atletas']);
```

Funções úteis no SQL: `public.my_access('modelo')` → `none|view|edit`,
`public.can_view(m)`, `public.can_edit(m)`, `public.is_active_user()`.

## Fluxos

- **Novo usuário**: nome, e-mail, perfil e o primeiro acesso —
  *senha inicial* (o admin repassa por canal seguro) ou *convite por e-mail*
  (o usuário abre o link e define a senha). O usuário já nasce ativo.
- **Senha de acesso**: enviar link de redefinição por e-mail ou definir uma
  nova senha na hora.
- **Desativar** bloqueia na hora (a RLS deixa de devolver dados) e mantém o
  cadastro; **excluir** apaga o login.
- **Esqueci a senha** na tela de login envia o link; ao voltar pelo link, o app
  pede a nova senha antes de entrar.
- **Perfis e permissões**: matriz módulo × perfil; "Novo perfil" cria um
  perfil próprio (ex.: Auditoria: relatórios e exportação).

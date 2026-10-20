# Configuração do Supabase — Passo a Passo

Este app funciona em **dois modos**, com a **mesma interface e as mesmas funções**:

| Modo | Quando | Onde ficam os dados |
|------|--------|---------------------|
| **Local** (`VITE_USE_SUPABASE=false`) | Padrão / testes | `localStorage` do navegador — começa **vazio**, sem nenhum dado fabricado (fim dos "mock datas"). |
| **Supabase** (`VITE_USE_SUPABASE=true`) | Produção | Banco Postgres do Supabase (fonte da verdade), com login e permissões. |

O atleta é a **figura central**: contratos, cláusulas, parcelas, titularidade
econômica, **metas de salário**, passivos de clube, passivos de intermediário e
direito de imagem são todos filhos de `athletes` (via `athlete_id`).

---

## 1. Criar o projeto no Supabase

1. Acesse <https://supabase.com> → **New project**.
2. Guarde a senha do banco. Aguarde o provisionamento (~2 min).
3. Em **Project Settings → API**, copie:
   - **Project URL** → vira `VITE_SUPABASE_URL`
   - **anon public key** → vira `VITE_SUPABASE_ANON_KEY`

## 2. Rodar as migrações (na ordem)

No painel do Supabase, abra **SQL Editor → New query** e execute os arquivos de
`supabase/migrations/` **nesta ordem**, um de cada vez (cole o conteúdo e "Run"):

1. `001_schema.sql`
2. `002_rls.sql`
3. `003_clausulas_venda.sql`
4. `004_athletes_system.sql`
5. `005_economic_rights.sql`
6. `006_athlete_central.sql`  ← **salário base + metas de salário + passivos (clube/intermediário) + direito de imagem**
7. `007_clubs_intermediaries.sql`  ← **cadastros de clubes e agentes (com escudo/logo)**
8. `008_economic_holder_agente.sql`  ← **permite "Agente" como detentor de titularidade econômica**
9. `009_remuneracao_agente_vinculo.sql`  ← **remuneração (imagem/outros) no contrato + agente ligado ao vínculo**
10. `010_external_ids.sql`
11. `011_athlete_pj_and_category.sql`
12. `012_schema_robusto_atleta_central.sql`
13. `013_seed_joao.sql`
14. `014_bridge_app_atleta_central.sql`
15. `015_contrato_vinculo_relacionado.sql`
16. `016_gatilho_imagem.sql`
17. `017_ptax_fixada.sql`
18. `018_premissas_atleta.sql`  ← **aba de PREMISSAS por atleta (Fase 1 do modelo do CFO)**
19. `019_usuarios_acessos.sql`  ← **usuários, perfis de acesso e restrição por módulo** (ver `docs/USUARIOS_E_ACESSOS.md`)

> **IMPORTANTE:** rode **todas** as migrations acima, em ordem. Se pular alguma,
> a aba correspondente falha com um erro do tipo *"Could not find the table
> 'public.<nome>' in the schema cache"* — isso significa que a migration que cria
> essa tabela ainda não foi aplicada no banco. Rode a migration que falta e
> recarregue a página. (Ex.: a aba **Premissas** exige a `018`.)

> Se preferir a CLI do Supabase: `supabase link --project-ref <ref>` e depois
> `supabase db push` (aplica tudo de `supabase/migrations/` em ordem).

## 3. Usuários e acessos

O controle de acesso fica no módulo **Administração → Usuários e acessos** do
app (migração `019` + Edge Function `admin-users`). Detalhes em
[`docs/USUARIOS_E_ACESSOS.md`](docs/USUARIOS_E_ACESSOS.md).

1. **Publique a Edge Function** (cria usuários, troca senhas e exclui — usa a
   service role, que nunca vai para o navegador):

   ```bash
   supabase link --project-ref <ref>
   supabase functions deploy admin-users
   ```

   `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` já existem
   no ambiente das Edge Functions; não é preciso configurar segredos.

2. **Primeiro administrador.**
   - Projeto que já tinha usuários: depois da `019` todos continuam com o
     mesmo papel (`master` / `juridico`) e ativos.
   - Projeto novo: crie o primeiro login em **Authentication → Users → Add
     user** — o primeiro usuário do projeto vira **Master** automaticamente.
     Os seguintes entram **inativos** até um administrador liberar.
   - Se precisar promover alguém pelo SQL Editor:

     ```sql
     update public.profiles set role = 'master', ativo = true
     where email = 'thiago.almeida@safbfr.com.br';
     ```

3. **Desligue o cadastro público**: em **Authentication → Sign In / Providers**,
   desmarque *Allow new users to sign up*. Mesmo ligado, quem se cadastrar
   sozinho entra inativo e sem acesso a nada, mas não há motivo para deixar.

4. **URLs de retorno** (convite e "esqueci a senha"): em **Authentication →
   URL Configuration**, coloque o endereço do app em *Site URL* e em
   *Redirect URLs*.

Perfis que já vêm prontos (editáveis em **Perfis e permissões**, exceto o
Master):

| Perfil | Pode |
|--------|------|
| **Master** | Tudo, inclusive administrar usuários e perfis. |
| **Jurídico** | Editar atletas, contratos, obrigações, clubes/agentes e importar planilhas; consultar o modelo financeiro. |
| **Financeiro** | Editar as premissas do modelo financeiro; consultar o resto. |
| **Consulta** | Somente leitura. |

## 4. Ligar o app ao Supabase

Crie um arquivo **`.env`** na raiz (copie de `.env.example`):

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...      # anon public key
VITE_USE_SUPABASE=true
```

Depois:

```bash
npm install
npm run dev      # desenvolvimento
# ou
npm run build && npm run preview   # produção
```

Se sua hospedagem for Vercel/Netlify, defina as **três variáveis** no painel de
_Environment Variables_ e faça o redeploy.

## 5. Popular os dados

Como não há dados fabricados, você começa do zero. Duas formas:

- **Manual**: cadastre atletas em **Atletas → + Novo Atleta**, depois
  **+ Novo Vínculo** (com salário base), e nas abas do atleta cadastre metas de
  salário, passivos e direito de imagem.
- **Em massa (XLSX)**: em cada página há **↓ Exportar** (baixa o modelo com as
  colunas certas) e **↑ Importar**. Preencha o XLSX e importe. Nos passivos,
  imagem e metas, a coluna **"Atleta ID"** amarra cada linha ao atleta.

---

## Mecanismo de mudança salarial por metas

Exatamente como pedido:

1. Cadastre um vínculo com **salário base** (ex.: R$ 200.000, de 01/01/26 a
   31/12/27).
2. Na aba **Salário & Metas** do atleta, adicione uma meta:
   "ao atingir 10 jogos → R$ 300.000".
3. Quando a meta for cumprida, clique em **✓ Meta atingida** e informe a **data**.
4. A partir daquela data, o **salário efetivo** do atleta passa a ser R$ 300.000
   automaticamente (o card "Salário efetivo (hoje)" reflete isso, e o botão
   **Reverter** desfaz, se necessário). Várias metas empilham por data.

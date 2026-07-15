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
7. `007_clubs_intermediaries.sql`  ← **cadastros de clubes e intermediários (com escudo/logo)**

> Se preferir a CLI do Supabase: `supabase link --project-ref <ref>` e depois
> `supabase db push` (aplica tudo de `supabase/migrations/` em ordem).

## 3. Criar usuários e definir papéis

1. **Authentication → Users → Add user**: crie o(s) e-mail(s) de acesso.
2. O papel de cada usuário fica na tabela `profiles` (criada em `001`/`004`).
   Defina o papel no **SQL Editor** (troque o e-mail):

   ```sql
   update public.profiles
   set role = 'master'      -- ou 'juridico'
   where email = 'thiago.almeida@safbfr.com.br';
   ```

   - `master` e `juridico` podem **editar** (inserir/alterar/excluir).
   - Qualquer usuário autenticado pode **ler**.
   - As policies de RLS já estão nas migrações (leitura para autenticados,
     escrita para `master`/`juridico`).

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

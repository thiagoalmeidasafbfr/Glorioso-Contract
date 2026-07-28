# Backup automático a cada 24h — Supabase

Este projeto usa Supabase (Postgres). Você tem três caminhos, do menos ao mais
trabalhoso. **Escolha um**; não precisa ter os três ativos ao mesmo tempo.

## 1. Backup nativo do Supabase (recomendado — zero trabalho)

O próprio Supabase já faz **snapshot diário** em todos os projetos e retém em
disco por tempo variável de acordo com o plano:

| Plano       | Retenção | PITR (point-in-time) |
|-------------|----------|----------------------|
| Free        | 7 dias   | não                  |
| Pro         | 7 dias   | opcional (+ addon)   |
| Team/Enterprise | 14+ dias | incluído          |

Para verificar / restaurar:

1. Acesse o dashboard do projeto → **Database** → **Backups**.
2. Cada snapshot pode ser restaurado clicando em **Restore** (cria um novo
   projeto ou sobrescreve o atual — confirme antes).
3. Para **PITR** (rollback para qualquer segundo dos últimos 7 dias), ative
   "Point-in-time recovery" em Settings → Add-ons.

Se seu plano é Free e você quer reter por mais de 7 dias, siga o método 2 ou 3
abaixo.

## 2. GitHub Actions com `pg_dump` (grátis, roda a cada 24h)

Salva o dump comprimido como *artifact* do workflow (retido 90 dias por padrão)
ou como *release asset* (indefinido). Precisa da string de conexão do banco.

### Passo a passo

1. **Pegue a connection string** do Supabase:
   Dashboard → **Project Settings** → **Database** → **Connection string** →
   escolha a variante **"URI"** com sslmode=require. Fica algo como:
   `postgresql://postgres.<ref>:<senha>@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`

2. **Adicione o secret** no GitHub:
   Repositório → **Settings** → **Secrets and variables** → **Actions** →
   **New repository secret** → nome `SUPABASE_DB_URL`, valor = a URI acima.

3. **Crie o workflow** `.github/workflows/db-backup.yml`:

    ```yaml
    name: db-backup
    on:
      schedule:
        - cron: '0 6 * * *'   # 03:00 America/Sao_Paulo (06:00 UTC), diariamente
      workflow_dispatch:       # permite disparo manual

    jobs:
      dump:
        runs-on: ubuntu-latest
        steps:
          - name: Instalar client Postgres
            run: |
              sudo apt-get update
              sudo apt-get install -y postgresql-client

          - name: pg_dump
            env:
              PGURL: ${{ secrets.SUPABASE_DB_URL }}
            run: |
              STAMP=$(date -u +%Y-%m-%d-%H%M)
              FILE="glorioso-${STAMP}.dump.gz"
              pg_dump --format=custom --no-owner --no-privileges "$PGURL" \
                | gzip -9 > "$FILE"
              echo "FILE=$FILE" >> "$GITHUB_ENV"

          - name: Upload artifact
            uses: actions/upload-artifact@v4
            with:
              name: ${{ env.FILE }}
              path: ${{ env.FILE }}
              retention-days: 90
    ```

4. **Commit + push**. O Actions passa a rodar 1x/dia sozinho. Cada execução
   aparece na aba **Actions** do repositório e o arquivo `.dump.gz` fica
   pendurado como artifact clicável.

### Para restaurar

Baixe o `.dump.gz`, descompacte e:

```bash
gunzip glorioso-2026-07-28-0600.dump.gz
pg_restore --clean --if-exists --no-owner --no-privileges \
  -d "postgresql://<usuário>:<senha>@<host>:5432/<db>" \
  glorioso-2026-07-28-0600.dump
```

⚠️ `--clean --if-exists` derruba os objetos antes de recriar; teste primeiro em
um banco vazio ou de staging.

## 3. Cron no seu servidor / VPS

Se você já tem uma máquina rodando 24/7 (VPS, Raspberry, homelab), use cron +
`pg_dump` + upload para S3/Backblaze/GCS. Mesmo `pg_dump` do método 2, dentro
de um script:

```bash
#!/usr/bin/env bash
# /opt/glorioso/backup.sh
set -euo pipefail

STAMP=$(date -u +%Y-%m-%d-%H%M)
DIR=/var/backups/glorioso
mkdir -p "$DIR"

pg_dump --format=custom --no-owner --no-privileges "$SUPABASE_DB_URL" \
  | gzip -9 > "$DIR/glorioso-$STAMP.dump.gz"

# retenção local: 30 dias
find "$DIR" -name 'glorioso-*.dump.gz' -mtime +30 -delete

# opcional: sincroniza com S3
# aws s3 cp "$DIR/glorioso-$STAMP.dump.gz" s3://<bucket>/glorioso/
```

Crontab (root ou usuário com acesso ao script):

```
0 3 * * * SUPABASE_DB_URL='postgres://…' /opt/glorioso/backup.sh >> /var/log/glorioso-backup.log 2>&1
```

## Qual escolher?

- **Sem dor de cabeça** → Método 1 (nativo). Só ative PITR se precisar de
  rollback intra-dia.
- **Free tier + backup off-site** → Método 2 (GitHub Actions). Grátis, dump fica
  fora da infra do Supabase.
- **Compliance / retenção longa / múltiplos destinos** → Método 3 (cron
  próprio).

Se quiser, posso configurar o Método 2 pra você — é só me pedir e eu adiciono o
workflow no repositório; você só precisa criar o secret `SUPABASE_DB_URL` no
GitHub.

# Desempenho e estabilidade (carregamento de dados)

Pente fino feito por causa de telas lentas e que "travavam" até o F5. O que
foi encontrado e o que mudou:

## Travamentos

| Causa | Correção |
|-------|----------|
| As telas faziam `setLoading(true) → await … → setLoading(false)` sem tratar erro: uma requisição que falhasse deixava "Carregando…" para sempre. | Todo carregador tem `try/catch/finally`; a falha vira a faixa **"Não foi possível carregar os dados · Tentar novamente"** (`lib/loadErrors`, `Layout`), que recarrega só a tela, sem F5. |
| Requisições sem prazo: conexão que morre no meio (Wi-Fi, notebook que dormiu) ficava pendurada. | `fetch` do cliente com prazo de 20 s (`lib/supabase.ts`). |
| O perfil era buscado **dentro** do `onAuthStateChange` — o supabase-js segura um lock nesse callback e a consulta esperava por ele (travava ao voltar para a aba). | Perfil carregado depois do callback (`setTimeout`); não é recarregado quando a aba volta ao foco ou o token é renovado. |
| Erro ao carregar o perfil aparecia como "Acesso pendente" ou "Carregando…" eterno. | Tela "Sem conexão" com "Tentar novamente". |
| PTAX do Banco Central sem prazo e buscada **antes** dos dados (Amortização, Detalhamento); falha gravava cotações vazias para o dia todo. | Prazo de 8 s, sem novas tentativas em dias anteriores quando o BC falha, nada gravado se vier vazio, busca em paralelo com os dados. |

## Dados incompletos

O Supabase devolve no máximo **1000 linhas por requisição** e corta o resto sem
erro. Os fluxos mensais de salário/imagem geram milhares de parcelas — os
relatórios somavam só as 1000 primeiras. Agora toda lista é lida por páginas
até o fim (`selectAll` em `lib/athleteQueries.ts`).

## Lentidão

- **Cache de listas** (`lib/queryCache.ts`): as telas pediam as mesmas 5–7
  tabelas inteiras a cada navegação. Agora ficam em memória por 1 min,
  requisições iguais em andamento são compartilhadas, e qualquer gravação
  feita no app limpa o cache na hora.
- **Fotos fora das listas**: as fotos ficam em base64 na linha do atleta
  (dezenas de KB cada) e iam junto em toda lista — inclusive em relatórios
  sem foto. A lista vem sem foto; avatares e portfólio usam
  `useAthletePhoto`, que baixa as fotos uma única vez (30 min ou até alguém
  alterar um atleta).
- **Painel `/dashboard`**: fazia uma requisição por atleta; agora uma só.
- **Regerar fluxo salarial**: apagava parcelas uma a uma; agora em lote.

## Banco (migração 021)

- Índices em todas as chaves estrangeiras que não tinham (exclusões em
  cascata e filtros por contrato faziam varredura total) e em
  `ac_entidades(tipo)`.
- Status da cláusula recalculado **uma vez por comando** (antes, uma vez por
  parcela): inserir 7.200 parcelas caiu de 1,27 s para 0,15 s no teste.

## Diagnóstico no Supabase

No **SQL Editor**, para ver onde está o peso:

```sql
-- Tamanho e linhas por tabela
select relname as tabela, n_live_tup as linhas,
       pg_size_pretty(pg_total_relation_size(relid)) as tamanho
from pg_stat_user_tables order by pg_total_relation_size(relid) desc limit 15;

-- Quanto as fotos e logos pesam (base64 dentro das linhas)
select 'fotos de atletas' as o_que, count(*) filter (where foto_url is not null) as qtd,
       pg_size_pretty(coalesce(sum(length(foto_url)), 0)) as total from ac_atletas
union all
select 'logos de entidades', count(*) filter (where logo_url is not null),
       pg_size_pretty(coalesce(sum(length(logo_url)), 0)) from ac_entidades;
```

Em **Database → Query Performance** (ou **Reports → Query performance**) o
painel lista as consultas mais lentas. Se as fotos passarem de alguns MB, o
próximo passo é movê-las para o **Supabase Storage** (bucket público) e
guardar só a URL — a lista de atletas fica leve de vez.

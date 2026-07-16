# Schema Robusto "Atleta-Central" — Gestão de Contratos (SAF)

Documentação do modelo definido em:

- `supabase/migrations/012_schema_robusto_atleta_central.sql` — DDL completo.
- `supabase/migrations/013_seed_joao.sql` — seed do caso de aceitação **JOÃO**.

> **Validado**: ambas as migrations foram executadas em PostgreSQL 16 (ON_ERROR_STOP),
> o seed é idempotente e as consultas abaixo foram rodadas contra os dados do JOÃO.

## Por que o schema legado era "fraco" e o que muda

O modelo anterior (`athletes`, `contracts`, `clauses`, `clause_installments`,
`image_rights`, `salary_triggers`, `club_liabilities`, ...) espalhava a lógica
financeira por muitas tabelas, tratava cláusulas como texto achatado
(`condition_description`), guardava contrapartes como strings soltas
(`counterpart_club`, `creditor_party`) e não versionava remuneração nem
capitalizava intangível. Consultar "tudo do atleta X" exigia varrer N tabelas.

O modelo novo aplica os 9 pilares pedidos:

| # | Pilar | Como o schema entrega |
|---|-------|-----------------------|
| 1 | Atleta central | `atleta_id` **NOT NULL** em toda tabela de fato — inclusive em `ac_obrigacoes_financeiras` (o linchpin financeiro). |
| 2 | Financeiro polimórfico | Todo dinheiro vive em `ac_obrigacoes_financeiras` + `ac_parcelas`, com `natureza` discriminando (transferência, salário, imagem, comissão, solidariedade, mais-valia, gatilho, luvas, bônus...). |
| 3 | Contrapartes unificadas | `ac_entidades` + extensões 1:1 (`_clube`, `_agente`, `_pj_imagem`, `_fundo`). A camada financeira sempre aponta para `ac_entidades`. |
| 4 | Cláusula Condição→Efeito | `ac_clausulas` → `ac_clausula_condicoes` (métrica/operador/limite/janela/escopo) → `ac_clausula_efeitos` (gerar obrigação / alterar remuneração / gerar receita) → `ac_clausula_avaliacoes` (fecha o ciclo). |
| 5 | Remuneração versionada | `ac_remuneracoes` com `vigencia_inicio`/`vigencia_fim` e **EXCLUDE** anti-sobreposição por (atleta, componente). |
| 6 | Integração contábil | `ac_obrigacoes_financeiras` carrega `rubrica`, `tratamento_contabil` (CAPITALIZAR/DESPESA), `conta_contabil_id`, `centro_custo_id`, `ativo_intangivel_id`. |
| 7 | Multimoeda + correção | `ac_moedas`, `ac_taxas_cambio` (PTAX) e `indice_correcao` por parcela. |
| 8 | Contingência | `ac_obrigacoes_financeiras.contingente` separa passivo firme de contingente. |
| 9 | Auditoria + aditivos | `created_at`/`updated_at` (trigger) em tudo; `ac_aditivos` versiona contratos. |

## Tabelas e como cada uma se liga ao atleta

Prefixo `ac_` (*atleta-central*) para coexistir com o schema legado em inglês.

| Tabela | Papel | Caminho até `atleta_id` |
|--------|-------|--------------------------|
| `ac_atletas` | **Núcleo** | (é o atleta) |
| `ac_atleta_nacionalidades` | Nacionalidades 0..N | `atleta_id` direto |
| `ac_entidades` (+ `_clube`/`_agente`/`_pj_imagem`/`_fundo`) | Contrapartes (dimensão) | *única sem `atleta_id`*; PJ de imagem liga por `_pj_imagem.atleta_id` |
| `ac_contratos` | Contratos (aquisição/trabalho/imagem/venda/empréstimo/representação) | `atleta_id` direto |
| `ac_aditivos` | Aditivos versionados | via `contrato_id` |
| `ac_transferencias` | Compra/venda/empréstimo | `atleta_id` direto |
| `ac_remuneracoes` | Salário/imagem/luvas/bônus versionados | `atleta_id` direto |
| `ac_obrigacoes_financeiras` | **Todo fluxo de dinheiro** | `atleta_id` **NOT NULL** |
| `ac_parcelas` | Cronograma de vencimentos | via `obrigacao_id` |
| `ac_clausulas` / `_condicoes` / `_efeitos` / `_avaliacoes` | Gatilhos e efeitos | `atleta_id` direto (cláusula e avaliação) |
| `ac_eventos_desempenho` | Jogos/gols/... por clube/competição | `atleta_id` direto |
| `ac_ativos_intangiveis` | Direito econômico capitalizado | `atleta_id` direto |
| `ac_amortizacoes` | Cronograma de amortização | via `ativo_intangivel_id` |
| `ac_documentos` | Anexos (PDFs) | `atleta_id` **NOT NULL** |
| `ac_moedas` / `ac_taxas_cambio` / `ac_indices_correcao_valores` / `ac_contas_contabeis` / `ac_centros_custo` | Suporte/dimensão | referenciadas pelos fatos |

### Diagrama textual das relações

```
                         ┌──────────────────┐
                         │   ac_atletas     │  ◄── figura central
                         └──────────────────┘
        ┌───────────────┬───────┴────────┬──────────────┬───────────────┐
        ▼               ▼                ▼              ▼               ▼
 ac_contratos    ac_transferencias  ac_remuneracoes  ac_clausulas   ac_eventos_
   │  │                  │           (versionada)      │   │          desempenho
   │  └─ ac_aditivos     │                             │   │
   │                     ▼                             ▼   ▼
   │             ac_ativos_intangiveis        ac_clausula_condicoes
   │                     │                    ac_clausula_efeitos
   │                     ▼                    ac_clausula_avaliacoes
   │             ac_amortizacoes                     │  (gera)
   │                                                 │
   └──────────────► ac_obrigacoes_financeiras ◄──────┘  (atleta_id NOT NULL)
                            │  (contraparte → ac_entidades)
                            ▼
                       ac_parcelas  (multimoeda + PTAX + índice de correção)

 ac_entidades (dimensão única de contrapartes) ◄── contratos / transferências /
   ├ ac_entidades_clube                            remunerações / obrigações /
   ├ ac_entidades_agente                           cláusulas apontam para cá.
   ├ ac_entidades_pj_imagem (→ atleta_id)
   └ ac_entidades_fundo
```

## Caso JOÃO — cobertura dos 6 blocos (provado pelo seed)

| Bloco | O que representa | Tabelas exercitadas |
|-------|------------------|---------------------|
| 1 | Compra do Barcelona €10M em 5×€2M | `ac_transferencias`, `ac_contratos`(AQUISICAO), `ac_ativos_intangiveis` (vida útil 36m), `ac_obrigacoes_financeiras`(TRANSFERENCIA, capitalizável), 5 `ac_parcelas` |
| 2 | Comissão agente 10×100k bimestral | `ac_entidades`(AGENTE), `ac_obrigacoes_financeiras`(INTERMEDIACAO, capitalizável → integra o intangível), 10 `ac_parcelas` |
| 3 | Solidariedade a 3 formadores | 3 `ac_entidades`(CLUBE), 3 `ac_obrigacoes_financeiras`(SOLIDARIEDADE, capitalizável) |
| 4 | Contrato 3 anos: 600k salário + 600k imagem via PJ | `ac_contratos`(TRABALHO, IMAGEM), `ac_entidades_pj_imagem`, `ac_remuneracoes` (2 componentes) |
| 5 | Gatilho 10 jogos no Botafogo → 500k ao Barcelona | `ac_clausulas`+`_condicoes`(RELATIVO_AO_CLUBE=Botafogo)+`_efeitos`(GERAR_OBRIGACAO), `ac_obrigacoes_financeiras`**contingente**, `ac_eventos_desempenho` |
| 6 | Gatilho 30 gols → salário/imagem 700k | `ac_clausulas`+`_condicoes`+2 `_efeitos`(ALTERAR_REMUNERACAO), `ac_clausula_avaliacoes`(APLICADA) e `ac_remuneracoes` **versionadas** (fecha 600k, abre 700k) |

Resultados verificados: passivo **firme €11,5M** vs **contingente €0,5M**;
exposição total **€12M**; timeline de remuneração sem sobreposição
(600k até 31/10/2026, 700k a partir de 01/11/2026); amortização de
R$ 1.694.444,44/mês por 36 meses.

## Consultas de exemplo

**(a) Obrigações a pagar de um atleta, com vencimentos**
```sql
select o.natureza, e.nome as contraparte, o.contingente,
       p.numero, p.valor, p.moeda_codigo, p.data_vencimento, p.status
from ac_obrigacoes_financeiras o
join ac_parcelas p on p.obrigacao_id = o.id
left join ac_entidades e on e.id = o.contraparte_entidade_id
where o.atleta_id = :atleta_id and o.direcao = 'A_PAGAR'
order by p.data_vencimento;
```

**(b) Passivo firme vs. contingente por atleta**
```sql
select a.nome, o.contingente, p.moeda_codigo, sum(p.valor) as total
from ac_atletas a
join ac_obrigacoes_financeiras o on o.atleta_id = a.id and o.direcao = 'A_PAGAR'
join ac_parcelas p on p.obrigacao_id = o.id
group by a.nome, o.contingente, p.moeda_codigo
order by a.nome, o.contingente;
```

**(c) Linha do tempo de remuneração (versionada)**
```sql
select componente, valor, moeda_codigo, vigencia_inicio,
       coalesce(vigencia_fim::text, 'vigente') as vigencia_fim
from ac_remuneracoes
where atleta_id = :atleta_id
order by componente, vigencia_inicio;
```

**(d) Cronograma de amortização do intangível**
```sql
select am.competencia, am.valor, am.acumulado
from ac_amortizacoes am
join ac_ativos_intangiveis ai on ai.id = am.ativo_intangivel_id
where ai.atleta_id = :atleta_id
order by am.competencia;
```

**(e) Exposição total por moeda (parcelas em aberto)**
```sql
select p.moeda_codigo, o.direcao, sum(p.valor) as total
from ac_parcelas p
join ac_obrigacoes_financeiras o on o.id = p.obrigacao_id
where p.status in ('PENDENTE','PARCIALMENTE_PAGA','VENCIDA')
group by p.moeda_codigo, o.direcao
order by p.moeda_codigo;
```

**(bônus) Avaliar uma condição somando eventos na janela/escopo**
```sql
select cl.descricao, c.metrica, c.operador, c.valor_limite,
       coalesce(sum(ev.jogos),0) as apurado,
       coalesce(sum(ev.jogos),0) >= c.valor_limite as atingido
from ac_clausulas cl
join ac_clausula_condicoes c on c.clausula_id = cl.id
left join ac_eventos_desempenho ev
       on ev.atleta_id = cl.atleta_id
      and (c.escopo <> 'RELATIVO_AO_CLUBE' or ev.entidade_clube_id = c.entidade_clube_id)
where c.metrica = 'JOGOS'
group by cl.descricao, c.metrica, c.operador, c.valor_limite;
```

## Notas de decisões de modelagem (trade-offs)

1. **Entidade unificada vs. tabelas separadas.** Optei por `ac_entidades` +
   extensões 1:1. Ganho: a camada financeira tem UMA FK de contraparte; consultas
   de exposição por contraparte são triviais. Custo: atributos específicos ficam
   em tabelas satélite (um `join` a mais). Alternativa descartada: tabelas
   separadas por tipo → poluiria `obrigacoes` com 4 FKs mutuamente exclusivas.

2. **`atleta_id` NOT NULL em `ac_obrigacoes_financeiras`.** É a decisão mais
   importante e o que garante o pilar "atleta central". Toda linha de dinheiro
   tem dono. Contrapartida: obrigações puramente institucionais (sem atleta) não
   cabem aqui — e isso é intencional neste domínio.

3. **Cláusula em 4 tabelas (Condição→Efeito→Avaliação).** Permite N condições com
   lógica E/OU e N efeitos heterogêneos com o MESMO modelo (gatilho esportivo,
   financeiro, mais-valia, reajuste). Custo: inserir uma cláusula simples exige
   3–4 inserts. Trade-off aceito em favor da expressividade e de avaliar gatilhos
   somando `ac_eventos_desempenho`.

4. **Remuneração versionada com EXCLUDE (btree_gist).** O banco *garante* que não
   há duas vigências sobrepostas para o mesmo componente do mesmo atleta — o
   gatilho de aumento é obrigado a fechar o registro anterior. Requer a extensão
   `btree_gist` (disponível no Supabase). Alternativa (checar no app) foi
   descartada por permitir estado inconsistente.

5. **Granularidade de `ac_eventos_desempenho`.** Escolhi linha agregada por
   (atleta, clube, competição, temporada, data) com contadores, em vez de uma
   linha por jogo. Simplifica a soma na janela/escopo das condições e é suficiente
   para FP&A. Se for preciso auditar jogo a jogo, basta reduzir a granularidade
   para uma linha por partida — as consultas de soma continuam iguais.

6. **Contábil embutido na obrigação vs. tabela de lançamentos.** Rubrica, conta,
   centro de custo e tratamento ficam na própria obrigação (não há um "razão"
   separado). Suficiente para orçado×realizado e para alimentar o intangível.
   Um livro-razão contábil completo seria um módulo à parte.

7. **Intangível: custo base + `custo_adicional_acumulado`.** Intermediação,
   solidariedade e gatilhos capitalizáveis somam ao custo adicional do ativo (as
   obrigações apontam para o `ativo_intangivel_id`). A amortização do seed é
   linear sobre o custo base em BRL; recalcular a base amortizável quando um
   gatilho capitalizável dispara é regra de negócio (pode virar função/trigger).

8. **Prefixo `ac_` e coexistência.** O schema novo NÃO substitui o legado
   automaticamente — ele coexiste. Migrar o front-end (types, `athleteQueries`,
   páginas) para as novas tabelas é um trabalho separado e maior; este entregável
   é o modelo de dados validado e o seed de prova.

## RLS (Supabase)

Todas as tabelas `ac_*` têm RLS habilitado no padrão do projeto: **todo
autenticado lê**; **escrita restrita a `master`/`juridico`** (via
`public.get_my_role()`). Para políticas por **centro de custo**, troque o `USING`
de escrita nas tabelas financeiras por uma checagem contra os centros do perfil
logado (ex.: função `public.meus_centros_custo()`), conforme comentado no fim do
arquivo 012.

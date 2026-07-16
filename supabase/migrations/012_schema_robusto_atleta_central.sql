-- ════════════════════════════════════════════════════════════════════════════
-- 012 — Schema Robusto "Atleta-Central" (SAF / Controladoria / FP&A)
-- ════════════════════════════════════════════════════════════════════════════
-- Arquiteto de dados: modelo athlete-centric para gestão de contratos de atletas.
--
-- PREMISSA CENTRAL
--   O ATLETA é a figura central de tudo. Toda tabela de FATO carrega, direta ou
--   transitivamente, um `atleta_id`. Não existe fato financeiro "solto".
--
-- PILARES
--   1. Atleta central                → atleta_id em toda tabela de fato.
--   2. Financeiro polimórfico        → obrigacoes_financeiras + parcelas (único fluxo de $).
--   3. Contrapartes unificadas       → entidades (+ extensões 1:1 por tipo).
--   4. Cláusulas Condição → Efeito   → clausulas / clausula_condicoes / clausula_efeitos / clausula_avaliacoes.
--   5. Remuneração versionada        → remuneracoes com vigencia_inicio/fim (histórico).
--   6. Integração contábil           → rúbrica, tratamento (capitalizar/despesa), conta, centro de custo.
--   7. Multimoeda + correção         → moeda + PTAX + índice de correção por parcela.
--   8. Contingência                  → obrigacoes.contingente até o gatilho disparar.
--   9. Auditoria + aditivos          → created_at/updated_at + aditivos versionados.
--
-- CONVENÇÕES
--   • Nomes em snake_case, português. Schema `public`.
--   • PK uuid (gen_random_uuid). timestamptz created_at/updated_at + trigger.
--   • Monetário numeric(18,2); percentual numeric(7,4); câmbio numeric(18,6).
--   • ENUMs para tipos/naturezas/status; tabelas de domínio p/ moedas e contábil.
--   • Prefixo `ac_` (atleta-central) nas tabelas para coexistir com o schema legado
--     em inglês (athletes/contracts/clauses) sem colisão. Migrar o app é passo à parte.
--
-- Executar APÓS 002_rls.sql (usa public.get_my_role() e public.profiles).
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;    -- gen_random_uuid()
create extension if not exists btree_gist;  -- EXCLUDE de vigências sem sobreposição

-- ── Trigger genérico de updated_at ──────────────────────────────────────────
create or replace function public.ac_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 1) ENUMS (tipos de domínio)
-- ════════════════════════════════════════════════════════════════════════════
do $$ begin
  create type public.ac_entidade_tipo as enum
    ('CLUBE','AGENTE','PJ_IMAGEM','FUNDO','CLUBE_PROPRIO','ATLETA','OUTRO');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ac_atleta_status as enum
    ('ATIVO','LESIONADO','EMPRESTADO','VENDIDO','LIBERADO');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ac_pe_preferido as enum ('DIREITO','ESQUERDO','AMBIDESTRO');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ac_contrato_tipo as enum
    ('AQUISICAO','TRABALHO','IMAGEM','VENDA','EMPRESTIMO','REPRESENTACAO');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ac_contrato_status as enum
    ('RASCUNHO','ATIVO','ENCERRADO','RESCINDIDO');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ac_transferencia_tipo as enum
    ('ENTRADA_DEFINITIVA','ENTRADA_EMPRESTIMO','ENTRADA_LIVRE_BOSMAN',
     'PROMOCAO_BASE','EXERCICIO_OPCAO_COMPRA','SAIDA_DEFINITIVA','SAIDA_EMPRESTIMO');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ac_obrigacao_direcao as enum ('A_PAGAR','A_RECEBER');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ac_obrigacao_natureza as enum
    ('TRANSFERENCIA','SALARIO','IMAGEM','LUVAS','BONUS','INTERMEDIACAO',
     'SOLIDARIEDADE','MAIS_VALIA','GATILHO','MULTA_RESCISORIA','CETD',
     'TAXA_EMPRESTIMO','RENOVACAO','OUTRO');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ac_obrigacao_status as enum ('ATIVA','LIQUIDADA','CANCELADA');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ac_parcela_status as enum
    ('PENDENTE','PAGA','PARCIALMENTE_PAGA','VENCIDA','CANCELADA');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ac_tratamento_contabil as enum ('CAPITALIZAR','DESPESA');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ac_rubrica as enum
    ('DIREITOS_ECONOMICOS','INTERMEDIACAO','LUVAS','BONUS','RENOVACAO',
     'SALARIO','IMAGEM','SOLIDARIEDADE','MAIS_VALIA','MULTA','OUTRO');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ac_remuneracao_componente as enum
    ('SALARIO_CLT','IMAGEM','LUVAS','BONUS','AUXILIO');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ac_clausula_tipo as enum
    ('GATILHO_ESPORTIVO','GATILHO_FINANCEIRO','MAIS_VALIA','SOLIDARIEDADE',
     'MULTA_RESCISORIA','CETD','RENOVACAO','LUVAS','BONUS');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ac_condicao_metrica as enum
    ('JOGOS','GOLS','ASSISTENCIAS','MINUTOS','TITULOS','CONVOCACOES',
     'TEMPO_DE_CONTRATO','VALOR_DE_VENDA');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ac_condicao_operador as enum
    ('MAIOR_IGUAL','MAIOR','IGUAL','MENOR','MENOR_IGUAL','ENTRE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ac_condicao_janela as enum ('TEMPORADA','CONTRATO','COMPETICAO');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ac_condicao_escopo as enum ('PROPRIO_ATLETA','RELATIVO_AO_CLUBE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ac_logica as enum ('E','OU');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ac_efeito_tipo as enum
    ('GERAR_OBRIGACAO','ALTERAR_REMUNERACAO','GERAR_RECEITA');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ac_avaliacao_status as enum
    ('PENDENTE','ATINGIDA','NAO_ATINGIDA','APLICADA');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ac_indice_correcao as enum ('NENHUM','SELIC','CDI','IGPM','IPCA');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ac_ativo_status as enum ('ATIVO','BAIXADO');
exception when duplicate_object then null; end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 2) SUPORTE: moedas, câmbio, correção, contábil
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.ac_moedas (
  codigo     text primary key,          -- 'BRL','EUR','USD','GBP'
  nome       text not null,
  simbolo    text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.ac_moedas is 'Moedas suportadas; referenciada por obrigações, parcelas e remunerações.';

create table if not exists public.ac_taxas_cambio (
  id           uuid primary key default gen_random_uuid(),
  moeda_codigo text not null references public.ac_moedas(codigo) on delete restrict,
  data         date not null,
  ptax_compra  numeric(18,6) not null,
  ptax_venda   numeric(18,6) not null,
  fonte        text default 'PTAX-BCB',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (moeda_codigo, data),
  check (ptax_compra >= 0 and ptax_venda >= 0)
);
comment on table public.ac_taxas_cambio is 'Cotações PTAX por moeda/data para conversão de parcelas em BRL.';

create table if not exists public.ac_indices_correcao_valores (
  id          uuid primary key default gen_random_uuid(),
  indice      public.ac_indice_correcao not null,
  competencia date not null,             -- 1º dia do mês de competência
  fator       numeric(18,8) not null,    -- fator acumulado ou taxa mensal
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (indice, competencia)
);
comment on table public.ac_indices_correcao_valores is 'Séries de índices (Selic/CDI/IGPM/IPCA) p/ correção monetária de parcelas.';

create table if not exists public.ac_contas_contabeis (
  id         uuid primary key default gen_random_uuid(),
  codigo     text not null unique,       -- conta padrão SAP
  descricao  text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.ac_contas_contabeis is 'Plano de contas (padrão SAP) associável às obrigações.';

create table if not exists public.ac_centros_custo (
  id         uuid primary key default gen_random_uuid(),
  codigo     text not null unique,
  descricao  text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.ac_centros_custo is 'Centros de custo; base para RLS por cost-center (ver notas RLS).';

-- ════════════════════════════════════════════════════════════════════════════
-- 3) CONTRAPARTES UNIFICADAS: entidades + extensões 1:1
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.ac_entidades (
  id         uuid primary key default gen_random_uuid(),
  tipo       public.ac_entidade_tipo not null,
  nome       text not null,
  pais       text,
  documento  text,                       -- CNPJ / tax id / FIFA id conforme o tipo
  ativo      boolean not null default true,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.ac_entidades is
  'Contraparte única (clube, agente, PJ de imagem, fundo, Botafogo, atleta). A camada financeira SEMPRE aponta para aqui.';

-- Nota: entidade é DIMENSÃO compartilhada — é a única tabela que não carrega
-- atleta_id. O vínculo com o atleta se dá via os fatos (obrigações, contratos,
-- remunerações) e, no caso da PJ de imagem, pela extensão abaixo.
create table if not exists public.ac_entidades_clube (
  entidade_id uuid primary key references public.ac_entidades(id) on delete cascade,
  is_proprio  boolean not null default false,  -- true = Botafogo SAF
  codigo_fifa text,
  federacao   text
);

create table if not exists public.ac_entidades_agente (
  entidade_id  uuid primary key references public.ac_entidades(id) on delete cascade,
  licenca_fifa text,
  contato      text
);

create table if not exists public.ac_entidades_pj_imagem (
  entidade_id uuid primary key references public.ac_entidades(id) on delete cascade,
  atleta_id   uuid not null,                    -- FK adicionada após criar ac_atletas
  cnpj        text,
  socios      text
);
comment on table public.ac_entidades_pj_imagem is
  'PJ recebedora de direito de imagem — normalmente pertencente ao próprio atleta (atleta_id).';

create table if not exists public.ac_entidades_fundo (
  entidade_id uuid primary key references public.ac_entidades(id) on delete cascade,
  gestor      text
);

-- ════════════════════════════════════════════════════════════════════════════
-- 4) NÚCLEO: atletas
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.ac_atletas (
  id                     uuid primary key default gen_random_uuid(),
  nome                   text not null,             -- nome de exibição
  nome_completo          text not null,
  apelido                text,
  data_nascimento        date,
  cpf                    text unique,
  posicao                text,
  pe_preferido           public.ac_pe_preferido,
  registro_bid_cbf       text,                      -- BID/CBF
  fifa_id                text,
  status                 public.ac_atleta_status not null default 'ATIVO',
  entidade_clube_atual_id uuid references public.ac_entidades(id) on delete set null,
  observacoes            text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  check (data_nascimento is null or data_nascimento < current_date)
);
comment on table public.ac_atletas is 'Figura central. Todo fato do sistema é rastreável até um atleta.';

-- FK circular resolvida aqui: PJ de imagem pertence a um atleta.
alter table public.ac_entidades_pj_imagem
  drop constraint if exists ac_pj_imagem_atleta_fk;
alter table public.ac_entidades_pj_imagem
  add constraint ac_pj_imagem_atleta_fk
  foreign key (atleta_id) references public.ac_atletas(id) on delete cascade;

create table if not exists public.ac_atleta_nacionalidades (
  id           uuid primary key default gen_random_uuid(),
  atleta_id    uuid not null references public.ac_atletas(id) on delete cascade,
  nacionalidade text not null,
  principal    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (atleta_id, nacionalidade)
);
comment on table public.ac_atleta_nacionalidades is 'Nacionalidades (0..N) do atleta; relevante p/ solidariedade internacional.';

-- ════════════════════════════════════════════════════════════════════════════
-- 5) CONTRATOS + ADITIVOS
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.ac_contratos (
  id                     uuid primary key default gen_random_uuid(),
  atleta_id              uuid not null references public.ac_atletas(id) on delete cascade,
  tipo                   public.ac_contrato_tipo not null,
  entidade_contraparte_id uuid references public.ac_entidades(id) on delete restrict,
  data_inicio            date not null,
  data_fim               date,
  status                 public.ac_contrato_status not null default 'ATIVO',
  opcao_renovacao        boolean not null default false,
  descricao              text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  check (data_fim is null or data_fim >= data_inicio)
);
comment on table public.ac_contratos is 'Contratos do atleta: aquisição, trabalho (CLT/SAF), imagem, venda, empréstimo, representação.';

create table if not exists public.ac_aditivos (
  id           uuid primary key default gen_random_uuid(),
  contrato_id  uuid not null references public.ac_contratos(id) on delete cascade,
  numero       int  not null,
  data         date not null,
  descricao    text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (contrato_id, numero)
);
comment on table public.ac_aditivos is 'Aditivos versionados de um contrato (amendments).';

-- ════════════════════════════════════════════════════════════════════════════
-- 6) TRANSFERÊNCIAS (entrada/saída)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.ac_transferencias (
  id                 uuid primary key default gen_random_uuid(),
  atleta_id          uuid not null references public.ac_atletas(id) on delete cascade,
  contrato_id        uuid references public.ac_contratos(id) on delete set null,
  tipo               public.ac_transferencia_tipo not null,
  entidade_origem_id  uuid references public.ac_entidades(id) on delete restrict,
  entidade_destino_id uuid references public.ac_entidades(id) on delete restrict,
  valor              numeric(18,2),
  moeda_codigo       text references public.ac_moedas(codigo) on delete restrict,
  data               date not null,
  -- Preenchidos na SAÍDA (venda): apuração de resultado vs. valor contábil.
  valor_contabil_baixa numeric(18,2),
  ganho_perda        numeric(18,2),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (valor is null or valor >= 0)
);
comment on table public.ac_transferencias is 'Movimentações de titularidade do atleta (compra, venda, empréstimo, Bosman, opção).';

-- ════════════════════════════════════════════════════════════════════════════
-- 7) REMUNERAÇÃO VERSIONADA (vigência temporal)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.ac_remuneracoes (
  id                    uuid primary key default gen_random_uuid(),
  atleta_id             uuid not null references public.ac_atletas(id) on delete cascade,
  contrato_id           uuid references public.ac_contratos(id) on delete set null,
  componente            public.ac_remuneracao_componente not null,
  entidade_recebedora_id uuid references public.ac_entidades(id) on delete set null, -- PJ p/ imagem
  valor                 numeric(18,2) not null,
  moeda_codigo          text not null references public.ac_moedas(codigo) on delete restrict,
  vigencia_inicio       date not null,
  vigencia_fim          date,               -- null = vigente por prazo indeterminado
  origem_efeito_id      uuid,               -- FK adicionada após clausula_efeitos (gatilho que criou)
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (valor >= 0),
  check (vigencia_fim is null or vigencia_fim >= vigencia_inicio),
  -- Sem sobreposição de vigência para o MESMO componente do MESMO atleta.
  constraint ac_remuneracao_sem_overlap
    exclude using gist (
      atleta_id with =,
      componente with =,
      daterange(vigencia_inicio, coalesce(vigencia_fim, 'infinity'::date), '[]') with &&
    )
);
comment on table public.ac_remuneracoes is
  'Componentes de remuneração versionados por vigência. Gatilho de aumento fecha o registro antigo e abre um novo.';

-- ════════════════════════════════════════════════════════════════════════════
-- 8) FINANCEIRO POLIMÓRFICO: obrigacoes_financeiras + parcelas
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.ac_ativos_intangiveis (
  id                      uuid primary key default gen_random_uuid(),
  atleta_id               uuid not null references public.ac_atletas(id) on delete cascade,
  transferencia_id        uuid references public.ac_transferencias(id) on delete set null,
  custo_base              numeric(18,2) not null,      -- direitos econômicos (moeda original)
  moeda_codigo            text not null references public.ac_moedas(codigo) on delete restrict,
  custo_base_brl          numeric(18,2),               -- convertido na data de aquisição
  custo_adicional_acumulado numeric(18,2) not null default 0, -- intermediação/solidariedade/gatilhos capitalizados
  data_inicio             date not null,               -- início da amortização
  vida_util_meses         int  not null,               -- = meses de contrato
  valor_residual          numeric(18,2) not null default 0,
  status                  public.ac_ativo_status not null default 'ATIVO',
  data_baixa              date,
  valor_baixa_brl         numeric(18,2),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  check (vida_util_meses > 0),
  check (custo_base >= 0)
);
comment on table public.ac_ativos_intangiveis is
  'Direito econômico capitalizado do atleta. Base = transferência; custo adicional recebe intermediação/solidariedade/gatilhos capitalizáveis.';

create table if not exists public.ac_obrigacoes_financeiras (
  id                    uuid primary key default gen_random_uuid(),
  -- ► LINCHPIN: toda obrigação PERTENCE a um atleta (NOT NULL).
  atleta_id             uuid not null references public.ac_atletas(id) on delete cascade,
  contrato_id           uuid references public.ac_contratos(id) on delete set null,
  transferencia_id      uuid references public.ac_transferencias(id) on delete set null,
  clausula_id           uuid,   -- FK adicionada após clausulas (origem, quando houver)
  clausula_efeito_id    uuid,   -- FK adicionada após clausula_efeitos
  contraparte_entidade_id uuid references public.ac_entidades(id) on delete restrict,
  direcao               public.ac_obrigacao_direcao not null,
  natureza              public.ac_obrigacao_natureza not null,
  descricao             text,
  valor_total           numeric(18,2) not null default 0,
  moeda_codigo          text not null references public.ac_moedas(codigo) on delete restrict,
  indice_correcao       public.ac_indice_correcao not null default 'NENHUM',
  contingente           boolean not null default false,   -- firme x contingente
  status                public.ac_obrigacao_status not null default 'ATIVA',
  -- Integração contábil embutida:
  tratamento_contabil   public.ac_tratamento_contabil not null default 'DESPESA',
  rubrica               public.ac_rubrica not null default 'OUTRO',
  conta_contabil_id     uuid references public.ac_contas_contabeis(id) on delete set null,
  centro_custo_id       uuid references public.ac_centros_custo(id) on delete set null,
  ativo_intangivel_id   uuid references public.ac_ativos_intangiveis(id) on delete set null, -- se capitalizável
  data_competencia      date,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (valor_total >= 0)
);
comment on table public.ac_obrigacoes_financeiras is
  'Estrutura ÚNICA de todo fluxo de dinheiro (a pagar/a receber), qualquer que seja a natureza. Sempre atrelada a um atleta.';
comment on column public.ac_obrigacoes_financeiras.contingente is
  'true enquanto o gatilho de origem não foi atingido (passivo/recebível contingente).';

create table if not exists public.ac_parcelas (
  id               uuid primary key default gen_random_uuid(),
  obrigacao_id     uuid not null references public.ac_obrigacoes_financeiras(id) on delete cascade,
  numero           int  not null,
  valor            numeric(18,2) not null,
  moeda_codigo     text not null references public.ac_moedas(codigo) on delete restrict,
  data_vencimento  date not null,
  indice_correcao  public.ac_indice_correcao not null default 'NENHUM',
  status           public.ac_parcela_status not null default 'PENDENTE',
  data_pagamento   date,
  valor_pago       numeric(18,2),
  valor_pago_brl   numeric(18,2),
  taxa_cambio      numeric(18,6),
  ptax_data        date,
  observacoes      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (obrigacao_id, numero),
  check (valor >= 0)
);
comment on table public.ac_parcelas is 'Cronograma de vencimentos de uma obrigação; correção e PTAX por parcela.';

-- ════════════════════════════════════════════════════════════════════════════
-- 9) CLÁUSULAS: Condição → Efeito → Avaliação
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.ac_clausulas (
  id                  uuid primary key default gen_random_uuid(),
  atleta_id           uuid not null references public.ac_atletas(id) on delete cascade,
  contrato_id         uuid references public.ac_contratos(id) on delete set null,
  transferencia_id    uuid references public.ac_transferencias(id) on delete set null,
  tipo                public.ac_clausula_tipo not null,
  descricao           text not null,
  contraparte_entidade_id uuid references public.ac_entidades(id) on delete set null,
  logica_condicoes    public.ac_logica not null default 'E',  -- combinação das condições
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
comment on table public.ac_clausulas is 'Cláusula contratual como modelo Condição→Efeito (gatilhos, mais-valia, solidariedade, multa, CETD...).';

create table if not exists public.ac_clausula_condicoes (
  id               uuid primary key default gen_random_uuid(),
  clausula_id      uuid not null references public.ac_clausulas(id) on delete cascade,
  metrica          public.ac_condicao_metrica not null,
  operador         public.ac_condicao_operador not null,
  valor_limite     numeric(18,4) not null,
  valor_limite_2   numeric(18,4),                 -- usado quando operador = ENTRE
  janela           public.ac_condicao_janela not null default 'CONTRATO',
  competicao       text,                          -- quando janela = COMPETICAO
  escopo           public.ac_condicao_escopo not null default 'PROPRIO_ATLETA',
  entidade_clube_id uuid references public.ac_entidades(id) on delete set null, -- quando escopo = RELATIVO_AO_CLUBE
  ordem            int not null default 1,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table public.ac_clausula_condicoes is
  'Condições da cláusula (métrica/operador/limite/janela/escopo). Somáveis a partir de ac_eventos_desempenho.';

create table if not exists public.ac_clausula_efeitos (
  id                    uuid primary key default gen_random_uuid(),
  clausula_id           uuid not null references public.ac_clausulas(id) on delete cascade,
  tipo                  public.ac_efeito_tipo not null,
  -- GERAR_OBRIGACAO / GERAR_RECEITA:
  beneficiario_entidade_id uuid references public.ac_entidades(id) on delete set null,
  natureza              public.ac_obrigacao_natureza,
  valor                 numeric(18,2),
  percentual            numeric(7,4),             -- ex.: % de mais-valia sobre a venda
  moeda_codigo          text references public.ac_moedas(codigo) on delete restrict,
  tratamento_contabil   public.ac_tratamento_contabil,
  rubrica               public.ac_rubrica,
  -- ALTERAR_REMUNERACAO:
  componente_remuneracao public.ac_remuneracao_componente,
  novo_valor            numeric(18,2),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (percentual is null or (percentual >= 0 and percentual <= 100))
);
comment on table public.ac_clausula_efeitos is
  'Efeitos disparados quando as condições são satisfeitas: gerar obrigação/receita ou alterar remuneração (com vigência a partir do atingimento).';

create table if not exists public.ac_clausula_avaliacoes (
  id                 uuid primary key default gen_random_uuid(),
  clausula_id        uuid not null references public.ac_clausulas(id) on delete cascade,
  atleta_id          uuid not null references public.ac_atletas(id) on delete cascade,
  status             public.ac_avaliacao_status not null default 'PENDENTE',
  data_atingimento   date,
  valor_apurado      numeric(18,4),               -- métrica somada na janela/escopo
  obrigacao_gerada_id uuid references public.ac_obrigacoes_financeiras(id) on delete set null,
  remuneracao_gerada_id uuid references public.ac_remuneracoes(id) on delete set null,
  observacoes        text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table public.ac_clausula_avaliacoes is
  'Fecha o ciclo gatilho→efeito→fato: registra atingimento e liga à obrigação/remuneração gerada.';

-- ════════════════════════════════════════════════════════════════════════════
-- 10) DESEMPENHO (insumo dos gatilhos)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.ac_eventos_desempenho (
  id               uuid primary key default gen_random_uuid(),
  atleta_id        uuid not null references public.ac_atletas(id) on delete cascade,
  entidade_clube_id uuid references public.ac_entidades(id) on delete set null, -- clube onde atuou
  temporada        text,                         -- ex.: '2026'
  competicao       text,                         -- ex.: 'Brasileirão Série A'
  data_referencia  date not null,
  jogos            int not null default 0,
  gols             int not null default 0,
  assistencias     int not null default 0,
  minutos          int not null default 0,
  titulos          int not null default 0,
  convocacoes      int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (jogos >= 0 and gols >= 0 and assistencias >= 0 and minutos >= 0 and titulos >= 0 and convocacoes >= 0)
);
comment on table public.ac_eventos_desempenho is
  'Métricas de desempenho por clube/competição/temporada; somadas na janela/escopo para avaliar condições.';

-- ════════════════════════════════════════════════════════════════════════════
-- 11) CONTÁBIL: amortizações do intangível
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.ac_amortizacoes (
  id                  uuid primary key default gen_random_uuid(),
  ativo_intangivel_id uuid not null references public.ac_ativos_intangiveis(id) on delete cascade,
  competencia         date not null,             -- 1º dia do mês
  valor               numeric(18,2) not null,
  acumulado           numeric(18,2) not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (ativo_intangivel_id, competencia),
  check (valor >= 0)
);
comment on table public.ac_amortizacoes is 'Cronograma linear de amortização do direito econômico (competência mensal).';

-- ════════════════════════════════════════════════════════════════════════════
-- 12) DOCUMENTOS
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.ac_documentos (
  id           uuid primary key default gen_random_uuid(),
  atleta_id    uuid not null references public.ac_atletas(id) on delete cascade,
  contrato_id  uuid references public.ac_contratos(id) on delete set null,
  obrigacao_id uuid references public.ac_obrigacoes_financeiras(id) on delete set null,
  tipo         text,                         -- 'CONTRATO','ADITIVO','FATURA'...
  url          text not null,
  descricao    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.ac_documentos is 'Anexos (PDFs de contrato/aditivo/fatura); sempre atrelados a um atleta.';

-- ════════════════════════════════════════════════════════════════════════════
-- 13) FKs circulares remanescentes (clausula ↔ obrigação/efeito/remuneração)
-- ════════════════════════════════════════════════════════════════════════════
alter table public.ac_obrigacoes_financeiras
  drop constraint if exists ac_obrig_clausula_fk;
alter table public.ac_obrigacoes_financeiras
  add constraint ac_obrig_clausula_fk
  foreign key (clausula_id) references public.ac_clausulas(id) on delete set null;

alter table public.ac_obrigacoes_financeiras
  drop constraint if exists ac_obrig_efeito_fk;
alter table public.ac_obrigacoes_financeiras
  add constraint ac_obrig_efeito_fk
  foreign key (clausula_efeito_id) references public.ac_clausula_efeitos(id) on delete set null;

alter table public.ac_remuneracoes
  drop constraint if exists ac_remun_efeito_fk;
alter table public.ac_remuneracoes
  add constraint ac_remun_efeito_fk
  foreign key (origem_efeito_id) references public.ac_clausula_efeitos(id) on delete set null;

-- ════════════════════════════════════════════════════════════════════════════
-- 14) ÍNDICES (FKs + campos de consulta frequente)
-- ════════════════════════════════════════════════════════════════════════════
create index if not exists idx_ac_pj_imagem_atleta      on public.ac_entidades_pj_imagem(atleta_id);
create index if not exists idx_ac_nacionalidades_atleta on public.ac_atleta_nacionalidades(atleta_id);
create index if not exists idx_ac_contratos_atleta      on public.ac_contratos(atleta_id);
create index if not exists idx_ac_contratos_contraparte on public.ac_contratos(entidade_contraparte_id);
create index if not exists idx_ac_aditivos_contrato     on public.ac_aditivos(contrato_id);
create index if not exists idx_ac_transf_atleta         on public.ac_transferencias(atleta_id);
create index if not exists idx_ac_remun_atleta          on public.ac_remuneracoes(atleta_id);
create index if not exists idx_ac_remun_vigencia        on public.ac_remuneracoes(atleta_id, componente, vigencia_inicio);
create index if not exists idx_ac_obrig_atleta          on public.ac_obrigacoes_financeiras(atleta_id);
create index if not exists idx_ac_obrig_contraparte     on public.ac_obrigacoes_financeiras(contraparte_entidade_id);
create index if not exists idx_ac_obrig_direcao         on public.ac_obrigacoes_financeiras(direcao);
create index if not exists idx_ac_obrig_contingente     on public.ac_obrigacoes_financeiras(contingente);
create index if not exists idx_ac_obrig_intangivel      on public.ac_obrigacoes_financeiras(ativo_intangivel_id);
create index if not exists idx_ac_parcelas_obrig        on public.ac_parcelas(obrigacao_id);
create index if not exists idx_ac_parcelas_venc         on public.ac_parcelas(data_vencimento);
create index if not exists idx_ac_parcelas_status       on public.ac_parcelas(status);
create index if not exists idx_ac_clausulas_atleta      on public.ac_clausulas(atleta_id);
create index if not exists idx_ac_cond_clausula         on public.ac_clausula_condicoes(clausula_id);
create index if not exists idx_ac_efeitos_clausula      on public.ac_clausula_efeitos(clausula_id);
create index if not exists idx_ac_aval_clausula         on public.ac_clausula_avaliacoes(clausula_id);
create index if not exists idx_ac_aval_atleta           on public.ac_clausula_avaliacoes(atleta_id);
create index if not exists idx_ac_eventos_atleta        on public.ac_eventos_desempenho(atleta_id);
create index if not exists idx_ac_eventos_clube         on public.ac_eventos_desempenho(entidade_clube_id);
create index if not exists idx_ac_intangiveis_atleta    on public.ac_ativos_intangiveis(atleta_id);
create index if not exists idx_ac_amort_ativo           on public.ac_amortizacoes(ativo_intangivel_id);
create index if not exists idx_ac_documentos_atleta     on public.ac_documentos(atleta_id);
create index if not exists idx_ac_cambio_moeda_data     on public.ac_taxas_cambio(moeda_codigo, data);

-- ════════════════════════════════════════════════════════════════════════════
-- 15) TRIGGERS de updated_at (todas as tabelas ac_*)
-- ════════════════════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  for t in
    select table_name from information_schema.tables
    where table_schema = 'public' and table_name like 'ac\_%' escape '\'
      and table_name not in ('ac_amortizacoes')  -- ex.: nenhuma exceção real; placeholder
  loop
    execute format('drop trigger if exists trg_%1$s_updated on public.%1$s;', t);
    execute format(
      'create trigger trg_%1$s_updated before update on public.%1$s
         for each row execute function public.ac_set_updated_at();', t);
  end loop;
  -- inclui a que ficou de fora do loop acima:
  execute 'drop trigger if exists trg_ac_amortizacoes_updated on public.ac_amortizacoes;';
  execute 'create trigger trg_ac_amortizacoes_updated before update on public.ac_amortizacoes
             for each row execute function public.ac_set_updated_at();';
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 16) ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════════════════════════════
-- Padrão do projeto: todo autenticado LÊ; escrita restrita a master/juridico.
-- Ponto de extensão: para RLS por centro de custo/perfil, trocar o USING de
-- escrita nas tabelas financeiras por algo como:
--   using (public.get_my_role() in ('master','juridico')
--          and (centro_custo_id is null or centro_custo_id = any(public.meus_centros_custo())))
-- onde public.meus_centros_custo() devolve os centros do perfil logado.
do $$
declare t text;
begin
  for t in
    select table_name from information_schema.tables
    where table_schema = 'public' and table_name like 'ac\_%' escape '\'
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "ac read %1$s" on public.%1$s;', t);
    execute format('drop policy if exists "ac write %1$s" on public.%1$s;', t);
    execute format(
      'create policy "ac read %1$s" on public.%1$s for select to authenticated using (true);', t);
    execute format(
      'create policy "ac write %1$s" on public.%1$s for all to authenticated
         using (public.get_my_role() in (''master'',''juridico''))
         with check (public.get_my_role() in (''master'',''juridico''));', t);
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 17) SEED DE DOMÍNIO (moedas)
-- ════════════════════════════════════════════════════════════════════════════
insert into public.ac_moedas (codigo, nome, simbolo) values
  ('BRL','Real','R$'), ('EUR','Euro','€'), ('USD','Dólar','$'), ('GBP','Libra','£')
on conflict (codigo) do nothing;

-- FIM 012

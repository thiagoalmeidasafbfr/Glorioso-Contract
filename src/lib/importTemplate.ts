// src/lib/importTemplate.ts
// Gera o "modelo de importação" — um .xlsx amigável para o usuário final cadastrar
// um atleta do zero (com todos os seus vínculos) sem precisar conhecer UUIDs.
//
// O arquivo tem 3 abas:
//   1) "Comece aqui" — tutorial passo a passo.
//   2) "Avisos"      — disclaimers / regras importantes.
//   3) "Atleta Consolidado" — a MESMA aba lida pelo importador (coluna "Seção"),
//      já com um exemplo preenchido usando códigos curtos e legíveis no lugar
//      dos IDs gigantes (UUIDs) do sistema.
//
// Por que códigos curtos funcionam: na importação os IDs do arquivo são usados
// APENAS para ligar as linhas entre si (parcela → cláusula → vínculo → atleta).
// O sistema gera os UUIDs definitivos automaticamente. Ver athleteConsolidado.ts.

import * as XLSX from 'xlsx'
import { COLS_ATLETA_CONSOLIDADO } from './athleteConsolidado'

export const TEMPLATE_FILENAME = 'atleta-modelo-importacao.xlsx'

type Row = Record<string, string | number>

// Cabeçalhos da aba de dados, na ordem canônica do sistema.
const HEADERS = COLS_ATLETA_CONSOLIDADO.map(c => c.header)

// Prefixo visível no exemplo para que, caso o usuário esqueça de apagá-lo, o
// registro criado seja óbvio e fácil de remover depois.
const EX = 'EXEMPLO — Fulano de Tal'

// ── Exemplo completo: 1 atleta tocando TODAS as seções ──────────────────────
// Os códigos "atleta-1 / vinc-1 / clau-1" são inventados e só valem dentro
// deste arquivo. Troque por qualquer código curto seu (V1, C1, P1...).
const EXAMPLE_ROWS: Row[] = [
  {
    'Seção': 'ATLETA', 'Atleta': EX, 'ID': 'atleta-1', 'Atleta ID': 'atleta-1',
    'Status': 'ATIVO', 'Nome Completo': EX, 'Posição': 'Atacante',
    'Categoria': 'PROFISSIONAL', 'Data Nascimento': '2000-05-15',
    'Nacionalidade': 'Brasil', 'CPF': '000.000.000-00',
    'Agente (Atleta)': 'Agência Exemplo', 'Contato Agente': 'contato@exemplo.com',
    'Observações': 'Apague esta linha e as demais de exemplo antes de importar.',
  },
  {
    'Seção': 'VINCULO', 'Atleta': EX, 'ID': 'vinc-1', 'Atleta ID': 'atleta-1',
    'Vínculo ID': 'vinc-1', 'Tipo': 'ENTRADA', 'Descrição': 'Compra — Clube de Origem',
    'Contraparte': 'Clube de Origem', 'País': 'Brasil', 'Moeda': 'BRL',
    'Valor': 1000000, 'Início': '2026-01-01', 'Término': '2028-12-31',
    'Status': 'ATIVO', 'Salário Base': 100000, 'Moeda Salário': 'BRL',
  },
  {
    'Seção': 'PJ', 'Atleta': EX, 'ID': 'pj-1', 'Atleta ID': 'atleta-1',
    'Razão Social': 'Fulano Sports Ltda', 'CNPJ': '00.000.000/0001-00',
  },
  {
    'Seção': 'CLAUSULA', 'Atleta': EX, 'ID': 'clau-1', 'Atleta ID': 'atleta-1',
    'Vínculo ID': 'vinc-1', 'Tipo': 'TRANSFER_FEE_FIXO',
    'Descrição': 'Transfer fee — Clube de Origem', 'Credor': 'Clube de Origem',
    'Devedor': 'Botafogo SAF', 'Moeda': 'BRL', 'Valor': 1000000,
    'Vencimento': '2026-01-10', 'Status': 'PENDENTE', 'Atingimento': 'PENDENTE',
  },
  {
    'Seção': 'PARCELA', 'Atleta': EX, 'ID': 'parc-1', 'Atleta ID': 'atleta-1',
    'Cláusula ID': 'clau-1', 'Parcela nº': 1, 'Descrição': 'Parcela 1',
    'Moeda': 'BRL', 'Valor': 500000, 'Vencimento': '2026-01-10', 'Status': 'PENDENTE',
  },
  {
    'Seção': 'PARCELA', 'Atleta': EX, 'ID': 'parc-2', 'Atleta ID': 'atleta-1',
    'Cláusula ID': 'clau-1', 'Parcela nº': 2, 'Descrição': 'Parcela 2',
    'Moeda': 'BRL', 'Valor': 500000, 'Vencimento': '2026-07-10', 'Status': 'PENDENTE',
  },
  {
    'Seção': 'META_SALARIO', 'Atleta': EX, 'ID': 'meta-1', 'Atleta ID': 'atleta-1',
    'Vínculo ID': 'vinc-1', 'Descrição': 'Ao atingir 20 jogos, salário sobe',
    'Métrica': 'JOGOS', 'Meta (nº)': 20, 'Novo Salário': 150000, 'Moeda': 'BRL',
  },
  {
    'Seção': 'DETENTOR', 'Atleta': EX, 'ID': 'det-1', 'Atleta ID': 'atleta-1',
    'Percentual (%)': 100, 'Tipo Detentor': 'BFR', 'Detentor': 'Botafogo',
  },
  {
    'Seção': 'DIREITO_IMAGEM', 'Atleta': EX, 'ID': 'img-1', 'Atleta ID': 'atleta-1',
    'PJ (Razão Social)': 'Fulano Sports Ltda', 'Mês (AAAA-MM)': '2026-01',
    'Valor': 20000, 'Moeda': 'BRL', 'Status': 'PENDENTE',
  },
]

// ── Aba "Comece aqui" (tutorial) ────────────────────────────────────────────
const TUTORIAL: string[] = [
  'COMO CADASTRAR UM ATLETA PELA PLANILHA',
  'Botafogo SAF · Gestão de Contratos',
  '',
  'Esta planilha permite cadastrar um atleta inteiro — com contrato, cláusulas,',
  'parcelas, metas, detentores e direito de imagem — de uma só vez.',
  '',
  '───────────────────────────────────────────────',
  'PASSO A PASSO',
  '───────────────────────────────────────────────',
  '',
  '1) Abra a aba "Atleta Consolidado" (a terceira, ao lado).',
  '',
  '2) Ela vem com um EXEMPLO preenchido (linhas marcadas "EXEMPLO — Fulano de Tal").',
  '   Use-o como referência: cada linha é um registro; a coluna "Seção" diz o que é.',
  '',
  '3) APAGUE todas as linhas de exemplo e preencha com os dados do seu atleta.',
  '   Deixe SEMPRE a linha de cabeçalho (a primeira, com os nomes das colunas).',
  '',
  '4) Preencha, no mínimo, UMA linha com Seção = ATLETA (é o cadastro principal).',
  '   As demais seções são opcionais — inclua só o que o atleta tiver.',
  '',
  '5) Salve o arquivo e, no sistema, tela "Atletas" → botão "↑ Importar".',
  '   Confira o preview e clique em "Confirmar Importação".',
  '',
  '───────────────────────────────────────────────',
  'SOBRE OS "IDs GIGANTES" DO EXPORT (leia isto!)',
  '───────────────────────────────────────────────',
  '',
  'Quando você EXPORTA um atleta, cada linha traz um ID enorme, tipo:',
  '   3713a294-192c-4e44-926a-14256dbddc61',
  'Isso é um UUID — o identificador interno que o sistema usa no banco de dados.',
  '',
  'VOCÊ NÃO PRECISA DIGITAR NADA PARECIDO COM ISSO.',
  '',
  'Para cadastrar do zero, use CÓDIGOS CURTOS inventados por você (ex.: V1, C1, P1).',
  'Eles servem SÓ para ligar as linhas entre si dentro deste arquivo. Ao importar,',
  'o sistema ignora esses códigos e gera os UUIDs definitivos automaticamente.',
  '',
  'Como as linhas se ligam pelos códigos:',
  '  • ATLETA   → escolha um código em "Atleta ID" (ex.: atleta-1).',
  '  • VINCULO  → repita o "Atleta ID" e crie um "Vínculo ID" (ex.: vinc-1).',
  '  • CLAUSULA → repita o "Atleta ID", aponte o "Vínculo ID" e crie um "ID" (ex.: clau-1).',
  '  • PARCELA  → repita o "Atleta ID" e aponte a "Cláusula ID" (o "ID" da cláusula-mãe).',
  '  • As demais seções (PJ, META_SALARIO, DETENTOR, DIREITO_IMAGEM) só precisam',
  '    do "Atleta ID"; a de imagem liga-se à PJ pela "PJ (Razão Social)".',
  '',
  'Dica: você pode até deixar "Atleta ID" em branco e o sistema agrupa pelo nome',
  'da coluna "Atleta". Mas contrato/cláusula/parcela SEMPRE precisam dos códigos',
  'curtos para se ligarem corretamente.',
  '',
  '───────────────────────────────────────────────',
  'O QUE É CADA SEÇÃO (coluna "Seção")',
  '───────────────────────────────────────────────',
  '',
  'ATLETA         Dados do atleta. Obrigatório: pelo menos 1 por atleta.',
  'VINCULO        Contrato/vínculo (entrada, saída, empréstimo).',
  'PJ             Pessoa jurídica do atleta (para direito de imagem).',
  'CLAUSULA       Cláusula financeira do vínculo (transfer fee, luvas, etc.).',
  'PARCELA        Parcela de uma cláusula (uma linha por vencimento).',
  'META_SALARIO   Gatilho de reajuste salarial por meta (ex.: 20 jogos).',
  'PASSIVO_CLUBE  Passivo a pagar/receber de outro clube.',
  'PASSIVO_AGENTE Passivo a pagar/receber de agente/intermediário.',
  'DETENTOR       Titularidade dos direitos econômicos (% por detentor).',
  'DIREITO_IMAGEM Parcela mensal de direito de imagem.',
  '',
  '→ Os valores aceitos em cada coluna (Tipo, Moeda, Status...) estão na aba "Avisos".',
]

// ── Aba "Avisos" (disclaimers) ──────────────────────────────────────────────
const AVISOS: string[] = [
  'AVISOS IMPORTANTES — LEIA ANTES DE IMPORTAR',
  '',
  '───────────────────────────────────────────────',
  'REGRAS GERAIS',
  '───────────────────────────────────────────────',
  '',
  '• NÃO renomeie, apague nem reordene as colunas de cabeçalho da aba de dados.',
  '  O sistema reconhece cada campo pelo NOME da coluna.',
  '',
  '• NÃO renomeie a aba "Atleta Consolidado" (é ela que o importador procura,',
  '  pela coluna "Seção").',
  '',
  '• Deixe em branco as colunas que não se aplicam à linha — não escreva "N/A".',
  '',
  '• APAGUE as linhas de exemplo antes de importar. Se esquecer, será criado um',
  '  atleta chamado "EXEMPLO — Fulano de Tal" (basta excluí-lo depois).',
  '',
  '• Reimportar NÃO duplica: atletas com mesmo nome completo ou CPF/passaporte',
  '  já existentes são ignorados na importação.',
  '',
  '───────────────────────────────────────────────',
  'FORMATOS DE PREENCHIMENTO',
  '───────────────────────────────────────────────',
  '',
  '• Datas: use o formato AAAA-MM-DD (ex.: 2026-01-31).',
  '• Mês (imagem): use AAAA-MM (ex.: 2026-01).',
  '• Valores: números puros (ex.: 1500000). Aceita também 1.500.000,00.',
  '• Percentual: número de 0 a 100 (ex.: 50 para 50%).',
  '• Moeda padrão é BRL quando em branco.',
  '',
  '───────────────────────────────────────────────',
  'VALORES ACEITOS (use EXATAMENTE um destes)',
  '───────────────────────────────────────────────',
  '',
  'Moeda:            BRL · EUR · USD · GBP',
  'Categoria:        BASE · PROFISSIONAL · COMISSAO_TECNICA',
  'Status (atleta):  ATIVO · EMPRESTADO · VENDIDO · DESLIGADO',
  '',
  'VINCULO — Tipo:   ENTRADA · SAIDA · EMPRESTIMO_SAIDA · EMPRESTIMO_ENTRADA',
  'VINCULO — Status: ATIVO · ENCERRADO · RESCINDIDO',
  '',
  'CLAUSULA — Tipo:  TRANSFER_FEE_FIXO · TRANSFER_FEE_VARIAVEL · SELL_ON_FEE ·',
  '                  SELL_ON_FEE_RECEBER · INTERMEDIACAO · INTERMEDIACAO_VENDA_FUTURA ·',
  '                  SALARIO_CETD · DIREITO_IMAGEM · LUVAS · BONUS_PERFORMANCE_ATLETA ·',
  '                  SOLIDARIEDADE_FIFA · EMPRESTIMO_TAXA · CLAUSULA_RESCISORIA ·',
  '                  PERCENTUAL_VENDA_ATLETA · ACORDO_RENEGOCIACAO',
  'CLAUSULA — Status:      PENDENTE · PAGA · PARCIALMENTE_PAGA · EM_ATRASO · CANCELADA',
  'CLAUSULA — Atingimento: PENDENTE · ATINGIDA · NAO_ATINGIDA · NAO_APLICAVEL',
  '',
  'PARCELA — Status: PENDENTE · PAGA · EM_ATRASO · CANCELADA',
  '',
  'META_SALARIO — Métrica: JOGOS · GOLS · ASSISTENCIAS · MINUTOS · TITULO · OUTRO',
  '',
  'PASSIVO — Direção:      A_PAGAR · A_RECEBER',
  'PASSIVO — Status:       PENDENTE · PAGA · EM_ATRASO · CANCELADA',
  'PASSIVO — Condicional / Solidariedade: Sim · Não',
  '',
  'DETENTOR — Tipo Detentor: BFR · CLUBE · AGENTE · ATLETA · TERCEIRO',
  '',
  'DIREITO_IMAGEM — Status:  PENDENTE · PAGA · EM_ATRASO · CANCELADA',
]

// Converte uma lista de linhas de texto numa worksheet de coluna única.
function textSheet(lines: string[], colWidth: number): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(lines.map(l => [l]))
  ws['!cols'] = [{ wch: colWidth }]
  return ws
}

// Larguras de coluna da aba de dados (por cabeçalho); demais usam um padrão.
const DATA_WIDTHS: Record<string, number> = {
  'Seção': 15, 'Atleta': 24, 'ID': 12, 'Atleta ID': 12, 'Vínculo ID': 12,
  'Cláusula ID': 12, 'Tipo': 22, 'Descrição': 30, 'Contraparte': 20,
  'Credor': 18, 'Devedor': 16, 'Nome Completo': 24, 'Razão Social': 20,
  'Observações': 34, 'PJ (Razão Social)': 20,
}

function dataSheet(): XLSX.WorkSheet {
  const aoa: (string | number)[][] = [
    HEADERS,
    ...EXAMPLE_ROWS.map(r => HEADERS.map(h => r[h] ?? '')),
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = HEADERS.map(h => ({ wch: DATA_WIDTHS[h] ?? 14 }))
  ws['!freeze'] = { xSplit: 0, ySplit: 1 } // congela o cabeçalho
  return ws
}

/** Monta e baixa o modelo de importação amigável (.xlsx com 3 abas). */
export function downloadImportTemplate(): void {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, textSheet(TUTORIAL, 95), 'Comece aqui')
  XLSX.utils.book_append_sheet(wb, textSheet(AVISOS, 95), 'Avisos')
  XLSX.utils.book_append_sheet(wb, dataSheet(), 'Atleta Consolidado')
  XLSX.writeFile(wb, TEMPLATE_FILENAME)
}

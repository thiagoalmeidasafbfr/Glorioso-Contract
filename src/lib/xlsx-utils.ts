import * as XLSX from 'xlsx'

export interface ColDef {
  key: string
  header: string
}

// ── Column schemas ──────────────────────────────────────────────────

export const COLS_ATLETAS: ColDef[] = [
  { key: 'id',                   header: 'ID' },
  { key: 'nome',                 header: 'Nome' },
  { key: 'nomeCompleto',         header: 'Nome Completo' },
  { key: 'posicao',              header: 'Posição' },
  { key: 'dataNascimento',       header: 'Data Nascimento' },
  { key: 'paisNascimento',       header: 'País Nascimento' },
  { key: 'fotoArquivo',          header: 'Foto Arquivo' },
  { key: 'statusContrato',       header: 'Status Contrato' },
  { key: 'alocacao',             header: 'Alocação' },
  { key: 'clubeAnterior',        header: 'Clube Anterior' },
  { key: 'percSAF',              header: '% SAF' },
  { key: 'inicioContrato',       header: 'Início Contrato' },
  { key: 'fimContrato',          header: 'Fim Contrato' },
  { key: 'salarioCLT',           header: 'Salário CLT' },
  { key: 'direitoImagem',        header: 'Direito de Imagem' },
  { key: 'auxilioMoradiaM',      header: 'Auxílio Moradia (M)' },
  { key: 'auxilioAlimentacaoM',  header: 'Auxílio Alimentação (M)' },
  { key: 'auxilioViagemA',       header: 'Auxílio Viagem (A)' },
  { key: 'outrosAuxiliosM',      header: 'Outros Auxílios (M)' },
  { key: 'transferFeeTotal',     header: 'Transfer Fee Total' },
  { key: 'transferFeeQuitado',   header: 'Transfer Fee Quitado' },
  { key: 'transferFeePendente',  header: 'Transfer Fee Pendente' },
  { key: 'transferFeeAcordo',    header: 'Transfer Fee Acordo' },
  { key: 'transferFeeMoeda',     header: 'Transfer Fee Moeda' },
  { key: 'valorMercado',         header: 'Valor de Mercado' },
  { key: 'valorMercadoMoeda',    header: 'Moeda Valor Mercado' },
  { key: 'multaInternacional',   header: 'Multa Internacional' },
  { key: 'multaNacional',        header: 'Multa Nacional' },
  { key: 'multaCompensatoria',   header: 'Multa Compensatória' },
]

export const COLS_INTERMEDIARIOS_ATLETA: ColDef[] = [
  { key: 'atletaId',        header: 'Atleta ID' },
  { key: 'nome',            header: 'Nome Intermediário' },
  { key: 'percVendaFutura', header: '% Venda Futura' },
]

export const COLS_BICHOS: ColDef[] = [
  { key: 'atletaId',   header: 'Atleta ID' },
  { key: 'competicao', header: 'Competição' },
  { key: 'ano',        header: 'Ano' },
  { key: 'valor',      header: 'Valor' },
]

export const COLS_PAGAMENTOS_CERTOS: ColDef[] = [
  { key: 'id',           header: 'ID' },
  { key: 'atletaId',     header: 'Atleta ID' },
  { key: 'despesa',      header: 'Despesa' },
  { key: 'contrato',     header: 'Contrato' },
  { key: 'parcela',      header: 'Parcela' },
  { key: 'vencimento',   header: 'Vencimento' },
  { key: 'valor',        header: 'Valor' },
  { key: 'moeda',        header: 'Moeda' },
  { key: 'vencAntecipado', header: 'Venc Antecipado' },
  { key: 'parcial',      header: 'Parcial' },
  { key: 'moedaParcial', header: 'Moeda Parcial' },
  { key: 'status',       header: 'Status' },
]

export const COLS_PAGAMENTOS_CONDICIONAIS: ColDef[] = [
  { key: 'id',               header: 'ID' },
  { key: 'atletaId',         header: 'Atleta ID' },
  { key: 'despesa',          header: 'Despesa' },
  { key: 'contrato',         header: 'Contrato' },
  { key: 'detalhesCondicao', header: 'Detalhes Condição' },
  { key: 'valor',            header: 'Valor' },
  { key: 'moeda',            header: 'Moeda' },
  { key: 'vencAntecipado',   header: 'Venc Antecipado' },
  { key: 'vencimento',       header: 'Vencimento' },
  { key: 'parcial',          header: 'Parcial' },
  { key: 'moedaParcial',     header: 'Moeda Parcial' },
  { key: 'status',           header: 'Status' },
]

export const COLS_ACORDOS: ColDef[] = [
  { key: 'id',             header: 'ID' },
  { key: 'atletaId',       header: 'Atleta ID' },
  { key: 'natureza',       header: 'Natureza' },
  { key: 'naturezaDivida', header: 'Natureza Dívida' },
  { key: 'parcela',        header: 'Parcela' },
  { key: 'condicao',       header: 'Condição' },
  { key: 'credor',         header: 'Credor' },
  { key: 'vencAntecipado', header: 'Venc Antecipado' },
  { key: 'valor',          header: 'Valor' },
  { key: 'moedaContrato',  header: 'Moeda Contrato' },
  { key: 'vencimento',     header: 'Vencimento' },
  { key: 'dataLiquidacao', header: 'Data Liquidação' },
  { key: 'status',         header: 'Status' },
]

export const COLS_CONDICIONAIS_SALARIO: ColDef[] = [
  { key: 'id',       header: 'ID' },
  { key: 'atletaId', header: 'Atleta ID' },
  { key: 'condicao', header: 'Condição' },
  { key: 'despesa',  header: 'Despesa' },
  { key: 'detalhes', header: 'Detalhes' },
  { key: 'valor',    header: 'Valor' },
  { key: 'moeda',    header: 'Moeda' },
  { key: 'status',   header: 'Status' },
]

export const COLS_PASSIVOS_CLUBE: ColDef[] = [
  { key: 'id',                  header: 'ID' },
  { key: 'atletaId',            header: 'Atleta ID' },
  { key: 'contrato',            header: 'Contrato' },
  { key: 'despesa',             header: 'Despesa' },
  { key: 'credor',              header: 'Credor' },
  { key: 'condicional',         header: 'Condicional' },
  { key: 'parcela',             header: 'Parcela' },
  { key: 'vencimento',          header: 'Vencimento' },
  { key: 'valor',               header: 'Valor' },
  { key: 'moeda',               header: 'Moeda' },
  { key: 'parcial',             header: 'Parcial' },
  { key: 'moedaParcial',        header: 'Moeda Parcial' },
  { key: 'saldoMoedaContrato',  header: 'Saldo Moeda Contrato' },
  { key: 'saldoBRL',            header: 'Saldo BRL' },
  { key: 'condicao',            header: 'Condição' },
  { key: 'vencAntecipado',      header: 'Venc Antecipado' },
  { key: 'solidariedade',       header: 'Solidariedade' },
  { key: 'dataLiquidacao',      header: 'Data Liquidação' },
  { key: 'status',              header: 'Status' },
]

export const COLS_PASSIVOS_INTERMEDIARIO: ColDef[] = [
  { key: 'id',             header: 'ID' },
  { key: 'atletaId',       header: 'Atleta ID' },
  { key: 'contrato',       header: 'Contrato' },
  { key: 'despesa',        header: 'Despesa' },
  { key: 'intermediario',  header: 'Intermediário' },
  { key: 'condicional',    header: 'Condicional' },
  { key: 'parcela',        header: 'Parcela' },
  { key: 'vencimento',     header: 'Vencimento' },
  { key: 'valor',          header: 'Valor' },
  { key: 'moeda',          header: 'Moeda' },
  { key: 'parcial',        header: 'Parcial' },
  { key: 'moedaParcial',   header: 'Moeda Parcial' },
  { key: 'saldoBRL',       header: 'Saldo BRL' },
  { key: 'condicao',       header: 'Condição' },
  { key: 'teorMulta',      header: 'Teor Multa' },
  { key: 'vencAntecipado', header: 'Venc Antecipado' },
  { key: 'dataLiquidacao', header: 'Data Liquidação' },
  { key: 'status',         header: 'Status' },
]

export const COLS_PARCELAS_IMAGEM: ColDef[] = [
  { key: 'id',       header: 'ID' },
  { key: 'atletaId', header: 'Atleta ID' },
  { key: 'mes',      header: 'Mês (AAAA-MM)' },
  { key: 'valor',    header: 'Valor' },
  { key: 'status',   header: 'Status' },
]

// ── Export ──────────────────────────────────────────────────────────

type Row = Record<string, unknown>

export function exportWorkbook(
  sheets: { name: string; cols: ColDef[]; rows: Row[] }[],
  filename: string,
) {
  const wb = XLSX.utils.book_new()
  for (const { name, cols, rows } of sheets) {
    const aoa = [
      cols.map(c => c.header),
      ...rows.map(row => cols.map(c => row[c.key] ?? '')),
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name)
  }
  XLSX.writeFile(wb, filename)
}

// ── Import ──────────────────────────────────────────────────────────

export async function parseWorkbookFile(
  file: File,
): Promise<Record<string, Record<string, string>[]>> {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true })
  const result: Record<string, Record<string, string>[]> = {}
  for (const name of wb.SheetNames) {
    result[name] = XLSX.utils.sheet_to_json<Record<string, string>>(
      wb.Sheets[name],
      { raw: false, dateNF: 'yyyy-mm-dd' },
    )
  }
  return result
}

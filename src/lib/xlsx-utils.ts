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

// ── Schemas do modelo atleta-central (novo) ─────────────────────────
// Colunas alinhadas às tabelas do Supabase (migrations 004–006). O atleta é a
// figura central: passivos, imagem e gatilhos referenciam "Atleta ID".

export const COLS_ATHLETES: ColDef[] = [
  { key: 'id',              header: 'ID' },
  { key: 'full_name',       header: 'Nome Completo' },
  { key: 'short_name',      header: 'Nome Curto' },
  { key: 'position',        header: 'Posição' },
  { key: 'current_status',  header: 'Status' },
  { key: 'birth_date',      header: 'Data Nascimento' },
  { key: 'nationality',     header: 'Nacionalidade' },
  { key: 'cpf',             header: 'CPF' },
  { key: 'passport_number', header: 'Passaporte' },
  { key: 'agent_name',      header: 'Agente' },
  { key: 'agent_contact',   header: 'Contato Agente' },
  { key: 'notes',           header: 'Observações' },
]

export const COLS_SALARY_TRIGGERS: ColDef[] = [
  { key: 'id',            header: 'ID' },
  { key: 'athlete_id',    header: 'Atleta ID' },
  { key: 'contract_id',   header: 'Contrato ID' },
  { key: 'description',   header: 'Descrição' },
  { key: 'metric',        header: 'Métrica' },
  { key: 'threshold',     header: 'Meta (nº)' },
  { key: 'new_salary',    header: 'Novo Salário' },
  { key: 'currency',      header: 'Moeda' },
  { key: 'status',        header: 'Status' },
  { key: 'achieved_date', header: 'Data Atingida' },
  { key: 'notes',         header: 'Observações' },
]

export const COLS_CLUB_LIABILITIES: ColDef[] = [
  { key: 'id',                    header: 'ID' },
  { key: 'athlete_id',            header: 'Atleta ID' },
  { key: 'club_name',             header: 'Clube' },
  { key: 'description',           header: 'Descrição' },
  { key: 'direction',             header: 'Direção' },
  { key: 'amount',                header: 'Valor' },
  { key: 'currency',              header: 'Moeda' },
  { key: 'due_date',              header: 'Vencimento' },
  { key: 'conditional',           header: 'Condicional' },
  { key: 'condition_description', header: 'Condição' },
  { key: 'solidarity',            header: 'Solidariedade' },
  { key: 'status',                header: 'Status' },
  { key: 'settled_date',          header: 'Data Liquidação' },
  { key: 'notes',                 header: 'Observações' },
]

export const COLS_INTERMEDIARY_LIABILITIES: ColDef[] = [
  { key: 'id',                    header: 'ID' },
  { key: 'athlete_id',            header: 'Atleta ID' },
  { key: 'intermediary_name',     header: 'Agente' },
  { key: 'description',           header: 'Descrição' },
  { key: 'direction',             header: 'Direção' },
  { key: 'amount',                header: 'Valor' },
  { key: 'currency',              header: 'Moeda' },
  { key: 'due_date',              header: 'Vencimento' },
  { key: 'conditional',           header: 'Condicional' },
  { key: 'condition_description', header: 'Condição' },
  { key: 'penalty_terms',         header: 'Teor Multa' },
  { key: 'status',                header: 'Status' },
  { key: 'settled_date',          header: 'Data Liquidação' },
  { key: 'notes',                 header: 'Observações' },
]

export const COLS_IMAGE_RIGHTS: ColDef[] = [
  { key: 'id',         header: 'ID' },
  { key: 'athlete_id', header: 'Atleta ID' },
  { key: 'month',      header: 'Mês (AAAA-MM)' },
  { key: 'amount',     header: 'Valor' },
  { key: 'currency',   header: 'Moeda' },
  { key: 'status',     header: 'Status' },
  { key: 'paid_date',  header: 'Data Pagamento' },
  { key: 'notes',      header: 'Observações' },
]

export const COLS_CONTRACTS: ColDef[] = [
  { key: 'id',                 header: 'ID' },
  { key: 'athlete_id',         header: 'Atleta ID' },
  { key: 'type',               header: 'Tipo' },            // ENTRADA/SAIDA/EMPRESTIMO_SAIDA/EMPRESTIMO_ENTRADA
  { key: 'counterpart_club',   header: 'Clube/Contraparte' },
  { key: 'counterpart_country', header: 'País' },
  { key: 'start_date',         header: 'Início' },
  { key: 'end_date',           header: 'Término' },
  { key: 'status',             header: 'Status' },          // ATIVO/ENCERRADO/RESCINDIDO
  { key: 'transfer_fee_gross', header: 'Valor Transferência' },
  { key: 'transfer_currency',  header: 'Moeda Transf.' },
  { key: 'base_salary',        header: 'Salário Base' },
  { key: 'image_value',        header: 'Imagem' },
  { key: 'other_value',        header: 'Outros' },
  { key: 'salary_currency',    header: 'Moeda Salário' },
  { key: 'description',        header: 'Descrição' },
]

export const COLS_CLUBS: ColDef[] = [
  { key: 'id',      header: 'ID' },
  { key: 'name',    header: 'Nome' },
  { key: 'country', header: 'País' },
  { key: 'notes',   header: 'Observações' },
]

export const COLS_AGENTS: ColDef[] = [
  { key: 'id',      header: 'ID' },
  { key: 'name',    header: 'Nome' },
  { key: 'contact', header: 'Contato' },
  { key: 'notes',   header: 'Observações' },
]

export const COLS_ECONOMIC_RIGHTS: ColDef[] = [
  { key: 'id',          header: 'ID' },
  { key: 'athlete_id',  header: 'Atleta ID' },
  { key: 'holder_type', header: 'Tipo Detentor' },   // BFR/CLUBE/AGENTE/ATLETA/TERCEIRO
  { key: 'holder_name', header: 'Detentor' },
  { key: 'percentage',  header: 'Percentual' },
  { key: 'notes',       header: 'Observações' },
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

// src/lib/access.ts
// Catálogo de MÓDULOS da plataforma e regras de acesso por rota.
//
// Cada perfil de acesso (tabela `access_roles`, migração 019) dá a cada módulo
// um nível: 'none' (não vê), 'view' (consulta) ou 'edit' (consulta e edita).
// As chaves aqui são as MESMAS usadas pela RLS no banco (can_edit('atletas')…):
//   • leitura dos dados: qualquer usuário ativo (os relatórios cruzam tudo) —
//     o nível 'view' controla quais TELAS aparecem;
//   • escrita: o banco só aceita de quem tem 'edit' no módulo dono da tabela.

export type AccessLevel = 'none' | 'view' | 'edit'
export type ModuleKey = 'dashboards' | 'atletas' | 'cadastros' | 'modelo' | 'relatorios' | 'dados' | 'usuarios'
export type Permissions = Partial<Record<ModuleKey, AccessLevel>>

export interface ModuleDef {
  key: ModuleKey
  label: string
  /** O que 'view' e 'edit' liberam (vai para a matriz de permissões). */
  description: string
  /** Módulos só de leitura (painéis, relatórios) não oferecem 'edit'. */
  editable: boolean
}

export const MODULES: ModuleDef[] = [
  { key: 'dashboards', label: 'Dashboards',            editable: false, description: 'Painéis e visão geral.' },
  { key: 'atletas',    label: 'Atletas e contratos',   editable: true,  description: 'Atletas, vínculos, cláusulas, parcelas, passivos, direitos e o assistente de criação. Editar inclui registrar pagamentos.' },
  { key: 'cadastros',  label: 'Clubes e agentes',      editable: true,  description: 'Cadastro de clubes e agentes.' },
  { key: 'modelo',     label: 'Modelo financeiro',     editable: true,  description: 'Premissas por atleta.' },
  { key: 'relatorios', label: 'Relatórios',            editable: false, description: 'Todos os relatórios. As ações nas linhas seguem a permissão de Atletas e contratos.' },
  { key: 'dados',      label: 'Importar / exportar',   editable: true,  description: 'Consultar exporta planilhas; editar também importa.' },
  { key: 'usuarios',   label: 'Usuários e acessos',    editable: true,  description: 'Consultar vê usuários e perfis; editar cria usuários, troca senhas e altera permissões.' },
]

export const MODULE_KEYS = MODULES.map(m => m.key)

/** Acesso total — usado no modo local (sem login) e no perfil master. */
export const FULL_ACCESS: Permissions = Object.fromEntries(MODULE_KEYS.map(k => [k, 'edit'])) as Permissions

const RANK: Record<AccessLevel, number> = { none: 0, view: 1, edit: 2 }

export function levelOf(perms: Permissions | null | undefined, module: ModuleKey): AccessLevel {
  return perms?.[module] ?? 'none'
}

export function allows(perms: Permissions | null | undefined, module: ModuleKey, level: Exclude<AccessLevel, 'none'> = 'view'): boolean {
  return RANK[levelOf(perms, module)] >= RANK[level]
}

/** Módulo da TELA (quem pode abrir a rota). */
export function moduleForPath(path: string): ModuleKey {
  if (path.startsWith('/dashboard')) return 'dashboards'
  if (path.startsWith('/clubes') || path.startsWith('/intermediarios')) return 'cadastros'
  if (path.startsWith('/modelo')) return 'modelo'
  if (path.startsWith('/relatorios')) return 'relatorios'
  if (path.startsWith('/dados')) return 'dados'
  if (path.startsWith('/usuarios')) return 'usuarios'
  return 'atletas'
}

/** Módulo dos DADOS que a tela grava: painéis e relatórios só alteram dados
 *  de atletas (pagamentos, parcelas) pelas ações das linhas. */
export function editModuleForPath(path: string): ModuleKey {
  const m = moduleForPath(path)
  return m === 'dashboards' || m === 'relatorios' ? 'atletas' : m
}

/** Primeira tela que o perfil pode abrir (destino de "/" e das rotas negadas). */
const HOME_BY_MODULE: [ModuleKey, string][] = [
  ['atletas', '/atletas'], ['dashboards', '/dashboards'], ['relatorios', '/relatorios/visao-atletas'],
  ['cadastros', '/clubes'], ['modelo', '/modelo/premissas'], ['dados', '/dados'], ['usuarios', '/usuarios'],
]

export function homePath(perms: Permissions | null | undefined): string | null {
  return HOME_BY_MODULE.find(([m]) => allows(perms, m))?.[1] ?? null
}

/** Normaliza o JSON do banco: chaves desconhecidas e valores inválidos caem fora. */
export function parsePermissions(raw: unknown): Permissions {
  const out: Permissions = {}
  if (raw && typeof raw === 'object') {
    for (const k of MODULE_KEYS) {
      const v = (raw as Record<string, unknown>)[k]
      if (v === 'view' || v === 'edit' || v === 'none') out[k] = v
    }
  }
  return out
}

/** Traduz os erros do banco (RLS e gatilhos da migração 019) para o usuário. */
export function friendlyAccessError(message: string): string {
  if (/row-level security|permission denied/i.test(message)) return 'Seu perfil não tem permissão para esta alteração.'
  return message
}

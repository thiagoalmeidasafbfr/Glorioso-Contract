import './index.css'
import { Fragment, useEffect, type ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider, useApp } from './context/AppContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { USE_SUPABASE } from './lib/supabase'
import Layout from './components/Layout'
import Wordmark from './components/Wordmark'
import PageLogin from './pages/PageLogin'
import PageDefinirSenha from './pages/PageDefinirSenha'
import { RequireAccess, HomeRedirect, AccessPending, ConnectionError } from './components/AccessGuard'
import { homePath, type AccessLevel, type ModuleKey } from './lib/access'

// Sistema de atletas
import PageDashboard from './pages/PageDashboard'
import PageAlbum from './pages/PageAlbum'
import PageAthletesList from './pages/PageAthletesList'
import PageAthleteDetail from './pages/PageAthleteDetail'
import PageWizard from './pages/PageWizard'
import PageDashboards from './pages/PageDashboards'
import PageAthleteNewContract from './pages/PageAthleteNewContract'
import PageClauseDetail from './pages/PageClauseDetail'

// Cadastros (clubes / intermediários)
import PageCadastros from './pages/PageCadastros'
import PageCadastroDetail from './pages/PageCadastroDetail'

// Relatórios
import PageAcordos from './pages/PageAcordos'
import PageConsolidado from './pages/PageConsolidado'
import PageVisaoAtletas from './pages/PageVisaoAtletas'
import PageRelSellOn from './pages/PageRelSellOn'
import PageRelDirEconomicos from './pages/PageRelDirEconomicos'
import PageRelGatilhos from './pages/PageRelGatilhos'
import PageRecuperacaoJudicial from './pages/PageRecuperacaoJudicial'
import PageDados from './pages/PageDados'
import PageImportarPlanilhas from './pages/PageImportarPlanilhas'
import PageAmortizacao from './pages/PageAmortizacao'
import PageDetalhamentoJogadores from './pages/PageDetalhamentoJogadores'

// Administração
import PageUsuarios from './pages/PageUsuarios'
import { tr } from './i18n'

// Troca de idioma remonta a árvore: todo texto passa por tr() no render, e
// rótulos calculados fora de componentes também são refeitos no novo idioma.
function LanguageBoundary({ children }: { children: ReactNode }) {
  const { language } = useApp()
  useEffect(() => { document.title = tr('Botafogo SAF · Gestão Contratual') }, [language])
  return <Fragment key={language}>{children}</Fragment>
}

// Rota restrita a um módulo (ver lib/access.ts). Telas que só servem para
// criar/importar exigem 'edit'; as demais, 'view'.
function guard(module: ModuleKey, element: ReactNode, level: Exclude<AccessLevel, 'none'> = 'view') {
  return <RequireAccess module={module} level={level}>{element}</RequireAccess>
}

function AppRoutes() {
  const { session, profile, permissions, loading, authError, mustSetPassword } = useAuth()

  if (USE_SUPABASE && loading) {
    return (
      <div role="status" style={{
        minHeight: '100vh', background: 'var(--surface-page)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-3)',
      }}>
        <Wordmark compact size={18} />
        <span className="eyebrow">{tr('Carregando…')}</span>
      </div>
    )
  }

  if (USE_SUPABASE && !session) {
    return (
      <Routes>
        <Route path="*" element={<PageLogin />} />
      </Routes>
    )
  }

  if (USE_SUPABASE && authError && !profile) return <ConnectionError />
  if (USE_SUPABASE && mustSetPassword) return <PageDefinirSenha />
  // Entrou, mas está desativado (ou sem perfil): não vê nada — a RLS também
  // não devolve dados para ele.
  if (USE_SUPABASE && !profile?.ativo) return <AccessPending />
  // Perfil sem nenhuma tela liberada.
  if (USE_SUPABASE && !homePath(permissions)) return <AccessPending noModules />

  return (
    <AppProvider>
      <LanguageBoundary>
      <Layout>
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/criar" element={guard('atletas', <PageWizard />, 'edit')} />
          <Route path="/dashboards" element={guard('dashboards', <PageDashboards />)} />

          {/* Atletas */}
          <Route path="/dashboard" element={guard('dashboards', <PageDashboard />)} />
          <Route path="/album" element={guard('atletas', <PageAlbum />)} />
          <Route path="/atletas" element={guard('atletas', <PageAthletesList />)} />
          <Route path="/atletas/:id" element={guard('atletas', <PageAthleteDetail />)} />
          <Route path="/atletas/:id/contratos/novo" element={guard('atletas', <PageAthleteNewContract />, 'edit')} />
          <Route path="/obrigacoes/:clauseId" element={guard('atletas', <PageClauseDetail />)} />

          {/* Cadastros */}
          <Route path="/clubes" element={guard('cadastros', <PageCadastros kind="clube" />)} />
          <Route path="/clubes/:id" element={guard('cadastros', <PageCadastroDetail kind="clube" />)} />
          <Route path="/intermediarios" element={guard('cadastros', <PageCadastros kind="intermediario" />)} />
          <Route path="/intermediarios/:id" element={guard('cadastros', <PageCadastroDetail kind="intermediario" />)} />

          {/* Relatórios */}
          <Route path="/relatorios/visao-atletas" element={guard('relatorios', <PageVisaoAtletas />)} />
          <Route path="/relatorios/consolidado" element={guard('relatorios', <PageConsolidado />)} />
          <Route path="/relatorios/acordos" element={guard('relatorios', <PageAcordos />)} />
          <Route path="/relatorios/sell-on" element={guard('relatorios', <PageRelSellOn />)} />
          <Route path="/relatorios/direitos-economicos" element={guard('relatorios', <PageRelDirEconomicos />)} />
          <Route path="/relatorios/gatilhos" element={guard('relatorios', <PageRelGatilhos />)} />
          <Route path="/relatorios/recuperacao-judicial" element={guard('relatorios', <PageRecuperacaoJudicial />)} />
          <Route path="/relatorios/amortizacao" element={guard('relatorios', <PageAmortizacao />)} />
          <Route path="/relatorios/jogadores" element={guard('relatorios', <PageDetalhamentoJogadores />)} />
          <Route path="/relatorios/salarios" element={<Navigate to="/relatorios/jogadores" replace />} />

          {/* Premissas por atleta foram removidas: links antigos vão para o início. */}
          <Route path="/modelo/*" element={<HomeRedirect />} />
          {/* Compat: redireciona os relatórios antigos por natureza ao consolidado. */}
          <Route path="/relatorios/:kind" element={<Navigate to="/relatorios/consolidado" replace />} />

          {/* Importar / Exportar */}
          <Route path="/dados" element={guard('dados', <PageDados />)} />
          <Route path="/dados/planilhas" element={guard('dados', <PageImportarPlanilhas />, 'edit')} />

          {/* Administração */}
          <Route path="/usuarios" element={guard('usuarios', <PageUsuarios />)} />

          <Route path="*" element={<HomeRedirect />} />
        </Routes>
      </Layout>
      </LanguageBoundary>
    </AppProvider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}

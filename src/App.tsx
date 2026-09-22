import './index.css'
import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { USE_SUPABASE } from './lib/supabase'
import Layout from './components/Layout'
import PageLogin from './pages/PageLogin'

// Rotas carregadas sob demanda: xlsx/recharts e as páginas pesadas saem do
// bundle inicial (antes ~1,8 MB num único chunk, inclusive na tela de login).
// Sistema de atletas
const PageDashboard = lazy(() => import('./pages/PageDashboard'))
const PageAlbum = lazy(() => import('./pages/PageAlbum'))
const PageAthletesList = lazy(() => import('./pages/PageAthletesList'))
const PageAthleteDetail = lazy(() => import('./pages/PageAthleteDetail'))
const PageWizard = lazy(() => import('./pages/PageWizard'))
const PageDashboards = lazy(() => import('./pages/PageDashboards'))
const PageAthleteNewContract = lazy(() => import('./pages/PageAthleteNewContract'))
const PageClauseDetail = lazy(() => import('./pages/PageClauseDetail'))

// Cadastros (clubes / intermediários)
const PageCadastros = lazy(() => import('./pages/PageCadastros'))
const PageCadastroDetail = lazy(() => import('./pages/PageCadastroDetail'))

// Relatórios
const PageAcordos = lazy(() => import('./pages/PageAcordos'))
const PageConsolidado = lazy(() => import('./pages/PageConsolidado'))
const PageVisaoAtletas = lazy(() => import('./pages/PageVisaoAtletas'))
const PageRelSellOn = lazy(() => import('./pages/PageRelSellOn'))
const PageRelDirEconomicos = lazy(() => import('./pages/PageRelDirEconomicos'))
const PageRelGatilhos = lazy(() => import('./pages/PageRelGatilhos'))
const PageRecuperacaoJudicial = lazy(() => import('./pages/PageRecuperacaoJudicial'))
const PageDados = lazy(() => import('./pages/PageDados'))
const PageImportarPlanilhas = lazy(() => import('./pages/PageImportarPlanilhas'))
const PageAmortizacao = lazy(() => import('./pages/PageAmortizacao'))
const PagePremissas = lazy(() => import('./pages/PagePremissas'))

// Governança (Fase 3) e alertas
const PageAlertas = lazy(() => import('./pages/PageAlertas'))
const PageAprovacoes = lazy(() => import('./pages/PageAprovacoes'))
const PageUsuarios = lazy(() => import('./pages/PageUsuarios'))
const PageAuditoria = lazy(() => import('./pages/PageAuditoria'))

function RouteFallback() {
  return (
    <div role="status" aria-live="polite" style={{ padding: 32, fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-muted)' }}>
      Carregando…
    </div>
  )
}

function AppRoutes() {
  const { session, loading } = useAuth()

  if (USE_SUPABASE && loading) {
    return (
      <div style={{
        minHeight: '100vh', background: '#1a1410',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "var(--font-label)", fontSize: 11,
        color: 'rgba(243,238,226,0.78)', letterSpacing: '0.14em',
      }}>
        CARREGANDO...
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

  return (
    <AppProvider>
      <Layout>
        <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Navigate to="/atletas" replace />} />
          <Route path="/criar" element={<PageWizard />} />
          <Route path="/dashboards" element={<PageDashboards />} />

          {/* Atletas */}
          <Route path="/dashboard" element={<PageDashboard />} />
          <Route path="/album" element={<PageAlbum />} />
          <Route path="/atletas" element={<PageAthletesList />} />
          <Route path="/atletas/:id" element={<PageAthleteDetail />} />
          <Route path="/atletas/:id/contratos/novo" element={<PageAthleteNewContract />} />
          <Route path="/obrigacoes/:clauseId" element={<PageClauseDetail />} />

          {/* Cadastros */}
          <Route path="/clubes" element={<PageCadastros kind="clube" />} />
          <Route path="/clubes/:id" element={<PageCadastroDetail kind="clube" />} />
          <Route path="/intermediarios" element={<PageCadastros kind="intermediario" />} />
          <Route path="/intermediarios/:id" element={<PageCadastroDetail kind="intermediario" />} />

          {/* Relatórios */}
          <Route path="/relatorios/visao-atletas" element={<PageVisaoAtletas />} />
          <Route path="/relatorios/consolidado" element={<PageConsolidado />} />
          <Route path="/relatorios/acordos" element={<PageAcordos />} />
          <Route path="/relatorios/sell-on" element={<PageRelSellOn />} />
          <Route path="/relatorios/direitos-economicos" element={<PageRelDirEconomicos />} />
          <Route path="/relatorios/gatilhos" element={<PageRelGatilhos />} />
          <Route path="/relatorios/recuperacao-judicial" element={<PageRecuperacaoJudicial />} />
          <Route path="/relatorios/amortizacao" element={<PageAmortizacao />} />

          {/* Modelo financeiro (CFO) */}
          <Route path="/modelo/premissas" element={<PagePremissas />} />
          {/* Compat: redireciona os relatórios antigos por natureza ao consolidado. */}
          <Route path="/relatorios/:kind" element={<Navigate to="/relatorios/consolidado" replace />} />

          {/* Importar / Exportar */}
          <Route path="/dados" element={<PageDados />} />
          <Route path="/dados/planilhas" element={<PageImportarPlanilhas />} />

          {/* Governança e alertas (as páginas checam o papel; o banco garante) */}
          <Route path="/alertas" element={<PageAlertas />} />
          <Route path="/aprovacoes" element={<PageAprovacoes />} />
          <Route path="/admin/usuarios" element={<PageUsuarios />} />
          <Route path="/admin/auditoria" element={<PageAuditoria />} />

          <Route path="*" element={<Navigate to="/atletas" replace />} />
        </Routes>
        </Suspense>
      </Layout>
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

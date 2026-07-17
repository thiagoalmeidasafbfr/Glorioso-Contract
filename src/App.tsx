import './index.css'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { USE_SUPABASE } from './lib/supabase'
import Layout from './components/Layout'
import PageLogin from './pages/PageLogin'

// Sistema de atletas
import PageDashboard from './pages/PageDashboard'
import PageAlbum from './pages/PageAlbum'
import PageAthletesList from './pages/PageAthletesList'
import PageAthleteDetail from './pages/PageAthleteDetail'
import PageWizard from './pages/PageWizard'
import PageDashboards from './pages/PageDashboards'
import PageAthleteNewContract from './pages/PageAthleteNewContract'

// Cadastros (clubes / intermediários)
import PageCadastros from './pages/PageCadastros'
import PageCadastroDetail from './pages/PageCadastroDetail'

// Relatórios
import PageRelatorio from './pages/PageRelatorio'
import PageConsolidado from './pages/PageConsolidado'
import PageDados from './pages/PageDados'
import PageImportarPlanilhas from './pages/PageImportarPlanilhas'

function AppRoutes() {
  const { session, loading } = useAuth()

  if (USE_SUPABASE && loading) {
    return (
      <div style={{
        minHeight: '100vh', background: '#1a1410',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'IBM Plex Mono', monospace", fontSize: 11,
        color: 'rgba(243,238,226,0.40)', letterSpacing: '0.14em',
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

          {/* Cadastros */}
          <Route path="/clubes" element={<PageCadastros kind="clube" />} />
          <Route path="/clubes/:id" element={<PageCadastroDetail kind="clube" />} />
          <Route path="/intermediarios" element={<PageCadastros kind="intermediario" />} />
          <Route path="/intermediarios/:id" element={<PageCadastroDetail kind="intermediario" />} />

          {/* Relatórios */}
          <Route path="/relatorios/consolidado" element={<PageConsolidado />} />
          <Route path="/relatorios/:kind" element={<PageRelatorio />} />

          {/* Importar / Exportar */}
          <Route path="/dados" element={<PageDados />} />
          <Route path="/dados/planilhas" element={<PageImportarPlanilhas />} />

          <Route path="*" element={<Navigate to="/atletas" replace />} />
        </Routes>
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

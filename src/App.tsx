import './index.css'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { USE_SUPABASE } from './lib/supabase'
import Layout from './components/Layout'
import PageLogin from './pages/PageLogin'

// Páginas do sistema de atletas (novo)
import PageDashboard from './pages/PageDashboard'
import PageAthletesList from './pages/PageAthletesList'
import PageAthleteDetail from './pages/PageAthleteDetail'
import PageAthleteNewContract from './pages/PageAthleteNewContract'

// Páginas legadas
import PageConsolidado from './pages/PageConsolidado'
import PageClubes from './pages/PageClubes'
import PageIntermediarios from './pages/PageIntermediarios'
import PageImagem from './pages/PageImagem'
import PageImport from './pages/PageImport'
import PageClausulas from './pages/PageClausulas'

function AppRoutes() {
  const { session, loading, isMaster } = useAuth()

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

          {/* ── Sistema de Atletas (principal) ── */}
          <Route path="/dashboard" element={<PageDashboard />} />
          <Route path="/atletas" element={<PageAthletesList />} />
          <Route path="/atletas/:id" element={<PageAthleteDetail />} />
          <Route path="/atletas/:id/contratos/novo" element={<PageAthleteNewContract />} />

          {/* ── Páginas legadas ── */}
          <Route path="/consolidado" element={<PageConsolidado />} />
          <Route path="/clubes" element={<PageClubes />} />
          <Route path="/intermediarios" element={<PageIntermediarios />} />
          <Route path="/imagem" element={<PageImagem />} />
          <Route path="/clausulas-venda" element={<PageClausulas />} />
          {isMaster && <Route path="/import" element={<PageImport />} />}

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

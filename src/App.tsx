import './index.css'
import { AppProvider } from './context/AppContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { USE_SUPABASE } from './lib/supabase'
import Layout from './components/Layout'
import PageAtletas from './pages/PageAtletas'
import PageClubes from './pages/PageClubes'
import PageIntermediarios from './pages/PageIntermediarios'
import PageConsolidado from './pages/PageConsolidado'
import PageImagem from './pages/PageImagem'
import PageLogin from './pages/PageLogin'
import PageImport from './pages/PageImport'

function AppInner() {
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
    return <PageLogin />
  }

  return (
    <AppProvider>
      <Layout>
        {(page) => {
          if (page === 'import' && isMaster) return <PageImport />
          switch (page) {
            case 'atletas':        return <PageAtletas />
            case 'clubes':         return <PageClubes />
            case 'intermediarios': return <PageIntermediarios />
            case 'consolidado':    return <PageConsolidado />
            case 'imagem':         return <PageImagem />
            default:               return <PageAtletas />
          }
        }}
      </Layout>
    </AppProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}

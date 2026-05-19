import './index.css'
import { AppProvider } from './context/AppContext'
import Layout from './components/Layout'
import PageAtletas from './pages/PageAtletas'
import PageClubes from './pages/PageClubes'
import PageIntermediarios from './pages/PageIntermediarios'
import PageConsolidado from './pages/PageConsolidado'
import PageImagem from './pages/PageImagem'

export default function App() {
  return (
    <AppProvider>
      <Layout>
        {(page) => {
          switch (page) {
            case 'atletas':       return <PageAtletas />
            case 'clubes':        return <PageClubes />
            case 'intermediarios':return <PageIntermediarios />
            case 'consolidado':   return <PageConsolidado />
            case 'imagem':        return <PageImagem />
            default:              return <PageAtletas />
          }
        }}
      </Layout>
    </AppProvider>
  )
}

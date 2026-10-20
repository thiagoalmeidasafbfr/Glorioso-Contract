// Restrição de acesso por módulo no app (a mesma regra é imposta no banco
// pela RLS da migração 019 — esconder a tela aqui é conforto, não segurança).
//   • <RequireAccess module level> envolve a rota; sem permissão, mostra o aviso;
//   • <HomeRedirect> leva "/" e rotas desconhecidas à primeira tela permitida;
//   • <AccessPending> é a tela cheia de quem entrou mas está desativado, sem
//     perfil ou com um perfil que não libera nenhuma tela.

import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { homePath, MODULES, type AccessLevel, type ModuleKey } from '../lib/access'
import AuthScreen from './AuthScreen'
import PageHero from './PageHero'
import { Icon } from './Icon'
import { tr, trf } from '../i18n'

export function RequireAccess({ module, level = 'view', children }: {
  module: ModuleKey; level?: Exclude<AccessLevel, 'none'>; children: React.ReactNode
}) {
  const { can, permissions } = useAuth()
  if (can(module, level)) return <>{children}</>

  const label = MODULES.find(m => m.key === module)?.label ?? module
  const home = homePath(permissions)
  return (
    <div style={{ padding: '24px 28px 32px', width: '100%', boxSizing: 'border-box' }}>
      <PageHero title={tr('Sem acesso')} section={tr(label)} />
      <div className="card" style={{ padding: 'var(--gutter-card)', display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-start', maxWidth: 640 }}>
        <span style={{ color: 'var(--text-secondary)', marginTop: 2 }}><Icon name="lock" size={20} /></span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div style={{ fontSize: 'var(--ui-text-size)', color: 'var(--text-primary)' }}>
            {level === 'edit' && can(module, 'view')
              ? trf('Seu perfil pode consultar {0}, mas não editar.', tr(label))
              : trf('Seu perfil não tem acesso a {0}.', tr(label))}
          </div>
          <div style={{ fontSize: 'var(--text-body-sm-size)', color: 'var(--text-secondary)' }}>
            {tr('Se precisar deste acesso, peça a um administrador em “Usuários e acessos”.')}
          </div>
          {home && <div><Link to={home} className="btn btn-outline">{tr('Ir para o início')}</Link></div>}
        </div>
      </div>
    </div>
  )
}

export function HomeRedirect() {
  const { permissions } = useAuth()
  return <Navigate to={homePath(permissions) ?? '/'} replace />
}

export function AccessPending({ noModules = false }: { noModules?: boolean }) {
  const { profile, session, signOut } = useAuth()
  const email = profile?.email ?? session?.user.email ?? ''
  return (
    <AuthScreen heading={tr('Acesso pendente')}
      footer={<button type="button" className="btn btn-ghost" onClick={() => signOut()}>{tr('Sair')}</button>}>
      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
        <span style={{ color: 'var(--text-secondary)', marginTop: 2 }}><Icon name="lock" size={20} /></span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <div style={{ fontSize: 'var(--ui-text-size)', color: 'var(--text-primary)' }}>
            {noModules ? tr('Seu perfil de acesso não libera nenhuma tela.') : tr('Seu usuário ainda não foi liberado ou está desativado.')}
          </div>
          <div style={{ fontSize: 'var(--text-body-sm-size)', color: 'var(--text-secondary)' }}>
            {trf('Peça a um administrador para liberar o acesso de {0} em “Usuários e acessos”.', email)}
          </div>
        </div>
      </div>
    </AuthScreen>
  )
}

// src/pages/PageUsuarios.tsx
// Administração de usuários e acessos (migração 019 + Edge Function admin-users).
//
//   • Usuários: criar (com senha inicial ou convite por e-mail), editar nome e
//     perfil, ativar/desativar, trocar senha / enviar link e excluir.
//   • Perfis e permissões: matriz módulo × perfil, com nível "sem acesso",
//     "consultar" ou "editar" em cada módulo; perfis próprios podem ser criados.
//
// Quem só tem 'view' em "usuarios" vê tudo, sem os botões. As mesmas regras
// valem no banco (RLS + gatilhos): ninguém muda o próprio perfil/status e
// sempre sobra um administrador ativo.

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { USE_SUPABASE, type AccessRole, type UserProfile } from '../lib/supabase'
import { MODULES, parsePermissions, type AccessLevel, type ModuleDef, type Permissions } from '../lib/access'
import {
  fetchProfiles, updateProfile, fetchRoles, createRole, updateRole, deleteRole, roleKeyFromName,
  createUser, resetUserPassword, deleteUser,
} from '../lib/userAdmin'
import PageHero from '../components/PageHero'
import Badge from '../components/Badge'
import KpiPill from '../components/KpiPill'
import { Icon, IconButton } from '../components/Icon'
import { ModalShell } from '../components/modals/EditModals'
import { modalInput, modalLabel } from '../components/modals/styles'
import { fmtDate } from '../lib/format'
import { tr, trf, trn } from '../i18n'

const MIN_PASSWORD = 8

const LEVEL_LABEL: Record<AccessLevel, string> = { none: 'Sem acesso', view: 'Consultar', edit: 'Editar' }

const eyebrow: React.CSSProperties = {
  fontSize: 'var(--text-overline-size)', letterSpacing: 'var(--text-overline-tracking)',
  textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4,
}

function initials(s: string): string {
  const base = s.includes('@') ? s.split('@')[0].replace(/[._-]+/g, ' ') : s
  return base.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'
}

type Tab = 'usuarios' | 'perfis'
type Notice = { text: string; ok: boolean } | null

export default function PageUsuarios() {
  const { can, profile: me } = useAuth()
  const canManage = can('usuarios', 'edit')
  const [tab, setTab] = useState<Tab>('usuarios')
  const [users, setUsers] = useState<UserProfile[]>([])
  const [roles, setRoles] = useState<AccessRole[]>([])
  const [loading, setLoading] = useState(USE_SUPABASE)
  const [notice, setNotice] = useState<Notice>(null)

  function load(): Promise<void> {
    if (!USE_SUPABASE) return Promise.resolve()
    return Promise.all([fetchProfiles(), fetchRoles()])
      .then(([u, r]) => { setUsers(u); setRoles(r) })
      .catch(err => setNotice({ text: (err as Error).message, ok: false }))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  /** Executa uma ação, mostra o resultado e recarrega a lista. */
  async function run(action: () => Promise<unknown>, success: string) {
    setNotice(null)
    try {
      await action()
      setNotice({ text: success, ok: true })
      await load()
      return true
    } catch (err) {
      setNotice({ text: (err as Error).message, ok: false })
      return false
    }
  }

  return (
    <div style={{ padding: '24px 28px 32px', width: '100%', boxSizing: 'border-box' }}>
      <PageHero title={tr('Usuários e acessos')} section={tr('Administração')}
        caption={tr('Quem entra na plataforma e o que cada perfil pode consultar ou editar.')} />

      {!USE_SUPABASE ? (
        <div className="card" style={{ padding: 'var(--gutter-card)', display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-start', maxWidth: 720 }}>
          <span style={{ color: 'var(--text-secondary)', marginTop: 2 }}><Icon name="info" size={20} /></span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <div style={{ fontSize: 'var(--ui-text-size)', color: 'var(--text-primary)' }}>
              {tr('O controle de usuários exige o Supabase.')}
            </div>
            <div style={{ fontSize: 'var(--text-body-sm-size)', color: 'var(--text-secondary)' }}>
              {tr('No modo local (VITE_USE_SUPABASE=false) não há login e todos têm acesso total. Ligue o Supabase e rode a migração 019 — o passo a passo está em SETUP_SUPABASE.md.')}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="seg-tabs" role="tablist" aria-label={tr('Seções')} style={{ marginBottom: 'var(--space-5)' }}>
            {([['usuarios', 'Usuários'], ['perfis', 'Perfis e permissões']] as const).map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} className="seg-tab" onClick={() => setTab(k)}>
                {tr(label)}
              </button>
            ))}
          </div>

          {notice && (
            <div role={notice.ok ? 'status' : 'alert'} style={{
              marginBottom: 'var(--space-4)', padding: '10px 14px', borderRadius: 'var(--radius-control)',
              fontSize: 'var(--text-body-sm-size)',
              background: notice.ok ? 'var(--surface-accent)' : 'var(--surface-negative-soft)',
              color: notice.ok ? 'var(--text-primary)' : 'var(--text-negative)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            }}>
              <span>{tr(notice.text)}</span>
              <IconButton icon="x" label={tr('Fechar')} small onClick={() => setNotice(null)} />
            </div>
          )}

          {tab === 'usuarios'
            ? <UsersTab users={users} roles={roles} loading={loading} meId={me?.id ?? null} canManage={canManage} run={run} />
            : <RolesTab users={users} roles={roles} loading={loading} canManage={canManage} run={run} />}
        </>
      )}
    </div>
  )
}

type Run = (action: () => Promise<unknown>, success: string) => Promise<boolean>

// ── Usuários ────────────────────────────────────────────────────────────────

function UsersTab({ users, roles, loading, meId, canManage, run }: {
  users: UserProfile[]; roles: AccessRole[]; loading: boolean; meId: string | null; canManage: boolean; run: Run
}) {
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'' | 'ativo' | 'inativo'>('')
  const [showNew, setShowNew] = useState(false)
  const [editing, setEditing] = useState<UserProfile | null>(null)
  const [password, setPassword] = useState<UserProfile | null>(null)

  const roleName = (key: string) => roles.find(r => r.key === key)?.nome ?? key

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter(u =>
      (!q || (u.nome ?? '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      && (!roleFilter || u.role === roleFilter)
      && (!statusFilter || (statusFilter === 'ativo') === u.ativo))
  }, [users, search, roleFilter, statusFilter])

  const activeCount = users.filter(u => u.ativo).length

  function toggleActive(u: UserProfile) {
    const label = u.nome || u.email
    if (u.ativo && !window.confirm(trf('Desativar {0}? O usuário perde o acesso imediatamente, mas o cadastro é mantido.', label))) return
    run(() => updateProfile(u.id, { ativo: !u.ativo }), u.ativo ? trf('{0} foi desativado.', label) : trf('{0} foi reativado.', label))
  }

  function remove(u: UserProfile) {
    const label = u.nome || u.email
    if (!window.confirm(trf('Excluir {0} definitivamente? O login é apagado. Para só bloquear o acesso, prefira desativar.', label))) return
    run(() => deleteUser(u.id), trf('{0} foi excluído.', label))
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
        <div>
          <div style={eyebrow}>{tr('Buscar')}</div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={tr('Nome ou e-mail')} aria-label={tr('Buscar')} style={{ minWidth: 220 }} />
        </div>
        <div>
          <div style={eyebrow}>{tr('Perfil')}</div>
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} aria-label={tr('Perfil')}>
            <option value="">{tr('Todos')}</option>
            {roles.map(r => <option key={r.key} value={r.key}>{tr(r.nome)}</option>)}
          </select>
        </div>
        <div>
          <div style={eyebrow}>{tr('Status')}</div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)} aria-label={tr('Status')}>
            <option value="">{tr('Todos')}</option>
            <option value="ativo">{tr('Ativos')}</option>
            <option value="inativo">{tr('Inativos')}</option>
          </select>
        </div>
        <div className="kpi-group">
          <KpiPill label={tr('Usuários')} value={String(users.length)} />
          <KpiPill label={tr('Ativos')} value={String(activeCount)} tone="pos" />
          {canManage && (
            <button type="button" className="btn btn-primary" onClick={() => setShowNew(true)} style={{ alignSelf: 'flex-end' }}>
              <Icon name="userPlus" size={16} /> {tr('Novo usuário')}
            </button>
          )}
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>{tr('Usuário')}</th>
                <th>{tr('Perfil')}</th>
                <th>{tr('Status')}</th>
                <th>{tr('Desde')}</th>
                {canManage && <th style={{ textAlign: 'right' }}>{tr('Ações')}</th>}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 40 }}>{tr('Carregando…')}</td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 40 }}>{tr('Nenhum usuário encontrado.')}</td></tr>}
              {!loading && filtered.map(u => {
                const isMe = u.id === meId
                const name = u.nome || u.email
                return (
                  <tr key={u.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <span aria-hidden="true" style={{
                          width: 28, height: 28, flex: 'none', display: 'grid', placeItems: 'center',
                          borderRadius: 'var(--radius-xs)', background: 'var(--surface-accent)',
                          boxShadow: 'inset 0 0 0 1px var(--accent-line-soft)', fontSize: 11, fontWeight: 500, color: 'var(--ink-900)',
                        }}>{initials(name)}</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                            {name}
                            {isMe && <Badge tone="neutral">{tr('Você')}</Badge>}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>{tr(roleName(u.role))}</td>
                    <td><Badge tone={u.ativo ? 'accent' : 'outline'}>{u.ativo ? tr('Ativo') : tr('Inativo')}</Badge></td>
                    <td style={{ color: 'var(--text-secondary)' }}>{u.created_at ? fmtDate(u.created_at.slice(0, 10)) : '—'}</td>
                    {canManage && (
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'inline-flex', gap: 1 }}>
                          <IconButton icon="edit" label={tr('Editar usuário')} small onClick={() => setEditing(u)} />
                          <IconButton icon="key" label={tr('Senha de acesso')} tone="info" small onClick={() => setPassword(u)} />
                          <IconButton icon={u.ativo ? 'lock' : 'undo'} label={u.ativo ? tr('Desativar') : tr('Reativar')} tone="warn" small
                            onClick={() => toggleActive(u)} disabled={isMe} disabledReason={tr('não é possível desativar o próprio usuário')} />
                          <IconButton icon="trash" label={tr('Excluir usuário')} tone="danger" small
                            onClick={() => remove(u)} disabled={isMe} disabledReason={tr('não é possível excluir o próprio usuário')} />
                        </span>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showNew && <NewUserModal roles={roles} onClose={() => setShowNew(false)} run={run} />}
      {editing && <EditUserModal user={editing} roles={roles} isMe={editing.id === meId} onClose={() => setEditing(null)} run={run} />}
      {password && <PasswordModal user={password} onClose={() => setPassword(null)} run={run} />}
    </>
  )
}

function RoleSelect({ roles, value, onChange, disabled }: { roles: AccessRole[]; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const current = roles.find(r => r.key === value)
  return (
    <div>
      <label style={modalLabel}>{tr('Perfil de acesso')}</label>
      <select style={modalInput} value={value} onChange={e => onChange(e.target.value)} disabled={disabled}>
        {roles.map(r => <option key={r.key} value={r.key}>{tr(r.nome)}</option>)}
      </select>
      {current?.descricao && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>{tr(current.descricao)}</div>}
    </div>
  )
}

function NewUserModal({ roles, onClose, run }: { roles: AccessRole[]; onClose: () => void; run: Run }) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState(roles.find(r => r.key === 'consulta')?.key ?? roles[0]?.key ?? '')
  const [method, setMethod] = useState<'senha' | 'convite'>('senha')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)

  const valid = nome.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && role
    && (method === 'convite' || password.length >= MIN_PASSWORD)

  async function save() {
    if (!valid) return
    setSaving(true)
    const ok = await run(
      () => createUser({ nome: nome.trim(), email: email.trim(), role, password: method === 'senha' ? password : undefined }),
      method === 'senha'
        ? trf('{0} foi criado. Envie a senha inicial por um canal seguro.', nome.trim())
        : trf('Convite enviado para {0}.', email.trim()),
    )
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <ModalShell title="Novo usuário" width={500} onClose={onClose}
      footer={<>
        <button onClick={onClose} className="btn btn-outline">{tr('Cancelar')}</button>
        <button onClick={save} className="btn btn-primary" disabled={!valid || saving}>
          {saving ? tr('Salvando…') : method === 'senha' ? tr('Criar usuário') : tr('Enviar convite')}
        </button>
      </>}>
      <div><label style={modalLabel}>{tr('Nome *')}</label><input style={modalInput} value={nome} onChange={e => setNome(e.target.value)} autoFocus /></div>
      <div><label style={modalLabel}>{tr('E-mail *')}</label><input style={modalInput} type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="off" /></div>
      <RoleSelect roles={roles} value={role} onChange={setRole} />
      <div>
        <label style={modalLabel}>{tr('Primeiro acesso')}</label>
        <div className="seg-control" role="group" aria-label={tr('Primeiro acesso')}>
          <button type="button" className="seg-control__item" aria-pressed={method === 'senha'} onClick={() => setMethod('senha')}>{tr('Definir senha inicial')}</button>
          <button type="button" className="seg-control__item" aria-pressed={method === 'convite'} onClick={() => setMethod('convite')}>{tr('Convidar por e-mail')}</button>
        </div>
      </div>
      {method === 'senha' ? (
        <div>
          <label style={modalLabel}>{trf('Senha inicial (mín. {0} caracteres)', MIN_PASSWORD)}</label>
          <input style={modalInput} type="text" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" />
        </div>
      ) : (
        <div style={{ fontSize: 'var(--text-body-sm-size)', color: 'var(--text-secondary)' }}>
          {tr('O usuário recebe um e-mail com o link de acesso e define a própria senha ao entrar.')}
        </div>
      )}
    </ModalShell>
  )
}

function EditUserModal({ user, roles, isMe, onClose, run }: {
  user: UserProfile; roles: AccessRole[]; isMe: boolean; onClose: () => void; run: Run
}) {
  const [nome, setNome] = useState(user.nome ?? '')
  const [role, setRole] = useState(user.role)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    const patch = isMe ? { nome: nome.trim() || null } : { nome: nome.trim() || null, role }
    const ok = await run(() => updateProfile(user.id, patch), trf('{0} foi atualizado.', nome.trim() || user.email))
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <ModalShell title="Editar usuário" subtitle={user.email} width={460} onClose={onClose}
      footer={<>
        <button onClick={onClose} className="btn btn-outline">{tr('Cancelar')}</button>
        <button onClick={save} className="btn btn-primary" disabled={saving}>{saving ? tr('Salvando…') : tr('Salvar')}</button>
      </>}>
      <div><label style={modalLabel}>{tr('Nome')}</label><input style={modalInput} value={nome} onChange={e => setNome(e.target.value)} /></div>
      <RoleSelect roles={roles} value={role} onChange={setRole} disabled={isMe} />
      {isMe && (
        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
          {tr('Por segurança, o próprio perfil de acesso só pode ser alterado por outro administrador.')}
        </div>
      )}
    </ModalShell>
  )
}

function PasswordModal({ user, onClose, run }: { user: UserProfile; onClose: () => void; run: Run }) {
  const [method, setMethod] = useState<'link' | 'senha'>('link')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const label = user.nome || user.email
  const valid = method === 'link' || password.length >= MIN_PASSWORD

  async function save() {
    if (!valid) return
    setSaving(true)
    const ok = await run(
      () => resetUserPassword(user.id, method === 'senha' ? password : undefined),
      method === 'senha' ? trf('Senha de {0} alterada.', label) : trf('Link de redefinição enviado para {0}.', user.email),
    )
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <ModalShell title="Senha de acesso" subtitle={label} width={460} onClose={onClose}
      footer={<>
        <button onClick={onClose} className="btn btn-outline">{tr('Cancelar')}</button>
        <button onClick={save} className="btn btn-primary" disabled={!valid || saving}>
          {saving ? tr('Salvando…') : method === 'link' ? tr('Enviar link') : tr('Definir senha')}
        </button>
      </>}>
      <div className="seg-control" role="group" aria-label={tr('Senha de acesso')}>
        <button type="button" className="seg-control__item" aria-pressed={method === 'link'} onClick={() => setMethod('link')}>{tr('Enviar link por e-mail')}</button>
        <button type="button" className="seg-control__item" aria-pressed={method === 'senha'} onClick={() => setMethod('senha')}>{tr('Definir nova senha')}</button>
      </div>
      {method === 'link' ? (
        <div style={{ fontSize: 'var(--text-body-sm-size)', color: 'var(--text-secondary)' }}>
          {trf('{0} recebe um e-mail para criar uma nova senha.', user.email)}
        </div>
      ) : (
        <div>
          <label style={modalLabel}>{trf('Nova senha (mín. {0} caracteres)', MIN_PASSWORD)}</label>
          <input style={modalInput} type="text" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" />
        </div>
      )}
    </ModalShell>
  )
}

// ── Perfis e permissões ────────────────────────────────────────────────────

/** Painéis e relatórios só têm leitura: 'edit' gravado conta como 'view'. */
function effectiveLevel(m: ModuleDef, level: AccessLevel | undefined): AccessLevel {
  return !m.editable && level === 'edit' ? 'view' : level ?? 'none'
}

function LevelBadge({ level }: { level: AccessLevel }) {
  if (level === 'none') return <span style={{ color: 'var(--text-muted)' }}>—</span>
  return <Badge tone={level === 'edit' ? 'inverse' : 'accent'}>{tr(LEVEL_LABEL[level])}</Badge>
}

function RolesTab({ users, roles, loading, canManage, run }: {
  users: UserProfile[]; roles: AccessRole[]; loading: boolean; canManage: boolean; run: Run
}) {
  const [editing, setEditing] = useState<AccessRole | 'new' | null>(null)
  const countByRole = useMemo(() => {
    const m: Record<string, number> = {}
    for (const u of users) m[u.role] = (m[u.role] ?? 0) + 1
    return m
  }, [users])

  function remove(r: AccessRole) {
    if (!window.confirm(trf('Excluir o perfil {0}?', tr(r.nome)))) return
    run(() => deleteRole(r.key), trf('Perfil {0} excluído.', tr(r.nome)))
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
        <div style={{ fontSize: 'var(--text-body-sm-size)', color: 'var(--text-secondary)', maxWidth: 720 }}>
          {tr('Consultar libera a tela; editar libera também incluir, alterar e excluir. A leitura dos dados vale para todo usuário ativo (os relatórios cruzam a base inteira); a edição é conferida no banco.')}
        </div>
        {canManage && (
          <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
            <Icon name="plus" size={16} /> {tr('Novo perfil')}
          </button>
        )}
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th style={{ minWidth: 240 }}>{tr('Módulo')}</th>
                {roles.map(r => (
                  <th key={r.key} style={{ textAlign: 'center', minWidth: 120 }}>{tr(r.nome)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={roles.length + 1} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 40 }}>{tr('Carregando…')}</td></tr>}
              {!loading && MODULES.map(m => (
                <tr key={m.key}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{tr(m.label)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{tr(m.description)}</div>
                  </td>
                  {roles.map(r => (
                    <td key={r.key} style={{ textAlign: 'center' }}>
                      <LevelBadge level={effectiveLevel(m, parsePermissions(r.permissions)[m.key])} />
                    </td>
                  ))}
                </tr>
              ))}
              {!loading && (
                <tr style={{ background: 'var(--surface-sunken)' }}>
                  <td style={{ color: 'var(--text-secondary)' }}>{tr('Usuários com o perfil')}</td>
                  {roles.map(r => (
                    <td key={r.key} style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                        <span style={{ marginRight: 4 }}>{countByRole[r.key] ?? 0}</span>
                        {canManage && (
                          <>
                            <IconButton icon="edit" label={trf('Editar perfil {0}', tr(r.nome))} small onClick={() => setEditing(r)} />
                            <IconButton icon="trash" label={trf('Excluir perfil {0}', tr(r.nome))} tone="danger" small
                              onClick={() => remove(r)}
                              disabled={r.is_system || (countByRole[r.key] ?? 0) > 0}
                              disabledReason={r.is_system ? tr('perfil do sistema') : tr('há usuários com este perfil')} />
                          </>
                        )}
                      </div>
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <RoleModal role={editing === 'new' ? null : editing} existingKeys={roles.map(r => r.key)}
          onClose={() => setEditing(null)} run={run} />
      )}
    </>
  )
}

function LevelPicker({ module, value, onChange, disabled }: {
  module: ModuleDef; value: AccessLevel; onChange: (v: AccessLevel) => void; disabled: boolean
}) {
  const levels: AccessLevel[] = module.editable ? ['none', 'view', 'edit'] : ['none', 'view']
  return (
    <div className="seg-control" role="group" aria-label={tr(module.label)}>
      {levels.map(l => (
        <button key={l} type="button" className="seg-control__item" aria-pressed={value === l}
          disabled={disabled} onClick={() => onChange(l)}>
          {tr(LEVEL_LABEL[l])}
        </button>
      ))}
    </div>
  )
}

function RoleModal({ role, existingKeys, onClose, run }: {
  role: AccessRole | null; existingKeys: string[]; onClose: () => void; run: Run
}) {
  const isMaster = role?.key === 'master'
  const [nome, setNome] = useState(role?.nome ?? '')
  const [descricao, setDescricao] = useState(role?.descricao ?? '')
  const [perms, setPerms] = useState<Permissions>(() => {
    const p = parsePermissions(role?.permissions)
    for (const m of MODULES) p[m.key] = effectiveLevel(m, p[m.key])
    return p
  })
  const [saving, setSaving] = useState(false)

  const key = role?.key ?? roleKeyFromName(nome)
  const keyTaken = !role && existingKeys.includes(key)
  const valid = nome.trim() && key.length >= 2 && !keyTaken

  async function save() {
    if (!valid) return
    setSaving(true)
    const input = { nome: nome.trim(), descricao: descricao.trim() || null, permissions: perms }
    const ok = await run(
      () => role ? updateRole(role.key, input) : createRole({ key, ...input }),
      role ? trf('Perfil {0} atualizado.', input.nome) : trf('Perfil {0} criado.', input.nome),
    )
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <ModalShell title={role ? 'Editar perfil' : 'Novo perfil'} subtitle={role ? undefined : 'Defina o que o perfil pode consultar e editar em cada módulo.'}
      width={640} onClose={onClose}
      footer={<>
        <button onClick={onClose} className="btn btn-outline">{tr('Cancelar')}</button>
        {!isMaster && (
          <button onClick={save} className="btn btn-primary" disabled={!valid || saving}>{saving ? tr('Salvando…') : role ? tr('Salvar') : tr('Criar perfil')}</button>
        )}
      </>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={modalLabel}>{tr('Nome *')}</label>
          <input style={modalInput} value={nome} onChange={e => setNome(e.target.value)} disabled={isMaster} placeholder={tr('Ex: Auditoria')} />
          {!role && nome.trim() && (
            <div style={{ fontSize: 11, color: keyTaken ? 'var(--text-negative)' : 'var(--text-secondary)', marginTop: 6 }}>
              {keyTaken ? tr('Já existe um perfil com este nome.') : trf('Chave: {0}', key)}
            </div>
          )}
        </div>
        <div>
          <label style={modalLabel}>{tr('Descrição')}</label>
          <input style={modalInput} value={descricao} onChange={e => setDescricao(e.target.value)} disabled={isMaster} />
        </div>
      </div>

      {isMaster && (
        <div style={{ fontSize: 'var(--text-body-sm-size)', color: 'var(--text-secondary)' }}>
          {tr('O perfil Master tem sempre acesso total e não pode ser alterado.')}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {MODULES.map((m, i) => (
          <div key={m.key} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '10px 0',
            borderTop: i === 0 ? 'none' : '1px solid var(--border-subtle)',
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 'var(--ui-text-size)', color: 'var(--text-primary)' }}>{tr(m.label)}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{tr(m.description)}</div>
            </div>
            <LevelPicker module={m} value={perms[m.key] ?? 'none'} disabled={isMaster}
              onChange={v => setPerms(p => ({ ...p, [m.key]: v }))} />
          </div>
        ))}
      </div>
      {!isMaster && (perms.usuarios === 'edit') && (
        <div style={{ fontSize: 11, color: 'var(--text-warning)' }}>
          {tr('Editar “Usuários e acessos” torna o perfil administrador: ele poderá criar usuários e mudar permissões, inclusive as próprias.')}
        </div>
      )}
      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
        {trn(MODULES.filter(m => (perms[m.key] ?? 'none') !== 'none').length, '{0} módulo liberado', '{0} módulos liberados')}
      </div>
    </ModalShell>
  )
}

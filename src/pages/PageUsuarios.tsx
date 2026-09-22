// src/pages/PageUsuarios.tsx
// Gestão de usuários (Administração, só master): papel setorial e ativo.
// O banco garante: só master altera role/ativo (RLS 002 + trigger 019), e
// ninguém altera o próprio papel.

import { useEffect, useState } from 'react'
import PageHero from '../components/PageHero'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/toast-context'
import { useConfirm } from '../components/confirm-context'
import { USE_SUPABASE, type UserProfile, type UserRole } from '../lib/supabase'
import { fetchProfiles, updateProfile, mensagemErro } from '../lib/governanca'
import { ALL_ROLES, ROLE_LABELS } from '../lib/permissoes'

const font = 'var(--font-body)'

const ROLE_HINT: Record<UserRole, string> = {
  master:        'Acesso total, gestão de usuários',
  juridico:      'Contratos, cláusulas, documentos, envio para revisão',
  tesouraria:    'Baixa e estorno de parcelas',
  controladoria: 'Aprova/rejeita, premissas, fechamento de amortização, auditoria',
  assessor:      'Premissas do modelo financeiro',
  futebol:       'Desempenho, gatilhos, movimentações',
  rh:            'Leitura',
  diretoria:     'Leitura + auditoria',
}

export default function PageUsuarios() {
  const { isMaster, profile } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const [rows, setRows] = useState<UserProfile[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)

  useEffect(() => {
    if (!USE_SUPABASE) return
    let alive = true
    fetchProfiles()
      .then(r => { if (alive) setRows(r) })
      .catch(e => { if (alive) setErr(mensagemErro(e)) })
    return () => { alive = false }
  }, [])

  async function save(u: UserProfile, patch: { role?: UserRole; ativo?: boolean }) {
    if (patch.ativo === false && !await confirm({ title: `Desativar ${u.email}?`, message: 'O usuário perde o acesso a todos os dados.', confirmLabel: 'Desativar', danger: true })) return
    setSavingId(u.id)
    try {
      const upd = await updateProfile(u.id, patch)
      setRows(prev => prev?.map(r => r.id === u.id ? upd : r) ?? prev)
    } catch (e) { toast.error('Não foi possível atualizar o usuário.', { detail: mensagemErro(e) }) } finally { setSavingId(null) }
  }

  return (
    <div style={{ padding: '24px 28px 32px', width: '100%', boxSizing: 'border-box' }}>
      <PageHero title="Usuários" subtitle="Administração · papéis setoriais e acesso" />

      {!USE_SUPABASE ? (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontFamily: font }}>
          Gestão de usuários disponível apenas com Supabase (o modo local é monousuário).
        </div>
      ) : !isMaster ? (
        <div className="card" role="alert" style={{ padding: 32, textAlign: 'center', color: 'var(--neg)', fontFamily: font }}>
          Apenas usuários Master podem gerenciar perfis.
        </div>
      ) : err ? (
        <div className="card" role="alert" style={{ padding: 20, color: 'var(--neg)', fontFamily: font }}>Não foi possível carregar os usuários: {err}</div>
      ) : rows === null ? (
        <div role="status" style={{ padding: 20, color: 'var(--text-muted)', fontFamily: font }}>Carregando…</div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>E-mail</th>
                <th style={{ textAlign: 'left' }}>Nome</th>
                <th style={{ textAlign: 'left' }}>Papel</th>
                <th style={{ textAlign: 'left' }}>O que pode</th>
                <th style={{ textAlign: 'center' }}>Ativo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(u => {
                const self = u.id === profile?.id
                return (
                  <tr key={u.id} style={{ opacity: u.ativo ? 1 : 0.55 }}>
                    <td style={{ fontWeight: 600 }}>{u.email}{self && <span className="chip chip-neutral" style={{ marginLeft: 6 }}>você</span>}</td>
                    <td>{u.nome || '—'}</td>
                    <td>
                      <select aria-label={`Papel de ${u.email}`} value={u.role} disabled={self || savingId === u.id}
                        title={self ? 'Você não pode alterar o próprio papel' : undefined}
                        onChange={e => save(u, { role: e.target.value as UserRole })}>
                        {ALL_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                      </select>
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{ROLE_HINT[u.role] ?? '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" aria-label={`Ativo: ${u.email}`} checked={u.ativo} disabled={self || savingId === u.id}
                        onChange={e => save(u, { ativo: e.target.checked })} />
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>Nenhum perfil.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

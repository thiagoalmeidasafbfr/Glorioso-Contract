// supabase/functions/admin-users/index.ts
// Edge Function do módulo "Usuários e acessos". As operações que exigem a
// service role (criar usuário no Auth, trocar senha, excluir) ficam aqui —
// a chave nunca vai para o navegador. Papel, nome e status do usuário são
// editados direto na tabela `profiles` pelo app (RLS: edição em "usuarios").
//
// Só atende quem tem 'edit' no módulo "usuarios" (checado com o JWT de quem
// chamou, via public.can_edit). Ações (POST JSON):
//   { action: 'create', email, nome, role, password? , redirectTo? }
//       com password → cria já confirmado; sem password → envia convite.
//   { action: 'reset_password', user_id, password? , redirectTo? }
//       com password → define a nova senha; sem → envia link de redefinição.
//   { action: 'delete', user_id }
//
// Deploy: supabase functions deploy admin-users
// (SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY já existem
// no ambiente das Edge Functions.)

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-retry-count',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function reply(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD = 8

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return reply({ error: 'Método não permitido.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // Quem chamou — com o JWT dele, para a checagem de permissão passar pelas
  // mesmas funções que a RLS usa.
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: { user: me } } = await caller.auth.getUser()
  if (!me) return reply({ error: 'Sessão inválida. Entre novamente.' }, 401)
  const { data: allowed, error: permError } = await caller.rpc('can_edit', { p_module: 'usuarios' })
  if (permError) return reply({ error: permError.message }, 500)
  if (!allowed) return reply({ error: 'Sem permissão para administrar usuários.' }, 403)

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return reply({ error: 'Requisição inválida.' }, 400) }
  const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim() : '')
  const password = typeof body.password === 'string' ? body.password : ''
  const redirectTo = str('redirectTo') || undefined
  if (password && password.length < MIN_PASSWORD) {
    return reply({ error: `A senha precisa ter ao menos ${MIN_PASSWORD} caracteres.` }, 400)
  }

  switch (body.action) {
    case 'create': {
      const email = str('email').toLowerCase()
      const nome = str('nome')
      const role = str('role')
      if (!EMAIL_RE.test(email)) return reply({ error: 'E-mail inválido.' }, 400)
      if (!nome) return reply({ error: 'Informe o nome.' }, 400)
      const { data: roleRow } = await admin.from('access_roles').select('key').eq('key', role).maybeSingle()
      if (!roleRow) return reply({ error: 'Perfil de acesso inexistente.' }, 400)

      const created = password
        ? await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nome } })
        : await admin.auth.admin.inviteUserByEmail(email, { data: { nome }, redirectTo })
      if (created.error || !created.data.user) {
        const msg = created.error?.message ?? 'Falha ao criar o usuário.'
        return reply({ error: /already|registered|exists/i.test(msg) ? 'Já existe um usuário com este e-mail.' : msg }, 400)
      }
      const id = created.data.user.id
      // O gatilho de sign-up cria o perfil inativo; aqui ele recebe o papel e é liberado.
      const { error: profileError } = await admin.from('profiles')
        .upsert({ id, email, nome, role, ativo: true }, { onConflict: 'id' })
      if (profileError) {
        await admin.auth.admin.deleteUser(id)
        return reply({ error: profileError.message }, 400)
      }
      return reply({ id, invited: !password })
    }

    case 'reset_password': {
      const userId = str('user_id')
      if (!userId) return reply({ error: 'Usuário não informado.' }, 400)
      if (password) {
        const { error } = await admin.auth.admin.updateUserById(userId, { password })
        if (error) return reply({ error: error.message }, 400)
        return reply({ ok: true })
      }
      const { data: target, error: findError } = await admin.auth.admin.getUserById(userId)
      if (findError || !target.user?.email) return reply({ error: 'Usuário não encontrado.' }, 404)
      const { error } = await admin.auth.resetPasswordForEmail(target.user.email, { redirectTo })
      if (error) return reply({ error: error.message }, 400)
      return reply({ ok: true, emailed: true })
    }

    case 'delete': {
      const userId = str('user_id')
      if (!userId) return reply({ error: 'Usuário não informado.' }, 400)
      if (userId === me.id) return reply({ error: 'Você não pode excluir o próprio usuário.' }, 400)
      // A exclusão em auth.users apaga o perfil em cascata; o gatilho do banco
      // barra a remoção do último administrador ativo — checado antes para
      // devolver uma mensagem clara (o Auth só diria "Database error").
      const { data: adminRoles } = await admin.from('access_roles').select('key').eq('permissions->>usuarios', 'edit')
      const { data: admins } = await admin.from('profiles').select('id')
        .eq('ativo', true).in('role', (adminRoles ?? []).map(r => r.key))
      if (admins && admins.length === 1 && admins[0].id === userId) {
        return reply({ error: 'É preciso manter ao menos um administrador ativo.' }, 400)
      }
      const { error } = await admin.auth.admin.deleteUser(userId)
      if (error) return reply({ error: error.message }, 400)
      return reply({ ok: true })
    }

    default:
      return reply({ error: 'Ação desconhecida.' }, 400)
  }
})

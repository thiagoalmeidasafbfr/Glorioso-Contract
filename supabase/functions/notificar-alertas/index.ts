// supabase/functions/notificar-alertas/index.ts
// ════════════════════════════════════════════════════════════════════════════
// Edge Function (Deno) — envia por e-mail, por SETOR, os alertas em aberto.
// ════════════════════════════════════════════════════════════════════════════
//
// O que faz
//   1. (opcional) chama a RPC public.gerar_alertas() — ?gerar=1 ou GERAR_ANTES=true.
//   2. Lê ac_alertas em aberto e ainda não notificados:
//        is_read = false AND resolvido_em IS NULL AND notificado_em IS NULL
//   3. Agrupa por setor (coluna `setores`; se vazia, deriva do alert_type):
//        parcelas  (EM_ATRASO, VENCIMENTO_PROXIMO)          → tesouraria
//        contratos (CONTRATO_EXPIRANDO)                      → juridico
//        gatilhos  (GATILHO_PROXIMO, ATINGIMENTO_PENDENTE)   → juridico + futebol
//        demais                                              → juridico
//   4. Destinatários = e-mails de public.profiles com role = setor e ativo = true.
//   5. Envia via Resend (https://api.resend.com/emails) se RESEND_API_KEY estiver
//      definido; senão apenas registra no log (modo "dry-run").
//   6. Marca notificado_em = now() nos alertas enviados (não em dry-run).
//
// Variáveis de ambiente
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (injetadas automaticamente no deploy)
//   RESEND_API_KEY        opcional — sem ela, só loga
//   ALERTAS_EMAIL_FROM    remetente, ex.: 'Glorioso <alertas@seudominio.com.br>'
//   GERAR_ANTES           'true' para chamar gerar_alertas() antes de ler
//   APP_URL               link base do app no e-mail (opcional)
//
// Deploy
//   supabase functions deploy notificar-alertas --no-verify-jwt
//   supabase secrets set RESEND_API_KEY=re_xxx ALERTAS_EMAIL_FROM='Glorioso <alertas@...>' GERAR_ANTES=true
//
// Agendamento (escolha um)
//   a) pg_cron + pg_net (no SQL editor), ex. todo dia 09:15 UTC:
//        select cron.schedule('notificar-alertas-diario', '15 9 * * *', $$
//          select net.http_post(
//            url     := 'https://<projeto>.supabase.co/functions/v1/notificar-alertas',
//            headers := jsonb_build_object('Authorization', 'Bearer <SERVICE_ROLE_KEY>')
//          );
//        $$);
//   b) Supabase Dashboard → Edge Functions → Schedules (cron) apontando para esta função.
//   c) Cron externo (GitHub Actions etc.) fazendo POST na URL da função.
//   Proteja a função: com --no-verify-jwt, exija o header Authorization com a
//   service role (verificado abaixo) ou remova a flag e chame com um JWT válido.
// ════════════════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type Setor = 'tesouraria' | 'juridico' | 'futebol' | string

interface AlertaRow {
  id: string
  atleta_id: string
  alert_type: string
  severity: 'RED' | 'YELLOW' | 'GREEN'
  message: string
  setores: string[] | null
  data_referencia: string | null
  created_at: string
  ac_atletas?: { nome: string | null } | null
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM = Deno.env.get('ALERTAS_EMAIL_FROM') ?? 'Glorioso <onboarding@resend.dev>'
const GERAR_ANTES = (Deno.env.get('GERAR_ANTES') ?? '').toLowerCase() === 'true'
const APP_URL = Deno.env.get('APP_URL') ?? ''

function setoresDoAlerta(a: AlertaRow): Setor[] {
  if (a.setores && a.setores.length) return a.setores
  switch (a.alert_type) {
    case 'EM_ATRASO':
    case 'VENCIMENTO_PROXIMO':
      return ['tesouraria']
    case 'CONTRATO_EXPIRANDO':
      return ['juridico']
    case 'GATILHO_PROXIMO':
    case 'ATINGIMENTO_PENDENTE':
      return ['juridico', 'futebol']
    default:
      return ['juridico']
  }
}

const SEV_LABEL: Record<string, string> = { RED: 'Urgente', YELLOW: 'Atenção', GREEN: 'Informativo' }
const SEV_ORDER: Record<string, number> = { RED: 0, YELLOW: 1, GREEN: 2 }

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

function montarHtml(setor: string, alertas: AlertaRow[]): string {
  const linhas = alertas
    .sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9))
    .map(a => {
      const atleta = a.ac_atletas?.nome ?? ''
      const link = APP_URL ? ` — <a href="${APP_URL}/atletas/${a.atleta_id}">abrir</a>` : ''
      return `<tr><td>${SEV_LABEL[a.severity] ?? a.severity}</td><td>${escapeHtml(atleta)}</td>` +
             `<td>${escapeHtml(a.message)}${link}</td></tr>`
    })
    .join('')
  return `<p>Alertas em aberto para o setor <b>${escapeHtml(setor)}</b>:</p>` +
         `<table border="1" cellpadding="4" cellspacing="0">` +
         `<tr><th>Nível</th><th>Atleta</th><th>Alerta</th></tr>${linhas}</table>`
}

async function enviarEmail(to: string[], subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.log(`[dry-run] e-mail para ${to.join(', ')} — ${subject}`)
    return false
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  })
  if (!r.ok) {
    console.error(`Resend falhou (${r.status}): ${await r.text()}`)
    return false
  }
  return true
}

Deno.serve(async (req: Request) => {
  // Só aceita chamadas com a service role (cron / pg_net / servidor).
  const auth = req.headers.get('Authorization') ?? ''
  if (!SERVICE_KEY || auth !== `Bearer ${SERVICE_KEY}`) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const url = new URL(req.url)

  let gerados: number | null = null
  if (GERAR_ANTES || url.searchParams.get('gerar') === '1') {
    const { data, error } = await supabase.rpc('gerar_alertas')
    if (error) console.error('gerar_alertas falhou:', error.message)
    else gerados = data as number
  }

  const { data: alertas, error } = await supabase
    .from('ac_alertas')
    .select('id, atleta_id, alert_type, severity, message, setores, data_referencia, created_at, ac_atletas(nome)')
    .eq('is_read', false)
    .is('resolvido_em', null)
    .is('notificado_em', null)
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })

  const porSetor = new Map<Setor, AlertaRow[]>()
  for (const a of (alertas ?? []) as AlertaRow[]) {
    for (const s of setoresDoAlerta(a)) {
      if (!porSetor.has(s)) porSetor.set(s, [])
      porSetor.get(s)!.push(a)
    }
  }

  const enviados = new Set<string>()
  const resumo: Record<string, { alertas: number; destinatarios: number; enviado: boolean }> = {}

  for (const [setor, lista] of porSetor) {
    const { data: perfis, error: e2 } = await supabase
      .from('profiles').select('email').eq('role', setor).eq('ativo', true)
    if (e2) { console.error(`profiles(${setor}):`, e2.message); continue }
    const to = (perfis ?? []).map(p => p.email as string).filter(Boolean)
    if (!to.length) {
      console.log(`Setor ${setor}: ${lista.length} alerta(s), nenhum destinatário ativo`)
      resumo[setor] = { alertas: lista.length, destinatarios: 0, enviado: false }
      continue
    }
    const urgentes = lista.filter(a => a.severity === 'RED').length
    const subject = `[Glorioso] ${lista.length} alerta(s) — ${setor}${urgentes ? ` (${urgentes} urgente(s))` : ''}`
    const ok = await enviarEmail(to, subject, montarHtml(setor, lista))
    if (ok) lista.forEach(a => enviados.add(a.id))
    resumo[setor] = { alertas: lista.length, destinatarios: to.length, enviado: ok }
  }

  if (enviados.size) {
    const { error: e3 } = await supabase
      .from('ac_alertas').update({ notificado_em: new Date().toISOString() }).in('id', [...enviados])
    if (e3) console.error('Falha ao marcar notificado_em:', e3.message)
  }

  return new Response(
    JSON.stringify({ gerados, lidos: alertas?.length ?? 0, notificados: enviados.size, setores: resumo }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})

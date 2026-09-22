/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ command, mode }) => {
  // Lê .env, .env.production etc. e também as variáveis do processo (CI/Vercel).
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }

  // Item 1.10 do PLANO_CORRECAO: um build de produção sem Supabase gera um app
  // que grava tudo no localStorage do navegador — dados que "somem" e não são
  // compartilhados. Isso não pode ir para produção por engano.
  // Escape: VITE_ALLOW_LOCAL_BUILD=true (demos, CI, preview sem backend).
  // Só no `vite build` (o `vite preview` também roda em modo production).
  if (
    command === 'build' &&
    mode === 'production' &&
    env.VITE_USE_SUPABASE !== 'true' &&
    env.VITE_ALLOW_LOCAL_BUILD !== 'true'
  ) {
    throw new Error(
      '\n[glorioso] Build de produção bloqueado: VITE_USE_SUPABASE não é "true".\n' +
      'Sem Supabase o app roda em modo local (localStorage) e os dados não são persistidos no servidor.\n' +
      '  • Produção: defina VITE_USE_SUPABASE=true, VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.\n' +
      '  • Demo/CI sem backend: defina VITE_ALLOW_LOCAL_BUILD=true para liberar o build local.\n',
    )
  }

  // Com Supabase ligado, URL e chave são obrigatórias (createClient falharia em runtime).
  if (
    command === 'build' &&
    env.VITE_USE_SUPABASE === 'true' &&
    (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY)
  ) {
    throw new Error(
      '\n[glorioso] VITE_USE_SUPABASE=true, mas VITE_SUPABASE_URL e/ou VITE_SUPABASE_ANON_KEY não foram definidas.\n',
    )
  }

  return {
    plugins: [react(), tailwindcss()],
    test: {
      include: ['src/**/*.test.ts'],
      environment: 'node',
      // Datas do domínio são de Brasília; fixa o fuso para testes determinísticos.
      env: { TZ: 'America/Sao_Paulo' },
    },
  }
})

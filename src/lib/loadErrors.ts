// src/lib/loadErrors.ts
// Falhas ao CARREGAR dados de uma tela. Antes, uma requisição que falhava
// (rede, sessão expirada, tempo esgotado) deixava a tela em "Carregando…"
// para sempre — só o F5 resolvia. Agora o carregador avisa aqui e o Layout
// mostra a faixa "Não foi possível carregar os dados · Tentar novamente".

type Listener = (message: string) => void
const listeners = new Set<Listener>()

export function onLoadError(fn: Listener): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** Chamado no `catch` dos carregadores de tela. */
export function reportLoadError(err: unknown): void {
  const message = err instanceof Error ? err.message
    : typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message)
    : String(err)
  console.error('Falha ao carregar dados:', err)
  listeners.forEach(fn => fn(message))
}

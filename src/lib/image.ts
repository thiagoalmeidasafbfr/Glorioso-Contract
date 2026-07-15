// src/lib/image.ts
// Lê um arquivo de imagem, redimensiona (mantendo proporção) e devolve uma
// data URL (base64) pronta para salvar no registro (athletes.profile_photo_url,
// clubs.logo_url, intermediaries.logo_url). Assim funciona tanto no modo local
// quanto no Supabase, sem precisar de bucket de storage.

export interface ResizeOptions {
  maxSize?: number   // maior lado, em px (default 512)
  quality?: number   // 0..1 para JPEG/WebP (default 0.85)
  mime?: string      // default 'image/webp'
}

export async function fileToResizedDataUrl(file: File, opts: ResizeOptions = {}): Promise<string> {
  const { maxSize = 512, quality = 0.85, mime = 'image/webp' } = opts

  const dataUrl = await readAsDataUrl(file)
  const img = await loadImage(dataUrl)

  const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return dataUrl // fallback: devolve original
  ctx.drawImage(img, 0, 0, w, h)

  try {
    return canvas.toDataURL(mime, quality)
  } catch {
    return canvas.toDataURL('image/png')
  }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

// fetch tolerante a fallos, compartido por vercelApi.ts, githubApi.ts, githubProvision.ts y
// vercelProvision.ts: nunca lanza, siempre { ok:true,data } o { ok:false,error }, con timeout.
// Antes cada uno reimplementaba el mismo AbortController + try/catch/finally (llegó a haber 4
// copias casi idénticas — ver code review de la sesión 2026-08-24).
const DEFAULT_TIMEOUT_MS = 8000

export async function fetchExternalJson(url: string, headers: Record<string, string>, opts?: {
  method?: string
  body?: unknown
  timeoutMs?: number
}) {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: opts?.method ?? 'GET',
      headers: opts?.body !== undefined ? { ...headers, 'Content-Type': 'application/json' } : headers,
      body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      // Cubre las dos formas de error más comunes entre APIs REST: { message } (GitHub) y
      // { error: { message } } (Vercel). Si no matchea ninguna, cae al status plano.
      const detail = data?.message ?? data?.error?.message
      return { ok: false as const, error: detail ? `${res.status}: ${detail}` : `${res.status}` }
    }
    return { ok: true as const, data }
  } catch (e) {
    const isAbort = e instanceof Error && e.name === 'AbortError'
    return { ok: false as const, error: isAbort ? `timeout tras ${timeoutMs}ms` : e instanceof Error ? e.message : 'Error de red' }
  } finally {
    clearTimeout(t)
  }
}

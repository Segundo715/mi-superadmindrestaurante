// Crea el repo de un cliente nuevo a partir del repo plantilla de su producto (mi-card/mi-menu/
// mi-proyecto — los 3 están marcados como "Template repository" en GitHub, ver sesión 2026-08-24).
// Usa POST /repos/{owner}/{repo}/generate — una sola llamada, historia limpia, sin necesitar
// `git` disponible en la función serverless. Requiere GITHUB_TOKEN con permiso de ESCRITURA
// (Contents:Read-and-write + Administration:Write) — distinto del token de solo lectura que ya
// usa lib/githubApi.ts para el monitoreo de flota.
import { fetchExternalJson } from '@/lib/externalFetch'

const GITHUB_TOKEN = process.env.GITHUB_TOKEN
const TIMEOUT_MS = 20000 // generar un repo tarda más que una lectura simple

export async function createClientRepo(opts: {
  templateOwner: string
  templateRepo: string
  newOwner: string
  newName: string
  description?: string
  private?: boolean
}) {
  if (!GITHUB_TOKEN) return { ok: false as const, error: 'GITHUB_TOKEN no configurado (o sin permiso de escritura)' }

  const res = await fetchExternalJson(
    `https://api.github.com/repos/${opts.templateOwner}/${opts.templateRepo}/generate`,
    { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    {
      method: 'POST',
      timeoutMs: TIMEOUT_MS,
      body: {
        owner: opts.newOwner,
        name: opts.newName,
        description: opts.description ?? `Instancia de cliente — generada desde ${opts.templateOwner}/${opts.templateRepo}`,
        include_all_branches: false,
        // Público por defecto exponía el código fuente (personalizado por cliente) de cada
        // instancia bajo Segundo715 — el repo de un cliente no debería ser público a menos que
        // se pida explícitamente.
        private: opts.private ?? true,
      },
    }
  )
  if (!res.ok) return res
  return {
    ok: true as const,
    fullName: res.data.full_name as string,
    htmlUrl: res.data.html_url as string,
    defaultBranch: (res.data.default_branch as string) ?? 'main',
  }
}

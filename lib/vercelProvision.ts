// Crea el proyecto de Vercel de un cliente nuevo, conectado al repo de GitHub recién generado.
// Al crear un proyecto con `gitRepository` ya enlazado, Vercel dispara el primer deploy solo —
// no hace falta una llamada aparte para "desplegar". Requiere VERCEL_TOKEN con permiso de crear
// proyectos (no solo leer deployments, que es lo único que necesita el monitoreo de flota en
// lib/vercelApi.ts).
import { fetchExternalJson } from '@/lib/externalFetch'

const VERCEL_TOKEN = process.env.VERCEL_TOKEN
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID

export async function createClientProject(opts: {
  projectName: string
  githubRepoFullName: string // "owner/repo"
  envVars: { key: string; value: string }[]
}) {
  if (!VERCEL_TOKEN) return { ok: false as const, error: 'VERCEL_TOKEN no configurado (o sin permiso de crear proyectos)' }

  const url = VERCEL_TEAM_ID
    ? `https://api.vercel.com/v11/projects?teamId=${VERCEL_TEAM_ID}`
    : `https://api.vercel.com/v11/projects`

  const res = await fetchExternalJson(url, { Authorization: `Bearer ${VERCEL_TOKEN}` }, {
    method: 'POST',
    timeoutMs: 20000,
    body: {
      name: opts.projectName,
      framework: 'nextjs',
      gitRepository: { type: 'github', repo: opts.githubRepoFullName },
      // Nunca mandar una variable con valor vacío: Vercel la crearía igual (key="" literal), y
      // la app del cliente arrancaría con NEXT_PUBLIC_SUPABASE_URL="" — mismo crash de
      // createClient('','') que este propio repo, pero del lado del cliente, donde nadie lo
      // puede diagnosticar. El caller (provision-client/route.ts) ya bloquea antes de llegar
      // aquí si falta algo crítico — esto es una segunda barrera, no la única.
      environmentVariables: opts.envVars.filter((v) => v.value !== '').map((v) => ({
        key: v.key, value: v.value, type: 'encrypted', target: ['production', 'preview', 'development'],
      })),
    },
  })
  if (!res.ok) return res
  return {
    ok: true as const,
    projectId: res.data.id as string,
    name: res.data.name as string,
    // El dominio real tarda unos segundos en aparecer tras crear el proyecto; se puede
    // resolver después con GET /v9/projects/{id}/domains si se necesita de inmediato.
    deployUrl: `https://${res.data.name}.vercel.app`,
  }
}

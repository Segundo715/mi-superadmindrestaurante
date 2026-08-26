// Wrapper tolerante a fallos para la API de Vercel. Nunca lanza: si falta VERCEL_TOKEN o la
// llamada falla/tardea, devuelve { ok: false, error }. El monitoreo de flota debe degradar a
// 'unknown' en vez de tronar cuando esto pasa (ver Documentacion/documentos/plan-multiproducto-y-flota-2026-08-21.md §4.3).
import { fetchExternalJson } from '@/lib/externalFetch'

const VERCEL_TOKEN = process.env.VERCEL_TOKEN
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID

async function vercelFetch(path: string) {
  if (!VERCEL_TOKEN) return { ok: false as const, error: 'VERCEL_TOKEN no configurado' }
  // Un teamId=vacío en la query no es "sin team" para la API de Vercel — la rechaza. Omitir
  // el parámetro por completo si no está configurado (cuenta personal, no de team).
  const url = VERCEL_TEAM_ID
    ? `https://api.vercel.com${path}${path.includes('?') ? '&' : '?'}teamId=${VERCEL_TEAM_ID}`
    : `https://api.vercel.com${path}`
  const res = await fetchExternalJson(url, { Authorization: `Bearer ${VERCEL_TOKEN}` })
  if (!res.ok) return { ok: false as const, error: `Vercel API ${res.error}` }
  return { ok: true as const, data: res.data }
}

export async function getLatestDeployment(projectId: string) {
  const res = await vercelFetch(`/v6/deployments?projectId=${projectId}&limit=1&target=production`)
  if (!res.ok) return res
  const d = res.data?.deployments?.[0]
  if (!d) return { ok: false as const, error: 'Sin deployments' }
  return {
    ok: true as const,
    state: d.state as string | undefined,
    id: d.uid as string | undefined,
    createdAt: d.created ? new Date(d.created).toISOString() : undefined,
    commitSha: d.meta?.githubCommitSha as string | undefined,
    commitMessage: d.meta?.githubCommitMessage as string | undefined,
  }
}

export async function getDeploymentEvents(deploymentId: string) {
  return vercelFetch(`/v3/deployments/${deploymentId}/events`)
}

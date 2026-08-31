// Wrapper tolerante a fallos para la API de GitHub. Igual que vercelApi.ts: nunca lanza,
// devuelve { ok: false, error } si falta GITHUB_TOKEN o la llamada falla.
import { fetchExternalJson } from '@/lib/externalFetch'

const GITHUB_TOKEN = process.env.GITHUB_TOKEN

async function ghFetch(path: string) {
  if (!GITHUB_TOKEN) return { ok: false as const, error: 'GITHUB_TOKEN no configurado' }
  const res = await fetchExternalJson(`https://api.github.com${path}`, {
    Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json',
  })
  if (!res.ok) return { ok: false as const, error: `GitHub API ${res.error}` }
  return { ok: true as const, data: res.data }
}

export async function getLatestCommit(owner: string, repo: string, branch: string) {
  const res = await ghFetch(`/repos/${owner}/${repo}/commits/${branch}`)
  if (!res.ok) return res
  return { ok: true as const, sha: res.data?.sha as string | undefined, date: res.data?.commit?.committer?.date as string | undefined }
}

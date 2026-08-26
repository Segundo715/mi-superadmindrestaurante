// Wrapper tolerante a fallos para la API de GitHub. Igual que vercelApi.ts: nunca lanza,
// devuelve { ok: false, error } si falta GITHUB_TOKEN o la llamada falla. El endpoint `compare`
// requiere que los repos compartan historia (fork real) — si son copias independientes devuelve
// 404 y el monitoreo debe caer a 'unknown' para commitsBehind, no tronar.
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

export async function compareBranches(baseOwner: string, baseRepo: string, baseBranch: string, headOwner: string, headBranch: string) {
  const res = await ghFetch(`/repos/${baseOwner}/${baseRepo}/compare/${baseBranch}...${headOwner}:${headBranch}`)
  if (!res.ok) return res
  return { ok: true as const, behindBy: res.data?.behind_by as number | undefined, aheadBy: res.data?.ahead_by as number | undefined }
}

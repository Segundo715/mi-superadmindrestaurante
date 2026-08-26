// Trae los eventos de build de un deployment de Vercel bajo demanda (modal de detalle de Flota).
// Deliberadamente NO se llama desde el cron — es pesado, solo se pide cuando el superadmin lo abre.
import { NextRequest } from 'next/server'
import { verifySaSession } from '@/lib/saAuth'
import { getDeploymentEvents } from '@/lib/vercelApi'

export async function GET(req: NextRequest) {
  if (!await verifySaSession()) return Response.json({ error: 'No autorizado' }, { status: 401 })
  const deploymentId = new URL(req.url).searchParams.get('deploymentId')
  if (!deploymentId) return Response.json({ error: 'Falta deploymentId' }, { status: 400 })
  const res = await getDeploymentEvents(deploymentId)
  if (!res.ok) return Response.json({ error: res.error }, { status: 502 })
  return Response.json(res.data)
}

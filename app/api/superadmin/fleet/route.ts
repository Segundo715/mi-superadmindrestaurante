// Monitoreo de flota (tabla sa_fleet_status): GET lee el caché ya calculado por el cron
// (/api/cron/fleet-refresh), POST refresca un restaurante bajo demanda (botón 🔄 de una fila).
// Este endpoint NUNCA llama a Vercel/GitHub por su cuenta en el GET — solo sirve lo que ya está
// en la tabla, para que la vista cargue rápido con 100+ clientes.
import { NextRequest } from 'next/server'
import { verifySaSession } from '@/lib/saAuth'
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin'
import { checkOneRestaurant } from '@/lib/fleetCheck'

function toFleetStatus(r: Record<string, unknown>) {
  return {
    restaurantPk: r.restaurant_pk,
    productId: r.product_id,
    checkedAt: r.checked_at,
    httpStatus: r.http_status,
    httpOk: r.http_ok,
    httpLatencyMs: r.http_latency_ms,
    httpError: r.http_error,
    vercelState: r.vercel_state,
    vercelDeployId: r.vercel_deploy_id,
    vercelDeployAt: r.vercel_deploy_at,
    vercelDeploySha: r.vercel_deploy_sha,
    vercelError: r.vercel_error,
    repoHeadSha: r.repo_head_sha,
    repoHeadAt: r.repo_head_at,
    baseHeadSha: r.base_head_sha,
    commitsBehind: r.commits_behind,
    commitsAhead: r.commits_ahead,
    githubError: r.github_error,
    health: r.health,
    healthReason: r.health_reason,
  }
}

export async function GET(req: NextRequest) {
  if (!await verifySaSession()) return Response.json({ error: 'No autorizado' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const product = searchParams.get('product')
  const health = searchParams.get('health')

  let q = supabase.from('sa_fleet_status').select('*')
  if (product) q = q.eq('product_id', product)
  if (health) q = q.eq('health', health)

  const { data, error } = await q
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json((data ?? []).map(toFleetStatus))
}

export async function POST(req: NextRequest) {
  if (!await verifySaSession()) return Response.json({ error: 'No autorizado' }, { status: 401 })
  const body = await req.json()
  if (!body.restaurantId) return Response.json({ error: 'Falta restaurantId' }, { status: 400 })

  const { data: restaurant, error: rErr } = await supabase.from('sa_restaurants').select('*').eq('id', body.restaurantId).single()
  if (rErr || !restaurant) return Response.json({ error: 'Restaurante no encontrado' }, { status: 404 })

  const result = await checkOneRestaurant(restaurant)
  const { error } = await supabase.from('sa_fleet_status').upsert(result, { onConflict: 'restaurant_pk' })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(toFleetStatus(result))
}

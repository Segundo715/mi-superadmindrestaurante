// Historial de parches aplicados por cliente (tabla sa_client_updates).
// GET: lista con filtros. POST: registra un parche para uno o varios restaurantes,
// excluyendo automáticamente a los que ya no tienen derecho a actualizaciones (pago único vencido).
// PATCH: actualiza el resultado de una entrada (lo usará el cron de flota para auto-verificar).
import { NextRequest } from 'next/server'
import { verifySaSession } from '@/lib/saAuth'
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin'
import { logAuditMany } from '@/lib/audit'

function toUpdate(r: Record<string, unknown>) {
  return {
    id: r.id,
    restaurantPk: r.restaurant_pk,
    restaurantId: r.restaurant_id,
    restaurantName: r.restaurant_name,
    productId: r.product_id,
    commitHash: r.commit_hash,
    commitMessage: r.commit_message,
    baseCommitHash: r.base_commit_hash,
    versionLabel: r.version_label,
    descripcion: r.descripcion,
    tipo: r.tipo,
    resultado: r.resultado,
    deployId: r.deploy_id,
    deployUrl: r.deploy_url,
    errorDetail: r.error_detail,
    aplicadoPor: r.aplicado_por,
    aplicadoAt: r.aplicado_at,
    verificadoAt: r.verificado_at,
  }
}

export async function GET(req: NextRequest) {
  if (!await verifySaSession()) return Response.json({ error: 'No autorizado' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const restaurantPk = searchParams.get('restaurantId')
  const product = searchParams.get('product')
  const resultado = searchParams.get('resultado')
  const limit = Number(searchParams.get('limit') ?? 200)

  let q = supabase.from('sa_client_updates').select('*').order('aplicado_at', { ascending: false }).limit(limit)
  if (restaurantPk) q = q.eq('restaurant_pk', restaurantPk)
  if (product) q = q.eq('product_id', product)
  if (resultado) q = q.eq('resultado', resultado)

  const { data, error } = await q
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json((data ?? []).map(toUpdate))
}

export async function POST(req: NextRequest) {
  if (!await verifySaSession()) return Response.json({ error: 'No autorizado' }, { status: 401 })
  const body = await req.json()
  const {
    restaurantIds, product, commitHash, commitMessage, baseCommitHash, versionLabel,
    descripcion, tipo = 'fix', resultado = 'aplicado', appliedBy = 'superadmin',
  } = body

  if (!commitHash && !descripcion) {
    return Response.json({ error: 'Falta commitHash o descripcion' }, { status: 400 })
  }

  // Resuelve el conjunto de restaurantes destino: lista explícita de PKs, o todos los de un producto.
  if (!(Array.isArray(restaurantIds) && restaurantIds.length > 0) && !product) {
    return Response.json({ error: 'Falta restaurantIds o product' }, { status: 400 })
  }
  let targetsQuery = supabase.from('sa_restaurants').select('id, name, restaurant_id, product_id, updates_until')
  targetsQuery = Array.isArray(restaurantIds) && restaurantIds.length > 0
    ? targetsQuery.in('id', restaurantIds)
    : targetsQuery.eq('product_id', product)
  const { data } = await targetsQuery
  const targets = data ?? []

  const today = new Date().toISOString().split('T')[0]
  const eligible = targets.filter((r) => !r.updates_until || r.updates_until >= today)
  const skipped = targets
    .filter((r) => r.updates_until && r.updates_until < today)
    .map((r) => ({ restaurantId: r.id, reason: `updates_until vencido (${r.updates_until})` }))

  if (eligible.length === 0) {
    return Response.json({ ok: true, created: 0, entries: [], skipped })
  }

  const rows = eligible.map((r) => ({
    restaurant_pk: r.id,
    restaurant_id: r.restaurant_id,
    restaurant_name: r.name,
    product_id: r.product_id,
    commit_hash: commitHash ?? null,
    commit_message: commitMessage ?? null,
    base_commit_hash: baseCommitHash ?? null,
    version_label: versionLabel ?? null,
    descripcion: descripcion ?? null,
    tipo,
    resultado,
    aplicado_por: appliedBy,
  }))

  const { data: inserted, error } = await supabase.from('sa_client_updates').insert(rows).select()
  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Un registro de auditoría por cliente, siguiendo la convención ya establecida en CLAUDE.md.
  await logAuditMany(eligible.map((r) => ({
    user: appliedBy,
    restaurant: r.name,
    action: 'Parche aplicado',
    details: `${versionLabel ?? commitHash ?? ''} — ${descripcion ?? commitMessage ?? ''}`.trim(),
    type: 'update' as const,
  })))

  return Response.json({
    ok: true,
    created: inserted?.length ?? 0,
    entries: (inserted ?? []).map(toUpdate),
    skipped,
  }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  if (!await verifySaSession()) return Response.json({ error: 'No autorizado' }, { status: 401 })
  const body = await req.json()
  if (!body.id) return Response.json({ error: 'Falta id' }, { status: 400 })
  const patch: Record<string, unknown> = {}
  if (body.resultado !== undefined)    patch.resultado     = body.resultado
  if (body.errorDetail !== undefined)  patch.error_detail  = body.errorDetail
  if (body.deployId !== undefined)     patch.deploy_id     = body.deployId
  if (body.deployUrl !== undefined)    patch.deploy_url    = body.deployUrl
  if (body.verificadoAt !== undefined) patch.verificado_at = body.verificadoAt
  else if (body.resultado === 'deploy_ok' || body.resultado === 'deploy_error') patch.verificado_at = new Date().toISOString()

  const { data, error } = await supabase.from('sa_client_updates').update(patch).eq('id', body.id).select().single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(toUpdate(data))
}

// PATCH para actualizar plan/estado/notas de un restaurante. DELETE elimina el registro completo.
import { NextRequest } from 'next/server'

import { verifySaSession } from '@/lib/saAuth'
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin'
import { toRestaurant } from '@/lib/mapRestaurant'
import { logAudit } from '@/lib/audit'

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!await verifySaSession()) return Response.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  const body = await req.json()
  const patch: Record<string, unknown> = {}
  if (body.status !== undefined)              patch.status               = body.status
  if (body.plan !== undefined)                patch.plan                 = body.plan
  if (body.notes !== undefined)               patch.notes                = body.notes
  if (body.balance !== undefined)             patch.balance              = body.balance
  if (body.nextPayment !== undefined)         patch.next_payment         = body.nextPayment
  if (body.lastPayment !== undefined)         patch.last_payment         = body.lastPayment
  if (body.maxUsers !== undefined)            patch.max_users            = body.maxUsers
  if (body.productId !== undefined)           patch.product_id           = body.productId
  if (body.billingMode !== undefined)         patch.billing_mode         = body.billingMode
  if (body.subscriptionStatus !== undefined)  patch.subscription_status  = body.subscriptionStatus
  if (body.updatesUntil !== undefined)        patch.updates_until        = body.updatesUntil
  if (body.supportUntil !== undefined)        patch.support_until        = body.supportUntil
  if (body.repoOwner !== undefined)           patch.repo_owner           = body.repoOwner
  if (body.repoName !== undefined)            patch.repo_name            = body.repoName
  if (body.repoBranch !== undefined)          patch.repo_branch          = body.repoBranch
  if (body.repoUrl !== undefined)             patch.repo_url             = body.repoUrl
  if (body.deployUrl !== undefined)           patch.deploy_url           = body.deployUrl
  if (body.vercelProjectId !== undefined)     patch.vercel_project_id    = body.vercelProjectId
  if (body.vercelTeamId !== undefined)        patch.vercel_team_id       = body.vercelTeamId
  const { data, error } = await supabase.from('sa_restaurants').update(patch).eq('id', id).select().single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(toRestaurant(data))
}

export async function DELETE(_: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!await verifySaSession()) return Response.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params

  // Snapshot completo de la fila ANTES de borrarla, en sa_audit_log.details (JSON). Sin esto,
  // un DELETE por accidente es irrecuperable — ya pasó una vez (2026-08-26, "Los Portales" se
  // borró sin querer y no había nada de dónde reconstruirlo salvo lo que quedaba en capturas de
  // pantalla). No es un soft-delete real (la fila sí se borra de sa_restaurants), pero al menos
  // deja los datos completos guardados en el log para recrearla a mano si hace falta.
  const { data: before } = await supabase.from('sa_restaurants').select('*').eq('id', id).maybeSingle()

  const { error } = await supabase.from('sa_restaurants').delete().eq('id', id)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  let snapshotWarning: string | undefined
  if (before) {
    const result = await logAudit({
      restaurant: before.name ?? '—',
      action: 'Restaurante eliminado',
      details: JSON.stringify(before),
      type: 'delete',
    })
    // El restaurante ya se borró (no hay forma de deshacer eso aquí) — pero si el snapshot de
    // seguridad tampoco se guardó, hay que decirlo: es justo el caso que este snapshot existe para
    // prevenir (ver comentario arriba, incidente de "Los Portales" 2026-08-26).
    if (!result.ok) snapshotWarning = `El restaurante se eliminó, pero no se pudo guardar el snapshot de respaldo: ${result.error}`
  }

  return Response.json({ ok: true, warning: snapshotWarning })
}

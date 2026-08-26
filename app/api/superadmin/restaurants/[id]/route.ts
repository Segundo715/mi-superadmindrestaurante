// PATCH para actualizar plan/estado/notas de un restaurante. DELETE elimina el registro completo.
import { NextRequest } from 'next/server'

import { verifySaSession } from '@/lib/saAuth'
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin'
import { toRestaurant } from '@/lib/mapRestaurant'

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
  const { error } = await supabase.from('sa_restaurants').delete().eq('id', id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}

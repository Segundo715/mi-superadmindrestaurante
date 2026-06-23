// PATCH para actualizar plan/estado/notas de un restaurante. DELETE elimina el registro completo.
import { NextRequest } from 'next/server'

import { verifySaSession } from '@/lib/saAuth'
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin'

function toRestaurant(r: Record<string, unknown>) {
  return {
    id: r.id, name: r.name, plan: r.plan, status: r.status,
    users: r.users, maxUsers: r.max_users,
    registeredAt: r.registered_at, balance: r.balance,
    nextPayment: r.next_payment, lastPayment: r.last_payment,
    email: r.email, notes: r.notes, apiToken: r.api_token,
    lastActive: r.last_active, loginCount: r.login_count,
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!await verifySaSession()) return Response.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  const body = await req.json()
  const patch: Record<string, unknown> = {}
  if (body.status !== undefined)      patch.status       = body.status
  if (body.plan !== undefined)        patch.plan         = body.plan
  if (body.notes !== undefined)       patch.notes        = body.notes
  if (body.balance !== undefined)     patch.balance      = body.balance
  if (body.nextPayment !== undefined) patch.next_payment = body.nextPayment
  if (body.lastPayment !== undefined) patch.last_payment = body.lastPayment
  if (body.maxUsers !== undefined)    patch.max_users    = body.maxUsers
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

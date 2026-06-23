// PATCH para aprobar o rechazar una solicitud (status: approved/rejected + rejectReason opcional).
import { NextRequest } from 'next/server'

import { verifySaSession } from '@/lib/saAuth'
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin'

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!await verifySaSession()) return Response.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  const body = await req.json()
  const patch: Record<string, unknown> = { status: body.status }
  if (body.rejectReason !== undefined) patch.reject_reason = body.rejectReason
  const { error } = await supabase.from('sa_requests').update(patch).eq('id', id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}

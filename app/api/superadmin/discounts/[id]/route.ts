// PATCH para activar/desactivar o editar un código. DELETE elimina el código.
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySaSession } from '@/lib/saAuth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!await verifySaSession()) return Response.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  const body = await req.json()
  const patch: Record<string, unknown> = {}
  if (body.active !== undefined) patch.active = body.active
  if (body.uses !== undefined)   patch.uses   = body.uses
  const { error } = await supabase.from('sa_discounts').update(patch).eq('id', id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}

export async function DELETE(_: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!await verifySaSession()) return Response.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  const { error } = await supabase.from('sa_discounts').delete().eq('id', id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}

// Códigos de descuento (tabla sa_discounts): GET lista todos, POST crea uno nuevo.
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySaSession } from '@/lib/saAuth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function toDiscount(r: Record<string, unknown>) {
  return {
    id: r.id,
    code: r.code,
    discount: r.discount,
    type: r.type,
    maxUses: r.max_uses,
    uses: r.uses,
    expiresAt: r.expires_at,
    active: r.active,
    note: r.note,
  }
}

export async function GET() {
  if (!await verifySaSession()) return Response.json({ error: 'No autorizado' }, { status: 401 })
  const { data, error } = await supabase.from('sa_discounts').select('*').order('active', { ascending: false })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json((data ?? []).map(toDiscount))
}

export async function POST(req: NextRequest) {
  if (!await verifySaSession()) return Response.json({ error: 'No autorizado' }, { status: 401 })
  const body = await req.json()
  const { data, error } = await supabase.from('sa_discounts').insert({
    code: body.code.trim().toUpperCase(),
    discount: body.discount,
    type: body.type ?? '%',
    max_uses: body.maxUses ?? 100,
    uses: 0,
    expires_at: body.expiresAt,
    active: true,
    note: body.note ?? '',
  }).select().single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(toDiscount(data), { status: 201 })
}

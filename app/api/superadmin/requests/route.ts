// Solicitudes de acceso a módulos (tabla sa_requests): GET lista, POST crea nueva solicitud.
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySaSession } from '@/lib/saAuth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function toRequest(r: Record<string, unknown>) {
  const ts = new Date(r.ts as string)
  return {
    id: r.id,
    restaurantName: r.restaurant_name,
    requestedBy: r.requested_by,
    feature: r.feature,
    reason: r.reason,
    ts: `${ts.toISOString().split('T')[0]} ${ts.toTimeString().slice(0, 5)}`,
    status: r.status,
    rejectReason: r.reject_reason ?? undefined,
  }
}

export async function GET() {
  if (!await verifySaSession()) return Response.json({ error: 'No autorizado' }, { status: 401 })
  const { data, error } = await supabase.from('sa_requests').select('*').order('ts', { ascending: false })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json((data ?? []).map(toRequest))
}

export async function POST(req: NextRequest) {
  if (!await verifySaSession()) return Response.json({ error: 'No autorizado' }, { status: 401 })
  const body = await req.json()
  const { data, error } = await supabase.from('sa_requests').insert({
    restaurant_name: body.restaurantName,
    requested_by: body.requestedBy,
    feature: body.feature,
    reason: body.reason ?? '',
    status: 'pending',
  }).select().single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(toRequest(data), { status: 201 })
}

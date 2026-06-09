// Configuración de seguridad por restaurante (tabla sa_security): horas de sesión, PIN, horario y whitelist IP.
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySaSession } from '@/lib/saAuth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function toConfig(r: Record<string, unknown>) {
  return {
    restaurantId: r.restaurant_id,
    sessionHours: r.session_hours,
    pinRequired: r.pin_required,
    allowedStart: r.allowed_start,
    allowedEnd: r.allowed_end,
    maxFailedLogins: r.max_failed_logins,
    ipWhitelist: r.ip_whitelist,
  }
}

export async function GET() {
  if (!await verifySaSession()) return Response.json({ error: 'No autorizado' }, { status: 401 })
  const { data, error } = await supabase.from('sa_security').select('*')
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json((data ?? []).map(toConfig))
}

export async function POST(req: NextRequest) {
  if (!await verifySaSession()) return Response.json({ error: 'No autorizado' }, { status: 401 })
  const body = await req.json()
  const { error } = await supabase.from('sa_security').upsert({
    restaurant_id: body.restaurantId,
    session_hours: body.sessionHours ?? 8,
    pin_required: body.pinRequired ?? false,
    allowed_start: body.allowedStart ?? '07:00',
    allowed_end: body.allowedEnd ?? '23:00',
    max_failed_logins: body.maxFailedLogins ?? 5,
    ip_whitelist: body.ipWhitelist ?? false,
  }, { onConflict: 'restaurant_id' })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}

// Log de auditoría (tabla sa_audit_log): GET lista entradas, POST registra una nueva acción.
// Se escribe automáticamente cada vez que el SuperAdmin modifica plan, estado o flags de un restaurante.
import { NextRequest } from 'next/server'
import { verifySaSession } from '@/lib/saAuth'
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin'

function toEntry(r: Record<string, unknown>) {
  const ts = new Date(r.ts as string)
  return {
    id: r.id,
    ts: `${ts.toISOString().split('T')[0]} ${ts.toTimeString().slice(0, 5)}`,
    user: r.user_name,
    restaurant: r.restaurant,
    action: r.action,
    details: r.details,
    ip: r.ip,
    type: r.type,
  }
}

export async function GET() {
  if (!await verifySaSession()) return Response.json({ error: 'No autorizado' }, { status: 401 })
  const { data, error } = await supabase.from('sa_audit_log').select('*').order('ts', { ascending: false }).limit(200)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json((data ?? []).map(toEntry))
}

export async function POST(req: NextRequest) {
  if (!await verifySaSession()) return Response.json({ error: 'No autorizado' }, { status: 401 })
  const body = await req.json()
  const { data, error } = await supabase.from('sa_audit_log').insert({
    user_name: body.user ?? 'superadmin',
    restaurant: body.restaurant ?? '—',
    action: body.action,
    details: body.details ?? '',
    ip: '187.xxx.12',
    type: body.type ?? 'update',
  }).select().single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(toEntry(data), { status: 201 })
}

// Deshace un cambio de plan/producto restaurando sa_restaurants desde el snapshot guardado en
// sa_migrations.payload_before. No hay filas de datos que revertir porque upgrade-plan no copia
// datos entre productos todavía (ver comentario en ../route.ts).
import { NextRequest } from 'next/server'
import { verifySaSession } from '@/lib/saAuth'
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin'
import { logAudit } from '@/lib/audit'
import { pickPlanChangeFields } from '@/lib/planChangeFields'

export async function POST(req: NextRequest) {
  if (!await verifySaSession()) return Response.json({ error: 'No autorizado' }, { status: 401 })
  const body = await req.json()
  if (!body.migrationId) return Response.json({ error: 'Falta migrationId' }, { status: 400 })

  const { data: migration, error: mErr } = await supabase.from('sa_migrations').select('*').eq('id', body.migrationId).single()
  if (mErr || !migration) return Response.json({ error: 'Migración no encontrada' }, { status: 404 })
  if (migration.status === 'rolled_back') return Response.json({ error: 'Ya fue revertida' }, { status: 400 })

  // No revertir una migración vieja si el restaurante ya tiene un cambio de plan MÁS RECIENTE:
  // restaurar el snapshot de esta migración pisaría silenciosamente ese cambio posterior.
  // body.force:true permite hacerlo de todas formas (ej. para deshacer una cadena completa a mano).
  const { data: newer } = await supabase
    .from('sa_migrations')
    .select('id, to_plan, started_at')
    .eq('restaurant_pk', migration.restaurant_pk)
    .gt('started_at', migration.started_at)
    .neq('status', 'rolled_back')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (newer && !body.force) {
    return Response.json({
      error: `Hay un cambio de plan más reciente (${newer.to_plan}, ${newer.id}) — revertir esta migración lo pisaría`,
      hint: 'Reintenta con force:true si de verdad quieres restaurar este snapshot de todas formas',
    }, { status: 409 })
  }

  const before = JSON.parse(migration.payload_before) as Record<string, unknown>
  const restore = pickPlanChangeFields(before)

  const { error: uErr } = await supabase.from('sa_restaurants').update(restore).eq('id', migration.restaurant_pk)
  if (uErr) return Response.json({ error: uErr.message }, { status: 500 })

  // sa_restaurants ya se restauró (arriba) — eso es lo que importa de verdad. Pero si este UPDATE
  // falla, la migración se queda sin marcar 'rolled_back' y el chequeo de la línea 17 no la
  // bloquearía en un segundo intento (restaurar el mismo snapshot dos veces es inofensivo, pero
  // mejor avisar que el registro de la migración quedó inconsistente en vez de reportar éxito
  // silencioso).
  const { error: closeErr } = await supabase.from('sa_migrations').update({ status: 'rolled_back', finished_at: new Date().toISOString() }).eq('id', migration.id)
  await logAudit({
    restaurant: (before.name as string) ?? '—',
    action: 'Cambio de plan revertido',
    details: `${migration.to_plan} → ${migration.from_plan} (rollback de ${migration.id})`,
    type: 'billing',
  })

  return Response.json({ ok: true, warning: closeErr ? `El restaurante se restauró, pero no se pudo cerrar el registro de la migración: ${closeErr.message}` : undefined })
}

import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

// Escapa metacaracteres de regex POSIX antes de meter un valor externo (restaurantId) en un
// patrón — sin esto, un restaurantId con '.', '(', '|', etc. cambiaría lo que el patrón matchea,
// o en el peor caso podría diseñarse para matchear notas de otro restaurante a propósito.
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Endpoint público que cada restaurante llama al hacer login de admin.
// Crea o actualiza su registro en sa_restaurants.
export async function POST(req: NextRequest) {
  const { key, restaurantId, name, users } = await req.json()

  if (!process.env.NICHO_REGISTER_KEY || key !== process.env.NICHO_REGISTER_KEY)
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  // typeof, no solo truthiness: un restaurantId numérico (JSON no distingue "123" de 123) pasaba
  // el chequeo de arriba pero tronaba más abajo en escapeRegex() con un TypeError sin manejar
  // ("123.replace is not a function") en vez de este 400 limpio.
  if (typeof restaurantId !== 'string' || !restaurantId || typeof name !== 'string' || !name)
    return Response.json({ error: 'Faltan datos' }, { status: 400 })

  const now = new Date().toISOString()

  // Buscar primero por la columna restaurant_id (fuente de verdad desde 2026-08-21).
  // Fallback al match exacto sobre notes solo para restaurantes que aún no tengan el backfill —
  // se mantienen como dos consultas en cascada (no un .or() combinado) a propósito: si por algún
  // dato viejo llegara a existir una fila duplicada que matchee ambos criterios a la vez,
  // combinarlos en una sola consulta haría que .maybeSingle() truene; la prioridad estricta
  // (primero restaurant_id, solo si no hay match se prueba notes) evita ese caso.
  let existing = (await supabaseAdmin
    .from('sa_restaurants')
    .select('id, login_count')
    .eq('restaurant_id', restaurantId)
    .maybeSingle()).data

  if (!existing) {
    // Regex con límite de palabra en vez de .eq() exacto: tolera que alguien haya editado el
    // campo "notas" desde el panel agregando texto después del rid (ej. "rid:tacos1 - VIP"), que
    // con match exacto ya no encontraba la fila y creaba un duplicado. Y en vez de LIKE con '%'
    // (el bug original: 'rid:taco%' también matcheaba 'rid:tacos2'), el patrón exige que después
    // del id venga fin de texto o un carácter no alfanumérico — nunca cruza con un id que
    // simplemente comparte el mismo prefijo.
    existing = (await supabaseAdmin
      .from('sa_restaurants')
      .select('id, login_count')
      .regexMatch('notes', `^rid:${escapeRegex(restaurantId)}($|[^A-Za-z0-9])`)
      .maybeSingle()).data
  }

  if (existing) {
    const { error: updErr } = await supabaseAdmin
      .from('sa_restaurants')
      .update({ last_active: now, users: users ?? 1, login_count: (existing.login_count ?? 0) + 1, restaurant_id: restaurantId })
      .eq('id', existing.id)
    if (updErr) return Response.json({ error: updErr.message }, { status: 500 })
    return Response.json({ ok: true, action: 'updated' })
  }

  // Crear nuevo registro
  const { error: insErr } = await supabaseAdmin.from('sa_restaurants').insert({
    name,
    plan: 'trial',
    product_id: 'mi-proyecto',
    status: 'active',
    users: users ?? 1,
    max_users: 3,
    email: `${restaurantId}@nicho.app`,
    notes: `rid:${restaurantId}`,
    restaurant_id: restaurantId,
    api_token: `nch_live_${crypto.randomUUID()}`,
    last_active: now,
    login_count: 1,
    balance: 0,
    next_payment: '—',
    last_payment: '—',
  })
  if (insErr) {
    // 23505 = violación de la constraint UNIQUE en restaurant_id: dos requests casi simultáneas
    // (dos pestañas) para el mismo restaurantId nuevo — la otra ganó la carrera y ya creó la fila,
    // así que desde el punto de vista del caller esto es un éxito, no un error.
    if (insErr.code === '23505') return Response.json({ ok: true, action: 'created' })
    return Response.json({ error: insErr.message }, { status: 500 })
  }

  return Response.json({ ok: true, action: 'created' })
}

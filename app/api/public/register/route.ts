import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

// Endpoint público que cada restaurante llama al hacer login de admin.
// Crea o actualiza su registro en sa_restaurants.
export async function POST(req: NextRequest) {
  const { key, restaurantId, name, users } = await req.json()

  if (!process.env.NICHO_REGISTER_KEY || key !== process.env.NICHO_REGISTER_KEY)
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  if (!restaurantId || !name)
    return Response.json({ error: 'Faltan datos' }, { status: 400 })

  const now = new Date().toISOString()

  // Buscar si ya existe por restaurant_id (guardado en notes como "rid:xxx")
  const { data: existing } = await supabaseAdmin
    .from('sa_restaurants')
    .select('id, login_count')
    .like('notes', `rid:${restaurantId}%`)
    .maybeSingle()

  if (existing) {
    await supabaseAdmin
      .from('sa_restaurants')
      .update({ last_active: now, users: users ?? 1, login_count: (existing.login_count ?? 0) + 1 })
      .eq('id', existing.id)
    return Response.json({ ok: true, action: 'updated' })
  }

  // Crear nuevo registro
  await supabaseAdmin.from('sa_restaurants').insert({
    name,
    plan: 'trial',
    status: 'active',
    users: users ?? 1,
    max_users: 3,
    email: `${restaurantId}@nicho.app`,
    notes: `rid:${restaurantId}`,
    api_token: `nch_live_${Math.random().toString(36).slice(2, 14)}`,
    last_active: now,
    login_count: 1,
    balance: 0,
    next_payment: '—',
    last_payment: '—',
  })

  return Response.json({ ok: true, action: 'created' })
}

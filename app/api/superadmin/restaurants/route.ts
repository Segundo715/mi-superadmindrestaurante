// CRUD de restaurantes clientes (tabla sa_restaurants). Requiere sa_session en todas las operaciones.
import { NextRequest } from 'next/server'
import { verifySaSession } from '@/lib/saAuth'
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin'
import { toRestaurant } from '@/lib/mapRestaurant'

export async function GET() {
  if (!await verifySaSession()) return Response.json({ error: 'No autorizado' }, { status: 401 })
  const { data, error } = await supabase.from('sa_restaurants').select('*').order('created_at', { ascending: false })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json((data ?? []).map(toRestaurant))
}

export async function POST(req: NextRequest) {
  if (!await verifySaSession()) return Response.json({ error: 'No autorizado' }, { status: 401 })
  const body = await req.json()
  if (!body.name?.trim() || !body.email?.trim()) {
    return Response.json({ error: 'Falta name o email' }, { status: 400 })
  }
  const plan = body.plan ?? 'trial'

  // maxUsers y product_id salen del plan elegido (sa_plans), no de un switch hardcodeado.
  const { data: planRow, error: planErr } = await supabase.from('sa_plans').select('max_users, product_id').eq('id', plan).maybeSingle()
  if (planErr) return Response.json({ error: planErr.message }, { status: 500 })
  // Antes, un `plan` inexistente (typo, id de un plan ya borrado) caía en silencio a los defaults
  // de abajo (maxUsers:3, productId:'mi-proyecto') pero el valor inválido de `plan` igual se
  // guardaba tal cual en la fila — el restaurante quedaba con un plan que no existe en sa_plans,
  // mostrando badge/precio en blanco en el dashboard hasta que alguien lo notara y lo corrigiera
  // a mano. Mejor rechazar aquí con un 400 claro.
  if (!planRow) return Response.json({ error: `El plan "${plan}" no existe en el catálogo` }, { status: 400 })
  const maxUsers = planRow.max_users ?? 3
  const productId = planRow.product_id ?? 'mi-proyecto'

  const { data, error } = await supabase.from('sa_restaurants').insert({
    name: body.name.trim(),
    plan,
    product_id: productId,
    status: 'active',
    users: 1,
    max_users: maxUsers,
    email: body.email.trim(),
    notes: '',
    api_token: `nch_live_${crypto.randomUUID()}`,
    last_active: 'Recién registrado',
    login_count: 0,
    balance: 0,
    next_payment: '—',
    last_payment: '—',
  }).select().single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(toRestaurant(data), { status: 201 })
}

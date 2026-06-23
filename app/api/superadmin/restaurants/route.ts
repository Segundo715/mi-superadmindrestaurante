// CRUD de restaurantes clientes (tabla sa_restaurants). Requiere sa_session en todas las operaciones.
import { NextRequest } from 'next/server'
import { verifySaSession } from '@/lib/saAuth'
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin'

function toRestaurant(r: Record<string, unknown>) {
  return {
    id: r.id,
    name: r.name,
    plan: r.plan,
    status: r.status,
    users: r.users,
    maxUsers: r.max_users,
    registeredAt: r.registered_at,
    balance: r.balance,
    nextPayment: r.next_payment,
    lastPayment: r.last_payment,
    email: r.email,
    notes: r.notes,
    apiToken: r.api_token,
    lastActive: r.last_active,
    loginCount: r.login_count,
  }
}

export async function GET() {
  if (!await verifySaSession()) return Response.json({ error: 'No autorizado' }, { status: 401 })
  const { data, error } = await supabase.from('sa_restaurants').select('*').order('created_at', { ascending: false })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json((data ?? []).map(toRestaurant))
}

export async function POST(req: NextRequest) {
  if (!await verifySaSession()) return Response.json({ error: 'No autorizado' }, { status: 401 })
  const body = await req.json()
  const plan = body.plan ?? 'trial'
  const { data, error } = await supabase.from('sa_restaurants').insert({
    name: body.name.trim(),
    plan,
    status: 'active',
    users: 1,
    max_users: plan === 'premium' ? 20 : plan === 'basic' ? 5 : 3,
    email: body.email.trim(),
    notes: '',
    api_token: `nch_live_${Math.random().toString(36).slice(2, 14)}`,
    last_active: 'Recién registrado',
    login_count: 0,
    balance: 0,
    next_payment: '—',
    last_payment: '—',
  }).select().single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(toRestaurant(data), { status: 201 })
}

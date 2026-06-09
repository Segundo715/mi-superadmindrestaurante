// Configuración de planes (tabla sa_plans): trial/basic/premium con precios y features.
// El id del plan es el mismo string usado en sa_restaurants.plan.
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySaSession } from '@/lib/saAuth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const DEFAULT_PLANS = [
  { id: 'trial',   name: 'Trial',   price: 0,    trial_days: 30, max_users: 3,  color: '#3b82f6', features: JSON.stringify([
    { text: '3 usuarios incluidos', included: true },
    { text: 'Dashboard + Ventas + Operaciones', included: true },
    { text: 'Menú Inteligente + Recetario', included: true },
    { text: 'Reservaciones', included: true },
    { text: 'CRM + Reseñas', included: false },
    { text: 'Fidelización + Sellar visitas', included: false },
    { text: 'Producción / Inventario', included: false },
    { text: 'Marketing / Automatizaciones IA', included: false },
    { text: 'Analytics + Reportes', included: false },
  ]) },
  { id: 'basic',   name: 'Básico',  price: 799,  trial_days: 0,  max_users: 5,  color: '#6366f1', features: JSON.stringify([
    { text: '5 usuarios incluidos', included: true },
    { text: 'Dashboard + Ventas + Operaciones', included: true },
    { text: 'Menú Inteligente + Recetario', included: true },
    { text: 'Reservaciones + CRM + Reseñas', included: true },
    { text: 'Fidelización + Sellar visitas', included: true },
    { text: 'Producción / Inventario', included: true },
    { text: 'Reportes básicos', included: true },
    { text: 'Marketing / Automatizaciones IA', included: false },
    { text: 'Analytics avanzado + Pantallas', included: false },
  ]) },
  { id: 'premium', name: 'Premium', price: 2499, trial_days: 0,  max_users: 20, color: '#00e676', features: JSON.stringify([
    { text: '20 usuarios incluidos', included: true },
    { text: 'Dashboard + Ventas + Operaciones', included: true },
    { text: 'Menú Inteligente + Recetario', included: true },
    { text: 'Reservaciones + CRM + Reseñas', included: true },
    { text: 'Fidelización + Tarjetas digitales', included: true },
    { text: 'Producción / Inventario completo', included: true },
    { text: 'Marketing + Contenido', included: true },
    { text: 'Automatizaciones IA', included: true },
    { text: 'Analytics + Reportes + Pantallas', included: true },
  ]) },
]

function toPlan(r: Record<string, unknown>) {
  return {
    id: r.id,
    name: r.name,
    price: r.price,
    trialDays: r.trial_days,
    maxUsers: r.max_users,
    color: r.color,
    features: typeof r.features === 'string' ? JSON.parse(r.features) : r.features,
  }
}

export async function GET() {
  if (!await verifySaSession()) return Response.json({ error: 'No autorizado' }, { status: 401 })
  const { data } = await supabase.from('sa_plans').select('*')
  if (!data || data.length === 0) {
    // Seed inicial con los planes por defecto
    await supabase.from('sa_plans').insert(DEFAULT_PLANS)
    const { data: seeded } = await supabase.from('sa_plans').select('*')
    return Response.json((seeded ?? []).map(toPlan))
  }
  return Response.json(data.map(toPlan))
}

export async function PATCH(req: NextRequest) {
  if (!await verifySaSession()) return Response.json({ error: 'No autorizado' }, { status: 401 })
  const body = await req.json()
  const patch: Record<string, unknown> = {}
  if (body.price !== undefined)     patch.price      = body.price
  if (body.maxUsers !== undefined)  patch.max_users  = body.maxUsers
  if (body.features !== undefined)  patch.features   = JSON.stringify(body.features)
  if (body.color !== undefined)     patch.color      = body.color
  const { error } = await supabase.from('sa_plans').update(patch).eq('id', body.id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}

// Catálogo de planes (tabla sa_plans): producto × modalidad de pago (6 planes activos)
// + trial/basic/premium legacy (mi-proyecto, ver Documentacion/sql/migraciones/2026-08-21-*.sql).
// El id del plan es el mismo string usado en sa_restaurants.plan.
// El catálogo vive en la BD desde la migración 2026-08-21 — este archivo ya NO siembra
// planes por defecto; si sa_plans está vacía es porque la migración no se ha corrido.
import { NextRequest } from 'next/server'

import { verifySaSession } from '@/lib/saAuth'
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin'

function toPlan(r: Record<string, unknown>) {
  return {
    id: r.id,
    name: r.name,
    price: r.price,
    trialDays: r.trial_days,
    maxUsers: r.max_users,
    color: r.color,
    features: typeof r.features === 'string' ? JSON.parse(r.features) : r.features,
    productId: r.product_id,
    billingMode: r.billing_mode,
    setupFee: r.setup_fee,
    incluyeActualizaciones: r.incluye_actualizaciones,
    mesesActualizaciones: r.meses_actualizaciones,
    incluyeSoporte: r.incluye_soporte,
    mesesSoporte: r.meses_soporte,
    currency: r.currency,
    active: r.active,
    legacy: r.legacy,
    sortOrder: r.sort_order,
  }
}

export async function GET() {
  if (!await verifySaSession()) return Response.json({ error: 'No autorizado' }, { status: 401 })
  const { data, error } = await supabase.from('sa_plans').select('*').order('sort_order', { ascending: true })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json((data ?? []).map(toPlan))
}

export async function PATCH(req: NextRequest) {
  if (!await verifySaSession()) return Response.json({ error: 'No autorizado' }, { status: 401 })
  const body = await req.json()
  const patch: Record<string, unknown> = {}
  if (body.price !== undefined)                   patch.price                    = body.price
  if (body.maxUsers !== undefined)                patch.max_users                = body.maxUsers
  if (body.features !== undefined)                patch.features                 = JSON.stringify(body.features)
  if (body.color !== undefined)                   patch.color                    = body.color
  if (body.productId !== undefined)               patch.product_id               = body.productId
  if (body.billingMode !== undefined)             patch.billing_mode             = body.billingMode
  if (body.setupFee !== undefined)                patch.setup_fee                = body.setupFee
  if (body.incluyeActualizaciones !== undefined)  patch.incluye_actualizaciones  = body.incluyeActualizaciones
  if (body.mesesActualizaciones !== undefined)    patch.meses_actualizaciones    = body.mesesActualizaciones
  if (body.incluyeSoporte !== undefined)          patch.incluye_soporte          = body.incluyeSoporte
  if (body.mesesSoporte !== undefined)            patch.meses_soporte            = body.mesesSoporte
  if (body.active !== undefined)                  patch.active                   = body.active
  const { error } = await supabase.from('sa_plans').update(patch).eq('id', body.id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}

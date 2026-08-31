// Cambia el plan/producto de un restaurante (tabla sa_migrations lleva el rastro).
// Con dryRun:true (recomendado siempre primero desde la UI) no escribe nada, solo devuelve
// el resumen de la operación para que el superadmin confirme.
//
// LO QUE ESTE ENDPOINT NO HACE TODAVÍA (a propósito, ver
// Documentacion/documentos/plan-multiproducto-y-flota-2026-08-21.md §3.2):
// - No copia filas de datos entre productos (menú, clientes de lealtad, etc.) — el mapeo de
//   tablas de mi-menu/mi-card requiere confirmar el esquema real de esos repos hermanos.
// - No activa/desactiva módulos de feature flags automáticamente — no existe en este código un
//   mapeo confiable de "plan → qué módulos activar" (sa_plans.features son textos para mostrar
//   en la UI de precios, no ids de FEATURES). Se deja como advertencia explícita para revisión manual.
import { NextRequest } from 'next/server'
import { verifySaSession } from '@/lib/saAuth'
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin'
import { logAudit } from '@/lib/audit'
import { PLAN_CHANGE_COLUMNS } from '@/lib/planChangeFields'

type Step = { step: string; status: 'ok' | 'skipped' | 'pending'; note?: string }

export async function POST(req: NextRequest) {
  if (!await verifySaSession()) return Response.json({ error: 'No autorizado' }, { status: 401 })
  const body = await req.json()
  const { restaurantId, targetPlanId, dryRun = true, acknowledgeDataLoss = false, reason, appliedBy = 'superadmin' } = body

  if (!restaurantId || !targetPlanId) return Response.json({ error: 'Falta restaurantId o targetPlanId' }, { status: 400 })

  const { data: restaurant, error: rErr } = await supabase.from('sa_restaurants').select('*').eq('id', restaurantId).single()
  if (rErr || !restaurant) return Response.json({ error: 'Restaurante no encontrado' }, { status: 404 })

  // fromPlan/toPlan no dependen entre sí — en paralelo. fromProduct/toProduct sí dependen del
  // product_id de cada plan, así que van en una segunda ronda paralela, no en cascada de 4.
  const [{ data: fromPlan, error: fromPlanErr }, { data: toPlan, error: toPlanErr }] = await Promise.all([
    supabase.from('sa_plans').select('*').eq('id', restaurant.plan).maybeSingle(),
    supabase.from('sa_plans').select('*').eq('id', targetPlanId).maybeSingle(),
  ])
  // Distinguir "la consulta falló" de "el plan no existe" — antes ambos devolvían el mismo 400
  // "no existe", lo que confundía a un admin reintentando con un plan id válido durante un error
  // transitorio de Supabase.
  if (fromPlanErr || toPlanErr) return Response.json({ error: (fromPlanErr ?? toPlanErr)?.message }, { status: 500 })
  if (!toPlan) return Response.json({ error: `El plan destino "${targetPlanId}" no existe` }, { status: 400 })
  if (toPlan.active === false) return Response.json({ error: `El plan "${targetPlanId}" ya no está activo para venta` }, { status: 400 })

  const [{ data: fromProduct }, { data: toProduct }] = await Promise.all([
    fromPlan?.product_id ? supabase.from('sa_products').select('*').eq('id', fromPlan.product_id).maybeSingle() : Promise.resolve({ data: null }),
    toPlan.product_id ? supabase.from('sa_products').select('*').eq('id', toPlan.product_id).maybeSingle() : Promise.resolve({ data: null }),
  ])

  // Lock: pre-chequeo rápido para un mensaje de error amigable. La garantía real contra dos
  // migraciones 'running' simultáneas (doble-click, dos pestañas) es el índice único parcial
  // sa_migrations_running_uidx — este SELECT solo evita pegarle a la BD con un insert que sabemos
  // que va a fallar en el caso común.
  const { data: running } = await supabase.from('sa_migrations').select('id').eq('restaurant_pk', restaurantId).eq('status', 'running').maybeSingle()
  if (running && !dryRun) return Response.json({ error: 'Ya hay un cambio de plan en curso para este restaurante' }, { status: 409 })

  const sameProduct = fromPlan?.product_id === toPlan.product_id
  // Si el plan actual del restaurante ya no existe en el catálogo (Plan es un string libre, puede
  // haberse borrado), no sabemos su tier real. Asumir el tier más alto (no 0) para que la
  // comparación caiga del lado seguro — 'downgrade', que exige acknowledgeDataLoss — en vez de
  // dejar pasar un cambio potencialmente destructivo sin confirmación.
  const fromTier = fromProduct?.tier ?? 99
  const direction: 'upgrade' | 'downgrade' | 'billing_change' = sameProduct
    ? 'billing_change'
    : (toProduct?.tier ?? 0) > fromTier ? 'upgrade' : 'downgrade'

  const warnings: string[] = []
  const steps: Step[] = [{ step: 'validate', status: 'ok' }]

  if (direction === 'downgrade' && !acknowledgeDataLoss) {
    return Response.json({
      ok: false,
      error: 'Este cambio es un downgrade de producto y puede dejar fuera datos que el plan destino no soporta',
      hint: 'Reintenta con acknowledgeDataLoss:true si confirmas que quieres continuar',
      from: { planId: fromPlan?.id, productId: fromPlan?.product_id, tier: fromProduct?.tier },
      to: { planId: toPlan.id, productId: toPlan.product_id, tier: toProduct?.tier },
    }, { status: 400 })
  }

  if (!sameProduct) {
    warnings.push('Este cambio cruza de producto — la copia de datos entre productos NO está implementada todavía. Debe hacerse manualmente hasta confirmar el esquema real de los repos hermanos.')
    warnings.push('Los feature flags del producto destino no se activan automáticamente — revisa la vista "Feature Flags" para ese cliente después de confirmar.')
    if (restaurant.repo_owner || restaurant.deploy_url || restaurant.vercel_project_id) {
      warnings.push(`El repo/deploy configurado (${restaurant.deploy_url ?? restaurant.repo_name ?? 'ver detalle del cliente'}) sigue apuntando al producto anterior — actualiza repo_owner/repo_name/deploy_url/vercel_project_id manualmente en la ficha del restaurante para que el monitoreo de flota chequee la instancia correcta.`)
    }
    steps.push({ step: 'copy:data', status: 'skipped', note: 'no implementado — requiere confirmar esquema de mi-menu/mi-card' })
    steps.push({ step: 'flags', status: 'skipped', note: 'sin mapeo automático plan→módulo, revisar manualmente' })
  } else {
    steps.push({ step: 'flags', status: 'skipped', note: 'mismo producto, no aplica' });
  }

  const maxUsers = toPlan.max_users ?? restaurant.max_users
  const today = new Date()
  // Date.setMonth() se desborda al mes siguiente cuando el día actual no existe ahí (ej. 31 de
  // enero + 1 mes -> 3 de marzo, no 28 de feb) — hay que fijar el día en 1 antes de mover el mes,
  // y luego topar al último día real del mes destino.
  const addMonths = (months: number) => {
    const d = new Date(today)
    const day = d.getDate()
    d.setDate(1)
    d.setMonth(d.getMonth() + months)
    const lastDayOfTargetMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    d.setDate(Math.min(day, lastDayOfTargetMonth))
    return d.toISOString().split('T')[0]
  }
  const updatesUntil = toPlan.incluye_actualizaciones ? (toPlan.meses_actualizaciones > 0 ? addMonths(toPlan.meses_actualizaciones) : null) : today.toISOString().split('T')[0]
  const supportUntil = toPlan.incluye_soporte ? (toPlan.meses_soporte > 0 ? addMonths(toPlan.meses_soporte) : null) : today.toISOString().split('T')[0]

  const preview = {
    ok: true,
    dryRun: true,
    from: { planId: fromPlan?.id ?? restaurant.plan, productId: fromPlan?.product_id ?? null, tier: fromProduct?.tier ?? null },
    to: { planId: toPlan.id, productId: toPlan.product_id, tier: toProduct?.tier ?? null },
    direction,
    steps: [...steps, { step: 'update:restaurant', status: 'pending' }, { step: 'audit', status: 'pending' }],
    changes: { maxUsers, billingMode: toPlan.billing_mode, updatesUntil, supportUntil, subscriptionStatus: toPlan.billing_mode === 'unico' ? 'pagada_unico' : 'activa' },
    warnings,
  }

  if (dryRun) return Response.json(preview)

  // ── Ejecuta de verdad ──
  const payloadBefore = JSON.stringify(restaurant)
  const { data: migration, error: mErr } = await supabase.from('sa_migrations').insert({
    restaurant_pk: restaurantId,
    restaurant_id: restaurant.restaurant_id,
    from_plan: fromPlan?.id ?? restaurant.plan,
    to_plan: toPlan.id,
    from_product: fromPlan?.product_id ?? null,
    to_product: toPlan.product_id,
    direction,
    status: 'running',
    steps: JSON.stringify(steps),
    payload_before: payloadBefore,
    warnings: JSON.stringify(warnings),
    applied_by: appliedBy,
  }).select().single()
  if (mErr) {
    // Violación del índice único sa_migrations_running_uidx: ya había una migración 'running'
    // para este restaurante (doble-click, dos pestañas) — es la garantía real del lock, el
    // pre-chequeo de arriba es solo para el caso común sin condición de carrera.
    if (mErr.code === '23505') return Response.json({ error: 'Ya hay un cambio de plan en curso para este restaurante' }, { status: 409 })
    return Response.json({ error: mErr.message }, { status: 500 })
  }

  // Tipado contra PLAN_CHANGE_COLUMNS: si se agrega una columna al array compartido con
  // rollback/route.ts, TypeScript obliga a rellenarla aquí también (y viceversa).
  const restaurantUpdate: Record<(typeof PLAN_CHANGE_COLUMNS)[number], unknown> = {
    plan: toPlan.id,
    product_id: toPlan.product_id,
    billing_mode: toPlan.billing_mode,
    max_users: maxUsers,
    previous_plan: fromPlan?.id ?? restaurant.plan,
    plan_changed_at: new Date().toISOString(),
    subscription_status: toPlan.billing_mode === 'unico' ? 'pagada_unico' : 'activa',
    updates_until: updatesUntil,
    support_until: supportUntil,
  }
  const { error: uErr } = await supabase.from('sa_restaurants').update(restaurantUpdate).eq('id', restaurantId)

  if (uErr) {
    await supabase.from('sa_migrations').update({ status: 'failed', finished_at: new Date().toISOString() }).eq('id', migration.id)
    return Response.json({ ok: false, migrationId: migration.id, failedAt: 'update:restaurant', error: uErr.message, rollbackAvailable: true }, { status: 409 })
  }

  await supabase.from('sa_migrations').update({
    status: 'ok',
    steps: JSON.stringify([...steps, { step: 'update:restaurant', status: 'ok' }, { step: 'audit', status: 'ok' }]),
    finished_at: new Date().toISOString(),
  }).eq('id', migration.id)

  await logAudit({
    user: appliedBy,
    restaurant: restaurant.name,
    action: 'Cambio de plan/producto',
    details: `${fromPlan?.name ?? restaurant.plan} → ${toPlan.name}${reason ? ` — ${reason}` : ''}`,
    type: 'billing',
  })

  return Response.json({
    ok: true,
    dryRun: false,
    migrationId: migration.id,
    from: preview.from,
    to: preview.to,
    direction,
    // El frontend (Billing.applyPlanChange / Plans.applyAssign) lee `changes` para actualizar su
    // estado local sin recargar — antes esta respuesta no lo traía (solo el preview de dryRun sí),
    // así que maxUsers/billingMode/etc. quedaban desactualizados en pantalla hasta refrescar aunque
    // sa_restaurants ya tuviera los valores correctos.
    changes: preview.changes,
    dataMigration: { implemented: sameProduct ? null : false, reason: sameProduct ? null : 'Requiere confirmar esquema real de mi-menu/mi-card antes de automatizar la copia de datos' },
    warnings,
  }, { status: 201 })
}

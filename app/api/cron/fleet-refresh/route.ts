// Job periódico de monitoreo de flota. Protegido con CRON_SECRET (no hay cookie de sesión en
// una invocación de cron, así que NO usa verifySaSession()). Revisa un lote de restaurantes
// (los que llevan más tiempo sin chequear primero) con concurrencia limitada, para no saturar
// las APIs externas ni la función serverless con 100 clientes de golpe.
import { NextRequest } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin'
import { checkOneRestaurant, type ProductRow } from '@/lib/fleetCheck'
import { logAuditMany } from '@/lib/audit'
import { runInPool } from '@/lib/pool'
import { sendAlertEmail, alertEmailHtml } from '@/lib/notify'

const BATCH_SIZE = 25
const CONCURRENCY = 5

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 'status' (active|suspended|maintenance) nunca vale 'cancelled' — la cancelación vive en
  // subscription_status ('cancelada'). Filtrar por el campo equivocado dejaría clientes
  // cancelados consumiendo cuota de Vercel/GitHub indefinidamente.
  // .neq() solo, sin el .is.null, excluiría en silencio cualquier fila con subscription_status
  // NULL (NULL <> 'cancelada' es NULL/false en SQL, no true) — con .or() se incluyen también esas.
  const { data: restaurants } = await supabase
    .from('sa_restaurants')
    .select('id, name, product_id, deploy_url, vercel_project_id, repo_owner, repo_name, repo_branch')
    .or('subscription_status.is.null,subscription_status.neq.cancelada')

  if (!restaurants || restaurants.length === 0) return Response.json({ checked: 0, ok: 0, warn: 0, error: 0 })

  const { data: existing } = await supabase.from('sa_fleet_status').select('restaurant_pk, checked_at, health')
  const checkedAtByPk = new Map((existing ?? []).map((r) => [r.restaurant_pk, r.checked_at as string | null]))

  const batch = [...restaurants]
    .sort((a, b) => {
      const ca = checkedAtByPk.get(a.id) ?? ''
      const cb = checkedAtByPk.get(b.id) ?? ''
      return ca.localeCompare(cb) // '' (nunca chequeado) ordena primero
    })
    .slice(0, BATCH_SIZE)

  // Precalcular una vez por lote lo que es igual para todos los restaurantes de un mismo producto:
  // la fila de sa_products (health_path). Sin esto, un lote de 25 restaurantes repartidos en 3
  // productos hacía ~22 consultas redundantes a Supabase por ciclo por el mismo dato.
  const { data: allProducts } = await supabase.from('sa_products').select('id, health_path')
  const productById = new Map((allProducts ?? []).map((p) => [p.id, p as ProductRow]))

  const started = Date.now()
  const results = await runInPool(batch, CONCURRENCY, (r) => checkOneRestaurant(r, {
    product: r.product_id ? productById.get(r.product_id) ?? null : null,
  }))

  const rows = results.filter((r) => r.status === 'fulfilled').map((r) => (r as PromiseFulfilledResult<Record<string, unknown>>).value)

  // Sin esto, un restaurante cuyo chequeo lanza una excepción real (no un simple 'error' de salud)
  // desaparecía sin dejar rastro — y como el lote siempre prioriza los menos-recientemente-
  // chequeados, uno que siempre truena quedaba primero en cada corrida y caía de la flota para
  // siempre en silencio.
  const failedRows = results
    .map((r, i) => ({ r, restaurant: batch[i] }))
    .filter(({ r }) => r.status === 'rejected') as { r: PromiseRejectedResult; restaurant: (typeof batch)[number] }[]
  if (failedRows.length > 0) {
    await logAuditMany(failedRows.map(({ r, restaurant }) => ({
      user: 'cron',
      restaurant: restaurant.name,
      action: 'Chequeo de flota falló',
      details: r.reason instanceof Error ? r.reason.message : String(r.reason),
      type: 'access' as const,
    })))
  }

  if (rows.length > 0) {
    await supabase.from('sa_fleet_status').upsert(rows, { onConflict: 'restaurant_pk' })
  }

  // Si algún restaurante pasó de ok a error, deja rastro en auditoría — así una caída queda en el historial.
  const previousHealthByPk = new Map((existing ?? []).map((r) => [r.restaurant_pk, (r as { health?: string }).health]))
  const newlyDown = rows.filter((r) => r.health === 'error' && previousHealthByPk.get(r.restaurant_pk as string) !== 'error')
  if (newlyDown.length > 0) {
    const restaurantById = new Map(restaurants.map((r) => [r.id, r]))
    await logAuditMany(newlyDown.map((r) => ({
      user: 'cron',
      restaurant: restaurantById.get(r.restaurant_pk as string)?.name ?? String(r.restaurant_pk),
      action: 'Instancia caída',
      details: String(r.health_reason ?? ''),
      type: 'access' as const,
    })))
    // Primer disparador real de lib/notify.ts — antes una caída solo se veía si alguien entraba
    // a "Flota" a mirar. Tolerante a fallos (no configurado, Gmail caído): no debe tumbar el cron.
    await sendAlertEmail(
      `⚠️ ${newlyDown.length} instancia${newlyDown.length > 1 ? 's' : ''} caída${newlyDown.length > 1 ? 's' : ''}`,
      alertEmailHtml(
        'Instancias caídas',
        'El chequeo de flota detectó que las siguientes instancias dejaron de responder:',
        newlyDown.map((r) => ({
          name: restaurantById.get(r.restaurant_pk as string)?.name ?? String(r.restaurant_pk),
          detail: String(r.health_reason ?? r.http_error ?? 'sin detalle'),
        })),
      ),
    )
  }

  const counts = { ok: 0, warn: 0, error: 0, unknown: 0 }
  for (const r of rows) counts[(r.health as keyof typeof counts) ?? 'unknown']++

  return Response.json({ checked: rows.length, failed: failedRows.length, ...counts, ms: Date.now() - started })
}

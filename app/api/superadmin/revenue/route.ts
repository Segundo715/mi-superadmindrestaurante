import { verifySaSession } from '@/lib/saAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { supabasePortales } from '@/lib/supabasePortales'

export const dynamic = 'force-dynamic'

const DELIVERY_KEYS = ['GOGO', 'RAPPI', 'UBEREATS']

function calcTotals(orders: { total: number | null; notes: string | null }[]) {
  let efectivo = 0, tarjeta = 0, transferencia = 0, domicilio = 0
  for (const o of orders) {
    const note = (o.notes ?? '').toUpperCase()
    const amt  = o.total ?? 0
    if (DELIVERY_KEYS.some(k => note.includes(`[${k}]`))) domicilio     += amt
    else if (note.includes('[TARJETA]'))                   tarjeta       += amt
    else if (note.includes('[TRANSFERENCIA]'))             transferencia += amt
    else                                                   efectivo      += amt
  }
  return { efectivo, tarjeta, transferencia, domicilio, total: efectivo + tarjeta + transferencia + domicilio }
}

function parseHistorial(value: unknown): Record<string, unknown>[] {
  if (!value) return []
  try { return JSON.parse(typeof value === 'string' ? value : JSON.stringify(value)) } catch { return [] }
}

// Resta3 revenue is derived from its cortes historial (shift summaries) instead of
// the orders table, because Resta3 shares restaurant_id='default' with Nicho and
// can't be distinguished at the row level.
function calcTotalsFromCortes(cortes: Record<string, unknown>[], since: Date) {
  let efectivo = 0, tarjeta = 0, transferencia = 0, domicilio = 0, orders = 0
  for (const c of cortes) {
    const fin = c.fin ? new Date(c.fin as string) : null
    if (!fin || fin < since) continue
    efectivo      += (c.efectivo      as number) ?? 0
    tarjeta       += (c.tarjeta       as number) ?? 0
    transferencia += (c.transferencia as number) ?? 0
    domicilio     += (c.domicilio     as number) ?? 0
    orders        += (c.orders        as number) ?? 0
  }
  return { efectivo, tarjeta, transferencia, domicilio, total: efectivo + tarjeta + transferencia + domicilio, orders }
}

const APPS = [
  // Nicho: BD compartida, filtra por restaurant_id='default'
  { id: 'default',  name: 'Nicho (mi-proyecto)', db: supabaseAdmin,   ridFilter: 'default',  corteKey: 'cortes_historial',  type: 'orders' as const },
  // Portales: BD propia, todas las órdenes son de portales (sin filtro de rid)
  { id: 'portales', name: 'Portales',             db: supabasePortales, ridFilter: 'default', corteKey: 'cortes_historial',  type: 'orders' as const },
  // Resta3: cortes del Nicho (comparte BD con Nicho)
  { id: 'resta3',   name: 'Resta3',               db: supabaseAdmin,   ridFilter: 'default',  corteKey: 'cortes_historial',  type: 'resta3' as const },
]

export async function GET() {
  if (!await verifySaSession()) return Response.json({ error: 'No autorizado' }, { status: 401 })

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

  const results = await Promise.all(APPS.map(async (app) => {
    if (app.type === 'resta3') {
      const { data: historialRows } = await app.db
        .from('settings').select('value').eq('key', app.corteKey).limit(1)

      const historialRow = Array.isArray(historialRows) ? historialRows[0] : historialRows
      const historial = parseHistorial(historialRow?.value).slice(-50).reverse()

      const todayTotals = calcTotalsFromCortes([...historial].reverse(), today)
      const monthTotals = calcTotalsFromCortes([...historial].reverse(), monthStart)

      return { id: app.id, name: app.name, today: todayTotals, month: monthTotals, historial: historial.slice(0, 15) }
    }

    const [{ data: orders }, { data: historialRows }] = await Promise.all([
      app.db.from('orders').select('total, notes, created_at')
        .eq('restaurant_id', app.ridFilter)
        .gte('created_at', monthStart.toISOString()),
      app.db.from('settings').select('value').eq('key', app.corteKey).limit(1),
    ])

    const historialRow = Array.isArray(historialRows) ? historialRows[0] : historialRows
    const historial = parseHistorial(historialRow?.value).slice(-15).reverse()

    const allOrders   = orders ?? []
    const todayOrders = allOrders.filter(o => new Date(o.created_at) >= today)

    return {
      id:       app.id,
      name:     app.name,
      today:    { orders: todayOrders.length, ...calcTotals(todayOrders) },
      month:    { orders: allOrders.length,   ...calcTotals(allOrders) },
      historial,
    }
  }))

  return Response.json(results)
}

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
  { id: 'default',  name: 'Nicho (mi-proyecto)', db: supabaseAdmin,   ridFilter: 'default' as string | null, corteKey: 'cortes_historial',  type: 'orders' as const },
  // Portales: BD propia, todas las órdenes son de portales — sin filtro de rid (antes se filtraba
  // igual que Nicho por 'restaurant_id'='default', contradiciendo este mismo comentario; si algún
  // pedido de portales tuviera un restaurant_id distinto a 'default' se excluía en silencio).
  { id: 'portales', name: 'Portales',             db: supabasePortales, ridFilter: null as string | null, corteKey: 'cortes_historial',  type: 'orders' as const },
  // Resta3: cortes del Nicho (comparte BD con Nicho)
  { id: 'resta3',   name: 'Resta3',               db: supabaseAdmin,   ridFilter: 'default' as string | null, corteKey: 'cortes_historial',  type: 'resta3' as const },
]

export async function GET() {
  if (!await verifySaSession()) return Response.json({ error: 'No autorizado' }, { status: 401 })

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

  // 'default' y 'resta3' comparten cliente (supabaseAdmin) Y clave ('cortes_historial') — son
  // literalmente la misma fila de settings. Antes cada uno la pedía por separado (Promise.all las
  // corría en paralelo, pero seguía siendo un round-trip a Supabase completo, redundante, sumado a
  // la latencia total de la respuesta). Se pide una sola vez y se comparte entre los dos.
  const sharedHistorialPromise = supabaseAdmin.from('settings').select('value').eq('key', 'cortes_historial').limit(1)

  const results = await Promise.all(APPS.map(async (app) => {
    if (app.type === 'resta3') {
      const { data: historialRows } = await sharedHistorialPromise
      const historialRow = Array.isArray(historialRows) ? historialRows[0] : historialRows
      // Antes: .slice(-50) ANTES de filtrar por fecha — si el restaurante tenía más de 50 cortes
      // en total Y más de 50 en el mes en curso, los cortes más viejos del mes quedaban fuera de
      // esa ventana de 50 y nunca se sumaban a monthTotals, subcontando el mes sin ningún aviso.
      // calcTotalsFromCortes no depende del orden (solo filtra por fecha), así que tampoco hacía
      // falta revertir y volver a revertir el arreglo para calcular los totales.
      const historial = parseHistorial(historialRow?.value)
      const todayTotals = calcTotalsFromCortes(historial, today)
      const monthTotals = calcTotalsFromCortes(historial, monthStart)

      return { id: app.id, name: app.name, today: todayTotals, month: monthTotals, historial: historial.slice(-15).reverse() }
    }

    let ordersQuery = app.db.from('orders').select('total, notes, created_at').gte('created_at', monthStart.toISOString())
    if (app.ridFilter) ordersQuery = ordersQuery.eq('restaurant_id', app.ridFilter)
    const [{ data: orders }, { data: historialRows }] = await Promise.all([
      ordersQuery,
      app.id === 'default' ? sharedHistorialPromise : app.db.from('settings').select('value').eq('key', app.corteKey).limit(1),
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

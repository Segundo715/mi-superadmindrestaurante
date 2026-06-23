import { verifySaSession } from '@/lib/saAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

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

function parseHistorial(value: unknown): unknown[] {
  if (!value) return []
  try { return JSON.parse(typeof value === 'string' ? value : JSON.stringify(value)) } catch { return [] }
}

const APPS = [
  { id: 'default',  name: 'Nicho (mi-proyecto)',     settingsKey: 'cortes_historial' },
  { id: 'portales', name: 'Portales',                settingsKey: 'portales:cortes_historial' },
]

export async function GET() {
  if (!await verifySaSession()) return Response.json({ error: 'No autorizado' }, { status: 401 })

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

  const results = await Promise.all(APPS.map(async (app) => {
    const [{ data: orders }, { data: historialRows }] = await Promise.all([
      supabaseAdmin
        .from('orders')
        .select('total, notes, created_at')
        .eq('restaurant_id', app.id)
        .gte('created_at', monthStart.toISOString()),
      supabaseAdmin
        .from('settings')
        .select('value')
        .eq('key', app.settingsKey)
        .limit(1),
    ])

    const historialRow = Array.isArray(historialRows) ? historialRows[0] : historialRows
    const historial = (parseHistorial(historialRow?.value) as Record<string, unknown>[])
      .slice(-15).reverse()

    const allOrders   = orders ?? []
    const todayOrders = allOrders.filter(o => new Date(o.created_at) >= today)

    return {
      id:       app.id,
      name:     app.name,
      today:    { orders: todayOrders.length,  ...calcTotals(todayOrders) },
      month:    { orders: allOrders.length,    ...calcTotals(allOrders) },
      historial,
    }
  }))

  return Response.json(results)
}

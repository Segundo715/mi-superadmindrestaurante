// Catálogo de productos (tabla sa_products): mi-card, mi-menu, mi-proyecto.
// Solo lectura desde el panel — los productos son 3 filas estables, no se editan desde aquí.
import { verifySaSession } from '@/lib/saAuth'
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin'

function toProduct(r: Record<string, unknown>) {
  return {
    id: r.id,
    name: r.name,
    tagline: r.tagline,
    tier: r.tier,
    color: r.color,
    active: r.active,
    sortOrder: r.sort_order,
  }
}

export async function GET() {
  if (!await verifySaSession()) return Response.json({ error: 'No autorizado' }, { status: 401 })
  const { data, error } = await supabase.from('sa_products').select('*').order('sort_order')
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json((data ?? []).map(toProduct))
}

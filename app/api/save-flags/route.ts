// Persiste y lee feature flags / permisos en la tabla settings.
// Las claves que terminan en _portales/_mimenu/_micard se redirigen a la BD propia de ese
// producto usando el nombre sin sufijo.
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { supabasePortales } from '@/lib/supabasePortales'
import { supabaseMiMenu } from '@/lib/supabaseMiMenu'
import { supabaseMiCard } from '@/lib/supabaseMiCard'
import { verifySaSession } from '@/lib/saAuth'

export const dynamic = 'force-dynamic'

function parseValue(v: unknown): Record<string, boolean> {
  if (!v) return {}
  if (typeof v === 'string') { try { return JSON.parse(v) } catch { return {} } }
  if (typeof v === 'object') return v as Record<string, boolean>
  return {}
}

// Las claves _portales/_mimenu/_micard se guardan en su propia BD con el nombre limpio.
// Ej: 'feature_flags_portales' → BD portales, key 'feature_flags'
// Ej: 'feature_flags_mimenu' → BD de mi-menu, key 'feature_flags'
// Ej: 'feature_flags_micard' → BD de mi-card, key 'feature_flags' — SOLO si MICARD_SUPABASE_URL
//   está configurada; si no, cae a la BD principal con la clave completa (comportamiento de
//   siempre) para no romper nada mientras el proyecto Supabase de mi-card no exista todavía.
//   El día que se configure esa variable en Vercel, hay que migrar a mano la fila
//   settings.feature_flags_micard de la BD principal a settings.feature_flags en la BD de mi-card
//   — este endpoint no migra datos existentes solo, únicamente cambia a dónde lee/escribe de ahí en adelante.
function resolveTarget(key: string): { client: typeof supabaseAdmin; key: string } {
  if (key.endsWith('_portales')) {
    return { client: supabasePortales, key: key.replace(/_portales$/, '') }
  }
  if (key.endsWith('_mimenu')) {
    return { client: supabaseMiMenu, key: key.replace(/_mimenu$/, '') }
  }
  if (key.endsWith('_micard') && process.env.MICARD_SUPABASE_URL && process.env.MICARD_SERVICE_KEY) {
    return { client: supabaseMiCard, key: key.replace(/_micard$/, '') }
  }
  return { client: supabaseAdmin, key }
}

export async function GET(req: Request) {
  // Solo la UI del superadmin lee de aquí (los clientes leen sus propios flags directo de su BD,
  // no vía este endpoint) — sin este guard, cualquiera sin sesión podía leer flags/permisos de
  // cualquier producto, el mismo hueco que ya se corrigió en demo-proxy.
  if (!await verifySaSession())
    return Response.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const rawKey = searchParams.get('key') ?? 'feature_flags'

  const { client, key: dbKey } = resolveTarget(rawKey)
  const { data, error } = await client.from('settings').select('value').eq('key', dbKey).limit(1)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  const row = Array.isArray(data) ? data[0] : data
  return Response.json(parseValue(row?.value))
}

export async function POST(req: Request) {
  if (!await verifySaSession())
    return Response.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const settingsKey: string = body.settingsKey ?? 'feature_flags'
  const flags = body.flags ?? body

  const { client, key } = resolveTarget(settingsKey)

  // upsert (no delete+insert): un insert fallido después de un delete exitoso borraría los
  // flags/permisos existentes sin dejar nada que leer hasta que alguien vuelva a guardar a mano.
  const { error } = await client.from('settings').upsert({ key, value: JSON.stringify(flags) }, { onConflict: 'key' })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}

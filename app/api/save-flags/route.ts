// Persiste y lee feature flags / permisos en la tabla settings.
// Las claves que terminan en _portales se redirigen a la BD propia de portales
// (supabasePortales) usando el nombre sin sufijo.
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { supabasePortales } from '@/lib/supabasePortales'
import { supabaseMiMenu } from '@/lib/supabaseMiMenu'
import { verifySaSession } from '@/lib/saAuth'

export const dynamic = 'force-dynamic'

function parseValue(v: unknown): Record<string, boolean> {
  if (!v) return {}
  if (typeof v === 'string') { try { return JSON.parse(v) } catch { return {} } }
  if (typeof v === 'object') return v as Record<string, boolean>
  return {}
}

// Las claves _portales/_mimenu se guardan en su propia BD con el nombre limpio.
// Ej: 'feature_flags_portales' → BD portales, key 'feature_flags'
// Ej: 'feature_flags_mimenu' → BD de mi-menu, key 'feature_flags'
function resolveTarget(key: string): { client: typeof supabaseAdmin; key: string } {
  if (key.endsWith('_portales')) {
    return { client: supabasePortales, key: key.replace(/_portales$/, '') }
  }
  if (key.endsWith('_mimenu')) {
    return { client: supabaseMiMenu, key: key.replace(/_mimenu$/, '') }
  }
  return { client: supabaseAdmin, key }
}

export async function GET(req: Request) {
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

  await client.from('settings').delete().eq('key', key)
  const { error } = await client.from('settings').insert({ key, value: JSON.stringify(flags) })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}

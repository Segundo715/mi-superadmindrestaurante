// Persiste y lee feature flags / permisos en la tabla settings.
// Las claves que terminan en _portales se redirigen a la BD propia de portales
// (supabasePortales) usando el nombre sin sufijo.
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { supabasePortales } from '@/lib/supabasePortales'

export const dynamic = 'force-dynamic'

function stripBom(s: string): string {
  return s.charCodeAt(0) === 65279 ? s.slice(1) : s
}

const supabase = createClient(
  stripBom((process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()),
  stripBom((process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim())
)

function parseValue(v: unknown): Record<string, boolean> {
  if (!v) return {}
  if (typeof v === 'string') { try { return JSON.parse(v) } catch { return {} } }
  if (typeof v === 'object') return v as Record<string, boolean>
  return {}
}

// Las claves _portales se guardan en la BD de portales con el nombre limpio.
// Ej: 'feature_flags_portales' → BD portales, key 'feature_flags'
function resolveTarget(key: string): { client: typeof supabaseAdmin; key: string } {
  if (key.endsWith('_portales')) {
    return { client: supabasePortales, key: key.replace(/_portales$/, '') }
  }
  return { client: supabaseAdmin, key }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const rawKey = searchParams.get('key') ?? 'feature_flags'

  if (rawKey.endsWith('_portales')) {
    // Leer desde BD portales con key sin sufijo
    const dbKey = rawKey.replace(/_portales$/, '')
    const { data, error } = await supabasePortales.from('settings').select('value').eq('key', dbKey).limit(1)
    if (error) return Response.json({ error: error.message }, { status: 500 })
    const row = Array.isArray(data) ? data[0] : data
    return Response.json(parseValue(row?.value))
  }

  const { data, error } = await supabase.from('settings').select('value').eq('key', rawKey).limit(1)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  const row = Array.isArray(data) ? data[0] : data
  return Response.json(parseValue(row?.value))
}

export async function POST(req: Request) {
  const body = await req.json()
  const settingsKey: string = body.settingsKey ?? 'feature_flags'
  const flags = body.flags ?? body

  const { client, key } = resolveTarget(settingsKey)

  await client.from('settings').delete().eq('key', key)
  const { error } = await client.from('settings').insert({ key, value: JSON.stringify(flags) })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}

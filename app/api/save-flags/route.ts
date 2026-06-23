// Persiste y lee feature flags / permisos en la tabla settings (mismo Supabase que mi-proyecto).
// GET usa anon key (lectura pública). POST usa service key para poder hacer DELETE sin RLS.
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

// force-dynamic: evita que Next.js cachee el GET y devuelva datos obsoletos.
export const dynamic = 'force-dynamic'

function stripBom(s: string): string {
  return s.charCodeAt(0) === 65279 ? s.slice(1) : s
}

const supabase = createClient(
  stripBom((process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()),
  stripBom((process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim())
)

// Parsea el valor de Supabase independientemente de si llegó como string o como objeto (jsonb).
function parseValue(v: unknown): Record<string, boolean> {
  if (!v) return {}
  if (typeof v === 'string') {
    try { return JSON.parse(v) } catch { return {} }
  }
  if (typeof v === 'object') return v as Record<string, boolean>
  return {}
}

// Lee los flags guardados para una key dada (?key=feature_flags).
// Usa .limit(1) en vez de .maybeSingle() para no fallar si hay filas duplicadas.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const key = searchParams.get('key') ?? 'feature_flags'

  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', key)
    .limit(1)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  const row = Array.isArray(data) ? data[0] : data
  const flags = parseValue(row?.value)
  return Response.json(flags)
}

export async function POST(req: Request) {
  const body = await req.json()
  const settingsKey: string = body.settingsKey ?? 'feature_flags'
  const flags = body.flags ?? body

  // Usar service key para DELETE+INSERT: la anon key puede no tener permiso de DELETE,
  // lo que causaba que el upsert insertara filas duplicadas silenciosamente y el GET
  // devolviera datos obsoletos tras recargar.
  await supabaseAdmin.from('settings').delete().eq('key', settingsKey)
  const { error } = await supabaseAdmin
    .from('settings')
    .insert({ key: settingsKey, value: JSON.stringify(flags) })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}

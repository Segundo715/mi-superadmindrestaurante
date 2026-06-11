// Persiste y lee feature flags / permisos en la tabla settings (mismo Supabase que mi-proyecto).
// Usar esta ruta local evita el problema de CORS que ocurría al leer desde mi-proyecto.vercel.app.
import { createClient } from '@supabase/supabase-js'

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

  // Intentamos upsert con onConflict. Si la tabla no tiene UNIQUE en key,
  // hacemos delete + insert como fallback para evitar duplicados.
  const { error: upsertErr } = await supabase
    .from('settings')
    .upsert({ key: settingsKey, value: JSON.stringify(flags) }, { onConflict: 'key' })

  if (upsertErr) {
    // Fallback: borrar filas existentes con esa key e insertar una nueva.
    await supabase.from('settings').delete().eq('key', settingsKey)
    const { error: insertErr } = await supabase
      .from('settings')
      .insert({ key: settingsKey, value: JSON.stringify(flags) })
    if (insertErr) return Response.json({ error: insertErr.message }, { status: 500 })
  }

  return Response.json({ ok: true })
}

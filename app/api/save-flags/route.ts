// Persiste y lee feature flags / permisos en la tabla settings (mismo Supabase que mi-proyecto).
// Usar esta ruta local evita el problema de CORS que ocurría al leer desde mi-proyecto.vercel.app.
import { createClient } from '@supabase/supabase-js'

function stripBom(s: string): string {
  return s.charCodeAt(0) === 65279 ? s.slice(1) : s
}

const supabase = createClient(
  stripBom((process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()),
  stripBom((process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim())
)

// Lee los flags guardados para una key dada (?key=feature_flags).
// Devuelve {} si la key no existe todavía (primera vez).
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const key = searchParams.get('key') ?? 'feature_flags'
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', key)
    .maybeSingle()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  const flags = data?.value ? JSON.parse(data.value) : {}
  return Response.json(flags)
}

export async function POST(req: Request) {
  const body = await req.json()
  const settingsKey: string = body.settingsKey ?? 'feature_flags'
  const flags = body.flags ?? body

  const { error } = await supabase
    .from('settings')
    .upsert({ key: settingsKey, value: JSON.stringify(flags) }, { onConflict: 'key' })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}

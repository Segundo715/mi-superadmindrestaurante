// Persiste feature flags en la tabla settings del proyecto principal (mismo Supabase).
// Acepta {settingsKey, flags} para guardar tanto los flags de Nicho como los de RESTA3.
import { createClient } from '@supabase/supabase-js'

function stripBom(s: string): string {
  return s.charCodeAt(0) === 65279 ? s.slice(1) : s
}

const supabase = createClient(
  stripBom((process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()),
  stripBom((process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim())
)

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

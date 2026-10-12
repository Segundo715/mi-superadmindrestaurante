import { createClient } from '@supabase/supabase-js'

function strip(s: string) {
  return (s.charCodeAt(0) === 65279 ? s.slice(1) : s).trim()
}

// Cliente con service key para la BD propia de El Tejaban (mi-restaurantetejaban, proyecto
// Supabase separado — ver .env.local TEJABAN_*). Mismo patrón que supabaseMiCard.ts: si faltan
// las credenciales se usa un placeholder para que createClient no truene al importar (tumbaría
// /api/save-flags para todos los productos); resolveTarget() solo enruta aquí si
// TEJABAN_SUPABASE_URL y TEJABAN_SERVICE_KEY están configuradas.
const url = strip(process.env.TEJABAN_SUPABASE_URL ?? '') || 'https://placeholder.supabase.co'
const key = strip(process.env.TEJABAN_SERVICE_KEY ?? '') || 'placeholder-key-not-configured'

export const supabaseTejaban = createClient(url, key)

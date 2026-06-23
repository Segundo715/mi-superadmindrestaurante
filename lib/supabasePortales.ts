import { createClient } from '@supabase/supabase-js'

function strip(s: string) {
  return (s.charCodeAt(0) === 65279 ? s.slice(1) : s).trim()
}

// Cliente con service key para la BD propia de mi-restauranteportales.
// Las credenciales vienen de variables de entorno exclusivas de portales.
export const supabasePortales = createClient(
  strip(process.env.PORTALES_SUPABASE_URL ?? ''),
  strip(process.env.PORTALES_SERVICE_KEY ?? '')
)

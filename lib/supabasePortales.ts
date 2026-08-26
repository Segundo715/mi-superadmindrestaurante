import { createClient } from '@supabase/supabase-js'

function strip(s: string) {
  return (s.charCodeAt(0) === 65279 ? s.slice(1) : s).trim()
}

// Cliente con service key para la BD propia de mi-restauranteportales.
// Las credenciales vienen de variables de entorno exclusivas de portales.
//
// createClient('', '') lanza de forma síncrona al construirse ("supabaseUrl is required.") —
// verificado en tiempo de ejecución. Como save-flags/route.ts importa este módulo siempre (no
// solo cuando se usa una clave _portales), si estas variables llegaran a faltar en algún entorno
// tumbaría /api/save-flags para TODOS los productos, no solo portales. Por eso se usa un
// placeholder con forma de URL/key válida cuando faltan — el cliente se construye sin tronar.
const url = strip(process.env.PORTALES_SUPABASE_URL ?? '') || 'https://placeholder.supabase.co'
const key = strip(process.env.PORTALES_SERVICE_KEY ?? '') || 'placeholder-key-not-configured'

export const supabasePortales = createClient(url, key)

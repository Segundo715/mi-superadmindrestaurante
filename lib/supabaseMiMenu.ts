import { createClient } from '@supabase/supabase-js'

function strip(s: string) {
  return (s.charCodeAt(0) === 65279 ? s.slice(1) : s).trim()
}

// Cliente con service key para la BD propia de mi-menu (proyecto Supabase
// separado del de mi-proyecto/Nicho — ver .env.local MIMENU_*).
//
// createClient('', '') lanza de forma síncrona al construirse ("supabaseUrl is required.") —
// verificado en tiempo de ejecución. Como save-flags/route.ts importa este módulo siempre (no
// solo cuando se usa una clave _mimenu), si estas variables llegaran a faltar en algún entorno
// (Vercel Preview sin configurar, un clon nuevo, etc.) tumbaría /api/save-flags para TODOS los
// productos, no solo mi-menu. Por eso se usa un placeholder con forma de URL/key válida cuando
// faltan — el cliente se construye sin tronar, y `resolveTarget()` ya evita enrutar aquí sin
// las credenciales reales.
const url = strip(process.env.MIMENU_SUPABASE_URL ?? '') || 'https://placeholder.supabase.co'
const key = strip(process.env.MIMENU_SERVICE_KEY ?? '') || 'placeholder-key-not-configured'

export const supabaseMiMenu = createClient(url, key)

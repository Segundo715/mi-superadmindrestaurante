import { createClient } from '@supabase/supabase-js'

function strip(s: string) {
  return (s.charCodeAt(0) === 65279 ? s.slice(1) : s).trim()
}

// Cliente con service key para la BD propia de mi-card (proyecto Supabase
// separado del de mi-proyecto/Nicho — ver .env.local MICARD_*).
//
// IMPORTANTE: createClient('', '') SÍ lanza de forma síncrona al construirse
// ("supabaseUrl is required.") — verificado en tiempo de ejecución, no es solo teoría.
// Como save-flags/route.ts importa este módulo siempre (no solo cuando se usa una clave
// _micard), y MICARD_SUPABASE_URL/MICARD_SERVICE_KEY todavía NO están configuradas en Vercel
// (ver CLAUDE.md), un createClient('','') aquí tumbaría /api/save-flags para TODOS los
// productos, no solo mi-card. Por eso, si faltan las credenciales, se usa un placeholder con
// forma de URL/key válida — el cliente se construye sin tronar, y solo falla (con un error de
// red/auth normal) si `resolveTarget()` alguna vez intentara usarlo sin las credenciales reales,
// cosa que ya evita comprobando `process.env.MICARD_SUPABASE_URL` antes de enrutar aquí.
const url = strip(process.env.MICARD_SUPABASE_URL ?? '') || 'https://placeholder.supabase.co'
const key = strip(process.env.MICARD_SERVICE_KEY ?? '') || 'placeholder-key-not-configured'

export const supabaseMiCard = createClient(url, key)

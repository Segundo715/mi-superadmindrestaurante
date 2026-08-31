// Cliente Supabase con service role key — bypasea RLS para operaciones del SuperAdmin.
// Solo usar en rutas server-side del SuperAdmin, nunca exponer al cliente.
import { createClient } from '@supabase/supabase-js'

function strip(s: string) {
  return (s.charCodeAt(0) === 65279 ? s.slice(1) : s).trim()
}

// createClient('','') lanza de forma síncrona ("supabaseUrl is required.") — verificado en tiempo
// de ejecución. Este cliente lo importa casi cada ruta de /api/superadmin/*, así que si faltaran
// estas variables en algún entorno (un Preview deploy sin env vars copiadas, por ejemplo) tumbaría
// TODO el panel al importar el módulo, no solo una función. Mismo patrón de placeholder que ya se
// usa en supabaseMiCard.ts/supabaseMiMenu.ts/supabasePortales.ts.
const url = strip(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '') || 'https://placeholder.supabase.co'
const key = strip(process.env.SUPABASE_SERVICE_KEY ?? '') || 'placeholder-key-not-configured'

export const supabaseAdmin = createClient(url, key)

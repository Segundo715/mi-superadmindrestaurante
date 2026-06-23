// Cliente Supabase con service role key — bypasea RLS para operaciones del SuperAdmin.
// Solo usar en rutas server-side del SuperAdmin, nunca exponer al cliente.
import { createClient } from '@supabase/supabase-js'

function strip(s: string) {
  return (s.charCodeAt(0) === 65279 ? s.slice(1) : s).trim()
}

export const supabaseAdmin = createClient(
  strip(process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''),
  strip(process.env.SUPABASE_SERVICE_KEY ?? '')
)

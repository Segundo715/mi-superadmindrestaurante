import { createClient } from '@supabase/supabase-js'

function strip(s: string) {
  return (s.charCodeAt(0) === 65279 ? s.slice(1) : s).trim()
}

// Cliente con service key para la BD propia de mi-menu (proyecto Supabase
// separado del de mi-proyecto/Nicho — ver .env.local MIMENU_*).
export const supabaseMiMenu = createClient(
  strip(process.env.MIMENU_SUPABASE_URL ?? ''),
  strip(process.env.MIMENU_SERVICE_KEY ?? '')
)

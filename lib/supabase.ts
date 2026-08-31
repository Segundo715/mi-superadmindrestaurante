// Mismo proyecto Supabase que mi-proyecto: las tablas sa_* coexisten con customers, loyalty_cards, etc.
import { createClient } from '@supabase/supabase-js'

// createClient('','') lanza de forma síncrona — mismo placeholder que supabaseAdmin.ts para no
// tumbar el módulo si faltan las env vars en algún entorno.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key-not-configured'

export const supabase = createClient(url, key)

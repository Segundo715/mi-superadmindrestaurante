// Mismo proyecto Supabase que mi-proyecto: las tablas sa_* coexisten con customers, loyalty_cards, etc.
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(url, key)

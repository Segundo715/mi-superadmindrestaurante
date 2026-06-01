import { createClient } from '@supabase/supabase-js'

function adminClient() {
  const key = process.env.SUPABASE_SERVICE_KEY!.replace(/^﻿/, '').trim()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/^﻿/, '').trim()
  return createClient(url, key)
}

export async function POST(req: Request) {
  const flags = await req.json()
  const { error } = await adminClient()
    .from('settings')
    .upsert({ key: 'feature_flags', value: JSON.stringify(flags) }, { onConflict: 'key' })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}

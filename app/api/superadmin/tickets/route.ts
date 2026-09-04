import { verifySaSession } from '@/lib/saAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { supabasePortales } from '@/lib/supabasePortales'
import { NextRequest } from 'next/server'

// supabasePortales responde ~7s más lento que la BD principal desde Vercel (2026-09-01, ver nota
// en CLAUDE.md — probable desajuste de región) — ?source=main|portales deja pedir cada mitad por
// separado en vez de que el caller quede bloqueado esperando siempre a la más lenta de las dos.
export async function GET(req: NextRequest) {
  if (!(await verifySaSession()))
    return Response.json({ error: 'No autorizado' }, { status: 401 })

  const source = req.nextUrl.searchParams.get('source') // 'main' | 'portales' | null (ambas)

  if (req.nextUrl.searchParams.get('count') === 'true') {
    if (source === 'main') {
      const { count } = await supabaseAdmin.from('sa_tickets').select('id', { count: 'exact', head: true }).eq('read', false)
      return Response.json({ unread: count ?? 0 })
    }
    if (source === 'portales') {
      const { count } = await supabasePortales.from('sa_tickets').select('id', { count: 'exact', head: true }).eq('read', false)
      return Response.json({ unread: count ?? 0 })
    }
    const [{ count: c1 }, { count: c2 }] = await Promise.all([
      supabaseAdmin.from('sa_tickets').select('id', { count: 'exact', head: true }).eq('read', false),
      supabasePortales.from('sa_tickets').select('id', { count: 'exact', head: true }).eq('read', false),
    ])
    return Response.json({ unread: (c1 ?? 0) + (c2 ?? 0) })
  }

  if (source === 'main' || source === 'portales') {
    const db = source === 'main' ? supabaseAdmin : supabasePortales
    const { data } = await db.from('sa_tickets').select('*').order('created_at', { ascending: false })
    return Response.json((data ?? []).map(t => ({ ...t, source })))
  }

  const [{ data: main }, { data: portales }] = await Promise.all([
    supabaseAdmin.from('sa_tickets').select('*').order('created_at', { ascending: false }),
    supabasePortales.from('sa_tickets').select('*').order('created_at', { ascending: false }),
  ])

  const merged = [
    ...(main ?? []).map(t => ({ ...t, source: 'main' })),
    ...(portales ?? []).map(t => ({ ...t, source: 'portales' })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  return Response.json(merged)
}

export async function PATCH(req: NextRequest) {
  if (!(await verifySaSession()))
    return Response.json({ error: 'No autorizado' }, { status: 401 })

  const { id, source } = await req.json()
  if (!id) return Response.json({ error: 'id requerido' }, { status: 400 })

  const db = source === 'portales' ? supabasePortales : supabaseAdmin
  const { error } = await db.from('sa_tickets').update({ read: true }).eq('id', id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  if (!(await verifySaSession()))
    return Response.json({ error: 'No autorizado' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  const source = req.nextUrl.searchParams.get('source')
  if (!id) return Response.json({ error: 'id requerido' }, { status: 400 })

  const db = source === 'portales' ? supabasePortales : supabaseAdmin
  const { error } = await db.from('sa_tickets').delete().eq('id', id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}

export async function PUT() {
  if (!(await verifySaSession()))
    return Response.json({ error: 'No autorizado' }, { status: 401 })

  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    supabaseAdmin.from('sa_tickets').update({ read: true }).eq('read', false),
    supabasePortales.from('sa_tickets').update({ read: true }).eq('read', false),
  ])
  if (e1 || e2) return Response.json({ error: (e1 ?? e2)?.message }, { status: 500 })
  return Response.json({ ok: true })
}

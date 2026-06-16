'use client'

import { useState } from 'react'

const RESTO_URL = 'https://mi-proyecto-phi-ecru.vercel.app'

type St = 'idle' | 'loading' | 'done' | 'error'

const NAV_BASE = {
  bg: '#0d0d0d', border: '#1a1a1a', accent: '#B90F45',
  inactive: '#6b7280', radius: 9999, showLogout: true,
}
const NAV_FASES = {
  1: { ...NAV_BASE, tabs: [{ id: 'menu', label: 'Menú', href: '/menu', icon: '' }] },
  2: { ...NAV_BASE, tabs: [{ id: 'menu', label: 'Menú', href: '/menu', icon: '' }, { id: 'card', label: 'Tarjeta', href: '/card', icon: '' }] },
  3: { ...NAV_BASE, tabs: [{ id: 'menu', label: 'Menú', href: '/menu', icon: '' }, { id: 'card', label: 'Tarjeta', href: '/card', icon: '' }, { id: 'review', label: 'Reseñas', href: '/review', icon: '' }] },
}

// Proxy server-side: evita el error CORS que ocurre al llamar a mi-proyecto directamente desde el browser.
async function proxyApi(path: string, body: object) {
  const r = await fetch('/api/demo-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, body }),
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    throw new Error(err?.error ?? `Error ${r.status}`)
  }
  return r.json()
}

async function setNavFase(nav: object) {
  await proxyApi('/api/settings', { key: 'customer_nav', value: JSON.stringify(nav) })
}

async function restoApi(path: string, body: object) {
  return proxyApi(path, body)
}

const ACCIONES: Record<string, () => Promise<string>> = {
  fase1: async () => { await setNavFase(NAV_FASES[1]); return 'Solo Menú visible' },
  fase2: async () => { await setNavFase(NAV_FASES[2]); return 'Menú + Tarjeta visibles' },
  fase3: async () => { await setNavFase(NAV_FASES[3]); return 'Todo visible' },
  menu: async () => {
    const r = await restoApi('/api/menu/seed', {})
    return r.created > 0 ? `${r.created} platillos insertados` : 'Menú ya cargado'
  },
  rec: async () => {
    const recetas = [
      { name: 'Hamburguesa Clásica', ingredients: [{ name: 'Carne de res molida', quantity: '180', unit: 'g' }, { name: 'Pan para hamburguesa', quantity: '1', unit: 'pieza' }], steps: [{ step: 1, description: 'Forma la hamburguesa y sazona con sal y pimienta.' }, { step: 2, description: 'Cocina en comal caliente 3 min por lado.' }, { step: 3, description: 'Coloca el queso al final 1 min para que se derrita.' }, { step: 4, description: 'Tuesta el pan y unta el aderezo.' }, { step: 5, description: 'Arma: pan, aderezo, carne con queso, lechuga, jitomate.' }] },
      { name: 'Pizza Margherita', ingredients: [{ name: 'Masa de pizza', quantity: '250', unit: 'g' }, { name: 'Mozzarella fresca', quantity: '150', unit: 'g' }], steps: [{ step: 1, description: 'Precalienta el horno a 250 °C.' }, { step: 2, description: 'Estira la masa y cubre con salsa de tomate.' }, { step: 3, description: 'Distribuye la mozzarella.' }, { step: 4, description: 'Hornea 9 min hasta que el borde dore.' }, { step: 5, description: 'Agrega albahaca fresca al sacar del horno.' }] },
    ]
    let ok = 0
    for (const r of recetas) { const res = await restoApi('/api/recipes', r); if (res.id) ok++ }
    return ok > 0 ? `${ok} recetas insertadas` : 'Recetas ya cargadas'
  },
  ped: async () => {
    const r = await restoApi('/api/orders', { customerName: 'Mesa 4', tableNumber: '4', items: [{ name: 'Hamburguesa Clásica', quantity: 2, price: 120 }, { name: 'Café Americano', quantity: 2, price: 45 }], total: 330, notes: 'Sin cebolla' })
    return r.id ? 'Mesa 4 — pendiente $330' : 'Pedido ya existe'
  },
  res: async () => {
    const resenas = [{ customerName: 'Ana Rodríguez', rating: 5, comment: 'Excelente servicio, la hamburguesa estaba perfecta.' }, { customerName: 'Jorge Pérez', rating: 2, comment: 'La pizza llegó fría y el servicio estuvo muy lento.' }]
    let ok = 0
    for (const r of resenas) { const res = await restoApi('/api/reviews', r); if (res.id) ok++ }
    return ok > 0 ? `${ok} reseñas (1 negativa → alerta roja)` : 'Reseñas ya cargadas'
  },
  tv: async () => {
    const slides = [{ title: '🍔 Hamburguesa BBQ', subtitle: 'Carne de res, tocino y salsa ahumada', price: '$145', isOffer: true, active: true }, { title: '🍕 Pizza del Día', subtitle: 'Margherita con mozzarella y albahaca', price: '$140', isOffer: true, active: true }, { title: '☕ Café + Postre', subtitle: 'Americano + cheesecake de fresa', price: '$120', isOffer: true, active: true }]
    let ok = 0
    for (const s of slides) { const res = await restoApi('/api/tv', s); if (res.id) ok++ }
    return ok > 0 ? `${ok} slides TV insertados` : 'Slides ya cargados'
  },
  leal: async () => {
    const r = await restoApi('/api/customers', { name: 'María García', phone: '6641234567', age: 28 })
    return r.id ? 'María García — cliente demo creada' : 'Cliente ya existe'
  },
  dash: async () => 'Usa Ver ↗ para abrir el dashboard del restaurante',
}

interface Boton { id: string; label: string; desc: string; href?: string; color: string; emoji: string }

const SECCIONES: { titulo: string; badge: string; badgeColor: string; badgeBg: string; sub: string; botones: Boton[] }[] = [
  {
    titulo: 'Cliente', badge: 'FASE', badgeColor: '#f59e0b', badgeBg: 'rgba(245,158,11,0.15)',
    sub: 'Controla qué tabs ve el cliente en su teléfono',
    botones: [
      { id: 'fase1', emoji: '①', label: 'Solo Menú',      desc: 'Oculta Tarjeta y Reseñas',  href: `${RESTO_URL}/menu`,   color: '#f59e0b' },
      { id: 'fase2', emoji: '②', label: 'Menú + Tarjeta', desc: 'Agrega tarjeta de lealtad', href: `${RESTO_URL}/card`,   color: '#10b981' },
      { id: 'fase3', emoji: '③', label: 'Todo visible',   desc: 'Menú · Tarjeta · Reseñas',  href: `${RESTO_URL}/review`, color: '#a78bfa' },
    ],
  },
  {
    titulo: 'Empleado', badge: 'DATOS', badgeColor: '#06b6d4', badgeBg: 'rgba(6,182,212,0.15)',
    sub: 'Inserta datos para el panel del empleado',
    botones: [
      { id: 'menu', emoji: '🍽️', label: 'Menú',         desc: '4 platillos demo',        href: `${RESTO_URL}/menu`,             color: '#f59e0b' },
      { id: 'rec',  emoji: '📖', label: 'Recetas',       desc: '2 recetas con pasos',     href: `${RESTO_URL}/employee/recipes`, color: '#06b6d4' },
      { id: 'ped',  emoji: '📦', label: 'Pedido activo', desc: 'Mesa 4 · $330 pendiente', href: `${RESTO_URL}/employee/orders`,  color: '#8b5cf6' },
      { id: 'leal', emoji: '🃏', label: 'Lealtad',       desc: 'Cliente con 4 sellos',    href: `${RESTO_URL}/employee`,         color: '#f97316' },
    ],
  },
  {
    titulo: 'Admin', badge: 'DATOS', badgeColor: '#ec4899', badgeBg: 'rgba(236,72,153,0.15)',
    sub: 'Inserta datos para el panel de administrador',
    botones: [
      { id: 'res',  emoji: '⭐', label: 'Reseñas',     desc: '1 buena + 1 mala · alerta', href: `${RESTO_URL}/admin/reviews`, color: '#ec4899' },
      { id: 'dash', emoji: '📊', label: 'Dashboard',   desc: 'Ventas y analíticas',        href: `${RESTO_URL}/admin`,         color: '#6366f1' },
      { id: 'tv',   emoji: '📺', label: 'Pantalla TV', desc: '3 slides de ofertas',        href: `${RESTO_URL}/admin/tv`,      color: '#14b8a6' },
    ],
  },
]

const ADMIN_LINKS = [
  { emoji: '📊', label: 'Dashboard',     href: `${RESTO_URL}/admin` },
  { emoji: '📈', label: 'Analíticas',    href: `${RESTO_URL}/admin/analytics` },
  { emoji: '⭐', label: 'Reseñas',       href: `${RESTO_URL}/admin/reviews` },
  { emoji: '🍽️', label: 'Menú',          href: `${RESTO_URL}/admin/menu` },
  { emoji: '🃏', label: 'Tarjetas',      href: `${RESTO_URL}/admin/tarjetas` },
  { emoji: '👥', label: 'Clientes',      href: `${RESTO_URL}/admin/customers` },
  { emoji: '📺', label: 'TV',            href: `${RESTO_URL}/admin/tv` },
  { emoji: '🪑', label: 'Reservaciones', href: `${RESTO_URL}/admin/reservaciones` },
  { emoji: '📦', label: 'Inventario',    href: `${RESTO_URL}/admin/inventario` },
  { emoji: '⚙️', label: 'Config',        href: `${RESTO_URL}/admin/configuracion` },
]

export default function DemoControlPage() {
  const [estados, setEstados] = useState<Record<string, St>>({})
  const [msgs,    setMsgs]    = useState<Record<string, string>>({})

  async function ejecutar(id: string) {
    setEstados(p => ({ ...p, [id]: 'loading' }))
    try {
      const msg = await ACCIONES[id]()
      setMsgs(p => ({ ...p, [id]: msg }))
      setEstados(p => ({ ...p, [id]: 'done' }))
    } catch (e: unknown) {
      setMsgs(p => ({ ...p, [id]: e instanceof Error ? e.message : 'Error desconocido' }))
      setEstados(p => ({ ...p, [id]: 'error' }))
    }
  }

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#e6edf3]">
      <div className="max-w-5xl mx-auto px-4 py-8 sm:px-6 sm:py-12 pb-20 space-y-10">

        {/* Header */}
        <header className="space-y-3">
          <p className="text-[11px] font-black tracking-widest uppercase text-green-400">
            ▶ NICHO Platform · Control de Demo
          </p>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight">
                Presentación por Fases
              </h1>
              <p className="text-sm text-[#8b949e] mt-1">
                Activa datos en{' '}
                <a href={RESTO_URL} target="_blank" className="text-green-400 underline underline-offset-2">
                  mi-proyecto-phi-ecru.vercel.app ↗
                </a>
              </p>
            </div>
            <a href={`${RESTO_URL}/admin`} target="_blank"
              className="shrink-0 text-xs sm:text-sm font-bold text-[#c9d1d9] bg-[#21262d] border border-[#30363d] rounded-xl px-3 py-2 sm:px-4 sm:py-2.5 no-underline whitespace-nowrap hover:border-[#6e7681] transition-colors">
              Admin ↗
            </a>
          </div>
        </header>

        {/* Secciones */}
        {SECCIONES.map(sec => (
          <section key={sec.titulo} className="space-y-4">

            {/* Section header */}
            <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-[#21262d]">
              <span className="text-[11px] font-black tracking-wider px-2.5 py-1 rounded-md"
                style={{ backgroundColor: sec.badgeBg, color: sec.badgeColor }}>
                {sec.badge}
              </span>
              <h2 className="text-base sm:text-lg font-black text-white">{sec.titulo}</h2>
              <p className="text-xs sm:text-sm text-[#8b949e] w-full sm:w-auto">{sec.sub}</p>
            </div>

            {/* Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {sec.botones.map(b => {
                const st = estados[b.id] ?? 'idle'
                const isDone = st === 'done'
                const isLoading = st === 'loading'
                const isError = st === 'error'
                return (
                  <div key={b.id}
                    className="rounded-2xl p-4 sm:p-5 flex flex-col gap-3 transition-colors"
                    style={{
                      backgroundColor: '#161b22',
                      border: `1px solid ${isDone ? `${b.color}55` : '#30363d'}`,
                    }}>

                    {/* Card top */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl leading-none">{b.emoji}</span>
                        <div>
                          <p className="text-sm sm:text-base font-black text-white leading-tight">{b.label}</p>
                          <p className="text-xs text-[#8b949e] mt-0.5">{b.desc}</p>
                        </div>
                      </div>
                      {isDone && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 bg-green-900/40 text-green-400">
                          ✓ OK
                        </span>
                      )}
                    </div>

                    {/* Feedback */}
                    {msgs[b.id] && (
                      <p className="text-xs rounded-lg px-3 py-2"
                        style={{
                          backgroundColor: isDone ? 'rgba(16,185,129,0.12)' : 'rgba(248,81,73,0.12)',
                          color: isDone ? '#3fb950' : '#f85149',
                        }}>
                        {msgs[b.id]}
                      </p>
                    )}

                    {/* Action buttons */}
                    <div className="flex gap-2 mt-auto">
                      <button onClick={() => ejecutar(b.id)} disabled={isLoading}
                        className="flex-1 py-2.5 rounded-xl text-sm font-black disabled:opacity-40 active:scale-95 transition-all"
                        style={{
                          backgroundColor: isDone ? `${b.color}22` : isError ? 'rgba(248,81,73,0.15)' : b.color,
                          color: isDone ? b.color : isError ? '#f85149' : '#000',
                        }}>
                        {isLoading ? '⏳ Cargando…' : isDone ? '↺ Repetir' : '⚡ Activar'}
                      </button>
                      {b.href && (
                        <a href={b.href} target="_blank" rel="noopener noreferrer"
                          className="px-4 py-2.5 rounded-xl text-sm font-bold text-[#8b949e] bg-[#21262d] border border-[#30363d] no-underline hover:text-white hover:border-[#6e7681] transition-colors whitespace-nowrap">
                          Ver ↗
                        </a>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        ))}

        {/* Admin links */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-[#21262d]">
            <span className="text-[11px] font-black tracking-wider px-2.5 py-1 rounded-md bg-[#6366f122] text-[#818cf8]">
              ACCESOS
            </span>
            <h2 className="text-base sm:text-lg font-black text-white">Panel Admin</h2>
            <p className="text-xs sm:text-sm text-[#8b949e] w-full sm:w-auto">Abre cada sección en una pestaña nueva</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-3">
            {ADMIN_LINKS.map(l => (
              <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2.5 p-3 sm:p-4 rounded-xl bg-[#161b22] border border-[#30363d] no-underline hover:border-[#6e7681] transition-colors">
                <span className="text-lg sm:text-xl">{l.emoji}</span>
                <span className="text-xs sm:text-sm font-bold text-[#c9d1d9] leading-tight">{l.label} ↗</span>
              </a>
            ))}
          </div>
        </section>

        <p className="text-center text-[11px] text-[#484f58]">
          /superadmin/demo · NICHO Platform
        </p>
      </div>
    </div>
  )
}

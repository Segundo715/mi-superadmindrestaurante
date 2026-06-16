'use client'

import { useState } from 'react'

// URL del proyecto de restaurante (mi-proyecto)
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

// Llama a la API del proyecto restaurante usando el endpoint público de settings
async function setNavFase(nav: object) {
  // El endpoint /api/settings POST requiere sesión admin del restaurante.
  // Si no funciona, usa el botón "Ver ↗" para abrir /admin/demo directamente.
  const r = await fetch(`${RESTO_URL}/api/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ key: 'customer_nav', value: JSON.stringify(nav) }),
  })
  if (!r.ok) throw new Error('Inicia sesión en el admin del restaurante primero')
}

async function restoApi(path: string, body: object) {
  const r = await fetch(`${RESTO_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })
  return r.json()
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

interface Boton { id: string; label: string; desc: string; href?: string; color: string }
interface Link  { label: string; href: string; desc: string }

const ADMIN_LINKS: Link[] = [
  { label: '📊 Dashboard',     href: `${RESTO_URL}/admin`,               desc: 'Resumen general' },
  { label: '📈 Analíticas',    href: `${RESTO_URL}/admin/analytics`,     desc: 'Ventas por día' },
  { label: '⭐ Reseñas',       href: `${RESTO_URL}/admin/reviews`,       desc: 'Buenas y malas' },
  { label: '📦 Inventario',    href: `${RESTO_URL}/admin/inventario`,    desc: 'Stock bajo' },
  { label: '🍽️ Menú',         href: `${RESTO_URL}/admin/menu`,          desc: 'Gestión de platillos' },
  { label: '🃏 Tarjetas',      href: `${RESTO_URL}/admin/tarjetas`,      desc: 'Lealtad' },
  { label: '👥 Clientes',      href: `${RESTO_URL}/admin/customers`,     desc: 'CRM' },
  { label: '📺 TV',            href: `${RESTO_URL}/admin/tv`,            desc: 'Señalización digital' },
  { label: '🪑 Reservaciones', href: `${RESTO_URL}/admin/reservaciones`, desc: 'Plano de mesas' },
  { label: '⚙️ Config',        href: `${RESTO_URL}/admin/configuracion`, desc: 'Logo y colores' },
]

const SECCIONES = [
  {
    titulo: '👥 Cliente — Fases de visibilidad',
    sub: 'Controla qué tabs ve el cliente en su teléfono en tiempo real',
    botones: [
      { id: 'fase1', label: '① Solo Menú',      desc: 'Oculta Tarjeta y Reseñas',  href: `${RESTO_URL}/menu`,   color: '#f59e0b' },
      { id: 'fase2', label: '② Menú + Tarjeta', desc: 'Agrega tarjeta de lealtad', href: `${RESTO_URL}/card`,   color: '#10b981' },
      { id: 'fase3', label: '③ Todo visible',   desc: 'Agrega reseñas',            href: `${RESTO_URL}/review`, color: '#a78bfa' },
    ] as Boton[],
  },
  {
    titulo: '👷 Empleado — Datos de demo',
    sub: 'Inserta datos para mostrar el panel del empleado',
    botones: [
      { id: 'menu', label: '🍽️ Menú',         desc: '4 platillos demo',         href: `${RESTO_URL}/menu`,             color: '#f59e0b' },
      { id: 'rec',  label: '📖 Recetas',       desc: '2 recetas con pasos',      href: `${RESTO_URL}/employee/recipes`, color: '#06b6d4' },
      { id: 'ped',  label: '📦 Pedido activo', desc: 'Mesa 4 — pendiente $330',  href: `${RESTO_URL}/employee/orders`,  color: '#8b5cf6' },
      { id: 'leal', label: '🃏 Lealtad',       desc: 'Cliente con 4 sellos',     href: `${RESTO_URL}/employee`,         color: '#f97316' },
    ] as Boton[],
  },
  {
    titulo: '👑 Admin — Datos de demo',
    sub: 'Inserta datos para mostrar el panel de administrador',
    botones: [
      { id: 'res',  label: '⭐ Reseñas',     desc: '1 buena + 1 mala (alerta)', href: `${RESTO_URL}/admin/reviews`, color: '#ec4899' },
      { id: 'dash', label: '📊 Dashboard',   desc: 'Ventas y analíticas',       href: `${RESTO_URL}/admin`,         color: '#6366f1' },
      { id: 'tv',   label: '📺 Pantalla TV', desc: '3 slides de ofertas',       href: `${RESTO_URL}/admin/tv`,      color: '#14b8a6' },
    ] as Boton[],
  },
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
      setMsgs(p => ({ ...p, [id]: e instanceof Error ? e.message : 'Error' }))
      setEstados(p => ({ ...p, [id]: 'error' }))
    }
  }

  return (
    <div className="min-h-screen bg-[#0d1117] p-5">
      <div className="max-w-[960px] mx-auto space-y-8">

        {/* Header */}
        <div className="pt-2 flex items-center justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-green-400 mb-1">
              ▶ Control de Demo — Restaurante
            </p>
            <h1 className="text-2xl font-black text-white">Presentación por Fases</h1>
            <p className="text-sm text-zinc-400 mt-0.5">
              Activa datos y controla lo que ve cada audiencia en{' '}
              <a href={RESTO_URL} target="_blank" className="text-green-400 hover:underline">
                mi-proyecto-phi-ecru.vercel.app ↗
              </a>
            </p>
          </div>
          <a href={`${RESTO_URL}/admin`} target="_blank"
            className="text-xs px-4 py-2 rounded-xl font-bold text-white bg-zinc-800 hover:bg-zinc-700 transition-colors">
            Abrir Admin ↗
          </a>
        </div>

        {/* Secciones */}
        {SECCIONES.map(sec => (
          <div key={sec.titulo}>
            <div className="mb-3 border-b border-zinc-800 pb-2">
              <h2 className="text-sm font-black text-white">{sec.titulo}</h2>
              <p className="text-xs text-zinc-500">{sec.sub}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {sec.botones.map(b => {
                const st = estados[b.id] ?? 'idle'
                return (
                  <div key={b.id} className="rounded-2xl p-4 flex flex-col gap-2 bg-[#161b22] border border-zinc-800">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-black text-white">{b.label}</p>
                        <p className="text-xs text-zinc-500">{b.desc}</p>
                      </div>
                      {st === 'done' && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 bg-green-900/40 text-green-400">
                          ✓
                        </span>
                      )}
                    </div>
                    {msgs[b.id] && (
                      <p className={`text-xs px-2 py-1.5 rounded-lg ${st === 'done' ? 'bg-green-900/20 text-green-400' : 'bg-red-900/20 text-red-400'}`}>
                        {msgs[b.id]}
                      </p>
                    )}
                    <div className="flex gap-2 mt-auto pt-1">
                      <button onClick={() => ejecutar(b.id)} disabled={st === 'loading'}
                        className="flex-1 py-2 rounded-xl text-xs font-black disabled:opacity-40 transition-all hover:opacity-90 active:scale-95"
                        style={{ backgroundColor: b.color, color: '#000' }}>
                        {st === 'loading' ? 'Cargando…' : st === 'done' ? '↺ Repetir' : '⚡ Activar'}
                      </button>
                      {b.href && (
                        <a href={b.href} target="_blank" rel="noopener noreferrer"
                          className="px-3 py-2 rounded-xl text-xs font-bold text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 transition-colors">
                          Ver ↗
                        </a>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {/* Accesos directos al admin */}
        <div>
          <div className="mb-3 border-b border-zinc-800 pb-2">
            <h2 className="text-sm font-black text-white">👑 Admin — Accesos directos</h2>
            <p className="text-xs text-zinc-500">Abre cada sección del panel del restaurante</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {ADMIN_LINKS.map(l => (
              <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer"
                className="rounded-xl p-3 flex flex-col gap-0.5 bg-[#161b22] border border-zinc-800 hover:border-zinc-600 transition-colors">
                <span className="text-xs font-black text-white">{l.label} ↗</span>
                <span className="text-[11px] text-zinc-500">{l.desc}</span>
              </a>
            ))}
          </div>
        </div>

        <p className="text-xs text-center text-zinc-700 pb-4">
          /superadmin/demo · NICHO Platform
        </p>
      </div>
    </div>
  )
}

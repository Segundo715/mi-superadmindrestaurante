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

async function setNavFase(nav: object) {
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

interface Boton { id: string; label: string; desc: string; href?: string; color: string; emoji: string }

const SECCIONES: { titulo: string; badge: string; badgeColor: string; sub: string; botones: Boton[] }[] = [
  {
    titulo: 'Cliente',
    badge: 'FASE',
    badgeColor: '#f59e0b',
    sub: 'Controla qué tabs ve el cliente en su teléfono en tiempo real',
    botones: [
      { id: 'fase1', emoji: '①', label: 'Solo Menú',      desc: 'Oculta Tarjeta y Reseñas',  href: `${RESTO_URL}/menu`,   color: '#f59e0b' },
      { id: 'fase2', emoji: '②', label: 'Menú + Tarjeta', desc: 'Agrega tarjeta de lealtad', href: `${RESTO_URL}/card`,   color: '#10b981' },
      { id: 'fase3', emoji: '③', label: 'Todo visible',   desc: 'Menú · Tarjeta · Reseñas',  href: `${RESTO_URL}/review`, color: '#a78bfa' },
    ],
  },
  {
    titulo: 'Empleado',
    badge: 'DATOS',
    badgeColor: '#06b6d4',
    sub: 'Inserta datos para mostrar el panel del empleado',
    botones: [
      { id: 'menu', emoji: '🍽️', label: 'Menú',         desc: '4 platillos demo',        href: `${RESTO_URL}/menu`,             color: '#f59e0b' },
      { id: 'rec',  emoji: '📖', label: 'Recetas',       desc: '2 recetas con pasos',     href: `${RESTO_URL}/employee/recipes`, color: '#06b6d4' },
      { id: 'ped',  emoji: '📦', label: 'Pedido activo', desc: 'Mesa 4 · $330 pendiente', href: `${RESTO_URL}/employee/orders`,  color: '#8b5cf6' },
      { id: 'leal', emoji: '🃏', label: 'Lealtad',       desc: 'Cliente con 4 sellos',    href: `${RESTO_URL}/employee`,         color: '#f97316' },
    ],
  },
  {
    titulo: 'Admin',
    badge: 'DATOS',
    badgeColor: '#ec4899',
    sub: 'Inserta datos para mostrar el panel de administrador',
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
    <div className="min-h-screen" style={{ backgroundColor: '#0d1117', color: '#e6edf3' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px 64px' }}>

        {/* Header */}
        <div style={{ marginBottom: 48, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#3fb950', marginBottom: 8 }}>
              ▶ NICHO Platform · Control de Demo
            </p>
            <h1 style={{ fontSize: 32, fontWeight: 900, color: '#fff', lineHeight: 1.1, margin: 0 }}>
              Presentación por Fases
            </h1>
            <p style={{ fontSize: 14, color: '#8b949e', marginTop: 8 }}>
              Activa datos y controla lo que ve cada audiencia en{' '}
              <a href={RESTO_URL} target="_blank" style={{ color: '#3fb950', textDecoration: 'none' }}>
                mi-proyecto-phi-ecru.vercel.app ↗
              </a>
            </p>
          </div>
          <a href={`${RESTO_URL}/admin`} target="_blank"
            style={{ flexShrink: 0, fontSize: 13, fontWeight: 700, color: '#c9d1d9', backgroundColor: '#21262d', border: '1px solid #30363d', borderRadius: 10, padding: '10px 18px', textDecoration: 'none', whiteSpace: 'nowrap' }}>
            Abrir Admin ↗
          </a>
        </div>

        {/* Secciones */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 48 }}>
          {SECCIONES.map(sec => (
            <section key={sec.titulo}>
              {/* Section header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #21262d' }}>
                <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.1em', padding: '3px 10px', borderRadius: 6, backgroundColor: `${sec.badgeColor}22`, color: sec.badgeColor }}>
                  {sec.badge}
                </span>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#fff' }}>{sec.titulo}</h2>
                <p style={{ margin: 0, fontSize: 13, color: '#8b949e' }}>{sec.sub}</p>
              </div>

              {/* Cards grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
                {sec.botones.map(b => {
                  const st = estados[b.id] ?? 'idle'
                  const isDone = st === 'done'
                  const isLoading = st === 'loading'
                  const isError = st === 'error'
                  return (
                    <div key={b.id} style={{
                      backgroundColor: '#161b22',
                      border: `1px solid ${isDone ? `${b.color}44` : '#30363d'}`,
                      borderRadius: 16,
                      padding: 20,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 14,
                      transition: 'border-color 0.2s',
                    }}>
                      {/* Card header */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 22, lineHeight: 1 }}>{b.emoji}</span>
                          <div>
                            <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#fff' }}>{b.label}</p>
                            <p style={{ margin: 0, fontSize: 12, color: '#8b949e', marginTop: 2 }}>{b.desc}</p>
                          </div>
                        </div>
                        {isDone && (
                          <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 20, backgroundColor: '#1a4731', color: '#3fb950', flexShrink: 0 }}>✓ OK</span>
                        )}
                      </div>

                      {/* Feedback message */}
                      {msgs[b.id] && (
                        <p style={{
                          margin: 0, fontSize: 12, padding: '8px 12px', borderRadius: 8,
                          backgroundColor: isDone ? '#1a4731' : '#4a1717',
                          color: isDone ? '#3fb950' : '#f85149',
                        }}>
                          {msgs[b.id]}
                        </p>
                      )}

                      {/* Buttons */}
                      <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                        <button onClick={() => ejecutar(b.id)} disabled={isLoading}
                          style={{
                            flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 800,
                            border: 'none', cursor: isLoading ? 'not-allowed' : 'pointer',
                            backgroundColor: isDone ? `${b.color}22` : isError ? '#4a1717' : b.color,
                            color: isDone ? b.color : isError ? '#f85149' : '#000',
                            opacity: isLoading ? 0.5 : 1,
                            transition: 'all 0.15s',
                          }}>
                          {isLoading ? '⏳ Cargando…' : isDone ? '↺ Repetir' : '⚡ Activar'}
                        </button>
                        {b.href && (
                          <a href={b.href} target="_blank" rel="noopener noreferrer"
                            style={{
                              padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                              color: '#8b949e', backgroundColor: '#21262d', border: '1px solid #30363d',
                              textDecoration: 'none', whiteSpace: 'nowrap',
                            }}>
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
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #21262d' }}>
              <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.1em', padding: '3px 10px', borderRadius: 6, backgroundColor: '#6366f122', color: '#818cf8' }}>
                ACCESOS
              </span>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#fff' }}>Panel Admin</h2>
              <p style={{ margin: 0, fontSize: 13, color: '#8b949e' }}>Abre cada sección del restaurante en una pestaña nueva</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
              {ADMIN_LINKS.map(l => (
                <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px',
                    backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: 12,
                    textDecoration: 'none', transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = '#6e7681')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = '#30363d')}
                >
                  <span style={{ fontSize: 18 }}>{l.emoji}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#c9d1d9' }}>{l.label} ↗</span>
                </a>
              ))}
            </div>
          </section>
        </div>

        <p style={{ textAlign: 'center', fontSize: 11, color: '#484f58', marginTop: 48 }}>
          /superadmin/demo · NICHO Platform
        </p>
      </div>
    </div>
  )
}

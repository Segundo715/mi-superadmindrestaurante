"use client";

import { useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type View = "overview" | "restaurants" | "flags" | "permisos" | "solicitudes" | "seguridad" | "billing" | "audit" | "plans" | "maintenance" | "notifications" | "discounts" | "activity";
type Plan = "trial" | "basic" | "premium";
type Status = "active" | "suspended" | "maintenance";
type AuditType = "create" | "update" | "delete" | "access" | "billing";

interface Restaurant {
  id: string; name: string; plan: Plan; status: Status;
  users: number; maxUsers: number; registeredAt: string;
  balance: number; nextPayment: string; lastPayment: string;
  email: string; notes: string; apiToken: string;
  lastActive: string; loginCount: number;
}

interface PlanConfig {
  id: Plan; name: string; price: number; trialDays: number;
  maxUsers: number; color: string;
  features: { text: string; included: boolean }[];
}

interface FeatureFlag { id: string; name: string; description: string; category: string; defaultEnabled: boolean; }

interface AuditEntry {
  id: string; ts: string; user: string; restaurant: string;
  action: string; details: string; ip: string; type: AuditType;
}

interface Toast { msg: string; type: "success" | "error" | "info"; }

interface DiscountCode {
  id: string; code: string; discount: number; type: "%" | "$";
  maxUses: number; uses: number; expiresAt: string; active: boolean; note: string;
}

// ─── Seed data ────────────────────────────────────────────────────────────────

const SEED_RESTAURANTS: Restaurant[] = [
  { id: "r1", name: "Nicho Restaurant", plan: "premium", status: "active",      users: 8,  maxUsers: 20, registeredAt: "2024-02-10", balance: 0,    nextPayment: "2026-06-10", lastPayment: "2026-05-10", email: "admin@nicho.app",       notes: "Cliente VIP, muy activo. Paga puntual.", apiToken: "nch_live_a1b2c3d4e5f6", lastActive: "Hace 2 horas",  loginCount: 312 },
  { id: "r2", name: "La Trattoria",     plan: "basic",   status: "active",      users: 3,  maxUsers: 5,  registeredAt: "2024-06-18", balance: 1200, nextPayment: "2026-05-28", lastPayment: "2026-04-28", email: "admin@latra.app",        notes: "Tiene deuda de 2 meses. Contactar.",    apiToken: "nch_live_b2c3d4e5f6g7", lastActive: "Ayer",           loginCount: 98  },
  { id: "r3", name: "Sushi Zen",        plan: "premium", status: "active",      users: 11, maxUsers: 20, registeredAt: "2025-01-04", balance: 0,    nextPayment: "2026-07-04", lastPayment: "2026-06-04", email: "admin@sushizen.app",     notes: "",                                      apiToken: "nch_live_c3d4e5f6g7h8", lastActive: "Hace 1 hora",   loginCount: 187 },
  { id: "r4", name: "Taco Express",     plan: "trial",   status: "active",      users: 2,  maxUsers: 3,  registeredAt: "2026-05-01", balance: 0,    nextPayment: "2026-05-31", lastPayment: "—",          email: "admin@tacoexpress.app", notes: "Trial termina el 31 mayo.",             apiToken: "nch_live_d4e5f6g7h8i9", lastActive: "Hace 3 días",   loginCount: 14  },
  { id: "r5", name: "El Rincón Grill",  plan: "basic",   status: "suspended",   users: 4,  maxUsers: 5,  registeredAt: "2024-09-22", balance: 3600, nextPayment: "Vencida",    lastPayment: "2026-03-22", email: "admin@rincon.app",       notes: "Suspendido por falta de pago.",         apiToken: "nch_live_e5f6g7h8i9j0", lastActive: "Hace 2 meses",  loginCount: 45  },
  { id: "r6", name: "Café Patio",       plan: "basic",   status: "maintenance", users: 2,  maxUsers: 5,  registeredAt: "2025-03-15", balance: 0,    nextPayment: "2026-06-15", lastPayment: "2026-05-15", email: "admin@cafepatio.app",    notes: "En mantenimiento por migración.",       apiToken: "nch_live_f6g7h8i9j0k1", lastActive: "Hace 1 semana", loginCount: 62  },
];

const SEED_PLANS: PlanConfig[] = [
  { id: "trial",   name: "Trial",   price: 0,    trialDays: 30, maxUsers: 3,  color: "#3b82f6",
    features: [
      { text: "3 usuarios incluidos",                  included: true  },
      { text: "Dashboard + Ventas + Operaciones",      included: true  },
      { text: "Menú Inteligente + Recetario",          included: true  },
      { text: "Reservaciones",                         included: true  },
      { text: "CRM + Reseñas",                        included: false },
      { text: "Fidelización + Sellar visitas",         included: false },
      { text: "Producción / Inventario",               included: false },
      { text: "Marketing / Automatizaciones IA",       included: false },
      { text: "Analytics + Reportes",                  included: false },
    ],
  },
  { id: "basic",   name: "Básico",  price: 799,  trialDays: 0,  maxUsers: 5,  color: "#6366f1",
    features: [
      { text: "5 usuarios incluidos",                  included: true  },
      { text: "Dashboard + Ventas + Operaciones",      included: true  },
      { text: "Menú Inteligente + Recetario",          included: true  },
      { text: "Reservaciones + CRM + Reseñas",        included: true  },
      { text: "Fidelización + Sellar visitas",         included: true  },
      { text: "Producción / Inventario",               included: true  },
      { text: "Reportes básicos",                      included: true  },
      { text: "Marketing / Automatizaciones IA",       included: false },
      { text: "Analytics avanzado + Pantallas",        included: false },
    ],
  },
  { id: "premium", name: "Premium", price: 2499, trialDays: 0,  maxUsers: 20, color: "#00e676",
    features: [
      { text: "20 usuarios incluidos",                 included: true  },
      { text: "Dashboard + Ventas + Operaciones",      included: true  },
      { text: "Menú Inteligente + Recetario",          included: true  },
      { text: "Reservaciones + CRM + Reseñas",        included: true  },
      { text: "Fidelización + Tarjetas digitales",     included: true  },
      { text: "Producción / Inventario completo",      included: true  },
      { text: "Marketing + Contenido",                 included: true  },
      { text: "Automatizaciones IA",                   included: true  },
      { text: "Analytics + Reportes + Pantallas",      included: true  },
    ],
  },
];

const SEED_DISCOUNTS: DiscountCode[] = [
  { id: "d1", code: "NICHO30",   discount: 30, type: "%", maxUses: 50,  uses: 12, expiresAt: "2026-06-30", active: true,  note: "Campaña lanzamiento" },
  { id: "d2", code: "BASIC200",  discount: 200, type: "$", maxUses: 20, uses: 8,  expiresAt: "2026-05-31", active: true,  note: "Descuento plan básico" },
  { id: "d3", code: "TRIAL60",   discount: 60, type: "%", maxUses: 100, uses: 34, expiresAt: "2026-07-15", active: false, note: "60 días de prueba extendido" },
];

const FEATURES: FeatureFlag[] = [
  // IDs alineados con mi-proyecto
  { id: "ventas",           name: "Ventas",              description: "Transacciones, tickets y cierres",              category: "Core",         defaultEnabled: true  },
  { id: "operaciones",      name: "Operaciones",         description: "Mesas, pedidos y KDS en tiempo real",           category: "Core",         defaultEnabled: true  },
  { id: "configuracion",    name: "Configuración",       description: "Sucursales, usuarios, roles e integraciones",   category: "Core",         defaultEnabled: true  },
  { id: "analytics",        name: "Analytics",           description: "Métricas avanzadas, tendencias y predicciones", category: "Core",         defaultEnabled: true  },
  { id: "reportes",         name: "Reportes",            description: "Exportar PDF, Excel, CSV programados",          category: "Analytics",    defaultEnabled: true  },
  { id: "menu",             name: "Menú Inteligente",    description: "Productos, categorías y disponibilidad",        category: "Menú",         defaultEnabled: true  },
  { id: "produccion",       name: "Recetario / Producción", description: "Recetas, inventario, stock y merma",         category: "Menú",         defaultEnabled: true  },
  { id: "crm",              name: "CRM",                 description: "Historial de clientes, segmentos y LTV",        category: "Clientes",     defaultEnabled: true  },
  { id: "customers",        name: "Clientes",            description: "Gestión de perfiles y visitas de clientes",     category: "Clientes",     defaultEnabled: true  },
  { id: "reservaciones",    name: "Reservaciones",       description: "Gestión de mesas y disponibilidad",             category: "Clientes",     defaultEnabled: true  },
  { id: "reviews",          name: "Reseñas",             description: "Buenas y negativas, gestión de reputación",     category: "Clientes",     defaultEnabled: true  },
  { id: "orders",           name: "Pedidos",             description: "Gestión de pedidos en tiempo real",             category: "Clientes",     defaultEnabled: true  },
  { id: "loyaltyCard",      name: "Fidelización",        description: "Puntos, tiers Bronze/Silver/Gold/Platinum",     category: "Fidelización", defaultEnabled: true  },
  { id: "favorites",        name: "Favoritos",           description: "Platillos favoritos del cliente",               category: "Fidelización", defaultEnabled: true  },
  { id: "tv",               name: "Pantallas Digitales", description: "Menú digital y señalización KDS",               category: "Operaciones",  defaultEnabled: false },
  { id: "marketing",        name: "Marketing",           description: "Campañas Meta Ads, TikTok, Google Ads",         category: "Marketing",    defaultEnabled: false },
  { id: "automatizaciones", name: "Automatizaciones IA", description: "Agentes de reservas, seguimiento y reputación", category: "IA",           defaultEnabled: false },
  { id: "contenido",        name: "Contenido",           description: "Multimedia, fotos y videos del restaurante",    category: "Marketing",    defaultEnabled: false },
];

const SEED_AUDIT: AuditEntry[] = [
  { id: "a1", ts: "2026-05-28 11:42", user: "superadmin",    restaurant: "—",              action: "Feature flag desactivada", details: "analytics → Sushi Zen",       ip: "187.xxx.12", type: "update"  },
  { id: "a2", ts: "2026-05-28 10:15", user: "admin@latra",   restaurant: "La Trattoria",   action: "Borró empleado",           details: "Empleado ID #84 eliminado",    ip: "201.xxx.55", type: "delete"  },
  { id: "a3", ts: "2026-05-28 09:02", user: "superadmin",    restaurant: "—",              action: "Plan actualizado",         details: "Sushi Zen: basic → premium",   ip: "187.xxx.12", type: "billing" },
  { id: "a4", ts: "2026-05-27 18:30", user: "admin@nicho",   restaurant: "Nicho Restaurant", action: "Exportó reporte",        details: "Ventas Mayo 2026",             ip: "189.xxx.88", type: "access"  },
  { id: "a5", ts: "2026-05-27 14:55", user: "superadmin",    restaurant: "—",              action: "Modo mantenimiento ON",    details: "Café Patio — migración DB",    ip: "187.xxx.12", type: "update"  },
  { id: "a6", ts: "2026-05-26 09:10", user: "superadmin",    restaurant: "—",              action: "Restaurante suspendido",   details: "El Rincón Grill — saldo",      ip: "187.xxx.12", type: "update"  },
  { id: "a7", ts: "2026-05-25 16:00", user: "admin@taco",    restaurant: "Taco Express",   action: "Invitó empleado",          details: "empleado@taco.com",            ip: "190.xxx.34", type: "create"  },
];

// ─── Constants ────────────────────────────────────────────────────────────────

// Módulos del empleado (lo que se ve en el sidebar EMPLEADO)
const EMPLOYEE_MODULES = [
  { id: "emp_fidelizacion",  name: "Fidelización",        desc: "Ver tarjetas activas y QR del negocio",         locked: false },
  { id: "emp_sellar",        name: "Sellar visita",        desc: "Escanear QR del cliente o buscar por teléfono", locked: false },
  { id: "emp_pedidos",       name: "Pedidos",              desc: "Ver y gestionar pedidos activos",               locked: false },
  { id: "emp_menu_ver",      name: "Menú — ver",           desc: "Consultar el menú del restaurante",             locked: false },
  { id: "emp_menu_editar",   name: "Menú — editar",        desc: "Modificar precios y disponibilidad",            locked: true  },
  { id: "emp_recetario",     name: "Recetario",            desc: "Ver recetas y costos de producción",            locked: true  },
  { id: "emp_clientes_ver",  name: "Clientes — ver",       desc: "Consultar datos de clientes",                   locked: false },
  { id: "emp_clientes_edit", name: "Clientes — editar",    desc: "Modificar datos y puntos de clientes",          locked: true  },
  { id: "emp_pantalla_tv",   name: "Pantalla TV",          desc: "Controlar la pantalla digital del local",       locked: true  },
];

// Módulos del usuario/cliente (vista móvil)
const USER_MODULES = [
  { id: "usr_tarjeta",       name: "Ver mi tarjeta",       desc: "Acceder a puntos y sellos acumulados",          locked: false },
  { id: "usr_canjear",       name: "Canjear recompensas",  desc: "Canjear puntos por recompensas activas",        locked: false },
  { id: "usr_menu",          name: "Menú",                 desc: "Ver el menú del restaurante",                   locked: false },
  { id: "usr_resenas",       name: "Reseñas",              desc: "Ver y dejar reseñas del restaurante",           locked: false },
  { id: "usr_registro_qr",   name: "Registro por QR",      desc: "Registrarse escaneando el QR del negocio",      locked: false },
  { id: "usr_historial",     name: "Historial de visitas", desc: "Ver el historial de visitas y canjes",          locked: false },
];

// Solicitudes de acceso (pendientes de aprobación del super admin)
interface AccessRequest {
  id: string; restaurantName: string; requestedBy: string; feature: string;
  reason: string; ts: string; status: "pending" | "approved" | "rejected"; rejectReason?: string;
}

const SEED_REQUESTS: AccessRequest[] = [
  { id: "req1", restaurantName: "La Trattoria",    requestedBy: "admin@latra.app",       feature: "Menú — editar",     reason: "Necesitamos que los empleados actualicen precios en tiempo real", ts: "2026-05-28 09:14", status: "pending" },
  { id: "req2", restaurantName: "Taco Express",    requestedBy: "admin@tacoexpress.app", feature: "Recetario",         reason: "El encargado de cocina necesita consultar recetas desde su tablet", ts: "2026-05-27 16:40", status: "pending" },
  { id: "req3", restaurantName: "Nicho Restaurant",requestedBy: "admin@nicho.app",       feature: "Pantalla TV",       reason: "Instalamos una pantalla nueva en la barra", ts: "2026-05-26 11:00", status: "approved" },
  { id: "req4", restaurantName: "Sushi Zen",       requestedBy: "admin@sushizen.app",    feature: "Clientes — editar", reason: "Queremos que los meseros puedan agregar puntos manualmente", ts: "2026-05-24 14:20", status: "rejected", rejectReason: "Riesgo de manipulación de puntos. Usar sello QR en su lugar." },
];

// Configuración de seguridad por restaurante
interface SecurityConfig {
  restaurantId: string;
  sessionHours: number;
  pinRequired: boolean;
  allowedStart: string;
  allowedEnd: string;
  maxFailedLogins: number;
  ipWhitelist: boolean;
}

const SEED_SECURITY: SecurityConfig[] = SEED_RESTAURANTS.map((r) => ({
  restaurantId: r.id,
  sessionHours: 8,
  pinRequired: false,
  allowedStart: "07:00",
  allowedEnd: "23:00",
  maxFailedLogins: 5,
  ipWhitelist: false,
}));

const PLAN_LABELS: Record<Plan, string>    = { trial: "Trial", basic: "Básico", premium: "Premium" };
const PLAN_COLORS: Record<Plan, string>    = { trial: "info",  basic: "muted",  premium: "active"  };
const PLAN_PRICE: Record<Plan, number>     = { trial: 0, basic: 799, premium: 2499 };
const STATUS_LABELS: Record<Status, string> = { active: "Activo", suspended: "Suspendido", maintenance: "Mantenimiento" };
const STATUS_COLORS: Record<Status, string> = { active: "active", suspended: "danger",     maintenance: "warning"       };
const AUDIT_ICONS: Record<AuditType, string> = { create: "➕", update: "✏️", delete: "🗑️", access: "👁️", billing: "💳" };
const AUDIT_COLORS: Record<AuditType, string> = { create: "active", update: "info", delete: "danger", access: "muted", billing: "warning" };

// ─── Shared helpers ───────────────────────────────────────────────────────────

function Badge({ type, children }: { type: string; children: React.ReactNode }) {
  return <span className={`sa-badge ${type}`}><span className="dot" />{children}</span>;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="sa-toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="sa-toggle-track" />
    </label>
  );
}

function ToastBanner({ toast }: { toast: Toast }) {
  const bg: Record<string, string> = {
    success: "rgba(0,230,118,.15)",
    error:   "rgba(239,68,68,.15)",
    info:    "rgba(59,130,246,.15)",
  };
  const color: Record<string, string> = { success: "#00e676", error: "#ef4444", info: "#60a5fa" };
  const icon: Record<string, string>  = { success: "✅", error: "❌", info: "ℹ️" };
  return (
    <div style={{
      position: "fixed", top: "20px", right: "20px", zIndex: 9999,
      background: bg[toast.type], border: `1px solid ${color[toast.type]}`,
      borderRadius: "12px", padding: "14px 20px",
      color: color[toast.type], fontWeight: 600, fontSize: ".88rem",
      display: "flex", alignItems: "center", gap: "10px",
      boxShadow: "0 8px 32px rgba(0,0,0,.4)", maxWidth: "360px",
      animation: "fadeIn .2s ease",
    }}>
      <span>{icon[toast.type]}</span>
      <span style={{ color: "#eef2f7" }}>{toast.msg}</span>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px",
    }} onClick={onClose}>
      <div style={{
        background: "#0e1225", border: "1px solid rgba(255,255,255,.12)", borderRadius: "16px",
        width: "100%", maxWidth: "520px", maxHeight: "80vh", overflowY: "auto",
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px", borderBottom: "1px solid rgba(255,255,255,.07)" }}>
          <span style={{ fontWeight: 700, fontSize: "1rem", color: "#fff" }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#6b7a94", fontSize: "1.2rem", cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ padding: "24px" }}>{children}</div>
      </div>
    </div>
  );
}

// ─── Login ────────────────────────────────────────────────────────────────────

function Login({ onLogin }: { onLogin: () => void }) {
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");

  const handleLogin = () => {
    if (pass.trim() === "admin123") { onLogin(); }
    else { setError("Contraseña incorrecta."); }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#080b16", padding: "24px" }}>
      <div style={{ width: "100%", maxWidth: "380px", background: "#0e1225", border: "1px solid rgba(255,255,255,.12)", borderRadius: "16px", padding: "40px" }}>
        <div style={{ fontSize: "32px", marginBottom: "12px" }}>🛡️</div>
        <h1 style={{ color: "#fff", fontSize: "1.5rem", fontWeight: 800, marginBottom: "4px" }}>Super Admin</h1>
        <p style={{ color: "#6b7a94", fontSize: ".86rem", marginBottom: "28px" }}>Panel de control NICHO</p>
        <label style={{ display: "block", color: "#6b7a94", fontSize: ".75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "6px" }}>Contraseña</label>
        <input
          type="password" placeholder="admin123" value={pass}
          onChange={(e) => setPass(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          style={{ width: "100%", background: "#141833", border: "1px solid rgba(255,255,255,.12)", borderRadius: "8px", padding: "10px 14px", color: "#eef2f7", fontSize: ".88rem", outline: "none", fontFamily: "inherit", boxSizing: "border-box", marginBottom: "12px" }}
        />
        {error && <p style={{ color: "#ef4444", fontSize: ".82rem", marginBottom: "10px" }}>{error}</p>}
        <button onClick={handleLogin} style={{ width: "100%", padding: "12px", background: "#00e676", color: "#000", border: "none", borderRadius: "8px", fontWeight: 700, fontSize: ".9rem", cursor: "pointer", fontFamily: "inherit" }}>
          Entrar al dashboard
        </button>
        <p style={{ color: "#4a5568", fontSize: ".72rem", textAlign: "center", marginTop: "14px" }}>
          Contraseña: <strong style={{ color: "#6b7a94" }}>admin123</strong>
        </p>
      </div>
    </div>
  );
}

// ─── Overview ─────────────────────────────────────────────────────────────────

function Overview({ restaurants, setView }: { restaurants: Restaurant[]; setView: (v: View) => void }) {
  const active  = restaurants.filter((r) => r.status === "active").length;
  const withDebt = restaurants.filter((r) => r.balance > 0).length;
  const totalUsers = restaurants.reduce((s, r) => s + r.users, 0);
  const revenue = restaurants.filter((r) => r.plan !== "trial" && r.status === "active")
    .reduce((s, r) => s + PLAN_PRICE[r.plan], 0);

  return (
    <div>
      <div className="sa-section-header">
        <div><div className="sa-section-title">📊 Métricas globales</div><div className="sa-section-sub">Resumen de toda la plataforma</div></div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: ".82rem", color: "var(--text-secondary)" }}>
          <span className="sa-live" /> EN VIVO
        </div>
      </div>

      <div className="sa-kpi-strip">
        <div className="sa-kpi-card" style={{ cursor: "pointer" }} onClick={() => setView("restaurants")}>
          <div className="sa-kpi-top"><span className="sa-kpi-label">Restaurantes activos</span><div className="sa-kpi-icon" style={{ background: "rgba(0,230,118,.1)", color: "var(--accent)" }}>🏪</div></div>
          <div className="sa-kpi-value">{active}</div>
          <div className="sa-kpi-delta">de {restaurants.length} totales →</div>
        </div>
        <div className="sa-kpi-card" style={{ cursor: "pointer" }} onClick={() => setView("billing")}>
          <div className="sa-kpi-top"><span className="sa-kpi-label">Ingresos del mes</span><div className="sa-kpi-icon" style={{ background: "rgba(99,102,241,.15)", color: "#818cf8" }}>💰</div></div>
          <div className="sa-kpi-value">${revenue.toLocaleString()}</div>
          <div className="sa-kpi-delta">planes activos →</div>
        </div>
        <div className="sa-kpi-card" style={{ cursor: "pointer" }} onClick={() => setView("billing")}>
          <div className="sa-kpi-top"><span className="sa-kpi-label">Tasa de morosidad</span><div className="sa-kpi-icon" style={{ background: withDebt > 0 ? "rgba(239,68,68,.12)" : "rgba(0,230,118,.1)", color: withDebt > 0 ? "#ef4444" : "var(--accent)" }}>⚠️</div></div>
          <div className="sa-kpi-value" style={{ color: withDebt > 0 ? "#ef4444" : undefined }}>{Math.round((withDebt / restaurants.length) * 100)}%</div>
          <div className={`sa-kpi-delta${withDebt > 0 ? " down" : ""}`}>{withDebt} con saldo →</div>
        </div>
        <div className="sa-kpi-card">
          <div className="sa-kpi-top"><span className="sa-kpi-label">Usuarios totales</span><div className="sa-kpi-icon" style={{ background: "rgba(59,130,246,.12)", color: "#60a5fa" }}>👥</div></div>
          <div className="sa-kpi-value">{totalUsers}</div>
          <div className="sa-kpi-delta">en {restaurants.length} restaurantes</div>
        </div>
      </div>

      <div className="sa-grid-2">
        <div className="sa-card">
          <div className="sa-card-header"><span className="sa-card-title">Estado de restaurantes</span><button className="sa-btn sm" onClick={() => setView("restaurants")}>Ver todos →</button></div>
          <div className="sa-card-body">
            {restaurants.map((r) => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                <div style={{ width: 34, height: 34, borderRadius: "10px", background: "var(--bg-elevated)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>🍽️</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: ".88rem" }}>{r.name}</div>
                  <div style={{ fontSize: ".75rem", color: "var(--text-secondary)" }}>{r.users}/{r.maxUsers} usuarios · {PLAN_LABELS[r.plan]}</div>
                </div>
                {r.balance > 0 && <span style={{ fontSize: ".75rem", color: "#ef4444", fontWeight: 700 }}>${r.balance.toLocaleString()}</span>}
                <Badge type={STATUS_COLORS[r.status]}>{STATUS_LABELS[r.status]}</Badge>
              </div>
            ))}
          </div>
        </div>

        <div className="sa-card">
          <div className="sa-card-header"><span className="sa-card-title">Distribución de planes</span></div>
          <div className="sa-card-body">
            {(["premium", "basic", "trial"] as Plan[]).map((p) => {
              const count = restaurants.filter((r) => r.plan === p).length;
              const pct = Math.round((count / restaurants.length) * 100);
              return (
                <div key={p} style={{ marginBottom: "16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span style={{ fontSize: ".86rem", fontWeight: 600 }}>{PLAN_LABELS[p]}</span>
                    <span style={{ fontSize: ".82rem", color: "var(--text-secondary)" }}>{count} restaurantes · {pct}%</span>
                  </div>
                  <div style={{ height: "8px", background: "rgba(255,255,255,.06)", borderRadius: "4px", overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: "4px", width: `${pct}%`, background: p === "premium" ? "var(--accent)" : p === "basic" ? "#3b82f6" : "#64748b", transition: "width .4s ease" }} />
                  </div>
                </div>
              );
            })}
            <div style={{ marginTop: "20px", padding: "14px", background: "var(--bg-elevated)", borderRadius: "10px", border: "1px solid var(--border)" }}>
              <div style={{ fontSize: ".75rem", color: "var(--text-secondary)", marginBottom: "4px" }}>MRR estimado</div>
              <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--accent)" }}>${revenue.toLocaleString()}<span style={{ fontSize: ".9rem", fontWeight: 500, color: "var(--text-secondary)" }}>/mes</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Restaurants ──────────────────────────────────────────────────────────────

function Restaurants({
  restaurants, setRestaurants, addAudit, showToast,
}: {
  restaurants: Restaurant[];
  setRestaurants: React.Dispatch<React.SetStateAction<Restaurant[]>>;
  addAudit: (action: string, details: string, type: AuditType, restaurant?: string) => void;
  showToast: (msg: string, type?: Toast["type"]) => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | Plan>("all");
  const [selected, setSelected] = useState<Restaurant | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPlan, setNewPlan] = useState<Plan>("trial");

  const filtered = restaurants.filter((r) => {
    const s = r.name.toLowerCase().includes(search.toLowerCase());
    return filter === "all" ? s : s && r.plan === filter;
  });

  const toggleStatus = (r: Restaurant) => {
    const next: Status = r.status === "suspended" ? "active" : "suspended";
    setRestaurants((prev) => prev.map((x) => x.id === r.id ? { ...x, status: next } : x));
    addAudit(next === "suspended" ? "Restaurante suspendido" : "Restaurante reactivado", r.name, "update", r.name);
    showToast(`${r.name} ${next === "suspended" ? "suspendido" : "reactivado"}`);
    setSelected(null);
  };

  const addRestaurant = () => {
    if (!newName.trim() || !newEmail.trim()) { showToast("Completa nombre y correo", "error"); return; }
    const newR: Restaurant = {
      id: `r${Date.now()}`, name: newName.trim(), plan: newPlan, status: "active",
      users: 1, maxUsers: newPlan === "premium" ? 20 : newPlan === "basic" ? 5 : 3,
      registeredAt: new Date().toISOString().split("T")[0],
      balance: 0, nextPayment: "—", lastPayment: "—",
      email: newEmail.trim(),
      notes: "", apiToken: `nch_live_${Math.random().toString(36).slice(2, 14)}`,
      lastActive: "Recién registrado", loginCount: 0,
    };
    setRestaurants((prev) => [...prev, newR]);
    addAudit("Restaurante registrado", `${newName} · Plan ${PLAN_LABELS[newPlan]}`, "create", newName);
    showToast(`${newName} registrado exitosamente`);
    setNewName(""); setNewEmail(""); setNewPlan("trial"); setShowNewForm(false);
  };

  const fieldStyle = { width: "100%", background: "#141833", border: "1px solid rgba(255,255,255,.12)", borderRadius: "8px", padding: "9px 12px", color: "#eef2f7", fontSize: ".86rem", outline: "none", fontFamily: "inherit", boxSizing: "border-box" as const, marginBottom: "12px" };

  return (
    <div>
      <div className="sa-section-header">
        <div><div className="sa-section-title">🏪 Restaurantes</div><div className="sa-section-sub">{restaurants.length} registrados · {restaurants.filter((r) => r.status === "active").length} activos</div></div>
        <button className="sa-btn primary" onClick={() => setShowNewForm(true)}>+ Registrar restaurante</button>
      </div>

      <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
        <div className="sa-search" style={{ flex: 1, minWidth: "180px" }}>
          <span style={{ color: "var(--text-muted)" }}>🔍</span>
          <input placeholder="Buscar restaurante…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {(["all", "trial", "basic", "premium"] as const).map((f) => (
          <button key={f} className={`sa-chip${filter === f ? " active" : ""}`} onClick={() => setFilter(f)}>
            {f === "all" ? "Todos" : PLAN_LABELS[f]}
          </button>
        ))}
      </div>

      <div className="sa-card">
        <table className="sa-table">
          <thead><tr><th>Restaurante</th><th>Plan</th><th>Estado</th><th>Usuarios</th><th>Saldo</th><th>Próx. pago</th><th>Registro</th><th>Acciones</th></tr></thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{r.name}</div>
                  <div style={{ fontSize: ".75rem", color: "var(--text-secondary)" }}>{r.email}</div>
                </td>
                <td><Badge type={PLAN_COLORS[r.plan]}>{PLAN_LABELS[r.plan]}</Badge></td>
                <td><Badge type={STATUS_COLORS[r.status]}>{STATUS_LABELS[r.status]}</Badge></td>
                <td><span style={{ fontWeight: 600 }}>{r.users}</span><span style={{ color: "var(--text-muted)" }}>/{r.maxUsers}</span></td>
                <td style={{ color: r.balance > 0 ? "#ef4444" : "var(--accent)", fontWeight: 700 }}>{r.balance > 0 ? `$${r.balance.toLocaleString()}` : "Al día"}</td>
                <td style={{ color: r.nextPayment === "Vencida" ? "#ef4444" : "var(--text-primary)" }}>{r.nextPayment}</td>
                <td style={{ color: "var(--text-secondary)" }}>{r.registeredAt}</td>
                <td>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button className="sa-btn sm" onClick={() => setSelected(r)}>Ver</button>
                    {r.status !== "maintenance" && (
                      <button className={`sa-btn sm${r.status === "suspended" ? "" : " danger"}`} onClick={() => toggleStatus(r)}>
                        {r.status === "suspended" ? "Activar" : "Suspender"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail modal */}
      {selected && (
        <Modal title={`${selected.name} — Detalle`} onClose={() => setSelected(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {[
              ["Plan", PLAN_LABELS[selected.plan]], ["Estado", STATUS_LABELS[selected.status]],
              ["Correo", selected.email], ["Usuarios", `${selected.users} / ${selected.maxUsers}`],
              ["Saldo pendiente", selected.balance > 0 ? `$${selected.balance.toLocaleString()}` : "Al corriente"],
              ["Próximo pago", selected.nextPayment], ["Último pago", selected.lastPayment],
              ["Registrado", selected.registeredAt],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: ".86rem" }}>
                <span style={{ color: "var(--text-secondary)" }}>{k}</span>
                <span style={{ fontWeight: 600, color: "#eef2f7" }}>{v}</span>
              </div>
            ))}
            <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
              {selected.status !== "maintenance" && (
                <button className={`sa-btn${selected.status === "suspended" ? "" : " danger"}`} style={{ flex: 1 }} onClick={() => toggleStatus(selected)}>
                  {selected.status === "suspended" ? "✅ Reactivar" : "🚫 Suspender"}
                </button>
              )}
              <button className="sa-btn" style={{ flex: 1 }} onClick={() => setSelected(null)}>Cerrar</button>
            </div>
          </div>
        </Modal>
      )}

      {/* New restaurant modal */}
      {showNewForm && (
        <Modal title="Registrar nuevo restaurante" onClose={() => setShowNewForm(false)}>
          <label style={{ display: "block", color: "var(--text-secondary)", fontSize: ".78rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "5px" }}>Nombre del restaurante</label>
          <input style={fieldStyle} placeholder="Ej. El Fogón" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <label style={{ display: "block", color: "var(--text-secondary)", fontSize: ".78rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "5px" }}>Correo del admin</label>
          <input style={fieldStyle} placeholder="admin@restaurante.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          <label style={{ display: "block", color: "var(--text-secondary)", fontSize: ".78rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "5px" }}>Plan inicial</label>
          <select style={{ ...fieldStyle, cursor: "pointer" }} value={newPlan} onChange={(e) => setNewPlan(e.target.value as Plan)}>
            <option value="trial">Trial (30 días gratis)</option>
            <option value="basic">Básico ($799/mes)</option>
            <option value="premium">Premium ($2,499/mes)</option>
          </select>
          <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
            <button className="sa-btn primary" style={{ flex: 1 }} onClick={addRestaurant}>✅ Registrar</button>
            <button className="sa-btn" style={{ flex: 1 }} onClick={() => setShowNewForm(false)}>Cancelar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Feature Flags ────────────────────────────────────────────────────────────

function FeatureFlags({
  restaurants, addAudit, showToast,
}: {
  restaurants: Restaurant[];
  addAudit: (action: string, details: string, type: AuditType, restaurant?: string) => void;
  showToast: (msg: string, type?: Toast["type"]) => void;
}) {
  const [sel, setSel] = useState<string>("all");
  const [flags, setFlags] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    FEATURES.forEach((f) => {
      init[`all_${f.id}`] = f.defaultEnabled;
      restaurants.forEach((r) => { init[`${r.id}_${f.id}`] = f.defaultEnabled; });
    });
    return init;
  });
  const [roles, setRoles] = useState<Record<string, ("admin" | "employee" | "user")[]>>(() =>
    Object.fromEntries(FEATURES.map((f) => [f.id, ["admin", "employee", "user"]]))
  );

  const k = (fid: string) => `${sel}_${fid}`;
  const selName = sel === "all" ? "Global" : restaurants.find((r) => r.id === sel)?.name ?? sel;

  const toggle = (fid: string, fname: string) => {
    const next = !(flags[k(fid)] ?? true);
    const newFlags = { ...flags, [k(fid)]: next };
    setFlags(newFlags);

    // Persist global flags via mi-proyecto API
    if (sel === "all") {
      const globalFlags: Record<string, boolean> = {};
      FEATURES.forEach((f) => { globalFlags[f.id] = newFlags[`all_${f.id}`] ?? true; });
      fetch("/api/save-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(globalFlags),
      }).then(async r => {
          if (!r.ok) {
            const body = await r.json().catch(() => ({}));
            showToast(`Error ${r.status}: ${body.error ?? "desconocido"}`, "error");
          } else {
            showToast("Flags guardados ✓", "success");
          }
        }).catch((e) => showToast(`Red: ${e.message}`, "error"));
    }

    addAudit(`Feature flag ${next ? "activada" : "desactivada"}`, `${fname} → ${selName}`, "update", selName === "Global" ? "—" : selName);
    showToast(`${fname} ${next ? "activada" : "desactivada"} en ${selName}`);
  };

  const toggleRole = (fid: string, role: "admin" | "employee" | "user") => {
    setRoles((p) => {
      const cur = p[fid] ?? [];
      return { ...p, [fid]: cur.includes(role) ? cur.filter((r) => r !== role) : [...cur, role] };
    });
  };

  const categories = [...new Set(FEATURES.map((f) => f.category))];

  return (
    <div>
      <div className="sa-section-header">
        <div><div className="sa-section-title">🚩 Feature Flags</div><div className="sa-section-sub">Activa o bloquea módulos por restaurante y por rol</div></div>
        <button className="sa-btn" onClick={() => {
          const blob = new Blob([JSON.stringify(flags, null, 2)], { type: "application/json" });
          const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
          a.download = "feature-flags.json"; a.click();
          showToast("Configuración exportada");
        }}>⬇ Exportar JSON</button>
      </div>

      <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
        <button className={`sa-chip${sel === "all" ? " active" : ""}`} onClick={() => setSel("all")}>🌐 Global</button>
        {restaurants.map((r) => (
          <button key={r.id} className={`sa-chip${sel === r.id ? " active" : ""}`} onClick={() => setSel(r.id)}>{r.name}</button>
        ))}
      </div>

      {categories.map((cat) => (
        <div key={cat} className="sa-card" style={{ marginBottom: "16px" }}>
          <div className="sa-card-header">
            <span className="sa-card-title">{cat}</span>
            <span style={{ fontSize: ".78rem", color: "var(--text-secondary)" }}>{FEATURES.filter((f) => f.category === cat).length} módulos</span>
          </div>
          <table className="sa-table">
            <thead><tr><th>Módulo</th><th>Descripción</th><th>Activo</th><th>Roles con acceso</th></tr></thead>
            <tbody>
              {FEATURES.filter((f) => f.category === cat).map((f) => {
                const on = flags[k(f.id)] ?? f.defaultEnabled;
                return (
                  <tr key={f.id}>
                    <td style={{ fontWeight: 600 }}>{f.name}</td>
                    <td style={{ color: "var(--text-secondary)", fontSize: ".82rem" }}>{f.description}</td>
                    <td><Toggle checked={on} onChange={() => toggle(f.id, f.name)} /></td>
                    <td>
                      <div className="sa-role-chips">
                        {(["admin", "employee", "user"] as const).map((role) => (
                          <button key={role} className={`sa-chip${roles[f.id]?.includes(role) ? " active" : ""}`}
                            onClick={() => toggleRole(f.id, role)} style={{ opacity: on ? 1 : 0.4 }} disabled={!on}>
                            {role}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

// ─── Billing ──────────────────────────────────────────────────────────────────

function Billing({
  restaurants, setRestaurants, addAudit, showToast,
}: {
  restaurants: Restaurant[];
  setRestaurants: React.Dispatch<React.SetStateAction<Restaurant[]>>;
  addAudit: (action: string, details: string, type: AuditType, restaurant?: string) => void;
  showToast: (msg: string, type?: Toast["type"]) => void;
}) {
  const [changePlan, setChangePlan] = useState<Restaurant | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<Plan>("basic");

  const registerPayment = (r: Restaurant) => {
    const paid = r.balance;
    setRestaurants((prev) => prev.map((x) => x.id === r.id
      ? { ...x, balance: 0, lastPayment: new Date().toISOString().split("T")[0], status: x.status === "suspended" ? "active" : x.status }
      : x));
    addAudit("Pago registrado", `${r.name} — $${paid.toLocaleString()} liquidado`, "billing", r.name);
    showToast(`Pago de $${paid.toLocaleString()} registrado para ${r.name}`);
  };

  const applyPlanChange = () => {
    if (!changePlan) return;
    const prev = changePlan.plan;
    const maxUsers = selectedPlan === "premium" ? 20 : selectedPlan === "basic" ? 5 : 3;
    setRestaurants((p) => p.map((x) => x.id === changePlan.id ? { ...x, plan: selectedPlan, maxUsers } : x));
    addAudit("Plan actualizado", `${changePlan.name}: ${PLAN_LABELS[prev]} → ${PLAN_LABELS[selectedPlan]}`, "billing", changePlan.name);
    showToast(`Plan de ${changePlan.name} actualizado a ${PLAN_LABELS[selectedPlan]}`);
    setChangePlan(null);
  };

  const total = restaurants.reduce((s, r) => s + r.balance, 0);
  const revenue = restaurants.filter((r) => r.plan !== "trial" && r.status === "active").reduce((s, r) => s + PLAN_PRICE[r.plan], 0);

  return (
    <div>
      <div className="sa-section-header">
        <div><div className="sa-section-title">💳 Cuentas y pagos</div><div className="sa-section-sub">Historial, deudas y planes de todos los restaurantes</div></div>
      </div>

      <div className="sa-kpi-strip" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <div className="sa-kpi-card">
          <div className="sa-kpi-top"><span className="sa-kpi-label">Al corriente</span><div className="sa-kpi-icon" style={{ background: "rgba(0,230,118,.1)", color: "var(--accent)" }}>✅</div></div>
          <div className="sa-kpi-value">{restaurants.filter((r) => r.balance === 0).length}</div>
          <div className="sa-kpi-delta">restaurantes</div>
        </div>
        <div className="sa-kpi-card">
          <div className="sa-kpi-top"><span className="sa-kpi-label">Deuda acumulada</span><div className="sa-kpi-icon" style={{ background: "rgba(239,68,68,.12)", color: "#ef4444" }}>🔴</div></div>
          <div className="sa-kpi-value" style={{ color: total > 0 ? "#ef4444" : undefined }}>${total.toLocaleString()}</div>
          <div className={`sa-kpi-delta${total > 0 ? " down" : ""}`}>{restaurants.filter((r) => r.balance > 0).length} con saldo</div>
        </div>
        <div className="sa-kpi-card">
          <div className="sa-kpi-top"><span className="sa-kpi-label">MRR activo</span><div className="sa-kpi-icon" style={{ background: "rgba(99,102,241,.12)", color: "#818cf8" }}>📈</div></div>
          <div className="sa-kpi-value">${revenue.toLocaleString()}</div>
          <div className="sa-kpi-delta">este mes</div>
        </div>
      </div>

      <div className="sa-card">
        <table className="sa-table">
          <thead><tr><th>Restaurante</th><th>Plan</th><th>Último pago</th><th>Próx. vencimiento</th><th>Deuda</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            {restaurants.map((r) => (
              <tr key={r.id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{r.name}</div>
                  <div style={{ fontSize: ".75rem", color: "var(--text-secondary)" }}>{r.email}</div>
                </td>
                <td><Badge type={PLAN_COLORS[r.plan]}>{PLAN_LABELS[r.plan]}</Badge></td>
                <td style={{ color: "var(--text-secondary)" }}>{r.lastPayment}</td>
                <td style={{ color: r.nextPayment === "Vencida" ? "#ef4444" : "var(--text-primary)", fontWeight: r.nextPayment === "Vencida" ? 700 : 400 }}>{r.nextPayment}</td>
                <td style={{ color: r.balance > 0 ? "#ef4444" : "var(--accent)", fontWeight: 700 }}>{r.balance > 0 ? `$${r.balance.toLocaleString()}` : "—"}</td>
                <td><Badge type={r.balance > 0 ? "danger" : "active"}>{r.balance > 0 ? "Deuda pendiente" : "Al corriente"}</Badge></td>
                <td>
                  <div style={{ display: "flex", gap: "6px" }}>
                    {r.balance > 0 && <button className="sa-btn sm primary" onClick={() => registerPayment(r)}>💰 Liquidar</button>}
                    <button className="sa-btn sm" onClick={() => { setChangePlan(r); setSelectedPlan(r.plan); }}>Cambiar plan</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {changePlan && (
        <Modal title={`Cambiar plan — ${changePlan.name}`} onClose={() => setChangePlan(null)}>
          <p style={{ fontSize: ".86rem", color: "var(--text-secondary)", marginBottom: "16px" }}>Plan actual: <strong style={{ color: "#fff" }}>{PLAN_LABELS[changePlan.plan]}</strong></p>
          {(["trial", "basic", "premium"] as Plan[]).map((p) => (
            <div key={p} onClick={() => setSelectedPlan(p)} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px", marginBottom: "8px", borderRadius: "10px", border: `1px solid ${selectedPlan === p ? "var(--accent)" : "var(--border)"}`, background: selectedPlan === p ? "var(--accent-dim)" : "var(--bg-elevated)", cursor: "pointer", transition: "all .15s" }}>
              <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${selectedPlan === p ? "var(--accent)" : "var(--border)"}`, background: selectedPlan === p ? "var(--accent)" : "transparent", flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: "#fff" }}>{PLAN_LABELS[p]}</div>
                <div style={{ fontSize: ".78rem", color: "var(--text-secondary)" }}>{PLAN_PRICE[p] === 0 ? "Gratis 30 días" : `$${PLAN_PRICE[p].toLocaleString()}/mes`} · máx {p === "premium" ? 20 : p === "basic" ? 5 : 3} usuarios</div>
              </div>
              {selectedPlan === p && <span style={{ color: "var(--accent)", fontWeight: 700 }}>✓</span>}
            </div>
          ))}
          <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
            <button className="sa-btn primary" style={{ flex: 1 }} onClick={applyPlanChange} disabled={selectedPlan === changePlan.plan}>Confirmar cambio</button>
            <button className="sa-btn" style={{ flex: 1 }} onClick={() => setChangePlan(null)}>Cancelar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

function AuditLog({ log, showToast }: { log: AuditEntry[]; showToast: (msg: string, type?: Toast["type"]) => void }) {
  const [filter, setFilter] = useState<"all" | AuditType>("all");
  const [search, setSearch] = useState("");

  const filtered = log.filter((e) => {
    const matchType = filter === "all" || e.type === filter;
    const matchSearch = search === "" || e.action.toLowerCase().includes(search.toLowerCase()) || e.restaurant.toLowerCase().includes(search.toLowerCase()) || e.user.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  const exportCSV = () => {
    const header = "Fecha,Tipo,Usuario,Restaurante,Acción,Detalles,IP\n";
    const rows = log.map((e) => `"${e.ts}","${e.type}","${e.user}","${e.restaurant}","${e.action}","${e.details}","${e.ip}"`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "auditoria.csv"; a.click();
    showToast("CSV exportado correctamente");
  };

  return (
    <div>
      <div className="sa-section-header">
        <div><div className="sa-section-title">🔍 Auditoría</div><div className="sa-section-sub">{log.length} registros · quién hizo qué y cuándo</div></div>
        <button className="sa-btn" onClick={exportCSV}>⬇ Exportar CSV</button>
      </div>

      <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
        <div className="sa-search" style={{ flex: 1, minWidth: "200px" }}>
          <span style={{ color: "var(--text-muted)" }}>🔍</span>
          <input placeholder="Buscar acción, usuario, restaurante…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="sa-tabs" style={{ margin: 0 }}>
          {(["all", "create", "update", "delete", "access", "billing"] as const).map((t) => (
            <button key={t} className={`sa-tab${filter === t ? " active" : ""}`} onClick={() => setFilter(t)}>
              {t === "all" ? "Todos" : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="sa-card">
        <table className="sa-table">
          <thead><tr><th>Fecha / Hora</th><th>Tipo</th><th>Usuario</th><th>Restaurante</th><th>Acción</th><th>Detalles</th><th>IP</th></tr></thead>
          <tbody>
            {filtered.length === 0
              ? <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--text-muted)", padding: "30px" }}>Sin registros</td></tr>
              : filtered.map((e) => (
                <tr key={e.id}>
                  <td style={{ color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{e.ts}</td>
                  <td><span style={{ display: "flex", alignItems: "center", gap: "6px" }}>{AUDIT_ICONS[e.type]} <Badge type={AUDIT_COLORS[e.type]}>{e.type}</Badge></span></td>
                  <td style={{ fontWeight: 600 }}>{e.user}</td>
                  <td style={{ color: "var(--text-secondary)" }}>{e.restaurant}</td>
                  <td>{e.action}</td>
                  <td style={{ color: "var(--text-secondary)", fontSize: ".82rem" }}>{e.details}</td>
                  <td style={{ color: "var(--text-muted)", fontFamily: "monospace", fontSize: ".78rem" }}>{e.ip}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Plans ────────────────────────────────────────────────────────────────────

function Plans({ restaurants, setRestaurants, planConfigs, setPlanConfigs, addAudit, showToast }: {
  restaurants: Restaurant[];
  setRestaurants: React.Dispatch<React.SetStateAction<Restaurant[]>>;
  planConfigs: PlanConfig[];
  setPlanConfigs: React.Dispatch<React.SetStateAction<PlanConfig[]>>;
  addAudit: (action: string, details: string, type: AuditType, restaurant?: string) => void;
  showToast: (msg: string, type?: Toast["type"]) => void;
}) {
  const [assign, setAssign]   = useState<{ plan: Plan; r: Restaurant } | null>(null);
  const [editing, setEditing] = useState<PlanConfig | null>(null);
  const [draft, setDraft]     = useState<PlanConfig | null>(null);

  const openEditor = (p: PlanConfig) => { setEditing(p); setDraft({ ...p, features: p.features.map((f) => ({ ...f })) }); };

  const saveEdit = () => {
    if (!draft) return;
    setPlanConfigs((prev) => prev.map((p) => p.id === draft.id ? draft : p));
    addAudit("Plan editado", `${draft.name} — $${draft.price}/mes · ${draft.maxUsers} usuarios`, "billing");
    showToast(`Plan "${draft.name}" actualizado`);
    setEditing(null); setDraft(null);
  };

  const updateFeatureText = (i: number, text: string) => {
    if (!draft) return;
    setDraft({ ...draft, features: draft.features.map((f, idx) => idx === i ? { ...f, text } : f) });
  };
  const toggleFeatureIncluded = (i: number) => {
    if (!draft) return;
    setDraft({ ...draft, features: draft.features.map((f, idx) => idx === i ? { ...f, included: !f.included } : f) });
  };
  const addFeature = () => {
    if (!draft) return;
    setDraft({ ...draft, features: [...draft.features, { text: "Nueva característica", included: true }] });
  };
  const removeFeature = (i: number) => {
    if (!draft) return;
    setDraft({ ...draft, features: draft.features.filter((_, idx) => idx !== i) });
  };

  const applyAssign = () => {
    if (!assign) return;
    const cfg = planConfigs.find((p) => p.id === assign.plan)!;
    setRestaurants((p) => p.map((x) => x.id === assign.r.id ? { ...x, plan: assign.plan, maxUsers: cfg.maxUsers } : x));
    addAudit("Plan asignado", `${assign.r.name}: → ${cfg.name}`, "billing", assign.r.name);
    showToast(`${assign.r.name} movido a plan ${cfg.name}`);
    setAssign(null);
  };

  const inpStyle = (extra?: React.CSSProperties): React.CSSProperties => ({
    background: "#141833", border: "1px solid rgba(255,255,255,.12)", borderRadius: "8px",
    padding: "8px 12px", color: "#eef2f7", fontSize: ".86rem", outline: "none",
    fontFamily: "inherit", width: "100%", boxSizing: "border-box", ...extra,
  });

  const counts = Object.fromEntries(planConfigs.map((p) => [p.id, restaurants.filter((r) => r.plan === p.id).length]));

  return (
    <div>
      <div className="sa-section-header">
        <div><div className="sa-section-title">💎 Planes y niveles</div><div className="sa-section-sub">Edita precio, usuarios y características de cada plan</div></div>
      </div>

      {/* Plan cards */}
      <div className="sa-grid-3" style={{ marginBottom: "24px" }}>
        {planConfigs.map((p) => (
          <div key={p.id} className={`sa-plan-card${p.id === "premium" ? " featured" : ""}`}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: "1rem", color: p.color, marginBottom: "4px" }}>{p.name}</div>
                <div className="sa-plan-price">
                  {p.price === 0 ? "Gratis" : `$${p.price.toLocaleString()}`}
                  <span>{p.price === 0 ? ` · ${p.trialDays} días` : " / mes"}</span>
                </div>
                <div style={{ fontSize: ".75rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                  Máx {p.maxUsers} usuarios
                </div>
              </div>
              <span style={{ fontSize: ".72rem", padding: "3px 8px", borderRadius: "20px", background: "var(--bg-elevated)", color: "var(--text-secondary)", fontWeight: 600 }}>
                {counts[p.id] ?? 0} clientes
              </span>
            </div>
            {p.features.map((f, i) => (
              <div key={i} className={`sa-plan-feature${f.included ? " included" : ""}`}>
                <div className={`sa-plan-feature-dot${f.included ? "" : " off"}`} />
                {f.text}
              </div>
            ))}
            <button className="sa-btn full" style={{ marginTop: "14px", borderColor: p.color, color: p.color }}
              onClick={() => openEditor(p)}>
              ✏️ Editar plan
            </button>
          </div>
        ))}
      </div>

      {/* Assign table */}
      <div className="sa-card">
        <div className="sa-card-header"><span className="sa-card-title">Asignar plan a restaurante</span></div>
        <div className="sa-card-body">
          <table className="sa-table">
            <thead><tr><th>Restaurante</th><th>Plan actual</th><th>Precio/mes</th><th>Usuarios</th><th>Cambiar a</th></tr></thead>
            <tbody>
              {restaurants.map((r) => {
                const cfg = planConfigs.find((p) => p.id === r.plan)!;
                return (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.name}</td>
                    <td><Badge type={PLAN_COLORS[r.plan]}>{cfg.name}</Badge></td>
                    <td style={{ color: "var(--accent)", fontWeight: 700 }}>{cfg.price === 0 ? "Gratis" : `$${cfg.price.toLocaleString()}`}</td>
                    <td><span style={{ fontWeight: 600 }}>{r.users}</span><span style={{ color: "var(--text-muted)" }}>/{r.maxUsers}</span></td>
                    <td>
                      <div style={{ display: "flex", gap: "6px" }}>
                        {planConfigs.filter((p) => p.id !== r.plan).map((p) => (
                          <button key={p.id} className="sa-btn sm" onClick={() => setAssign({ plan: p.id, r })}>
                            → {p.name}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Assign confirmation modal */}
      {assign && (
        <Modal title="Confirmar cambio de plan" onClose={() => setAssign(null)}>
          <p style={{ fontSize: ".9rem", color: "#eef2f7", marginBottom: "20px", lineHeight: 1.6 }}>
            ¿Cambiar <strong style={{ color: "var(--accent)" }}>{assign.r.name}</strong> al plan{" "}
            <strong style={{ color: "var(--accent)" }}>{planConfigs.find((p) => p.id === assign.plan)?.name}</strong>?
            {assign.plan !== "trial" && (
              <span style={{ display: "block", fontSize: ".82rem", color: "var(--text-secondary)", marginTop: "6px" }}>
                Nuevo precio: ${planConfigs.find((p) => p.id === assign.plan)?.price.toLocaleString()}/mes
              </span>
            )}
          </p>
          <div style={{ display: "flex", gap: "8px" }}>
            <button className="sa-btn primary" style={{ flex: 1 }} onClick={applyAssign}>Confirmar</button>
            <button className="sa-btn" style={{ flex: 1 }} onClick={() => setAssign(null)}>Cancelar</button>
          </div>
        </Modal>
      )}

      {/* Full plan editor modal */}
      {editing && draft && (
        <Modal title={`Editando plan: ${editing.name}`} onClose={() => { setEditing(null); setDraft(null); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {/* Name + color row */}
            <div style={{ display: "flex", gap: "10px" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: ".75rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "5px" }}>Nombre del plan</div>
                <input style={inpStyle()} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>
              <div>
                <div style={{ fontSize: ".75rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "5px" }}>Color</div>
                <input type="color" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                  style={{ width: "48px", height: "38px", borderRadius: "8px", border: "1px solid rgba(255,255,255,.12)", background: "transparent", cursor: "pointer", padding: "2px" }} />
              </div>
            </div>

            {/* Price + maxUsers + trialDays */}
            <div style={{ display: "flex", gap: "10px" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: ".75rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "5px" }}>Precio / mes ($)</div>
                <input style={inpStyle()} type="number" min={0} value={draft.price}
                  onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: ".75rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "5px" }}>Máx usuarios</div>
                <input style={inpStyle()} type="number" min={1} max={999} value={draft.maxUsers}
                  onChange={(e) => setDraft({ ...draft, maxUsers: Number(e.target.value) })} />
              </div>
              {draft.id === "trial" && (
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: ".75rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "5px" }}>Días de prueba</div>
                  <input style={inpStyle()} type="number" min={1} value={draft.trialDays}
                    onChange={(e) => setDraft({ ...draft, trialDays: Number(e.target.value) })} />
                </div>
              )}
            </div>

            {/* Features list */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <div style={{ fontSize: ".75rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>Características</div>
                <button className="sa-btn sm" onClick={addFeature}>+ Agregar</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "220px", overflowY: "auto" }}>
                {draft.features.map((f, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <input type="checkbox" checked={f.included} onChange={() => toggleFeatureIncluded(i)}
                      style={{ accentColor: "#00e676", width: "16px", height: "16px", flexShrink: 0 }} />
                    <input style={inpStyle({ flex: 1, padding: "6px 10px", marginBottom: 0 })} value={f.text}
                      onChange={(e) => updateFeatureText(i, e.target.value)} />
                    <button onClick={() => removeFeature(i)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: "1rem", flexShrink: 0 }}>✕</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Preview */}
            <div style={{ padding: "12px", background: "var(--bg-elevated)", borderRadius: "10px", border: `1px solid ${draft.color}40` }}>
              <div style={{ fontSize: ".72rem", color: "var(--text-secondary)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: ".06em" }}>Vista previa</div>
              <div style={{ fontWeight: 800, color: draft.color }}>{draft.name}</div>
              <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#fff", marginTop: "2px" }}>
                {draft.price === 0 ? `Gratis · ${draft.trialDays} días` : `$${draft.price.toLocaleString()}/mes`}
                <span style={{ fontSize: ".8rem", fontWeight: 400, color: "var(--text-secondary)", marginLeft: "8px" }}>· {draft.maxUsers} usuarios máx</span>
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <button className="sa-btn primary" style={{ flex: 1 }} onClick={saveEdit}>💾 Guardar cambios</button>
              <button className="sa-btn" style={{ flex: 1 }} onClick={() => { setEditing(null); setDraft(null); }}>Cancelar</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Discounts ────────────────────────────────────────────────────────────────

function Discounts({ addAudit, showToast }: {
  addAudit: (action: string, details: string, type: AuditType, restaurant?: string) => void;
  showToast: (msg: string, type?: Toast["type"]) => void;
}) {
  const [codes, setCodes] = useState<DiscountCode[]>(SEED_DISCOUNTS);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ code: "", discount: 20, type: "%" as "%" | "$", maxUses: 50, expiresAt: "", note: "" });

  const generate = () => {
    const random = "NICHO" + Math.random().toString(36).toUpperCase().slice(2, 7);
    setForm((p) => ({ ...p, code: random }));
  };

  const create = () => {
    if (!form.code || !form.expiresAt) { showToast("Completa código y fecha", "error"); return; }
    const nc: DiscountCode = { id: `d${Date.now()}`, ...form, uses: 0, active: true };
    setCodes((p) => [nc, ...p]);
    addAudit("Código de descuento creado", `${form.code} · ${form.discount}${form.type} · exp. ${form.expiresAt}`, "create");
    showToast(`Código ${form.code} creado`);
    setForm({ code: "", discount: 20, type: "%", maxUses: 50, expiresAt: "", note: "" });
    setShowForm(false);
  };

  const toggleActive = (id: string) => {
    setCodes((p) => p.map((c) => c.id === id ? { ...c, active: !c.active } : c));
    const c = codes.find((x) => x.id === id)!;
    showToast(`Código ${c.code} ${c.active ? "desactivado" : "activado"}`);
  };

  const copy = (code: string) => {
    navigator.clipboard.writeText(code).then(() => showToast(`Código "${code}" copiado`, "info"));
  };

  const inpStyle: React.CSSProperties = { background: "#141833", border: "1px solid rgba(255,255,255,.12)", borderRadius: "8px", padding: "8px 12px", color: "#eef2f7", fontSize: ".86rem", outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box" };

  return (
    <div>
      <div className="sa-section-header">
        <div><div className="sa-section-title">🎟️ Códigos de descuento</div><div className="sa-section-sub">Genera y gestiona cupones para tus restaurantes</div></div>
        <button className="sa-btn primary" onClick={() => setShowForm(true)}>+ Nuevo código</button>
      </div>

      <div className="sa-kpi-strip" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <div className="sa-kpi-card">
          <div className="sa-kpi-top"><span className="sa-kpi-label">Códigos activos</span><div className="sa-kpi-icon" style={{ background: "rgba(0,230,118,.1)", color: "var(--accent)" }}>✅</div></div>
          <div className="sa-kpi-value">{codes.filter((c) => c.active).length}</div>
        </div>
        <div className="sa-kpi-card">
          <div className="sa-kpi-top"><span className="sa-kpi-label">Usos totales</span><div className="sa-kpi-icon" style={{ background: "rgba(99,102,241,.12)", color: "#818cf8" }}>📊</div></div>
          <div className="sa-kpi-value">{codes.reduce((s, c) => s + c.uses, 0)}</div>
        </div>
        <div className="sa-kpi-card">
          <div className="sa-kpi-top"><span className="sa-kpi-label">Tasa de uso</span><div className="sa-kpi-icon" style={{ background: "rgba(251,191,36,.12)", color: "#fbbf24" }}>🎯</div></div>
          <div className="sa-kpi-value">
            {codes.reduce((s, c) => s + c.maxUses, 0) > 0
              ? Math.round((codes.reduce((s, c) => s + c.uses, 0) / codes.reduce((s, c) => s + c.maxUses, 0)) * 100)
              : 0}%
          </div>
        </div>
      </div>

      <div className="sa-card">
        <table className="sa-table">
          <thead><tr><th>Código</th><th>Descuento</th><th>Usos</th><th>Vence</th><th>Nota</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            {codes.map((c) => (
              <tr key={c.id}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#eef2f7", fontSize: ".9rem" }}>{c.code}</span>
                    <button onClick={() => copy(c.code)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: ".8rem" }}>📋</button>
                  </div>
                </td>
                <td style={{ fontWeight: 700, color: "var(--accent)", fontSize: ".95rem" }}>{c.discount}{c.type}</td>
                <td>
                  <span style={{ fontWeight: 600 }}>{c.uses}</span>
                  <span style={{ color: "var(--text-muted)" }}>/{c.maxUses}</span>
                  <div style={{ marginTop: "4px", height: "4px", background: "rgba(255,255,255,.06)", borderRadius: "2px", width: "60px", overflow: "hidden" }}>
                    <div style={{ height: "100%", background: "var(--accent)", borderRadius: "2px", width: `${Math.min(100, (c.uses / c.maxUses) * 100)}%` }} />
                  </div>
                </td>
                <td style={{ color: "var(--text-secondary)" }}>{c.expiresAt}</td>
                <td style={{ color: "var(--text-secondary)", fontSize: ".82rem" }}>{c.note || "—"}</td>
                <td><Badge type={c.active ? "active" : "muted"}>{c.active ? "Activo" : "Inactivo"}</Badge></td>
                <td>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button className={`sa-btn sm${c.active ? " danger" : ""}`} onClick={() => toggleActive(c.id)}>
                      {c.active ? "Desactivar" : "Activar"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <Modal title="Nuevo código de descuento" onClose={() => setShowForm(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", gap: "8px" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: ".75rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "5px" }}>Código</div>
                <input style={inpStyle} value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))} placeholder="NICHO30" />
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: "0px" }}>
                <button className="sa-btn sm" style={{ height: "36px" }} onClick={generate}>🎲 Auto</button>
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: ".75rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "5px" }}>Descuento</div>
                <input style={inpStyle} type="number" min={1} value={form.discount} onChange={(e) => setForm((p) => ({ ...p, discount: Number(e.target.value) }))} />
              </div>
              <div>
                <div style={{ fontSize: ".75rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "5px" }}>Tipo</div>
                <select style={{ ...inpStyle, width: "70px" }} value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as "%" | "$" }))}>
                  <option value="%">%</option>
                  <option value="$">$</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: ".75rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "5px" }}>Máx usos</div>
                <input style={inpStyle} type="number" min={1} value={form.maxUses} onChange={(e) => setForm((p) => ({ ...p, maxUses: Number(e.target.value) }))} />
              </div>
            </div>

            <div>
              <div style={{ fontSize: ".75rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "5px" }}>Fecha de expiración</div>
              <input style={inpStyle} type="date" value={form.expiresAt} onChange={(e) => setForm((p) => ({ ...p, expiresAt: e.target.value }))} />
            </div>

            <div>
              <div style={{ fontSize: ".75rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "5px" }}>Nota interna</div>
              <input style={inpStyle} placeholder="Ej. Campaña de mayo" value={form.note} onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))} />
            </div>

            <div style={{ padding: "12px", background: "var(--bg-elevated)", borderRadius: "10px", fontSize: ".86rem", color: "var(--text-secondary)" }}>
              Vista previa: <strong style={{ color: "var(--accent)", fontFamily: "monospace" }}>{form.code || "CÓDIGO"}</strong> → {form.discount}{form.type} de descuento · máx {form.maxUses} usos
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <button className="sa-btn primary" style={{ flex: 1 }} onClick={create}>✅ Crear código</button>
              <button className="sa-btn" style={{ flex: 1 }} onClick={() => setShowForm(false)}>Cancelar</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Activity ─────────────────────────────────────────────────────────────────

function Activity({ restaurants }: { restaurants: Restaurant[] }) {
  const sorted = [...restaurants].sort((a, b) => b.loginCount - a.loginCount);
  const avgLogins = Math.round(restaurants.reduce((s, r) => s + r.loginCount, 0) / restaurants.length);

  const health = (r: Restaurant) => {
    if (r.status === "suspended") return { label: "Suspendido", color: "#ef4444", score: 0 };
    if (r.status === "maintenance") return { label: "Mantenimiento", color: "#fbbf24", score: 30 };
    if (r.loginCount === 0) return { label: "Sin actividad", color: "#64748b", score: 10 };
    if (r.loginCount > 200) return { label: "Muy activo", color: "#00e676", score: 100 };
    if (r.loginCount > 50)  return { label: "Activo", color: "#22d3ee", score: 70 };
    return { label: "Poco activo", color: "#fbbf24", score: 40 };
  };

  return (
    <div>
      <div className="sa-section-header">
        <div><div className="sa-section-title">📈 Actividad</div><div className="sa-section-sub">Saldo y uso de cada restaurante en la plataforma</div></div>
      </div>

      <div className="sa-kpi-strip">
        <div className="sa-kpi-card">
          <div className="sa-kpi-top"><span className="sa-kpi-label">Muy activos</span><div className="sa-kpi-icon" style={{ background: "rgba(0,230,118,.1)", color: "var(--accent)" }}>🟢</div></div>
          <div className="sa-kpi-value">{restaurants.filter((r) => r.loginCount > 200).length}</div>
          <div className="sa-kpi-delta">+200 logins/mes</div>
        </div>
        <div className="sa-kpi-card">
          <div className="sa-kpi-top"><span className="sa-kpi-label">Poco activos</span><div className="sa-kpi-icon" style={{ background: "rgba(251,191,36,.12)", color: "#fbbf24" }}>🟡</div></div>
          <div className="sa-kpi-value">{restaurants.filter((r) => r.loginCount > 0 && r.loginCount <= 50 && r.status === "active").length}</div>
          <div className="sa-kpi-delta">riesgo de churn</div>
        </div>
        <div className="sa-kpi-card">
          <div className="sa-kpi-top"><span className="sa-kpi-label">Sin actividad</span><div className="sa-kpi-icon" style={{ background: "rgba(239,68,68,.12)", color: "#ef4444" }}>🔴</div></div>
          <div className="sa-kpi-value">{restaurants.filter((r) => r.loginCount === 0).length}</div>
          <div className="sa-kpi-delta">nunca iniciaron</div>
        </div>
        <div className="sa-kpi-card">
          <div className="sa-kpi-top"><span className="sa-kpi-label">Promedio logins</span><div className="sa-kpi-icon" style={{ background: "rgba(99,102,241,.12)", color: "#818cf8" }}>📊</div></div>
          <div className="sa-kpi-value">{avgLogins}</div>
          <div className="sa-kpi-delta">por restaurante</div>
        </div>
      </div>

      <div className="sa-card">
        <div className="sa-card-header"><span className="sa-card-title">Saldo por restaurante</span></div>
        <table className="sa-table">
          <thead><tr><th>Restaurante</th><th>Último acceso</th><th>Logins totales</th><th>Saldo</th><th>Actividad</th><th>Plan</th></tr></thead>
          <tbody>
            {sorted.map((r) => {
              const h = health(r);
              return (
                <tr key={r.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.name}</div>
                    <div style={{ fontSize: ".75rem", color: "var(--text-secondary)" }}>{r.email}</div>
                  </td>
                  <td style={{ color: "var(--text-secondary)" }}>{r.lastActive}</td>
                  <td style={{ fontWeight: 700 }}>{r.loginCount}</td>
                  <td style={{ fontWeight: 700, color: r.balance > 0 ? "#ef4444" : "var(--accent)" }}>
                    {r.balance > 0 ? `$${r.balance.toLocaleString()} pendiente` : "Al corriente"}
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{ width: "80px", height: "6px", background: "rgba(255,255,255,.06)", borderRadius: "3px", overflow: "hidden" }}>
                        <div style={{ height: "100%", background: h.color, borderRadius: "3px", width: `${h.score}%`, transition: "width .4s" }} />
                      </div>
                      <span style={{ fontSize: ".78rem", color: h.color, fontWeight: 600 }}>{h.label}</span>
                    </div>
                  </td>
                  <td><Badge type={PLAN_COLORS[r.plan]}>{PLAN_LABELS[r.plan]}</Badge></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="sa-card">
        <div className="sa-card-header"><span className="sa-card-title">Notas internas por restaurante</span></div>
        <div className="sa-card-body">
          {restaurants.filter((r) => r.notes).map((r) => (
            <div key={r.id} style={{ display: "flex", gap: "12px", padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
              <div style={{ width: 32, height: 32, borderRadius: "8px", background: "var(--bg-elevated)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>📌</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: ".88rem" }}>{r.name}</div>
                <div style={{ fontSize: ".82rem", color: "var(--text-secondary)", marginTop: "2px" }}>{r.notes}</div>
              </div>
            </div>
          ))}
          {restaurants.every((r) => !r.notes) && (
            <p style={{ color: "var(--text-muted)", fontSize: ".86rem", textAlign: "center", padding: "20px 0" }}>Sin notas internas</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Maintenance ──────────────────────────────────────────────────────────────

function Maintenance({ restaurants, setRestaurants, addAudit, showToast }: {
  restaurants: Restaurant[];
  setRestaurants: React.Dispatch<React.SetStateAction<Restaurant[]>>;
  addAudit: (action: string, details: string, type: AuditType, restaurant?: string) => void;
  showToast: (msg: string, type?: Toast["type"]) => void;
}) {
  const [reasons, setReasons] = useState<Record<string, string>>(
    Object.fromEntries(restaurants.map((r) => [r.id, r.status === "maintenance" ? "Migración de base de datos" : ""]))
  );

  const toggle = (r: Restaurant) => {
    const next: Status = r.status === "maintenance" ? "active" : "maintenance";
    setRestaurants((p) => p.map((x) => x.id === r.id ? { ...x, status: next } : x));
    addAudit(`Modo mantenimiento ${next === "maintenance" ? "activado" : "desactivado"}`, `${r.name}${reasons[r.id] ? ` — ${reasons[r.id]}` : ""}`, "update", r.name);
    showToast(`${r.name}: mantenimiento ${next === "maintenance" ? "activado" : "desactivado"}`);
  };

  return (
    <div>
      <div className="sa-section-header">
        <div><div className="sa-section-title">🔧 Modo mantenimiento</div><div className="sa-section-sub">Bloquea el acceso a un restaurante sin afectar los demás</div></div>
        <Badge type="warning">{restaurants.filter((r) => r.status === "maintenance").length} en mantenimiento</Badge>
      </div>
      <div className="sa-card">
        <div className="sa-card-body" style={{ paddingTop: "12px" }}>
          {restaurants.map((r) => (
            <div key={r.id} className="sa-maint-row">
              <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1 }}>
                <div style={{ width: 36, height: 36, borderRadius: "10px", background: "var(--bg-elevated)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>🍽️</div>
                <div style={{ flex: "0 0 160px" }}>
                  <div style={{ fontWeight: 600, fontSize: ".9rem" }}>{r.name}</div>
                  <div style={{ fontSize: ".75rem", color: "var(--text-secondary)" }}>{PLAN_LABELS[r.plan]} · {r.users} usuarios</div>
                </div>
                <input
                  placeholder="Razón del mantenimiento (opcional)"
                  value={reasons[r.id] ?? ""}
                  onChange={(e) => setReasons((p) => ({ ...p, [r.id]: e.target.value }))}
                  disabled={r.status !== "maintenance"}
                  style={{ flex: 1, background: "var(--bg-input)", border: "1px solid var(--border-light)", borderRadius: "8px", padding: "7px 12px", color: "var(--text-primary)", fontSize: ".84rem", outline: "none", fontFamily: "inherit", opacity: r.status === "maintenance" ? 1 : 0.4 }}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
                {r.status === "maintenance" && <Badge type="warning">En mantenimiento</Badge>}
                <Toggle checked={r.status === "maintenance"} onChange={() => toggle(r)} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Notifications ────────────────────────────────────────────────────────────

function Notifications({ showToast }: { showToast: (msg: string, type?: Toast["type"]) => void }) {
  const [days, setDays] = useState(5);
  const [ch, setCh] = useState({ email: true, whatsapp: true, push: false });
  const [triggers, setTriggers] = useState({ debt: true, expiry: true, userLimit: true, maintenance: false, newRestaurant: true });

  const save = () => {
    showToast("Configuración de notificaciones guardada");
  };

  const sendTest = () => {
    showToast("Notificación de prueba enviada", "info");
  };

  const rowStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: "1px solid var(--border)" };

  return (
    <div>
      <div className="sa-section-header">
        <div><div className="sa-section-title">🔔 Notificaciones</div><div className="sa-section-sub">Alertas automáticas a restaurantes y al super admin</div></div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button className="sa-btn" onClick={sendTest}>📤 Prueba</button>
          <button className="sa-btn primary" onClick={save}>💾 Guardar</button>
        </div>
      </div>

      <div className="sa-grid-2">
        <div className="sa-card">
          <div className="sa-card-header"><span className="sa-card-title">Canales de envío</span></div>
          <div className="sa-card-body">
            {([["email", "📧 Email", "Via SendGrid / SMTP"], ["whatsapp", "💬 WhatsApp", "Via WhatsApp Business API"], ["push", "📲 Push notification", "Via Firebase / OneSignal"]] as const).map(([k, label, sub]) => (
              <div key={k} style={rowStyle}>
                <div><div style={{ fontWeight: 600, fontSize: ".9rem" }}>{label}</div><div style={{ fontSize: ".75rem", color: "var(--text-secondary)" }}>{sub}</div></div>
                <Toggle checked={ch[k]} onChange={(v) => setCh((p) => ({ ...p, [k]: v }))} />
              </div>
            ))}
          </div>
        </div>

        <div className="sa-card">
          <div className="sa-card-header"><span className="sa-card-title">Días de anticipación al cobro</span></div>
          <div className="sa-card-body">
            <p style={{ fontSize: ".86rem", color: "var(--text-secondary)", marginBottom: "16px" }}>Enviar recordatorio con cuántos días de anticipación al vencimiento:</p>
            <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "10px" }}>
              <input type="range" min={1} max={14} value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ flex: 1, accentColor: "#00e676" }} />
              <span style={{ fontWeight: 800, fontSize: "1.5rem", color: "var(--accent)", minWidth: "44px" }}>{days}d</span>
            </div>
            <p style={{ fontSize: ".75rem", color: "var(--text-muted)" }}>Se enviará {days} día{days !== 1 ? "s" : ""} antes del vencimiento</p>
          </div>
        </div>
      </div>

      <div className="sa-card">
        <div className="sa-card-header"><span className="sa-card-title">Disparadores automáticos</span></div>
        <div className="sa-card-body">
          {[
            { k: "debt",          label: "Saldo pendiente en dashboard",    desc: "Banner/toast al entrar si el restaurante tiene deuda" },
            { k: "expiry",        label: "Recordatorio de vencimiento",      desc: `Alerta automática ${days} días antes del corte` },
            { k: "userLimit",     label: "Límite de usuarios alcanzado",     desc: "Alertar cuando el restaurante llega al 90% de su cuota" },
            { k: "maintenance",   label: "Cambio en modo mantenimiento",     desc: "Notificar al admin cuando se activa o desactiva" },
            { k: "newRestaurant", label: "Nuevo restaurante registrado",     desc: "Notificar al superadmin cuando alguien se registra" },
          ].map(({ k, label, desc }) => (
            <div key={k} style={rowStyle}>
              <div><div style={{ fontWeight: 600, fontSize: ".88rem" }}>{label}</div><div style={{ fontSize: ".75rem", color: "var(--text-secondary)", marginTop: "2px" }}>{desc}</div></div>
              <Toggle checked={triggers[k as keyof typeof triggers]} onChange={(v) => setTriggers((p) => ({ ...p, [k]: v }))} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Permisos por rol ─────────────────────────────────────────────────────────

function Permisos({ restaurants, addAudit, showToast }: {
  restaurants: Restaurant[];
  addAudit: (action: string, details: string, type: AuditType, restaurant?: string) => void;
  showToast: (msg: string, type?: Toast["type"]) => void;
}) {
  const [tab, setTab]   = useState<"employee" | "user">("employee");
  const [sel, setSel]   = useState<string>("all");
  const modules = tab === "employee" ? EMPLOYEE_MODULES : USER_MODULES;

  const key = (mid: string) => `${sel}_${mid}`;
  const [flags, setFlags] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    [...EMPLOYEE_MODULES, ...USER_MODULES].forEach((m) => {
      init[`all_${m.id}`] = !m.locked;
      SEED_RESTAURANTS.forEach((r) => { init[`${r.id}_${m.id}`] = !m.locked; });
    });
    return init;
  });

  const toggle = (m: typeof modules[0]) => {
    if (m.locked && !(flags[key(m.id)])) {
      showToast("Esta función requiere autorización del Super Admin", "error");
      return;
    }
    const next = !flags[key(m.id)];
    const newFlags = { ...flags, [key(m.id)]: next };
    setFlags(newFlags);

    if (sel === "all") {
      const settingsKey = tab === "employee" ? "employee_permissions" : "user_permissions";
      const currentMods = tab === "employee" ? EMPLOYEE_MODULES : USER_MODULES;
      const perms: Record<string, boolean> = {};
      currentMods.forEach((mod) => { perms[mod.id] = newFlags[`all_${mod.id}`] ?? !mod.locked; });
      fetch("/api/save-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settingsKey, flags: perms }),
      }).then(async r => {
        if (!r.ok) { const b = await r.json().catch(() => ({})); showToast(`Error: ${b.error ?? "desconocido"}`, "error"); }
        else { showToast(`${m.name} ${next ? "activado" : "desactivado"} ✓`, "success"); }
      }).catch(() => showToast("Error de conexión", "error"));
    }

    const rolLabel = tab === "employee" ? "Empleado" : "Usuario";
    const ctx = sel === "all" ? "Global" : restaurants.find((r) => r.id === sel)?.name ?? sel;
    addAudit(`Permiso ${next ? "activado" : "desactivado"} — ${rolLabel}`, `${m.name} → ${ctx}`, "update", ctx === "Global" ? "—" : ctx);
  };

  const selName = sel === "all" ? "Todos los restaurantes" : restaurants.find((r) => r.id === sel)?.name ?? sel;

  return (
    <div>
      <div className="sa-section-header">
        <div>
          <div className="sa-section-title">🔐 Permisos por rol</div>
          <div className="sa-section-sub">Controla qué puede hacer cada empleado y cada cliente</div>
        </div>
      </div>

      {/* Role tabs */}
      <div className="sa-tabs" style={{ marginBottom: "16px" }}>
        <button className={`sa-tab${tab === "employee" ? " active" : ""}`} onClick={() => setTab("employee")}>👷 Empleado</button>
        <button className={`sa-tab${tab === "user" ? " active" : ""}`} onClick={() => setTab("user")}>📱 Usuario / Cliente</button>
      </div>

      {/* Restaurant selector */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
        <button className={`sa-chip${sel === "all" ? " active" : ""}`} onClick={() => setSel("all")}>🌐 Global</button>
        {restaurants.map((r) => (
          <button key={r.id} className={`sa-chip${sel === r.id ? " active" : ""}`} onClick={() => setSel(r.id)}>{r.name}</button>
        ))}
      </div>

      <div className="sa-card">
        <div className="sa-card-header">
          <span className="sa-card-title">
            {tab === "employee" ? "👷 Módulos del Empleado" : "📱 Módulos del Usuario/Cliente"}
            {" — "}{selName}
          </span>
          <span style={{ fontSize: ".78rem", color: "var(--text-secondary)" }}>
            🔒 = requiere aprobación del Super Admin para activar
          </span>
        </div>
        <table className="sa-table">
          <thead>
            <tr><th>Módulo</th><th>Descripción</th><th>Acceso</th><th>Nivel</th></tr>
          </thead>
          <tbody>
            {modules.map((m) => {
              const on = flags[key(m.id)] ?? !m.locked;
              return (
                <tr key={m.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontWeight: 600 }}>{m.name}</span>
                      {m.locked && <span title="Requiere aprobación del Super Admin" style={{ fontSize: ".8rem" }}>🔒</span>}
                    </div>
                  </td>
                  <td style={{ color: "var(--text-secondary)", fontSize: ".82rem" }}>{m.desc}</td>
                  <td>
                    <Toggle
                      checked={on}
                      onChange={() => toggle(m)}
                    />
                  </td>
                  <td>
                    {m.locked
                      ? <Badge type="warning">Solo Super Admin</Badge>
                      : <Badge type="active">Admin puede cambiar</Badge>
                    }
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Info box */}
      <div style={{ marginTop: "16px", padding: "16px", background: "rgba(59,130,246,.08)", border: "1px solid rgba(59,130,246,.2)", borderRadius: "12px" }}>
        <div style={{ fontWeight: 700, color: "#60a5fa", marginBottom: "8px" }}>ℹ️ Cómo funciona la jerarquía de permisos</div>
        <div style={{ fontSize: ".84rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>
          <div>• El <strong style={{ color: "#eef2f7" }}>Super Admin</strong> (tú) controla qué módulos existen en la plataforma.</div>
          <div>• El <strong style={{ color: "#eef2f7" }}>Admin del restaurante</strong> solo puede activar lo que el Super Admin dejó habilitado.</div>
          <div>• Los módulos con 🔒 requieren que <strong style={{ color: "#eef2f7" }}>el Super Admin los apruebe</strong> antes de que el admin pueda usarlos.</div>
          <div>• El <strong style={{ color: "#eef2f7" }}>Empleado y Usuario</strong> solo ven lo que ambos niveles superiores autorizaron.</div>
        </div>
      </div>
    </div>
  );
}

// ─── Solicitudes de acceso ────────────────────────────────────────────────────

function Solicitudes({ addAudit, showToast }: {
  addAudit: (action: string, details: string, type: AuditType, restaurant?: string) => void;
  showToast: (msg: string, type?: Toast["type"]) => void;
}) {
  const [requests, setRequests] = useState<AccessRequest[]>(SEED_REQUESTS);
  const [rejectModal, setRejectModal] = useState<AccessRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [tab, setTab] = useState<"pending" | "approved" | "rejected">("pending");

  const approve = (r: AccessRequest) => {
    setRequests((p) => p.map((x) => x.id === r.id ? { ...x, status: "approved" } : x));
    addAudit("Solicitud aprobada", `${r.feature} — ${r.restaurantName}`, "update", r.restaurantName);
    showToast(`✅ Aprobado: ${r.feature} para ${r.restaurantName}`);
  };

  const reject = () => {
    if (!rejectModal) return;
    setRequests((p) => p.map((x) => x.id === rejectModal.id ? { ...x, status: "rejected", rejectReason } : x));
    addAudit("Solicitud rechazada", `${rejectModal.feature} — ${rejectModal.restaurantName}: ${rejectReason}`, "update", rejectModal.restaurantName);
    showToast(`Solicitud rechazada`, "error");
    setRejectModal(null); setRejectReason("");
  };

  const filtered = requests.filter((r) => r.status === tab);
  const pending  = requests.filter((r) => r.status === "pending").length;

  return (
    <div>
      <div className="sa-section-header">
        <div>
          <div className="sa-section-title">📬 Solicitudes de acceso</div>
          <div className="sa-section-sub">Aprueba o rechaza peticiones de los admins para desbloquear funciones</div>
        </div>
        {pending > 0 && <Badge type="warning">{pending} pendiente{pending > 1 ? "s" : ""}</Badge>}
      </div>

      <div className="sa-tabs">
        <button className={`sa-tab${tab === "pending" ? " active" : ""}`} onClick={() => setTab("pending")}>
          ⏳ Pendientes {pending > 0 && `(${pending})`}
        </button>
        <button className={`sa-tab${tab === "approved" ? " active" : ""}`} onClick={() => setTab("approved")}>✅ Aprobadas</button>
        <button className={`sa-tab${tab === "rejected" ? " active" : ""}`} onClick={() => setTab("rejected")}>❌ Rechazadas</button>
      </div>

      {filtered.length === 0 ? (
        <div className="sa-card" style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
          Sin solicitudes {tab === "pending" ? "pendientes" : tab === "approved" ? "aprobadas" : "rechazadas"}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {filtered.map((r) => (
            <div key={r.id} className="sa-card" style={{ padding: "20px", border: `1px solid ${tab === "pending" ? "rgba(251,191,36,.25)" : tab === "approved" ? "rgba(0,230,118,.2)" : "rgba(239,68,68,.2)"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                    <span style={{ fontWeight: 700, fontSize: ".95rem", color: "#eef2f7" }}>{r.restaurantName}</span>
                    <Badge type={tab === "pending" ? "warning" : tab === "approved" ? "active" : "danger"}>
                      {tab === "pending" ? "Pendiente" : tab === "approved" ? "Aprobada" : "Rechazada"}
                    </Badge>
                  </div>
                  <div style={{ fontSize: ".86rem", marginBottom: "6px" }}>
                    Solicita activar: <strong style={{ color: "var(--accent)" }}>🔓 {r.feature}</strong>
                  </div>
                  <div style={{ fontSize: ".82rem", color: "var(--text-secondary)", marginBottom: "4px" }}>
                    Razón: <em>"{r.reason}"</em>
                  </div>
                  <div style={{ fontSize: ".75rem", color: "var(--text-muted)" }}>
                    {r.requestedBy} · {r.ts}
                  </div>
                  {r.rejectReason && (
                    <div style={{ marginTop: "8px", padding: "8px 12px", background: "rgba(239,68,68,.08)", borderRadius: "8px", fontSize: ".82rem", color: "#f87171" }}>
                      Motivo de rechazo: {r.rejectReason}
                    </div>
                  )}
                </div>
                {tab === "pending" && (
                  <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                    <button className="sa-btn primary" style={{ background: "var(--accent)", borderColor: "var(--accent)", color: "#000" }} onClick={() => approve(r)}>
                      ✅ Aprobar
                    </button>
                    <button className="sa-btn danger" onClick={() => { setRejectModal(r); setRejectReason(""); }}>
                      ❌ Rechazar
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {rejectModal && (
        <Modal title={`Rechazar: ${rejectModal.feature}`} onClose={() => setRejectModal(null)}>
          <p style={{ fontSize: ".86rem", color: "var(--text-secondary)", marginBottom: "14px" }}>
            Escribe el motivo del rechazo. Se le enviará al admin de <strong style={{ color: "#fff" }}>{rejectModal.restaurantName}</strong>.
          </p>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Ej. Esta función no está incluida en su plan actual..."
            rows={3}
            style={{ width: "100%", background: "#141833", border: "1px solid rgba(255,255,255,.12)", borderRadius: "8px", padding: "10px 12px", color: "#eef2f7", fontSize: ".86rem", outline: "none", fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", marginBottom: "14px" }}
          />
          <div style={{ display: "flex", gap: "8px" }}>
            <button className="sa-btn danger" style={{ flex: 1 }} onClick={reject} disabled={!rejectReason.trim()}>
              Confirmar rechazo
            </button>
            <button className="sa-btn" style={{ flex: 1 }} onClick={() => setRejectModal(null)}>Cancelar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Seguridad ────────────────────────────────────────────────────────────────

function Seguridad({ restaurants, showToast, addAudit }: {
  restaurants: Restaurant[];
  showToast: (msg: string, type?: Toast["type"]) => void;
  addAudit: (action: string, details: string, type: AuditType, restaurant?: string) => void;
}) {
  const [configs, setConfigs] = useState<SecurityConfig[]>(SEED_SECURITY);
  const [sel, setSel] = useState<string>(restaurants[0]?.id ?? "");

  const cfg = configs.find((c) => c.restaurantId === sel)!;
  const restaurant = restaurants.find((r) => r.id === sel);

  const update = (field: keyof SecurityConfig, value: string | number | boolean) => {
    setConfigs((p) => p.map((c) => c.restaurantId === sel ? { ...c, [field]: value } : c));
  };

  const save = () => {
    addAudit("Configuración de seguridad actualizada", `${restaurant?.name}`, "update", restaurant?.name);
    showToast(`Seguridad de ${restaurant?.name} guardada`);
  };

  const inpStyle: React.CSSProperties = { background: "#141833", border: "1px solid rgba(255,255,255,.12)", borderRadius: "8px", padding: "8px 12px", color: "#eef2f7", fontSize: ".86rem", outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box" };

  const rowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 0", borderBottom: "1px solid var(--border)" };

  return (
    <div>
      <div className="sa-section-header">
        <div>
          <div className="sa-section-title">🛡️ Seguridad</div>
          <div className="sa-section-sub">Protege el acceso de empleados y usuarios por restaurante</div>
        </div>
        <button className="sa-btn primary" onClick={save}>💾 Guardar</button>
      </div>

      {/* Restaurant selector */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "24px", flexWrap: "wrap" }}>
        {restaurants.map((r) => (
          <button key={r.id} className={`sa-chip${sel === r.id ? " active" : ""}`} onClick={() => setSel(r.id)}>{r.name}</button>
        ))}
      </div>

      {cfg && (
        <div className="sa-grid-2">

          {/* Sesión y acceso */}
          <div className="sa-card">
            <div className="sa-card-header"><span className="sa-card-title">⏱️ Sesión y acceso</span></div>
            <div className="sa-card-body">
              <div style={rowStyle}>
                <div>
                  <div style={{ fontWeight: 600 }}>Duración de sesión del empleado</div>
                  <div style={{ fontSize: ".75rem", color: "var(--text-secondary)" }}>Después de este tiempo se cierra sesión automáticamente</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <input type="range" min={1} max={24} value={cfg.sessionHours}
                    onChange={(e) => update("sessionHours", Number(e.target.value))}
                    style={{ width: "100px", accentColor: "#00e676" }} />
                  <span style={{ fontWeight: 700, color: "var(--accent)", minWidth: "40px" }}>{cfg.sessionHours}h</span>
                </div>
              </div>

              <div style={rowStyle}>
                <div>
                  <div style={{ fontWeight: 600 }}>Intentos de login fallidos</div>
                  <div style={{ fontSize: ".75rem", color: "var(--text-secondary)" }}>La cuenta se bloquea después de X intentos</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <input type="number" min={1} max={10} value={cfg.maxFailedLogins}
                    onChange={(e) => update("maxFailedLogins", Number(e.target.value))}
                    style={{ ...inpStyle, width: "70px", textAlign: "center" }} />
                  <span style={{ color: "var(--text-secondary)", fontSize: ".82rem" }}>intentos</span>
                </div>
              </div>

              <div style={{ ...rowStyle, borderBottom: "none" }}>
                <div>
                  <div style={{ fontWeight: 600 }}>Requerir PIN para acciones sensibles</div>
                  <div style={{ fontSize: ".75rem", color: "var(--text-secondary)" }}>Canjear rewards, borrar clientes, exportar datos</div>
                </div>
                <Toggle checked={cfg.pinRequired} onChange={(v) => update("pinRequired", v)} />
              </div>
            </div>
          </div>

          {/* Horario de acceso */}
          <div className="sa-card">
            <div className="sa-card-header"><span className="sa-card-title">🕐 Horario de acceso</span></div>
            <div className="sa-card-body">
              <p style={{ fontSize: ".84rem", color: "var(--text-secondary)", marginBottom: "16px" }}>
                Los empleados solo pueden iniciar sesión dentro de este horario. Fuera de él, el acceso queda bloqueado.
              </p>
              <div style={{ display: "flex", gap: "16px", marginBottom: "16px" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: ".75rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "5px" }}>Desde</div>
                  <input type="time" value={cfg.allowedStart} onChange={(e) => update("allowedStart", e.target.value)} style={inpStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: ".75rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "5px" }}>Hasta</div>
                  <input type="time" value={cfg.allowedEnd} onChange={(e) => update("allowedEnd", e.target.value)} style={inpStyle} />
                </div>
              </div>
              <div style={{ padding: "12px", background: "var(--bg-elevated)", borderRadius: "10px", fontSize: ".84rem", textAlign: "center" }}>
                Acceso permitido: <strong style={{ color: "var(--accent)" }}>{cfg.allowedStart} – {cfg.allowedEnd}</strong>
              </div>

              <div style={{ ...rowStyle, marginTop: "16px", borderBottom: "none" }}>
                <div>
                  <div style={{ fontWeight: 600 }}>Whitelist de IPs</div>
                  <div style={{ fontSize: ".75rem", color: "var(--text-secondary)" }}>Solo se puede acceder desde IPs registradas</div>
                </div>
                <Toggle checked={cfg.ipWhitelist} onChange={(v) => update("ipWhitelist", v)} />
              </div>
            </div>
          </div>

          {/* Resumen visual */}
          <div className="sa-card" style={{ gridColumn: "1 / -1" }}>
            <div className="sa-card-header"><span className="sa-card-title">📋 Resumen de seguridad — {restaurant?.name}</span></div>
            <div className="sa-card-body" style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              {[
                { label: "Sesión empleado",    value: `${cfg.sessionHours} horas`,                     ok: cfg.sessionHours <= 10 },
                { label: "Intentos fallidos",  value: `Bloqueo a los ${cfg.maxFailedLogins}`,           ok: cfg.maxFailedLogins <= 5 },
                { label: "PIN sensible",       value: cfg.pinRequired ? "Activado ✓" : "Desactivado",   ok: cfg.pinRequired },
                { label: "Horario",            value: `${cfg.allowedStart} – ${cfg.allowedEnd}`,         ok: true },
                { label: "Whitelist IP",       value: cfg.ipWhitelist ? "Activada ✓" : "Desactivada",   ok: cfg.ipWhitelist },
              ].map(({ label, value, ok }) => (
                <div key={label} style={{ flex: "1 1 160px", padding: "14px", background: ok ? "rgba(0,230,118,.06)" : "rgba(251,191,36,.06)", border: `1px solid ${ok ? "rgba(0,230,118,.2)" : "rgba(251,191,36,.2)"}`, borderRadius: "10px" }}>
                  <div style={{ fontSize: ".72rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "4px" }}>{label}</div>
                  <div style={{ fontWeight: 700, color: ok ? "var(--accent)" : "#fbbf24", fontSize: ".88rem" }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Nav items ────────────────────────────────────────────────────────────────

const NAV: { view: View; icon: string; label: string; section?: string }[] = [
  { view: "overview",      icon: "📊", label: "Métricas globales", section: "Principal" },
  { view: "activity",      icon: "📈", label: "Actividad" },
  { view: "restaurants",   icon: "🏪", label: "Restaurantes" },
  { view: "flags",         icon: "🚩", label: "Feature Flags",     section: "Permisos y Control" },
  { view: "permisos",      icon: "🔐", label: "Permisos por rol" },
  { view: "solicitudes",   icon: "📬", label: "Solicitudes" },
  { view: "seguridad",     icon: "🛡️", label: "Seguridad" },
  { view: "billing",       icon: "💳", label: "Cuentas y Pagos",   section: "Gestión" },
  { view: "plans",         icon: "💎", label: "Planes" },
  { view: "discounts",     icon: "🎟️", label: "Descuentos" },
  { view: "audit",         icon: "🔍", label: "Auditoría",         section: "Config" },
  { view: "maintenance",   icon: "🔧", label: "Mantenimiento" },
  { view: "notifications", icon: "🔔", label: "Notificaciones" },
];

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [view, setView]       = useState<View>("overview");
  const [restaurants, setRestaurants] = useState<Restaurant[]>(SEED_RESTAURANTS);
  const [auditLog, setAuditLog]             = useState<AuditEntry[]>(SEED_AUDIT);
  const [planConfigs, setPlanConfigs]       = useState<PlanConfig[]>(SEED_PLANS);
  const [toast, setToast]                   = useState<Toast | null>(null);
  const [alertDismissed, setAlertDismissed] = useState(false);

  const showToast = useCallback((msg: string, type: Toast["type"] = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const addAudit = useCallback((action: string, details: string, type: AuditType, restaurant = "—") => {
    const now = new Date();
    const ts = `${now.toISOString().split("T")[0]} ${now.toTimeString().slice(0, 5)}`;
    setAuditLog((prev) => [{ id: `a${Date.now()}`, ts, user: "superadmin", restaurant, action, details, ip: "187.xxx.12", type }, ...prev]);
  }, []);

  const debtRestaurants = restaurants.filter((r) => r.balance > 0);
  const showAlert = !alertDismissed && debtRestaurants.length > 0;

  const renderView = () => {
    const shared = { restaurants, setRestaurants, addAudit, showToast };
    switch (view) {
      case "overview":      return <Overview {...shared} setView={setView} />;
      case "activity":      return <Activity restaurants={restaurants} />;
      case "restaurants":   return <Restaurants {...shared} />;
      case "flags":         return <FeatureFlags restaurants={restaurants} addAudit={addAudit} showToast={showToast} />;
      case "permisos":      return <Permisos restaurants={restaurants} addAudit={addAudit} showToast={showToast} />;
      case "solicitudes":   return <Solicitudes addAudit={addAudit} showToast={showToast} />;
      case "seguridad":     return <Seguridad restaurants={restaurants} addAudit={addAudit} showToast={showToast} />;
      case "billing":       return <Billing {...shared} />;
      case "audit":         return <AuditLog log={auditLog} showToast={showToast} />;
      case "plans":         return <Plans {...shared} planConfigs={planConfigs} setPlanConfigs={setPlanConfigs} />;
      case "discounts":     return <Discounts addAudit={addAudit} showToast={showToast} />;
      case "maintenance":   return <Maintenance {...shared} />;
      case "notifications": return <Notifications showToast={showToast} />;
    }
  };

  return (
    <div className="sa-app">
      {toast && <ToastBanner toast={toast} />}

      <aside className="sa-sidebar">
        <div className="sa-sidebar-header">
          <div className="sa-sidebar-logo">🛡️</div>
          <div>
            <div className="sa-brand-name">NICHO</div>
            <div className="sa-brand-sub">Super Admin</div>
            <div className="sa-badge-super">SUPERADMIN</div>
          </div>
        </div>
        <nav className="sa-nav">
          {NAV.map((item) => (
            <div key={item.view}>
              {item.section && <div className="sa-nav-section">{item.section}</div>}
              <button className={`sa-nav-item${view === item.view ? " active" : ""}`} onClick={() => setView(item.view)}>
                <span className="sa-nav-icon">{item.icon}</span>
                {item.label}
                {item.view === "billing" && debtRestaurants.length > 0 && (
                  <span className="sa-nav-badge">{debtRestaurants.length}</span>
                )}
                {item.view === "solicitudes" && SEED_REQUESTS.filter((r) => r.status === "pending").length > 0 && (
                  <span className="sa-nav-badge">{SEED_REQUESTS.filter((r) => r.status === "pending").length}</span>
                )}
              </button>
            </div>
          ))}
        </nav>
        <div className="sa-sidebar-footer">
          <div className="sa-user-row">
            <div className="sa-avatar">SA</div>
            <div><div className="sa-user-name">Super Admin</div><div className="sa-user-role">superadmin@nicho.app</div></div>
            <button className="sa-logout-btn" onClick={onLogout} title="Cerrar sesión">⏻</button>
          </div>
        </div>
      </aside>

      <div className="sa-main">
        {showAlert && (
          <div className="sa-alert-banner danger">
            <span>🔴</span>
            <span><strong>{debtRestaurants.length} restaurante{debtRestaurants.length > 1 ? "s" : ""}</strong> con saldo pendiente: {debtRestaurants.map((r) => `${r.name} ($${r.balance.toLocaleString()})`).join(", ")}</span>
            <button className="sa-alert-dismiss" onClick={() => setAlertDismissed(true)}>✕</button>
          </div>
        )}
        <header className="sa-topbar">
          <div>
            <div className="sa-topbar-title">{NAV.find((n) => n.view === view)?.icon} {NAV.find((n) => n.view === view)?.label}</div>
            <div className="sa-topbar-sub">NICHO Platform · Super Admin</div>
          </div>
          <div className="sa-topbar-right">
            <button className="sa-topbar-btn" onClick={() => setView("billing")}>
              💳 {debtRestaurants.length > 0 && <span className="sa-notif-badge">{debtRestaurants.length}</span>}
            </button>
            <button className="sa-topbar-btn" onClick={() => setView("notifications")}>🔔</button>
          </div>
        </header>
        <div className="sa-content">{renderView()}</div>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function SuperAdmin() {
  const [loggedIn, setLoggedIn] = useState(false);
  return (
    <div className="sa-root">
      {loggedIn ? <Dashboard onLogout={() => setLoggedIn(false)} /> : <Login onLogin={() => setLoggedIn(true)} />}
    </div>
  );
}

"use client";

// Panel de control global de la plataforma NICHO.
// Gestiona restaurantes clientes, feature flags, permisos, planes, pagos, auditoría y seguridad.
// Los módulos restaurants/audit/discounts/plans/requests/security persisten en Supabase (tablas sa_*).
// Feature flags de Nicho y RESTA3 se guardan en la tabla settings del proyecto principal vía /api/save-flags.

import { useState, useCallback, useEffect } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type View = "overview" | "restaurants" | "flags" | "permisos" | "solicitudes" | "seguridad" | "billing" | "audit" | "plans" | "maintenance" | "notifications" | "discounts" | "activity" | "ventas" | "flota" | "updates";
// Plan ya no es un enum cerrado: desde 2026-08-21 hay 6 planes activos (producto × modalidad)
// más los legacy trial/basic/premium. El id es un string libre que resuelve contra `planConfigs`.
type Plan = string;
type ProductId = "mi-card" | "mi-menu" | "mi-proyecto";
type Status = "active" | "suspended" | "maintenance";
type AuditType = "create" | "update" | "delete" | "access" | "billing";

interface Restaurant {
  id: string; name: string; plan: Plan; status: Status;
  users: number; maxUsers: number; registeredAt: string;
  balance: number; nextPayment: string; lastPayment: string;
  email: string; notes: string; apiToken: string;
  lastActive: string; loginCount: number;
  // multi-producto / flota (2026-08-21) — opcionales: restaurantes creados antes de la migración
  // pueden no tenerlos poblados todavía.
  restaurantId?: string; productId?: ProductId; billingMode?: "mensual" | "unico";
  subscriptionStatus?: string; updatesUntil?: string | null; supportUntil?: string | null;
  repoOwner?: string; repoName?: string; repoBranch?: string; repoUrl?: string; deployUrl?: string;
  vercelProjectId?: string; vercelTeamId?: string;
  previousPlan?: string; planChangedAt?: string;
}

interface PlanConfig {
  id: Plan; name: string; price: number; trialDays: number;
  maxUsers: number; color: string;
  features: { text: string; included: boolean }[];
  productId?: ProductId; billingMode?: "mensual" | "unico"; setupFee?: number;
  incluyeActualizaciones?: boolean; mesesActualizaciones?: number;
  incluyeSoporte?: boolean; mesesSoporte?: number;
  active?: boolean; legacy?: boolean; sortOrder?: number;
}

// Catálogo de productos (tabla sa_products, GET /api/superadmin/products) — antes la UI tenía
// ["mi-card","mi-menu","mi-proyecto"] repetido a mano en ~6 sitios (chips de filtro, selects,
// agrupaciones); ahora esos sitios iteran sobre esta lista, así que un producto nuevo dado de alta
// en la BD aparece en toda la UI sin tocar código.
interface ProductConfig { id: ProductId; name: string; tagline: string; tier: number; color: string; active: boolean; sortOrder: number; }

interface FeatureFlag { id: string; name: string; description: string; category: string; defaultEnabled: boolean; }

interface AuditEntry {
  id: string; ts: string; user: string; restaurant: string;
  action: string; details: string; ip: string; type: AuditType;
}

type UpdateTipo = "fix" | "feature" | "security" | "config" | "rollback";
type UpdateResultado = "pendiente" | "aplicado" | "deploy_ok" | "deploy_error" | "revertido";
interface ClientUpdate {
  id: string; restaurantPk: string; restaurantId: string | null; restaurantName: string;
  productId: ProductId | null; commitHash: string | null; commitMessage: string | null;
  baseCommitHash: string | null; versionLabel: string | null; descripcion: string | null;
  tipo: UpdateTipo; resultado: UpdateResultado; deployId: string | null; deployUrl: string | null;
  errorDetail: string | null; aplicadoPor: string; aplicadoAt: string; verificadoAt: string | null;
}

type FleetHealth = "ok" | "warn" | "error" | "unknown";
interface FleetStatus {
  restaurantPk: string; productId: ProductId | null; checkedAt: string | null;
  httpStatus: number | null; httpOk: boolean | null; httpLatencyMs: number | null; httpError: string | null;
  vercelState: string | null; vercelDeployId: string | null; vercelDeployAt: string | null; vercelDeploySha: string | null; vercelError: string | null;
  repoHeadSha: string | null; repoHeadAt: string | null; baseHeadSha: string | null;
  commitsBehind: number | null; commitsAhead: number | null; githubError: string | null;
  health: FleetHealth; healthReason: string | null;
}

interface Toast { msg: string; type: "success" | "error" | "info"; }

interface DiscountCode {
  id: string; code: string; discount: number; type: "%" | "$";
  maxUses: number; uses: number; expiresAt: string; active: boolean; note: string;
}

interface RevTotals { orders: number; efectivo: number; tarjeta: number; transferencia: number; domicilio: number; total: number }
interface RevCorte  { id: string; inicio: string; fin: string; by: string; orders: number; efectivo: number; tarjeta: number; transferencia: number; domicilio: number; total: number }
interface RevenueData { id: string; name: string; today: RevTotals; month: RevTotals; historial: RevCorte[] }


// Features de Nicho Restaurant (r1) — admin principal
const FEATURES_R1: FeatureFlag[] = [
  { id: "dashboard",        name: "Dashboard",           description: "Pantalla de inicio del panel admin",            category: "Core",         defaultEnabled: true  },
  { id: "ventas",           name: "Ventas",              description: "Transacciones, tickets y cierres",              category: "Core",         defaultEnabled: true  },
  { id: "operaciones",      name: "Operaciones",         description: "Mesas, pedidos y KDS en tiempo real",           category: "Core",         defaultEnabled: true  },
  { id: "configuracion",    name: "Configuración",       description: "Sucursales, usuarios, roles e integraciones",   category: "Core",         defaultEnabled: true  },
  { id: "analytics",        name: "Analytics",           description: "Métricas avanzadas, tendencias y predicciones", category: "Core",         defaultEnabled: true  },
  { id: "reportes",         name: "Reportes",            description: "Exportar PDF, Excel, CSV programados",          category: "Analytics",    defaultEnabled: true  },
  { id: "menu",             name: "Menú Inteligente",    description: "Productos, categorías y disponibilidad",        category: "Menú",         defaultEnabled: true  },
  { id: "produccion",       name: "Producción",             description: "Recetario, inventario, stock y merma",       category: "Menú",         defaultEnabled: true  },
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
  { id: "cumpleanos",       name: "Cumpleaños",          description: "Registro y notificaciones de cumpleaños",        category: "Clientes",     defaultEnabled: true  },
];

// Features de Resta3 — admin económico
const FEATURES_RESTA3: FeatureFlag[] = [
  { id: "r3_dashboard",  name: "Dashboard",     description: "Pantalla de inicio del panel Resta3",      category: "Resta3", defaultEnabled: true  },
  { id: "r3_tpv",        name: "TPV / Caja",    description: "Terminal punto de venta y cobros",         category: "Resta3", defaultEnabled: true  },
  { id: "r3_mesas",      name: "Mesas",         description: "Gestión de mesas y salón",                 category: "Resta3", defaultEnabled: true  },
  { id: "r3_cocina",     name: "Cocina",        description: "Pantalla de cocina y pedidos",             category: "Resta3", defaultEnabled: true  },
  { id: "r3_inventario", name: "Inventario",    description: "Stock, productos e insumos",               category: "Resta3", defaultEnabled: true  },
  { id: "r3_compras",    name: "Compras",       description: "Órdenes de compra a proveedores",          category: "Resta3", defaultEnabled: true  },
  { id: "r3_empleados",  name: "Empleados",     description: "Gestión de empleados y turnos",            category: "Resta3", defaultEnabled: true  },
  { id: "r3_reportes",   name: "Reportes",      description: "Reportes de ventas e inventario",          category: "Resta3", defaultEnabled: true  },
];

const FEATURES = [...FEATURES_R1, ...FEATURES_RESTA3];

// Features de mi-card — solo tiene 3 módulos, no comparte el catálogo de Nicho/Resta3.
const FEATURES_MICARD: FeatureFlag[] = [
  { id: "sellar",        name: "Sellar",        description: "Escanear/buscar cliente y sellar visita",  category: "mi-card", defaultEnabled: true },
  { id: "tarjetas",      name: "Tarjetas",      description: "Editor de categorías de tarjeta de lealtad", category: "mi-card", defaultEnabled: true },
  { id: "configuracion", name: "Configuración", description: "Identidad del restaurante y perfiles",      category: "mi-card", defaultEnabled: true },
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


// El catálogo real vive en `planConfigs` (tabla sa_plans, 6 planes + legacy) — estos helpers
// resuelven contra ese array en vez de un enum cerrado, con fallback si el plan ya no existe
// en el catálogo (restaurantes con un plan legacy/descontinuado no deben tronar la UI).
const PRODUCT_BADGE: Record<ProductId, string> = { "mi-card": "warning", "mi-menu": "info", "mi-proyecto": "active" };
function planLabel(id: Plan, configs: PlanConfig[]): string {
  return configs.find((p) => p.id === id)?.name ?? id ?? "Sin plan";
}
function planColor(id: Plan, configs: PlanConfig[]): string {
  const cfg = configs.find((p) => p.id === id);
  if (!cfg) return "muted";
  // Un plan gratuito ($0, ej. trial) se distingue con azul sin importar el producto — antes
  // (cuando el color era por tier: trial/basic/premium) esto ya existía; al pasar a colorear
  // por producto se perdía la señal visual de "esto no está pagando todavía".
  if (cfg.price === 0) return "info";
  return (cfg.productId && PRODUCT_BADGE[cfg.productId]) || "muted";
}
function planPrice(id: Plan, configs: PlanConfig[]): number {
  return configs.find((p) => p.id === id)?.price ?? 0;
}
const STATUS_LABELS: Record<Status, string> = { active: "Activo", suspended: "Suspendido", maintenance: "Mantenimiento" };
const STATUS_COLORS: Record<Status, string> = { active: "active", suspended: "danger",     maintenance: "warning"       };
const AUDIT_ICONS: Record<AuditType, IconName> = { create: "plus", update: "edit", delete: "trash", access: "eye", billing: "credit-card" };
const AUDIT_COLORS: Record<AuditType, string> = { create: "active", update: "info", delete: "danger", access: "muted", billing: "warning" };

// ─── Shared helpers ───────────────────────────────────────────────────────────

// Chip de estado con punto de color. `type` mapea a una clase CSS (active/danger/warning/info/muted).
function Badge({ type, children }: { type: string; children: React.ReactNode }) {
  return <span className={`sa-badge ${type}`}><span className="dot" />{children}</span>;
}

// Checkbox estilizado como toggle switch (el input real queda oculto).
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="sa-toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="sa-toggle-track" />
    </label>
  );
}

// Genera un CSV (con escape correcto de comillas/comas embebidas) y dispara la descarga mediante
// un <a> temporal. Compartido por AuditLog, Flota y ClientUpdates — antes cada uno lo reimplementaba
// a mano concatenando strings sin escapar, así que un "," o un `"` dentro de una descripción rompía el CSV.
function exportCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
}

// Notificación flotante en la esquina superior derecha. Desaparece tras 3 s (gestionado por showToast en Dashboard).
function ToastBanner({ toast }: { toast: Toast }) {
  const bg: Record<string, string> = {
    success: "rgba(0,230,118,.15)",
    error:   "rgba(239,68,68,.15)",
    info:    "rgba(59,130,246,.15)",
  };
  const color: Record<string, string> = { success: "#00e676", error: "#ef4444", info: "#60a5fa" };
  const icon: Record<string, IconName> = { success: "check-circle", error: "x-circle", info: "info" };
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
      <span style={{ display: "flex" }}><Icon name={icon[toast.type]} /></span>
      <span style={{ color: "var(--text-primary)" }}>{toast.msg}</span>
    </div>
  );
}

// Diálogo modal con backdrop oscuro. Clic en el backdrop lo cierra; clic dentro del contenido no.
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px",
    }} onClick={onClose}>
      <div style={{
        background: "var(--bg-card)", border: "1px solid var(--border-light)", borderRadius: "16px",
        width: "100%", maxWidth: "520px", maxHeight: "80vh", overflowY: "auto",
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px", borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontWeight: 700, fontSize: "1rem", color: "var(--text-primary)" }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-secondary)", fontSize: "1.2rem", cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ padding: "24px" }}>{children}</div>
      </div>
    </div>
  );
}


// ─── Overview ─────────────────────────────────────────────────────────────────

function Overview({ restaurants, setView, planConfigs, productConfigs }: { restaurants: Restaurant[]; setView: (v: View) => void; planConfigs: PlanConfig[]; productConfigs: ProductConfig[] }) {
  const active  = restaurants.filter((r) => r.status === "active").length;
  const withDebt = restaurants.filter((r) => r.balance > 0).length;
  const totalUsers = restaurants.reduce((s, r) => s + r.users, 0);
  // Ingresos reales: excluye trial (precio $0) y restaurantes suspendidos (no generan MRR).
  const revenue = restaurants.filter((r) => r.plan !== "trial" && r.status === "active")
    .reduce((s, r) => s + planPrice(r.plan, planConfigs), 0);

  return (
    <div>
      <div className="sa-section-header">
        <div><div className="sa-section-title"><Icon name="bar-chart" size={22} /> Métricas globales</div><div className="sa-section-sub">Resumen de toda la plataforma</div></div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: ".82rem", color: "var(--text-secondary)" }}>
          <span className="sa-live" /> EN VIVO
        </div>
      </div>

      {/* Cada KPI card es navegable: clic lleva directamente a la sección correspondiente. */}
      <div className="sa-kpi-strip">
        <div className="sa-kpi-card" style={{ cursor: "pointer" }} onClick={() => setView("restaurants")}>
          <div className="sa-kpi-top"><span className="sa-kpi-label">Restaurantes activos</span><div className="sa-kpi-icon" style={{ background: "rgba(0,230,118,.1)", color: "var(--accent)" }}><Icon name="store" /></div></div>
          <div className="sa-kpi-value">{active}</div>
          <div className="sa-kpi-delta">de {restaurants.length} totales →</div>
        </div>
        <div className="sa-kpi-card" style={{ cursor: "pointer" }} onClick={() => setView("billing")}>
          <div className="sa-kpi-top"><span className="sa-kpi-label">Ingresos del mes</span><div className="sa-kpi-icon" style={{ background: "rgba(99,102,241,.15)", color: "#818cf8" }}><Icon name="dollar" /></div></div>
          <div className="sa-kpi-value">${revenue.toLocaleString()}</div>
          <div className="sa-kpi-delta">planes activos →</div>
        </div>
        <div className="sa-kpi-card" style={{ cursor: "pointer" }} onClick={() => setView("billing")}>
          <div className="sa-kpi-top"><span className="sa-kpi-label">Tasa de morosidad</span><div className="sa-kpi-icon" style={{ background: withDebt > 0 ? "rgba(239,68,68,.12)" : "rgba(0,230,118,.1)", color: withDebt > 0 ? "#ef4444" : "var(--accent)" }}><Icon name="alert-triangle" /></div></div>
          <div className="sa-kpi-value" style={{ color: withDebt > 0 ? "#ef4444" : undefined }}>{Math.round((withDebt / restaurants.length) * 100)}%</div>
          <div className={`sa-kpi-delta${withDebt > 0 ? " down" : ""}`}>{withDebt} con saldo →</div>
        </div>
        <div className="sa-kpi-card">
          <div className="sa-kpi-top"><span className="sa-kpi-label">Usuarios totales</span><div className="sa-kpi-icon" style={{ background: "rgba(59,130,246,.12)", color: "#60a5fa" }}><Icon name="users" /></div></div>
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
                <div style={{ width: 34, height: 34, borderRadius: "10px", background: "var(--bg-elevated)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name="store" /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: ".88rem" }}>{r.name}</div>
                  <div style={{ fontSize: ".75rem", color: "var(--text-secondary)" }}>{r.users}/{r.maxUsers} usuarios · {planLabel(r.plan, planConfigs)}</div>
                </div>
                {r.balance > 0 && <span style={{ fontSize: ".75rem", color: "#ef4444", fontWeight: 700 }}>${r.balance.toLocaleString()}</span>}
                <Badge type={STATUS_COLORS[r.status]}>{STATUS_LABELS[r.status]}</Badge>
              </div>
            ))}
          </div>
        </div>

        <div className="sa-card">
          <div className="sa-card-header"><span className="sa-card-title">Distribución por producto</span></div>
          <div className="sa-card-body">
            {[...productConfigs].sort((a, b) => b.tier - a.tier).map((prod) => {
              // Legacy: restaurantes sin productId poblado se cuentan como mi-proyecto (backfill de la migración).
              const count = restaurants.filter((r) => (r.productId ?? "mi-proyecto") === prod.id).length;
              const pct = restaurants.length ? Math.round((count / restaurants.length) * 100) : 0;
              return (
                <div key={prod.id} style={{ marginBottom: "16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span style={{ fontSize: ".86rem", fontWeight: 600 }}>{prod.id}</span>
                    <span style={{ fontSize: ".82rem", color: "var(--text-secondary)" }}>{count} restaurantes · {pct}%</span>
                  </div>
                  <div style={{ height: "8px", background: "var(--bg-elevated)", borderRadius: "4px", overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: "4px", width: `${pct}%`, background: prod.color, transition: "width .4s ease" }} />
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
  restaurants, setRestaurants, addAudit, showToast, planConfigs, productConfigs,
}: {
  restaurants: Restaurant[];
  setRestaurants: React.Dispatch<React.SetStateAction<Restaurant[]>>;
  addAudit: (action: string, details: string, type: AuditType, restaurant?: string) => void;
  showToast: (msg: string, type?: Toast["type"]) => void;
  planConfigs: PlanConfig[];
  productConfigs: ProductConfig[];
}) {
  const [search, setSearch] = useState("");
  // Se filtra por producto, no por plan individual — con 6+ planes activos, filtrar plan por
  // plan deja de ser útil; producto (mi-card/mi-menu/mi-proyecto) es lo que importa a simple vista.
  const [filter, setFilter] = useState<"all" | string>("all");
  const [selected, setSelected] = useState<Restaurant | null>(null);
  const [upgradeFor, setUpgradeFor] = useState<Restaurant | null>(null);
  const [provisionFor, setProvisionFor] = useState<Restaurant | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Restaurant | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const sellablePlans = planConfigs.filter((p) => p.active);
  const [newPlan, setNewPlan] = useState<Plan>("trial");
  const [registering, setRegistering] = useState(false);

  const filtered = restaurants.filter((r) => {
    const s = r.name.toLowerCase().includes(search.toLowerCase());
    return filter === "all" ? s : s && (r.productId ?? "mi-proyecto") === filter;
  });

  const toggleStatus = (r: Restaurant) => {
    const next: Status = r.status === "suspended" ? "active" : "suspended";
    setRestaurants((prev) => prev.map((x) => x.id === r.id ? { ...x, status: next } : x));
    fetch(`/api/superadmin/restaurants/${r.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }) }).catch(() => {})
    addAudit(next === "suspended" ? "Restaurante suspendido" : "Restaurante reactivado", r.name, "update", r.name);
    showToast(`${r.name} ${next === "suspended" ? "suspendido" : "reactivado"}`);
    setSelected(null);
  };

  // Borra el registro por completo — irreversible, por eso pasa por un modal de confirmación
  // aparte (deleteTarget) en vez de un solo clic. No borra la instancia real del cliente
  // (repo/deploy) si la tenía aprovisionada, solo el registro en el superadmin.
  const deleteRestaurant = async (r: Restaurant) => {
    setDeleting(true);
    const res = await fetch(`/api/superadmin/restaurants/${r.id}`, { method: 'DELETE' }).catch(() => null);
    setDeleting(false);
    if (!res || !res.ok) { showToast("No se pudo eliminar el restaurante — reintenta", "error"); return; }
    setRestaurants((prev) => prev.filter((x) => x.id !== r.id));
    addAudit("Restaurante eliminado", r.name, "delete", r.name);
    showToast(`${r.name} eliminado`);
    setDeleteTarget(null);
    setSelected(null);
  };

  // Registra el restaurante y, en la misma acción, dispara el aprovisionamiento real (repo +
  // deploy) del producto elegido — antes eran dos pasos (registrar, y luego ir al detalle a
  // apretar "Aprovisionar instancia" aparte). Si el aprovisionamiento falla (ej. faltan
  // GITHUB_TOKEN/VERCEL_TOKEN todavía), el restaurante se queda registrado igual — no se pierde
  // el alta — y se puede reintentar desde su detalle con el mismo botón de antes.
  const addRestaurant = async () => {
    if (!newName.trim() || !newEmail.trim()) { showToast("Completa nombre y correo", "error"); return; }
    setRegistering(true);
    const res = await fetch('/api/superadmin/restaurants', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName.trim(), email: newEmail.trim(), plan: newPlan }) }).catch(() => null);
    if (!res || !res.ok) { setRegistering(false); showToast("Error al registrar restaurante", "error"); return; }
    const newR: Restaurant = await res.json()
    setRestaurants((prev) => [...prev, newR]);
    addAudit("Restaurante registrado", `${newName} · Plan ${planLabel(newPlan, planConfigs)}`, "create", newName);
    // El modal se queda abierto (con el botón en "Creando instancia…") hasta que el
    // aprovisionamiento termine, para que se vea como una sola acción de principio a fin.

    const provRes = await fetch('/api/superadmin/provision-client', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurantId: newR.id, dryRun: false }),
    }).catch(() => null);
    const provData = await provRes?.json().catch(() => null);
    setRegistering(false);
    setNewName(""); setNewEmail(""); setNewPlan("trial"); setShowNewForm(false);

    if (provRes?.ok && provData?.ok) {
      setRestaurants((prev) => prev.map((x) => x.id === newR.id ? { ...x, repoOwner: 'Segundo715', repoName: provData.repoUrl?.split('/').pop(), repoUrl: provData.repoUrl, deployUrl: provData.deployUrl } : x));
      showToast(provData.warnings?.length ? `${newR.name} registrado y aprovisionado — revisa: ${provData.warnings[0]}` : `${newR.name} registrado y su instancia ya se está creando`);
    } else {
      showToast(`${newR.name} registrado, pero la instancia no se pudo crear (${provData?.error ?? "reintenta desde su detalle"})`, "error");
    }
  };

  const fieldStyle = { width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-light)", borderRadius: "8px", padding: "9px 12px", color: "var(--text-primary)", fontSize: ".86rem", outline: "none", fontFamily: "inherit", boxSizing: "border-box" as const, marginBottom: "12px" };

  return (
    <div>
      <div className="sa-section-header">
        <div><div className="sa-section-title"><Icon name="store" size={22} /> Restaurantes</div><div className="sa-section-sub">{restaurants.length} registrados · {restaurants.filter((r) => r.status === "active").length} activos</div></div>
        <button className="sa-btn primary" onClick={() => setShowNewForm(true)}><Icon name="plus" size={16} /> Registrar restaurante</button>
      </div>

      <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
        <div className="sa-search" style={{ flex: 1, minWidth: "180px" }}>
          <span style={{ color: "var(--text-muted)", display: "flex" }}><Icon name="search" size={16} /></span>
          <input placeholder="Buscar restaurante…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {["all", ...productConfigs.map((p) => p.id)].map((f) => (
          <button key={f} className={`sa-chip${filter === f ? " active" : ""}`} onClick={() => setFilter(f)}>
            {f === "all" ? "Todos" : f}
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
                <td><Badge type={planColor(r.plan, planConfigs)}>{planLabel(r.plan, planConfigs)}</Badge></td>
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
              ["Plan", planLabel(selected.plan, planConfigs)], ["Estado", STATUS_LABELS[selected.status]],
              ["Correo", selected.email], ["Usuarios", `${selected.users} / ${selected.maxUsers}`],
              ["Saldo pendiente", selected.balance > 0 ? `$${selected.balance.toLocaleString()}` : "Al corriente"],
              ["Próximo pago", selected.nextPayment], ["Último pago", selected.lastPayment],
              ["Registrado", selected.registeredAt],
              ["Instancia", selected.repoName ? `${selected.repoOwner}/${selected.repoName}` : "Sin aprovisionar"],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: ".86rem" }}>
                <span style={{ color: "var(--text-secondary)" }}>{k}</span>
                <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{v}</span>
              </div>
            ))}
            <div style={{ display: "flex", gap: "8px", marginTop: "8px", flexWrap: "wrap" }}>
              {selected.status !== "maintenance" && (
                <button className={`sa-btn${selected.status === "suspended" ? "" : " danger"}`} style={{ flex: 1 }} onClick={() => toggleStatus(selected)}>
                  <Icon name={selected.status === "suspended" ? "check-circle" : "ban"} size={16} /> {selected.status === "suspended" ? "Reactivar" : "Suspender"}
                </button>
              )}
              <button className="sa-btn" style={{ flex: 1 }} onClick={() => setUpgradeFor(selected)}><Icon name="shuffle" size={16} /> Cambiar plan/producto</button>
              {!selected.repoName && (
                <button className="sa-btn primary" style={{ flex: 1 }} onClick={() => setProvisionFor(selected)}><Icon name="package" size={16} /> Aprovisionar instancia</button>
              )}
              <button className="sa-btn danger" style={{ flex: 1 }} onClick={() => setDeleteTarget(selected)}><Icon name="trash" size={16} /> Eliminar</button>
              <button className="sa-btn" style={{ flex: 1 }} onClick={() => setSelected(null)}>Cerrar</button>
            </div>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <Modal title="Eliminar restaurante" onClose={() => setDeleteTarget(null)}>
          <p style={{ fontSize: ".9rem", color: "var(--text-primary)", marginBottom: "8px", lineHeight: 1.6 }}>
            ¿Eliminar <strong style={{ color: "#ef4444" }}>{deleteTarget.name}</strong> del superadmin? Esta acción no se puede deshacer.
          </p>
          <p style={{ fontSize: ".8rem", color: "var(--text-secondary)", marginBottom: "20px" }}>
            Se borra el registro de facturación, plan e historial de este panel. {deleteTarget.repoName
              ? "Su instancia real (repo/deploy) NO se borra sola — hazlo a mano en GitHub/Vercel si ya no la necesitas."
              : "No tenía instancia aprovisionada."}
          </p>
          <div style={{ display: "flex", gap: "8px" }}>
            <button className="sa-btn danger" style={{ flex: 1 }} onClick={() => deleteRestaurant(deleteTarget)} disabled={deleting}>
              {deleting ? "Eliminando…" : "Sí, eliminar"}
            </button>
            <button className="sa-btn" style={{ flex: 1 }} onClick={() => setDeleteTarget(null)}>Cancelar</button>
          </div>
        </Modal>
      )}

      {provisionFor && (
        <ProvisionModal
          restaurant={provisionFor}
          showToast={showToast}
          onClose={() => setProvisionFor(null)}
          onDone={(patch) => {
            setRestaurants((prev) => prev.map((x) => x.id === provisionFor.id ? { ...x, ...patch } : x));
            setProvisionFor(null); setSelected(null);
          }}
        />
      )}

      {upgradeFor && (
        <UpgradePlanModal
          restaurant={upgradeFor}
          planConfigs={planConfigs}
          showToast={showToast}
          onClose={() => setUpgradeFor(null)}
          onDone={(patch) => {
            setRestaurants((prev) => prev.map((x) => x.id === upgradeFor.id ? { ...x, ...patch } : x));
            setUpgradeFor(null); setSelected(null);
          }}
        />
      )}

      {/* New restaurant modal */}
      {showNewForm && (
        <Modal title="Registrar nuevo restaurante" onClose={() => setShowNewForm(false)}>
          <label style={{ display: "block", color: "var(--text-secondary)", fontSize: ".78rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "5px" }}>Nombre del restaurante</label>
          <input style={fieldStyle} placeholder="Ej. El Fogón" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <label style={{ display: "block", color: "var(--text-secondary)", fontSize: ".78rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "5px" }}>Correo del admin</label>
          <input style={fieldStyle} placeholder="admin@restaurante.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          <label style={{ display: "block", color: "var(--text-secondary)", fontSize: ".78rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "5px" }}>Plan inicial</label>
          {sellablePlans.length === 0 ? (
            <div style={{ padding: "10px 12px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "8px", fontSize: ".8rem", color: "#f87171", marginBottom: "12px" }}>
              No hay planes en el catálogo — falta correr la migración SQL (Documentacion/sql/migraciones/2026-08-21-multiproducto-y-flota.sql) en Supabase.
            </div>
          ) : (
            <select style={{ ...fieldStyle, cursor: "pointer" }} value={newPlan} onChange={(e) => setNewPlan(e.target.value)}>
              {productConfigs.map((prod) => {
                const plansOfProduct = sellablePlans.filter((p) => p.productId === prod.id);
                if (plansOfProduct.length === 0) return null;
                return (
                  <optgroup key={prod.id} label={prod.id}>
                    {plansOfProduct.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.price === 0 ? `(${p.trialDays} días gratis)` : p.billingMode === "unico" ? `($${p.price.toLocaleString()} único)` : `($${p.price.toLocaleString()}/mes)`}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          )}
          <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
            <button className="sa-btn primary" style={{ flex: 1 }} onClick={addRestaurant} disabled={sellablePlans.length === 0 || registering}>
              <Icon name="check-circle" size={16} /> {registering ? "Creando instancia…" : "Registrar"}
            </button>
            <button className="sa-btn" style={{ flex: 1 }} onClick={() => setShowNewForm(false)}>Cancelar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Upgrade / downgrade de plan-producto ──────────────────────────────────────
// Flujo dry-run primero, siempre: se pide la vista previa (no escribe nada), se muestran
// advertencias y qué cambia, y solo entonces se habilita "Confirmar". Ver
// app/api/superadmin/upgrade-plan/route.ts para qué SÍ y qué NO hace este endpoint todavía
// (no copia datos entre productos ni activa feature flags automáticamente).

type UpgradePreview = {
  ok: boolean; error?: string; direction?: "upgrade" | "downgrade" | "billing_change";
  from?: { planId: string; productId: string | null; tier: number | null };
  to?: { planId: string; productId: string | null; tier: number | null };
  changes?: { maxUsers: number; billingMode: string; updatesUntil: string | null; supportUntil: string | null; subscriptionStatus: string };
  warnings?: string[];
};

function UpgradePlanModal({ restaurant, planConfigs, onClose, onDone, showToast }: {
  restaurant: Restaurant;
  planConfigs: PlanConfig[];
  onClose: () => void;
  onDone: (patch: Partial<Restaurant>) => void;
  showToast: (msg: string, type?: Toast["type"]) => void;
}) {
  const [targetPlan, setTargetPlan] = useState("");
  const [preview, setPreview] = useState<UpgradePreview | null>(null);
  const [ack, setAck] = useState(false);
  const [loading, setLoading] = useState(false);

  const runDryRun = async () => {
    if (!targetPlan) return;
    setLoading(true); setPreview(null); setAck(false);
    const res = await fetch('/api/superadmin/upgrade-plan', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurantId: restaurant.id, targetPlanId: targetPlan, dryRun: true }),
    });
    const data = await res.json();
    setLoading(false);
    setPreview(data);
  };

  const confirm = async () => {
    if (!targetPlan || !preview) return;
    if (preview.direction === "downgrade" && !ack) { showToast("Confirma que entiendes la pérdida de datos", "error"); return; }
    setLoading(true);
    const res = await fetch('/api/superadmin/upgrade-plan', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurantId: restaurant.id, targetPlanId: targetPlan, dryRun: false, acknowledgeDataLoss: ack }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok || !data.ok) { showToast(data.error ?? "No se pudo cambiar el plan", "error"); return; }
    const cfg = planConfigs.find((p) => p.id === targetPlan);
    onDone({
      plan: targetPlan, productId: cfg?.productId, billingMode: cfg?.billingMode,
      maxUsers: preview.changes?.maxUsers,
      subscriptionStatus: preview.changes?.subscriptionStatus,
      updatesUntil: preview.changes?.updatesUntil, supportUntil: preview.changes?.supportUntil,
    });
    showToast(data.warnings?.length ? `Plan cambiado — revisa: ${data.warnings[0]}` : "Plan actualizado correctamente");
  };

  return (
    <Modal title={`Cambiar plan/producto — ${restaurant.name}`} onClose={onClose}>
      <p style={{ fontSize: ".82rem", color: "var(--text-secondary)", marginBottom: "12px" }}>
        Plan actual: <strong style={{ color: "var(--text-primary)" }}>{planLabel(restaurant.plan, planConfigs)}</strong>
      </p>
      <select
        style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-light)", borderRadius: "8px", padding: "9px 12px", color: "var(--text-primary)", fontSize: ".86rem", outline: "none", fontFamily: "inherit", boxSizing: "border-box", marginBottom: "12px", cursor: "pointer" }}
        value={targetPlan} onChange={(e) => { setTargetPlan(e.target.value); setPreview(null); }}
      >
        <option value="">Selecciona un plan destino…</option>
        {planConfigs.filter((p) => p.active && p.id !== restaurant.plan).map((p) => (
          <option key={p.id} value={p.id}>{p.name} · {p.productId}</option>
        ))}
      </select>

      {!preview && (
        <button className="sa-btn full" onClick={runDryRun} disabled={!targetPlan || loading}>{loading ? "Calculando…" : "Ver vista previa"}</button>
      )}

      {preview && !preview.ok && (
        <div style={{ padding: "12px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "10px", fontSize: ".84rem", color: "#f87171", marginBottom: "12px" }}>
          {preview.error}
        </div>
      )}

      {preview && preview.ok && (
        <div style={{ marginBottom: "12px" }}>
          <div style={{ fontSize: ".82rem", marginBottom: "10px" }}>
            Tipo de cambio: <Badge type={preview.direction === "downgrade" ? "danger" : preview.direction === "upgrade" ? "active" : "info"}>{preview.direction}</Badge>
          </div>
          {preview.changes && (
            <div style={{ fontSize: ".8rem", color: "var(--text-secondary)", marginBottom: "10px" }}>
              Máx usuarios: {preview.changes.maxUsers} · Modalidad: {preview.changes.billingMode}
              {preview.changes.updatesUntil && <> · Actualizaciones hasta {preview.changes.updatesUntil}</>}
            </div>
          )}
          {preview.warnings && preview.warnings.length > 0 && (
            <div style={{ padding: "10px 12px", background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.2)", borderRadius: "10px", marginBottom: "10px" }}>
              {preview.warnings.map((w, i) => <div key={i} style={{ fontSize: ".78rem", color: "#eab308", marginBottom: i < preview.warnings!.length - 1 ? "6px" : 0 }}>⚠ {w}</div>)}
            </div>
          )}
          {preview.direction === "downgrade" && (
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: ".82rem", color: "var(--text-secondary)", marginBottom: "10px", cursor: "pointer" }}>
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              Entiendo que este cambio puede dejar datos fuera del nuevo plan
            </label>
          )}
          <div style={{ display: "flex", gap: "8px" }}>
            <button className="sa-btn primary" style={{ flex: 1 }} onClick={confirm} disabled={loading || (preview.direction === "downgrade" && !ack)}>
              {loading ? "Aplicando…" : "Confirmar cambio"}
            </button>
            <button className="sa-btn" style={{ flex: 1 }} onClick={() => setPreview(null)}>Revisar otro plan</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── Aprovisionar instancia (repo + deploy del cliente) ────────────────────────
// Mismo patrón dry-run → confirmar que UpgradePlanModal. Ver
// app/api/superadmin/provision-client/route.ts para el detalle de qué crea y qué variables
// de entorno confirmó (no adivinó) leyendo el código real de mi-proyecto/mi-card.

type ProvisionPreview = {
  ok: boolean; error?: string;
  template?: string; newRepo?: string; restaurantId?: string;
  envVarsToSet?: string[]; githubTokenConfigured?: boolean; vercelTokenConfigured?: boolean;
  warnings?: string[];
};

function ProvisionModal({ restaurant, onClose, onDone, showToast }: {
  restaurant: Restaurant;
  onClose: () => void;
  onDone: (patch: Partial<Restaurant>) => void;
  showToast: (msg: string, type?: Toast["type"]) => void;
}) {
  const [preview, setPreview] = useState<ProvisionPreview | null>(null);
  // Arranca en `true`: el efecto de abajo dispara el fetch de inmediato al montar, así que ya
  // sabemos que va a estar cargando — evita tener que llamar setLoading(true) de forma síncrona
  // dentro del efecto (lint react-hooks/set-state-in-effect).
  const [loading, setLoading] = useState(true);

  // Corre la vista previa automáticamente al abrir — no hay nada que elegir antes (a diferencia
  // del cambio de plan), así que pedir un clic extra solo para ver el resultado sería fricción de más.
  useEffect(() => {
    fetch('/api/superadmin/provision-client', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurantId: restaurant.id, dryRun: true }),
    })
      .then(async (res) => {
        const data = await res.json();
        setPreview(res.ok ? data : { ok: false, error: data.error ?? "No se pudo validar" });
      })
      .catch(() => setPreview({ ok: false, error: "No se pudo conectar con el servidor" }))
      .finally(() => setLoading(false));
  }, [restaurant.id]);

  const confirm = async () => {
    setLoading(true);
    const res = await fetch('/api/superadmin/provision-client', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurantId: restaurant.id, dryRun: false }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok || !data.ok) { showToast(data.error ?? "No se pudo aprovisionar la instancia", "error"); return; }
    onDone({ repoOwner: 'Segundo715', repoName: preview?.newRepo?.split('/')[1], repoUrl: data.repoUrl, deployUrl: data.deployUrl, restaurantId: data.restaurantId });
    showToast(data.warnings?.length ? `Instancia creada — revisa: ${data.warnings[0]}` : "Instancia creada correctamente");
  };

  const tokensOk = preview?.githubTokenConfigured && preview?.vercelTokenConfigured;

  return (
    <Modal title={`Aprovisionar instancia — ${restaurant.name}`} onClose={onClose}>
      {loading && !preview && <p style={{ fontSize: ".86rem", color: "var(--text-secondary)" }}>Calculando…</p>}

      {preview && !preview.ok && (
        <div style={{ padding: "12px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "10px", fontSize: ".84rem", color: "#f87171" }}>
          {preview.error}
        </div>
      )}

      {preview && preview.ok && (
        <div>
          <div style={{ fontSize: ".84rem", marginBottom: "10px", color: "var(--text-secondary)" }}>
            Se creará el repo <strong style={{ color: "var(--text-primary)" }}>{preview.newRepo}</strong> (plantilla: {preview.template})
            {" "}y un proyecto de Vercel apuntando a él, con <code>NEXT_PUBLIC_RESTAURANT_ID = {preview.restaurantId}</code>.
          </div>

          {!tokensOk && (
            <div style={{ padding: "10px 12px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "10px", marginBottom: "10px", fontSize: ".8rem", color: "#f87171" }}>
              {!preview.githubTokenConfigured && <div>⚠ Falta GITHUB_TOKEN (con permiso de escritura) — no se puede crear el repo todavía.</div>}
              {!preview.vercelTokenConfigured && <div>⚠ Falta VERCEL_TOKEN (con permiso de crear proyectos) — no se puede crear el deploy todavía.</div>}
            </div>
          )}

          {preview.warnings && preview.warnings.length > 0 && (
            <div style={{ padding: "10px 12px", background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.2)", borderRadius: "10px", marginBottom: "10px" }}>
              {preview.warnings.map((w, i) => <div key={i} style={{ fontSize: ".78rem", color: "#eab308", marginBottom: i < preview.warnings!.length - 1 ? "6px" : 0 }}>⚠ {w}</div>)}
            </div>
          )}

          <div style={{ display: "flex", gap: "8px" }}>
            <button className="sa-btn primary" style={{ flex: 1 }} onClick={confirm} disabled={loading || !tokensOk}>
              {loading ? "Creando…" : "Confirmar y crear"}
            </button>
            <button className="sa-btn" style={{ flex: 1 }} onClick={onClose}>Cancelar</button>
          </div>
        </div>
      )}
    </Modal>
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
      init[`portales_${f.id}`] = f.defaultEnabled;
      restaurants.forEach((r) => { init[`${r.id}_${f.id}`] = f.defaultEnabled; });
    });
    return init;
  });
  const [roles, setRoles] = useState<Record<string, ("admin" | "employee" | "user")[]>>(() =>
    Object.fromEntries(FEATURES.map((f) => [f.id, ["admin", "employee", "user"]]))
  );

  // Restaurantes conectados a apps reales en Supabase (misma BD compartida).
  const CONNECTED_RESTAURANT = "r1";       // mi-proyecto → feature_flags + feature_flags_resta3
  const CONNECTED_PORTALES   = "portales"; // mi-restauranteportales → feature_flags_portales (R1 + Resta3 juntos)
  const CONNECTED_MIMENU     = "mimenu";   // mi-menu → proyecto Supabase propio, feature_flags_mimenu
  const CONNECTED_MICARD     = "micard";   // mi-card → misma BD que Global, feature_flags_micard

  useEffect(() => {
    fetch("/api/save-flags?key=feature_flags")
      .then(r => r.json())
      .then((saved: Record<string, boolean>) => {
        setFlags(prev => {
          const next = { ...prev };
          FEATURES_R1.forEach(f => {
            next[`all_${f.id}`] = saved[f.id] ?? f.defaultEnabled;
            next[`${CONNECTED_RESTAURANT}_${f.id}`] = saved[f.id] ?? f.defaultEnabled;
          });
          return next;
        });
      }).catch(() => {});
    fetch("/api/save-flags?key=feature_flags_resta3")
      .then(r => r.json())
      .then((saved: Record<string, boolean>) => {
        setFlags(prev => {
          const next = { ...prev };
          FEATURES_RESTA3.forEach(f => {
            next[`all_${f.id}`] = saved[f.id] ?? f.defaultEnabled;
          });
          return next;
        });
      }).catch(() => {});
    fetch("/api/save-flags?key=feature_flags_portales")
      .then(r => r.json())
      .then((saved: Record<string, boolean>) => {
        setFlags(prev => {
          const next = { ...prev };
          FEATURES.forEach(f => {
            next[`${CONNECTED_PORTALES}_${f.id}`] = saved[f.id] ?? f.defaultEnabled;
          });
          return next;
        });
      }).catch(() => {});
    fetch("/api/save-flags?key=feature_flags_mimenu")
      .then(r => r.json())
      .then((saved: Record<string, boolean>) => {
        setFlags(prev => {
          const next = { ...prev };
          FEATURES_R1.forEach(f => {
            next[`${CONNECTED_MIMENU}_${f.id}`] = saved[f.id] ?? f.defaultEnabled;
          });
          return next;
        });
      }).catch(() => {});
    fetch("/api/save-flags?key=feature_flags_micard")
      .then(r => r.json())
      .then((saved: Record<string, boolean>) => {
        setFlags(prev => {
          const next = { ...prev };
          FEATURES_MICARD.forEach(f => {
            next[`${CONNECTED_MICARD}_${f.id}`] = saved[f.id] ?? f.defaultEnabled;
          });
          return next;
        });
      }).catch(() => {});
  }, []);

  const k = (fid: string) => `${sel}_${fid}`;
  const selName = sel === "all" ? "Global"
                : sel === CONNECTED_PORTALES ? "Portales"
                : sel === CONNECTED_MIMENU ? "mi-menu"
                : sel === CONNECTED_MICARD ? "mi-card"
                : restaurants.find((r) => r.id === sel)?.name ?? sel;

  const toggle = (fid: string, fname: string) => {
    const next = !(flags[k(fid)] ?? true);
    const newFlags = { ...flags, [k(fid)]: next };

    const isPortales = sel === CONNECTED_PORTALES;
    const isMiMenu   = sel === CONNECTED_MIMENU;
    const isMiCard   = sel === CONNECTED_MICARD;
    const isResta3   = fid.startsWith("r3_") && !isMiMenu && !isMiCard;

    if (!isPortales && !isMiMenu && !isMiCard) {
      if (sel === CONNECTED_RESTAURANT) newFlags[`all_${fid}`] = next;
      if (sel === "all") newFlags[`${CONNECTED_RESTAURANT}_${fid}`] = next;
    }
    setFlags(newFlags);

    // Portales guarda R1 + Resta3 juntos en feature_flags_portales.
    // Global guarda R1 en feature_flags y Resta3 en feature_flags_resta3.
    // mi-menu tiene su propio proyecto Supabase — feature_flags_mimenu.
    // mi-card comparte la BD de Global pero con su propio catálogo (3 módulos) — feature_flags_micard.
    const settingsKey = isPortales ? "feature_flags_portales"
                      : isMiMenu  ? "feature_flags_mimenu"
                      : isMiCard  ? "feature_flags_micard"
                      : isResta3  ? "feature_flags_resta3"
                      :              "feature_flags";
    const featureList = isPortales ? FEATURES
                      : isMiMenu  ? FEATURES_R1
                      : isMiCard  ? FEATURES_MICARD
                      : isResta3  ? FEATURES_RESTA3
                      :              FEATURES_R1;
    const scopePrefix = isPortales ? CONNECTED_PORTALES : isMiMenu ? CONNECTED_MIMENU : isMiCard ? CONNECTED_MICARD : "all";
    const savedFlags: Record<string, boolean> = {};
    featureList.forEach((f) => { savedFlags[f.id] = newFlags[`${scopePrefix}_${f.id}`] ?? true; });

    fetch("/api/save-flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settingsKey, flags: savedFlags }),
    }).then(async r => {
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        showToast(`Error ${r.status}: ${body.error ?? "desconocido"}`, "error");
      } else {
        showToast("Flags guardados ✓", "success");
      }
    }).catch((e) => showToast(`Red: ${e.message}`, "error"));

    addAudit(`Feature flag ${next ? "activada" : "desactivada"}`, `${fname} → ${selName}`, "update", selName === "Global" ? "—" : selName);
    showToast(`${fname} ${next ? "activada" : "desactivada"} en ${selName}`);
  };

  const toggleRole = (fid: string, role: "admin" | "employee" | "user") => {
    setRoles((p) => {
      const cur = p[fid] ?? [];
      return { ...p, [fid]: cur.includes(role) ? cur.filter((r) => r !== role) : [...cur, role] };
    });
  };

  // Portales y Global muestran todas las features (R1 + Resta3); mi-card tiene su propio catálogo, mucho más chico.
  const visibleFeatures = sel === CONNECTED_MICARD ? FEATURES_MICARD : FEATURES;
  const categories = [...new Set(visibleFeatures.map((f) => f.category))];

  return (
    <div>
      <div className="sa-section-header">
        <div><div className="sa-section-title"><Icon name="flag" size={22} /> Feature Flags</div><div className="sa-section-sub">Activa o bloquea módulos por restaurante y por rol</div></div>
        <button className="sa-btn" onClick={() => {
          const blob = new Blob([JSON.stringify(flags, null, 2)], { type: "application/json" });
          const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
          a.download = "feature-flags.json"; a.click();
          showToast("Configuración exportada");
        }}><Icon name="download" size={16} /> Exportar JSON</button>
      </div>

      {/* Resumen de estado */}
      {(() => {
        const total = visibleFeatures.length;
        const scopeKey = sel === "all" ? "all" : sel;
        const off = visibleFeatures.filter(f => (flags[`${scopeKey}_${f.id}`] ?? f.defaultEnabled) === false).length;
        return off > 0 ? (
          <div style={{ marginBottom: "16px", padding: "10px 16px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "10px", display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ color: "#f87171", display: "flex" }}><Icon name="alert-triangle" size={16} /></span>
            <span style={{ color: "#f87171", fontWeight: 600, fontSize: ".88rem" }}>{off} de {total} módulos desactivados</span>
            <span style={{ color: "#64748b", fontSize: ".8rem" }}>en {selName}</span>
          </div>
        ) : (
          <div style={{ marginBottom: "16px", padding: "10px 16px", background: "rgba(0,230,118,0.06)", border: "1px solid rgba(0,230,118,0.15)", borderRadius: "10px", display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ color: "#4ade80", display: "flex" }}><Icon name="check-circle" size={16} /></span>
            <span style={{ color: "#4ade80", fontWeight: 600, fontSize: ".88rem" }}>Todos los módulos activos</span>
          </div>
        );
      })()}

      <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
        <button className={`sa-chip${sel === "all" ? " active" : ""}`} onClick={() => setSel("all")}><Icon name="globe" size={13} /> Global</button>
        <button className={`sa-chip${sel === CONNECTED_MIMENU ? " active" : ""}`} onClick={() => setSel(CONNECTED_MIMENU)}><Icon name="clipboard" size={13} /> mi-menu</button>
        <button className={`sa-chip${sel === CONNECTED_MICARD ? " active" : ""}`} onClick={() => setSel(CONNECTED_MICARD)}><Icon name="credit-card" size={13} /> mi-card</button>
        {restaurants.map((r) => (
          <button key={r.id} className={`sa-chip${sel === r.id ? " active" : ""}`} onClick={() => setSel(r.id)}>{r.name}</button>
        ))}
        <button className={`sa-chip${sel === CONNECTED_PORTALES ? " active" : ""}`} onClick={() => setSel(CONNECTED_PORTALES)}><Icon name="store" size={13} /> Portales</button>
      </div>

      {categories.map((cat) => (
        <div key={cat} className="sa-card" style={{ marginBottom: "16px" }}>
          <div className="sa-card-header">
            <span className="sa-card-title">{cat}</span>
            <span style={{ fontSize: ".78rem", color: "var(--text-secondary)" }}>{visibleFeatures.filter((f) => f.category === cat).length} módulos</span>
          </div>
          <table className="sa-table">
            <thead><tr><th>Módulo</th><th>Descripción</th><th>Activo</th><th>Roles con acceso</th></tr></thead>
            <tbody>
              {visibleFeatures.filter((f) => f.category === cat).map((f) => {
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
  restaurants, setRestaurants, addAudit, showToast, planConfigs,
}: {
  restaurants: Restaurant[];
  setRestaurants: React.Dispatch<React.SetStateAction<Restaurant[]>>;
  addAudit: (action: string, details: string, type: AuditType, restaurant?: string) => void;
  showToast: (msg: string, type?: Toast["type"]) => void;
  planConfigs: PlanConfig[];
}) {
  const [changePlan, setChangePlan] = useState<Restaurant | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<Plan>("trial");

  // Registra el pago: zeroes balance, actualiza lastPayment y auto-reactiva si estaba suspendido.
  // NOTA: solo actualiza estado local — este endpoint (PATCH balance/lastPayment/status) no
  // requirió cambios para esta pasada, pero igual que applyPlanChange abajo, en producción real
  // el pago debe registrarse contra un proveedor de cobro, no solo aquí.
  const registerPayment = async (r: Restaurant) => {
    const paid = r.balance;
    const patch = { balance: 0, lastPayment: new Date().toISOString().split("T")[0], status: r.status === "suspended" ? "active" : r.status };
    // Persiste primero — si el PATCH falla (sesión vencida, error de BD), no queremos que el
    // estado local ni la auditoría digan "pago registrado" cuando la BD sigue mostrando la deuda.
    const res = await fetch(`/api/superadmin/restaurants/${r.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    }).catch(() => null);
    if (!res || !res.ok) { showToast("No se pudo guardar el pago — reintenta", "error"); return; }
    setRestaurants((prev) => prev.map((x) => x.id === r.id ? { ...x, ...patch } : x));
    addAudit("Pago registrado", `${r.name} — $${paid.toLocaleString()} liquidado`, "billing", r.name);
    showToast(`Pago de $${paid.toLocaleString()} registrado para ${r.name}`);
  };

  // Cambia el plan y ajusta maxUsers al límite del nuevo plan.
  const applyPlanChange = async () => {
    if (!changePlan) return;
    const prevLabel = planLabel(changePlan.plan, planConfigs);
    const cfg = planConfigs.find((p) => p.id === selectedPlan);
    if (!cfg) { showToast("Ese plan ya no existe en el catálogo", "error"); return; }
    const target = changePlan;
    setChangePlan(null);
    const res = await fetch(`/api/superadmin/restaurants/${target.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: selectedPlan, maxUsers: cfg.maxUsers, productId: cfg.productId, billingMode: cfg.billingMode }),
    }).catch(() => null);
    if (!res || !res.ok) { showToast("No se pudo guardar el cambio de plan — reintenta", "error"); return; }
    setRestaurants((p) => p.map((x) => x.id === target.id ? { ...x, plan: selectedPlan, maxUsers: cfg.maxUsers, productId: cfg.productId, billingMode: cfg.billingMode } : x));
    addAudit("Plan actualizado", `${target.name}: ${prevLabel} → ${cfg.name}`, "billing", target.name);
    showToast(`Plan de ${target.name} actualizado a ${cfg.name}`);
  };

  const total = restaurants.reduce((s, r) => s + r.balance, 0);
  const revenue = restaurants.filter((r) => r.plan !== "trial" && r.status === "active").reduce((s, r) => s + planPrice(r.plan, planConfigs), 0);

  return (
    <div>
      <div className="sa-section-header">
        <div><div className="sa-section-title"><Icon name="credit-card" size={22} /> Cuentas y pagos</div><div className="sa-section-sub">Historial, deudas y planes de todos los restaurantes</div></div>
      </div>

      <div className="sa-kpi-strip" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <div className="sa-kpi-card">
          <div className="sa-kpi-top"><span className="sa-kpi-label">Al corriente</span><div className="sa-kpi-icon" style={{ background: "rgba(0,230,118,.1)", color: "var(--accent)" }}><Icon name="check-circle" /></div></div>
          <div className="sa-kpi-value">{restaurants.filter((r) => r.balance === 0).length}</div>
          <div className="sa-kpi-delta">restaurantes</div>
        </div>
        <div className="sa-kpi-card">
          <div className="sa-kpi-top"><span className="sa-kpi-label">Deuda acumulada</span><div className="sa-kpi-icon" style={{ background: "rgba(239,68,68,.12)", color: "#ef4444" }}><Icon name="alert-triangle" /></div></div>
          <div className="sa-kpi-value" style={{ color: total > 0 ? "#ef4444" : undefined }}>${total.toLocaleString()}</div>
          <div className={`sa-kpi-delta${total > 0 ? " down" : ""}`}>{restaurants.filter((r) => r.balance > 0).length} con saldo</div>
        </div>
        <div className="sa-kpi-card">
          <div className="sa-kpi-top"><span className="sa-kpi-label">MRR activo</span><div className="sa-kpi-icon" style={{ background: "rgba(99,102,241,.12)", color: "#818cf8" }}><Icon name="trending-up" /></div></div>
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
                <td><Badge type={planColor(r.plan, planConfigs)}>{planLabel(r.plan, planConfigs)}</Badge></td>
                <td style={{ color: "var(--text-secondary)" }}>{r.lastPayment}</td>
                <td style={{ color: r.nextPayment === "Vencida" ? "#ef4444" : "var(--text-primary)", fontWeight: r.nextPayment === "Vencida" ? 700 : 400 }}>{r.nextPayment}</td>
                <td style={{ color: r.balance > 0 ? "#ef4444" : "var(--accent)", fontWeight: 700 }}>{r.balance > 0 ? `$${r.balance.toLocaleString()}` : "—"}</td>
                <td><Badge type={r.balance > 0 ? "danger" : "active"}>{r.balance > 0 ? "Deuda pendiente" : "Al corriente"}</Badge></td>
                <td>
                  <div style={{ display: "flex", gap: "6px" }}>
                    {r.balance > 0 && <button className="sa-btn sm primary" onClick={() => registerPayment(r)}><Icon name="dollar" size={14} /> Liquidar</button>}
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
          <p style={{ fontSize: ".86rem", color: "var(--text-secondary)", marginBottom: "16px" }}>Plan actual: <strong style={{ color: "var(--text-primary)" }}>{planLabel(changePlan.plan, planConfigs)}</strong></p>
          <p style={{ fontSize: ".76rem", color: "var(--text-secondary)", marginBottom: "12px" }}>Cambiar de producto (ej. mi-menu → mi-proyecto) solo actualiza el plan y activa los flags — la copia de datos entre productos es manual por ahora. Usa &quot;Cambiar de plan/producto&quot; desde el detalle del restaurante para el flujo con dry-run.</p>
          {planConfigs.filter((p) => p.active || p.id === changePlan.plan).map((p) => (
            <div key={p.id} onClick={() => setSelectedPlan(p.id)} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px", marginBottom: "8px", borderRadius: "10px", border: `1px solid ${selectedPlan === p.id ? "var(--accent)" : "var(--border)"}`, background: selectedPlan === p.id ? "var(--accent-dim)" : "var(--bg-elevated)", cursor: "pointer", transition: "all .15s" }}>
              <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${selectedPlan === p.id ? "var(--accent)" : "var(--border)"}`, background: selectedPlan === p.id ? "var(--accent)" : "transparent", flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>{p.name} {p.productId && <span style={{ fontSize: ".7rem", fontWeight: 500, color: "var(--text-secondary)" }}>· {p.productId}</span>}</div>
                <div style={{ fontSize: ".78rem", color: "var(--text-secondary)" }}>{p.price === 0 ? `Gratis ${p.trialDays} días` : p.billingMode === "unico" ? `$${p.price.toLocaleString()} único` : `$${p.price.toLocaleString()}/mes`} · máx {p.maxUsers} usuarios</div>
              </div>
              {selectedPlan === p.id && <span style={{ color: "var(--accent)", fontWeight: 700 }}>✓</span>}
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

  // Genera un Blob CSV y dispara una descarga programática mediante un <a> temporal.
  const exportCSV = () => {
    exportCsv("auditoria.csv", ["Fecha", "Tipo", "Usuario", "Restaurante", "Acción", "Detalles", "IP"],
      log.map((e) => [e.ts, e.type, e.user, e.restaurant, e.action, e.details, e.ip]));
    showToast("CSV exportado correctamente");
  };

  return (
    <div>
      <div className="sa-section-header">
        <div><div className="sa-section-title"><Icon name="search" size={22} /> Auditoría</div><div className="sa-section-sub">{log.length} registros · quién hizo qué y cuándo</div></div>
        <button className="sa-btn" onClick={exportCSV}><Icon name="download" size={16} /> Exportar CSV</button>
      </div>

      <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
        <div className="sa-search" style={{ flex: 1, minWidth: "200px" }}>
          <span style={{ color: "var(--text-muted)", display: "flex" }}><Icon name="search" size={16} /></span>
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
                  <td><span style={{ display: "flex", alignItems: "center", gap: "6px" }}><Icon name={AUDIT_ICONS[e.type]} size={16} /> <Badge type={AUDIT_COLORS[e.type]}>{e.type}</Badge></span></td>
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

// ─── Flota de clientes ──────────────────────────────────────────────────────────
// Monitoreo de salud de todas las instancias de clientes. Lee el caché de sa_fleet_status
// (lo llena el cron /api/cron/fleet-refresh cada 15 min); el botón 🔄 por fila refresca bajo
// demanda. Sin VERCEL_TOKEN/GITHUB_TOKEN configurados, el health-check HTTP sigue funcionando
// y el resto queda en 'unknown' — nunca truena (ver lib/fleetCheck.ts).

const HEALTH_COLOR: Record<FleetHealth, string> = { ok: "active", warn: "warning", error: "danger", unknown: "muted" };
const HEALTH_DOT: Record<FleetHealth, string> = { ok: "🟢", warn: "🟡", error: "🔴", unknown: "⚪" };

function Flota({ restaurants, fleetStatus, clientUpdates, setFleetStatus, showToast, productConfigs }: {
  restaurants: Restaurant[];
  fleetStatus: FleetStatus[];
  clientUpdates: ClientUpdate[];
  setFleetStatus: React.Dispatch<React.SetStateAction<FleetStatus[]>>;
  showToast: (msg: string, type?: Toast["type"]) => void;
  productConfigs: ProductConfig[];
}) {
  const [productFilter, setProductFilter] = useState<"all" | string>("all");
  const [healthFilter, setHealthFilter] = useState<"all" | FleetHealth>("all");
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState<Record<string, boolean>>({});
  const [detail, setDetail] = useState<Restaurant | null>(null);

  const statusByPk = new Map(fleetStatus.map((f) => [f.restaurantPk, f]));

  const rows = restaurants
    .map((r) => ({ r, s: statusByPk.get(r.id) }))
    .filter(({ r, s }) => {
      const matchProduct = productFilter === "all" || (r.productId ?? "mi-proyecto") === productFilter;
      const matchHealth = healthFilter === "all" || (s?.health ?? "unknown") === healthFilter;
      const matchSearch = search === "" || r.name.toLowerCase().includes(search.toLowerCase()) || (r.deployUrl ?? "").toLowerCase().includes(search.toLowerCase());
      return matchProduct && matchHealth && matchSearch;
    });

  const counts = { ok: 0, warn: 0, error: 0, unknown: 0 };
  for (const r of restaurants) counts[(statusByPk.get(r.id)?.health ?? "unknown")]++;

  const refreshOne = async (r: Restaurant) => {
    setRefreshing((p) => ({ ...p, [r.id]: true }));
    try {
      const res = await fetch('/api/superadmin/fleet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ restaurantId: r.id }) });
      if (!res.ok) { showToast(`No se pudo refrescar ${r.name}`, "error"); return; }
      const updated: FleetStatus = await res.json();
      setFleetStatus((prev) => [updated, ...prev.filter((f) => f.restaurantPk !== r.id)]);
      showToast(`${r.name} actualizado`);
    } finally {
      setRefreshing((p) => ({ ...p, [r.id]: false }));
    }
  };

  const exportCSV = () => {
    exportCsv("flota.csv", ["Cliente", "Producto", "Estado", "Vercel", "Deploy SHA", "Parches pendientes", "Último check"],
      rows.map(({ r, s }) => [r.name, r.productId ?? "", s?.health ?? "unknown", s?.vercelState ?? "", s?.vercelDeploySha ?? "", s?.commitsBehind ?? "", s?.checkedAt ?? ""]));
    showToast("CSV exportado correctamente");
  };

  return (
    <div>
      <div className="sa-section-header">
        <div><div className="sa-section-title"><Icon name="activity" size={22} /> Flota de clientes</div><div className="sa-section-sub">{restaurants.length} instancias · {counts.ok} al día · {counts.warn} con pendientes · {counts.error} caídas</div></div>
        <button className="sa-btn" onClick={exportCSV}><Icon name="download" size={16} /> Exportar CSV</button>
      </div>

      <div className="sa-kpi-strip" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <div className="sa-kpi-card"><div className="sa-kpi-top"><span className="sa-kpi-label">🟢 Al día</span></div><div className="sa-kpi-value">{counts.ok}</div></div>
        <div className="sa-kpi-card"><div className="sa-kpi-top"><span className="sa-kpi-label">🟡 Con pendientes</span></div><div className="sa-kpi-value">{counts.warn}</div></div>
        <div className="sa-kpi-card"><div className="sa-kpi-top"><span className="sa-kpi-label">🔴 Caídas</span></div><div className="sa-kpi-value">{counts.error}</div></div>
        <div className="sa-kpi-card"><div className="sa-kpi-top"><span className="sa-kpi-label">⚪ Sin config</span></div><div className="sa-kpi-value">{counts.unknown}</div></div>
      </div>

      <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap", marginTop: "16px" }}>
        <div className="sa-search" style={{ flex: 1, minWidth: "200px" }}>
          <span style={{ color: "var(--text-muted)", display: "flex" }}><Icon name="search" size={16} /></span>
          <input placeholder="Buscar por nombre o URL…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {["all", ...productConfigs.map((p) => p.id)].map((f) => (
          <button key={f} className={`sa-chip${productFilter === f ? " active" : ""}`} onClick={() => setProductFilter(f)}>{f === "all" ? "Todos" : f}</button>
        ))}
        {(["all", "ok", "warn", "error", "unknown"] as const).map((f) => (
          <button key={f} className={`sa-chip${healthFilter === f ? " active" : ""}`} onClick={() => setHealthFilter(f)}>{f === "all" ? "Cualquier estado" : `${HEALTH_DOT[f]} ${f}`}</button>
        ))}
      </div>

      <div className="sa-card">
        <table className="sa-table">
          <thead><tr><th>Cliente</th><th>Producto</th><th>Estado</th><th>Deploy</th><th>Versión</th><th>Últ. check</th><th>Acciones</th></tr></thead>
          <tbody>
            {rows.length === 0
              ? <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--text-muted)", padding: "30px" }}>Sin resultados</td></tr>
              : rows.map(({ r, s }) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.name}</td>
                  <td style={{ color: "var(--text-secondary)" }}>{r.productId ?? "mi-proyecto"}</td>
                  <td><Badge type={HEALTH_COLOR[s?.health ?? "unknown"]}>{HEALTH_DOT[s?.health ?? "unknown"]} {s?.healthReason ?? "Sin chequear"}</Badge></td>
                  <td style={{ color: "var(--text-secondary)", fontSize: ".82rem" }}>{s?.vercelState ?? "—"}</td>
                  <td style={{ fontFamily: "monospace", fontSize: ".78rem", color: "var(--text-secondary)" }}>{s?.vercelDeploySha?.slice(0, 7) ?? s?.repoHeadSha?.slice(0, 7) ?? "—"}</td>
                  <td style={{ color: "var(--text-muted)", fontSize: ".78rem", whiteSpace: "nowrap" }}>{s?.checkedAt ? new Date(s.checkedAt).toLocaleTimeString() : "nunca"}</td>
                  <td>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button className="sa-btn sm" onClick={() => refreshOne(r)} disabled={refreshing[r.id]}><Icon name="refresh" size={14} /></button>
                      <button className="sa-btn sm" onClick={() => setDetail(r)}><Icon name="eye" size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {detail && (() => {
        const s = statusByPk.get(detail.id);
        const history = clientUpdates.filter((u) => u.restaurantPk === detail.id).slice(0, 5);
        return (
          <Modal title={`${detail.name} — Flota`} onClose={() => setDetail(null)}>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "16px" }}>
              {[
                ["Estado", `${HEALTH_DOT[s?.health ?? "unknown"]} ${s?.healthReason ?? "Sin chequear"}`],
                ["URL", detail.deployUrl ?? "—"], ["Repo", detail.repoOwner && detail.repoName ? `${detail.repoOwner}/${detail.repoName}` : "—"],
                ["Vercel", s?.vercelState ?? "—"], ["Error Vercel", s?.vercelError ?? "—"],
                ["Parches pendientes", s?.commitsBehind != null ? String(s.commitsBehind) : "—"], ["Error GitHub", s?.githubError ?? "—"],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)", fontSize: ".84rem" }}>
                  <span style={{ color: "var(--text-secondary)" }}>{k}</span>
                  <span style={{ fontWeight: 600, color: "var(--text-primary)", textAlign: "right" }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: ".78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text-secondary)", marginBottom: "8px" }}>Últimos parches</div>
            {history.length === 0
              ? <div style={{ fontSize: ".82rem", color: "var(--text-muted)" }}>Sin historial todavía</div>
              : history.map((u) => (
                <div key={u.id} style={{ fontSize: ".82rem", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                  <strong>{u.versionLabel ?? u.commitHash}</strong> — {u.descripcion ?? u.commitMessage} <Badge type={RESULT_COLORS[u.resultado]}>{RESULT_LABELS[u.resultado]}</Badge>
                </div>
              ))}
          </Modal>
        );
      })()}
    </div>
  );
}

// ─── Client Updates (historial de parches) ─────────────────────────────────────
// Clon estructural de AuditLog (mismo patrón sa-tabs + sa-search + tabla + exportCSV),
// más un bloque de "cobertura del último parche" y un formulario para registrar uno nuevo.

const UPDATE_ICONS: Record<UpdateTipo, IconName> = { fix: "wrench", feature: "plus", security: "shield", config: "edit", rollback: "unlock" };
const UPDATE_COLORS: Record<UpdateTipo, string> = { fix: "info", feature: "active", security: "danger", config: "muted", rollback: "warning" };
const RESULT_COLORS: Record<UpdateResultado, string> = { pendiente: "muted", aplicado: "info", deploy_ok: "active", deploy_error: "danger", revertido: "warning" };
const RESULT_LABELS: Record<UpdateResultado, string> = { pendiente: "Pendiente", aplicado: "Aplicado", deploy_ok: "Deploy OK", deploy_error: "Deploy falló", revertido: "Revertido" };

function ClientUpdates({ updates, restaurants, onCreated, showToast, productConfigs }: {
  updates: ClientUpdate[];
  restaurants: Restaurant[];
  onCreated: (entries: ClientUpdate[]) => void;
  showToast: (msg: string, type?: Toast["type"]) => void;
  productConfigs: ProductConfig[];
}) {
  const [filter, setFilter] = useState<"all" | UpdateTipo>("all");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [target, setTarget] = useState<"mi-card" | "mi-menu" | "mi-proyecto" | string>("mi-proyecto");
  const [commitHash, setCommitHash] = useState("");
  const [versionLabel, setVersionLabel] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [tipo, setTipo] = useState<UpdateTipo>("fix");
  const [saving, setSaving] = useState(false);

  const filtered = updates.filter((u) => {
    const matchType = filter === "all" || u.tipo === filter;
    const q = search.toLowerCase();
    const matchSearch = search === "" || u.restaurantName.toLowerCase().includes(q) || (u.descripcion ?? "").toLowerCase().includes(q) || (u.commitMessage ?? "").toLowerCase().includes(q);
    return matchType && matchSearch;
  });

  // Cobertura: agrupa por el versionLabel más reciente que exista en el historial.
  const latestLabel = updates[0]?.versionLabel;
  const latestBatch = latestLabel ? updates.filter((u) => u.versionLabel === latestLabel) : [];
  const coverage = {
    ok: latestBatch.filter((u) => u.resultado === "aplicado" || u.resultado === "deploy_ok").length,
    pending: latestBatch.filter((u) => u.resultado === "pendiente").length,
    error: latestBatch.filter((u) => u.resultado === "deploy_error").length,
  };

  const exportCSV = () => {
    exportCsv("parches.csv", ["Fecha", "Tipo", "Cliente", "Producto", "Commit", "Descripción", "Resultado", "Aplicado por"],
      updates.map((u) => [u.aplicadoAt, u.tipo, u.restaurantName, u.productId ?? "", u.commitHash ?? "", u.descripcion ?? "", u.resultado, u.aplicadoPor]));
    showToast("CSV exportado correctamente");
  };

  const isProduct = productConfigs.some((p) => p.id === target);

  const submit = async () => {
    if (!commitHash.trim() && !descripcion.trim()) { showToast("Indica al menos el commit o una descripción", "error"); return; }
    setSaving(true);
    const body: Record<string, unknown> = {
      commitHash: commitHash.trim() || undefined,
      versionLabel: versionLabel.trim() || undefined,
      descripcion: descripcion.trim() || undefined,
      tipo,
      resultado: "aplicado",
    };
    if (isProduct) body.product = target; else body.restaurantIds = [target];

    const res = await fetch('/api/superadmin/client-updates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setSaving(false);
    if (!res.ok) { showToast("No se pudo registrar el parche", "error"); return; }
    const data = await res.json();
    onCreated(data.entries ?? []);
    const skippedMsg = data.skipped?.length ? ` · ${data.skipped.length} excluidos (sin actualizaciones vigentes)` : "";
    showToast(`Parche registrado para ${data.created} cliente(s)${skippedMsg}`);
    setShowForm(false); setCommitHash(""); setVersionLabel(""); setDescripcion("");
  };

  const inpStyle: React.CSSProperties = { width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-light)", borderRadius: "8px", padding: "9px 12px", color: "var(--text-primary)", fontSize: ".86rem", outline: "none", fontFamily: "inherit", boxSizing: "border-box", marginBottom: "12px" };
  const labelStyle: React.CSSProperties = { display: "block", color: "var(--text-secondary)", fontSize: ".78rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "5px" };

  return (
    <div>
      <div className="sa-section-header">
        <div><div className="sa-section-title"><Icon name="refresh" size={22} /> Parches y versiones</div><div className="sa-section-sub">{updates.length} registros · historial de actualizaciones aplicadas por cliente</div></div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button className="sa-btn" onClick={exportCSV}><Icon name="download" size={16} /> Exportar CSV</button>
          <button className="sa-btn primary" onClick={() => setShowForm(true)}><Icon name="plus" size={16} /> Registrar parche</button>
        </div>
      </div>

      {latestLabel && (
        <div className="sa-card" style={{ marginBottom: "16px", padding: "14px 18px" }}>
          <div style={{ fontSize: ".82rem", color: "var(--text-secondary)", marginBottom: "8px" }}>Último parche · <strong style={{ color: "var(--text-primary)" }}>{latestLabel}</strong></div>
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", fontSize: ".84rem" }}>
            <span style={{ color: "var(--accent)", fontWeight: 700 }}>🟢 Al día {coverage.ok}</span>
            <span style={{ color: "#eab308", fontWeight: 700 }}>🟡 Pendientes {coverage.pending}</span>
            <span style={{ color: "#ef4444", fontWeight: 700 }}>🔴 Falló el deploy {coverage.error}</span>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
        <div className="sa-search" style={{ flex: 1, minWidth: "200px" }}>
          <span style={{ color: "var(--text-muted)", display: "flex" }}><Icon name="search" size={16} /></span>
          <input placeholder="Buscar cliente, commit, descripción…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="sa-tabs" style={{ margin: 0 }}>
          {(["all", "fix", "feature", "security", "config", "rollback"] as const).map((t) => (
            <button key={t} className={`sa-tab${filter === t ? " active" : ""}`} onClick={() => setFilter(t)}>
              {t === "all" ? "Todos" : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="sa-card">
        <table className="sa-table">
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Cliente</th><th>Producto</th><th>Commit</th><th>Descripción</th><th>Resultado</th><th>Por</th></tr></thead>
          <tbody>
            {filtered.length === 0
              ? <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--text-muted)", padding: "30px" }}>Sin registros</td></tr>
              : filtered.map((u) => (
                <tr key={u.id}>
                  <td style={{ color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{new Date(u.aplicadoAt).toLocaleString()}</td>
                  <td><span style={{ display: "flex", alignItems: "center", gap: "6px" }}><Icon name={UPDATE_ICONS[u.tipo]} size={16} /> <Badge type={UPDATE_COLORS[u.tipo]}>{u.tipo}</Badge></span></td>
                  <td style={{ fontWeight: 600 }}>{u.restaurantName}</td>
                  <td style={{ color: "var(--text-secondary)" }}>{u.productId ?? "—"}</td>
                  <td style={{ fontFamily: "monospace", fontSize: ".78rem", color: "var(--text-secondary)" }}>{u.versionLabel ?? u.commitHash?.slice(0, 7) ?? "—"}</td>
                  <td style={{ color: "var(--text-secondary)", fontSize: ".82rem" }}>{u.descripcion ?? u.commitMessage ?? "—"}</td>
                  <td><Badge type={RESULT_COLORS[u.resultado]}>{RESULT_LABELS[u.resultado]}</Badge></td>
                  <td style={{ color: "var(--text-muted)", fontSize: ".8rem" }}>{u.aplicadoPor}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <Modal title="Registrar parche" onClose={() => setShowForm(false)}>
          <label style={labelStyle}>Aplicar a</label>
          <select style={{ ...inpStyle, cursor: "pointer" }} value={target} onChange={(e) => setTarget(e.target.value)}>
            <optgroup label="Producto completo">
              {productConfigs.map((p) => <option key={p.id} value={p.id}>Todos los clientes de {p.id}</option>)}
            </optgroup>
            <optgroup label="Cliente específico">
              {restaurants.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </optgroup>
          </select>
          <label style={labelStyle}>Tipo</label>
          <select style={{ ...inpStyle, cursor: "pointer" }} value={tipo} onChange={(e) => setTipo(e.target.value as UpdateTipo)}>
            {(["fix", "feature", "security", "config", "rollback"] as const).map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <label style={labelStyle}>Commit / versión</label>
          <input style={inpStyle} placeholder="a1b2c3d" value={commitHash} onChange={(e) => setCommitHash(e.target.value)} />
          <label style={labelStyle}>Etiqueta de versión (opcional)</label>
          <input style={inpStyle} placeholder="2026-08-21.3" value={versionLabel} onChange={(e) => setVersionLabel(e.target.value)} />
          <label style={labelStyle}>Descripción</label>
          <input style={inpStyle} placeholder="fix: QR de sellado no se generaba en iOS" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
            <button className="sa-btn primary" style={{ flex: 1 }} onClick={submit} disabled={saving}>{saving ? "Guardando…" : "Registrar"}</button>
            <button className="sa-btn" style={{ flex: 1 }} onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Plans ────────────────────────────────────────────────────────────────────

function Plans({ restaurants, setRestaurants, planConfigs, setPlanConfigs, addAudit, showToast, productConfigs }: {
  restaurants: Restaurant[];
  setRestaurants: React.Dispatch<React.SetStateAction<Restaurant[]>>;
  planConfigs: PlanConfig[];
  setPlanConfigs: React.Dispatch<React.SetStateAction<PlanConfig[]>>;
  addAudit: (action: string, details: string, type: AuditType, restaurant?: string) => void;
  showToast: (msg: string, type?: Toast["type"]) => void;
  productConfigs: ProductConfig[];
}) {
  const [assign, setAssign]   = useState<{ plan: Plan; r: Restaurant } | null>(null);
  const [editing, setEditing] = useState<PlanConfig | null>(null);
  const [draft, setDraft]     = useState<PlanConfig | null>(null);

  // Copia profunda del array de features para que editar el draft no mute el estado original.
  const openEditor = (p: PlanConfig) => { setEditing(p); setDraft({ ...p, features: p.features.map((f) => ({ ...f })) }); };

  const saveEdit = () => {
    if (!draft) return;
    setPlanConfigs((prev) => prev.map((p) => p.id === draft.id ? draft : p));
    fetch('/api/superadmin/plans', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: draft.id, price: draft.price, maxUsers: draft.maxUsers, features: draft.features, color: draft.color }) }).catch(() => {})
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

  // Lee el maxUsers del planConfig (no hardcodeado) para que el editor lo pueda cambiar sin tocar este código.
  // Reusa /api/superadmin/upgrade-plan en vez de un PATCH parcial a restaurants: ese endpoint ya
  // recalcula el set completo de campos de un cambio de plan (billing_mode, subscription_status,
  // updates_until, support_until, previous_plan) y deja snapshot en sa_migrations para poder
  // deshacerlo. Un PATCH parcial aquí (como antes) dejaba esos campos desactualizados — ej. pasar
  // de mensual a único no recalculaba updates_until, así que client-updates seguía mandando
  // parches gratis según la ventana vieja.
  const applyAssign = async () => {
    if (!assign) return;
    const target = assign;
    setAssign(null);
    // Sin acknowledgeDataLoss: si esto resulta ser un downgrade de producto, el endpoint lo
    // rechaza — este flujo rápido no tiene la vista previa de "qué se pierde" que sí tiene el
    // modal "Cambiar plan/producto"; para un downgrade real hay que usar ese, no este atajo.
    const res = await fetch('/api/superadmin/upgrade-plan', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurantId: target.r.id, targetPlanId: target.plan, dryRun: false }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (!res || !res.ok || !data?.ok) {
      const hint = data?.hint ? ` ${data.hint}` : "";
      showToast(`${data?.error ?? "No se pudo guardar el cambio de plan"}${hint}`, "error");
      return;
    }
    const cfg = planConfigs.find((p) => p.id === target.plan);
    setRestaurants((p) => p.map((x) => x.id === target.r.id ? { ...x, plan: target.plan, productId: cfg?.productId, billingMode: cfg?.billingMode, maxUsers: data.changes?.maxUsers ?? x.maxUsers } : x));
    addAudit("Plan asignado", `${target.r.name}: → ${cfg?.name ?? target.plan}`, "billing", target.r.name);
    showToast(data.warnings?.length ? `Plan asignado — revisa: ${data.warnings[0]}` : `${target.r.name} movido a plan ${cfg?.name ?? target.plan}`);
  };

  const inpStyle = (extra?: React.CSSProperties): React.CSSProperties => ({
    background: "var(--bg-input)", border: "1px solid var(--border-light)", borderRadius: "8px",
    padding: "8px 12px", color: "var(--text-primary)", fontSize: ".86rem", outline: "none",
    fontFamily: "inherit", width: "100%", boxSizing: "border-box", ...extra,
  });

  const counts = Object.fromEntries(planConfigs.map((p) => [p.id, restaurants.filter((r) => r.plan === p.id).length]));

  return (
    <div>
      <div className="sa-section-header">
        <div><div className="sa-section-title"><Icon name="gem" size={22} /> Planes y niveles</div><div className="sa-section-sub">Edita precio, usuarios y características de cada plan</div></div>
      </div>

      {/* Plan cards — agrupadas por producto. Los planes legacy (trial/basic/premium, inactive)
          no se muestran aquí pero siguen resolviendo en la tabla de abajo para clientes que ya los tienen. */}
      {productConfigs.map((prod) => {
        const plansOfProduct = planConfigs.filter((p) => p.active && p.productId === prod.id);
        if (plansOfProduct.length === 0) return null;
        return (
          <div key={prod.id} style={{ marginBottom: "24px" }}>
            <div style={{ fontSize: ".8rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text-secondary)", marginBottom: "10px" }}>{prod.id}</div>
            <div className="sa-grid-3">
              {plansOfProduct.map((p) => (
                <div key={p.id} className="sa-plan-card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: "1rem", color: p.color, marginBottom: "4px" }}>{p.name}</div>
                      <div className="sa-plan-price">
                        {p.price === 0 ? "Gratis" : `$${p.price.toLocaleString()}`}
                        <span>{p.price === 0 ? ` · ${p.trialDays} días` : p.billingMode === "unico" ? " único" : " / mes"}</span>
                      </div>
                      <div style={{ fontSize: ".75rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                        Máx {p.maxUsers} usuarios
                      </div>
                    </div>
                    <span style={{ fontSize: ".72rem", padding: "3px 8px", borderRadius: "20px", background: "var(--bg-elevated)", color: "var(--text-secondary)", fontWeight: 600 }}>
                      {counts[p.id] ?? 0} clientes
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "6px", marginBottom: "10px", flexWrap: "wrap" }}>
                    <Badge type={p.incluyeActualizaciones ? "active" : "muted"}>
                      {p.incluyeActualizaciones ? `Actualizaciones ${p.mesesActualizaciones ? `· ${p.mesesActualizaciones}m` : "ilimitadas"}` : "Sin actualizaciones"}
                    </Badge>
                  </div>
                  {p.features.map((f, i) => (
                    <div key={i} className={`sa-plan-feature${f.included ? " included" : ""}`}>
                      <div className={`sa-plan-feature-dot${f.included ? "" : " off"}`} />
                      {f.text}
                    </div>
                  ))}
                  <button className="sa-btn full" style={{ marginTop: "14px", borderColor: p.color, color: p.color }}
                    onClick={() => openEditor(p)}>
                    <Icon name="edit" size={16} /> Editar plan
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Assign table */}
      <div className="sa-card">
        <div className="sa-card-header"><span className="sa-card-title">Asignar plan a restaurante</span></div>
        <div className="sa-card-body">
          <table className="sa-table">
            <thead><tr><th>Restaurante</th><th>Plan actual</th><th>Precio/mes</th><th>Usuarios</th><th>Cambiar a</th></tr></thead>
            <tbody>
              {restaurants.map((r) => {
                // Fallback: si el plan del restaurante ya no está en el catálogo (legacy removido a mano),
                // no truena la fila — muestra el id crudo y sigue permitiendo reasignar.
                const cfg = planConfigs.find((p) => p.id === r.plan) ?? { id: r.plan, name: r.plan, price: 0 } as PlanConfig;
                return (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.name}</td>
                    <td><Badge type={planColor(r.plan, planConfigs)}>{cfg.name}</Badge></td>
                    <td style={{ color: "var(--accent)", fontWeight: 700 }}>{cfg.price === 0 ? "Gratis" : `$${cfg.price.toLocaleString()}`}</td>
                    <td><span style={{ fontWeight: 600 }}>{r.users}</span><span style={{ color: "var(--text-muted)" }}>/{r.maxUsers}</span></td>
                    <td>
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        {planConfigs.filter((p) => p.id !== r.plan && p.active).map((p) => (
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
          <p style={{ fontSize: ".9rem", color: "var(--text-primary)", marginBottom: "20px", lineHeight: 1.6 }}>
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
              <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)", marginTop: "2px" }}>
                {draft.price === 0 ? `Gratis · ${draft.trialDays} días` : `$${draft.price.toLocaleString()}/mes`}
                <span style={{ fontSize: ".8rem", fontWeight: 400, color: "var(--text-secondary)", marginLeft: "8px" }}>· {draft.maxUsers} usuarios máx</span>
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <button className="sa-btn primary" style={{ flex: 1 }} onClick={saveEdit}><Icon name="save" size={16} /> Guardar cambios</button>
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
  const [codes, setCodes] = useState<DiscountCode[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ code: "", discount: 20, type: "%" as "%" | "$", maxUses: 50, expiresAt: "", note: "" });

  useEffect(() => {
    fetch('/api/superadmin/discounts').then(r => r.json()).then(d => { if (Array.isArray(d)) setCodes(d) }).catch(() => {})
  }, []);

  const generate = () => {
    const random = "NICHO" + Math.random().toString(36).toUpperCase().slice(2, 7);
    setForm((p) => ({ ...p, code: random }));
  };

  const create = async () => {
    if (!form.code || !form.expiresAt) { showToast("Completa código y fecha", "error"); return; }
    const res = await fetch('/api/superadmin/discounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, maxUses: form.maxUses }) })
    if (!res.ok) { showToast("Error al crear código", "error"); return; }
    const nc: DiscountCode = await res.json()
    setCodes((p) => [nc, ...p]);
    addAudit("Código de descuento creado", `${form.code} · ${form.discount}${form.type} · exp. ${form.expiresAt}`, "create");
    showToast(`Código ${form.code} creado`);
    setForm({ code: "", discount: 20, type: "%", maxUses: 50, expiresAt: "", note: "" });
    setShowForm(false);
  };

  const toggleActive = (id: string) => {
    const c = codes.find((x) => x.id === id)!;
    setCodes((p) => p.map((x) => x.id === id ? { ...x, active: !x.active } : x));
    fetch(`/api/superadmin/discounts/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !c.active }) }).catch(() => {})
    showToast(`Código ${c.code} ${c.active ? "desactivado" : "activado"}`);
  };

  // Copia el código al portapapeles usando la Clipboard API nativa.
  const copy = (code: string) => {
    navigator.clipboard.writeText(code).then(() => showToast(`Código "${code}" copiado`, "info"));
  };

  const inpStyle: React.CSSProperties = { background: "var(--bg-input)", border: "1px solid var(--border-light)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontSize: ".86rem", outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box" };

  return (
    <div>
      <div className="sa-section-header">
        <div><div className="sa-section-title"><Icon name="tag" size={22} /> Códigos de descuento</div><div className="sa-section-sub">Genera y gestiona cupones para tus restaurantes</div></div>
        <button className="sa-btn primary" onClick={() => setShowForm(true)}>+ Nuevo código</button>
      </div>

      <div className="sa-kpi-strip" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <div className="sa-kpi-card">
          <div className="sa-kpi-top"><span className="sa-kpi-label">Códigos activos</span><div className="sa-kpi-icon" style={{ background: "rgba(0,230,118,.1)", color: "var(--accent)" }}><Icon name="check-circle" /></div></div>
          <div className="sa-kpi-value">{codes.filter((c) => c.active).length}</div>
        </div>
        <div className="sa-kpi-card">
          <div className="sa-kpi-top"><span className="sa-kpi-label">Usos totales</span><div className="sa-kpi-icon" style={{ background: "rgba(99,102,241,.12)", color: "#818cf8" }}><Icon name="bar-chart" /></div></div>
          <div className="sa-kpi-value">{codes.reduce((s, c) => s + c.uses, 0)}</div>
        </div>
        <div className="sa-kpi-card">
          <div className="sa-kpi-top"><span className="sa-kpi-label">Tasa de uso</span><div className="sa-kpi-icon" style={{ background: "rgba(251,191,36,.12)", color: "#fbbf24" }}><Icon name="target" /></div></div>
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
                    <span style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--text-primary)", fontSize: ".9rem" }}>{c.code}</span>
                    <button onClick={() => copy(c.code)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}><Icon name="clipboard" size={15} /></button>
                  </div>
                </td>
                <td style={{ fontWeight: 700, color: "var(--accent)", fontSize: ".95rem" }}>{c.discount}{c.type}</td>
                <td>
                  <span style={{ fontWeight: 600 }}>{c.uses}</span>
                  <span style={{ color: "var(--text-muted)" }}>/{c.maxUses}</span>
                  <div style={{ marginTop: "4px", height: "4px", background: "var(--bg-elevated)", borderRadius: "2px", width: "60px", overflow: "hidden" }}>
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
                <button className="sa-btn sm" style={{ height: "36px" }} onClick={generate}><Icon name="shuffle" size={14} /> Auto</button>
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
              <button className="sa-btn primary" style={{ flex: 1 }} onClick={create}><Icon name="check-circle" size={16} /> Crear código</button>
              <button className="sa-btn" style={{ flex: 1 }} onClick={() => setShowForm(false)}>Cancelar</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Activity ─────────────────────────────────────────────────────────────────

function Activity({ restaurants, planConfigs }: { restaurants: Restaurant[]; planConfigs: PlanConfig[] }) {
  const sorted = [...restaurants].sort((a, b) => b.loginCount - a.loginCount);
  const avgLogins = Math.round(restaurants.reduce((s, r) => s + r.loginCount, 0) / restaurants.length);

  // Clasifica la salud de cada restaurante: suspended=0, maintenance=30, 0 logins=10, >50=70, >200=100.
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
        <div><div className="sa-section-title"><Icon name="trending-up" size={22} /> Actividad</div><div className="sa-section-sub">Saldo y uso de cada restaurante en la plataforma</div></div>
      </div>

      <div className="sa-kpi-strip">
        <div className="sa-kpi-card">
          <div className="sa-kpi-top"><span className="sa-kpi-label">Muy activos</span><div className="sa-kpi-icon" style={{ background: "rgba(0,230,118,.1)", color: "var(--accent)" }}><Icon name="circle" /></div></div>
          <div className="sa-kpi-value">{restaurants.filter((r) => r.loginCount > 200).length}</div>
          <div className="sa-kpi-delta">+200 logins/mes</div>
        </div>
        <div className="sa-kpi-card">
          <div className="sa-kpi-top"><span className="sa-kpi-label">Poco activos</span><div className="sa-kpi-icon" style={{ background: "rgba(251,191,36,.12)", color: "#fbbf24" }}><Icon name="circle" /></div></div>
          <div className="sa-kpi-value">{restaurants.filter((r) => r.loginCount > 0 && r.loginCount <= 50 && r.status === "active").length}</div>
          <div className="sa-kpi-delta">riesgo de churn</div>
        </div>
        <div className="sa-kpi-card">
          <div className="sa-kpi-top"><span className="sa-kpi-label">Sin actividad</span><div className="sa-kpi-icon" style={{ background: "rgba(239,68,68,.12)", color: "#ef4444" }}><Icon name="circle" /></div></div>
          <div className="sa-kpi-value">{restaurants.filter((r) => r.loginCount === 0).length}</div>
          <div className="sa-kpi-delta">nunca iniciaron</div>
        </div>
        <div className="sa-kpi-card">
          <div className="sa-kpi-top"><span className="sa-kpi-label">Promedio logins</span><div className="sa-kpi-icon" style={{ background: "rgba(99,102,241,.12)", color: "#818cf8" }}><Icon name="bar-chart" /></div></div>
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
                      <div style={{ width: "80px", height: "6px", background: "var(--bg-elevated)", borderRadius: "3px", overflow: "hidden" }}>
                        <div style={{ height: "100%", background: h.color, borderRadius: "3px", width: `${h.score}%`, transition: "width .4s" }} />
                      </div>
                      <span style={{ fontSize: ".78rem", color: h.color, fontWeight: 600 }}>{h.label}</span>
                    </div>
                  </td>
                  <td><Badge type={planColor(r.plan, planConfigs)}>{planLabel(r.plan, planConfigs)}</Badge></td>
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
              <div style={{ width: 32, height: 32, borderRadius: "8px", background: "var(--bg-elevated)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name="pin" size={16} /></div>
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

function Maintenance({ restaurants, setRestaurants, addAudit, showToast, planConfigs }: {
  restaurants: Restaurant[];
  setRestaurants: React.Dispatch<React.SetStateAction<Restaurant[]>>;
  addAudit: (action: string, details: string, type: AuditType, restaurant?: string) => void;
  showToast: (msg: string, type?: Toast["type"]) => void;
  planConfigs: PlanConfig[];
}) {
  const [reasons, setReasons] = useState<Record<string, string>>(
    Object.fromEntries(restaurants.map((r) => [r.id, r.status === "maintenance" ? "Migración de base de datos" : ""]))
  );

  // Alterna entre mantenimiento y activo. No toca el estado "suspended" (eso es responsabilidad de Billing).
  const toggle = async (r: Restaurant) => {
    const next: Status = r.status === "maintenance" ? "active" : "maintenance";
    const res = await fetch(`/api/superadmin/restaurants/${r.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }),
    }).catch(() => null);
    if (!res || !res.ok) { showToast("No se pudo guardar el cambio de mantenimiento — reintenta", "error"); return; }
    setRestaurants((p) => p.map((x) => x.id === r.id ? { ...x, status: next } : x));
    addAudit(`Modo mantenimiento ${next === "maintenance" ? "activado" : "desactivado"}`, `${r.name}${reasons[r.id] ? ` — ${reasons[r.id]}` : ""}`, "update", r.name);
    showToast(`${r.name}: mantenimiento ${next === "maintenance" ? "activado" : "desactivado"}`);
  };

  return (
    <div>
      <div className="sa-section-header">
        <div><div className="sa-section-title"><Icon name="wrench" size={22} /> Modo mantenimiento</div><div className="sa-section-sub">Bloquea el acceso a un restaurante sin afectar los demás</div></div>
        <Badge type="warning">{restaurants.filter((r) => r.status === "maintenance").length} en mantenimiento</Badge>
      </div>
      <div className="sa-card">
        <div className="sa-card-body" style={{ paddingTop: "12px" }}>
          {restaurants.map((r) => (
            <div key={r.id} className="sa-maint-row">
              <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1 }}>
                <div style={{ width: 36, height: 36, borderRadius: "10px", background: "var(--bg-elevated)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name="store" /></div>
                <div style={{ flex: "0 0 160px" }}>
                  <div style={{ fontWeight: 600, fontSize: ".9rem" }}>{r.name}</div>
                  <div style={{ fontSize: ".75rem", color: "var(--text-secondary)" }}>{planLabel(r.plan, planConfigs)} · {r.users} usuarios</div>
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

type Ticket = {
  id: string;
  restaurant_id: string;
  restaurant_name: string | null;
  from_name: string;
  from_role: string;
  message: string;
  read: boolean;
  created_at: string;
  source: "main" | "portales";
};

const ROLE_COLOR: Record<string, string> = {
  Empleado: "#3b82f6",
  Resta3:   "#8b5cf6",
  Admin:    "#f59e0b",
};

function Notifications({ showToast }: { showToast: (msg: string, type?: Toast["type"]) => void }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const data = await fetch("/api/superadmin/tickets").then(r => r.json()).catch(() => []);
    setTickets(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function markRead(id: string, source: Ticket["source"]) {
    await fetch("/api/superadmin/tickets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, source }),
    });
    setTickets(t => t.map(x => x.id === id ? { ...x, read: true } : x));
  }

  async function markAllRead() {
    await fetch("/api/superadmin/tickets", { method: "PUT" });
    setTickets(t => t.map(x => ({ ...x, read: true })));
    showToast("Todos marcados como leídos");
  }

  async function deleteTicket(id: string, source: Ticket["source"]) {
    await fetch(`/api/superadmin/tickets?id=${id}&source=${source}`, { method: "DELETE" });
    setTickets(t => t.filter(x => x.id !== id));
    showToast("Reporte eliminado");
  }

  const unread = tickets.filter(t => !t.read).length;

  return (
    <div>
      <div className="sa-section-header">
        <div>
          <div className="sa-section-title"><Icon name="bell" size={22} /> Reportes de soporte</div>
          <div className="sa-section-sub">Mensajes enviados por empleados, Resta3 y admins de los restaurantes</div>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          {unread > 0 && <button className="sa-btn" onClick={markAllRead}>✓ Marcar todos leídos</button>}
          <button className="sa-btn" onClick={load}>↺ Actualizar</button>
        </div>
      </div>

      {loading ? (
        <div className="sa-card" style={{ textAlign: "center", padding: "40px", color: "var(--text-secondary)" }}>Cargando...</div>
      ) : tickets.length === 0 ? (
        <div className="sa-card" style={{ textAlign: "center", padding: "48px", color: "var(--text-secondary)" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "10px", color: "var(--text-muted)" }}><Icon name="inbox" size={40} /></div>
          <div style={{ fontWeight: 600 }}>Sin reportes pendientes</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {tickets.map(ticket => {
            const roleColor = ROLE_COLOR[ticket.from_role] ?? "#6b7280";
            return (
              <div key={ticket.id} className="sa-card" style={{ opacity: ticket.read ? 0.65 : 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px", flexWrap: "wrap" }}>
                      {!ticket.read && (
                        <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#ef4444", flexShrink: 0, display: "inline-block" }} />
                      )}
                      <span style={{ fontWeight: 700, fontSize: ".9rem" }}>{ticket.restaurant_name || ticket.restaurant_id}</span>
                      <span style={{ fontSize: ".72rem", padding: "2px 8px", borderRadius: "999px", background: roleColor + "22", color: roleColor, border: `1px solid ${roleColor}55`, fontWeight: 600 }}>
                        {ticket.from_role}
                      </span>
                      <span style={{ fontSize: ".78rem", color: "var(--text-secondary)" }}>{ticket.from_name}</span>
                    </div>
                    <div style={{ fontSize: ".9rem", lineHeight: 1.5, marginBottom: "6px" }}>{ticket.message}</div>
                    <div style={{ fontSize: ".72rem", color: "var(--text-muted)" }}>
                      {new Date(ticket.created_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                    {!ticket.read && (
                      <button className="sa-btn" onClick={() => markRead(ticket.id, ticket.source)} style={{ fontSize: ".75rem", padding: "4px 10px" }}>✓ Leer</button>
                    )}
                    <button className="sa-btn" onClick={() => deleteTicket(ticket.id, ticket.source)} style={{ fontSize: ".75rem", padding: "4px 10px", color: "#ef4444" }}><Icon name="trash" size={14} /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
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
  const CONNECTED_RESTAURANT = "r1";
  const CONNECTED_PORTALES   = "portales";

  const [flags, setFlags] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    [...EMPLOYEE_MODULES, ...USER_MODULES].forEach((m) => {
      init[`all_${m.id}`] = !m.locked;
      init[`portales_${m.id}`] = !m.locked;
      restaurants.forEach((r) => { init[`${r.id}_${m.id}`] = !m.locked; });
    });
    return init;
  });

  useEffect(() => {
    Promise.all([
      fetch("/api/save-flags?key=employee_permissions").then(r => r.json()),
      fetch("/api/save-flags?key=user_permissions").then(r => r.json()),
      fetch("/api/save-flags?key=employee_permissions_portales").then(r => r.json()),
      fetch("/api/save-flags?key=user_permissions_portales").then(r => r.json()),
    ]).then(([employee, user, empPortales, usrPortales]: [Record<string, boolean>, Record<string, boolean>, Record<string, boolean>, Record<string, boolean>]) => {
      setFlags(prev => {
        const next = { ...prev };
        EMPLOYEE_MODULES.forEach(m => {
          if (m.id in employee) {
            next[`all_${m.id}`] = employee[m.id];
            next[`${CONNECTED_RESTAURANT}_${m.id}`] = employee[m.id];
          }
          if (m.id in empPortales) next[`portales_${m.id}`] = empPortales[m.id];
        });
        USER_MODULES.forEach(m => {
          if (m.id in user) {
            next[`all_${m.id}`] = user[m.id];
            next[`${CONNECTED_RESTAURANT}_${m.id}`] = user[m.id];
          }
          if (m.id in usrPortales) next[`portales_${m.id}`] = usrPortales[m.id];
        });
        return next;
      });
    }).catch(() => {});
  }, []);

  const toggle = (m: typeof modules[0]) => {
    const next = !flags[key(m.id)];
    const newFlags = { ...flags, [key(m.id)]: next };
    const isPortales = sel === CONNECTED_PORTALES;
    if (!isPortales) {
      if (sel === CONNECTED_RESTAURANT) newFlags[`all_${m.id}`] = next;
      if (sel === "all") newFlags[`${CONNECTED_RESTAURANT}_${m.id}`] = next;
    }
    setFlags(newFlags);

    const baseKey = tab === "employee" ? "employee_permissions" : "user_permissions";
    const settingsKey = isPortales ? `${baseKey}_portales` : baseKey;
    const currentMods = tab === "employee" ? EMPLOYEE_MODULES : USER_MODULES;
    const scopePrefix = isPortales ? CONNECTED_PORTALES : "all";
    const perms: Record<string, boolean> = {};
    currentMods.forEach((mod) => { perms[mod.id] = newFlags[`${scopePrefix}_${mod.id}`] ?? !mod.locked; });
    fetch("/api/save-flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settingsKey, flags: perms }),
    }).then(async r => {
      if (!r.ok) { const b = await r.json().catch(() => ({})); showToast(`Error: ${b.error ?? "desconocido"}`, "error"); }
      else { showToast(`${m.name} ${next ? "activado" : "desactivado"} ✓`, "success"); }
    }).catch(() => showToast("Error de conexión", "error"));

    const rolLabel = tab === "employee" ? "Empleado" : "Usuario";
    const ctx = sel === "all" ? "Global" : restaurants.find((r) => r.id === sel)?.name ?? sel;
    addAudit(`Permiso ${next ? "activado" : "desactivado"} — ${rolLabel}`, `${m.name} → ${ctx}`, "update", ctx === "Global" ? "—" : ctx);
  };

  const selName = sel === "all" ? "Todos los restaurantes" : sel === CONNECTED_PORTALES ? "Portales" : restaurants.find((r) => r.id === sel)?.name ?? sel;

  return (
    <div>
      <div className="sa-section-header">
        <div>
          <div className="sa-section-title"><Icon name="lock" size={22} /> Permisos por rol</div>
          <div className="sa-section-sub">Controla qué puede hacer cada empleado y cada cliente</div>
        </div>
      </div>

      {/* Role tabs */}
      <div className="sa-tabs" style={{ marginBottom: "16px" }}>
        <button className={`sa-tab${tab === "employee" ? " active" : ""}`} onClick={() => setTab("employee")}><Icon name="user" size={15} /> Empleado</button>
        <button className={`sa-tab${tab === "user" ? " active" : ""}`} onClick={() => setTab("user")}><Icon name="smartphone" size={15} /> Usuario / Cliente</button>
      </div>

      {/* Restaurant selector */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
        <button className={`sa-chip${sel === "all" ? " active" : ""}`} onClick={() => setSel("all")}><Icon name="globe" size={13} /> Global</button>
        {restaurants.map((r) => (
          <button key={r.id} className={`sa-chip${sel === r.id ? " active" : ""}`} onClick={() => setSel(r.id)}>{r.name}</button>
        ))}
        <button className={`sa-chip${sel === CONNECTED_PORTALES ? " active" : ""}`} onClick={() => setSel(CONNECTED_PORTALES)}><Icon name="store" size={13} /> Portales</button>
      </div>

      <div className="sa-card">
        <div className="sa-card-header">
          <span className="sa-card-title">
            <Icon name={tab === "employee" ? "user" : "smartphone"} size={17} /> {tab === "employee" ? "Módulos del Empleado" : "Módulos del Usuario/Cliente"}
            {" — "}{selName}
          </span>
          <span style={{ fontSize: ".78rem", color: "var(--text-secondary)", display: "inline-flex", alignItems: "center", gap: "4px" }}>
            <Icon name="lock" size={13} /> = requiere aprobación del Super Admin para activar
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
                      {m.locked && <span title="Requiere aprobación del Super Admin" style={{ display: "flex", color: "var(--text-secondary)" }}><Icon name="lock" size={13} /></span>}
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
        <div style={{ fontWeight: 700, color: "#60a5fa", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}><Icon name="info" size={16} /> Cómo funciona la jerarquía de permisos</div>
        <div style={{ fontSize: ".84rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>
          <div>• El <strong style={{ color: "var(--text-primary)" }}>Super Admin</strong> (tú) controla qué módulos existen en la plataforma.</div>
          <div>• El <strong style={{ color: "var(--text-primary)" }}>Admin del restaurante</strong> solo puede activar lo que el Super Admin dejó habilitado.</div>
          <div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }}>• Los módulos con <Icon name="lock" size={13} /> requieren que <strong style={{ color: "var(--text-primary)" }}>el Super Admin los apruebe</strong> antes de que el admin pueda usarlos.</div>
          <div>• El <strong style={{ color: "var(--text-primary)" }}>Empleado y Usuario</strong> solo ven lo que ambos niveles superiores autorizaron.</div>
        </div>
      </div>
    </div>
  );
}

// ─── Solicitudes de acceso ────────────────────────────────────────────────────

function Solicitudes({ requests, setRequests, addAudit, showToast }: {
  requests: AccessRequest[];
  setRequests: React.Dispatch<React.SetStateAction<AccessRequest[]>>;
  addAudit: (action: string, details: string, type: AuditType, restaurant?: string) => void;
  showToast: (msg: string, type?: Toast["type"]) => void;
}) {
  const [rejectModal, setRejectModal] = useState<AccessRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [tab, setTab] = useState<"pending" | "approved" | "rejected">("pending");

  const approve = (r: AccessRequest) => {
    setRequests((p) => p.map((x) => x.id === r.id ? { ...x, status: "approved" } : x));
    fetch(`/api/superadmin/requests/${r.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'approved' }) }).catch(() => {})
    addAudit("Solicitud aprobada", `${r.feature} — ${r.restaurantName}`, "update", r.restaurantName);
    showToast(`Aprobado: ${r.feature} para ${r.restaurantName}`);
  };

  const reject = () => {
    if (!rejectModal) return;
    setRequests((p) => p.map((x) => x.id === rejectModal.id ? { ...x, status: "rejected", rejectReason } : x));
    fetch(`/api/superadmin/requests/${rejectModal.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'rejected', rejectReason }) }).catch(() => {})
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
          <div className="sa-section-title"><Icon name="inbox" size={22} /> Solicitudes de acceso</div>
          <div className="sa-section-sub">Aprueba o rechaza peticiones de los admins para desbloquear funciones</div>
        </div>
        {pending > 0 && <Badge type="warning">{pending} pendiente{pending > 1 ? "s" : ""}</Badge>}
      </div>

      <div className="sa-tabs">
        <button className={`sa-tab${tab === "pending" ? " active" : ""}`} onClick={() => setTab("pending")}>
          <Icon name="clock" size={15} /> Pendientes {pending > 0 && `(${pending})`}
        </button>
        <button className={`sa-tab${tab === "approved" ? " active" : ""}`} onClick={() => setTab("approved")}><Icon name="check-circle" size={15} /> Aprobadas</button>
        <button className={`sa-tab${tab === "rejected" ? " active" : ""}`} onClick={() => setTab("rejected")}><Icon name="x-circle" size={15} /> Rechazadas</button>
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
                    <span style={{ fontWeight: 700, fontSize: ".95rem", color: "var(--text-primary)" }}>{r.restaurantName}</span>
                    <Badge type={tab === "pending" ? "warning" : tab === "approved" ? "active" : "danger"}>
                      {tab === "pending" ? "Pendiente" : tab === "approved" ? "Aprobada" : "Rechazada"}
                    </Badge>
                  </div>
                  <div style={{ fontSize: ".86rem", marginBottom: "6px" }}>
                    Solicita activar: <strong style={{ color: "var(--accent)", display: "inline-flex", alignItems: "center", gap: "4px" }}><Icon name="unlock" size={14} /> {r.feature}</strong>
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
                      <Icon name="check-circle" size={16} /> Aprobar
                    </button>
                    <button className="sa-btn danger" onClick={() => { setRejectModal(r); setRejectReason(""); }}>
                      <Icon name="x-circle" size={16} /> Rechazar
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
            Escribe el motivo del rechazo. Se le enviará al admin de <strong style={{ color: "var(--text-primary)" }}>{rejectModal.restaurantName}</strong>.
          </p>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Ej. Esta función no está incluida en su plan actual..."
            rows={3}
            style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-light)", borderRadius: "8px", padding: "10px 12px", color: "var(--text-primary)", fontSize: ".86rem", outline: "none", fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", marginBottom: "14px" }}
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
  const [configs, setConfigs] = useState<SecurityConfig[]>([]);
  const [sel, setSel] = useState<string>("");

  useEffect(() => {
    fetch('/api/superadmin/security').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setConfigs(d)
    }).catch(() => {})
  }, []);

  useEffect(() => {
    if (!sel && restaurants.length > 0) setSel(restaurants[0].id)
  }, [restaurants, sel]);

  const cfg = configs.find((c) => c.restaurantId === sel);
  const restaurant = restaurants.find((r) => r.id === sel);

  const update = (field: keyof SecurityConfig, value: string | number | boolean) => {
    setConfigs((p) => {
      const existing = p.find(c => c.restaurantId === sel)
      if (existing) return p.map((c) => c.restaurantId === sel ? { ...c, [field]: value } : c)
      return [...p, { restaurantId: sel, sessionHours: 8, pinRequired: false, allowedStart: '07:00', allowedEnd: '23:00', maxFailedLogins: 5, ipWhitelist: false, [field]: value }]
    })
  };

  const save = () => {
    const current = configs.find(c => c.restaurantId === sel) ?? { restaurantId: sel, sessionHours: 8, pinRequired: false, allowedStart: '07:00', allowedEnd: '23:00', maxFailedLogins: 5, ipWhitelist: false }
    fetch('/api/superadmin/security', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(current) }).catch(() => {})
    addAudit("Configuración de seguridad actualizada", `${restaurant?.name}`, "update", restaurant?.name);
    showToast(`Seguridad de ${restaurant?.name} guardada`);
  };

  const inpStyle: React.CSSProperties = { background: "var(--bg-input)", border: "1px solid var(--border-light)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontSize: ".86rem", outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box" };

  const rowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 0", borderBottom: "1px solid var(--border)" };

  return (
    <div>
      <div className="sa-section-header">
        <div>
          <div className="sa-section-title"><Icon name="shield" size={22} /> Seguridad</div>
          <div className="sa-section-sub">Protege el acceso de empleados y usuarios por restaurante</div>
        </div>
        <button className="sa-btn primary" onClick={save}><Icon name="save" size={16} /> Guardar</button>
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
            <div className="sa-card-header"><span className="sa-card-title"><Icon name="clock" size={17} /> Sesión y acceso</span></div>
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
            <div className="sa-card-header"><span className="sa-card-title"><Icon name="clock" size={17} /> Horario de acceso</span></div>
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
            <div className="sa-card-header"><span className="sa-card-title"><Icon name="clipboard" size={17} /> Resumen de seguridad — {restaurant?.name}</span></div>
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

// ─── Ventas Reales ────────────────────────────────────────────────────────────

function VentasReales() {
  const [data, setData]       = useState<RevenueData[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState<string>('default');

  useEffect(() => {
    fetch('/api/superadmin/revenue')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) { setData(d); if (d[0]) setTab(d[0].id) } })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, []);

  const fmt = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 0 })}`

  const app = data.find(d => d.id === tab)
  const allToday = data.reduce((s, d) => s + d.today.total, 0)
  const allMonth = data.reduce((s, d) => s + d.month.total, 0)
  const allOrders = data.reduce((s, d) => s + d.month.orders, 0)

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando ventas...</div>

  return (
    <div>
      <div className="sa-section-header">
        <div><div className="sa-section-title"><Icon name="dollar" size={22} /> Ventas Reales</div><div className="sa-section-sub">Ingresos en tiempo real de cada restaurante conectado</div></div>
      </div>

      {/* KPIs globales */}
      <div className="sa-kpi-strip">
        <div className="sa-kpi-card">
          <div className="sa-kpi-top"><span className="sa-kpi-label">Ventas hoy (todas)</span><div className="sa-kpi-icon" style={{ background: 'rgba(0,230,118,.1)', color: 'var(--accent)' }}><Icon name="dollar" /></div></div>
          <div className="sa-kpi-value">{fmt(allToday)}</div>
          <div className="sa-kpi-delta">{data.reduce((s, d) => s + d.today.orders, 0)} pedidos hoy</div>
        </div>
        <div className="sa-kpi-card">
          <div className="sa-kpi-top"><span className="sa-kpi-label">Ventas este mes</span><div className="sa-kpi-icon" style={{ background: 'rgba(99,102,241,.12)', color: '#818cf8' }}><Icon name="calendar" /></div></div>
          <div className="sa-kpi-value">{fmt(allMonth)}</div>
          <div className="sa-kpi-delta">{allOrders} pedidos totales</div>
        </div>
        {data.map(d => (
          <div key={d.id} className="sa-kpi-card">
            <div className="sa-kpi-top"><span className="sa-kpi-label">{d.name}</span><div className="sa-kpi-icon" style={{ background: 'rgba(251,191,36,.1)', color: '#fbbf24' }}><Icon name="store" /></div></div>
            <div className="sa-kpi-value">{fmt(d.month.total)}</div>
            <div className="sa-kpi-delta">hoy: {fmt(d.today.total)}</div>
          </div>
        ))}
      </div>

      {/* Selector de app */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {data.map(d => (
          <button key={d.id} className={`sa-chip${tab === d.id ? ' active' : ''}`} onClick={() => setTab(d.id)}>{d.name}</button>
        ))}
      </div>

      {app && (
        <>
          {/* Desglose del día */}
          <div className="sa-grid-2" style={{ marginBottom: '16px' }}>
            <div className="sa-card">
              <div className="sa-card-header"><span className="sa-card-title"><Icon name="calendar" size={17} /> Hoy — {app.today.orders} pedidos</span></div>
              <div className="sa-card-body">
                {([
                  { icon: 'dollar',       label: 'Efectivo',       value: app.today.efectivo },
                  { icon: 'credit-card',  label: 'Tarjeta',         value: app.today.tarjeta },
                  { icon: 'smartphone',   label: 'Transferencia',   value: app.today.transferencia },
                  { icon: 'package',      label: 'Domicilio',       value: app.today.domicilio },
                ] as { icon: IconName; label: string; value: number }[]).map(({ icon, label, value }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: '.88rem' }}>
                    <span style={{ color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Icon name={icon} size={15} /> {label}</span>
                    <span style={{ fontWeight: 700, color: value > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>{fmt(value)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 0', fontWeight: 800, fontSize: '1rem' }}>
                  <span>Total</span><span style={{ color: 'var(--accent)' }}>{fmt(app.today.total)}</span>
                </div>
              </div>
            </div>

            <div className="sa-card">
              <div className="sa-card-header"><span className="sa-card-title"><Icon name="calendar" size={17} /> Este mes — {app.month.orders} pedidos</span></div>
              <div className="sa-card-body">
                {([
                  { icon: 'dollar',       label: 'Efectivo',       value: app.month.efectivo },
                  { icon: 'credit-card',  label: 'Tarjeta',         value: app.month.tarjeta },
                  { icon: 'smartphone',   label: 'Transferencia',   value: app.month.transferencia },
                  { icon: 'package',      label: 'Domicilio',       value: app.month.domicilio },
                ] as { icon: IconName; label: string; value: number }[]).map(({ icon, label, value }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: '.88rem' }}>
                    <span style={{ color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Icon name={icon} size={15} /> {label}</span>
                    <span style={{ fontWeight: 700, color: value > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>{fmt(value)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 0', fontWeight: 800, fontSize: '1rem' }}>
                  <span>Total</span><span style={{ color: 'var(--accent)' }}>{fmt(app.month.total)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Historial de cortes */}
          <div className="sa-card">
            <div className="sa-card-header"><span className="sa-card-title"><Icon name="archive" size={17} /> Últimos cortes de caja</span></div>
            {app.historial.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '.86rem' }}>Sin cortes registrados aún</div>
            ) : (
              <table className="sa-table">
                <thead><tr><th>Inicio turno</th><th>Cierre</th><th>Entregó</th><th>Pedidos</th><th>Efectivo</th><th>Tarjeta</th><th>Transferencia</th><th>Domicilio</th><th>Total</th></tr></thead>
                <tbody>
                  {app.historial.map(c => (
                    <tr key={c.id}>
                      <td style={{ color: 'var(--text-secondary)', fontSize: '.78rem' }}>{new Date(c.inicio).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: '.78rem' }}>{new Date(c.fin).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td style={{ fontWeight: 600 }}>{c.by}</td>
                      <td style={{ textAlign: 'center' }}>{c.orders}</td>
                      <td style={{ color: c.efectivo > 0 ? '#4ade80' : 'var(--text-muted)' }}>{fmt(c.efectivo)}</td>
                      <td style={{ color: c.tarjeta > 0 ? '#60a5fa' : 'var(--text-muted)' }}>{fmt(c.tarjeta)}</td>
                      <td style={{ color: c.transferencia > 0 ? '#c084fc' : 'var(--text-muted)' }}>{fmt(c.transferencia)}</td>
                      <td style={{ color: c.domicilio > 0 ? '#fb923c' : 'var(--text-muted)' }}>{fmt(c.domicilio)}</td>
                      <td style={{ fontWeight: 800, color: 'var(--accent)' }}>{fmt(c.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {data.length === 0 && (
        <div className="sa-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          No hay datos de ventas disponibles. Las ventas aparecerán aquí cuando los restaurantes registren pedidos.
        </div>
      )}
    </div>
  )
}

// ─── Iconos (línea, planos — sin emoji) ───────────────────────────────────────

type IconName = "bar-chart" | "trending-up" | "store" | "flag" | "lock" | "inbox" | "shield"
  | "credit-card" | "dollar" | "gem" | "tag" | "search" | "wrench" | "bell"
  | "alert-triangle" | "users" | "calendar" | "check-circle" | "circle" | "target"
  | "sun" | "moon" | "plus" | "edit" | "trash" | "eye" | "x-circle" | "info" | "ban"
  | "download" | "globe" | "save" | "clipboard" | "shuffle" | "user" | "smartphone"
  | "clock" | "unlock" | "package" | "archive" | "pin" | "activity" | "refresh";

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "bar-chart":       return <svg {...p}><line x1="4" y1="20" x2="4" y2="11" /><line x1="10" y1="20" x2="10" y2="5" /><line x1="16" y1="20" x2="16" y2="14" /><line x1="3" y1="20" x2="21" y2="20" /></svg>;
    case "trending-up":     return <svg {...p}><polyline points="4 17 10 11 14 15 20 7" /><polyline points="14 7 20 7 20 13" /></svg>;
    case "store":           return <svg {...p}><path d="M4 9l1-5h14l1 5" /><path d="M4 9v10h16V9" /><path d="M4 9h16" /><path d="M10 19v-5h4v5" /></svg>;
    case "flag":            return <svg {...p}><path d="M5 21V4" /><path d="M5 4h13l-3 4 3 4H5" /></svg>;
    case "lock":            return <svg {...p}><rect x="5" y="11" width="14" height="9" rx="1.5" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;
    case "inbox":           return <svg {...p}><rect x="3" y="6" width="18" height="13" rx="1.5" /><path d="M3 7l9 6 9-6" /></svg>;
    case "shield":          return <svg {...p}><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" /></svg>;
    case "credit-card":     return <svg {...p}><rect x="3" y="6" width="18" height="13" rx="1.8" /><line x1="3" y1="10.5" x2="21" y2="10.5" /></svg>;
    case "dollar":          return <svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7v10" /><path d="M14.5 9.3c0-1.2-1.1-2-2.5-2s-2.5.9-2.5 2c0 1.1.9 1.7 2.5 2.1 1.6.4 2.5 1 2.5 2.1 0 1.1-1.1 2-2.5 2s-2.5-.8-2.5-2" /></svg>;
    case "gem":             return <svg {...p}><path d="M4 9L8 3h8l4 6-10 12L4 9Z" /><path d="M9 3l-3 6M15 3l3 6M4 9h16" /></svg>;
    case "tag":             return <svg {...p}><path d="M12.6 3H5.4A2.4 2.4 0 0 0 3 5.4v7.2c0 .6.2 1.2.7 1.7l8.6 8.6c.9.9 2.4.9 3.4 0l6.2-6.2c.9-.9.9-2.4 0-3.4L13.3 3.7c-.5-.5-1.1-.7-1.7-.7z" /><circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" /></svg>;
    case "search":          return <svg {...p}><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" /></svg>;
    case "wrench":          return <svg {...p}><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.8 2.8-2-2 2.8-2.8z" /></svg>;
    case "bell":            return <svg {...p}><path d="M6 8a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6.5H4c.5-1 2-2.5 2-6.5z" /><path d="M10 18.5a2 2 0 0 0 4 0" /></svg>;
    case "alert-triangle":  return <svg {...p}><path d="M12 3.5l9.5 16.5H2.5L12 3.5z" /><line x1="12" y1="10" x2="12" y2="14.5" /><circle cx="12" cy="17.3" r="0.9" fill="currentColor" stroke="none" /></svg>;
    case "users":           return <svg {...p}><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19.5c0-3.3 2.5-6 5.5-6s5.5 2.7 5.5 6" /><circle cx="17.5" cy="9" r="2.4" /><path d="M15 13.2c2.6.4 4.5 2.6 4.5 6.3" /></svg>;
    case "calendar":        return <svg {...p}><rect x="3.5" y="5" width="17" height="16" rx="1.8" /><line x1="3.5" y1="10" x2="20.5" y2="10" /><line x1="8" y1="3" x2="8" y2="7" /><line x1="16" y1="3" x2="16" y2="7" /></svg>;
    case "check-circle":    return <svg {...p}><circle cx="12" cy="12" r="8.5" /><polyline points="8.5 12.3 11 14.8 15.5 9.5" /></svg>;
    case "circle":          return <svg {...p}><circle cx="12" cy="12" r="7" fill="currentColor" stroke="none" /></svg>;
    case "target":          return <svg {...p}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none" /></svg>;
    case "sun":             return <svg {...p}><circle cx="12" cy="12" r="4" /><line x1="12" y1="2" x2="12" y2="4.5" /><line x1="12" y1="19.5" x2="12" y2="22" /><line x1="4.2" y1="4.2" x2="5.9" y2="5.9" /><line x1="18.1" y1="18.1" x2="19.8" y2="19.8" /><line x1="2" y1="12" x2="4.5" y2="12" /><line x1="19.5" y1="12" x2="22" y2="12" /><line x1="4.2" y1="19.8" x2="5.9" y2="18.1" /><line x1="18.1" y1="5.9" x2="19.8" y2="4.2" /></svg>;
    case "moon":            return <svg {...p}><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" /></svg>;
    case "plus":            return <svg {...p}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;
    case "edit":            return <svg {...p}><path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z" /><path d="M13.5 8l2.5 2.5" /></svg>;
    case "trash":           return <svg {...p}><path d="M4 7h16" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>;
    case "eye":             return <svg {...p}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>;
    case "x-circle":        return <svg {...p}><circle cx="12" cy="12" r="8.5" /><line x1="9" y1="9" x2="15" y2="15" /><line x1="15" y1="9" x2="9" y2="15" /></svg>;
    case "info":            return <svg {...p}><circle cx="12" cy="12" r="8.5" /><line x1="12" y1="11" x2="12" y2="16" /><circle cx="12" cy="7.7" r="0.9" fill="currentColor" stroke="none" /></svg>;
    case "ban":             return <svg {...p}><circle cx="12" cy="12" r="8.5" /><line x1="6.5" y1="17.5" x2="17.5" y2="6.5" /></svg>;
    case "download":        return <svg {...p}><path d="M12 3v12" /><polyline points="7.5 10.5 12 15 16.5 10.5" /><path d="M4.5 17.5v2a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-2" /></svg>;
    case "globe":           return <svg {...p}><circle cx="12" cy="12" r="8.5" /><line x1="3.5" y1="12" x2="20.5" y2="12" /><path d="M12 3.5c2.5 2.3 4 5.3 4 8.5s-1.5 6.2-4 8.5c-2.5-2.3-4-5.3-4-8.5s1.5-6.2 4-8.5z" /></svg>;
    case "save":            return <svg {...p}><path d="M5 4h11l3 3v13H5z" /><path d="M8 4v5h7V4" /><path d="M8 14h8v6H8z" /></svg>;
    case "clipboard":       return <svg {...p}><rect x="6" y="4" width="12" height="17" rx="1.5" /><rect x="9" y="2.5" width="6" height="3" rx="1" /><line x1="9" y1="11" x2="15" y2="11" /><line x1="9" y1="15" x2="15" y2="15" /></svg>;
    case "shuffle":         return <svg {...p}><polyline points="15.5 5 19.5 5 19.5 9" /><line x1="4.5" y1="19" x2="19.5" y2="5" /><polyline points="15.5 19 19.5 19 19.5 15" /><path d="M4.5 5h3.5l3 4" /><path d="M11 15l3 4" /></svg>;
    case "user":            return <svg {...p}><circle cx="12" cy="8" r="3.5" /><path d="M4.5 20c0-4.1 3.4-7 7.5-7s7.5 2.9 7.5 7" /></svg>;
    case "smartphone":      return <svg {...p}><rect x="7" y="2.5" width="10" height="19" rx="2" /><line x1="10.5" y1="18.3" x2="13.5" y2="18.3" /></svg>;
    case "clock":           return <svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>;
    case "unlock":          return <svg {...p}><rect x="5" y="11" width="14" height="9" rx="1.5" /><path d="M8 11V7a4 4 0 0 1 7.6-1.8" /></svg>;
    case "package":         return <svg {...p}><path d="M12 3l8 4.2v9.6L12 21l-8-4.2V7.2z" /><path d="M4 7.2 12 11l8-3.8" /><line x1="12" y1="11" x2="12" y2="21" /></svg>;
    case "archive":         return <svg {...p}><rect x="3.5" y="4" width="17" height="5" rx="1.2" /><path d="M5 9v9.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V9" /><line x1="10" y1="13" x2="14" y2="13" /></svg>;
    case "pin":             return <svg {...p}><path d="M12 21s-6.5-5.8-6.5-11A6.5 6.5 0 0 1 18.5 10c0 5.2-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></svg>;
    case "activity":        return <svg {...p}><polyline points="3 12 8 12 10.5 6 14 18 16.5 12 21 12" /></svg>;
    case "refresh":         return <svg {...p}><path d="M4 12a8 8 0 0 1 14-5.2L20 9" /><polyline points="20 4 20 9 15 9" /><path d="M20 12a8 8 0 0 1-14 5.2L4 15" /><polyline points="4 20 4 15 9 15" /></svg>;
  }
}

// ─── Nav items ────────────────────────────────────────────────────────────────
// `section` crea un separador/encabezado de grupo en el sidebar.
// Los items sin `section` se agrupan bajo el encabezado del item anterior que sí lo tiene.

const NAV: { view: View; icon: IconName; label: string; section?: string }[] = [
  { view: "overview",      icon: "bar-chart",   label: "Métricas globales", section: "Principal" },
  { view: "activity",      icon: "trending-up", label: "Actividad" },
  { view: "restaurants",   icon: "store",       label: "Restaurantes" },
  { view: "flags",         icon: "flag",        label: "Feature Flags",     section: "Permisos y Control" },
  { view: "permisos",      icon: "lock",        label: "Permisos por rol" },
  { view: "solicitudes",   icon: "inbox",       label: "Solicitudes" },
  { view: "seguridad",     icon: "shield",      label: "Seguridad" },
  { view: "billing",       icon: "credit-card", label: "Cuentas y Pagos",   section: "Gestión" },
  { view: "ventas",        icon: "dollar",      label: "Ventas Reales" },
  { view: "plans",         icon: "gem",         label: "Planes" },
  { view: "discounts",     icon: "tag",         label: "Descuentos" },
  { view: "flota",         icon: "activity",    label: "Flota de clientes", section: "Infraestructura" },
  { view: "updates",       icon: "refresh",     label: "Parches y versiones" },
  { view: "audit",         icon: "search",      label: "Auditoría",         section: "Config" },
  { view: "maintenance",   icon: "wrench",      label: "Mantenimiento" },
  { view: "notifications", icon: "bell",        label: "Notificaciones" },
];

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({ onLogout, theme, toggleTheme }: { onLogout: () => void; theme: "dark" | "light"; toggleTheme: () => void }) {
  const [view, setView]       = useState<View>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [auditLog, setAuditLog]             = useState<AuditEntry[]>([]);
  const [planConfigs, setPlanConfigs]       = useState<PlanConfig[]>([]);
  const [productConfigs, setProductConfigs] = useState<ProductConfig[]>([]);
  // Distingue "todavía cargando" de "cargó y el catálogo está vacío de verdad" — sin esto, un
  // catálogo vacío (ej. la migración SQL de 2026-08-21 no se ha corrido) hace que Overview/Billing
  // muestren "$0 de ingresos" en silencio, sin ninguna señal de que el dato real no se pudo leer.
  const [plansLoaded, setPlansLoaded] = useState(false);
  const [fleetStatus, setFleetStatus]       = useState<FleetStatus[]>([]);
  const [clientUpdates, setClientUpdates]   = useState<ClientUpdate[]>([]);
  const [requests, setRequests]             = useState<AccessRequest[]>([]);
  const [toast, setToast]                   = useState<Toast | null>(null);
  const [alertDismissed, setAlertDismissed] = useState(false);
  const [activeUser, setActiveUser]         = useState("Super Admin");
  const [unreadTickets, setUnreadTickets]   = useState(0);

  useEffect(() => {
    const u = localStorage.getItem('sa_user')
    if (u) setActiveUser(u.charAt(0).toUpperCase() + u.slice(1))
    // Carga inicial de todos los datos desde Supabase
    fetch('/api/superadmin/restaurants').then(r => r.json()).then(d => { if (Array.isArray(d)) setRestaurants(d) }).catch(() => {})
    fetch('/api/superadmin/audit').then(r => r.json()).then(d => { if (Array.isArray(d)) setAuditLog(d) }).catch(() => {})
    fetch('/api/superadmin/plans').then(r => r.json()).then(d => { if (Array.isArray(d)) setPlanConfigs(d) }).catch(() => {}).finally(() => setPlansLoaded(true))
    fetch('/api/superadmin/products').then(r => r.json()).then(d => { if (Array.isArray(d)) setProductConfigs(d) }).catch(() => {})
    fetch('/api/superadmin/requests').then(r => r.json()).then(d => { if (Array.isArray(d)) setRequests(d) }).catch(() => {})
    fetch('/api/superadmin/tickets?count=true').then(r => r.json()).then(d => setUnreadTickets(d.unread ?? 0)).catch(() => {})
    fetch('/api/superadmin/fleet').then(r => r.json()).then(d => { if (Array.isArray(d)) setFleetStatus(d) }).catch(() => {})
    fetch('/api/superadmin/client-updates').then(r => r.json()).then(d => { if (Array.isArray(d)) setClientUpdates(d) }).catch(() => {})
  }, []);

  // Auto-oculta el toast después de 3 segundos.
  const showToast = useCallback((msg: string, type: Toast["type"] = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Agrega entrada al log en el estado local Y persiste en Supabase.
  const addAudit = useCallback((action: string, details: string, type: AuditType, restaurant = "—") => {
    const now = new Date();
    const ts = `${now.toISOString().split("T")[0]} ${now.toTimeString().slice(0, 5)}`;
    const entry = { id: `a${Date.now()}`, ts, user: "superadmin", restaurant, action, details, ip: "187.xxx.12", type };
    setAuditLog((prev) => [entry, ...prev]);
    fetch('/api/superadmin/audit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, details, type, restaurant }) }).catch(() => {})
  }, []);

  // Banner rojo de deuda: visible hasta que el superadmin lo cierre manualmente en la sesión.
  const debtRestaurants = restaurants.filter((r) => r.balance > 0);
  const showAlert = !alertDismissed && debtRestaurants.length > 0;

  // Delega el render a la vista activa, pasando las props compartidas (restaurants, addAudit, showToast, planConfigs).
  const renderView = () => {
    const shared = { restaurants, setRestaurants, addAudit, showToast, planConfigs, productConfigs };
    switch (view) {
      case "overview":      return <Overview {...shared} setView={setView} />;
      case "activity":      return <Activity restaurants={restaurants} planConfigs={planConfigs} />;
      case "restaurants":   return <Restaurants {...shared} />;
      case "flags":         return <FeatureFlags restaurants={restaurants} addAudit={addAudit} showToast={showToast} />;
      case "permisos":      return <Permisos restaurants={restaurants} addAudit={addAudit} showToast={showToast} />;
      case "solicitudes":   return <Solicitudes requests={requests} setRequests={setRequests} addAudit={addAudit} showToast={showToast} />;
      case "seguridad":     return <Seguridad restaurants={restaurants} addAudit={addAudit} showToast={showToast} />;
      case "billing":       return <Billing {...shared} />;
      case "ventas":        return <VentasReales />;
      case "audit":         return <AuditLog log={auditLog} showToast={showToast} />;
      case "plans":         return <Plans {...shared} planConfigs={planConfigs} setPlanConfigs={setPlanConfigs} />;
      case "discounts":     return <Discounts addAudit={addAudit} showToast={showToast} />;
      case "maintenance":   return <Maintenance {...shared} />;
      case "notifications": return <Notifications showToast={showToast} />;
      case "flota":         return <Flota restaurants={restaurants} fleetStatus={fleetStatus} clientUpdates={clientUpdates} setFleetStatus={setFleetStatus} showToast={showToast} productConfigs={productConfigs} />;
      case "updates":       return <ClientUpdates updates={clientUpdates} restaurants={restaurants} onCreated={(entries) => setClientUpdates((prev) => [...entries, ...prev])} showToast={showToast} productConfigs={productConfigs} />;
    }
  };

  return (
    <div className="sa-app">
      {toast && <ToastBanner toast={toast} />}

      {/* Overlay oscuro detrás del sidebar en móvil — cierra al tocar fuera */}
      {sidebarOpen && (
        <div className="sa-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`sa-sidebar${sidebarOpen ? " sa-sidebar--open" : ""}`}>
        <div className="sa-sidebar-header">
          <div className="sa-sidebar-logo" style={{ color: "#fff" }}><Icon name="shield" size={22} /></div>
          <div style={{ flex: 1 }}>
            <div className="sa-brand-name">NICHO</div>
            <div className="sa-brand-sub">Super Admin</div>
            <div className="sa-badge-super">SUPERADMIN</div>
          </div>
          {/* Botón X para cerrar el sidebar en móvil */}
          <button className="sa-sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Cerrar menú">✕</button>
        </div>
        <nav className="sa-nav">
          {NAV.map((item) => (
            <div key={item.view}>
              {item.section && <div className="sa-nav-section">{item.section}</div>}
              <button
                className={`sa-nav-item${view === item.view ? " active" : ""}`}
                onClick={() => { setView(item.view); setSidebarOpen(false); }}
              >
                <span className="sa-nav-icon"><Icon name={item.icon} /></span>
                {item.label}
                {item.view === "billing" && debtRestaurants.length > 0 && (
                  <span className="sa-nav-badge">{debtRestaurants.length}</span>
                )}
                {item.view === "solicitudes" && requests.filter((r) => r.status === "pending").length > 0 && (
                  <span className="sa-nav-badge">{requests.filter((r) => r.status === "pending").length}</span>
                )}
                {item.view === "flota" && fleetStatus.filter((f) => f.health === "error").length > 0 && (
                  <span className="sa-nav-badge">{fleetStatus.filter((f) => f.health === "error").length}</span>
                )}
              </button>
            </div>
          ))}
        </nav>
        <div className="sa-sidebar-footer">
          <div className="sa-user-row">
            <div className="sa-avatar">{activeUser.charAt(0)}</div>
            <div><div className="sa-user-name">{activeUser}</div><div className="sa-user-role">superadmin@nicho.app</div></div>
            <button className="sa-logout-btn" onClick={onLogout} title="Cerrar sesión">⏻</button>
          </div>
        </div>
      </aside>

      <div className="sa-main">
        {plansLoaded && planConfigs.length === 0 && (
          <div className="sa-alert-banner danger">
            <span style={{ display: "flex" }}><Icon name="alert-triangle" size={18} /></span>
            <span><strong>El catálogo de planes está vacío.</strong> Los ingresos y badges de plan van a mostrarse en $0/sin datos hasta que corras la migración SQL (<code>Documentacion/sql/migraciones/2026-08-21-multiproducto-y-flota.sql</code>) en el SQL Editor de Supabase.</span>
          </div>
        )}
        {showAlert && (
          <div className="sa-alert-banner danger">
            <span style={{ display: "flex" }}><Icon name="alert-triangle" size={18} /></span>
            <span><strong>{debtRestaurants.length} restaurante{debtRestaurants.length > 1 ? "s" : ""}</strong> con saldo pendiente: {debtRestaurants.map((r) => `${r.name} ($${r.balance.toLocaleString()})`).join(", ")}</span>
            <button className="sa-alert-dismiss" onClick={() => setAlertDismissed(true)}>✕</button>
          </div>
        )}
        <header className="sa-topbar">
          {/* Hamburguesa — visible solo en móvil (CSS lo oculta en desktop) */}
          <button className="sa-hamburger" onClick={() => setSidebarOpen(true)} aria-label="Abrir menú">
            <span /><span /><span />
          </button>
          <div className="sa-topbar-brand">NICHO Platform · Super Admin</div>
          <div className="sa-topbar-right">
            <button className="sa-topbar-btn" onClick={toggleTheme} title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}>
              <Icon name={theme === "dark" ? "sun" : "moon"} />
            </button>
            <button className="sa-topbar-btn" onClick={() => setView("billing")}>
              <Icon name="credit-card" /> {debtRestaurants.length > 0 && <span className="sa-notif-badge">{debtRestaurants.length}</span>}
            </button>
            <button className="sa-topbar-btn" onClick={() => { setView("notifications"); setUnreadTickets(0); }}>
              <Icon name="bell" /> {unreadTickets > 0 && <span className="sa-notif-badge">{unreadTickets}</span>}
            </button>
          </div>
        </header>
        <div className="sa-content">{renderView()}</div>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function SuperAdmin() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  // Carga la preferencia guardada (o el esquema del sistema) al montar.
  useEffect(() => {
    const saved = localStorage.getItem("sa_theme");
    if (saved === "dark" || saved === "light") setTheme(saved);
    else if (window.matchMedia("(prefers-color-scheme: light)").matches) setTheme("light");
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      localStorage.setItem("sa_theme", next);
      return next;
    });
  }, []);

  // Borra la cookie de sesión en el servidor (DELETE /api/superadmin/auth) y redirige al login.
  async function handleLogout() {
    await fetch('/api/superadmin/auth', { method: 'DELETE' })
    window.location.href = '/sa-login'
  }
  return (
    <div className="sa-root" data-theme={theme}>
      <Dashboard onLogout={handleLogout} theme={theme} toggleTheme={toggleTheme} />
    </div>
  );
}

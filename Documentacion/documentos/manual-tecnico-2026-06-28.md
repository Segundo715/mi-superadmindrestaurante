# Manual Técnico — SuperAdmin NICHO

> Versión: 2026-06-28
> Dirigido a: desarrolladores
> Stack: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Supabase (doble cliente)

---

## 1. Arquitectura

`mi-superadmindrestaurante` es el panel de control global de la plataforma NICHO. Es una app Next.js monolítica cuyo dashboard vive en un solo componente cliente (`SuperAdmin.tsx`, ~2242 líneas) y cuyas operaciones de datos pasan por API Routes server-side bajo `/api/superadmin/*`.

### Diagrama general

```
                          ┌──────────────────────────────────────┐
                          │     Navegador (Jesús / Eloy)          │
                          │                                       │
                          │  /sa-login ──► POST /api/superadmin/auth (set cookie sa_session)
                          │  /superadmin ─► SuperAdmin.tsx (14 vistas, client component)
                          │  /superadmin/demo ─► DemoControlPage   │
                          └───────────────┬───────────────────────┘
                                          │ fetch (cookie sa_session httpOnly)
                                          ▼
        ┌─────────────────────────────────────────────────────────────────┐
        │            Next.js API Routes (server-side)                       │
        │  /api/superadmin/* ── verifySaSession() en cada handler           │
        │  /api/save-flags   ── (SIN auth) enruta por sufijo _portales      │
        │  /api/public/register ── auth por NICHO_REGISTER_KEY              │
        │  /api/demo-proxy   ── firma HMAC con ADMIN_SECRET                 │
        └───────┬──────────────────────────┬───────────────────┬──────────┘
                │                          │                    │
        supabaseAdmin              supabasePortales        fetch upstream
        (service role)             (service role)          mi-proyecto.vercel.app
                │                          │
                ▼                          ▼
   ┌────────────────────────┐   ┌──────────────────────────┐
   │ BD PRINCIPAL           │   │ BD PORTALES              │
   │ zxynrlqubdlrwcfoewdv   │   │ qmtsetcqnovcahuimkvg     │
   │ sa_restaurants,        │   │ sa_tickets, settings     │
   │ sa_audit_log, sa_plans │   │ orders                   │
   │ sa_discounts, ...      │   │                          │
   │ settings, orders       │   │                          │
   └────────────────────────┘   └──────────────────────────┘
```

### Decisiones de diseño

- **Dashboard monolítico:** todas las vistas (`Overview`, `Restaurants`, `FeatureFlags`, etc.) están en un solo archivo `SuperAdmin.tsx`. Esto facilita compartir helpers (`Badge`, `Toggle`, `Modal`, `ToastBanner`) y el estado central (`restaurants`, `auditLog`, etc.) sin prop-drilling entre archivos. **No fragmentar sin una razón fuerte** (regla del proyecto).
- **Auth hardcodeada:** las credenciales del SuperAdmin no viven en una tabla, sino en código. Así el acceso sigue funcionando aunque la BD falle.
- **Doble BD:** la principal se comparte con `mi-proyecto`; la de Portales es independiente. Por eso hay dos clientes Supabase.

> ⚠️ **Next.js 16 tiene breaking changes.** `AGENTS.md` ordena leer `node_modules/next/dist/docs/` antes de escribir código nuevo. Ejemplo concreto: los route handlers reciben `ctx.params` como **Promise** (`ctx: { params: Promise<{ id: string }> }`), y `cookies()` es **async** (`await cookies()`).

---

## 2. Setup de desarrollo

### Requisitos

- Node.js 20+
- npm
- Acceso a las dos instancias de Supabase (claves)

### Comandos

```bash
npm run dev       # Servidor de desarrollo (next dev)
npm run build     # Build de producción (next build)
npm run start     # Servidor de producción
npm run lint      # ESLint
npx tsc --noEmit  # Verificación de tipos
```

### Variables de entorno: locales vs Vercel

`.env.local` (desarrollo) debe contener al menos las de la BD principal:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://zxynrlqubdlrwcfoewdv.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_KEY=...
```

Las variables `PORTALES_*`, `NICHO_REGISTER_KEY` y `ADMIN_SECRET` **solo existen en Vercel**, no en `.env.local`. Por eso, en desarrollo local, las funciones que dependen de Portales (tickets de portales, revenue de portales, flags `_portales`) o del registro público no funcionan a menos que las agregues manualmente.

Ver la tabla completa en la sección 13.

---

## 3. Autenticación

### Flujo completo

1. El usuario envía `POST /api/superadmin/auth` con `{ username, password }`.
2. El handler calcula `SHA-256(SALT + password)` y lo compara contra el hash almacenado del usuario.
3. Si coincide, escribe la cookie `sa_session` (httpOnly, Secure, SameSite=Strict, 8h).
4. El cliente guarda el nombre en `localStorage` (`sa_user`) solo para el avatar y navega a `/superadmin`.
5. `superadmin/layout.tsx` (server component) valida la cookie en cada carga de página y redirige a `/sa-login` si no es válida.
6. Cada API Route bajo `/api/superadmin/*` valida la cookie con `verifySaSession()`.

### Código fuente

`app/api/superadmin/auth/route.ts`:

```typescript
const SALT = 'nicho_superadmin_2024'
const SESSION_KEY = 'sa_session'
const SESSION_VALUE = 'nicho_sa_authenticated_2024'

const USERS: Record<string, string> = {
  jesus: '2e961f146826f84c98a94cb1cc4ba036a108c975a4f5dd9319af6dd9c46d383a',
  eloy:  'dc2ee564bcfdbe759de3e6ad2a23a177cf96d4790bd7aa2e5fb9b9730618d1b8',
}

export async function POST(req: Request) {
  const { username, password } = await req.json()
  const hash = createHash('sha256').update(SALT + password).digest('hex')
  const stored = USERS[username?.toLowerCase()]
  if (!stored || stored !== hash) {
    return Response.json({ error: 'Credenciales incorrectas' }, { status: 401 })
  }
  const jar = await cookies()
  jar.set(SESSION_KEY, SESSION_VALUE, {
    httpOnly: true, secure: true, sameSite: 'strict', maxAge: 60 * 60 * 8, path: '/',
  })
  return Response.json({ ok: true, user: username.toLowerCase() })
}
```

`lib/saAuth.ts` (guard de las APIs):

```typescript
const SESSION_VALUE = 'nicho_sa_authenticated_2024'
export async function verifySaSession(): Promise<boolean> {
  const jar = await cookies()
  return jar.get('sa_session')?.value === SESSION_VALUE
}
```

`app/superadmin/layout.tsx` (guard de páginas):

```typescript
export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies()
  const session = jar.get(SESSION_KEY)?.value
  if (session !== SESSION_VALUE) redirect('/sa-login')
  return <>{children}</>
}
```

### Cómo generar/cambiar un hash de contraseña

```bash
node -e "console.log(require('crypto').createHash('sha256').update('nicho_superadmin_2024'+'NUEVA_PASS').digest('hex'))"
```

Pega el resultado en el objeto `USERS` de `auth/route.ts`.

### Riesgos (ver también sección 15)

El valor de `sa_session` es **fijo y conocido** (`nicho_sa_authenticated_2024`). Quien lo conozca puede falsificar una sesión seteando la cookie manualmente. No hay rotación, ni firma, ni vinculación al usuario. Logout solo borra la cookie del navegador (`DELETE /api/superadmin/auth`).

---

## 4. Doble cliente Supabase

| Cliente | Archivo | BD | Key | Uso |
|---------|---------|----|-----|-----|
| `supabase` | `lib/supabase.ts` | Principal | Anon | Lectura general (solo lo usa `save-flags` GET no-portales) |
| `supabaseAdmin` | `lib/supabaseAdmin.ts` | Principal | Service role | Todas las rutas `/api/superadmin/*` (bypassa RLS) |
| `supabasePortales` | `lib/supabasePortales.ts` | Portales | Service role | Solo `save-flags`, `tickets`, `revenue` |

### Strip BOM + trim

Tanto `supabaseAdmin` como `supabasePortales` saneаn las variables de entorno: quitan un posible BOM (`﻿`, código 65279) al inicio y aplican `.trim()`. Esto evita errores de autenticación cuando una variable se pegó desde un editor que añadió BOM o espacios.

```typescript
function strip(s: string) {
  return (s.charCodeAt(0) === 65279 ? s.slice(1) : s).trim()
}
export const supabaseAdmin = createClient(
  strip(process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''),
  strip(process.env.SUPABASE_SERVICE_KEY ?? '')
)
```

### Por qué `supabasePortales` es independiente

Portales (`mi-restauranteportales`) tiene su **propio proyecto Supabase** (`qmtsetcqnovcahuimkvg`) con sus propias tablas `sa_tickets` y `settings`. No comparte conexión con la principal. Las credenciales `PORTALES_SUPABASE_URL` y `PORTALES_SERVICE_KEY` solo existen en Vercel.

> **Regla del proyecto:** `supabasePortales` solo debe usarse en `api/save-flags`, `api/superadmin/tickets`, `api/superadmin/revenue`.

---

## 5. Dashboard `SuperAdmin.tsx`

### Estructura interna

- **Tipos y constantes** (líneas ~10–135): `View`, `Plan`, `Status`, `Restaurant`, `PlanConfig`, `FeatureFlag`, `AuditEntry`, catálogos `FEATURES_R1`, `FEATURES_RESTA3`, `EMPLOYEE_MODULES`, `USER_MODULES`, mapas `PLAN_LABELS/COLORS/PRICE`, etc.
- **Helpers compartidos** (líneas ~140–198): `Badge`, `Toggle`, `ToastBanner`, `Modal`.
- **Componentes de vista** (uno por sección): `Overview`, `Restaurants`, `FeatureFlags`, `Billing`, `AuditLog`, `Plans`, `Discounts`, `Activity`, `Maintenance`, `Notifications`, `Permisos`, `Solicitudes`, `Seguridad`, `VentasReales`.
- **`NAV`**: array que define el sidebar (icono, label, `section` opcional para separadores de grupo).
- **`Dashboard`**: orquestador. Mantiene el estado central y enruta a la vista activa con `renderView()`.
- **`SuperAdmin`** (default export): wrapper con `handleLogout`.

### Helpers compartidos

```typescript
function Badge({ type, children }: { type: string; children: React.ReactNode }) {
  return <span className={`sa-badge ${type}`}><span className="dot" />{children}</span>;
}
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) { ... }
function ToastBanner({ toast }: { toast: Toast }) { ... }      // notificación flotante 3s
function Modal({ title, onClose, children }) { ... }            // diálogo con backdrop
```

`type` en `Badge` mapea a clases CSS: `active`, `danger`, `warning`, `info`, `muted`.

### Orquestación de la carga inicial

`Dashboard` dispara todas las cargas en un único `useEffect` al montar:

```typescript
useEffect(() => {
  const u = localStorage.getItem('sa_user')
  if (u) setActiveUser(u.charAt(0).toUpperCase() + u.slice(1))
  fetch('/api/superadmin/restaurants').then(r => r.json()).then(d => { if (Array.isArray(d)) setRestaurants(d) }).catch(() => {})
  fetch('/api/superadmin/audit').then(r => r.json()).then(d => { if (Array.isArray(d)) setAuditLog(d) }).catch(() => {})
  fetch('/api/superadmin/plans').then(r => r.json()).then(d => { if (Array.isArray(d)) setPlanConfigs(d) }).catch(() => {})
  fetch('/api/superadmin/requests').then(r => r.json()).then(d => { if (Array.isArray(d)) setRequests(d) }).catch(() => {})
  fetch('/api/superadmin/tickets?count=true').then(r => r.json()).then(d => setUnreadTickets(d.unread ?? 0)).catch(() => {})
}, []);
```

Las vistas `Discounts`, `Seguridad`, `VentasReales` y `Notifications` cargan sus propios datos en su propio `useEffect` cuando se montan (no en la carga inicial).

`renderView()` pasa props compartidas a cada vista:

```typescript
const shared = { restaurants, setRestaurants, addAudit, showToast };
switch (view) {
  case "overview": return <Overview {...shared} setView={setView} />;
  // ...
}
```

`showToast` y `addAudit` son helpers memoizados con `useCallback`:

```typescript
const showToast = useCallback((msg, type = "success") => {
  setToast({ msg, type }); setTimeout(() => setToast(null), 3000);
}, []);

const addAudit = useCallback((action, details, type, restaurant = "—") => {
  // actualiza estado local + POST a /api/superadmin/audit
  setAuditLog(prev => [entry, ...prev]);
  fetch('/api/superadmin/audit', { method: 'POST', ... }).catch(() => {})
}, []);
```

### Cómo agregar una vista nueva

1. Añade el nombre al union type `View`:
   ```typescript
   type View = "overview" | ... | "miNuevaVista";
   ```
2. Crea el componente `function MiNuevaVista(props) { ... }`.
3. Añade el `case` en `renderView()`.
4. Añade la entrada al array `NAV` (con `section` si abre un grupo nuevo).

---

## 6. APIs

Todas las rutas `/api/superadmin/*` empiezan con `if (!await verifySaSession()) return 401`. Las tablas usan `snake_case`; los handlers mapean a `camelCase` con funciones `toX()`.

### `POST /api/superadmin/auth`
- **Auth:** ninguna (es el login). **Body:** `{ username, password }`. **Respuesta:** `{ ok, user }` + cookie. **Error:** 401 si credenciales inválidas.

### `DELETE /api/superadmin/auth`
- Borra la cookie `sa_session`. **Respuesta:** `{ ok: true }`.

### `GET /api/superadmin/restaurants`
- Lista `sa_restaurants` ordenado por `created_at` desc. Devuelve array de `Restaurant` (camelCase).

### `POST /api/superadmin/restaurants`
- **Body:** `{ name, email, plan }`. Inserta con `status:'active'`, `users:1`, `max_users` según plan (premium=20, basic=5, trial=3), genera `api_token = nch_live_<random>`. **201**.

### `PATCH /api/superadmin/restaurants/[id]`
- **Body parcial:** `status`, `plan`, `notes`, `balance`, `nextPayment`, `lastPayment`, `maxUsers`. Solo actualiza los campos presentes.

### `DELETE /api/superadmin/restaurants/[id]`
- Elimina el registro. **Respuesta:** `{ ok: true }`.

### `GET /api/superadmin/audit`
- Últimos 200 registros de `sa_audit_log` ordenados por `ts` desc.

### `POST /api/superadmin/audit`
- **Body:** `{ action, details, type, restaurant, user? }`. La IP se hardcodea como `'187.xxx.12'` (placeholder). **201**.

### `GET /api/superadmin/discounts`
- Lista `sa_discounts` ordenado por `active` desc.

### `POST /api/superadmin/discounts`
- **Body:** `{ code, discount, type, maxUses, expiresAt, note }`. Normaliza `code` a mayúsculas, `uses:0`, `active:true`. **201**.

### `PATCH /api/superadmin/discounts/[id]`
- **Body parcial:** `active`, `uses`.

### `DELETE /api/superadmin/discounts/[id]`
- Elimina el código.

### `GET /api/superadmin/plans`
- Lista `sa_plans`. **Si la tabla está vacía, hace seed con `DEFAULT_PLANS`** (trial/basic/premium) y devuelve el resultado. `features` se almacena como JSON string y se parsea al leer.

### `PATCH /api/superadmin/plans`
- **Body:** `{ id, price?, maxUsers?, features?, color? }`. `features` se re-serializa con `JSON.stringify`.

### `GET /api/superadmin/requests`
- Lista `sa_requests` ordenado por `ts` desc.

### `POST /api/superadmin/requests`
- **Body:** `{ restaurantName, requestedBy, feature, reason }`. Crea con `status:'pending'`. **201**.

### `PATCH /api/superadmin/requests/[id]`
- **Body:** `{ status, rejectReason? }`. Aprueba/rechaza.

### `GET /api/superadmin/security`
- Lista `sa_security` (config por restaurante).

### `POST /api/superadmin/security`
- **Upsert** por `restaurant_id`. **Body:** `{ restaurantId, sessionHours, pinRequired, allowedStart, allowedEnd, maxFailedLogins, ipWhitelist }` (con defaults).

### `GET /api/superadmin/revenue`
- `dynamic = 'force-dynamic'`. Devuelve array de 3 fuentes (Nicho, Portales, Resta3). Ver sección 9.

### `GET /api/superadmin/tickets`
- Con `?count=true` devuelve `{ unread }` (suma de no leídos de ambas BD). Sin param, devuelve los tickets fusionados de ambas BD con `source`.

### `PATCH /api/superadmin/tickets`
- **Body:** `{ id, source }`. Marca un ticket como leído en la BD que indique `source`.

### `DELETE /api/superadmin/tickets?id=...&source=...`
- Elimina un ticket de la BD indicada.

### `PUT /api/superadmin/tickets`
- Marca **todos** los no leídos como leídos en ambas BD.

### `GET|POST /api/save-flags`
- **SIN autenticación.** Enruta por sufijo `_portales`. Ver sección 8.

### `POST /api/public/register`
- **Auth:** `NICHO_REGISTER_KEY` en el body. Auto-registro de restaurantes. Ver sección 10.

### `POST /api/demo-proxy`
- Proxy server→server hacia mi-proyecto con cookie firmada HMAC. Ver sección 11.

---

## 7. Sistema de tickets dual

### Flujo completo

```
Restaurante (mi-proyecto o portales)
   └─ empleado/admin/Resta3 envía un reporte
        └─ POST /api/tickets (en SU PROPIO proyecto) ──► inserta en sa_tickets de su BD
                                                              │
SuperAdmin ──► GET /api/superadmin/tickets                    │
   └─ lee sa_tickets de AMBAS BD en paralelo ◄────────────────┘
   └─ fusiona y etiqueta source: 'main' | 'portales'
   └─ ordena por created_at desc
```

### Fusión de ambas BD (código)

```typescript
const [{ data: main }, { data: portales }] = await Promise.all([
  supabaseAdmin.from('sa_tickets').select('*').order('created_at', { ascending: false }),
  supabasePortales.from('sa_tickets').select('*').order('created_at', { ascending: false }),
])
const merged = [
  ...(main ?? []).map(t => ({ ...t, source: 'main' })),
  ...(portales ?? []).map(t => ({ ...t, source: 'portales' })),
].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
```

El campo `source` es **crítico**: PATCH (marcar leído) y DELETE lo usan para saber **a qué BD** dirigir la operación:

```typescript
const db = source === 'portales' ? supabasePortales : supabaseAdmin
await db.from('sa_tickets').update({ read: true }).eq('id', id)
```

El contador de no leídos (`?count=true`) suma `count` de ambas BD con `head: true` (no trae filas, solo cuenta).

---

## 8. Feature flags

### Flujo de escritura: `POST /api/save-flags`

El body es `{ settingsKey, flags }`. `resolveTarget(settingsKey)` decide la BD por el sufijo:

```typescript
function resolveTarget(key: string): { client; key: string } {
  if (key.endsWith('_portales')) {
    return { client: supabasePortales, key: key.replace(/_portales$/, '') }  // BD portales, key limpia
  }
  return { client: supabaseAdmin, key }                                       // BD principal
}
```

La escritura es **delete + insert** (no upsert) sobre `settings`:

```typescript
await client.from('settings').delete().eq('key', key)
const { error } = await client.from('settings').insert({ key, value: JSON.stringify(flags) })
```

### Flujo de lectura: `GET /api/save-flags?key=...`

- Si `key` termina en `_portales`, lee de la BD portales con la key sin sufijo (usando `supabasePortales`).
- Si no, lee de la BD principal usando el cliente **anon** (`supabase` de `lib/supabase.ts`).

### Claves usadas

| Clave enviada | BD destino | Key real en `settings` |
|---------------|-----------|------------------------|
| `feature_flags` | principal | `feature_flags` (módulos R1) |
| `feature_flags_resta3` | principal | `feature_flags_resta3` (módulos RESTA3) |
| `feature_flags_portales` | portales | `feature_flags` (R1 + RESTA3 juntos) |
| `employee_permissions` | principal | `employee_permissions` |
| `user_permissions` | principal | `user_permissions` |
| `employee_permissions_portales` | portales | `employee_permissions` |
| `user_permissions_portales` | portales | `user_permissions` |

### Lógica en el cliente (`FeatureFlags`)

Constantes clave: `CONNECTED_RESTAURANT = "r1"` (mi-proyecto) y `CONNECTED_PORTALES = "portales"`. Al hacer toggle:

```typescript
const isPortales = sel === CONNECTED_PORTALES;
const isResta3   = fid.startsWith("r3_");
const settingsKey = isPortales ? "feature_flags_portales"
                  : isResta3  ? "feature_flags_resta3"
                  :              "feature_flags";
const featureList = isPortales ? FEATURES : isResta3 ? FEATURES_RESTA3 : FEATURES_R1;
const scopePrefix = isPortales ? CONNECTED_PORTALES : "all";
```

- **Global** (`all`) escribe R1 en `feature_flags` y RESTA3 en `feature_flags_resta3`.
- **Portales** escribe R1+RESTA3 juntos en `feature_flags_portales`.

### Catálogos

- **`FEATURES_R1`** (19 módulos): ventas, operaciones, configuracion, analytics, reportes, menu, produccion, crm, customers, reservaciones, reviews, orders, loyaltyCard, favorites, tv, marketing, automatizaciones, contenido, cumpleanos.
- **`FEATURES_RESTA3`** (7 módulos, prefijo `r3_`): r3_tpv, r3_mesas, r3_cocina, r3_inventario, r3_compras, r3_empleados, r3_reportes.
- **`FEATURES = [...FEATURES_R1, ...FEATURES_RESTA3]`**.

### Flujo de lectura del lado del restaurante

Cada app cliente (mi-proyecto, portales) lee su propio `settings` para saber qué módulos mostrar. El SuperAdmin solo **escribe** la configuración; las apps la **consumen** desde su BD.

---

## 9. Ventas reales (revenue)

`GET /api/superadmin/revenue` agrega 3 fuentes definidas en `APPS`:

```typescript
const APPS = [
  { id: 'default',  name: 'Nicho (mi-proyecto)', db: supabaseAdmin,    ridFilter: 'default', corteKey: 'cortes_historial', type: 'orders' },
  { id: 'portales', name: 'Portales',            db: supabasePortales, ridFilter: 'default', corteKey: 'cortes_historial', type: 'orders' },
  { id: 'resta3',   name: 'Resta3',              db: supabaseAdmin,    ridFilter: 'default', corteKey: 'cortes_historial', type: 'resta3' },
]
```

### Detección del método de pago por tags en `notes`

Las órdenes no tienen una columna de método de pago; se infiere buscando tags entre corchetes en `notes` (mayúsculas):

```typescript
const DELIVERY_KEYS = ['GOGO', 'RAPPI', 'UBEREATS']
function calcTotals(orders) {
  for (const o of orders) {
    const note = (o.notes ?? '').toUpperCase()
    const amt  = o.total ?? 0
    if (DELIVERY_KEYS.some(k => note.includes(`[${k}]`))) domicilio += amt
    else if (note.includes('[TARJETA]'))        tarjeta       += amt
    else if (note.includes('[TRANSFERENCIA]'))  transferencia += amt
    else                                         efectivo      += amt   // fallback
  }
}
```

### Nicho y Portales (`type: 'orders'`)

Consultan la tabla `orders` filtrando `restaurant_id = 'default'` y `created_at >= inicio de mes`. Hoy = órdenes con `created_at >= medianoche`. El historial de cortes sale de `settings.cortes_historial`.

### Resta3 (`type: 'resta3'`)

Resta3 comparte `restaurant_id='default'` con Nicho en la **misma BD**, así que no se puede distinguir a nivel de fila. Por eso su revenue se deriva del **historial de cortes** (`settings.cortes_historial`), no de `orders`:

```typescript
function calcTotalsFromCortes(cortes, since) {
  for (const c of cortes) {
    const fin = c.fin ? new Date(c.fin) : null
    if (!fin || fin < since) continue
    efectivo += c.efectivo ?? 0; tarjeta += c.tarjeta ?? 0; /* ... */
  }
}
```

Cada fuente devuelve `{ id, name, today, month, historial }`. El componente `VentasReales` los muestra en KPIs, desglose y tabla de cortes.

---

## 10. Auto-registro de restaurantes

`POST /api/public/register` permite que cada restaurante se registre solo en `sa_restaurants` al hacer login de admin.

### Flujo

```
Restaurante (login admin) ──► POST /api/public/register
   { key: NICHO_REGISTER_KEY, restaurantId, name, users }
        │
        ├─ valida key === process.env.NICHO_REGISTER_KEY  (401 si no)
        ├─ valida restaurantId y name presentes            (400 si no)
        ├─ busca existente por  notes LIKE 'rid:<restaurantId>%'
        │     ├─ existe: UPDATE last_active, users, login_count++
        │     └─ no existe: INSERT nuevo (plan 'trial', max_users 3, ...)
        └─ { ok, action: 'updated' | 'created' }
```

### Detalle clave

El `restaurant_id` del restaurante se guarda **dentro de `notes`** con el formato `rid:<id>`, y se busca con `.like('notes', 'rid:<id>%')`. El email se autogenera como `<restaurantId>@nicho.app`. Cada login incrementa `login_count` (alimenta la vista Actividad).

---

## 11. Demo proxy

`POST /api/demo-proxy` (`dynamic = 'force-dynamic'`) evita errores CORS al llamar a mi-proyecto desde el browser. Reenvía la petición server→server y adjunta una cookie firmada.

### Firma HMAC

```typescript
const ADMIN_SECRET = process.env.ADMIN_SECRET ?? ''  // en Vercel de mi-proyecto está vacío ("")
function makeSession(adminId: string): string {
  const sig = createHmac('sha256', ADMIN_SECRET).update(adminId).digest('hex')
  return `${adminId}.${sig}`
}
```

Genera el **mismo token** que usa `mi-proyecto/lib/auth.ts`, así los handlers de mi-proyecto lo validan con `verifySession()` sin cambios. Usa `adminId = 'superadmin-demo'`.

> Como `ADMIN_SECRET` está **vacío** en ambos proyectos, el HMAC coincide igualmente. Es frágil pero funcional. Ver riesgos.

### Paths aceptados

Solo se reenvían paths que **empiezan con `/api/`** (validación contra SSRF a otros endpoints):

```typescript
if (!path || typeof path !== 'string' || !path.startsWith('/api/')) {
  return Response.json({ error: 'path inválido' }, { status: 400 })
}
const upstream = await fetch(`${RESTO_URL}${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Cookie': `admin_session=${sessionToken}` },
  body: JSON.stringify(body ?? {}),
})
```

`RESTO_URL = 'https://mi-proyecto-phi-ecru.vercel.app'`. La página `/superadmin/demo` lo usa para insertar menú, recetas, pedidos, reseñas, slides TV y clientes demo, y para cambiar `customer_nav` (fases del cliente).

---

## 12. Tablas de BD

Todas las tablas propias del SuperAdmin viven en la **BD principal** con prefijo `sa_`. `sa_tickets` y `settings` también existen en la **BD portales**.

### `sa_restaurants` (BD principal)

| Columna | Tipo | Notas |
|---------|------|-------|
| id | uuid/text | PK |
| name | text | |
| plan | text | `trial` / `basic` / `premium` |
| status | text | `active` / `suspended` / `maintenance` |
| users | int | |
| max_users | int | 3/5/20 según plan |
| email | text | |
| notes | text | usa `rid:<id>` para auto-registro |
| api_token | text | `nch_live_<random>` |
| last_active | text | |
| login_count | int | |
| balance | numeric | |
| next_payment | text | ej. `'Vencida'`, `'—'` |
| last_payment | text | |
| registered_at | text | |
| created_at | timestamp | orden por defecto |

### `sa_audit_log`
`id`, `ts` (timestamp), `user_name`, `restaurant`, `action`, `details`, `ip`, `type` (`create`/`update`/`delete`/`access`/`billing`).

### `sa_discounts`
`id`, `code`, `discount` (number), `type` (`%`/`$`), `max_uses`, `uses`, `expires_at`, `active` (bool), `note`.

### `sa_plans`
`id` (`trial`/`basic`/`premium`), `name`, `price`, `trial_days`, `max_users`, `color`, `features` (JSON string: array de `{ text, included }`). Se auto-siembra con `DEFAULT_PLANS` si está vacía.

### `sa_requests`
`id`, `restaurant_name`, `requested_by`, `feature`, `reason`, `ts`, `status` (`pending`/`approved`/`rejected`), `reject_reason`.

### `sa_security`
`restaurant_id` (PK, onConflict para upsert), `session_hours`, `pin_required`, `allowed_start`, `allowed_end`, `max_failed_logins`, `ip_whitelist`.

### `sa_tickets` (BD principal **y** BD portales)
`id`, `restaurant_id`, `restaurant_name`, `from_name`, `from_role` (`Empleado`/`Resta3`/`Admin`), `message`, `read` (bool), `created_at`. El campo `source` (`main`/`portales`) **no es columna**: lo agrega el merge en la API.

### `settings` (BD principal y BD portales)
`key` (text), `value` (JSON string). Claves: `feature_flags`, `feature_flags_resta3`, `employee_permissions`, `user_permissions`, `cortes_historial`, `customer_nav`, etc.

### `orders` (BD principal y BD portales)
`id`, `total`, `notes` (contiene tags `[TARJETA]`, `[TRANSFERENCIA]`, `[GOGO]`, `[RAPPI]`, `[UBEREATS]`), `created_at`, `restaurant_id`. Consultada por revenue.

---

## 13. Variables de entorno

| Variable | Requerida | Dónde | Consecuencia si falta |
|----------|-----------|-------|----------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | `.env.local` + Vercel | App no conecta a BD principal |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | `.env.local` + Vercel | `save-flags` GET (no portales) falla |
| `SUPABASE_SERVICE_KEY` | ✅ | `.env.local` + Vercel | Todas las rutas `/api/superadmin/*` fallan |
| `PORTALES_SUPABASE_URL` | ✅ (portales) | **Solo Vercel** | Tickets/revenue/flags de portales no funcionan |
| `PORTALES_SERVICE_KEY` | ✅ (portales) | **Solo Vercel** | Igual que arriba |
| `ADMIN_SECRET` | ✅ | Compartido con mi-proyecto | Demo proxy genera HMAC inválido (actualmente `""` en ambos) |
| `NICHO_REGISTER_KEY` | ✅ | Solo Vercel | Auto-registro siempre devuelve 401 |

---

## 14. Restricciones de código (reglas obligatorias)

- **`SuperAdmin.tsx` es monolítico (~2242 líneas). No fragmentar sin razón.**
- Al agregar una vista: actualizar el union type `View`, añadir el `case` en `renderView()` y la entrada en `NAV`.
- Las APIs de restaurantes (y demás mutaciones importantes) llaman a `POST /api/superadmin/audit` después de cada cambio — mantener ese patrón.
- `supabasePortales` **solo** en `save-flags`, `tickets`, `revenue`.
- `mysql2` está en `package.json` pero **no se usa** — **no eliminar sin confirmar**.
- Cualquier flag nuevo para portales debe escribirse en la BD de portales (sufijo `_portales`).
- Antes de escribir código nuevo de Next.js, leer `node_modules/next/dist/docs/` (Next.js 16 tiene breaking changes; `params` y `cookies()` son async).
- Branding: Portales = `#E8912A`, NICHO = `#B90F45`. El sync de GitHub Actions excluye los archivos de branding de portales.

---

## 15. Riesgos de seguridad

1. **`sa_session` es un valor fijo conocido** (`nicho_sa_authenticated_2024`). Cualquiera que lo conozca puede falsificar la cookie y entrar sin contraseña. No está firmado ni vinculado al usuario, no rota. **Mitigación recomendada:** firmar la sesión (JWT/HMAC con secreto en env), incluir expiración real e identidad del usuario.

2. **`/api/save-flags` no tiene autenticación.** Cualquiera puede leer y **escribir** feature flags y permisos de cualquier restaurante (incluido Portales) sin sesión. **Mitigación:** agregar `verifySaSession()` al POST (y al menos limitar el GET).

3. **`ADMIN_SECRET` está vacío (`""`).** El HMAC del demo-proxy se calcula con clave vacía, por lo que cualquiera que conozca el formato `<adminId>.<hmac("")>` puede forjar una sesión de admin contra mi-proyecto. Funciona "por coincidencia" porque ambos lados usan `""`. **Mitigación:** definir un secreto real compartido.

4. **`mysql2` muerto.** Dependencia presente sin uso; amplía la superficie de vulnerabilidades. No eliminar sin confirmar (regla del proyecto), pero documentado como deuda.

5. **IP hardcodeada en auditoría** (`'187.xxx.12'`). El log no registra la IP real del actor, reduciendo el valor forense de la auditoría.

6. **Credenciales en el repositorio.** Los hashes SHA-256 de las contraseñas están en `auth/route.ts`. Con SALT conocido (`nicho_superadmin_2024`), son vulnerables a ataques de diccionario offline si el repo se filtra. **Mitigación:** usar un KDF lento (bcrypt/argon2) y mover credenciales fuera del código.

---

*Fin del manual técnico.*

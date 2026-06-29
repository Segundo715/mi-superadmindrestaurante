# Documentación Técnica Completa — `mi-superadmindrestaurante` (NICHO Super Admin)

> **Generada:** 2026-06-28 | **Modelo:** Claude Opus 4.8 (exploración exhaustiva del código fuente)
> **URL producción:** `mi-superadmindrestaurante.vercel.app`
> **Usuarios:** Jesús y Eloy (dueños de la plataforma NICHO)

---

## 0. Resumen ejecutivo

Panel de control global de la plataforma NICHO. Desde aquí los dueños gestionan todos los restaurantes clientes: feature flags por módulo/rol, planes, pagos, solicitudes de acceso, seguridad, auditoría, ventas reales y un buzón de tickets/soporte. Se conecta con **dos bases de datos Supabase** (BD principal compartida + BD propia de portales).

---

## 1. Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js **16.2.4** (App Router) |
| UI | React **19.2.4** + TypeScript 5 |
| Estilos | Tailwind CSS 4 + variables CSS (prefijo `.sa-`) |
| Base de datos | **Supabase dual** (BD principal + BD portales) |
| Auth | SHA-256 + salt hardcodeado + cookie `sa_session` (sin JWT) |
| Deploy | Vercel — `mi-superadmindrestaurante.vercel.app` |

---

## 2. Estructura de carpetas

```
mi-superadmindrestaurante/
├── app/
│   ├── layout.tsx                     # Root layout (Geist fonts, lang="es")
│   ├── page.tsx                       # Redirige "/" → /sa-login
│   ├── globals.css                    # Tailwind v4
│   │
│   ├── sa-login/
│   │   └── page.tsx                   # Formulario de login del Super Admin
│   │
│   ├── superadmin/
│   │   ├── layout.tsx                 # Auth guard: verifica cookie sa_session
│   │   ├── page.tsx                   # Monta <SuperAdmin/>
│   │   ├── superadmin.css             # Dark theme, variables CSS, clases .sa-*
│   │   ├── demo/
│   │   │   └── page.tsx               # Panel "Control de Demo" → inyecta datos a mi-proyecto
│   │   └── components/
│   │       └── SuperAdmin.tsx         # Dashboard monolítico (~2242 líneas, 14 vistas)
│   │
│   └── api/
│       ├── demo-proxy/route.ts        # Proxy server→server a mi-proyecto
│       ├── public/register/route.ts   # Auto-registro público de restaurantes
│       ├── save-flags/route.ts        # Leer/guardar feature flags y permisos
│       └── superadmin/
│           ├── auth/route.ts          # Login (POST) / Logout (DELETE)
│           ├── audit/route.ts         # Log de auditoría
│           ├── discounts/route.ts     # Códigos de descuento
│           ├── discounts/[id]/route.ts
│           ├── plans/route.ts         # Planes (con seed automático)
│           ├── requests/route.ts      # Solicitudes de acceso
│           ├── requests/[id]/route.ts
│           ├── restaurants/route.ts   # CRUD restaurantes
│           ├── restaurants/[id]/route.ts
│           ├── revenue/route.ts       # Ventas reales (3 fuentes)
│           ├── security/route.ts      # Config de seguridad por restaurante
│           └── tickets/route.ts       # Inbox de tickets (BD dual)
│
├── lib/
│   ├── saAuth.ts                      # verifySaSession() — guard de APIs
│   ├── supabase.ts                    # Cliente anon key — BD principal
│   ├── supabaseAdmin.ts               # Cliente service role — BD principal
│   └── supabasePortales.ts            # Cliente service role — BD portales
│
├── Excalidraw/                        # Mockups de diseño
├── CONTEXT.md                         # Documentación previa (parcialmente desactualizada)
├── next.config.ts                     # Security headers + allowedDevOrigins
└── Documentacion/                     # Esta carpeta
```

---

## 3. Rutas / Páginas

| Ruta | Tipo | Acceso | Descripción |
|------|------|--------|-------------|
| `/` | Server | Público | `redirect("/sa-login")` |
| `/sa-login` | Client | Público | Formulario de login. POST a `/api/superadmin/auth`. Guarda nombre en `localStorage.sa_user` y redirige a `/superadmin` |
| `/superadmin` | Server+Client | **Protegido** | `layout.tsx` verifica cookie `sa_session`. Renderiza dashboard con 14 vistas |
| `/superadmin/demo` | Client | Protegido | Panel "Control de Demo": inserta datos de muestra en `mi-proyecto` (menú, recetas, pedidos, reseñas, slides TV, clientes) vía proxy |

---

## 4. APIs — Endpoints completos

> Todos los endpoints `/api/superadmin/*` requieren `verifySaSession()` y devuelven `401` si la cookie `sa_session` es inválida.

### Auth

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/superadmin/auth` | POST | Login: `{username, password}`. Calcula `SHA-256(SALT + password)` y compara con hash hardcodeado. Si coincide → cookie `sa_session` httpOnly, Secure, SameSite=Strict, 8h |
| `/api/superadmin/auth` | DELETE | Logout: borra cookie `sa_session` |

Salt hardcodeado: `nicho_superadmin_2024`

### Restaurantes (tabla `sa_restaurants`)

| Endpoint | Método | Body / Params | Descripción |
|----------|--------|---------------|-------------|
| `/api/superadmin/restaurants` | GET | — | Lista restaurantes ordenados por `created_at` desc |
| `/api/superadmin/restaurants` | POST | `{name, email, plan?}` | Crea restaurante. `max_users`: premium→20, basic→5, trial→3. Genera `api_token: nch_live_xxx`. Devuelve `201` |
| `/api/superadmin/restaurants/[id]` | PATCH | `{status?, plan?, notes?, balance?, nextPayment?, lastPayment?, maxUsers?}` | Actualiza campos parciales |
| `/api/superadmin/restaurants/[id]` | DELETE | — | Elimina restaurante |

### Auditoría (tabla `sa_audit_log`)

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/superadmin/audit` | GET | Últimas 200 entradas ordenadas por `ts` desc |
| `/api/superadmin/audit` | POST | `{action, details?, type?, restaurant?, user?}` — registra una acción |

### Descuentos (tabla `sa_discounts`)

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/superadmin/discounts` | GET | Lista códigos ordenados por `active` desc |
| `/api/superadmin/discounts` | POST | `{code, discount, type('%'/'$'), maxUses?, expiresAt, note?}` — crea código (uppercase, `uses=0`, `active=true`) |
| `/api/superadmin/discounts/[id]` | PATCH | `{active?, uses?}` — activar/desactivar o actualizar usos |
| `/api/superadmin/discounts/[id]` | DELETE | Elimina código |

### Planes (tabla `sa_plans`)

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/superadmin/plans` | GET | Lista planes. **Si tabla vacía → seed automático** con trial/basic/premium (precios 0/799/2499) |
| `/api/superadmin/plans` | PATCH | `{id, price?, maxUsers?, features?, color?}` — edita plan |

### Solicitudes (tabla `sa_requests`)

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/superadmin/requests` | GET | Lista solicitudes por `ts` desc |
| `/api/superadmin/requests` | POST | `{restaurantName, requestedBy, feature, reason?}` — crea solicitud `pending` |
| `/api/superadmin/requests/[id]` | PATCH | `{status, rejectReason?}` — aprobar (`approved`) o rechazar (`rejected`) |

### Seguridad (tabla `sa_security`)

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/superadmin/security` | GET | Lista configuraciones de seguridad por restaurante |
| `/api/superadmin/security` | POST | Upsert por `restaurant_id`: `{sessionHours, pinRequired, allowedStart, allowedEnd, maxFailedLogins, ipWhitelist}` |

Defaults: 8h sesión, sin PIN, horario 07:00–23:00, 5 intentos, sin whitelist IP.

### Ventas reales (tablas `orders` + `settings`)

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/superadmin/revenue` | GET | Ventas de **3 fuentes**: Nicho (BD principal, `restaurant_id='default'`), Portales (BD portales), Resta3 (derivado de `settings.cortes_historial` BD principal). Calcula totales del día y mes por método de pago (efectivo/tarjeta/transferencia/domicilio detectados por etiquetas en `notes`) |

### Tickets — Sistema de soporte (tabla `sa_tickets` en **ambas BDs**)

| Endpoint | Método | Params | Descripción |
|----------|--------|--------|-------------|
| `/api/superadmin/tickets` | GET | — | Lee `sa_tickets` de BD principal y BD portales en paralelo, fusiona y ordena por `created_at` desc. Etiqueta `source: 'main' | 'portales'` |
| `/api/superadmin/tickets` | GET | `?count=true` | Devuelve `{unread}` = suma de tickets no leídos en ambas BDs |
| `/api/superadmin/tickets` | PATCH | `{id, source}` | Marca ticket como leído en la BD correspondiente |
| `/api/superadmin/tickets` | DELETE | `?id=&source=` | Elimina ticket de la BD correspondiente |
| `/api/superadmin/tickets` | PUT | — | Marca **todos** los tickets no leídos como leídos en **ambas** BDs |

### Feature flags y permisos (tabla `settings`)

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/save-flags` | GET | `?key=<clave>`. Si la clave termina en `_portales`, lee de la **BD portales** (sin el sufijo). Devuelve el objeto `{featureId: bool}` |
| `/api/save-flags` | POST | `{settingsKey, flags}` — borra y reinserta la fila. Las claves `_portales` se escriben en BD portales |

Claves usadas: `feature_flags`, `feature_flags_resta3`, `feature_flags_portales`, `employee_permissions`, `user_permissions`, `employee_permissions_portales`, `user_permissions_portales`

> ⚠️ Este endpoint **no requiere sesión** — riesgo de escritura no autorizada de flags.

### Auto-registro público (tabla `sa_restaurants`)

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/public/register` | POST | `{key, restaurantId, name, users?}`. Protegido por `NICHO_REGISTER_KEY`. Busca `notes LIKE 'rid:<restaurantId>%'`: si existe → actualiza `last_active`/`users`/`login_count++`; si no → crea con plan trial. Los restaurantes llaman esto al hacer login de admin |

### Demo proxy

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/demo-proxy` | POST | `{path, body}`. Reenvía server→server a `mi-proyecto-phi-ecru.vercel.app{path}`. Solo acepta paths `/api/*`. Firma cookie `admin_session` con HMAC-SHA256 usando `ADMIN_SECRET` compartido con mi-proyecto |

---

## 5. Librerías (`lib/`)

| Archivo | Exporta | Propósito |
|---------|---------|-----------|
| `saAuth.ts` | `verifySaSession(): Promise<boolean>` | Lee cookie `sa_session` y compara con `'nicho_sa_authenticated_2024'`. Guard de todas las APIs del superadmin |
| `supabase.ts` | `supabase` | Cliente anon key — BD principal (compartida con mi-proyecto) |
| `supabaseAdmin.ts` | `supabaseAdmin` | Cliente service role — BD principal. **Bypassa RLS**. Limpia BOM de env vars |
| `supabasePortales.ts` | `supabasePortales` | Cliente service role — BD propia de mi-restauranteportales. Variables `PORTALES_*` |

---

## 6. Dashboard (`SuperAdmin.tsx`) — 14 vistas

Componente monolítico de ~2242 líneas. Sin Redux/Zustand: todo con `useState`/`useEffect`/`useCallback`. Helpers compartidos: `Badge`, `Toggle`, `ToastBanner`, `Modal`.

| Vista (`view`) | Componente interno | Propósito |
|----------------|-------------------|-----------|
| `overview` | `Overview` | KPIs globales: restaurantes activos, MRR, morosidad, usuarios. Tarjetas clicables |
| `activity` | `Activity` | Score de salud/actividad 0–100 por restaurante |
| `restaurants` | `Restaurants` | Tabla con búsqueda/filtro por plan; alta de restaurante; suspender/activar; ver detalle |
| `flags` | `FeatureFlags` | Feature flags por scope (Global/r1/Portales) y por rol (admin/employee/user). Sincroniza con Supabase `settings` |
| `permisos` | `Permisos` | Permisos granulares por módulo para empleados y usuarios (tabs employee/user) |
| `solicitudes` | `Solicitudes` | Aprobar/rechazar solicitudes de acceso (tabs pending/approved/rejected) |
| `seguridad` | `Seguridad` | Duración de sesión, PIN, horario permitido, intentos fallidos, whitelist IP |
| `billing` | `Billing` | Registrar pagos, cambiar plan, ver deudas |
| `ventas` | `VentasReales` | Ventas reales de Nicho/Portales/Resta3 |
| `audit` | `AuditLog` | Log de auditoría con filtros por tipo/búsqueda y exportación CSV |
| `plans` | `Plans` | Editar precio/usuarios/features/color de planes; asignar plan a restaurante |
| `discounts` | `Discounts` | Generar/gestionar códigos de descuento |
| `maintenance` | `Maintenance` | Activar/desactivar modo mantenimiento por restaurante con motivo |
| `notifications` | `Notifications` | Inbox real de tickets/reportes de soporte |

### Orquestación (`Dashboard`)
Carga en paralelo al montar: `restaurants`, `auditLog`, `planConfigs`, `requests`, `tickets?count`. Define `addAudit`/`showToast`. Renderiza sidebar + topbar con badges de deuda, solicitudes pendientes y tickets no leídos.

### Catálogos de features (hardcodeados)

**FEATURES_R1** (19 módulos): ventas, operaciones, configuracion, analytics, reportes, menu, produccion, crm, customers, reservaciones, reviews, orders, loyaltyCard, favorites, tv, marketing, automatizaciones, contenido, cumpleanos

**FEATURES_RESTA3** (7 módulos, prefijo `r3_`): tpv, mesas, cocina, inventario, compras, empleados, reportes

**EMPLOYEE_MODULES** (9), **USER_MODULES** (6)

---

## 7. Base de datos (Supabase dual)

### BD principal (`zxynrlqubdlrwcfoewdv.supabase.co`)
Compartida con `mi-proyecto`. Coexisten tablas del restaurante y tablas `sa_*` del superadmin.

| Tabla | Columnas clave |
|-------|---------------|
| `sa_restaurants` | id, name, plan, status, users, max_users, registered_at, balance, next_payment, last_payment, email, notes (`rid:<id>`), api_token, last_active, login_count, created_at |
| `sa_audit_log` | id, ts, user_name, restaurant, action, details, ip, type |
| `sa_discounts` | id, code, discount, type('%'/'$'), max_uses, uses, expires_at, active, note |
| `sa_plans` | id (trial/basic/premium), name, price, trial_days, max_users, color, features(JSON) |
| `sa_requests` | id, restaurant_name, requested_by, feature, reason, ts, status, reject_reason |
| `sa_security` | restaurant_id(PK), session_hours, pin_required, allowed_start, allowed_end, max_failed_logins, ip_whitelist |
| `sa_tickets` | id, restaurant_id, restaurant_name, from_name, from_role, message, read, created_at |
| `settings` | key(PK), value(JSON string) |
| `orders` | total, notes, created_at, restaurant_id — usado por revenue |

### BD portales (`qmtsetcqnovcahuimkvg.supabase.co`)
BD propia de `mi-restauranteportales`. El superadmin usa:
- `sa_tickets` — tickets desde portales
- `settings` — flags y permisos de portales (sin sufijo; el sufijo `_portales` solo existe en las claves del lado superadmin para enrutar el cliente correcto)
- `orders` — ventas de portales

---

## 8. Variables de entorno

| Variable | Propósito |
|----------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL BD principal |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key BD principal |
| `SUPABASE_SERVICE_KEY` | Service role BD principal (bypassa RLS) |
| `PORTALES_SUPABASE_URL` | URL BD de portales |
| `PORTALES_SERVICE_KEY` | Service key BD portales |
| `ADMIN_SECRET` | Secreto HMAC compartido con mi-proyecto para firmar `admin_session` en demo-proxy |
| `NICHO_REGISTER_KEY` | Clave para el auto-registro público de restaurantes |

> `PORTALES_*` y `NICHO_REGISTER_KEY` **no están en `.env.local`** — se configuran solo en Vercel. Sin ellas, portales y registro fallan silenciosamente.

---

## 9. Dependencias clave

- `next@16.2.4`, `react@19.2.4`, `react-dom@19.2.4`
- `@supabase/supabase-js@^2.106.2` — único cliente de datos
- `mysql2@^3.22.3` — **declarado pero NO usado** (vestigio del template inicial)
- Dev: TypeScript 5, ESLint 9, Tailwind 4, tipos Node/React

---

## 10. Flujos principales

### Login SuperAdmin
`POST /api/superadmin/auth {username, password}` → `SHA-256(SALT + password)` comparado con hash hardcodeado → cookie `sa_session = 'nicho_sa_authenticated_2024'` (8h) → `localStorage.sa_user` → redirect a `/superadmin` → `Dashboard` carga 5 APIs en paralelo.

### Sistema de tickets (restaurante → superadmin)
1. Admin/empleado/Resta3 de un restaurante envía reporte → `POST /api/tickets` en **su** proyecto → inserta en `sa_tickets` de **su** BD
2. SuperAdmin abre Notificaciones → `GET /api/superadmin/tickets` lee ambas BDs, fusiona, etiqueta `source`
3. Badge de no leídos: `GET ?count=true` (suma de ambas BDs)
4. Acciones: leer (`PATCH`), eliminar (`DELETE`), marcar todos leídos (`PUT`)
5. UI: color por rol (Empleado azul, Resta3 morado, Admin ámbar)

### Feature flags (sincronización)
- Vista `FeatureFlags` carga 3 claves de Supabase
- Al togglear scope **Global/r1** → guarda en `feature_flags` (R1) y `feature_flags_resta3` (ids `r3_*`)
- Scope **Portales** → guarda en `feature_flags_portales` → escribe en BD portales
- `mi-proyecto` y `mi-restauranteportales` leen esas claves en tiempo real

### Ventas reales (revenue)
`GET /api/superadmin/revenue` devuelve array de 3 fuentes:
1. **Nicho** — `orders` con `restaurant_id='default'` en BD principal
2. **Portales** — `orders` en BD portales
3. **Resta3** — derivado de `settings.cortes_historial` en BD principal

Totales del día y mes por método de pago (efectivo/tarjeta/transferencia/domicilio).

### Auto-registro de restaurantes
Los restaurantes llaman `POST /api/public/register` al hacer login de admin. El superadmin actualiza `last_active`, `users` y `login_count` del restaurante en `sa_restaurants`.

---

## 11. Conexión con otros proyectos

| Proyecto | Cómo se conecta |
|----------|-----------------|
| **mi-proyecto** | (a) Comparte BD Supabase principal — lee/escribe `settings`, `orders`, `sa_*`. (b) Demo proxy inyecta datos firmando cookie HMAC. (c) mi-proyecto llama `/api/public/register` al login. (d) mi-proyecto lee feature flags desde `settings` |
| **mi-restauranteportales** | BD propia y separada (`PORTALES_*`). SuperAdmin la usa vía `supabasePortales` para `sa_tickets`, `settings` (flags/permisos), `orders` (ventas) |

`Resta3` es un perfil lógico dentro de la BD de Nicho (`restaurant_id='default'`). Sus ventas vienen de `cortes_historial` y sus flags del prefijo `r3_`.

---

## 12. Auth y seguridad

| Aspecto | Detalle |
|---------|---------|
| Login | Solo `jesus` y `eloy`. `SHA-256(salt + password)` contra hashes hardcodeados en `auth/route.ts`. No usa Supabase Auth |
| Sesión | Cookie `sa_session = 'nicho_sa_authenticated_2024'` (httpOnly, Secure, SameSite=Strict, 8h) |
| Guard páginas | `layout.tsx` server-side: si cookie inválida → `redirect('/sa-login')` |
| Guard APIs | `verifySaSession()` en cada endpoint `superadmin/*` |
| Headers | X-Content-Type-Options, X-Frame-Options: DENY, X-XSS-Protection, Referrer-Policy |

### Riesgos detectados
1. **Cookie de valor fijo** — `sa_session` es una constante pública en el código; cualquiera que la conozca puede falsificar sesión
2. **`/api/save-flags` sin auth** — un tercero puede leer/escribir feature flags y permisos de cualquier restaurante
3. **`ADMIN_SECRET` puede ser vacío** (`''`) en demo-proxy si no está la env var
4. `mysql2` es dependencia muerta

---

## 13. Configuración

**`next.config.ts`:**
- `allowedDevOrigins`: localhost, IPs LAN, ngrok
- Headers globales: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block`, `Referrer-Policy: strict-origin-when-cross-origin`

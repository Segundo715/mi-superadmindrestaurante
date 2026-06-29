# Documentación Técnica — `mi-superadmindrestaurante` (NICHO Super Admin)

> **Actualizada:** 2026-06-28
> **URL producción:** mi-superadmindrestaurante.vercel.app
> **Usuarios:** Jesús y Eloy (dueños de la plataforma NICHO)

---

## 1. ¿Qué hace esta app?

Panel de control global de la plataforma NICHO. Desde aquí los dueños gestionan todos los restaurantes clientes:

- Alta y estado de restaurantes (plan, balance, pagos)
- Feature flags por módulo y por rol para cada restaurante
- Permisos granulares de empleados y clientes
- Inbox de tickets/soporte enviados desde los restaurantes
- Auditoría, seguridad, ventas reales, códigos de descuento, planes

---

## 2. Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js 16 (App Router) |
| UI | React 19 + TypeScript |
| Estilos | Tailwind CSS 4 |
| Base de datos | Supabase dual (BD principal + BD portales) |
| Auth | SHA-256 + salt hardcodeado + cookie `sa_session` |
| Deploy | Vercel |

---

## 3. Estructura de carpetas

```
mi-superadmindrestaurante/
├── app/
│   ├── sa-login/page.tsx              # Login del Super Admin
│   ├── superadmin/
│   │   ├── layout.tsx                 # Guard: verifica cookie sa_session
│   │   ├── page.tsx                   # Monta <SuperAdmin/>
│   │   ├── superadmin.css             # Dark theme, variables --sa-*
│   │   ├── demo/page.tsx              # Panel de inserción de datos demo
│   │   └── components/SuperAdmin.tsx  # Dashboard monolítico (~2242 líneas)
│   └── api/
│       ├── save-flags/route.ts        # Feature flags y permisos (BD dual)
│       ├── public/register/route.ts   # Auto-registro de restaurantes
│       ├── demo-proxy/route.ts        # Proxy hacia mi-proyecto
│       └── superadmin/
│           ├── auth/route.ts
│           ├── restaurants/route.ts   # + [id]/route.ts
│           ├── audit/route.ts
│           ├── discounts/route.ts     # + [id]/route.ts
│           ├── plans/route.ts
│           ├── requests/route.ts      # + [id]/route.ts
│           ├── security/route.ts
│           ├── revenue/route.ts
│           └── tickets/route.ts
├── lib/
│   ├── saAuth.ts          # verifySaSession() — guard de APIs
│   ├── supabase.ts        # Cliente anon key — BD principal
│   ├── supabaseAdmin.ts   # Cliente service role — BD principal
│   └── supabasePortales.ts # Cliente service role — BD portales
└── memoria.md             # Referencia rápida del ecosistema
```

---

## 4. Autenticación

- **Usuarios:** solo `jesus` y `eloy` (hardcodeados en `/api/superadmin/auth`)
- **Hash:** `SHA-256(nicho_superadmin_2024 + password)` comparado con hash en código
- **Cookie:** `sa_session = 'nicho_sa_authenticated_2024'` — httpOnly, Secure, SameSite=Strict, 8h
- **Guard de páginas:** `superadmin/layout.tsx` — server-side, redirige a `/sa-login` si cookie inválida
- **Guard de APIs:** `verifySaSession()` en cada endpoint `/api/superadmin/*`

> ⚠️ `sa_session` es valor fijo conocido en el código — falsificable.
> ⚠️ `/api/save-flags` no tiene autenticación.

---

## 5. Doble cliente Supabase

| Cliente | Archivo | BD | Uso |
|---------|---------|-----|-----|
| `supabase` | `lib/supabase.ts` | Principal (`zxynrlqubdlrwcfoewdv`) | Lectura general |
| `supabaseAdmin` | `lib/supabaseAdmin.ts` | Principal | Service role, bypassa RLS |
| `supabasePortales` | `lib/supabasePortales.ts` | Portales (`qmtsetcqnovcahuimkvg`) | BD propia de mi-restauranteportales |

`supabasePortales` **solo en:** `api/save-flags`, `api/superadmin/tickets`, `api/superadmin/revenue`.

Variables `PORTALES_*` **solo existen en Vercel**, no en `.env.local`.

---

## 6. APIs — Todos los endpoints

### Auth

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/superadmin/auth` | POST | Login: `{username, password}` → cookie `sa_session` |
| `/api/superadmin/auth` | DELETE | Logout: borra cookie |

### Restaurantes (tabla `sa_restaurants`)

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/superadmin/restaurants` | GET | Lista restaurantes |
| `/api/superadmin/restaurants` | POST | `{name, email, plan?}` — crea restaurante, genera `api_token` |
| `/api/superadmin/restaurants/[id]` | PATCH | Actualiza status, plan, balance, notas, etc. |
| `/api/superadmin/restaurants/[id]` | DELETE | Elimina restaurante |

### Auditoría (tabla `sa_audit_log`)

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/superadmin/audit` | GET | Últimas 200 entradas |
| `/api/superadmin/audit` | POST | `{action, details?, type?, restaurant?, user?}` |

### Descuentos (tabla `sa_discounts`)

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/superadmin/discounts` | GET | Lista códigos |
| `/api/superadmin/discounts` | POST | `{code, discount, type, maxUses?, expiresAt, note?}` |
| `/api/superadmin/discounts/[id]` | PATCH | Activar/desactivar |
| `/api/superadmin/discounts/[id]` | DELETE | Eliminar |

### Planes (tabla `sa_plans`)

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/superadmin/plans` | GET | Lista planes (auto-seed si vacío: trial/basic/premium) |
| `/api/superadmin/plans` | PATCH | `{id, price?, maxUsers?, features?, color?}` |

### Solicitudes (tabla `sa_requests`)

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/superadmin/requests` | GET | Lista solicitudes |
| `/api/superadmin/requests` | POST | `{restaurantName, requestedBy, feature, reason?}` |
| `/api/superadmin/requests/[id]` | PATCH | `{status, rejectReason?}` — aprobar o rechazar |

### Seguridad (tabla `sa_security`)

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/superadmin/security` | GET | Lista configuraciones por restaurante |
| `/api/superadmin/security` | POST | Upsert: `{sessionHours, pinRequired, allowedStart, allowedEnd, maxFailedLogins, ipWhitelist}` |

### Ventas reales

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/superadmin/revenue` | GET | Ventas de 3 fuentes: NICHO (BD principal), Portales (BD portales), Resta3 (cortes_historial) |

### Tickets — Sistema dual

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/superadmin/tickets` | GET | Lee ambas BDs en paralelo, fusiona, etiqueta `source: 'main' \| 'portales'` |
| `/api/superadmin/tickets` | GET `?count=true` | Devuelve `{unread}` suma de ambas BDs |
| `/api/superadmin/tickets` | PATCH `{id, source}` | Marca ticket como leído |
| `/api/superadmin/tickets` | DELETE `?id=&source=` | Elimina ticket |
| `/api/superadmin/tickets` | PUT | Marca todos como leídos en ambas BDs |

### Feature flags y permisos (tabla `settings`)

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/save-flags` | GET `?key=` | Lee clave. Si termina en `_portales` → BD portales |
| `/api/save-flags` | POST `{settingsKey, flags}` | Guarda flags. Claves `_portales` → BD portales |

**Claves:** `feature_flags`, `feature_flags_resta3`, `feature_flags_portales`, `employee_permissions`, `user_permissions`, `employee_permissions_portales`, `user_permissions_portales`

### Auto-registro y demo

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/public/register` | POST | `{key, restaurantId, name}` protegido por `NICHO_REGISTER_KEY`. Upsert en `sa_restaurants` |
| `/api/demo-proxy` | POST | `{path, body}` — reenvía a mi-proyecto firmando cookie HMAC con `ADMIN_SECRET` |

---

## 7. Dashboard — 14 vistas (`SuperAdmin.tsx`)

Componente monolítico de ~2242 líneas. Sin Redux/Zustand — todo `useState`/`useEffect`.

| Vista | Descripción |
|-------|-------------|
| `overview` | KPIs globales: restaurantes activos, MRR, morosidad |
| `activity` | Score de salud 0–100 por restaurante |
| `restaurants` | Tabla de restaurantes con CRUD y filtros |
| `flags` | Feature flags por scope (Global / Portales) y por rol |
| `permisos` | Permisos granulares por módulo (employee / user) |
| `solicitudes` | Aprobar/rechazar solicitudes de acceso |
| `seguridad` | Sesión, PIN, horario, intentos, whitelist IP |
| `billing` | Registrar pagos, cambiar plan, ver deudas |
| `ventas` | Ventas reales de las 3 fuentes |
| `audit` | Log de auditoría con filtros y exportación CSV |
| `plans` | Editar precio/usuarios/features/color de planes |
| `discounts` | Generar y gestionar códigos de descuento |
| `maintenance` | Activar modo mantenimiento por restaurante |
| `notifications` | Inbox real de tickets con badge de no leídos |

---

## 8. Tablas en BD

### BD principal (`zxynrlqubdlrwcfoewdv`)

| Tabla | Columnas clave |
|-------|---------------|
| `sa_restaurants` | id, name, plan, status, users, max_users, balance, next_payment, email, notes, api_token, last_active, login_count |
| `sa_audit_log` | id, ts, user_name, restaurant, action, details, ip, type |
| `sa_discounts` | id, code, discount, type, max_uses, uses, expires_at, active, note |
| `sa_plans` | id (trial/basic/premium), name, price, trial_days, max_users, color, features(JSON) |
| `sa_requests` | id, restaurant_name, requested_by, feature, reason, ts, status, reject_reason |
| `sa_security` | restaurant_id(PK), session_hours, pin_required, allowed_start, allowed_end, max_failed_logins, ip_whitelist |
| `sa_tickets` | id, restaurant_id, restaurant_name, from_name, from_role, message, read, created_at |
| `settings` | key(PK), value(JSON) |
| `orders` | total, notes, created_at, restaurant_id |

### BD portales (`qmtsetcqnovcahuimkvg`)

- `sa_tickets` — tickets enviados desde mi-restauranteportales
- `settings` — feature flags y permisos de portales
- `orders` — ventas de portales

---

## 9. Variables de entorno

| Variable | Requerida | Dónde |
|----------|-----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | `.env.local` + Vercel |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | `.env.local` + Vercel |
| `SUPABASE_SERVICE_KEY` | ✅ | `.env.local` + Vercel |
| `PORTALES_SUPABASE_URL` | ✅ portales | **Solo Vercel** |
| `PORTALES_SERVICE_KEY` | ✅ portales | **Solo Vercel** |
| `ADMIN_SECRET` | ✅ | Compartido con mi-proyecto |
| `NICHO_REGISTER_KEY` | ✅ | Solo Vercel |

---

## 10. Conexión con los otros proyectos

```
mi-proyecto ──────────────────── BD principal (zxynrlqubdlrwcfoewdv)
     │                                │
     │  /api/public/register          │  sa_restaurants, sa_tickets,
     ▼  (auto-registro al login)      │  settings, orders
mi-superadmindrestaurante ────────────┘
     │                           BD portales (qmtsetcqnovcahuimkvg)
     │  supabasePortales          │  sa_tickets, settings, orders
     └───────────────────────────►│
                                  │
mi-restauranteportales ───────────┘
```

---

## 11. Restricciones importantes

- `SuperAdmin.tsx` es monolítico (~2242 líneas). Vista nueva → actualizar type `View` y sidebar.
- `mysql2` está en package.json pero **no se usa** — no eliminar sin confirmar.
- `supabasePortales` solo en: `api/save-flags`, `api/superadmin/tickets`, `api/superadmin/revenue`.
- Las APIs llaman `POST /api/superadmin/audit` automáticamente después de mutaciones importantes.

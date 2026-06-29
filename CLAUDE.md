@AGENTS.md

# CLAUDE.md — mi-superadmindrestaurante (Super Admin NICHO)

Panel de control global de la plataforma NICHO. Gestionan todos los restaurantes clientes desde aquí.

## Comandos

```bash
npm run dev      # Servidor de desarrollo
npm run build    # Build de producción
npx tsc --noEmit # Verificar tipos
```

## Qué hace esta app

Panel monolítico para los dueños de NICHO (Jesús y Eloy). Permite:
- Gestionar restaurantes clientes (alta, estado, plan, balance)
- Feature flags por módulo y por rol para cada restaurante
- Permisos granulares de empleados y clientes
- Tickets/soporte provenientes de los restaurantes
- Auditoría, seguridad, ventas reales, códigos de descuento, planes

## Arquitectura

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Supabase dual · SHA-256 auth hardcodeado

> ⚠️ Next.js 16 tiene cambios que rompen compatibilidad — ver AGENTS.md.

### Doble cliente Supabase

| Cliente | Archivo | BD | Uso |
|---------|---------|-----|-----|
| `supabase` | `lib/supabase.ts` | Principal (zxynrlqubdlrwcfoewdv) | Anon key, lectura general |
| `supabaseAdmin` | `lib/supabaseAdmin.ts` | Principal | Service role, bypassa RLS |
| `supabasePortales` | `lib/supabasePortales.ts` | Portales (qmtsetcqnovcahuimkvg) | Service role, BD propia de portales |

Las variables `PORTALES_*` **solo existen en Vercel**, no en `.env.local`.

### Autenticación

- Login hardcodeado: solo `jesus` y `eloy`
- Hash: `SHA-256(salt + password)` donde salt = `nicho_superadmin_2024`
- Cookie: `sa_session = 'nicho_sa_authenticated_2024'` (httpOnly, Secure, SameSite=Strict, 8h)
- Guard páginas: `superadmin/layout.tsx` (server-side)
- Guard APIs: `verifySaSession()` de `lib/saAuth.ts` en cada `/api/superadmin/*`

> ⚠️ **Riesgo:** `sa_session` es un valor fijo conocido — falsificable. `/api/save-flags` no tiene auth.

### Feature flags — rutas de guardado

El endpoint `/api/save-flags` decide qué BD usar por el sufijo de la clave:
- Claves que terminan en `_portales` → escribe en **BD portales** (sin el sufijo en la BD)
- Resto → BD principal

Claves usadas: `feature_flags`, `feature_flags_resta3`, `feature_flags_portales`, `employee_permissions`, `user_permissions`, `employee_permissions_portales`, `user_permissions_portales`

### Tickets (sistema dual)

Los restaurantes reportan tickets con `POST /api/tickets` en **su propio proyecto**. El superadmin lee tickets de **ambas BDs** en paralelo con `GET /api/superadmin/tickets` y los fusiona etiquetando `source: 'main' | 'portales'`.

### Tablas propias del superadmin

Todas en BD principal con prefijo `sa_`: `sa_restaurants`, `sa_audit_log`, `sa_discounts`, `sa_plans`, `sa_requests`, `sa_security`, `sa_tickets`. La tabla `sa_tickets` también existe en la BD portales.

## Variables de entorno críticas

| Variable | Requerida | Dónde |
|----------|-----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | `.env.local` + Vercel |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | `.env.local` + Vercel |
| `SUPABASE_SERVICE_KEY` | ✅ | `.env.local` + Vercel |
| `PORTALES_SUPABASE_URL` | ✅ para portales | **Solo Vercel** |
| `PORTALES_SERVICE_KEY` | ✅ para portales | **Solo Vercel** |
| `ADMIN_SECRET` | ✅ | Compartido con mi-proyecto (demo proxy) |
| `NICHO_REGISTER_KEY` | ✅ | Solo Vercel |

## Restricciones importantes

- El dashboard es un componente monolítico `SuperAdmin.tsx` (~2242 líneas). No fragmentar sin razón.
- `mysql2` está en package.json pero **no se usa** — no eliminar sin confirmar.
- Si se agrega una vista nueva, actualizar el union type `View` en `SuperAdmin.tsx` y agregar la opción al sidebar.
- Las APIs de restaurantes llaman automáticamente `POST /api/audit` después de cada mutación importante.
- `supabasePortales` solo debe usarse en: `api/save-flags`, `api/superadmin/tickets`, `api/superadmin/revenue`.

## Notas de contexto (sesiones previas)

- **2026-06-28:** restaurantes existentes tenían `restaurant_id='default'` en sus datos. Causa: env var `NEXT_PUBLIC_RESTAURANT_ID` no estaba configurada al crear los datos. Solución: PATCH masivo a todos los registros de las tablas `admins`, `employees`, `customers`, `menu_items`, `recipes`.
- Los colores de portales son `#E8912A` (naranja). NICHO usa `#B90F45` (rosa/guinda). El sync de GitHub Actions tiene una lista de exclusiones para evitar sobreescribir los archivos de branding de portales.
- La BD de portales (`qmtsetcqnovcahuimkvg`) tiene sus propias tablas `sa_tickets` y `settings`. Cualquier flag nuevo para portales debe ir en esa BD.


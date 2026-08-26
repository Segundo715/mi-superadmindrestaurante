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

### Cinco clientes Supabase

| Cliente | Archivo | BD | Uso |
|---------|---------|-----|-----|
| `supabase` | `lib/supabase.ts` | Principal (zxynrlqubdlrwcfoewdv) | Anon key, lectura general |
| `supabaseAdmin` | `lib/supabaseAdmin.ts` | Principal | Service role, bypassa RLS |
| `supabasePortales` | `lib/supabasePortales.ts` | Portales (qmtsetcqnovcahuimkvg) | Service role, BD propia de portales |
| `supabaseMiMenu` | `lib/supabaseMiMenu.ts` | mi-menu (proyecto propio) | Service role, BD propia del producto mi-menu |
| `supabaseMiCard` | `lib/supabaseMiCard.ts` | mi-card (proyecto propio) | Service role, BD propia del producto mi-card — **cliente listo en código, pero el proyecto Supabase todavía no existe** (ver nota abajo) |

Las variables `PORTALES_*` **solo existen en Vercel**; `MIMENU_*` y `MICARD_*` están **también en `.env.local`** para desarrollo local, no van todas en el mismo lugar.

> **2026-08-26 — separación de mi-card en curso, avanzó pero sigue sin completarse.** Hasta ahora mi-card compartía la BD principal con mi-proyecto (multi-tenant por `restaurant_id`, sin aislamiento real — riesgo #7 de `Documentacion/documentos/plan-multiproducto-y-flota-2026-08-21.md` §7.1). Estado real:
> 1. ✅ Proyecto Supabase de mi-card creado (`bkwsinjckqupawckfpyu.supabase.co`, org "mi-carsegundo").
> 2. ✅ `MICARD_SUPABASE_URL`/`MICARD_SERVICE_KEY` en `.env.local` (desarrollo). ⬜ Falta ponerlas también en Vercel (producción) — hasta entonces `resolveTarget()` en `/api/save-flags` sigue cayendo a la BD principal para `_micard`, sin romper nada.
> 3. ⬜ Falta correr `CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);` en el SQL Editor del proyecto nuevo de mi-card — está vacío, sin esa tabla ni las flags ni nada más puede leerse/escribirse ahí todavía.
> 4. ⬜ Falta migrar a mano la fila `settings.feature_flags_micard` de la BD principal → `settings.feature_flags` en la BD nueva de mi-card (el endpoint no migra datos existentes, solo cambia a dónde lee/escribe de ahí en adelante).
> 5. ⬜ Falta actualizar el repo `Segundo715/mi-card` para que sus tablas de negocio (`admins`, `employees`, `customers`, tarjetas, sellos) apunten a la BD nueva en vez de la principal, y migrar los datos de los clientes de mi-card que ya existan.
> 6. ⬜ Falta poner `supabase_project_ref` (`bkwsinjckqupawckfpyu`) en la fila `mi-card` de `sa_products`.

### Autenticación

- Login hardcodeado: solo `jesus` y `eloy`
- Hash: `SHA-256(salt + password)` donde salt = `nicho_superadmin_2024`
- Cookie: `sa_session = 'nicho_sa_authenticated_2024'` (httpOnly, Secure, SameSite=Strict, 8h)
- Guard páginas: `superadmin/layout.tsx` (server-side)
- Guard APIs: `verifySaSession()` de `lib/saAuth.ts` en cada `/api/superadmin/*`

> ⚠️ **Riesgo pendiente:** `sa_session` es un valor fijo conocido — falsificable. Sin rate limiting en login.
> ✅ **Corregido 2026-07-06:** `/api/save-flags` POST ya requiere `verifySaSession()`. `/api/ai/chat` ya requiere sesión válida (excepto rol customer).

### Feature flags — rutas de guardado

El endpoint `/api/save-flags` decide qué BD usar por el sufijo de la clave:
- Claves que terminan en `_portales` → escribe en **BD portales** (sin el sufijo en la BD)
- Claves que terminan en `_mimenu` → escribe en **BD mi-menu** (sin el sufijo en la BD)
- Claves que terminan en `_micard` → escribe en **BD mi-card**, pero solo si `MICARD_SUPABASE_URL` está configurada; si no, cae al caso de abajo
- Resto (incluye `feature_flags_micard` mientras no exista el proyecto de mi-card) → BD principal

Claves usadas: `feature_flags`, `feature_flags_resta3`, `feature_flags_portales`, `feature_flags_mimenu`, `feature_flags_micard`, `employee_permissions`, `user_permissions`, `employee_permissions_portales`, `user_permissions_portales`

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
| `MIMENU_SUPABASE_URL` | ✅ para mi-menu | `.env.local` + Vercel |
| `MIMENU_SERVICE_KEY` | ✅ para mi-menu | `.env.local` + Vercel |
| `MICARD_SUPABASE_URL` | Para separar mi-card (ver nota arriba) | ✅ `.env.local` · ⬜ falta en Vercel |
| `MICARD_SERVICE_KEY` | Para separar mi-card (ver nota arriba) | ✅ `.env.local` · ⬜ falta en Vercel |
| `ADMIN_SECRET` | ✅ | Compartido con mi-proyecto (demo proxy) |
| `NICHO_REGISTER_KEY` | ✅ | Solo Vercel |
| `VERCEL_TOKEN` | Para monitoreo de flota | **Solo Vercel** — access token del team de NICHO |
| `VERCEL_TEAM_ID` | Para monitoreo de flota | **Solo Vercel** |
| `GITHUB_TOKEN` | Para monitoreo de flota | **Solo Vercel** — fine-grained PAT, `Contents:Read` + `Metadata:Read` |
| `GITHUB_BASE_OWNER` | Para monitoreo de flota | **Solo Vercel** |
| `CRON_SECRET` | Para el cron de flota | **Solo Vercel** — protege `/api/cron/fleet-refresh` |

Las 5 variables de flota son opcionales: si faltan, el monitoreo sigue funcionando solo con el health-check HTTP y marca las señales de Vercel/GitHub como `unknown` en vez de fallar.

## Restricciones importantes

- El dashboard es un componente monolítico `SuperAdmin.tsx` (~3100 líneas — creció bastante con Flota/Parches/Aprovisionamiento, ver más abajo). No fragmentar sin razón.
- `mysql2` está en package.json pero **no se usa** — no eliminar sin confirmar.
- Si se agrega una vista nueva, actualizar el union type `View` en `SuperAdmin.tsx` y agregar la opción al sidebar.
- Las APIs de restaurantes llaman automáticamente `POST /api/audit` después de cada mutación importante.
- `supabasePortales` solo debe usarse en: `api/save-flags`, `api/superadmin/tickets`, `api/superadmin/revenue`.
- Eliminar un restaurante (botón "Eliminar" en el detalle, `DELETE /api/superadmin/restaurants/[id]`) **solo borra el registro del superadmin** — no borra la instancia real (repo/deploy) si la tenía aprovisionada; eso se hace a mano en GitHub/Vercel.

## Catálogo multi-producto, flota y parches

NICHO vende 3 productos (`mi-card`, `mi-menu`, `mi-proyecto`) en 2 modalidades de pago (`mensual` | `unico`) — 6 planes activos en `sa_plans`, catalogados en `sa_products`. Cada cliente corre su propio repo/deploy (no multi-tenant compartido). Diseño completo, esquema de BD y flujos en `Documentacion/documentos/plan-multiproducto-y-flota-2026-08-21.md`; migración SQL en `Documentacion/sql/migraciones/2026-08-21-multiproducto-y-flota.sql` (correr una vez en el SQL Editor de Supabase, BD principal).

- `type Plan` en `SuperAdmin.tsx` ya **no es un enum cerrado** (`"trial"|"basic"|"premium"`) — es `string`. Los labels/colores/precio de un plan se resuelven contra `planConfigs` (cargado de `sa_plans`), nunca contra un `Record` hardcodeado.
- `sa_fleet_status` la reescribe el cron `GET /api/cron/fleet-refresh` (protegido con `CRON_SECRET`, no con `verifySaSession()`). Sin `VERCEL_TOKEN`/`GITHUB_TOKEN` configurados, solo corre el health-check HTTP y el resto queda en `unknown`.
- `sa_client_updates` es el historial de parches aplicados por cliente — lo escribe `POST /api/superadmin/client-updates`, que excluye automáticamente a los clientes cuyo `updates_until` ya venció (pago único sin ventana de actualizaciones vigente).
- `POST /api/superadmin/upgrade-plan` cambia plan/producto de un restaurante (con `dryRun` primero) pero **no copia datos entre productos todavía** — el mapeo de tablas de `mi-menu`/`mi-card` hacia `mi-proyecto` sigue sin implementarse (no es que falte acceso: desde 2026-08-24 sí hay lectura a los repos reales vía `gh` CLI — ver sección de repos abajo — pero mapear y migrar filas de clientes reales entre esquemas es trabajo aparte, no hecho todavía).
- `vercel.json` define el cron de `/api/cron/fleet-refresh` cada 15 min — **el plan Hobby de Vercel solo permite 1 cron al día**; si el proyecto sigue en Hobby, cambiar a un GitHub Action con `schedule` que haga `curl` al endpoint con `CRON_SECRET` (gratis, mismo efecto).

### Repos reales de cada producto (confirmado 2026-08-24 con `gh` CLI)

Los 3 productos SÍ tienen código real y confirmado, no adivinado:

| Producto | Repo | Notas |
|---|---|---|
| `mi-proyecto` | `Segundo715/mi-proyecto` | El original. `lib/supabase.ts` usa `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` (cliente); `lib/auth.ts` usa `ADMIN_SECRET`; `lib/db.ts` usa `NEXT_PUBLIC_RESTAURANT_ID` (default `'default'` si falta — la causa raíz del bug de 2026-06-28) |
| `mi-menu` | `Segundo715/mi-menu` | **Separado de mi-proyecto el 2026-08-24** — antes no existía como repo, se desplegaba a mano con `vercel deploy` sin Git conectado (mismo código que mi-proyecto, apuntando a su propia Supabase vía `MIMENU_*`). Mismas variables que mi-proyecto. |
| `mi-card` | `Segundo715/mi-card` | Repo propio, código distinto. `lib/supabase.ts` usa `NEXT_PUBLIC_SUPABASE_URL` + **`SUPABASE_SECRET_KEY`** (no anon — este cliente corre server-side y bypassa RLS) |

Los 3 están marcados como **"Template repository"** en GitHub (`is_template: true`) — eso habilita `POST /repos/{owner}/{repo}/generate`, que es lo que usa `lib/githubProvision.ts` para crear la instancia de un cliente nuevo con una sola llamada, sin necesitar `git` en la función serverless.

> `Segundo715/mi-tarjeta` es un duplicado abandonado de mi-card (mismas dependencias, nunca tocado desde su creación) — no se usa para nada, queda para que el usuario lo borre cuando quiera.

### Aprovisionamiento de instancias nuevas

`POST /api/superadmin/provision-client` (`dryRun:true` por default) genera el repo del cliente desde la plantilla de su producto y crea su proyecto en Vercel conectado a ese repo, usando `lib/githubProvision.ts` + `lib/vercelProvision.ts`. Actualiza `sa_restaurants.repo_owner/repo_name/repo_url/deploy_url/vercel_project_id` y asigna `restaurant_id` si el restaurante no tenía uno.

- **`Restaurants.addRestaurant()` ya lo dispara solo** (2026-08-26): "Registrar restaurante" hace el alta y, en la misma acción (`dryRun:false` directo, sin paso intermedio), crea el repo + deploy del producto elegido. El modal se queda abierto mostrando "Creando instancia…" hasta que termina.
- Si el aprovisionamiento automático falla (tokens sin configurar, nombre de repo repetido, etc.), el restaurante **igual queda registrado** — no se pierde el alta — y aparece el botón "Aprovisionar instancia" en su detalle (`Restaurants`, `SuperAdmin.tsx`) para reintentar a mano. Ese botón es el único camino para restaurantes dados de alta antes de este cambio.

**Hueco conocido:** no tenemos guardada la ANON key de Supabase de mi-menu (solo la `MIMENU_SERVICE_KEY`, que mi-menu no usa — su código pide la anon key). El endpoint crea la instancia igual pero lo reporta como advertencia; hay que agregar esa variable a mano en el proyecto de Vercel del cliente después.

**Variables de entorno para que esto funcione de verdad en producción (ninguna configurada todavía):**

| Variable | Dónde | Nota |
|---|---|---|
| `GITHUB_TOKEN` | Solo Vercel | **Ojo:** ya no es de solo lectura — ahora también lo usa el aprovisionamiento, necesita `Contents: Read and write` + `Administration: Write` (crear repos), no solo `Contents:Read` + `Metadata:Read` como se documentó para flota |
| `VERCEL_TOKEN` | Solo Vercel | Igual que arriba: para flota basta con leer deployments, pero aprovisionar necesita permiso de **crear proyectos** |

## Notas de contexto (sesiones previas)

- **2026-08-24/26:** sesión grande — catálogo multi-producto, monitoreo de flota, historial de parches, cambio de plan/producto con rollback, y aprovisionamiento automático de instancias (repo + deploy) por cliente. De paso: separó mi-menu a su propio repo, avanzó (no terminó) la separación de mi-card a su propia BD, corrigió 2 bugs de persistencia preexistentes (plan y mantenimiento no se guardaban), y un bug que hubiera tumbado `/api/save-flags` para **todos** los productos en el próximo deploy (`createClient('','')` lanza en seco si faltan `MICARD_SUPABASE_URL`/`MICARD_SERVICE_KEY`, y esas no están en Vercel todavía — arreglado con un placeholder que evita el crash). Migración SQL de esta sesión: `Documentacion/sql/migraciones/2026-08-21-multiproducto-y-flota.sql` — confirmar que ya se corrió antes de asumir que el catálogo de planes tiene datos.
- **2026-06-28:** restaurantes existentes tenían `restaurant_id='default'` en sus datos. Causa: env var `NEXT_PUBLIC_RESTAURANT_ID` no estaba configurada al crear los datos. Solución: PATCH masivo a todos los registros de las tablas `admins`, `employees`, `customers`, `menu_items`, `recipes`.
- Los colores de portales son `#E8912A` (naranja). NICHO usa `#B90F45` (rosa/guinda). El sync de GitHub Actions tiene una lista de exclusiones para evitar sobreescribir los archivos de branding de portales.
- La BD de portales (`qmtsetcqnovcahuimkvg`) tiene sus propias tablas `sa_tickets` y `settings`. Cualquier flag nuevo para portales debe ir en esa BD.


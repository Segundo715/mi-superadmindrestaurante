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

> ⚠️ **Latencia conocida (2026-09-01, sin resolver):** cualquier endpoint que toca `supabasePortales` (`/api/superadmin/tickets`, `/api/superadmin/revenue`) tarda **~7-8 segundos** en producción — confirmado con `curl` directo contra Vercel. Los que solo usan la BD principal (`plans`, `products`, `restaurants`) responden en <1s. Se probó la BD de Portales directo (sin pasar por Vercel) y respondió en 0.35s, así que la base en sí no es lenta — apunta a un **desajuste de región**: la función de Vercel corre en `iad1` (Washington D.C., ver logs de build) y el proyecto de Supabase de Portales probablemente está en otra región, así que cada llamada servidor-a-servidor paga esa distancia. No es un bug de código — ya se optimizó lo que se podía optimizar ahí (ver nota de sesión abajo, `revenue` ya no duplica una consulta). Arreglarlo de verdad requiere decidir si mover la región de la función de Vercel (riesgo: podría volver más lenta la BD principal si está en otra región) o mover/replicar la BD de Portales — el usuario prefirió dejarlo documentado por ahora, no tocar infraestructura sin confirmar antes en qué región está cada proyecto (Supabase dashboard → Project Settings → General).

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
| `MIMENU_SUPABASE_ANON_KEY` | ✅ para **aprovisionar** clientes de mi-menu (ver nota abajo) | ⬜ falta en ambos — sacarla del dashboard de Supabase del proyecto de mi-menu |
| `MICARD_SUPABASE_URL` | Para separar mi-card (ver nota arriba) | ✅ `.env.local` · ⬜ falta en Vercel |
| `MICARD_SERVICE_KEY` | Para separar mi-card (ver nota arriba) | ✅ `.env.local` · ⬜ falta en Vercel |
| `ADMIN_SECRET` | ✅ | Compartido con mi-proyecto (demo proxy) |
| `NICHO_REGISTER_KEY` | ✅ | Solo Vercel |
| `VERCEL_TOKEN` | Para monitoreo de flota | **Solo Vercel** — access token del team de NICHO |
| `VERCEL_TEAM_ID` | Para monitoreo de flota | **Solo Vercel** |
| `GITHUB_TOKEN` | Para monitoreo de flota | **Solo Vercel** — fine-grained PAT, `Contents:Read` + `Metadata:Read` |
| `GITHUB_BASE_OWNER` | Para monitoreo de flota | **Solo Vercel** |
| `CRON_SECRET` | Para el cron de flota | **Solo Vercel** — protege `/api/cron/fleet-refresh` |
| `GMAIL_USER` | Para alertas por correo (`lib/notify.ts`) | ✅ `.env.local` · ⬜ falta en Vercel |
| `GMAIL_APP_PASSWORD` | Para alertas por correo (`lib/notify.ts`) | ✅ `.env.local` · ⬜ falta en Vercel — contraseña de aplicación de 16 caracteres, no la contraseña real de la cuenta |
| `ALERT_EMAILS` | Para alertas por correo (`lib/notify.ts`) | ✅ `.env.local` (destinatarios separados por coma) · ⬜ falta en Vercel |

Las 5 variables de flota son opcionales: si faltan, el monitoreo sigue funcionando solo con el health-check HTTP y marca las señales de Vercel/GitHub como `unknown` en vez de fallar. Las 3 variables de alertas también son opcionales por diseño (`lib/notify.ts` nunca lanza si faltan) — sin ellas, el cron de flota simplemente no manda correo cuando detecta una caída, todo lo demás sigue igual.

## Restricciones importantes

- El dashboard es un componente monolítico `SuperAdmin.tsx` (~3100 líneas — creció bastante con Flota/Parches/Aprovisionamiento, ver más abajo). No fragmentar sin razón.
- `mysql2` está en package.json pero **no se usa** — no eliminar sin confirmar.
- Si se agrega una vista nueva, actualizar el union type `View` en `SuperAdmin.tsx` y agregar la opción al sidebar.
- Las APIs de restaurantes llaman automáticamente `POST /api/audit` después de cada mutación importante.
- `supabasePortales` solo debe usarse en: `api/save-flags`, `api/superadmin/tickets`, `api/superadmin/revenue`.
- Eliminar un restaurante (botón "Eliminar" en el detalle, `DELETE /api/superadmin/restaurants/[id]`) **solo borra el registro del superadmin** — no borra la instancia real (repo/deploy) si la tenía aprovisionada; eso se hace a mano en GitHub/Vercel.
- El detalle de un restaurante tiene un botón **"Ver panel del cliente"** (visible solo si `deployUrl` existe) que abre `{deployUrl}/admin` en pestaña nueva — mismo path `/admin` en los 3 productos (confirmado en `middleware.ts` de cada uno). Es la forma de entrar al panel real de un cliente (diseño, clientes/usuarios registrados vía `/admin/customers`, etc.) sin salir de este panel.

## Catálogo multi-producto, flota y parches

NICHO vende 3 productos (`mi-card`, `mi-menu`, `mi-proyecto`) en 2 modalidades de pago (`mensual` | `unico`) — 6 planes activos en `sa_plans`, catalogados en `sa_products`. Cada cliente corre su propio repo/deploy (no multi-tenant compartido). Diseño completo, esquema de BD y flujos en `Documentacion/documentos/plan-multiproducto-y-flota-2026-08-21.md`; migración SQL en `Documentacion/sql/migraciones/2026-08-21-multiproducto-y-flota.sql` (correr una vez en el SQL Editor de Supabase, BD principal).

- `type Plan` en `SuperAdmin.tsx` ya **no es un enum cerrado** (`"trial"|"basic"|"premium"`) — es `string`. Los labels/colores/precio de un plan se resuelven contra `planConfigs` (cargado de `sa_plans`), nunca contra un `Record` hardcodeado.
- `sa_fleet_status` la reescribe el cron `GET /api/cron/fleet-refresh` (protegido con `CRON_SECRET`, no con `verifySaSession()`). Sin `VERCEL_TOKEN`/`GITHUB_TOKEN` configurados, solo corre el health-check HTTP y el resto queda en `unknown`.
- `sa_client_updates` es el historial de parches aplicados por cliente — lo escribe `POST /api/superadmin/client-updates`, que excluye automáticamente a los clientes cuyo `updates_until` ya venció (pago único sin ventana de actualizaciones vigente).
- `POST /api/superadmin/upgrade-plan` cambia plan/producto de un restaurante (con `dryRun` primero) pero **no copia datos entre productos todavía** — el mapeo de tablas de `mi-menu`/`mi-card` hacia `mi-proyecto` sigue sin implementarse (no es que falte acceso: desde 2026-08-24 sí hay lectura a los repos reales vía `gh` CLI — ver sección de repos abajo — pero mapear y migrar filas de clientes reales entre esquemas es trabajo aparte, no hecho todavía).
- `vercel.json` define el cron de `/api/cron/fleet-refresh` **una vez al día (6 AM)** — la cuenta está en plan Hobby, que solo permite 1 cron diario; el `*/15 * * * *` original tronaba el deploy entero con "Hobby accounts are limited to daily cron jobs" (confirmado en producción el 2026-08-26). Si se quiere monitoreo más frecuente sin pasar a plan Pro, la alternativa gratis es un GitHub Action con `schedule` que haga `curl` al endpoint con `CRON_SECRET`.

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
- **2026-09-01:** el endpoint tiene un claim atómico (`repo_name` reservado con un valor centinela mientras dura el trabajo) para que dos solicitudes concurrentes no aprovisionen el mismo restaurante dos veces. Y si el repo de GitHub se creó pero Vercel falló después, ya no queda bloqueado para siempre — el mismo endpoint detecta ese estado (`repo_name` presente, `deploy_url` vacío) y reanuda desde ahí sin volver a crear el repo; el botón cambia a "Reanudar aprovisionamiento" en ese caso.

**Hueco conocido (corregido 2026-08-28 — el comportamiento real es más estricto de lo que decía esta sección):** no tenemos guardada la ANON key de Supabase de mi-menu (solo la `MIMENU_SERVICE_KEY`, que mi-menu no usa — su código pide la anon key). Verificado en tiempo de ejecución que `createClient(url, '')` lanza igual que `createClient('','')` — un deploy de mi-menu sin esta key truena al arrancar, no queda "creado pero degradado". Por eso el endpoint **bloquea el aprovisionamiento real de mi-menu** (400, `missingCritical`) hasta que se agregue `MIMENU_SUPABASE_ANON_KEY` a las variables de entorno de este proyecto (Vercel + `.env.local`) — no hay forma de evitarlo sin ese valor real, que hay que sacar del dashboard de Supabase del proyecto de mi-menu (Project Settings → API → anon/public key).

**Variables de entorno para que esto funcione de verdad en producción:** `GITHUB_TOKEN` y `VERCEL_TOKEN` **ya están configuradas en Vercel** (2026-08-26/28) con los permisos correctos (`GITHUB_TOKEN`: `Contents: Read and write` + `Administration: Write`; `VERCEL_TOKEN`: permiso de crear proyectos) — el aprovisionamiento automático ya corre de verdad en producción, no solo en dry-run. Verificado con un cliente real (`mi-card-jesus-*`): repo creado en GitHub, proyecto creado en Vercel, badge "Instancia: Creada" visible en la tabla de Restaurantes.

### Cómo saber si la instancia de un cliente se creó de verdad

No se guarda ningún archivo en este repo ni en el servidor del superadmin — el "archivo del proyecto" vive por completo en dos lugares externos:
1. **GitHub**: repo nuevo bajo `Segundo715` (`{producto}-{nombre-slug}-{id corto}`), copiado del repo plantilla del producto.
2. **Vercel**: proyecto nuevo conectado a ese repo, con su propio deploy.

Este repo solo guarda punteros a esas dos cosas (`sa_restaurants.repo_owner/repo_name/repo_url/deploy_url/vercel_project_id`). Para confirmar visualmente: columna **Instancia** en la tabla de Restaurantes — badge verde "Creada" (clicable, va directo al deploy) si se creó, badge gris "Sin crear" si no. Un toast también avisa al momento de registrar si falló y por qué.

## Pendiente: URL compartida para clientes mensuales (no copiar repo/deploy)

**Estado: solo exploración, sin código escrito todavía (sesión 2026-08-28, pausada).** El usuario quiere que, a diferencia de los clientes `unico` (que sí reciben una copia completa vía `provision-client`, ver arriba), los clientes `mensual` **no generen un repo/deploy nuevo** — que en vez de eso se les asigne solo una URL nueva sobre un deploy ya existente y compartido por producto.

**Hallazgo clave que reduce el alcance real:** la base de datos de cada producto **ya es multi-tenant** — las tablas (`admins`, `employees`, `customers`, etc.) ya están particionadas por columna `restaurant_id` (confirmado por el bug de 2026-06-28, donde faltaba esa partición y todo caía en `'default'`). Lo único que falta es la **resolución en tiempo de ejecución** de qué `restaurant_id` usar por request — hoy es una constante de build (`const RID = process.env.NEXT_PUBLIC_RESTAURANT_ID || 'default'`, uno por archivo, ver abajo), no algo que se pueda cambiar sin recompilar. No hace falta rediseñar el esquema de datos, solo cómo se resuelve `RID`.

**Exploración hecha (solo lectura, clones locales descartados después):**
- `Segundo715/mi-proyecto`: el patrón `NEXT_PUBLIC_RESTAURANT_ID` está encapsulado en **14 archivos** `lib/*Db.ts` (~69 funciones exportadas en total) + 3 rutas de `app/api` (tickets, permissions, auth) — no está esparcido en las ~89 rutas de `app/api`. `middleware.ts` solo hace auth de sesión (`/admin`, `/employee`), no resuelve tenant por hostname.
- `Segundo715/mi-menu`: código idéntico a mi-proyecto (mismo hallazgo).
- `Segundo715/mi-card`: **solo 4 archivos** (`lib/db.ts`=12 funciones, `lib/loyaltyDb.ts`=9, `lib/adminDb.ts`=6, `lib/settingsDb.ts`=3 → 30 funciones), 11 rutas de `app/api`. Mismo patrón `middleware.ts` (solo auth de `/admin`, sin tenant routing). Es el candidato obvio para pilotear el mecanismo antes de tocar mi-proyecto/mi-menu (mucho menor superficie).

**Mecanismo propuesto (no implementado):** dominio wildcard por producto (ej. `*.mi-card.tudominio.com`) → un deploy compartido en Vercel + una tabla `domain → restaurant_id` en la BD propia de cada producto, consultada en `middleware.ts` para inyectar el `restaurant_id` resuelto (ej. vía header) y que los `lib/*Db.ts` lean ese valor por request en vez de la constante de módulo — con fallback a la env var actual para no romper los deploys `unico` existentes (esos siguen siendo dedicados, sin cambios).

**Bloqueadores reales, no resueltos:**
1. **Dominio propio.** No hay uno comprado todavía — el usuario buscó opciones en Vercel Domains (variaciones de "Jesospechoso") sin encontrar una disponible ni confirmar compra. Sin dominio no hay wildcard posible.
2. **Alcance de la primera pasada.** Recomendado: pilotear en mi-card solo (menor riesgo, ya tiene BD propia), replicar a mi-menu/mi-proyecto después de validarlo con un cliente real — pendiente de confirmar con el usuario.

Antes de escribir código para esto, retomar en Plan Mode: resolver los dos bloqueadores de arriba con el usuario, después diseñar la tabla `domain_map`, los cambios de `middleware.ts` + `lib/*Db.ts` en el(los) repo(s) elegido(s), y la lógica nueva en `POST /api/superadmin/provision-client` para que `billing_mode === 'mensual'` inserte una fila en `domain_map` en vez de llamar a `createClientRepo`/`createClientProject`.

## Notas de contexto (sesiones previas)

- **2026-09-03:** primera feature nueva de la lista de mejoras priorizadas ("empieza uno por uno"): **alertas reales por correo** (`lib/notify.ts`), disparadas desde `GET /api/cron/fleet-refresh` cuando una instancia pasa de `ok` a `error` en el chequeo diario. Primer intento fue Resend (API REST, sin SDK) pero el servicio estaba caído en el momento de implementarlo (`resend.com` mostraba "Temporalmente no disponible") — se cambió a **Gmail SMTP vía `nodemailer`**, usando una contraseña de aplicación sobre la cuenta de Gmail que ya existe (sin dar de alta ningún servicio de terceros nuevo). `sendAlertEmail()`/`alertEmailHtml()` son tolerantes a fallos por diseño: si `GMAIL_USER`/`GMAIL_APP_PASSWORD`/`ALERT_EMAILS` no están configuradas o el envío falla, no lanzan — el cron nunca se cae por un correo que no salió. Nuevo endpoint `POST /api/superadmin/test-alert` (requiere sesión) para probar la configuración sin esperar una caída real. Probado de punta a punta en local con un correo real recibido con éxito antes del commit. **Pendiente:** agregar las 3 variables (`GMAIL_USER`, `GMAIL_APP_PASSWORD`, `ALERT_EMAILS`) en Vercel — hasta entonces el cron en producción sigue funcionando pero sin mandar correos (ver tabla de variables de entorno arriba). Por ahora `ALERT_EMAILS` solo tiene el correo de Jesús; falta confirmar si se agrega también el de Eloy.
- **2026-09-01:** tercera revisión de código de la sesión (agentes en paralelo, otra pasada completa) — 10 hallazgos más corregidos. Los más importantes: `GET /api/save-flags` no tenía `verifySaSession()` (leía flags/permisos de cualquier producto sin sesión, mismo hueco que ya se había cerrado en `demo-proxy`); los repos de cliente se creaban **públicos** por defecto en GitHub (ahora privados); si `provision-client` creaba el repo pero fallaba Vercel, el restaurante quedaba bloqueado para siempre sin forma de reintentar — ahora reanuda desde donde quedó (botón "Reanudar aprovisionamiento" en el detalle). También: un downgrade de plan **dentro del mismo producto** (ej. premium→basic) no exigía confirmación aunque el nuevo límite de usuarios fuera menor a los activos — solo se detectaba al cruzar de producto.
  - **Hallazgo importante sobre Feature Flags/Permisos:** seleccionar un restaurante individual (no Global/Portales/mi-menu/mi-card) en las vistas "Feature Flags" o "Permisos por rol" y togglear algo **nunca tuvo efecto real** — el código caía a un `else` que reescribía la clave GLOBAL compartida (`feature_flags`) con los valores viejos, mostrando un falso "guardado". Causa raíz: esas vistas no tienen ninguna clave/almacenamiento propio por restaurante individual — solo existen las 4 categorías especiales (Global=`r1`, Portales, mi-menu, mi-card). Implementar eso de verdad requeriría que `mi-proyecto` (repo hermano) lea sus flags con una clave scopeada por `restaurant_id` en tiempo de ejecución — no confirmado que su código ya haga eso (mi-card sí lo hace, vía `scopedKey()` en `lib/settingsDb.ts` con prefijo `RID:`, pero no se verificó que mi-proyecto tenga el mismo patrón). Por ahora se bloqueó el toggle en ese caso con un aviso claro en vez de fingir que se guardó — **sigue pendiente implementar flags/permisos reales por restaurante individual**, si se necesita hay que primero confirmar el formato de clave que mi-proyecto realmente lee.
- **2026-08-31 (cont.):** dos cosas más, ya en producción. (1) Se reemplazaron los últimos 4 emojis que quedaban en el dashboard (🛡️/👁️/🙈/❌, todos en `/sa-login`) por iconos SVG planos, mismo estilo que el resto. (2) Al probar el botón "Ver panel del cliente" (ver arriba) se detectó que el logo del negocio tardaba en aparecer en `/card` de **mi-card** (repo hermano, no este) — la causa: esa página pedía la marca con un `fetch` client-side *después* del primer paint, así que la imagen del logo no empezaba a descargarse hasta que esa respuesta volvía. Se corrigió convirtiendo `app/card/page.tsx` de mi-card a Server Component (con `export const dynamic = 'force-dynamic'` para que no se congele en el build) — el logo ahora va en el HTML inicial. El fix se aplicó y desplegó en **dos repos**: la plantilla `Segundo715/mi-card` (beneficia a clientes nuevos) y la instancia ya provisionada `Segundo715/mi-card-jesush-7038a4` (clientes ya creados no heredan cambios de la plantilla solos, hay que aplicarlos a mano — mismo motivo que ya se documentó para por qué `compareBranches()` nunca funciona entre plantilla y cliente). **Corregido 2026-09-01:** las otras 5 variantes de tarjeta (`/card/2x1`, `/card/descuento`, `/card/premium`, `/card/usuario`, `/card/wallet` en mi-card) sí tenían el mismo patrón viejo — se aplicó el mismo fix (Server Component + `CardClient.tsx` en cada carpeta) en los mismos dos repos (plantilla y la instancia `mi-card-jesush-7038a4`), verificado con `tsc`/`build`/`lint` limpios y las 5 rutas probadas en localhost y en producción real (200, sin errores, marca en el HTML inicial).
- **2026-09-01 (cont.):** a pedido del usuario, se revisó el estado real de los 3 repos plantilla en GitHub (`mi-card`, `mi-menu`, `mi-proyecto`) para confirmar que un cliente nuevo registrado hoy recibe todo lo más reciente. `mi-card` está al día (el fix de las 5 variantes de arriba es su commit más reciente). `mi-menu` y `mi-proyecto` tienen su `main` en el **mismo commit, del 2026-07-20** (mi-menu se creó como copia de mi-proyecto en ese punto y ninguno de los dos ha recibido commits desde entonces) — se revisaron las ~10 ramas sueltas de mi-proyecto (`feature/*`, `develop`, etc.) y todas son más viejas que `main` (mayo-junio), así que no hay trabajo sin fusionar ahí; tampoco hay Pull Requests abiertos en ninguno de los 3 repos. Conclusión: nada está a medias o atascado, pero mi-menu/mi-proyecto simplemente no han recibido desarrollo nuevo en más de un mes — si hace falta algo específico ahí, no se sabe qué es sin que el usuario lo diga (esta sesión no tocó código de esos dos repos, solo mi-card).
- **2026-09-01:** cuarta revisión de código de la sesión — cerró el resto de lo encontrado en pasadas anteriores (claim atómico también en la ruta de "reanudar" aprovisionamiento, link roto en el detalle cuando el repo existe sin deploy, `revenue` subcontaba Resta3 y filtraba mal Portales, `tickets`/`plans`/`rollback` no revisaban errores de Supabase). De paso se investigó el reporte del usuario de que "Ventas Reales" tardaba mucho en cargar — ver el aviso de latencia de `supabasePortales` arriba (sección "Tablas propias del superadmin"): no es un bug, es infraestructura (probable desajuste de región Vercel↔Supabase-portales), documentado y sin tocar por decisión del usuario.
- **2026-08-31:** revisión completa de código (8 agentes en paralelo, todo `app/api/**` + `lib/*.ts` + `SuperAdmin.tsx`) — 21 hallazgos verificados leyendo el código real, 12 corregidos en esta misma sesión (el resto queda en `Documentacion/sesiones/sesiones.md` vía los mensajes de commit, sin lista aparte). El más grave: `/api/demo-proxy` no tenía ningún guard de sesión — cualquiera podía forjar una cookie de admin válida contra `mi-proyecto` en producción; ya tiene `verifySaSession()`. También corregido: `supabaseAdmin.ts`/`lib/supabase.ts` sin el placeholder anti-crash que sí tenían mi-card/mi-menu/portales; `addMonths()` se desbordaba de mes cerca de fin de mes (afectaba `updates_until`/`support_until`); `save-flags` pasó de delete+insert a upsert atómico; el aprovisionamiento de mi-menu estaba bloqueado siempre por un `undefined` hardcodeado en vez de leer `MIMENU_SUPABASE_ANON_KEY` (que sigue sin tener valor real — falta agregarla). Se agregó también el botón "Ver panel del cliente" (ver arriba), probado en localhost contra una instancia real.
- **2026-08-28:** confirmado con un cliente real (`mi-card-jesus-*`) que el aprovisionamiento automático de instancias funciona en producción de punta a punta (tokens ya configurados desde la sesión anterior). Dos ajustes de UI chicos: botón de mostrar/ocultar contraseña (ojito) en `/sa-login`, y columna "Pago" separada del badge de Plan en la tabla de Restaurantes (antes el nombre del plan y la modalidad — "mi-card · Pago único" — venían juntos en el mismo badge y se veía apretado). Se empezó a explorar (sin código, ver sección "Pendiente: URL compartida para clientes mensuales" arriba) cómo evitar que los clientes `mensual` reciban una copia completa de repo/deploy — quedó pausado esperando que el usuario resuelva el dominio propio y confirme el alcance del piloto.
- **2026-08-24/26:** sesión grande — catálogo multi-producto, monitoreo de flota, historial de parches, cambio de plan/producto con rollback, y aprovisionamiento automático de instancias (repo + deploy) por cliente. De paso: separó mi-menu a su propio repo, avanzó (no terminó) la separación de mi-card a su propia BD, corrigió 2 bugs de persistencia preexistentes (plan y mantenimiento no se guardaban), y un bug que hubiera tumbado `/api/save-flags` para **todos** los productos en el próximo deploy (`createClient('','')` lanza en seco si faltan `MICARD_SUPABASE_URL`/`MICARD_SERVICE_KEY`, y esas no están en Vercel todavía — arreglado con un placeholder que evita el crash). Migración SQL de esta sesión: `Documentacion/sql/migraciones/2026-08-21-multiproducto-y-flota.sql` — confirmar que ya se corrió antes de asumir que el catálogo de planes tiene datos.
- **2026-06-28:** restaurantes existentes tenían `restaurant_id='default'` en sus datos. Causa: env var `NEXT_PUBLIC_RESTAURANT_ID` no estaba configurada al crear los datos. Solución: PATCH masivo a todos los registros de las tablas `admins`, `employees`, `customers`, `menu_items`, `recipes`.
- Los colores de portales son `#E8912A` (naranja). NICHO usa `#B90F45` (rosa/guinda). El sync de GitHub Actions tiene una lista de exclusiones para evitar sobreescribir los archivos de branding de portales.
- La BD de portales (`qmtsetcqnovcahuimkvg`) tiene sus propias tablas `sa_tickets` y `settings`. Cualquier flag nuevo para portales debe ir en esa BD.


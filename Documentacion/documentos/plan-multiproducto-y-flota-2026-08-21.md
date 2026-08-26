# Plan de arquitectura — Catálogo multi-producto, upgrades y monitoreo de flota

> Versión: 2026-08-21
> Autor: exploración automatizada del código real de `mi-superadmindrestaurante`
> Dirigido a: Jesús y Eloy (dueños de NICHO) + quien implemente
> Estado: **documento de diseño** — no hay código escrito todavía
> Stack afectado: Next.js 16 (App Router) · React 19 · TypeScript · Supabase (4 clientes) · Vercel

---

## 0. Resumen ejecutivo

NICHO va a dejar de vender **un** producto para vender **tres** (`mi-card`, `mi-menu`, `mi-proyecto`), cada uno en **dos modalidades de pago** (mensual y pago único de instalación), lo que da **6 combinaciones de plan**. El panel SuperAdmin actual no puede representar eso: su modelo de "plan" es un enum cerrado de tres niveles (`trial | basic | premium`) que describe *tiers de features de un solo producto* (mi-proyecto), y ese enum está hardcodeado en al menos cinco lugares del front y en la lógica del backend.

Además, cada cliente va a correr **su propia instancia** (repo propio y deploy propio en Vercel). Con 100 clientes, el SuperAdmin necesita responder tres preguntas que hoy no puede responder: *¿está viva la instancia de este cliente?*, *¿tiene el último parche?* y *¿en qué estado quedó el último deploy?*.

Este documento propone: (1) separar **producto** de **modalidad de pago** en el catálogo (`sa_products` + `sa_plans` rediseñada), (2) un endpoint transaccional-por-pasos de **upgrade/downgrade** que migra datos entre productos sin pérdida, (3) una tabla y una vista de **monitoreo de flota** alimentada por Vercel API + GitHub API + health-check HTTP, y (4) un **historial de parches por cliente** para saber quién está al día.

Antes de todo eso hay una Fase 0 obligatoria: el documento de esquema `Documentacion/sql/tablas.sql` **no coincide con la base de datos real**, y construir encima de un esquema mal documentado es la forma más rápida de romper auditoría y feature flags.

---

## 1. Hallazgo: desincronización entre `Documentacion/sql/tablas.sql` y el esquema real

`Documentacion/sql/tablas.sql` dice "Actualizado: 2026-07-03", pero describe un esquema que el código **no usa**. Las rutas de `app/api/superadmin/*` son la fuente de verdad porque leen y escriben columnas concretas con `supabaseAdmin`; si una columna no existiera, esos endpoints fallarían en producción — y no fallan.

### 1.1 `sa_audit_log` — discrepancia grave (nombres de columna distintos)

| Doc `tablas.sql` | Código real (`app/api/superadmin/audit/route.ts`) | Veredicto |
|---|---|---|
| `restaurant_id TEXT` | `restaurant` (texto libre, default `'—'`) | ❌ el doc miente |
| `admin TEXT` | `user_name` | ❌ el doc miente |
| `details JSONB` | `details` **TEXT** (se inserta un string plano, ej. `"Nicho: → Premium"`) | ❌ tipo equivocado |
| `created_at TIMESTAMPTZ` | `ts` (el `GET` ordena por `ts`, el mapper hace `new Date(r.ts)`) | ❌ el doc miente |
| — | `type` (`create\|update\|delete\|access\|billing`) | ❌ falta en el doc |
| `action`, `ip` | `action`, `ip` | ✅ coinciden |

Consecuencia práctica: si alguien escribe una migración basándose en el doc, va a crear índices sobre `created_at` y `restaurant_id`, que **no existen**, y la vista de Auditoría dejaría de cargar.

### 1.2 `sa_plans` — el doc describe una tabla genérica; el código implementa 3 planes fijos

El doc propone `id UUID, name, price, billing ('monthly'|'yearly'), features JSONB, active`.

El código real (`app/api/superadmin/plans/route.ts`) usa:

| Columna real | Tipo real | Notas |
|---|---|---|
| `id` | **TEXT** (`'trial'`, `'basic'`, `'premium'`) | Es la PK y **el mismo string que `sa_restaurants.plan`** |
| `name` | TEXT | `Trial`, `Básico`, `Premium` |
| `price` | NUMERIC | `0`, `799`, `2499` — implícitamente mensual, **no hay columna `billing`** |
| `trial_days` | INT | `30`, `0`, `0` |
| `max_users` | INT | `3`, `5`, `20` |
| `color` | TEXT | hex, ej. `#00e676` |
| `features` | **TEXT** con JSON serializado | `JSON.stringify([{text, included}])`, se parsea con `JSON.parse` en `toPlan()` |

Además el `GET` hace **auto-seed**: si la tabla está vacía, inserta los 3 `DEFAULT_PLANS` hardcodeados en el archivo. Es decir, el catálogo de planes vive en el código fuente, no en la BD.

Y lo más importante para este proyecto: **las `features` de esos 3 planes describen solo módulos de `mi-proyecto`** ("Menú Inteligente + Recetario", "Producción / Inventario", "Automatizaciones IA"). No hay ningún concepto de producto ni de modalidad de pago.

### 1.3 `sa_restaurants` — el doc omite 10 columnas que el código sí usa

| Columna real (`restaurants/route.ts`) | En el doc | Notas |
|---|---|---|
| `id`, `name`, `plan`, `status`, `balance`, `created_at` | ✅ | El `GET` ordena por `created_at` |
| `users` | ❌ falta | usuarios actuales |
| `max_users` | ❌ falta | se calcula en el `POST`: `premium?20:basic?5:3` (hardcodeado, **no lee `sa_plans`**) |
| `registered_at` | ❌ falta | |
| `next_payment`, `last_payment` | ❌ falta | **TEXT**, no fecha — se inicializan con el string `'—'` |
| `email` | ❌ falta | el doc tiene `owner_email` |
| `notes` | ❌ falta | ver 1.5 |
| `api_token` | ❌ falta | `nch_live_<random>` generado con `Math.random()` |
| `last_active` | ❌ falta | **TEXT** libre, ej. `'Recién registrado'` o un ISO string |
| `login_count` | ❌ falta | |
| `slug`, `owner_name`, `owner_phone`, `feature_flags`, `updated_at` | ✅ en el doc | **no los usa ningún endpoint** |

### 1.4 `sa_requests`, `sa_tickets`, `sa_discounts` — también divergen

| Tabla | Doc | Código real |
|---|---|---|
| `sa_requests` | `restaurant_id, type, message, resolved_by, created_at` | `restaurant_name, requested_by, feature, reason, status, reject_reason, ts` (`requests/route.ts` ordena por `ts`) |
| `sa_discounts` | `value`, `type ('percent'\|'fixed')`, `expires_at` | `discount`, `type ('%'\|'$')`, `note`, `expires_at` |
| `sa_tickets` | `from_name, from_role, message, status, source` | además tiene `read BOOLEAN` (`tickets/route.ts` filtra `.eq('read', false)` para el badge) y **`source` no es columna** — se calcula en memoria al fusionar las dos BDs |
| `sa_security` | `event, ip, user_agent, details` (log de seguridad) | `restaurant_id (UNIQUE), session_hours, pin_required, allowed_start, allowed_end, max_failed_logins, ip_whitelist` — **es una tabla de configuración, no un log**. El `POST` hace `upsert(..., { onConflict: 'restaurant_id' })`, así que `restaurant_id` tiene constraint UNIQUE en la BD real. |

### 1.5 Hallazgo bloqueante: el `restaurant_id` del cliente vive dentro de `notes`

`app/api/public/register/route.ts` no guarda el identificador del restaurante en una columna. Lo mete como prefijo del campo de notas y lo busca con un `LIKE`:

```ts
// Buscar si ya existe por restaurant_id (guardado en notes como "rid:xxx")
const { data: existing } = await supabaseAdmin
  .from('sa_restaurants')
  .select('id, login_count')
  .like('notes', `rid:${restaurantId}%`)
  .maybeSingle()
```

Y al crear: `notes: \`rid:${restaurantId}\``.

Esto es **el obstáculo principal para todo lo demás en este documento**. Sin una columna `restaurant_id` real, indexada y única:

- No se puede hacer JOIN de `sa_restaurants` con `sa_fleet_status`, `sa_client_updates` ni con las tablas de datos del cliente.
- La búsqueda es O(n) con `LIKE` sin índice; con 100 clientes es tolerable, con 1000 no.
- `.maybeSingle()` **explota** si dos clientes tienen ids con prefijo común (`rid:taco` y `rid:tacos2` → el `LIKE 'rid:taco%'` devuelve 2 filas y `maybeSingle()` lanza error). Es un bug latente que se dispara solo cuando entren los 100 clientes nuevos.
- Cualquier edición manual del campo "notas" desde la UI **borra el vínculo** con la instancia real.

### 1.6 Documentación de flags desactualizada (mi-menu y mi-card ya existen en el código)

`CLAUDE.md` documenta 3 clientes Supabase y 7 claves de flags. El código real tiene **4 clientes** y **9 claves**:

| Realidad en el código | Documentado en `CLAUDE.md` |
|---|---|
| `lib/supabaseMiMenu.ts` (`MIMENU_SUPABASE_URL` / `MIMENU_SERVICE_KEY`) | ❌ no existe en la tabla de clientes |
| `resolveTarget()` en `save-flags` enruta sufijo `_mimenu` → BD de mi-menu | ❌ solo documenta `_portales` |
| Clave `feature_flags_mimenu` | ❌ |
| Clave `feature_flags_micard` | ❌ |
| `FEATURES_MICARD` (catálogo propio de 3 módulos: `sellar`, `tarjetas`, `configuracion`) | ❌ |

Detalle fino con riesgo: **`feature_flags_micard` NO tiene sufijo enrutado** en `resolveTarget()`, así que cae al `else` y se guarda en la **BD principal** con la clave literal `feature_flags_micard`. Es intencional según el comentario del código (`"mi-card comparte la BD de Global"`), pero significa que mi-card y mi-proyecto comparten instancia de Supabase — a diferencia de mi-menu, que tiene proyecto propio. Esa asimetría hay que decidirla explícitamente antes de vender 100 instancias (ver §7).

### 1.7 Otros hallazgos colaterales (bugs reales, no de diseño)

| Hallazgo | Archivo | Impacto |
|---|---|---|
| **`applyAssign()` no persiste el cambio de plan.** Hace `setRestaurants(...)`, `addAudit(...)` y `showToast(...)` pero **nunca** llama a `PATCH /api/superadmin/restaurants/[id]`. Al recargar, el plan vuelve al anterior — pero la auditoría ya registró el cambio. | `SuperAdmin.tsx` ~L902 | Alto: la auditoría miente |
| **`Maintenance.toggle()` tampoco persiste.** Mismo patrón: solo estado local + audit. | `SuperAdmin.tsx` ~L1363 | Alto: mismo problema |
| `max_users` se calcula hardcodeado en el `POST` de restaurantes (`premium?20:basic?5:3`) en vez de leerlo de `sa_plans`. Si se edita el plan en la UI, los altas nuevas ignoran el cambio. | `restaurants/route.ts` L42 | Medio |
| `CONTEXT.md` dice que "no hay persistencia de restaurants/billing" y que "no hay `ADMIN_SECRET` aquí" — ambas cosas ya son falsas. | `CONTEXT.md` L178, L203 | Bajo (confunde) |
| `api_token` se genera con `Math.random()` (no criptográfico). | `restaurants/route.ts` L45 | Medio (seguridad) |

### 1.8 Recomendación

Regenerar `Documentacion/sql/tablas.sql` **desde el esquema real de Supabase**, no desde la memoria. Procedimiento sugerido:

```sql
-- Ejecutar en el SQL editor de Supabase (BD principal) y pegar el resultado en tablas.sql
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name LIKE 'sa\_%'
ORDER BY table_name, ordinal_position;
```

Y repetirlo en la BD de portales y en la de mi-menu. Marcar el archivo con la fecha del dump y con la nota "generado, no editar a mano". Esto es la **Fase 0** del plan (§6).

---

## 2. Modelo de datos: catálogo de planes multi-producto

### 2.1 Decisión de diseño: separar producto de modalidad

Hoy `plan` es un string que mezcla tres conceptos: *qué producto*, *cuánto paga* y *qué features tiene*. Con 3 productos × 2 modalidades eso se vuelve inmanejable si se sigue metiendo todo en un enum.

La propuesta es **dos tablas**:

- **`sa_products`** — el catálogo de *qué vendemos*: 3 filas, estables, con los metadatos de infraestructura (repo base, sufijo de flags, proyecto Supabase). Es la tabla que consulta el monitoreo de flota.
- **`sa_plans`** — el catálogo de *cómo lo cobramos*: 6 filas activas (producto × modalidad), con precio, periodicidad y política de actualizaciones.

Se mantiene `id TEXT` como PK en `sa_plans` (no UUID) porque `sa_restaurants.plan` ya guarda ese string y toda la UI compara `r.plan === p.id`. Cambiar a UUID obligaría a reescribir la mitad del componente.

### 2.2 Tabla nueva: `sa_products`

| Columna | Tipo | Default | Descripción |
|---|---|---|---|
| `id` | TEXT PK | — | `mi-card` \| `mi-menu` \| `mi-proyecto` |
| `name` | TEXT NOT NULL | — | Nombre comercial: "mi-card", "mi-menu", "Plataforma NICHO" |
| `tagline` | TEXT | `''` | "Solo cartas digitales" / "Menú digital + cartas" / "Plataforma completa" |
| `tier` | SMALLINT NOT NULL | — | `1`=mi-card, `2`=mi-menu, `3`=mi-proyecto. Define qué es upgrade y qué es downgrade |
| `color` | TEXT | `'#00e676'` | Hex para badges en la UI |
| `repo_base_owner` | TEXT | `'Segundo715'` | Owner del repo base en GitHub |
| `repo_base_name` | TEXT | — | `mi-card` / `mi-menu` / `mi-proyecto` |
| `repo_base_branch` | TEXT | `'main'` | Rama de referencia para comparar versiones |
| `flags_settings_key` | TEXT | — | Clave que usa el producto en la tabla `settings`: `feature_flags_micard`, `feature_flags_mimenu`, `feature_flags` |
| `supabase_project_ref` | TEXT | NULL | Ref del proyecto Supabase por defecto del producto (`zxynrlqubdlrwcfoewdv`, etc.) |
| `health_path` | TEXT | `'/'` | Ruta a la que pega el health-check (idealmente `/api/health`) |
| `active` | BOOLEAN | `true` | Si se sigue vendiendo |
| `sort_order` | SMALLINT | `0` | Orden en la UI |
| `created_at` | TIMESTAMPTZ | `NOW()` | |

### 2.3 Tabla rediseñada: `sa_plans`

Se **conservan** todas las columnas actuales (`id`, `name`, `price`, `trial_days`, `max_users`, `color`, `features`) para no romper `plans/route.ts` ni la vista `Plans`, y se **agregan**:

| Columna nueva | Tipo | Default | Descripción |
|---|---|---|---|
| `product_id` | TEXT REFERENCES `sa_products(id)` | NULL | Qué producto cubre este plan |
| `billing_mode` | TEXT | `'mensual'` | `mensual` \| `unico` — CHECK constraint |
| `setup_fee` | NUMERIC(10,2) | `0` | Costo de instalación cuando `billing_mode='mensual'` (0 si no aplica) |
| `incluye_actualizaciones` | BOOLEAN | `false` | **Atributo explícito de negocio.** Un pago único NO implica updates de por vida |
| `meses_actualizaciones` | INT | `0` | Si `incluye_actualizaciones=true` y esto es `0` → de por vida. Si es `12` → un año |
| `incluye_soporte` | BOOLEAN | `true` | Si el plan da derecho a abrir tickets |
| `meses_soporte` | INT | `0` | Igual semántica: `0` = ilimitado mientras esté activo |
| `currency` | TEXT | `'MXN'` | |
| `active` | BOOLEAN | `true` | Los 3 planes legacy se marcan `false` |
| `legacy` | BOOLEAN | `false` | Marca `trial`/`basic`/`premium` como históricos |
| `sort_order` | SMALLINT | `0` | |

**Semántica de `price` según `billing_mode`:**

| `billing_mode` | `price` significa | `setup_fee` | Cobro recurrente |
|---|---|---|---|
| `mensual` | Renta mensual | Instalación inicial opcional | Sí |
| `unico` | Precio total de la instalación | Siempre `0` (ya está en `price`) | No |

### 2.4 Las 6 combinaciones (seed propuesto)

Los precios son **placeholders** — los tiene que fijar negocio (ver §7).

| `id` | `product_id` | `billing_mode` | `price` | `incluye_actualizaciones` | `meses_actualizaciones` | `max_users` |
|---|---|---|---|---|---|---|
| `micard-mensual` | `mi-card` | `mensual` | 299 | `true` | 0 (de por vida mientras pague) | 3 |
| `micard-unico` | `mi-card` | `unico` | 4900 | `true` | 12 | 3 |
| `mimenu-mensual` | `mi-menu` | `mensual` | 799 | `true` | 0 | 5 |
| `mimenu-unico` | `mi-menu` | `unico` | 12900 | `true` | 12 | 5 |
| `miproyecto-mensual` | `mi-proyecto` | `mensual` | 2499 | `true` | 0 | 20 |
| `miproyecto-unico` | `mi-proyecto` | `unico` | 39900 | `true` | 12 | 20 |

Más un plan de prueba transversal:

| `id` | `product_id` | `billing_mode` | `price` | `trial_days` |
|---|---|---|---|---|
| `trial` | `mi-proyecto` | `mensual` | 0 | 30 |

> **Nota de compatibilidad:** `trial` se conserva con su `id` original porque `public/register/route.ts` inserta `plan: 'trial'` como default para todo cliente auto-registrado. Cambiarle el id rompería el auto-registro silenciosamente.

### 2.5 Columnas nuevas en `sa_restaurants`

| Columna nueva | Tipo | Default | Descripción |
|---|---|---|---|
| `restaurant_id` | TEXT UNIQUE | NULL | **El id real de la instancia** — se rescata de `notes` (`rid:xxx`). Elimina el `LIKE` |
| `product_id` | TEXT REFERENCES `sa_products(id)` | NULL | Producto contratado (denormalizado desde el plan, para filtrar rápido) |
| `billing_mode` | TEXT | `'mensual'` | Denormalizado del plan |
| `subscription_status` | TEXT | `'activa'` | `trial` \| `activa` \| `vencida` \| `suspendida` \| `cancelada` \| `pagada_unico` |
| `contracted_at` | DATE | NULL | Fecha de firma/alta comercial |
| `updates_until` | DATE | NULL | Hasta cuándo tiene derecho a parches. NULL = ilimitado. Se calcula de `contracted_at + meses_actualizaciones` |
| `support_until` | DATE | NULL | Mismo cálculo para soporte/tickets |
| `repo_owner` | TEXT | NULL | Owner del repo del cliente en GitHub |
| `repo_name` | TEXT | NULL | Nombre del repo del cliente |
| `repo_branch` | TEXT | `'main'` | Rama que se despliega |
| `repo_url` | TEXT | NULL | URL completa (derivable, se guarda por conveniencia de la UI) |
| `deploy_url` | TEXT | NULL | URL pública de la instancia (`https://cliente.vercel.app` o dominio propio) |
| `vercel_project_id` | TEXT | NULL | `prj_...` — necesario para la Vercel API |
| `vercel_team_id` | TEXT | NULL | `team_...` — si el proyecto está en el team de NICHO |
| `supabase_project_ref` | TEXT | NULL | Ref del proyecto Supabase de este cliente |
| `previous_plan` | TEXT | NULL | Plan anterior, para poder deshacer un upgrade |
| `plan_changed_at` | TIMESTAMPTZ | NULL | Cuándo fue el último cambio de plan |

> **Por qué denormalizar `product_id` y `billing_mode` en `sa_restaurants`** si son derivables de `plan` → `sa_plans`: porque la vista de flota filtra por producto sobre 100+ filas y porque `sa_plans` es editable desde la UI (si alguien cambia el `product_id` de un plan, no queremos reescribir la historia de los clientes). Se sincronizan en el endpoint de upgrade, nunca a mano.

### 2.6 Migración SQL — lista para pegar en el SQL editor de Supabase

> Ejecutar en la **BD principal** (`zxynrlqubdlrwcfoewdv`). Es idempotente: se puede correr dos veces sin daño.

```sql
-- ============================================================
-- Migración: catálogo multi-producto (mi-card / mi-menu / mi-proyecto)
-- Fecha: 2026-08-21
-- BD: principal (zxynrlqubdlrwcfoewdv)
-- ============================================================

BEGIN;

-- ── 1. Catálogo de productos ──────────────────────────────────
CREATE TABLE IF NOT EXISTS sa_products (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  tagline               TEXT      DEFAULT '',
  tier                  SMALLINT  NOT NULL,
  color                 TEXT      DEFAULT '#00e676',
  repo_base_owner       TEXT      DEFAULT 'Segundo715',
  repo_base_name        TEXT,
  repo_base_branch      TEXT      DEFAULT 'main',
  flags_settings_key    TEXT,
  supabase_project_ref  TEXT,
  health_path           TEXT      DEFAULT '/',
  active                BOOLEAN   DEFAULT TRUE,
  sort_order            SMALLINT  DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO sa_products (id, name, tagline, tier, color, repo_base_name, flags_settings_key, sort_order)
VALUES
  ('mi-card',     'mi-card',          'Solo cartas digitales',                1, '#f59e0b', 'mi-card',     'feature_flags_micard', 1),
  ('mi-menu',     'mi-menu',          'Menú digital + cartas',                2, '#6366f1', 'mi-menu',     'feature_flags_mimenu', 2),
  ('mi-proyecto', 'Plataforma NICHO', 'Menú, pedidos, empleados, fidelización', 3, '#00e676', 'mi-proyecto', 'feature_flags',        3)
ON CONFLICT (id) DO NOTHING;

-- ── 2. sa_plans: producto × modalidad ─────────────────────────
ALTER TABLE sa_plans ADD COLUMN IF NOT EXISTS product_id              TEXT;
ALTER TABLE sa_plans ADD COLUMN IF NOT EXISTS billing_mode            TEXT    DEFAULT 'mensual';
ALTER TABLE sa_plans ADD COLUMN IF NOT EXISTS setup_fee               NUMERIC(10,2) DEFAULT 0;
ALTER TABLE sa_plans ADD COLUMN IF NOT EXISTS incluye_actualizaciones BOOLEAN DEFAULT FALSE;
ALTER TABLE sa_plans ADD COLUMN IF NOT EXISTS meses_actualizaciones   INT     DEFAULT 0;
ALTER TABLE sa_plans ADD COLUMN IF NOT EXISTS incluye_soporte         BOOLEAN DEFAULT TRUE;
ALTER TABLE sa_plans ADD COLUMN IF NOT EXISTS meses_soporte           INT     DEFAULT 0;
ALTER TABLE sa_plans ADD COLUMN IF NOT EXISTS currency                TEXT    DEFAULT 'MXN';
ALTER TABLE sa_plans ADD COLUMN IF NOT EXISTS active                  BOOLEAN DEFAULT TRUE;
ALTER TABLE sa_plans ADD COLUMN IF NOT EXISTS legacy                  BOOLEAN DEFAULT FALSE;
ALTER TABLE sa_plans ADD COLUMN IF NOT EXISTS sort_order              SMALLINT DEFAULT 0;

-- FK como constraint separada (permite re-ejecutar sin error)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sa_plans_product_fk') THEN
    ALTER TABLE sa_plans
      ADD CONSTRAINT sa_plans_product_fk
      FOREIGN KEY (product_id) REFERENCES sa_products(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sa_plans_billing_chk') THEN
    ALTER TABLE sa_plans
      ADD CONSTRAINT sa_plans_billing_chk
      CHECK (billing_mode IN ('mensual', 'unico'));
  END IF;
END $$;

-- Planes legacy: asignarlos a mi-proyecto y desactivarlos del catálogo de venta
UPDATE sa_plans
   SET product_id = 'mi-proyecto', billing_mode = 'mensual',
       legacy = TRUE, active = FALSE, incluye_actualizaciones = TRUE
 WHERE id IN ('basic', 'premium');

UPDATE sa_plans
   SET product_id = 'mi-proyecto', billing_mode = 'mensual',
       legacy = FALSE, active = TRUE, incluye_actualizaciones = TRUE
 WHERE id = 'trial';

-- Los 6 planes nuevos (precios PLACEHOLDER — confirmar con negocio)
INSERT INTO sa_plans
  (id, name, price, trial_days, max_users, color, features,
   product_id, billing_mode, setup_fee, incluye_actualizaciones, meses_actualizaciones,
   incluye_soporte, meses_soporte, active, legacy, sort_order)
VALUES
  ('micard-mensual',     'mi-card · Mensual',      299,   0, 3,  '#f59e0b', '[]', 'mi-card',     'mensual', 0,    TRUE,  0,  TRUE,  0,  TRUE, FALSE, 1),
  ('micard-unico',       'mi-card · Pago único',   4900,  0, 3,  '#f59e0b', '[]', 'mi-card',     'unico',   0,    TRUE,  12, TRUE,  12, TRUE, FALSE, 2),
  ('mimenu-mensual',     'mi-menu · Mensual',      799,   0, 5,  '#6366f1', '[]', 'mi-menu',     'mensual', 0,    TRUE,  0,  TRUE,  0,  TRUE, FALSE, 3),
  ('mimenu-unico',       'mi-menu · Pago único',   12900, 0, 5,  '#6366f1', '[]', 'mi-menu',     'unico',   0,    TRUE,  12, TRUE,  12, TRUE, FALSE, 4),
  ('miproyecto-mensual', 'NICHO · Mensual',        2499,  0, 20, '#00e676', '[]', 'mi-proyecto', 'mensual', 0,    TRUE,  0,  TRUE,  0,  TRUE, FALSE, 5),
  ('miproyecto-unico',   'NICHO · Pago único',     39900, 0, 20, '#00e676', '[]', 'mi-proyecto', 'unico',   0,    TRUE,  12, TRUE,  12, TRUE, FALSE, 6)
ON CONFLICT (id) DO NOTHING;

-- ── 3. sa_restaurants: producto, suscripción e infraestructura ─
ALTER TABLE sa_restaurants ADD COLUMN IF NOT EXISTS restaurant_id        TEXT;
ALTER TABLE sa_restaurants ADD COLUMN IF NOT EXISTS product_id           TEXT;
ALTER TABLE sa_restaurants ADD COLUMN IF NOT EXISTS billing_mode         TEXT DEFAULT 'mensual';
ALTER TABLE sa_restaurants ADD COLUMN IF NOT EXISTS subscription_status  TEXT DEFAULT 'activa';
ALTER TABLE sa_restaurants ADD COLUMN IF NOT EXISTS contracted_at        DATE;
ALTER TABLE sa_restaurants ADD COLUMN IF NOT EXISTS updates_until        DATE;
ALTER TABLE sa_restaurants ADD COLUMN IF NOT EXISTS support_until        DATE;
ALTER TABLE sa_restaurants ADD COLUMN IF NOT EXISTS repo_owner           TEXT;
ALTER TABLE sa_restaurants ADD COLUMN IF NOT EXISTS repo_name            TEXT;
ALTER TABLE sa_restaurants ADD COLUMN IF NOT EXISTS repo_branch          TEXT DEFAULT 'main';
ALTER TABLE sa_restaurants ADD COLUMN IF NOT EXISTS repo_url             TEXT;
ALTER TABLE sa_restaurants ADD COLUMN IF NOT EXISTS deploy_url           TEXT;
ALTER TABLE sa_restaurants ADD COLUMN IF NOT EXISTS vercel_project_id    TEXT;
ALTER TABLE sa_restaurants ADD COLUMN IF NOT EXISTS vercel_team_id       TEXT;
ALTER TABLE sa_restaurants ADD COLUMN IF NOT EXISTS supabase_project_ref TEXT;
ALTER TABLE sa_restaurants ADD COLUMN IF NOT EXISTS previous_plan        TEXT;
ALTER TABLE sa_restaurants ADD COLUMN IF NOT EXISTS plan_changed_at      TIMESTAMPTZ;

-- Backfill del restaurant_id que hoy vive dentro de notes como 'rid:xxx'
UPDATE sa_restaurants
   SET restaurant_id = split_part(substring(notes FROM 'rid:([A-Za-z0-9_\-]+)'), ' ', 1)
 WHERE restaurant_id IS NULL
   AND notes LIKE 'rid:%';

-- Backfill de producto: todo lo existente corre mi-proyecto
UPDATE sa_restaurants
   SET product_id = 'mi-proyecto'
 WHERE product_id IS NULL;

UPDATE sa_restaurants
   SET subscription_status = CASE
         WHEN status = 'suspended' THEN 'suspendida'
         WHEN plan   = 'trial'     THEN 'trial'
         ELSE 'activa'
       END
 WHERE subscription_status IS NULL OR subscription_status = 'activa';

-- Índice único parcial: permite múltiples NULL, prohíbe rid duplicado
CREATE UNIQUE INDEX IF NOT EXISTS sa_restaurants_rid_uidx
  ON sa_restaurants (restaurant_id)
  WHERE restaurant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS sa_restaurants_product_idx ON sa_restaurants (product_id);
CREATE INDEX IF NOT EXISTS sa_restaurants_substatus_idx ON sa_restaurants (subscription_status);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sa_restaurants_product_fk') THEN
    ALTER TABLE sa_restaurants
      ADD CONSTRAINT sa_restaurants_product_fk
      FOREIGN KEY (product_id) REFERENCES sa_products(id);
  END IF;
END $$;

COMMIT;
```

**Verificación post-migración** (ejecutar y revisar a ojo antes de tocar código):

```sql
SELECT id, name, product_id, billing_mode, price, incluye_actualizaciones, active, legacy
  FROM sa_plans ORDER BY sort_order, id;

SELECT id, name, restaurant_id, product_id, subscription_status, plan
  FROM sa_restaurants ORDER BY created_at DESC;

-- Detectar restaurantes que quedaron sin rid (hay que resolverlos a mano)
SELECT id, name, notes FROM sa_restaurants WHERE restaurant_id IS NULL;
```

### 2.7 Impacto en el código existente

| Archivo | Cambio requerido |
|---|---|
| `app/api/superadmin/plans/route.ts` | `DEFAULT_PLANS` deja de ser la fuente de verdad → el auto-seed debe desactivarse (o sembrar los 6 nuevos). `toPlan()` debe exponer `productId`, `billingMode`, `incluyeActualizaciones`. `PATCH` debe aceptar esos campos. |
| `app/api/superadmin/restaurants/route.ts` | El `POST` debe leer `max_users` de `sa_plans` en vez de `premium?20:basic?5:3`, y llenar `product_id` / `billing_mode` desde el plan elegido. |
| `app/api/public/register/route.ts` | Escribir `restaurant_id` en su columna (y seguir escribiendo `notes` unos meses por compatibilidad). Cambiar el `.like('notes', ...)` por `.eq('restaurant_id', restaurantId)`. |
| `SuperAdmin.tsx` L13 | `type Plan = "trial" \| "basic" \| "premium"` → `type Plan = string` (los ids ya no son un conjunto cerrado). |
| `SuperAdmin.tsx` L138-140 | `PLAN_LABELS` / `PLAN_COLORS` / `PLAN_PRICE` como `Record<Plan, ...>` hardcodeados → derivarlos de `planConfigs` (que ya se carga en el `useEffect` del `Dashboard`). |
| `SuperAdmin.tsx` L357 | El filtro `(["all","trial","basic","premium"])` → `["all", ...productos]`. Filtrar **por producto**, no por plan, es lo que tiene sentido con 6 planes. |
| `SuperAdmin.tsx` L432-436 | El `<select>` del alta con 3 `<option>` hardcodeadas → mapear `planConfigs.filter(p => p.active)`. |
| `SuperAdmin.tsx` L966, L904 | `planConfigs.find(p => p.id === r.plan)!` — el `!` explota si un restaurante tiene un plan legacy que ya no está en el array. Usar fallback. |
| `SuperAdmin.tsx` L902 | **Arreglar el bug**: `applyAssign` debe llamar al endpoint de upgrade (§3), no solo mutar estado local. |

---

## 3. Flujo de upgrade / downgrade entre productos

### 3.1 Qué transiciones existen

Con `tier` (1=mi-card, 2=mi-menu, 3=mi-proyecto) las transiciones se clasifican solas:

| Origen → Destino | Tipo | Migración de datos | Riesgo |
|---|---|---|---|
| mi-card → mi-menu | upgrade (+1) | Copiar clientes/tarjetas + branding | Bajo |
| mi-card → mi-proyecto | upgrade (+2) | Copiar clientes/tarjetas + branding | Bajo |
| mi-menu → mi-proyecto | upgrade (+1) | Copiar menú, categorías, branding | Medio |
| mi-proyecto → mi-menu | **downgrade** | Se copia lo que cabe; **se queda fuera** pedidos, empleados, recetario, inventario | **Alto — pérdida** |
| mi-menu → mi-card | **downgrade** | Se pierde el menú completo | **Alto — pérdida** |
| Mismo producto, cambio de modalidad (mensual ↔ único) | **cambio de plan puro** | **Ninguna migración de datos** | Nulo |

> **Regla de diseño:** un downgrade **nunca borra** datos en el origen. Solo deja de exponerlos. La instancia vieja se conserva (o se hace snapshot) hasta que negocio decida darla de baja. Un downgrade que borra es irreversible y no hay forma de deshacerlo desde un panel.

### 3.2 Mapeo de tablas entre productos

> ⚠️ **Nivel de confianza.** Los repos `mi-menu`, `mi-card` y `mi-proyecto` **no están disponibles para inspección en esta tarea**. Lo que sigue está marcado como:
> - **[C] Confirmado** — visible en este repo (código o docs internos).
> - **[I] Inferencia razonable** — se deduce de nombres de módulos y del patrón multi-tenant conocido.
> - **[?] Requiere confirmar** — hay que abrir el repo hermano y verificar antes de escribir una línea de código de migración.

Lo que **sí está confirmado** desde este repo:

| Hecho | Fuente en este repo | Marca |
|---|---|---|
| Todas las tablas del ecosistema llevan `restaurant_id TEXT DEFAULT 'default'` | `memoria.md` L21, `CLAUDE.md` (nota 2026-06-28) | [C] |
| Existen las tablas `admins`, `employees`, `customers`, `menu_items`, `recipes` | `CLAUDE.md` nota 2026-06-28 (PATCH masivo) | [C] |
| Existe `orders` con columnas `total`, `notes`, `created_at`, `restaurant_id` | `revenue/route.ts` L75-77 | [C] |
| Existe `settings (key TEXT PK, value TEXT)` con JSON serializado en `value` | `save-flags/route.ts`, `revenue/route.ts` | [C] |
| Portales usa prefijo de clave en settings: `portales:restaurant_name` | `memoria.md` L45 | [C] |
| mi-menu tiene **proyecto Supabase propio** (`MIMENU_*`) | `lib/supabaseMiMenu.ts`, `.env.local` | [C] |
| mi-card **comparte la BD principal** con mi-proyecto | comentario en `SuperAdmin.tsx` L474 y ausencia de rama `_micard` en `resolveTarget()` | [C] |
| Los módulos de mi-card son exactamente 3: `sellar`, `tarjetas`, `configuracion` | `FEATURES_MICARD`, `SuperAdmin.tsx` L89-93 | [C] |

Mapeo propuesto:

**mi-card → mi-proyecto** (o → mi-menu)

| Concepto | Tabla origen (mi-card) | Tabla destino (mi-proyecto) | Marca | Notas |
|---|---|---|---|---|
| Identidad / branding | `settings` claves `restaurant_name`, color, logo | `settings` mismas claves | [C] esquema / [?] nombres exactos de clave | mi-card ya vive en la misma BD → puede ser solo cuestión de `restaurant_id`, no de copia |
| Clientes de lealtad | `customers` | `customers` | [I] | Clave natural probable: `(restaurant_id, phone)` |
| Categorías de tarjeta | tabla de tarjetas (¿`loyalty_tiers`?) | `customers.tier` / config de fidelización | [?] | El módulo se llama "Tarjetas — editor de categorías de tarjeta de lealtad" |
| Sellos / visitas | ¿`visits`? ¿`stamps`? | historial de visitas / puntos | [?] | El módulo "Sellar" registra visitas |
| Empleados que sellan | `employees` | `employees` | [I] | |

**mi-menu → mi-proyecto**

| Concepto | Tabla origen (mi-menu, BD `MIMENU_*`) | Tabla destino (mi-proyecto, BD principal) | Marca |
|---|---|---|---|
| Platillos | `menu_items` | `menu_items` | [I] fuerte — el nombre está confirmado en mi-proyecto |
| Categorías del menú | `categories` o `menu_items.category` | igual | [?] |
| Imágenes de platillos | URLs en `menu_items` o Supabase Storage | igual | [?] **crítico:** si son URLs de Storage del proyecto de mi-menu, apuntan a otro dominio de Supabase. Hay que **copiar los binarios**, no solo las filas |
| Cartas / secciones | ¿`cards`? ¿`menus`? | menú + pantallas | [?] |
| Branding | `settings` | `settings` (BD principal) | [C] esquema |
| Admin del restaurante | `admins` | `admins` | [I] |
| Feature flags | `settings.feature_flags` en BD mi-menu | `settings.feature_flags` en BD principal | [C] |

**Lo que NO se migra nunca** (nace vacío en el destino): `orders`, `recipes`, inventario, producción, reservaciones, reseñas, campañas de marketing. Son módulos que el producto origen no tiene, así que no hay datos que traer.

### 3.3 Endpoint `POST /api/superadmin/upgrade-plan`

**Request**

```jsonc
{
  "restaurantId": "uuid-de-sa_restaurants",   // requerido — la PK, no el rid
  "targetPlanId": "miproyecto-mensual",        // requerido — sa_plans.id
  "migrateData": true,                          // default true; false = solo cambia el plan
  "dryRun": false,                              // default false; true = simula y reporta, no escribe
  "acknowledgeDataLoss": false,                 // OBLIGATORIO true si es downgrade con pérdida
  "reason": "Cliente subió a plataforma completa"  // opcional, va al audit log
}
```

**Response 200**

```jsonc
{
  "ok": true,
  "migrationId": "uuid",
  "dryRun": false,
  "from": { "planId": "mimenu-mensual", "productId": "mi-menu",     "tier": 2 },
  "to":   { "planId": "miproyecto-mensual", "productId": "mi-proyecto", "tier": 3 },
  "direction": "upgrade",
  "steps": [
    { "step": "snapshot",       "status": "ok",      "rows": 0,   "ms": 210 },
    { "step": "copy:settings",  "status": "ok",      "rows": 14,  "ms": 340 },
    { "step": "copy:menu_items","status": "ok",      "rows": 87,  "ms": 1120 },
    { "step": "copy:customers", "status": "ok",      "rows": 412, "ms": 2400 },
    { "step": "copy:storage",   "status": "skipped", "rows": 0,   "note": "sin assets en Storage" },
    { "step": "flags",          "status": "ok",      "rows": 20,  "ms": 180 },
    { "step": "update:restaurant","status": "ok",    "rows": 1,   "ms": 90 },
    { "step": "audit",          "status": "ok",      "rows": 1,   "ms": 60 }
  ],
  "warnings": [
    "3 platillos sin imagen — se copiaron sin URL",
    "El plan destino permite 20 usuarios; el cliente tiene 5"
  ]
}
```

**Response 409 (falla a media migración)**

```jsonc
{
  "ok": false,
  "migrationId": "uuid",
  "failedAt": "copy:customers",
  "error": "duplicate key value violates unique constraint \"customers_rid_phone_key\"",
  "steps": [ /* con status ok / failed / pending */ ],
  "rollbackAvailable": true,
  "hint": "POST /api/superadmin/upgrade-plan/rollback con { migrationId }"
}
```

**Pasos internos (orden estricto)**

| # | Paso | Qué hace | Si falla |
|---|---|---|---|
| 1 | `auth` | `verifySaSession()` — igual que todos los `/api/superadmin/*` | 401, sin efectos |
| 2 | `load` | Lee `sa_restaurants` por PK + `sa_plans` origen y destino + `sa_products` de ambos | 404, sin efectos |
| 3 | `validate` | ¿Existe el plan destino? ¿Está `active`? ¿Es el mismo producto (→ salta a paso 8)? ¿Es downgrade sin `acknowledgeDataLoss`? ¿El cliente tiene `restaurant_id`? | 400, sin efectos |
| 4 | `snapshot` | Inserta fila en `sa_migrations` con `status='running'` y guarda en `payload_before` el JSON completo del restaurante **y los flags actuales de ambos productos** | 500, sin efectos |
| 5 | `copy:*` | Un paso por tabla, en orden de dependencias (settings → admins → employees → categorías → menu_items → customers → visitas). Cada `upsert` usa la **clave natural** (`restaurant_id` + campo único) para ser idempotente, y marca cada fila insertada con `migration_id` en `sa_migration_rows` | Marca el paso `failed`, detiene, devuelve 409 |
| 6 | `flags` | `POST` interno equivalente a `/api/save-flags` con la `flags_settings_key` del producto destino, activando los módulos que el plan destino incluye. **Guarda los flags previos en el snapshot** | Marca `failed`, 409 |
| 7 | `update:restaurant` | `UPDATE sa_restaurants SET plan, product_id, billing_mode, max_users, previous_plan, plan_changed_at, updates_until, support_until` | Marca `failed`, 409 |
| 8 | `audit` | `INSERT` en `sa_audit_log` con `type='billing'`, `action='Cambio de producto'`, `details='mi-menu → mi-proyecto (87 platillos, 412 clientes)'` | Log-only, no revierte |

**Tabla de soporte `sa_migrations`**

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | UUID PK | El `migrationId` |
| `restaurant_pk` | UUID | FK a `sa_restaurants.id` |
| `restaurant_id` | TEXT | El rid, denormalizado |
| `from_plan`, `to_plan` | TEXT | |
| `from_product`, `to_product` | TEXT | |
| `direction` | TEXT | `upgrade` \| `downgrade` \| `billing_change` |
| `status` | TEXT | `running` \| `ok` \| `failed` \| `rolled_back` |
| `steps` | TEXT (JSON) | El array de pasos con su resultado — mismo shape que la respuesta |
| `payload_before` | TEXT (JSON) | Snapshot del restaurante + flags previos, para el rollback |
| `warnings` | TEXT (JSON) | |
| `applied_by` | TEXT | `jesus` \| `eloy` |
| `started_at`, `finished_at` | TIMESTAMPTZ | |

### 3.4 Manejo de errores y rollback

**El problema de fondo:** la migración cruza **fronteras de base de datos** (mi-menu tiene su propio proyecto Supabase). Postgres no puede darnos una transacción distribuida entre dos proyectos de Supabase distintos. Por lo tanto **no existe un rollback atómico real** y hay que diseñar para eso, no fingir que no pasa.

Estrategia de tres capas:

**a) Idempotencia por diseño (la defensa principal).**
Cada `copy:*` usa `upsert` con `onConflict` sobre la clave natural, nunca `insert` ciego. Consecuencia: si la migración falla en el paso 5 y se reintenta completa, los pasos ya aplicados **no duplican filas**. El "rollback" preferido es simplemente **reintentar hasta que pase**, no deshacer.

**b) Rollback compensatorio (`POST /api/superadmin/upgrade-plan/rollback`).**
Para cuando reintentar no es opción:

```jsonc
// Request
{ "migrationId": "uuid", "deleteCopiedRows": false }
```

| `deleteCopiedRows` | Qué hace |
|---|---|
| `false` (default, **recomendado**) | Restaura `sa_restaurants` y los feature flags desde `payload_before`. **Deja las filas copiadas** en el destino, huérfanas pero inofensivas (el producto viejo no las lee). Reversible, cero riesgo. |
| `true` (peligroso) | Además borra las filas registradas en `sa_migration_rows` para ese `migration_id`. Solo si el destino quedó en un estado inconsistente que estorba. |

Ambos casos escriben en `sa_audit_log` con `type='update'` y marcan `sa_migrations.status='rolled_back'`.

**c) Reglas duras que evitan la mayoría de los fallos**

| Regla | Por qué |
|---|---|
| **`dryRun` primero, siempre.** La UI ejecuta `dryRun:true`, muestra el conteo de filas y los warnings, y solo entonces habilita el botón de confirmar. | Un cliente con 40.000 clientes de lealtad se detecta antes, no a la mitad. |
| **Nunca borrar en el origen.** El upgrade copia; no mueve. | Si el destino falla, el cliente sigue trabajando en su instancia vieja. |
| **Poner el restaurante en `status='maintenance'` durante la migración** y devolverlo a `active` al terminar. | Evita que el cliente escriba en el origen mientras se copia (lectura inconsistente). Ya existe el estado en el modelo. |
| **Timeout y batching.** Copiar en lotes de 500 filas; si un paso supera ~50s, marcar el paso como `pending` y continuar en una segunda llamada con el mismo `migrationId`. | Los serverless functions de Vercel tienen límite de ejecución; una migración de 100 clientes no cabe en una sola invocación. |
| **Lock por restaurante.** Rechazar con 409 si ya hay una `sa_migrations` con `status='running'` para ese `restaurant_pk`. | Evita dos upgrades simultáneos del mismo cliente. |

---

## 4. Monitoreo de flota

### 4.1 Punto de partida real

Confirmado por exploración:

- **No hay ningún mecanismo de sync ni de CI en este repo.** No existe `.github/` (ni workflows), no existe `vercel.json` (por lo tanto **no hay Vercel Cron configurado**), y `grep` de `github|api\.vercel|GITHUB_TOKEN|VERCEL_TOKEN` solo devuelve menciones en documentación (`CLAUDE.md`, `memoria.md`, `README.md`, `manual-tecnico`) y en `package-lock.json`. **Cero código que hable con GitHub o con Vercel.**
- El sync por GitHub Actions que menciona `CLAUDE.md` (`sync-portales.yml`, con ~20 exclusiones para proteger el branding) **vive en `mi-proyecto`, no aquí**. Confirmado por `memoria.md` L37.
- `.vercel/repo.json` de este proyecto expone el formato de los ids que va a necesitar la Vercel API: `projectId: prj_GkzS8vp5tx9AZFjz8fqBcEiEVpPE`, `orgId: team_ZcoaVjG56c7MXhj2WARVqJYc`.
- **Precedente importante:** según `memoria.md` L54 y L72, el proyecto de Portales en Vercel **no está conectado a GitHub** — se despliega a mano con `vercel --prod --token $VERCEL_TOKEN`. Es decir, el modelo "un push a GitHub dispara el deploy" **no es universal en este ecosistema**. El monitoreo tiene que tolerar instancias sin conexión Git.

### 4.2 Tabla nueva `sa_fleet_status`

Una fila por restaurante, sobrescrita por el job (no es un histórico; el histórico de parches es `sa_client_updates`, §5).

| Columna | Tipo | Descripción |
|---|---|---|
| `restaurant_pk` | UUID PK | FK a `sa_restaurants.id` (1:1) |
| `product_id` | TEXT | Denormalizado para filtrar sin JOIN |
| `checked_at` | TIMESTAMPTZ | Cuándo corrió el último chequeo |
| **— Health HTTP —** | | |
| `http_status` | INT | 200, 500, 404… `NULL` si no respondió |
| `http_ok` | BOOLEAN | `true` si 2xx/3xx |
| `http_latency_ms` | INT | |
| `http_error` | TEXT | Mensaje de timeout/DNS/TLS |
| **— Vercel —** | | |
| `vercel_state` | TEXT | `READY` \| `ERROR` \| `BUILDING` \| `QUEUED` \| `CANCELED` \| `unknown` |
| `vercel_deploy_id` | TEXT | `dpl_...` |
| `vercel_deploy_at` | TIMESTAMPTZ | Fecha del último deploy |
| `vercel_deploy_sha` | TEXT | Commit desplegado (`meta.githubCommitSha`) — puede ser NULL si el deploy fue por CLI |
| `vercel_error` | TEXT | Error de la API (token inválido, proyecto no encontrado) |
| **— GitHub —** | | |
| `repo_head_sha` | TEXT | Último commit de la rama del cliente |
| `repo_head_at` | TIMESTAMPTZ | |
| `base_head_sha` | TEXT | Último commit de la rama base del producto |
| `commits_behind` | INT | Cuántos parches le faltan al cliente |
| `commits_ahead` | INT | Cuántos commits propios tiene (personalizaciones) |
| `github_error` | TEXT | |
| **— Semáforo derivado —** | | |
| `health` | TEXT | `ok` \| `warn` \| `error` \| `unknown` — calculado, ver 4.5 |
| `health_reason` | TEXT | Frase corta para el tooltip: "Build falló hace 2h" |

```sql
CREATE TABLE IF NOT EXISTS sa_fleet_status (
  restaurant_pk      UUID PRIMARY KEY REFERENCES sa_restaurants(id) ON DELETE CASCADE,
  product_id         TEXT,
  checked_at         TIMESTAMPTZ DEFAULT NOW(),
  http_status        INT,
  http_ok            BOOLEAN,
  http_latency_ms    INT,
  http_error         TEXT,
  vercel_state       TEXT,
  vercel_deploy_id   TEXT,
  vercel_deploy_at   TIMESTAMPTZ,
  vercel_deploy_sha  TEXT,
  vercel_error       TEXT,
  repo_head_sha      TEXT,
  repo_head_at       TIMESTAMPTZ,
  base_head_sha      TEXT,
  commits_behind     INT,
  commits_ahead      INT,
  github_error       TEXT,
  health             TEXT DEFAULT 'unknown',
  health_reason      TEXT
);

CREATE INDEX IF NOT EXISTS sa_fleet_health_idx  ON sa_fleet_status (health);
CREATE INDEX IF NOT EXISTS sa_fleet_product_idx ON sa_fleet_status (product_id);
```

> **Por qué tabla aparte y no columnas en `sa_restaurants`:** `sa_restaurants` es la tabla comercial (la escribe el humano y el auto-registro); `sa_fleet_status` la reescribe un robot cada 15 minutos. Mezclarlas haría que cada chequeo dispare escrituras sobre la tabla que la UI lee todo el tiempo, y complicaría auditar quién cambió qué.

### 4.3 Qué se puede obtener realmente de cada fuente

#### Vercel API

| Señal | Endpoint | Campo | Token/permiso |
|---|---|---|---|
| Estado del último deploy | `GET https://api.vercel.com/v6/deployments?projectId={prj}&teamId={team}&limit=1&target=production` | `deployments[0].state` → `READY`/`ERROR`/`BUILDING`/`QUEUED`/`CANCELED` | **Vercel Access Token** con scope del team. Header `Authorization: Bearer $VERCEL_TOKEN` |
| Commit desplegado | mismo endpoint | `deployments[0].meta.githubCommitSha` y `.meta.githubCommitMessage` | igual. **Vacío si el deploy vino de `vercel --prod` por CLI** |
| Fecha del deploy | mismo endpoint | `deployments[0].created` (epoch ms) | igual |
| Log del error de build | `GET /v3/deployments/{id}/events` | stream de líneas | igual. Pesado — traerlo solo bajo demanda desde el modal, no en el cron |
| Dominios del proyecto | `GET /v9/projects/{prj}/domains?teamId={team}` | para autodescubrir `deploy_url` | igual |
| Listar todos los proyectos del team | `GET /v9/projects?teamId={team}&limit=100` | para poblar `vercel_project_id` de golpe | igual |

**Restricción crítica:** un token de Vercel **solo ve los proyectos de su cuenta/team**. Si un cliente tiene el deploy en **su propia cuenta de Vercel**, el token de NICHO devuelve 404 y no hay forma de espiarlo. Las dos salidas son: (a) todos los proyectos viven en el team `team_ZcoaVjG56c7MXhj2WARVqJYc` de NICHO, o (b) el cliente crea un token de solo lectura y se guarda cifrado. **(a) es la única viable a 100 clientes** — es decisión de negocio (§7).

#### GitHub API

| Señal | Endpoint | Campo | Token/permiso |
|---|---|---|---|
| Último commit del cliente | `GET /repos/{owner}/{repo}/commits/{branch}` | `sha`, `commit.committer.date`, `commit.message` | **Fine-grained PAT** con `Contents: Read` + `Metadata: Read` sobre esos repos |
| Último commit del repo base | `GET /repos/Segundo715/{producto}/commits/main` | igual | igual |
| **Cuánto le falta al cliente** | `GET /repos/{base_owner}/{base_repo}/compare/{base_branch}...{client_owner}:{client_branch}` | `behind_by`, `ahead_by`, `status`, `commits[]` | igual. **Requiere que los repos compartan historia** (fork real o mismo repo). Si son repos independientes creados por copia de archivos, devuelve 404 "no common ancestor" |
| Disparar un deploy/parche | `POST /repos/{owner}/{repo}/actions/workflows/{id}/dispatches` | — | PAT con `Actions: Read and write` |
| Abrir un PR con el parche | `POST /repos/{owner}/{repo}/pulls` | — | PAT con `Pull requests: Write` |
| Rate limit | 5.000 req/hora con PAT | — | 100 clientes × 3 llamadas = 300/ciclo. Cada 15 min = 1.200/hora. **Cabe cómodo** |

**Restricción crítica:** el endpoint `compare` es la única forma barata de saber "cuántos parches te faltan", y **exige ancestro común**. Si los repos de cliente son forks reales de GitHub, funciona. Si son copias manuales (`git init` + copiar archivos), no funciona y hay que caer al plan B: comparar un **campo de versión** que la propia app exponga (ver abajo).

#### Health-check HTTP

Lo más barato y lo que más vale: un `fetch(deploy_url + health_path)` con `AbortController` a 8s.

**Recomendación fuerte:** que los tres productos expongan `GET /api/health` devolviendo:

```jsonc
{
  "ok": true,
  "product": "mi-menu",
  "restaurantId": "taco-express",
  "version": "2026-08-21.3",
  "commit": "a1b2c3d",
  "supabase": "ok",
  "uptime": 84021
}
```

Esto resuelve de un golpe tres problemas: (1) confirma que la app arranca de verdad, no solo que Vercel responde HTML; (2) devuelve el **commit efectivamente corriendo**, que es más confiable que lo que diga la Vercel API; (3) confirma que la conexión a Supabase del cliente está viva — la causa #1 de "la app está caída" según `memoria.md` es de configuración de BD, no de build. Implementar `/api/health` en los tres repos hermanos debería ser **la primera tarea que se manda a los repos hermanos**, antes de escribir el monitor.

### 4.4 Endpoints y job periódico

| Endpoint | Método | Auth | Qué hace |
|---|---|---|---|
| `/api/superadmin/fleet` | `GET` | `verifySaSession()` | Lee `sa_fleet_status` JOIN `sa_restaurants`. **No llama a APIs externas** — sirve el caché. Query params: `?product=mi-menu&health=error` |
| `/api/superadmin/fleet` | `POST` | `verifySaSession()` | Refresca **un** restaurante bajo demanda (`{ restaurantId }`). Es el botón "🔄" de cada fila |
| `/api/superadmin/fleet/logs` | `GET` | `verifySaSession()` | `?deploymentId=dpl_...` → trae los eventos de build de Vercel. Solo bajo demanda |
| `/api/cron/fleet-refresh` | `GET` | `Authorization: Bearer $CRON_SECRET` | El job. **No usa `verifySaSession()`** porque no hay cookie en una invocación de cron |

**Diseño del job (`/api/cron/fleet-refresh`)**

```
1. Autenticar: header Authorization === `Bearer ${process.env.CRON_SECRET}` → si no, 401
2. SELECT de sa_restaurants WHERE status != 'cancelled'
   ORDER BY (SELECT checked_at FROM sa_fleet_status ...) NULLS FIRST
   LIMIT 25                                  ← lotes, no los 100 de golpe
3. Para cada restaurante, en paralelo con Promise.allSettled (concurrencia 5):
     a. health-check HTTP  (timeout 8s)
     b. Vercel: último deployment    (si hay vercel_project_id)
     c. GitHub: head del cliente + compare vs base  (si hay repo_owner/repo_name)
4. Calcular `health` y `health_reason` (tabla 4.5)
5. UPSERT en sa_fleet_status con onConflict: 'restaurant_pk'
6. Si algún restaurante pasó de health='ok' a health='error', INSERT en sa_audit_log
   con type='access' y action='Instancia caída'   ← así la caída queda en el historial
7. Devolver { checked: 25, ok: 22, warn: 2, error: 1, ms: 14200 }
```

`Promise.allSettled` (no `Promise.all`) es obligatorio: un cliente con DNS roto no debe tumbar el chequeo de los otros 24. Es el mismo patrón que ya usa `tickets/route.ts` para fusionar las dos BDs, pero con tolerancia a fallo.

**`vercel.json` (archivo nuevo — hoy no existe)**

```jsonc
{
  "crons": [
    { "path": "/api/cron/fleet-refresh", "schedule": "*/15 * * * *" }
  ]
}
```

> **Ojo con el plan de Vercel:** el plan Hobby permite **un cron y solo una vez al día**. Cron cada 15 min requiere plan **Pro**. Alternativa si no se quiere pagar: un GitHub Action con `schedule` en el repo del superadmin que haga `curl` al endpoint con el `CRON_SECRET` — funciona igual y es gratis. Decisión de negocio (§7).

**Variables de entorno nuevas**

| Variable | Dónde | Descripción |
|---|---|---|
| `VERCEL_TOKEN` | Solo Vercel | Access token con scope del team NICHO |
| `VERCEL_TEAM_ID` | Solo Vercel | `team_ZcoaVjG56c7MXhj2WARVqJYc` |
| `GITHUB_TOKEN` | Solo Vercel | Fine-grained PAT: `Contents:Read`, `Metadata:Read` (+ `Actions:RW` para la Fase 5) |
| `GITHUB_BASE_OWNER` | Solo Vercel | `Segundo715` (o leerlo de `sa_products`) |
| `CRON_SECRET` | Solo Vercel | Secreto del job. Generar con `openssl rand -hex 32` |

Estas van **solo en Vercel**, igual que `PORTALES_*` — no en `.env.local`. Cuando falten, los endpoints deben degradar a `vercel_error: 'sin token'` y seguir haciendo el health-check HTTP, **no lanzar excepción** (el patrón `?? ''` de los clientes Supabase ya establece ese estilo tolerante).

### 4.5 Cálculo del semáforo

| `health` | Condición | `health_reason` de ejemplo |
|---|---|---|
| 🔴 `error` | `http_ok === false` **o** `vercel_state === 'ERROR'` | "No responde (timeout)" / "Build falló hace 2h" |
| 🟡 `warn` | `commits_behind > 0` **o** `vercel_state === 'BUILDING'` hace >15 min **o** `http_latency_ms > 3000` **o** `checked_at` con más de 2h | "3 parches pendientes" / "Build atorado" / "Lento (4.2s)" |
| 🟢 `ok` | HTTP 2xx + `vercel_state === 'READY'` + `commits_behind === 0` | "Al día" |
| ⚪ `unknown` | Falta `deploy_url`, o falta token, o nunca se chequeó | "Sin URL configurada" |

`unknown` como estado explícito es importante: con 100 clientes va a haber muchos a medio configurar, y pintarlos de verde ("no detecté errores") sería mentir.

### 4.6 Vista nueva `"flota"` en `SuperAdmin.tsx`

Siguiendo el estilo ya establecido (una `function` por vista, `sa-section-header` + chips de filtro + `sa-card` con `sa-table`, exactamente como `AuditLog` y `Restaurants`).

**Cambios mínimos en el andamiaje:**

1. **Union type `View`** (L12) — agregar `"flota"`:
   ```ts
   type View = "overview" | "restaurants" | "flota" | "flags" | ... ;
   ```
2. **`NAV`** (L2167) — nueva sección propia, porque flota no es "Gestión" comercial:
   ```ts
   { view: "flota",  icon: "activity", label: "Flota de clientes", section: "Infraestructura" },
   { view: "updates", icon: "refresh",  label: "Parches y versiones" },   // §5
   ```
   Ambos iconos hay que agregarlos al `IconName` / componente `Icon` (L2107-2161), que hoy es un switch de paths SVG sin emoji.
3. **`renderView()`** (L2231) — `case "flota": return <Flota restaurants={restaurants} showToast={showToast} />;`
4. **Badge en el sidebar** — el patrón ya existe para `billing` y `solicitudes` (L2279-2284). Replicarlo:
   ```tsx
   {item.view === "flota" && fleetErrors > 0 && <span className="sa-nav-badge">{fleetErrors}</span>}
   ```
   `fleetErrors` se carga en el `useEffect` del `Dashboard` (L2198) con `fetch('/api/superadmin/fleet?health=error')`, junto a las otras 5 cargas iniciales.

**Estructura de la vista**

```
┌ sa-section-header ───────────────────────────────────────────────┐
│ [icono] Flota de clientes        [🔄 Refrescar todo] [Exportar CSV]│
│ 100 instancias · 92 ok · 5 con parches pendientes · 3 caídas       │
└──────────────────────────────────────────────────────────────────┘

[4 KPI cards reutilizando .sa-kpi-card de Overview]
  🟢 Al día 92    🟡 Desactualizadas 5    🔴 Caídas 3    ⚪ Sin config 0

[chips]  Todos | mi-card | mi-menu | mi-proyecto        ← filtro por producto
[chips]  Todos | 🟢 ok | 🟡 warn | 🔴 error | ⚪ unknown  ← filtro por semáforo
[sa-search] Buscar por nombre o URL…

┌ sa-card > sa-table ──────────────────────────────────────────────────────┐
│ Cliente │ Producto │ Plan │ Estado │ Deploy │ Versión │ Últ. check │ ⚙ │
│ Taco Ex.│ mi-menu  │ Mens.│ 🟢 Al día│ READY  │ a1b2c3d │ hace 4 min │🔄👁│
│ Sushi Z.│ mi-card  │ Único│ 🟡 -3    │ READY  │ 9f8e7d6 │ hace 4 min │🔄👁│
│ El Rincón│mi-proy. │ Mens.│ 🔴 Build │ ERROR  │ 4c5b6a7 │ hace 4 min │🔄👁│
└──────────────────────────────────────────────────────────────────────────┘
```

- El chip de estado reutiliza el componente `Badge` existente con los tipos CSS ya definidos: `active` (verde), `warning` (amarillo), `danger` (rojo), `muted` (gris). **No hace falta CSS nuevo.**
- `👁` abre un `Modal` (componente existente, L189) con el detalle: URL, repo, últimos commits pendientes, log de build de Vercel (fetch bajo demanda a `/api/superadmin/fleet/logs`), y el historial de parches de ese cliente (§5).
- "Exportar CSV" replica literalmente `exportCSV()` de `AuditLog` (L805): `Blob` + `<a download>` temporal.
- Con 100 filas, `restaurants.filter()` en cliente basta. Si llega a 500+, paginar server-side.

---

## 5. Historial de actualizaciones / parches por cliente

### 5.1 Qué problema resuelve

`sa_fleet_status` responde *"¿este cliente está al día ahora mismo?"*. No responde *"¿cuándo le apliqué el fix del bug de los QR y funcionó?"*. Eso es un histórico append-only, y es lo que sostiene la conversación con un cliente que reclama.

`sa_audit_log` no sirve para esto: es texto libre sin `commit_hash` ni `resultado`, y su `restaurant` es un nombre, no un id.

### 5.2 Tabla nueva `sa_client_updates`

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | UUID PK | |
| `restaurant_pk` | UUID | FK a `sa_restaurants.id` |
| `restaurant_id` | TEXT | El rid, denormalizado (sobrevive si se borra el restaurante) |
| `restaurant_name` | TEXT | Snapshot del nombre al momento del parche |
| `product_id` | TEXT | `mi-card` \| `mi-menu` \| `mi-proyecto` |
| `commit_hash` | TEXT | SHA corto o largo del parche aplicado |
| `commit_message` | TEXT | Mensaje del commit |
| `base_commit_hash` | TEXT | SHA del repo base del que salió el parche |
| `version_label` | TEXT | Etiqueta legible: `2026-08-21.3` |
| `descripcion` | TEXT | Qué arregla, en español, escrito por Jesús o Eloy |
| `tipo` | TEXT | `fix` \| `feature` \| `security` \| `config` \| `rollback` |
| `resultado` | TEXT | `pendiente` \| `aplicado` \| `deploy_ok` \| `deploy_error` \| `revertido` |
| `deploy_id` | TEXT | `dpl_...` de Vercel, para enlazar al build |
| `deploy_url` | TEXT | Link directo al deployment |
| `error_detail` | TEXT | Si `resultado='deploy_error'` |
| `aplicado_por` | TEXT | `jesus` \| `eloy` \| `cron` |
| `aplicado_at` | TIMESTAMPTZ | |
| `verificado_at` | TIMESTAMPTZ | Cuándo el cron confirmó que el deploy quedó `READY` |
| `created_at` | TIMESTAMPTZ | `NOW()` |

```sql
CREATE TABLE IF NOT EXISTS sa_client_updates (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_pk     UUID REFERENCES sa_restaurants(id) ON DELETE SET NULL,
  restaurant_id     TEXT,
  restaurant_name   TEXT,
  product_id        TEXT,
  commit_hash       TEXT,
  commit_message    TEXT,
  base_commit_hash  TEXT,
  version_label     TEXT,
  descripcion       TEXT,
  tipo              TEXT DEFAULT 'fix',
  resultado         TEXT DEFAULT 'pendiente',
  deploy_id         TEXT,
  deploy_url        TEXT,
  error_detail      TEXT,
  aplicado_por      TEXT,
  aplicado_at       TIMESTAMPTZ DEFAULT NOW(),
  verificado_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sa_updates_rest_idx    ON sa_client_updates (restaurant_pk, aplicado_at DESC);
CREATE INDEX IF NOT EXISTS sa_updates_product_idx ON sa_client_updates (product_id, aplicado_at DESC);
CREATE INDEX IF NOT EXISTS sa_updates_result_idx  ON sa_client_updates (resultado);
CREATE INDEX IF NOT EXISTS sa_updates_commit_idx  ON sa_client_updates (commit_hash);
```

### 5.3 Endpoints

| Endpoint | Método | Descripción |
|---|---|---|
| `/api/superadmin/client-updates` | `GET` | Lista. Params: `?restaurantId=`, `?product=`, `?commit=`, `?resultado=`, `?limit=100` |
| `/api/superadmin/client-updates` | `POST` | Registra un parche (uno o varios clientes de golpe) |
| `/api/superadmin/client-updates` | `PATCH` | Actualiza `resultado`/`verificado_at` (lo usa el cron al confirmar el deploy) |

**`POST` — request**

```jsonc
{
  "restaurantIds": ["uuid-1", "uuid-2"],   // o "all", o { "product": "mi-menu" }
  "commitHash": "a1b2c3d4e5f6",
  "commitMessage": "fix: QR de sellado no se generaba en iOS",
  "baseCommitHash": "9f8e7d6",
  "versionLabel": "2026-08-21.3",
  "descripcion": "Corrige el QR en iPhone. Afecta el módulo Sellar.",
  "tipo": "fix",
  "resultado": "aplicado"       // 'pendiente' si solo se está planeando
}
```

**`POST` — response**

```jsonc
{
  "ok": true,
  "created": 2,
  "entries": [ { "id": "...", "restaurantName": "Taco Express", "resultado": "aplicado" }, ... ],
  "skipped": [ { "restaurantId": "uuid-3", "reason": "updates_until vencido (2026-03-01)" } ]
}
```

El campo `skipped` es donde el modelo de negocio se hace ejecutable: si un cliente de **pago único** ya venció su ventana de `updates_until`, el sistema **lo excluye y lo dice**, en vez de dejar que alguien le regale soporte sin darse cuenta. Ese es el motivo por el que `incluye_actualizaciones` y `meses_actualizaciones` son columnas explícitas del plan (§2.3).

**Efectos secundarios del `POST`:** además de insertar, escribe una entrada en `sa_audit_log` (`type='update'`, `action='Parche aplicado'`) por cada cliente, siguiendo la regla ya establecida en `CLAUDE.md` ("las APIs de restaurantes llaman automáticamente `POST /api/audit` después de cada mutación importante").

**Integración con el cron de flota:** cuando `fleet-refresh` detecta que `vercel_deploy_sha === commit_hash` de un update con `resultado='aplicado'`, hace `PATCH` a `deploy_ok` y sella `verificado_at`. Si el deploy quedó `ERROR`, lo marca `deploy_error` con el mensaje. **Así el historial se verifica solo, sin que nadie tenga que acordarse de actualizarlo.**

### 5.4 Vista / badge en el dashboard

**Opción recomendada: vista propia `"updates"`** ("Parches y versiones"), justo debajo de "Flota" en la sección Infraestructura del sidebar. Es prácticamente un clon estructural de `AuditLog` (L794-856), que ya tiene todo lo necesario: filtro por tipo con `sa-tabs`, buscador con `sa-search`, tabla, y export CSV.

| Elemento de `AuditLog` | Equivalente en `ClientUpdates` |
|---|---|
| `filter: "all" \| AuditType` con `sa-tab` | `filter: "all" \| "fix" \| "feature" \| "security" \| "config"` |
| `AUDIT_ICONS` / `AUDIT_COLORS` | `UPDATE_ICONS` / `UPDATE_COLORS` (`fix`→wrench/info, `security`→shield/danger, `feature`→plus/active) |
| Columnas: Fecha, Tipo, Usuario, Restaurante, Acción, Detalles, IP | Fecha, Tipo, Cliente, Producto, Commit, Descripción, Resultado, Aplicado por |
| `exportCSV()` | idéntico, cambiando el header |

Encima de la tabla, un bloque de **cobertura del último parche** — la pregunta que de verdad se hace el superadmin:

```
┌─ Último parche · 2026-08-21.3 · "fix: QR de sellado en iOS" ────────┐
│  🟢 Al día 87   🟡 Pendientes 11   🔴 Falló el deploy 2            │
│  [Ver los 11 pendientes]   [Reintentar los 2 que fallaron]         │
└────────────────────────────────────────────────────────────────────┘
```

**Además, badge contextual dentro del modal de la vista Flota:** al abrir el `👁` de un cliente, la última sección del `Modal` muestra sus últimos 5 registros de `sa_client_updates`. Ahí es donde de verdad se consulta el historial: cuando estás mirando a un cliente concreto porque se quejó.

---

## 6. Plan de implementación por fases

Ordenado para **no romper** lo que ya funciona: feature flags de 4 conexiones, auditoría, y el sistema dual de tickets.

### Fase 0 — Reconciliar la documentación del esquema · Esfuerzo: **bajo**

| Tarea | Detalle |
|---|---|
| Dump real del esquema | El query de `information_schema` de §1.8 en las 3 BDs (principal, portales, mi-menu) |
| Reescribir `Documentacion/sql/tablas.sql` | Con el dump real. Marcarlo "generado — no editar a mano" |
| Actualizar `CLAUDE.md` | Agregar `supabaseMiMenu` a la tabla de clientes; agregar `MIMENU_*` a variables de entorno; agregar `feature_flags_mimenu` y `feature_flags_micard` a las claves; corregir "doble cliente" → "cuatro clientes" |
| Actualizar `CONTEXT.md` | Quitar las afirmaciones falsas de L178 y L203 |
| Actualizar `Documentacion/indice.md` | Enlazar este documento |

**Por qué va primero:** todas las fases siguientes escriben SQL. Con el doc mintiendo, la probabilidad de una migración destructiva es alta. **Bloqueante.**

### Fase 1 — Higiene de datos y bugs de persistencia · Esfuerzo: **bajo**

| Tarea | Archivo |
|---|---|
| `ALTER TABLE sa_restaurants ADD COLUMN restaurant_id` + backfill desde `notes` + índice único parcial (bloque 3 del SQL de §2.6) | Supabase SQL editor |
| Cambiar `.like('notes', 'rid:%')` por `.eq('restaurant_id', ...)` y escribir la columna nueva (seguir escribiendo `notes` por compatibilidad) | `app/api/public/register/route.ts` |
| **Arreglar `applyAssign()`**: agregar el `PATCH` que falta | `SuperAdmin.tsx` ~L902 |
| **Arreglar `Maintenance.toggle()`**: agregar el `PATCH` que falta | `SuperAdmin.tsx` ~L1363 |
| `max_users` desde `sa_plans`, no hardcodeado | `restaurants/route.ts` L42 |
| `api_token` con `crypto.randomUUID()` en vez de `Math.random()` | `restaurants/route.ts` L45 |

**Por qué va antes del catálogo:** el `restaurant_id` real es la llave de todo lo demás; y los dos bugs de persistencia harían imposible confiar en las pruebas de la Fase 2 ("cambié el plan y no se guardó — ¿es mi código nuevo o el bug viejo?").

### Fase 2 — Catálogo multi-producto (solo lectura) · Esfuerzo: **medio**

| Tarea | Detalle |
|---|---|
| Ejecutar bloques 1 y 2 del SQL de §2.6 | `sa_products` + columnas de `sa_plans` + seed de los 6 planes |
| `GET /api/superadmin/products` (nuevo) | Lista `sa_products` |
| `plans/route.ts`: exponer `productId`, `billingMode`, `incluyeActualizaciones`; desactivar el auto-seed de `DEFAULT_PLANS` | |
| `SuperAdmin.tsx`: `type Plan = string`; derivar `PLAN_LABELS/COLORS/PRICE` de `planConfigs`; `<select>` del alta desde `planConfigs.filter(active)`; filtro por producto | |
| Vista `Plans`: agrupar las tarjetas por producto (3 grupos × 2 modalidades) y mostrar el badge de `incluye_actualizaciones` | |

**Criterio de aceptación:** el superadmin puede dar de alta un cliente en cualquiera de los 6 planes y ver el producto correcto en la tabla. **Todavía no hay migración de datos.**

### Fase 3 — Monitoreo de flota · Esfuerzo: **alto**

| Tarea | Detalle |
|---|---|
| **Prerrequisito en repos hermanos:** implementar `GET /api/health` en `mi-card`, `mi-menu` y `mi-proyecto` | Fuera de este repo — coordinar |
| Decisión de negocio: consolidar todos los proyectos en el team de Vercel de NICHO (§7) | Bloqueante para las señales de Vercel |
| Crear `sa_fleet_status` | SQL de §4.2 |
| Poblar `repo_*`, `deploy_url`, `vercel_project_id` de los clientes existentes | Semi-manual, o con `GET /v9/projects?teamId=` para autodescubrir |
| `lib/vercelApi.ts` y `lib/githubApi.ts` (wrappers con timeout y degradación sin token) | |
| `GET/POST /api/superadmin/fleet` + `GET /api/cron/fleet-refresh` | |
| `vercel.json` con el cron (o GitHub Action + `curl` si se queda en Hobby) | |
| Vista `Flota` en `SuperAdmin.tsx` + entrada `"flota"` en `View` y `NAV` + badge | |

**Se puede entregar en dos mitades:** primero **solo el health-check HTTP** (no necesita ningún token, funciona el día 1 y ya da el 70% del valor), después Vercel + GitHub.

### Fase 4 — Historial de parches · Esfuerzo: **medio**

| Tarea | Detalle |
|---|---|
| Crear `sa_client_updates` | SQL de §5.2 |
| `GET/POST/PATCH /api/superadmin/client-updates` con la lógica de `skipped` por `updates_until` | |
| Enganchar la verificación automática en el cron de flota (`vercel_deploy_sha` → `deploy_ok`) | |
| Vista `ClientUpdates` (clon estructural de `AuditLog`) + bloque de cobertura del último parche | |
| Sección de historial dentro del modal de detalle de Flota | |

**Depende de la Fase 3** para la verificación automática, pero el `POST` manual funciona sin ella.

### Fase 5 — Upgrade / downgrade entre productos · Esfuerzo: **alto**

| Tarea | Detalle |
|---|---|
| **Prerrequisito:** auditar los esquemas reales de `mi-card` y `mi-menu` y cerrar todos los `[?]` de §3.2 | Fuera de este repo — **bloqueante** |
| Crear `sa_migrations` y `sa_migration_rows` | |
| `POST /api/superadmin/upgrade-plan` con `dryRun` primero | |
| `POST /api/superadmin/upgrade-plan/rollback` | |
| Copiadores por par de productos, con `upsert` idempotente y batching de 500 filas | |
| Copia de assets de Supabase Storage entre proyectos (si aplica) | |
| Modal de upgrade en la vista `Plans` / `Restaurants`: dry-run → previsualización → confirmar | |
| Prueba end-to-end con un cliente de juguete antes de tocar a uno real | **No negociable** |

**Va al final a propósito.** Es la pieza más riesgosa (cruza bases de datos, sin transacción atómica) y la que menos urge: con 100 clientes entrando, primero hay que poder **darlos de alta correctamente** (Fases 0-2) y **verlos** (Fase 3). El primer upgrade real probablemente ocurra semanas después de la primera venta.

### Resumen

| Fase | Esfuerzo | Bloquea a | Riesgo de romper lo existente |
|---|---|---|---|
| 0 · Documentación | Bajo | Todas | Ninguno |
| 1 · Higiene y bugs | Bajo | 2, 3, 4, 5 | Bajo (tocar `public/register` — probar el auto-registro) |
| 2 · Catálogo | Medio | 5 | **Medio** — se toca `type Plan` y `PLAN_LABELS`, usados en 6 vistas |
| 3 · Flota | Alto | 4 (parcial) | Bajo (todo es código nuevo) |
| 4 · Parches | Medio | — | Bajo (código nuevo) |
| 5 · Upgrade | Alto | — | **Alto** — escribe en BDs de clientes |

---

## 7. Riesgos y preguntas abiertas

### 7.1 Decisiones de negocio (no se resuelven leyendo código)

| # | Pregunta | Por qué importa | Recomendación |
|---|---|---|---|
| 1 | **¿Pago único incluye actualizaciones? ¿Por cuánto tiempo?** | Es la columna `incluye_actualizaciones` + `meses_actualizaciones`. Determina el `skipped` del endpoint de parches | 12 meses incluidos, después renovación anual de mantenimiento. Sin ventana explícita, cada bug de 2029 sale gratis |
| 2 | **¿Pago único incluye corrección de bugs de por vida?** | Distinto de (1): un bug de seguridad no es una "actualización" | Separar `meses_actualizaciones` de `meses_soporte`. Fixes de **seguridad** siempre gratis (reputación); features, no |
| 3 | **¿Los repos de cliente son forks reales de GitHub, o copias independientes?** | **Define si el monitoreo es viable.** `compare` necesita ancestro común | Forks reales, o al menos un ancestro compartido. Si son copias, hay que usar `version_label` en `/api/health` como única señal |
| 4 | **¿O son la misma instancia con `NEXT_PUBLIC_RESTAURANT_ID` distinto?** | El precedente del ecosistema (`restaurant_id` multi-tenant) apunta a esto. 1 repo + 1 deploy que sirve a 100 clientes es **radicalmente más simple** que 100 forks | Si el producto lo permite, **multi-tenant gana**: no hay parches que propagar. La flota entonces monitorea ~3 deploys, no 100. **Esta es la decisión de mayor impacto de todo el documento** |
| 5 | **¿Todos los proyectos de Vercel viven en el team de NICHO?** | Un token solo ve su propio team. Sin esto, no hay señal de build | Sí, obligatorio a 100 clientes. Si el cliente quiere el dominio a su nombre, se apunta el dominio, no se mueve el proyecto |
| 6 | **¿Plan Pro de Vercel para el cron cada 15 min?** | Hobby: 1 cron, 1 vez al día | Si no, GitHub Action con `schedule` + `curl` — gratis y equivalente |
| 7 | **¿mi-card sigue compartiendo BD con mi-proyecto?** | Hoy sí (`feature_flags_micard` cae en la BD principal). Con 100 clientes de mi-card, sus datos se mezclan con los de la plataforma | Decidir ya: o proyecto Supabase propio (como mi-menu), o aislamiento estricto por `restaurant_id` con RLS |
| 8 | **¿Un downgrade borra los datos del producto superior?** | Determina si el rollback es posible | **No borrar nunca.** Conservar + snapshot. Es la única versión reversible |
| 9 | **Precios reales de las 6 combinaciones** | Los del seed son placeholders | Fijarlos antes de ejecutar la migración |
| 10 | **¿Qué pasa con `trial` en el mundo multi-producto?** | Hoy es el default del auto-registro y apunta a mi-proyecto | ¿Trial por producto (`micard-trial`, etc.) o un trial único de la plataforma completa? |

### 7.2 Riesgos técnicos

| # | Riesgo | Impacto | Mitigación |
|---|---|---|---|
| 1 | **`sa_session` es un string fijo público** (`nicho_sa_authenticated_2024`). Ya está documentado como pendiente. Con endpoints que ahora pueden **borrar datos de 100 clientes** (upgrade, rollback), el riesgo escala de "ven datos" a "destruyen negocio" | **Crítico** | Firmar la cookie con HMAC + `ADMIN_SECRET` + expiración. **Recomendación: hacerlo antes de la Fase 5**, no después |
| 2 | `.maybeSingle()` con `LIKE 'rid:X%'` explota si dos rids comparten prefijo | Alto — **se dispara justo cuando entren los 100 clientes** | Fase 1 lo elimina |
| 3 | No hay transacción atómica cross-Supabase | Alto | Idempotencia + `dryRun` + rollback compensatorio (§3.4) |
| 4 | Timeout de función serverless en migraciones grandes | Medio | Batching de 500 filas + continuación por `migrationId` |
| 5 | Rate limit de GitHub (5.000/h) | Bajo a 100 clientes (1.200/h) | Caché en `sa_fleet_status`; si crece, subir el intervalo |
| 6 | Tokens `VERCEL_TOKEN` / `GITHUB_TOKEN` con permisos amplios en env vars | Alto | Fine-grained PAT con el mínimo (`Contents:Read`, `Metadata:Read`), rotación trimestral, solo en Vercel |
| 7 | Imágenes de menú en Supabase Storage del proyecto origen | Medio — menús rotos post-upgrade | Copiar binarios, no solo filas. Detectarlo en el `dryRun` y reportarlo en `warnings` |
| 8 | `SuperAdmin.tsx` pasa de ~2.360 líneas a ~3.200 con Flota + Parches | Medio | La regla del proyecto es no fragmentar sin razón. **A partir de ~3.000 líneas hay razón** — extraer `Flota` y `ClientUpdates` a `components/` manteniendo los helpers (`Badge`, `Modal`, `Toggle`, `Icon`) compartidos |
| 9 | `planConfigs.find(...)!` con `!` explota si un cliente tiene plan legacy fuera del array | Medio — pantalla en blanco | Fallback en Fase 2 |
| 10 | El cron escribe `sa_fleet_status` mientras la UI la lee | Bajo | `UPSERT` por PK; la UI tolera datos de hasta 15 min |
| 11 | Portales se despliega a mano (`vercel --prod`), sin GitHub | Medio — su `commits_behind` no será confiable | Contemplar `deploy_source: 'cli' \| 'git'` en `sa_products`; para instancias CLI, confiar solo en `/api/health` |

### 7.3 Lo que este documento NO pudo resolver

- **El esquema real de `mi-card` y `mi-menu`.** Todo §3.2 marcado `[?]` requiere abrir los repos hermanos. **La Fase 5 no puede empezar sin eso.**
- **Si existe o no `/api/health` en los productos.** Se asume que no.
- **El esquema real en Supabase hoy mismo.** Este documento infiere las columnas desde el código que las usa (que es fuerte: si no existieran, los endpoints fallarían), pero no ejecutó el dump. La Fase 0 lo cierra.
- **Cuántos clientes existen ya y en qué estado.** `CONTEXT.md` dice que solo `r1` es real y el resto es seed; `memoria.md` menciona portales como segunda instancia real. Hay que inventariar antes de migrar.

---

## Anexo A — Resumen de objetos de BD propuestos

| Objeto | Tipo | Fase | BD |
|---|---|---|---|
| `sa_products` | Tabla nueva | 2 | Principal |
| `sa_plans` (+11 columnas) | Alteración | 2 | Principal |
| `sa_restaurants` (+17 columnas) | Alteración | 1 y 2 | Principal |
| `sa_fleet_status` | Tabla nueva | 3 | Principal |
| `sa_client_updates` | Tabla nueva | 4 | Principal |
| `sa_migrations` | Tabla nueva | 5 | Principal |
| `sa_migration_rows` | Tabla nueva | 5 | Principal |

## Anexo B — Resumen de endpoints propuestos

| Endpoint | Método | Auth | Fase |
|---|---|---|---|
| `/api/superadmin/products` | `GET` | `verifySaSession()` | 2 |
| `/api/superadmin/plans` | `GET`/`PATCH` (extendidos) | `verifySaSession()` | 2 |
| `/api/superadmin/fleet` | `GET`/`POST` | `verifySaSession()` | 3 |
| `/api/superadmin/fleet/logs` | `GET` | `verifySaSession()` | 3 |
| `/api/cron/fleet-refresh` | `GET` | `Bearer $CRON_SECRET` | 3 |
| `/api/superadmin/client-updates` | `GET`/`POST`/`PATCH` | `verifySaSession()` | 4 |
| `/api/superadmin/upgrade-plan` | `POST` | `verifySaSession()` | 5 |
| `/api/superadmin/upgrade-plan/rollback` | `POST` | `verifySaSession()` | 5 |

## Anexo C — Archivos leídos para este análisis

`CLAUDE.md` · `AGENTS.md` · `CONTEXT.md` · `memoria.md` · `Documentacion/sql/tablas.sql` · `Documentacion/indice.md` · `Documentacion/documentos/manual-tecnico-2026-06-28.md` · `app/api/superadmin/{restaurants,restaurants/[id],plans,audit,tickets,revenue,requests,security,discounts}/route.ts` · `app/api/save-flags/route.ts` · `app/api/public/register/route.ts` · `app/api/demo-proxy/route.ts` · `app/superadmin/components/SuperAdmin.tsx` (2.360 líneas) · `lib/{saAuth,supabase,supabaseAdmin,supabasePortales,supabaseMiMenu}.ts` · `package.json` · `.vercel/repo.json` · nombres de claves de `.env.local`

---

> **Siguiente acción concreta:** ejecutar el query de `information_schema` de §1.8 en las tres BDs y regenerar `Documentacion/sql/tablas.sql`. Es la Fase 0 y bloquea todo lo demás.

-- ============================================================
-- Base de datos: mi-superadmindrestaurante (SuperAdmin NICHO)
-- Supabase principal:  zxynrlqubdlrwcfoewdv  (BD principal)
-- Supabase portales:   qmtsetcqnovcahuimkvg  (BD portales)
-- Supabase mi-menu:    proyecto propio (env MIMENU_SUPABASE_URL)
--
-- GENERADO DESDE EL CÓDIGO REAL (app/api/superadmin/*, app/api/save-flags,
-- app/api/public/register) el 2026-08-21 — no editar a mano sin volver a
-- verificar contra las rutas que leen/escriben cada tabla. La versión
-- anterior de este archivo (fecha 2026-07-03) describía columnas que el
-- código nunca usó; ver el hallazgo completo en
-- Documentacion/documentos/plan-multiproducto-y-flota-2026-08-21.md §1.
--
-- Incluye las tablas y columnas agregadas por
-- Documentacion/sql/migraciones/2026-08-21-multiproducto-y-flota.sql
-- ============================================================

-- ── BD PRINCIPAL (zxynrlqubdlrwcfoewdv) ─────────────────────

-- Restaurantes clientes de NICHO
CREATE TABLE IF NOT EXISTS sa_restaurants (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name                 TEXT NOT NULL,
  plan                 TEXT DEFAULT 'trial',   -- id de sa_plans (string, no enum fijo)
  status               TEXT DEFAULT 'active',  -- active | suspended | maintenance
  users                INT DEFAULT 1,
  max_users            INT DEFAULT 3,
  registered_at        TEXT,                   -- texto libre, no fecha tipada
  balance              NUMERIC(10,2) DEFAULT 0,
  next_payment         TEXT DEFAULT '—',       -- texto libre ("—", "Vencida", fecha)
  last_payment         TEXT DEFAULT '—',
  email                TEXT,
  notes                TEXT DEFAULT '',        -- hoy también guarda 'rid:<restaurant_id>' — ver restaurant_id abajo
  api_token             TEXT,                   -- 'nch_live_' + crypto.randomUUID()
  last_active          TEXT,                   -- texto libre o ISO string
  login_count          INT DEFAULT 0,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  -- ── agregado 2026-08-21 (catálogo multi-producto y flota) ──
  restaurant_id        TEXT UNIQUE,            -- id real de la instancia del cliente (antes vivía en notes)
  product_id           TEXT REFERENCES sa_products(id),
  billing_mode         TEXT DEFAULT 'mensual', -- mensual | unico
  subscription_status  TEXT DEFAULT 'activa',  -- trial | activa | vencida | suspendida | cancelada | pagada_unico
  contracted_at        DATE,
  updates_until        DATE,                   -- NULL = ilimitado
  support_until        DATE,
  repo_owner           TEXT,
  repo_name            TEXT,
  repo_branch          TEXT DEFAULT 'main',
  repo_url             TEXT,
  deploy_url           TEXT,
  vercel_project_id    TEXT,
  vercel_team_id       TEXT,
  supabase_project_ref TEXT,
  previous_plan        TEXT,
  plan_changed_at      TIMESTAMPTZ
);
-- NOTA: existen columnas legacy documentadas antes (slug, owner_name, owner_phone,
-- feature_flags, updated_at) que NINGÚN endpoint usa hoy. Si existen en la BD real,
-- son vestigiales — confirmar antes de borrarlas.

-- Log de auditoría — todas las acciones del superadmin
CREATE TABLE IF NOT EXISTS sa_audit_log (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_name   TEXT,
  restaurant  TEXT DEFAULT '—',   -- nombre libre, NO es FK ni restaurant_id
  action      TEXT NOT NULL,
  details     TEXT DEFAULT '',   -- string plano, NO es JSONB
  ip          TEXT,
  type        TEXT DEFAULT 'update', -- create | update | delete | access | billing
  ts          TIMESTAMPTZ DEFAULT NOW()
);

-- Descuentos y códigos promocionales
CREATE TABLE IF NOT EXISTS sa_discounts (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code        TEXT UNIQUE NOT NULL,
  discount    NUMERIC(10,2) NOT NULL,
  type        TEXT DEFAULT '%',     -- '%' | '$'  (no "percent"/"fixed")
  max_uses    INT,
  uses        INT DEFAULT 0,
  active      BOOLEAN DEFAULT TRUE,
  note        TEXT DEFAULT '',
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Catálogo de planes (id = mismo string que sa_restaurants.plan)
CREATE TABLE IF NOT EXISTS sa_plans (
  id            TEXT PRIMARY KEY,        -- ej. 'trial', 'basic', 'premium', 'mimenu-mensual'...
  name          TEXT NOT NULL,
  price         NUMERIC(10,2) NOT NULL,
  trial_days    INT DEFAULT 0,
  max_users     INT DEFAULT 3,
  color         TEXT DEFAULT '#00e676',
  features      TEXT DEFAULT '[]',       -- JSON.stringify([{text, included}]) — TEXT, no JSONB
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  -- ── agregado 2026-08-21 (catálogo multi-producto) ──
  product_id              TEXT REFERENCES sa_products(id),
  billing_mode            TEXT DEFAULT 'mensual' CHECK (billing_mode IN ('mensual','unico')),
  setup_fee               NUMERIC(10,2) DEFAULT 0,
  incluye_actualizaciones BOOLEAN DEFAULT FALSE,
  meses_actualizaciones   INT DEFAULT 0,   -- 0 = ilimitado mientras esté activo
  incluye_soporte         BOOLEAN DEFAULT TRUE,
  meses_soporte           INT DEFAULT 0,
  currency                TEXT DEFAULT 'MXN',
  active                  BOOLEAN DEFAULT TRUE,
  legacy                  BOOLEAN DEFAULT FALSE,
  sort_order              SMALLINT DEFAULT 0
);

-- Solicitudes de acceso a features (pendientes de aprobación del super admin)
CREATE TABLE IF NOT EXISTS sa_requests (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_name  TEXT,
  requested_by     TEXT,
  feature          TEXT,
  reason           TEXT,
  status           TEXT DEFAULT 'pending', -- pending | approved | rejected
  reject_reason    TEXT,
  ts               TIMESTAMPTZ DEFAULT NOW()
);

-- Configuración de seguridad POR RESTAURANTE (no es un log de eventos)
CREATE TABLE IF NOT EXISTS sa_security (
  restaurant_id      TEXT UNIQUE NOT NULL,  -- upsert onConflict: 'restaurant_id'
  session_hours      INT DEFAULT 8,
  pin_required       BOOLEAN DEFAULT FALSE,
  allowed_start      TEXT,
  allowed_end        TEXT,
  max_failed_logins  INT DEFAULT 5,
  ip_whitelist       BOOLEAN DEFAULT FALSE
);

-- Tickets de soporte recibidos desde los restaurantes
CREATE TABLE IF NOT EXISTS sa_tickets (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id    TEXT,
  restaurant_name  TEXT,
  from_name   TEXT,
  from_role   TEXT,
  message     TEXT NOT NULL,
  status      TEXT DEFAULT 'open', -- open | in_progress | resolved
  read        BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
-- source ('main'|'portales') NO es columna — se calcula en memoria al fusionar
-- los resultados de ambas BDs en app/api/superadmin/tickets/route.ts.

-- Configuración global (feature_flags por restaurante, etc.)
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
-- Claves confirmadas: feature_flags, feature_flags_resta3, feature_flags_portales,
--   feature_flags_mimenu, feature_flags_micard,
--   employee_permissions, user_permissions,
--   employee_permissions_portales, user_permissions_portales

-- ── agregado 2026-08-21: catálogo de productos, flota y parches ──
-- (definiciones completas en Documentacion/sql/migraciones/2026-08-21-multiproducto-y-flota.sql)
CREATE TABLE IF NOT EXISTS sa_products (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, tagline TEXT DEFAULT '', tier SMALLINT NOT NULL,
  color TEXT DEFAULT '#00e676', repo_base_owner TEXT DEFAULT 'Segundo715', repo_base_name TEXT,
  repo_base_branch TEXT DEFAULT 'main', flags_settings_key TEXT, supabase_project_ref TEXT,
  health_path TEXT DEFAULT '/', active BOOLEAN DEFAULT TRUE, sort_order SMALLINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sa_fleet_status (
  restaurant_pk UUID PRIMARY KEY REFERENCES sa_restaurants(id) ON DELETE CASCADE,
  product_id TEXT, checked_at TIMESTAMPTZ DEFAULT NOW(),
  http_status INT, http_ok BOOLEAN, http_latency_ms INT, http_error TEXT,
  vercel_state TEXT, vercel_deploy_id TEXT, vercel_deploy_at TIMESTAMPTZ, vercel_deploy_sha TEXT, vercel_error TEXT,
  repo_head_sha TEXT, repo_head_at TIMESTAMPTZ, base_head_sha TEXT, commits_behind INT, commits_ahead INT, github_error TEXT,
  health TEXT DEFAULT 'unknown', health_reason TEXT
);

CREATE TABLE IF NOT EXISTS sa_client_updates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_pk UUID REFERENCES sa_restaurants(id) ON DELETE SET NULL,
  restaurant_id TEXT, restaurant_name TEXT, product_id TEXT,
  commit_hash TEXT, commit_message TEXT, base_commit_hash TEXT, version_label TEXT,
  descripcion TEXT, tipo TEXT DEFAULT 'fix', resultado TEXT DEFAULT 'pendiente',
  deploy_id TEXT, deploy_url TEXT, error_detail TEXT,
  aplicado_por TEXT, aplicado_at TIMESTAMPTZ DEFAULT NOW(), verificado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sa_migrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_pk UUID REFERENCES sa_restaurants(id) ON DELETE SET NULL,
  restaurant_id TEXT, from_plan TEXT, to_plan TEXT, from_product TEXT, to_product TEXT,
  direction TEXT, status TEXT DEFAULT 'running', steps TEXT DEFAULT '[]',
  payload_before TEXT, warnings TEXT DEFAULT '[]', applied_by TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(), finished_at TIMESTAMPTZ
);
-- Único parcial: como mucho una migración 'running' por restaurante (evita doble-click / doble pestaña).
-- CREATE UNIQUE INDEX sa_migrations_running_uidx ON sa_migrations (restaurant_pk) WHERE status = 'running';

-- ── BD PORTALES (qmtsetcqnovcahuimkvg) ──────────────────────
-- Mismas tablas sa_tickets y settings pero en la BD de portales.
-- Usadas por supabasePortales en: api/save-flags, api/superadmin/tickets, api/superadmin/revenue

-- ── BD MI-MENU (proyecto propio, env MIMENU_SUPABASE_URL/MIMENU_SERVICE_KEY) ──
-- Usada por supabaseMiMenu en: api/save-flags (sufijo de clave '_mimenu').
-- Esquema interno de mi-menu (menu_items, categorías, etc.) NO confirmado desde
-- este repo — requiere inspeccionar el repo hermano mi-menu.

-- ============================================================
-- Base de datos: mi-superadmindrestaurante (SuperAdmin NICHO)
-- Supabase principal:  zxynrlqubdlrwcfoewdv  (BD principal)
-- Supabase portales:   qmtsetcqnovcahuimkvg  (BD portales)
-- Actualizado: 2026-07-03
-- ============================================================

-- ── BD PRINCIPAL (zxynrlqubdlrwcfoewdv) ─────────────────────

-- Restaurantes clientes de NICHO
CREATE TABLE IF NOT EXISTS sa_restaurants (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE,
  plan          TEXT DEFAULT 'basic',
  status        TEXT DEFAULT 'active',
  balance       NUMERIC(10,2) DEFAULT 0,
  owner_name    TEXT,
  owner_email   TEXT,
  owner_phone   TEXT,
  feature_flags JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
-- status: active | suspended | cancelled
-- plan: basic | pro | enterprise

-- Log de auditoría — todas las acciones del superadmin
CREATE TABLE IF NOT EXISTS sa_audit_log (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id TEXT,
  admin         TEXT,
  action        TEXT NOT NULL,
  details       JSONB DEFAULT '{}',
  ip            TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Descuentos y códigos promocionales
CREATE TABLE IF NOT EXISTS sa_discounts (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code          TEXT UNIQUE NOT NULL,
  value         NUMERIC(10,2) NOT NULL,
  type          TEXT DEFAULT 'percent',
  max_uses      INT,
  uses          INT DEFAULT 0,
  active        BOOLEAN DEFAULT TRUE,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
-- type: percent | fixed

-- Planes de suscripción
CREATE TABLE IF NOT EXISTS sa_plans (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name          TEXT NOT NULL,
  price         NUMERIC(10,2) NOT NULL,
  billing       TEXT DEFAULT 'monthly',
  features      JSONB DEFAULT '[]',
  active        BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
-- billing: monthly | yearly

-- Solicitudes de los restaurantes al superadmin
CREATE TABLE IF NOT EXISTS sa_requests (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  type          TEXT NOT NULL,
  message       TEXT,
  status        TEXT DEFAULT 'pending',
  resolved_by   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
-- type: upgrade | support | billing | feature
-- status: pending | in_progress | resolved | rejected

-- Registro de seguridad — intentos de login, accesos sospechosos
CREATE TABLE IF NOT EXISTS sa_security (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event         TEXT NOT NULL,
  ip            TEXT,
  user_agent    TEXT,
  details       JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
-- event: login_ok | login_fail | session_expired | suspicious

-- Tickets de soporte recibidos desde los restaurantes
CREATE TABLE IF NOT EXISTS sa_tickets (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id TEXT,
  from_name     TEXT,
  from_role     TEXT,
  message       TEXT NOT NULL,
  status        TEXT DEFAULT 'open',
  source        TEXT DEFAULT 'main',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
-- status: open | in_progress | resolved
-- source: main | portales

-- Configuración global (feature_flags por restaurante, etc.)
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
-- Claves: feature_flags_<restaurant_id>, employee_permissions_<restaurant_id>
--         feature_flags_portales, feature_flags_resta3

-- ── BD PORTALES (qmtsetcqnovcahuimkvg) ──────────────────────
-- Mismas tablas sa_tickets y settings pero en la BD de portales.
-- Usadas por supabasePortales en: api/save-flags, api/superadmin/tickets, api/superadmin/revenue

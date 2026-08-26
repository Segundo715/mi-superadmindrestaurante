-- ============================================================
-- Migración: catálogo multi-producto (mi-card / mi-menu / mi-proyecto),
--            historial de parches y monitoreo de flota
-- Fecha: 2026-08-21
-- BD: PRINCIPAL (zxynrlqubdlrwcfoewdv) — correr en el SQL Editor de Supabase
-- Idempotente: se puede correr más de una vez sin duplicar datos ni fallar.
--
-- Referencia de diseño completo:
--   Documentacion/documentos/plan-multiproducto-y-flota-2026-08-21.md
--
-- Orden de ejecución: de arriba hacia abajo, tal cual está. Al final hay un
-- bloque de verificación (SELECT) para revisar el resultado antes de probar
-- la app.
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. Catálogo de productos
-- ────────────────────────────────────────────────────────────
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
  ('mi-card',     'mi-card',          'Solo cartas digitales',                  1, '#f59e0b', 'mi-card',     'feature_flags_micard', 1),
  ('mi-menu',     'mi-menu',          'Menú digital + cartas',                  2, '#6366f1', 'mi-menu',     'feature_flags_mimenu', 2),
  ('mi-proyecto', 'Plataforma NICHO', 'Menú, pedidos, empleados, fidelización', 3, '#00e676', 'mi-proyecto', 'feature_flags',        3)
ON CONFLICT (id) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 2. sa_plans: producto × modalidad de pago
-- ────────────────────────────────────────────────────────────
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

-- Planes legacy (trial/basic/premium): se asignan a mi-proyecto.
-- trial se conserva activo porque public/register/route.ts lo usa como default.
-- basic/premium quedan inactivos para venta pero siguen resolviendo para clientes existentes.
UPDATE sa_plans
   SET product_id = 'mi-proyecto', billing_mode = 'mensual',
       legacy = TRUE, active = FALSE, incluye_actualizaciones = TRUE
 WHERE id IN ('basic', 'premium');

UPDATE sa_plans
   SET product_id = 'mi-proyecto', billing_mode = 'mensual',
       legacy = FALSE, active = TRUE, incluye_actualizaciones = TRUE
 WHERE id = 'trial';

-- Los 6 planes nuevos. PRECIOS PLACEHOLDER — confirmar con negocio antes de vender.
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

-- ────────────────────────────────────────────────────────────
-- 3. sa_restaurants: producto, suscripción e infraestructura por cliente
-- ────────────────────────────────────────────────────────────
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

CREATE UNIQUE INDEX IF NOT EXISTS sa_restaurants_rid_uidx
  ON sa_restaurants (restaurant_id)
  WHERE restaurant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS sa_restaurants_product_idx   ON sa_restaurants (product_id);
CREATE INDEX IF NOT EXISTS sa_restaurants_substatus_idx ON sa_restaurants (subscription_status);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sa_restaurants_product_fk') THEN
    ALTER TABLE sa_restaurants
      ADD CONSTRAINT sa_restaurants_product_fk
      FOREIGN KEY (product_id) REFERENCES sa_products(id);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 4. sa_fleet_status: una fila por restaurante, la reescribe el cron
-- ────────────────────────────────────────────────────────────
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

-- ────────────────────────────────────────────────────────────
-- 5. sa_client_updates: historial append-only de parches por cliente
-- ────────────────────────────────────────────────────────────
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

-- ────────────────────────────────────────────────────────────
-- 6. sa_migrations: rastro de cada cambio de plan/producto (upgrade/downgrade)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sa_migrations (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_pk   UUID REFERENCES sa_restaurants(id) ON DELETE SET NULL,
  restaurant_id   TEXT,
  from_plan       TEXT,
  to_plan         TEXT,
  from_product    TEXT,
  to_product      TEXT,
  direction       TEXT,
  status          TEXT DEFAULT 'running',
  steps           TEXT DEFAULT '[]',
  payload_before  TEXT,
  warnings        TEXT DEFAULT '[]',
  applied_by      TEXT,
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  finished_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS sa_migrations_rest_idx   ON sa_migrations (restaurant_pk, started_at DESC);
CREATE INDEX IF NOT EXISTS sa_migrations_status_idx ON sa_migrations (status);

-- Impide dos migraciones 'running' simultáneas para el mismo restaurante a nivel de BD —
-- el SELECT-then-INSERT en el endpoint por sí solo es una condición de carrera ante doble-click
-- o dos pestañas confirmando a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS sa_migrations_running_uidx
  ON sa_migrations (restaurant_pk)
  WHERE status = 'running';

COMMIT;

-- ============================================================
-- VERIFICACIÓN — correr después del COMMIT y revisar a ojo
-- ============================================================

-- Catálogo de planes: deben aparecer 6 activos + trial (activo) + basic/premium (legacy, inactivos)
SELECT id, name, product_id, billing_mode, price, incluye_actualizaciones, active, legacy
  FROM sa_plans ORDER BY sort_order, id;

-- Restaurantes existentes: revisar que product_id no quede NULL
SELECT id, name, restaurant_id, product_id, subscription_status, plan
  FROM sa_restaurants ORDER BY created_at DESC;

-- Restaurantes que quedaron SIN restaurant_id tras el backfill — resolver a mano
SELECT id, name, notes FROM sa_restaurants WHERE restaurant_id IS NULL;

-- Confirmar que las tablas nuevas existen y están vacías (primera corrida)
SELECT 'sa_products' AS tabla, count(*) FROM sa_products
UNION ALL SELECT 'sa_fleet_status', count(*) FROM sa_fleet_status
UNION ALL SELECT 'sa_client_updates', count(*) FROM sa_client_updates
UNION ALL SELECT 'sa_migrations', count(*) FROM sa_migrations;

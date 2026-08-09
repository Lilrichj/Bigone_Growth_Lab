-- BigOne Growth Lab — Database Schema
-- Run this once to initialize all tables, indexes, triggers, and default settings.

-- ─── ORDERS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id                SERIAL PRIMARY KEY,
  internal_id       VARCHAR(20)  UNIQUE NOT NULL,
  paystack_ref      VARCHAR(100) UNIQUE NOT NULL,
  service_id        VARCHAR(60),
  service_name      VARCHAR(100),
  platform          VARCHAR(30),
  link              TEXT,
  quantity          INTEGER,
  email             VARCHAR(255),
  amount            INTEGER,          -- kobo/pesewas (integer GHS × 100)
  currency          VARCHAR(10)  DEFAULT 'GHS',
  usd_amount        NUMERIC(10,4),
  status            VARCHAR(30)  DEFAULT 'pending',
  smmwiz_order_id   VARCHAR(50),
  exo_error         TEXT,
  email_sent        BOOLEAN      DEFAULT FALSE,
  estimated_delivery VARCHAR(50),
  created_at        TIMESTAMPTZ  DEFAULT NOW(),
  fulfilled_at      TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_internal_id  ON orders(internal_id);
CREATE INDEX IF NOT EXISTS idx_orders_paystack_ref ON orders(paystack_ref);
CREATE INDEX IF NOT EXISTS idx_orders_email        ON orders(email);
CREATE INDEX IF NOT EXISTS idx_orders_status       ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at   ON orders(created_at DESC);

-- ─── SERVICE MAP ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_map (
  id                      SERIAL PRIMARY KEY,
  internal_key            VARCHAR(60)    UNIQUE NOT NULL,
  smmwiz_id               INTEGER        UNIQUE,
  name                    VARCHAR(150),
  platform                VARCHAR(30),
  category                VARCHAR(30),
  min_quantity            INTEGER,
  max_quantity            INTEGER,
  smmwiz_price_per_1000   NUMERIC(10,6),
  markup_multiplier       NUMERIC(5,2)   DEFAULT 1.45,
  is_active               BOOLEAN        DEFAULT TRUE,
  display_order           INTEGER        DEFAULT 0,
  created_at              TIMESTAMPTZ    DEFAULT NOW(),
  updated_at              TIMESTAMPTZ    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_map_platform  ON service_map(platform);
CREATE INDEX IF NOT EXISTS idx_service_map_is_active ON service_map(is_active);
CREATE INDEX IF NOT EXISTS idx_service_map_smmwiz_id ON service_map(smmwiz_id);

-- ─── SETTINGS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key        VARCHAR(100) PRIMARY KEY,
  value      TEXT         NOT NULL,
  updated_at TIMESTAMPTZ  DEFAULT NOW()
);

INSERT INTO settings (key, value) VALUES
  ('usd_to_ghs_rate',        '15.5'),
  ('site_name',              'BigOne Growth Lab'),
  ('whatsapp_number',        ''),
  ('low_balance_threshold',  '10'),
  ('last_price_sync',        ''),
  ('price_sync_alerts',      '')
ON CONFLICT (key) DO NOTHING;

-- ─── ADMIN USERS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(50) UNIQUE NOT NULL,
  password_hash TEXT        NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── ADMIN SESSIONS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_sessions (
  id         VARCHAR(64) PRIMARY KEY,
  admin_id   INTEGER     NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '8 hours')
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions(expires_at);

-- ─── ADMIN AUDIT LOG ────────────────────────────────────────────────────────
-- Record of irreversible/destructive admin actions: who, from where, when.
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id         SERIAL PRIMARY KEY,
  admin_id   INTEGER      REFERENCES admin_users(id) ON DELETE SET NULL,
  action     VARCHAR(100) NOT NULL,
  details    TEXT,
  ip_address VARCHAR(64),
  created_at TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON admin_audit_log(created_at DESC);

-- ─── RATE LIMITS (optional pg-backed store) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS rate_limits (
  key    VARCHAR(255) PRIMARY KEY,
  points INTEGER      DEFAULT 0,
  expire TIMESTAMPTZ
);

-- ─── updated_at TRIGGER — orders ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orders_updated_at ON orders;
CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_service_map_updated_at ON service_map;
CREATE TRIGGER trg_service_map_updated_at
  BEFORE UPDATE ON service_map
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

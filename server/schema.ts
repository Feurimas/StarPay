// Phase 1 schema: accounts, sessions, workspaces, memberships, invitations, audit.
// Applied idempotently on server start. Later phases append their own tables.
export const SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text NOT NULL,
  password_hash text NOT NULL,
  email_verified_at timestamptz,
  phone text,
  country text,
  locale text NOT NULL DEFAULT 'en',
  timezone text NOT NULL DEFAULT 'UTC',
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (lower(email));

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  user_agent text,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);

CREATE TABLE IF NOT EXISTS email_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('verify','reset')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  legal_name text,
  business_type text,
  country text NOT NULL,
  region text,
  address_line1 text,
  address_line2 text,
  city text,
  postal_code text,
  phone text,
  website text,
  support_email text,
  timezone text NOT NULL DEFAULT 'UTC',
  locale text NOT NULL DEFAULT 'en',
  date_format text NOT NULL DEFAULT 'auto',
  number_format text NOT NULL DEFAULT 'auto',
  display_currency text NOT NULL DEFAULT 'USD',
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS memberships (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','admin','manager','support','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS memberships_user_idx ON memberships (user_id);

CREATE TABLE IF NOT EXISTS invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin','manager','support','viewer')),
  token_hash text NOT NULL UNIQUE,
  invited_by uuid REFERENCES users(id),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invitations_workspace_idx ON invitations (workspace_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id bigserial PRIMARY KEY,
  workspace_id uuid,
  user_id uuid,
  action text NOT NULL,
  target_type text,
  target_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_workspace_idx ON audit_logs (workspace_id, created_at DESC);

-- Development-only mailbox. Used only while EMAIL_MODE=dev (no mail provider configured).
CREATE TABLE IF NOT EXISTS dev_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  action_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE dev_outbox ADD COLUMN IF NOT EXISTS client_key text;
CREATE INDEX IF NOT EXISTS dev_outbox_to_idx ON dev_outbox (lower(to_email), created_at DESC);

CREATE TABLE IF NOT EXISTS contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  topic text NOT NULL,
  message text NOT NULL,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Jurisdiction controls. Starter list only: it needs legal review before real use.
CREATE TABLE IF NOT EXISTS restricted_countries (
  code text PRIMARY KEY,
  reason text NOT NULL
);
INSERT INTO restricted_countries (code, reason) VALUES
  ('CU', 'Comprehensive sanctions program (starter list, pending legal review)'),
  ('IR', 'Comprehensive sanctions program (starter list, pending legal review)'),
  ('KP', 'Comprehensive sanctions program (starter list, pending legal review)'),
  ('SY', 'Comprehensive sanctions program (starter list, pending legal review)')
ON CONFLICT (code) DO NOTHING;
-- ===== Phase 2: commerce =====
-- All money is stored as integer USDC base units (6 decimals) in bigint columns.
CREATE TABLE IF NOT EXISTS workspace_counters (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  kind text NOT NULL,
  value bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace_id, kind)
);

CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS categories_name_unique ON categories (workspace_id, lower(name));

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  price_units bigint NOT NULL CHECK (price_units >= 0),
  sku text,
  track_inventory boolean NOT NULL DEFAULT false,
  stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS products_workspace_idx ON products (workspace_id, status);

CREATE TABLE IF NOT EXISTS product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  content_type text NOT NULL,
  data bytea NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS product_images_product_idx ON product_images (product_id, position);

CREATE TABLE IF NOT EXISTS storefronts (
  workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  tagline text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  published boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  country text,
  address_line1 text,
  address_line2 text,
  city text,
  region text,
  postal_code text,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS customers_email_unique ON customers (workspace_id, lower(email));

CREATE TABLE IF NOT EXISTS discounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  code text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('percent','fixed')),
  value bigint NOT NULL CHECK (value > 0),
  min_subtotal_units bigint NOT NULL DEFAULT 0,
  max_uses integer,
  used_count integer NOT NULL DEFAULT 0,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS discounts_code_unique ON discounts (workspace_id, upper(code));

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  public_id text NOT NULL UNIQUE,
  number bigint NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  ship_to jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','fulfilled','cancelled')),
  -- Only the verified-payment flow (Phase 3) may move this away from 'unpaid'.
  payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','paid','refunded')),
  subtotal_units bigint NOT NULL,
  discount_units bigint NOT NULL DEFAULT 0,
  total_units bigint NOT NULL,
  discount_code text,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, number)
);
CREATE INDEX IF NOT EXISTS orders_workspace_idx ON orders (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  name text NOT NULL,
  unit_price_units bigint NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  line_total_units bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items (order_id);

CREATE TABLE IF NOT EXISTS order_events (
  id bigserial PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind text NOT NULL,
  detail text NOT NULL DEFAULT '',
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_events_order_idx ON order_events (order_id, created_at);

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  public_id text NOT NULL UNIQUE,
  number text NOT NULL,
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','void')),
  amount_units bigint NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz NOT NULL,
  UNIQUE (workspace_id, number)
);
-- ===== Phase 3: Arc USDC payments =====
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS payout_address text;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS payout_verified_at timestamptz;

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  -- 0x + 64 hex: the unique payment reference committed onchain with the payment.
  invoice_ref text NOT NULL UNIQUE,
  merchant_address text NOT NULL,
  amount_units bigint NOT NULL CHECK (amount_units > 0),
  chain_id integer NOT NULL,
  router_address text NOT NULL,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','pending','confirmed')),
  payer_address text,
  tx_hash text,
  block_number bigint,
  confirmed_at timestamptz,
  start_block bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payments_workspace_idx ON payments (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS payment_txs (
  tx_hash text NOT NULL,
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('submitted','confirmed','reverted','rejected')),
  detail text NOT NULL DEFAULT '',
  payer_address text,
  block_number bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  checked_at timestamptz,
  PRIMARY KEY (payment_id, tx_hash)
);
-- Older databases keyed rows by hash alone, which let anyone block a genuine payment by submitting its hash to another order first.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'payment_txs'::regclass AND contype = 'p' AND array_length(conkey, 1) = 1) THEN
    ALTER TABLE payment_txs DROP CONSTRAINT payment_txs_pkey;
    ALTER TABLE payment_txs ADD PRIMARY KEY (payment_id, tx_hash);
  END IF;
END $$;
-- A hash can confirm at most one order, ever.
CREATE UNIQUE INDEX IF NOT EXISTS payment_txs_confirmed_once ON payment_txs (tx_hash) WHERE status = 'confirmed';
CREATE INDEX IF NOT EXISTS payment_txs_payment_idx ON payment_txs (payment_id);
CREATE INDEX IF NOT EXISTS payment_txs_status_idx ON payment_txs (status);

-- ===== Phase 4: knowledge, assistant, support, workflows, notifications =====
CREATE TABLE IF NOT EXISTS knowledge_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  kind text NOT NULL DEFAULT 'faq' CHECK (kind IN ('faq','policy','note')),
  visibility text NOT NULL DEFAULT 'internal' CHECK (visibility IN ('public','internal')),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  search tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(body,''))) STORED
);
CREATE INDEX IF NOT EXISTS knowledge_ws_idx ON knowledge_docs (workspace_id);
CREATE INDEX IF NOT EXISTS knowledge_search_idx ON knowledge_docs USING gin (search);

CREATE TABLE IF NOT EXISTS ai_settings (
  workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  instructions text NOT NULL DEFAULT '',
  auto_reply boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'New conversation',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_conv_idx ON ai_conversations (workspace_id, user_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_msg_idx ON ai_messages (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS support_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  public_id text NOT NULL UNIQUE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  subject text NOT NULL,
  channel text NOT NULL DEFAULT 'storefront',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  assigned_to uuid REFERENCES users(id) ON DELETE SET NULL,
  tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_conv_idx ON support_conversations (workspace_id, status, updated_at DESC);
CREATE TABLE IF NOT EXISTS support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES support_conversations(id) ON DELETE CASCADE,
  sender text NOT NULL CHECK (sender IN ('customer','agent','ai')),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_msg_idx ON support_messages (conversation_id, created_at);
CREATE TABLE IF NOT EXISTS support_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES support_conversations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  body text NOT NULL,
  ai_generated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  trigger text NOT NULL,
  graph jsonb NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workflows_ws_idx ON workflows (workspace_id, trigger);
CREATE TABLE IF NOT EXISTS workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('manual','event','schedule')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','succeeded','failed')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  started_by uuid REFERENCES users(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS workflow_runs_idx ON workflow_runs (workflow_id, started_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_idx ON notifications (workspace_id, created_at DESC);
`

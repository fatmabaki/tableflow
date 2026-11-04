CREATE TABLE restaurant_tables (
  id          SERIAL PRIMARY KEY,
  number      INTEGER NOT NULL UNIQUE CHECK (number > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE menu_items (
  id           TEXT PRIMARY KEY,
  category_id  TEXT NOT NULL REFERENCES categories(id),
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  price_cents  INTEGER NOT NULL CHECK (price_cents >= 0),
  emoji        TEXT NOT NULL DEFAULT '',
  hue          INTEGER NOT NULL DEFAULT 0,
  tags         TEXT[] NOT NULL DEFAULT '{}',
  options      JSONB NOT NULL DEFAULT '[]',
  available    BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX menu_items_category_idx ON menu_items(category_id);

CREATE SEQUENCE order_number_seq START 101;

CREATE TABLE orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number          INTEGER NOT NULL UNIQUE DEFAULT nextval('order_number_seq'),
  table_id        INTEGER NOT NULL REFERENCES restaurant_tables(id),
  customer_name   TEXT NOT NULL DEFAULT '',
  customer_email  TEXT,
  status          TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','preparing','ready','served')),
  payment_method  TEXT NOT NULL CHECK (payment_method IN ('pay_at_table','simulated_online')),
  payment_status  TEXT NOT NULL CHECK (payment_status IN ('unpaid','paid_simulated')),
  subtotal_cents  INTEGER NOT NULL,
  tax_cents       INTEGER NOT NULL,
  total_cents     INTEGER NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX orders_table_idx ON orders(table_id, created_at DESC);
CREATE INDEX orders_status_idx ON orders(status);

CREATE TABLE order_items (
  id                BIGSERIAL PRIMARY KEY,
  order_id          UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id      TEXT NOT NULL REFERENCES menu_items(id),
  name              TEXT NOT NULL,
  emoji             TEXT NOT NULL DEFAULT '',
  qty               INTEGER NOT NULL CHECK (qty BETWEEN 1 AND 20),
  unit_price_cents  INTEGER NOT NULL,
  mods              TEXT NOT NULL DEFAULT '',
  note              TEXT NOT NULL DEFAULT '',
  line_total_cents  INTEGER NOT NULL
);
CREATE INDEX order_items_order_idx ON order_items(order_id);

-- SIMULATED payments only. Never store card numbers, expiry dates or CVCs.
CREATE TABLE payments (
  id            BIGSERIAL PRIMARY KEY,
  order_id      UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL DEFAULT 'simulated' CHECK (provider = 'simulated'),
  status        TEXT NOT NULL CHECK (status IN ('paid_simulated')),
  amount_cents  INTEGER NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE email_jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email         TEXT NOT NULL,
  subject          TEXT NOT NULL,
  html             TEXT NOT NULL,
  text_body        TEXT NOT NULL DEFAULT '',
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  attempts         INTEGER NOT NULL DEFAULT 0,
  max_attempts     INTEGER NOT NULL DEFAULT 4,
  next_attempt_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error       TEXT,
  provider_id      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at          TIMESTAMPTZ
);
CREATE INDEX email_jobs_due_idx ON email_jobs(next_attempt_at) WHERE status = 'pending';

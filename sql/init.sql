-- Bulk Mail Server 初期スキーマ
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'operator',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sending_domains (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain          TEXT NOT NULL UNIQUE,
  from_email      TEXT NOT NULL,
  spf_ok          BOOLEAN NOT NULL DEFAULT false,
  dkim_ok         BOOLEAN NOT NULL DEFAULT false,
  dmarc_ok        BOOLEAN NOT NULL DEFAULT false,
  reverse_dns_ok  BOOLEAN NOT NULL DEFAULT false,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recipient_lists (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recipients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id         UUID REFERENCES recipient_lists(id) ON DELETE SET NULL,
  email           TEXT NOT NULL,
  name            TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  unsubscribed_at TIMESTAMPTZ,
  suppressed_at   TIMESTAMPTZ,
  suppress_reason TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_recipients_email ON recipients(email);
CREATE INDEX IF NOT EXISTS idx_recipients_unsub ON recipients(unsubscribed_at);

CREATE TABLE IF NOT EXISTS campaigns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  subject         TEXT NOT NULL,
  html_body       TEXT NOT NULL,
  text_body       TEXT,
  from_email      TEXT NOT NULL,
  reply_to        TEXT,
  list_id         UUID REFERENCES recipient_lists(id),
  domain_id       UUID REFERENCES sending_domains(id),
  status          TEXT NOT NULL DEFAULT 'draft',
  scheduled_at    TIMESTAMPTZ,
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  recipient_id    UUID NOT NULL REFERENCES recipients(id),
  to_email        TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'queued',
  provider_msg_id TEXT,
  error           TEXT,
  queued_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at         TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  opened_at       TIMESTAMPTZ,
  clicked_at      TIMESTAMPTZ,
  bounced_at      TIMESTAMPTZ,
  complained_at   TIMESTAMPTZ,
  unsubscribed_at TIMESTAMPTZ,
  UNIQUE (campaign_id, recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_messages_campaign ON messages(campaign_id);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);

CREATE TABLE IF NOT EXISTS delivery_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  UUID REFERENCES messages(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,
  payload     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_events_type ON delivery_events(event_type);
CREATE INDEX IF NOT EXISTS idx_delivery_events_created ON delivery_events(created_at);

CREATE TABLE IF NOT EXISTS unsubscribes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL,
  campaign_id UUID REFERENCES campaigns(id),
  message_id  UUID REFERENCES messages(id),
  reason      TEXT,
  source      TEXT NOT NULL DEFAULT 'link',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unsubscribes_email ON unsubscribes(email);

CREATE TABLE IF NOT EXISTS bounces (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL,
  message_id  UUID REFERENCES messages(id),
  bounce_type TEXT NOT NULL DEFAULT 'hard',
  diagnostic  TEXT,
  raw         TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS complaints (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL,
  message_id  UUID REFERENCES messages(id),
  feedback_type TEXT,
  raw         TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reputation_snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id       UUID REFERENCES sending_domains(id),
  window_hours    INT NOT NULL DEFAULT 24,
  sent_count      INT NOT NULL DEFAULT 0,
  delivered_count INT NOT NULL DEFAULT 0,
  bounce_count    INT NOT NULL DEFAULT 0,
  complaint_count INT NOT NULL DEFAULT 0,
  open_count      INT NOT NULL DEFAULT 0,
  click_count     INT NOT NULL DEFAULT 0,
  bounce_rate     NUMERIC(8,6) NOT NULL DEFAULT 0,
  complaint_rate  NUMERIC(8,6) NOT NULL DEFAULT 0,
  open_rate       NUMERIC(8,6) NOT NULL DEFAULT 0,
  click_rate      NUMERIC(8,6) NOT NULL DEFAULT 0,
  delivery_rate   NUMERIC(8,6) NOT NULL DEFAULT 0,
  score           NUMERIC(5,2) NOT NULL DEFAULT 100,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS blacklist_checks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target      TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT 'ip',
  provider    TEXT NOT NULL,
  listed      BOOLEAN NOT NULL DEFAULT false,
  details     TEXT,
  checked_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blacklist_checked ON blacklist_checks(checked_at);

-- デモ用オペレーター（password: admin1234 / bcrypt は API 起動時に upsert も可）
INSERT INTO users (email, password_hash, name, role)
VALUES (
  'admin@example.local',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
  'Admin',
  'admin'
) ON CONFLICT (email) DO NOTHING;

INSERT INTO sending_domains (domain, from_email, spf_ok, reverse_dns_ok, notes)
VALUES ('example.local', 'noreply@example.local', false, false, '開発用ドメイン。本番前に SPF/DKIM/DMARC/rDNS を整備すること')
ON CONFLICT (domain) DO NOTHING;

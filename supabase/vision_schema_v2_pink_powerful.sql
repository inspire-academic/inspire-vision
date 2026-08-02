-- ============================================
-- INSPIRE VISION — v2: Pink & Powerful registrations
-- Run this in Supabase SQL Editor (after vision_schema.sql)
-- Project: Inspire Ecosystem (ygtsrdwoikqnrbexjrtl)
-- ============================================
-- Table lives in the `vision` schema, not `public` — every other public
-- campaign-registration table in this repo (vision.subscribers,
-- vision.registrations, vision.partners) already lives here, so this
-- follows that convention rather than the `public.pink_powerful_...`
-- name suggested when this migration was first scoped.
--
-- Unlike vision.registrations (which grants SELECT to any authenticated
-- user — fine for a low-sensitivity newsletter-style lead), this table
-- holds PII tied to a health/breast-cancer-awareness event plus an
-- organiser workflow (status, internal_notes, assigned_to). That is
-- closer in sensitivity to mentorship.mentor_applications /
-- mentor_safeguarding_checks, so it follows their stricter model
-- instead: no SELECT/UPDATE/DELETE policy for anon or authenticated at
-- all, and a column-level INSERT grant (same technique as
-- mentorship_schema_v8_guardian_consent_column_fix.sql) so
-- internal_notes/assigned_to/status/contacted_at/confirmed_at can never
-- be set by a public submitter even if a future policy is written
-- loosely. Organiser reads/writes go through a service-role Netlify
-- Function (admin-pink-powerful.js) gated by the same
-- requireAdmin()/ADMIN_EMAILS allowlist already used by the mentorship
-- admin-*.js functions (netlify/functions/_lib/adminAuth.js) — reusing
-- that model rather than inventing a new one.
-- ============================================

CREATE TABLE IF NOT EXISTS vision.pink_powerful_registrations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  full_name             text NOT NULL
                          CHECK (char_length(trim(full_name)) BETWEEN 2 AND 120),

  email                 text NOT NULL
                          CHECK (char_length(email) <= 254 AND position('@' in email) > 1),

  phone                 text
                          CHECK (phone IS NULL OR char_length(phone) <= 40),

  postcode_or_location  text NOT NULL
                          CHECK (char_length(trim(postcode_or_location)) BETWEEN 2 AND 100),

  interest              text NOT NULL
                          CHECK (interest IN (
                            'attending', 'survivor-story', 'volunteering',
                            'healthcare-partner', 'sponsorship',
                            'community-partner', 'updates', 'other'
                          )),

  marketing_consent     boolean NOT NULL DEFAULT false,
  privacy_consent       boolean NOT NULL DEFAULT false,

  -- Pinned to this event via both DEFAULT and CHECK. anon/authenticated
  -- are never granted INSERT on these two columns (see GRANT below), so
  -- in practice they can only ever hold the default — the CHECK is
  -- belt-and-braces in case that grant is ever loosened.
  event_slug            text NOT NULL DEFAULT 'pink-powerful-2026'
                          CHECK (event_slug = 'pink-powerful-2026'),
  event_date            date NOT NULL DEFAULT DATE '2026-10-18'
                          CHECK (event_date = DATE '2026-10-18'),

  source_page           text,

  status                text NOT NULL DEFAULT 'new'
                          CHECK (status IN ('new', 'contacted', 'confirmed', 'declined', 'duplicate', 'archived')),

  -- Organiser-only fields. Never granted to anon/authenticated (see GRANT
  -- below) — only service-role (admin-pink-powerful.js) can write these.
  internal_notes        text,
  assigned_to           uuid REFERENCES auth.users(id),
  contacted_at          timestamptz,
  confirmed_at          timestamptz,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pink_powerful_registrations_created_at_idx
  ON vision.pink_powerful_registrations (created_at DESC);
CREATE INDEX IF NOT EXISTS pink_powerful_registrations_status_idx
  ON vision.pink_powerful_registrations (status);
CREATE INDEX IF NOT EXISTS pink_powerful_registrations_event_slug_idx
  ON vision.pink_powerful_registrations (event_slug);
CREATE INDEX IF NOT EXISTS pink_powerful_registrations_email_idx
  ON vision.pink_powerful_registrations (lower(email));

-- ============================================
-- Duplicate handling — flag, don't block
-- ============================================
-- anon has no SELECT grant on this table (see below), so the public form
-- cannot pre-check "does this email already exist" itself. Doing the
-- check here, in a BEFORE INSERT trigger, keeps that lookup entirely
-- server-side: SECURITY DEFINER lets it read existing rows to compare
-- against, while the public policy below still never grants anon read
-- access to any row's contents. A second household member registering
-- with a shared email is not blocked — the row is still saved — it is
-- just flagged 'duplicate' for organiser review instead of 'new'.
CREATE OR REPLACE FUNCTION vision.pink_powerful_flag_duplicate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vision, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM vision.pink_powerful_registrations
    WHERE lower(email) = lower(NEW.email)
      AND event_slug = NEW.event_slug
  ) THEN
    NEW.status := 'duplicate';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pink_powerful_registrations_flag_duplicate ON vision.pink_powerful_registrations;
CREATE TRIGGER pink_powerful_registrations_flag_duplicate
  BEFORE INSERT ON vision.pink_powerful_registrations
  FOR EACH ROW EXECUTE FUNCTION vision.pink_powerful_flag_duplicate();

-- ============================================
-- RLS
-- ============================================
ALTER TABLE vision.pink_powerful_registrations ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA vision TO anon, authenticated;

-- Column-level INSERT grant — the public form (and any other
-- anon/authenticated caller) can only ever populate these columns.
-- event_slug/event_date/status/internal_notes/assigned_to/contacted_at/
-- confirmed_at/id/created_at/updated_at are not in this list, so
-- PostgREST rejects any insert attempt that references them, regardless
-- of what the RLS policy below allows.
GRANT INSERT (
  full_name, email, phone, postcode_or_location, interest,
  marketing_consent, privacy_consent, source_page
) ON vision.pink_powerful_registrations TO anon, authenticated;

DROP POLICY IF EXISTS "Public may submit a Pink and Powerful registration" ON vision.pink_powerful_registrations;
CREATE POLICY "Public may submit a Pink and Powerful registration"
  ON vision.pink_powerful_registrations FOR INSERT
  TO anon, authenticated
  WITH CHECK (privacy_consent = true);

-- Deliberately no SELECT, UPDATE, or DELETE policy for anon or
-- authenticated — organisers read and act on registrations only through
-- admin-pink-powerful.js (service-role, gated by requireAdmin() /
-- ADMIN_EMAILS), never directly against this table from the browser.

-- PostgREST caches grants and schema shape.
NOTIFY pgrst, 'reload schema';

-- ============================================
-- Confirm setup
-- ============================================
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'vision' AND table_name = 'pink_powerful_registrations';

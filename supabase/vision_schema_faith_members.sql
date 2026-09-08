-- ============================================
-- INSPIRE VISION — Faith Member Accounts (Sign In / Prayer Requests)
-- Run this in Supabase SQL Editor
-- Project: Inspire Ecosystem (ygtsrdwoikqnrbexjrtl)
-- ============================================
-- Faith members sign up/in through the same Supabase Auth used by
-- Mentorship (shared `auth.users`, same anon key via assets/supabase.js)
-- but are tagged via `user_metadata.faith_member = true` instead of
-- Mentorship's `mentorship_role` — see faith/join.html. A visitor could
-- in principle hold both a mentorship_role and faith_member; nothing
-- here depends on them being mutually exclusive.
--
-- Learned from vision_schema_faith_content.sql's own security fix: a
-- broad `USING (true)` policy for `authenticated` would let any signed-in
-- account (any mentee, mentor, or Faith member) read or write every
-- other user's rows, since they all share one Postgres role. Every
-- policy below is scoped to `auth.uid() = user_id` specifically to
-- avoid repeating that mistake.
-- ============================================

CREATE TABLE IF NOT EXISTS vision.prayer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_text text NOT NULL,
  is_answered boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vision.prayer_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prayer_requests_own_select" ON vision.prayer_requests;
CREATE POLICY "prayer_requests_own_select" ON vision.prayer_requests FOR SELECT
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "prayer_requests_own_insert" ON vision.prayer_requests;
CREATE POLICY "prayer_requests_own_insert" ON vision.prayer_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "prayer_requests_own_update" ON vision.prayer_requests;
CREATE POLICY "prayer_requests_own_update" ON vision.prayer_requests FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "prayer_requests_own_delete" ON vision.prayer_requests;
CREATE POLICY "prayer_requests_own_delete" ON vision.prayer_requests FOR DELETE
  USING (auth.uid() = user_id);

REVOKE ALL ON vision.prayer_requests FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON vision.prayer_requests TO authenticated;

-- updated_at bump — mirrors the pattern already used elsewhere in this
-- project (e.g. mentorship_schema's own touch triggers) rather than
-- trusting the client to set it.
CREATE OR REPLACE FUNCTION vision.touch_prayer_request()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_prayer_request ON vision.prayer_requests;
CREATE TRIGGER trg_touch_prayer_request
  BEFORE UPDATE ON vision.prayer_requests
  FOR EACH ROW EXECUTE FUNCTION vision.touch_prayer_request();

NOTIFY pgrst, 'reload schema';

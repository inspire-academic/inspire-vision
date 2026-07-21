-- ============================================
-- INSPIRE MENTORSHIP — Schema additions, batch 3
-- Run this in Supabase SQL Editor (after mentorship_schema.sql and
-- mentorship_schema_v2.sql)
-- Project: Inspire Ecosystem (ygtsrdwoikqnrbexjrtl)
-- ============================================
-- Adds mentor_assignments and session_notes — the mentor-portal build
-- needed a real mentor<->mentee pairing mechanism, which didn't exist
-- anywhere before this. Kept as a separate file for the same reason
-- as v2: no IF NOT EXISTS on the earlier CREATE TABLEs.
--
-- Made idempotent 2026-07-12 (Slice 0 staging bootstrap): a submission
-- with multiple ;-separated statements runs as one implicit
-- transaction — if anything later in the file errors, Postgres rolls
-- back statements that already succeeded earlier in the same
-- submission, including CREATE TABLE. Without IF NOT EXISTS/DROP...IF
-- EXISTS guards, a retry after any such failure would then fail
-- immediately on "already exists" for whatever had survived. This
-- version uses CREATE TABLE IF NOT EXISTS (never drops a table, so it
-- can never destroy real data — safe even if mistakenly pointed at a
-- database that already has these tables populated) plus DROP POLICY
-- IF EXISTS / CREATE INDEX IF NOT EXISTS for everything else, the same
-- pattern already used in mentorship_schema_v3_fix_session_notes_rls.sql.
-- ============================================

-- ============================================
-- 8. MENTOR_ASSIGNMENTS
-- Pairs a mentor account with a student account. Only ever written by
-- the admin-matching Netlify Function (service role) — there is
-- deliberately no INSERT/UPDATE policy for anon/authenticated, so a
-- mentor can never self-assign to a mentee. Both sides can read their
-- own assignment rows.
--
-- mentor_name/student_name are denormalized at assignment time (the
-- admin function already has to look both accounts up via the Admin
-- API to build the picker list, so it captures the names then) rather
-- than requiring every portal page read to also hit a service-role
-- function just to resolve a name — a plain RLS-scoped SELECT is
-- enough for mentor-portal and the mentee side to show who's paired
-- with whom.
-- ============================================
CREATE TABLE IF NOT EXISTS mentorship.mentor_assignments (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  mentor_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mentor_name   text NOT NULL,
  student_name  text NOT NULL,
  status        text NOT NULL DEFAULT 'active', -- 'active' | 'ended'
  assigned_at   timestamptz DEFAULT now(),
  ended_at      timestamptz
);

-- One active mentor per student at a time.
CREATE UNIQUE INDEX IF NOT EXISTS mentor_assignments_one_active_per_student
  ON mentorship.mentor_assignments (student_id)
  WHERE status = 'active';

ALTER TABLE mentorship.mentor_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Mentors see their own assignments" ON mentorship.mentor_assignments;
CREATE POLICY "Mentors see their own assignments"
  ON mentorship.mentor_assignments FOR SELECT
  USING (auth.uid() = mentor_id);

DROP POLICY IF EXISTS "Students see their own assignments" ON mentorship.mentor_assignments;
CREATE POLICY "Students see their own assignments"
  ON mentorship.mentor_assignments FOR SELECT
  USING (auth.uid() = student_id);

-- No write policy for anon/authenticated on purpose — assignments are
-- only ever created/ended by the service-role admin-matching function.


-- ============================================
-- 9. SESSION_NOTES
-- Private working notes a mentor keeps about a specific mentee —
-- deliberately mentor-only (no student SELECT policy). This mirrors
-- how a counsellor's session notes work: mentors need a private space
-- to record observations and concerns without a mentee reading them
-- back, which is different from goals/check-ins/journal where the
-- mentee is always the owner of their own data.
-- ============================================
CREATE TABLE IF NOT EXISTS mentorship.session_notes (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  mentor_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note          text NOT NULL,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE mentorship.session_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Mentors manage their own session notes" ON mentorship.session_notes;
CREATE POLICY "Mentors manage their own session notes"
  ON mentorship.session_notes FOR ALL
  USING (auth.uid() = mentor_id)
  WITH CHECK (auth.uid() = mentor_id);


-- ============================================
-- Grants on the tables just created
-- ============================================
GRANT ALL ON ALL TABLES IN SCHEMA mentorship TO anon, authenticated;

-- PostgREST caches grants and schema shape — same fix needed the
-- previous two times a table was added.
NOTIFY pgrst, 'reload schema';


-- ============================================
-- Confirm setup
-- ============================================
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'mentorship'
ORDER BY table_name;

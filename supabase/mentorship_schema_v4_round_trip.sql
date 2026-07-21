-- ============================================
-- INSPIRE MENTORSHIP — v4: close the mentor<->student round trip (F-01)
-- Run this in Supabase SQL Editor (after v3 + v3 fixes)
-- Project: Inspire Ecosystem (ygtsrdwoikqnrbexjrtl)
-- ============================================
-- Context: the July 12 assurance audit (docs/mentorship/, docs/assurance/
-- mentorship/) found that no code path let a mentor see anything a student
-- wrote, and no path let mentor output reach a student — confirmed by both
-- static review and live API testing. This migration closes that gap using
-- the mechanism the schema already anticipated rather than inventing a new
-- one:
--
--   - `mentorship.sessions` already has a student-visible `notes` column
--     and a `mentor_id` column (added when mentor-portal accounts didn't
--     exist yet) but had zero mentor-side RLS and zero mentor-portal UI —
--     nothing ever wrote to it. This migration adds the missing mentor
--     policies; a companion UI change lets a mentor actually log/schedule
--     a session, and its `notes` shows up on the student's existing
--     dashboard/mentor.html "Session History" list.
--   - Mentors get read-only access to an assigned student's goals,
--     journal_entries, check_ins, and help_requests — the actual content
--     a mentor needs to see to mentor someone, scoped to a genuinely
--     active mentor_assignments row, same pattern as the v3 session_notes
--     fix.
--   - `mentorship.session_notes` is deliberately NOT touched here. Both
--     its own page copy ("Private — only you can see these", "mentees
--     never see these") and the v3 schema comments describe it as the
--     mentor's private working notes by design — exposing it now would
--     silently break a promise already made to mentors using the feature.
--     If student-visible mentor commentary is wanted beyond `sessions.notes`,
--     that's a new, separate decision — not a retrofit of this table.
--
-- Idempotent throughout (IF NOT EXISTS / DROP POLICY IF EXISTS), matching
-- the v3 convention — safe to re-run.
-- ============================================

-- ============================================
-- 1. mentor_approvals — authoritative, service-role-only mentor status
-- Fixes the follow-up finding in docs/assurance/mentorship/
-- FOLLOWUP-mentor-status-spoofable-picker.md: admin-matching.js's mentor
-- picker filtered on auth.users.user_metadata.mentor_status, which any
-- signed-in account can self-write via PUT /auth/v1/user. This table is
-- the real source of truth going forward — written only by admin-mentors.js
-- (service-role), read only by admin-matching.js (service-role). No RLS
-- policy grants anon/authenticated any access at all; service_role bypasses
-- RLS by default in Supabase, so this table is simply invisible to every
-- client-side code path, by design.
-- ============================================
CREATE TABLE IF NOT EXISTS mentorship.mentor_approvals (
  mentor_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'pending_review', -- 'pending_review' | 'approved' | 'rejected'
  reviewed_by  uuid REFERENCES auth.users(id),
  reviewed_at  timestamptz,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE mentorship.mentor_approvals ENABLE ROW LEVEL SECURITY;
-- Belt-and-braces: no client role can read/write this even if RLS were
-- ever mistakenly disabled, since the schema-wide default-privilege GRANT
-- ALL (mentorship_schema.sql) would otherwise apply to this new table too.
REVOKE ALL ON mentorship.mentor_approvals FROM anon, authenticated;

-- ============================================
-- 2. sessions — mentor-side RLS (student-side policies already exist
-- from mentorship_schema.sql). Lets an actively-assigned mentor create
-- and maintain session records; students already have SELECT.
-- ============================================
DROP POLICY IF EXISTS "Mentors view sessions for assigned students" ON mentorship.sessions;
CREATE POLICY "Mentors view sessions for assigned students"
  ON mentorship.sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM mentorship.mentor_assignments a
      WHERE a.mentor_id = auth.uid() AND a.student_id = sessions.student_id AND a.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Mentors create sessions for assigned students" ON mentorship.sessions;
CREATE POLICY "Mentors create sessions for assigned students"
  ON mentorship.sessions FOR INSERT
  WITH CHECK (
    auth.uid() = mentor_id
    AND EXISTS (
      SELECT 1 FROM mentorship.mentor_assignments a
      WHERE a.mentor_id = auth.uid() AND a.student_id = sessions.student_id AND a.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Mentors update their own logged sessions" ON mentorship.sessions;
CREATE POLICY "Mentors update their own logged sessions"
  ON mentorship.sessions FOR UPDATE
  USING (auth.uid() = mentor_id)
  WITH CHECK (auth.uid() = mentor_id);

-- ============================================
-- 3. Mentor read-access to an assigned student's own content — the
-- actual visibility half of the round trip. Scoped to a genuinely active
-- mentor_assignments row, identical pattern to the v3 session_notes fix.
-- Student-owned FOR ALL policies from schema v1/v2 are untouched; this
-- only adds an additional SELECT grant for the assigned mentor.
-- ============================================
DROP POLICY IF EXISTS "Mentors view assigned students' goals" ON mentorship.goals;
CREATE POLICY "Mentors view assigned students' goals"
  ON mentorship.goals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM mentorship.mentor_assignments a
      WHERE a.mentor_id = auth.uid() AND a.student_id = goals.student_id AND a.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Mentors view assigned students' journal entries" ON mentorship.journal_entries;
CREATE POLICY "Mentors view assigned students' journal entries"
  ON mentorship.journal_entries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM mentorship.mentor_assignments a
      WHERE a.mentor_id = auth.uid() AND a.student_id = journal_entries.student_id AND a.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Mentors view assigned students' check-ins" ON mentorship.check_ins;
CREATE POLICY "Mentors view assigned students' check-ins"
  ON mentorship.check_ins FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM mentorship.mentor_assignments a
      WHERE a.mentor_id = auth.uid() AND a.student_id = check_ins.student_id AND a.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Mentors view assigned students' help requests" ON mentorship.help_requests;
CREATE POLICY "Mentors view assigned students' help requests"
  ON mentorship.help_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM mentorship.mentor_assignments a
      WHERE a.mentor_id = auth.uid() AND a.student_id = help_requests.student_id AND a.status = 'active'
    )
  );

-- PostgREST caches grants and schema shape.
NOTIFY pgrst, 'reload schema';

-- ============================================
-- Confirm setup
-- ============================================
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'mentorship'
  AND (policyname ILIKE '%assigned%' OR policyname ILIKE '%mentor%session%')
ORDER BY tablename, cmd;

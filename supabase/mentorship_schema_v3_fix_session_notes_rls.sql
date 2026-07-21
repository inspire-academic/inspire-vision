-- ============================================
-- INSPIRE MENTORSHIP — Fix for V-01 (Phase 2 Controlled Production
-- Round-Trip Verification, 2026-07-12)
-- Run this in Supabase SQL Editor (after mentorship_schema_v3.sql)
-- Project: Inspire Ecosystem (ygtsrdwoikqnrbexjrtl)
-- ============================================
-- Bug: "Mentors manage their own session notes" (mentorship_schema_v3.sql)
-- only checked auth.uid() = mentor_id. It never checked that a real,
-- active mentor_assignments row links that mentor to that student. Any
-- authenticated user — mentor, unapproved mentor applicant, or plain
-- student — could INSERT a session_notes row for ANY student_id by
-- setting mentor_id to their own auth.uid(). Confirmed live during
-- Phase 2 testing (2026-07-12): an unassigned, pending_review mentor
-- account, and separately a self-elevated student account, both
-- successfully wrote notes about students they had no relationship
-- with (HTTP 201 both times).
--
-- Fix scope: only INSERT needs the relational check — that's the
-- actual attack surface (creating a note about an arbitrary student).
-- SELECT/UPDATE/DELETE stay scoped to auth.uid() = mentor_id exactly
-- as before, so a mentor keeps normal access to their own
-- already-written notes even if an assignment later ends — this
-- mirrors the original "private working notes" design intent and
-- avoids retroactively hiding legitimate history.
-- ============================================

DROP POLICY IF EXISTS "Mentors manage their own session notes" ON mentorship.session_notes;
DROP POLICY IF EXISTS "Mentors view their own session notes" ON mentorship.session_notes;
DROP POLICY IF EXISTS "Mentors create session notes for assigned students only" ON mentorship.session_notes;
DROP POLICY IF EXISTS "Mentors update their own session notes" ON mentorship.session_notes;
DROP POLICY IF EXISTS "Mentors delete their own session notes" ON mentorship.session_notes;

CREATE POLICY "Mentors view their own session notes"
  ON mentorship.session_notes FOR SELECT
  USING (auth.uid() = mentor_id);

CREATE POLICY "Mentors create session notes for assigned students only"
  ON mentorship.session_notes FOR INSERT
  WITH CHECK (
    auth.uid() = mentor_id
    AND EXISTS (
      SELECT 1 FROM mentorship.mentor_assignments a
      WHERE a.mentor_id = session_notes.mentor_id
        AND a.student_id = session_notes.student_id
        AND a.status = 'active'
    )
  );

CREATE POLICY "Mentors update their own session notes"
  ON mentorship.session_notes FOR UPDATE
  USING (auth.uid() = mentor_id)
  WITH CHECK (auth.uid() = mentor_id);

CREATE POLICY "Mentors delete their own session notes"
  ON mentorship.session_notes FOR DELETE
  USING (auth.uid() = mentor_id);

-- PostgREST caches grants and schema shape — same fix needed every
-- previous time a table/policy changed.
NOTIFY pgrst, 'reload schema';

-- ============================================
-- Confirm setup
-- ============================================
SELECT polname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'mentorship' AND tablename = 'session_notes';

-- ============================================
-- INSPIRE MENTORSHIP — v21: Vocation & Life Pathways, Review + mentor notes
-- Run this in Supabase SQL Editor (after v20)
-- Project: Inspire Ecosystem (ygtsrdwoikqnrbexjrtl)
-- ============================================
-- Two tables + one view: the Stage 7 review-cycle history, and the
-- mentor's private-vs-shareable observation mechanism.
--
-- vocation_reviews rows are immutable by design (no UPDATE/DELETE policy
-- for anyone) -- "preserve previous versions rather than overwriting" is
-- implemented as one permanent snapshot row per review cycle, not as
-- per-field versioning.
--
-- vocation_mentor_observations reuses the mentorship.session_notes /
-- mentorship.session_recaps pattern from v17 exactly: the base table has
-- no student SELECT policy at all, and a shared_with_student flag is
-- exposed only through a read-only view whose own WHERE clause is the
-- entire security boundary. "Editing" an observation means inserting a
-- new row with the same thread_id (never UPDATE) -- this gives full,
-- tamper-proof edit history for free, ordered by created_at, without a
-- separate audit table. The parent report (v22) reuses this exact same
-- view/flag for its own filtering -- one flag, two audiences.
--
-- Idempotent throughout -- safe to re-run.
-- ============================================

-- ============================================
-- 1. VOCATION_REVIEWS
-- ============================================
CREATE TABLE IF NOT EXISTS mentorship.vocation_reviews (
  id                          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id                  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  review_type                 text NOT NULL, -- '3_month'|'6_month'|'12_month'|'custom'
  review_date                 date NOT NULL DEFAULT current_date,
  working_statement_snapshot  text,
  stage_snapshot              jsonb,
  hypotheses_snapshot         jsonb,
  mentee_reflection           text,
  mentor_summary              text,
  mentor_id                   uuid REFERENCES auth.users(id),
  created_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vocation_reviews_student_idx
  ON mentorship.vocation_reviews (student_id, review_date DESC);

ALTER TABLE mentorship.vocation_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students create and view own reviews" ON mentorship.vocation_reviews;
CREATE POLICY "Students create and view own reviews"
  ON mentorship.vocation_reviews FOR SELECT
  USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "Students insert own reviews" ON mentorship.vocation_reviews;
CREATE POLICY "Students insert own reviews"
  ON mentorship.vocation_reviews FOR INSERT
  WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "Mentors view assigned students' reviews" ON mentorship.vocation_reviews;
CREATE POLICY "Mentors view assigned students' reviews"
  ON mentorship.vocation_reviews FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM mentorship.mentor_assignments a
      WHERE a.mentor_id = auth.uid() AND a.student_id = vocation_reviews.student_id AND a.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Mentors insert reviews for assigned students" ON mentorship.vocation_reviews;
CREATE POLICY "Mentors insert reviews for assigned students"
  ON mentorship.vocation_reviews FOR INSERT
  WITH CHECK (
    auth.uid() = mentor_id
    AND EXISTS (
      SELECT 1 FROM mentorship.mentor_assignments a
      WHERE a.mentor_id = auth.uid() AND a.student_id = vocation_reviews.student_id AND a.status = 'active'
    )
  );

-- No UPDATE/DELETE policy for anyone -- rows are permanent once written.

-- ============================================
-- 2. VOCATION_MENTOR_OBSERVATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS mentorship.vocation_mentor_observations (
  id                     uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id              uuid NOT NULL DEFAULT gen_random_uuid(),
  mentor_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stage                  text,
  related_hypothesis_id  uuid REFERENCES mentorship.vocation_pathway_hypotheses(id) ON DELETE SET NULL,
  note                   text NOT NULL,
  shared_with_student    boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vocation_mentor_observations_thread_idx
  ON mentorship.vocation_mentor_observations (thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS vocation_mentor_observations_student_idx
  ON mentorship.vocation_mentor_observations (student_id);

ALTER TABLE mentorship.vocation_mentor_observations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Mentors manage their own observations" ON mentorship.vocation_mentor_observations;
CREATE POLICY "Mentors manage their own observations"
  ON mentorship.vocation_mentor_observations FOR ALL
  USING (auth.uid() = mentor_id)
  WITH CHECK (
    auth.uid() = mentor_id
    AND EXISTS (
      SELECT 1 FROM mentorship.mentor_assignments a
      WHERE a.mentor_id = auth.uid() AND a.student_id = vocation_mentor_observations.student_id AND a.status = 'active'
    )
  );

-- No student SELECT policy on the base table at all -- mirrors
-- session_notes exactly. mentorship.vocation_observation_recaps below is
-- the only path a student ever reads this content through.

-- ============================================
-- vocation_observation_recaps -- read-only view, the entire security
-- boundary for what a mentee (and, via v22, a parent) ever sees of a
-- mentor's observations. DISTINCT ON (thread_id) ... ORDER BY created_at
-- DESC returns only the latest version of each observation thread.
-- ============================================
CREATE OR REPLACE VIEW mentorship.vocation_observation_recaps AS
SELECT DISTINCT ON (thread_id)
  id, thread_id, student_id, mentor_id, stage, related_hypothesis_id, note, created_at
FROM mentorship.vocation_mentor_observations
WHERE shared_with_student = true AND student_id = auth.uid()
ORDER BY thread_id, created_at DESC;

GRANT SELECT ON mentorship.vocation_observation_recaps TO authenticated;

-- ============================================
-- Grants
-- ============================================
GRANT ALL ON mentorship.vocation_reviews TO anon, authenticated, service_role;
GRANT ALL ON mentorship.vocation_mentor_observations TO anon, authenticated, service_role;

-- PostgREST caches grants and schema shape.
NOTIFY pgrst, 'reload schema';

-- ============================================
-- Confirm setup
-- ============================================
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'mentorship'
  AND tablename IN ('vocation_reviews', 'vocation_mentor_observations')
ORDER BY tablename, cmd;

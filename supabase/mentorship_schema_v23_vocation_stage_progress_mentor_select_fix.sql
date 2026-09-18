-- ============================================
-- INSPIRE MENTORSHIP — v23: fix missing mentor SELECT policy on
-- vocation_stage_progress
-- Run this in Supabase SQL Editor (after v22)
-- Project: Inspire Ecosystem (ygtsrdwoikqnrbexjrtl)
-- ============================================
-- v18 gave assigned mentors a FOR UPDATE policy on
-- mentorship.vocation_stage_progress (so "Mark Reviewed"/"Send Back to
-- Revise"/"Mark Complete" on mentor-portal/vocation-review.html can
-- write) but never added the matching FOR SELECT policy that every
-- sibling vocation_* table got in v18-v21 (evidence_items, reflections,
-- external_nominees, working_statement, career_reactions, conversations,
-- workplace_exposures, experiments, pathway_hypotheses, pathway_plan,
-- action_plan_items, presentation_prep, reviews all have one).
--
-- Effect of the gap: a mentor's SELECT on vocation_stage_progress for
-- an assigned student silently returns zero rows (RLS default-denies,
-- not an error), so mentor-portal/vocation-review.html always falls
-- back to "Not Started" for all seven stages regardless of what the
-- student actually marked ready — even though the student's own
-- markStageReadyForReview() UPDATE succeeded and their page correctly
-- shows the checkmark. Confirmed live: a mentee saw "Marked Ready for
-- Review ✓" on Explore; the assigned mentor's review page showed
-- every stage, Explore included, as Not Started.
--
-- Idempotent (DROP POLICY IF EXISTS), matching the v3+ convention.
-- ============================================

DROP POLICY IF EXISTS "Mentors view assigned students' stage progress" ON mentorship.vocation_stage_progress;
CREATE POLICY "Mentors view assigned students' stage progress"
  ON mentorship.vocation_stage_progress FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM mentorship.mentor_assignments a
      WHERE a.mentor_id = auth.uid() AND a.student_id = vocation_stage_progress.student_id AND a.status = 'active'
    )
  );

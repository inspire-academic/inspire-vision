-- ============================================
-- INSPIRE MENTORSHIP — REAL-framed Goal Check-Ins (v14)
-- Run this in Supabase SQL Editor (after mentorship_schema_v13...)
-- Project: Inspire Ecosystem (ygtsrdwoikqnrbexjrtl)
-- ============================================
-- From the "Twelve Months" research (professional-coaching thread):
-- MentorcliQ explicitly recommends REAL goals (Relevant, Experimental,
-- Aspirational, Learning-based) over SMART for developmental/character
-- mentoring — rigid "Measurable" targets distort goals like "grow in
-- resilience." dashboard/goals.html currently has no way to update
-- progress at all except jumping straight to 100% via "Mark Complete" —
-- this adds a real, lightweight check-in mechanism: three qualitative
-- stages instead of a numeric slider, each pairs with an optional
-- reflection prompt so "Learning-based" is actually captured, not just
-- implied. progress_pct on mentorship.goals is still updated (Growth
-- Compass and other pages already depend on it) — check-ins are simply
-- a friendlier front door onto the same number.
-- ============================================

CREATE TABLE mentorship.goal_check_ins (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  goal_id       uuid NOT NULL REFERENCES mentorship.goals(id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stage         text NOT NULL, -- 'just_started' | 'making_progress' | 'getting_close'
  reflection    text,          -- optional — "what are you noticing/learning?"
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS goal_check_ins_goal_id_idx ON mentorship.goal_check_ins (goal_id, created_at DESC);

ALTER TABLE mentorship.goal_check_ins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students manage own goal check-ins"
  ON mentorship.goal_check_ins FOR ALL
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);

GRANT ALL ON mentorship.goal_check_ins TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

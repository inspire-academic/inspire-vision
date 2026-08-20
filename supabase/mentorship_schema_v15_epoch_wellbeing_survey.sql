-- ============================================
-- INSPIRE MENTORSHIP — EPOCH Wellbeing Survey (v15)
-- Run this in Supabase SQL Editor (after mentorship_schema_v14...)
-- Project: Inspire Ecosystem (ygtsrdwoikqnrbexjrtl)
-- ============================================
-- From the "Twelve Months" research (evidence-base thread, citing the
-- OJJDP-funded National Mentoring Resource Center's Measurement
-- Guidance Toolkit): Inspire Mentorship tracks plenty of raw activity
-- but has zero validated outcome data — no way to know if the
-- programme is actually moving the needle on a mentee's wellbeing.
--
-- This adds the EPOCH Measure of Adolescent Well-Being (Kern, Benson,
-- Steinberg, & Steinberg, 2016, Psychological Assessment, 28, 586-597),
-- a real, published, validated 20-item instrument across five
-- subscales — Engagement, Perseverance, Optimism, Connectedness,
-- Happiness — developed and tested across 10 studies with 4,480
-- adolescents. Item wording is used verbatim from the published paper
-- (freely hosted by the lead author for research/practice use); do not
-- reword items if this is ever edited, since altering validated item
-- text breaks the instrument's psychometric properties.
--
-- Raw per-item responses are stored (not just computed scores) so
-- scoring can be revisited later without re-administering the survey.
-- ============================================

CREATE TABLE mentorship.epoch_surveys (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wave           text NOT NULL, -- 'intake' | '3_month' | '6_month' | 'other'
  responses      jsonb NOT NULL, -- { "E1": 4, "E2": 5, ... } — all 20 item codes, 1-5 each
  engagement     numeric(3,2) NOT NULL,
  perseverance   numeric(3,2) NOT NULL,
  optimism       numeric(3,2) NOT NULL,
  connectedness  numeric(3,2) NOT NULL,
  happiness      numeric(3,2) NOT NULL,
  overall        numeric(3,2) NOT NULL,
  completed_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS epoch_surveys_student_id_idx ON mentorship.epoch_surveys (student_id, completed_at DESC);

ALTER TABLE mentorship.epoch_surveys ENABLE ROW LEVEL SECURITY;

-- Self-owned only, same as goals/journal_entries — deliberately not
-- mentor-readable (this touches wellbeing/mood territory the same way
-- Journal does), admin sees only aggregate counts/averages via the
-- service-role admin-reports.js function, never individual responses.
CREATE POLICY "Students manage own wellbeing surveys"
  ON mentorship.epoch_surveys FOR ALL
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);

GRANT ALL ON mentorship.epoch_surveys TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

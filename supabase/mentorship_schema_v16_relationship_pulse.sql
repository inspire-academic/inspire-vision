-- ============================================
-- INSPIRE MENTORSHIP — Relationship-Quality Pulse (v16)
-- Run this in Supabase SQL Editor (after mentorship_schema_v15...)
-- Project: Inspire Ecosystem (ygtsrdwoikqnrbexjrtl)
-- ============================================
-- From the "Twelve Months" research: the field's own validated
-- two-sided relationship-quality instrument is the Strength of
-- Relationship scales (Rhodes, Schwartz, Willis, & Wu, 2017, Youth &
-- Society, 49(4), 415-437) — the Mentor SoR (MSoR, 14 items) and Youth
-- SoR (YSoR, 10 items), normed on 5,222 real Big Brothers Big Sisters
-- dyads and shown to predict match duration from as early as 3 months
-- in. Item wording, response scale, subscales, and reverse-scoring are
-- taken verbatim from the published paper's appendix/tables. Do not
-- reword items.
--
-- One row per submission, tied to the specific mentor_assignments row
-- it's about (not just the reporter) so admin can eventually pair
-- mentor/mentee reports on the same relationship without ever exposing
-- either side's individual answers to the other.
-- ============================================

CREATE TABLE mentorship.relationship_pulses (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id  uuid NOT NULL REFERENCES mentorship.mentor_assignments(id) ON DELETE CASCADE,
  reporter       text NOT NULL, -- 'mentee' | 'mentor'
  reporter_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  responses      jsonb NOT NULL,
  -- mentee (YSoR): subscale_1 = Positive, subscale_2 = Negative (reverse-scored)
  -- mentor (MSoR): subscale_1 = Affective, subscale_2 = Logistic
  subscale_1     numeric(3,2) NOT NULL,
  subscale_2     numeric(3,2) NOT NULL,
  overall        numeric(3,2) NOT NULL,
  completed_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS relationship_pulses_assignment_idx ON mentorship.relationship_pulses (assignment_id, reporter, completed_at DESC);

ALTER TABLE mentorship.relationship_pulses ENABLE ROW LEVEL SECURITY;

-- Same pattern as messages/session_notes: a reporter can only write a
-- pulse for an assignment they're genuinely part of, as themselves —
-- and, deliberately, can only ever see their OWN submissions, never
-- the other side's. Cross-visibility would change what people are
-- willing to answer honestly, and this is meant to feed admin
-- aggregate/early-warning signals, not a shared scoreboard.
CREATE POLICY "Reporters manage own relationship pulses"
  ON mentorship.relationship_pulses FOR ALL
  USING (
    auth.uid() = reporter_id
    AND EXISTS (
      SELECT 1 FROM mentorship.mentor_assignments a
      WHERE a.id = assignment_id AND (a.mentor_id = auth.uid() OR a.student_id = auth.uid())
    )
  )
  WITH CHECK (
    auth.uid() = reporter_id
    AND EXISTS (
      SELECT 1 FROM mentorship.mentor_assignments a
      WHERE a.id = assignment_id AND (a.mentor_id = auth.uid() OR a.student_id = auth.uid())
    )
  );

GRANT ALL ON mentorship.relationship_pulses TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

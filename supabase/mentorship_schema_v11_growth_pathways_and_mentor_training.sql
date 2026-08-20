-- ============================================
-- INSPIRE MENTORSHIP — Growth Pathways + Mentor Training (v11)
-- Run this in Supabase SQL Editor (after mentorship_schema_v10_messages.sql)
-- Project: Inspire Ecosystem (ygtsrdwoikqnrbexjrtl)
-- ============================================
-- Two new tables, both progress-only — the pilot Character Pathway (6
-- lessons) and the 4 mentor training modules are hardcoded content in
-- dashboard/pathways.html and mentor-onboarding/training.html
-- respectively (same pattern as resources.html's hardcoded cards), not
-- rows in a table. Only completion state is real data here.
--
-- mentor_training_progress is also what admin-mentors.js's approve
-- action now checks before letting mentor_status become 'approved' —
-- see REQUIRED_TRAINING_MODULE_SLUGS in that file, which must stay in
-- sync with the module slugs in mentor-onboarding/training.html.
-- ============================================

CREATE TABLE mentorship.pathway_progress (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pathway_slug  text NOT NULL,   -- 'character' for the pilot
  lesson_slug   text NOT NULL,   -- e.g. 'character-02-integrity'
  reflection    text,            -- optional — a low-friction prompt, not required to complete
  completed_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, lesson_slug)
);

CREATE TABLE mentorship.mentor_training_progress (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  mentor_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_slug   text NOT NULL,   -- e.g. 'safeguarding-basics'
  completed_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mentor_id, module_slug)
);

ALTER TABLE mentorship.pathway_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE mentorship.mentor_training_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students manage own pathway progress"
  ON mentorship.pathway_progress FOR ALL
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Mentors manage own training progress"
  ON mentorship.mentor_training_progress FOR ALL
  USING (auth.uid() = mentor_id)
  WITH CHECK (auth.uid() = mentor_id);

-- admin-mentors.js reads mentor_training_progress with the service-role
-- key to enforce the approval gate server-side — same reasoning as
-- mentorship_schema_v3_fix_grants.sql: service_role needs an explicit
-- grant, RLS bypass alone isn't the same as a schema/table GRANT.
GRANT ALL ON mentorship.pathway_progress, mentorship.mentor_training_progress
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

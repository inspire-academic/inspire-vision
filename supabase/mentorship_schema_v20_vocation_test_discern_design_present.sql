-- ============================================
-- INSPIRE MENTORSHIP — v20: Vocation & Life Pathways, Test/Discern/Design/Present
-- Run this in Supabase SQL Editor (after v19)
-- Project: Inspire Ecosystem (ygtsrdwoikqnrbexjrtl)
-- ============================================
-- Seven tables backing Stage 3 (Test), Stage 4 (Discern), Stage 5
-- (Design) and Stage 6 (Present). All seven use the same mentee-own +
-- mentor-assigned-SELECT policy pair already established in v18/v19.
--
-- Privacy note: vocation_conversations/vocation_workplace_exposures
-- deliberately have no name/contact/email/employer-identity field --
-- only a role/type description -- per the brief's data-minimisation
-- requirement for third parties who are never themselves Inspire users.
--
-- Idempotent throughout -- safe to re-run.
-- ============================================

-- ============================================
-- 1. VOCATION_CONVERSATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS mentorship.vocation_conversations (
  id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  person_role          text NOT NULL, -- e.g. "Electrical Engineer, family friend" -- no name/contact stored
  prep_notes           text,
  questions_asked      text,
  key_takeaways        text,
  changed_my_thinking  text,
  conversation_date    date,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mentorship.vocation_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students manage own conversations" ON mentorship.vocation_conversations;
CREATE POLICY "Students manage own conversations"
  ON mentorship.vocation_conversations FOR ALL
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "Mentors view assigned students' conversations" ON mentorship.vocation_conversations;
CREATE POLICY "Mentors view assigned students' conversations"
  ON mentorship.vocation_conversations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM mentorship.mentor_assignments a
      WHERE a.mentor_id = auth.uid() AND a.student_id = vocation_conversations.student_id AND a.status = 'active'
    )
  );

-- ============================================
-- 2. VOCATION_WORKPLACE_EXPOSURES
-- ============================================
CREATE TABLE IF NOT EXISTS mentorship.vocation_workplace_exposures (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exposure_type         text, -- 'visit'|'work_experience'|'shadowing'|'volunteering'|'workshop'|'open_day'|'careers_event'|'virtual'
  organisation_type     text, -- sector/type, not employer identity, e.g. "independent garage"
  activity_description  text,
  duration_text         text,
  what_i_observed       text,
  reflection             text,
  interest_change       text, -- 'increased'|'decreased'|'unchanged'
  exposure_date         date,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mentorship.vocation_workplace_exposures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students manage own workplace exposures" ON mentorship.vocation_workplace_exposures;
CREATE POLICY "Students manage own workplace exposures"
  ON mentorship.vocation_workplace_exposures FOR ALL
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "Mentors view assigned students' workplace exposures" ON mentorship.vocation_workplace_exposures;
CREATE POLICY "Mentors view assigned students' workplace exposures"
  ON mentorship.vocation_workplace_exposures FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM mentorship.mentor_assignments a
      WHERE a.mentor_id = auth.uid() AND a.student_id = vocation_workplace_exposures.student_id AND a.status = 'active'
    )
  );

-- ============================================
-- 3. VOCATION_EXPERIMENTS
-- ============================================
CREATE TABLE IF NOT EXISTS mentorship.vocation_experiments (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hypothesis        text NOT NULL,
  activity          text,
  expected_learning text,
  reflection        text,
  conclusion        text,
  status            text NOT NULL DEFAULT 'planned', -- 'planned'|'in_progress'|'complete'
  started_at        timestamptz,
  completed_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mentorship.vocation_experiments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students manage own experiments" ON mentorship.vocation_experiments;
CREATE POLICY "Students manage own experiments"
  ON mentorship.vocation_experiments FOR ALL
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "Mentors view assigned students' experiments" ON mentorship.vocation_experiments;
CREATE POLICY "Mentors view assigned students' experiments"
  ON mentorship.vocation_experiments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM mentorship.mentor_assignments a
      WHERE a.mentor_id = auth.uid() AND a.student_id = vocation_experiments.student_id AND a.status = 'active'
    )
  );

-- ============================================
-- 4. VOCATION_PATHWAY_HYPOTHESES
-- category is free text, not an enum -- the brief explicitly rejects
-- forcing every mentee into rigid university/trade/entrepreneurial
-- buckets. what_would_change_my_mind is NOT NULL: falsifiable thinking
-- is structurally required here, not an optional nicety.
-- ============================================
CREATE TABLE IF NOT EXISTS mentorship.vocation_pathway_hypotheses (
  id                          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id                  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label                       text NOT NULL,
  category                    text, -- free text, e.g. "university/professional", "technical/apprenticeship", "entrepreneurial" -- or anything else
  why_it_fits                 text,
  concerns                    text,
  what_would_change_my_mind   text NOT NULL,
  status                      text NOT NULL DEFAULT 'active', -- 'active'|'discarded'
  sort_order                  integer NOT NULL DEFAULT 0,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mentorship.vocation_pathway_hypotheses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students manage own pathway hypotheses" ON mentorship.vocation_pathway_hypotheses;
CREATE POLICY "Students manage own pathway hypotheses"
  ON mentorship.vocation_pathway_hypotheses FOR ALL
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "Mentors view assigned students' pathway hypotheses" ON mentorship.vocation_pathway_hypotheses;
CREATE POLICY "Mentors view assigned students' pathway hypotheses"
  ON mentorship.vocation_pathway_hypotheses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM mentorship.mentor_assignments a
      WHERE a.mentor_id = auth.uid() AND a.student_id = vocation_pathway_hypotheses.student_id AND a.status = 'active'
    )
  );

-- ============================================
-- 5. VOCATION_PATHWAY_PLAN
-- ============================================
CREATE TABLE IF NOT EXISTS mentorship.vocation_pathway_plan (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id            uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  preferred_pathway     jsonb NOT NULL DEFAULT '{}'::jsonb,
  alternative_pathway   jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mentorship.vocation_pathway_plan ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students manage own pathway plan" ON mentorship.vocation_pathway_plan;
CREATE POLICY "Students manage own pathway plan"
  ON mentorship.vocation_pathway_plan FOR ALL
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "Mentors view assigned students' pathway plan" ON mentorship.vocation_pathway_plan;
CREATE POLICY "Mentors view assigned students' pathway plan"
  ON mentorship.vocation_pathway_plan FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM mentorship.mentor_assignments a
      WHERE a.mentor_id = auth.uid() AND a.student_id = vocation_pathway_plan.student_id AND a.status = 'active'
    )
  );

-- ============================================
-- 6. VOCATION_ACTION_PLAN_ITEMS
-- target_date (a real date) only makes sense for twelve_month items;
-- target_period_text (e.g. "Year 2", "Age 20-22") is what three_year/
-- five_to_ten_year items use -- broad scenarios, not false precision.
-- ============================================
CREATE TABLE IF NOT EXISTS mentorship.vocation_action_plan_items (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_type           text NOT NULL, -- 'twelve_month'|'three_year'|'five_to_ten_year'
  title               text NOT NULL,
  description         text,
  target_date         date,
  target_period_text  text,
  status              text NOT NULL DEFAULT 'planned', -- 'planned'|'in_progress'|'done'
  sort_order          integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vocation_action_plan_items_student_idx
  ON mentorship.vocation_action_plan_items (student_id, plan_type);

ALTER TABLE mentorship.vocation_action_plan_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students manage own action plan items" ON mentorship.vocation_action_plan_items;
CREATE POLICY "Students manage own action plan items"
  ON mentorship.vocation_action_plan_items FOR ALL
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "Mentors view assigned students' action plan items" ON mentorship.vocation_action_plan_items;
CREATE POLICY "Mentors view assigned students' action plan items"
  ON mentorship.vocation_action_plan_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM mentorship.mentor_assignments a
      WHERE a.mentor_id = auth.uid() AND a.student_id = vocation_action_plan_items.student_id AND a.status = 'active'
    )
  );

-- ============================================
-- 7. VOCATION_PRESENTATION_PREP
-- ============================================
CREATE TABLE IF NOT EXISTS mentorship.vocation_presentation_prep (
  id                        uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id                uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  talking_points            jsonb NOT NULL DEFAULT '[]'::jsonb,
  anticipated_questions     jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_checklist        jsonb NOT NULL DEFAULT '[]'::jsonb,
  included_report_sections  jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at                timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mentorship.vocation_presentation_prep ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students manage own presentation prep" ON mentorship.vocation_presentation_prep;
CREATE POLICY "Students manage own presentation prep"
  ON mentorship.vocation_presentation_prep FOR ALL
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "Mentors view assigned students' presentation prep" ON mentorship.vocation_presentation_prep;
CREATE POLICY "Mentors view assigned students' presentation prep"
  ON mentorship.vocation_presentation_prep FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM mentorship.mentor_assignments a
      WHERE a.mentor_id = auth.uid() AND a.student_id = vocation_presentation_prep.student_id AND a.status = 'active'
    )
  );

-- ============================================
-- Grants
-- ============================================
GRANT ALL ON mentorship.vocation_conversations TO anon, authenticated, service_role;
GRANT ALL ON mentorship.vocation_workplace_exposures TO anon, authenticated, service_role;
GRANT ALL ON mentorship.vocation_experiments TO anon, authenticated, service_role;
GRANT ALL ON mentorship.vocation_pathway_hypotheses TO anon, authenticated, service_role;
GRANT ALL ON mentorship.vocation_pathway_plan TO anon, authenticated, service_role;
GRANT ALL ON mentorship.vocation_action_plan_items TO anon, authenticated, service_role;
GRANT ALL ON mentorship.vocation_presentation_prep TO anon, authenticated, service_role;

-- PostgREST caches grants and schema shape.
NOTIFY pgrst, 'reload schema';

-- ============================================
-- Confirm setup
-- ============================================
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'mentorship'
  AND tablename IN ('vocation_conversations','vocation_workplace_exposures','vocation_experiments',
                     'vocation_pathway_hypotheses','vocation_pathway_plan','vocation_action_plan_items',
                     'vocation_presentation_prep')
ORDER BY tablename, cmd;

-- ============================================
-- INSPIRE MENTORSHIP — v18: Vocation & Life Pathways, core + stage machine
-- Run this in Supabase SQL Editor (after v17)
-- Project: Inspire Ecosystem (ygtsrdwoikqnrbexjrtl)
-- ============================================
-- First of five migrations (v18-v22) for "Inspire Vocation & Life
-- Pathways" — a 7-stage guided vocational-discernment journey
-- (Discover -> Explore -> Test -> Discern -> Design -> Present -> Review)
-- inside Mentorship & Formation. Full architecture in
-- mentorship/Inspire_Vocation_Life_Pathways_UI_Reference_Pack/
-- IMPLEMENTATION_PLAN.md.
--
-- This file: the stage-progress state machine and the cross-stage
-- content tables (evidence, reflections, external nominees, the working
-- vocation statement). v19 = career exploration data. v20 = test/discern/
-- design/present tables. v21 = review cycles + mentor observations
-- (private-vs-shareable). v22 = parent access.
--
-- Idempotent throughout (CREATE TABLE IF NOT EXISTS / DROP POLICY IF
-- EXISTS), matching the v3+ convention -- safe to re-run.
-- ============================================

-- ============================================
-- 1. VOCATION_STAGE_PROGRESS
-- One row per (student, stage). Status is stored, not computed --
-- "ready_for_review" and "mentor_reviewed" are explicit human
-- assertions, not derivable purely from other rows existing.
--
-- Write control is pure RLS, not a trigger -- this schema has no
-- precedent for BEFORE UPDATE triggers on client-writable tables
-- (mentor_assignments/messages instead use RLS + narrow SECURITY
-- DEFINER RPCs for anything needing tighter control than plain
-- ownership, e.g. mark_message_read() in v10). A student's own policy's
-- WITH CHECK simply never permits 'mentor_reviewed'/'complete' as a
-- status value; only the assigned mentor's policy does. mentor_reviewed_by,
-- when set, is tied to the mentor's own auth.uid() by WITH CHECK, so it
-- can't be spoofed to name a different mentor.
--
-- There is no trigger auto-stamping marked_ready_at/mentor_reviewed_at/
-- completed_at -- the calling page sets the relevant timestamp in the
-- same update as the status change (see mentorship/js/vocation-stage.js).
-- ============================================
CREATE TABLE IF NOT EXISTS mentorship.vocation_stage_progress (
  id                 uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stage              text NOT NULL, -- 'discover'|'explore'|'test'|'discern'|'design'|'present'|'review'
  status             text NOT NULL DEFAULT 'not_started', -- 'not_started'|'in_progress'|'ready_for_review'|'mentor_reviewed'|'complete'
  marked_ready_at    timestamptz,
  mentor_reviewed_at timestamptz,
  mentor_reviewed_by uuid REFERENCES auth.users(id),
  completed_at       timestamptz,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, stage)
);

CREATE INDEX IF NOT EXISTS vocation_stage_progress_student_idx
  ON mentorship.vocation_stage_progress (student_id);

ALTER TABLE mentorship.vocation_stage_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students manage own stage progress" ON mentorship.vocation_stage_progress;
CREATE POLICY "Students manage own stage progress"
  ON mentorship.vocation_stage_progress FOR ALL
  USING (auth.uid() = student_id)
  WITH CHECK (
    auth.uid() = student_id
    AND status IN ('not_started', 'in_progress', 'ready_for_review')
  );

DROP POLICY IF EXISTS "Assigned mentors review stage progress" ON mentorship.vocation_stage_progress;
CREATE POLICY "Assigned mentors review stage progress"
  ON mentorship.vocation_stage_progress FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM mentorship.mentor_assignments a
      WHERE a.mentor_id = auth.uid() AND a.student_id = vocation_stage_progress.student_id AND a.status = 'active'
    )
  )
  WITH CHECK (
    (mentor_reviewed_by IS NULL OR mentor_reviewed_by = auth.uid())
    AND EXISTS (
      SELECT 1 FROM mentorship.mentor_assignments a
      WHERE a.mentor_id = auth.uid() AND a.student_id = vocation_stage_progress.student_id AND a.status = 'active'
    )
  );

-- ============================================
-- 2. VOCATION_EVIDENCE_ITEMS
-- Shared evidence table used across Discover 1B (strengths evidence),
-- Test (linked from conversations/exposures/experiments via section_key),
-- and Discern -- one evidence concept, not duplicated per stage.
-- ============================================
CREATE TABLE IF NOT EXISTS mentorship.vocation_evidence_items (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stage          text NOT NULL,
  section_key    text NOT NULL,
  evidence_type  text, -- 'grade'|'project'|'award'|'teacher_comment'|'mentor_observation'|'other'
  title          text NOT NULL,
  description    text,
  evidence_date  date,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vocation_evidence_items_student_idx
  ON mentorship.vocation_evidence_items (student_id, stage);

ALTER TABLE mentorship.vocation_evidence_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students manage own evidence items" ON mentorship.vocation_evidence_items;
CREATE POLICY "Students manage own evidence items"
  ON mentorship.vocation_evidence_items FOR ALL
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "Mentors view assigned students' evidence items" ON mentorship.vocation_evidence_items;
CREATE POLICY "Mentors view assigned students' evidence items"
  ON mentorship.vocation_evidence_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM mentorship.mentor_assignments a
      WHERE a.mentor_id = auth.uid() AND a.student_id = vocation_evidence_items.student_id AND a.status = 'active'
    )
  );

-- ============================================
-- 3. VOCATION_REFLECTIONS
-- Generic autosave content table, one row per (student, section_key).
-- Backs Discover 1A/1D/1E/1F/1G, Discern's calling reflection, and
-- Design's "10-Year Life Conversation" -- these differ in UI, not
-- storage shape, so one jsonb-payload table replaces ~7 conceptually
-- separate submodule tables. section_key values (owned by the frontend,
-- not enumerated here): 'discover.alive', 'discover.values',
-- 'discover.environment', 'discover.hard_things', 'discover.character',
-- 'discern.calling', 'design.ten_year_life'.
-- ============================================
CREATE TABLE IF NOT EXISTS mentorship.vocation_reflections (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  section_key  text NOT NULL,
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, section_key)
);

ALTER TABLE mentorship.vocation_reflections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students manage own reflections" ON mentorship.vocation_reflections;
CREATE POLICY "Students manage own reflections"
  ON mentorship.vocation_reflections FOR ALL
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "Mentors view assigned students' reflections" ON mentorship.vocation_reflections;
CREATE POLICY "Mentors view assigned students' reflections"
  ON mentorship.vocation_reflections FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM mentorship.mentor_assignments a
      WHERE a.mentor_id = auth.uid() AND a.student_id = vocation_reflections.student_id AND a.status = 'active'
    )
  );

-- ============================================
-- 4. VOCATION_EXTERNAL_NOMINEES
-- Discover 1C ("what do other people see in me?"). MVP is self-completed
-- by the mentee after asking a trusted person the questions offline.
-- invite_token/invite_status/external_response are unused by MVP UI --
-- present now so a Phase 2 direct-feedback form (a token-gated public
-- page, same mechanism as the parent report in v22) needs zero
-- migration later.
-- ============================================
CREATE TABLE IF NOT EXISTS mentorship.vocation_external_nominees (
  id                 uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name               text NOT NULL,
  relationship       text NOT NULL, -- 'parent'|'teacher'|'mentor'|'coach'|'youth_leader'|'relative'|'other'
  mentee_summary     text, -- what the mentee heard back, entered by the mentee
  invite_status      text NOT NULL DEFAULT 'not_sent', -- 'not_sent'|'sent'|'responded' (Phase 2)
  invite_token       text UNIQUE,
  external_response  jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mentorship.vocation_external_nominees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students manage own external nominees" ON mentorship.vocation_external_nominees;
CREATE POLICY "Students manage own external nominees"
  ON mentorship.vocation_external_nominees FOR ALL
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "Mentors view assigned students' external nominees" ON mentorship.vocation_external_nominees;
CREATE POLICY "Mentors view assigned students' external nominees"
  ON mentorship.vocation_external_nominees FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM mentorship.mentor_assignments a
      WHERE a.mentor_id = auth.uid() AND a.student_id = vocation_external_nominees.student_id AND a.status = 'active'
    )
  );

-- ============================================
-- 5. VOCATION_WORKING_STATEMENT
-- The editable "Current Working Statement of Vocation" -- one row per
-- student, always editable as the young person matures.
-- ============================================
CREATE TABLE IF NOT EXISTS mentorship.vocation_working_statement (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id   uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  statement    text NOT NULL DEFAULT '',
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mentorship.vocation_working_statement ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students manage own working statement" ON mentorship.vocation_working_statement;
CREATE POLICY "Students manage own working statement"
  ON mentorship.vocation_working_statement FOR ALL
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "Mentors view assigned students' working statement" ON mentorship.vocation_working_statement;
CREATE POLICY "Mentors view assigned students' working statement"
  ON mentorship.vocation_working_statement FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM mentorship.mentor_assignments a
      WHERE a.mentor_id = auth.uid() AND a.student_id = vocation_working_statement.student_id AND a.status = 'active'
    )
  );

-- ============================================
-- Grants -- explicit per-table (the v14+ convention: schema-wide default
-- privileges already exist from mentorship_schema.sql, but every
-- migration since v14 grants explicitly per table anyway, belt-and-braces).
-- ============================================
GRANT ALL ON mentorship.vocation_stage_progress TO anon, authenticated, service_role;
GRANT ALL ON mentorship.vocation_evidence_items TO anon, authenticated, service_role;
GRANT ALL ON mentorship.vocation_reflections TO anon, authenticated, service_role;
GRANT ALL ON mentorship.vocation_external_nominees TO anon, authenticated, service_role;
GRANT ALL ON mentorship.vocation_working_statement TO anon, authenticated, service_role;

-- PostgREST caches grants and schema shape.
NOTIFY pgrst, 'reload schema';

-- ============================================
-- Confirm setup
-- ============================================
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'mentorship' AND tablename LIKE 'vocation_%'
ORDER BY tablename, cmd;

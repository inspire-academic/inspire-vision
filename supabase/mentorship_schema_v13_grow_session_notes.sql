-- ============================================
-- INSPIRE MENTORSHIP — GROW-structured Session Notes (v13)
-- Run this in Supabase SQL Editor (after mentorship_schema_v12...)
-- Project: Inspire Ecosystem (ygtsrdwoikqnrbexjrtl)
-- ============================================
-- From the "Twelve Months" research pass (professional-coaching thread):
-- every platform studied that publishes session-quality guidance builds
-- sessions around a real structure — Sir John Whitmore's GROW model
-- (Goal, Reality, Options, Will) and ICF's core coaching competencies
-- both point the same direction. session_notes.note today is a single
-- blank textarea; this adds four structured fields so a session note is
-- forced to have the same shape every time, instead of whatever a
-- mentor happens to type.
--
-- Additive + one constraint relaxation, no drops: `note` moves from
-- NOT NULL to nullable, since the new form treats the four GROW fields
-- as the required ones and `note` as an optional "anything else" add-on
-- — existing rows (real mentor session history) are untouched either way.
-- ============================================

ALTER TABLE mentorship.session_notes
  ADD COLUMN IF NOT EXISTS session_goal text,
  ADD COLUMN IF NOT EXISTS session_reality text,
  ADD COLUMN IF NOT EXISTS session_options text,
  ADD COLUMN IF NOT EXISTS next_action text,
  ADD COLUMN IF NOT EXISTS next_action_date date;

ALTER TABLE mentorship.session_notes
  ALTER COLUMN note DROP NOT NULL;

NOTIFY pgrst, 'reload schema';

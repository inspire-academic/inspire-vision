-- ============================================
-- INSPIRE MENTORSHIP — Shareable Session Recaps (v17)
-- Run this in Supabase SQL Editor (after mentorship_schema_v16...)
-- Project: Inspire Ecosystem (ygtsrdwoikqnrbexjrtl)
-- ============================================
-- From the "Twelve Months" research: session_notes has always been
-- entirely mentor-private — a mentee never sees what was discussed or
-- agreed on about their own sessions. This adds an optional per-note
-- "share this with the mentee" toggle, deliberately narrow: only the
-- Goal and Next Action (the "Will" from the GROW structure) are ever
-- shared, never Reality/Options/the freeform note, since those are
-- closer to the mentor's private diagnostic thinking than to "what we
-- agreed on."
--
-- Column-level restriction (not just row-level) is enforced by a view
-- rather than relying on the client UI to politely not ask for the
-- other columns — mentorship.session_recaps only ever selects the safe
-- columns, and is owned by the migration role so it can read
-- session_notes directly without needing (and without ever granting) a
-- student SELECT policy on the base table itself. The view's own WHERE
-- clause is the entire security boundary.
-- ============================================

ALTER TABLE mentorship.session_notes
  ADD COLUMN IF NOT EXISTS shared_with_student boolean NOT NULL DEFAULT false;

CREATE OR REPLACE VIEW mentorship.session_recaps AS
SELECT id, student_id, mentor_id, session_goal, next_action, next_action_date, created_at
FROM mentorship.session_notes
WHERE shared_with_student = true AND student_id = auth.uid();

GRANT SELECT ON mentorship.session_recaps TO authenticated;

NOTIFY pgrst, 'reload schema';

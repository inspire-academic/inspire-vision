-- ============================================
-- INSPIRE MENTORSHIP — v9: structured mentor safeguarding-check tracking
-- Run this in Supabase SQL Editor (after v8)
-- Project: Inspire Ecosystem (ygtsrdwoikqnrbexjrtl)
-- ============================================
-- mentors.html has always told applicants "this role... requires a
-- safeguarding review (which may include a background check) before
-- I'm matched with a mentee," but nothing in the schema ever recorded
-- whether that actually happened -- admin-mentors.js's approve/reject
-- only ever set a single status column, with no separate record of the
-- safeguarding step itself. This adds that record.
--
-- Deliberately a separate table, not new columns on mentor_applications
-- -- that table's own SELECT policy lets an applicant read their own
-- row (mentorship_schema_v5_mentor_applications.sql), and internal
-- safeguarding notes about a specific applicant should not be
-- applicant-readable. Column-level REVOKE was tried for exactly this
-- kind of "same table, one column hidden" problem in v7 and silently
-- failed to take effect (see v7's amendment + v8) -- rather than repeat
-- that fragile pattern, this reuses the table-level isolation approach
-- that already worked correctly for mentor_approvals in v4: no RLS
-- policy grants anon/authenticated anything at all, and the table-level
-- REVOKE ALL below is a proven-reliable pattern (unlike column-level
-- REVOKE), so the table is simply invisible to every client-side code
-- path, by design. Only service-role (admin-mentors.js) can read or
-- write it.
--
-- Deliberately NOT a hard gate on approval -- admin-mentors.js's
-- approve/reject actions are unchanged, so an admin can still approve
-- someone whose safeguarding_status is still 'not_started'. Whether to
-- add that gate is a separate, deliberate decision -- this migration
-- only adds visibility/tracking, matching how it was originally raised
-- as a gap ("might be handled off-platform today, worth a decision").
-- ============================================

CREATE TABLE IF NOT EXISTS mentorship.mentor_safeguarding_checks (
  mentor_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'not_started', -- 'not_started' | 'in_progress' | 'passed' | 'failed'
  notes        text, -- internal admin notes only -- never applicant-visible
  checked_by   uuid REFERENCES auth.users(id),
  checked_at   timestamptz,
  updated_at   timestamptz DEFAULT now()
);

ALTER TABLE mentorship.mentor_safeguarding_checks ENABLE ROW LEVEL SECURITY;
-- Belt-and-braces, same reasoning as mentor_approvals in v4: GRANT ALL
-- ON ALL TABLES (mentorship_schema.sql) applies to every new table in
-- this schema by default, so this REVOKE is not optional even with RLS
-- enabled and zero policies defined.
REVOKE ALL ON mentorship.mentor_safeguarding_checks FROM anon, authenticated;

-- PostgREST caches grants and schema shape.
NOTIFY pgrst, 'reload schema';

-- ============================================
-- Confirm setup
-- ============================================
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'mentorship' AND table_name = 'mentor_safeguarding_checks';

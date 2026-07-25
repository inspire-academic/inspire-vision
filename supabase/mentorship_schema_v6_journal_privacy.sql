-- ============================================
-- INSPIRE MENTORSHIP — v6: restore journal privacy
-- Run this in Supabase SQL Editor (after v5)
-- Project: Inspire Ecosystem (ygtsrdwoikqnrbexjrtl)
-- ============================================
-- mentorship_schema_v4_round_trip.sql gave an actively-assigned mentor
-- SELECT on mentorship.journal_entries, on the theory that it was "the
-- actual content a mentor needs to see." But the product's own copy
-- never agreed to that: dashboard/journal.html's meta description, page
-- subtitle, entry placeholder, and empty state all separately promise
-- the student "this is your private space — nobody else can read it" /
-- "only you can see it" — and the same promise is repeated as a selling
-- point on the public marketing pages (index.html, resources.html,
-- parents.html: "a private journal"). Nobody reconciled the RLS change
-- against that existing promise when v4 landed.
--
-- Founder decision 2026-07-25: keep the journal genuinely private
-- rather than rewrite five pages of copy to disclose mentor access.
-- This preserves the product's existing safety model instead of
-- changing it: journal = private reflection space, "Ask for Help" /
-- "Prayer & Support" = the one disclosed channel through which a
-- student is told an adult will see what they write. Mentors keep
-- everything else v4 gave them (goals, check_ins, help_requests,
-- sessions) — this migration touches journal_entries only.
--
-- Idempotent (DROP POLICY IF EXISTS), matching v3/v4/v5 convention —
-- safe to re-run.
-- ============================================

DROP POLICY IF EXISTS "Mentors view assigned students' journal entries" ON mentorship.journal_entries;

-- PostgREST caches grants and schema shape.
NOTIFY pgrst, 'reload schema';

-- ============================================
-- Confirm: should return zero rows for journal_entries — no mentor-side
-- policy of any kind should remain on this table.
-- ============================================
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'mentorship'
  AND tablename = 'journal_entries'
ORDER BY cmd;

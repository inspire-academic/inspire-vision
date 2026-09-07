-- ============================================
-- INSPIRE MENTORSHIP — v23: safeguarding queue reply + case ownership
-- Run this in Supabase SQL Editor (after v22)
-- Project: Inspire Ecosystem (ygtsrdwoikqnrbexjrtl)
-- ============================================
-- Fixes findings from the 2026-09-06/07 cross-functional experience audit
-- (mentor & admin tools review): the safeguarding queue (admin-help-
-- requests.js / admin/safeguarding.html) could mark a help_requests row
-- seen/resolved but had no way to (a) claim a case so two staff don't
-- assume someone else handled it, or (b) reply to the student in-app —
-- a teen who wrote "I'm not safe" got silently marked "Seen" with
-- nothing visible on their end.
--
-- Deliberately a separate table from mentorship.help_requests, not new
-- columns on it — that table's RLS policy is "Students manage own help
-- requests FOR ALL" (mentorship_schema_v2.sql), meaning a student can
-- already UPDATE their own row via the anon/authenticated client. New
-- columns there would be student-writable too (RLS is row-level, not
-- column-level — and this codebase already learned the hard way in v7/
-- v8/v9 that column-level REVOKE silently fails to take effect). A
-- student must be able to READ their own reply/claim state but never
-- WRITE it, which is exactly the table-level isolation pattern v9 used
-- for mentor_safeguarding_checks: no RLS policy grants any write, the
-- REVOKE below removes the schema-wide default GRANT ALL, and only
-- service-role (admin-help-requests.js) can write. SELECT is granted
-- via RLS to the owning student only, so they *can* see a reply land.
-- ============================================

CREATE TABLE IF NOT EXISTS mentorship.help_request_responses (
  request_id      uuid PRIMARY KEY REFERENCES mentorship.help_requests(id) ON DELETE CASCADE,
  student_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- denormalized so the RLS policy below doesn't need a join
  claimed_by      uuid REFERENCES auth.users(id),
  claimed_by_name text,
  claimed_at      timestamptz,
  reply_message   text,
  replied_by      uuid REFERENCES auth.users(id),
  replied_by_name text,
  replied_at      timestamptz,
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE mentorship.help_request_responses ENABLE ROW LEVEL SECURITY;

-- The one and only client-facing capability: a student can read whether
-- their own request has been claimed and/or replied to. No INSERT/
-- UPDATE/DELETE policy exists for anon/authenticated at all — writes
-- only ever happen via admin-help-requests.js using the service-role
-- client, which bypasses RLS entirely.
CREATE POLICY "Students can read their own request's response"
  ON mentorship.help_request_responses FOR SELECT
  USING (auth.uid() = student_id);

-- Belt-and-braces, same reasoning as mentor_safeguarding_checks in v9:
-- GRANT ALL ON ALL TABLES (mentorship_schema.sql) applies to every new
-- table in this schema by default, so this REVOKE is not optional even
-- with RLS enabled — it's what stops a student INSERTing/UPDATEing/
-- DELETEing rows in a table they can otherwise only SELECT from via
-- the policy above.
REVOKE INSERT, UPDATE, DELETE ON mentorship.help_request_responses FROM anon, authenticated;

-- PostgREST caches grants and schema shape.
NOTIFY pgrst, 'reload schema';

-- ============================================
-- Confirm setup
-- ============================================
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'mentorship' AND table_name = 'help_request_responses';

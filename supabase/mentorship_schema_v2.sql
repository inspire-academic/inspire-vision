-- ============================================
-- INSPIRE MENTORSHIP — Schema additions, batch 2
-- Run this in Supabase SQL Editor (after mentorship_schema.sql)
-- Project: Inspire Ecosystem (ygtsrdwoikqnrbexjrtl)
-- ============================================
-- Adds journal_entries and help_requests. Kept as a separate file
-- rather than appended to mentorship_schema.sql because that file's
-- CREATE TABLE statements have no IF NOT EXISTS — re-running the whole
-- thing would error on the four tables that already exist.
-- ============================================

-- ============================================
-- 5. JOURNAL_ENTRIES
-- Private free-text journaling — powers mentorship/dashboard/journal.html.
-- Same shape and RLS pattern as check_ins.
-- ============================================
CREATE TABLE mentorship.journal_entries (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title         text,
  body          text NOT NULL,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE mentorship.journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students manage own journal entries"
  ON mentorship.journal_entries FOR ALL
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);


-- ============================================
-- 6. HELP_REQUESTS
-- Powers "Ask for Help" / "Prayer & Support". Submissions may contain
-- a real disclosure (bullying, mental health, home situation) — this
-- table alone does NOT notify anyone. A Netlify function
-- (netlify/functions/notify-help-request.js) sends an email alert on
-- submission; this table is just the durable record. Only the
-- submitting student can read their own rows — there's no admin/mentor
-- read policy yet because there's no admin panel built to use it from.
-- ============================================
CREATE TABLE mentorship.help_requests (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category      text NOT NULL DEFAULT 'general', -- 'general' | 'prayer' | 'urgent'
  message       text NOT NULL,
  status        text NOT NULL DEFAULT 'new', -- 'new' | 'seen' | 'resolved'
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE mentorship.help_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students manage own help requests"
  ON mentorship.help_requests FOR ALL
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);


-- ============================================
-- 7. community_stats() — powers mentorship/stories.html ("Community")
-- Every other table's RLS is "students see only their own rows" —
-- correct for goals/sessions/tasks/check_ins/journal/help_requests,
-- but it means a plain SELECT can never produce a real cross-student
-- count. This function runs as its OWNER (SECURITY DEFINER), so it
-- can see everyone's rows internally, but it only ever returns
-- aggregate counts — no student_id, no names, no individual rows ever
-- leave this function. That's what makes it safe to grant to anon.
-- ============================================
CREATE OR REPLACE FUNCTION mentorship.community_stats()
RETURNS TABLE(goals_completed_this_week bigint, checkins_this_week bigint, active_students_this_week bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = mentorship, public AS $$
  SELECT
    (SELECT count(*) FROM mentorship.goals WHERE status = 'completed' AND updated_at > now() - interval '7 days'),
    (SELECT count(*) FROM mentorship.check_ins WHERE created_at > now() - interval '7 days'),
    (SELECT count(DISTINCT student_id) FROM mentorship.check_ins WHERE created_at > now() - interval '7 days');
$$;

GRANT EXECUTE ON FUNCTION mentorship.community_stats() TO anon, authenticated;


-- ============================================
-- Grant on the tables just created
-- ============================================
GRANT ALL ON ALL TABLES IN SCHEMA mentorship TO anon, authenticated;

-- PostgREST caches grants and schema shape — this makes the two new
-- tables (and the new function) visible to the Data API immediately
-- instead of waiting for its next automatic refresh (same fix needed
-- the first time around).
NOTIFY pgrst, 'reload schema';


-- ============================================
-- Confirm setup
-- ============================================
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'mentorship'
ORDER BY table_name;

-- ============================================
-- INSPIRE MENTORSHIP — v10: mentor -> mentee nudge messages
-- Run this in Supabase SQL Editor (after v9)
-- Project: Inspire Ecosystem (ygtsrdwoikqnrbexjrtl)
-- ============================================
-- Eric's ask (2026-08-07): now that mentor<->mentee pairing is live, a
-- mentor viewing an assigned mentee's progress (mentee-detail.html) has
-- no way to proactively reach out — e.g. checking in on a book the
-- mentee's goal mentions, or offering help on a stuck task. The closest
-- existing channel, `sessions.notes`, is tied to logging a session and
-- shows only the single latest note with no history or read tracking.
--
-- This adds a dedicated, purpose-built table instead of overloading
-- `sessions`. Same assignment-gated INSERT pattern as session_notes'
-- v3 fix / sessions' v4 policies: a mentor can only message a student
-- they have a genuinely active mentor_assignments row for.
--
-- `read_at` is nullable and only ever set via the mark_message_read()
-- RPC below (SECURITY DEFINER, scoped to auth.uid() = student_id) rather
-- than a direct student UPDATE policy on the table — a blanket student
-- UPDATE policy would also let a mentee silently rewrite the message
-- body itself, which matters here since (unlike goals/check_ins, which
-- are wholly the student's own content) this row is the mentor's record
-- of what they said. Mirrors the existing community_stats() RPC pattern
-- (mentorship_schema_v2.sql) already used elsewhere in this schema.
--
-- Outbound notification: netlify/functions/notify-mentor-message.js
-- emails the mentee via the existing Resend account (no SMS integration
-- exists yet — that's a deliberate follow-up once a phone-number field
-- and an SMS provider are chosen).
--
-- Idempotent throughout, matching the v3+ convention — safe to re-run.
-- ============================================

CREATE TABLE IF NOT EXISTS mentorship.messages (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  mentor_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mentor_name  text NOT NULL, -- denormalized, same convention as mentor_assignments/sessions
  body         text NOT NULL,
  read_at      timestamptz, -- set only via mark_message_read(), never a direct client UPDATE
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE mentorship.messages ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS messages_student_id_idx ON mentorship.messages (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_mentor_id_idx ON mentorship.messages (mentor_id, student_id, created_at DESC);

DROP POLICY IF EXISTS "Mentors view messages they sent" ON mentorship.messages;
CREATE POLICY "Mentors view messages they sent"
  ON mentorship.messages FOR SELECT
  USING (auth.uid() = mentor_id);

DROP POLICY IF EXISTS "Mentors send messages to assigned students only" ON mentorship.messages;
CREATE POLICY "Mentors send messages to assigned students only"
  ON mentorship.messages FOR INSERT
  WITH CHECK (
    auth.uid() = mentor_id
    AND EXISTS (
      SELECT 1 FROM mentorship.mentor_assignments a
      WHERE a.mentor_id = messages.mentor_id
        AND a.student_id = messages.student_id
        AND a.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Students view messages sent to them" ON mentorship.messages;
CREATE POLICY "Students view messages sent to them"
  ON mentorship.messages FOR SELECT
  USING (auth.uid() = student_id);

-- No student INSERT/UPDATE/DELETE policy at all — read receipts go
-- through mark_message_read() below instead. Belt-and-braces against the
-- schema-wide GRANT ALL default (mentorship_schema.sql applies to every
-- new table in this schema unless narrowed), same reasoning used for
-- every prior migration in this file series.
GRANT ALL ON ALL TABLES IN SCHEMA mentorship TO anon, authenticated;

-- ============================================
-- mark_message_read(uuid) — the only way a student can set read_at.
-- SECURITY DEFINER so it can update a row despite there being no student
-- UPDATE policy on mentorship.messages; scoped internally to the
-- caller's own auth.uid() and to a message actually addressed to them,
-- so it can't be used to mark (or infer the existence of) anyone else's
-- messages as read.
-- ============================================
CREATE OR REPLACE FUNCTION mentorship.mark_message_read(message_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = mentorship, pg_temp
AS $$
  UPDATE mentorship.messages
  SET read_at = now()
  WHERE id = message_id
    AND student_id = auth.uid()
    AND read_at IS NULL;
$$;

REVOKE ALL ON FUNCTION mentorship.mark_message_read(uuid) FROM public;
GRANT EXECUTE ON FUNCTION mentorship.mark_message_read(uuid) TO authenticated;

-- PostgREST caches grants and schema shape.
NOTIFY pgrst, 'reload schema';

-- ============================================
-- Confirm setup
-- ============================================
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'mentorship' AND tablename = 'messages';

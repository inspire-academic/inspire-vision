-- ============================================
-- INSPIRE CHILDREN'S SERVICE — Schema v4 (after-class parent emails)
-- Run this in Supabase SQL Editor AFTER v3. Safe to re-run.
-- Project: Inspire Ecosystem (ygtsrdwoikqnrbexjrtl)
--
-- Two small ADDITIVE columns; nothing existing changes.
--
--  sessions.teacher_name      the first name of the teacher who taught the class, chosen by
--                             a church admin when scheduling (or set later). Used in the
--                             after-class email ("Their teacher for today was ..."). Optional:
--                             when empty, that line is simply left out of the email.
--
--  attendance.summary_sent_at when the after-class summary email for this child and class was
--                             sent (or deliberately skipped because the parent opted out).
--                             The scheduled job "claims" a row by setting this before it sends,
--                             so two overlapping runs can never email the same parent twice.
--
-- No RLS or grant changes are needed: both tables already have table-level grants and
-- policies, which cover new columns. A parent could in theory set their own child's
-- summary_sent_at when checking in (which would only suppress an email to themselves), and only
-- a church admin can write sessions.teacher_name (sessions_admin_write).
-- ============================================

ALTER TABLE children_service.sessions
  ADD COLUMN IF NOT EXISTS teacher_name text
  CHECK (teacher_name IS NULL OR char_length(teacher_name) BETWEEN 1 AND 40);

ALTER TABLE children_service.attendance
  ADD COLUMN IF NOT EXISTS summary_sent_at timestamptz;

-- The job looks for check-ins whose summary has not gone out yet, class by class.
CREATE INDEX IF NOT EXISTS attendance_summary_pending_idx
  ON children_service.attendance (session_id)
  WHERE summary_sent_at IS NULL;

NOTIFY pgrst, 'reload schema';

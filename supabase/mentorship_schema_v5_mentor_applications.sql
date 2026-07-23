-- ============================================
-- INSPIRE MENTORSHIP — v5: real mentor_applications table
-- Run this in Supabase SQL Editor (after v4)
-- Project: Inspire Ecosystem (ygtsrdwoikqnrbexjrtl)
-- ============================================
-- admin-mentors.js has carried this comment since Phase 4: "Known
-- scaling limit: pending applications are found by paging through
-- *all* users via listUsers() and filtering client-side, since mentor
-- profiles aren't in a queryable table. Fine while the mentor pipeline
-- is small; if it grows, move mentor applications into their own
-- `mentorship.mentor_applications` table with normal RLS instead."
-- This migration does exactly that.
--
-- It also folds in mentor_approvals (added a few days ago in
-- mentorship_schema_v4_round_trip.sql, to fix the spoofable-picker
-- finding) rather than leaving two overlapping "is this mentor
-- approved" tables around — mentor_applications' own status column
-- covers the full pending -> approved/rejected lifecycle, so
-- mentor_approvals becomes redundant once this exists. It's held
-- essentially no real data yet (days old, low-activity platform), so
-- retiring it now is low-risk; the UPDATE below carries over anything
-- it did record before it's dropped.
-- ============================================

CREATE TABLE IF NOT EXISTS mentorship.mentor_applications (
  mentor_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        text,
  full_name    text,
  motivation   text,
  status       text NOT NULL DEFAULT 'pending_review', -- 'pending_review' | 'approved' | 'rejected'
  reviewed_by  uuid REFERENCES auth.users(id),
  reviewed_at  timestamptz,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE mentorship.mentor_applications ENABLE ROW LEVEL SECURITY;

-- An applicant may create their own row (at signup, mentors.html) and
-- read it back, but can never set or change its own status to anything
-- but the default — WITH CHECK enforces this on INSERT, and there is
-- deliberately no UPDATE/DELETE policy for anon/authenticated at all,
-- so self-approval is impossible even in principle. Only service-role
-- (admin-mentors.js, which bypasses RLS entirely) can change status.
DROP POLICY IF EXISTS "Mentors create their own application" ON mentorship.mentor_applications;
CREATE POLICY "Mentors create their own application"
  ON mentorship.mentor_applications FOR INSERT
  WITH CHECK (auth.uid() = mentor_id AND status = 'pending_review');

DROP POLICY IF EXISTS "Mentors view their own application" ON mentorship.mentor_applications;
CREATE POLICY "Mentors view their own application"
  ON mentorship.mentor_applications FOR SELECT
  USING (auth.uid() = mentor_id);

-- Backfill every mentor application that predates this table — covers
-- both applications never decided on and ones already approved/rejected
-- via the old user_metadata-only flow, so nobody who applied before
-- today silently disappears from the admin queue or the matching picker.
INSERT INTO mentorship.mentor_applications (mentor_id, email, full_name, motivation, status)
SELECT id,
       email,
       raw_user_meta_data->>'full_name',
       raw_user_meta_data->>'mentor_motivation',
       COALESCE(raw_user_meta_data->>'mentor_status', 'pending_review')
FROM auth.users
WHERE raw_user_meta_data->>'mentorship_role' = 'mentor'
ON CONFLICT (mentor_id) DO NOTHING;

-- Carry over anything mentor_approvals already recorded (a real
-- approve/reject decision made through admin-mentors.js in the few days
-- that table existed) before retiring it.
UPDATE mentorship.mentor_applications a
SET status = m.status, reviewed_by = m.reviewed_by, reviewed_at = m.reviewed_at
FROM mentorship.mentor_approvals m
WHERE a.mentor_id = m.mentor_id;

DROP TABLE IF EXISTS mentorship.mentor_approvals;

-- PostgREST caches grants and schema shape.
NOTIFY pgrst, 'reload schema';

-- ============================================
-- Confirm setup
-- ============================================
SELECT mentor_id, email, full_name, status, created_at
FROM mentorship.mentor_applications
ORDER BY created_at;

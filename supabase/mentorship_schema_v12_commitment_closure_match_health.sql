-- ============================================
-- INSPIRE MENTORSHIP — Commitment, Closure, Match-Health (v12)
-- Run this in Supabase SQL Editor (after mentorship_schema_v11...)
-- Project: Inspire Ecosystem (ygtsrdwoikqnrbexjrtl)
-- ============================================
-- Built from the "Twelve Months" research synthesis: the single most
-- important finding across every research thread was that a mentoring
-- match ending within ~3 months leaves a young person measurably worse
-- off than never having been matched at all (Grossman & Rhodes 2002),
-- while matches past ~12 months show the largest gains. This adds the
-- three structural non-negotiables that finding points to: a real
-- commitment captured at match time, a structured closure reason
-- instead of a silent status flip, and (via mentorship_admin-matching.js,
-- no schema needed for this part) match-health visibility for admins.
--
-- Additive only — ALTER TABLE ... ADD COLUMN, no drops. Existing rows
-- (including the real, currently-active mentor_assignments rows)
-- backfill commitment_months = 12 automatically via the column
-- default; commitment_acknowledged_at/closure_* stay null for them,
-- which is fine — see mentor-portal/mentee-detail.html's comment on
-- why that's a non-blocking prompt, never a gate on existing access.
-- ============================================

ALTER TABLE mentorship.mentor_assignments
  ADD COLUMN IF NOT EXISTS commitment_months integer NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS commitment_acknowledged_at timestamptz,
  -- 'completed_term' | 'rematched' | 'mentee_moved' | 'mentor_stepped_down'
  -- | 'not_a_good_fit' | 'safeguarding_concern' | 'other'
  ADD COLUMN IF NOT EXISTS closure_reason text,
  ADD COLUMN IF NOT EXISTS closure_notes text,
  ADD COLUMN IF NOT EXISTS closure_meeting_held boolean NOT NULL DEFAULT false;

-- ============================================
-- acknowledge_mentor_commitment(uuid) — the only way a mentor can set
-- commitment_acknowledged_at. SECURITY DEFINER so it can update a row
-- despite there being no mentor UPDATE policy on mentor_assignments
-- (that table is deliberately read-only for both sides — see
-- mentorship_schema_v3.sql's comment on why assignments are only ever
-- written by the service-role admin-matching function). Scoped
-- internally to the caller's own auth.uid() and to their own active
-- assignment, so it can't be used to touch anyone else's row or to
-- flip any other column. Mirrors mark_message_read() in
-- mentorship_schema_v10_messages.sql exactly.
-- ============================================
CREATE OR REPLACE FUNCTION mentorship.acknowledge_mentor_commitment(assignment_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = mentorship, pg_temp
AS $$
  UPDATE mentorship.mentor_assignments
  SET commitment_acknowledged_at = now()
  WHERE id = assignment_id
    AND mentor_id = auth.uid()
    AND status = 'active'
    AND commitment_acknowledged_at IS NULL;
$$;

REVOKE ALL ON FUNCTION mentorship.acknowledge_mentor_commitment(uuid) FROM public;
GRANT EXECUTE ON FUNCTION mentorship.acknowledge_mentor_commitment(uuid) TO authenticated;

-- PostgREST caches grants and schema shape.
NOTIFY pgrst, 'reload schema';

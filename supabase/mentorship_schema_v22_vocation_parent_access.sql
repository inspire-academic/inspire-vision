-- ============================================
-- INSPIRE MENTORSHIP — v22: Vocation & Life Pathways, parent access
-- Run this in Supabase SQL Editor (after v21)
-- Project: Inspire Ecosystem (ygtsrdwoikqnrbexjrtl)
-- ============================================
-- No profiles table, parent role, or parent signup flow exists anywhere
-- in this codebase (confirmed against the full schema history before
-- writing this file), and the reference mockup for the parent report is
-- a document handed over at a conference, not a portal a parent logs
-- into repeatedly. Building a parallel auth system for one report page
-- would be substantial new surface area for a need the brief doesn't
-- actually specify -- see IMPLEMENTATION_PLAN.md's "product/architecture
-- decisions" section. Eric confirmed this approach 2026-09-03.
--
-- Access is a single unguessable token (192 bits of randomness via
-- gen_random_bytes(24)) that unlocks netlify/functions/
-- vocation-parent-report.js, a public function that assembles a
-- pre-filtered JSON payload using the service-role client. That
-- function -- not any RLS policy -- is the entire security boundary:
-- vocation_mentor_observations rows with shared_with_student = false are
-- structurally unreachable from it, because it only ever queries
-- mentorship.vocation_observation_recaps (v21), never the base table.
--
-- This table itself is stricter than every other table in this schema:
-- RLS enabled with ZERO policies for anon/authenticated (not even
-- SELECT) -- belt-and-braces exactly like mentor_approvals in v4, and
-- appropriate here for an even stronger reason: a parent has no
-- auth.users identity at all for a policy to check auth.uid() against,
-- so there is no plain-RLS shape that could ever safely expose this
-- table to a client. Every read/write goes through service-role
-- Netlify functions only.
--
-- Idempotent throughout -- safe to re-run.
-- ============================================

CREATE TABLE IF NOT EXISTS mentorship.vocation_parent_links (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_email text,
  access_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  created_by   uuid REFERENCES auth.users(id), -- the mentor or mentee who generated this link
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz,
  revoked_at   timestamptz
);

CREATE INDEX IF NOT EXISTS vocation_parent_links_student_idx
  ON mentorship.vocation_parent_links (student_id);

ALTER TABLE mentorship.vocation_parent_links ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated on purpose. Belt-and-braces against
-- the schema-wide default-privilege GRANT (mentorship_schema.sql) that
-- would otherwise apply to this new table too, same reasoning as
-- mentor_approvals (v4) and mentor_safeguarding_checks (v9).
REVOKE ALL ON mentorship.vocation_parent_links FROM anon, authenticated;
GRANT ALL ON mentorship.vocation_parent_links TO service_role;

-- PostgREST caches grants and schema shape.
NOTIFY pgrst, 'reload schema';

-- ============================================
-- Confirm setup
-- ============================================
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'mentorship' AND table_name LIKE 'vocation_%'
ORDER BY table_name;

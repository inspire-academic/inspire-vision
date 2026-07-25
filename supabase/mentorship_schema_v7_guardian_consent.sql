-- ============================================
-- INSPIRE MENTORSHIP — v7: guardian consent for under-18 mentees
-- Run this in Supabase SQL Editor (after v6)
-- Project: Inspire Ecosystem (ygtsrdwoikqnrbexjrtl)
-- ============================================
-- AMENDMENT 2026-07-25 (same day, after live verification): the column
-- REVOKE below did NOT take effect — a student's own session could
-- still read consent_token_hash back. Confirmed low actual risk (SHA-256
-- is one-way) but fixed properly in
-- mentorship_schema_v8_guardian_consent_column_fix.sql, which must be
-- run after this file. Kept here unedited so this remains an accurate
-- record of what was run and found.
-- ============================================
-- Founder decision 2026-07-25 (parent-involvement discussion): join.html
-- previously only had the MENTEE tick a box saying "I understand a
-- parent/guardian may be involved if I'm under 18" -- that's a minor
-- self-attesting on the guardian's behalf, not actual guardian consent.
-- This migration adds real capture: an under-18 mentee's signup collects
-- a guardian name/email, a token is emailed to that address, and the
-- guardian's own click confirms it.
--
-- Deliberately does NOT block onboarding or using goals/check-ins/the
-- (private, per v6) journal while consent is pending -- only
-- netlify/functions/admin-matching.js's "assign" action is gated on
-- confirmed consent, since that's the one point an actual adult mentor
-- gets connected to the minor. See that function for the enforcement.
--
-- consent_token_hash stores only a SHA-256 hash, never the raw token --
-- the raw token exists only in the guardian's emailed link and briefly
-- in the browser while sending it (netlify/functions/guardian-consent-
-- request.js never touches this table at all). This is deliberate: the
-- mentee has SELECT on their own row so onboarding/dashboard can show
-- "waiting on your guardian to confirm," and a mentee who could read
-- their own raw token could confirm their own consent request --
-- defeating the entire point. Column-level REVOKE below backs this up
-- even though the SELECT policy is already scoped to the owning row.
--
-- Known limitation, logged rather than silently accepted: "is_minor" is
-- self-reported at signup (auth.users.user_metadata.is_minor), same
-- trust level as mentorship_role/mentor_status elsewhere in this schema
-- -- there is no identity/age verification anywhere in this product.
-- Accounts created before this migration have no is_minor value at all
-- and are NOT retroactively gated; a backfill/re-declaration flow would
-- be a separate decision if that gap matters.
--
-- Idempotent (DROP POLICY IF EXISTS), matching v3/v4/v5/v6 convention.
-- ============================================

CREATE TABLE IF NOT EXISTS mentorship.guardian_consents (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id          uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  guardian_name       text NOT NULL,
  guardian_email      text NOT NULL,
  status              text NOT NULL DEFAULT 'pending', -- 'pending' | 'confirmed'
  consent_token_hash  text NOT NULL, -- sha256 hex of the raw token emailed to the guardian
  requested_at        timestamptz DEFAULT now(),
  confirmed_at        timestamptz
);

ALTER TABLE mentorship.guardian_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students create own guardian consent request" ON mentorship.guardian_consents;
CREATE POLICY "Students create own guardian consent request"
  ON mentorship.guardian_consents FOR INSERT
  WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "Students view own guardian consent status" ON mentorship.guardian_consents;
CREATE POLICY "Students view own guardian consent status"
  ON mentorship.guardian_consents FOR SELECT
  USING (auth.uid() = student_id);

-- No UPDATE/DELETE policy for anon/authenticated at all, on purpose --
-- only guardian-consent-confirm.js (service_role, triggered by the
-- guardian's own emailed link) may transition status. Same pattern as
-- mentor_applications having no client UPDATE policy.

-- Belt-and-braces column strip: GRANT ALL ON ALL TABLES (mentorship_
-- schema.sql) already applies to every new table in this schema by
-- default, which would otherwise let the SELECT policy above hand the
-- hash back to the very account it must stay secret from.
REVOKE SELECT (consent_token_hash) ON mentorship.guardian_consents FROM anon, authenticated;

-- PostgREST caches grants and schema shape.
NOTIFY pgrst, 'reload schema';

-- ============================================
-- Confirm setup
-- ============================================
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'mentorship' AND tablename = 'guardian_consents'
ORDER BY cmd;

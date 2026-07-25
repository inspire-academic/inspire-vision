-- ============================================
-- INSPIRE MENTORSHIP — v8: fix guardian_consents column protection
-- Run this in Supabase SQL Editor (after v7)
-- Project: Inspire Ecosystem (ygtsrdwoikqnrbexjrtl)
-- ============================================
-- v7's `REVOKE SELECT (consent_token_hash) ON mentorship.guardian_consents
-- FROM anon, authenticated` did not take effect -- live-verified
-- 2026-07-25: a student's own session could still read
-- consent_token_hash back via a plain SELECT and via an explicit
-- `select=consent_token_hash` query. Actual risk was low (SHA-256 is
-- one-way; reading the hash doesn't let anyone derive the raw token
-- guardian-consent-confirm.js checks against, and this was confirmed
-- live -- INSERT-for-another-student is still 403 via RLS, and the
-- real confirm flow still only succeeds with the correct raw token),
-- but this closes the gap properly.
--
-- Fix uses a more robust pattern than v7's: instead of subtracting one
-- column from the broad `GRANT ALL ON ALL TABLES` default (the
-- subtraction that silently failed), revoke everything for this table
-- first, then grant back only the specific column privileges actually
-- needed.
--
-- anon gets nothing here, on purpose -- every legitimate interaction
-- with this table goes through an authenticated student's own session
-- (insert/select) or the guardian-consent-confirm.js Netlify function
-- (service_role, bypasses grants entirely). There is no anonymous path
-- that should ever touch this table.
-- ============================================

REVOKE ALL ON mentorship.guardian_consents FROM anon, authenticated;

GRANT INSERT (student_id, guardian_name, guardian_email, consent_token_hash)
  ON mentorship.guardian_consents TO authenticated;

GRANT SELECT (id, student_id, guardian_name, guardian_email, status, requested_at, confirmed_at)
  ON mentorship.guardian_consents TO authenticated;

-- PostgREST caches grants and schema shape.
NOTIFY pgrst, 'reload schema';

-- ============================================
-- Confirm setup — should show exactly: authenticated has INSERT
-- covering 4 columns and SELECT covering 7 columns (everything except
-- consent_token_hash); anon should show no rows at all.
-- ============================================
SELECT grantee, privilege_type, string_agg(column_name, ', ' ORDER BY column_name) AS columns
FROM information_schema.column_privileges
WHERE table_schema = 'mentorship' AND table_name = 'guardian_consents'
GROUP BY grantee, privilege_type
ORDER BY grantee, privilege_type;

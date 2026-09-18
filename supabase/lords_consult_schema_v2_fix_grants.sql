-- ============================================
-- LORDS CONSULT TENANT — grant fix (v2)
-- Run this in Supabase SQL Editor (after lords_consult_schema.sql)
-- Project: Inspire Ecosystem (ygtsrdwoikqnrbexjrtl)
-- ============================================
-- lords_consult_schema.sql created the schema, tables and RLS policies
-- but never granted the anon/authenticated roles USAGE on the schema
-- itself — RLS restricts which *rows* a role can touch, it doesn't
-- substitute for the coarser Postgres GRANT that lets the role touch
-- the schema/table at all. Exposing the schema in Data API settings
-- (Project Settings -> Data API -> Exposed schemas) got past the
-- PGRST106 "Invalid schema" error, but the next request failed with
-- 42501 "permission denied for schema lords_consult" — this is what
-- mentorship_schema_v3_fix_grants.sql's header calls "this exact bug"
-- happening a second time, just for anon/authenticated instead of
-- service_role.
--
-- anon needs INSERT (the public diagnostic/lead-capture forms) and
-- authenticated needs SELECT (future admin dashboard) per the RLS
-- policies already defined — granting both roles ALL at the table
-- level is still safe because RLS keeps gating per-operation access;
-- this only removes the schema-level wall PostgREST hit before RLS
-- was ever evaluated.
-- ============================================

GRANT USAGE ON SCHEMA lords_consult TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA lords_consult TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA lords_consult TO anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA lords_consult
  GRANT ALL ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA lords_consult
  GRANT ALL ON SEQUENCES TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

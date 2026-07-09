-- ============================================
-- INSPIRE MENTORSHIP — grant fix
-- Run this in Supabase SQL Editor (after mentorship_schema_v3.sql)
-- Project: Inspire Ecosystem (ygtsrdwoikqnrbexjrtl)
-- ============================================
-- admin-matching.js is the first function to query the mentorship
-- schema directly via the service-role key over PostgREST — every
-- earlier service-role use (admin-mentors.js) went through Supabase's
-- Auth Admin API instead, a separate subsystem that doesn't care about
-- Postgres schema grants. service_role has BYPASSRLS but that's a
-- different mechanism from schema/table GRANTs — it still needed
-- explicit access, which no schema file so far had given it. Result:
-- "permission denied for schema mentorship" the moment admin-matching
-- ran its first real table query.
--
-- This grants service_role on the schema and every existing table, and
-- sets a default privilege so any table created in this schema from
-- now on grants service_role automatically — this exact bug shouldn't
-- be able to happen a second time for a future table.
-- ============================================

GRANT USAGE ON SCHEMA mentorship TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA mentorship TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA mentorship TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA mentorship TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA mentorship
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA mentorship
  GRANT ALL ON SEQUENCES TO service_role;

NOTIFY pgrst, 'reload schema';

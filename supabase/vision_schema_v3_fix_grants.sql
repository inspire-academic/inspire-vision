-- ============================================
-- INSPIRE VISION — grant fix
-- Run this in Supabase SQL Editor (after vision_schema_v2_pink_powerful.sql)
-- Project: Inspire Ecosystem (ygtsrdwoikqnrbexjrtl)
-- ============================================
-- admin-pink-powerful.js is the first function to query the vision
-- schema directly via the service-role key over PostgREST. service_role
-- has BYPASSRLS but that's a different mechanism from schema/table
-- GRANTs — it still needed explicit access, which vision_schema.sql /
-- vision_schema_v2_pink_powerful.sql never gave it (both only granted
-- anon/authenticated). Result: "permission denied for schema vision"
-- (Postgres 42501) the moment the admin dashboard loaded for the first
-- time in production.
--
-- This is the exact same bug already hit once before in this repo for
-- the mentorship schema, fixed the same way in
-- mentorship_schema_v3_fix_grants.sql — mirroring that fix here rather
-- than inventing a new approach.
--
-- Grants service_role on the schema and every existing table (covers
-- vision.subscribers/registrations/partners too, not just the new
-- table, in case a future service-role function needs those), and sets
-- a default privilege so any table created in this schema from now on
-- grants service_role automatically.
-- ============================================

GRANT USAGE ON SCHEMA vision TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA vision TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA vision TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA vision TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA vision
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA vision
  GRANT ALL ON SEQUENCES TO service_role;

NOTIFY pgrst, 'reload schema';

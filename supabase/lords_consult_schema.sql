-- ============================================
-- LORDS CONSULT TENANT — Database Schema (v1)
-- Run this in Supabase SQL Editor
-- Project: Inspire Ecosystem (ygtsrdwoikqnrbexjrtl)
--
-- Tenant: Lords Consult "Idea to Impact" diagnostic
-- (Tenants/lords-consult/) — see BUILD-BRIEF.md sections 3, 6, 7, 13.
-- Follows the same lightweight public-insert pattern as vision_schema.sql
-- (vision.subscribers/registrations/partners), not the heavier
-- assignment-gated RLS used in mentorship_schema*.sql — visitors here have
-- no account/session, so there is nothing to scope reads/writes to beyond
-- "anonymous insert, authenticated (admin) read".
-- ============================================

CREATE SCHEMA IF NOT EXISTS lords_consult;

-- ============================================
-- 1. DIAGNOSTIC_SESSIONS
-- One row per completed "Idea to Impact" diagnostic attempt. Written by
-- the browser the moment a result is computed (Tenants/lords-consult/
-- script.js persistSession()), before the visitor decides whether to
-- share contact details at all.
-- ============================================
CREATE TABLE lords_consult.diagnostic_sessions (
  id                uuid PRIMARY KEY, -- client-generated (crypto.randomUUID()) so it can be correlated with a lead before either write is confirmed
  answers           jsonb NOT NULL,          -- raw {questionIndex: answerIndex} map
  structure_scores  jsonb NOT NULL,          -- {business, cic, charity, specialist} points
  readiness_scores  jsonb NOT NULL,          -- {explore, validate, prepare, formation_ready, already_operating} points
  structure_key     text NOT NULL,           -- winning Structure Fit bucket
  readiness_key     text NOT NULL,           -- winning Venture Readiness bucket
  result_family     text NOT NULL,           -- commercial_business | social_enterprise_cic | charity_cio | pilot_first | specialist_review
  confidence        text NOT NULL,           -- high | moderate | low
  route_prefill     text,                    -- soft route hint clicked on the landing page, if any (never determines the result — BUILD-BRIEF.md section 5)
  source_page       text,
  created_at        timestamptz DEFAULT now()
);

ALTER TABLE lords_consult.diagnostic_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can record a diagnostic session"
  ON lords_consult.diagnostic_sessions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read diagnostic sessions"
  ON lords_consult.diagnostic_sessions FOR SELECT
  USING (auth.role() = 'authenticated');


-- ============================================
-- 2. LEADS
-- Contact + consent capture, submitted only if the visitor chooses to
-- share their details after seeing their result. `session_id` is a plain
-- correlation column (not a foreign key) — the lead must still save even
-- if the session insert above failed or is still in flight.
-- ============================================
CREATE TABLE lords_consult.leads (
  id                 uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id         uuid,
  full_name          text NOT NULL,
  email              text NOT NULL,
  phone              text,
  marketing_consent  boolean NOT NULL DEFAULT false, -- separate from privacy_consent per BUILD-BRIEF.md section 13
  privacy_consent    boolean NOT NULL DEFAULT false,
  result_family      text,
  structure_key      text,
  readiness_key      text,
  source_page        text,
  pipeline_stage     text NOT NULL DEFAULT 'new_lead', -- data-driven per BUILD-BRIEF.md section 11 — free text for now, no adviser dashboard yet to constrain it
  created_at         timestamptz DEFAULT now()
);

ALTER TABLE lords_consult.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit lead contact details"
  ON lords_consult.leads FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read leads"
  ON lords_consult.leads FOR SELECT
  USING (auth.role() = 'authenticated');


-- ============================================
-- Confirm setup
-- ============================================
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'lords_consult'
ORDER BY table_name;

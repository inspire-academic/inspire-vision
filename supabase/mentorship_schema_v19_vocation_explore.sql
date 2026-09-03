-- ============================================
-- INSPIRE MENTORSHIP — v19: Vocation & Life Pathways, Explore (career data)
-- Run this in Supabase SQL Editor (after v18)
-- Project: Inspire Ecosystem (ygtsrdwoikqnrbexjrtl)
-- ============================================
-- Career family taxonomy + occupation profiles + a mentee's reactions to
-- them. Families/profiles are reference data (no client write policy at
-- all -- service-role/manual-SQL only, same posture mentor_assignments
-- has always had for its own writes).
--
-- Labour-market fields are architected as a seam, not hardcoded UI values:
-- labour_market/labour_market_source/labour_market_updated_at carry
-- provenance, and is_placeholder_data defaults true so the frontend can
-- always render an "illustrative, not yet a live data source" badge and
-- never present seed numbers as authoritative. Seed rows below use the
-- brief's own illustrative example (an EV/electrical-interested mentee
-- discovering a whole occupational ecosystem, not "university OR
-- mechanic") so Explore/Discern have real content to test against; do
-- not extend this seed set as if it were a real labour-market dataset.
--
-- Idempotent throughout -- safe to re-run.
-- ============================================

-- ============================================
-- 1. VOCATION_CAREER_FAMILIES
-- ============================================
CREATE TABLE IF NOT EXISTS mentorship.vocation_career_families (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  slug         text NOT NULL UNIQUE,
  name         text NOT NULL,
  description  text,
  icon         text, -- short keyword the frontend maps to an inline SVG, e.g. 'gear'|'code'|'stethoscope'
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mentorship.vocation_career_families ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users read career families" ON mentorship.vocation_career_families;
CREATE POLICY "Authenticated users read career families"
  ON mentorship.vocation_career_families FOR SELECT
  USING (auth.role() = 'authenticated');

-- No INSERT/UPDATE/DELETE policy -- reference data, service-role/manual
-- SQL only, same posture as mentor_assignments' own writes.

INSERT INTO mentorship.vocation_career_families (slug, name, description, icon, sort_order) VALUES
  ('engineering-advanced-manufacturing', 'Engineering & Advanced Manufacturing', 'Design, build, diagnose and improve systems and machines.', 'gear', 10),
  ('computing-ai-digital', 'Computing, AI & Digital Technology', 'Software, data, networks, cybersecurity and emerging technologies.', 'code', 20),
  ('medicine-healthcare', 'Medicine & Healthcare', 'Diagnosing, treating and caring for people''s physical and mental health.', 'heartbeat', 30),
  ('science-research', 'Science & Research', 'Investigating how the world works and generating new knowledge.', 'flask', 40),
  ('skilled-trades', 'Skilled Trades', 'Practical careers built around mastery, qualification and real-world problem solving.', 'wrench', 50),
  ('construction-built-environment', 'Construction & Built Environment', 'Planning, building and maintaining the places people live and work.', 'building', 60),
  ('business-entrepreneurship', 'Business & Entrepreneurship', 'Starting, running and growing organisations and ventures.', 'briefcase', 70),
  ('finance-economics', 'Finance & Economics', 'Managing money, risk and resources for people and organisations.', 'chart', 80),
  ('law-justice', 'Law & Justice', 'Interpreting, applying and upholding the rules that govern society.', 'scale', 90),
  ('education-teaching', 'Education & Teaching', 'Helping others learn, grow and develop understanding.', 'book', 100),
  ('creative-industries', 'Creative Industries', 'Making original work across art, design, music, film and craft.', 'palette', 110),
  ('media-communications', 'Media & Communications', 'Telling stories and sharing information at scale.', 'megaphone', 120),
  ('public-service-government', 'Public Service & Government', 'Serving communities through public institutions and policy.', 'landmark', 130),
  ('defence-emergency-services', 'Defence & Emergency Services', 'Protecting people and responding when things go wrong.', 'shield', 140),
  ('environment-sustainability', 'Environment & Sustainability', 'Protecting and restoring the natural world.', 'leaf', 150),
  ('agriculture-food', 'Agriculture & Food', 'Growing, producing and distributing what people eat.', 'wheat', 160),
  ('transport-aviation-logistics', 'Transport, Aviation & Logistics', 'Moving people and goods safely and efficiently.', 'plane', 170),
  ('sport-human-performance', 'Sport & Human Performance', 'Helping people and athletes perform, train and recover well.', 'trophy', 180),
  ('social-care-community-work', 'Social Care & Community Work', 'Supporting vulnerable people and strengthening communities.', 'hands', 190),
  ('psychology-human-behaviour', 'Psychology & Human Behaviour', 'Understanding how people think, feel and act.', 'brain', 200),
  ('design-architecture', 'Design & Architecture', 'Shaping how products, spaces and systems look, feel and function.', 'compass', 210)
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- 2. VOCATION_CAREER_PROFILES
-- Most of the brief's ~20 occupation fields fold into entry_routes/
-- typical_subjects/labour_market jsonb rather than one scalar column
-- each, so the field shape can evolve without a migration.
-- ============================================
CREATE TABLE IF NOT EXISTS mentorship.vocation_career_profiles (
  id                       uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id                uuid NOT NULL REFERENCES mentorship.vocation_career_families(id) ON DELETE CASCADE,
  slug                     text NOT NULL UNIQUE,
  title                    text NOT NULL,
  summary                  text,
  day_in_life              text,
  entry_routes             jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{route:'apprenticeship'|'university'|'vocational'|'direct_entry', detail, typical_duration}]
  typical_subjects         jsonb NOT NULL DEFAULT '[]'::jsonb, -- ['Maths','Physics',...] -- GCSE/A-level considerations
  love_notes               text, -- what tends to energise people who thrive here
  ability_notes            text, -- strengths that tend to help
  service_notes            text, -- who/what this work serves
  viability_notes          text, -- realistic sustainability considerations, qualitative
  labour_market            jsonb NOT NULL DEFAULT '{}'::jsonb, -- {demand_now, demand_trend, automation_exposure, salary_band, ...}
  labour_market_source     text,
  labour_market_updated_at date,
  is_placeholder_data      boolean NOT NULL DEFAULT true,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vocation_career_profiles_family_idx
  ON mentorship.vocation_career_profiles (family_id);

ALTER TABLE mentorship.vocation_career_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users read career profiles" ON mentorship.vocation_career_profiles;
CREATE POLICY "Authenticated users read career profiles"
  ON mentorship.vocation_career_profiles FOR SELECT
  USING (auth.role() = 'authenticated');

-- Illustrative seed set (the brief's own example: EV/electrical interest
-- expanding into a whole occupational ecosystem, not "university OR
-- mechanic"). All is_placeholder_data = true by column default.
INSERT INTO mentorship.vocation_career_profiles
  (family_id, slug, title, summary, entry_routes, typical_subjects, love_notes, ability_notes, service_notes, viability_notes, labour_market_source)
SELECT f.id, v.slug, v.title, v.summary, v.entry_routes::jsonb, v.typical_subjects::jsonb, v.love_notes, v.ability_notes, v.service_notes, v.viability_notes, 'Illustrative seed data -- not a live labour-market source'
FROM (VALUES
  ('engineering-advanced-manufacturing', 'electrical-engineer', 'Electrical Engineer',
   'Designs, develops and maintains electrical systems -- from power networks to vehicle electronics.',
   '[{"route":"university","detail":"Electrical/Electronic Engineering degree","typical_duration":"3-4 years"},{"route":"apprenticeship","detail":"Degree apprenticeship, earn while you learn","typical_duration":"4-5 years"}]',
   '["Mathematics","Physics"]',
   'Systems thinking, understanding how power and electronics fit together.',
   'Strong maths/physics, technology confidence, precise problem-solving.',
   'Energy systems, transport electrification, safe and reliable infrastructure.',
   'Longer formal-study route than a trade; strong demand tied to electrification trends.'),
  ('skilled-trades', 'ev-automotive-technician', 'EV / Automotive Technician',
   'Diagnoses and repairs vehicles, increasingly including electric and hybrid systems.',
   '[{"route":"apprenticeship","detail":"Automotive/EV technician apprenticeship","typical_duration":"2-3 years"},{"route":"vocational","detail":"College automotive qualification + on-the-job training","typical_duration":"1-2 years"}]',
   '["Design & Technology","Mathematics"]',
   'Hands-on diagnosis, fault-finding, working with real (increasingly high-tech) machines.',
   'Practical/mechanical ability, attention to detail, technology confidence.',
   'Keeping people safely mobile; a growing need as vehicles electrify.',
   'Faster route to earning than a degree; role and pay vary a lot by employer.'),
  ('business-entrepreneurship', 'electrical-installation-enterprise', 'Electrical Installation -> Enterprise',
   'Qualifies as an electrician, then potentially builds and runs an independent electrical business.',
   '[{"route":"apprenticeship","detail":"Electrical installation apprenticeship","typical_duration":"3-4 years"},{"route":"direct_entry","detail":"Self-employment/business ownership after qualifying and gaining experience","typical_duration":"varies"}]',
   '["Design & Technology","Mathematics"]',
   'Autonomy, practical mastery, seeing a job through from start to finish.',
   'Practical ability, reliability, growing commercial/people skills over time.',
   'Safe, working electrical installations in homes and businesses.',
   'Real entrepreneurial upside, but carries commercial and physical-work risk most graduate routes don''t.')
) AS v(family_slug, slug, title, summary, entry_routes, typical_subjects, love_notes, ability_notes, service_notes, viability_notes)
JOIN mentorship.vocation_career_families f ON f.slug = v.family_slug
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- 3. VOCATION_CAREER_REACTIONS
-- ============================================
CREATE TABLE IF NOT EXISTS mentorship.vocation_career_reactions (
  id                 uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  career_profile_id  uuid NOT NULL REFERENCES mentorship.vocation_career_profiles(id) ON DELETE CASCADE,
  reaction           text NOT NULL, -- 'save_for_exploration'|'not_for_me'|'maybe'|'strong_interest'
  notes              text,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, career_profile_id)
);

ALTER TABLE mentorship.vocation_career_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students manage own career reactions" ON mentorship.vocation_career_reactions;
CREATE POLICY "Students manage own career reactions"
  ON mentorship.vocation_career_reactions FOR ALL
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "Mentors view assigned students' career reactions" ON mentorship.vocation_career_reactions;
CREATE POLICY "Mentors view assigned students' career reactions"
  ON mentorship.vocation_career_reactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM mentorship.mentor_assignments a
      WHERE a.mentor_id = auth.uid() AND a.student_id = vocation_career_reactions.student_id AND a.status = 'active'
    )
  );

-- ============================================
-- Grants
-- ============================================
GRANT SELECT ON mentorship.vocation_career_families TO anon, authenticated;
GRANT ALL ON mentorship.vocation_career_families TO service_role;
GRANT SELECT ON mentorship.vocation_career_profiles TO anon, authenticated;
GRANT ALL ON mentorship.vocation_career_profiles TO service_role;
GRANT ALL ON mentorship.vocation_career_reactions TO anon, authenticated, service_role;

-- PostgREST caches grants and schema shape.
NOTIFY pgrst, 'reload schema';

-- ============================================
-- Confirm setup
-- ============================================
SELECT (SELECT count(*) FROM mentorship.vocation_career_families) AS families,
       (SELECT count(*) FROM mentorship.vocation_career_profiles) AS profiles;

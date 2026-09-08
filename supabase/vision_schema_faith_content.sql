-- ============================================
-- INSPIRE VISION — Faith Content (Books, Sermons, Podcasts)
-- Run this in Supabase SQL Editor
-- Project: Inspire Ecosystem (ygtsrdwoikqnrbexjrtl)
-- ============================================
-- This is the schema admin/faith-admin.html's own setup comment refers
-- to as "inspire-faith-content-schema.sql" — that admin page was fully
-- built (books/sermons/podcasts CRUD, file uploads to Storage) well
-- before this schema existed, so every column here is chosen to match
-- that page's insert/update payloads exactly (see its BOOKS/SERMONS/
-- PODCASTS — CRUD sections). Lives in the `vision` schema, not a new
-- `faith` one, since that's the schema the admin page's own
-- `db.schema('vision').from(...)` calls already target.
--
-- URGENT SECURITY FIX — 2026-09: these three tables were discovered to
-- ALREADY EXIST live, seeded with real content (the Apostles' Creed
-- rows date to 2026-06-19), with NO row level security enabled at all.
-- Confirmed directly: an anonymous, logged-out visitor's public anon
-- key could UPDATE vision.books with zero error — meaning anyone who
-- opened devtools on the live site could have inserted, edited, or
-- deleted this content, no login required. This file's CREATE TABLE
-- statements are therefore no-ops on production (IF NOT EXISTS) — the
-- part that actually matters is enabling RLS and the policies below.
-- Policy creation uses DROP POLICY IF EXISTS immediately before each
-- CREATE POLICY specifically because this file's own assumption (that
-- nothing existed yet) already turned out to be wrong once; safe to
-- re-run either way. Restricted to a single admin email — same pattern
-- as Mentorship's ADMIN_EMAILS allowlist (netlify/functions/_lib/
-- adminAuth.js), just expressed as a Postgres policy instead of a
-- server-side check, since this admin page talks to Supabase directly
-- with no Netlify Function in between.
-- ============================================

CREATE TABLE IF NOT EXISTS vision.books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  edition_label text,
  description text,
  link_text text NOT NULL DEFAULT 'Read Now',
  link_url text,
  cover_image_url text,
  sort_order integer NOT NULL DEFAULT extract(epoch FROM clock_timestamp())::integer,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vision.sermons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  series_name text,
  speaker text,
  sermon_date date,
  duration_minutes integer,
  video_url text,
  thumbnail_url text,
  sort_order integer NOT NULL DEFAULT extract(epoch FROM clock_timestamp())::integer,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vision.podcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  episode_number integer,
  duration_minutes integer,
  guest_name text,
  external_link text,
  audio_url text,
  thumbnail_url text,
  sort_order integer NOT NULL DEFAULT extract(epoch FROM clock_timestamp())::integer,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vision.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE vision.sermons ENABLE ROW LEVEL SECURITY;
ALTER TABLE vision.podcasts ENABLE ROW LEVEL SECURITY;

-- Found only after running the policies below the first time: each
-- table already had its own pre-existing "Authenticated users can
-- insert/update/delete <table>" policies, all USING (true) — i.e. ANY
-- logged-in account (any Mentorship mentee or mentor, since they share
-- this same Supabase project's `authenticated` role) could already
-- freely edit or delete this content. Postgres combines permissive
-- policies for the same command with OR, so the admin-only policies
-- below did nothing on their own until these were dropped — confirmed
-- by testing an UPDATE as a real non-admin authenticated user before
-- and after: it silently succeeded before this DROP, and was silently
-- filtered (0 rows affected, data unchanged) after it.
DROP POLICY IF EXISTS "Authenticated users can delete books" ON vision.books;
DROP POLICY IF EXISTS "Authenticated users can insert books" ON vision.books;
DROP POLICY IF EXISTS "Authenticated users can update books" ON vision.books;
DROP POLICY IF EXISTS "Authenticated users can delete sermons" ON vision.sermons;
DROP POLICY IF EXISTS "Authenticated users can insert sermons" ON vision.sermons;
DROP POLICY IF EXISTS "Authenticated users can update sermons" ON vision.sermons;
DROP POLICY IF EXISTS "Authenticated users can delete podcasts" ON vision.podcasts;
DROP POLICY IF EXISTS "Authenticated users can insert podcasts" ON vision.podcasts;
DROP POLICY IF EXISTS "Authenticated users can update podcasts" ON vision.podcasts;

-- Public (anon + authenticated) can only ever see published rows —
-- the admin's own Draft/Live toggle is the real publish gate, and this
-- is what makes it real: a "Draft" row is invisible to the public site
-- no matter what, not just hidden by the UI not linking to it.
DROP POLICY IF EXISTS "books_public_read" ON vision.books;
CREATE POLICY "books_public_read" ON vision.books FOR SELECT
  USING (is_published = true);
DROP POLICY IF EXISTS "sermons_public_read" ON vision.sermons;
CREATE POLICY "sermons_public_read" ON vision.sermons FOR SELECT
  USING (is_published = true);
DROP POLICY IF EXISTS "podcasts_public_read" ON vision.podcasts;
CREATE POLICY "podcasts_public_read" ON vision.podcasts FOR SELECT
  USING (is_published = true);

-- Only the Faith admin's own account can see drafts and write at all.
-- Change this email if admin access ever needs to be granted more
-- broadly — this single line is the entire access-control surface.
DROP POLICY IF EXISTS "books_admin_all" ON vision.books;
CREATE POLICY "books_admin_all" ON vision.books FOR ALL
  USING (auth.jwt() ->> 'email' = 'inspire.science.uk@gmail.com')
  WITH CHECK (auth.jwt() ->> 'email' = 'inspire.science.uk@gmail.com');
DROP POLICY IF EXISTS "sermons_admin_all" ON vision.sermons;
CREATE POLICY "sermons_admin_all" ON vision.sermons FOR ALL
  USING (auth.jwt() ->> 'email' = 'inspire.science.uk@gmail.com')
  WITH CHECK (auth.jwt() ->> 'email' = 'inspire.science.uk@gmail.com');
DROP POLICY IF EXISTS "podcasts_admin_all" ON vision.podcasts;
CREATE POLICY "podcasts_admin_all" ON vision.podcasts FOR ALL
  USING (auth.jwt() ->> 'email' = 'inspire.science.uk@gmail.com')
  WITH CHECK (auth.jwt() ->> 'email' = 'inspire.science.uk@gmail.com');

REVOKE INSERT, UPDATE, DELETE ON vision.books FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON vision.sermons FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON vision.podcasts FROM anon, authenticated;
GRANT SELECT ON vision.books, vision.sermons, vision.podcasts TO anon, authenticated;
-- The admin's own account still needs these grants — RLS narrows what
-- the grant allows, it doesn't substitute for the grant itself.
GRANT INSERT, UPDATE, DELETE ON vision.books, vision.sermons, vision.podcasts TO authenticated;

-- ============================================
-- Storage buckets — admin/faith-admin.html's upload widgets already
-- reference these bucket names directly; they just didn't exist yet.
-- Public so the site can display uploaded covers/thumbnails/audio
-- without a signed-URL round trip; writes restricted the same way as
-- the tables above.
-- ============================================
INSERT INTO storage.buckets (id, name, public)
  VALUES ('faith-covers', 'faith-covers', true)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public)
  VALUES ('faith-sermons', 'faith-sermons', true)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public)
  VALUES ('faith-podcasts', 'faith-podcasts', true)
  ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "faith_buckets_public_read" ON storage.objects;
CREATE POLICY "faith_buckets_public_read" ON storage.objects FOR SELECT
  USING (bucket_id IN ('faith-covers', 'faith-sermons', 'faith-podcasts'));
DROP POLICY IF EXISTS "faith_buckets_admin_insert" ON storage.objects;
CREATE POLICY "faith_buckets_admin_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id IN ('faith-covers', 'faith-sermons', 'faith-podcasts')
    AND auth.jwt() ->> 'email' = 'inspire.science.uk@gmail.com');
DROP POLICY IF EXISTS "faith_buckets_admin_update" ON storage.objects;
CREATE POLICY "faith_buckets_admin_update" ON storage.objects FOR UPDATE
  USING (bucket_id IN ('faith-covers', 'faith-sermons', 'faith-podcasts')
    AND auth.jwt() ->> 'email' = 'inspire.science.uk@gmail.com');
DROP POLICY IF EXISTS "faith_buckets_admin_delete" ON storage.objects;
CREATE POLICY "faith_buckets_admin_delete" ON storage.objects FOR DELETE
  USING (bucket_id IN ('faith-covers', 'faith-sermons', 'faith-podcasts')
    AND auth.jwt() ->> 'email' = 'inspire.science.uk@gmail.com');

-- PostgREST caches grants and schema shape.
NOTIFY pgrst, 'reload schema';

-- ============================================
-- INSPIRE VISION — Faith Saved Resources (bookmarking)
-- Run this in Supabase SQL Editor
-- Project: Inspire Ecosystem (ygtsrdwoikqnrbexjrtl)
-- ============================================
-- Lets a signed-in Faith member bookmark a book, sermon, podcast, or
-- Creed study from faith/resources.html or faith/apostles-creed.html —
-- surfaced back on faith/dashboard.html. Keyed by resource_url (not a
-- foreign key into vision.books/sermons/podcasts) so the same table can
-- also hold bookmarks for content that isn't in those tables, like the
-- static Apostles' Creed study PDFs.
--
-- Same RLS pattern as vision_schema_faith_members.sql's
-- prayer_requests: every policy scoped to auth.uid() = user_id, since
-- Mentorship and Faith members share one Supabase Auth `authenticated`
-- role and a broad USING(true) policy would leak across accounts.
-- ============================================

CREATE TABLE IF NOT EXISTS vision.saved_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resource_type text NOT NULL CHECK (resource_type IN ('book', 'sermon', 'podcast', 'study')),
  resource_title text NOT NULL,
  resource_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, resource_url)
);

ALTER TABLE vision.saved_resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "saved_resources_own_select" ON vision.saved_resources;
CREATE POLICY "saved_resources_own_select" ON vision.saved_resources FOR SELECT
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "saved_resources_own_insert" ON vision.saved_resources;
CREATE POLICY "saved_resources_own_insert" ON vision.saved_resources FOR INSERT
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "saved_resources_own_delete" ON vision.saved_resources;
CREATE POLICY "saved_resources_own_delete" ON vision.saved_resources FOR DELETE
  USING (auth.uid() = user_id);

REVOKE ALL ON vision.saved_resources FROM anon;
GRANT SELECT, INSERT, DELETE ON vision.saved_resources TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================
-- LIVING LANGUAGE — Recordings schema (v1)
-- Run this in Supabase SQL Editor
-- Project: Inspire Ecosystem (ygtsrdwoikqnrbexjrtl)
-- ============================================
-- Powers the audio upload + review tool in living-language/admin/index.html
-- ("Recordings" view) and the approved-audio lookup the alphabet lesson
-- player (learn-engine.js) uses to decide whether a letter plays real
-- audio or shows "recording being prepared". See
-- INSPIRE-VISION-LANGUAGE-PRESERVATION-MANUAL.md for the human side of
-- this pipeline (how a contributor's recording gets here in the first
-- place) — this schema is what happens after a recording is handed off.
--
-- MVP security note (read before copying this pattern elsewhere): the
-- Living Language admin tool has no login system yet — see
-- admin/index.html's own "no server-side admin auth gate yet" comment.
-- Matching that already-accepted MVP posture rather than pretending
-- otherwise, the policies below leave insert/select/update open to the
-- anon role, same as this repo's other early-stage tables before their
-- admin gate existed. The one thing genuinely enforced here at the
-- database layer is that nothing publishes as "approved" without an
-- explicit UPDATE — a fresh upload always lands as pending_review.
-- Tighten these policies the same day real admin auth is added.
-- ============================================

CREATE SCHEMA IF NOT EXISTS living_language;

GRANT USAGE ON SCHEMA living_language TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA living_language GRANT ALL ON TABLES TO anon, authenticated;

-- ============================================
-- 1. RECORDINGS
-- One row per uploaded audio clip. concept_id matches the id already
-- used in learn-data.js (e.g. 'alphabet_a' for the letter A) so the
-- lesson player can look recordings up without any new ID scheme.
-- ============================================
CREATE TABLE living_language.recordings (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  concept_type          text NOT NULL DEFAULT 'alphabet_letter', -- future: 'vocabulary_item', 'example_sentence'
  concept_id            text NOT NULL,                           -- e.g. 'alphabet_a' — see learn-data.js AlphabetItem.id
  audio_kind            text NOT NULL CHECK (audio_kind IN ('name', 'sound')),
  storage_path          text NOT NULL,                           -- path within the 'living-language-audio' bucket
  speaker_name          text,                                    -- free text — no speaker accounts/auth exist yet
  contributor_note      text,
  duration_seconds      numeric,
  verification_status   text NOT NULL DEFAULT 'pending_review' CHECK (verification_status IN ('pending_review', 'approved', 'rejected')),
  reviewer_note          text,
  submitted_at           timestamptz DEFAULT now(),
  reviewed_at            timestamptz
);

ALTER TABLE living_language.recordings ENABLE ROW LEVEL SECURITY;

-- Open SELECT: the admin review screen needs to see pending/rejected
-- rows too, and there is no admin-vs-public distinction at the auth
-- layer yet. The lesson player itself still only ever plays rows it
-- explicitly queried with verification_status = 'approved' — the same
-- "filter to approved in the app, not just at the DB" pattern already
-- used by LivingLanguageStore.listApprovedByContentType in store.js.
CREATE POLICY "Anyone can read recordings (admin MVP, no auth yet)"
  ON living_language.recordings FOR SELECT
  USING (true);

-- Anyone can submit a recording, but never pre-approved — every upload
-- lands as pending_review regardless of what the client sends.
CREATE POLICY "Anyone can submit a pending recording"
  ON living_language.recordings FOR INSERT
  WITH CHECK (verification_status = 'pending_review');

-- Open UPDATE for the admin review screen's Approve/Reject actions
-- (no auth gate yet — see note above).
CREATE POLICY "Anyone can update review status (admin MVP, no auth yet)"
  ON living_language.recordings FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- ============================================
-- 2. STORAGE — audio file bucket
-- Public read (the lesson player fetches by plain URL, same as any
-- other static asset already served from /assets/) — the app layer is
-- what gates whether a given URL ever actually gets played, exactly as
-- for the table above.
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('living-language-audio', 'living-language-audio', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read living-language-audio"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'living-language-audio');

CREATE POLICY "Anyone can upload to living-language-audio (admin MVP, no auth yet)"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'living-language-audio');

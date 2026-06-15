-- ============================================
-- INSPIRE VISION — Database Schema
-- Run this in Supabase SQL Editor
-- Project: Inspire Ecosystem (ygtsrdwoikqnrbexjrtl)
-- ============================================

-- Create vision schema
CREATE SCHEMA IF NOT EXISTS vision;

-- ============================================
-- 1. SUBSCRIBERS
-- Homepage + Coming Soon "notify me" emails
-- ============================================
CREATE TABLE vision.subscribers (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email       text NOT NULL,
  source      text NOT NULL DEFAULT 'homepage', -- 'homepage' | 'coming-soon'
  created_at  timestamptz DEFAULT now()
);

-- Prevent duplicate emails per source
CREATE UNIQUE INDEX subscribers_email_source_idx ON vision.subscribers (email, source);

-- Enable RLS
ALTER TABLE vision.subscribers ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert (public form)
CREATE POLICY "Anyone can subscribe"
  ON vision.subscribers FOR INSERT
  WITH CHECK (true);

-- Only authenticated users can read (admin only)
CREATE POLICY "Authenticated users can read subscribers"
  ON vision.subscribers FOR SELECT
  USING (auth.role() = 'authenticated');


-- ============================================
-- 2. REGISTRATIONS
-- Innovation Labs — student/school/parent interest
-- ============================================
CREATE TABLE vision.registrations (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name     text NOT NULL,
  email         text NOT NULL,
  phone         text,
  role          text NOT NULL, -- 'student' | 'parent' | 'school' | 'organisation' | 'mentor'
  location      text,
  interest_area text,
  message       text,
  source        text NOT NULL DEFAULT 'innovation-labs',
  created_at    timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE vision.registrations ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert
CREATE POLICY "Anyone can register"
  ON vision.registrations FOR INSERT
  WITH CHECK (true);

-- Only authenticated users can read
CREATE POLICY "Authenticated users can read registrations"
  ON vision.registrations FOR SELECT
  USING (auth.role() = 'authenticated');


-- ============================================
-- 3. PARTNERS
-- Innovation Labs — donor/partner interest
-- ============================================
CREATE TABLE vision.partners (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name             text NOT NULL,
  organisation     text,
  email            text NOT NULL,
  partnership_type text, -- 'donor' | 'government' | 'corporate' | 'school' | 'mentor'
  funding_range    text, -- '£50,000' | '£100,000' | '£250,000' | 'other'
  message          text,
  created_at       timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE vision.partners ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert
CREATE POLICY "Anyone can submit partner interest"
  ON vision.partners FOR INSERT
  WITH CHECK (true);

-- Only authenticated users can read
CREATE POLICY "Authenticated users can read partners"
  ON vision.partners FOR SELECT
  USING (auth.role() = 'authenticated');


-- ============================================
-- Confirm setup
-- ============================================
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'vision'
ORDER BY table_name;

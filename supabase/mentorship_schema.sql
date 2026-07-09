-- ============================================
-- INSPIRE MENTORSHIP — Database Schema
-- Run this in Supabase SQL Editor
-- Project: Inspire Ecosystem (ygtsrdwoikqnrbexjrtl)
-- ============================================
-- Powers mentorship/dashboard/index.html's Priority Goal, Growth
-- Compass, Upcoming Session, Today's Tasks and Weekly Check-In cards.
-- Every table is scoped to the logged-in student (auth.uid()) — no
-- mentor-portal or admin-panel policies yet, since those areas of the
-- site are still stub pages as of 2026-07-09.
-- ============================================

-- Create mentorship schema
CREATE SCHEMA IF NOT EXISTS mentorship;

-- Creating a schema only grants access to its owner by default — the
-- Data API's anon/authenticated Postgres roles need explicit grants too,
-- even with RLS policies in place. Without this, every request 401s with
-- "permission denied for schema mentorship" (Postgres error 42501)
-- regardless of RLS or of "mentorship" being marked exposed in
-- Project Settings -> API -> Data API. RLS still governs row-level
-- access on top of this — this just lets the roles attempt the request.
GRANT USAGE ON SCHEMA mentorship TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA mentorship GRANT ALL ON TABLES TO anon, authenticated;

-- ============================================
-- 1. GOALS
-- Powers the "90-Day Goal" priority card and the Growth Compass
-- radar chart (averaged by category).
-- ============================================
CREATE TABLE mentorship.goals (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title         text NOT NULL,
  description   text,
  category      text NOT NULL DEFAULT 'personal', -- 'spiritual' | 'intellectual' | 'physical' | 'social' | 'character' | 'personal'
  progress_pct  integer NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  target_date   date,
  is_priority   boolean NOT NULL DEFAULT false, -- true = surfaces on the dashboard's 90-Day Goal card
  status        text NOT NULL DEFAULT 'active', -- 'active' | 'completed' | 'archived'
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

ALTER TABLE mentorship.goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students manage own goals"
  ON mentorship.goals FOR ALL
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);


-- ============================================
-- 2. SESSIONS
-- Mentor meetings — powers the "Upcoming Check-In" / Mentor Session card.
-- ============================================
CREATE TABLE mentorship.sessions (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mentor_id         uuid REFERENCES auth.users(id), -- nullable: mentor-portal accounts don't exist yet
  mentor_name       text, -- denormalized fallback display name until mentor_id is always populated
  scheduled_at      timestamptz NOT NULL,
  duration_minutes  integer DEFAULT 60,
  status            text NOT NULL DEFAULT 'scheduled', -- 'scheduled' | 'completed' | 'cancelled'
  notes             text,
  created_at        timestamptz DEFAULT now()
);

ALTER TABLE mentorship.sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students view own sessions"
  ON mentorship.sessions FOR SELECT
  USING (auth.uid() = student_id);

CREATE POLICY "Students update own sessions"
  ON mentorship.sessions FOR UPDATE
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);


-- ============================================
-- 3. TASKS
-- Powers the "Today's Tasks" checklist. Optionally linked to a goal.
-- ============================================
CREATE TABLE mentorship.tasks (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id       uuid REFERENCES mentorship.goals(id) ON DELETE SET NULL,
  title         text NOT NULL,
  is_done       boolean NOT NULL DEFAULT false,
  due_date      date,
  order_index   integer DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE mentorship.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students manage own tasks"
  ON mentorship.tasks FOR ALL
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);


-- ============================================
-- 4. CHECK_INS
-- Mood + optional reflection — powers the "How are you doing this
-- week?" card. Not part of the original goals/sessions/tasks brief,
-- added because the dashboard already has a full mood-selector UI
-- with nowhere to persist to; flagged here rather than silently
-- left fake.
-- ============================================
CREATE TABLE mentorship.check_ins (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mood          text NOT NULL, -- 'struggling' | 'hard' | 'ok' | 'good' | 'great'
  reflection    text,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE mentorship.check_ins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students manage own check-ins"
  ON mentorship.check_ins FOR ALL
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);


-- ============================================
-- Grant on the tables just created (the ALTER DEFAULT PRIVILEGES near
-- the top only covers tables created *after* it, not these four).
-- ============================================
GRANT ALL ON ALL TABLES IN SCHEMA mentorship TO anon, authenticated;


-- ============================================
-- Confirm setup
-- ============================================
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'mentorship'
ORDER BY table_name;

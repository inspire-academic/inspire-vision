-- ============================================
-- INSPIRE CHILDREN'S SERVICE — Database Schema (v1, Phase 0)
-- Run this in Supabase SQL Editor
-- Project: Inspire Ecosystem (ygtsrdwoikqnrbexjrtl)
--
-- Module: faith/children-service/ — live Bible class (Zoom first) for
-- ages 5-11 with a web hub for progress, badges and parent visibility.
-- First deployment is a single church (Inspire's own), but every
-- tenant table carries church_id so other churches can adopt it later
-- without a rebuild (same principle as Tenants/ in CLAUDE.md).
--
-- ============================================
-- BEFORE YOU RUN THIS — READ (learned the hard way, lords_consult 2026-09-09)
-- A brand-new schema needs THREE things, not one, or every browser
-- request 404s/403s even though this SQL ran clean:
--   1. This file (schema + RLS + grants, all below — deliberately one
--      file this time instead of a v1 plus a v2_fix_grants).
--   2. MANUAL, in the Supabase dashboard: Project Settings -> Data API
--      -> Exposed schemas -> add `children_service`. PostgREST will not
--      serve a schema over REST just because it exists. (Not scripted
--      here: the exposed-schemas value is one shared comma-separated
--      list for the whole project, and overwriting it from SQL risks
--      un-exposing vision / mentorship / lords_consult.)
--   3. GRANT USAGE / table grants — done in section 11 below. Note that
--      unlike lords_consult, NOTHING is granted to `anon`: every table
--      here holds children's data, and there is no public-form use case.
-- After running, verify from a signed-in browser session:
--   (await getDB()).schema('children_service').from('churches').select('*')
-- returns [] (not a 404 / 42501 / PGRST106).
--
-- ============================================
-- DESIGN RULES (from the Phase 0 research; do not weaken without a reason)
--  * Children have NO auth.users row. The parent's session is the only
--    credential; every child read/write is authorised as the parent.
--  * Data minimisation: display_name is a first name / nickname only,
--    age is stored as a band (explorer 5-7, trailblazer 8-11), never a
--    date of birth. No photos, no surnames, no school, no location.
--  * Religious belief is UK GDPR special-category data, and a child's
--    Bible-class attendance and progress reveals it — treat this whole
--    schema as special-category. Nothing here is readable by `anon`.
--  * Roles live in children_service.church_members, NEVER in
--    user_metadata (user_metadata is self-editable, so it is spoofable).
--  * Staff only see children's data once BOTH a DBS-or-local-equivalent
--    check date AND a safeguarding-training date are on their
--    church_members row. Recorded by a church_admin / service_role.
--  * Safeguarding reports are readable only by the church's
--    safeguarding_lead (and the reporter). NOT by church_admin.
--  * Badges/awards cannot be self-awarded from the client.
--  * Join links are not directly readable by parents: they come from
--    get_join_info(), which only answers close to the session time.
--
-- NOT in Phase 0 (later migrations, each its own file):
--   streaks / trail weeks, memory-verse tracking, teacher notes, live
--   quiz answers (Phase 2), child PIN switch, reports, invitation codes.
-- ============================================

CREATE SCHEMA IF NOT EXISTS children_service;


-- ============================================
-- 1. CHURCHES
-- One row per adopting church. Phase 0 = one row (Inspire's own).
-- Created by service_role only (no INSERT policy for authenticated).
-- ============================================
CREATE TABLE children_service.churches (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  slug              text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  name              text NOT NULL,
  timezone          text NOT NULL DEFAULT 'Europe/London',
  default_platform  text NOT NULL DEFAULT 'zoom' CHECK (default_platform IN ('zoom','teams','other')),
  open_enrolment    boolean NOT NULL DEFAULT false, -- parents may request to join (still need church_admin approval)
  active            boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now()
);


-- ============================================
-- 2. CHURCH_MEMBERS
-- The single source of truth for who may do what inside a church.
-- A person may hold several roles (a facilitator can also be a parent),
-- hence UNIQUE (church_id, user_id, role).
-- ============================================
CREATE TABLE children_service.church_members (
  id                     uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  church_id              uuid NOT NULL REFERENCES children_service.churches(id) ON DELETE CASCADE,
  user_id                uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role                   text NOT NULL CHECK (role IN ('church_admin','safeguarding_lead','facilitator','assistant','parent')),
  status                 text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','suspended')),
  display_name           text,                 -- how a leader appears on screen / in rosters (first name)
  dbs_checked_on         date,                 -- enhanced DBS (or local equivalent: PVG, Ghana check, etc.)
  safeguarding_trained_on date,
  created_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (church_id, user_id, role)
);
CREATE INDEX church_members_user_idx ON children_service.church_members (user_id);


-- ============================================
-- 3. CLASSES
-- ============================================
CREATE TABLE children_service.classes (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  church_id   uuid NOT NULL REFERENCES children_service.churches(id) ON DELETE CASCADE,
  name        text NOT NULL,
  age_band    text NOT NULL CHECK (age_band IN ('explorer','trailblazer')), -- explorer = 5-7, trailblazer = 8-11
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX classes_church_idx ON children_service.classes (church_id);


-- ============================================
-- 4. CHILDREN
-- parent_id is the child's ONLY credential (see design rules).
-- ============================================
CREATE TABLE children_service.children (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  church_id     uuid NOT NULL REFERENCES children_service.churches(id) ON DELETE CASCADE,
  parent_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 30), -- first name / nickname ONLY
  age_band      text NOT NULL CHECK (age_band IN ('explorer','trailblazer')),
  avatar        jsonb NOT NULL DEFAULT '{}'::jsonb, -- layered SVG picks, e.g. {"hat":"desert","colour":"teal"}. Never a photo.
  class_id      uuid REFERENCES children_service.classes(id) ON DELETE SET NULL,
  archived_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX children_parent_idx ON children_service.children (parent_id);
CREATE INDEX children_church_idx ON children_service.children (church_id);
CREATE INDEX children_class_idx  ON children_service.children (class_id);


-- ============================================
-- 5. CONSENTS
-- Append-only audit trail. Withdrawal = a NEW row with given = false.
-- There is deliberately no UPDATE/DELETE policy.
-- ============================================
CREATE TABLE children_service.consents (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  child_id        uuid REFERENCES children_service.children(id) ON DELETE CASCADE, -- null = account-level consent
  type            text NOT NULL CHECK (type IN ('data_processing','photo','recording','safeguarding_policy','communications')),
  policy_version  text NOT NULL,  -- which wording the parent saw (e.g. '2026-09-draft-1')
  given           boolean NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX consents_parent_idx ON children_service.consents (parent_id);


-- ============================================
-- 6. LESSONS
-- One row per character-study lesson. `content` holds the authored
-- lesson (see faith/children-service/content/lesson-schema.md).
-- church_id NULL = global Inspire content; set = a church's own lesson.
-- ============================================
CREATE TABLE children_service.lessons (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  church_id       uuid REFERENCES children_service.churches(id) ON DELETE CASCADE,
  slug            text NOT NULL CHECK (slug ~ '^[a-z0-9-]+$'),
  character_name  text NOT NULL,
  series_key      text,
  sequence        integer,
  translation     text NOT NULL DEFAULT 'WEB',    -- public-domain default (World English Bible)
  content         jsonb NOT NULL,
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX lessons_slug_uniq
  ON children_service.lessons (COALESCE(church_id, '00000000-0000-0000-0000-000000000000'::uuid), slug);


-- ============================================
-- 7. SESSIONS + JOIN DETAILS + ATTENDANCE
-- ============================================
CREATE TABLE children_service.sessions (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  church_id     uuid NOT NULL REFERENCES children_service.churches(id) ON DELETE CASCADE,
  class_id      uuid NOT NULL REFERENCES children_service.classes(id) ON DELETE CASCADE,
  lesson_id     uuid REFERENCES children_service.lessons(id) ON DELETE SET NULL,
  starts_at     timestamptz NOT NULL,
  duration_min  integer NOT NULL DEFAULT 30 CHECK (duration_min BETWEEN 10 AND 120),
  platform      text NOT NULL DEFAULT 'zoom' CHECK (platform IN ('zoom','teams','other')),
  status        text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','ended','cancelled')),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_church_idx ON children_service.sessions (church_id, starts_at);
CREATE INDEX sessions_class_idx  ON children_service.sessions (class_id);

-- Kept apart from `sessions` so the link/passcode is NOT covered by the
-- general "parent can see their child's sessions" policy. Parents get it
-- only through get_join_info() (section 9), which is time-windowed.
CREATE TABLE children_service.session_join_details (
  session_id  uuid PRIMARY KEY REFERENCES children_service.sessions(id) ON DELETE CASCADE,
  join_url    text NOT NULL,
  meeting_id  text,
  passcode    text
);

CREATE TABLE children_service.attendance (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id     uuid NOT NULL REFERENCES children_service.sessions(id) ON DELETE CASCADE,
  child_id       uuid NOT NULL REFERENCES children_service.children(id) ON DELETE CASCADE,
  source         text NOT NULL CHECK (source IN ('self_checkin','leader','recap_watched')), -- recap counts the same as live: absence is never punished
  checked_in_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, child_id)
);
CREATE INDEX attendance_child_idx ON children_service.attendance (child_id);


-- ============================================
-- 8. PROGRESS, BADGES, AWARDS, SAFEGUARDING
-- ============================================
-- Completion record only — NOT a score ledger. XP / badges are derived
-- or awarded server-side so a client can never grant itself anything.
CREATE TABLE children_service.progress (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  child_id      uuid NOT NULL REFERENCES children_service.children(id) ON DELETE CASCADE,
  lesson_id     uuid NOT NULL REFERENCES children_service.lessons(id) ON DELETE CASCADE,
  step_key      text NOT NULL,                 -- e.g. 'mystery', 'quiz', 'verse', 'mission'
  detail        jsonb NOT NULL DEFAULT '{}'::jsonb, -- picked options only; never free text from a child
  completed_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (child_id, lesson_id, step_key)
);

CREATE TABLE children_service.badges (
  key          text PRIMARY KEY,
  title        text NOT NULL,
  description  text NOT NULL,   -- kid-friendly criteria wording
  family       text NOT NULL CHECK (family IN ('showing_up','knowledge','memory_verse','character','kindness','family','questions','team')),
  awarded_by   text NOT NULL CHECK (awarded_by IN ('system','leader','parent')),
  art          jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE children_service.awards (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  child_id    uuid NOT NULL REFERENCES children_service.children(id) ON DELETE CASCADE,
  badge_key   text NOT NULL REFERENCES children_service.badges(key),
  awarded_by  uuid REFERENCES auth.users(id),
  session_id  uuid REFERENCES children_service.sessions(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (child_id, badge_key)
);

-- Read access is restricted to the church's safeguarding_lead (and the
-- reporter for their own row). church_admin can NOT read these by default.
-- Retention: follows safeguarding-body advice, NOT the parent erasure
-- flow — ON DELETE SET NULL on child_id keeps the record when a child
-- profile is deleted. Confirm the retention period with your
-- safeguarding adviser (e.g. Thirtyone:eight) before launch.
CREATE TABLE children_service.safeguarding_reports (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  church_id    uuid NOT NULL REFERENCES children_service.churches(id) ON DELETE CASCADE,
  reported_by  uuid NOT NULL REFERENCES auth.users(id),
  child_id     uuid REFERENCES children_service.children(id) ON DELETE SET NULL,
  session_id   uuid REFERENCES children_service.sessions(id) ON DELETE SET NULL,
  summary      text NOT NULL,
  severity     text NOT NULL DEFAULT 'concern' CHECK (severity IN ('concern','urgent')),
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_review','closed')),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX safeguarding_church_idx ON children_service.safeguarding_reports (church_id);


-- ============================================
-- 9. HELPER FUNCTIONS
-- SECURITY DEFINER so policies can consult church_members / children
-- without recursing into their own RLS. Every one keys off auth.uid()
-- internally — none takes a user id as a parameter — so calling them
-- via RPC only ever tells a caller about themselves.
-- ============================================
CREATE OR REPLACE FUNCTION children_service.is_church_member(p_church uuid, p_roles text[] DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM children_service.church_members m
    WHERE m.church_id = p_church AND m.user_id = auth.uid() AND m.status = 'active'
      AND (p_roles IS NULL OR m.role = ANY (p_roles))
  );
$$;

CREATE OR REPLACE FUNCTION children_service.is_church_admin(p_church uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT children_service.is_church_member(p_church, ARRAY['church_admin']); $$;

-- Staff who may see children's names / attendance: an active staff role
-- AND both vetting dates recorded.
CREATE OR REPLACE FUNCTION children_service.is_vetted_staff(p_church uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM children_service.church_members m
    WHERE m.church_id = p_church AND m.user_id = auth.uid() AND m.status = 'active'
      AND m.role IN ('church_admin','safeguarding_lead','facilitator','assistant')
      AND m.dbs_checked_on IS NOT NULL AND m.safeguarding_trained_on IS NOT NULL
  );
$$;

CREATE OR REPLACE FUNCTION children_service.is_staff(p_church uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT children_service.is_church_member(p_church, ARRAY['church_admin','safeguarding_lead','facilitator','assistant']); $$;

CREATE OR REPLACE FUNCTION children_service.is_parent_of(p_child uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM children_service.children c WHERE c.id = p_child AND c.parent_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION children_service.parent_has_child_in_class(p_class uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM children_service.children c
    WHERE c.class_id = p_class AND c.parent_id = auth.uid() AND c.archived_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION children_service.has_any_active_membership()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM children_service.church_members m WHERE m.user_id = auth.uid() AND m.status = 'active');
$$;

CREATE OR REPLACE FUNCTION children_service.church_accepts_enrolment(p_church uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM children_service.churches c WHERE c.id = p_church AND c.active AND c.open_enrolment);
$$;

-- Lets the sign-up page turn a church slug into an id without needing
-- SELECT on `churches` (a non-member can't see that table).
CREATE OR REPLACE FUNCTION children_service.church_by_slug(p_slug text)
RETURNS TABLE (id uuid, name text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT c.id, c.name FROM children_service.churches c
  WHERE c.slug = p_slug AND c.active AND c.open_enrolment;
$$;

-- The ONLY way a parent gets a Zoom/Teams link. Answers from 30 minutes
-- before the session start until 30 minutes after it is due to end, and
-- only for a parent with a child in that session's class, or for
-- vetted staff of the church. Returns zero rows otherwise.
CREATE OR REPLACE FUNCTION children_service.get_join_info(p_session uuid)
RETURNS TABLE (join_url text, meeting_id text, passcode text, platform text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT d.join_url, d.meeting_id, d.passcode, s.platform
  FROM children_service.sessions s
  JOIN children_service.session_join_details d ON d.session_id = s.id
  WHERE s.id = p_session
    AND s.status IN ('scheduled','live')
    AND now() BETWEEN s.starts_at - interval '30 minutes'
                  AND s.starts_at + make_interval(mins => s.duration_min) + interval '30 minutes'
    AND (children_service.parent_has_child_in_class(s.class_id) OR children_service.is_vetted_staff(s.church_id));
$$;

-- Leader awards a leader-awarded badge. Clients cannot INSERT into
-- `awards` directly (no INSERT policy), so this is the gate.
CREATE OR REPLACE FUNCTION children_service.award_badge_by_leader(p_child uuid, p_badge text, p_session uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_church uuid;
BEGIN
  SELECT church_id INTO v_church FROM children_service.children WHERE id = p_child;
  IF v_church IS NULL OR NOT children_service.is_vetted_staff(v_church) THEN
    RAISE EXCEPTION 'not permitted' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM children_service.badges WHERE key = p_badge AND awarded_by = 'leader') THEN
    RAISE EXCEPTION 'badge is not leader-awarded' USING ERRCODE = '22023';
  END IF;
  INSERT INTO children_service.awards (child_id, badge_key, awarded_by, session_id)
  VALUES (p_child, p_badge, auth.uid(), p_session)
  ON CONFLICT (child_id, badge_key) DO NOTHING;
END;
$$;

-- Helpers and RPCs: callable by signed-in users only (policies need
-- EXECUTE as the caller). Never by anon.
REVOKE ALL ON FUNCTION
  children_service.is_church_member(uuid, text[]),
  children_service.is_church_admin(uuid),
  children_service.is_vetted_staff(uuid),
  children_service.is_staff(uuid),
  children_service.is_parent_of(uuid),
  children_service.parent_has_child_in_class(uuid),
  children_service.has_any_active_membership(),
  children_service.church_accepts_enrolment(uuid),
  children_service.church_by_slug(text),
  children_service.get_join_info(uuid),
  children_service.award_badge_by_leader(uuid, text, uuid)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  children_service.is_church_member(uuid, text[]),
  children_service.is_church_admin(uuid),
  children_service.is_vetted_staff(uuid),
  children_service.is_staff(uuid),
  children_service.is_parent_of(uuid),
  children_service.parent_has_child_in_class(uuid),
  children_service.has_any_active_membership(),
  children_service.church_accepts_enrolment(uuid),
  children_service.church_by_slug(text),
  children_service.get_join_info(uuid),
  children_service.award_badge_by_leader(uuid, text, uuid)
TO authenticated, service_role;


-- ============================================
-- 10. ROW LEVEL SECURITY
-- ============================================
ALTER TABLE children_service.churches              ENABLE ROW LEVEL SECURITY;
ALTER TABLE children_service.church_members        ENABLE ROW LEVEL SECURITY;
ALTER TABLE children_service.classes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE children_service.children              ENABLE ROW LEVEL SECURITY;
ALTER TABLE children_service.consents              ENABLE ROW LEVEL SECURITY;
ALTER TABLE children_service.lessons               ENABLE ROW LEVEL SECURITY;
ALTER TABLE children_service.sessions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE children_service.session_join_details  ENABLE ROW LEVEL SECURITY;
ALTER TABLE children_service.attendance            ENABLE ROW LEVEL SECURITY;
ALTER TABLE children_service.progress              ENABLE ROW LEVEL SECURITY;
ALTER TABLE children_service.badges                ENABLE ROW LEVEL SECURITY;
ALTER TABLE children_service.awards                ENABLE ROW LEVEL SECURITY;
ALTER TABLE children_service.safeguarding_reports  ENABLE ROW LEVEL SECURITY;

-- ---- churches: members read; church_admin edits their own church's row.
-- (Creating a church = service_role only; there is no INSERT policy.)
CREATE POLICY churches_member_select ON children_service.churches
  FOR SELECT TO authenticated USING (children_service.is_church_member(id));
CREATE POLICY churches_admin_update ON children_service.churches
  FOR UPDATE TO authenticated
  USING (children_service.is_church_admin(id)) WITH CHECK (children_service.is_church_admin(id));

-- ---- church_members
CREATE POLICY members_select_own_or_admin ON children_service.church_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR children_service.is_church_admin(church_id));

-- A parent can only ask to join (pending, parent role, no vetting dates),
-- and only where the church has enrolment open. A church_admin then
-- activates them. Anything else is a church_admin (or service_role) job.
CREATE POLICY members_parent_request_join ON children_service.church_members
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND role = 'parent' AND status = 'pending'
    AND dbs_checked_on IS NULL AND safeguarding_trained_on IS NULL
    AND children_service.church_accepts_enrolment(church_id)
  );
CREATE POLICY members_admin_insert ON children_service.church_members
  FOR INSERT TO authenticated WITH CHECK (children_service.is_church_admin(church_id));
CREATE POLICY members_admin_update ON children_service.church_members
  FOR UPDATE TO authenticated
  USING (children_service.is_church_admin(church_id)) WITH CHECK (children_service.is_church_admin(church_id));
CREATE POLICY members_delete_own_or_admin ON children_service.church_members
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR children_service.is_church_admin(church_id));

-- ---- classes: any active member reads; church_admin manages
CREATE POLICY classes_member_select ON children_service.classes
  FOR SELECT TO authenticated USING (children_service.is_church_member(church_id));
CREATE POLICY classes_admin_write ON children_service.classes
  FOR ALL TO authenticated
  USING (children_service.is_church_admin(church_id)) WITH CHECK (children_service.is_church_admin(church_id));

-- ---- children
CREATE POLICY children_parent_select ON children_service.children
  FOR SELECT TO authenticated USING (parent_id = auth.uid());
CREATE POLICY children_staff_select ON children_service.children
  FOR SELECT TO authenticated USING (children_service.is_vetted_staff(church_id));
-- A parent may add a child only once church_admin has activated them.
CREATE POLICY children_parent_insert ON children_service.children
  FOR INSERT TO authenticated
  WITH CHECK (parent_id = auth.uid() AND children_service.is_church_member(church_id, ARRAY['parent']));
-- Parent edits their own child; class assignment stays a staff job, so
-- the parent's UPDATE must leave class_id/church_id/parent_id unchanged.
CREATE POLICY children_parent_update ON children_service.children
  FOR UPDATE TO authenticated
  USING (parent_id = auth.uid())
  WITH CHECK (
    parent_id = auth.uid()
    AND church_id = (SELECT c.church_id FROM children_service.children c WHERE c.id = children.id)
    AND class_id IS NOT DISTINCT FROM (SELECT c.class_id FROM children_service.children c WHERE c.id = children.id)
  );
CREATE POLICY children_admin_update ON children_service.children
  FOR UPDATE TO authenticated
  USING (children_service.is_church_admin(church_id)) WITH CHECK (children_service.is_church_admin(church_id));
CREATE POLICY children_parent_delete ON children_service.children
  FOR DELETE TO authenticated USING (parent_id = auth.uid());

-- ---- consents: parent inserts/reads their own. Append-only.
CREATE POLICY consents_parent_select ON children_service.consents
  FOR SELECT TO authenticated USING (parent_id = auth.uid());
CREATE POLICY consents_parent_insert ON children_service.consents
  FOR INSERT TO authenticated
  WITH CHECK (parent_id = auth.uid() AND (child_id IS NULL OR children_service.is_parent_of(child_id)));

-- ---- lessons: published global content is readable by any active
-- member of any church; a church's own lessons by that church's members.
-- Drafts are visible to that church's staff only.
CREATE POLICY lessons_select ON children_service.lessons
  FOR SELECT TO authenticated
  USING (
    (status = 'published' AND church_id IS NULL AND children_service.has_any_active_membership())
    OR (status = 'published' AND church_id IS NOT NULL AND children_service.is_church_member(church_id))
    OR (church_id IS NOT NULL AND children_service.is_staff(church_id))
  );
CREATE POLICY lessons_admin_write ON children_service.lessons
  FOR ALL TO authenticated
  USING (church_id IS NOT NULL AND children_service.is_church_admin(church_id))
  WITH CHECK (church_id IS NOT NULL AND children_service.is_church_admin(church_id));
-- (Global lessons, church_id NULL, are written by service_role only.)

-- ---- sessions: staff see their church's; parents see sessions for
-- their child's class. Join links are NOT covered here (see get_join_info).
CREATE POLICY sessions_staff_select ON children_service.sessions
  FOR SELECT TO authenticated USING (children_service.is_staff(church_id));
CREATE POLICY sessions_parent_select ON children_service.sessions
  FOR SELECT TO authenticated USING (children_service.parent_has_child_in_class(class_id));
CREATE POLICY sessions_admin_write ON children_service.sessions
  FOR ALL TO authenticated
  USING (children_service.is_church_admin(church_id)) WITH CHECK (children_service.is_church_admin(church_id));

-- ---- session_join_details: church_admin only. Parents/leaders use get_join_info().
CREATE POLICY join_details_admin_all ON children_service.session_join_details
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM children_service.sessions s WHERE s.id = session_id AND children_service.is_church_admin(s.church_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM children_service.sessions s WHERE s.id = session_id AND children_service.is_church_admin(s.church_id)));

-- ---- attendance
CREATE POLICY attendance_parent_select ON children_service.attendance
  FOR SELECT TO authenticated USING (children_service.is_parent_of(child_id));
CREATE POLICY attendance_staff_select ON children_service.attendance
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM children_service.sessions s WHERE s.id = session_id AND children_service.is_vetted_staff(s.church_id)));
-- Parent taps their child's avatar to check in: own child, own
-- class's session, self_checkin only.
CREATE POLICY attendance_parent_self_checkin ON children_service.attendance
  FOR INSERT TO authenticated
  WITH CHECK (
    source IN ('self_checkin','recap_watched')
    AND children_service.is_parent_of(child_id)
    AND EXISTS (
      SELECT 1 FROM children_service.sessions s
      JOIN children_service.children c ON c.id = child_id
      WHERE s.id = session_id AND s.class_id = c.class_id AND s.status IN ('scheduled','live','ended')
    )
  );
CREATE POLICY attendance_staff_write ON children_service.attendance
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM children_service.sessions s WHERE s.id = session_id AND children_service.is_vetted_staff(s.church_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM children_service.sessions s WHERE s.id = session_id AND children_service.is_vetted_staff(s.church_id)));

-- ---- progress: parent reads/writes for their own child; vetted staff read
CREATE POLICY progress_parent_select ON children_service.progress
  FOR SELECT TO authenticated USING (children_service.is_parent_of(child_id));
CREATE POLICY progress_parent_insert ON children_service.progress
  FOR INSERT TO authenticated WITH CHECK (children_service.is_parent_of(child_id));
CREATE POLICY progress_parent_update ON children_service.progress
  FOR UPDATE TO authenticated
  USING (children_service.is_parent_of(child_id)) WITH CHECK (children_service.is_parent_of(child_id));
CREATE POLICY progress_staff_select ON children_service.progress
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM children_service.children c WHERE c.id = child_id AND children_service.is_vetted_staff(c.church_id)));

-- ---- badges: catalogue readable by any signed-in user; service_role edits.
CREATE POLICY badges_select ON children_service.badges
  FOR SELECT TO authenticated USING (true);

-- ---- awards: read only. No INSERT/UPDATE/DELETE policy on purpose —
-- award_badge_by_leader() (or service_role) is the only way in.
CREATE POLICY awards_parent_select ON children_service.awards
  FOR SELECT TO authenticated USING (children_service.is_parent_of(child_id));
CREATE POLICY awards_staff_select ON children_service.awards
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM children_service.children c WHERE c.id = child_id AND children_service.is_vetted_staff(c.church_id)));

-- ---- safeguarding_reports: any active member of the church may raise
-- one; only the church's safeguarding_lead (and the reporter, for their
-- own row) can read; only the lead can update. church_admin cannot read.
CREATE POLICY safeguarding_member_insert ON children_service.safeguarding_reports
  FOR INSERT TO authenticated
  WITH CHECK (reported_by = auth.uid() AND children_service.is_church_member(church_id));
CREATE POLICY safeguarding_lead_or_reporter_select ON children_service.safeguarding_reports
  FOR SELECT TO authenticated
  USING (reported_by = auth.uid() OR children_service.is_church_member(church_id, ARRAY['safeguarding_lead']));
CREATE POLICY safeguarding_lead_update ON children_service.safeguarding_reports
  FOR UPDATE TO authenticated
  USING (children_service.is_church_member(church_id, ARRAY['safeguarding_lead']))
  WITH CHECK (children_service.is_church_member(church_id, ARRAY['safeguarding_lead']));


-- ============================================
-- 11. GRANTS
-- RLS gates ROWS; PostgREST first checks these coarser GRANTs (this is
-- the step lords_consult missed). `anon` gets nothing on purpose.
-- ============================================
GRANT USAGE ON SCHEMA children_service TO authenticated, service_role;

GRANT SELECT, UPDATE                 ON children_service.churches              TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON children_service.church_members        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON children_service.classes               TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON children_service.children              TO authenticated;
GRANT SELECT, INSERT                 ON children_service.consents              TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON children_service.lessons               TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON children_service.sessions              TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON children_service.session_join_details  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON children_service.attendance            TO authenticated;
GRANT SELECT, INSERT, UPDATE         ON children_service.progress              TO authenticated;
GRANT SELECT                         ON children_service.badges                TO authenticated;
GRANT SELECT                         ON children_service.awards                TO authenticated;
GRANT SELECT, INSERT, UPDATE         ON children_service.safeguarding_reports  TO authenticated;

-- service_role (Netlify Functions) — same defensive default the
-- mentorship_schema_v3_fix_grants.sql file set up.
GRANT ALL ON ALL TABLES    IN SCHEMA children_service TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA children_service TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA children_service GRANT ALL ON TABLES    TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA children_service GRANT ALL ON SEQUENCES TO service_role;


-- ============================================
-- 12. SEED — starter badge catalogue
-- Names and wording come from the Phase 0 gamification research: badges
-- celebrate discovery and habits, never speed/accuracy, and never imply
-- anything about how much God loves a child. Catch-up counts equally
-- with live attendance. Edit freely; this is catalogue data, not code.
-- ============================================
INSERT INTO children_service.badges (key, title, description, family, awarded_by) VALUES
  ('camp-fire-friend',    'Camp Fire Friend',    'You joined class. Welcome to the fire!',                                         'showing_up',   'system'),
  ('catch-up-champion',   'Catch-Up Champion',   'You missed a class and watched the recap. Nice!',                                'showing_up',   'system'),
  ('story-detective',     'Story Detective',     'You worked out the Mystery Character.',                                          'knowledge',    'system'),
  ('map-marker',          'Map Marker',          'You finished a character study and put them on the map.',                        'knowledge',    'system'),
  ('verse-keeper',        'Verse Keeper',        'You learned this month''s memory verse.',                                        'memory_verse', 'leader'),
  ('brave-like-david',    'Brave Like David',    'You told us about a time you chose to be brave.',                                'character',    'leader'),
  ('helping-hands',       'Helping Hands',       'You did the kindness mission. Your grown-up said so!',                           'kindness',     'parent'),
  ('table-talkers',       'Table Talkers',       'You talked about this week''s questions with your family.',                      'family',       'parent'),
  ('big-question-asker',  'Big Question Asker',  'You asked a great question about God or the Bible.',                             'questions',    'leader'),
  ('team-trailblazers',   'Team Trailblazers',   'The whole class reached our Camp goal together.',                                'team',         'leader')
ON CONFLICT (key) DO NOTHING;


-- ============================================
-- 13. FIRST-CHURCH SEED — run by hand, after this file
-- Not executed here because it needs YOUR auth user id. Steps:
--   1. INSERT INTO children_service.churches (slug, name, open_enrolment)
--        VALUES ('inspire', 'Inspire (our own church)', true);
--   2. Create your account via normal Supabase sign-up, then:
--      INSERT INTO children_service.church_members
--        (church_id, user_id, role, status, display_name, dbs_checked_on, safeguarding_trained_on)
--        VALUES ('<church id>', '<your auth.users id>', 'church_admin', 'active', '<first name>', NULL, NULL);
--      (repeat with role 'safeguarding_lead' for the named lead)
--   3. Record dbs_checked_on / safeguarding_trained_on ONLY once those
--      are genuinely done — until then that person cannot see children.
-- ============================================

NOTIFY pgrst, 'reload schema';

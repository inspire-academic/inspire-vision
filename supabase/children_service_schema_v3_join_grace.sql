-- ============================================
-- INSPIRE CHILDREN'S SERVICE — Schema v3 (join-window grace)
-- Run this in Supabase SQL Editor AFTER v2. Safe to re-run.
-- Project: Inspire Ecosystem (ygtsrdwoikqnrbexjrtl)
--
-- get_join_info() released the meeting link from 30 minutes before a class
-- until 30 minutes AFTER it was due to end. Half an hour of "the class is
-- open" after the class has finished is confusing and keeps a meeting link
-- reachable for longer than needed, so the tail is cut to 10 minutes: enough
-- for a class that overruns or a family that is a little late, no more.
-- (The 30 minutes BEFORE the start is unchanged.)
--
-- Keep in step with joinOpensMinutesBefore / joinStaysOpenMinutesAfter in
-- faith/children-service/js/kids-config.js.
-- ============================================

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
                  AND s.starts_at + make_interval(mins => s.duration_min) + interval '10 minutes'
    AND (children_service.parent_has_child_in_class(s.class_id) OR children_service.is_vetted_staff(s.church_id));
$$;

-- CREATE OR REPLACE keeps the existing grants, but restate them so this file
-- is correct on its own.
REVOKE ALL ON FUNCTION children_service.get_join_info(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION children_service.get_join_info(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

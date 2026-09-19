-- ============================================
-- INSPIRE CHILDREN'S SERVICE — Schema v2 (Phase 1)
-- Run this in Supabase SQL Editor AFTER children_service_schema.sql
-- Project: Inspire Ecosystem (ygtsrdwoikqnrbexjrtl)
--
-- What this fixes / adds:
--  1. CLOSES A HOLE in the Phase 0 policies. children_parent_insert did
--     not look at class_id, so an approved parent could file their child
--     into ANY class id — including another church's — and then, because
--     parent_has_child_in_class() trusts class_id, see that church's
--     sessions. Now a child's class must belong to the same church, be
--     active, and match the child's age band.
--  2. A parent can no longer change a child's age_band (which would
--     silently make their class wrong). Rename and avatar edits still work.
--  3. evaluate_badges(): server-side awarding of the SYSTEM badges from a
--     child's own attendance/progress records. Clients still cannot INSERT
--     into `awards`; this function is the gate, and only the child's
--     parent can call it.
--  4. award_badge_by_parent(): the two parent-confirmed badges
--     (helping-hands, table-talkers).
--
-- Honest limit: progress rows are written by the parent's own session, so
-- a determined parent could record progress their child did not do. That
-- only ever earns their own child a celebratory badge, so it is accepted;
-- the guarantee here is that badges follow from recorded progress, not
-- that progress is tamper-proof.
-- ============================================

-- ---- 1 + 2. children policies -------------------------------------------
CREATE OR REPLACE FUNCTION children_service.class_fits(p_class uuid, p_church uuid, p_band text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT p_class IS NULL OR EXISTS (
    SELECT 1 FROM children_service.classes k
    WHERE k.id = p_class AND k.church_id = p_church AND k.age_band = p_band AND k.active
  );
$$;

DROP POLICY IF EXISTS children_parent_insert ON children_service.children;
CREATE POLICY children_parent_insert ON children_service.children
  FOR INSERT TO authenticated
  WITH CHECK (
    parent_id = auth.uid()
    AND children_service.is_church_member(church_id, ARRAY['parent'])
    AND children_service.class_fits(class_id, church_id, age_band)
  );

DROP POLICY IF EXISTS children_parent_update ON children_service.children;
CREATE POLICY children_parent_update ON children_service.children
  FOR UPDATE TO authenticated
  USING (parent_id = auth.uid())
  WITH CHECK (
    parent_id = auth.uid()
    AND church_id = (SELECT c.church_id FROM children_service.children c WHERE c.id = children.id)
    AND age_band  = (SELECT c.age_band  FROM children_service.children c WHERE c.id = children.id)
    AND class_id IS NOT DISTINCT FROM (SELECT c.class_id FROM children_service.children c WHERE c.id = children.id)
  );

-- ---- 3. system badges ------------------------------------------------------
-- camp-fire-friend   : the child has a self_checkin attendance row
-- catch-up-champion  : the child has a recap_watched attendance row
-- story-detective    : progress step 'mystery' with detail.solved = true
-- map-marker         : all of mystery, story, quiz, verse done for one lesson
-- Returns only the badges that were NEWLY awarded by this call.
CREATE OR REPLACE FUNCTION children_service.evaluate_badges(p_child uuid)
RETURNS TABLE (new_badge text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT children_service.is_parent_of(p_child) THEN
    RAISE EXCEPTION 'not permitted' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH earned(k) AS (
    SELECT 'camp-fire-friend'::text
      WHERE EXISTS (SELECT 1 FROM children_service.attendance a WHERE a.child_id = p_child AND a.source = 'self_checkin')
    UNION ALL
    SELECT 'catch-up-champion'
      WHERE EXISTS (SELECT 1 FROM children_service.attendance a WHERE a.child_id = p_child AND a.source = 'recap_watched')
    UNION ALL
    SELECT 'story-detective'
      WHERE EXISTS (SELECT 1 FROM children_service.progress p
                    WHERE p.child_id = p_child AND p.step_key = 'mystery' AND p.detail ->> 'solved' = 'true')
    UNION ALL
    SELECT 'map-marker'
      WHERE EXISTS (SELECT 1 FROM children_service.progress p
                    WHERE p.child_id = p_child
                    GROUP BY p.lesson_id
                    HAVING count(*) FILTER (WHERE p.step_key IN ('mystery','story','quiz','verse')) = 4)
  ), ins AS (
    INSERT INTO children_service.awards (child_id, badge_key)
    SELECT p_child, e.k
    FROM earned e
    JOIN children_service.badges b ON b.key = e.k AND b.awarded_by = 'system'
    ON CONFLICT (child_id, badge_key) DO NOTHING
    RETURNING badge_key
  )
  SELECT ins.badge_key FROM ins;
END;
$$;

-- ---- 4. parent-confirmed badges ---------------------------------------------
CREATE OR REPLACE FUNCTION children_service.award_badge_by_parent(p_child uuid, p_badge text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT children_service.is_parent_of(p_child) THEN
    RAISE EXCEPTION 'not permitted' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM children_service.badges WHERE key = p_badge AND awarded_by = 'parent') THEN
    RAISE EXCEPTION 'badge is not parent-confirmed' USING ERRCODE = '22023';
  END IF;
  INSERT INTO children_service.awards (child_id, badge_key, awarded_by)
  VALUES (p_child, p_badge, auth.uid())
  ON CONFLICT (child_id, badge_key) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION
  children_service.class_fits(uuid, uuid, text),
  children_service.evaluate_badges(uuid),
  children_service.award_badge_by_parent(uuid, text)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  children_service.class_fits(uuid, uuid, text),
  children_service.evaluate_badges(uuid),
  children_service.award_badge_by_parent(uuid, text)
TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
